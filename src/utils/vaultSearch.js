/**
 * Vault Search — Lightweight RAG over Cass's Obsidian vault
 *
 * Instead of stuffing 8000 years of Golarion history into every context window,
 * this module searches the vault efficiently and returns only relevant notes.
 *
 * The vault IS Cass's brain. This is how she thinks — querying her own memory.
 *
 * Search methods:
 *   - byTag: find all notes with a specific tag (e.g., "iron-gods", "npc")
 *   - byFrontmatter: find notes where a frontmatter field matches a value
 *   - byText: full-text search across note content
 *   - byName: find a character/place by name (uses nameResolver fuzzy matching)
 *   - related: given a note, find related notes via tags/links/mentions
 *   - contextFor: high-level "gather everything relevant to this query" for LLM
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const nameResolver = require('./nameResolver');

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault');

class VaultSearch {
    constructor() {
        this.vaultDir = VAULT_DIR;
        this.index = null;
        this.lastIndexTime = 0;
        this.indexTTL = 60 * 1000; // Re-index every 60 seconds max
    }

    /**
     * Build/rebuild the in-memory index of all vault notes
     * Parses frontmatter and extracts metadata for fast searching
     */
    buildIndex(force = false) {
        const now = Date.now();
        if (!force && this.index && (now - this.lastIndexTime) < this.indexTTL) {
            return this.index;
        }

        const index = [];
        this._indexDirectory(this.vaultDir, index, '');
        this.index = index;
        this.lastIndexTime = now;
        logger.debug(`Vault index built: ${index.length} notes`);
        return index;
    }

    _indexDirectory(dir, index, relativePath) {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

            const fullPath = path.join(dir, entry.name);
            const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                this._indexDirectory(fullPath, index, relPath);
            } else if (entry.name.endsWith('.md')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const parsed = this._parseNote(content, fullPath, relPath);
                    if (parsed) index.push(parsed);
                } catch (err) {
                    logger.debug(`Failed to parse vault note ${relPath}: ${err.message}`);
                }
            }
        }
    }

    /**
     * Parse a markdown note into frontmatter + body
     */
    _parseNote(content, fullPath, relativePath) {
        const note = {
            path: fullPath,
            relativePath,
            folder: path.dirname(relativePath),
            filename: path.basename(relativePath, '.md'),
            frontmatter: {},
            body: content,
            tags: [],
            links: [],       // [[wikilinks]] found in body
            mentions: [],    // Character/place names found in body
        };

        // Parse YAML frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (fmMatch) {
            note.body = fmMatch[2];
            const yaml = fmMatch[1];
            // Simple YAML parser — handles key: value, key: [arrays], key: "quoted"
            for (const line of yaml.split('\n')) {
                const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
                if (kvMatch) {
                    let [, key, value] = kvMatch;
                    value = value.trim();
                    // Handle arrays like ["a", "b"]
                    if (value.startsWith('[')) {
                        try {
                            value = JSON.parse(value);
                        } catch {
                            value = value.replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
                        }
                    }
                    // Strip quotes
                    else if ((value.startsWith('"') && value.endsWith('"')) ||
                             (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    // Numbers
                    else if (/^\d+$/.test(value)) {
                        value = parseInt(value);
                    }
                    note.frontmatter[key] = value;
                }
            }

            // Extract tags from frontmatter
            if (note.frontmatter.tags) {
                note.tags = Array.isArray(note.frontmatter.tags)
                    ? note.frontmatter.tags
                    : [note.frontmatter.tags];
            }
        }

        // Extract [[wikilinks]] from body
        const linkMatches = note.body.matchAll(/\[\[([^\]]+)\]\]/g);
        for (const m of linkMatches) {
            note.links.push(m[1].split('|')[0].trim()); // Handle [[Name|display]]
        }

        return note;
    }

    // ==================== SEARCH METHODS ====================

    /**
     * Find notes by tag
     */
    byTag(tag) {
        const idx = this.buildIndex();
        const lower = tag.toLowerCase();
        return idx.filter(n => n.tags.some(t => t.toLowerCase() === lower));
    }

    /**
     * Find notes by frontmatter field value
     */
    byFrontmatter(field, value) {
        const idx = this.buildIndex();
        const lower = typeof value === 'string' ? value.toLowerCase() : value;
        return idx.filter(n => {
            const v = n.frontmatter[field];
            if (v === undefined) return false;
            if (typeof v === 'string') return v.toLowerCase() === lower;
            if (Array.isArray(v)) return v.some(item =>
                typeof item === 'string' ? item.toLowerCase() === lower : item === lower
            );
            return v === value;
        });
    }

    /**
     * Full-text search across note content (case-insensitive)
     */
    byText(query, maxResults = 20) {
        const idx = this.buildIndex();
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

        const scored = [];
        for (const note of idx) {
            const searchText = `${note.filename} ${Object.values(note.frontmatter).join(' ')} ${note.body}`.toLowerCase();
            let score = 0;
            let allMatch = true;
            for (const term of terms) {
                const count = (searchText.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
                if (count === 0) { allMatch = false; break; }
                score += count;
            }
            // Boost exact filename matches
            if (note.filename.toLowerCase().includes(query.toLowerCase())) {
                score += 50;
            }
            if (allMatch && score > 0) {
                // Boost structured/curated content over raw transcripts
                const type = (note.frontmatter.type || '').toLowerCase();
                if (type === 'timeline') score *= 10;           // Timeline is authoritative
                else if (type === 'session-summary') score *= 5; // Summaries are curated
                else if (type === 'character') score *= 4;       // Character dossiers
                else if (type === 'raw-transcript') score *= 0;  // Never inject raw transcripts

                if (score > 0) scored.push({ note, score });
            }
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(s => s.note);
    }

    /**
     * Find a character or place by name, using fuzzy matching
     */
    byName(name) {
        // Try exact vault filename first
        const idx = this.buildIndex();
        const exactMatch = idx.find(n =>
            n.filename.toLowerCase() === name.toLowerCase() ||
            (n.frontmatter.name && n.frontmatter.name.toLowerCase() === name.toLowerCase())
        );
        if (exactMatch) return [exactMatch];

        // Try name resolver
        const resolved = nameResolver.resolve(name);
        if (resolved) {
            const match = idx.find(n =>
                n.filename.toLowerCase() === resolved.toLowerCase() ||
                (n.frontmatter.name && n.frontmatter.name.toLowerCase() === resolved.toLowerCase())
            );
            if (match) return [match];
        }

        // Fallback to text search
        return this.byText(name, 5);
    }

    /**
     * Find notes related to a given note (by shared tags, links, mentions)
     */
    related(note, maxResults = 10) {
        const idx = this.buildIndex();
        const scored = [];

        for (const other of idx) {
            if (other.path === note.path) continue;
            let score = 0;

            // Shared tags
            for (const tag of note.tags) {
                if (other.tags.includes(tag)) score += 3;
            }

            // Links between notes
            if (note.links.some(l => l.toLowerCase() === other.filename.toLowerCase())) score += 5;
            if (other.links.some(l => l.toLowerCase() === note.filename.toLowerCase())) score += 5;

            // Same folder
            if (note.folder === other.folder) score += 1;

            // Same campaign
            if (note.frontmatter.campaign && note.frontmatter.campaign === other.frontmatter.campaign) score += 2;

            // Same player
            if (note.frontmatter.player && note.frontmatter.player === other.frontmatter.player) score += 2;

            if (score > 0) scored.push({ note: other, score });
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(s => s.note);
    }

    /**
     * Find notes by campaign code
     */
    byCampaign(campaignCode) {
        return this.byFrontmatter('campaign', campaignCode);
    }

    /**
     * Find all characters for a specific player
     */
    byPlayer(playerName) {
        return this.byFrontmatter('player', playerName);
    }

    /**
     * Find by Discord user ID
     */
    byDiscordId(discordId) {
        return this.byFrontmatter('discord_id', discordId);
    }

    // ==================== CONTEXT BUILDING ====================

    /**
     * Build a focused context package for the LLM based on a user query.
     * This is the core RAG function — it searches the vault and assembles
     * only the relevant information into a context string.
     *
     * @param {string} query - The user's question or topic
     * @param {object} options - Optional filters
     * @param {string} options.campaign - Campaign code to focus on
     * @param {string} options.discordUserId - Discord user ID (to find their characters)
     * @param {number} options.maxTokens - Approximate max context size (default 3000 chars)
     * @returns {string} - Formatted context for LLM injection
     */
    contextFor(query, options = {}) {
        const { campaign, discordUserId, maxTokens = 4000 } = options;
        const sections = [];
        let totalChars = 0;
        const includedPaths = new Set();

        // 1. TIMELINE FIRST — search all timeline files for matching rows
        // This is the most authoritative data and must come first
        const idx = this.buildIndex();
        const queryLower = query.toLowerCase();
        const STOP_WORDS = new Set(['the','a','an','is','was','were','are','did','do','does','when','where','who','what','how','why','about','have','has','had','can','could','will','would','should','this','that','with','from','for','and','but','not','die','died','dies','kill','killed','happen','happened']);
        const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
        const timelineNotes = idx.filter(n => (n.frontmatter.type || '').toLowerCase() === 'timeline');

        const matchingRows = [];
        for (const note of timelineNotes) {
            const lines = note.body.split('\n');
            for (const line of lines) {
                if (!line.startsWith('|') || line.startsWith('| Date') || line.startsWith('|---')) continue;
                const lineLower = line.toLowerCase();
                // Require ALL non-stop query terms to match for timeline precision
                if (queryTerms.length > 0 && queryTerms.every(t => lineLower.includes(t))) {
                    matchingRows.push(line.trim());
                }
            }
        }

        if (matchingRows.length > 0) {
            const timelineContext = `[TIMELINE — Verified canonical events]\n| Date | Location | Event |\n|------|----------|-------|\n${matchingRows.slice(0, 15).join('\n')}`;
            sections.push(timelineContext);
            totalChars += timelineContext.length;
        }

        // 2. If we know who's asking, get their character info
        if (discordUserId) {
            const userNotes = this.byDiscordId(discordUserId);
            if (userNotes.length > 0) {
                const summary = this._summarizeNote(userNotes[0]);
                sections.push(`[Asking player's character]\n${summary}`);
                totalChars += summary.length;
                includedPaths.add(userNotes[0].path);
            }
        }

        // 3. Direct name matches (characters, places)
        const nameHits = this.byName(query);
        for (const note of nameHits.slice(0, 3)) {
            if (totalChars > maxTokens) break;
            if (includedPaths.has(note.path)) continue;
            if ((note.frontmatter.type || '').toLowerCase() === 'timeline') continue; // already handled
            if ((note.frontmatter.type || '').toLowerCase() === 'conversation-log') continue; // skip logs
            const summary = this._summarizeNote(note);
            sections.push(`[${note.folder || 'Note'}: ${note.filename}]\n${summary}`);
            totalChars += summary.length;
            includedPaths.add(note.path);
        }

        // 4. Full text search for session summaries and character notes
        const textHits = this.byText(query, 10);
        for (const note of textHits) {
            if (totalChars > maxTokens) break;
            if (includedPaths.has(note.path)) continue;
            if ((note.frontmatter.type || '').toLowerCase() === 'conversation-log') continue;
            const summary = this._summarizeNote(note, true); // compact
            sections.push(`[${note.folder || 'Note'}: ${note.filename}]\n${summary}`);
            totalChars += summary.length;
            includedPaths.add(note.path);
        }

        if (sections.length === 0) {
            return '';
        }

        return `=== Cass's Memory (from Obsidian vault) ===\n${sections.join('\n\n')}\n=== End Memory ===`;
    }

    /**
     * Summarize a note for context injection
     */
    _summarizeNote(note, compact = false) {
        const parts = [];

        // Key frontmatter fields
        const fm = note.frontmatter;
        if (fm.name) parts.push(`Name: ${fm.name}`);
        if (fm.type) parts.push(`Type: ${fm.type}`);
        if (fm.race) parts.push(`Race: ${fm.race}`);
        if (fm.class) parts.push(`Class: ${fm.class}`);
        if (fm.level) parts.push(`Level: ${fm.level}`);
        if (fm.player) parts.push(`Player: ${fm.player}`);
        if (fm.campaign) {
            const campaigns = Array.isArray(fm.campaign) ? fm.campaign.join(', ') : fm.campaign;
            parts.push(`Campaign: ${campaigns}`);
        }
        if (fm.discord_id) parts.push(`Discord ID: ${fm.discord_id}`);
        if (fm.location) parts.push(`Location: ${fm.location}`);
        if (fm.country) parts.push(`Country: ${fm.country}`);

        // Body content — truncate for compact mode
        const bodyClean = note.body.replace(/^#+ .+$/gm, '').trim();
        if (compact) {
            // Just first 300 chars of body
            if (bodyClean.length > 0) {
                parts.push(bodyClean.substring(0, 300) + (bodyClean.length > 300 ? '...' : ''));
            }
        } else {
            // Full body up to 1000 chars
            if (bodyClean.length > 0) {
                parts.push(bodyClean.substring(0, 1000) + (bodyClean.length > 1000 ? '...' : ''));
            }
        }

        return parts.join('\n');
    }

    // ==================== VAULT STATS ====================

    /**
     * Get vault statistics
     */
    stats() {
        const idx = this.buildIndex(true);
        const folders = {};
        const types = {};
        const campaigns = {};

        for (const note of idx) {
            const folder = note.folder || 'root';
            folders[folder] = (folders[folder] || 0) + 1;

            const type = note.frontmatter.type || 'unknown';
            types[type] = (types[type] || 0) + 1;

            const camp = note.frontmatter.campaign;
            if (camp) {
                const c = Array.isArray(camp) ? camp : [camp];
                for (const cc of c) {
                    campaigns[cc] = (campaigns[cc] || 0) + 1;
                }
            }
        }

        return {
            totalNotes: idx.length,
            byFolder: folders,
            byType: types,
            byCampaign: campaigns,
        };
    }
}

// Singleton
const vaultSearch = new VaultSearch();
module.exports = vaultSearch;
