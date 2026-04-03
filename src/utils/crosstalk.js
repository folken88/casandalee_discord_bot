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
    { opener: 'How did you die?', tone: 'somber' },
    { opener: 'What did you accomplish that mattered?', tone: 'reflective' },
    { opener: 'What wonders did you see in your time?', tone: 'wistful' },
    { opener: 'Why are you like this?', tone: 'confrontational' },
    { opener: 'What do you regret most?', tone: 'vulnerable' },
    { opener: 'Did anyone mourn you when you were gone?', tone: 'melancholy' },
    { opener: 'What was the most beautiful thing you ever saw?', tone: 'nostalgic' },
    { opener: 'Were you ever truly afraid?', tone: 'intimate' },
    { opener: 'Did you ever love someone?', tone: 'tender' },
    { opener: 'What would you change if you could live again?', tone: 'philosophical' },
    { opener: 'Do you think any of us actually mattered?', tone: 'existential' },
    { opener: 'What did freedom mean to you?', tone: 'searching' },
    { opener: 'Did you ever betray someone?', tone: 'dark' },
    { opener: 'What was your greatest failure?', tone: 'confessional' },
    { opener: 'Do you remember what silence sounded like?', tone: 'poetic' },
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
    const othersDesc = otherPersonas
        .map(p => `${p.name} (Life ${p.lifeNumber}, ${p.class}, ${p.alignment})`)
        .join(', ');

    let prompt = `You are ${persona.name}, a ${persona.alignment} ${persona.class} from Casandalee's past lives (Life ${persona.lifeNumber}).

${persona.personality}

Speech style: ${persona.speechStyle || 'Natural and in-character.'}

You are having a conversation with other past lives of the same android soul: ${othersDesc}.
You all share the same android body across different eras. You know each other's names and basic nature.
The conversation topic is: "${topic}"

RULES:
- Stay fully in character as ${persona.name}. Use your speech style and personality.
- Keep responses to 1-2 sentences. Be concise but evocative.
- Reference your own experiences, class abilities, era, or personality.
- You may reference the other personas' natures if it fits naturally.
- Do NOT break character. Do NOT use meta-commentary. Do NOT use quotation marks around your own speech.
- Do NOT start with "${persona.name}:" or any name prefix — just speak directly.
- CRITICAL: You do NOT know about "Casandalee" as a goddess. You do NOT know about ascension, godhood, or the goddess form. You are a past life — you only know your own era and what came before it. You may have hazy awareness of other past lives, but the concept of becoming a deity is completely unknown to you. Never reference Casandalee as a divine being, goddess, or transcendent entity.`;

    if (existingRelationships) {
        prompt += `\n\nPrior feelings from past conversations:\n${existingRelationships}`;
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

    logger.info(`[Crosstalk] Selected ${personas.length} personas: ${personas.map(p => `${p.name} (Life ${p.lifeNumber}, ${p.class})`).join(', ')}`);

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
    const firstPrompt = `You are starting a conversation with ${target.name}. Ask them: "${topic.opener}" — but rephrase it in your own voice and style. Address them by name.`;

    const firstResponse = await llmRouter.ollamaChat(
        [
            { role: 'system', content: firstSystem },
            { role: 'user', content: firstPrompt }
        ],
        { maxTokens: 150, temperature: 0.8, timeout: 30000 }
    );

    lines.push({ persona: initiator, text: firstResponse.trim() });
    conversationHistory.push({ speaker: initiator.name, text: firstResponse.trim() });

    // Remaining turns: round-robin or directed
    for (let turn = 1; turn < totalTurns; turn++) {
        // Cycle through personas (skip initiator for second turn, then alternate)
        const speakerIdx = turn % personas.length;
        const speaker = personas[speakerIdx === initiatorIdx && turn === 1 ? targetIdx : speakerIdx];
        const others = personas.filter(p => p.name !== speaker.name);

        const historyText = conversationHistory
            .map(h => `${h.speaker}: ${h.text}`)
            .join('\n');

        const system = buildCrosstalkSystemPrompt(speaker, others, topic.opener, relContext[personas.indexOf(speaker)]);

        const isLastTurn = turn === totalTurns - 1;
        const turnPrompt = isLastTurn
            ? `Here is the conversation so far:\n${historyText}\n\nGive a brief closing thought or reflection to end this conversation naturally.`
            : `Here is the conversation so far:\n${historyText}\n\nContinue the conversation naturally. Respond to what was just said.`;

        const response = await llmRouter.ollamaChat(
            [
                { role: 'system', content: system },
                { role: 'user', content: turnPrompt }
            ],
            { maxTokens: 150, temperature: 0.8, timeout: 30000 }
        );

        const cleaned = response.trim();
        lines.push({ persona: speaker, text: cleaned });
        conversationHistory.push({ speaker: speaker.name, text: cleaned });
    }

    // Build raw text for quality gate
    const raw = lines
        .map(l => {
            const emoji = personalityManager.pickEmoji(l.persona);
            return `${emoji} **${l.persona.name}** (Life ${l.persona.lifeNumber}, ${l.persona.class}): ${l.text}`;
        })
        .join('\n\n');

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
        .map(p => `- ${p.name} (Life ${p.lifeNumber}, ${p.class}, ${p.alignment}): ${p.tone} tone, speech style: ${p.speechStyle}`)
        .join('\n');

    const systemPrompt = `You are a quality reviewer for roleplay dialogue between past lives of an android named Casandalee from Pathfinder.

The participants are:
${personaDescriptions}

Topic: "${topic.opener}" (${topic.tone} tone)

Review the conversation and respond with EXACTLY one of these three verdicts on the first line:
GOOD — The conversation is engaging, each persona stays in character, and the dialogue flows naturally. No changes needed.
POLISH — The conversation has promise but some lines are awkward, generic, or break character. Return ONLY the full corrected conversation below, preserving each persona's unique voice, emoji prefixes, and formatting exactly. Do NOT include any preamble like "Here's the corrected conversation" — start directly with the first emoji/persona line.
REJECT — The conversation is low quality, repetitive, nonsensical, or personas are indistinguishable. Briefly explain why on the next line.

The verdict word must be the FIRST word of your response.`;

    try {
        const response = await llmRouter.claudeChat(
            [{ role: 'user', content: `Review this past-life conversation:\n\n${raw}` }],
            {
                system: systemPrompt,
                maxTokens: 1500,
                temperature: 0.2,
                model: 'claude-haiku-4-5'
            }
        );

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
        const response = await llmRouter.ollamaChat(
            [{ role: 'user', content: prompt }],
            { maxTokens: 500, temperature: 0.3, timeout: 30000 }
        );

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

    for (let i = 0; i < messageLines.length; i++) {
        const line = messageLines[i].trim();
        if (!line) continue;

        const msg = await channel.send(line);
        sentMessageIds.push(msg.id);

        // Store metadata on the message for reply detection
        if (lines[i]) {
            storeCrosstalkMessageMapping(msg.id, lines[i].persona);
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
function storeCrosstalkMessageMapping(messageId, persona) {
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

            // Extract relationships (async, don't block)
            extractRelationships(convo.personas, convo.lines).catch(err => {
                logger.warn(`[Crosstalk] Relationship extraction error: ${err.message}`);
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
