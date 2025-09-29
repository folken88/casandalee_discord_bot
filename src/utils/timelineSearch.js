/**
 * Enhanced Timeline Search System
 * Provides intelligent search and filtering for campaign timeline data
 */

const fs = require('fs');
const path = require('path');
const googleSheetsIntegration = require('./googleSheetsIntegration');
const logger = require('./logger');

class TimelineSearch {
    constructor() {
        this.csvPath = path.join(__dirname, '../../pf_folkengames_timeline.csv');
        this.timeline = [];
        this.initialize();
    }

    /**
     * Initialize timeline data
     */
    async initialize() {
        try {
            // Try Google Sheets first, fallback to CSV
            if (googleSheetsIntegration.isAvailable()) {
                // Wait for Google Sheets to load if it's still loading
                await this.waitForGoogleSheets();
            } else {
                this.loadFromCSV();
            }
        } catch (error) {
            logger.error('Error initializing timeline search:', error);
            this.timeline = [];
        }
    }

    /**
     * Wait for Google Sheets to load and then process the data
     */
    async waitForGoogleSheets() {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            const rawTimeline = googleSheetsIntegration.getCampaignTimeline();
            
            if (rawTimeline && rawTimeline.length > 0) {
                // Add parsedDate field to Google Sheets data
                this.timeline = rawTimeline.map(event => ({
                    ...event,
                    parsedDate: this.parseDate(event.date)
                }));
                logger.info(`Loaded ${this.timeline.length} timeline events from Google Sheets`);
                return;
            }
            
            // Wait 500ms before trying again
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        // If Google Sheets didn't load, fallback to CSV
        logger.warn('Google Sheets did not load in time, falling back to CSV');
        this.loadFromCSV();
    }

