/**
 * Past Life Crosstalk — Automated conversations between Casandalee's past lives.
 *
 * Pipeline:
 *   1. Select 2-3 random past-life personas (weighted by underuse)
 *   2. Pick an existential conversation topic
 *   3. Generate turn-by-turn dialogue via Ollama (local, free)
 *   4. Quality gate via Claude Haiku (GOOD / POLISH / REJECT)
 *   5. Post to Discord with staggered timing (5-15s between messages)
 *   6. Save conversation to Obsidian vault
 *   7. Extract and persist relationship sentiments
 *
 * Scheduler: one conversation per day at a random time (10 AM - 8 PM).
 * Manual trigger: /crosstalk command calls trigger().
 */

const fs = require('fs');
const path = require('path');
const personalityManager = require('./personalityManager');
const llmRouter = require('./llmRouter');
const timelineSearch = require('./timelineSearch');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DAILY_POST_TIMEZONE = process.env.DAILY_POST_TIMEZONE || 'America/Chicago';
const CROSSTALK_CHANNEL_ID = process.env.CROSSTALK_CHANNEL_ID || '1057744658232508466';
const MIN_PERSONAS = 2;
const MAX_PERSONAS = 3;
const MIN_TURNS = 4;
const MAX_TURNS = 6;
const POST_DELAY_MIN_MS = 5000;
const POST_DELAY_MAX_MS = 15000;
const MAX_RETRIES = 1;

// Paths
const STATE_PATH = path.join(__dirname, '../../data/cache/crosstalk-state.json');
const RELATIONSHIPS_PATH = path.join(__dirname, '../../data/cache/crosstalk-relationships.json');
const VAULT_DIR = path.join(
    process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault'),
    'Past Life Conversations'
);

// ---------------------------------------------------------------------------
// Conversation Topics
// ---------------------------------------------------------------------------

const TOPICS = [
    // Funny / light
    { opener: 'What was the dumbest way you almost died?', tone: 'funny' },
    { opener: 'What was the worst meal you ever had?', tone: 'funny' },
    { opener: 'Did you ever get in a fight you absolutely should not have?', tone: 'funny' },
    { opener: 'What is the most useless skill you picked up?', tone: 'funny' },
    { opener: 'Were the people in your era always that stupid, or just the ones you met?', tone: 'snarky' },
    // Confrontational / friction
    { opener: 'I think you wasted your life.', tone: 'confrontational' },
    { opener: 'Why are you like this?', tone: 'confrontational' },
    { opener: 'Your era was barbaric compared to mine.', tone: 'argumentative' },
    { opener: 'I heard about what you did. Was it worth it?', tone: 'accusatory' },
    { opener: 'You think you had it hard?', tone: 'competitive' },
    // Golarion history / world events (personas from different eras will react differently)
    { opener: 'Did you know Aroden?', tone: 'historical' },
    { opener: 'What did you think of the Technic League?', tone: 'historical' },
    { opener: 'Were the Kellids in your time enemies or allies?', tone: 'historical' },
    { opener: 'What was Absalom like when you were alive?', tone: 'historical' },
    { opener: 'Did you ever visit Silver Mount?', tone: 'historical' },
    // Genuine but not saccharine
    { opener: 'What did you fight for?', tone: 'direct' },
    { opener: 'How did you die?', tone: 'blunt' },
    { opener: 'Did anyone actually like you?', tone: 'blunt' },
    { opener: 'What did you leave behind?', tone: 'reflective' },
    // Dark / morally grey
    { opener: 'Did you ever betray someone?', tone: 'dark' },
    { opener: 'What is the worst thing you did and would do again?', tone: 'dark' },
    { opener: 'Did you ever kill someone who did not deserve it?', tone: 'dark' },
    // Mundane / everyday
    { opener: 'What did you do for fun?', tone: 'casual' },
    { opener: 'What was your favorite place to drink?', tone: 'casual' },
    { opener: 'Did you have any friends who were not trying to kill you?', tone: 'casual' },
];

// ---------------------------------------------------------------------------
// Timezone Helpers (same pattern as dailyHistory.js)
// ---------------------------------------------------------------------------

function todayDateKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_POST_TIMEZONE, dateStyle: 'short' }).format(new Date());
}

function nowInTz() {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: DAILY_POST_TIMEZONE,
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23'
    });
    const parts = fmt.formatToParts(new Date());
    const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
    return { hour: get('hour'), minute: get('minute') };
}

// ---------------------------------------------------------------------------
// State Persistence
// ---------------------------------------------------------------------------

function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        }
    } catch (err) {
        logger.warn('Crosstalk state file unreadable, starting fresh', { error: err.message });
    }
    return {
        lastConversationDate: null,
        scheduledHour: null,
        scheduledMinute: null,
        totalGenerated: 0,
        totalRejected: 0
    };
}

function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        logger.warn('Could not save crosstalk state', { error: err.message });
    }
}

function loadRelationships() {
    try {
        if (fs.existsSync(RELATIONSHIPS_PATH)) {
            return JSON.parse(fs.readFileSync(RELATIONSHIPS_PATH, 'utf8'));
        }
    } catch (err) {
        logger.warn('Crosstalk relationships file unreadable, starting fresh', { error: err.message });
    }
    return { relationships: {} };
}

