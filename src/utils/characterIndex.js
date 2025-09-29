/**
 * Lightweight Character Index System
 * Creates and maintains a compact index of character names and their database locations
 * Enables fast name searches with on-demand character data retrieval
 */

const fs = require('fs');
const path = require('path');
const { ClassicLevel } = require('classic-level');
const logger = require('./logger');

class CharacterIndex {
    constructor() {
        this.foundryDataPath = process.env.FOUNDRY_DATA_PATH || '/foundry/data';
        this.worldsPath = path.join(this.foundryDataPath, 'worlds');
        this.indexDir = path.join(__dirname, '../../data/index');
        this.indexFile = path.join(this.indexDir, 'characters.json');
        this.indexMetadataFile = path.join(this.indexDir, 'index_metadata.json');
        this.ensureIndexDirectory();
    }

    /**
     * Ensure index directory exists
     */
    ensureIndexDirectory() {
        try {
            if (!fs.existsSync(this.indexDir)) {
                fs.mkdirSync(this.indexDir, { recursive: true });
                logger.info(`Created character index directory: ${this.indexDir}`);
            }
        } catch (error) {
            logger.error('Error creating index directory:', error);
        }
    }

    /**
     * Get all available worlds from the FoundryVTT data directory
     * @returns {Array} - Array of world objects with name and path
     */
    getAvailableWorlds() {
        try {
            if (!fs.existsSync(this.worldsPath)) {
                logger.warn(`FoundryVTT worlds directory not found: ${this.worldsPath}`);
                return [];
            }

            const worldDirs = fs.readdirSync(this.worldsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            const worlds = [];
            for (const worldDir of worldDirs) {
                const worldPath = path.join(this.worldsPath, worldDir);
                const worldJsonPath = path.join(worldPath, 'world.json');
                
                if (fs.existsSync(worldJsonPath)) {
                    try {
                        const worldData = JSON.parse(fs.readFileSync(worldJsonPath, 'utf8'));
                        worlds.push({
                            id: worldDir,
                            name: worldData.title || worldDir,
                            path: worldPath,
                            system: worldData.system || 'unknown'
                        });
                    } catch (error) {
                        logger.warn(`Failed to read world.json for ${worldDir}:`, error.message);
                    }
                }
            }

            return worlds;
        } catch (error) {
            logger.error('Error getting available worlds:', error);
            return [];
        }
    }

    /**
     * Build character index from all FoundryVTT worlds
     * @param {boolean} force - Force rebuild even if index is fresh
     * @returns {Promise<Array>} - Array of character index entries
     */
    async buildIndex(force = false) {
        try {
            // Check if index is fresh (less than 24 hours old)
            if (!force && this.isIndexFresh()) {
                logger.info('Character index is fresh, loading from file');
                return this.loadIndex();
            }

            logger.info('Building character index from FoundryVTT worlds...');
            
            const worlds = this.getAvailableWorlds();
            const characterIndex = [];

            for (const world of worlds) {
                try {
                    logger.info(`Indexing characters from world: ${world.name} (${world.id})`);
                    const worldCharacters = await this.indexWorldCharacters(world);
                    characterIndex.push(...worldCharacters);
                    logger.info(`Added ${worldCharacters.length} characters from ${world.name}`);
                } catch (error) {
                    logger.warn(`Failed to index world ${world.id}:`, error.message);
                }
            }

            // Save index to file
            this.saveIndex(characterIndex);

            logger.info(`Character index built successfully: ${characterIndex.length} characters indexed`);
            return characterIndex;

        } catch (error) {
            logger.error('Error building character index:', error);
            // Return existing index if available
            return this.loadIndex();
        }
    }

    /**
     * Index characters from a specific world
     * @param {Object} world - World object with id, name, path
     * @returns {Promise<Array>} - Array of character index entries
     */
    async indexWorldCharacters(world) {
        const actorsPath = path.join(world.path, 'data', 'actors');
        const characters = [];

        if (!fs.existsSync(actorsPath)) {
            logger.warn(`Actors directory not found for world ${world.id}: ${actorsPath}`);
            return characters;
        }

        try {
            // Open LevelDB database for actors
            const db = new ClassicLevel(actorsPath, {
                createIfMissing: false,
                errorIfExists: false
            });

            try {
                // Iterate through all key-value pairs in the database
                for await (const [key, value] of db.iterator()) {
                    try {
                        const actorData = JSON.parse(value.toString());
                        const actorId = key.toString();

                        // Only index PC characters (type 'character')
                        if (actorData.type === 'character' && actorData.name) {
                            characters.push({
                                name: actorData.name,
                                worldId: world.id,
                                worldName: world.name,
                                actorId: actorId,
                                system: world.system,
                                dbPath: actorsPath,
                                indexedAt: new Date().toISOString()
                            });
                        }
                    } catch (parseError) {
                        logger.warn(`Failed to parse actor data for key ${key}:`, parseError.message);
                    }
                }
            } finally {
                await db.close();
            }

        } catch (error) {
            logger.error(`Failed to index characters from world ${world.id}:`, error);
        }

        return characters;
    }

    /**
     * Load character index from file
     * @returns {Array} - Array of character index entries
     */
    loadIndex() {
        try {
            if (fs.existsSync(this.indexFile)) {
                const data = fs.readFileSync(this.indexFile, 'utf8');
                const index = JSON.parse(data);
                logger.info(`Loaded character index: ${index.length} characters`);
                return index;
            }
        } catch (error) {
            logger.warn('Error loading character index:', error.message);
        }
        return [];
    }

    /**
     * Save character index to file
     * @param {Array} index - Character index array
     */
    saveIndex(index) {
        try {
            // Create backup if index file exists
            if (fs.existsSync(this.indexFile)) {
                const backupPath = path.join(this.indexDir, `characters_backup_${Date.now()}.json`);
                fs.copyFileSync(this.indexFile, backupPath);
                
                // Remove old backups (keep only last 3)
                this.cleanupOldBackups();
            }

            // Save new index
            fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
            
            // Save metadata
            const metadata = {
                lastUpdate: new Date().toISOString(),
                totalCharacters: index.length,
                version: '1.0.0'
            };
            fs.writeFileSync(this.indexMetadataFile, JSON.stringify(metadata, null, 2));
            
            logger.info(`Character index saved: ${index.length} characters`);
        } catch (error) {
            logger.error('Error saving character index:', error);
        }
    }

    /**
     * Check if character index is fresh (less than 24 hours old)
     * @returns {boolean} - True if index is fresh
     */
    isIndexFresh() {
        try {
            if (fs.existsSync(this.indexMetadataFile)) {
                const metadata = JSON.parse(fs.readFileSync(this.indexMetadataFile, 'utf8'));
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                return new Date(metadata.lastUpdate).getTime() > twentyFourHoursAgo;
            }
        } catch (error) {
            logger.warn('Error checking index freshness:', error.message);
        }
        return false;
    }

    /**
     * Clean up old backup files (keep only last 3)
     */
    cleanupOldBackups() {
        try {
            const files = fs.readdirSync(this.indexDir)
                .filter(file => file.startsWith('characters_backup_') && file.endsWith('.json'))
                .sort()
                .reverse(); // Newest first

            // Remove all but the newest 3
            for (let i = 3; i < files.length; i++) {
                const filePath = path.join(this.indexDir, files[i]);
                fs.unlinkSync(filePath);
                logger.info(`Removed old backup: ${files[i]}`);
            }
        } catch (error) {
            logger.warn('Error cleaning up old backups:', error.message);
        }
    }

    /**
     * Search for characters by name
     * @param {string} searchTerm - Search term
     * @returns {Array} - Matching character index entries
     */
    searchCharacters(searchTerm) {
        try {
            const index = this.loadIndex();
            const term = searchTerm.toLowerCase();
            
            return index.filter(character => 
                character.name.toLowerCase().includes(term)
            );
        } catch (error) {
            logger.error('Error searching characters:', error);
            return [];
        }
    }

    /**
     * Get character by exact name
     * @param {string} name - Character name
     * @returns {Object|null} - Character index entry or null
     */
    getCharacterByName(name) {
        try {
            const index = this.loadIndex();
            return index.find(character => 
                character.name.toLowerCase() === name.toLowerCase()
            ) || null;
        } catch (error) {
            logger.error('Error getting character by name:', error);
            return null;
        }
    }

    /**
     * Get detailed character data on-demand
     * @param {Object} characterEntry - Character index entry
     * @returns {Promise<Object|null>} - Full character data or null
     */
    async getCharacterDetails(characterEntry) {
        try {
            const { ClassicLevel } = require('classic-level');
            const db = new ClassicLevel(characterEntry.dbPath, {
                createIfMissing: false,
                errorIfExists: false
            });

            try {
                const actorData = await db.get(characterEntry.actorId);
                if (actorData) {
                    const parsed = JSON.parse(actorData.toString());
                    return {
                        ...characterEntry,
                        ...parsed
                    };
                }
            } finally {
                await db.close();
            }

            return null;
        } catch (error) {
            logger.error(`Error getting character details for ${characterEntry.name}:`, error);
            return null;
        }
    }

    /**
     * Get index statistics
     * @returns {Object} - Index statistics
     */
    getIndexStats() {
        try {
            const index = this.loadIndex();
            const worlds = [...new Set(index.map(char => char.worldId))];
            
            return {
                totalCharacters: index.length,
                totalWorlds: worlds.length,
                worlds: worlds,
                lastUpdate: this.getLastUpdate(),
                indexFile: this.indexFile,
                indexSize: this.getIndexSize()
            };
        } catch (error) {
            logger.error('Error getting index stats:', error);
            return { totalCharacters: 0, totalWorlds: 0, worlds: [] };
        }
    }

    /**
     * Get last update time
     * @returns {string|null} - Last update timestamp
     */
    getLastUpdate() {
        try {
            if (fs.existsSync(this.indexMetadataFile)) {
                const metadata = JSON.parse(fs.readFileSync(this.indexMetadataFile, 'utf8'));
                return metadata.lastUpdate;
            }
        } catch (error) {
            logger.warn('Error getting last update:', error.message);
        }
        return null;
    }

    /**
     * Get index file size
     * @returns {string} - Formatted file size
     */
    getIndexSize() {
        try {
            if (fs.existsSync(this.indexFile)) {
                const stats = fs.statSync(this.indexFile);
                const bytes = stats.size;
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            }
        } catch (error) {
            logger.warn('Error getting index size:', error.message);
        }
        return 'Unknown';
    }
}

// Create singleton instance
const characterIndex = new CharacterIndex();

module.exports = characterIndex;



