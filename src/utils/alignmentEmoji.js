/**
 * Resolve server-specific alignment emoji for Casandalee persona quotes.
 * Maps alignment strings (e.g. "Lawful Good") to Discord custom emoji shortcode
 * names (e.g. lawful_good) and looks them up in the guild.
 */

/** Alignment display name -> custom emoji name (shortcode without colons) */
const ALIGNMENT_TO_SHORTCODE = {
    'lawful good': 'lawful_good',
    'lawful neutral': 'lawful_neutral',
    'lawful evil': 'lawful_evil',
    'neutral good': 'neutral_good',
    'true neutral': 'neutral_true',
    'neutral': 'neutral_true',
    'neutral evil': 'neutral_evil',
    'chaotic good': 'chaotic_good',
    'chaotic neutral': 'chaotic_neutral',
    'chaotic evil': 'chaotic_evil'
};

/**
 * Get the Discord-formatted alignment emoji for a guild (server-specific).
 * @param {import('discord.js').Guild|null} guild - Guild to look up emoji in
 * @param {string} [alignment] - Alignment string (e.g. "Lawful Good", "True Neutral")
 * @returns {string} <:name:id> or '' if not found
 */
function getAlignmentEmojiForGuild(guild, alignment) {
    if (!guild || !alignment || typeof alignment !== 'string') return '';
    const key = alignment.trim().toLowerCase();
    const shortcode = ALIGNMENT_TO_SHORTCODE[key];
    if (!shortcode) return '';
    const emoji = guild.emojis.cache.find(e => e.name === shortcode);
    if (!emoji) return '';
    return emoji.toString(); // <:name:id>
}

module.exports = {
    getAlignmentEmojiForGuild,
    ALIGNMENT_TO_SHORTCODE
};
