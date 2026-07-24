/**
 * Conversation pipeline v2 — Cass's unified mention/reply/ask response system.
 *
 * Replaces the legacy llmHandler.processQuery path for conversation. Design:
 *   1. UNDERSTAND — one LLM call (with the recent conversation transcript) that
 *      classifies intent and resolves entities/search terms. Pronouns like
 *      "she"/"him" are resolved from the transcript here. Falls back to a
 *      proper-noun heuristic if every provider fails — never dead-ends.
 *   2. RETRIEVE — vault RAG via vaultSearch.contextFor using the resolved
 *      entities/terms (not raw prose words). GM-secret notes are excluded at
 *      the search layer.
 *   3. RESPOND — current-self Cass voice (cassVoice.js), via llmRouter.route()
 *      so provider fallback and voice can never mismatch.
 *   4. LEARN — when the GM states lore, append it to the vault (Learned/) so
 *      it becomes part of Cass's durable knowledge.
 */

const fs = require('fs');
const path = require('path');
const llmRouter = require('./llmRouter');
const vaultSearch = require('./vaultSearch');
const conversationLogger = require('./conversationLogger');
const logger = require('./logger');
const { CASS_SELF_SYSTEM, CONVERSATION_RULES } = require('./cassVoice');

const GM_LORE_PATH = path.join(__dirname, '../../obsidian_cass/cassvault/Learned/gm-lore.md');

const UNDERSTAND_SYSTEM = `You classify a Discord message for a Pathfinder campaign assistant. Using the conversation for context (resolve pronouns like "she"/"him" to actual names), return STRICT JSON only, no prose:
{"intent":"question|lore_statement|greeting|banter|command","entities":["proper names/places the message is about, resolved from context"],"search_terms":["3-8 concrete retrieval keywords (names, places, factions, events)"],"wants_timeline":true|false}
"lore_statement" = the speaker is TELLING facts/backstory rather than asking. Prefer resolved names over pronouns in entities.`;

/** Heuristic fallback when the understanding call fails: proper nouns from text. */
function heuristicUnderstanding(query, transcript) {
    const source = `${transcript || ''}\n${query}`;
    const names = [...new Set(
        [...source.matchAll(/\b[A-Z][a-zA-Z''-]{2,}\b/g)].map(m => m[0])
    )].filter(n => !/^(The|And|But|She|He|They|His|Her|When|What|Where|Casandalee)$/.test(n));
    return {
        intent: 'question',
        entities: names.slice(0, 8),
        search_terms: names.slice(0, 8),
        wants_timeline: /when|date|year|timeline|history/i.test(query)
    };
}

/** Step 1 — understand the message in context. */
async function understand(query, transcript) {
    const userPrompt = `${transcript ? `CONVERSATION:\n${transcript}\n\n` : ''}NEW MESSAGE:\n${query}`;
    try {
        const result = await llmRouter.route(userPrompt, {
            task: 'user-facing',
            system: UNDERSTAND_SYSTEM,
            maxTokens: 220,
            temperature: 0.0,
            timeout: 20000
        });
        const m = (result.text || '').match(/\{[\s\S]*\}/);
        if (m) {
            const parsed = JSON.parse(m[0]);
            return {
                intent: parsed.intent || 'question',
                entities: Array.isArray(parsed.entities) ? parsed.entities.filter(e => typeof e === 'string') : [],
                search_terms: Array.isArray(parsed.search_terms) ? parsed.search_terms.filter(e => typeof e === 'string') : [],
                wants_timeline: !!parsed.wants_timeline
            };
        }
        logger.warn('[Conversation] Understanding returned no JSON; using heuristic');
    } catch (err) {
        logger.warn(`[Conversation] Understanding failed (${err.message}); using heuristic`);
    }
    return heuristicUnderstanding(query, transcript);
}

