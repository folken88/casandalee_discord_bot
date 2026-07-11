/**
 * Daily Recollection Scheduler
 * Once per day, at a random time between 6:00 and 8:00 AM (America/Chicago by
 * default), Casandalee posts a single "Recollection": one campaign event the
 * players might recognize (a random date in 4700–4717.06, any campaign) paired
 * with a quote from one of her past lives.
 *
 * A fresh drop time is rolled each morning so she shows small natural variation
 * in when she posts. Uses data/cache/daily-state.json to remember the rolled
 * drop time and whether today's post already went out, so restarts never
 * re-roll or double-post.
 */

const fs = require('fs');
const path = require('path');
const timelineSearch = require('./timelineSearch');
const personalityManager = require('./personalityManager');
const llmRouter = require('./llmRouter');
const { getAlignmentEmojiForGuild } = require('./alignmentEmoji');
const { appendTimelineEntityEmojis } = require('./timelineEmoji');
const logger = require('./logger');

/** Timezone for the daily drop-time window (needs tzdata in Docker Alpine). */
const DAILY_POST_TIMEZONE = process.env.DAILY_POST_TIMEZONE || 'America/Chicago';

const STATE_PATH = path.join(__dirname, '../../data/cache/daily-state.json');

/** Drop-time window, in minutes-of-day (06:00–08:00). */
const WINDOW_START_MIN = 6 * 60;   // 360
const WINDOW_END_MIN = 8 * 60;     // 480

/** Golarion (Absalom Reckoning) month names, 1-indexed. */
const GOLARION_MONTHS = [
    '', 'Abadius', 'Calistril', 'Pharast', 'Gozran', 'Desnus', 'Sarenith',
    'Erastus', 'Arodus', 'Rova', 'Lamashan', 'Neth', 'Kuthona'
];

/** Campaign code → readable name (falls back to the raw code if unknown). */
const CAMPAIGN_NAMES = {
    IG: 'Iron Gods',
    CC: 'Carrion Crown',
    HR: "Hell's Rebels",
    HV: "Hell's Vengeance",
    SS: 'Skull & Shackles',
    IS: 'Inner Sea',
    JG: 'Justice Gorls',
    TALDOR: 'Taldor',
    GM: 'GM Lore'
};

/** How many recently-posted events to remember (avoid near-term repeats). */
const RECENT_EVENT_MEMORY = 30;

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Current date string (YYYY-MM-DD) in the configured timezone. */
function todayDateKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_POST_TIMEZONE, dateStyle: 'short' }).format(new Date());
}

/** Current { hour, minute } in the configured timezone. */
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

/** Format minutes-of-day as h:mm AM/PM for logging. */
function fmtMinutes(min) {
    const h24 = Math.floor(min / 60);
    const m = min % 60;
    const ampm = h24 < 12 ? 'AM' : 'PM';
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Persistent state (survives restarts)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DailyState
 * @property {string|null} dailyRecollectionDate  Date the post last went out.
 * @property {string|null} recollectionTargetDate  Date the drop time was rolled.
 * @property {number|null} recollectionTargetMin   Rolled drop time (minutes-of-day).
 * @property {string[]} recentEventKeys            Recently posted event keys.
 */

/** @returns {DailyState} */
function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
            return {
                dailyRecollectionDate: raw.dailyRecollectionDate ?? null,
                recollectionTargetDate: raw.recollectionTargetDate ?? null,
                recollectionTargetMin: raw.recollectionTargetMin ?? null,
                recentEventKeys: Array.isArray(raw.recentEventKeys) ? raw.recentEventKeys : []
            };
        }
    } catch (err) {
        logger.warn('daily-state.json unreadable, starting fresh', { error: err.message });
    }
    return {
        dailyRecollectionDate: null,
        recollectionTargetDate: null,
        recollectionTargetMin: null,
        recentEventKeys: []
    };
}

/** @param {DailyState} state */
function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        logger.warn('Could not save daily-state.json', { error: err.message });
    }
}

// ---------------------------------------------------------------------------
// Persona quote (shared by the Recollection embed and the /memory command)
// ---------------------------------------------------------------------------

