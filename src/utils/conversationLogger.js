/**
 * Conversation Logger for Casandalee
 * Logs all Discord interactions to the Obsidian vault (Logs/ folder).
 * One file per day, timestamped entries.
 *
 * Daily memory consolidation reviews logs through Haiku to extract
 * meaningful facts and write them to permanent vault storage.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const llmRouter = require('./llmRouter');
const dossierManager = require('./dossierManager');
const nameResolver = require('./nameResolver');

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault');
const LOGS_DIR = path.join(VAULT_DIR, 'Logs');
const LEARNED_DIR = path.join(VAULT_DIR, 'Learned');

class ConversationLogger {
    constructor() {
        this._ensureDirs();
        this.consolidationInterval = null;
    }

    _ensureDirs() {
        for (const dir of [LOGS_DIR, LEARNED_DIR]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Get today's log file path
     */
    _todayLogPath() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(LOGS_DIR, `${dateStr}.md`);
    }

    /**
     * Log a conversation exchange to today's file
     * @param {Object} opts
     * @param {string} opts.discordUsername - Discord display name
     * @param {string} opts.discordId - Discord user ID
     * @param {string} opts.query - What the user said
     * @param {string} opts.response - What Cass said back
     * @param {string} [opts.channel] - Channel name
     * @param {string} [opts.handlerType] - Which handler processed it (general, dice, timeline, etc.)
     */
    log({ discordUsername, discordId, query, response, channel, handlerType }) {
        try {
            const logPath = this._todayLogPath();
            const now = new Date();
            const time = now.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS

            // Create file with frontmatter if new
            if (!fs.existsSync(logPath)) {
                const dateStr = now.toISOString().split('T')[0];
                const header = `---
title: "Conversation Log ${dateStr}"
type: conversation-log
date: "${dateStr}"
tags: ["log"]
---

# Conversation Log — ${dateStr}

`;
                fs.writeFileSync(logPath, header, 'utf8');
            }

            const entry = `## ${time} — ${discordUsername} (${discordId})${channel ? ` in #${channel}` : ''}${handlerType ? ` [${handlerType}]` : ''}

**${discordUsername}:** ${query}

**Cass:** ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}

---

`;
            fs.appendFileSync(logPath, entry, 'utf8');
        } catch (err) {
            logger.error('ConversationLogger: Error writing log:', err.message);
        }
    }

    /**
     * Start the daily memory consolidation schedule
     */
    startConsolidationSchedule() {
        // Run at 3 AM each day (or configurable)
        const consolidationHour = parseInt(process.env.MEMORY_CONSOLIDATION_HOUR) || 3;

        const scheduleNext = () => {
            const now = new Date();
            const next = new Date(now);
            next.setHours(consolidationHour, 0, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 1);

            const delay = next - now;
            logger.info(`Memory consolidation scheduled for ${next.toISOString()} (in ${Math.round(delay / 3600000)}h)`);

            this.consolidationInterval = setTimeout(async () => {
                await this.consolidateMemories();
                scheduleNext(); // schedule next day
            }, delay);
        };

        scheduleNext();
    }

    stop() {
        if (this.consolidationInterval) {
            clearTimeout(this.consolidationInterval);
            this.consolidationInterval = null;
        }
    }

    /**
     * Consolidate yesterday's conversation logs into permanent memory.
     * Sends the log to Haiku which extracts meaningful facts,
     * player-character correlations, and updates vault accordingly.
     */
    async consolidateMemories() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        const logPath = path.join(LOGS_DIR, `${dateStr}.md`);

        if (!fs.existsSync(logPath)) {
            logger.info(`Memory consolidation: No logs for ${dateStr}, skipping`);
            return;
        }

        const logContent = fs.readFileSync(logPath, 'utf8');

        // Skip if too short (just the header)
        if (logContent.length < 200) {
            logger.info(`Memory consolidation: Log for ${dateStr} too short, skipping`);
            return;
        }

        logger.info(`Memory consolidation: Processing ${dateStr} (${logContent.length} chars)`);

        try {
            // Use 'user-facing' tier (Haiku) — Ollama can't reliably produce valid JSON
            // for structured extraction. This is a once-daily call on a small log, ~$0.001.
            const result = await llmRouter.route(this._buildConsolidationPrompt(logContent, dateStr), {
                task: 'user-facing',
                system: `You are Casandalee's memory consolidation system. You review conversation logs and extract facts worth remembering permanently. You are skeptical of jokes and obvious nonsense but attentive to genuine information about characters, events, and player identities.`,
                maxTokens: 2048,
                temperature: 0.3
            });

            const text = result.text || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.warn('Memory consolidation: No JSON in response');
                return;
            }

            // Strip common LLM JSON mistakes: trailing commas, // comments
            const cleaned = jsonMatch[0]
                .replace(/\/\/[^\n]*/g, '')       // remove // comments
                .replace(/,\s*([}\]])/g, '$1');   // remove trailing commas
            const memories = JSON.parse(cleaned);
            await this._applyMemories(memories, dateStr);

            logger.info(`Memory consolidation complete for ${dateStr}: ${memories.facts?.length || 0} facts, ${memories.playerMappings?.length || 0} player mappings`);
        } catch (err) {
            logger.error('Memory consolidation failed:', err.message);
        }
    }

    _buildConsolidationPrompt(logContent, dateStr) {
        // Get current known player mappings for context
        const knownPlayers = [];
        try {
            const mapPath = path.join(VAULT_DIR, 'Meta', 'discord-user-map.json');
            if (fs.existsSync(mapPath)) {
                const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
                for (const [id, info] of Object.entries(map)) {
                    knownPlayers.push(`${id}: ${info.character || info.player || 'unknown'}`);
                }
            }
        } catch {}

        return `Review these conversation logs from ${dateStr} and extract information worth remembering permanently.

KNOWN PLAYER MAPPINGS:
${knownPlayers.join('\n') || '(none yet)'}

RULES:
1. Only extract FACTS — things that are likely true and useful to remember.
2. Be SKEPTICAL. Players joke around constantly. "Nomkath is secretly a dragon" is probably a joke. "Ulfred just hit level 14" might be real.
3. Look for PLAYER IDENTITY clues: if someone's Discord username is "KipTheGreat" and they refer to "my character Ulfred", that maps Discord user to player to character.
4. Look for CHARACTER UPDATES: level ups, new items, deaths, class changes, relationship changes.
5. Look for CAMPAIGN FACTS: locations visited, NPCs encountered, plot developments.
6. Look for CORRECTIONS: if a player corrects Cass about something, that correction is high-value.
7. Ignore dice rolls, casual greetings, and mechanical game queries.

Return valid JSON:
{
  "facts": [
    {
      "content": "what was learned",
      "confidence": "high|medium",
      "category": "character|campaign|correction|meta",
      "relatedCharacter": "character name or null",
      "source": "who said it (Discord username)"
    }
  ],
  "playerMappings": [
    {
      "discordId": "numeric Discord ID",
      "discordUsername": "their display name",
      "playerName": "real player name (Kip, Daemon, etc.)",
      "characterName": "their character name",
      "campaign": "IG|SS|CC|HV|HR or null",
      "confidence": "high|medium"
    }
  ],
  "summary": "One sentence about what conversations happened today"
}

If nothing meaningful was said, return empty arrays. Better to miss a fact than to store nonsense.

CONVERSATION LOG:
${logContent}`;
    }

    /**
     * Apply extracted memories to the vault
     */
    async _applyMemories(memories, dateStr) {
        // 1. Save learned facts
        if (memories.facts?.length > 0) {
            const factsPath = path.join(LEARNED_DIR, `${dateStr}-learned.md`);
            let md = `---
title: "Learned Facts ${dateStr}"
type: learned-facts
date: "${dateStr}"
factCount: ${memories.facts.length}
tags: ["learned", "memory"]
---

# Facts Learned — ${dateStr}

${memories.summary || ''}

`;
            for (const fact of memories.facts) {
                const conf = fact.confidence === 'high' ? '' : ' *(medium confidence)*';
                const char = fact.relatedCharacter ? ` → [[${fact.relatedCharacter}]]` : '';
                md += `- **[${fact.category}]** ${fact.content}${conf}${char} *(from ${fact.source})*\n`;

                // If high confidence and character-related, also update the character dossier
                if (fact.confidence === 'high' && fact.relatedCharacter && fact.category === 'character') {
                    try {
                        dossierManager.addPlayerUpdate(
                            fact.relatedCharacter,
                            `[Memory ${dateStr}] ${fact.content}`,
                            'Cass (memory consolidation)'
                        );
                    } catch {}
                }
            }
            fs.writeFileSync(factsPath, md, 'utf8');
        }

        // 2. Update player mappings
        if (memories.playerMappings?.length > 0) {
            const mapPath = path.join(VAULT_DIR, 'Meta', 'discord-user-map.json');
            let currentMap = {};
            try {
                if (fs.existsSync(mapPath)) {
                    currentMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
                }
            } catch {}

            let updated = false;
            for (const mapping of memories.playerMappings) {
                if (mapping.confidence !== 'high' || !mapping.discordId) continue;

                const existing = currentMap[mapping.discordId];
                if (!existing) {
                    // New mapping discovered
                    currentMap[mapping.discordId] = {
                        player: mapping.playerName,
                        character: mapping.characterName,
                        campaign: mapping.campaign,
                        discoveredAt: dateStr
                    };
                    updated = true;
                    logger.info(`Memory: Discovered player mapping ${mapping.discordUsername} → ${mapping.playerName} → ${mapping.characterName}`);
                }
            }

            if (updated) {
                fs.writeFileSync(mapPath, JSON.stringify(currentMap, null, 2), 'utf8');
            }
        }
    }
}

module.exports = new ConversationLogger();
