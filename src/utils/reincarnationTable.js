/**
 * Reincarnation Table Utility
 * Handles the custom reincarnation table for sea-giant and sahuagin druids
 */

const fs = require('fs');
const path = require('path');
const raceTraits = require('./raceTraits');

class ReincarnationTable {
    constructor() {
        this.tableData = null;
        this.loadTable();
    }
    
    /**
     * Load the reincarnation table from JSON file
     */
    loadTable() {
        try {
            const tablePath = path.join(__dirname, '../../reincarnation_table.json');
            const tableContent = fs.readFileSync(tablePath, 'utf8');
            this.tableData = JSON.parse(tableContent);
            console.log(`✅ Loaded reincarnation table with ${this.tableData.results.length} entries`);
        } catch (error) {
            console.error('❌ Failed to load reincarnation table:', error.message);
            this.tableData = null;
        }
    }
    
    /**
     * Roll on the reincarnation table
     * @returns {Object} - Reincarnation result
     */
    rollReincarnation() {
        if (!this.tableData || !this.tableData.results) {
            throw new Error('Reincarnation table not loaded');
        }
        
        // Roll 1d43 (1-43, but table has 44 entries, so we need to handle this)
        const roll = Math.floor(Math.random() * 43) + 1;
        
        // Find the result that matches the roll
        const result = this.tableData.results.find(entry => 
            entry.range && entry.range[0] <= roll && entry.range[1] >= roll
        );
        
        if (!result) {
            throw new Error(`No reincarnation result found for roll ${roll}`);
        }
        
        // Get race traits from the database
        const raceName = result.description;
        const traitData = raceTraits[raceName] || {
            traits: "No trait data available. Consult GM for racial abilities.",
            srdLink: null
        };
        
        return {
            roll: roll,
            result: raceName,
            originalRoll: roll,
            tableName: this.tableData.name,
            traits: traitData.traits,
            srdLink: traitData.srdLink,
            lore: traitData.lore || null
        };
    }
    
    /**
     * Get all available reincarnation options
     * @returns {Array} - Array of all possible reincarnation results
     */
    getAllOptions() {
        if (!this.tableData || !this.tableData.results) {
            return [];
        }
        
        return this.tableData.results.map(entry => ({
            range: entry.range,
            description: entry.description
        }));
    }
    
    /**
     * Get table information
     * @returns {Object} - Table metadata
     */
    getTableInfo() {
        if (!this.tableData) {
            return null;
        }
        
        return {
            name: this.tableData.name,
            description: this.tableData.description,
            formula: this.tableData.formula,
            totalEntries: this.tableData.results.length,
            isLoaded: true
        };
    }
    
    /**
     * Check if table is loaded and ready
     * @returns {boolean} - Table ready status
     */
    isReady() {
        return this.tableData !== null && this.tableData.results && this.tableData.results.length > 0;
    }
}

// Create singleton instance
const reincarnationTable = new ReincarnationTable();

module.exports = reincarnationTable;