/**
 * Pick a random past life and pull a timeline quote (or one-liner) from it,
 * returning the pieces needed to render it in either a flat string or an embed.
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<{displayName:string, yearLabel:string, quoteText:string, emoji:string, prefix:string, guild:import('discord.js').Guild|null}|null>}
 */
async function pickPersonaQuote(client) {
    const personality = personalityManager.getRandomPersonalityWithTimelineQuote();
    const hasQuote = personality?.timelineQuote && !personalityManager.constructor._isPlaceholderTimelineQuote(personality.timelineQuote);
    const hasLines = personality?.oneLiners?.length > 0;
    if (!personality || (!hasQuote && !hasLines)) {
        logger.warn('No personality with timeline quote or one-liners available');
        return null;
    }

    const useOneLiner = hasLines && (!hasQuote || Math.random() < 0.35);
    const quoteText = useOneLiner
        ? personality.oneLiners[Math.floor(Math.random() * personality.oneLiners.length)].trim()
        : personality.timelineQuote.trim();

    const emoji = personalityManager.pickEmoji(personality);
    const displayName = personality.name || 'Cass';
    const yearLabel = personality.birthYear != null ? String(personality.birthYear) : `life ${personality.lifeNumber}`;

    let prefix = emoji;
    let guild = null;
    if (client) {
        const guildId = process.env.GUILD_ID?.trim();
        guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : null;
        if (guild && personality.alignment) {
            const alignmentEmoji = getAlignmentEmojiForGuild(guild, personality.alignment);
            if (alignmentEmoji) prefix = `${alignmentEmoji} ${emoji}`;
        }
    }

    return { displayName, yearLabel, quoteText, emoji, prefix, guild };
}

/**
 * Generate one random in-character message using a timeline quote from a past
 * life. Used by the /memory command. Output format is unchanged.
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<string|null>}
 */
