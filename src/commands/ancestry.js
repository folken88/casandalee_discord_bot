/**
 * Ancestry Command - View racial traits for reincarnation options
 * Includes fuzzy matching, alias support, and intelligent autocomplete
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const raceTraits = require('../utils/raceTraits');
const logger = require('../utils/logger');

/**
 * Common aliases and misspellings mapped to canonical race names.
 * Saves users from needing the exact DB key.
 */
const RACE_ALIASES = {
    // Shorthand & common names
    'human':            'Human',
    'elf':              'Elf',
    'dwarf':            'Dwarf',
    'halfling':         'Halfling',
    'gnome':            'Gnome',
    'orc':              'Orc',
    'goblin':           'Goblin',
    'kobold':           'Kobold',
    'half-elf':         'Half-elf',
    'half elf':         'Half-elf',
    'halfelf':          'Half-elf',
    'half-orc':         'Half-orc',
    'half orc':         'Half-orc',
    'halforc':          'Half-orc',

    // Shackles variants
    'sea orc':          'Sea Reaver Orc',
    'sea reaver':       'Sea Reaver Orc',
    'reaver orc':       'Sea Reaver Orc',
    'aquatic orc':      'Sea Reaver Orc',
    'ship half-elf':    'Ship-Bound Half-Elf',
    'ship half elf':    'Ship-Bound Half-Elf',
    'ship elf':         'Ship-Bound Half-Elf',
    'shipbound':        'Ship-Bound Half-Elf',
    'ship-bound':       'Ship-Bound Half-Elf',
    'sailor half-elf':  'Ship-Bound Half-Elf',
    'pirate half-elf':  'Ship-Bound Half-Elf',
    'besmaran':         'Besmaran Changeling',
    'besmara changeling': 'Besmaran Changeling',
    'pirate changeling': 'Besmaran Changeling',

    // Aquatic races
    'aquatic elf':      'Aquatic Elf',
    'sea elf':          'Aquatic Elf',
    'water elf':        'Aquatic Elf',
    'malenti':          'Sahuagin (Malenti)',
    'sahuagin':         'Sahuagin (Malenti)',
    'sahaugin':         'Sahuagin (Malenti)',
    'sahaugen':         'Sahuagin (Malenti)',
    'sahagin':          'Sahuagin (Malenti)',
    'shark people':     'Sahuagin (Malenti)',
    'skum':             'Skum (Free-Willed)',
    'free willed skum': 'Skum (Free-Willed)',
    'iku-turso':        'Iku-Turso (Lesser Spawn)',
    'iku turso':        'Iku-Turso (Lesser Spawn)',
    'ikuturso':         'Iku-Turso (Lesser Spawn)',
    'shackles human':   'Human (Shackles Islander)',
    'shackles islander': 'Human (Shackles Islander)',
    'islander':         'Human (Shackles Islander)',
    'pirate human':     'Human (Shackles Islander)',
    'half giant':       'Half Giant',
    'half-giant':       'Half Giant',
    'halfgiant':        'Half Giant',
    'grindylow':        'Grindylow',
    'grindy':           'Grindylow',
    'cecaelia':         'Cecaelia',
    'octopus':          'Cecaelia',
    'gillman':          'Gillman',
    'gillmen':          'Gillman',
    'gill man':         'Gillman',

    // Common alternate spellings
    'tiefling':         'Tiefling',
    'teifling':         'Tiefling',
    'teifeling':        'Tiefling',
    'aasimar':          'Aasimar',
    'assimar':          'Aasimar',
    'aassimar':         'Aasimar',
    'asimar':           'Aasimar',
    'dhampir':          'Dhampir',
    'dhampire':         'Dhampir',
    'dampir':           'Dhampir',
    'dhamphir':         'Dhampir',
    'changeling':       'Changeling',
    'changling':        'Changeling',
    'fetchling':        'Fetchling',
    'fetcheling':       'Fetchling',
    'kitsune':          'Kitsune',
    'kitusne':          'Kitsune',
    'fox':              'Kitsune',
    'foxfolk':          'Kitsune',
    'catfolk':          'Catfolk',
    'cat folk':         'Catfolk',
    'catpeople':        'Catfolk',
    'cat people':       'Catfolk',
    'ratfolk':          'Ratfolk',
    'rat folk':         'Ratfolk',
    'tengu':            'Tengu',
    'birdfolk':         'Tengu',
    'crow':             'Tengu',
    'raven':            'Tengu',
    'vanara':           'Vanara',
    'monkey':           'Vanara',
    'vishkanya':        'Vishkanya',
    'vishkana':         'Vishkanya',
    'nagaji':           'Nagaji',
    'naga':             'Nagaji',
    'oread':            'Oread',
    'ifrit':            'Ifrit',
    'efreet':           'Ifrit',
    'samsaran':         'Samsaran',
    'strix':            'Strix',
    'drow':             'Drow',
    'dark elf':         'Drow',
    'darkelf':          'Drow',
    'duergar':          'Duergar',
    'dark dwarf':       'Duergar',
    'hobgoblin':        'Hobgoblin',
    'hob goblin':       'Hobgoblin',
    'bugbear':          'Bugbear',
    'bug bear':         'Bugbear',
    'gnoll':            'Gnoll',
    'hyena':            'Gnoll',
    'gnoll':            'Gnoll',
    'lizardfolk':       'Lizardfolk',
    'lizard folk':      'Lizardfolk',
    'lizardman':        'Lizardfolk',
    'lizard man':       'Lizardfolk',
    'troglodyte':       'Troglodyte',
    'trog':             'Troglodyte',
    'ogre':             'Ogre',
    'android':          'Android',
    'kasatha':          'Kasatha',
    'four arms':        'Kasatha',
    'lashunta':         'Lashunta',
    'lashunta':         'Lashunta',
    'ghoran':           'Ghoran',
    'plant':            'Ghoran',
    'wayang':           'Wayangs',
    'wayangs':          'Wayangs',
    'locathah':         'Locathah',
    'locatha':          'Locathah',
    'fish folk':        'Locathah',
    'fishfolk':         'Locathah',
    'adaro':            'Adaro',
    'shark':            'Adaro',
    'siyokoy':          'Siyokoy',
    'eel folk':         'Siyokoy',
    'eelfolk':          'Siyokoy',
    'triton':           'Triton',
    'merfolk':          'Merfolk',
    'mermaid':          'Merfolk',
    'merman':           'Merfolk',
    'ceratioidi':       'Ceratioidi',
    'anglerfish':       'Ceratioidi',
    'angler':           'Ceratioidi'
};

