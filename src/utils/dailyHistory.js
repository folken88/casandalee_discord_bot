/**
 * Daily History Scheduler
 * Posts "Today in Golarion History" at 7:30 AM and 1–2 random timeline-quote
 * messages at random times between 6 AM and 6 PM (America/Chicago by default).
 *
 * Uses data/cache/daily-state.json to remember what was already done today so
 * restarts do NOT re-post or re-schedule things that already happened.
 */

const fs = require('fs');
const path = require('path');
const timelineSearch = require('./timelineSearch');
const personalityManager = require('./personalityManager');
const { getAlignmentEmojiForGuild } = require('./alignmentEmoji');
const { appendTimelineEntityEmojis } = require('./timelineEmoji');
const logger = require('./logger');

/** Timezone for daily post and quote schedule (needs tzdata in Docker Alpine). */
const DAILY_POST_TIMEZONE = process.env.DAILY_POST_TIMEZONE || 'America/Chicago';

const STATE_PATH = path.join(__dirname, '../../data/cache/daily-state.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the current date string (YYYY-MM-DD) in the configured timezone.
 * @returns {string}
 */
function todayDateKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_POST_TIMEZONE, dateStyle: 'short' }).format(new Date());
}

/**
 * Get current { hour, minute } in the configured timezone.
 * @returns {{ hour: number, minute: number }}
 */
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

/**
 * Milliseconds from now until 6 PM in the configured timezone (0 if already past).
 * @returns {number}
 */
function msUntil6pm() {
    const { hour, minute } = nowInTz();
    const nowMs = hour * 3600000 + minute * 60000;
    const sixPmMs = 18 * 3600000;
    return Math.max(0, sixPmMs - nowMs);
}

// ---------------------------------------------------------------------------
// Persistent state (survives restarts)
// ---------------------------------------------------------------------------

/**
 * Load daily state from disk.
 * @returns {{ dailyHistoryDate: string|null, randomMessagesDate: string|null }}
 */
function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        }
    } catch (err) {
        logger.warn('daily-state.json unreadable, starting fresh', { error: err.message });
    }
    return { dailyHistoryDate: null, randomMessagesDate: null };
}

/**
 * Save daily state to disk.
 * @param {{ dailyHistoryDate: string|null, randomMessagesDate: string|null }} state
 */
function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        logger.warn('Could not save daily-state.json', { error: err.message });
    }
}

// ---------------------------------------------------------------------------
// Random message generator (also used by /memory)
// ---------------------------------------------------------------------------

/**
 * Generate one random in-character message using a timeline quote from a past life.
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<string|null>}
 */
