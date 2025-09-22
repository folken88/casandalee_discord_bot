const { SlashCommandBuilder } = require('discord.js');
const campaignContext = require('../utils/campaignContext');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('date')
        .setDescription('Get the current campaign date'),
    async execute(interaction) {
        logger.info('Date command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId
        });

        try {
            const currentDate = campaignContext.getCurrentDate();
            
            let response = `📅 **Current Campaign Date**\n\n`;
            response += `**Date:** ${currentDate.month} ${currentDate.year} AR (Absalom Reckoning)\n`;
            response += `**Source:** ${currentDate.source === 'timeline' ? 'Timeline (most recent event)' : 'Environment variables'}\n`;
            
            if (currentDate.source === 'timeline' && currentDate.lastEvent) {
                response += `**Based on:** "${currentDate.lastEvent.description}"\n`;
                response += `**Event Date:** ${currentDate.lastEvent.date} (${currentDate.lastEvent.location})\n`;
            }
            
            response += `\n*The current date is automatically updated based on the most recent event in the campaign timeline.*`;

            await interaction.reply(response);
            
        } catch (error) {
            logger.error('Error in date command:', error);
            await interaction.reply('❌ Error retrieving current date. Please try again later.');
        }
    }
};
