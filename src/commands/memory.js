/**
 * Memory Command - Trigger a random in-character memory or thought from Casandalee
 */

const { SlashCommandBuilder } = require('discord.js');
const { generateRandomMessageContent } = require('../utils/dailyHistory');
const logger = require('../utils/logger');

module.exports = {
    /** LLM/background task can take a few seconds */
    timeout: 15000,

    data: new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Have Casandalee share a random memory or thought (from one of her 72 lives or goddess form)'),

    async execute(interaction) {
        logger.info('Memory command executed', {
            userId: interaction.user.id,
            username: interaction.user.username
        });

        try {
            await interaction.deferReply();
            const content = await generateRandomMessageContent();
            const toSend = (content && content.trim().length > 0)
                ? content.trim()
                : 'I couldn’t summon a memory right now. Try again in a moment.';
            await interaction.editReply(toSend);
        } catch (error) {
            logger.error('Error in memory command:', error);
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply('Something went wrong pulling up that memory. Try again later.');
                } else {
                    await interaction.reply({ content: 'Something went wrong pulling up that memory. Try again later.', ephemeral: true });
                }
            } catch (e) {
                logger.error('Memory command: could not send error reply', e);
            }
        }
    }
};