async function generateRandomMessageContent(client) {
    try {
        logger.info('💬 Generating random Cass message (timeline quote)...');
        const personality = personalityManager.getRandomPersonalityWithTimelineQuote();
        const hasQuote = personality?.timelineQuote && !personalityManager.constructor._isPlaceholderTimelineQuote(personality.timelineQuote);
        const hasLines = personality?.oneLiners?.length > 0;
        if (!personality || (!hasQuote && !hasLines)) {
            logger.warn('No personality with timeline quote or one-liners available, skipping');
            return null;
        }
        const useOneLiner = hasLines && (!hasQuote || Math.random() < 0.35);
        const quoteText = useOneLiner
            ? personality.oneLiners[Math.floor(Math.random() * personality.oneLiners.length)].trim()
            : personality.timelineQuote.trim();

        const emoji = personalityManager.pickEmoji(personality);
        const displayName = personality.name || 'Cass';
        const yearLabel = personality.birthYear != null ? String(personality.birthYear) : `life ${personality.lifeNumber}`;
        const message = `${displayName} ${yearLabel}, ${quoteText}`;

        if (!message || message.length < 5) {
            logger.warn('Random message too short, skipping');
            return null;
        }

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
        let out = `${prefix} ${message}`;
        if (guild && quoteText) out = appendTimelineEntityEmojis(out, guild, quoteText);
        logger.info(`💬 Using timeline quote for ${displayName} ${yearLabel}`);
        return out;
    } catch (error) {
        logger.error('Error generating random message:', error.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Scheduler class
// ---------------------------------------------------------------------------

class DailyHistoryScheduler {
    /**
     * @param {import('discord.js').Client} client
     */
    constructor(client) {
        this.client = client;
        this.generalChannelId = '303941538021638164';
        this.isRunning = false;
        /** @type {NodeJS.Timeout[]} */
        this.randomMessageTimeouts = [];
        /** @type {NodeJS.Timeout|null} */
        this.heartbeatInterval = null;
        this.state = loadState();
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    start() {
        if (this.isRunning) {
            logger.warn('Daily history scheduler is already running');
            return;
        }
        this.isRunning = true;
        logger.info(`📅 Daily history scheduler started - will post at 7:30 AM daily (${DAILY_POST_TIMEZONE})`);
        logger.info(`💬 Random timeline-quote messages: 1–2 per day, random time between 6am–6pm`);

        // Tick immediately (handles catch-up on startup), then every 60 seconds.
        // setInterval is far more reliable than node-cron for long-running processes;
        // it doesn't drift or silently stop after multi-day uptimes.
        this._tick();
        this.heartbeatInterval = setInterval(() => this._tick(), 60_000);
    }

    stop() {
        if (!this.isRunning) return;
        for (const id of this.randomMessageTimeouts) clearTimeout(id);
        this.randomMessageTimeouts = [];
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.isRunning = false;
        logger.info('📅 Daily history scheduler stopped');
    }

    // -------------------------------------------------------------------------
    // Heartbeat — runs every 60 s, decides what (if anything) to do right now
    // -------------------------------------------------------------------------

    /**
     * Called every 60 seconds. Checks the current local time and state to
     * decide whether to post the daily history or schedule random quotes.
     * Idempotent: daily-state.json prevents duplicate posts across restarts.
     */
    _tick() {
        const today = todayDateKey();
        const { hour, minute } = nowInTz();

        // 6 AM–6 PM window: schedule today's random quote(s) if not yet done
        if (hour >= 6 && hour < 18 && this.state.randomMessagesDate !== today) {
            logger.info('💬 Within 6am–6pm window: scheduling today\'s random quote(s) on startup');
            this._scheduleRandomMessages();
        }

        // Past 7:30 AM: post daily history if not yet done today
        const past730 = hour > 7 || (hour === 7 && minute >= 30);
        if (past730 && this.state.dailyHistoryDate !== today) {
            logger.info('📅 Past 7:30 AM: posting daily history on startup (catch-up)');
            this._runDailyHistory().catch(err => logger.error('📅 Daily history failed:', err));
        }
    }

    // -------------------------------------------------------------------------
    // Daily history
    // -------------------------------------------------------------------------

    async _runDailyHistory() {
        const today = todayDateKey();
        await this.postDailyHistory();
        this.state.dailyHistoryDate = today;
        saveState(this.state);
    }

    /** Public — also called by /daily-history post command. */
    async postDailyHistory() {
        try {
            logger.info('📅 Generating daily history post...');
            const todayEvents = await this.getTodaysEvents();
            if (todayEvents.length === 0) {
                logger.info('📅 No historical events found for today');
                return;
            }
            await this.postToChannel(this.generalChannelId, todayEvents);
            logger.info(`📅 Posted ${todayEvents.length} historical events for today`);
        } catch (error) {
            logger.error('❌ Error posting daily history:', error);
        }
    }

    // -------------------------------------------------------------------------
    // Random messages
    // -------------------------------------------------------------------------

    _scheduleRandomMessages() {
        // Clear any pending timeouts from a previous schedule attempt today
        for (const id of this.randomMessageTimeouts) clearTimeout(id);
        this.randomMessageTimeouts = [];

        const windowMs = msUntil6pm();
        if (windowMs < 60 * 1000) {
            logger.info('💬 Already past 6 PM or <1 min left; skipping random quote schedule');
            return;
        }

        const numMessages = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < numMessages; i++) {
            const delayMs = Math.floor(Math.random() * windowMs);
            const id = setTimeout(async () => {
                await this.postRandomMessage();
                this.randomMessageTimeouts = this.randomMessageTimeouts.filter(t => t !== id);
            }, delayMs);
            this.randomMessageTimeouts.push(id);
        }

        const today = todayDateKey();
        this.state.randomMessagesDate = today;
        saveState(this.state);
        logger.info(`💬 Scheduled ${numMessages} random quote(s) (window closes 6 PM ${DAILY_POST_TIMEZONE})`);
    }

    async postRandomMessage() {
        try {
            const content = await generateRandomMessageContent(this.client);
            if (!content) return;
            const channel = await this.client.channels.fetch(this.generalChannelId);
            if (channel) {
                await channel.send(content);
                logger.info('💬 Random message posted');
            }
        } catch (error) {
            logger.error('Error posting random message:', error.message);
        }
    }

    // -------------------------------------------------------------------------
    // Timeline helpers
    // -------------------------------------------------------------------------

    async getTodaysEvents() {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        const allEvents = timelineSearch.timeline || [];
        const todaysEvents = allEvents.filter(event => {
            if (!event.date) return false;
            const parsed = this.parseEventDate(event.date);
            return parsed && parsed.month === month && parsed.day === day;
        });
        todaysEvents.sort((a, b) => {
            const yA = this.parseEventDate(a.date)?.year || 0;
            const yB = this.parseEventDate(b.date)?.year || 0;
            return yB - yA;
        });
        logger.info(`📅 Found ${todaysEvents.length} events for ${month}/${day}`);
        return todaysEvents;
    }

    parseEventDate(dateString) {
        try {
            const parts = dateString.split('.');
            if (parts.length >= 2) {
                return {
                    year: parseInt(parts[0]),
                    month: parseInt(parts[1]),
                    day: parts[2] ? parseInt(parts[2]) : 1
                };
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    async postToChannel(channelId, events) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                logger.error(`❌ Channel ${channelId} not found`);
                return;
            }
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('📜 Today in Golarion History')
                .setDescription(`Historical events that occurred on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`)
                .setTimestamp()
                .setFooter({ text: 'Casandalee Historical Archive' });

            const maxEvents = Math.min(events.length, 10);
            for (let i = 0; i < maxEvents; i++) {
                const event = events[i];
                const parsed = this.parseEventDate(event.date);
                embed.addFields({
                    name: `${parsed?.year ?? 'Unknown'} - ${event.location}`,
                    value: `${event.description}`,
                    inline: false
                });
            }
            if (events.length > maxEvents) {
                embed.addFields({
                    name: 'Note',
                    value: `Showing ${maxEvents} of ${events.length} events. Use \`/timeline\` to search for more!`,
                    inline: false
                });
            }
            await channel.send({ embeds: [embed] });
        } catch (error) {
            logger.error('❌ Error posting to channel:', error);
        }
    }

    // -------------------------------------------------------------------------
    // Test / manual trigger (admin command)
    // -------------------------------------------------------------------------

    async testDailyHistory() {
        logger.info('🧪 Testing daily history feature...');
        await this.postDailyHistory();
    }
}

module.exports = DailyHistoryScheduler;
module.exports.generateRandomMessageContent = generateRandomMessageContent;
