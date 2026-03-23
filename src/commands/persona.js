/**
 * Persona Command - View or force-switch Casandalee's current personality (72 lives or goddess form)
 */

const { SlashCommandBuilder } = require('discord.js');
const llmHandler = require('../utils/llmHandler');
const personalityManager = require('../utils/personalityManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('persona')
        .setDescription('View or switch Casandalee\'s current personality (72 lives or goddess form)')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('See who Cass is right now (which life or goddess form)')
        )
        .addSubcommand(sub =>
            sub.setName('switch')
                .setDescription('Force Cass to switch to a different random persona (lasts 1d10 responses)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        logger.info('Persona command executed', {
            subcommand,
            userId: interaction.user.id,
            username: interaction.user.username
        });

        try {
            if (subcommand === 'switch') {
                const newPersonality = personalityManager.forceSwitchToRandom();
                const emoji = personalityManager.pickEmoji(newPersonality);
                const count = personalityManager.switchThreshold;
                let who;
                if (newPersonality.type === 'goddess') {
                    who = '**Goddess form**';
                } else {
                    who = `**${newPersonality.name}** (Life #${newPersonality.lifeNumber}, ${newPersonality.alignment} ${newPersonality.class})`;
                }
                await interaction.reply({
                    content: `${emoji} Casandalee shifts into a new persona: ${who}.\nShe'll stay in this one for the next **${count}** response${count !== 1 ? 's' : ''}, then may switch again.`
                });
                return;
            }

            // view (default)
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
