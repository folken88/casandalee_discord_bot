/**
 * Google Sheets Integration for Casandalee Bot
 * Pulls real-time data from Google Sheets for campaign timeline, characters, etc.
 */

const { google } = require('googleapis');
const logger = require('./logger');

class GoogleSheetsIntegration {
    constructor() {
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.apiKey = process.env.GOOGLE_SHEETS_API_KEY;
        this.refreshInterval = parseInt(process.env.GOOGLE_SHEETS_REFRESH_INTERVAL) || 300000; // 5 minutes default
        
        this.campaignTimeline = [];
        this.playerCharacters = [];
        this.lastRefresh = null;
        this.refreshTimer = null;
        
        this.initialize();
    }
    
    /**
     * Initialize Google Sheets API
     */
    async initialize() {
        try {
            if (!this.apiKey || !this.spreadsheetId) {
                logger.warn('Google Sheets API not configured, falling back to static files');
                return false;
            }
            
            // Initialize Google Sheets API
            this.sheets = google.sheets({ version: 'v4', auth: this.apiKey });
            
            // Load initial data
            await this.refreshData();
            
            // Set up automatic refresh
            this.setupAutoRefresh();
            
            logger.info('✅ Google Sheets integration initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('❌ Failed to initialize Google Sheets integration:', error);
            return false;
        }
    }
    
    /**
     * Setup automatic data refresh
     */
    setupAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(async () => {
            try {
                await this.refreshData();
                logger.debug('Google Sheets data refreshed automatically');
            } catch (error) {
                logger.error('Error during automatic Google Sheets refresh:', error);
            }
        }, this.refreshInterval);
    }
    
    /**
     * Refresh data from Google Sheets
     */
    async refreshData() {
        try {
            if (!this.sheets || !this.spreadsheetId) {
                return false;
            }
            
            logger.info('🔄 Refreshing data from Google Sheets...');
            
            // Load campaign timeline
            await this.loadCampaignTimeline();
            
            // Load player characters
            await this.loadPlayerCharacters();
            
            this.lastRefresh = new Date();
            logger.info(`✅ Google Sheets data refreshed at ${this.lastRefresh.toISOString()}`);
            
            return true;
            
        } catch (error) {
            logger.error('❌ Error refreshing Google Sheets data:', error);
            return false;
        }
    }
    
    /**
     * Load campaign timeline from Google Sheets
     */
    async loadCampaignTimeline() {
        try {
            const range = process.env.GOOGLE_SHEETS_TIMELINE_RANGE || 'Sheet1!A1:D800';
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });
            
            const rows = response.data.values;
            if (!rows || rows.length <= 1) {
                logger.warn('No timeline data found in Google Sheets');
                return;
            }
            
            // Skip header row if it exists, otherwise start from row 0
            this.campaignTimeline = [];
            const startRow = rows[0] && rows[0][0] && rows[0][0].toLowerCase().includes('date') ? 1 : 0;
            
            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i];
                if (row && row.length >= 4 && row[0] && row[0].trim() !== '') {
                    this.campaignTimeline.push({
                        date: row[0] || '',
                        location: row[1] || '',
                        ap: row[2] || '',
                        description: row[3] || ''
                    });
                }
            }
            
            logger.info(`✅ Loaded ${this.campaignTimeline.length} timeline events from Google Sheets`);
            
        } catch (error) {
            logger.error('Error loading campaign timeline from Google Sheets:', error);
        }
    }
    
    /**
     * Load player characters from Google Sheets
     * Note: Since we're using the same sheet for both timeline and characters,
     * this will load characters from the same range but look for different data patterns
     */
    async loadPlayerCharacters() {
        try {
            // For now, we'll use the same sheet but look for character data
            // You might want to create a separate sheet for characters later
            const range = process.env.GOOGLE_SHEETS_CHARACTERS_RANGE || 'Sheet1!A1:D800';
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });
            
            const rows = response.data.values;
            if (!rows || rows.length <= 1) {
                logger.warn('No character data found in Google Sheets');
                return;
            }
            
            // For now, we'll create a simple character list
            // You can modify this to look for specific character data patterns
            this.playerCharacters = [];
            
            // Look for rows that might contain character information
            // This is a placeholder - you might want to create a separate sheet for characters
            logger.info(`✅ Character loading from Google Sheets (using same sheet as timeline)`);
            
        } catch (error) {
            logger.error('Error loading player characters from Google Sheets:', error);
        }
    }
    
    /**
     * Get campaign timeline events
     * @returns {Array} - Campaign timeline events
     */
    getCampaignTimeline() {
        return this.campaignTimeline || [];
    }
    
    /**
     * Get player characters
     * @returns {Array} - Player characters
     */
    getPlayerCharacters() {
        return this.playerCharacters || [];
    }
    
    /**
     * Search campaign timeline
     * @param {string} searchTerm - Search term
     * @returns {Array} - Matching events
     */
    searchCampaignTimeline(searchTerm) {
        if (!this.campaignTimeline || this.campaignTimeline.length === 0) {
            return [];
        }
        
        const searchLower = searchTerm.toLowerCase();
        const searchWords = searchLower.split(/\s+/).filter(word => word.length > 2);
        
        return this.campaignTimeline.filter(event => {
            const eventText = `${event.location} ${event.ap} ${event.description}`.toLowerCase();
            return searchWords.some(word => eventText.includes(word));
        });
    }
    
    /**
     * Get last refresh time
     * @returns {Date|null} - Last refresh time
     */
    getLastRefresh() {
        return this.lastRefresh;
    }
    
    /**
     * Force refresh data
     * @returns {Promise<boolean>} - Success status
     */
    async forceRefresh() {
        logger.info('🔄 Force refreshing Google Sheets data...');
        return await this.refreshData();
    }
    
    /**
     * Check if Google Sheets integration is available
     * @returns {boolean} - Integration status
     */
    isAvailable() {
        return this.sheets !== null && this.spreadsheetId !== null;
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
}

// Create singleton instance
const googleSheetsIntegration = new GoogleSheetsIntegration();

module.exports = googleSheetsIntegration;
