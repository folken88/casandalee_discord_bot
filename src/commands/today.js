/**
 * Today Command - Quick access to today's historical events
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('today')
        .setDescription('Show today\'s historical events in Golarion'),
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            // Get today's events directly
            const timelineSearch = require('../utils/timelineSearch');
            const todayEvents = await getTodaysEvents(timelineSearch);
            
            if (todayEvents.length === 0) {
                await interaction.editReply('📅 No historical events found for today. The day passes quietly in Golarion\'s history.');
                return;
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x8B4513) // Brown color
                .setTitle('📜 Today in Golarion History')
                .setDescription(`Historical events that occurred on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`)
                .setTimestamp()
                .setFooter({ text: 'Casandalee Historical Archive' });
            
            // Add events
            const maxEvents = Math.min(todayEvents.length, 10);
            for (let i = 0; i < maxEvents; i++) {
                const event = todayEvents[i];
                const parsedDate = parseEventDate(event.date);
                const year = parsedDate ? parsedDate.year : 'Unknown';
                
                embed.addFields({
                    name: `${year} - ${event.location}`,
                    value: `${event.description}`,
                    inline: false
                });
            }
            
            if (todayEvents.length > maxEvents) {
                embed.addFields({
                    name: '📚 More Events',
                    value: `Showing ${maxEvents} of ${todayEvents.length} events. Use \`/timeline\` to search for more!`,
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error in today command:', error);
            const reply = { content: '❌ Error retrieving today\'s historical events.', ephemeral: true };
            
            if (interaction.deferred) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }
};

/**
 * Get today's historical events
 */
async function getTodaysEvents(timelineSearch) {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    
    const allEvents = timelineSearch.timeline || [];
    const todaysEvents = allEvents.filter(event => {
        if (!event.date) return false;
        
        const eventDate = parseEventDate(event.date);
        if (!eventDate) return false;
        
        return eventDate.month === month && eventDate.day === day;
    });
    
    // Sort by year (most recent first)
    todaysEvents.sort((a, b) => {
        const yearA = parseEventDate(a.date)?.year || 0;
        const yearB = parseEventDate(b.date)?.year || 0;
        return yearB - yearA;
    });
    
    return todaysEvents;
}

/**
 * Parse event date to extract year, month, day
 */
function parseEventDate(dateString) {
    try {
        const parts = dateString.split('.');
        if (parts.length >= 2) {
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            const day = parts[2] ? parseInt(parts[2]) : 1;
            
            return { year, month, day };
        }
        return null;
    } catch (error) {
        return null;
    }
}


