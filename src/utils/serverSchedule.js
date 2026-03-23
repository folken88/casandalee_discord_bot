/**
 * Server Schedule - Discord guild scheduled events (e.g. Iron Gods sessions).
 * Fetches events, finds ones matching a pattern (e.g. "iron-gods"), and exposes
 * a context fragment for the LLM so Cass can mention when a session is on the schedule.
 */

const logger = require('./logger');

/** @type {string|null} Next matching event summary for LLM context */
let nextEventSummary = null;

/** Pattern to match in event name (case-insensitive). */
const EVENT_NAME_PATTERN = /iron-gods/i;

/**
 * Fetch guild scheduled events and update stored summary for matching events.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').GuildScheduledEvent|null>} Next upcoming matching event or null
 */
async function updateFromGuild(guild) {
    if (!guild?.scheduledEvents) {
        nextEventSummary = null;
        return null;
    }
    try {
        const events = await guild.scheduledEvents.fetch({ withUserCount: true });
        const now = Date.now();
        /** @type {import('discord.js').GuildScheduledEvent[]} */
        const matching = events
            .filter(e => EVENT_NAME_PATTERN.test(e.name) && e.scheduledStartTimestamp > now && !e.canceled)
            .sort((a, b) => a.scheduledStartTimestamp - b.scheduledStartTimestamp)
            .values();
        const next = matching.next().value ?? null;
        if (next) {
            const start = next.scheduledStartAt;
            const end = next.scheduledEndAt;
            const startStr = start ? start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'TBD';
            const endStr = end ? end.toLocaleTimeString(undefined, { timeStyle: 'short' }) : '';
            nextEventSummary = `Discord server schedule: "${next.name}" is scheduled for ${startStr}` + (endStr ? ` until ${endStr}` : '') + (next.userCount != null ? ` (${next.userCount} interested)` : '') + '.';
            logger.info('Server schedule: next Iron Gods event', { name: next.name, start: startStr });
            return next;
        }
        nextEventSummary = null;
        return null;
    } catch (err) {
        logger.warn('Server schedule fetch failed', { error: err.message });
        nextEventSummary = null;
        return null;
    }
}

/**
 * Get a short context string for the LLM when a matching event is on the schedule.
 * @returns {string} Empty string if none, otherwise one line to append to context
 */
function getContextFragment() {
    if (!nextEventSummary) return '';
    return `\n${nextEventSummary}`;
}

module.exports = {
    updateFromGuild,
    getContextFragment,
    EVENT_NAME_PATTERN
};
