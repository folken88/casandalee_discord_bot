/**
 * Dossier Manager for Casandalee
 * Manages character dossiers stored as Obsidian-compatible markdown files
 * in the vault's Characters/ folder. The vault acts as Cass's live "brain" —
 * edits made in Obsidian are picked up by the bot, and vice versa.
 *
 * All character data lives in the Obsidian vault (the sole source of truth).
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const nameResolver = require('./nameResolver');

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault');
const CHARACTERS_DIR = path.join(VAULT_DIR, 'Characters');

class DossierManager {
    constructor() {
        this.charactersDir = CHARACTERS_DIR;
        this.dossierIndex = new Map(); // canonical name -> dossier data
        this.dirty = new Set(); // names that need saving
        this.autoSaveInterval = null;

        this._ensureDirectories();
        this._loadAll();
        this._startAutoSave();
    }

    // ─── Directory Setup ─────────────────────────────────────────────

    _ensureDirectories() {
        if (!fs.existsSync(this.charactersDir)) {
            fs.mkdirSync(this.charactersDir, { recursive: true });
            logger.info(`Created directory: ${this.charactersDir}`);
        }
    }

    // ─── Loading ─────────────────────────────────────────────────────

    /**
     * Load all dossiers from the Obsidian vault.
     */
    _loadAll() {
        // Load from vault markdown
        try {
            const mdFiles = fs.readdirSync(this.charactersDir).filter(f => f.endsWith('.md'));
            for (const file of mdFiles) {
                try {
                    const filePath = path.join(this.charactersDir, file);
                    const raw = fs.readFileSync(filePath, 'utf8');
                    const dossier = this._parseVaultMarkdown(raw, file);
                    if (dossier && dossier.canonicalName) {
                        this.dossierIndex.set(dossier.canonicalName, dossier);
                        nameResolver.register(dossier.canonicalName, dossier.aliases || []);
                    }
                } catch (err) {
                    logger.warn(`Error parsing vault file ${file}:`, err.message);
                }
            }
        } catch (err) {
            logger.warn('Could not read vault Characters/ directory:', err.message);
        }

        logger.info(`Loaded ${this.dossierIndex.size} character dossiers (vault: ${this.charactersDir})`);

        // Save any migrated dossiers immediately
        if (this.dirty.size > 0) {
            this._saveDirty();
        }
    }

    // ─── Vault Markdown Parsing ──────────────────────────────────────

    /**
     * Parse an Obsidian vault markdown file into a dossier object.
     * Reads YAML frontmatter for structured data, and specific markdown
     * sections for notes, rolls, timeline refs, etc.
     */
    _parseVaultMarkdown(raw, filename) {
        const dossier = {
            canonicalName: null,
            aliases: [],
            race: null,
            class: null,
            level: null,
            player: null,
            description: null,
            notes: [],
            rollHistory: [],
            timelineReferences: [],
            playerUpdates: [],
            emojiReactions: {},
            createdAt: null,
            updatedAt: null
        };

        // Parse YAML frontmatter
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
            const fm = fmMatch[1];
            dossier.canonicalName = this._yamlValue(fm, 'name');
            dossier.race = this._yamlValue(fm, 'race');
            dossier.class = this._yamlValue(fm, 'class');
            dossier.player = this._yamlValue(fm, 'player');
            dossier.createdAt = this._yamlValue(fm, 'created');
            dossier.updatedAt = this._yamlValue(fm, 'updated');

            const levelStr = this._yamlValue(fm, 'level');
            if (levelStr && !isNaN(levelStr)) dossier.level = parseInt(levelStr);

            // Parse arrays
            dossier.aliases = this._yamlArray(fm, 'aliases');
        }

        // Fallback name from filename
        if (!dossier.canonicalName) {
            dossier.canonicalName = filename.replace('.md', '');
        }

        // Parse body content after frontmatter
        const body = fmMatch ? raw.substring(fmMatch[0].length) : raw;

        // Extract description: text after the stats line (Race/Class/Level) and before the first ## section
        // The body typically looks like: # Name\n\n**Race:** ...\n\nDescription text here\n\n## Section
        const descMatch = body.match(/# .+\n\n(?:\*\*.+\*\*.*\n\n)([\s\S]*?)(?=\n## )/);
        if (descMatch) {
            const desc = descMatch[1].trim();
            if (desc && desc.length > 0 && !desc.startsWith('*Session')) {
                dossier.description = desc;
            }
        }

        // Parse "Notes & Updates" section
        const notesSection = this._extractSection(body, 'Notes & Updates');
        if (notesSection) {
            const noteLines = notesSection.match(/^- .+$/gm) || [];
            for (const line of noteLines) {
                const noteMatch = line.match(/^- (.+?)(?:\s*\*\((.+?)(?:,\s*(.+?))?\)\*)?$/);
                if (noteMatch) {
                    dossier.playerUpdates.push({
                        text: noteMatch[1].trim(),
                        updatedBy: noteMatch[2]?.trim() || 'unknown',
                        timestamp: noteMatch[3]?.trim() ? new Date(noteMatch[3].trim()).toISOString() : new Date().toISOString()
                    });
                }
            }
        }

        // Parse "Roll History" section
        const rollSection = this._extractSection(body, 'Roll History');
        if (rollSection) {
            const rollLines = rollSection.match(/^- .+$/gm) || [];
            for (const line of rollLines) {
                const rollMatch = line.match(/^- \*\*(.+?)\*\*:\s*(.+?)\s*→\s*(.+?)(?:\s*\((.+?)\))?\s*(?:\*(.+?)\*)?$/);
                if (rollMatch) {
                    dossier.rollHistory.push({
                        type: rollMatch[1],
                        roll: rollMatch[2],
                        result: rollMatch[3].trim(),
                        command: rollMatch[4] || null,
                        timestamp: rollMatch[5] ? new Date(rollMatch[5]).toISOString() : new Date().toISOString()
                    });
                }
            }
        }

        // Parse "Timeline References" section
        const timelineSection = this._extractSection(body, 'Timeline References');
        if (timelineSection) {
            const refLines = timelineSection.match(/^- .+$/gm) || [];
            for (const line of refLines) {
                const refMatch = line.match(/^- \*\*\[(.+?)\]\*\*\s*(?:\*\((.+?)\)\*\s*)?(.+)$/);
                if (refMatch) {
                    dossier.timelineReferences.push({
                        date: refMatch[1],
                        location: refMatch[2] || '',
                        description: refMatch[3].trim()
                    });
                }
            }
        }

        return dossier;
    }

    /**
     * Extract a simple YAML value from frontmatter text
     */
    _yamlValue(yaml, key) {
        const match = yaml.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, 'm'));
        if (!match) return null;
        const val = match[1].trim();
        return val === '?' || val === '' ? null : val;
    }

    /**
     * Extract a YAML array from frontmatter text
     */
    _yamlArray(yaml, key) {
        const match = yaml.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
        if (!match) return [];
        return match[1].split(',')
            .map(s => s.trim().replace(/^"(.*)"$/, '$1'))
            .filter(Boolean);
    }

    /**
     * Extract content of a markdown section by heading name
     */
    _extractSection(body, heading) {
        const regex = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
        const match = body.match(regex);
        return match ? match[1].trim() : null;
    }

    // ─── Vault Markdown Writing ──────────────────────────────────────

    /**
     * Save a single dossier as an Obsidian vault markdown file
     */
    _saveDossier(canonicalName) {
        const dossier = this.dossierIndex.get(canonicalName);
        if (!dossier) return;

        try {
            // Write vault markdown (primary)
            const safeName = canonicalName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
            const vaultPath = path.join(this.charactersDir, `${safeName}.md`);

            // Check if there's an existing file with session appearances to preserve
            let sessionAppearances = '';
            if (fs.existsSync(vaultPath)) {
                const existing = fs.readFileSync(vaultPath, 'utf8');
                const sessSection = this._extractSection(existing, 'Session Appearances');
                if (sessSection && !sessSection.startsWith('*Session activity')) {
                    sessionAppearances = sessSection;
                }
            }

            const md = this._dossierToMarkdown(dossier, sessionAppearances);
            fs.writeFileSync(vaultPath, md, 'utf8');

        } catch (err) {
            logger.error(`Error saving dossier for ${canonicalName}:`, err.message);
        }
    }

    /**
     * Convert a dossier object to Obsidian-compatible markdown
     */
    _dossierToMarkdown(d, sessionAppearances = '') {
        const tags = ['character'];
        if (d.player) tags.push('pc');

        let md = `---
name: "${d.canonicalName}"
type: character
race: "${d.race || 'Unknown'}"
class: "${d.class || 'Unknown'}"
level: ${d.level || '?'}
${d.player ? `player: "${d.player}"` : ''}
aliases: [${(d.aliases || []).map(a => `"${a}"`).join(', ')}]
tags: [${tags.map(t => `"${t}"`).join(', ')}]
created: "${d.createdAt || ''}"
updated: "${d.updatedAt || ''}"
---

# ${d.canonicalName}

`;

        // Stats line
        const statParts = [];
        if (d.race) statParts.push(`**Race:** ${d.race}`);
        if (d.class) statParts.push(`**Class:** ${d.class}`);
        if (d.level) statParts.push(`**Level:** ${d.level}`);
        if (d.player) statParts.push(`**Player:** ${d.player}`);
        if (statParts.length > 0) {
            md += statParts.join(' | ') + '\n\n';
        }

        if (d.description) {
            md += `${d.description}\n\n`;
        }

        // Notes & Updates
        if (d.playerUpdates && d.playerUpdates.length > 0) {
            md += `## Notes & Updates\n\n`;
            for (const update of d.playerUpdates) {
                const date = update.timestamp ? new Date(update.timestamp).toLocaleDateString() : '';
                const source = update.updatedBy || 'unknown';
                md += `- ${update.text}`;
                if (date || source) md += ` *(${source}${date ? ', ' + date : ''})*`;
                md += '\n';
            }
            md += '\n';
        }

        // Timeline References
        if (d.timelineReferences && d.timelineReferences.length > 0) {
            md += `## Timeline References\n\n`;
            for (const ref of d.timelineReferences) {
                md += `- **[${ref.date}]** ${ref.location ? `*(${ref.location})* ` : ''}${ref.description}\n`;
            }
            md += '\n';
        }

        // Roll History
        if (d.rollHistory && d.rollHistory.length > 0) {
            md += `## Roll History\n\n`;
            for (const roll of d.rollHistory.slice(-20)) {
                const date = roll.timestamp ? new Date(roll.timestamp).toLocaleDateString() : '';
                md += `- **${roll.type}**: ${roll.roll} → ${roll.result}`;
                if (roll.command) md += ` (${roll.command})`;
                if (date) md += ` *${date}*`;
                md += '\n';
            }
            md += '\n';
        }

        // Emoji Reactions
        const reactions = Object.entries(d.emojiReactions || {});
        if (reactions.length > 0) {
            md += `## Reactions\n\n`;
            md += reactions.map(([emoji, count]) => `${emoji} ×${count}`).join('  ') + '\n\n';
        }

        // Session Appearances (preserved from existing file or placeholder)
        md += `## Session Appearances\n\n`;
        if (sessionAppearances) {
            md += sessionAppearances + '\n';
        } else {
            md += `*Session activity from YouTube transcripts will appear here.*\n`;
        }

        return md;
    }

    // ─── Auto-save ───────────────────────────────────────────────────

    _startAutoSave() {
        this.autoSaveInterval = setInterval(() => this._saveDirty(), 60000);
    }

    _saveDirty() {
        for (const name of this.dirty) {
            this._saveDossier(name);
        }
        if (this.dirty.size > 0) {
            logger.debug(`Saved ${this.dirty.size} dirty dossiers to vault`);
        }
        this.dirty.clear();
    }

    // ─── Public API (unchanged interface) ────────────────────────────

    getDossier(name) {
        const canonical = nameResolver.resolve(name);
        if (canonical && this.dossierIndex.has(canonical)) {
            return this.dossierIndex.get(canonical);
        }
        return null;
    }

    createDossier(canonicalName, initialData = {}) {
        const dossier = {
            canonicalName,
            aliases: initialData.aliases || [],
            race: initialData.race || null,
            class: initialData.class || null,
            level: initialData.level || null,
            player: initialData.player || null,
            description: initialData.description || null,
            notes: [],
            rollHistory: [],
            timelineReferences: [],
            playerUpdates: [],
            emojiReactions: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.dossierIndex.set(canonicalName, dossier);
        nameResolver.register(canonicalName, dossier.aliases);
        this.dirty.add(canonicalName);
        logger.info(`Created dossier for ${canonicalName}`);

        return dossier;
    }

    addPlayerUpdate(name, updateText, updatedBy) {
        const canonical = nameResolver.resolve(name);
        if (!canonical) return null;

        let dossier = this.dossierIndex.get(canonical);
        if (!dossier) {
            dossier = this.createDossier(canonical);
        }

        dossier.playerUpdates.push({
            text: updateText,
            updatedBy,
            timestamp: new Date().toISOString()
        });
        dossier.updatedAt = new Date().toISOString();

        this.dirty.add(canonical);
        logger.info(`Player update for ${canonical} by ${updatedBy}: "${updateText}"`);

        return dossier;
    }

    addRollHistory(name, rollData) {
        const canonical = nameResolver.resolve(name);
        if (!canonical) return false;

        let dossier = this.dossierIndex.get(canonical);
        if (!dossier) {
            dossier = this.createDossier(canonical);
        }

        dossier.rollHistory.push({
            ...rollData,
            timestamp: new Date().toISOString()
        });

        if (dossier.rollHistory.length > 50) {
            dossier.rollHistory = dossier.rollHistory.slice(-50);
        }

        dossier.updatedAt = new Date().toISOString();
        this.dirty.add(canonical);

        return true;
    }

    addEmojiReaction(name, emoji, reactedBy) {
        const canonical = nameResolver.resolve(name);
        if (!canonical) return;

        let dossier = this.dossierIndex.get(canonical);
        if (!dossier) return;

        if (!dossier.emojiReactions[emoji]) {
            dossier.emojiReactions[emoji] = 0;
        }
        dossier.emojiReactions[emoji]++;
        dossier.updatedAt = new Date().toISOString();
        this.dirty.add(canonical);
    }

    addTimelineReferences(canonicalName, events) {
        let dossier = this.dossierIndex.get(canonicalName);
        if (!dossier) {
            dossier = this.createDossier(canonicalName);
        }

        const existingDescs = new Set(dossier.timelineReferences.map(e => e.description));
        for (const event of events) {
            if (!existingDescs.has(event.description)) {
                dossier.timelineReferences.push({
                    date: event.date,
                    location: event.location,
                    description: event.description
                });
            }
        }

        dossier.updatedAt = new Date().toISOString();
        this.dirty.add(canonicalName);
    }

    getFormattedDossier(name) {
        const dossier = this.getDossier(name);
        if (!dossier) return null;

        let text = `**${dossier.canonicalName}**\n`;

        if (dossier.race) text += `Race: ${dossier.race}\n`;
        if (dossier.class) text += `Class: ${dossier.class}\n`;
        if (dossier.level) text += `Level: ${dossier.level}\n`;
        if (dossier.player) text += `Player: ${dossier.player}\n`;
        if (dossier.description) text += `\n${dossier.description}\n`;

        if (dossier.playerUpdates.length > 0) {
            text += '\n**Player Notes:**\n';
            const recent = dossier.playerUpdates.slice(-5);
            for (const update of recent) {
                text += `- ${update.text} *(${update.updatedBy})*\n`;
            }
        }

        if (dossier.rollHistory.length > 0) {
            text += '\n**Recent Rolls:**\n';
            const recent = dossier.rollHistory.slice(-5);
            for (const roll of recent) {
                text += `- ${roll.type}: ${roll.result} (${roll.timestamp.split('T')[0]})\n`;
            }
        }

        if (dossier.timelineReferences.length > 0) {
            text += `\n**Timeline Mentions:** ${dossier.timelineReferences.length} events\n`;
            const recent = dossier.timelineReferences.slice(-3);
            for (const ref of recent) {
                text += `- ${ref.date}: ${ref.description.substring(0, 100)}...\n`;
            }
        }

        return text;
    }

    getAllNames() {
        return [...this.dossierIndex.keys()];
    }

    getContextForLLM(name) {
        const dossier = this.getDossier(name);
        if (!dossier) return null;

        let context = `Character: ${dossier.canonicalName}`;
        if (dossier.race) context += ` | Race: ${dossier.race}`;
        if (dossier.class) context += ` | Class: ${dossier.class}`;
        if (dossier.level) context += ` | Level: ${dossier.level}`;
        if (dossier.description) context += ` | ${dossier.description}`;

        if (dossier.playerUpdates.length > 0) {
            const recentNotes = dossier.playerUpdates.slice(-3).map(u => u.text).join('; ');
            context += ` | Notes: ${recentNotes}`;
        }

        return context;
    }

    async autoGenerateFromTimeline(timelineEvents, knownCharacters) {
        let generated = 0;
        for (const charName of knownCharacters) {
            if (this.dossierIndex.has(charName)) continue;

            const mentions = timelineEvents.filter(event =>
                event.description && event.description.toLowerCase().includes(charName.toLowerCase())
            );

            if (mentions.length > 0) {
                this.createDossier(charName);
                this.addTimelineReferences(charName, mentions);
                generated++;
            }
        }

        if (generated > 0) {
            logger.info(`Auto-generated ${generated} dossiers from timeline data`);
            this._saveDirty();
        }
    }

    flush() {
        this._saveDirty();
    }

    destroy() {
        this._saveDirty();
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
    }
}

// Singleton instance
const dossierManager = new DossierManager();

module.exports = dossierManager;
