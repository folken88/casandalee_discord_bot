#!/usr/bin/env node
/**
 * One-time migration: Enrich vault character markdown files with
 * Discord IDs, player names, and campaign assignments from all data sources.
 *
 * Sources:
 *   - data/discord-user-map.json (Discord IDs)
 *   - data/dossiers/*.json (player names, aliases, descriptions)
 *   - Player-campaign mapping (hardcoded from Toby's info)
 *
 * Run: node tools/enrich-vault-characters.js
 */

const fs = require('fs');
const path = require('path');

const VAULT_DIR = path.join(__dirname, '../obsidian_cass/cassvault/Characters');
const DOSSIER_DIR = path.join(__dirname, '../data/dossiers');
const DISCORD_MAP_PATH = path.join(__dirname, '../data/discord-user-map.json');

// Player → campaign → character mapping (from Toby)
const PLAYER_CHARACTERS = {
    'Kip':      { IG: 'Ulfred', SS: 'Holden' },
    'Daemon':   { IG: 'Nomkath', SS: 'Storgrim' },
    'Enrique':  { IG: 'Brow', SS: 'Sha-Feng' },
    'Josh':     { IG: 'Olbryn', SS: 'Ser-Toche', CC: 'Dinvaya', HR: 'Gabriel', HV: 'Reese' },
    'Tim':      { IG: ['Akradden', 'Akradenn'], SS: 'Vaughan', CC: 'Gaspar', HR: 'Celeb', HV: 'Jamal' },
    'Rye':      { IG: 'Luna', SS: ['Riviera', 'Towa'] },
    'Graham':   { SS: 'Bujon', CC: 'Kai' },
    'Mandi':    { SS: 'Rhyarca', CC: 'Kate Blackwood' },
    'Sydney':   { CC: 'Kovira' },
    'Anna':     { CC: 'Elfrip' },
    'Chris':    { CC: 'Rodney Danger Smith', HR: 'Nigel', HV: 'Bruce' },
    'Harrison': { CC: 'Dismas', HR: 'Femmick', HV: 'Draymus' },
};

// Build reverse map: character name → { player, campaigns[] }
function buildCharacterLookup() {
    const lookup = {};
    for (const [player, campaigns] of Object.entries(PLAYER_CHARACTERS)) {
        for (const [campaign, chars] of Object.entries(campaigns)) {
            const charList = Array.isArray(chars) ? chars : [chars];
            for (const charName of charList) {
                const key = charName.toLowerCase();
                if (!lookup[key]) {
                    lookup[key] = { player, campaigns: [] };
                }
                lookup[key].campaigns.push(campaign);
            }
        }
    }
    return lookup;
}

// Build discord ID map: character name → discord ID
function loadDiscordMap() {
    if (!fs.existsSync(DISCORD_MAP_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(DISCORD_MAP_PATH, 'utf-8'));
    const map = {};
    for (const [id, info] of Object.entries(raw)) {
        if (info.character) {
            map[info.character.toLowerCase()] = id;
        }
    }
    return map;
}

// Load dossier data for a character
function loadDossier(charName) {
    // Try various filename formats
    const variants = [
        charName.toLowerCase().replace(/\s+/g, '_'),
        charName.toLowerCase().replace(/\s+/g, '-'),
        charName.toLowerCase(),
    ];
    for (const v of variants) {
        const p = path.join(DOSSIER_DIR, `${v}.json`);
        if (fs.existsSync(p)) {
            try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { }
        }
    }
    return null;
}

// Parse frontmatter from markdown
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content, raw: '' };

    const raw = match[1];
    const body = match[2];
    const frontmatter = {};

    for (const line of raw.split('\n')) {
        const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
        if (kv) {
            let [, key, value] = kv;
            value = value.trim();
            frontmatter[key] = value;
        }
    }

    return { frontmatter, body, raw };
}

// Rebuild frontmatter string from object (preserving order where possible)
function buildFrontmatter(fm) {
    const lines = [];
    // Preferred order
    const order = ['name', 'type', 'race', 'class', 'level', 'player', 'discord_id', 'campaign', 'aliases', 'tags', 'created', 'updated'];

    const done = new Set();
    for (const key of order) {
        if (fm[key] !== undefined) {
            lines.push(formatFmLine(key, fm[key]));
            done.add(key);
        }
    }
    // Remaining keys
    for (const [key, value] of Object.entries(fm)) {
        if (!done.has(key)) {
            lines.push(formatFmLine(key, value));
        }
    }
    return lines.join('\n');
}

