/**
 * /characterupdate command for Casandalee
 * Players can add information to a character's dossier.
 * e.g., /characterupdate Tokala is 6'10" tall
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dossierManager = require('../utils/dossierManager');
const nameResolver = require('../utils/nameResolver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('characterupdate')
        .setDescription('Add information to a character dossier')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Character name')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('info')
                .setDescription('Information to add (e.g., "is 6\'10 tall" or "race: half-orc")')
                .setRequired(true)
        ),

    /**
     * Handle autocomplete for character name
     * @param {Object} interaction - Discord autocomplete interaction
     */
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const matches = nameResolver.search(focusedValue, 25);
        const dossierNames = dossierManager.getAllNames();
        const allNames = [...new Set([...matches, ...dossierNames])];

        const filtered = allNames
            .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);

        // If the user typed a new name not in the list, add it
        if (focusedValue.length > 1 && !filtered.some(n => n.toLowerCase() === focusedValue.toLowerCase())) {
            filtered.unshift(focusedValue);
        }

        await interaction.respond(
            filtered.slice(0, 25).map(name => ({ name, value: name }))
        );
    },

    /**
     * Execute the /characterupdate command
     * @param {Object} interaction - Discord command interaction
     */
    async execute(interaction) {
        const nameInput = interaction.options.getString('name');
        const info = interaction.options.getString('info');
        const updatedBy = interaction.user.username;

        // Try to resolve existing name, or use as-is for new characters
        let canonical = nameResolver.resolve(nameInput);
        let isNew = false;

        if (!canonical) {
            // New character - capitalize properly
            canonical = nameInput.split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            isNew = true;
        }

        // Parse structured updates (e.g., "race: half-orc")
        const structuredFields = this._parseStructuredUpdate(info);

        let dossier = dossierManager.getDossier(canonical);
        if (!dossier) {
            dossier = dossierManager.createDossier(canonical, structuredFields);
        } else {
            // Apply structured fields if found
            if (structuredFields.race) dossier.race = structuredFields.race;
            if (structuredFields.class) dossier.class = structuredFields.class;
            if (structuredFields.level) dossier.level = structuredFields.level;
            if (structuredFields.player) dossier.player = structuredFields.player;
        }

        // Always add the raw text as a player update
        dossierManager.addPlayerUpdate(canonical, info, updatedBy);

        // Build response
        const embed = new EmbedBuilder()
            .setTitle(`Dossier Updated: ${canonical}`)
            .setColor(isNew ? 0x00FF88 : 0x7B68EE)
            .setDescription(isNew
                ? `Created a new dossier for **${canonical}**!`
                : `Updated dossier for **${canonical}**.`)
            .addFields(
                { name: 'Update', value: info, inline: false },
                { name: 'Updated By', value: updatedBy, inline: true }
            )
            .setTimestamp();

        if (structuredFields.race || structuredFields.class || structuredFields.level) {
            const parsed = [];
            if (structuredFields.race) parsed.push(`Race: ${structuredFields.race}`);
            if (structuredFields.class) parsed.push(`Class: ${structuredFields.class}`);
            if (structuredFields.level) parsed.push(`Level: ${structuredFields.level}`);
            embed.addFields({ name: 'Parsed Fields', value: parsed.join('\n'), inline: true });
        }

        await interaction.reply({ embeds: [embed] });
    },

    /**
     * Parse structured field updates from text
     * Supports: "race: half-orc", "class: warpriest", "level: 12"
     * @param {string} text - The update text
     * @returns {Object} - Parsed fields
     */
    _parseStructuredUpdate(text) {
        const fields = {};

        const raceMatch = text.match(/race:\s*([^,|]+)/i);
        if (raceMatch) fields.race = raceMatch[1].trim();

        const classMatch = text.match(/class:\s*([^,|]+)/i);
        if (classMatch) fields.class = classMatch[1].trim();

        const levelMatch = text.match(/level:\s*(\d+)/i);
        if (levelMatch) fields.level = parseInt(levelMatch[1]);

        const playerMatch = text.match(/player:\s*([^,|]+)/i);
        if (playerMatch) fields.player = playerMatch[1].trim();

        return fields;
    }
};
