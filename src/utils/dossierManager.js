/**
 * Dossier Manager for Casandalee
 * Manages character dossiers — auto-generated profiles from timeline data,
 * player updates via /characterupdate, roll history, and emoji reactions.
 * Dossiers are Cass's "character sheets" for people in the campaign.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const nameResolver = require('./nameResolver');

class DossierManager {
    constructor() {
        this.dossierDir = path.join(__dirname, '../../data/dossiers');
        this.dossierIndex = new Map(); // canonical name -> dossier data
        this.dirty = new Set(); // names that need saving
        this.autoSaveInterval = null;

        this._ensureDirectoryExists();
        this._loadAll();
        this._startAutoSave();
    }

    /**
     * Ensure the dossier directory exists
     */
    _ensureDirectoryExists() {
        if (!fs.existsSync(this.dossierDir)) {
            fs.mkdirSync(this.dossierDir, { recursive: true });
            logger.info('Created dossiers directory');
        }
    }

    /**
     * Load all dossier files from disk
     */
    _loadAll() {
        try {
            const files = fs.readdirSync(this.dossierDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                const filePath = path.join(this.dossierDir, file);
                const raw = fs.readFileSync(filePath, 'utf8');
                const dossier = JSON.parse(raw);
                const name = dossier.canonicalName || file.replace('.json', '');
                this.dossierIndex.set(name, dossier);

                // Register with name resolver
                nameResolver.register(name, dossier.aliases || []);
            }
            logger.info(`Loaded ${this.dossierIndex.size} character dossiers`);
        } catch (err) {
            logger.error('Error loading dossiers:', err.message);
        }
    }

    /**
     * Start auto-save timer (every 60 seconds)
     */
    _startAutoSave() {
        this.autoSaveInterval = setInterval(() => this._saveDirty(), 60000);
    }

    /**
     * Save all dirty dossiers to disk
     */
    _saveDirty() {
        for (const name of this.dirty) {
            this._saveDossier(name);
        }
        this.dirty.clear();
    }

    /**
     * Save a single dossier to disk
     * @param {string} canonicalName - The canonical name
     */
    _saveDossier(canonicalName) {
        try {
            const dossier = this.dossierIndex.get(canonicalName);
            if (!dossier) return;

            const safeName = canonicalName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
            const filePath = path.join(this.dossierDir, `${safeName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(dossier, null, 2), 'utf8');
        } catch (err) {
            logger.error(`Error saving dossier for ${canonicalName}:`, err.message);
        }
    }

    /**
     * Get or create a dossier for a character
     * @param {string} name - Character name (fuzzy matched)
     * @returns {Object|null} - Dossier data
     */
    getDossier(name) {
        const canonical = nameResolver.resolve(name);
        if (canonical && this.dossierIndex.has(canonical)) {
            return this.dossierIndex.get(canonical);
        }
        return null;
    }

    /**
     * Create a new dossier for a character
     * @param {string} canonicalName - The canonical name
     * @param {Object} [initialData={}] - Initial dossier data
     * @returns {Object} - The new dossier
     */
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

    /**
     * Update a dossier with player-provided information
     * @param {string} name - Character name (fuzzy matched)
     * @param {string} updateText - The update text from the player
     * @param {string} updatedBy - Discord username of the updater
     * @returns {Object|null} - Updated dossier or null
     */
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

    /**
     * Add a roll to a character's history
     * @param {string} name - Character name
     * @param {Object} rollData - Roll data {type, roll, result, command}
     * @returns {boolean} - Success
     */
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

        // Keep only last 50 rolls
        if (dossier.rollHistory.length > 50) {
            dossier.rollHistory = dossier.rollHistory.slice(-50);
        }

        dossier.updatedAt = new Date().toISOString();
        this.dirty.add(canonical);

        return true;
    }

    /**
     * Record an emoji reaction on a Cass message about this character
     * @param {string} name - Character name
     * @param {string} emoji - The emoji string
     * @param {string} reactedBy - Discord username
     */
    addEmojiReaction(name, emoji, reactedBy) {
        const canonical = nameResolver.resolve(name);
        if (!canonical) return;

        let dossier = this.dossierIndex.get(canonical);
        if (!dossier) return; // Only track reactions for existing dossiers

        if (!dossier.emojiReactions[emoji]) {
            dossier.emojiReactions[emoji] = 0;
        }
        dossier.emojiReactions[emoji]++;
        dossier.updatedAt = new Date().toISOString();
        this.dirty.add(canonical);
    }

    /**
     * Add timeline references to a dossier
     * @param {string} canonicalName - Character name
     * @param {Array} events - Timeline events referencing this character
     */
    addTimelineReferences(canonicalName, events) {
        let dossier = this.dossierIndex.get(canonicalName);
        if (!dossier) {
            dossier = this.createDossier(canonicalName);
        }

        // Deduplicate by description
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

    /**
     * Get a formatted summary of a dossier for display
     * @param {string} name - Character name
     * @returns {string|null} - Formatted dossier text
     */
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

    /**
     * Get all dossier names
     * @returns {string[]} - Array of canonical names
     */
    getAllNames() {
        return [...this.dossierIndex.keys()];
    }

    /**
     * Get dossier context for LLM (compact format)
     * @param {string} name - Character name
     * @returns {string|null} - Compact context string
     */
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

    /**
     * Auto-generate dossiers from timeline data
     * Scans timeline events for character names and creates dossiers
     * @param {Array} timelineEvents - Array of timeline events
     * @param {string[]} knownCharacters - Array of known character names to look for
     */
    async autoGenerateFromTimeline(timelineEvents, knownCharacters) {
        let generated = 0;
        for (const charName of knownCharacters) {
            if (this.dossierIndex.has(charName)) continue;

            const mentions = timelineEvents.filter(event =>
                event.description && event.description.toLowerCase().includes(charName.toLowerCase())
            );

            if (mentions.length > 0) {
                const dossier = this.createDossier(charName);
                this.addTimelineReferences(charName, mentions);
                generated++;
            }
        }

        if (generated > 0) {
            logger.info(`Auto-generated ${generated} dossiers from timeline data`);
            this._saveDirty();
        }
    }

    /**
     * Flush all pending changes to disk
     */
    flush() {
        this._saveDirty();
    }

    /**
     * Cleanup resources
     */
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
