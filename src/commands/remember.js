/**
 * /remember command for Casandalee
 * Players teach the bot a fact to keep in a permanent knowledge bank (data/learned-facts.txt).
 * Facts are injected into the LLM context so Cass can recall them in conversation.
 */

const { SlashCommandBuilder } = require('discord.js');
const learnedFacts = require('../utils/learnedFacts');

const MAX_LENGTH = 400;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remember')
        .setDescription('Teach Casandalee something to remember (stored in her knowledge bank)')
        .addStringOption(option =>
            option.setName('fact')
                .setDescription('e.g. "Captain Oblivious is an alias for Holden" or "The party left the ship at Port Peril"')
                .setRequired(true)
                .setMaxLength(MAX_LENGTH)
        ),

    /**
     * Execute the /remember command
     * @param {Object} interaction - Discord command interaction
     */
    async execute(interaction) {
        const fact = interaction.options.getString('fact').trim();
        if (!fact) {
            await interaction.reply({
                content: 'Please provide something to remember (e.g. "Captain Oblivious is an alias for Holden").',
                ephemeral: true
            });
            return;
        }

        const added = learnedFacts.addFact(fact);
        const count = learnedFacts.getCount();

        if (added) {
            await interaction.reply({
                content: `I'll remember that. (${count} fact${count !== 1 ? 's' : ''} in my knowledge bank. You can edit \`data/learned-facts.txt\` to curate.)`
            });
        } else {
            await interaction.reply({
                content: `I already had that (or something very similar) in my knowledge bank. (${count} facts stored.)`,
                ephemeral: true
            });
        }
    }
};
