/**
 * Reincarnate Aquatic Command - Handle aquatic reincarnation table rolling
 * Custom table for Shackles/Sahuagin Druid campaign
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const raceTraits = require('../utils/raceTraits');
const dossierManager = require('../utils/dossierManager');

class AquaticReincarnationTable {
    constructor() {
        this.tableData = null;
        this.loadTable();
    }
    
    /**
     * Load the aquatic reincarnation table from JSON file
     */
    loadTable() {
        try {
            const tablePath = path.join(__dirname, '../../reincarnation_aquatic_table.json');
            const tableContent = fs.readFileSync(tablePath, 'utf8');
            this.tableData = JSON.parse(tableContent);
            console.log(`✅ Loaded aquatic reincarnation table with ${this.tableData.results.length} entries`);
        } catch (error) {
            console.error('❌ Failed to load aquatic reincarnation table:', error.message);
            this.tableData = null;
        }
    }
    
    /**
     * Roll on the aquatic reincarnation table (d100)
     * @returns {Object} - Reincarnation result
     */
    rollReincarnation() {
        if (!this.tableData || !this.tableData.results) {
            throw new Error('Aquatic reincarnation table not loaded');
        }
        
        // Roll 1d100 (1-100)
        const roll = Math.floor(Math.random() * 100) + 1;
        
        // Find the result that matches the roll
        const result = this.tableData.results.find(entry => 
            entry.range && entry.range[0] <= roll && entry.range[1] >= roll
        );
        
        if (!result) {
            throw new Error(`No aquatic reincarnation result found for roll ${roll}`);
        }
        
        // Get race traits from the database
        const raceName = result.description;
        const traitData = raceTraits[raceName] || {
            traits: "No trait data available. Consult GM for racial abilities.",
            srdLink: null
        };
        
        return {
            roll: roll,
            result: raceName,
            details: result.details,
            tableName: this.tableData.name,
            traits: traitData.traits,
            srdLink: traitData.srdLink,
            lore: traitData.lore || null
        };
    }
    
    /**
     * Check if table is loaded and ready
     * @returns {boolean} - Table ready status
     */
    isReady() {
        return this.tableData !== null && this.tableData.results && this.tableData.results.length > 0;
    }
}

// Create singleton instance
const aquaticTable = new AquaticReincarnationTable();

/**
 * Run aquatic reincarnation (used by /reincarnate aquatic subcommand and standalone /reincarnate-aquatic).
 * @param {Object} interaction - Discord interaction
 * @param {string} [characterName] - Optional character name (defaults to interaction.user.username)
 */
async function executeAquatic(interaction, characterName = null) {
    const name = characterName ?? interaction.options?.getString('character') ?? interaction.user.username;
    logger.info('Reincarnate-aquatic command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId
        });

    try {
        if (!aquaticTable.isReady()) {
                logger.error('Aquatic reincarnation table not loaded');
            await interaction.reply('❌ Aquatic reincarnation table is not available. Please try again later.');
            return;
        }

        logger.info('Rolling on aquatic reincarnation table', { characterName: name });
        const result = aquaticTable.rollReincarnation();
        logger.info('Aquatic reincarnation roll completed', { characterName: name, roll: result.roll, result: result.result });

        const embedFields = [
            { name: 'Roll (d100)', value: `\`${result.roll}\``, inline: true },
            { name: 'New Form', value: `**${result.result}**`, inline: true }
        ];
        if (result.details) embedFields.push({ name: 'Description', value: result.details, inline: false });
        if (result.traits) embedFields.push({ name: 'Racial Traits', value: result.traits, inline: false });
        if (result.lore) embedFields.push({ name: 'Lore', value: `*${result.lore}*`, inline: false });
        if (result.srdLink) embedFields.push({ name: 'Reference', value: `[View on d20PFSRD](${result.srdLink})`, inline: false });

        const embed = new EmbedBuilder()
            .setColor(0x1E90FF)
            .setTitle('🌊 Aquatic Reincarnation Result')
            .setDescription(`**${name}** has been reincarnated from the depths!`)
            .addFields(embedFields)
            .setFooter({ text: `Reincarnated by ${interaction.user.username} • Shackles Campaign` })
            .setTimestamp();

        dossierManager.addRollHistory(name, { type: 'Reincarnation (Aquatic)', roll: result.roll, result: result.result, command: '/reincarnate aquatic' });

        logger.info('Sending aquatic reincarnation response');
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in reincarnate-aquatic command:', error);
        await interaction.reply(`❌ Error rolling aquatic reincarnation: ${error.message}`);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reincarnate-aquatic')
        .setDescription('Roll on the aquatic reincarnation table (Shackles/Sahuagin)')
        .addStringOption(option =>
            option.setName('character')
                .setDescription('Character name (optional)')
                .setRequired(false)
        ),
    executeAquatic,
    async execute(interaction) {
        await executeAquatic(interaction);
    }
};
