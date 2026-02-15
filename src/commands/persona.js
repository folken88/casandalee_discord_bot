/**
 * Persona Command - Show which personality (past life or goddess) Casandalee is currently in
 */

const { SlashCommandBuilder } = require('discord.js');
const llmHandler = require('../utils/llmHandler');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('persona')
        .setDescription('Ask Casandalee who she is right now (which of her 72 lives or goddess form)'),

    async execute(interaction) {
        logger.info('Persona command executed', {
            userId: interaction.user.id,
            username: interaction.user.username
        });

        try {
            const response = llmHandler.handlePersonalityQuery('');
            await interaction.reply(response);
        } catch (error) {
            logger.error('Error in persona command:', error);
            await interaction.reply({
                content: 'I had trouble answering that. Try again in a moment.',
                ephemeral: true
            }).catch(() => {});
        }
    }
};
