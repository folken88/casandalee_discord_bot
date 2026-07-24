const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const conversation = require('../utils/conversation');
const discordUserMap = require('../utils/discordUserMap');
const logger = require('../utils/logger');

module.exports = {
    /** Custom timeout: LLM responses can take longer than 5s */
    timeout: 30000,

    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Casandalee anything about the campaign, rules, or world')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question for Casandalee')
                .setRequired(true)
        ),

    async execute(interaction) {
        logger.info('Ask command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            question: interaction.options.getString('question')
        });

        try {
            const question = interaction.options.getString('question');
            // Resolve speaker: GM role wins; else campaign-aware character; else player name
            const GM_ROLE_ID = process.env.GM_ROLE_ID || '486153213108813833';
            const roleIds = interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : [];
            const isGM = roleIds.includes(GM_ROLE_ID);
            let campaign = discordUserMap.getCampaignByChannelId(interaction.channelId);
            if (!campaign) campaign = discordUserMap.getCampaignByRoles(roleIds);
            const characterName = isGM ? null : (campaign ? discordUserMap.getCharacterForCampaign(interaction.user.id, campaign) : null);
            const playerName = discordUserMap.getPlayerByDiscordId(interaction.user.id);
            const speakerName = isGM
                ? (playerName || 'GM')
                : (characterName || playerName || interaction.user.username);

            // Show typing indicator
            await interaction.deferReply();

            // Conversation pipeline v2 (no transcript for slash commands)
            const response = await conversation.respond({
                query: question,
                speakerName,
                userId: interaction.user.id,
                channelName: interaction.channel?.name,
                campaign,
                isGM
            });
            
            // Create simple response (no embed, just text)
            await interaction.editReply(response);
            
            logger.info('Ask command completed successfully');
            
        } catch (error) {
            logger.error('Error in ask command:', error);
            await interaction.editReply(`Sorry, I encountered an error: ${error.message}`);
        }
    }
};