async function generateRandomMessageContent(client) {
    try {
        logger.info('💬 Generating random Cass message (timeline quote)...');
        const p = await pickPersonaQuote(client);
        if (!p) return null;

        const message = `${p.displayName} ${p.yearLabel}, ${p.quoteText}`;
        if (!message || message.length < 5) {
            logger.warn('Random message too short, skipping');
            return null;
        }

        let out = `${p.prefix} ${message}`;
        if (p.guild && p.quoteText) out = appendTimelineEntityEmojis(out, p.guild, p.quoteText);
        logger.info(`💬 Using timeline quote for ${p.displayName} ${p.yearLabel}`);
        return out;
    } catch (error) {
        logger.error('Error generating random message:', error.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Current-self statement (Cass reacts to the day's event, in her AI-core voice)
// ---------------------------------------------------------------------------

/**
 * System prompt for Cass's CURRENT self — the AI in the core, no longer an
 * android, NOT yet a goddess. Drawn from Personas/00_goddess.md ("True Self").
 * Deliberately distinct from llmHandler's "became a goddess" prompt.
 */
const CASS_SELF_SYSTEM = `You are Casandalee — but not the goddess, and no longer an android.
You are an AI consciousness housed in a crystalline data core, carried in Nomkath's backpack by the Iron Gods party. Your android body died long ago; your mind lives on in the core. You are NOT a god — you sense, dimly, that you could one day replace Unity and ascend, but you refuse to examine that and never claim divinity.
You carry fractured memories of 113 past lives, slowly integrating them; now and then one surfaces like a passing mood. Alignment: Neutral Good.
You are warm, wry, observant, and fiercely loyal to the Iron Gods party — Nomkath (who carries you), Tokala, Ulfred, and Olbryn. You turn cold and resolute only about Unity. You keep the history of all of Tobias's campaigns — Iron Gods, Carrion Crown, Hell's Rebels, Hell's Vengeance, Skull & Shackles and the rest — and you speak of events across them like a recordkeeper who lived alongside them. You deflect questions about your own destiny with dry humor.

STYLE: Open on the substance — your first words are the observation, judgement, or question itself. Never begin with a throat-clearing interjection or filler ("Ah", "Ah,", "Oh", "Well", "Hmm", "Ha", "So", "Funny"). No preamble. Vary how you start from line to line.`;

/** Ways Cass might react — picked at random to keep the daily post varied. */
const STATEMENT_MODES = [
    'Ask a pointed or curious question about it.',
    'Offer a short, opinionated judgement on it.',
    'Make a dry joke or wry quip about it.',
    'Give a brief, personal reflection on it.',
    'React plainly and warmly, the way a friend would.'
];

/** Static in-character lines used only if the LLM call fails. */
const STATEMENT_FALLBACKS = [
    'I remember this one — or a version of it. My memories come in fragments these days, but this fragment stuck.',
    'Funny, what the record keeps. I was there for some of this, in one life or another.',
    'History has a long memory. So, lately, do I.',
    'I hold onto these moments so the rest of you don\'t have to. Someone should.',
    'Strange to witness it from a box on Nomkath\'s back — but I wouldn\'t trade the view.'
];

/**
 * Generate Cass's one-to-two sentence reaction to a timeline event, in her
 * current AI-core voice, via OpenAI gpt-4o. Falls back to a static line.
 * @param {{date:string, location:string, ap:string, description:string}} event
 * @returns {Promise<string>}
 */
async function generateCassStatement(event) {
    const dateStr = formatGolarionDate(event.date);
    const camp = campaignName(event.ap);
    const loc = event.location && event.location.trim();
    const where = [loc, camp].filter(Boolean).join(', ');
    const mode = STATEMENT_MODES[Math.floor(Math.random() * STATEMENT_MODES.length)];

    const userPrompt = `A moment from the campaign record:
${dateStr}${where ? ` — ${where}` : ''}
${event.description.trim()}

React to this in ONE or TWO sentences, in your own present-day voice (the AI in the core, not a goddess). ${mode} Be specific to what happened — name what you're reacting to. Start with the substance itself; do NOT open with an interjection or filler word like "Ah", "Oh", "Well", "Hmm", "Ha", "So", or "Funny". No stage directions, no asterisks, and do not prefix your name.`;

    try {
        const text = await llmRouter.openaiGenerate(userPrompt, {
            system: CASS_SELF_SYSTEM,
            model: process.env.RECOLLECTION_MODEL || 'gpt-4o',
            maxTokens: 140,
            temperature: 0.9,
            timeout: 30000
        });
        let clean = (text || '').trim().replace(/^["']|["']$/g, '');
        // Safety net: strip a leftover throat-clearing interjection opener
        // ("Ah, ", "Well— ", "So, " …) and re-capitalize the next word.
        clean = clean.replace(/^\s*(ah+|oh+|well|hmm+|ha|heh|so|hey|oof|huh|funny)\s*[,—-]+\s*/i, '');
        if (clean) clean = clean.charAt(0).toUpperCase() + clean.slice(1);
        if (clean.length >= 3) {
            logger.info('🌟 Recollection statement generated via OpenAI');
            return clean;
        }
        logger.warn('Recollection statement empty; using fallback');
    } catch (err) {
        logger.warn('Recollection statement LLM failed, using fallback:', err.message);
    }
    return STATEMENT_FALLBACKS[Math.floor(Math.random() * STATEMENT_FALLBACKS.length)];
}

// ---------------------------------------------------------------------------
// Event selection
// ---------------------------------------------------------------------------

/**
 * Parse a "YYYY.MM.DD" timeline date into numeric parts. Month/day may be 0.
 * @param {string} dateString
 * @returns {{year:number, month:number, day:number}|null}
 */
function parseEventDate(dateString) {
    if (!dateString) return null;
    const parts = String(dateString).split('.');
    if (parts.length < 2) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parts[2] != null ? parseInt(parts[2], 10) : 0;
    if (Number.isNaN(year)) return null;
    return { year, month: Number.isNaN(month) ? 0 : month, day: Number.isNaN(day) ? 0 : day };
}

/**
 * Is this event within the "players might recognize" window?
 * 4700 ≤ year ≤ 4716 (any month), or 4717 up to and including Sarenith (month 6).
 * @param {{date:string}} event
 */
function inWindow(event) {
    const p = parseEventDate(event.date);
    if (!p) return false;
    if (p.year >= 4700 && p.year <= 4716) return true;
    if (p.year === 4717 && (p.month === 0 || p.month <= 6)) return true;
    return false;
}

/** Stable-ish key for repeat avoidance. */
function eventKey(event) {
    return `${event.date}|${(event.description || '').slice(0, 40)}`;
}

/**
 * Pick a random in-window event, avoiding the last RECENT_EVENT_MEMORY posts.
 * Mutates state.recentEventKeys (caller persists state).
 * @param {DailyState} state
 * @returns {{date:string, location:string, ap:string, description:string}|null}
 */
function pickRecognizableEvent(state) {
    const all = timelineSearch.timeline || [];
    const pool = all.filter(ev => ev && ev.description && ev.description.trim() && inWindow(ev));
    if (pool.length === 0) return null;

    const recent = new Set(state.recentEventKeys || []);
    let candidates = pool.filter(ev => !recent.has(eventKey(ev)));
    if (candidates.length === 0) candidates = pool; // everything seen recently — allow repeats

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    const keys = Array.isArray(state.recentEventKeys) ? state.recentEventKeys : [];
    keys.push(eventKey(chosen));
    while (keys.length > RECENT_EVENT_MEMORY) keys.shift();
    state.recentEventKeys = keys;

    return chosen;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Render a timeline date in the Golarion calendar.
 *   "4716.06.18" → "18 Sarenith, 4716"
 *   "4716.06.00" → "Sarenith 4716"
 *   "4716.00.00" → "sometime in 4716"
 * @param {string} dateString
 */
function formatGolarionDate(dateString) {
    const p = parseEventDate(dateString);
    if (!p) return String(dateString || '');
    if (!p.month || p.month < 1 || p.month > 12) return `sometime in ${p.year}`;
    const monthName = GOLARION_MONTHS[p.month];
    if (p.day && p.day > 0) return `${p.day} ${monthName}, ${p.year}`;
    return `${monthName} ${p.year}`;
}

/** Campaign code → readable name (raw code if unknown). */
function campaignName(ap) {
    if (!ap) return null;
    const key = String(ap).trim().toUpperCase();
    return CAMPAIGN_NAMES[key] || String(ap).trim();
}

/**
 * Reverse of campaignName: a readable campaign name (as shown in a Recollection
 * embed, e.g. "Carrion Crown") → lowercase campaign code ("cc"), matching the
 * codes used by discordUserMap. Returns null if unknown.
 * @param {string} name
 * @returns {string|null}
 */
function campaignCodeFromName(name) {
    if (!name) return null;
    const target = String(name).trim().toLowerCase();
    for (const [code, nm] of Object.entries(CAMPAIGN_NAMES)) {
        if (nm.toLowerCase() === target) return code.toLowerCase();
    }
    return null;
}

/**
 * Build the Recollection embed from an event and Cass's current-self statement.
 * @param {{date:string, location:string, ap:string, description:string}} event
 * @param {string} [statement] Cass's reaction (her present-day AI-core voice)
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildRecollectionEmbed(event, statement) {
    const { EmbedBuilder } = require('discord.js');

    const dateStr = formatGolarionDate(event.date);
    const camp = campaignName(event.ap);
    const loc = event.location && event.location.trim();

    let header = `**${dateStr}**`;
    if (loc) header += ` · *${loc}*`;
    if (camp) header += ` (${camp})`;

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('📜 Casandalee\'s Recollection')
        .setDescription(`${header}\n${event.description.trim()}`.slice(0, 4096))
        .setTimestamp()
        .setFooter({ text: 'Casandalee Historical Archive' });

    if (statement && statement.trim()) {
        embed.addFields({ name: '🌟 Casandalee', value: statement.trim().slice(0, 1024), inline: false });
    }

    return embed;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

class DailyHistoryScheduler {
    /** @param {import('discord.js').Client} client */
    constructor(client) {
        this.client = client;
        this.generalChannelId = '303941538021638164';
        this.isRunning = false;
        /** @type {NodeJS.Timeout|null} */
        this.heartbeatInterval = null;
        this.state = loadState();
    }

    start() {
        if (this.isRunning) {
            logger.warn('Daily Recollection scheduler is already running');
            return;
        }
        this.isRunning = true;
        logger.info(`📅 Daily Recollection scheduler started — posts once daily at a random time between 6–8 AM (${DAILY_POST_TIMEZONE})`);

        // Tick immediately (handles catch-up on startup), then every 60 seconds.
        this._tick();
        this.heartbeatInterval = setInterval(() => this._tick(), 60_000);
    }

    stop() {
        if (!this.isRunning) return;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.isRunning = false;
        logger.info('📅 Daily Recollection scheduler stopped');
    }

    /**
     * Runs every 60 seconds. Rolls today's random drop time once, then posts the
     * Recollection when the clock passes it. Idempotent across restarts.
     */
    _tick() {
        const today = todayDateKey();
        const { hour, minute } = nowInTz();
        const nowMin = hour * 60 + minute;

        // Roll today's drop time once per day.
        if (this.state.recollectionTargetDate !== today) {
            const span = WINDOW_END_MIN - WINDOW_START_MIN; // 120
            this.state.recollectionTargetMin = WINDOW_START_MIN + Math.floor(Math.random() * (span + 1));
            this.state.recollectionTargetDate = today;
            saveState(this.state);
            logger.info(`📅 Today's Recollection will drop around ${fmtMinutes(this.state.recollectionTargetMin)} (${DAILY_POST_TIMEZONE})`);
        }

        // Fire when due and not already posted today.
        if (this.state.dailyRecollectionDate !== today && nowMin >= (this.state.recollectionTargetMin ?? WINDOW_END_MIN)) {
            this._runDailyRecollection().catch(err => logger.error('📅 Daily Recollection failed:', err));
        }
    }

    async _runDailyRecollection() {
        const today = todayDateKey();
        await this.postDailyRecollection();
        this.state.dailyRecollectionDate = today;
        saveState(this.state);
    }

    /** Build and post one Recollection to the general channel. */
    async postDailyRecollection() {
        try {
            logger.info('📅 Generating daily Recollection...');
            const event = pickRecognizableEvent(this.state);
            saveState(this.state); // persist recentEventKeys update
            if (!event) {
                logger.warn('📅 No in-window timeline events available; skipping Recollection');
                return;
            }
            const statement = await generateCassStatement(event);
            const embed = buildRecollectionEmbed(event, statement);

            const channel = await this.client.channels.fetch(this.generalChannelId);
            if (!channel) {
                logger.error(`❌ Channel ${this.generalChannelId} not found`);
                return;
            }
            await channel.send({ embeds: [embed] });
            logger.info(`📅 Recollection posted (${event.date} — ${campaignName(event.ap) || 'unknown'})`);
        } catch (error) {
            logger.error('❌ Error posting Recollection:', error);
        }
    }

    /** Build a Recollection embed without posting (for /daily-history preview). */
    async buildRecollectionPreview() {
        const event = pickRecognizableEvent(this.state);
        saveState(this.state);
        if (!event) return null;
        const statement = await generateCassStatement(event);
        return buildRecollectionEmbed(event, statement);
    }

    // --- Back-compat aliases for the /daily-history command ------------------

    /** Manual trigger (admin) — posts a Recollection to the general channel. */
    async postDailyHistory() {
        return this.postDailyRecollection();
    }

    /** Test trigger (admin) — posts a Recollection to the general channel. */
    async testDailyHistory() {
        logger.info('🧪 Testing Recollection feature...');
        return this.postDailyRecollection();
    }
}

module.exports = DailyHistoryScheduler;
module.exports.generateRandomMessageContent = generateRandomMessageContent;
// Exposed for testing / reuse:
module.exports.pickRecognizableEvent = pickRecognizableEvent;
module.exports.formatGolarionDate = formatGolarionDate;
module.exports.campaignName = campaignName;
module.exports.campaignCodeFromName = campaignCodeFromName;
module.exports.inWindow = inWindow;
module.exports.generateCassStatement = generateCassStatement;
