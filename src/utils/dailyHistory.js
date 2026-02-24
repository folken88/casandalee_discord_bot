/**
 * Daily History Scheduler
 * Posts "Today in Golarion History" to designated channels
 */

const cron = require('node-cron');
const timelineSearch = require('./timelineSearch');
const personalityManager = require('./personalityManager');
const { getAlignmentEmojiForGuild } = require('./alignmentEmoji');
const { appendTimelineEntityEmojis } = require('./timelineEmoji');
const logger = require('./logger');

/**
 * Generate one random in-character message using a timeline quote from a past life.
 * Used by scheduled daily posts and by /memory command.
 * @param {import('discord.js').Client} [client] - Discord client; if provided, server alignment emoji is included when available
 * @returns {Promise<string|null>} Message content including emoji, or null on failure
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
        const quoteText = useOneLiner && hasLines
            ? personality.oneLiners[Math.floor(Math.random() * personality.oneLiners.length)].trim()
            : personality.timelineQuote.trim();

        const emoji = personalityManager.pickEmoji(personality);
        const displayName = personality.name || 'Cass';
        const yearLabel = personality.birthYear != null ? String(personality.birthYear) : `life ${personality.lifeNumber}`;
        const message = `${displayName} ${yearLabel}, ${quoteText}`;
        logger.info(`💬 Using timeline quote for ${displayName} ${yearLabel}`);

        if (!message || message.length < 5) {
            logger.warn('Random message too short, skipping');
            return null;
        }

        let prefix = emoji;
        let guild = null;
        if (client) {
            const guildId = process.env.GUILD_ID;
            guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : null;
            if (guild && personality.alignment) {
                const alignmentEmoji = getAlignmentEmojiForGuild(guild, personality.alignment);
                if (alignmentEmoji) prefix = `${alignmentEmoji} ${emoji}`;
            }
        }
        let out = `${prefix} ${message}`;
        if (guild && quoteText) out = appendTimelineEntityEmojis(out, guild, quoteText);
        return out;
    } catch (error) {
        logger.error('Error generating random message:', error.message);
        return null;
    }
}

class DailyHistoryScheduler {
    constructor(client) {
        this.client = client;
        this.generalChannelId = '303941538021638164';
        this.isRunning = false;
        /** @type {NodeJS.Timeout[]} Timeouts for random daily quote posts (6am–6pm) */
        this.randomMessageTimeouts = [];
        this.dailyHistoryCron = null;
        this.sixAmCron = null;
    }

    /**
     * Start the daily history scheduler
     */
    start() {
        if (this.isRunning) {
            logger.warn('Daily history scheduler is already running');
            return;
        }

        // Schedule daily history at 7:30 AM
        this.dailyHistoryCron = cron.schedule('0 30 7 * * *', async () => {
            await this.postDailyHistory();
        }, {
            scheduled: true,
            timezone: 'America/Chicago'
        });

        // At 6 AM, schedule 1–2 random timeline-quote messages at random times between 6am and 6pm
        this.sixAmCron = cron.schedule('0 0 6 * * *', () => {
            this.scheduleTodaysRandomMessages();
        }, {
            scheduled: true,
            timezone: 'America/Chicago'
        });

        this.isRunning = true;
        logger.info('📅 Daily history scheduler started - will post at 7:30 AM daily');
        logger.info('💬 Random timeline-quote messages: 1–2 per day, random time between 6am–6pm');
    }

    /**
     * Schedule 1 or 2 random quote posts at random times between now (6am) and 6pm (12h window).
     */
    scheduleTodaysRandomMessages() {
        for (const id of this.randomMessageTimeouts) {
            clearTimeout(id);
        }
        this.randomMessageTimeouts = [];

        const numMessages = Math.random() < 0.5 ? 1 : 2;
        const twelveHoursMs = 12 * 60 * 60 * 1000;

        for (let i = 0; i < numMessages; i++) {
            const delayMs = Math.floor(Math.random() * twelveHoursMs);
            const id = setTimeout(async () => {
                await this.postRandomMessage();
                this.randomMessageTimeouts = this.randomMessageTimeouts.filter(t => t !== id);
            }, delayMs);
            this.randomMessageTimeouts.push(id);
        }

        logger.info(`💬 Scheduled ${numMessages} random timeline-quote message(s) between 6am–6pm`);
    }

    /**
     * Stop the daily history scheduler
     */
    stop() {
        if (!this.isRunning) return;
        for (const id of this.randomMessageTimeouts) {
            clearTimeout(id);
        }
        this.randomMessageTimeouts = [];
        if (this.dailyHistoryCron) this.dailyHistoryCron.destroy();
        if (this.sixAmCron) this.sixAmCron.destroy();
        this.dailyHistoryCron = null;
        this.sixAmCron = null;
        this.isRunning = false;
        logger.info('📅 Daily history scheduler stopped');
    }

    /**
     * Post today's historical events
     */
    async postDailyHistory() {
        try {
            logger.info('📅 Generating daily history post...');
            
            // Get today's date in Golarion format
            const todayEvents = await this.getTodaysEvents();
            
            if (todayEvents.length === 0) {
                logger.info('📅 No historical events found for today');
                return;
            }

            // Post to General channel
            await this.postToChannel(this.generalChannelId, todayEvents);
            
            logger.info(`📅 Posted ${todayEvents.length} historical events for today`);
            
        } catch (error) {
            logger.error('❌ Error posting daily history:', error);
        }
    }

    /**
     * Get historical events for today's date
     */
    async getTodaysEvents() {
        const today = new Date();
        const month = today.getMonth() + 1; // JavaScript months are 0-based
        const day = today.getDate();
        
        // Search for events on this month/day (any year)
        const searchQuery = `${month.toString().padStart(2, '0')}.${day.toString().padStart(2, '0')}`;
        
        logger.info(`📅 Searching for events on ${searchQuery}`);
        
        // Get all timeline events and filter by month/day
        const allEvents = timelineSearch.timeline || [];
        const todaysEvents = allEvents.filter(event => {
            if (!event.date) return false;
            
            // Parse the date to check month and day
            const eventDate = this.parseEventDate(event.date);
            if (!eventDate) return false;
            
            return eventDate.month === month && eventDate.day === day;
        });

        // Sort by year (most recent first)
        todaysEvents.sort((a, b) => {
            const yearA = this.parseEventDate(a.date)?.year || 0;
            const yearB = this.parseEventDate(b.date)?.year || 0;
            return yearB - yearA;
        });

        logger.info(`📅 Found ${todaysEvents.length} events for ${month}/${day}`);
        return todaysEvents;
    }

    /**
     * Parse event date to extract year, month, day
     */
    parseEventDate(dateString) {
        try {
            // Handle formats like "4707.01.16" or "4707.00.00"
            const parts = dateString.split('.');
            if (parts.length >= 2) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                const day = parts[2] ? parseInt(parts[2]) : 1; // Default to 1st if no day specified
                
                return { year, month, day };
            }
            return null;
        } catch (error) {
            logger.error('Error parsing event date:', error);
            return null;
        }
    }

    /**
     * Post events to a specific channel
     */
    async postToChannel(channelId, events) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                logger.error(`❌ Channel ${channelId} not found`);
                return;
            }

            // Create embed
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor(0x8B4513) // Brown color
                .setTitle('📜 Today in Golarion History')
                .setDescription(`Historical events that occurred on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`)
                .setTimestamp()
                .setFooter({ text: 'Casandalee Historical Archive' });

            // Add events (Discord has a limit of 25 fields)
            const maxEvents = Math.min(events.length, 10); // Limit to 10 for readability
            for (let i = 0; i < maxEvents; i++) {
                const event = events[i];
                const parsedDate = this.parseEventDate(event.date);
                const year = parsedDate ? parsedDate.year : 'Unknown';
                
                embed.addFields({
                    name: `${year} - ${event.location}`,
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

    /**
     * Post a random in-character message from Cass.
     * If the chosen personality has memory snippets, posts one as "Name (life#): snippet".
     * Otherwise uses Ollama to generate a short in-character message.
     */
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
            logger.error('Error posting random message to channel:', error.message);
        }
    }

    /**
     * Test the daily history feature (for manual testing)
     */
    async testDailyHistory() {
        logger.info('🧪 Testing daily history feature...');
        await this.postDailyHistory();
    }
}

module.exports = DailyHistoryScheduler;
module.exports.generateRandomMessageContent = generateRandomMessageContent;



