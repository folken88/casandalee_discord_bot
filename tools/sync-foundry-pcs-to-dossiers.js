#!/usr/bin/env node
/**
 * Sync Foundry VTT PC characters into Cass bot dossiers.
 *
 * Reads a JSON file where each element is a get-character response from the
 * Foundry MCP (list-characters type "character", then get-character per id/name).
 * Writes one dossier per character to data/dossiers/{safeName}.json in the
 * format expected by dossierManager.js and /character.
 *
 * Usage:
 *   node tools/sync-foundry-pcs-to-dossiers.js <path-to-characters.json>
 *
 * To produce the input file, use the Foundry MCP from Cursor:
 *   1. list-characters with type "character"
 *   2. For each character, get-character with identifier (name or id)
 *   3. Save the array of get-character responses to a JSON file
 *   4. Run this script with that file path
 *
 * Dossier format (see src/utils/dossierManager.js):
 *   canonicalName, aliases, race, class, level, player, description,
 *   notes, rollHistory, timelineReferences, playerUpdates, emojiReactions,
 *   createdAt, updatedAt
 */

const fs = require('fs');
const path = require('path');

const DOSSIER_DIR = path.join(__dirname, '..', 'data', 'dossiers');

/**
 * Build a Cass dossier from a Foundry get-character response (PF1/PF2/D&D5e).
 * @param {Object} char - get-character MCP response
 * @returns {Object} dossier for dossierManager
 */
function foundryToDossier(char) {
    const name = char.name || char.id || 'Unknown';
    const items = char.items || [];
    const raceItem = items.find(i => i.type === 'race');
    const classItems = items.filter(i => i.type === 'class');
    const race = raceItem?.name || null;
    const cls = classItems.length > 0
        ? classItems.map(c => c.name).filter(Boolean).join(' / ')
        : null;
    const level = char.basicInfo?.level ?? classItems[0]?.level ?? null;
    const hp = char.basicInfo?.hitPoints;
    const hpStr = hp ? `${hp.current ?? '?'}/${hp.max ?? '?'}` : null;
    const descParts = [];
    if (hpStr) descParts.push(`HP ${hpStr}`);
    if (race || cls) descParts.push([race, cls].filter(Boolean).join(' '));
    if (level != null) descParts.push(`Level ${level}`);
    const description = descParts.length ? descParts.join(' | ') : null;

    return {
        canonicalName: name,
        aliases: [],
        race,
        class: cls,
        level,
        player: null,
        description,
        notes: [],
        rollHistory: [],
        timelineReferences: [],
        playerUpdates: [],
        emojiReactions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _source: 'foundry-vtt-mcp',
        _foundryId: char.id,
    };
}

function safeFilename(canonicalName) {
    return canonicalName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: node tools/sync-foundry-pcs-to-dossiers.js <path-to-characters.json>');
        process.exit(1);
    }
    if (!fs.existsSync(inputPath)) {
        console.error('File not found:', inputPath);
        process.exit(1);
    }
    const raw = fs.readFileSync(inputPath, 'utf8');
    let characters;
    try {
        characters = JSON.parse(raw);
    } catch (e) {
        console.error('Invalid JSON:', e.message);
        process.exit(1);
    }
    if (!Array.isArray(characters)) {
        console.error('Input must be a JSON array of get-character responses.');
        process.exit(1);
    }

    if (!fs.existsSync(DOSSIER_DIR)) {
        fs.mkdirSync(DOSSIER_DIR, { recursive: true });
    }

    let written = 0;
    for (const char of characters) {
        const dossier = foundryToDossier(char);
        const safe = safeFilename(dossier.canonicalName);
        const filePath = path.join(DOSSIER_DIR, `${safe}.json`);
        // Remove _source and _foundryId from written file if you want strict dossier shape; dossierManager ignores unknown keys
        fs.writeFileSync(filePath, JSON.stringify(dossier, null, 2), 'utf8');
        written++;
        console.log(`Wrote ${dossier.canonicalName} -> ${safe}.json`);
    }
    console.log(`\nSynced ${written} dossiers to ${DOSSIER_DIR}. Restart the bot to load them.`);
}

main();
