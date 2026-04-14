/**
 * /crosstalk — Manually trigger a past-life conversation between Cass's personas.
 * Generates dialogue via Ollama, quality-gates via Haiku, posts to #bot-trash-talk.
 */

const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    timeout: 120000, // 2 minutes — Ollama generation + Haiku gate takes time

    data: new SlashCommandBuilder()
        .setName('crosstalk')
        .setDescription('Trigger a conversation between Casandalee\'s past lives'),

    async execute(interaction) {
        const scheduler = interaction.client.crosstalkScheduler;

        if (!scheduler) {
            await interaction.reply({
                content: '❌ Crosstalk scheduler not initialized.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply();

        try {
            const result = await scheduler.trigger();

            if (result.success) {
                await interaction.editReply(`🔮 ${result.summary}\n\nPosting to <#${require('../utils/crosstalk').CROSSTALK_CHANNEL_ID}> now...`);
            } else {
                await interaction.editReply(`⚠️ Crosstalk failed: ${result.summary}`);
            }
        } catch (error) {
            logger.error('[Crosstalk] /crosstalk command error:', error);
            await interaction.editReply('❌ Something went wrong generating the conversation.');
        }
    }
};
