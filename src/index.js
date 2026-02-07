/**
 * Casandalee Discord Bot
 * A D&D campaign assistant bot for Discord
 */

const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import utility modules
const diceRoller = require('./utils/diceRoller');

const campaignContext = require('./utils/campaignContext');
const timelineSearch = require('./utils/timelineSearch');
const timelineCache = require('./utils/timelineCache');
const dossierManager = require('./utils/dossierManager');
const nameResolver = require('./utils/nameResolver');
const llmRouter = require('./utils/llmRouter');
const googleSheetsIntegration = require('./utils/googleSheetsIntegration');
const llmHandler = require('./utils/llmHandler');
const logger = require('./utils/logger');
const DailyHistoryScheduler = require('./utils/dailyHistory');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Create commands collection
client.commands = new Collection();

// Initialize daily history scheduler
let dailyHistoryScheduler;

// Load command files
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
        }
    }
}

// Bot ready event
client.once(Events.ClientReady, async readyClient => {
    logger.info(`🎲 Casandalee is ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`📅 Campaign Year: ${process.env.CAMPAIGN_YEAR || '4717'}`);
    logger.info(`🗓️  Campaign Month: ${process.env.CAMPAIGN_MONTH || 'April'}`);

    // Set bot avatar from local file
    try {
        const avatarPath = path.join(__dirname, '../data/avatar.png');
        if (fs.existsSync(avatarPath)) {
            await readyClient.user.setAvatar(avatarPath);
            logger.info('✅ Bot avatar updated from data/avatar.png');
        }
    } catch (avatarError) {
        // Rate limit or already set — not critical
        logger.warn('Could not update avatar (rate limit or unchanged):', avatarError.message);
    }

    // Initialize timeline search
    try {
        await timelineSearch.initialize();
        logger.info('✅ Timeline search initialized successfully');
    } catch (error) {
        logger.error('❌ Failed to initialize timeline search:', error);
    }
    
    // Initialize timeline cache with new-event notification
    try {
        const result = await timelineCache.rebuild();
        timelineCache.startCron((newEvents) => {
            logger.info(`Timeline cache detected ${newEvents.length} new events`);
            // TODO: Post notification to Discord channel
        });
        logger.info(`✅ Timeline cache initialized: ${result.totalEvents} events`);
    } catch (error) {
        logger.error('❌ Failed to initialize timeline cache:', error);
    }

    // Set up new-event notifications via Google Sheets
    try {
        googleSheetsIntegration.onNewEvents(async (newEvents) => {
            try {
                // Find the General channel to post notifications
                const guilds = readyClient.guilds.cache;
                for (const [, guild] of guilds) {
                    const generalChannel = guild.channels.cache.find(
                        ch => ch.name === 'general' && ch.isTextBased()
                    );
                    if (generalChannel) {
                        const embed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle('📜 New Timeline Events!')
                            .setDescription(`${newEvents.length} new event(s) added to the campaign timeline.`)
                            .setTimestamp();

                        const eventList = newEvents.slice(0, 5).map(e =>
                            `**${e.date}** (${e.location}): ${e.description?.substring(0, 150)}...`
                        ).join('\n\n');
                        embed.addFields({ name: 'Recent Additions', value: eventList.substring(0, 1024) });

                        if (newEvents.length > 5) {
                            embed.setFooter({ text: `...and ${newEvents.length - 5} more. Use /timeline to explore.` });
                        }

                        await generalChannel.send({ embeds: [embed] });
                        logger.info(`Posted ${newEvents.length} new event notifications to ${guild.name}/#general`);
                    }
                }
            } catch (notifyError) {
                logger.error('Error posting new event notification:', notifyError);
            }
        });
        logger.info('✅ New event notifications configured');
    } catch (error) {
        logger.error('❌ Failed to configure new event notifications:', error);
    }

    // Initialize dossier manager and register known characters
    try {
        // Register known party members with aliases
        nameResolver.registerBatch([
            { name: 'Nomkath', aliases: ['nom', 'nomkat', 'catfolk'] },
            { name: 'Tokala', aliases: ['tok', 'tokalla', 'half-orc'] },
            { name: 'Ulfred', aliases: ['ulf', 'ulfred', 'dwarf'] },
            { name: 'Meyanda', aliases: ['mey', 'meyanda', 'android'] },
            { name: 'Eldrin', aliases: ['eld', 'eldryn'] },
            { name: 'Olbryn', aliases: ['olb', 'olbrynn', 'drow'] },
            { name: 'Rhyaerca', aliases: ['rhy', 'rhyarca', 'rhyaerca'] },
            { name: 'Casandalee', aliases: ['cass', 'casandalee', 'goddess'] }
        ]);
        logger.info(`✅ Name resolver initialized with ${nameResolver.getAllNames().length} names`);
        logger.info(`✅ Dossier manager loaded ${dossierManager.getAllNames().length} dossiers`);
    } catch (error) {
        logger.error('❌ Failed to initialize dossier/name systems:', error);
    }

    // Check LLM provider health
    try {
        const health = await llmRouter.checkHealth();
        logger.info('LLM Provider Health:', health);
    } catch (error) {
        logger.error('❌ Failed to check LLM health:', error);
    }

    // Initialize daily history scheduler
    try {
        dailyHistoryScheduler = new DailyHistoryScheduler(readyClient);
        dailyHistoryScheduler.start();
        // Make it accessible from the client for commands
        readyClient.dailyHistoryScheduler = dailyHistoryScheduler;
        logger.info('✅ Daily history scheduler started');
    } catch (error) {
        logger.error('❌ Failed to start daily history scheduler:', error);
    }
    
    logger.info(`Bot is ready and listening for commands`);
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    const startTime = Date.now();
    logger.logInteraction('Interaction Received', interaction);
    
    try {
        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.autocomplete) {
                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    logger.error(`Autocomplete error for ${interaction.commandName}:`, error);
                }
            }
            return;
        }
        
        if (!interaction.isChatInputCommand()) {
            logger.debug('Non-chat input command interaction ignored', { type: interaction.type });
            return;
        }

        const command = client.commands.get(interaction.commandName);
        logger.info(`Processing command: ${interaction.commandName}`, {
            commandName: interaction.commandName,
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            timestamp: new Date().toISOString()
        });

        if (!command) {
            logger.error(`❌ No command matching ${interaction.commandName} was found.`);
            return;
        }

        logger.info(`Executing command: ${interaction.commandName}`, {
            commandName: interaction.commandName,
            memoryBefore: process.memoryUsage(),
            uptime: process.uptime(),
            interactionAge: Date.now() - interaction.createdTimestamp
        });
        
        // Check if interaction is still valid (Discord has a 3-second timeout)
        if (Date.now() - interaction.createdTimestamp > 2500) {
            logger.warn('Interaction is close to timeout, responding quickly', {
                age: Date.now() - interaction.createdTimestamp,
                commandName: interaction.commandName
            });
        }
        
        // Add timeout protection for slow commands
        // Commands can declare a custom timeout (e.g., vision/LLM commands need more time)
        const timeoutMs = command.timeout || 5000;
        const commandPromise = command.execute(interaction);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Command execution timeout (${timeoutMs / 1000} seconds)`)), timeoutMs);
        });
        
        await Promise.race([commandPromise, timeoutPromise]);
        
        const executionTime = Date.now() - startTime;
        logger.logCommand(interaction.commandName, interaction, 'SUCCESS', null, {
            executionTime: executionTime,
            memoryAfter: process.memoryUsage()
        });
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`❌ Error executing ${interaction.commandName}:`, {
            error: error.message,
            stack: error.stack,
            executionTime: executionTime,
            memory: process.memoryUsage(),
            botState: {
                ready: client.isReady(),
                uptime: process.uptime()
            }
        });
        
        logger.logCommand(interaction.commandName, interaction, 'ERROR', error, {
            executionTime: executionTime,
            memory: process.memoryUsage()
        });
        
        const errorMessage = {
            content: '❌ There was an error while executing this command!',
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            logger.error('Failed to send error message to user:', {
                replyError: replyError.message,
                stack: replyError.stack,
                interactionId: interaction.id,
                commandName: interaction.commandName
            });
        }
    }
});

// Handle mentions and direct messages
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if bot is mentioned
    const isMentioned = message.mentions.has(client.user);
    
    if (isMentioned) {
        logger.info('Processing natural language query', {
            userId: message.author.id,
            username: message.author.username,
            content: message.content,
            isMentioned,
            channelId: message.channelId,
            guildId: message.guildId
        });
        
        try {
            // Extract the actual question/request
            let query = message.content;
            // Remove mention from query
            query = query.replace(/<@!?\d+>/g, '').trim();
            
            if (!query) {
                logger.info('Empty query received, sending greeting');
                await message.reply('Hello! I\'m Casandalee, your campaign assistant. How can I help you today?');
                return;
            }
            
            logger.info('Processing query with LLM', { query, username: message.author.username });
            
            // Show typing indicator
            await message.channel.sendTyping();
            
            // Process the query with LLM
            const response = await llmHandler.processQuery(query, message.author.username);
            
            logger.info('LLM response generated', { responseLength: response.length });
            
            // Send simple text response (no embed)
            await message.reply(response);
            logger.info('Natural language response sent successfully');
            
        } catch (error) {
            logger.error('Error processing message:', error);
            await message.reply('Sorry, I encountered an error processing your request. Please try again.');
        }
    }
});

// Track emoji reactions on bot messages
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
        // Ignore bot reactions
        if (user.bot) return;

        // Only track reactions on Cass's messages
        if (reaction.message.author?.id !== client.user?.id) return;

        const emoji = reaction.emoji.name || reaction.emoji.toString();
        const messageContent = reaction.message.content || '';

        // Try to identify which character this message is about
        const allNames = nameResolver.getAllNames();
        for (const name of allNames) {
            if (messageContent.toLowerCase().includes(name.toLowerCase())) {
                dossierManager.addEmojiReaction(name, emoji, user.username);
                logger.debug(`Emoji ${emoji} on message about ${name} by ${user.username}`);
                break;
            }
        }
    } catch (error) {
        logger.error('Error tracking emoji reaction:', error);
    }
});

// Comprehensive error handling
client.on('error', error => {
    logger.error('Discord client error:', error);
    logger.error('Bot state before error:', {
        ready: client.isReady(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection:', {
        reason: reason,
        promise: promise,
        stack: reason?.stack,
        botState: {
            ready: client.isReady(),
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception - Bot will crash:', {
        error: error.message,
        stack: error.stack,
        botState: {
            ready: client.isReady(),
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
    
    // Try to save state before crashing
    try {
        logger.error('Attempting graceful shutdown...');
        client.destroy();
    } catch (shutdownError) {
        logger.error('Error during shutdown:', shutdownError);
    }
    
    process.exit(1);
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Set process title for easy identification
process.title = 'Casandalee-Discord-Bot';

// Log process information
logger.info('Bot process started', {
    pid: process.pid,
    title: process.title,
    nodeVersion: process.version,
    platform: process.platform,
    workingDirectory: process.cwd()
});

// Login to Discord
logger.info('Attempting to login to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    logger.error('Failed to login to Discord:', error);
    process.exit(1);
});


