/**
 * Campaign Context System
 * Manages Pathfinder timeline and campaign-specific information
 */

const googleSheetsIntegration = require('./googleSheetsIntegration');

class CampaignContext {
    constructor() {
        this.currentYear = parseInt(process.env.CAMPAIGN_YEAR) || 4717;
        this.currentMonth = process.env.CAMPAIGN_MONTH || 'April';
        this.campaignEvents = [];
        this.playerCharacters = [];
        this.worldState = {};
        this.dynamicDate = null; // Will be set from most recent timeline event
        
        // Initialize Pathfinder timeline context
        this.initializePathfinderTimeline();
    }
    
    /**
     * Initialize Pathfinder timeline context
     */
    initializePathfinderTimeline() {
        this.pathfinderTimeline = {
            // Major historical events up to 4717
            'Age of Lost Omens': {
                start: 4606,
                end: 4717,
                description: 'The current age in Pathfinder, marked by the death of Aroden and the end of prophecy'
            },
            'Earthfall': {
                year: -5293,
                description: 'The destruction of Azlant and Thassilon by falling stars'
            },
            'Rise of Cheliax': {
                year: 4606,
                description: 'Cheliax becomes the dominant power after Aroden\'s death'
            },
            'Worldwound Crisis': {
                start: 4606,
                end: 4716,
                description: 'The demonic invasion through the Worldwound, finally closed in 4716'
            },
            'Golarion': {
                description: 'The main planet where most Pathfinder adventures take place'
            }
        };
        
        // Load campaign-specific timeline from CSV
        this.loadCampaignTimeline();
        
        // Initialize world state
        this.initializeWorldState();
    }
    
    /**
     * Load campaign timeline from CSV file
     */
    loadCampaignTimeline() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const csvPath = path.join(__dirname, '../../pf_folkengames_timeline.csv');
            const csvContent = fs.readFileSync(csvPath, 'utf8');
            const lines = csvContent.split('\n');
            
            this.campaignTimeline = [];
            
