const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const llmHandler = require('../utils/llmHandler');
const logger = require('../utils/logger');

module.exports = {
    /** Custom timeout: LLM responses can take longer than 5s */
    timeout: 30000,

    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Casandalee anything about the campaign, rules, or world')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question for Casandalee')
                .setRequired(true)
        ),

    async execute(interaction) {
        logger.info('Ask command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            question: interaction.options.getString('question')
        });

        try {
            const question = interaction.options.getString('question');
            
            // Show typing indicator
            await interaction.deferReply();
            
            // Process with LLM
            const response = await llmHandler.processQuery(question, interaction.user.username);
            
            // Create simple response (no embed, just text)
            await interaction.editReply(response);
            
            logger.info('Ask command completed successfully');
            
        } catch (error) {
            logger.error('Error in ask command:', error);
            await interaction.editReply(`Sorry, I encountered an error: ${error.message}`);
        }
    }
};

