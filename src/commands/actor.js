/**
 * Actor Command
 * Query actor information using the lightweight index system
 */

const { SlashCommandBuilder } = require('discord.js');
const actorIndex = require('../utils/actorIndex');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('actor')
        .setDescription('Get information about a character actor')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Actor name to look up')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('info')
                .setDescription('Type of information to retrieve')
                .setRequired(false)
                .addChoices(
                    { name: 'Basic Info', value: 'basic' },
                    { name: 'Stats', value: 'stats' },
                    { name: 'Inventory', value: 'inventory' },
                    { name: 'Spells', value: 'spells' },
                    { name: 'Abilities', value: 'abilities' },
                    { name: 'All Information', value: 'all' }
                )),
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const actorName = interaction.options.getString('name');
            const infoType = interaction.options.getString('info') || 'basic';
            
            // Check if actor index is available
            if (!actorIndex.isAvailable()) {
                return await interaction.editReply({
                    content: '❌ Actor index not available. Run `/build-actor-index` first.',
                    ephemeral: true
                });
            }
            
            // Get actor information
            const actorInfo = await actorIndex.getActorInfo(actorName);
            
            if (!actorInfo) {
                return await interaction.editReply({
                    content: `❌ Actor "${actorName}" not found. Make sure the name is correct and the actor index is built.`,
                    ephemeral: true
                });
            }
            
            // Format response based on requested information type
            const response = this.formatActorResponse(actorInfo, infoType);
            
            await interaction.editReply({
                content: response,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error querying actor:', error);
            
            await interaction.editReply({
                content: '❌ Error retrieving actor information. Check the logs for details.',
                ephemeral: true
            });
        }
    },
    
    /**
     * Format actor response based on requested information type
     */
    formatActorResponse(actorInfo, infoType) {
        let response = `📋 **${actorInfo.name}** (${actorInfo.world})\n\n`;
        
        switch (infoType) {
            case 'basic':
                response += this.formatBasicInfo(actorInfo);
                break;
            case 'stats':
                response += this.formatStats(actorInfo.stats);
                break;
            case 'inventory':
                response += this.formatInventory(actorInfo.inventory);
                break;
            case 'spells':
                response += this.formatSpells(actorInfo.spells);
                break;
            case 'abilities':
                response += this.formatAbilities(actorInfo.abilities);
                break;
            case 'all':
                response += this.formatBasicInfo(actorInfo);
                response += this.formatStats(actorInfo.stats);
                response += this.formatInventory(actorInfo.inventory);
                response += this.formatSpells(actorInfo.spells);
                response += this.formatAbilities(actorInfo.abilities);
                break;
        }
        
        return response;
    },
    
    formatBasicInfo(actorInfo) {
        return `**Type:** ${actorInfo.type}\n**System:** ${actorInfo.system}\n\n`;
    },
    
    formatStats(stats) {
        if (!stats || Object.keys(stats).length === 0) {
            return '**Stats:** No stat information available\n\n';
        }
        
        let response = '**📊 Stats:**\n';
        response += `• Level: ${stats.level}\n`;
        response += `• Class: ${stats.class}\n`;
        response += `• Race: ${stats.race}\n`;
        response += `• Alignment: ${stats.alignment}\n`;
        response += `• Hit Points: ${stats.hitPoints}\n`;
        response += `• Armor Class: ${stats.armorClass}\n\n`;
        
        return response;
    },
    
    formatInventory(inventory) {
        if (!inventory || inventory.length === 0) {
            return '**🎒 Inventory:** No items found\n\n';
        }
        
        let response = '**🎒 Inventory:**\n';
        inventory.slice(0, 10).forEach(item => {
            response += `• **${item.name}** (${item.type}) - Qty: ${item.quantity}`;
            if (item.weight !== 'Unknown') response += `, Weight: ${item.weight}`;
            if (item.value !== 'Unknown') response += `, Value: ${item.value}`;
            response += '\n';
        });
        
        if (inventory.length > 10) {
            response += `... and ${inventory.length - 10} more items\n`;
        }
        response += '\n';
        
        return response;
    },
    
    formatSpells(spells) {
        if (!spells || spells.length === 0) {
            return '**🔮 Spells:** No spells found\n\n';
        }
        
        let response = '**🔮 Spells:**\n';
        spells.slice(0, 10).forEach(spell => {
            response += `• **${spell.name}** (Level ${spell.level}, ${spell.school})`;
            if (spell.prepared) response += ' [Prepared]';
            response += '\n';
        });
        
        if (spells.length > 10) {
            response += `... and ${spells.length - 10} more spells\n`;
        }
        response += '\n';
        
        return response;
    },
    
    formatAbilities(abilities) {
        if (!abilities || abilities.length === 0) {
            return '**⚡ Abilities:** No abilities found\n\n';
        }
        
        let response = '**⚡ Abilities:**\n';
        abilities.slice(0, 10).forEach(ability => {
            response += `• **${ability.name}** (${ability.type})\n`;
        });
        
        if (abilities.length > 10) {
            response += `... and ${abilities.length - 10} more abilities\n`;
        }
        response += '\n';
        
        return response;
    }
};