            // Skip header row
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                // Parse CSV line (simple parsing, handles quoted fields)
                const fields = this.parseCSVLine(line);
                if (fields.length >= 4) {
                    this.campaignTimeline.push({
                        date: fields[0],
                        location: fields[1],
                        ap: fields[2],
                        description: fields[3]
                    });
                }
            }
            
            console.log(`✅ Loaded ${this.campaignTimeline.length} campaign timeline events`);
            
        } catch (error) {
            console.warn('⚠️  Could not load campaign timeline:', error.message);
            this.campaignTimeline = [];
        }
    }
    
    /**
     * Parse a CSV line handling quoted fields
     * @param {string} line - CSV line to parse
     * @returns {Array} - Array of fields
     */
    parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        fields.push(current.trim());
        return fields;
    }
    
    /**
     * Get campaign timeline events
     * @returns {Array} - Campaign timeline events
     */
    getCampaignTimeline() {
        // Try Google Sheets first, fallback to CSV
        if (googleSheetsIntegration.isAvailable()) {
            return googleSheetsIntegration.getCampaignTimeline();
        }
        return this.campaignTimeline || [];
    }

    /**
     * Calculate current date from most recent timeline event
     * @returns {Object} - Current date object with year and month
     */
    calculateCurrentDate() {
        const timeline = this.getCampaignTimeline();
        
        if (timeline.length === 0) {
            // Fallback to environment variables if no timeline data
            return {
                year: this.currentYear,
                month: this.currentMonth,
                source: 'environment'
            };
        }

        // Find the most recent event by date
        let mostRecentEvent = null;
        let highestDate = -Infinity;

        for (const event of timeline) {
            // Try to parse the date as a number (assuming AR years)
            const dateValue = parseFloat(event.date);
            if (!isNaN(dateValue) && dateValue > highestDate) {
                highestDate = dateValue;
                mostRecentEvent = event;
            }
        }

        if (mostRecentEvent) {
            // Extract year and month from the most recent event
            const currentYear = Math.floor(highestDate);
            const currentMonth = this.extractMonthFromDate(highestDate);
            
            this.dynamicDate = {
                year: currentYear,
                month: currentMonth,
                source: 'timeline',
                lastEvent: mostRecentEvent
            };

            console.log(`📅 Current date updated from timeline: ${currentMonth} ${currentYear} AR (from event: ${mostRecentEvent.description})`);
            
            return this.dynamicDate;
        }

        // Fallback to environment variables
        return {
            year: this.currentYear,
            month: this.currentMonth,
            source: 'environment'
        };
    }

    /**
     * Extract month from a date value
     * @param {number} dateValue - Date value (e.g., 4717.25 for April 4717)
     * @returns {string} - Month name
     */
    extractMonthFromDate(dateValue) {
        const fractionalPart = dateValue - Math.floor(dateValue);
        const monthIndex = Math.floor(fractionalPart * 12);
        
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        return months[monthIndex] || 'April'; // Default to April if calculation fails
    }

    /**
     * Get current campaign date (dynamic or static)
     * @returns {Object} - Current date information
     */
    getCurrentDate() {
        // Always recalculate to get the most recent data
        return this.calculateCurrentDate();
    }
    
    /**
     * Get recent campaign events (last 10)
     * @returns {Array} - Recent events
     */
    getRecentCampaignEvents() {
        if (!this.campaignTimeline || this.campaignTimeline.length === 0) {
            return [];
        }
        
        // Return the last 10 events
        return this.campaignTimeline.slice(-10);
    }
    
    /**
     * Search campaign timeline by location, AP, or description
     * @param {string} searchTerm - Term to search for
     * @returns {Array} - Matching events
     */
    searchCampaignTimeline(searchTerm) {
        // Try Google Sheets first, fallback to CSV
        if (googleSheetsIntegration.isAvailable()) {
            return googleSheetsIntegration.searchCampaignTimeline(searchTerm);
        }
        
        if (!this.campaignTimeline || this.campaignTimeline.length === 0) {
            return [];
        }
        
        const searchLower = searchTerm.toLowerCase();
        
        // Extract individual words from the search term
        const searchWords = searchLower.split(/\s+/).filter(word => word.length > 2);
        
        return this.campaignTimeline.filter(event => {
            const eventText = `${event.location} ${event.ap} ${event.description}`.toLowerCase();
            
            // Check if any search word is found in the event
            return searchWords.some(word => eventText.includes(word));
        });
    }
    
    /**
     * Get events by date range
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Array} - Events in date range
     */
    getEventsByDateRange(startDate, endDate) {
        if (!this.campaignTimeline || this.campaignTimeline.length === 0) {
            return [];
        }
        
        return this.campaignTimeline.filter(event => {
            const eventDate = parseFloat(event.date);
            const start = parseFloat(startDate);
            const end = parseFloat(endDate);
            
            return eventDate >= start && eventDate <= end;
        });
    }
    
    /**
     * Initialize world state
     */
    initializeWorldState() {
        // Current world state as of 4717
        this.worldState = {
            year: this.currentYear,
            month: this.currentMonth,
            majorEvents: [
                'Worldwound closed (4716)',
                'Cheliax remains powerful but faces internal strife',
                'Andoran continues its democratic revolution',
                'Numeria explores technological ruins',
                'The Inner Sea region is relatively stable'
            ],
            activeThreats: [
                'Demon lords still seek influence',
                'Undead threats in Ustalav',
                'Technological dangers in Numeria',
                'Political intrigue in various nations'
            ]
        };
    }
    
    /**
     * Add a campaign event
     * @param {Object} event - Event object with date, description, etc.
     */
    addCampaignEvent(event) {
        this.campaignEvents.push({
            ...event,
            id: Date.now(),
            addedAt: new Date()
        });
        
        // Sort events by date
        this.campaignEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    /**
     * Get campaign events for a specific time period
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Array} - Filtered events
     */
    getCampaignEvents(startDate = null, endDate = null) {
        if (!startDate && !endDate) {
            return this.campaignEvents;
        }
        
        return this.campaignEvents.filter(event => {
            const eventDate = new Date(event.date);
            const start = startDate ? new Date(startDate) : new Date(0);
            const end = endDate ? new Date(endDate) : new Date();
            
            return eventDate >= start && eventDate <= end;
        });
    }
    
    /**
     * Add a player character
     * @param {Object} character - Character information
     */
    addPlayerCharacter(character) {
        this.playerCharacters.push({
            ...character,
            id: Date.now(),
            addedAt: new Date()
        });
    }
    
    /**
     * Get player characters
     * @returns {Array} - Player characters
     */
    getPlayerCharacters() {
        // Try Google Sheets first, fallback to local data
        if (googleSheetsIntegration.isAvailable()) {
            return googleSheetsIntegration.getPlayerCharacters();
        }
        return this.playerCharacters;
    }
    
    /**
     * Get current world state
     * @returns {Object} - Current world state
     */
    getCurrentWorldState() {
        return {
            ...this.worldState,
            campaignEvents: this.campaignEvents,
            playerCharacters: this.playerCharacters
        };
    }
    
    /**
     * Get Pathfinder timeline context
     * @returns {Object} - Timeline information
     */
    getPathfinderTimeline() {
        return this.pathfinderTimeline;
    }
    
    /**
     * Get context for LLM responses
     * @returns {string} - Formatted context string
     */
    getContextForLLM() {
        const context = [];
        
        // Get current date (dynamic from timeline or static from environment)
        const currentDate = this.getCurrentDate();
        context.push(`Current Date: ${currentDate.month} ${currentDate.year} AR (Absalom Reckoning)`);
        
        if (currentDate.source === 'timeline') {
            context.push(`Date Source: Based on most recent timeline event: "${currentDate.lastEvent.description}"`);
        } else {
            context.push(`Date Source: Environment variables (timeline not available)`);
        }
        
        context.push(`World State: ${this.worldState.majorEvents.join(', ')}`);
        
        // Recent campaign timeline events
        const recentTimelineEvents = this.getRecentCampaignEvents();
        if (recentTimelineEvents.length > 0) {
            context.push('Recent Campaign Timeline Events:');
            recentTimelineEvents.forEach(event => {
                context.push(`- ${event.date} (${event.location}): ${event.description}`);
            });
        }
        
        // Recent campaign events (manually added)
        if (this.campaignEvents.length > 0) {
            const recentEvents = this.campaignEvents.slice(-5); // Last 5 events
            context.push('Recent Manual Campaign Events:');
            recentEvents.forEach(event => {
                context.push(`- ${event.date}: ${event.description}`);
            });
        }
        
        // Player characters
        if (this.playerCharacters.length > 0) {
            context.push('Player Characters:');
            this.playerCharacters.forEach(pc => {
                context.push(`- ${pc.name}: ${pc.class} ${pc.level} (${pc.race})`);
            });
        }
        
        // Pathfinder world context
        context.push('Pathfinder World Context:');
        context.push('- The Age of Lost Omens began in 4606 AR with the death of Aroden');
        context.push('- The Worldwound was closed in 4716 AR, ending a major demonic threat');
        context.push('- Golarion is the main planet where adventures take place');
        context.push('- Magic is common but not universal, technology exists alongside magic');
        
        return context.join('\n');
    }
    
    /**
     * Update world state
     * @param {Object} updates - State updates
     */
    updateWorldState(updates) {
        this.worldState = { ...this.worldState, ...updates };
    }
    
    /**
     * Get random world fact
     * @returns {string} - Random fact about the Pathfinder world
     */
    getRandomWorldFact() {
        const facts = [
            'The city of Absalom is built around the Starstone, a meteorite that grants godhood to those who reach its summit.',
            'Cheliax is ruled by House Thrune, who made a pact with devils after Aroden\'s death.',
            'Numeria is a land of technological ruins from a crashed spaceship.',
            'The Worldwound was a portal to the Abyss that was finally closed in 4716 AR.',
            'Andoran is the only democracy in the Inner Sea region.',
            'Ustalav is known for its undead and horror-themed adventures.',
            'The Pathfinder Society explores ancient ruins and lost civilizations.',
            'Magic items are common but expensive, requiring skilled crafters to create.',
            'The Inner Sea is surrounded by various nations with different governments and cultures.',
            'Adventurers often work for the Pathfinder Society or various noble houses.'
        ];
        
        return facts[Math.floor(Math.random() * facts.length)];
    }
}

// Create singleton instance
const campaignContext = new CampaignContext();

module.exports = campaignContext;
