/**
 * Query Classifier for Casandalee
 * Pass 1 of the two-pass LLM pipeline.
 * Uses a cheap/fast LLM call to classify user queries and extract entities,
 * replacing the brittle regex-based routing.
 */

const logger = require('./logger');
const llmRouter = require('./llmRouter');
const nameResolver = require('./nameResolver');

const SYSTEM_PROMPT = `Classify this D&D query as JSON. RESPOND WITH ONLY JSON.

{"intent":"<type>","entities":["<name>"],"data_needed":["<data>"]}

Intents: character_info, character_equipment, character_abilities, item_info, location_events, event_query, timeline_query, lore_query, greeting, unknown

Data types: character_dossier, equipment_list, item_details, item_owner, timeline_events, location_history, vault_search, campaign_lore

Examples:
"who is gaspar" → {"intent":"character_info","entities":["Gaspar"],"data_needed":["character_dossier","timeline_events"]}
"what items does elfrip carry" → {"intent":"character_equipment","entities":["Elfrip"],"data_needed":["equipment_list"]}
"what is curator" → {"intent":"item_info","entities":["Curator"],"data_needed":["item_details","item_owner"]}
"what happened at torch" → {"intent":"location_events","entities":["Torch"],"data_needed":["location_history","timeline_events"]}
"when did the beast trial happen" → {"intent":"event_query","entities":["Beast of Lepidstadt"],"data_needed":["timeline_events"]}
"what is CP-USS" → {"intent":"lore_query","entities":["CP-USS"],"data_needed":["campaign_lore"]}
"does elfrip have a helmet" → {"intent":"character_equipment","entities":["Elfrip"],"data_needed":["equipment_list"]}
"who has redeemer" → {"intent":"item_info","entities":["Redeemer"],"data_needed":["item_details","item_owner"]}
"tell me about edge of the sea" → {"intent":"item_info","entities":["Edge of the Sea"],"data_needed":["item_details","item_owner"]}
"what race is rhyarca" → {"intent":"character_info","entities":["Rhyarca"],"data_needed":["character_dossier"]}`;

// Simple LRU cache for recent classifications
const cache = new Map();
const CACHE_MAX = 100;

class QueryClassifier {
    /**
     * Classify a user query using LLM.
     * @param {string} query - The raw user query
     * @returns {Promise<{intent: string, entities: string[], data_needed: string[]}>}
     */
    async classify(query) {
        const cacheKey = query.toLowerCase().trim();
        if (cache.has(cacheKey)) {
            logger.debug(`QueryClassifier: cache hit for "${query}"`);
            return cache.get(cacheKey);
        }

        let result;
        try {
            // Try Gemini Flash first (free, accurate at structured extraction)
            const raw = await llmRouter.geminiChat(
                [{ role: 'user', content: query }],
                {
                    system: SYSTEM_PROMPT,
                    maxTokens: 200,
                    temperature: 0.0,
                    timeout: 30000,
                }
            );
            result = this._parseResponse(raw, query);
        } catch (err) {
            logger.debug(`QueryClassifier: Gemini failed (${err.message}), falling back to Ollama`);
            try {
                const raw = await llmRouter.ollamaGenerate(query, {
                    system: SYSTEM_PROMPT,
                    maxTokens: 200,
                    temperature: 0.0,
                    timeout: 30000,
                });
                result = this._parseResponse(raw, query);
            } catch (err2) {
                logger.debug(`QueryClassifier: Ollama failed (${err2.message}), trying OpenRouter`);
                try {
                    const raw = await llmRouter.openrouterGenerate(query, {
                        system: SYSTEM_PROMPT,
                        maxTokens: 200,
                        temperature: 0.0,
                    });
                    result = this._parseResponse(raw, query);
                } catch (err3) {
                    logger.debug(`QueryClassifier: OpenRouter failed (${err3.message}), trying OpenAI`);
                    try {
                        const raw = await llmRouter.openaiGenerate(query, {
                            system: SYSTEM_PROMPT,
                            maxTokens: 200,
                            temperature: 0.0,
                            timeout: 30000,
                        });
                        result = this._parseResponse(raw, query);
                    } catch (err4) {
                        logger.warn(`QueryClassifier: all providers failed, returning unknown`);
                        result = { intent: 'unknown', entities: [], data_needed: ['vault_search'] };
                    }
                }
            }
        }

        // Resolve entity names through nameResolver for better matching
        result.entities = result.entities.map(name => {
            const resolved = nameResolver.resolve(name);
            return resolved || name;
        });

        // Cache the result
        if (cache.size >= CACHE_MAX) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        cache.set(cacheKey, result);

        logger.info(`QueryClassifier: "${query}" → intent=${result.intent}, entities=[${result.entities.join(', ')}], data=[${result.data_needed.join(', ')}]`);
        return result;
    }

    /**
     * Parse the LLM response into structured classification.
     */
    _parseResponse(raw, query) {
        try {
            // Extract JSON from response (LLM might add extra text)
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    intent: parsed.intent || 'unknown',
                    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
                    data_needed: Array.isArray(parsed.data_needed) ? parsed.data_needed : ['vault_search'],
                };
            }
        } catch (err) {
            logger.warn(`QueryClassifier: JSON parse failed for "${query}": ${err.message}`);
        }
        return { intent: 'unknown', entities: [], data_needed: ['vault_search'] };
    }
}

const queryClassifier = new QueryClassifier();
module.exports = queryClassifier;