function formatFmLine(key, value) {
    if (Array.isArray(value)) {
        return `${key}: ${JSON.stringify(value)}`;
    }
    if (typeof value === 'number') {
        return `${key}: ${value}`;
    }
    // Quote strings that need it
    if (typeof value === 'string' && (value.includes(':') || value.includes('"') || value.includes('[') || value === '')) {
        return `${key}: "${value}"`;
    }
    return `${key}: ${value}`;
}

// Main
function main() {
    const charLookup = buildCharacterLookup();
    const discordMap = loadDiscordMap();

    // Get all vault character files
    if (!fs.existsSync(VAULT_DIR)) {
        console.log('Vault Characters dir not found:', VAULT_DIR);
        process.exit(1);
    }

    const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.md'));
    let updated = 0;

    for (const file of files) {
        const filePath = path.join(VAULT_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        const charName = frontmatter.name || path.basename(file, '.md');
        const key = charName.toLowerCase();
        let changed = false;

        // Try multiple matching strategies for the character lookup
        let charInfo = charLookup[key];
        if (!charInfo) {
            // Try first word (e.g., "Bujon, Storm of Cheliax" → "bujon")
            const firstWord = key.split(/[\s,]+/)[0];
            charInfo = charLookup[firstWord];
        }
        if (!charInfo) {
            // Try without honorifics (e.g., "Mr Brow" → "brow")
            const stripped = key.replace(/^(mr|mrs|ms|sir|ser|dr|lil|lord|lady)\s+/i, '');
            charInfo = charLookup[stripped];
        }
        if (!charInfo) {
            // Try partial matches (e.g., "William Gaspar" matches "gaspar")
            for (const [lookupKey, info] of Object.entries(charLookup)) {
                if (key.includes(lookupKey) || lookupKey.includes(key.split(/[\s,]+/)[0])) {
                    charInfo = info;
                    break;
                }
            }
        }

        // Also try discord map with same strategies
        let discordKey = key;
        if (!discordMap[discordKey]) {
            discordKey = key.split(/[\s,]+/)[0];
        }
        if (!discordMap[discordKey]) {
            discordKey = key.replace(/^(mr|mrs|ms|sir|ser|dr|lil|lord|lady)\s+/i, '');
        }
        // Our hardcoded lookup is authoritative — override dossier data
        if (charInfo) {
            if (frontmatter.player !== charInfo.player) {
                frontmatter.player = charInfo.player;
                changed = true;
            }
            const newCampaign = JSON.stringify(charInfo.campaigns);
            if (frontmatter.campaign !== newCampaign) {
                frontmatter.campaign = newCampaign;
                changed = true;
            }
        }

        // Add Discord ID
        const discordId = discordMap[key] || discordMap[discordKey];
        if (discordId && !frontmatter.discord_id) {
            frontmatter.discord_id = discordId;
            changed = true;
        }

        // Pull extra data from dossier ONLY if our lookup didn't have info
        const dossier = loadDossier(charName);
        if (dossier) {
            // Add player from dossier only if still missing (our lookup didn't match)
            if (!frontmatter.player && dossier.player && dossier.player !== 'Multiple Owners') {
                frontmatter.player = dossier.player;
                changed = true;
            }
            // Add discord ID from dossier playerUpdates
            if (!frontmatter.discord_id && dossier.playerUpdates?.length > 0) {
                const uid = dossier.playerUpdates[0].userId;
                if (uid && uid !== 'system') {
                    frontmatter.discord_id = uid;
                    changed = true;
                }
            }
        }

        // Update timestamp
        if (changed) {
            frontmatter.updated = `"${new Date().toISOString()}"`;
            const newContent = `---\n${buildFrontmatter(frontmatter)}\n---\n${body}`;
            fs.writeFileSync(filePath, newContent, 'utf-8');
            updated++;
            console.log(`  ✅ ${charName}: player=${frontmatter.player || '?'}, campaign=${frontmatter.campaign || '?'}, discord=${frontmatter.discord_id || '?'}`);
        } else {
            console.log(`  ⏭️  ${charName}: already complete or no data to add`);
        }
    }

    console.log(`\nDone! Updated ${updated}/${files.length} character files.`);
}

main();
