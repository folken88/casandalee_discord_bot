/**
 * Help Command - Show available commands and features
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const llmHandler = require('../utils/llmHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show available commands and features'),
    
    async execute(interaction) {
        const helpText = `🎲 **Casandalee - D&D Campaign Assistant**

**Available Commands:**
• \`/roll <notation>\` - Roll dice using D&D notation
• \`/reincarnate [character]\` - Roll on the reincarnation table
• \`/table <name>\` - Roll on a FoundryVTT table
• \`/campaign [type]\` - Get campaign information and world state
• \`/timeline [search]\` - Search the campaign timeline for events
• \`/help\` - Show this help message

**Features:**
• Dice rolling with advantage/disadvantage
• Reincarnation table for sea-giant and sahuagin druids
• FoundryVTT table integration
• Pathfinder world lore and timeline
• Campaign event tracking with 350+ timeline events
• Character management
• Rules assistance
• Timeline search by location, AP, or description

**Examples:**
• "Roll 2d6+3 for damage"
• "Reincarnate me" or "What should I become?"
• "What's a good random encounter?"
• "Tell me about the Pathfinder world"
• "What happened in Kintargo?"
• "Search timeline for Silver Ravens"
• "Help me create a character"

Just mention me or use /cass followed by your question!`;
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('🎲 Casandalee - D&D Campaign Assistant')
            .setDescription(helpText)
            .setFooter({ text: 'Use /cass or mention me for general questions!' })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};
