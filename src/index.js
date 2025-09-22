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
const foundryIntegration = require('./utils/foundryIntegration');
const campaignContext = require('./utils/campaignContext');
const llmHandler = require('./utils/llmHandler');
const logger = require('./utils/logger');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Create commands collection
client.commands = new Collection();

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
client.once(Events.ClientReady, readyClient => {
    logger.info(`🎲 Casandalee is ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`📅 Campaign Year: ${process.env.CAMPAIGN_YEAR || '4717'}`);
    logger.info(`🗓️  Campaign Month: ${process.env.CAMPAIGN_MONTH || 'April'}`);
    logger.info(`Bot is ready and listening for commands`);
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    const startTime = Date.now();
    logger.logInteraction('Interaction Received', interaction);
    
    try {
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
        const commandPromise = command.execute(interaction);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Command execution timeout (5 seconds)')), 5000);
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