/** Step 4 — durable GM lore capture into the vault. Non-fatal on any error. */
function captureGmLore(query, speakerName, campaign) {
    try {
        const dir = path.dirname(GM_LORE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(GM_LORE_PATH)) {
            fs.writeFileSync(GM_LORE_PATH, `---\ntitle: "GM Lore — stated in conversation"\ntype: learned\ntags: ["learned", "gm-lore"]\n---\n\n# GM Lore (captured from conversation)\n\nFacts and backstory the GM has stated in Discord conversation, kept verbatim.\n\n`, 'utf8');
        }
        const stamp = new Date().toISOString().slice(0, 10);
        const campNote = campaign ? ` [${campaign.toUpperCase()}]` : '';
        fs.appendFileSync(GM_LORE_PATH, `- **${stamp}**${campNote} (${speakerName}): ${query.trim()}\n`, 'utf8');
        logger.info('[Conversation] GM lore captured to Learned/gm-lore.md');
    } catch (err) {
        logger.warn(`[Conversation] GM lore capture failed: ${err.message}`);
    }
}

/**
 * Main entry — generate Cass's reply.
 * @param {Object} opts
 * @param {string} opts.query         The user's message text (mentions stripped)
 * @param {string} opts.speakerName   Resolved speaker (character/player/GM name)
 * @param {string} [opts.userId]      Discord user id
 * @param {string} [opts.channelName] Channel name (for logging)
 * @param {string} [opts.campaign]    Campaign code for this message (ig/ss/cc/…)
 * @param {boolean} [opts.isGM]       Speaker holds the GM role
 * @param {string} [opts.transcript]  Recent channel messages, "Name: text" lines
 * @param {string} [opts.repliedTo]   Rendered content of the message replied to
 * @returns {Promise<string>}
 */
async function respond(opts) {
    const { query, speakerName, userId = null, channelName = null, campaign = null, isGM = false, transcript = '', repliedTo = '' } = opts;

    // Fast path: personality/meta queries keep their instant handler
    const llmHandler = require('./llmHandler');
    if (llmHandler.isPersonalityQuery && llmHandler.isPersonalityQuery(query)) {
        return llmHandler.handlePersonalityQuery(query);
    }

    // 1. UNDERSTAND
    const u = await understand(query, transcript);
    logger.info(`[Conversation] intent=${u.intent} entities=[${u.entities.join(', ')}] terms=[${u.search_terms.join(', ')}]`);

    // 2. RETRIEVE — search on resolved entities/terms, not raw prose
    const searchText = [...new Set([...u.entities, ...u.search_terms])].join(' ');
    let context = '';
    try {
        context = vaultSearch.contextFor(searchText || query, {
            campaign,
            discordUserId: userId,
            maxTokens: 3500
        }) || '';
    } catch (err) {
        logger.warn(`[Conversation] Vault retrieval failed: ${err.message}`);
    }

    // 3. RESPOND — current-self voice, provider-agnostic
    const campaignLine = campaign ? `\nThis conversation concerns the "${campaign.toUpperCase()}" campaign.` : '';
    const gmLine = isGM ? `\nThe speaker IS the GM (the worldbuilder). What they state about the world is true; receive it as canon.` : '';
    const system = `${CASS_SELF_SYSTEM}\n${CONVERSATION_RULES}${campaignLine}${gmLine}${context ? `\n\nARCHIVE CONTEXT (retrieved notes — use what is relevant, ignore the rest):\n${context}` : ''}`;

    const promptParts = [];
    if (transcript) promptParts.push(`RECENT CONVERSATION:\n${transcript}`);
    if (repliedTo) promptParts.push(`THE SPEAKER IS REPLYING TO:\n${repliedTo}`);
    promptParts.push(`${speakerName} says: ${query}`);
    const userPrompt = promptParts.join('\n\n');

    let response;
    try {
        const result = await llmRouter.route(userPrompt, {
            task: 'user-facing',
            system,
            maxTokens: 500,
            temperature: 0.7
        });
        response = (result.text || '').trim();
        logger.info(`[Conversation] Response via ${result.provider} (${response.length} chars)`);
    } catch (err) {
        logger.error(`[Conversation] All providers failed: ${err.message}`);
        response = `My connection to the archives is flickering, ${speakerName} — give me a moment and ask again.`;
    }

    // 4. LEARN — GM statements become durable knowledge
    if (isGM && u.intent === 'lore_statement') {
        captureGmLore(query, speakerName, campaign);
    }

    // Log the conversation to the vault (feeds nightly memory consolidation)
    try {
        conversationLogger.log({
            discordUsername: speakerName,
            discordId: userId || 'unknown',
            query,
            response,
            channel: channelName,
            handlerType: 'conversation-v2'
        });
    } catch (_) { /* non-fatal */ }

    return response;
}

module.exports = { respond, understand, heuristicUnderstanding };
