/**
 * Race Traits Database for Pathfinder 1e
 * Provides abbreviated race trait information for reincarnation results
 */

const raceTraits = {
    // Standard Core Races
    "Bugbear": {
        traits: "+4 Str, +2 Dex, -2 Cha | Darkvision 60ft | Scent | Sneaky (+4 Stealth)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-bugbear/"
    },
    "Dwarf": {
        traits: "+2 Con, +2 Wis, -2 Cha | Darkvision 60ft | Slow & Steady (20ft, never slowed) | Stonecunning | Hardy (+2 vs poison/spells/spell-like)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/dwarf/"
    },
    "Elf": {
        traits: "+2 Dex, +2 Int, -2 Con | Low-light vision | Elven Magic (+2 to overcome SR) | Keen Senses (+2 Perception) | Weapon Familiarity (longbow/rapier)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/elf/"
    },
    "Gnoll": {
        traits: "+4 Str, +2 Con, -2 Int, -2 Cha | Darkvision 60ft | Natural Armor +1",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-gnoll/"
    },
    "Gnome": {
        traits: "+2 Con, +2 Cha, -2 Str | Low-light vision | Small (+1 AC/attack, -1 CMB/CMD) | Defensive Training (+4 AC vs giants) | Gnome Magic (SLAs)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/gnome/"
    },
    "Goblin": {
        traits: "+4 Dex, -2 Str, -2 Cha | Darkvision 60ft | Small | Fast (30ft) | Skilled (+4 Ride, Stealth)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/goblin/"
    },
    "Half-elf": {
        traits: "+2 to one ability | Low-light vision | Adaptability (bonus feat) | Keen Senses (+2 Perception) | Elf Blood | Multitalented (2 favored classes)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/half-elf/"
    },
    "Half-orc": {
        traits: "+2 to one ability | Darkvision 60ft | Intimidating (+2 Intimidate) | Orc Blood | Orc Ferocity (fight at 0 HP)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/half-orc/"
    },
    "Halfling": {
        traits: "+2 Dex, +2 Cha, -2 Str | Small | Slow (20ft) | Fearless (+2 vs fear) | Halfling Luck (+1 all saves) | Sure-Footed (+2 Acrobatics/Climb)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/halfling/"
    },
    "Human": {
        traits: "+2 to one ability | Bonus feat | Skilled (+1 skill point/level) | Languages: Common + Int bonus",
        srdLink: "https://www.d20pfsrd.com/races/core-races/human/"
    },
    "Kobold": {
        traits: "+2 Dex, -4 Str, -2 Con | Darkvision 60ft | Small | Light Sensitivity | Crafty (+2 Craft [traps], Perception, Profession [miner])",
        srdLink: "https://www.d20pfsrd.com/races/core-races/kobold/"
    },
    "Lizardfolk": {
        traits: "+2 Str, +2 Con, -2 Int | Natural Armor +5 | Hold Breath | Swim 30ft",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-lizardfolk/"
    },
    "Orc": {
        traits: "+4 Str, -2 Int, -2 Wis, -2 Cha | Darkvision 60ft | Ferocity (fight at 0 HP) | Light Sensitivity | Weapon Familiarity (falchion/greataxe)",
        srdLink: "https://www.d20pfsrd.com/races/core-races/orc/"
    },
    "Troglodyte": {
        traits: "+4 Str, -2 Dex, +2 Con, -4 Int, -4 Cha | Darkvision 90ft | Natural Armor +6 | Stench (sickened, DC 13 Fort)",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/humanoids/troglodyte/"
    },
    
    // Featured/Uncommon Races
    "Aasimar": {
        traits: "+2 Wis, +2 Cha | Darkvision 60ft | Skilled (+2 Diplomacy, Perception) | Celestial Resistance (acid/cold/elec 5) | SLA: daylight 1/day",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-aasimar/"
    },
    "Android": {
        traits: "+2 Dex, +2 Int, -2 Cha | Darkvision 60ft/Low-light | Constructed (+4 saves vs mind-affecting, poison, disease) | Emotionless (-4 Sense Motive/Bluff) | Nanite Surge (1d8+level, 3/day)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/uncommon-races/arg-android/"
    },
    "Catfolk": {
        traits: "+2 Dex, +2 Cha, -2 Wis | Low-light vision | Cat's Luck (1/day, reroll Reflex save) | Sprinter (charge/run x2 speed) | Natural Hunter (+2 Perception/Stealth/Survival)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-catfolk/"
    },
    "Changeling": {
        traits: "+2 Wis, +2 Cha, -2 Con | Darkvision 60ft | Claws (1d4) | Hag Racial Trait (varied) | Natural Armor +1 | Languages: Common",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-changeling/"
    },
    "Dhampir": {
        traits: "+2 Dex, +2 Cha, -2 Con | Darkvision 60ft/Low-light | Undead Resistance (+2 saves vs disease/mind-affecting) | Light Sensitivity | Negative Energy Affinity",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-dhampir/"
    },
    "Ifrit": {
        traits: "+2 Dex, +2 Cha, -2 Wis | Darkvision 60ft | Fire Affinity (+1 CL fire spells) | Energy Resistance (fire 5) | SLA: burning hands 1/day",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-ifrit/"
    },
    "Drow": {
        traits: "+2 Dex, +2 Cha, -2 Con | Darkvision 120ft | Drow Immunities (+2 vs enchantment) | Light Blindness | Spell Resistance (11+level) | SLAs: dancing lights/darkness/faerie fire",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-drow/"
    },
    "Duergar": {
        traits: "+2 Con, +2 Wis, -4 Cha | Darkvision 120ft | Slow & Steady (20ft) | Light Sensitivity | Duergar Immunities (+2 vs spells/SLAs) | SLAs: enlarge person/invisibility 1/day each",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-duergar/"
    },
    "Fetchling": {
        traits: "+2 Dex, +2 Cha, -2 Wis | Darkvision 60ft/Low-light | Skilled (+2 Knowledge [planes], Stealth) | Shadow Blending (concealment in dim light) | SLA: disguise self 1/day",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-fetchling/"
    },
    "Ghoran": {
        traits: "+2 Con, +2 Cha, -2 Int | Low-light vision | Delicious (at risk of being eaten) | Photosynthesis (sustains on sunlight) | Past-Life Knowledge (+2 two Knowledge skills)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/more-races/advanced-races-11-20-rp/ghoran-19-rp/"
    },
    "Gillman": {
        traits: "+2 Con, +2 Cha, -2 Wis | Low-light vision | Water Dependent (must submerge 1/day) | Amphibious | Enchantment Resistance (+2 saves vs enchantment)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-gillmen/"
    },
    "Aquatic Elf": {
        traits: "+2 Dex, +2 Int, -2 Con | Low-light vision | Elven Magic | Swim 30ft | Aquatic (+8 Swim, take 10 while distracted) | Languages: Common, Elven",
        srdLink: "https://www.d20pfsrd.com/races/core-races/elf/"
    },
    "Half Giant": {
        traits: "+2 Str, +2 Con, -2 Dex | Low-light vision | Giant Blood (count as giant) | Powerful Build (larger size category for CMB/CMD) | Fire Acclimated (resist fire 5)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/more-races/advanced-races-11-20-rp/half-giant/"
    },
    "Ogre": {
        traits: "+10 Str, +4 Con, -2 Dex, -4 Int, -4 Cha | Darkvision 60ft | Large | Natural Armor +5 | Low-light vision",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/humanoids/giants/ogre/"
    },
    "Hobgoblin": {
        traits: "+2 Dex, +2 Con | Darkvision 60ft | Sneaky (+4 Stealth) | Goblin subtype",
        srdLink: "https://www.d20pfsrd.com/races/core-races/hobgoblin/"
    },
    "Tiefling": {
        traits: "+2 Dex, +2 Int, -2 Cha | Darkvision 60ft | Skilled (+2 Bluff, Stealth) | Fiendish Resistance (cold/elec/fire 5) | SLA: darkness 1/day",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-tiefling/"
    },
    "Kasatha": {
        traits: "+2 Str, +2 Wis, -2 Int | Desert Runner (no penalties in hot environment) | Four-Armed | Jumper (+2 Acrobatics)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/more-races/advanced-races-11-20-rp/kasatha-20-rp/"
    },
    "Kitsune": {
        traits: "+2 Dex, +2 Cha, -2 Str | Low-light vision | Change Shape (human form) | Agile (+2 Acrobatics) | Natural Weapons (bite 1d4)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/uncommon-races/arg-kitsune/"
    },
    "Lashunta": {
        traits: "+2 Cha (varies by subtype) | Limited Telepathy 30ft | Lashunta Magic (SLAs) | Knowledgeable (+2 one Knowledge)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/more-races/advanced-races-11-20-rp/lashunta/"
    },
    "Nagaji": {
        traits: "+2 Str, +2 Cha, -2 Int | Low-light vision | Armored Scales (+1 natural armor) | Resistant (+2 saves vs mind-affecting, poison) | Serpent's Sense (+2 Handle Animal [reptiles])",
        srdLink: "https://www.d20pfsrd.com/races/other-races/uncommon-races/arg-nagaji/"
    },
    "Oread": {
        traits: "+2 Str, +2 Wis, -2 Cha | Darkvision 60ft | Earth Affinity (+1 CL earth spells) | Energy Resistance (acid 5) | SLA: magic stone 1/day",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-oread/"
    },
    "Samsaran": {
        traits: "+2 Int, +2 Wis, -2 Con | Low-light vision | Lifebound (+2 saves vs death effects, negative energy, etc.) | Samsaran Magic (mystic past life) | Shards of the Past (+2 two Knowledge skills)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/uncommon-races/arg-samsaran/"
    },
    "Strix": {
        traits: "+2 Dex, -2 Cha | Darkvision 60ft/Low-light | Flight 60ft (average) | Hatred (+1 attack vs humans) | Nocturnal (+2 Perception/Stealth at night) | Suspicious (+2 Sense Motive)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-strix/"
    },
    "Tengu": {
        traits: "+2 Dex, +2 Wis, -2 Con | Low-light vision | Sneaky (+2 Perception, Stealth) | Gifted Linguist (learn any language) | Natural Weapons (bite 1d3)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-tengu/"
    },
    "Vanara": {
        traits: "+2 Dex, +2 Wis, -2 Cha | Low-light vision | Climb 20ft | Nimble (+2 Acrobatics, Stealth) | Prehensile Tail",
        srdLink: "https://www.d20pfsrd.com/races/other-races/uncommon-races/arg-vanara/"
    },
    "Vishkanya": {
        traits: "+2 Dex, +2 Cha, -2 Wis | Low-light vision | Poison Use | Toxic (bite or blood carries venom) | Weapon Familiarity (blowgun, shortbow)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/uncommon-races/arg-vishkanya/"
    },
    "Merfolk": {
        traits: "+2 Dex, +2 Con, +2 Cha | Low-light vision | Amphibious | Swim 50ft | Armor Limitation (no leg armor) | Languages: Common, Aquan",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-merfolk/"
    },
    "Ratfolk": {
        traits: "+2 Dex, +2 Int, -2 Str | Darkvision 60ft | Small | Rodent Empathy | Swarming (share squares with allies) | Tinker (+2 Craft [alchemy], Perception, Use Magic Device)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-ratfolk/"
    },
    "Wayangs": {
        traits: "+2 Dex, +2 Int, -2 Wis | Darkvision 60ft | Small | Light & Dark (+1 attack in dim light, -1 in bright) | Lurker (+2 Perception, Stealth) | Shadow Magic (+1 DC shadow spells)",
        srdLink: "https://www.d20pfsrd.com/races/other-races/featured-races/arg-wayang/"
    },

    // Aquatic-Specific Races
    "Locathah": {
        traits: "+2 Dex, +2 Wis, -2 Int | Low-light vision | Amphibious | Swim 60ft | Natural Armor +3 | Languages: Aquan",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/humanoids/locathah/"
    },
    "Cecaelia": {
        traits: "+2 Wis, +2 Cha, -2 Int | Darkvision 60ft/Low-light | Jet (swim 200ft in straight line, 1/hour) | Tentacles (8 arms, 2 primary) | Swim 40ft | Natural Armor +1",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/monstrous-humanoids/cecaelia/"
    },
    "Sahuagin (Malenti)": {
        traits: "+2 Dex, +2 Int, -2 Cha (elf stats) | Darkvision 60ft | Blindsense 30ft | Amphibious | Swim 60ft | Speak with Sharks | Light Blindness",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/monstrous-humanoids/sahuagin/"
    },
    "Adaro": {
        traits: "+4 Str, +4 Con, +2 Wis | Darkvision 60ft | Amphibious | Swim 50ft | Natural Armor +7 | Keen Scent",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/monstrous-humanoids/adaro/"
    },
    "Siyokoy": {
        traits: "+2 Dex, +2 Con, -2 Cha | Darkvision 60ft | Amphibious | Swim 30ft | Electricity Resistance 5 | Eel Strike (grab and shocking touch)",
        srdLink: null
    },
    "Skum (Free-Willed)": {
        traits: "+4 Str, +4 Con, -2 Int, -2 Wis | Darkvision 60ft | Amphibious | Swim 40ft | Natural Armor +6 | Claws & Bite",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/monstrous-humanoids/skum/"
    },
    "Triton": {
        traits: "+2 Str, +2 Cha, -2 Dex | Darkvision 60ft/Low-light | Amphibious | Swim 40ft | SLA: summon nature's ally (water creatures) | Languages: Common, Aquan",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/outsiders/triton/"
    },
    "Grindylow": {
        traits: "+4 Dex, -2 Str, -2 Cha | Darkvision 60ft | Small | Jet (swim 200ft straight, 1/hour) | Swim 40ft | Tentacles (grab)",
        srdLink: "https://www.d20pfsrd.com/bestiary/monster-listings/aberrations/grindylow/"
    },
    "Iku-Turso (Lesser Spawn)": {
        traits: "+2 Str, +2 Con, -2 Cha | Darkvision 60ft | Amphibious | Swim 30ft | Natural Armor +2 | Eel-like body (squeeze through tight spaces)",
        srdLink: null
    },
    "Ceratioidi": {
        traits: "+2 Con, +2 Wis, -2 Cha | Darkvision 120ft | Amphibious | Swim 20ft | Bioluminescent Lure | Light Sensitivity | Pressure Adapted",
        srdLink: null
    },
    "Human (Shackles Islander)": {
        traits: "+2 to one ability | Bonus feat | Skilled (+1 skill point/level) | Sailor/Pirate Background (+2 Profession [sailor], Swim) | Languages: Common, Polyglot",
        srdLink: "https://www.d20pfsrd.com/races/core-races/human/"
    },

    // Custom Shackles Variants
    "Sea Reaver Orc": {
        traits: "+4 Str, -2 Int, -2 Cha | Darkvision 60ft | Swim 30ft (+8 Swim checks, take 10) | Salt-Hardened Lungs (hold breath x2) | Slave-Breaker Ferocity (1/day fight at 0 HP, +2 vs aquatic foes) | Weapon Familiarity (trident/spear/net) | Languages: Orc, Aquan",
        lore: "Descended from orc clans once enslaved by sahuagin, Sea Reavers adapted to life below the waves through brutal necessity and hard-won freedom.",
        srdLink: null
    },
    "Ship-Bound Half-Elf": {
        traits: "+2 to one ability | Low-light vision | Sea-Trained (Skill Focus [Profession sailor/pirate] and [Swim]) | Deck Reflexes (+2 Acrobatics/Balance on ships) | Shackles Weapon Training (rapier/cutlass/scimitar) | Languages: Common, Elven",
        lore: "Born and raised on decks slick with brine and blood, ship-bound half-elves are creatures of rope, tide, and steel rather than forest and bow.",
        srdLink: null
    },
    "Besmaran Changeling": {
        traits: "+2 Wis, +2 Cha, -2 Con | Darkvision 60ft | Besmaran Protection (no hag transformation while serving Besmara) | Salt-Witch Heritage (+2 saves vs hag magic) | Pirate's Guile (+2 Bluff/Intimidate) | Sea Hex (charm person or obscuring mist 1/day) | Languages: Common, Aklo",
        lore: "These changelings are claimed not by hags, but by the will of Besmara, the Pirate Queen. As long as they sail, steal, and live free, their fate is their own.",
        srdLink: null
    },

    // Special Results
    "Other (GM's Choice)": {
        traits: "GM determines race and traits based on campaign context.",
        srdLink: null
    },
    "Other Aquatic Humanoid (GM's Choice)": {
        traits: "GM determines aquatic race that plausibly exists in the Shackles or surrounding seas.",
        srdLink: null
    },
    "Player's Choice (GM Approval)": {
        traits: "Player may choose race subject to GM approval. May require rare reagents, divine favor, or significant roleplay consequences.",
        srdLink: null
    }
};

module.exports = raceTraits;
