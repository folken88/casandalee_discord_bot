/**
 * Predict Train Command - Divinity-train arrival and dwell time
 * Rolls 2d40×5 min until arrival, 1d20×5 min stay; posts result to channel.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const diceRoller = require('../utils/diceRoller');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('predict-train')
        .setDescription('Predict when a divinity-train will stop at a location and how long it stays')
        .addStringOption(option =>
            option
                .setName('stop')
                .setDescription('Target train stop (e.g. Trauma Ward 40)')
                .setRequired(true)
        ),

    /**
     * Execute the predict-train command: roll 2d40×5 min arrival, 1d20×5 min dwell, reply in channel.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        const stopName = interaction.options.getString('stop').trim();
        logger.info('predict-train executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            stop: stopName
        });

        const arrivalRoll = diceRoller.roll('2d40');
        const dwellRoll = diceRoller.roll('1d20');
        const arrivalMinutes = arrivalRoll.total * 5;
        const dwellMinutes = dwellRoll.total * 5;

        const message = `${arrivalMinutes} minutes until the train stops at **${stopName}**, where it will stay for **${dwellMinutes}** minutes.`;

        const embed = new EmbedBuilder()
            .setColor(0x4a90d9)
            .setTitle('Divinity-train prediction')
            .setDescription(message)
            .addFields(
                {
                    name: 'Arrival',
                    value: `2d40 → ${arrivalRoll.rolls.join(' + ')} = **${arrivalRoll.total}** × 5 min = **${arrivalMinutes}** min`,
                    inline: true
                },
                {
                    name: 'Dwell',
                    value: `1d20 → **${dwellRoll.total}** × 5 min = **${dwellMinutes}** min`,
                    inline: true
                }
            )
            .setFooter({ text: 'Prediction only; train rejoins randomized circuit after departure.' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
