/**
 * Transcript Knowledge Base Reader for Casandalee
 * Reads the Obsidian-style vault in data/transcripts/ and provides
 * searchable knowledge for LLM context injection and slash commands.
 *
 * Follows the same pattern as learnedFacts.js — exposes getContextForLLM(query)
 * that returns a string to append to the system prompt.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault');
const SUMMARIES_DIR = path.join(VAULT_DIR, 'Session Summaries');
const TRANSCRIPTS_DIR = path.join(VAULT_DIR, 'Sessions');
const INDEX_PATH = path.join(VAULT_DIR, '_index.json');

const MAX_CONTEXT_FACTS = 20;
const MAX_CONTEXT_LENGTH = 1500; // chars in system prompt injection

/**
 * Load the transcript index
 * @returns {Object} - { videoId: { title, campaign, characters, summary, ... } }
 */
function loadIndex() {
    try {
        if (fs.existsSync(INDEX_PATH)) {
            return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
        }
    } catch (err) {
        logger.error('Error loading transcript index:', err.message);
    }
    return {};
}

/**
 * Load a specific transcript's full extraction data
 * @param {string} videoId
 * @returns {Object|null}
 */
function loadTranscript(videoId) {
    const filePath = path.join(TRANSCRIPTS_DIR, `${videoId}.md`);
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (err) {
        logger.error(`Error loading transcript ${videoId}:`, err.message);
    }
    return null;
}

/**
 * Search transcript knowledge base by keyword query
 * Returns matching facts, summaries, and character info from processed transcripts
 *
 * @param {string} query - Search query
 * @returns {Array<{source: string, content: string, campaign: string, score: number}>}
 */
function search(query) {
    if (!query || typeof query !== 'string') return [];

    const index = loadIndex();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const results = [];

    for (const [videoId, entry] of Object.entries(index)) {
        let score = 0;
        const searchable = [
            entry.title || '',
            entry.summary || '',
            ...(entry.characters || [])
        ].join(' ').toLowerCase();

        // Score by keyword matches
        for (const word of queryWords) {
            if (searchable.includes(word)) {
                score += 10;
            }
        }

        // Exact phrase match
        if (searchable.includes(queryLower)) {
            score += 50;
        }

        // Character name match (high value)
        for (const char of (entry.characters || [])) {
            if (queryLower.includes(char.toLowerCase())) {
                score += 30;
            }
        }

        if (score > 0) {
            results.push({
                videoId,
                source: entry.title,
                content: entry.summary || '',
                campaign: entry.campaign,
                characters: entry.characters || [],
                score
            });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 20);
}

/**
 * Get relevant transcript knowledge for LLM system prompt injection.
 * Matches query keywords against the transcript index and returns
 * the most relevant facts, capped for prompt size.
 *
 * @param {string} query - The user's query
 * @returns {string} - Context string to append to system prompt, or ''
 */
function getContextForLLM(query) {
    if (!query) return '';

    const results = search(query);
    if (results.length === 0) return '';

    // Build compact context from top results
    const facts = [];
    let totalLength = 0;

    for (const result of results.slice(0, MAX_CONTEXT_FACTS)) {
        // Use summary, capped
        const fact = `[${result.campaign}] ${result.source}: ${result.content}`.substring(0, 300);
        if (totalLength + fact.length > MAX_CONTEXT_LENGTH) break;
        facts.push(`- ${fact}`);
        totalLength += fact.length;
    }

    if (facts.length === 0) return '';

    return `\n\nSession transcript knowledge (from processed YouTube recordings):\n${facts.join('\n')}`;
}

/**
 * Get count of processed transcripts
 * @returns {number}
 */
function getCount() {
    const index = loadIndex();
    return Object.keys(index).length;
}

/**
 * Get all campaigns represented in the knowledge base
 * @returns {string[]}
 */
function getCampaigns() {
    const index = loadIndex();
    const campaigns = new Set();
    for (const entry of Object.values(index)) {
        if (entry.campaign) campaigns.add(entry.campaign);
    }
    return [...campaigns];
}

module.exports = {
    loadIndex,
    loadTranscript,
    search,
    getContextForLLM,
    getCount,
    getCampaigns,
    TRANSCRIPTS_DIR,
    INDEX_PATH
};
