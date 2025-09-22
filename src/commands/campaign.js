/**
 * Campaign Command - Handle campaign context and information
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const campaignContext = require('../utils/campaignContext');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('campaign')
        .setDescription('Get campaign information and context')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of campaign information to retrieve')
                .setRequired(false)
                .addChoices(
                    { name: 'Current State', value: 'state' },
                    { name: 'Timeline', value: 'timeline' },
                    { name: 'Events', value: 'events' },
                    { name: 'Characters', value: 'characters' },
                    { name: 'Random Fact', value: 'fact' }
                )
        ),
    
    async execute(interaction) {
        const type = interaction.options.getString('type') || 'state';
        
        try {
            let embed;
            
            switch (type) {
                case 'state':
                    embed = await this.getCurrentStateEmbed();
                    break;
                case 'timeline':
                    embed = await this.getTimelineEmbed();
                    break;
                case 'events':
                    embed = await this.getEventsEmbed();
                    break;
                case 'characters':
                    embed = await this.getCharactersEmbed();
                    break;
                case 'fact':
                    embed = await this.getRandomFactEmbed();
                    break;
                default:
                    embed = await this.getCurrentStateEmbed();
            }
            
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            await interaction.reply(`❌ Error retrieving campaign information: ${error.message}`);
        }
    },
    
    async getCurrentStateEmbed() {
        const worldState = campaignContext.getCurrentWorldState();
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('📚 Current Campaign State')
            .addFields(
                { name: 'Date', value: `${worldState.month} ${worldState.year} AR`, inline: true },
                { name: 'Major Events', value: worldState.majorEvents.join('\n'), inline: false },
                { name: 'Active Threats', value: worldState.activeThreats.join('\n'), inline: false }
            )
            .setFooter({ text: 'Pathfinder Campaign Information' })
            .setTimestamp();
        
        return embed;
    },
    
    async getTimelineEmbed() {
        const timeline = campaignContext.getPathfinderTimeline();
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('📅 Pathfinder Timeline')
            .setDescription('Key events in the Pathfinder world')
            .addFields(
                { name: 'Age of Lost Omens', value: `${timeline['Age of Lost Omens'].start}-${timeline['Age of Lost Omens'].end} AR\n${timeline['Age of Lost Omens'].description}`, inline: false },
                { name: 'Worldwound Crisis', value: `${timeline['Worldwound Crisis'].start}-${timeline['Worldwound Crisis'].end} AR\n${timeline['Worldwound Crisis'].description}`, inline: false },
                { name: 'Earthfall', value: `${timeline['Earthfall'].year} AR\n${timeline['Earthfall'].description}`, inline: false }
            )
            .setFooter({ text: 'Pathfinder Historical Timeline' })
            .setTimestamp();
        
        return embed;
    },
    
    async getEventsEmbed() {
        const events = campaignContext.getCampaignEvents();
        
        if (events.length === 0) {
            return new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('📚 Campaign Events')
                .setDescription('No campaign events recorded yet.')
                .setFooter({ text: 'Campaign Event Log' })
                .setTimestamp();
        }
        
        const recentEvents = events.slice(-5); // Last 5 events
        const eventList = recentEvents.map(event => 
            `**${event.date}**: ${event.description}`
        ).join('\n');
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('📚 Recent Campaign Events')
            .setDescription(eventList)
            .setFooter({ text: `Showing ${recentEvents.length} of ${events.length} events` })
            .setTimestamp();
        
        return embed;
    },
    
    async getCharactersEmbed() {
        const characters = campaignContext.getPlayerCharacters();
        
        if (characters.length === 0) {
            return new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('👥 Player Characters')
                .setDescription('No player characters recorded yet.')
                .setFooter({ text: 'Player Character Roster' })
                .setTimestamp();
        }
        
        const characterList = characters.map(char => 
            `**${char.name}**: ${char.class} ${char.level} (${char.race})`
        ).join('\n');
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('👥 Player Characters')
            .setDescription(characterList)
            .setFooter({ text: `Total: ${characters.length} characters` })
            .setTimestamp();
        
        return embed;
    },
    
    async getRandomFactEmbed() {
        const fact = campaignContext.getRandomWorldFact();
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('🎲 Random Pathfinder Fact')
            .setDescription(fact)
            .setFooter({ text: 'Pathfinder World Lore' })
            .setTimestamp();
        
        return embed;
    }
};


