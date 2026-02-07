/**
 * Timeline Cache for Casandalee
 * Pre-processes timeline data into an indexed, cached format.
 * Updates daily at 6 AM (before daily announcement) or on-demand.
 * Builds keyword, character, and location indexes for fast lookup.
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('./logger');
const googleSheetsIntegration = require('./googleSheetsIntegration');
const nameResolver = require('./nameResolver');

class TimelineCache {
    constructor() {
        this.cacheDir = path.join(__dirname, '../../data/cache');
        this.cacheFile = path.join(this.cacheDir, 'timeline_cache.json');

        /** @type {Array} - Raw timeline events */
        this.events = [];

        /** @type {Map<string, Set<number>>} - Keyword -> event indices */
        this.keywordIndex = new Map();

        /** @type {Map<string, Set<number>>} - Character name -> event indices */
        this.characterIndex = new Map();

        /** @type {Map<string, Set<number>>} - Location -> event indices */
        this.locationIndex = new Map();

        /** @type {Date|null} - Last cache build time */
        this.lastBuild = null;

        /** @type {Object|null} - Cron job reference */
        this.cronJob = null;

        /** @type {number|null} - Previous event count for change detection */
        this.previousEventCount = null;

        this._ensureDirectoryExists();
        this._loadCache();
    }

    /**
     * Ensure the cache directory exists
     */
    _ensureDirectoryExists() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Load cached data from disk
     */
    _loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const raw = fs.readFileSync(this.cacheFile, 'utf8');
                const cached = JSON.parse(raw);
                this.events = cached.events || [];
                this.lastBuild = cached.lastBuild ? new Date(cached.lastBuild) : null;
                this.previousEventCount = cached.previousEventCount || null;

                // Rebuild indexes from cached events
                this._buildIndexes();
                logger.info(`Loaded timeline cache: ${this.events.length} events, built at ${this.lastBuild}`);
            }
        } catch (err) {
            logger.error('Error loading timeline cache:', err.message);
        }
    }

    /**
     * Save cache to disk
     */
    _saveCache() {
        try {
            const data = {
                events: this.events,
                lastBuild: this.lastBuild?.toISOString(),
                previousEventCount: this.previousEventCount
            };
            fs.writeFileSync(this.cacheFile, JSON.stringify(data), 'utf8');
            logger.debug('Timeline cache saved to disk');
        } catch (err) {
            logger.error('Error saving timeline cache:', err.message);
        }
    }

    /**
     * Build all indexes from the current events array
     */
    _buildIndexes() {
        this.keywordIndex.clear();
        this.characterIndex.clear();
        this.locationIndex.clear();

        // Common stop words to skip
        const stopWords = new Set([
            'the', 'a', 'an', 'in', 'on', 'at', 'of', 'to', 'for', 'and', 'or',
            'is', 'are', 'was', 'were', 'be', 'been', 'has', 'had', 'have', 'with',
            'by', 'from', 'they', 'them', 'their', 'this', 'that', 'which', 'who',
            'its', 'but', 'not', 'all', 'into', 'also', 'more', 'than', 'about'
        ]);

        for (let i = 0; i < this.events.length; i++) {
            const event = this.events[i];

            // Index by location
            if (event.location) {
                const locLower = event.location.toLowerCase().trim();
                if (!this.locationIndex.has(locLower)) {
                    this.locationIndex.set(locLower, new Set());
                }
                this.locationIndex.get(locLower).add(i);
            }

            // Index by keywords from description
            if (event.description) {
                const words = event.description.toLowerCase()
                    .replace(/[^a-z0-9\s'-]/g, ' ')
                    .split(/\s+/)
                    .filter(w => w.length > 2 && !stopWords.has(w));

                for (const word of words) {
                    if (!this.keywordIndex.has(word)) {
                        this.keywordIndex.set(word, new Set());
                    }
                    this.keywordIndex.get(word).add(i);
                }

                // Also index capitalized words as potential character names
                const properNouns = event.description.match(/[A-Z][a-z]{2,}/g) || [];
                for (const noun of properNouns) {
                    const lower = noun.toLowerCase();
                    if (!this.characterIndex.has(lower)) {
                        this.characterIndex.set(lower, new Set());
                    }
                    this.characterIndex.get(lower).add(i);
                }
            }
        }

        logger.debug(`Timeline indexes built: ${this.keywordIndex.size} keywords, ${this.characterIndex.size} characters, ${this.locationIndex.size} locations`);
    }

    /**
     * Rebuild the cache from Google Sheets data
     * @returns {Promise<{newEvents: Array, totalEvents: number}>} - Build result
     */
    async rebuild() {
        logger.info('Rebuilding timeline cache...');

        try {
            // Force refresh from Google Sheets
            if (googleSheetsIntegration.isAvailable()) {
                await googleSheetsIntegration.forceRefresh();
            }

            const rawTimeline = googleSheetsIntegration.getCampaignTimeline();

            if (!rawTimeline || rawTimeline.length === 0) {
                logger.warn('No timeline data available for cache rebuild');
                return { newEvents: [], totalEvents: this.events.length };
            }

            // Detect new events by comparing counts
            const oldCount = this.previousEventCount || 0;
            const newEvents = rawTimeline.length > oldCount
                ? rawTimeline.slice(oldCount)
                : [];

            // Update events
            this.events = rawTimeline.map(event => ({
                date: event.date || '',
                location: event.location || '',
                ap: event.ap || '',
                description: event.description || ''
            }));

            this.previousEventCount = this.events.length;
            this.lastBuild = new Date();

            // Rebuild indexes
            this._buildIndexes();

            // Save to disk
            this._saveCache();

            logger.info(`Timeline cache rebuilt: ${this.events.length} events (${newEvents.length} new)`);

            return { newEvents, totalEvents: this.events.length };
        } catch (err) {
            logger.error('Error rebuilding timeline cache:', err.message);
            return { newEvents: [], totalEvents: this.events.length };
        }
    }

    /**
     * Start the 6 AM daily cron job
     * @param {Function} [onNewEvents] - Callback when new events are detected
     */
    startCron(onNewEvents = null) {
        // Run at 6:00 AM daily
        this.cronJob = cron.schedule('0 6 * * *', async () => {
            logger.info('Running scheduled timeline cache rebuild (6 AM)');
            const result = await this.rebuild();

            if (result.newEvents.length > 0 && onNewEvents) {
                onNewEvents(result.newEvents);
            }
        });

        logger.info('Timeline cache cron job scheduled for 6:00 AM daily');
    }

    /**
     * Stop the cron job
     */
    stopCron() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }
    }

    /**
     * Search timeline using the index (fast path)
     * @param {string} query - Search query
     * @returns {Array} - Matching events sorted by relevance
     */
    search(query) {
        if (!query || this.events.length === 0) return [];

        const lower = query.toLowerCase();
        const words = lower.split(/\s+/).filter(w => w.length > 2);
        const scores = new Map(); // event index -> score

        for (const word of words) {
            // Check keyword index
            const keywordHits = this.keywordIndex.get(word);
            if (keywordHits) {
                for (const idx of keywordHits) {
                    scores.set(idx, (scores.get(idx) || 0) + 10);
                }
            }

            // Check character index
            const charHits = this.characterIndex.get(word);
            if (charHits) {
                for (const idx of charHits) {
                    scores.set(idx, (scores.get(idx) || 0) + 20);
                }
            }

            // Check location index
            for (const [loc, indices] of this.locationIndex.entries()) {
                if (loc.includes(word)) {
                    for (const idx of indices) {
                        scores.set(idx, (scores.get(idx) || 0) + 15);
                    }
                }
            }
        }

        // Also try name resolver for character queries
        const resolved = nameResolver.resolve(lower);
        if (resolved) {
            const resolvedLower = resolved.toLowerCase();
            const resolvedHits = this.characterIndex.get(resolvedLower);
            if (resolvedHits) {
                for (const idx of resolvedHits) {
                    scores.set(idx, (scores.get(idx) || 0) + 30);
                }
            }
        }

        // Sort by score descending
        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([idx, score]) => ({
                ...this.events[idx],
                score
            }));
    }

    /**
     * Get events mentioning a specific character
     * @param {string} characterName - Character name
     * @returns {Array} - Matching events
     */
    getCharacterEvents(characterName) {
        const lower = characterName.toLowerCase();
        const indices = this.characterIndex.get(lower) || new Set();
        return [...indices].map(idx => this.events[idx]);
    }

    /**
     * Get events at a specific location
     * @param {string} location - Location name
     * @returns {Array} - Matching events
     */
    getLocationEvents(location) {
        const lower = location.toLowerCase();
        const results = [];

        for (const [loc, indices] of this.locationIndex.entries()) {
            if (loc.includes(lower)) {
                for (const idx of indices) {
                    results.push(this.events[idx]);
                }
            }
        }

        return results;
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getStats() {
        return {
            totalEvents: this.events.length,
            keywords: this.keywordIndex.size,
            characters: this.characterIndex.size,
            locations: this.locationIndex.size,
            lastBuild: this.lastBuild?.toISOString() || 'never'
        };
    }

    /**
     * Generate a compact context string for LLM (recent events only)
     * @param {number} [limit=20] - Max events to include
     * @returns {string} - Compact context
     */
    getCompactContext(limit = 20) {
        const recent = this.events.slice(-limit);
        return recent.map(e => `${e.date} [${e.location}]: ${e.description}`).join('\n');
    }
}

// Singleton instance
const timelineCache = new TimelineCache();

module.exports = timelineCache;
