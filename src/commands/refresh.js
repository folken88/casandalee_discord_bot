/**
 * Refresh Command - Manually refresh data from Google Sheets
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const googleSheetsIntegration = require('../utils/googleSheetsIntegration');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refresh')
        .setDescription('Refresh campaign data from Google Sheets')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of data to refresh')
                .setRequired(false)
                .addChoices(
                    { name: 'All Data', value: 'all' },
                    { name: 'Timeline Only', value: 'timeline' },
                    { name: 'Characters Only', value: 'characters' }
                )
        ),
    
    async execute(interaction) {
        logger.info('Refresh command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            type: interaction.options.getString('type') || 'all'
        });
        
        try {
            const type = interaction.options.getString('type') || 'all';
            
            // Check if Google Sheets integration is available
            if (!googleSheetsIntegration.isAvailable()) {
                await interaction.reply({
                    content: '❌ Google Sheets integration is not configured. Please check your environment variables.',
                    ephemeral: true
                });
                return;
            }
            
            // Show that we're working
            await interaction.deferReply();
            
            // Force refresh the data
            const success = await googleSheetsIntegration.forceRefresh();
            
            if (success) {
                const lastRefresh = googleSheetsIntegration.getLastRefresh();
                const timelineCount = googleSheetsIntegration.getCampaignTimeline().length;
                const characterCount = googleSheetsIntegration.getPlayerCharacters().length;
                
                const embed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Data Refreshed Successfully')
                    .addFields(
                        { name: 'Timeline Events', value: `${timelineCount} events loaded`, inline: true },
                        { name: 'Player Characters', value: `${characterCount} characters loaded`, inline: true },
                        { name: 'Last Refresh', value: lastRefresh ? lastRefresh.toLocaleString() : 'Unknown', inline: true }
                    )
                    .setFooter({ text: 'Data synchronized from Google Sheets' })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                
                logger.info('Data refresh completed successfully', {
                    timelineCount,
                    characterCount,
                    lastRefresh: lastRefresh?.toISOString()
                });
                
            } else {
                await interaction.editReply({
                    content: '❌ Failed to refresh data from Google Sheets. Please check the logs for details.'
                });
            }
            
        } catch (error) {
            logger.error('Error in refresh command:', error);
            await interaction.editReply({
                content: `❌ Error refreshing data: ${error.message}`
            });
        }
    }
};
