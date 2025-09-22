/**
 * Roll Command - Handle dice rolling
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const diceRoller = require('../utils/diceRoller');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice using D&D notation')
        .addStringOption(option =>
            option.setName('notation')
                .setDescription('Dice notation (e.g., 1d20+5, 2d6, 1d100)')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('advantage')
                .setDescription('Roll with advantage (roll twice, take higher)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('disadvantage')
                .setDescription('Roll with disadvantage (roll twice, take lower)')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        logger.info('Roll command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId
        });
        
        const notation = interaction.options.getString('notation');
        const advantage = interaction.options.getBoolean('advantage') || false;
        const disadvantage = interaction.options.getBoolean('disadvantage') || false;
        
        logger.info('Roll command parameters', { notation, advantage, disadvantage });
        
        try {
            let result;
            
            if (advantage && disadvantage) {
                logger.warn('User attempted both advantage and disadvantage');
                await interaction.reply('❌ Cannot have both advantage and disadvantage!');
                return;
            }
            
            if (advantage) {
                logger.info('Rolling with advantage');
                result = diceRoller.rollAdvantage(notation, true);
            } else if (disadvantage) {
                logger.info('Rolling with disadvantage');
                result = diceRoller.rollAdvantage(notation, false);
            } else {
                logger.info('Rolling normally');
                result = diceRoller.roll(notation);
            }
            
            logger.info('Dice roll completed', { 
                notation: result.notation, 
                total: result.finalTotal || result.total,
                breakdown: result.breakdown 
            });
            
            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('🎲 Dice Roll Result')
                .addFields(
                    { name: 'Notation', value: `\`${result.notation}\``, inline: true },
                    { name: 'Result', value: `**${result.finalTotal || result.total}**`, inline: true },
                    { name: 'Breakdown', value: result.breakdown, inline: false }
                )
                .setFooter({ text: `Rolled by ${interaction.user.username}` })
                .setTimestamp();
            
            logger.info('Sending dice roll response');
            await interaction.reply({ embeds: [embed] });
            logger.info('Dice roll response sent successfully');
            
        } catch (error) {
            logger.error('Error in roll command:', error);
            await interaction.reply(`❌ Error rolling dice: ${error.message}`);
        }
    }
};