    /**
     * Load timeline from CSV file
     */
    loadFromCSV() {
        try {
            if (!fs.existsSync(this.csvPath)) {
                logger.warn(`Timeline CSV file not found: ${this.csvPath}`);
                return;
            }

            const csvContent = fs.readFileSync(this.csvPath, 'utf8');
            const lines = csvContent.split('\n');
            
            this.timeline = [];
            
            // Skip header row
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const fields = this.parseCSVLine(line);
                if (fields.length >= 4) {
                    this.timeline.push({
                        date: fields[0],
                        location: fields[1],
                        ap: fields[2],
                        description: fields[3],
                        parsedDate: this.parseDate(fields[0])
                    });
                }
            }
            
            logger.info(`✅ Loaded ${this.timeline.length} timeline events from CSV`);
            
        } catch (error) {
            logger.error('Error loading timeline from CSV:', error);
            this.timeline = [];
        }
    }

    /**
     * Parse CSV line handling quoted fields
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
     * Parse date string to number
     * @param {string} dateStr - Date string (e.g., "4707.00", "-1,293.00", "0499.00.00")
     * @returns {number} - Parsed date as number
     */
    parseDate(dateStr) {
        if (!dateStr) return 0;
        
        // Remove quotes and clean up the date string
        let cleanDate = dateStr.replace(/"/g, '').replace(/,/g, '');
        
        // Handle different date formats
        if (cleanDate.includes('.')) {
            // Split by dots and take the first part (year)
            const parts = cleanDate.split('.');
            const yearPart = parts[0];
            
            // Remove leading zeros but preserve negative sign
            if (yearPart.startsWith('-')) {
                return parseFloat(yearPart);
            } else {
                return parseFloat(yearPart);
            }
        }
        
        return parseFloat(cleanDate) || 0;
    }

    /**
     * Enhanced timeline search with intelligent filtering
     * @param {string} query - Search query
     * @returns {Array} - Filtered and ranked results
     */
    search(query) {
        try {
            const lowerQuery = query.toLowerCase();
            
            // Extract potential year from query
            const yearMatch = lowerQuery.match(/(\d{4})/);
            const targetYear = yearMatch ? parseInt(yearMatch[1]) : null;
            
            // Extract location from query
            const locationMatch = this.extractLocation(lowerQuery);
            
            // Extract other keywords
            const keywords = this.extractKeywords(lowerQuery);
            
            logger.info(`Timeline search: year=${targetYear}, location=${locationMatch}, keywords=[${keywords.join(', ')}]`);
            
            // Filter and score results
            const results = this.timeline.map(event => {
                const score = this.calculateRelevanceScore(event, targetYear, locationMatch, keywords);
                return { ...event, score };
            })
            .filter(event => event.score > 0)
            .sort((a, b) => b.score - a.score);
            
            logger.info(`Found ${results.length} relevant timeline events`);
            return results;
            
        } catch (error) {
            logger.error('Error in timeline search:', error);
            return [];
        }
    }

    /**
     * Extract location from query
     * @param {string} query - Lowercase query
     * @returns {string|null} - Extracted location
     */
    extractLocation(query) {
        const locations = [
            'ustalav', 'absalom', 'cheliax', 'andoran', 'taldor', 'numeria',
            'geb', 'nex', 'kyonin', 'galt', 'isger', 'molthune', 'nirmathas',
            'razmiran', 'thuvia', 'qadira', 'katapesh', 'osirion', 'thuvia',
            'varisia', 'mendev', 'brevoy', 'irrisen', 'hold of belkzen',
            'realm of mammoth lords', 'lands of linnorm kings'
        ];
        
        for (const location of locations) {
            if (query.includes(location)) {
                return location;
            }
        }
        
        return null;
    }

    /**
     * Check if an event location matches the target location (including sub-locations)
     * @param {string} eventLocation - Event location
     * @param {string} targetLocation - Target location from query
     * @returns {boolean} - Whether the locations match
     */
    isLocationMatch(eventLocation, targetLocation) {
        const eventLoc = eventLocation.toLowerCase();
        const targetLoc = targetLocation.toLowerCase();
        
        // Direct match
        if (eventLoc.includes(targetLoc)) {
            return true;
        }
        
        // Location mapping - cities/regions within larger areas
        const locationMap = {
            'ustalav': ['caliphas', 'lepistadt', 'carrion hill', 'ravengro', 'tamrivena', 'caliphas', 'ustalav'],
            'cheliax': ['westcrown', 'kintargo', 'pezzack', 'oppara'],
            'andoran': ['almas', 'falcon\'s hollow', 'candlestone'],
            'taldor': ['oppara', 'cassomir', 'zimar'],
            'numeria': ['starfall', 'torch', 'scrapwall'],
            'varisia': ['magnimar', 'sandpoint', 'korvosa'],
            'mendev': ['kenabres', 'drezen', 'nethys']
        };
        
        // Check if target location has sub-locations
        if (locationMap[targetLoc]) {
            return locationMap[targetLoc].some(loc => eventLoc.includes(loc));
        }
        
        return false;
    }

    /**
     * Extract keywords from query
     * @param {string} query - Lowercase query
     * @returns {Array} - Array of keywords
     */
    extractKeywords(query) {
        // Remove common words and extract meaningful terms
        const stopWords = ['what', 'happened', 'in', 'the', 'year', 'when', 'did', 'where', 'was', 'who', 'is', 'are'];
        const words = query.split(/\s+/).filter(word => 
            word.length > 2 && !stopWords.includes(word) && !word.match(/^\d+$/)
        ).map(word => word.replace(/[?!.,]/g, '')); // Remove punctuation
        
        return words;
    }

    /**
     * Calculate relevance score for an event
     * @param {Object} event - Timeline event
     * @param {number|null} targetYear - Target year
     * @param {string|null} targetLocation - Target location
     * @param {Array} keywords - Search keywords
     * @returns {number} - Relevance score
     */
    calculateRelevanceScore(event, targetYear, targetLocation, keywords) {
        let score = 0;
        
        // Year matching (highest priority)
        if (targetYear && event.parsedDate) {
            const yearDiff = Math.abs(event.parsedDate - targetYear);
            if (yearDiff === 0) {
                score += 100; // Exact year match
            } else if (yearDiff <= 1) {
                score += 80; // Within 1 year
            } else if (yearDiff <= 5) {
                score += 60; // Within 5 years
            } else if (yearDiff <= 10) {
                score += 40; // Within 10 years
            } else if (yearDiff <= 50) {
                score += 20; // Within 50 years
            }
        }
        
        // Location matching
        if (targetLocation && event.location) {
            if (this.isLocationMatch(event.location, targetLocation)) {
                score += 50;
            }
        }
        
        // Keyword matching in description
        if (keywords.length > 0 && event.description) {
            const eventText = event.description.toLowerCase();
            
            // Check for exact phrase matches (much higher score)
            const queryPhrase = keywords.join(' ');
            if (eventText.includes(queryPhrase)) {
                score += 200; // Very high score for exact phrase match
            }
            
            // Check for phrase with "of" (e.g., "queen of skanktown")
            const queryPhraseWithOf = keywords.join(' of ');
            if (eventText.includes(queryPhraseWithOf)) {
                score += 200; // Very high score for exact phrase match with "of"
            }
            
            // Check for individual keyword matches
            keywords.forEach(keyword => {
                if (eventText.includes(keyword)) {
                    score += 10;
                }
            });
        }
        
        // Keyword matching in location
        if (keywords.length > 0 && event.location) {
            const eventLocation = event.location.toLowerCase();
            keywords.forEach(keyword => {
                if (eventLocation.includes(keyword)) {
                    score += 15;
                }
            });
        }
        
        // Keyword matching in AP
        if (keywords.length > 0 && event.ap) {
            const eventAP = event.ap.toLowerCase();
            keywords.forEach(keyword => {
                if (eventAP.includes(keyword)) {
                    score += 5;
                }
            });
        }
        
        return score;
    }

    /**
     * Search for events by year range
     * @param {number} startYear - Start year
     * @param {number} endYear - End year
     * @returns {Array} - Events in year range
     */
    searchByYearRange(startYear, endYear) {
        return this.timeline.filter(event => {
            if (!event.parsedDate) return false;
            return event.parsedDate >= startYear && event.parsedDate <= endYear;
        }).sort((a, b) => a.parsedDate - b.parsedDate);
    }

    /**
     * Search for events by location
     * @param {string} location - Location name
     * @returns {Array} - Events in location
     */
    searchByLocation(location) {
        const locationLower = location.toLowerCase();
        return this.timeline.filter(event => 
            event.location && event.location.toLowerCase().includes(locationLower)
        );
    }

    /**
     * Get events around a specific year
     * @param {number} year - Target year
     * @param {number} range - Years before/after (default 5)
     * @returns {Array} - Events around the year
     */
    getEventsAroundYear(year, range = 5) {
        return this.searchByYearRange(year - range, year + range);
    }

    /**
     * Get timeline statistics
     * @returns {Object} - Timeline statistics
     */
    getStats() {
        const years = this.timeline.map(event => event.parsedDate).filter(year => !isNaN(year));
        const locations = [...new Set(this.timeline.map(event => event.location))];
        
        return {
            totalEvents: this.timeline.length,
            yearRange: years.length > 0 ? {
                min: Math.min(...years),
                max: Math.max(...years)
            } : null,
            uniqueLocations: locations.length,
            locations: locations.slice(0, 10) // First 10 locations
        };
    }

    /**
     * Force refresh timeline data
     */
    async refresh() {
        if (googleSheetsIntegration.isAvailable()) {
            await googleSheetsIntegration.forceRefresh();
            const rawTimeline = googleSheetsIntegration.getCampaignTimeline();
            // Add parsedDate field to Google Sheets data
            this.timeline = rawTimeline.map(event => ({
                ...event,
                parsedDate: this.parseDate(event.date)
            }));
            logger.info(`Refreshed ${this.timeline.length} timeline events from Google Sheets`);
        } else {
            this.loadFromCSV();
        }
    }
}

// Create singleton instance
const timelineSearch = new TimelineSearch();

module.exports = timelineSearch;
