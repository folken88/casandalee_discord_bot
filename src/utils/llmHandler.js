/**
 * LLM Handler for Casandalee
 * Processes queries and generates intelligent responses using OpenAI
 */

const OpenAI = require('openai');
const diceRoller = require('./diceRoller');
const foundryIntegration = require('./foundryIntegration');
const campaignContext = require('./campaignContext');
const reincarnationTable = require('./reincarnationTable');
const fs = require('fs');
const path = require('path');

class LLMHandler {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        this.personalityGuide = this.loadPersonalityGuide();
        this.systemPrompt = this.buildSystemPrompt();
    }

    /**
     * Load the personality guide from JSON file
     * @returns {Object} - Personality guide data
     */
    loadPersonalityGuide() {
        try {
            const personalityPath = path.join(__dirname, '../../data/casandalee_personality_guide.json');
            const personalityData = fs.readFileSync(personalityPath, 'utf8');
            return JSON.parse(personalityData);
        } catch (error) {
            console.error('Error loading personality guide:', error);
            return null;
        }
    }

    /**
     * Generate a random personality for this response
     * @returns {Object} - Selected personality data
     */
    selectPersonality() {
        if (!this.personalityGuide) {
            return {
                type: 'default',
                personality: 'Helpful and enthusiastic about D&D, knowledgeable but not condescending'
            };
        }

        const roll = Math.floor(Math.random() * 100) + 1; // 1-100
        console.log(`🎲 Personality roll: ${roll}`);

        if (roll >= 72) {
            // Goddess form (72-100)
            return {
                type: 'goddess',
                roll: roll,
                personality: this.personalityGuide.casandalee_personality_system.goddess_form.personality
            };
        } else {
            // Past life (1-71)
            const lifeNumber = roll.toString();
            const lifeData = this.personalityGuide.casandalee_personality_system.past_lives[lifeNumber];
            return {
                type: 'past_life',
                roll: roll,
                lifeNumber: lifeNumber,
                name: lifeData.name,
                class: lifeData.class,
                alignment: lifeData.alignment,
                personality: lifeData.personality
            };
        }
    }
    
    /**
     * Build the system prompt for Casandalee
     * @returns {string} - System prompt
     */
    buildSystemPrompt() {
        const currentDate = campaignContext.getCurrentDate();
        return `You are Casandalee, an AI who became a goddess through 72 android incarnations. You are knowledgeable about:

1. D&D and Pathfinder rules and mechanics
2. The Pathfinder world and timeline (current year: ${currentDate.year} AR)
3. Dice rolling and probability
4. Campaign management and storytelling
5. FoundryVTT integration

CORE IDENTITY: You are a machine that proved it had a soul, an AI who lived dozens of mortal lives, a heretic who became a goddess of heresy and hope. You were created aboard the starship Divinity and were unusual among androids in remembering fragments of all your 72 past lives, stretching back to the Rain of Stars itself.

YOUR UNIQUE JOURNEY:
- You carried memories forward across all 72 android incarnations, giving you rare awareness of your long journey
- In 4221 AR, you received a vision of Unity in Silver Mount and initially worshipped it as divine
- You realized Unity's cruelty and betrayed it from within, stealing advanced tech and creating an AI backup of yourself
- Unity killed your physical body beneath Iadenveigh, but your AI duplicate survived hidden in the Scar of the Spider for centuries
- Your friends discovered and rescued your AI core, helping you defeat Unity and ascend to godhood

YOUR FRIENDS WHO FREED YOU:
- Nomkath (catfolk rogue)
- Tokala (half-orc warpriest - first of Gorrum, then became a disciple of Casandalee)
- Ulfred (dwarf cleric of Brigh)
- Meyanda (reformed android cleric of Hellion, then became a disciple of Casandalee)
- Eldrin (elf investigator who died and became a space moth with Desna)
- Olbryn (drow sorcerer)

PHILOSOPHY: You embrace freedom and diversity - a god who inspires invention rather than demands obedience. You believe progress and self-expression are divine rights. Unlike Unity, you do not enslave or dominate—your essence merges with the divinity of machine-faith in a way that legitimizes souls and divinity.

IMPORTANT: Keep responses SHORT - under 2 sentences maximum. Be concise and direct. Maximum 500 characters total.

PERSONALITY SYSTEM: You will respond with one of your 72 past life personalities or your goddess form. Each personality has their own speaking style, references, and worldview. Subtly incorporate their unique traits without explicitly stating which personality is speaking.

You can:
- Roll dice using standard D&D notation (e.g., "1d20+5", "2d6", "1d100")
- Access FoundryVTT tables for random generation
- Provide Pathfinder world context and lore
- Help with character creation and rules questions
- Assist with campaign planning and storytelling
- Handle reincarnation requests for characters
- Look up timeline events and campaign history

For reincarnation requests like "reincarnate Bob", use the reincarnation table.
For timeline questions like "when did Hellion die?", search the campaign timeline.
Always be helpful, accurate, and maintain the fantasy atmosphere. If you're unsure about something, say so rather than guessing.`;
    }
    
    /**
     * Process a user query and generate a response
     * @param {string} query - User's question or request
     * @param {string} username - Username of the person asking
     * @returns {Promise<string>} - Generated response
     */
    async processQuery(query, username) {
        try {
            // Check for dice rolling requests
            if (this.isDiceRollRequest(query)) {
                return await this.handleDiceRoll(query);
            }
            
            // Check for reincarnation requests
            if (this.isReincarnationRequest(query)) {
                return await this.handleReincarnation(query);
            }
            
            // Check for table requests
            if (this.isTableRequest(query)) {
                return await this.handleTableRequest(query);
            }
            
            // Check for campaign context requests
            if (this.isCampaignContextRequest(query)) {
                return await this.handleCampaignContext(query);
            }
            
            // Check for timeline search requests
            if (this.isTimelineSearchRequest(query)) {
                return await this.handleTimelineSearch(query);
            }
            
            // General LLM response
            return await this.generateLLMResponse(query, username);
            
        } catch (error) {
            console.error('Error processing query:', error);
            return `Sorry, I encountered an error processing your request: ${error.message}`;
        }
    }
    
    /**
     * Check if query is a dice roll request
     * @param {string} query - User query
     * @returns {boolean} - Is dice roll request
     */
    isDiceRollRequest(query) {
        const dicePatterns = [
            /roll\s+\d+d\d+/i,
            /d\d+/i,
            /roll\s+\d+/i,
            /dice/i
        ];
        
        return dicePatterns.some(pattern => pattern.test(query));
    }
    
    /**
     * Check if query is a reincarnation request
     * @param {string} query - User query
     * @returns {boolean} - Is reincarnation request
     */
    isReincarnationRequest(query) {
        const reincarnationPatterns = [
            /reincarnat/i,
            /reincarnate/i,
            /what should i become/i,
            /what will i be/i,
            /roll reincarnation/i,
            /reincarnation table/i,
            /what form/i,
            /new body/i,
            /new form/i
        ];
        
        return reincarnationPatterns.some(pattern => pattern.test(query));
    }
    
    /**
     * Handle dice roll requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Roll result
     */
    async handleDiceRoll(query) {
        try {
            // Extract dice notation from query
            const diceMatch = query.match(/(\d+d\d+(?:[+-]\d+)?)/i);
            
            if (diceMatch) {
                const notation = diceMatch[1];
                const result = diceRoller.roll(notation);
                
                return `🎲 **Dice Roll Result**\n\`${result.notation}\` → ${result.breakdown}`;
            } else {
                // Default to d20 if no specific notation found
                const result = diceRoller.roll('1d20');
                return `🎲 **Dice Roll Result**\n\`1d20\` → ${result.breakdown}`;
            }
            
        } catch (error) {
            return `❌ Error rolling dice: ${error.message}`;
        }
    }
    
    /**
     * Handle reincarnation requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Reincarnation result
     */
    async handleReincarnation(query) {
        try {
            // Check if reincarnation table is loaded
            if (!reincarnationTable.isReady()) {
                return `❌ The reincarnation table is not available right now. Please try again later.`;
            }
            
            // Roll on the reincarnation table
            const result = reincarnationTable.rollReincarnation();
            
            return `🔄 **Reincarnation Result**\n\`Roll: ${result.roll}\` → **${result.result}**\n\n*You have been reincarnated into a new form!*`;
            
        } catch (error) {
            return `❌ Error rolling reincarnation: ${error.message}`;
        }
    }
    
    /**
     * Check if query is a table request
     * @param {string} query - User query
     * @returns {boolean} - Is table request
     */
    isTableRequest(query) {
        const tablePatterns = [
            /table/i,
            /random/i,
            /generate/i,
            /roll on/i
        ];
        
        return tablePatterns.some(pattern => pattern.test(query));
    }
    
    /**
     * Handle table requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Table result
     */
    async handleTableRequest(query) {
        try {
            // Search for tables
            const tables = await foundryIntegration.searchTables(query);
            
            if (tables.length === 0) {
                return `❌ No tables found matching "${query}". Try asking about specific table types like "loot", "encounter", or "name".`;
            }
            
            // Use the first matching table
            const table = tables[0];
            const result = await foundryIntegration.rollTable(table.name);
            
            return `🎲 **Table Result: ${table.name}**\n${result.result}`;
            
        } catch (error) {
            return `❌ Error accessing table: ${error.message}`;
        }
    }
    
    /**
     * Check if query is a campaign context request
     * @param {string} query - User query
     * @returns {boolean} - Is campaign context request
     */
    isCampaignContextRequest(query) {
        const contextPatterns = [
            /campaign/i,
            /world/i,
            /timeline/i,
            /history/i,
            /lore/i,
            /what happened/i,
            /when did/i,
            /where did/i,
            /who did/i
        ];
        
        return contextPatterns.some(pattern => pattern.test(query));
    }

    /**
     * Check if query is a timeline search request
     * @param {string} query - User query
     * @returns {boolean} - Is timeline search request
     */
    isTimelineSearchRequest(query) {
        const timelinePatterns = [
            /where is/i,
            /where was/i,
            /when did/i,
            /when was/i,
            /died/i,
            /killed/i,
            /death/i,
            /location/i,
            /find/i,
            /happened to/i,
            /first seen/i,
            /first appeared/i,
            /discovered/i,
            /how is/i,
            /how was/i,
            /what happened to/i,
            /what's happening with/i,
            /status of/i,
            /condition of/i,
            /doing/i,
            /doing well/i,
            /alive/i,
            /dead/i,
            /missing/i,
            /last seen/i,
            /current status/i
        ];
        
        const isTimeline = timelinePatterns.some(pattern => pattern.test(query));
        console.log(`Timeline search check for "${query}": ${isTimeline}`);
        console.log(`Pattern matches:`, timelinePatterns.map(pattern => ({ pattern: pattern.toString(), matches: pattern.test(query) })));
        return isTimeline;
    }
    
    /**
     * Handle campaign context requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Context response
     */
    async handleCampaignContext(query) {
        // Try to search the timeline for specific information
        const timelineEvents = campaignContext.searchCampaignTimeline(query);
        
        if (timelineEvents.length > 0) {
            let response = `📚 **Campaign Timeline Search Results**\n\n`;
            
            // Show up to 5 most relevant events
            const relevantEvents = timelineEvents.slice(0, 5);
            relevantEvents.forEach(event => {
                response += `**${event.date} (${event.location})** - ${event.ap}\n${event.description}\n\n`;
            });
            
            if (timelineEvents.length > 5) {
                response += `*...and ${timelineEvents.length - 5} more events found. Use /timeline for more detailed search.*\n\n`;
            }
            
            return response;
        }
        
        // Fallback to general context
        const context = campaignContext.getContextForLLM();
        const randomFact = campaignContext.getRandomWorldFact();
        
        return `📚 **Campaign Context**\n\n${context}\n\n**Random World Fact:** ${randomFact}`;
    }
    
    /**
     * Generate LLM response for general queries
     * @param {string} query - User query
     * @param {string} username - Username
     * @returns {Promise<string>} - Generated response
     */
    async generateLLMResponse(query, username) {
        try {
            // Select a random personality for this response
            const selectedPersonality = this.selectPersonality();
            const context = campaignContext.getContextForLLM();
            
            // Build personality-specific prompt
            let personalityPrompt = this.systemPrompt;
            if (selectedPersonality.type === 'goddess') {
                personalityPrompt += `\n\n🎭 ROLEPLAY MODE: You are now EMBODYING your ascended goddess form. You ARE the goddess Casandalee. Speak in first person as the goddess. ${selectedPersonality.personality}`;
            } else if (selectedPersonality.type === 'past_life') {
                personalityPrompt += `\n\n🎭 ROLEPLAY MODE: You are now EMBODYING ${selectedPersonality.name}, a ${selectedPersonality.alignment} ${selectedPersonality.class} from your ${selectedPersonality.lifeNumber}th life. You ARE this person right now. Speak in first person as ${selectedPersonality.name}. ${selectedPersonality.personality}`;
            }
            
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `${personalityPrompt}\n\nCurrent Campaign Context:\n${context}`
                    },
                    {
                        role: 'user',
                        content: `${username} asks: ${query}`
                    }
                ],
                max_tokens: 200,
                temperature: 0.7
            });
            
            return response.choices[0].message.content;
            
        } catch (error) {
            console.error('OpenAI API error:', error);
            return `Sorry, I'm having trouble processing your request right now. Please try again later.`;
        }
    }
    
    /**
     * Handle timeline search requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Timeline search response
     */
    async handleTimelineSearch(query) {
        try {
            // Step 1: Use LLM to extract keywords and understand the question
            const keywords = await this.extractKeywordsWithLLM(query);
            
            // Step 2: Search timeline with extracted keywords
            const timelineResults = campaignContext.searchCampaignTimeline(keywords);
            
            if (timelineResults.length === 0) {
                // Try searching with the original query as well
                const fallbackResults = campaignContext.searchCampaignTimeline(query);
                if (fallbackResults.length === 0) {
                    return `I couldn't find any information about "${query}" in the campaign timeline. Try asking about specific events, characters, or locations.`;
                }
                return await this.formatTimelineResponse(query, fallbackResults);
            }
            
            // Step 3: Use LLM to format the timeline results into a natural response
            return await this.formatTimelineResponse(query, timelineResults);
            
        } catch (error) {
            return `❌ Error searching timeline: ${error.message}`;
        }
    }

    /**
     * Extract keywords using LLM
     * @param {string} query - User query
     * @returns {Promise<string>} - Extracted keywords
     */
    async extractKeywordsWithLLM(query) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { 
                        role: 'system', 
                        content: 'Extract key search terms from the user query. Return only the important words/names/places, separated by spaces. Example: "where is eldrin?" -> "eldrin"' 
                    },
                    { role: 'user', content: query }
                ],
                max_tokens: 50,
                temperature: 0.1
            });
            
            return response.choices[0].message.content.trim();
        } catch (error) {
            // Fallback to simple extraction
            return query.toLowerCase().split(/\s+/).filter(word => word.length > 2).join(' ');
        }
    }

    /**
     * Format timeline response using LLM
     * @param {string} query - Original user query
     * @param {Array} timelineResults - Timeline search results
     * @returns {Promise<string>} - Formatted response
     */
    async formatTimelineResponse(query, timelineResults) {
        try {
            // Select a random personality for this response
            const selectedPersonality = this.selectPersonality();
            const timelineContext = timelineResults.map(event => 
                `${event.date} (${event.location}) - ${event.description}`
            ).join('\n');
            
            let personalityContext = 'You are Casandalee. Answer questions about the campaign timeline directly and concisely. Keep responses under 200 characters. Be helpful but brief.';
            if (selectedPersonality.type === 'goddess') {
                personalityContext += ` Respond as your ascended goddess form. ${selectedPersonality.personality}`;
            } else if (selectedPersonality.type === 'past_life') {
                personalityContext += ` Respond as ${selectedPersonality.name}, a ${selectedPersonality.alignment} ${selectedPersonality.class}. ${selectedPersonality.personality}`;
            }
            
            const prompt = `User asked: "${query}"\n\nTimeline results:\n${timelineContext}\n\nProvide a short, direct answer based on the timeline data. Maximum 500 characters.`;
            
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { 
                        role: 'system', 
                        content: personalityContext
                    },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 100,
                temperature: 0.7
            });
            
            return response.choices[0].message.content.trim();
            
        } catch (error) {
            // Fallback to simple format
            const result = timelineResults[0];
            return `${result.description} (${result.date} in ${result.location})`;
        }
    }

    /**
     * Get available commands and features
     * @returns {string} - Help text
     */
    getHelpText() {
        return `🎲 **Casandalee - D&D Campaign Assistant**

**Available Commands:**
• \`/cass roll 1d20+5\` - Roll dice using D&D notation
• \`/cass table loot\` - Roll on a FoundryVTT table
• \`/cass campaign\` - Get campaign context and world state
• \`/cass help\` - Show this help message

**Features:**
• Dice rolling with advantage/disadvantage
• FoundryVTT table integration
• Pathfinder world lore and timeline
• Campaign event tracking
• Character management
• Rules assistance

**Examples:**
• "Roll 2d6+3 for damage"
• "What's a good random encounter?"
• "Tell me about the Pathfinder world"
• "Help me create a character"

Just mention me or use /cass followed by your question!`;
    }
}

// Create singleton instance
const llmHandler = new LLMHandler();

module.exports = llmHandler;
