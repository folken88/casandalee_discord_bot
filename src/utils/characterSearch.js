/**
 * Character Search Utility
 * Provides character search functionality using the lightweight character index
 */

const characterIndex = require('./characterIndex');
const logger = require('./logger');

class CharacterSearch {
    constructor() {
        this.characterIndex = characterIndex;
    }

    /**
     * Search for characters by name
     * @param {string} searchTerm - Search term
     * @returns {Promise<Array>} - Matching character index entries
     */
    async searchCharacters(searchTerm) {
        try {
            // Ensure index is built
            await this.characterIndex.buildIndex();
            
            // Search the index
            const results = this.characterIndex.searchCharacters(searchTerm);
            
            logger.info(`Character search for "${searchTerm}" returned ${results.length} results`);
            return results;
            
        } catch (error) {
            logger.error('Error searching characters:', error);
            return [];
        }
    }

    /**
     * Get character by exact name
     * @param {string} name - Character name
     * @returns {Promise<Object|null>} - Character index entry or null
     */
    async getCharacterByName(name) {
        try {
            // Ensure index is built
            await this.characterIndex.buildIndex();
            
            return this.characterIndex.getCharacterByName(name);
            
        } catch (error) {
            logger.error(`Error getting character "${name}":`, error);
            return null;
        }
    }

    /**
     * Get detailed character data
     * @param {string} name - Character name
     * @returns {Promise<Object|null>} - Full character data or null
     */
    async getCharacterDetails(name) {
        try {
            // Get character from index
            const characterEntry = await this.getCharacterByName(name);
            if (!characterEntry) {
                return null;
            }

            // Get detailed data on-demand
            const details = await this.characterIndex.getCharacterDetails(characterEntry);
            
            if (details) {
                logger.info(`Retrieved detailed data for character: ${name}`);
            }
            
            return details;
            
        } catch (error) {
            logger.error(`Error getting character details for "${name}":`, error);
            return null;
        }
    }

    /**
     * Get all characters (from index)
     * @param {boolean} forceRefresh - Force refresh index
     * @returns {Promise<Array>} - Array of character index entries
     */
    async getAllCharacters(forceRefresh = false) {
        try {
            return await this.characterIndex.buildIndex(forceRefresh);
        } catch (error) {
            logger.error('Error getting all characters:', error);
            return [];
        }
    }

    /**
     * Get character index statistics
     * @returns {Object} - Index statistics
     */
    getIndexStats() {
        return this.characterIndex.getIndexStats();
    }

    /**
     * Force rebuild character index
     * @returns {Promise<Array>} - Updated character index
     */
    async rebuildIndex() {
        try {
            logger.info('Force rebuilding character index...');
            return await this.characterIndex.buildIndex(true);
        } catch (error) {
            logger.error('Error rebuilding character index:', error);
            return [];
        }
    }

    /**
     * Check if character search is available
     * @returns {boolean} - True if FoundryVTT data is accessible
     */
    isAvailable() {
        try {
            const worlds = this.characterIndex.getAvailableWorlds();
            return worlds.length > 0;
        } catch (error) {
            logger.warn('Character search not available:', error.message);
            return false;
        }
    }
}

// Create singleton instance
const characterSearch = new CharacterSearch();

module.exports = characterSearch;