/**
 * Calculate edit distance between two strings (Levenshtein distance)
 * Used for fuzzy matching misspellings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
function editDistance(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    return matrix[b.length][a.length];
}

/**
 * Find the best matching race for user input
 * Checks: exact match → alias → starts-with → contains → fuzzy
 * @param {string} input - User input
 * @returns {{ match: string|null, confidence: string }} - Best match and confidence level
 */
function findBestMatch(input) {
    const lowerInput = input.toLowerCase().trim();
    const allRaces = Object.keys(raceTraits);
    
    // 1. Exact match (case-insensitive)
    const exact = allRaces.find(r => r.toLowerCase() === lowerInput);
    if (exact) return { match: exact, confidence: 'exact' };
    
    // 2. Alias lookup
    if (RACE_ALIASES[lowerInput]) {
        return { match: RACE_ALIASES[lowerInput], confidence: 'alias' };
    }
    
    // 3. Starts-with match
    const startsWith = allRaces.filter(r => r.toLowerCase().startsWith(lowerInput));
    if (startsWith.length === 1) return { match: startsWith[0], confidence: 'starts-with' };
    
    // 4. Contains match (input is substring of race name)
    const contains = allRaces.filter(r => r.toLowerCase().includes(lowerInput));
    if (contains.length === 1) return { match: contains[0], confidence: 'contains' };
    
    // 5. Reverse contains (race name is substring of input)
    const reverseContains = allRaces.filter(r => lowerInput.includes(r.toLowerCase()));
    if (reverseContains.length === 1) return { match: reverseContains[0], confidence: 'contains' };
    
    // 6. Fuzzy matching via edit distance
    let bestFuzzy = null;
    let bestDistance = Infinity;
    
    // Check against all race names AND aliases
    for (const race of allRaces) {
        const distance = editDistance(lowerInput, race);
        // Allow up to 3 edits, but must be less than half the word length
        const threshold = Math.min(3, Math.floor(race.length / 2));
        if (distance <= threshold && distance < bestDistance) {
            bestDistance = distance;
            bestFuzzy = race;
        }
    }
    
    for (const [alias, canonical] of Object.entries(RACE_ALIASES)) {
        const distance = editDistance(lowerInput, alias);
        const threshold = Math.min(3, Math.floor(alias.length / 2));
        if (distance <= threshold && distance < bestDistance) {
            bestDistance = distance;
            bestFuzzy = canonical;
        }
    }
    
    if (bestFuzzy) return { match: bestFuzzy, confidence: 'fuzzy' };
    
    // 7. Partial word matching - check if any word in the input matches a word in race names
    const inputWords = lowerInput.split(/[\s\-]+/);
    const wordMatches = allRaces.filter(race => {
        const raceWords = race.toLowerCase().split(/[\s\-()]+/);
        return inputWords.some(iw => iw.length >= 3 && raceWords.some(rw => rw.startsWith(iw) || editDistance(iw, rw) <= 1));
    });
    if (wordMatches.length === 1) return { match: wordMatches[0], confidence: 'partial' };
    if (wordMatches.length > 1 && wordMatches.length <= 5) return { match: null, confidence: 'multiple', suggestions: wordMatches };
    
    return { match: null, confidence: 'none' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ancestry')
        .setDescription('View racial traits for available ancestries')
        .addStringOption(option =>
            option.setName('race')
                .setDescription('Name of the race/ancestry to view (leave blank to see all options)')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase().trim();
        
        // Get all race names from the traits database
        const allRaces = Object.keys(raceTraits)
            .filter(race => 
                !race.includes("GM's Choice") && 
                !race.includes("Player's Choice")
            )
            .sort();
        
        if (!focusedValue) {
            // No input yet, show all races (up to 25)
            await interaction.respond(
                allRaces.slice(0, 25).map(race => ({ name: race, value: race }))
            );
            return;
        }
        
        // Score each race for relevance to the input
        const scored = allRaces.map(race => {
            const lowerRace = race.toLowerCase();
            let score = 0;
            
            // Exact match
            if (lowerRace === focusedValue) score = 100;
            // Starts with input
            else if (lowerRace.startsWith(focusedValue)) score = 80;
            // A word in the race starts with the input
            else if (lowerRace.split(/[\s\-()]+/).some(w => w.startsWith(focusedValue))) score = 70;
            // Contains input as substring
            else if (lowerRace.includes(focusedValue)) score = 60;
            // Fuzzy: low edit distance
            else {
                const dist = editDistance(focusedValue, race);
                const threshold = Math.min(3, Math.floor(race.length / 2));
                if (dist <= threshold) score = 50 - dist * 10;
            }
            
            return { race, score };
        });
        
        // Also check aliases for matches
        const aliasMatches = [];
        for (const [alias, canonical] of Object.entries(RACE_ALIASES)) {
            if (alias.startsWith(focusedValue) || alias.includes(focusedValue)) {
                if (!aliasMatches.includes(canonical) && !scored.some(s => s.race === canonical && s.score > 0)) {
                    aliasMatches.push(canonical);
                }
            } else {
                const dist = editDistance(focusedValue, alias);
                if (dist <= 2 && !aliasMatches.includes(canonical)) {
                    aliasMatches.push(canonical);
                }
            }
        }
        
        // Add alias matches with a good score
        for (const canonical of aliasMatches) {
            const existing = scored.find(s => s.race === canonical);
            if (existing && existing.score < 65) existing.score = 65;
            else if (!existing) scored.push({ race: canonical, score: 65 });
        }
        
        // Sort by score descending, filter out zeros
        const filtered = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 25);
        
        await interaction.respond(
            filtered.map(s => ({ name: s.race, value: s.race }))
        );
    },
    
    async execute(interaction) {
        logger.info('Ancestry command executed', {
            userId: interaction.user.id,
            username: interaction.user.username,
            race: interaction.options.getString('race')
        });
        
        const raceName = interaction.options.getString('race');
        
        try {
            // If no race specified, show list of all available races
            if (!raceName) {
                return await this.showRaceList(interaction);
            }
            
            // Show specific race information
            return await this.showRaceInfo(interaction, raceName);
            
        } catch (error) {
            logger.error('Error in ancestry command:', error);
            await interaction.reply(`❌ Error viewing ancestry information: ${error.message}`);
        }
    },
    
    /**
     * Show list of all available races
     */
    async showRaceList(interaction) {
        // Get all race names, excluding special results
        const allRaces = Object.keys(raceTraits)
            .filter(race => 
                !race.includes("GM's Choice") && 
                !race.includes("Player's Choice") &&
                !race.includes("Other")
            )
            .sort();
        
        // Group races by category
        const standardRaces = [
            'Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-orc', 
            'Half-elf', 'Goblin', 'Kobold', 'Orc'
        ].filter(r => allRaces.includes(r));
        
        const aquaticRaces = [
            'Merfolk', 'Aquatic Elf', 'Gillman', 'Locathah', 'Cecaelia',
            'Sahuagin (Malenti)', 'Adaro', 'Triton', 'Grindylow'
        ].filter(r => allRaces.includes(r));
        
        const shacklesVariants = [
            'Sea Reaver Orc', 'Ship-Bound Half-Elf', 'Besmaran Changeling',
            'Human (Shackles Islander)'
        ].filter(r => allRaces.includes(r));
        
        const uncommonRaces = allRaces.filter(r => 
            !standardRaces.includes(r) && 
            !aquaticRaces.includes(r) && 
            !shacklesVariants.includes(r)
        );
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('📜 Available Ancestries')
            .setDescription('Use `/ancestry [race name]` to view detailed racial traits.\nAutocomplete will suggest matches as you type.\n\n*These are all possible results from the reincarnation tables.*')
            .addFields(
                { 
                    name: '🏛️ Standard Races', 
                    value: standardRaces.join(', ') || 'None', 
                    inline: false 
                },
                { 
                    name: '🌊 Aquatic Races', 
                    value: aquaticRaces.join(', ') || 'None', 
                    inline: false 
                },
                { 
                    name: '⚓ Shackles Variants', 
                    value: shacklesVariants.join(', ') || 'None', 
                    inline: false 
                },
                { 
                    name: '✨ Uncommon/Exotic Races', 
                    value: uncommonRaces.length > 0 ? this.splitIntoColumns(uncommonRaces, 3) : 'None', 
                    inline: false 
                }
            )
            .setFooter({ text: `Total: ${allRaces.length} ancestries | Supports nicknames & fuzzy search` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    },
    
    /**
     * Show information for a specific race, with fuzzy matching fallback
     * @param {Object} interaction - Discord interaction
     * @param {string} raceName - User-provided race name
     */
    async showRaceInfo(interaction, raceName) {
        const result = findBestMatch(raceName);
        
        // No match found at all
        if (!result.match && result.confidence === 'none') {
            const availableRaces = Object.keys(raceTraits)
                .filter(r => !r.includes("GM's Choice") && !r.includes("Player's Choice"))
                .sort()
                .slice(0, 10)
                .join(', ');
            
            return await interaction.reply({
                content: `❌ I couldn't find a race matching **"${raceName}"**.\n\n**Try one of these:** ${availableRaces}...\n\nUse \`/ancestry\` to see the full list, or start typing for autocomplete suggestions.`,
                ephemeral: true
            });
        }
        
        // Multiple possible matches
        if (!result.match && result.confidence === 'multiple') {
            const suggestions = result.suggestions.map(r => `• ${r}`).join('\n');
            return await interaction.reply({
                content: `🤔 **"${raceName}"** could match several races:\n\n${suggestions}\n\nTry being more specific, or use autocomplete.`,
                ephemeral: true
            });
        }
        
        const raceKey = result.match;
        const raceData = raceTraits[raceKey];
        
        // Build embed
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle(`📜 ${raceKey}`)
            .setDescription(raceData.traits)
            .setTimestamp();
        
        // Show a "did you mean" note for fuzzy/partial matches
        if (result.confidence === 'fuzzy' || result.confidence === 'partial') {
            embed.setDescription(`*Showing results for **${raceKey}** (closest match to "${raceName}")*\n\n${raceData.traits}`);
        }
        
        // Add lore if present (for custom races)
        if (raceData.lore) {
            embed.addFields({ 
                name: 'Lore', 
                value: `*${raceData.lore}*`, 
                inline: false 
            });
        }
        
        // Add SRD link if available
        if (raceData.srdLink) {
            embed.addFields({ 
                name: 'Reference', 
                value: `[View full details on d20PFSRD](${raceData.srdLink})`, 
                inline: false 
            });
        }
        
        // Add availability info
        const tables = this.getTablesForRace(raceKey);
        if (tables.length > 0) {
            embed.addFields({ 
                name: 'Available On', 
                value: tables.join(' • '), 
                inline: false 
            });
        }
        
        embed.setFooter({ text: 'Pathfinder 1e Racial Traits' });
        
        await interaction.reply({ embeds: [embed] });
    },
    
    /**
     * Determine which tables a race appears on
     * @param {string} raceName - Canonical race name
     * @returns {string[]} - Table labels
     */
    getTablesForRace(raceName) {
        const tables = [];
        
        const standardRaces = [
            'Bugbear', 'Dwarf', 'Elf', 'Gnoll', 'Gnome', 'Goblin', 'Ship-Bound Half-Elf',
            'Half-orc', 'Halfling', 'Human', 'Kobold', 'Lizardfolk', 'Sea Reaver Orc',
            'Troglodyte', 'Aasimar', 'Android', 'Catfolk', 'Besmaran Changeling', 'Dhampir',
            'Ifrit', 'Drow', 'Duergar', 'Fetchling', 'Ghoran', 'Gillman', 'Aquatic Elf',
            'Half Giant', 'Ogre', 'Hobgoblin', 'Tiefling', 'Kasatha', 'Kitsune', 'Lashunta',
            'Nagaji', 'Oread', 'Samsaran', 'Strix', 'Tengu', 'Vanara', 'Vishkanya',
            'Merfolk', 'Ratfolk', 'Wayangs'
        ];
        
        const aquaticRaces = [
            'Merfolk', 'Aquatic Elf', 'Gillman', 'Locathah', 'Cecaelia', 'Sahuagin (Malenti)',
            'Adaro', 'Siyokoy', 'Skum (Free-Willed)', 'Triton', 'Sea Reaver Orc',
            'Ship-Bound Half-Elf', 'Besmaran Changeling', 'Grindylow', 'Iku-Turso (Lesser Spawn)',
            'Ceratioidi', 'Human (Shackles Islander)'
        ];
        
        if (standardRaces.includes(raceName)) {
            tables.push('🔄 Standard Reincarnation (d43)');
        }
        
        if (aquaticRaces.includes(raceName)) {
            tables.push('🌊 Aquatic Reincarnation (d100)');
        }
        
        return tables;
    },
    
    /**
     * Split array into columns for better display
     * @param {string[]} items - Items to display
     * @param {number} columns - Number of columns
     * @returns {string} - Formatted string
     */
    splitIntoColumns(items, columns) {
        const perColumn = Math.ceil(items.length / columns);
        const result = [];
        
        for (let i = 0; i < items.length; i += perColumn) {
            const chunk = items.slice(i, i + perColumn);
            result.push(chunk.join(', '));
        }
        
        return result.join('\n');
    }
};
