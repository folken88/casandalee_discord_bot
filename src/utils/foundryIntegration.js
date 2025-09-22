/**
 * FoundryVTT Integration Utility
 * Handles communication with FoundryVTT instances for table lookups and data access
 */

const axios = require('axios');

class FoundryIntegration {
    constructor() {
        this.foundryUrl = process.env.FOUNDRY_URL || 'http://localhost:30000';
        this.username = process.env.FOUNDRY_USERNAME;
        this.password = process.env.FOUNDRY_PASSWORD;
        this.sessionToken = null;
    }
    
    /**
     * Authenticate with FoundryVTT
     * @returns {Promise<boolean>} - Success status
     */
    async authenticate() {
        try {
            if (!this.username || !this.password) {
                console.warn('FoundryVTT credentials not provided');
                return false;
            }
            
            const response = await axios.post(`${this.foundryUrl}/api/auth`, {
                username: this.username,
                password: this.password
            });
            
            this.sessionToken = response.data.token;
            console.log('✅ Authenticated with FoundryVTT');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to authenticate with FoundryVTT:', error.message);
            return false;
        }
    }
    
    /**
     * Get all available tables from FoundryVTT
     * @returns {Promise<Array>} - Array of table objects
     */
    async getTables() {
        try {
            if (!this.sessionToken) {
                await this.authenticate();
            }
            
            const response = await axios.get(`${this.foundryUrl}/api/tables`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to fetch tables:', error.message);
            return [];
        }
    }
    
    /**
     * Roll on a specific table
     * @param {string} tableName - Name of the table to roll on
     * @returns {Promise<Object>} - Table roll result
     */
    async rollTable(tableName) {
        try {
            if (!this.sessionToken) {
                await this.authenticate();
            }
            
            const response = await axios.post(`${this.foundryUrl}/api/tables/${tableName}/roll`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error(`❌ Failed to roll on table ${tableName}:`, error.message);
            throw new Error(`Could not roll on table: ${tableName}`);
        }
    }
    
    /**
     * Search for tables by name or description
     * @param {string} searchTerm - Term to search for
     * @returns {Promise<Array>} - Matching tables
     */
    async searchTables(searchTerm) {
        try {
            const tables = await this.getTables();
            const searchLower = searchTerm.toLowerCase();
            
            return tables.filter(table => 
                table.name.toLowerCase().includes(searchLower) ||
                (table.description && table.description.toLowerCase().includes(searchLower))
            );
            
        } catch (error) {
            console.error('❌ Failed to search tables:', error.message);
            return [];
        }
    }
    
    /**
     * Get table contents without rolling
     * @param {string} tableName - Name of the table
     * @returns {Promise<Object>} - Table contents
     */
    async getTableContents(tableName) {
        try {
            if (!this.sessionToken) {
                await this.authenticate();
            }
            
            const response = await axios.get(`${this.foundryUrl}/api/tables/${tableName}`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error(`❌ Failed to get table contents for ${tableName}:`, error.message);
            throw new Error(`Could not access table: ${tableName}`);
        }
    }
    
    /**
     * Get campaign data and context
     * @returns {Promise<Object>} - Campaign information
     */
    async getCampaignData() {
        try {
            if (!this.sessionToken) {
                await this.authenticate();
            }
            
            const response = await axios.get(`${this.foundryUrl}/api/campaign`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to get campaign data:', error.message);
            return null;
        }
    }
    
    /**
     * Get available worlds/systems
     * @returns {Promise<Array>} - Available worlds
     */
    async getWorlds() {
        try {
            if (!this.sessionToken) {
                await this.authenticate();
            }
            
            const response = await axios.get(`${this.foundryUrl}/api/worlds`, {
                headers: {
                    'Authorization': `Bearer ${this.sessionToken}`
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to get worlds:', error.message);
            return [];
        }
    }
    
    /**
     * Test connection to FoundryVTT
     * @returns {Promise<boolean>} - Connection status
     */
    async testConnection() {
        try {
            const response = await axios.get(`${this.foundryUrl}/api/status`, {
                timeout: 5000
            });
            
            return response.status === 200;
            
        } catch (error) {
            console.error('❌ FoundryVTT connection test failed:', error.message);
            return false;
        }
    }
}

// Create singleton instance
const foundryIntegration = new FoundryIntegration();

module.exports = foundryIntegration;


