/**
 * Table Command - Handle FoundryVTT table rolling
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const foundryIntegration = require('../utils/foundryIntegration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('table')
        .setDescription('Roll on a FoundryVTT table')
        .addStringOption(option =>
            option.setName('table')
                .setDescription('Table name to roll on')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        const tableName = interaction.options.getString('table');
        
        try {
            // Test connection first
            const isConnected = await foundryIntegration.testConnection();
            if (!isConnected) {
                await interaction.reply('❌ Cannot connect to FoundryVTT. Please check the connection settings.');
                return;
            }
            
            // Search for the table
            const tables = await foundryIntegration.searchTables(tableName);
            
            if (tables.length === 0) {
                await interaction.reply(`❌ No table found matching "${tableName}". Try searching for tables like "loot", "encounter", or "name".`);
                return;
            }
            
            // Use the first matching table
            const table = tables[0];
            const result = await foundryIntegration.rollTable(table.name);
            
            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('🎲 Table Roll Result')
                .addFields(
                    { name: 'Table', value: table.name, inline: true },
                    { name: 'Result', value: result.result, inline: false }
                )
                .setFooter({ text: `Rolled by ${interaction.user.username}` })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            await interaction.reply(`❌ Error rolling on table: ${error.message}`);
        }
    }
};


