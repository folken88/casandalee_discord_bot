/**
 * Index Characters Command
 * Discord slash command for managing the character index
 */

const { SlashCommandBuilder } = require('discord.js');
const characterSearch = require('../utils/characterSearch');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('index-characters')
        .setDescription('Manage the character index')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rebuild')
                .setDescription('Force rebuild the character index')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show character index statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check if character search is available')
        ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'rebuild':
                    await handleRebuild(interaction);
                    break;
                case 'stats':
                    await handleStats(interaction);
                    break;
                case 'status':
                    await handleStatus(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        ephemeral: true
                    });
            }

        } catch (error) {
            logger.error('Error in index-characters command:', error);
            
            const errorMessage = '❌ There was an error with the character index command.';
            
            if (interaction.replied) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};

/**
 * Handle rebuild subcommand
 */
async function handleRebuild(interaction) {
    await interaction.deferReply();

    try {
        logger.info('Character index rebuild requested');
        
        const startTime = Date.now();
        const index = await characterSearch.rebuildIndex();
        const duration = Date.now() - startTime;

        const stats = characterSearch.getIndexStats();
        
        let response = `✅ **Character index rebuilt successfully!**\n\n`;
        response += `📊 **Statistics:**\n`;
        response += `• **Total Characters:** ${stats.totalCharacters}\n`;
        response += `• **Total Worlds:** ${stats.totalWorlds}\n`;
        response += `• **Index Size:** ${stats.indexSize}\n`;
        response += `• **Build Time:** ${duration}ms\n`;
        response += `• **Last Update:** ${stats.lastUpdate}\n`;

        if (stats.worlds.length > 0) {
            response += `\n🌍 **Worlds Indexed:**\n`;
            stats.worlds.slice(0, 5).forEach(world => {
                response += `• ${world}\n`;
            });
            if (stats.worlds.length > 5) {
                response += `• ... and ${stats.worlds.length - 5} more worlds\n`;
            }
        }

        await interaction.editReply({ content: response });

    } catch (error) {
        logger.error('Error rebuilding character index:', error);
        await interaction.editReply({
            content: `❌ Error rebuilding character index: ${error.message}`
        });
    }
}

/**
 * Handle stats subcommand
 */
async function handleStats(interaction) {
    try {
        const stats = characterSearch.getIndexStats();
        
        let response = `📊 **Character Index Statistics**\n\n`;
        response += `• **Total Characters:** ${stats.totalCharacters}\n`;
        response += `• **Total Worlds:** ${stats.totalWorlds}\n`;
        response += `• **Index Size:** ${stats.indexSize}\n`;
        response += `• **Last Update:** ${stats.lastUpdate || 'Never'}\n`;

        if (stats.worlds.length > 0) {
            response += `\n🌍 **Indexed Worlds:**\n`;
            stats.worlds.slice(0, 10).forEach(world => {
                response += `• ${world}\n`;
            });
            if (stats.worlds.length > 10) {
                response += `• ... and ${stats.worlds.length - 10} more worlds\n`;
            }
        }

        await interaction.reply({ content: response });

    } catch (error) {
        logger.error('Error getting index stats:', error);
        await interaction.reply({
            content: `❌ Error getting index statistics: ${error.message}`,
            ephemeral: true
        });
    }
}

/**
 * Handle status subcommand
 */
async function handleStatus(interaction) {
    try {
        const isAvailable = characterSearch.isAvailable();
        
        if (isAvailable) {
            const stats = characterSearch.getIndexStats();
            let response = `✅ **Character Search Available**\n\n`;
            response += `• **Status:** Ready\n`;
            response += `• **Indexed Characters:** ${stats.totalCharacters}\n`;
            response += `• **Indexed Worlds:** ${stats.totalWorlds}\n`;
            response += `• **Last Update:** ${stats.lastUpdate || 'Never'}\n`;
            
            if (stats.totalCharacters === 0) {
                response += `\n💡 **Tip:** Run \`/index-characters rebuild\` to build the character index.`;
            }

            await interaction.reply({ content: response });
        } else {
            await interaction.reply({
                content: `❌ **Character Search Not Available**\n\n` +
                        `• **Status:** FoundryVTT data directory not accessible\n` +
                        `• **Check:** FOUNDRY_DATA_PATH environment variable\n` +
                        `• **Tip:** Ensure Docker has read-only access to FoundryVTT data`,
                ephemeral: true
            });
        }

    } catch (error) {
        logger.error('Error checking character search status:', error);
        await interaction.reply({
            content: `❌ Error checking character search status: ${error.message}`,
            ephemeral: true
        });
    }
}



