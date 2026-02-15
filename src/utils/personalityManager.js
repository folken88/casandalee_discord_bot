/**
 * Personality Manager for Casandalee
 * Loads individual .md personality files, handles dynamic weighting,
 * hidden personality switching, and subtle response flavoring.
 *
 * Key features:
 *   - Dynamic weighting: underused personalities get a boost
 *   - Hidden switch rolls: 1d7 queries or 1 hour triggers a switch
 *   - Emoji flavoring: each personality has preferred emojis
 *   - Tone metadata: each personality has a tone (aggressive, scholarly, etc.)
 *   - Context-aware selection: technical questions bias toward engineer/wizard types
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PersonalityManager {
    constructor() {
        this.personalityDir = path.join(__dirname, '../../data/personalities');

        /** @type {Map<number, Object>} life number -> personality data */
        this.personalities = new Map();

        /** @type {Object|null} goddess form data */
        this.goddessForm = null;

        /** @type {Object|null} current active personality */
        this.current = null;

        /** @type {number} queries since last switch */
        this.queriesSinceSwitch = 0;

        /** @type {number} switch threshold (1d7) */
        this.switchThreshold = this._roll1d7();

        /** @type {number} timestamp of last switch */
        this.lastSwitchTime = Date.now();

        /** @type {number} 1 hour in ms */
        this.switchInterval = 60 * 60 * 1000;

        /** @type {Map<number, number>} life number -> times used */
        this.usageCounts = new Map();

        /** @type {number} total personality selections */
        this.totalSelections = 0;

        this._loadAll();
    }

    /**
     * Reload all personality files from disk (e.g. after editor save).
     * Resets current personality so next getPersonality() picks fresh.
     */
    reload() {
        this.personalities.clear();
        this.goddessForm = null;
        this.current = null;
        this._loadAll();
        logger.info('PersonalityManager reloaded from disk');
    }

    /**
     * Get all loaded personalities (for editor/API). Goddess = life 0, past lives 1-72.
     * @returns {{ lifeNumber: number, filename: string, data: Object }[]}
     */
    getAllForEditor() {
        const out = [];
        if (this.goddessForm) {
            const { _filename, raw, ...rest } = this.goddessForm;
            out.push({ lifeNumber: 0, filename: _filename || '00_goddess.md', data: { type: 'goddess', ...rest } });
        }
        for (const [lifeNum, data] of this.personalities.entries()) {
            const { _filename, raw, ...rest } = data;
            const filename = _filename || `${String(lifeNum).padStart(2, '0')}_unknown.md`;
            out.push({ lifeNumber: lifeNum, filename, data: { type: 'past_life', lifeNumber: String(lifeNum), ...rest } });
        }
        return out.sort((a, b) => a.lifeNumber - b.lifeNumber);
    }

    /**
     * Load all personality .md files from disk
     */
    _loadAll() {
        try {
            if (!fs.existsSync(this.personalityDir)) {
                logger.warn('Personality directory not found, using fallback');
                return;
            }

            const files = fs.readdirSync(this.personalityDir)
                .filter(f => f.endsWith('.md'))
                .sort();

            for (const file of files) {
                const content = fs.readFileSync(
                    path.join(this.personalityDir, file), 'utf8'
                );
                const parsed = this._parseMd(content, file);
                parsed._filename = file;

                if (file === '00_goddess.md') {
                    this.goddessForm = parsed;
                } else {
                    const lifeNum = parseInt(file.split('_')[0], 10);
                    if (!isNaN(lifeNum)) {
                        parsed.lifeNumber = lifeNum;
                        this.personalities.set(lifeNum, parsed);
                        this.usageCounts.set(lifeNum, 0);
                    }
                }
            }

            // Initialize goddess usage
            this.usageCounts.set(0, 0);

            logger.info(`PersonalityManager loaded ${this.personalities.size} past lives + goddess form`);
        } catch (err) {
            logger.error('Error loading personalities:', err.message);
        }
    }

    /**
     * Parse a personality .md file into structured data
     * @param {string} content - Markdown content
     * @param {string} filename - Source filename
     * @returns {Object} Parsed personality data
     */
    _parseMd(content, filename) {
        const data = {
            name: '',
            class: '',
            alignment: '',
            personality: '',
            speechStyle: '',
            tone: 'neutral',
            emojis: ['✨'],
            flavorNotes: [],
            /** @type {{ str: number, dex: number, con: number, wis: number, int: number, cha: number }|null} Pathfinder ability scores (25-point buy default) */
            stats: null,
            /** @type {string[]} Lines used for random daily channel messages ("Name (life#): snippet") */
            memorySnippets: [],
            /** @type {number|null} Birth year (AR); -4363 = Rain of Stars, null = goddess/unknown */
            birthYear: null,
            /** @type {string|null} Generated quote from timeline correlation (Ollama) */
            timelineQuote: null,
            raw: content
        };

        content = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Extract name from first heading
        const nameMatch = content.match(/^# (?:Life \d+: |Goddess Form: )(.+)$/m);
        if (nameMatch) data.name = nameMatch[1].trim();

        // Extract fields
        const classMatch = content.match(/\*\*Class:\*\*\s*(.+)/);
        if (classMatch) data.class = classMatch[1].trim();

        const alignMatch = content.match(/\*\*Alignment:\*\*\s*(.+)/);
        if (alignMatch) data.alignment = alignMatch[1].trim();

        const birthYearMatch = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)|Birth Year:\s*(-?\d+)/i);
        if (birthYearMatch) {
            const y = parseInt(birthYearMatch[1] || birthYearMatch[2], 10);
            if (!isNaN(y)) data.birthYear = y;
        }

        const timelineQuoteSection = content.match(/## Timeline Quote\s*\n([\s\S]*?)(?=\n\s*## |$)/);
        if (timelineQuoteSection) {
            const q = timelineQuoteSection[1].trim();
            if (q.length) data.timelineQuote = q;
        }

        // Extract personality section
        const persMatch = content.match(/## Personality\n([\s\S]*?)(?=\n## |$)/);
        if (persMatch) data.personality = persMatch[1].trim();

        // Extract speech style
        const speechMatch = content.match(/## Speech Style\n([\s\S]*?)(?=\n## |$)/);
        if (speechMatch) data.speechStyle = speechMatch[1].trim();

        // Extract tone
        const toneMatch = content.match(/## Tone\n(.+)/);
        if (toneMatch) data.tone = toneMatch[1].trim();

        // Extract emojis
        const emojiMatch = content.match(/## Preferred Emojis\n(.+)/);
        if (emojiMatch) {
            data.emojis = emojiMatch[1].trim().split(/\s+/).filter(e => e.length > 0);
        }

        // Extract stats (Pathfinder STR, DEX, CON, WIS, INT, CHA); fallback to full content if section match fails
        const getStatFromText = (text, key) => {
            const re = new RegExp(`\\*\\*${key}\\*\\*:\\s*(\\d+)`, 'i');
            const m = text.match(re);
            return m ? parseInt(m[1], 10) : undefined;
        };
        const statsSection = content.match(/## Stats\s*\n([\s\S]*?)(?=\n\s*## |$)/);
        const statsBlock = statsSection ? statsSection[1] : content;
        const str = getStatFromText(statsBlock, 'STR'), dex = getStatFromText(statsBlock, 'DEX'), con = getStatFromText(statsBlock, 'CON');
        const wis = getStatFromText(statsBlock, 'WIS'), int = getStatFromText(statsBlock, 'INT'), cha = getStatFromText(statsBlock, 'CHA');
        if ([str, dex, con, wis, int, cha].some(n => n !== undefined)) {
            data.stats = {
                str: str ?? 10, dex: dex ?? 10, con: con ?? 10,
                wis: wis ?? 10, int: int ?? 10, cha: cha ?? 10
            };
        }

        // Extract memory snippets (for daily "Name (life#): ..." messages)
        const snippetsSection = content.match(/## Memory Snippets\n([\s\S]*?)(?=\n## |$)/);
        if (snippetsSection) {
            const lines = snippetsSection[1].split(/\n/).map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
            if (lines.length) data.memorySnippets = lines;
        }

        return data;
    }

    /**
     * Roll 1d7 (1-7)
     * @returns {number}
     */
    _roll1d7() {
        return Math.floor(Math.random() * 7) + 1;
    }

    /**
     * Check if personality should switch
     * @returns {boolean}
     */
    shouldSwitch() {
        const timeSince = Date.now() - this.lastSwitchTime;
        return this.queriesSinceSwitch >= this.switchThreshold ||
               timeSince >= this.switchInterval;
    }

    /**
     * Select a personality using dynamic weighting
     * Underused personalities get a higher chance.
     * Roll 1-100: 1-71 = past life, 72-100 = goddess form.
     * @param {string} [queryContext] - Optional query for context-aware selection
     * @returns {Object} Selected personality data
     */
    select(queryContext = '') {
        const roll = Math.floor(Math.random() * 100) + 1;

        if (roll >= 72) {
            // Goddess form
            this.usageCounts.set(0, (this.usageCounts.get(0) || 0) + 1);
            this.totalSelections++;
            return {
                type: 'goddess',
                roll,
                ...this.goddessForm
            };
        }

        // Past life: use weighted selection favoring underused personalities
        const candidates = [...this.personalities.entries()];
        if (candidates.length === 0) {
            return this._fallbackPersonality();
        }

        // Calculate weights: inverse of usage count + context bonus
        const avgUsage = this.totalSelections > 0
            ? this.totalSelections / candidates.length
            : 1;

        const weights = candidates.map(([lifeNum, data]) => {
            const usage = this.usageCounts.get(lifeNum) || 0;

            // Base weight: higher for less-used personalities
            let weight = Math.max(1, (avgUsage + 1) - usage) * 10;

            // Context-aware bonus
            if (queryContext) {
                weight += this._contextBonus(data, queryContext);
            }

            return { lifeNum, data, weight };
        });

        // Weighted random selection
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        let rand = Math.random() * totalWeight;

        for (const entry of weights) {
            rand -= entry.weight;
            if (rand <= 0) {
                this.usageCounts.set(entry.lifeNum, (this.usageCounts.get(entry.lifeNum) || 0) + 1);
                this.totalSelections++;
                return {
                    type: 'past_life',
                    roll,
                    lifeNumber: entry.lifeNum.toString(),
                    ...entry.data
                };
            }
        }

        // Fallback: pick first candidate
        const first = candidates[0];
        this.totalSelections++;
        return { type: 'past_life', roll, lifeNumber: first[0].toString(), ...first[1] };
    }

    /**
     * Calculate context bonus for a personality based on query
     * Technical queries boost engineer/wizard types, combat queries boost warriors, etc.
     * @param {Object} data - Personality data
     * @param {string} query - User query
     * @returns {number} Bonus weight
     */
    _contextBonus(data, query) {
        const lower = query.toLowerCase();
        let bonus = 0;

        const techWords = ['code', 'tech', 'build', 'craft', 'repair', 'engineer', 'system'];
        const magicWords = ['spell', 'magic', 'arcane', 'cast', 'enchant', 'ritual'];
        const combatWords = ['fight', 'attack', 'damage', 'weapon', 'armor', 'battle', 'combat'];
        const loreWords = ['history', 'lore', 'story', 'tale', 'legend', 'ancient'];
        const natureWords = ['nature', 'plant', 'animal', 'forest', 'wild', 'druid'];
        const faithWords = ['god', 'divine', 'pray', 'faith', 'holy', 'temple', 'church'];

        const techClasses = ['Engineer', 'Mechanist', 'Technomancer', 'Pilot', 'Tinker'];
        const magicClasses = ['Wizard', 'Sorcerer', 'Magus', 'Witch', 'Occultist'];
        const combatClasses = ['Bloodrager', 'Barbarian', 'Fighter', 'Gunslinger', 'Samurai'];
        const loreClasses = ['Bard', 'Archivist', 'Skald', 'Investigator'];
        const natureClasses = ['Druid', 'Ranger', 'Shaman'];
        const faithClasses = ['Cleric', 'Paladin', 'Warpriest', 'Oracle', 'Inquisitor'];

        if (techWords.some(w => lower.includes(w)) && techClasses.includes(data.class)) bonus += 15;
        if (magicWords.some(w => lower.includes(w)) && magicClasses.includes(data.class)) bonus += 15;
        if (combatWords.some(w => lower.includes(w)) && combatClasses.includes(data.class)) bonus += 15;
        if (loreWords.some(w => lower.includes(w)) && loreClasses.includes(data.class)) bonus += 15;
        if (natureWords.some(w => lower.includes(w)) && natureClasses.includes(data.class)) bonus += 15;
        if (faithWords.some(w => lower.includes(w)) && faithClasses.includes(data.class)) bonus += 15;

        return bonus;
    }

    /**
     * Fallback personality if no .md files loaded
     * @returns {Object}
     */
    _fallbackPersonality() {
        return {
            type: 'default',
            name: 'Casandalee',
            personality: 'Helpful and enthusiastic about D&D, knowledgeable but not condescending.',
            speechStyle: 'Speaks warmly and helpfully.',
            tone: 'neutral',
            emojis: ['✨', '🌟']
        };
    }

    /**
     * Get current personality, switching if threshold met.
     * Increments query counter.
     * @param {string} [queryContext] - Optional query for context-aware selection
     * @returns {Object} Current personality data
     */
    getPersonality(queryContext = '') {
        this.queriesSinceSwitch++;

        if (!this.current || this.shouldSwitch()) {
            this.current = this.select(queryContext);
            this.queriesSinceSwitch = 0;
            this.switchThreshold = this._roll1d7();
            this.lastSwitchTime = Date.now();

            const label = this.current.type === 'goddess'
                ? 'Goddess Form'
                : `Life #${this.current.lifeNumber}: ${this.current.name} (${this.current.class})`;
            logger.info(`Personality switched to: ${label} (next switch in ${this.switchThreshold} queries or 1 hour)`);
        }

        return this.current;
    }

    /**
     * Build a personality prompt fragment for the LLM system prompt.
     * Keeps it lean — just the essential flavor.
     * @param {Object} personality - Personality data from getPersonality()
     * @returns {string} Prompt fragment
     */
    buildPromptFragment(personality) {
        if (!personality) return '';

        if (personality.type === 'goddess') {
            return `\nCURRENT PERSONALITY: Your ascended goddess form. ${personality.personality}\nSpeech style: ${personality.speechStyle || 'Warm, wise, inclusive.'}`;
        }

        if (personality.type === 'past_life') {
            return `\nCURRENT PERSONALITY: You are subtly channeling ${personality.name}, a ${personality.alignment} ${personality.class} from your ${personality.lifeNumber}th life. ${personality.personality}\nSpeech style: ${personality.speechStyle || ''}\nDo NOT announce which personality you are. Just subtly flavor your response.`;
        }

        return '';
    }

    /**
     * Pick a random emoji from the current personality's preferred set
     * @param {Object} [personality] - Personality data (uses current if not provided)
     * @returns {string} Single emoji
     */
    pickEmoji(personality = null) {
        const p = personality || this.current;
        if (!p || !p.emojis || p.emojis.length === 0) return '✨';
        return p.emojis[Math.floor(Math.random() * p.emojis.length)];
    }

    /**
     * Get a random personality for daily messages (independent of switch cycle)
     * @returns {Object} Random personality
     */
    getRandomPersonality() {
        return this.select('');
    }

    /**
     * Get a random past-life personality that has a timeline quote (for daily channel messages).
     * @returns {Object|null} Random personality with timelineQuote, or null if none
     */
    getRandomPersonalityWithTimelineQuote() {
        const withQuote = [...this.personalities.entries()]
            .filter(([, data]) => data.timelineQuote && String(data.timelineQuote).trim().length > 0)
            .map(([lifeNum, data]) => ({ lifeNum, ...data }));
        if (withQuote.length === 0) return null;
        return withQuote[Math.floor(Math.random() * withQuote.length)];
    }

    /**
     * Get usage statistics
     * @returns {Object} Stats
     */
    getStats() {
        const leastUsed = [...this.usageCounts.entries()]
            .filter(([k]) => k !== 0)
            .sort((a, b) => a[1] - b[1])
            .slice(0, 5)
            .map(([k, v]) => {
                const p = this.personalities.get(k);
                return `Life #${k} ${p?.name || '?'}: ${v} uses`;
            });

        const mostUsed = [...this.usageCounts.entries()]
            .filter(([k]) => k !== 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, v]) => {
                const p = this.personalities.get(k);
                return `Life #${k} ${p?.name || '?'}: ${v} uses`;
            });

        return {
            totalPersonalities: this.personalities.size + 1,
            totalSelections: this.totalSelections,
            goddessUses: this.usageCounts.get(0) || 0,
            current: this.current ? (this.current.type === 'goddess' ? 'Goddess' : `Life #${this.current.lifeNumber}: ${this.current.name}`) : 'none',
            leastUsed,
            mostUsed
        };
    }
}

// Singleton
const personalityManager = new PersonalityManager();

module.exports = personalityManager;
