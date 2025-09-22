/**
 * Timeline Command - Search campaign timeline
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const campaignContext = require('../utils/campaignContext');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeline')
        .setDescription('Search the campaign timeline for events')
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search term (location, AP, or description)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('location')
                .setDescription('Filter by location')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('ap')
                .setDescription('Filter by Adventure Path')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Maximum number of results (default: 10)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(50)
        ),
    
    async execute(interaction) {
        const search = interaction.options.getString('search');
        const location = interaction.options.getString('location');
        const ap = interaction.options.getString('ap');
        const limit = interaction.options.getInteger('limit') || 10;
        
        try {
            let events = [];
            
            if (search) {
                events = campaignContext.searchCampaignTimeline(search);
            } else {
                events = campaignContext.getCampaignTimeline();
            }
            
            // Apply additional filters
            if (location) {
                events = events.filter(event => 
                    event.location.toLowerCase().includes(location.toLowerCase())
                );
            }
            
            if (ap) {
                events = events.filter(event => 
                    event.ap.toLowerCase().includes(ap.toLowerCase())
                );
            }
            
            // Limit results
            events = events.slice(0, limit);
            
            if (events.length === 0) {
                await interaction.reply('❌ No timeline events found matching your criteria.');
                return;
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('📅 Campaign Timeline')
                .setDescription(`Found ${events.length} timeline event${events.length === 1 ? '' : 's'}`)
                .setFooter({ text: `Requested by ${interaction.user.username}` })
                .setTimestamp();
            
            // Add fields for events (Discord has a limit of 25 fields)
            const maxFields = Math.min(events.length, 25);
            for (let i = 0; i < maxFields; i++) {
                const event = events[i];
                const fieldName = `${event.date} (${event.location})`;
                const fieldValue = `${event.ap}: ${event.description}`;
                
                embed.addFields({
                    name: fieldName,
                    value: fieldValue,
                    inline: false
                });
            }
            
            if (events.length > 25) {
                embed.addFields({
                    name: 'Note',
                    value: `Showing first 25 of ${events.length} results. Use more specific search terms to narrow results.`,
                    inline: false
                });
            }
            
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            await interaction.reply(`❌ Error searching timeline: ${error.message}`);
        }
    }
};


