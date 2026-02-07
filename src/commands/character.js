/**
 * /character command for Casandalee
 * View a character's dossier — their race, class, notes, timeline mentions, roll history.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dossierManager = require('../utils/dossierManager');
const nameResolver = require('../utils/nameResolver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('character')
        .setDescription('View a character dossier')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Character name (fuzzy matched)')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    /**
     * Handle autocomplete for character name
     * @param {Object} interaction - Discord autocomplete interaction
     */
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const matches = nameResolver.search(focusedValue, 25);

        // Also include dossier names that might not be in the resolver
        const dossierNames = dossierManager.getAllNames();
        const allNames = [...new Set([...matches, ...dossierNames])];

        const filtered = allNames
            .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(name => ({ name, value: name }))
        );
    },

    /**
     * Execute the /character command
     * @param {Object} interaction - Discord command interaction
     */
    async execute(interaction) {
        const nameInput = interaction.options.getString('name');
        const canonical = nameResolver.resolve(nameInput);

        if (!canonical) {
            await interaction.reply({
                content: `I don't have a dossier for "${nameInput}". Try a different name or use /characterupdate to add information.`,
                ephemeral: true
            });
            return;
        }

        const dossier = dossierManager.getDossier(canonical);
        if (!dossier) {
            await interaction.reply({
                content: `I know the name "${canonical}" but don't have a dossier yet. Use /characterupdate to start building one!`,
                ephemeral: true
            });
            return;
        }

        // Build rich embed
        const embed = new EmbedBuilder()
            .setTitle(`${dossier.canonicalName}`)
            .setColor(0x7B68EE)
            .setTimestamp(new Date(dossier.updatedAt));

        // Basic info
        const basicInfo = [];
        if (dossier.race) basicInfo.push(`**Race:** ${dossier.race}`);
        if (dossier.class) basicInfo.push(`**Class:** ${dossier.class}`);
        if (dossier.level) basicInfo.push(`**Level:** ${dossier.level}`);
        if (dossier.player) basicInfo.push(`**Player:** ${dossier.player}`);
        if (basicInfo.length > 0) {
            embed.addFields({ name: 'Overview', value: basicInfo.join('\n'), inline: false });
        }

        if (dossier.description) {
            embed.setDescription(dossier.description);
        }

        // Player notes (most recent 5)
        if (dossier.playerUpdates && dossier.playerUpdates.length > 0) {
            const recent = dossier.playerUpdates.slice(-5);
            const notesText = recent.map(u =>
                `- ${u.text} *(${u.updatedBy}, ${u.timestamp.split('T')[0]})*`
            ).join('\n');
            embed.addFields({ name: 'Player Notes', value: notesText.substring(0, 1024), inline: false });
        }

        // Roll history (most recent 5)
        if (dossier.rollHistory && dossier.rollHistory.length > 0) {
            const recent = dossier.rollHistory.slice(-5);
            const rollText = recent.map(r =>
                `- **${r.type}:** ${r.result} *(${r.timestamp.split('T')[0]})*`
            ).join('\n');
            embed.addFields({ name: 'Recent Rolls', value: rollText.substring(0, 1024), inline: false });
        }

        // Timeline references
        if (dossier.timelineReferences && dossier.timelineReferences.length > 0) {
            const count = dossier.timelineReferences.length;
            const recent = dossier.timelineReferences.slice(-3);
            const timelineText = recent.map(ref =>
                `- **${ref.date}:** ${ref.description.substring(0, 100)}...`
            ).join('\n');
            embed.addFields({
                name: `Timeline Mentions (${count} total)`,
                value: timelineText.substring(0, 1024),
                inline: false
            });
        }

        // Emoji reactions summary
        if (dossier.emojiReactions && Object.keys(dossier.emojiReactions).length > 0) {
            const emojiText = Object.entries(dossier.emojiReactions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([emoji, count]) => `${emoji} x${count}`)
                .join(' | ');
            embed.addFields({ name: 'Community Reactions', value: emojiText, inline: false });
        }

        // Aliases
        if (dossier.aliases && dossier.aliases.length > 0) {
            embed.setFooter({ text: `Also known as: ${dossier.aliases.join(', ')}` });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
