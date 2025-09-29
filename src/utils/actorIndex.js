/**
 * Lightweight Actor Index System
 * Creates a simple text-based index: ActorName|World|DbPath
 * Enables fast lookups with on-demand actor data retrieval from FoundryVTT databases
 */

const fs = require('fs');
const path = require('path');
const { ClassicLevel } = require('classic-level');

class ActorIndex {
    constructor() {
        // In Docker, this will be /foundry/data, locally it can be C:/foundryvttstorage
        this.foundryDataPath = process.env.FOUNDRY_DATA_PATH || 'C:\\foundryvttstorage';
        // FoundryVTT worlds are in Data/worlds subdirectory
        this.worldsPath = path.join(this.foundryDataPath, 'Data', 'worlds');
        this.indexFile = path.join(__dirname, '../../data', 'actor_index.txt');
        this.ensureDataDirectory();
    }

    /**
     * Ensure data directory exists
     */
    ensureDataDirectory() {
        const dataDir = path.dirname(this.indexFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    /**
     * Build lightweight actor index
     * Format: ActorName|World|DbPath
     * Only indexes PC characters (type: 'character')
     */
    async buildIndex() {
        console.log('🔍 Building lightweight actor index...');
        
        const indexEntries = [];
        const worlds = this.getAvailableWorlds();
        
        for (const world of worlds) {
            console.log(`📁 Scanning world: ${world.name}`);
            const worldEntries = await this.indexWorldActors(world);
            indexEntries.push(...worldEntries);
        }
        
        // Save to simple text file
        this.saveIndex(indexEntries);
        
        console.log(`✅ Index built: ${indexEntries.length} PC actors found`);
        return indexEntries;
    }

    /**
     * Get available FoundryVTT worlds
     */
    getAvailableWorlds() {
        const worlds = [];
        
        if (!fs.existsSync(this.worldsPath)) {
            console.warn(`⚠️ FoundryVTT worlds path not found: ${this.worldsPath}`);
            return worlds;
        }
        
        const worldDirs = fs.readdirSync(this.worldsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const worldId of worldDirs) {
            const worldPath = path.join(this.worldsPath, worldId);
            const worldDataPath = path.join(worldPath, 'data');
            
            if (fs.existsSync(worldDataPath)) {
                // Try to get world name from world.json
                const worldJsonPath = path.join(worldDataPath, 'world.json');
                let worldName = worldId; // fallback to ID
                
                if (fs.existsSync(worldJsonPath)) {
                    try {
                        const worldData = JSON.parse(fs.readFileSync(worldJsonPath, 'utf8'));
                        worldName = worldData.title || worldId;
                    } catch (error) {
                        console.warn(`⚠️ Could not parse world.json for ${worldId}:`, error.message);
                    }
                }
                
                worlds.push({
                    id: worldId,
                    name: worldName,
                    path: worldPath,
                    actorsPath: path.join(worldDataPath, 'actors')
                });
            }
        }
        
        return worlds;
    }

    /**
     * Index actors from a specific world
     * Only PC characters (type: 'character')
     */
    async indexWorldActors(world) {
        const entries = [];
        
        if (!fs.existsSync(world.actorsPath)) {
            console.warn(`⚠️ Actors directory not found: ${world.actorsPath}`);
            return entries;
        }
        
        try {
            const db = new ClassicLevel(world.actorsPath, {
                createIfMissing: false,
                errorIfExists: false
            });
            
            try {
                for await (const [key, value] of db.iterator()) {
                    try {
                        const actorData = JSON.parse(value.toString());
                        
                        // Only index PC characters
                        if (actorData.type === 'character' && actorData.name) {
                            const entry = `${actorData.name}|${world.name}|${world.actorsPath}`;
                            entries.push(entry);
                            console.log(`  ✓ Found PC: ${actorData.name}`);
                        }
                    } catch (parseError) {
                        console.warn(`⚠️ Failed to parse actor data for key ${key}:`, parseError.message);
                    }
                }
            } finally {
                await db.close();
            }
            
        } catch (error) {
            console.error(`❌ Failed to index actors from ${world.name}:`, error.message);
        }
        
        return entries;
    }

    /**
     * Save index to simple text file
     * Format: ActorName|World|DbPath
     */
    saveIndex(entries) {
        try {
            // Sort entries alphabetically by actor name
            entries.sort();
            
            // Write to text file
            const content = entries.join('\n');
            fs.writeFileSync(this.indexFile, content, 'utf8');
            
            console.log(`💾 Index saved to: ${this.indexFile}`);
        } catch (error) {
            console.error('❌ Error saving actor index:', error);
        }
    }

    /**
     * Load index from text file
     */
    loadIndex() {
        try {
            if (!fs.existsSync(this.indexFile)) {
                return [];
            }
            
            const content = fs.readFileSync(this.indexFile, 'utf8');
            return content.trim().split('\n').filter(line => line.trim());
            
        } catch (error) {
            console.error('❌ Error loading actor index:', error);
            return [];
        }
    }

    /**
     * Search for actor in index
     * @param {string} actorName - Actor name to search for
     * @returns {Object|null} - Actor info or null if not found
     */
    searchActor(actorName) {
        const index = this.loadIndex();
        
        for (const line of index) {
            const [name, world, dbPath] = line.split('|');
            
            // Case-insensitive search
            if (name.toLowerCase() === actorName.toLowerCase()) {
                return {
                    name: name,
                    world: world,
                    dbPath: dbPath
                };
            }
        }
        
        return null;
    }

    /**
     * Get actor data from FoundryVTT database
     * @param {string} actorName - Actor name
     * @param {string} world - World name
     * @param {string} dbPath - Database path
     * @returns {Object|null} - Actor data or null
     */
    async getActorData(actorName, world, dbPath) {
        try {
            const db = new ClassicLevel(dbPath, {
                createIfMissing: false,
                errorIfExists: false
            });
            
            try {
                // Search for actor by name
                for await (const [key, value] of db.iterator()) {
                    try {
                        const actorData = JSON.parse(value.toString());
                        
                        if (actorData.name && actorData.name.toLowerCase() === actorName.toLowerCase()) {
                            return {
                                id: key.toString(),
                                ...actorData
                            };
                        }
                    } catch (parseError) {
                        console.warn(`⚠️ Failed to parse actor data for key ${key}:`, parseError.message);
                    }
                }
            } finally {
                await db.close();
            }
            
        } catch (error) {
            console.error(`❌ Error retrieving actor data for ${actorName}:`, error);
        }
        
        return null;
    }

    /**
     * Get actor information (stats, inventory, spells, etc.)
     * @param {string} actorName - Actor name
     * @returns {Object|null} - Actor information
     */
    async getActorInfo(actorName) {
        // First, find actor in index
        const actorIndex = this.searchActor(actorName);
        
        if (!actorIndex) {
            return null;
        }
        
        // Get full actor data from database
        const actorData = await this.getActorData(actorName, actorIndex.world, actorIndex.dbPath);
        
        if (!actorData) {
            return null;
        }
        
        return {
            name: actorData.name,
            world: actorIndex.world,
            type: actorData.type,
            system: actorData.system,
            stats: this.extractStats(actorData),
            inventory: this.extractInventory(actorData),
            spells: this.extractSpells(actorData),
            abilities: this.extractAbilities(actorData),
            rawData: actorData // Include raw data for advanced queries
        };
    }

    /**
     * Extract character stats from actor data
     */
    extractStats(actorData) {
        // This will depend on the game system (PF1e, D&D5e, etc.)
        const system = actorData.system;
        
        if (system) {
            return {
                level: system.details?.level || system.details?.level?.value || 'Unknown',
                class: system.details?.class || system.details?.class?.value || 'Unknown',
                race: system.details?.race || system.details?.race?.value || 'Unknown',
                alignment: system.details?.alignment || system.details?.alignment?.value || 'Unknown',
                hitPoints: system.attributes?.hp || system.attributes?.hitPoints || 'Unknown',
                armorClass: system.attributes?.ac || system.attributes?.armorClass || 'Unknown'
            };
        }
        
        return {};
    }

    /**
     * Extract inventory from actor data
     */
    extractInventory(actorData) {
        const items = actorData.items || [];
        
        return items
            .filter(item => item.type === 'equipment' || item.type === 'weapon' || item.type === 'armor')
            .map(item => ({
                name: item.name,
                type: item.type,
                quantity: item.system?.quantity || 1,
                weight: item.system?.weight || 'Unknown',
                value: item.system?.price || item.system?.value || 'Unknown'
            }));
    }

    /**
     * Extract spells from actor data
     */
    extractSpells(actorData) {
        const items = actorData.items || [];
        
        return items
            .filter(item => item.type === 'spell')
            .map(item => ({
                name: item.name,
                level: item.system?.level || 'Unknown',
                school: item.system?.school || 'Unknown',
                prepared: item.system?.prepared || false,
                description: item.system?.description || 'No description available'
            }));
    }

    /**
     * Extract abilities from actor data
     */
    extractAbilities(actorData) {
        const items = actorData.items || [];
        
        return items
            .filter(item => item.type === 'feat' || item.type === 'feature' || item.type === 'ability')
            .map(item => ({
                name: item.name,
                type: item.type,
                description: item.system?.description || 'No description available'
            }));
    }

    /**
     * Check if actor index is available
     */
    isAvailable() {
        return fs.existsSync(this.foundryDataPath) && fs.existsSync(this.worldsPath);
    }
}

module.exports = new ActorIndex();
