/**
 * Characters Command
 * Discord slash command for character search functionality
 */

const { SlashCommandBuilder } = require('discord.js');
const characterSearch = require('../utils/characterSearch');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('characters')
        .setDescription('Search for characters in FoundryVTT worlds')
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search term for character name')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('details')
                .setDescription('Show detailed character information')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const searchTerm = interaction.options.getString('search');
            const showDetails = interaction.options.getBoolean('details') || false;

            logger.info(`Character search command: "${searchTerm}", details: ${showDetails}`);

            // Check if character search is available
            if (!characterSearch.isAvailable()) {
                await interaction.editReply({
                    content: '❌ Character search is not available. FoundryVTT data directory not accessible.'
                });
                return;
            }

            // Search for characters
            const results = await characterSearch.searchCharacters(searchTerm);

            if (results.length === 0) {
                await interaction.editReply({
                    content: `❌ No characters found matching "${searchTerm}". Try a different search term.`
                });
                return;
            }

            let response = `👥 **Found ${results.length} character(s) matching "${searchTerm}":**\n\n`;

            if (results.length === 1 && showDetails) {
                // Show detailed information for single character
                const character = results[0];
                const details = await characterSearch.getCharacterDetails(character.name);
                
                if (details) {
                    response = await formatCharacterDetails(details);
                } else {
                    response = `❌ Could not retrieve detailed information for "${character.name}".`;
                }
            } else {
                // Show list of characters
                results.slice(0, 10).forEach((character, index) => {
                    response += `${index + 1}. **${character.name}** (${character.worldName})\n`;
                });

                if (results.length > 10) {
                    response += `\n... and ${results.length - 10} more characters. Use \`/characters search:"exact name" details:true\` for detailed info.`;
                } else if (results.length === 1) {
                    response += `\n💡 Use \`/characters search:"${results[0].name}" details:true\` for detailed information.`;
                }
            }

            await interaction.editReply({ content: response });

        } catch (error) {
            logger.error('Error in characters command:', error);
            
            const errorMessage = '❌ There was an error searching for characters. Please try again later.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};

/**
 * Format detailed character information
 * @param {Object} character - Character data with system information
 * @returns {Promise<string>} - Formatted character details
 */
async function formatCharacterDetails(character) {
    try {
        let response = `📋 **${character.name}**\n\n`;
        
        // Basic Info
        response += `**World:** ${character.worldName}\n`;
        response += `**System:** ${character.system}\n`;
        
        // Try to extract basic character info from system data
        if (character.systemData) {
            const system = character.systemData;
            
            // Level
            const level = system.details?.level?.value || system.details?.level || 
                         system.level?.value || system.level || 'Unknown';
            response += `**Level:** ${level}\n`;
            
            // Class
            const charClass = system.details?.class?.value || system.details?.class || 
                             system.class?.value || system.class || 'Unknown';
            response += `**Class:** ${charClass}\n`;
            
            // Race
            const race = system.details?.race?.value || system.details?.race || 
                        system.race?.value || system.race || 'Unknown';
            response += `**Race:** ${race}\n`;
            
            // Ability Scores (try different structures)
            if (system.abilities) {
                const abilities = [];
                ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
                    const abilityData = system.abilities[ability];
                    if (abilityData) {
                        const value = abilityData.base || abilityData.value || 10;
                        const modifier = Math.floor((value - 10) / 2);
                        const modStr = modifier >= 0 ? `+${modifier}` : modifier.toString();
                        abilities.push(`${ability.toUpperCase()}: ${value} (${modStr})`);
                    }
                });
                
                if (abilities.length > 0) {
                    response += `**Ability Scores:** ${abilities.join(', ')}\n`;
                }
            }
            
            // Hit Points
            if (system.attributes?.hp) {
                const hp = system.attributes.hp;
                const current = hp.value || hp.current || 0;
                const max = hp.max || hp.maximum || 0;
                response += `**Hit Points:** ${current}/${max}\n`;
            }
            
            // Armor Class
            if (system.attributes?.eac || system.attributes?.kac || system.attributes?.ac) {
                const ac = system.attributes.eac?.value || system.attributes.kac?.value || system.attributes.ac?.value;
                if (ac) {
                    response += `**Armor Class:** ${ac}\n`;
                }
            }
        }
        
        response += `\n**Database ID:** ${character.actorId}`;
        
        return response;
        
    } catch (error) {
        logger.error('Error formatting character details:', error);
        return `❌ Error formatting character details: ${error.message}`;
    }
}



