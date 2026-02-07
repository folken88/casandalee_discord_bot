/**
 * Name Resolver for Casandalee
 * Handles fuzzy name matching for characters, locations, and entities.
 * Players type "Rhy", "rhyarca", "Rhyaerca" — this resolves them all to the same entity.
 */

const logger = require('./logger');

class NameResolver {
    constructor() {
        /** @type {Map<string, string>} - Alias -> canonical name mapping */
        this.aliases = new Map();

        /** @type {Map<string, Set<string>>} - Canonical name -> set of known aliases */
        this.reverseAliases = new Map();

        /** @type {string[]} - List of all canonical names for fuzzy matching */
        this.canonicalNames = [];
    }

    /**
     * Register a canonical name with optional aliases
     * @param {string} canonical - The official/canonical name
     * @param {string[]} [knownAliases=[]] - Known aliases for this name
     */
    register(canonical, knownAliases = []) {
        const lower = canonical.toLowerCase();
        this.aliases.set(lower, canonical);

        if (!this.reverseAliases.has(canonical)) {
            this.reverseAliases.set(canonical, new Set());
        }
        this.reverseAliases.get(canonical).add(lower);

        for (const alias of knownAliases) {
            const aliasLower = alias.toLowerCase();
            this.aliases.set(aliasLower, canonical);
            this.reverseAliases.get(canonical).add(aliasLower);
        }

        if (!this.canonicalNames.includes(canonical)) {
            this.canonicalNames.push(canonical);
        }
    }

    /**
     * Register multiple names at once
     * @param {Array<{name: string, aliases: string[]}>} entries - Name entries
     */
    registerBatch(entries) {
        for (const entry of entries) {
            this.register(entry.name, entry.aliases || []);
        }
    }

    /**
     * Resolve an input string to a canonical name
     * Uses: exact match -> alias lookup -> fuzzy match
     * @param {string} input - User input to resolve
     * @param {number} [threshold=3] - Max edit distance for fuzzy match
     * @returns {string|null} - Canonical name or null if no match
     */
    resolve(input) {
        if (!input || typeof input !== 'string') return null;

        const lower = input.trim().toLowerCase();

        // 1. Exact alias lookup
        if (this.aliases.has(lower)) {
            return this.aliases.get(lower);
        }

        // 2. Prefix match (e.g., "Rhy" matches "Rhyaerca")
        const prefixMatches = this.canonicalNames.filter(
            name => name.toLowerCase().startsWith(lower)
        );
        if (prefixMatches.length === 1) {
            return prefixMatches[0];
        }

        // 3. Substring match (e.g., "tokala" appears in "Tokala Ironfang")
        const substringMatches = this.canonicalNames.filter(
            name => name.toLowerCase().includes(lower)
        );
        if (substringMatches.length === 1) {
            return substringMatches[0];
        }

        // 4. Fuzzy match using Levenshtein distance
        let bestMatch = null;
        let bestDistance = Infinity;
        const maxDistance = Math.max(2, Math.floor(lower.length * 0.4));

        for (const [alias, canonical] of this.aliases.entries()) {
            const dist = this.editDistance(lower, alias);
            if (dist < bestDistance && dist <= maxDistance) {
                bestDistance = dist;
                bestMatch = canonical;
            }
        }

        if (bestMatch) {
            // Auto-learn this alias for next time
            this.aliases.set(lower, bestMatch);
            this.reverseAliases.get(bestMatch)?.add(lower);
            logger.debug(`Name resolver: fuzzy matched "${input}" -> "${bestMatch}" (distance: ${bestDistance})`);
            return bestMatch;
        }

        return null;
    }

    /**
     * Get all known aliases for a canonical name
     * @param {string} canonical - The canonical name
     * @returns {string[]} - Array of aliases
     */
    getAliases(canonical) {
        const aliases = this.reverseAliases.get(canonical);
        return aliases ? [...aliases] : [];
    }

    /**
     * Get all canonical names
     * @returns {string[]} - Array of canonical names
     */
    getAllNames() {
        return [...this.canonicalNames];
    }

    /**
     * Add a learned alias (from user input)
     * @param {string} alias - The alias to learn
     * @param {string} canonical - The canonical name it maps to
     */
    learnAlias(alias, canonical) {
        const lower = alias.toLowerCase();
        this.aliases.set(lower, canonical);
        if (this.reverseAliases.has(canonical)) {
            this.reverseAliases.get(canonical).add(lower);
        }
        logger.debug(`Name resolver: learned alias "${alias}" -> "${canonical}"`);
    }

    /**
     * Calculate Levenshtein edit distance between two strings
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {number} - Edit distance
     */
    editDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b[i - 1] === a[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,       // insertion
                        matrix[i - 1][j] + 1        // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Search for names matching a query (for autocomplete)
     * @param {string} query - Partial input
     * @param {number} [limit=10] - Max results
     * @returns {string[]} - Array of matching canonical names
     */
    search(query, limit = 10) {
        if (!query) return this.canonicalNames.slice(0, limit);

        const lower = query.toLowerCase();
        const results = [];
        const seen = new Set();

        // Exact prefix matches first
        for (const name of this.canonicalNames) {
            if (name.toLowerCase().startsWith(lower) && !seen.has(name)) {
                results.push(name);
                seen.add(name);
            }
        }

        // Then substring matches
        for (const name of this.canonicalNames) {
            if (name.toLowerCase().includes(lower) && !seen.has(name)) {
                results.push(name);
                seen.add(name);
            }
        }

        // Then fuzzy matches
        if (results.length < limit) {
            const fuzzyMatches = this.canonicalNames
                .filter(name => !seen.has(name))
                .map(name => ({
                    name,
                    distance: this.editDistance(lower, name.toLowerCase())
                }))
                .filter(m => m.distance <= Math.max(2, Math.floor(lower.length * 0.4)))
                .sort((a, b) => a.distance - b.distance);

            for (const match of fuzzyMatches) {
                if (results.length >= limit) break;
                if (!seen.has(match.name)) {
                    results.push(match.name);
                    seen.add(match.name);
                }
            }
        }

        return results.slice(0, limit);
    }

    /**
     * Export alias data for persistence
     * @returns {Object} - Serializable alias data
     */
    toJSON() {
        const data = {};
        for (const [canonical, aliases] of this.reverseAliases.entries()) {
            data[canonical] = [...aliases];
        }
        return data;
    }

    /**
     * Import alias data from persistence
     * @param {Object} data - Previously exported alias data
     */
    fromJSON(data) {
        for (const [canonical, aliases] of Object.entries(data)) {
            this.register(canonical, aliases);
        }
    }
}

// Singleton instance
const nameResolver = new NameResolver();

module.exports = nameResolver;
