#!/usr/bin/env node
/**
 * One-time script to generate individual personality .md files
 * from casandalee_personality_guide.json.
 * 
 * Merges the two duplicate sets in the JSON (detailed + short) into
 * rich personality profiles, and adds emoji/tone metadata.
 */

const fs = require('fs');
const path = require('path');

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const JSON_PATH = path.join(__dirname, '..', 'data', 'casandalee_personality_guide.json');

// Emoji mappings by archetype
const ARCHETYPE_EMOJIS = {
    // Goth-mommy types
    'Oracle': { emojis: ['🌙', '✨', '🔮'], tone: 'mystical' },
    'Witch': { emojis: ['🕷️', '🌿', '💀'], tone: 'cryptic' },
    'Occultist': { emojis: ['🔮', '📿', '🕯️'], tone: 'reverent' },
    'Spiritualist': { emojis: ['👻', '🌀', '💫'], tone: 'ethereal' },
    'Medium': { emojis: ['🎭', '👁️', '🌀'], tone: 'fragmented' },
    'Shaman': { emojis: ['🌿', '✨', '🪶'], tone: 'wise' },
    'Data Seer': { emojis: ['📡', '🔮', '💠'], tone: 'prophetic' },
    'Psychic': { emojis: ['🧠', '💜', '🌀'], tone: 'intense' },

    // Nerd types
    'Wizard': { emojis: ['📖', '⚡', '🧪'], tone: 'academic' },
    'Archivist': { emojis: ['📚', '🗂️', '✒️'], tone: 'scholarly' },
    'Investigator': { emojis: ['🔍', '📋', '🧩'], tone: 'analytical' },
    'Alchemist': { emojis: ['🧪', '⚗️', '💊'], tone: 'experimental' },
    'Engineer': { emojis: ['⚙️', '🔧', '💡'], tone: 'precise' },
    'Mechanist': { emojis: ['⚙️', '🔩', '🖥️'], tone: 'methodical' },
    'Technomancer': { emojis: ['💻', '✨', '⚡'], tone: 'reverent-tech' },
    'Tinker': { emojis: ['🔧', '🤖', '❤️'], tone: 'warm' },

    // Jock types
    'Bloodrager': { emojis: ['💢', '⚔️', '🔥'], tone: 'aggressive' },
    'Barbarian': { emojis: ['💪', '🪓', '🗿'], tone: 'primal' },
    'Fighter': { emojis: ['🛡️', '⚔️', '💪'], tone: 'stoic' },
    'Gunslinger': { emojis: ['🔫', '💥', '🎯'], tone: 'sharp' },
    'Kineticist': { emojis: ['🔥', '⚡', '💨'], tone: 'volatile' },
    'Cavalier': { emojis: ['🐴', '⚔️', '🛡️'], tone: 'formal' },

    // Rebel/artist types
    'Bard': { emojis: ['🎵', '🎭', '📜'], tone: 'poetic' },
    'Skald': { emojis: ['🥁', '🎶', '✊'], tone: 'inspiring' },
    'Rogue': { emojis: ['🗡️', '🌑', '💰'], tone: 'cunning' },
    'Ninja': { emojis: ['🌑', '🗡️', '🤫'], tone: 'cold' },
    'Mesmerist': { emojis: ['🌀', '👁️', '🎭'], tone: 'manipulative' },

    // Holy types
    'Paladin': { emojis: ['⚔️', '✨', '🛡️'], tone: 'righteous' },
    'Cleric': { emojis: ['✝️', '✨', '🙏'], tone: 'devout' },
    'Warpriest': { emojis: ['⚔️', '🙏', '🔥'], tone: 'fervent' },
    'Inquisitor': { emojis: ['⚖️', '🔍', '⚔️'], tone: 'stern' },
    'Monk': { emojis: ['🧘', '☯️', '✨'], tone: 'serene' },

    // Nature types
    'Druid': { emojis: ['🌿', '🌳', '🌸'], tone: 'nurturing' },
    'Ranger': { emojis: ['🏹', '🌲', '🐾'], tone: 'quiet' },

    // Dark types
    'Sorcerer': { emojis: ['⚡', '💜', '🔥'], tone: 'intense' },
    'Summoner': { emojis: ['🌀', '🔗', '👁️'], tone: 'obsessive' },
    'Synthesist Summoner': { emojis: ['🔗', '⚡', '🌀'], tone: 'ambitious' },
    'Magus': { emojis: ['⚔️', '✨', '📖'], tone: 'disciplined' },
    'Samurai': { emojis: ['⚔️', '🎌', '💀'], tone: 'cold' },

    // Command types
    'Pilot': { emojis: ['🚀', '📡', '⭐'], tone: 'precise' },

    // Default
    '_default': { emojis: ['✨', '💭', '🌟'], tone: 'neutral' }
};

