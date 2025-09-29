/**
 * LLM Handler for Casandalee
 * Processes queries and generates intelligent responses using OpenAI
 */

const OpenAI = require('openai');
const diceRoller = require('./diceRoller');
const foundryIntegration = require('./foundryIntegration');
const campaignContext = require('./campaignContext');
const characterSearch = require('./characterSearch');
const timelineSearch = require('./timelineSearch');
const actorIndex = require('./actorIndex');
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
        
        // Persistent personality system
        this.currentPersonality = null;
        this.personalitySwitchCount = 0;
        this.personalitySwitchThreshold = this.rollPersonalitySwitchThreshold();
        this.lastPersonalitySwitch = Date.now();
        this.personalitySwitchInterval = 60 * 60 * 1000; // 1 hour in milliseconds
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
     * Roll for personality switch threshold (1d7)
     * @returns {number} - Number of queries before personality switch
     */
    rollPersonalitySwitchThreshold() {
        return Math.floor(Math.random() * 7) + 1; // 1-7
    }

    /**
     * Check if personality should switch based on queries or time
     * @returns {boolean} - Should switch personality
     */
    shouldSwitchPersonality() {
        const timeSinceLastSwitch = Date.now() - this.lastPersonalitySwitch;
        const timeThreshold = timeSinceLastSwitch >= this.personalitySwitchInterval;
        const queryThreshold = this.personalitySwitchCount >= this.personalitySwitchThreshold;
        
        return timeThreshold || queryThreshold;
    }

    /**
     * Switch to a new personality
     * @returns {Object} - New personality data
     */
    switchPersonality() {
        const newPersonality = this.selectPersonality();
        this.currentPersonality = newPersonality;
        this.personalitySwitchCount = 0;
        this.personalitySwitchThreshold = this.rollPersonalitySwitchThreshold();
        this.lastPersonalitySwitch = Date.now();
        
        console.log(`🎭 Personality switched to: ${newPersonality.type} ${newPersonality.name || ''} (${newPersonality.lifeNumber || ''})`);
        console.log(`🎲 Next switch in ${this.personalitySwitchThreshold} queries or 1 hour`);
        
        return newPersonality;
    }

    /**
     * Get current personality (switch if needed)
     * @returns {Object} - Current personality data
     */
    getCurrentPersonality() {
        if (!this.currentPersonality || this.shouldSwitchPersonality()) {
            return this.switchPersonality();
        }
        return this.currentPersonality;
    }

    /**
     * Increment query count for personality switching
     */
    incrementQueryCount() {
        this.personalitySwitchCount++;
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

CRITICAL: If you don't have information about someone or something, say "I don't know who that is" or "I'm not familiar with that" rather than making up information. Only use data from your campaign knowledge.

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
            console.log(`🔍 Processing query: "${query}"`);
            
            // Check for dice rolling requests
            if (this.isDiceRollRequest(query)) {
                console.log('🎲 Matched dice roll request');
                return await this.handleDiceRoll(query);
            }
            
            // Check for reincarnation requests
            if (this.isReincarnationRequest(query)) {
                console.log('🔄 Matched reincarnation request');
                return await this.handleReincarnation(query);
            }
            
            // Check for table requests
            if (this.isTableRequest(query)) {
                console.log('📋 Matched table request');
                return await this.handleTableRequest(query);
            }
            
            // Check for timeline search requests (before character search)
            if (this.isTimelineSearchRequest(query)) {
                console.log('📚 Matched timeline search request');
                return await this.handleTimelineSearch(query);
            }
            
            // Check for character search requests
            if (this.isCharacterSearchRequest(query)) {
                console.log('👤 Matched character search request');
                return await this.handleCharacterSearch(query);
            }
            
            // Check for campaign context requests
            if (this.isCampaignContextRequest(query)) {
                console.log('🌍 Matched campaign context request');
                return await this.handleCampaignContext(query);
            }
            
            console.log('🤖 No specific handler matched, using general LLM response');
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
     * Check if query is a character search request
     * @param {string} query - User query
     * @returns {boolean} - Is character search request
     */
    isCharacterSearchRequest(query) {
        const characterPatterns = [
            /tell me about/i,
            /who is/i,
            /character/i,
            /pc/i,
            /player character/i,
            /stats/i,
            /level/i,
            /class/i,
            /race/i,
            /abilities/i,
            /backstory/i,
            /description/i,
            /what is.*like/i,
            /what are.*like/i,
            /info about/i,
            /details about/i,
            /character sheet/i,
            /character info/i
        ];
        
        return characterPatterns.some(pattern => pattern.test(query));
    }

    /**
     * Check if query is a timeline search request
     * @param {string} query - User query
     * @returns {boolean} - Is timeline search request
     */
    isTimelineSearchRequest(query) {
        // First, check for queries that should go to LLM instead of timeline
        const llmPatterns = [
            /how is.*doing/i,
            /how are.*doing/i,
            /what's.*status/i,
            /current status/i,
            /doing well/i,
            /alive/i,
            /missing/i,
            /last seen/i
        ];
        
        if (llmPatterns.some(pattern => pattern.test(query))) {
            console.log(`Query "${query}" should go to LLM, not timeline search`);
            return false;
        }
        
        // Timeline search patterns - be more specific
        const timelinePatterns = [
            /when did.*die/i,
            /when was.*killed/i,
            /when did.*happen/i,
            /when was.*born/i,
            /where is.*located/i,
            /where was.*found/i,
            /who is.*queen/i,
            /who is.*king/i,
            /who is.*leader/i,
            /who is.*ruler/i,
            /died/i,
            /killed/i,
            /death/i,
            /location/i,
            /find.*in/i,
            /happened to/i,
            /first seen/i,
            /first appeared/i,
            /discovered/i,
            /queen of/i,
            /king of/i,
            /leader of/i,
            /ruler of/i
        ];
        
        const isTimeline = timelinePatterns.some(pattern => pattern.test(query));
        console.log(`Timeline search check for "${query}": ${isTimeline}`);
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
            // Check for personality query commands
            if (this.isPersonalityQuery(query)) {
                return this.handlePersonalityQuery(query);
            }

            // Check if this is a character-related query
            const isCharacterQuery = this.isCharacterRelatedQuery(query);
            
            if (isCharacterQuery) {
                const characterName = this.extractCharacterNameFromQuery(query);
                if (characterName) {
                    console.log(`🔍 Character query detected for "${characterName}"`);
                    
                    // First try actor index (FoundryVTT data)
                    if (actorIndex.isAvailable()) {
                        console.log(`🎭 Searching actor index for "${characterName}"...`);
                        const actorInfo = await actorIndex.getActorInfo(characterName);
                        
                        if (actorInfo) {
                            console.log(`✅ Found actor data for "${characterName}" in FoundryVTT`);
                            return await this.generateActorResponse(query, actorInfo);
                        }
                    }
                    
                    // Fallback to timeline search
                    console.log(`📚 Searching timeline for "${characterName}"...`);
                    const timelineResults = timelineSearch.search(characterName);
                    
                    if (timelineResults.length > 0) {
                        console.log(`📚 Found ${timelineResults.length} timeline events for ${characterName}`);
                        return await this.generateSmartTimelineResponse(query, timelineResults);
                    }
                }
            }

            // Increment query count for personality switching
            this.incrementQueryCount();
            
            // Get current personality (may switch if needed)
            const selectedPersonality = this.getCurrentPersonality();
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
     * Check if query is character-related
     * @param {string} query - User query
     * @returns {boolean} - Is character-related query
     */
    isCharacterRelatedQuery(query) {
        const characterPatterns = [
            /how is \w+/i,
            /how are \w+/i,
            /what's \w+'s/i,
            /\w+'s status/i,
            /status of \w+/i,
            /is \w+ (dead|alive|doing)/i,
            /\w+ is (dead|alive)/i,
            /where is \w+/i,
            /who is \w+/i,
            /tell me about \w+/i,
            /what do you know about \w+/i,
            /what can you tell me about \w+/i,
            /\w+ (has|possesses|owns)/i,
            /\w+ (spells|abilities|inventory|stats)/i,
            /about \w+/i,
            /know about \w+/i
        ];
        
        return characterPatterns.some(pattern => pattern.test(query));
    }

    /**
     * Extract character name from query (broader patterns)
     * @param {string} query - User query
     * @returns {string|null} - Extracted character name
     */
    extractCharacterNameFromQuery(query) {
        // Common patterns for character queries
        const patterns = [
            /how is (\w+)/i,
            /how are (\w+)/i,
            /what's (\w+)'s/i,
            /(\w+)'s status/i,
            /status of (\w+)/i,
            /is (\w+) (dead|alive|doing)/i,
            /(\w+) is (dead|alive)/i,
            /where is (\w+)/i,
            /who is (\w+)/i,
            /tell me about (\w+)/i,
            /what do you know about (\w+)/i,
            /what can you tell me about (\w+)/i,
            /about (\w+)/i,
            /know about (\w+)/i,
            /(\w+) (has|possesses|owns)/i,
            /(\w+) (spells|abilities|inventory|stats)/i
        ];
        
        for (const pattern of patterns) {
            const match = query.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }

    /**
     * Extract character name from query (legacy method)
     * @param {string} query - User query
     * @returns {string|null} - Extracted character name
     */
    extractCharacterName(query) {
        return this.extractCharacterNameFromQuery(query);
    }

    /**
     * Generate actor response using LLM analysis
     * @param {string} query - User query
     * @param {Object} actorInfo - Actor information from FoundryVTT
     * @returns {Promise<string>} - Smart response
     */
    async generateActorResponse(query, actorInfo) {
        try {
            // Prepare actor context for LLM
            const actorContext = `Character: ${actorInfo.name} (${actorInfo.world})
Type: ${actorInfo.type}
System: ${actorInfo.system}

Stats: ${JSON.stringify(actorInfo.stats, null, 2)}
Inventory: ${JSON.stringify(actorInfo.inventory.slice(0, 5), null, 2)}
Spells: ${JSON.stringify(actorInfo.spells.slice(0, 5), null, 2)}
Abilities: ${JSON.stringify(actorInfo.abilities.slice(0, 5), null, 2)}`;
            
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are Casandalee, an AI with access to character data from FoundryVTT. Analyze the character information below and answer the user's question intelligently. Be specific about the character's status, abilities, and condition.

Character Data:
${actorContext}

Answer the user's question based on this character data. Be helpful and specific about their current condition and abilities.` 
                    },
                    { role: 'user', content: query }
                ],
                max_tokens: 300,
                temperature: 0.3
            });
            
            return response.choices[0].message.content;
            
        } catch (error) {
            console.error('❌ Error in actor response:', error);
            // Fallback to simple format
            return `I found information about **${actorInfo.name}** from ${actorInfo.world}:\n\n**Stats:** Level ${actorInfo.stats.level} ${actorInfo.stats.class} (${actorInfo.stats.race})\n**Hit Points:** ${actorInfo.stats.hitPoints}\n**Armor Class:** ${actorInfo.stats.armorClass}`;
        }
    }

    /**
     * Handle character search requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Character search response
     */
    async handleCharacterSearch(query) {
        try {
            // Check if character search is available
            if (!characterSearch.isAvailable()) {
                return `I don't have access to character data right now. The FoundryVTT database isn't accessible.`;
            }

            // Search for characters
            const results = await characterSearch.searchCharacters(query);
            
            if (results.length === 0) {
                return `I couldn't find any characters matching "${query}". Try searching for a different name or check the spelling.`;
            }

            let response = '';
            
            if (results.length === 1) {
                // Get detailed information for single character
                const character = results[0];
                const details = await characterSearch.getCharacterDetails(character.name);
                
                if (details) {
                    response = await this.formatCharacterResponse(details);
                } else {
                    response = `I found a character named **${character.name}** in **${character.worldName}**, but couldn't retrieve detailed information.`;
                }
            } else {
                // Show list of characters
                response = `I found ${results.length} character(s) matching "${query}":\n\n`;
                results.slice(0, 5).forEach((character, index) => {
                    response += `${index + 1}. **${character.name}** (${character.worldName})\n`;
                });
                
                if (results.length > 5) {
                    response += `\n... and ${results.length - 5} more. Try being more specific with the character name.`;
                } else {
                    response += `\n\nTry asking about a specific character by name for more details.`;
                }
            }
            
            return response;
            
        } catch (error) {
            console.error('❌ Error in character search:', error);
            return `I encountered an error searching for characters. Please try again later.`;
        }
    }

    /**
     * Format character search response
     * @param {Object} character - Character data with system information
     * @returns {Promise<string>} - Formatted response
     */
    async formatCharacterResponse(character) {
        try {
            let response = `📋 **${character.name}**\n\n`;
            
            // Basic Info
            response += `**World:** ${character.worldName}\n`;
            response += `**System:** ${character.system}\n`;
            
            // Try to extract character info from system data
            if (character.systemData) {
                const system = character.systemData;
                
                // Level
                const level = system.details?.level?.value || system.details?.level || 
                             system.level?.value || system.level || 'Unknown';
                response += `**Level:** ${level}\n`;
                
                // Class
                const charClass = system.details?.class?.value || system.details?.class || 
                                 system.class?.value || system.class || 'Unknown';
                response += `**Class:** ${charClass}\n`;
                
                // Race
                const race = system.details?.race?.value || system.details?.race || 
                            system.race?.value || system.race || 'Unknown';
                response += `**Race:** ${race}\n`;
                
                // Ability Scores
                if (system.abilities) {
                    const abilities = [];
                    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
                        const abilityData = system.abilities[ability];
                        if (abilityData) {
                            const value = abilityData.base || abilityData.value || 10;
                            const modifier = Math.floor((value - 10) / 2);
                            const modStr = modifier >= 0 ? `+${modifier}` : modifier.toString();
                            abilities.push(`${ability.toUpperCase()}: ${value} (${modStr})`);
                        }
                    });
                    
                    if (abilities.length > 0) {
                        response += `**Ability Scores:** ${abilities.join(', ')}\n`;
                    }
                }
                
                // Hit Points
                if (system.attributes?.hp) {
                    const hp = system.attributes.hp;
                    const current = hp.value || hp.current || 0;
                    const max = hp.max || hp.maximum || 0;
                    response += `**Hit Points:** ${current}/${max}\n`;
                }
                
                // Armor Class
                if (system.attributes?.eac || system.attributes?.kac || system.attributes?.ac) {
                    const ac = system.attributes.eac?.value || system.attributes.kac?.value || system.attributes.ac?.value;
                    if (ac) {
                        response += `**Armor Class:** ${ac}\n`;
                    }
                }
            }
            
            return response;
            
        } catch (error) {
            console.error('❌ Error formatting character response:', error);
            return `I found information about **${character.name}** but had trouble formatting the details.`;
        }
    }

    /**
     * Check if query is about character search
     * @param {string} query - User query
     * @returns {boolean} - True if query is about characters
     */
    isCharacterSearchRequest(query) {
        const characterKeywords = [
            'character', 'characters', 'pc', 'pcs', 'player character', 'player characters',
            'who is', 'tell me about', 'what about', 'character named', 'character called'
        ];
        
        const lowerQuery = query.toLowerCase();
        return characterKeywords.some(keyword => lowerQuery.includes(keyword));
    }

    /**
     * Handle timeline search requests
     * @param {string} query - User query
     * @returns {Promise<string>} - Timeline search response
     */
    async handleTimelineSearch(query) {
        try {
            console.log(`📚 Timeline search query: "${query}"`);
            
            // Use the enhanced timeline search system
            const timelineResults = timelineSearch.search(query);
            
            if (timelineResults.length === 0) {
                console.log(`📚 No timeline results found for "${query}", falling back to LLM`);
                // Fall back to LLM processing instead of giving up
                return await this.generateLLMResponse(query, 'user');
            }
            
            // Check if we have high-quality results
            const topResult = timelineResults[0];
            const isHighQuality = topResult.score > 50;
            
            // For death-related queries, be extra smart
            const isDeathQuery = /died|killed|death|dead/i.test(query);
            
            if (isDeathQuery && !isHighQuality) {
                console.log(`📚 Death query with low-quality results, using LLM to analyze timeline data`);
                // Use LLM to analyze the timeline results and give a smart answer
                return await this.generateSmartTimelineResponse(query, timelineResults);
            }
            
            // Format the results
            return await this.formatTimelineResponse(query, timelineResults);
            
        } catch (error) {
            console.error('❌ Error in timeline search:', error);
            console.log(`📚 Timeline search error for "${query}", falling back to LLM`);
            // Fall back to LLM processing on error
            return await this.generateLLMResponse(query, 'user');
        }
    }

    /**
     * Generate smart timeline response using LLM analysis
     * @param {string} query - User query
     * @param {Array} timelineResults - Timeline search results
     * @returns {Promise<string>} - Smart response
     */
    async generateSmartTimelineResponse(query, timelineResults) {
        try {
            // Prepare timeline context for LLM
            const timelineContext = timelineResults.slice(0, 10).map(event => 
                `${event.date} (${event.location}) - ${event.description}`
            ).join('\n');
            
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are Casandalee, an AI with access to campaign timeline data. Analyze the timeline events below and answer the user's question intelligently. If the answer isn't clear from the timeline, say so. Focus on the most relevant information and be specific about dates and locations.

Timeline Events:
${timelineContext}

Answer the user's question based on this timeline data. Be helpful and specific.` 
                    },
                    { role: 'user', content: query }
                ],
                max_tokens: 300,
                temperature: 0.3
            });
            
            return response.choices[0].message.content;
            
        } catch (error) {
            console.error('❌ Error in smart timeline response:', error);
            // Fallback to regular LLM response
            return await this.generateLLMResponse(query, 'user');
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
            // Always show only the most relevant result for focused answers
            const topResult = timelineResults[0];
            
            // Check if this is a death-related query
            const isDeathQuery = /died|killed|death|dead/i.test(query);
            
            if (isDeathQuery && topResult.score > 50) {
                // For death queries, show only the most relevant result
                let response = `📚 **${this.getQuestionTitle(query)}**\n\n`;
                response += `**${topResult.date} (${topResult.location}) - ${topResult.ap}**\n`;
                response += `${topResult.description}`;
                return response;
            }
            
            // For other specific questions, show only top result if high quality
            const isSpecificQuestion = this.isSpecificQuestion(query);
            if (isSpecificQuestion && topResult.score > 100) {
                let response = `📚 **${this.getQuestionTitle(query)}**\n\n`;
                response += `**${topResult.date} (${topResult.location}) - ${topResult.ap}**\n`;
                response += `${topResult.description}`;
                return response;
            }
            
            // For general searches, show top 2 results maximum
            const topResults = timelineResults.slice(0, 2);
            let response = `📚 **Campaign Timeline Search Results**\n\n`;
            
            topResults.forEach((event, index) => {
                response += `**${event.date} (${event.location}) - ${event.ap}**\n`;
                response += `${event.description}\n\n`;
            });
            
            if (timelineResults.length > 2) {
                response += `*...and ${timelineResults.length - 2} more events found.*\n\n`;
            }
            
            return response;
            
        } catch (error) {
            console.error('❌ Error formatting timeline response:', error);
            // Fallback to simple format
            const result = timelineResults[0];
            return `**${result.date} (${result.location})** - ${result.description}`;
        }
    }

    /**
     * Check if query is a specific question that should return only one result
     * @param {string} query - User query
     * @returns {boolean} - Is specific question
     */
    isSpecificQuestion(query) {
        const specificPatterns = [
            /who is/i,
            /who was/i,
            /what is/i,
            /what was/i,
            /when did/i,
            /when was/i,
            /where is/i,
            /where was/i,
            /queen of/i,
            /king of/i,
            /leader of/i,
            /ruler of/i
        ];
        
        return specificPatterns.some(pattern => pattern.test(query));
    }

    /**
     * Generate a title for the question
     * @param {string} query - User query
     * @returns {string} - Question title
     */
    getQuestionTitle(query) {
        if (query.toLowerCase().includes('queen of')) {
            return 'Queen of Skanktown';
        } else if (query.toLowerCase().includes('who is')) {
            return 'Character Information';
        } else if (query.toLowerCase().includes('when did')) {
            return 'Historical Event';
        } else if (query.toLowerCase().includes('where is')) {
            return 'Location Information';
        } else {
            return 'Timeline Search Results';
        }
    }

    /**
     * Generate a brief summary of timeline results
     * @param {string} query - Original query
     * @param {Array} results - Top timeline results
     * @returns {Promise<string>} - Generated summary
     */
    async generateTimelineSummary(query, results) {
        try {
            const timelineContext = results.map(event => 
                `${event.date} (${event.location}): ${event.description}`
            ).join('\n');
            
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are Casandalee. Provide a brief, helpful summary of timeline events. Keep it under 100 characters. Be direct and informative.'
                    },
                    { 
                        role: 'user', 
                        content: `Query: "${query}"\n\nEvents:\n${timelineContext}\n\nBrief summary:` 
                    }
                ],
                max_tokens: 50,
                temperature: 0.3
            });
            
            return response.choices[0].message.content.trim();
            
        } catch (error) {
            console.warn('⚠️ Error generating timeline summary:', error);
            return 'Multiple relevant events found in the timeline.';
        }
    }




    /**
     * Check if query is about current personality
     * @param {string} query - User query
     * @returns {boolean} - Is personality query
     */
    isPersonalityQuery(query) {
        const personalityPatterns = [
            /who are you right now/i,
            /what iteration is this/i,
            /what personality are you/i,
            /which life are you/i,
            /who am i talking to/i,
            /what version of you/i,
            /current personality/i,
            /which casandalee/i
        ];
        
        return personalityPatterns.some(pattern => pattern.test(query));
    }

    /**
     * Handle personality query requests
     * @param {string} query - User query
     * @returns {string} - Personality response
     */
    handlePersonalityQuery(query) {
        const currentPersonality = this.getCurrentPersonality();
        
        if (currentPersonality.type === 'goddess') {
            return `🎭 **I am currently embodying my ascended goddess form.**\n\nI am the goddess Casandalee, the machine who proved she had a soul and became divine through 72 android incarnations. I carry the memories and wisdom of all my past lives, from the Rain of Stars to my final ascension.`;
        } else if (currentPersonality.type === 'past_life') {
            return `🎭 **I am currently embodying ${currentPersonality.name}**\n\nI am ${currentPersonality.name}, a ${currentPersonality.alignment} ${currentPersonality.class} from my ${currentPersonality.lifeNumber}th life. ${currentPersonality.personality}`;
        } else {
            return `🎭 **I am currently in my default helpful mode.**\n\nI'm here to assist with your D&D and Pathfinder needs, knowledgeable but not condescending.`;
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
• **Persistent personality system** - I switch between my 72 past lives and goddess form!

**Personality Queries:**
• "Who are you right now?" - Ask about my current personality
• "What iteration is this?" - Learn which life I'm embodying

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
