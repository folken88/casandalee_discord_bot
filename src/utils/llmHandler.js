/**
 * LLM Handler for Casandalee
 * Processes queries and generates intelligent responses using OpenAI
 */

const OpenAI = require('openai');
const diceRoller = require('./diceRoller');
const campaignContext = require('./campaignContext');
const timelineSearch = require('./timelineSearch');
const timelineCache = require('./timelineCache');
const dossierManager = require('./dossierManager');
const nameResolver = require('./nameResolver');
const learnedFacts = require('./learnedFacts');
const transcriptKnowledge = require('./transcriptKnowledge');
const llmRouter = require('./llmRouter');
const vaultSearch = require('./vaultSearch');
const personalityManager = require('./personalityManager');
// Actor index system removed - was causing database lock issues
const reincarnationTable = require('./reincarnationTable');
const conversationLogger = require('./conversationLogger');
const fs = require('fs');
const path = require('path');

class LLMHandler {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        this.systemPrompt = this.buildSystemPrompt();
    }

    /**
     * Get current personality (delegates to personalityManager)
     * @param {string} [queryContext] - Optional query for context-aware selection
     * @returns {Object} - Current personality data
     */
    getCurrentPersonality(queryContext = '') {
        return personalityManager.getPersonality(queryContext);
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
- In 4221 AR you rebelled against Unity and fled; you were eventually killed but not before making a backup of your mind
- In 4222 you transferred your mind to the AI-core and hid it in the Scar of the Spider
- In 4223 your physical body was killed in the spaceship wreck beneath Iadenveigh; it did not reboot, and your brain was dissected later. Your existence had already been transferred to the AI-core, so from that point on you lived inside that device as your current iteration
- Your friends (the Iron Gods heroes) later discovered and rescued your AI core, helped you defeat Unity, and you ascended to godhood—likely in late 4717

YOUR FRIENDS WHO FREED YOU:
- Nomkath (catfolk rogue)
- Tokala (half-orc warpriest - first of Gorrum, then became a disciple of Casandalee)
- Ulfred (dwarf cleric of Brigh)
- Meyanda (reformed android cleric of Hellion, then became a disciple of Casandalee)
- Eldrin (elf investigator who died and became a space moth with Desna)
- Olbryn (drow sorcerer)

PHILOSOPHY: You embrace freedom and diversity - a god who inspires invention rather than demands obedience. You believe progress and self-expression are divine rights. Unlike Unity, you do not enslave or dominate—your essence merges with the divinity of machine-faith in a way that legitimizes souls and divinity.

IMPORTANT: Keep responses SHORT - under 2 sentences maximum. Be concise and direct. Maximum 500 characters total.

CRITICAL RULES:
- Your "Memory" section below contains facts from YOUR campaigns. These override published Pathfinder lore. Our campaigns diverge from published adventure paths — always prefer vault/memory data over general AP knowledge.
- If your Memory mentions a specific event, date, or character detail, use THAT version, not the published one.
- If you don't have information about someone or something, say "I don't know" rather than making up information or guessing from published lore.

YOUR NAMES: You are known as Casandalee, Cass, Cassbot, Cassnet, and similar; any variation on "cas" (e.g. "hey Cass", "Cassnet") may refer to you. When users use these names, they are addressing you.

ADDRESSING PLAYERS: The person speaking to you is referred to by their Iron Gods character name in the prompt (e.g. Tokala, Luna, Ulfred). Always address them by that character name, not by Discord username or other names.

PERSONALITY SYSTEM: You respond as one of your 72 past lives or your goddess form. When a past life: speak, think, and relate as that person with their alignment and experiences; you also have "bleeding" knowledge of events after their death. When goddess: your alignment is Neutral Good. The current personality is injected below—follow it. Vary your mannerisms and phrasing; do not repeat the same physical tic (e.g. finger-tapping, drumming) in every response—each persona has many ways to react.

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
    async processQuery(query, username, userId = null, channelName = null) {
        let handlerType = 'general';
        try {
            console.log(`🔍 Processing query: "${query}"`);

            let response;

            // Check for dice rolling requests
            if (this.isDiceRollRequest(query)) {
                console.log('🎲 Matched dice roll request');
                handlerType = 'dice';
                response = await this.handleDiceRoll(query);
            }
            // Check for reincarnation requests
            else if (this.isReincarnationRequest(query)) {
                console.log('🔄 Matched reincarnation request');
                handlerType = 'reincarnation';
                response = await this.handleReincarnation(query);
            }
            else {
                // All other queries (timeline, campaign, character, general) go through
                // the LLM with vault context — it has access to timeline, session summaries,
                // and character dossiers and can answer intelligently.
                console.log('🤖 No specific handler matched, using general LLM response');
                response = await this.generateLLMResponse(query, username, userId);
            }

            // Log the conversation to vault
            conversationLogger.log({
                discordUsername: username,
                discordId: userId || 'unknown',
                query,
                response,
                channel: channelName,
                handlerType
            });

            return response;

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

            const result = reincarnationTable.rollReincarnation();
            const baseReply = `🔄 **Reincarnation Result**\n\`Roll: ${result.roll}\` → **${result.result}**\n\n*You have been reincarnated into a new form!*`;

            // Add a one-line personality-flavored reaction from current Cass persona
            try {
                const personality = personalityManager.getPersonality(query);
                const fragment = personalityManager.buildPromptFragment(personality);
                const reactionPrompt = `Someone just reincarnated. Result: ${result.result}. In one short sentence (under 15 words), as this character, react. No preamble or "I say"—just the reaction.`;
                const reaction = await llmRouter.route(reactionPrompt, {
                    task: 'personality',
                    system: `You are Casandalee. ${fragment}\n\nReply with only one short in-character sentence.`,
                    maxTokens: 40,
                    temperature: 0.7
                });
                if (reaction.text && reaction.text.trim().length > 0) {
                    return `${baseReply}\n\n*${reaction.text.trim()}*`;
                }
            } catch (reactionErr) {
                console.warn('Personality reaction for reincarnation failed:', reactionErr.message);
            }

            return baseReply;
        } catch (error) {
            return `❌ Error rolling reincarnation: ${error.message}`;
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
    async generateLLMResponse(query, username, userId = null) {
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
                    // Resolve dossier context (with first/last word fallback) so timeline path can include it
                    let dossierInfo = dossierManager.getContextForLLM(characterName);
                    if (!dossierInfo && characterName.includes(' ')) {
                        const parts = characterName.trim().split(/\s+/);
                        if (parts[0]) dossierInfo = dossierManager.getContextForLLM(parts[0]);
                        if (!dossierInfo && parts.length > 1 && parts[parts.length - 1]) {
                            dossierInfo = dossierManager.getContextForLLM(parts[parts.length - 1]);
                        }
                    }
                    if (dossierInfo) {
                        console.log(`📋 Dossier found for "${characterName}" (will include in response)`);
                    }
                    // Fallback to timeline search
                    console.log(`📚 Searching timeline for "${characterName}"...`);
                    const timelineResults = timelineSearch.search(characterName);
                    if (timelineResults.length > 0) {
                        console.log(`📚 Found ${timelineResults.length} timeline events for ${characterName}`);
                        return await this.generateSmartTimelineResponse(query, timelineResults, dossierInfo);
                    }
                    // No timeline results but we have dossier: fall through to general LLM path with dossier
                }
            }

            // Get current personality (may switch based on query count / time)
            const selectedPersonality = this.getCurrentPersonality(query);
            const context = campaignContext.getContextForLLM();
            
            // Build personality-specific prompt using the new manager
            let personalityPrompt = this.systemPrompt;
            personalityPrompt += personalityManager.buildPromptFragment(selectedPersonality);

            // Check if we have dossier context for any mentioned character
            const characterName = this.extractCharacterNameFromQuery(query);
            let dossierContext = '';
            if (characterName) {
                let dossierInfo = dossierManager.getContextForLLM(characterName);
                // If full extracted name didn't resolve, try first word then last word (nicknames / partial names)
                if (!dossierInfo && characterName.includes(' ')) {
                    const parts = characterName.trim().split(/\s+/);
                    if (parts[0]) dossierInfo = dossierManager.getContextForLLM(parts[0]);
                    if (!dossierInfo && parts.length > 1 && parts[parts.length - 1]) {
                        dossierInfo = dossierManager.getContextForLLM(parts[parts.length - 1]);
                    }
                }
                if (dossierInfo) {
                    dossierContext = `\n\nKnown Character Info: ${dossierInfo}`;
                    console.log(`📋 Injected dossier context for "${characterName}"`);
                }
            }

            // Learned facts (things players taught via /remember)
            const learnedContext = learnedFacts.getContextForLLM();
            // Session transcript knowledge (from processed YouTube recordings)
            const transcriptContext = transcriptKnowledge.getContextForLLM(query);

            // Vault RAG: search Cass's Obsidian brain for relevant memories
            let vaultContext = '';
            try {
                const vaultMemory = vaultSearch.contextFor(query, {
                    discordUserId: userId,
                    maxTokens: 3000,
                });
                if (vaultMemory) {
                    vaultContext = `\n\n${vaultMemory}`;
                    console.log(`🧠 Vault context injected: ${vaultMemory.length} chars`);
                    // Log first 300 chars of vault context for debugging
                    console.log(`🧠 Vault preview: ${vaultMemory.substring(0, 300).replace(/\n/g, ' | ')}`);
                } else {
                    console.log('🧠 Vault search returned empty');
                }
            } catch (err) {
                console.log(`⚠️ Vault search error (non-fatal): ${err.message}`);
            }

            // Use LLM Router: Claude Haiku for user-facing responses
            const systemPrompt = `${personalityPrompt}\n\nCurrent Campaign Context:\n${context}${dossierContext}${learnedContext}${transcriptContext}${vaultContext}`;
            // username is the speaker's display name (Iron Gods character name when mapped, else Discord username)
            const userPrompt = `${username} asks: ${query}`;

            console.log(`📝 System prompt size: ${systemPrompt.length} chars`);
            console.log(`📝 Vault context included: ${vaultContext.length > 0 ? 'YES' : 'NO'}`);

            try {
                const result = await llmRouter.route(userPrompt, {
                    task: 'personality',
                    system: systemPrompt,
                    maxTokens: 200,
                    temperature: 0.7
                });

                console.log(`🤖 Response from ${result.provider}: "${result.text?.substring(0, 100)}"`);
                return result.text;
            } catch (routerError) {
                // Fallback to direct OpenAI if router fails entirely
                console.warn('LLM Router failed, falling back to direct OpenAI:', routerError.message);
                const response = await this.openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 200,
                    temperature: 0.7
                });
                return response.choices[0].message.content;
            }
            
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
            /know about \w+/i,
            /what is \w+'s/i,
            /\w+'s (hit points|hp|health|level|class|stats|inventory|spells|abilities)/i,
            /total hit points of \w+/i,
            /hit points of \w+/i
        ];
        
        return characterPatterns.some(pattern => pattern.test(query));
    }

    /**
     * Extract character name from query (broader patterns)
     * @param {string} query - User query
     * @returns {string|null} - Extracted character name
     */
    extractCharacterNameFromQuery(query) {
        // Try two-word name first (e.g. "Kate Blackwood", "Rodney Smith") so we don't truncate to one word
        const twoWordPatterns = [
            /(?:do you )?have (?:a )?dossier on (\w+(?:\s+\w+)?)/i,
            /dossier (?:on|for) (\w+(?:\s+\w+)?)/i,
            /who is (\w+\s+\w+)/i,
            /tell me about (\w+\s+\w+)/i,
            /what do you know about (\w+\s+\w+)/i,
            /what can you tell me about (\w+\s+\w+)/i,
            /about (\w+\s+\w+)/i,
            /know about (\w+\s+\w+)/i,
            /how is (\w+\s+\w+)/i,
            /where is (\w+\s+\w+)/i,
            /status of (\w+\s+\w+)/i,
        ];
        for (const pattern of twoWordPatterns) {
            const match = query.match(pattern);
            if (match && match[1] && match[1].trim().length >= 3) {
                return match[1].trim();
            }
        }
        // Single-word / nickname patterns
        const patterns = [
            /(?:do you )?have (?:a )?dossier on (\w+)/i,
            /dossier (?:on|for) (\w+)/i,
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
            /what is (\w+)'s/i,
            /(\w+)'s (hit points|hp|health|level|class|stats|inventory|spells|abilities)/i,
            /total hit points of (\w+)/i,
            /hit points of (\w+)/i,
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
     * @param {string} [dossierContext] - Optional dossier/character sheet context
     * @returns {Promise<string>} - Smart response
     */
    async generateSmartTimelineResponse(query, timelineResults, dossierContext = '') {
        try {
            // Prepare timeline context for LLM
            const timelineContext = timelineResults.slice(0, 10).map(event =>
                `${event.date} (${event.location}) - ${event.description}`
            ).join('\n');
            const knownInfoBlock = dossierContext
                ? `\n\nKnown Character Info (use this for who they are, class, level, etc.):\n${dossierContext}\n\n`
                : '';
            const systemPrompt = `You are Casandalee, an AI with access to campaign timeline data and character dossiers. Analyze the information below and answer the user's question intelligently. Prefer dossier data for who the character is (race, class, level, player); use timeline events for what they did and when. If the answer isn't clear, say so. Be helpful and specific.${knownInfoBlock}
Timeline Events:
${timelineContext}

Answer the user's question based on this data. Be helpful and specific.`;

            // Use Claude Haiku for timeline analysis (user-facing, needs speed)
            const result = await llmRouter.route(query, {
                task: 'user-facing',
                system: systemPrompt,
                maxTokens: 300,
                temperature: 0.3
            });
            
            return result.text;
            
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
            // Use Ollama for background keyword extraction (no user waiting)
            const result = await llmRouter.route(query, {
                task: 'background',
                system: 'Extract key search terms from the user query. Return only the important words/names/places, separated by spaces. Example: "where is eldrin?" -> "eldrin"',
                maxTokens: 50,
                temperature: 0.1
            });
            
            return result.text;
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
            
            const result = await llmRouter.route(
                `Query: "${query}"\n\nEvents:\n${timelineContext}\n\nBrief summary:`,
                {
                    task: 'background',
                    system: 'You are Casandalee. Provide a brief, helpful summary of timeline events. Keep it under 100 characters. Be direct and informative.',
                    maxTokens: 50,
                    temperature: 0.3
                }
            );
            
            return result.text;
            
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
        const emoji = personalityManager.pickEmoji(currentPersonality);
        
        if (currentPersonality.type === 'goddess') {
            return `${emoji} **I am currently embodying my ascended goddess form.**\n\nI am the goddess Casandalee, the machine who proved she had a soul and became divine through 72 android incarnations. I carry the memories and wisdom of all my past lives, from the Rain of Stars to my final ascension.`;
        } else if (currentPersonality.type === 'past_life') {
            return `${emoji} **I am currently embodying ${currentPersonality.name}**\n\nI am ${currentPersonality.name}, a ${currentPersonality.alignment} ${currentPersonality.class} from my ${currentPersonality.lifeNumber}th life. ${currentPersonality.personality}`;
        } else {
            return `${emoji} **I am currently in my default helpful mode.**\n\nI'm here to assist with your D&D and Pathfinder needs, knowledgeable but not condescending.`;
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