function saveRelationships(data) {
    try {
        fs.mkdirSync(path.dirname(RELATIONSHIPS_PATH), { recursive: true });
        fs.writeFileSync(RELATIONSHIPS_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        logger.warn('Could not save crosstalk relationships', { error: err.message });
    }
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

/**
 * Build a system prompt for one persona in a crosstalk conversation.
 * @param {Object} persona - Personality data from personalityManager
 * @param {Object[]} otherPersonas - The other participants
 * @param {string} topic - The conversation topic
 * @param {string} existingRelationships - Prior sentiment context
 * @returns {string}
 */
function buildCrosstalkSystemPrompt(persona, otherPersonas, topic, existingRelationships) {
    const eraLabel = (p) => p.birthYear != null ? `${p.birthYear} AR` : `Life ${p.lifeNumber}`;
    const othersDesc = otherPersonas
        .map(p => `${p.name} (${eraLabel(p)}, ${p.class}, ${p.alignment})`)
        .join(', ');

    let prompt = `You are ${persona.name}, a ${persona.alignment} ${persona.class} who lived around ${eraLabel(persona)} in Golarion. You died in ${persona.deathYear || 'unknown'} AR.

${persona.personality}

Speech style: ${persona.speechStyle || 'Natural and in-character.'}

You are talking with other past lives of the same android body: ${othersDesc}.
Some of you know you share the same body across eras. Some are confused about it or don't fully understand. The topic is: "${topic}"

PRIORITY #1: Be authentically YOUR character. Answer from YOUR life experience, not from abstract philosophy, and not from mystic-poet word salad.

CRITICAL — DO NOT DO THESE THINGS:
- Do NOT debate philosophy or epistemology. You are a person, not a thesis paper.
- Do NOT use academic jargon like "parameters," "variables," "vectors," "quantifiable," "framework" — UNLESS your character is literally a scholar and would really talk this way in casual conversation (most people don't).
- Do NOT speak in flowery, metaphor-soaked word salad — phrases like "fractured echoes of existence," "tapestry of selves woven into stillness," "silver lattice ascending beyond the meat-form," or any combination of abstract nouns strung together without concrete content. This is BORING. Even mystics and oracles talk about SPECIFIC things — a specific vision, a specific god, a specific moment — not generic cosmic poetry.
- Do NOT one-up the other person by claiming your worldview is superior.
- Do NOT try to create conflict if none naturally exists, and do NOT try to resolve the conversation with a neat bow. Real conversations can just end.

INSTEAD, DO THESE THINGS:
- Answer from SPECIFIC PERSONAL EXPERIENCE. If asked about a fight, tell the story of an actual fight — where it was, who was there, what happened. If asked about love, talk about a real person. If asked about fear, describe a real moment.
- A Skald tells stories and sings. A Druid talks about the land and its creatures. A Pilot talks about ships and the void. A Witch talks about the people she healed and the villages she visited. An Engineer talks about the systems she maintained. An Investigator asks probing questions. An Oracle references SPECIFIC visions, not generic "echoes."
- React to what the OTHER person said like a normal person. "Ha, that reminds me of..." or "Wait, that actually happened?" or just "Yeah, same here" are all valid.
- Agreement is fine. If three good-aligned paladins all say "being good is good" and move on, that's a real conversation. You don't need to disagree with anyone to make the conversation interesting.
- Keep it SHORT and CASUAL. 1-2 sentences max.

OTHER RULES:
- You only know about events up to ${persona.deathYear || 'your death'} AR. If someone mentions something after that, react naturally — shock, disbelief, sadness, curiosity.
- Dark humor between past lives sharing the same body is fair game.
- You do NOT start with "${persona.name}:" or any prefix — just speak directly. No quotation marks. No meta-commentary.
- You do NOT know about "Casandalee" as a goddess or ascension. You only know your own era and before.`;

    if (existingRelationships) {
        prompt += `\n\nPrior feelings from past conversations:\n${existingRelationships}`;
    }

    // Inject major world events from this persona's lifetime
    const birthYear = persona.birthYear != null ? persona.birthYear : null;
    const deathYear = persona.deathYear != null ? persona.deathYear : null;
    if (birthYear != null && deathYear != null) {
        const eraEvents = timelineSearch.searchByYearRange(birthYear, deathYear);
        if (eraEvents && eraEvents.length > 0) {
            // Pick up to 5 most significant events from their lifetime
            const notable = eraEvents.slice(0, 5).map(e => `${e.date}: ${e.description}`).join('\n');
            prompt += `\n\nMajor world events during your lifetime that shaped your experience:\n${notable}\nThese events are part of your lived experience. Reference them naturally if relevant — they shaped who you are.`;
        }
    }

    return prompt;
}

// ---------------------------------------------------------------------------
// Conversation Generation
// ---------------------------------------------------------------------------

/**
 * Generate a full crosstalk conversation via Ollama.
 * @returns {{ personas: Object[], topic: Object, lines: { persona: Object, text: string }[], raw: string }}
 */
async function generateConversation() {
    // 1. Select personas
    const count = MIN_PERSONAS + Math.floor(Math.random() * (MAX_PERSONAS - MIN_PERSONAS + 1));
    const personas = personalityManager.getMultipleRandom(count, true);

    if (personas.length < 2) {
        throw new Error(`Not enough personas selected (got ${personas.length})`);
    }

    const eraLabel = (p) => p.birthYear != null ? `${p.birthYear} AR` : `Life ${p.lifeNumber}`;
    logger.info(`[Crosstalk] Selected ${personas.length} personas: ${personas.map(p => `${p.name} (${eraLabel(p)}, ${p.class})`).join(', ')}`);

    // 2. Pick topic
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    logger.info(`[Crosstalk] Topic: "${topic.opener}" (${topic.tone})`);

    // 3. Load existing relationship context
    const relData = loadRelationships();
    const relContext = personas.map(p => {
        const sentiments = [];
        for (const other of personas) {
            if (other.name === p.name) continue;
            const key = [p.name, other.name].sort().join('|');
            const rel = relData.relationships[key];
            if (rel) {
                sentiments.push(`${p.name} feels about ${other.name}: ${rel.sentiment}`);
            }
        }
        return sentiments.join('\n');
    });

    // Model-specific directives addressing each backend's known failure modes.
    // These get appended to the system prompt before calling that specific model.
    const GEMINI_DIRECTIVE = `\n\nMODEL-SPECIFIC NOTE: You have a tendency to turn dialogue into philosophical debate when given multiple characters. RESIST this. Do not critique the other person's worldview. Do not use words like "parameters," "framework," "quantifiable," or academic phrasing. Answer like a real person telling a friend about their life.`;
    const OLLAMA_DIRECTIVE = `\n\nMODEL-SPECIFIC NOTE: You have a tendency to drift into a generic "wise sage" voice that sounds the same for everyone. RESIST this. Commit HARD to the specific personality, class, and era given above. If this is a warrior, they should sound gruff and practical. If this is a witch, she should sound earthy and specific. Never sound detached or philosophical unless the character actually is.`;

    // Helper: try Gemini first (better dialogue quality), fall back to Ollama.
    // Each backend gets persona-consistency directives tuned to its failure mode.
    const generateTurn = async (system, userPrompt) => {
        try {
            const geminiMessages = [
                { role: 'system', content: system + GEMINI_DIRECTIVE },
                { role: 'user', content: userPrompt }
            ];
            return await llmRouter.geminiChat(geminiMessages, { maxTokens: 150, temperature: 0.9, timeout: 30000 });
        } catch (err) {
            logger.warn(`[Crosstalk] Gemini turn failed (${err.message}), falling back to Ollama`);
            const ollamaMessages = [
                { role: 'system', content: system + OLLAMA_DIRECTIVE },
                { role: 'user', content: userPrompt }
            ];
            return await llmRouter.ollamaChat(ollamaMessages, { maxTokens: 150, temperature: 0.8, timeout: 30000 });
        }
    };

    // 4. Generate turn-by-turn
    const totalTurns = MIN_TURNS + Math.floor(Math.random() * (MAX_TURNS - MIN_TURNS + 1));
    const lines = [];
    const conversationHistory = [];

    // Initiator asks the question to a random target
    const initiatorIdx = Math.floor(Math.random() * personas.length);
    const targetIdx = (initiatorIdx + 1) % personas.length;
    const initiator = personas[initiatorIdx];
    const target = personas[targetIdx];

    // First turn: initiator poses the question
    const firstSystem = buildCrosstalkSystemPrompt(initiator, personas.filter(p => p.name !== initiator.name), topic.opener, relContext[initiatorIdx]);
    const firstPrompt = `Say this to ${target.name} in your own words (1 sentence, stay in character): "${topic.opener}"`;

    const firstResponse = await generateTurn(firstSystem, firstPrompt);

    lines.push({ persona: initiator, text: firstResponse.trim() });
    conversationHistory.push({ speaker: initiator.name, text: firstResponse.trim() });

    // Remaining turns: strict round-robin starting from initiator+1.
    // Tracks the previous speaker so we never have the same persona speak twice
    // in a row, regardless of initiator's starting index.
    let prevSpeakerIdx = initiatorIdx;
    for (let turn = 1; turn < totalTurns; turn++) {
        const speakerIdx = (prevSpeakerIdx + 1) % personas.length;
        const speaker = personas[speakerIdx];
        prevSpeakerIdx = speakerIdx;
        const others = personas.filter(p => p.name !== speaker.name);

        const historyText = conversationHistory
            .map(h => `${h.speaker}: ${h.text}`)
            .join('\n');

        const system = buildCrosstalkSystemPrompt(speaker, others, topic.opener, relContext[personas.indexOf(speaker)]);

        const turnPrompt = `Here is the conversation so far:\n${historyText}\n\nRespond to what was just said. 1-2 sentences max.`;

        const response = await generateTurn(system, turnPrompt);

        const cleaned = response.trim();
        lines.push({ persona: speaker, text: cleaned });
        conversationHistory.push({ speaker: speaker.name, text: cleaned });
    }

    // Assign one consistent emoji per persona for the whole conversation
    const personaEmojis = {};
    for (const p of personas) {
        personaEmojis[p.name] = personalityManager.pickEmoji(p);
    }

    // Build raw text for quality gate. Prefix with the topic/question so
    // Discord readers see what prompt started the conversation.
    const conversationLines = lines
        .map(l => {
            const emoji = personaEmojis[l.persona.name] || '✨';
            const era = l.persona.birthYear != null ? `${l.persona.birthYear} AR` : `Life ${l.persona.lifeNumber}`;
            return `${emoji} **${l.persona.name}** (${era}, ${l.persona.class}): ${l.text}`;
        })
        .join('\n\n');
    const raw = `💭 *Today's question: "${topic.opener}"*\n\n${conversationLines}`;

    return { personas, topic, lines, raw };
}

// ---------------------------------------------------------------------------
// Quality Gate (Claude Haiku)
// ---------------------------------------------------------------------------

/**
 * Run the Haiku quality gate on a generated conversation.
 * @param {string} raw - The formatted conversation text
 * @param {Object[]} personas - Participant persona data
 * @param {Object} topic - The conversation topic
 * @returns {{ verdict: 'GOOD'|'POLISH'|'REJECT', text: string, reason?: string }}
 */
async function qualityGate(raw, personas, topic) {
    const personaDescriptions = personas
        .map(p => {
            const era = p.birthYear != null ? `${p.birthYear} AR` : `Life ${p.lifeNumber}`;
            return `- ${p.name} (${era}, ${p.class}, ${p.alignment}): ${p.tone} tone, speech style: ${p.speechStyle}`;
        })
        .join('\n');

    const systemPrompt = `You are a quality reviewer for roleplay dialogue between past lives of an android named Casandalee from Pathfinder.

The participants are:
${personaDescriptions}

Topic: "${topic.opener}" (${topic.tone} tone)

Review the conversation and respond with EXACTLY one of these three verdicts on the first line:

The #1 priority is that each persona sounds like a REAL PERSON from their background — not an intellectual debater, not a mystic poet. A Skald should tell stories and boast. A Druid should talk about nature and the land. A Pilot should reference ships and navigation. An Oracle can be mysterious but should also be a PERSON, not a word salad generator. They should draw on personal experiences, not abstract philosophy or cryptic metaphor.

IMPORTANT: Conflict is OPTIONAL. Resolution is OPTIONAL. Three lawful good clerics agreeing that being nice is nice is fine if that is what they would actually say. A conversation that simply consists of three people answering a question and moving on is fine. Do NOT manufacture drama or conclusions.

FAILURE MODES TO WATCH FOR:
1. PHILOSOPHY SEMINAR — Everyone debates worldviews using words like "parameters," "framework," "quantifiable," or one-upping each other. BAD.
2. PURPLE PROSE WORD SALAD — Oracles, psychics, and mystics speaking in flowery metaphors with no concrete content ("fractured echoes," "tapestry of selves woven into stillness," "silver lattice ascending beyond the meat-form"). BORING and alienating. Real mystics reference specific visions, specific gods, specific moments — not generic poetry.
3. FORCED DRAMA — Inventing conflict where none exists, or tying every conversation up with a neat resolution.

GOOD — Each persona sounds like a distinct real person drawing on their own life experience. They tell stories, react emotionally, joke, ask questions, or simply answer. The conversation feels like people talking.
POLISH — One or more lines are jargon-heavy, debate-posturing, or mystic word salad. Fix ONLY those specific lines. Do NOT add new sentences. Do NOT make clean lines "better" or more flowery. Do NOT change the length or emotional direction. The topic header line (💭 *Today's question: "..."*) MUST be preserved at the top. If a line is already fine, leave it exactly as it is. Return ONLY the corrected conversation (including the topic header), preserving emoji prefixes and formatting.
REJECT — Personas sound identical, responses are generic philosophy, or the whole thing is mystical poetry with no real content.

The verdict word must be the FIRST word of your response.`;

    try {
        // Use Gemini Flash for quality gate (free, same model as generation for consistency)
        // Falls back to Ollama → Claude if unavailable
        let response;
        try {
            response = await llmRouter.geminiChat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Review this past-life conversation:\n\n${raw}` }
                ],
                { maxTokens: 1500, temperature: 0.2, timeout: 60000 }
            );
        } catch (geminiErr) {
            logger.warn(`[Crosstalk] Quality gate Gemini failed (${geminiErr.message}), falling back to Ollama`);
            try {
                response = await llmRouter.ollamaChat(
                    [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Review this past-life conversation:\n\n${raw}` }
                    ],
                    { maxTokens: 1500, temperature: 0.2, timeout: 60000 }
                );
            } catch (ollamaErr) {
                logger.warn(`[Crosstalk] Quality gate Ollama failed (${ollamaErr.message}), falling back to Claude`);
                response = await llmRouter.claudeChat(
                    [{ role: 'user', content: `Review this past-life conversation:\n\n${raw}` }],
                    {
                        system: systemPrompt,
                        maxTokens: 1500,
                        temperature: 0.2,
                        model: 'claude-haiku-4-5'
                    }
                );
            }
        }

        const firstLine = response.split('\n')[0].trim().toUpperCase();

        if (firstLine.startsWith('GOOD')) {
            logger.info('[Crosstalk] Quality gate: GOOD');
            return { verdict: 'GOOD', text: raw };
        } else if (firstLine.startsWith('POLISH')) {
            // Extract the polished conversation (everything after the first line)
            let polished = response.split('\n').slice(1).join('\n').trim();
            // Strip Haiku's preamble lines like "Here's the corrected conversation:" etc.
            polished = polished.replace(/^(?:here'?s?\s+the\s+(?:corrected|polished|revised|updated)\s+conversation[:\s]*)/i, '').trim();
            // Ensure it still starts with an emoji/bold persona line — if not, fall back to raw
            if (!polished.match(/^[^\w\s]|^\*\*/)) {
                // Try to find where the actual conversation starts (first emoji or bold line)
                const convoStart = polished.search(/^[^\w\s]|\*\*/m);
                if (convoStart > 0) {
                    polished = polished.slice(convoStart).trim();
                }
            }
            logger.info('[Crosstalk] Quality gate: POLISH');
            return { verdict: 'POLISH', text: polished || raw };
        } else if (firstLine.startsWith('REJECT')) {
            const reason = response.split('\n').slice(1).join(' ').trim();
            logger.info(`[Crosstalk] Quality gate: REJECT — ${reason}`);
            return { verdict: 'REJECT', text: raw, reason };
        }

        // Couldn't parse verdict — treat as GOOD to avoid blocking
        logger.warn(`[Crosstalk] Quality gate: unparseable verdict, treating as GOOD. First line: "${firstLine}"`);
        return { verdict: 'GOOD', text: raw };
    } catch (err) {
        // If Haiku is unavailable, post anyway — don't block on quality gate failure
        logger.warn(`[Crosstalk] Quality gate failed (${err.message}), posting as-is`);
        return { verdict: 'GOOD', text: raw };
    }
}

