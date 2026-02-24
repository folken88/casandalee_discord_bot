/**
 * Discord User Map
 * Maps Discord user IDs to campaign character (dossier canonical name) and player display name.
 * Data in data/discord-user-map.json; edit there to add/change mappings.
 */

const fs = require('fs');
const path = require('path');

const MAP_PATH = path.join(__dirname, '../../data/discord-user-map.json');

/** @type {Record<string, { character: string, player: string|null }>} */
let map = {};

function load() {
    try {
        const raw = fs.readFileSync(MAP_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        map = {};
        for (const [id, value] of Object.entries(parsed)) {
            if (id.startsWith('_')) continue;
            if (value && typeof value.character === 'string') {
                map[id] = { character: value.character, player: value.player ?? null };
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('[discordUserMap] Failed to load:', err.message);
        }
        map = {};
    }
}

load();

/**
 * Get the dossier canonical character name for a Discord user ID.
 * @param {string} discordUserId - Discord snowflake ID
 * @returns {string|null} Canonical character name or null
 */
function getCharacterByDiscordId(discordUserId) {
    const entry = map[discordUserId];
    return entry ? entry.character : null;
}

/**
 * Get the player display name for a Discord user ID.
 * @param {string} discordUserId - Discord snowflake ID
 * @returns {string|null} Player name or null
 */
function getPlayerByDiscordId(discordUserId) {
    const entry = map[discordUserId];
    return entry ? entry.player : null;
}

/**
 * Get both character and player for a Discord user ID.
 * @param {string} discordUserId - Discord snowflake ID
 * @returns {{ character: string, player: string|null }|null}
 */
function getByDiscordId(discordUserId) {
    return map[discordUserId] ?? null;
}

/**
 * Reload map from disk (e.g. after editing data/discord-user-map.json).
 */
function reload() {
    load();
}

module.exports = {
    getCharacterByDiscordId,
    getPlayerByDiscordId,
    getByDiscordId,
    reload
};