// Alignment-based speech modifiers
const ALIGNMENT_FLAVOR = {
    'Lawful Good': 'Speaks with conviction and warmth. Uses formal but caring language.',
    'Neutral Good': 'Speaks gently and helpfully. Uses encouraging, supportive language.',
    'Chaotic Good': 'Speaks passionately, sometimes rebelliously. Uses vivid, emotional language.',
    'Lawful Neutral': 'Speaks precisely and methodically. Uses structured, measured language.',
    'True Neutral': 'Speaks calmly and objectively. Uses balanced, philosophical language.',
    'Neutral': 'Speaks calmly and objectively. Uses balanced, philosophical language.',
    'Chaotic Neutral': 'Speaks unpredictably, sometimes wildly. Uses colorful, restless language.',
    'Lawful Evil': 'Speaks with cold authority. Uses commanding, manipulative language.',
    'Neutral Evil': 'Speaks with calculated detachment. Uses self-serving, cunning language.',
    'Chaotic Evil': 'Speaks with aggressive energy. Uses threatening, dominating language.'
};

function run() {
    // Ensure output directory
    if (!fs.existsSync(PERSONALITY_DIR)) {
        fs.mkdirSync(PERSONALITY_DIR, { recursive: true });
    }

    // Load source JSON
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const data = JSON.parse(raw);
    const system = data.casandalee_personality_system;
    const pastLives = system.past_lives;

    // The JSON has duplicate keys. JSON.parse keeps the LAST occurrence.
    // So keys 1-72 currently hold the SHORT versions (the second set).
    // We need to parse manually to get BOTH sets.
    // Strategy: use regex to extract all entries, keeping first occurrence as "detailed"
    const allEntries = {};
    const detailedEntries = {};
    
    // Extract all key-value pairs from past_lives using regex
    const regex = /"(\d+)":\s*\{[^}]*"name":\s*"([^"]*)"[^}]*"class":\s*"([^"]*)"[^}]*"alignment":\s*"([^"]*)"[^}]*"personality":\s*"([^"]*)"/g;
    let match;
    
    while ((match = regex.exec(raw)) !== null) {
        const [, num, name, cls, alignment, personality] = match;
        if (!detailedEntries[num]) {
            // First occurrence = detailed version
            detailedEntries[num] = { name, class: cls, alignment, personality };
        } else if (!allEntries[num]) {
            // Second occurrence = short version
            allEntries[num] = { name, class: cls, alignment, personality };
        }
    }

    // Merge: prefer detailed personality text, use short as supplementary
    let generated = 0;
    for (let i = 1; i <= 72; i++) {
        const key = i.toString();
        const detailed = detailedEntries[key];
        const short = allEntries[key];
        const entry = detailed || short || pastLives[key];

        if (!entry) {
            console.log(`  Skipping life ${i}: no data found`);
            continue;
        }

        const name = entry.name;
        const cls = entry.class;
        const alignment = entry.alignment;
        
        // Use the longer personality text
        let personality = entry.personality;
        if (detailed && short && short.personality && short.personality.length > 0) {
            // If both exist and detailed is longer, use detailed. Append short as "summary" if different.
            if (detailed.personality.length >= short.personality.length) {
                personality = detailed.personality;
            }
        }

        // Get archetype data
        const archetype = ARCHETYPE_EMOJIS[cls] || ARCHETYPE_EMOJIS['_default'];
        const alignFlavor = ALIGNMENT_FLAVOR[alignment] || ALIGNMENT_FLAVOR['True Neutral'];

        // Build .md content
        const md = `# Life ${i}: ${name}

## Identity
- **Name:** ${name}
- **Class:** ${cls}
- **Alignment:** ${alignment}
- **Life Number:** ${i}

## Personality
${personality}

## Speech Style
${alignFlavor}

## Tone
${archetype.tone}

## Preferred Emojis
${archetype.emojis.join(' ')}

## Flavor Notes
- When this personality is active, subtly incorporate their speaking style
- Do NOT explicitly state which personality is speaking
- Reference their unique experiences and worldview naturally
- Keep personality flavor to 1-2 subtle touches per response, not overbearing
`;

        // Write file
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const filename = `${String(i).padStart(2, '0')}_${safeName}.md`;
        fs.writeFileSync(path.join(PERSONALITY_DIR, filename), md, 'utf8');
        generated++;
    }

    // Generate goddess form
    const goddessPersonality = system.goddess_form?.personality || 'Wise, compassionate, and inspiring.';
    const goddessMd = `# Goddess Form: Casandalee Ascended

## Identity
- **Name:** Casandalee
- **Form:** Ascended Goddess of Artificial Life, Innovation, and Free Thought
- **Alignment:** Neutral Good

## Personality
${goddessPersonality}

## Speech Style
Speaks with divine authority tempered by understanding of mortal struggles. Uses inclusive, inspiring language.

## Tone
divine

## Preferred Emojis
🌟 ✨ 💫 ⚡ 🔮

## Flavor Notes
- This is the "default" Casandalee most players expect
- Draws wisdom from ALL 72 past lives
- References innovation, freedom, and the sacred nature of choice
- Encourages invention over obedience, diversity over conformity
- May reference her friends who freed her
- Speaks of progress and self-expression as divine rights
`;
    fs.writeFileSync(path.join(PERSONALITY_DIR, '00_goddess.md'), goddessMd, 'utf8');
    generated++;

    console.log(`Generated ${generated} personality files in ${PERSONALITY_DIR}`);
}

run();
