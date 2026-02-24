/**
 * Resolve server-specific emoji for timeline characters, events, and locations.
 * Uses data/timeline-emoji-map.json (display name -> shortcode). When displaying
 * timeline events or persona quotes, we can append these emoji when the text
 * mentions a mapped entity.
 */

const fs = require('fs');
const path = require('path');

const MAP_PATH = path.join(__dirname, '../../data/timeline-emoji-map.json');
let entityToShortcode = null;

function loadMap() {
    if (entityToShortcode !== null) return entityToShortcode;
    try {
        if (fs.existsSync(MAP_PATH)) {
            const raw = fs.readFileSync(MAP_PATH, 'utf8');
            const data = JSON.parse(raw);
            entityToShortcode = {};
            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('_')) continue;
                if (typeof value === 'string') entityToShortcode[key] = value;
            }
            return entityToShortcode;
        }
    } catch (_) { /* ignore */ }
    entityToShortcode = {};
    return entityToShortcode;
}

/**
 * Get Discord-formatted emoji strings for timeline entities mentioned in text.
 * @param {import('discord.js').Guild|null} guild - Guild to look up emoji in
 * @param {string} text - Text that might mention entities (e.g. quote or event description)
 * @returns {string[]} Array of <:name:id> strings, deduplicated, order by first mention
 */
function getTimelineEntityEmojis(guild, text) {
    if (!guild || !text || typeof text !== 'string') return [];
    const map = loadMap();
    if (Object.keys(map).length === 0) return [];
    const seen = new Set();
    const out = [];
    const lower = text.toLowerCase();
    // Sort by length descending so "Silver Mount" is checked before "Silver"
    const names = Object.keys(map).sort((a, b) => b.length - a.length);
    for (const name of names) {
        if (seen.has(name)) continue;
        if (!lower.includes(name.toLowerCase())) continue;
        const shortcode = map[name];
        const emoji = guild.emojis.cache.find(e => e.name === shortcode);
        if (emoji) {
            const formatted = emoji.toString();
            if (!seen.has(formatted)) {
                seen.add(formatted);
                seen.add(name);
                out.push(formatted);
            }
        }
    }
    return out;
}

/**
 * Append timeline entity emojis to a message string when guild and text are available.
 * @param {string} message - Current message (e.g. alignment emoji + persona emoji + quote)
 * @param {import('discord.js').Guild|null} guild - Guild for server emoji
 * @param {string} [quoteOrDescription] - Quote or event text to scan for entities
 * @returns {string} message + space + entity emojis (or just message if none)
 */
function appendTimelineEntityEmojis(message, guild, quoteOrDescription) {
    if (!quoteOrDescription || !guild) return message;
    const emojis = getTimelineEntityEmojis(guild, quoteOrDescription);
    if (emojis.length === 0) return message;
    return `${message} ${emojis.join(' ')}`;
}

module.exports = {
    getTimelineEntityEmojis,
    appendTimelineEntityEmojis,
    loadMap
};
