/**
 * Google Sheets Integration for Casandalee Bot
 * Pulls real-time data from Google Sheets for campaign timeline, characters, etc.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class GoogleSheetsIntegration {
    constructor() {
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.apiKey = process.env.GOOGLE_SHEETS_API_KEY;
        this.refreshInterval = parseInt(process.env.GOOGLE_SHEETS_REFRESH_INTERVAL) || 86400000; // Once daily default
        
        this.campaignTimeline = [];
        this.playerCharacters = [];
        this.lastRefresh = null;
        this.refreshTimer = null;

        /** @type {number} - Previous event count for change detection */
        this.previousEventCount = 0;

        /** @type {Function|null} - Callback for new event notifications */
        this.onNewEventsCallback = null;
        
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
            
            // Sync timeline to Obsidian vault
            this.syncTimelineToVault();

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

            // Detect new events
            if (this.previousEventCount > 0 && this.campaignTimeline.length > this.previousEventCount) {
                const newEvents = this.campaignTimeline.slice(this.previousEventCount);
                logger.info(`📢 Detected ${newEvents.length} new timeline events!`);

                if (this.onNewEventsCallback && newEvents.length > 0) {
                    try {
                        this.onNewEventsCallback(newEvents);
                    } catch (callbackError) {
                        logger.error('Error in new events callback:', callbackError);
                    }
                }
            }
            this.previousEventCount = this.campaignTimeline.length;
            
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
     * Set callback for when new timeline events are detected
     * @param {Function} callback - Function receiving array of new events
     */
    onNewEvents(callback) {
        this.onNewEventsCallback = callback;
    }

    /**
     * Sync timeline events to Obsidian vault as per-campaign markdown files.
     * Creates one file per campaign code (IG, SS, CC, HV, HR, IS).
     */
    syncTimelineToVault() {
        try {
            const vaultDir = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault');
            const timelineDir = path.join(vaultDir, 'Timeline');
            if (!fs.existsSync(timelineDir)) fs.mkdirSync(timelineDir, { recursive: true });

            if (!this.campaignTimeline || this.campaignTimeline.length === 0) return;

            const CAMPAIGN_NAMES = {
                IG: 'Iron Gods', SS: 'Skull & Shackles', CC: 'Carrion Crown',
                HV: 'Hells Vengeance', HR: 'Hells Rebels', IS: 'Inner Sea (Shared)'
            };

            // Group events by campaign code
            // JG (Justice Gorls) merges into CC (Carrion Crown) — same region, 10 years earlier
            const byCampaign = {};
            for (const event of this.campaignTimeline) {
                let code = (event.ap || 'IS').toUpperCase();
                if (code === 'JG') code = 'CC'; // Justice Gorls is CC prequel content
                if (!byCampaign[code]) byCampaign[code] = [];
                byCampaign[code].push(event);
            }

            let totalWritten = 0;
            for (const [code, events] of Object.entries(byCampaign)) {
                const name = CAMPAIGN_NAMES[code] || code;
                const filePath = path.join(timelineDir, `${code}_timeline.md`);

                // Sort by date
                events.sort((a, b) => {
                    const da = parseFloat(a.date) || 0;
                    const db = parseFloat(b.date) || 0;
                    return da - db;
                });

                let md = `---
title: "${name} Timeline"
type: timeline
campaign: "${code}"
campaignName: "${name}"
eventCount: ${events.length}
lastSync: "${new Date().toISOString()}"
tags: ["timeline", "${code.toLowerCase()}"]
---

# ${name} Timeline

*Synced from Google Sheets — ${events.length} events. This file is authoritative for dated campaign events.*

| Date | Location | Event |
|------|----------|-------|
`;
                for (const e of events) {
                    const desc = (e.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
                    const loc = (e.location || '').replace(/\|/g, '\\|');
                    md += `| ${e.date} | ${loc} | ${desc} |\n`;
                }

                fs.writeFileSync(filePath, md, 'utf8');
                totalWritten += events.length;
            }

            logger.info(`✅ Timeline synced to vault: ${Object.keys(byCampaign).length} campaign files, ${totalWritten} total events`);
        } catch (err) {
            logger.error('Error syncing timeline to vault:', err.message);
        }
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
