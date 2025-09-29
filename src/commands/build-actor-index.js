/**
 * Build Actor Index Command
 * Creates a lightweight text-based index of all PC actors for fast lookups
 */

const { SlashCommandBuilder } = require('discord.js');
const actorIndex = require('../utils/actorIndex');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build-actor-index')
        .setDescription('Build lightweight actor index for fast character lookups'),
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            // Check if FoundryVTT data is available
            if (!actorIndex.isAvailable()) {
                return await interaction.editReply({
                    content: '❌ FoundryVTT data path not available. Please check your environment configuration.',
                    ephemeral: true
                });
            }
            
            // Build the actor index
            const entries = await actorIndex.buildIndex();
            
            if (entries.length === 0) {
                return await interaction.editReply({
                    content: '⚠️ No PC actors found. Make sure your FoundryVTT worlds have character actors.',
                    ephemeral: true
                });
            }
            
            // Show summary
            const summary = entries.slice(0, 10).map(entry => {
                const [name, world] = entry.split('|');
                return `• **${name}** (${world})`;
            }).join('\n');
            
            const moreText = entries.length > 10 ? `\n... and ${entries.length - 10} more actors` : '';
            
            await interaction.editReply({
                content: `✅ **Actor Index Built Successfully!**\n\n**Found ${entries.length} PC actors:**\n${summary}${moreText}\n\n💡 You can now ask about any of these characters and I'll fetch their data on-demand!`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error building actor index:', error);
            
            await interaction.editReply({
                content: '❌ Error building actor index. Check the logs for details.',
                ephemeral: true
            });
        }
    }
};
