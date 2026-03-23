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
        const helpText = `**Available Commands:**
• \`/roll <notation>\` - Roll dice using D&D notation
• \`/predict-train <stop>\` - Predict divinity-train arrival and dwell time (2d40×5 min, 1d20×5 min)
• \`/reincarnate standard [character]\` - Roll on the standard reincarnation table (1d43)
• \`/reincarnate aquatic [character]\` - Roll on the aquatic reincarnation table (1d100, Shackles)
• \`/ancestry [race]\` - View racial traits for available ancestries
• \`/character <name>\` - View a character's dossier (race, class, notes, roll history)
• \`/characterupdate <name> <info>\` - Add info to a character's dossier
• \`/remember <fact>\` - Teach Cass something to remember (stored in her knowledge bank)
• \`/charactersheet <name> [image]\` - Upload a character sheet screenshot to auto-import stats
• \`/campaign [type]\` - Get campaign information and world state
• \`/timeline [search]\` - Search the campaign timeline for events
• \`/refresh [type]\` - Reload campaign data from Google Sheets (timeline & characters; no restart needed)
• \`/memory\` - Have Cass share a random memory or thought (from one of her 72 lives)
• \`/persona view\` - See which personality she is right now
• \`/persona switch\` - Force her to switch to a random persona (lasts 1d10 responses)
• \`/help\` - Show this help message

**Features:**
• Dice rolling with advantage/disadvantage
• Multiple reincarnation tables (standard & aquatic/Shackles)
• Character dossiers with roll history & player notes
• Knowledge bank: things you teach via /remember are used in conversation
• Character sheet import via screenshot (Claude Vision)
• Smart name matching (fuzzy search, aliases)
• Pathfinder world lore and timeline
• Campaign event tracking with 350+ timeline events
• AI-powered responses with 72 unique personalities
• Timeline search by location, AP, or description

**Examples:**
• "/reincarnate standard Bob" - Roll standard reincarnation for Bob
• "/reincarnate aquatic Noknek" - Roll aquatic reincarnation
• "/ancestry Human" - View Human racial traits
• "/character Tokala" - View Tokala's dossier
• "/characterupdate Tokala is 6'10 tall" - Update a dossier
• "/remember Captain Oblivious is an alias for Holden" - Add to knowledge bank
• "What happened in Kintargo?" - Search the timeline

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
