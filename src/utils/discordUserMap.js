/**
 * Discord User Map
 * Maps Discord user IDs to player name + campaign-specific character names.
 * Also maps Discord channel IDs to campaign codes.
 * Data in data/discord-user-map.json and data/channel-campaign-map.json.
 */

const fs = require('fs');
const path = require('path');

// The canonical map is the Obsidian vault file Tobias maintains; fall back to a
// data/ copy if the vault isn't present. (Previously only data/ was read — and
// it didn't exist — so NO player ever resolved and Cass guessed character names.)
const VAULT_USER_MAP_PATH = path.join(__dirname, '../../obsidian_cass/cassvault/Meta/discord-user-map.json');
const DATA_USER_MAP_PATH = path.join(__dirname, '../../data/discord-user-map.json');
const CHANNEL_MAP_PATH = path.join(__dirname, '../../data/channel-campaign-map.json');

/** Return the first path that exists, or the last one as a fallback. */
function firstExisting(paths) {
    for (const p of paths) {
        try { if (fs.existsSync(p)) return p; } catch (_) { /* ignore */ }
    }
    return paths[paths.length - 1];
}

/** @type {Record<string, { player: string, characters: Record<string, string> }>} */
let userMap = {};

/** @type {Record<string, string>} channelId -> campaign code */
let channelMap = {};

function load() {
    // Load user map
    try {
        const userMapPath = firstExisting([VAULT_USER_MAP_PATH, DATA_USER_MAP_PATH]);
        const raw = fs.readFileSync(userMapPath, 'utf8');
        const parsed = JSON.parse(raw);
        userMap = {};
        for (const [id, value] of Object.entries(parsed)) {
            if (id.startsWith('_')) continue;
            if (!value || typeof value !== 'object') continue;

            // New format: { player, characters: { campaign: charName } }
            // Legacy format: { character, player } — character may be null (the GM).
            let characters = {};
            if (value.characters && typeof value.characters === 'object') {
                characters = value.characters;
            } else if (typeof value.character === 'string' && value.character.trim()) {
                characters = { _default: value.character };
            }

            // Register the entry as long as we know the player OR a character, so
            // character-less players (e.g. the GM) still resolve by player name
            // instead of falling through to a hallucinated character.
            if (value.player || Object.keys(characters).length > 0) {
                userMap[id] = {
                    player: value.player ?? null,
                    characters,
                    role: value.role ?? null
                };
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('[discordUserMap] Failed to load user map:', err.message);
        }
        userMap = {};
    }

    // Load channel map
    try {
        const raw = fs.readFileSync(CHANNEL_MAP_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        channelMap = {};
        for (const [id, campaign] of Object.entries(parsed)) {
            if (id.startsWith('_')) continue;
            if (typeof campaign === 'string') {
                channelMap[id] = campaign.toLowerCase();
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('[discordUserMap] Failed to load channel map:', err.message);
        }
        channelMap = {};
    }
}

load();

/**
 * Get the campaign code for a Discord channel.
 * @param {string} channelId - Discord channel snowflake ID
 * @returns {string|null} Campaign code (ig, ss, cc, hr, hv, jg) or null
 */
function getCampaignByChannelId(channelId) {
    return channelMap[channelId] ?? null;
}

/**
 * Get the character name for a Discord user, optionally campaign-aware.
 * If channelId is provided, returns the character for that campaign.
 * Falls back to: campaign-specific -> first available character -> null.
 * @param {string} discordUserId - Discord snowflake ID
 * @param {string} [channelId] - Discord channel ID for campaign context
 * @returns {string|null} Character name or null
 */
function getCharacterByDiscordId(discordUserId, channelId = null) {
    const entry = userMap[discordUserId];
    if (!entry) return null;

    const chars = entry.characters;
    if (!chars || Object.keys(chars).length === 0) return null;

    // Legacy format
    if (chars._default) return chars._default;

    // Campaign-aware lookup
    if (channelId) {
        const campaign = channelMap[channelId];
        if (campaign && chars[campaign]) {
            return chars[campaign];
        }
    }

    // Fallback: return first character (better than nothing)
    return Object.values(chars)[0];
}

/**
 * Get the player display name for a Discord user ID.
 * @param {string} discordUserId - Discord snowflake ID
 * @returns {string|null} Player name or null
 */
function getPlayerByDiscordId(discordUserId) {
    const entry = userMap[discordUserId];
    return entry ? entry.player : null;
}

/**
 * Get full entry for a Discord user ID.
 * @param {string} discordUserId - Discord snowflake ID
 * @returns {{ player: string, characters: Record<string, string> }|null}
 */
function getByDiscordId(discordUserId) {
    return userMap[discordUserId] ?? null;
}

/**
 * Reload maps from disk.
 */
function reload() {
    load();
}

module.exports = {
    getCharacterByDiscordId,
    getPlayerByDiscordId,
    getByDiscordId,
    getCampaignByChannelId,
    reload
};
