/**
 * Learned Facts - Persistent "things I learned in conversation" for Casandalee.
 * Stored as one fact per line in data/learned-facts.txt. Players add via /remember.
 * Used to inject into LLM context so the bot can recall taught knowledge.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const FACTS_PATH = path.join(__dirname, '../../data/learned-facts.txt');
const MAX_FACTS = 500;
const MAX_CONTEXT_LINES = 100;

/**
 * Ensure data dir and file exist
 */
function _ensureFile() {
    const dir = path.dirname(FACTS_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info('Created data directory for learned-facts');
    }
    if (!fs.existsSync(FACTS_PATH)) {
        fs.writeFileSync(FACTS_PATH, '', 'utf8');
        logger.info('Created learned-facts.txt');
    }
}

/**
 * Load all facts from disk (one per line; skip empty and # comments)
 * @returns {string[]}
 */
function load() {
    _ensureFile();
    try {
        const raw = fs.readFileSync(FACTS_PATH, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('#'));
        return lines;
    } catch (err) {
        logger.error('Error loading learned-facts:', err.message);
        return [];
    }
}

/**
 * Append a single fact and persist. Dedupes by exact match (case-insensitive).
 * @param {string} fact - One line to remember
 * @returns {boolean} - true if added, false if duplicate or invalid
 */
function addFact(fact) {
    if (!fact || typeof fact !== 'string') return false;
    const trimmed = fact.trim();
    if (trimmed.length === 0) return false;

    _ensureFile();
    const existing = load();
    const lower = trimmed.toLowerCase();
    if (existing.some(l => l.toLowerCase() === lower)) {
        logger.debug('Learned fact duplicate, skipping:', trimmed.substring(0, 50));
        return false;
    }
    const capped = existing.length >= MAX_FACTS ? existing.slice(-MAX_FACTS + 1) : existing;
    capped.push(trimmed);
    try {
        fs.writeFileSync(FACTS_PATH, capped.join('\n') + '\n', 'utf8');
        logger.info('Learned fact added:', trimmed.substring(0, 60) + (trimmed.length > 60 ? '…' : ''));
        return true;
    } catch (err) {
        logger.error('Error saving learned-facts:', err.message);
        return false;
    }
}

/**
 * Get learned facts as a single string for LLM system prompt (most recent first, capped).
 * @returns {string} - Empty string if no facts
 */
function getContextForLLM() {
    const facts = load();
    if (facts.length === 0) return '';
    const recent = facts.slice(-MAX_CONTEXT_LINES).reverse();
    const block = recent.map(f => `- ${f}`).join('\n');
    return `\n\nThings learned in conversation / taught by players (use when relevant):\n${block}`;
}

/**
 * Get count of stored facts (for /remember list or replies)
 * @returns {number}
 */
function getCount() {
    return load().length;
}

module.exports = {
    load,
    addFact,
    getContextForLLM,
    getCount,
    FACTS_PATH
};
