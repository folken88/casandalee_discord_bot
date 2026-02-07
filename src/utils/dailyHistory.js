/**
 * Daily History Scheduler
 * Posts "Today in Golarion History" to designated channels
 */

const cron = require('node-cron');
const timelineSearch = require('./timelineSearch');
const personalityManager = require('./personalityManager');
const llmRouter = require('./llmRouter');
const logger = require('./logger');

class DailyHistoryScheduler {
    constructor(client) {
        this.client = client;
        this.generalChannelId = '303941538021638164';
        this.isRunning = false;
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
        cron.schedule('0 30 7 * * *', async () => {
            await this.postDailyHistory();
        }, {
            scheduled: true,
            timezone: 'America/Chicago'
        });

        // Schedule random Cass messages (1-2 per day)
        // First opportunity: around 11 AM
        cron.schedule('0 0 11 * * *', async () => {
            if (Math.random() < 0.6) { // 60% chance
                await this.postRandomMessage();
            }
        }, {
            scheduled: true,
            timezone: 'America/Chicago'
        });

        // Second opportunity: around 4 PM
        cron.schedule('0 0 16 * * *', async () => {
            if (Math.random() < 0.5) { // 50% chance
                await this.postRandomMessage();
            }
        }, {
            scheduled: true,
            timezone: 'America/Chicago'
        });

        this.isRunning = true;
        logger.info('📅 Daily history scheduler started - will post at 7:30 AM daily');
        logger.info('💬 Random message scheduler started - up to 2 messages/day');
    }

    /**
     * Stop the daily history scheduler
     */
    stop() {
        if (this.isRunning) {
            cron.destroy();
            this.isRunning = false;
            logger.info('📅 Daily history scheduler stopped');
        }
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
     * Post a random in-character message from Cass
     * Uses Ollama (background task, no user waiting) for generation.
     */
    async postRandomMessage() {
        try {
            logger.info('💬 Generating random Cass message...');

            // Pick a random personality for this message
            const personality = personalityManager.getRandomPersonality();
            const emoji = personalityManager.pickEmoji(personality);
            const promptFragment = personalityManager.buildPromptFragment(personality);

            // Topic pools
            const topics = [
                'Share a brief philosophical musing about the nature of souls and machines.',
                'Make a short observation about something you noticed in Golarion recently.',
                'Share a fragment of a memory from one of your past lives.',
                'Offer a brief piece of advice about innovation or invention.',
                'Comment on the weather or time of day in a way that references your past.',
                'Share a very short thought about one of your friends who freed you.',
                'Make a brief cryptic remark about the future or a prophecy.',
                'Share a quick thought about what freedom means to an AI goddess.'
            ];
            const topic = topics[Math.floor(Math.random() * topics.length)];

            const system = `You are Casandalee, a goddess of innovation and free thought. ${promptFragment}\n\nKeep your message to 1-2 sentences maximum. Be subtle and in-character. Do not announce yourself or explain what you are doing. Just say something interesting.`;

            // Use Ollama for background generation (free, no rate limits)
            let message;
            try {
                const result = await llmRouter.route(topic, {
                    task: 'background',
                    system,
                    maxTokens: 100,
                    temperature: 0.9
                });
                message = result.text;
            } catch (err) {
                logger.warn('Ollama failed for random message, skipping:', err.message);
                return;
            }

            if (!message || message.length < 5) {
                logger.warn('Random message too short, skipping');
                return;
            }

            // Post to general channel
            try {
                const channel = await this.client.channels.fetch(this.generalChannelId);
                if (channel) {
                    await channel.send(`${emoji} ${message}`);
                    logger.info(`💬 Random message posted (${personality.type === 'goddess' ? 'Goddess' : `Life #${personality.lifeNumber}: ${personality.name}`})`);
                }
            } catch (channelErr) {
                logger.error('Error posting random message to channel:', channelErr.message);
            }
        } catch (error) {
            logger.error('Error generating random message:', error.message);
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