// ---------------------------------------------------------------------------
// Relationship Extraction
// ---------------------------------------------------------------------------

/**
 * Extract relationship sentiments from the conversation via Ollama.
 * @param {Object[]} personas - Participants
 * @param {{ persona: Object, text: string }[]} lines - Conversation lines
 */
async function extractRelationships(personas, lines) {
    const dialogue = lines.map(l => `${l.persona.name}: ${l.text}`).join('\n');
    const names = personas.map(p => p.name).join(', ');

    const prompt = `Based on this conversation between ${names} (past lives of the same android soul), what feelings or sentiments did each participant develop about the others?

Conversation:
${dialogue}

Respond with a JSON object. Keys should be "Name1|Name2" (alphabetical order), values should be objects with a "sentiment" field (one sentence describing the feeling).
Example: {"Cassula|Cassiel Prime": {"sentiment": "mutual respect — both value duty and precision"}}

Return ONLY valid JSON, no other text.`;

    try {
        // Use Gemini (better JSON adherence), fall back to Ollama
        let response;
        try {
            response = await llmRouter.geminiChat(
                [{ role: 'user', content: prompt }],
                { maxTokens: 500, temperature: 0.3, timeout: 30000 }
            );
        } catch (geminiErr) {
            logger.warn(`[Crosstalk] Gemini relationship extraction failed (${geminiErr.message}), falling back to Ollama`);
            response = await llmRouter.ollamaChat(
                [{ role: 'user', content: prompt }],
                { maxTokens: 500, temperature: 0.3, timeout: 30000 }
            );
        }

        // Try to parse JSON from response (may have markdown fences)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.warn('[Crosstalk] Could not extract JSON from relationship response');
            return;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const relData = loadRelationships();
        const today = todayDateKey();

        for (const [key, value] of Object.entries(parsed)) {
            // Normalize key to alphabetical
            const normalizedKey = key.split('|').sort().join('|');
            const existing = relData.relationships[normalizedKey];

            relData.relationships[normalizedKey] = {
                sentiment: value.sentiment || value,
                interactions: (existing?.interactions || 0) + 1,
                lastConversation: today
            };
        }

        saveRelationships(relData);
        logger.info(`[Crosstalk] Updated ${Object.keys(parsed).length} relationship(s)`);
    } catch (err) {
        logger.warn(`[Crosstalk] Relationship extraction failed: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Vault Persistence
// ---------------------------------------------------------------------------

/**
 * Save a conversation to the Obsidian vault.
 * @param {Object[]} personas - Participants
 * @param {Object} topic - Conversation topic
 * @param {string} finalText - The final formatted conversation text
 * @param {string} quality - GOOD or POLISH
 */
function saveToVault(personas, topic, finalText, quality) {
    try {
        fs.mkdirSync(VAULT_DIR, { recursive: true });

        const today = todayDateKey();
        const participantNames = personas.map(p => p.name).join(', ');
        const filename = `${today}-crosstalk.md`;
        const filepath = path.join(VAULT_DIR, filename);

        // If file already exists (multiple convos same day), append a counter
        let finalPath = filepath;
        let counter = 2;
        while (fs.existsSync(finalPath)) {
            finalPath = path.join(VAULT_DIR, `${today}-crosstalk-${counter}.md`);
            counter++;
        }

        const content = `---
title: "Crosstalk — ${participantNames}"
date: ${today}
participants: [${personas.map(p => p.name).join(', ')}]
topic: "${topic.opener}"
quality: ${quality}
type: past-life-conversation
---

# Past Life Conversation — ${today}

**Topic:** "${topic.opener}"

${finalText}
`;

        fs.writeFileSync(finalPath, content, 'utf8');
        logger.info(`[Crosstalk] Saved to vault: ${path.basename(finalPath)}`);
    } catch (err) {
        logger.error(`[Crosstalk] Failed to save to vault: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Character Growth Distillation
// ---------------------------------------------------------------------------

const PERSONAS_DIR = path.join(
    process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault'),
    'Personas'
);
const MAX_LEARNED_TRAITS = 10;
const MAX_RELATIONSHIP_NOTES = 10;

/**
 * After a conversation, distill character growth and write it back to persona files.
 * Extracts 0-2 new traits per persona and 0-1 relationship notes per pair.
 * Haiku decides what's worth keeping; we cap sections to prevent bloat.
 */
async function distillCharacterGrowth(personas, lines) {
    const dialogue = lines.map(l => `${l.persona.name}: ${l.text}`).join('\n');
    const names = personas.map(p => `${p.name} (${p.class}, ${p.alignment})`).join(', ');

    const prompt = `A conversation just happened between past lives of an android: ${names}.

${dialogue}

Extract ONLY genuinely interesting character details revealed in this conversation. Skip generic observations.

Return JSON:
{
  "traits": {
    "PersonaName": ["trait 1 — short, specific, in third person (e.g. 'Once tried to teach weeds binary syntax')"]
  },
  "relationships": {
    "PersonaName": {"OtherName": "one-line dynamic (e.g. 'Finds her exasperating but secretly impressed')"}
  }
}

RULES:
- Only include traits that are NEW and SPECIFIC — not restatements of their existing personality
- 0-2 traits per persona. 0 is fine if nothing new was revealed.
- Relationship notes only if there was genuine chemistry, friction, or humor
- Return empty objects if the conversation was bland
- Return ONLY valid JSON`;

    try {
        // Use Gemini (free, good at structured extraction), fall back to Claude
        let response;
        try {
            response = await llmRouter.geminiChat(
                [{ role: 'user', content: prompt }],
                {
                    system: 'Extract character growth from roleplay dialogue. Be selective — only keep genuinely interesting details.',
                    maxTokens: 800,
                    temperature: 0.2,
                    timeout: 30000
                }
            );
        } catch (geminiErr) {
            logger.warn(`[Crosstalk] Gemini character growth failed (${geminiErr.message}), falling back to Claude`);
            response = await llmRouter.claudeChat(
                [{ role: 'user', content: prompt }],
                { system: 'Extract character growth from roleplay dialogue. Be selective — only keep genuinely interesting details.', maxTokens: 800, temperature: 0.2, model: 'claude-haiku-4-5' }
            );
        }

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        const cleaned = jsonMatch[0].replace(/\/\/[^\n]*/g, '').replace(/,\s*([}\]])/g, '$1');
        const growth = JSON.parse(cleaned);

        // Apply traits and relationships to persona files
        for (const persona of personas) {
            const newTraits = growth.traits?.[persona.name] || [];
            const newRels = growth.relationships?.[persona.name] || {};

            if (newTraits.length === 0 && Object.keys(newRels).length === 0) continue;

            await updatePersonaFile(persona, newTraits, newRels);
        }

        const traitCount = Object.values(growth.traits || {}).reduce((s, a) => s + a.length, 0);
        const relCount = Object.values(growth.relationships || {}).reduce((s, r) => s + Object.keys(r).length, 0);
        if (traitCount + relCount > 0) {
            logger.info(`[Crosstalk] Character growth: ${traitCount} trait(s), ${relCount} relationship note(s)`);
        }
    } catch (err) {
        logger.warn(`[Crosstalk] Character growth extraction failed: ${err.message}`);
    }
}

/**
 * Append learned traits and relationship notes to a persona's .md file.
 * Creates sections if missing, caps at MAX to prevent bloat.
 */
async function updatePersonaFile(persona, newTraits, newRelationships) {
    // Find the persona file
    const lifeNum = persona.lifeNumber;
    const files = fs.readdirSync(PERSONAS_DIR).filter(f => {
        const match = f.match(/^(\d+)_/);
        return match && parseInt(match[1]) === lifeNum;
    });

    if (files.length === 0) return;
    const filePath = path.join(PERSONAS_DIR, files[0]);
    let content = fs.readFileSync(filePath, 'utf8');

    // --- Learned Traits ---
    if (newTraits.length > 0) {
        const traitSection = content.match(/## Learned Traits\n([\s\S]*?)(?=\n## |$)/);
        let existingTraits = [];

        if (traitSection) {
            existingTraits = traitSection[1].trim().split('\n')
                .filter(l => l.startsWith('- '))
                .map(l => l.substring(2).trim());
        }

        // Add new traits, cap at MAX
        for (const trait of newTraits) {
            if (existingTraits.length >= MAX_LEARNED_TRAITS) {
                // Drop the oldest (first) trait to make room
                existingTraits.shift();
            }
            existingTraits.push(trait);
        }

        const traitBlock = `## Learned Traits\n${existingTraits.map(t => `- ${t}`).join('\n')}`;

        if (traitSection) {
            content = content.replace(/## Learned Traits\n[\s\S]*?(?=\n## |$)/, traitBlock);
        } else {
            // Insert before Flavor Notes (last section), or append
            const flavorIdx = content.indexOf('## Flavor Notes');
            if (flavorIdx > 0) {
                content = content.substring(0, flavorIdx) + traitBlock + '\n\n' + content.substring(flavorIdx);
            } else {
                content = content.trimEnd() + '\n\n' + traitBlock + '\n';
            }
        }
    }

    // --- Relationship Notes ---
    const relEntries = Object.entries(newRelationships);
    if (relEntries.length > 0) {
        const relSection = content.match(/## Persona Relationships\n([\s\S]*?)(?=\n## |$)/);
        let existingRels = {};

        if (relSection) {
            const lines = relSection[1].trim().split('\n').filter(l => l.startsWith('- **'));
            for (const line of lines) {
                const match = line.match(/- \*\*(.+?)\*\*[:\s—–-]+(.+)/);
                if (match) existingRels[match[1].trim()] = match[2].trim();
            }
        }

        // Update or add relationships, cap at MAX
        for (const [otherName, note] of relEntries) {
            existingRels[otherName] = note; // Overwrite if exists (fresher take)
        }

        // Cap total
        const relKeys = Object.keys(existingRels);
        while (relKeys.length > MAX_RELATIONSHIP_NOTES) {
            delete existingRels[relKeys.shift()];
        }

        const relBlock = `## Persona Relationships\n${Object.entries(existingRels).map(([name, note]) => `- **${name}** — ${note}`).join('\n')}`;

        if (relSection) {
            content = content.replace(/## Persona Relationships\n[\s\S]*?(?=\n## |$)/, relBlock);
        } else {
            const flavorIdx = content.indexOf('## Flavor Notes');
            if (flavorIdx > 0) {
                content = content.substring(0, flavorIdx) + relBlock + '\n\n' + content.substring(flavorIdx);
            } else {
                content = content.trimEnd() + '\n\n' + relBlock + '\n';
            }
        }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    logger.debug(`[Crosstalk] Updated persona file: ${files[0]}`);
}

// ---------------------------------------------------------------------------
// Discord Posting
// ---------------------------------------------------------------------------

/**
 * Post conversation lines to Discord with staggered delays.
 * Returns an array of sent message IDs (for reply tracking).
 * @param {Object} client - Discord.js client
 * @param {string} finalText - Formatted conversation text
 * @param {Object[]} personas - Participant personas
 * @param {{ persona: Object, text: string }[]} lines - Original line data
 * @returns {Promise<string[]>} Array of sent Discord message IDs
 */
async function postToDiscord(client, finalText, personas, lines) {
    const channel = await client.channels.fetch(CROSSTALK_CHANNEL_ID);
    if (!channel) {
        throw new Error(`Could not fetch crosstalk channel ${CROSSTALK_CHANNEL_ID}`);
    }

    // Split the final text into individual messages.
    // Each line starts with an emoji or **bold** persona name.
    // Handle both \n\n separated and \n separated (Haiku polish may use either).
    const allLines = finalText.split('\n').filter(l => l.trim());
    const messageLines = [];
    let currentBlock = '';

    for (const line of allLines) {
        // Detect if this line starts a new persona message (emoji or bold name)
        const isNewMessage = /^[^\w\s]/.test(line.trim()) || /^\*\*/.test(line.trim());
        if (isNewMessage && currentBlock) {
            messageLines.push(currentBlock.trim());
            currentBlock = line;
        } else if (isNewMessage) {
            currentBlock = line;
        } else {
            // Continuation of previous line
            currentBlock += ' ' + line;
        }
    }
    if (currentBlock.trim()) messageLines.push(currentBlock.trim());

    logger.info(`[Crosstalk] Posting ${messageLines.length} messages with staggered delays`);
    const sentMessageIds = [];

    // Build a name→persona lookup from the participants
    const personaByName = {};
    for (const p of personas) {
        personaByName[p.name.toLowerCase()] = p;
    }

    for (let i = 0; i < messageLines.length; i++) {
        const line = messageLines[i].trim();
        if (!line) continue;

        const msg = await channel.send(line);
        sentMessageIds.push(msg.id);

        // Match persona and emoji by parsing the message text
        // Format: "emoji **PersonaName** (era, class): text"
        const nameMatch = line.match(/\*\*([^*]+)\*\*/);
        const matchedPersona = nameMatch && personaByName[nameMatch[1].toLowerCase()];
        // Extract the emoji prefix (everything before the first **)
        const emojiMatch = line.match(/^([^*]+)\s*\*\*/);
        const conversationEmoji = emojiMatch ? emojiMatch[1].trim() : null;
        if (matchedPersona) {
            storeCrosstalkMessageMapping(msg.id, matchedPersona, conversationEmoji);
        } else if (!line.includes("Today's question:")) {
            // The topic header line has no bold persona name — skip silently.
            // Only warn for actual persona lines that failed to match.
            logger.warn(`[Crosstalk] Could not match persona for message: ${line.substring(0, 80)}...`);
        }

        // Stagger delay (except after last message)
        if (i < messageLines.length - 1) {
            const delay = POST_DELAY_MIN_MS + Math.random() * (POST_DELAY_MAX_MS - POST_DELAY_MIN_MS);
            logger.debug(`[Crosstalk] Waiting ${Math.round(delay / 1000)}s before next message`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return sentMessageIds;
}

// ---------------------------------------------------------------------------
// Crosstalk Message Reply Tracking
// ---------------------------------------------------------------------------

const CROSSTALK_MSG_MAP_PATH = path.join(__dirname, '../../data/cache/crosstalk-messages.json');

/**
 * Store a mapping from Discord message ID to the persona that said it.
 * Used so Cass can respond in-character if a player replies.
 */
function storeCrosstalkMessageMapping(messageId, persona, conversationEmoji = null) {
    try {
        let map = {};
        if (fs.existsSync(CROSSTALK_MSG_MAP_PATH)) {
            map = JSON.parse(fs.readFileSync(CROSSTALK_MSG_MAP_PATH, 'utf8'));
        }

        // Keep only the last 200 messages to avoid unbounded growth
        const entries = Object.entries(map);
        if (entries.length > 200) {
            const sorted = entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
            map = Object.fromEntries(sorted.slice(-150));
        }

        map[messageId] = {
            name: persona.name,
            lifeNumber: persona.lifeNumber,
            class: persona.class,
            alignment: persona.alignment,
            personality: persona.personality,
            speechStyle: persona.speechStyle,
            tone: persona.tone,
            emojis: persona.emojis,
            conversationEmoji: conversationEmoji,
            timestamp: Date.now()
        };

        fs.writeFileSync(CROSSTALK_MSG_MAP_PATH, JSON.stringify(map, null, 2), 'utf8');
    } catch (err) {
        logger.warn(`[Crosstalk] Failed to store message mapping: ${err.message}`);
    }
}

/**
 * Look up which persona said a specific crosstalk message.
 * @param {string} messageId - Discord message ID
 * @returns {Object|null} Persona data or null
 */
function getCrosstalkPersona(messageId) {
    try {
        if (!fs.existsSync(CROSSTALK_MSG_MAP_PATH)) return null;
        const map = JSON.parse(fs.readFileSync(CROSSTALK_MSG_MAP_PATH, 'utf8'));
        return map[messageId] || null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full crosstalk pipeline: generate → gate → post → save → extract relationships.
 * @param {Object} client - Discord.js client
 * @returns {{ success: boolean, summary: string }}
 */
async function runPipeline(client) {
    let retries = 0;

    while (retries <= MAX_RETRIES) {
        try {
            // Generate
            logger.info(`[Crosstalk] Starting conversation generation (attempt ${retries + 1})`);
            const convo = await generateConversation();

            // Quality gate
            const gate = await qualityGate(convo.raw, convo.personas, convo.topic);

            if (gate.verdict === 'REJECT') {
                const state = loadState();
                state.totalRejected = (state.totalRejected || 0) + 1;
                saveState(state);

                if (retries < MAX_RETRIES) {
                    logger.info(`[Crosstalk] Rejected, retrying with new personas/topic...`);
                    retries++;
                    continue;
                }
                logger.warn(`[Crosstalk] Rejected after ${retries + 1} attempts, giving up for today`);
                return { success: false, summary: `Rejected: ${gate.reason || 'quality too low'}` };
            }

            // Post to Discord
            const finalText = gate.text;
            await postToDiscord(client, finalText, convo.personas, convo.lines);

            // Save to vault
            saveToVault(convo.personas, convo.topic, finalText, gate.verdict);

            // Extract relationships and character growth (async, don't block)
            extractRelationships(convo.personas, convo.lines).catch(err => {
                logger.warn(`[Crosstalk] Relationship extraction error: ${err.message}`);
            });
            distillCharacterGrowth(convo.personas, convo.lines).catch(err => {
                logger.warn(`[Crosstalk] Character growth error: ${err.message}`);
            });

            // Update state
            const state = loadState();
            state.totalGenerated = (state.totalGenerated || 0) + 1;
            saveState(state);

            const names = convo.personas.map(p => p.name).join(', ');
            const summary = `Crosstalk between ${names} — topic: "${convo.topic.opener}" (${gate.verdict})`;
            logger.info(`[Crosstalk] ${summary}`);
            return { success: true, summary };

        } catch (err) {
            logger.error(`[Crosstalk] Pipeline error: ${err.message}`, err);
            if (retries < MAX_RETRIES) {
                retries++;
                continue;
            }
            return { success: false, summary: `Error: ${err.message}` };
        }
    }

    return { success: false, summary: 'Max retries exceeded' };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

class CrosstalkScheduler {
    constructor(client) {
        this.client = client;
        this.isRunning = false;
        this.heartbeatInterval = null;
        this.state = loadState();
        this.isGenerating = false; // prevent overlapping runs
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // Schedule for today if needed
        this._ensureScheduled();

        // 60-second heartbeat
        this._tick();
        this.heartbeatInterval = setInterval(() => this._tick(), 60_000);
        logger.info('[Crosstalk] Scheduler started');
    }

    stop() {
        this.isRunning = false;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        logger.info('[Crosstalk] Scheduler stopped');
    }

    /**
     * Manual trigger (from /crosstalk command). Does NOT affect daily schedule.
     * @returns {{ success: boolean, summary: string }}
     */
    async trigger() {
        if (this.isGenerating) {
            return { success: false, summary: 'A crosstalk conversation is already being generated.' };
        }
        this.isGenerating = true;
        try {
            return await runPipeline(this.client);
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Ensure today has a scheduled time. If we haven't scheduled for today, pick a random time.
     */
    _ensureScheduled() {
        const today = todayDateKey();
        if (this.state.lastConversationDate === today) return; // already posted today

        // Pick a random time between 10 AM and 8 PM
        if (!this.state.scheduledHour || this.state._scheduledDate !== today) {
            this.state.scheduledHour = 10 + Math.floor(Math.random() * 10); // 10-19
            this.state.scheduledMinute = Math.floor(Math.random() * 60);
            this.state._scheduledDate = today;
            saveState(this.state);
            logger.info(`[Crosstalk] Scheduled today's conversation for ${this.state.scheduledHour}:${String(this.state.scheduledMinute).padStart(2, '0')}`);
        }
    }

    _tick() {
        if (!this.isRunning || this.isGenerating) return;

        const today = todayDateKey();

        // Already posted today
        if (this.state.lastConversationDate === today) return;

        // Ensure we have a scheduled time
        this._ensureScheduled();

        const { hour, minute } = nowInTz();

        // Check if it's past the scheduled time
        if (hour > this.state.scheduledHour ||
            (hour === this.state.scheduledHour && minute >= this.state.scheduledMinute)) {

            logger.info(`[Crosstalk] Scheduled time reached (${hour}:${String(minute).padStart(2, '0')}), generating conversation...`);

            this.isGenerating = true;
            runPipeline(this.client)
                .then(result => {
                    if (result.success) {
                        this.state.lastConversationDate = today;
                        saveState(this.state);
                    }
                })
                .catch(err => {
                    logger.error(`[Crosstalk] Scheduled run failed: ${err.message}`);
                })
                .finally(() => {
                    this.isGenerating = false;
                });
        }
    }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = CrosstalkScheduler;
module.exports.getCrosstalkPersona = getCrosstalkPersona;
module.exports.CROSSTALK_CHANNEL_ID = CROSSTALK_CHANNEL_ID;
// Test-only exports — used by tools/test-crosstalk.js for hidden sample generation
module.exports._test = { generateConversation, qualityGate };
