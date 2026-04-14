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
const discordUserMap = require('./utils/discordUserMap');
const logger = require('./utils/logger');
const personalityManager = require('./utils/personalityManager');
const DailyHistoryScheduler = require('./utils/dailyHistory');
const CrosstalkScheduler = require('./utils/crosstalk');
const { getCrosstalkPersona, CROSSTALK_CHANNEL_ID } = require('./utils/crosstalk');
const serverSchedule = require('./utils/serverSchedule');
const YouTubeTranscriptProcessor = require('./utils/youtubeTranscriptProcessor');
const conversationLogger = require('./utils/conversationLogger');
const dripSummarizer = require('./utils/dripSummarizer');
const vaultSearch = require('./utils/vaultSearch');

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

// Initialize YouTube transcript processor
let youtubeProcessor;

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
        // Register all PCs, key NPCs, and deities across all campaigns
        nameResolver.registerBatch([
            // === Iron Gods PCs ===
            { name: 'Ulfred', aliases: ['ulf', 'ulfred', 'ulfred stronginthearm', 'stronginthearm', 'dwarf'] }, // Kip
            { name: 'Nomkath', aliases: ['nom', 'nomkat', 'nomkath', 'catfolk'] },       // Daemon
            { name: 'Mr Brow', aliases: ['brow', 'mr brow', 'mr. brow', 'augustus', 'augustus teabrow', 'mr augustus teabrow', 'teabrow'] }, // Enrique
            { name: 'Olbryn', aliases: ['olb', 'olbrynn', 'olbryn', 'drow'] },           // Josh
            { name: 'Akradenn', aliases: ['akrad', 'akradden', 'akradenn', 'akraden'] },  // Tim
            { name: 'Maginnis', aliases: ['maginnis', 'mcginnis', 'mcginniss', 'toca mcginnis'] }, // Hans
            { name: 'Luna', aliases: ['luna'] },                                          // Rye

            // === Skull & Shackles PCs ===
            { name: 'Holden', aliases: ['holden', 'holden aleistair', 'aleistair', 'captain oblivious'] }, // Kip
            { name: 'Storgrim', aliases: ['storgrim', 'stor', 'stor grim', 'store grim', 'storgrim thunderbeard', 'thunderbeard'] }, // Daemon
            { name: 'Sha-Feng', aliases: ['sha-feng', 'shafeng', 'sha feng', 'sha'] },   // Enrique
            { name: 'Ser-Toche', aliases: ['ser-toche', 'sertoche', 'ser toche', 'toche'] }, // Josh
            { name: 'Vaughan', aliases: ['vaughan', 'lil vaughan', 'lil vaughn'] },        // Tim
            { name: 'Riviera', aliases: ['riviera'] },                                     // Rye (early)
            { name: 'Towa', aliases: ['towa', 'towa hershel', 'hershel'] },               // Rye (later)
            { name: 'Bujon', aliases: ['bujon', 'bujon storm of cheliax', 'storm of cheliax'] }, // Graham
            { name: 'Rhyarca', aliases: ['rhy', 'rhyaerca', 'rhyarca', 'rhyarca jillyr', 'jillyr'] }, // Mandi

            // === Carrion Crown PCs ===
            { name: 'Gaspar', aliases: ['gaspar', 'william gaspar', 'william'] },          // Tim
            { name: 'Kovira', aliases: ['kovira'] },                                       // Sydney
            { name: 'Kai', aliases: ['kai', 'kai gin'] },                                  // Graham
            { name: 'Elfrip', aliases: ['elfrip', 'elfrope', 'the elfrope'] },              // Anna
            { name: 'Dinvaya', aliases: ['dinvaya', 'denvaya', 'denva', 'dinvaya denva'] },   // Josh
            { name: 'Kate Blackwood', aliases: ['kate', 'kate-blackwood', 'blackwood', 'kate blackwood'] }, // Mandi
            { name: 'Rodney Danger Smith', aliases: ['rodney', 'rodney-danger-smith', 'danger smith', 'rds', 'rodney danger smith'] }, // Chris
            { name: 'Dismas', aliases: ['dismas', 'dismas aevrett', 'aevrett'] },          // Harrison

            // === Hells Rebels PCs ===
            { name: 'Celeb', aliases: ['celeb'] },                              // Tim
            { name: 'Femmick', aliases: ['femmick'] },                          // Harrison
            { name: 'Gabriel', aliases: ['gabriel', 'gabe'] },                  // Josh
            { name: 'Nigel', aliases: ['nigel'] },                              // Chris

            // === Hells Vengeance PCs ===
            { name: 'Jamal', aliases: ['jamal'] },                              // Tim
            { name: 'Draymus', aliases: ['draymus'] },                          // Harrison
            { name: 'Reese', aliases: ['reese'] },                              // Josh
            { name: 'Bruce', aliases: ['bruce'] },                              // Chris

            // === Enrique's previous Iron Gods characters ===
            { name: 'Gavrilo', aliases: ['gavrilo', 'gabrilo', 'gavrillo'] },     // Enrique IG char 1 (died)
            { name: 'Kroktah', aliases: ['kroktah', 'cckatha', 'kokta', 'krokta', 'coca'] }, // Enrique IG char 3 (died)

            // === Key NPCs & Deities (prevent fuzzy mismatches) ===
            { name: 'Casandalee', aliases: ['cass', 'casandalee', 'goddess'] },
            { name: 'Brigh', aliases: ['bry', 'brigh', 'goddess of invention'] },
            { name: 'Meyanda', aliases: ['mey', 'meyanda', 'android'] },
            { name: 'Tokala', aliases: ['tok', 'tokalla'] },
            { name: 'Eldrin', aliases: ['eld', 'eldryn'] },
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

    // Start crosstalk scheduler (past-life conversations)
    try {
        const crosstalkScheduler = new CrosstalkScheduler(readyClient);
        crosstalkScheduler.start();
        readyClient.crosstalkScheduler = crosstalkScheduler;
        logger.info('✅ Crosstalk scheduler started');
    } catch (error) {
        logger.error('❌ Failed to start crosstalk scheduler:', error);
    }

    // Start memory consolidation (daily review of conversation logs)
    try {
        conversationLogger.startConsolidationSchedule();
        logger.info('✅ Memory consolidation scheduler started');
    } catch (error) {
        logger.error('❌ Failed to start memory consolidation:', error);
    }

    // Watch personality files so edits in Obsidian take effect without restart
    try {
        const vaultDir = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../obsidian_cass/cassvault');
        const personalitiesDir = path.join(vaultDir, 'Personas');
        if (fs.existsSync(personalitiesDir)) {
            fs.watch(personalitiesDir, { recursive: false }, (eventType, filename) => {
                if (filename && filename.endsWith('.md')) {
                    logger.info(`Personality file changed: ${filename}, reloading...`);
                    personalityManager.reload();
                }
            });
            logger.info('✅ Watching vault Personas/ for changes');
        }
    } catch (error) {
        logger.warn('Could not watch personality directory:', error.message);
    }

    // Initialize vault search (Cass's brain) — force-build index on startup
    try {
        const vaultIndex = vaultSearch.buildIndex(true);
        logger.info(`✅ Vault search initialized: ${vaultIndex.length} notes indexed from ${vaultSearch.vaultDir}`);
        if (vaultIndex.length === 0) {
            logger.error('❌ CRITICAL: Vault index is empty! Cass has no memory. Check OBSIDIAN_VAULT_PATH and volume mounts.');
        }
    } catch (error) {
        logger.error('❌ Failed to initialize vault search:', error);
    }

    // Initialize YouTube transcript processor
    try {
        if (process.env.YOUTUBE_PLAYLIST_IDS) {
            youtubeProcessor = new YouTubeTranscriptProcessor();
            youtubeProcessor.start(readyClient);
            logger.info('✅ YouTube transcript processor started');
        }
    } catch (error) {
        logger.error('❌ Failed to start YouTube transcript processor:', error);
    }

    // Drip summarizer: process 2 unsummarized transcripts per day
    try {
        dripSummarizer.start();
    } catch (error) {
        logger.error('❌ Failed to start drip summarizer:', error);
    }

    // Silently load Discord server scheduled events into LLM context (no channel post on startup)
    const guildId = process.env.GUILD_ID?.trim();
    if (guildId) {
        readyClient.guilds.fetch(guildId)
            .then(guild => serverSchedule.updateFromGuild(guild))
            .catch(err => logger.warn('Server schedule initial fetch failed', { error: err.message }));
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

    // Handle replies to crosstalk messages — respond in character as that persona
    if (message.reference?.messageId) {
        const crosstalkPersona = getCrosstalkPersona(message.reference.messageId);
        if (crosstalkPersona) {
            try {
                // Use the same emoji that was used in the conversation, or fall back to first emoji
                const emoji = crosstalkPersona.conversationEmoji || crosstalkPersona.emojis?.[0] || '✨';
                const crosstalkEra = crosstalkPersona.birthYear != null ? `${crosstalkPersona.birthYear} AR` : `Life ${crosstalkPersona.lifeNumber}`;
                const systemPrompt = `You are ${crosstalkPersona.name}, a ${crosstalkPersona.alignment} ${crosstalkPersona.class} from Casandalee's past lives (${crosstalkEra}).

${crosstalkPersona.personality}

Speech style: ${crosstalkPersona.speechStyle || 'Natural and in-character.'}

Someone in the mortal world has replied to something you said. You are a past-life echo — respond briefly (1-3 sentences) in character. You are ${crosstalkPersona.tone} in tone. Be engaging but concise.`;

                const userText = message.content.trim();
                // Use Gemini (free, good at dialogue) for crosstalk replies.
                // Fall back to Ollama then Claude if needed.
                let response;
                try {
                    response = await llmRouter.geminiChat(
                        [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userText }
                        ],
                        { maxTokens: 200, temperature: 0.9, timeout: 30000 }
                    );
                } catch (geminiErr) {
                    logger.warn(`[Crosstalk] Reply Gemini failed (${geminiErr.message}), falling back to Ollama`);
                    try {
                        response = await llmRouter.ollamaChat(
                            [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userText }
                            ],
                            { maxTokens: 200, temperature: 0.7, timeout: 30000 }
                        );
                    } catch (ollamaErr) {
                        logger.warn(`[Crosstalk] Reply Ollama failed (${ollamaErr.message}), falling back to Claude`);
                        response = await llmRouter.claudeChat(
                            [{ role: 'user', content: userText }],
                            {
                                system: systemPrompt,
                                maxTokens: 200,
                                temperature: 0.7,
                                model: 'claude-haiku-4-5'
                            }
                        );
                    }
                }

                await message.reply(`${emoji} **${crosstalkPersona.name}:** ${response}`);
                logger.info(`[Crosstalk] Reply as ${crosstalkPersona.name} to ${message.author.username}`);
            } catch (err) {
                logger.error(`[Crosstalk] Reply handler error: ${err.message}`);
            }
            return; // Handled — don't fall through to mention handler
        }
    }

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
            
            // Use campaign-specific character name when in a campaign channel,
            // otherwise use player display name (e.g. "Graham") or Discord username
            const characterName = discordUserMap.getCharacterByDiscordId(message.author.id, message.channelId);
            const playerName = discordUserMap.getPlayerByDiscordId(message.author.id);
            const speakerName = characterName || playerName || message.author.username;
            logger.info('Processing query with LLM', { query, speakerName, playerName, characterName, userId: message.author.id });
            
            // Show typing indicator (refresh every 8s so it doesn't expire during LLM fallback)
            await message.channel.sendTyping();
            const typingInterval = setInterval(() => {
                message.channel.sendTyping().catch(() => {});
            }, 8000);

            try {
                // Process the query with LLM (Cass will address speaker by speakerName)
                const response = await llmHandler.processQuery(query, speakerName, message.author.id, message.channel.name);
                clearInterval(typingInterval);

                logger.info('LLM response generated', { responseLength: response.length });

                // Send simple text response (no embed)
                await message.reply(response);
                logger.info('Natural language response sent successfully');
            } catch (error) {
                clearInterval(typingInterval);
                logger.error('Error processing message:', error);
                await message.reply('Sorry, I encountered an error processing your request. Please try again.');
            }
        } catch (outerError) {
            logger.error('Error in message handler:', outerError);
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
    youtubeProcessor?.stop();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    youtubeProcessor?.stop();
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
client.login((process.env.DISCORD_TOKEN || '').trim()).catch(error => {
    logger.error('Failed to login to Discord:', error);
    process.exit(1);
});


