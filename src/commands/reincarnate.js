/**
 * Reincarnate Command - Handle reincarnation table rolling
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const reincarnationTable = require('../utils/reincarnationTable');
const dossierManager = require('../utils/dossierManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reincarnate')
        .setDescription('Roll on the reincarnation table to see what you become')
        .addStringOption(option =>
            option.setName('character')
                .setDescription('Character name (optional)')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        logger.info('Reincarnate command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId
        });
        
        const characterName = interaction.options.getString('character') || interaction.user.username;
        
        try {
            // Check if reincarnation table is loaded
            if (!reincarnationTable.isReady()) {
                logger.error('Reincarnation table not loaded');
                await interaction.reply('❌ Reincarnation table is not available. Please try again later.');
                return;
            }
            
            logger.info('Rolling on reincarnation table', { characterName });
            
            // Roll on the reincarnation table
            const result = reincarnationTable.rollReincarnation();
            
            logger.info('Reincarnation roll completed', { 
                characterName,
                roll: result.roll,
                result: result.result
            });
            
            // Build embed fields
            const embedFields = [
                { name: 'Roll (d43)', value: `\`${result.roll}\``, inline: true },
                { name: 'New Form', value: `**${result.result}**`, inline: true }
            ];
            
            // Add traits
            if (result.traits) {
                embedFields.push({ name: 'Racial Traits', value: result.traits, inline: false });
            }
            
            // Add lore if present (for custom races)
            if (result.lore) {
                embedFields.push({ name: 'Lore', value: `*${result.lore}*`, inline: false });
            }
            
            // Add SRD link if available
            if (result.srdLink) {
                embedFields.push({ name: 'Reference', value: `[View on d20PFSRD](${result.srdLink})`, inline: false });
            }
            
            // Create embed response
            const embed = new EmbedBuilder()
                .setColor(0x8B4513) // Brown color for Casandalee
                .setTitle('🔄 Reincarnation Result')
                .setDescription(`**${characterName}** has been reincarnated!`)
                .addFields(embedFields)
                .setFooter({ text: `Reincarnated by ${interaction.user.username}` })
                .setTimestamp();
            
            // Log roll to character dossier
            dossierManager.addRollHistory(characterName, {
                type: 'Reincarnation (Standard)',
                roll: result.roll,
                result: result.result,
                command: '/reincarnate'
            });

            logger.info('Sending reincarnation response');
            await interaction.reply({ embeds: [embed] });
            logger.info('Reincarnation response sent successfully');
            
        } catch (error) {
            logger.error('Error in reincarnate command:', error);
            await interaction.reply(`❌ Error rolling reincarnation: ${error.message}`);
        }
    }
};

