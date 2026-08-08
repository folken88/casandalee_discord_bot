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

        logger.info(`📂 Building vault index from: ${this.vaultDir}`);
        if (!fs.existsSync(this.vaultDir)) {
            logger.error(`❌ Vault directory does NOT exist: ${this.vaultDir}`);
            // Don't cache the empty result — retry next call
            return [];
        }

        const index = [];
        this._indexDirectory(this.vaultDir, index, '');
        this.index = index;
        this.lastIndexTime = now;
        logger.info(`🧠 Vault index built: ${index.length} notes`);
        if (index.length === 0) {
            logger.warn(`⚠️ Vault index is EMPTY — directory exists but no .md files found in ${this.vaultDir}`);
        }
        return index;
    }

    _indexDirectory(dir, index, relativePath) {
        if (!fs.existsSync(dir)) {
            logger.warn(`⚠️ Vault subdirectory missing: ${dir}`);
            return;
        }

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

        // Parse YAML frontmatter (handle both \n and \r\n line endings)
        const normalized = content.replace(/\r\n/g, '\n');
        const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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
     * Find notes by frontmatter type field (character, item, place, etc.)
     */
    byType(type) {
        const idx = this.buildIndex();
        return idx.filter(n => (n.frontmatter.type || '').toLowerCase() === type.toLowerCase());
    }

    /**
     * Find a note by name that also matches a specific type.
     * Used by answerBuilder to distinguish "Curator" (item) from "Kovira" (character).
     */
    byNameAndType(name, type) {
        const hits = this.byName(name);
        const typed = hits.filter(n => (n.frontmatter.type || '').toLowerCase() === type.toLowerCase());
        return typed.length > 0 ? typed : [];
    }

    /**
     * Full-text search across note content (case-insensitive)
     */
    /**
     * GM plot secrets must never surface through player-facing retrieval:
     * the gm-eyes-only file itself, and ANY note tagged "gm-only".
     */
    _isGmSecret(note) {
        if (/gm.?eyes.?only/i.test(note.filename || '')) return true;
        const tags = note.frontmatter?.tags;
        const list = Array.isArray(tags) ? tags : (typeof tags === 'string' ? [tags] : []);
        return list.some(t => /^gm.?only$/i.test(String(t).trim()));
    }

    byText(query, maxResults = 20) {
        // GM plot secrets must never surface through retrieval
        const idx = this.buildIndex().filter(n => !this._isGmSecret(n));
        const STOP_WORDS = new Set(['the','a','an','is','was','were','are','did','do','does','when','where','who','what','how','why','about','have','has','had','can','could','will','would','should','this','that','with','from','for','and','but','not','die','died','dies','kill','killed','happen','happened','start','started','tell','know',
            'her','him','his','she','they','them','their','let','cannot','certainly','very','more','than','also','even','still','again','always','never','really','because','shit','yeah','well','okay','though','being','been']);
        // Prefer proper nouns (names/places) when the query contains any — far less noisy
        // than raw prose words. Fall back to full extraction for all-lowercase queries.
        const properNouns = [...new Set(
            [...query.matchAll(/\b[A-Z][a-zA-Z''-]{2,}\b/g)]
                .map(m => m[0].toLowerCase())
                .filter(t => !STOP_WORDS.has(t))
        )];
        const allTerms = query.toLowerCase().replace(/[?!.,;:'"()]/g, '').split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
        const terms = properNouns.length >= 1 ? properNouns : allTerms;

        if (terms.length === 0) return [];

        const scored = [];
        for (const note of idx) {
            const searchText = `${note.filename} ${Object.values(note.frontmatter).join(' ')} ${note.body}`.toLowerCase();
            // Hyphen-normalized copy so "cpuss" matches "CP-USS", "tarbaphon" matches "Tar-Baphon", etc.
            const searchTextNorm = searchText.replace(/[-–—]/g, '');
            let score = 0;
            let matchedTerms = 0;
            for (const term of terms) {
                const termNorm = term.replace(/[-–—]/g, '');
                const count = (searchTextNorm.match(new RegExp(termNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
                if (count > 0) {
                    matchedTerms++;
                    score += count;
                }
            }

            // Require at least 1 term matched for short queries, 2+ for longer ones
            const threshold = terms.length <= 2 ? 1 : Math.max(2, Math.ceil(terms.length * 0.4));
            if (matchedTerms < threshold) continue;

            // Bonus for matching more terms (relevance)
            score *= (matchedTerms / terms.length);

            // Boost exact filename matches
            if (note.filename.toLowerCase().includes(query.toLowerCase())) {
                score += 50;
            }
            // Boost individual name matches in filename
            for (const term of terms) {
                if (note.filename.toLowerCase().includes(term)) score += 10;
            }

            // Boost structured/curated content over raw transcripts
            const type = (note.frontmatter.type || '').toLowerCase();
            if (type === 'timeline') score *= 10;           // Timeline is authoritative
            else if (type === 'session-summary') score *= 5; // Summaries are curated
            else if (type === 'character') score *= 4;       // Character dossiers
            else if (type === 'raw-transcript') score *= 0;  // Never inject raw transcripts

            if (score > 0) scored.push({ note, score });
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
     * Extract proper nouns / entity names from a query string.
     * Tries nameResolver first, then falls back to capitalized words.
     */
    _extractNames(query) {
        const names = [];
        const words = query.replace(/[?!.,;:'"()]/g, '').split(/\s+/);

        // Common English words that should NEVER be resolved as entity names
        const skipWords = new Set([
            'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
            'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
            'do', 'does', 'did', 'done', 'has', 'have', 'had', 'will', 'would', 'could', 'should',
            'can', 'may', 'might', 'shall', 'must', 'need',
            'what', 'who', 'where', 'when', 'why', 'how', 'which', 'whom', 'whose',
            'this', 'that', 'these', 'those', 'there', 'here', 'then', 'than',
            'not', 'no', 'yes', 'so', 'if', 'or', 'and', 'but', 'nor', 'yet',
            'about', 'after', 'before', 'between', 'with', 'from', 'into', 'over', 'under',
            'again', 'also', 'just', 'very', 'much', 'more', 'most', 'some', 'any', 'all',
            'tell', 'know', 'think', 'said', 'say', 'called', 'asking', 'asked',
            'weapon', 'sword', 'item', 'armor', 'shield', 'potion', 'spell',
            'character', 'player', 'campaign', 'session', 'party', 'group',
        ]);

        // Try multi-word combinations (e.g., "Khonnir Baine", "Sha-Feng")
        for (let i = 0; i < words.length; i++) {
            if (skipWords.has(words[i].toLowerCase())) continue;

            // Try 2-word combo
            if (i < words.length - 1 && !skipWords.has(words[i + 1].toLowerCase())) {
                const twoWord = `${words[i]} ${words[i + 1]}`;
                const resolved = nameResolver.resolve(twoWord);
                if (resolved) { names.push(resolved); i++; continue; }
            }
            // Try single word (min 3 chars to avoid noise)
            if (words[i].length >= 3) {
                const resolved = nameResolver.resolve(words[i]);
                if (resolved) { names.push(resolved); continue; }
            }
            // Keep capitalized non-stop words as potential names
            if (words[i].length > 2 && words[i][0] === words[i][0].toUpperCase() && words[i][0] !== words[i][0].toLowerCase()) {
                names.push(words[i]);
            }
        }
        // Dedupe
        return [...new Set(names)];
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

        // 1. TIMELINE — search timeline files for matching rows
        // Use ANY-match with scoring: more matched terms = higher relevance
        // (GM plot secrets are excluded — they must never reach player-facing context)
        const idx = this.buildIndex().filter(n => !this._isGmSecret(n));
        const queryLower = query.toLowerCase();
        const STOP_WORDS = new Set([
            'the','a','an','is','was','were','are','did','do','does','done',
            'when','where','who','what','how','why','which','whom',
            'about','have','has','had','can','could','will','would','should','shall','must',
            'this','that','with','from','for','and','but','not','nor','or','yet','so',
            'die','died','dies','kill','killed','happen','happened','start','started',
            'tell','know','said','say','think','called','asking','asked',
            'me','my','you','your','he','she','it','they','them','we','us','our','its',
            'there','here','then','than','just','very','much','more','most','some','any','all',
            'weapon','sword','item','armor','shield','potion','spell','character','player',
            'give','gave','get','got','put','take','took','make','made','come','came','going',
            'her','him','his','hers','their','theirs','she','let','cannot','certainly','very',
            'more','than','when','also','even','still','again','always','never','really','because',
            'shit','fuck','damn','yeah','well','okay','though','being','been','both','each','own',
        ]);
        // Prefer proper nouns (capitalized mid-sentence words) when present — they are
        // names/places and give far better retrieval than raw prose words. Fall back to
        // full term extraction for all-lowercase queries.
        const properNouns = [...new Set(
            [...query.matchAll(/\b[A-Z][a-zA-Z''-]{2,}\b/g)]
                .map(m => m[0].toLowerCase())
                .filter(t => !STOP_WORDS.has(t))
        )];
        const allTerms = queryLower.replace(/[?!.,;:'"()]/g, '').split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
        const queryTerms = properNouns.length >= 1 ? properNouns : allTerms;
        const timelineNotes = idx.filter(n => (n.frontmatter.type || '').toLowerCase() === 'timeline');

        logger.debug(`🔍 Vault search terms: [${queryTerms.join(', ')}]`);

        const matchingRows = [];
        for (const note of timelineNotes) {
            const lines = note.body.split('\n');
            for (const line of lines) {
                if (!line.startsWith('|') || line.startsWith('| Date') || line.startsWith('|---')) continue;
                const lineLower = line.toLowerCase();
                const lineNorm = lineLower.replace(/[-–—]/g, '');
                // Score each row by how many query terms it matches (hyphen-normalized)
                const matchCount = queryTerms.filter(t => lineNorm.includes(t.replace(/[-–—]/g, ''))).length;
                // Require at least 2 terms OR >50% of terms to match
                const threshold = Math.max(2, Math.ceil(queryTerms.length * 0.4));
                if (matchCount >= threshold) {
                    const dateKey = (line.match(/\|\s*(-?[\d.]+)/) || [])[1] || '';
                    matchingRows.push({ line: line.trim(), score: matchCount, dateKey });
                }
            }
        }

        // Sort by match score, then RECENCY on ties — outcomes and resolutions
        // ("X was caught/killed/became Y") live in later rows, and the old
        // file-order tiebreak systematically dropped them at the row cap.
        matchingRows.sort((a, b) => b.score - a.score || String(b.dateKey).localeCompare(String(a.dateKey)));

        if (matchingRows.length > 0) {
            const timelineContext = `[TIMELINE — Verified canonical events]\n| Date | Location | Event |\n|------|----------|-------|\n${matchingRows.slice(0, 20).map(r => r.line).join('\n')}`;
            sections.push(timelineContext);
            totalChars += timelineContext.length;
            logger.debug(`🧠 Timeline matches: ${matchingRows.length} rows (top score: ${matchingRows[0].score}/${queryTerms.length} terms)`);
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

        // 3. Direct name matches — try each proper noun in the query, not the whole string
        const nameTokens = this._extractNames(query);
        for (const name of nameTokens) {
            const nameHits = this.byName(name);
            for (const note of nameHits.slice(0, 2)) {
                if (totalChars > maxTokens) break;
                if (includedPaths.has(note.path)) continue;
                if ((note.frontmatter.type || '').toLowerCase() === 'timeline') continue;
                if ((note.frontmatter.type || '').toLowerCase() === 'conversation-log') continue;
                const summary = this._summarizeNote(note);
                sections.push(`[${note.folder || 'Note'}: ${note.filename}]\n${summary}`);
                totalChars += summary.length;
                includedPaths.add(note.path);
            }
        }

        // 3b. Item search — search Items/ folder by filename match on query terms
        //     Scores items by how many query terms match their filename, best matches first
        const itemNotes = idx.filter(n => (n.frontmatter.type || '').toLowerCase() === 'item');
        if (itemNotes.length > 0 && queryTerms.length > 0) {
            const scoredItems = itemNotes
                .map(note => {
                    const nameLower = note.filename.toLowerCase().replace(/[-–—]/g, '');
                    const score = queryTerms.filter(t => nameLower.includes(t.replace(/[-–—]/g, ''))).length;
                    return { note, score };
                })
                .filter(s => s.score > 0)
                .sort((a, b) => b.score - a.score);

            for (const { note } of scoredItems.slice(0, 3)) {
                if (totalChars > maxTokens) break;
                if (includedPaths.has(note.path)) continue;
                const summary = this._summarizeNote(note);
                sections.push(`[SOURCE: Item] ${note.filename}\n${summary}`);
                totalChars += summary.length;
                includedPaths.add(note.path);
            }
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

        logger.debug(`🧠 Vault context: ${sections.length} sections, ${totalChars} chars`);

        if (sections.length === 0) {
            return '';
        }

        // Return sections joined — the caller (llmHandler._fetchContext) wraps
        // the full assembled context in <recalled-context> memory-fencing tags.
        return sections.join('\n\n');
    }

    /**
     * Check if a note has the gm-eyes tag (GM-only content, never share with players)
     */
    _isGmEyes(note) {
        return (note.tags || []).some(t => t.toLowerCase().includes('gm-only') || t.toLowerCase().includes('gm-eyes'));
    }

    /**
     * Summarize a note for context injection.
     * Notes tagged gm-only/gm-eyes get a [GM-ONLY] prefix so the LLM knows not to share.
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
        // Character dossiers need more space — equipment lists alone can be 5000+ chars
        const isCharacter = (fm.type || '').toLowerCase() === 'character';
        const isItem = (fm.type || '').toLowerCase() === 'item';
        if (compact) {
            const limit = isCharacter ? 2000 : 500;
            if (bodyClean.length > 0) {
                parts.push(bodyClean.substring(0, limit) + (bodyClean.length > limit ? '...' : ''));
            }
        } else {
            const limit = isCharacter ? 4000 : (isItem ? 2000 : 1500);
            if (bodyClean.length > 0) {
                parts.push(bodyClean.substring(0, limit) + (bodyClean.length > limit ? '...' : ''));
            }
        }

        let result = parts.join('\n');

        // Tag GM-only content so the LLM knows never to share it with players
        if (this._isGmEyes(note)) {
            result = `[GM-ONLY — DO NOT share this with players]\n${result}`;
        }

        return result;
    }

    /**
     * Get the full markdown content for a character file, no truncation.
     * Used for equipment queries where we need the complete item list.
     * @param {string} name - Character name (will be resolved via nameResolver)
     * @returns {string|null} - Full markdown body or null if not found
     */
    getFullCharacterMarkdown(name) {
        const idx = this.buildIndex();
        const resolved = nameResolver.resolve(name);
        const searchName = resolved || name;

        const note = idx.find(n =>
            (n.frontmatter.type || '').toLowerCase() === 'character' &&
            (n.filename.toLowerCase() === searchName.toLowerCase() ||
             (n.frontmatter.name && n.frontmatter.name.toLowerCase() === searchName.toLowerCase()))
        );

        if (!note) return null;

        // Read the FULL file from disk (not the cached body, which may be truncated)
        try {
            const fullContent = fs.readFileSync(note.path, 'utf-8');
            // Strip frontmatter, return everything after ---\n
            const bodyMatch = fullContent.match(/^---[\s\S]*?---\n([\s\S]*)$/);
            const body = bodyMatch ? bodyMatch[1].trim() : fullContent;

            const fm = note.frontmatter;
            const parts = [];
            if (fm.name) parts.push(`Name: ${fm.name}`);
            if (fm.race) parts.push(`Race: ${fm.race}`);
            if (fm.class) parts.push(`Class: ${fm.class}`);
            if (fm.level) parts.push(`Level: ${fm.level}`);
            if (fm.player) parts.push(`Player: ${fm.player}`);
            if (fm.campaign) parts.push(`Campaign: ${Array.isArray(fm.campaign) ? fm.campaign.join(', ') : fm.campaign}`);
            parts.push('');
            parts.push(body);

            return parts.join('\n');
        } catch (err) {
            logger.warn(`Failed to read full markdown for ${searchName}: ${err.message}`);
            return null;
        }
    }

    /**
     * Get the full markdown content for an item file, no truncation.
     * @param {string} name - Item name
     * @returns {string|null} - Full markdown body or null
     */
    getFullItemMarkdown(name) {
        const idx = this.buildIndex();
        const searchName = name.toLowerCase();

        // Try exact match first, then substring
        let note = idx.find(n =>
            (n.frontmatter.type || '').toLowerCase() === 'item' &&
            (n.filename.toLowerCase() === searchName ||
             (n.frontmatter.name && n.frontmatter.name.toLowerCase() === searchName))
        );

        // Fallback: find best substring match
        if (!note) {
            const candidates = idx.filter(n =>
                (n.frontmatter.type || '').toLowerCase() === 'item' &&
                (n.filename.toLowerCase().includes(searchName) ||
                 (n.frontmatter.name && n.frontmatter.name.toLowerCase().includes(searchName)))
            );
            if (candidates.length === 1) note = candidates[0];
            else if (candidates.length > 1) {
                // Pick the one with the closest name length (most specific match)
                candidates.sort((a, b) => {
                    const aLen = (a.frontmatter.name || a.filename).length;
                    const bLen = (b.frontmatter.name || b.filename).length;
                    return aLen - bLen;
                });
                note = candidates[0];
            }
        }

        if (!note) return null;

        // Read the FULL file from disk (not the cached body)
        try {
            const fullContent = fs.readFileSync(note.path, 'utf-8');
            const bodyMatch = fullContent.match(/^---[\s\S]*?---\n([\s\S]*)$/);
            const body = bodyMatch ? bodyMatch[1].trim() : fullContent;

            const fm = note.frontmatter;
            const parts = [];
            if (fm.name) parts.push(`Item: ${fm.name}`);
            if (fm.itemType) parts.push(`Type: ${fm.itemType}`);
            if (fm.campaigns) parts.push(`Campaigns: ${Array.isArray(fm.campaigns) ? fm.campaigns.join(', ') : fm.campaigns}`);
            parts.push('');
            parts.push(body);

            return parts.join('\n');
        } catch (err) {
            logger.warn(`Failed to read full item markdown for ${name}: ${err.message}`);
            return null;
        }
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
