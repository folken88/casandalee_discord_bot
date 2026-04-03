#!/usr/bin/env node
/**
 * Bulk Transcript Summarizer
 * Reads raw transcripts from the vault, sends them to Haiku for extraction,
 * cross-references with Google Sheets timeline, and saves structured summaries.
 *
 * Conservative extraction: only includes high-confidence information.
 * Garbled/vague events are flagged as uncertain unless corroborated by timeline.
 *
 * Usage: node tools/bulk-summarize-transcripts.js [--campaign IG] [--limit 5] [--dry-run]
 */

require('dotenv').config({ override: true });

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../obsidian_cass/cassvault');
const SESSIONS_DIR = path.join(VAULT_DIR, 'Sessions');
const SUMMARIES_DIR = path.join(VAULT_DIR, 'Session Summaries');
const STATE_PATH = path.join(__dirname, '../data/cache/summary-state.json');
const TIMELINE_CSV = path.join(__dirname, '../pf_folkengames_timeline.csv');

// Campaign codes
const CAMPAIGN_CODES = { IG: 'Iron Gods', SS: 'Skull & Shackles', CC: 'Carrion Crown', HV: 'Hells Vengeance', HR: 'Hells Rebels' };
const CAMPAIGN_FOLDERS = { 'Iron Gods': 'IG', 'Skull & Shackles': 'SS', 'Carrion Crown': 'CC', 'Hells Vengeance': 'HV', 'Hells Rebels': 'HR' };

// Player-character mappings (all campaigns)
const PLAYER_MAP = {
    IG: {
        kip: 'Ulfred', daemon: 'Nomkath', enrique: 'Mr Brow (previously Gavrilo → Eldrin → Kroktah → Mr Brow)', josh: 'Olbryn',
        tim: 'Akradenn', rye: 'Luna', toby: 'GM/NPCs', tobias: 'GM/NPCs'
    },
    SS: {
        kip: 'Holden', daemon: 'Storgrim', enrique: 'Sha-Feng', josh: 'Ser-Toche',
        tim: 'Vaughan', rye: 'Riviera', graham: 'Bujon', mandi: 'Rhyarca',
        toby: 'GM/NPCs', tobias: 'GM/NPCs'
    },
    CC: {
        tim: 'Gaspar', sydney: 'Kovira', graham: 'Kai', anna: 'Elfrip',
        josh: 'Dinvaya', mandi: 'Kate Blackwood', chris: 'Rodney Danger Smith',
        harrison: 'Dismas', toby: 'GM/NPCs', tobias: 'GM/NPCs'
    },
    HV: {
        tim: 'Jamal', harrison: 'Draymus', josh: 'Reese', chris: 'Bruce',
        toby: 'GM/NPCs', tobias: 'GM/NPCs'
    },
    HR: {
        tim: 'Celeb', harrison: 'Femmick', josh: 'Gabriel', chris: 'Nigel',
        toby: 'GM/NPCs', tobias: 'GM/NPCs'
    }
};

// Known character name variants for the LLM
const CHARACTER_ALIASES = {
    IG: {
        'Ulfred': ['Ulfred Stronginthearm', 'Ulfred'],
        'Nomkath': ['Nomkath'],
        'Mr Brow': ['Brow', 'Mr Brow', 'Augustus', 'Augustus Teabrow', 'Mr Augustus Teabrow'],
        'Gavrilo': ['Gavrilo', 'Gabrilo', 'Gavrillo'],
        'Eldrin': ['Eldrin'],
        'Kroktah': ['Kroktah', 'Cckatha', 'Kokta', 'Krokta', 'Coca'],
        'Olbryn': ['Olbryn'],
        'Akradenn': ['Akradenn', 'Akraden'],
        'Luna': ['Luna'],
        'Casandalee': ['Casandalee', 'Cass', 'Cassie'],
        'Meyanda': ['Meyanda'],
        'Brigh': ['Brigh', 'Bry'],
        'Khonnir Baine': ['Khonnir', 'Baine'],
        'Dinvaya': ['Dinvaya'],
        'Tokala': ['Tokala']
    },
    SS: {
        'Holden': ['Holden', 'Holden Aleistair'],
        'Storgrim': ['Storgrim', 'Storgrim Thunderbeard'],
        'Sha-Feng': ['Sha-Feng', 'Sha Feng'],
        'Ser-Toche': ['Ser-Toche', 'Ser Toche', 'Toche'],
        'Vaughan': ['Vaughan'],
        'Riviera': ['Riviera'],
        'Towa': ['Towa'],
        'Bujon': ['Bujon', 'Bujon Storm of Cheliax'],
        'Rhyarca': ['Rhyarca']
    },
    CC: {
        'Gaspar': ['Gaspar', 'William Gaspar'],
        'Kovira': ['Kovira'],
        'Kai': ['Kai'],
        'Elfrip': ['Elfrip'],
        'Dinvaya': ['Dinvaya'],
        'Kate Blackwood': ['Kate Blackwood', 'Kate'],
        'Rodney Danger Smith': ['Rodney', 'Rodney Danger Smith', 'RDS'],
        'Dismas': ['Dismas']
    },
    HV: {
        'Jamal': ['Jamal'],
        'Draymus': ['Draymus'],
        'Reese': ['Reese'],
        'Bruce': ['Bruce']
    },
    HR: {
        'Celeb': ['Celeb'],
        'Femmick': ['Femmick'],
        'Gabriel': ['Gabriel'],
        'Nigel': ['Nigel']
    }
};

class TranscriptSummarizer {
    constructor() {
        this.anthropic = new Anthropic.default();
        this.state = this._loadState();
        this.timeline = this._loadTimeline();
        this.stats = { processed: 0, skipped: 0, failed: 0, totalTokens: 0 };
    }

    _loadState() {
        try {
            if (fs.existsSync(STATE_PATH)) {
                return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
            }
        } catch {}
        return { summarized: [], errors: [] };
    }

    _saveState() {
        fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2), 'utf8');
    }

    _loadTimeline() {
        try {
            const csv = fs.readFileSync(TIMELINE_CSV, 'utf8');
            const lines = csv.split('\n').slice(1); // skip header
            return lines.map(line => {
                // Parse CSV properly (handles quoted fields)
                const match = line.match(/^"?([^",]*)"?,([^,]*),([^,]*),(".*"|[^,]*)$/);
                if (!match) return null;
                return {
                    date: match[1].trim(),
                    location: match[2].trim(),
                    campaign: match[3].trim(),
                    description: match[4].replace(/^"|"$/g, '').trim()
                };
            }).filter(Boolean);
        } catch (err) {
            console.error('Warning: Could not load timeline CSV:', err.message);
            return [];
        }
    }

    _getTimelineForCampaign(campaignCode) {
        return this.timeline
            .filter(e => e.campaign === campaignCode || e.campaign === 'IS')
            .filter(e => {
                const year = parseFloat(e.date);
                // Focus on relevant era (4716-4718 for most campaigns, 4707 for Justice Gorls)
                return year >= 4700 && year <= 4720;
            })
            .map(e => `${e.date} | ${e.location} | ${e.description}`)
            .join('\n');
    }

    _getPlayerList(campaignCode) {
        const map = PLAYER_MAP[campaignCode] || {};
        return Object.entries(map)
            .filter(([_, char]) => char !== 'GM/NPCs')
            .map(([player, char]) => `${player} plays ${char}`)
            .join(', ');
    }

    _getAliasesList(campaignCode) {
        const aliases = CHARACTER_ALIASES[campaignCode] || {};
        return Object.entries(aliases)
            .map(([name, alts]) => `${name}: ${alts.join(', ')}`)
            .join('\n');
    }

    /**
     * Build the Haiku prompt for transcript extraction
     */
    _buildPrompt(transcript, campaignCode, title, timelineEvents, sessionNumber) {
        const playerList = this._getPlayerList(campaignCode);
        const aliasesList = this._getAliasesList(campaignCode);
        const campaignName = CAMPAIGN_CODES[campaignCode] || campaignCode;

        return `You are analyzing an auto-generated YouTube transcript from a Pathfinder tabletop RPG session.
Campaign: ${campaignName} (code: ${campaignCode})
Session title: "${title}"
${sessionNumber ? `Session number: ${sessionNumber}` : ''}

PLAYERS AND THEIR CHARACTERS:
${playerList}
The GM is Toby — any NPC dialogue or narration comes from him.

CHARACTER NAME ALIASES (the transcript may use any of these):
${aliasesList}

CRITICAL CONTEXT:
- This is an auto-generated transcript with NO speaker identification. It's a single stream of garbled text with frequent errors and misheard names.
- Player names (Kip, Daemon, Enrique, Josh, Tim, Rye, etc.) appearing in the transcript usually mean that player is speaking, and what they say relates to their character's actions.
- "Bry" or "bry" likely refers to the goddess Brigh (goddess of invention/clockwork), NOT a player.
- Auto-captions frequently mishear fantasy names. Use the alias list above to resolve likely matches.

VERIFIED TIMELINE EVENTS FOR CROSS-REFERENCE:
These are confirmed canonical events. If the transcript describes one of these, note the correlation. The timeline is MORE ACCURATE than the transcript.
${timelineEvents || '(no timeline events available for this campaign period)'}

TASK: Extract ONLY verifiable facts from this transcript. Return valid JSON with this structure:
{
  "sessionTitle": "cleaned up title",
  "campaign": "${campaignCode}",
  "summary": "2-4 sentence summary. ONLY include events you are certain about. Say 'transcript quality was poor' if it was.",
  "keyEvents": [
    {
      "description": "what happened — state only what the transcript clearly shows",
      "confidence": "high",
      "characters": ["who was involved — ONLY named characters you can identify"],
      "location": "where (if clearly stated, otherwise null)",
      "timelineCorrelation": "matching timeline event date/description if any, or null"
    }
  ],
  "charactersPresent": ["list of PC names who appeared to be active — ONLY include if you heard their name or their player's name"],
  "npcsEncountered": ["named NPCs clearly mentioned — do NOT guess unnamed speakers"],
  "locationsVisited": ["specific named locations clearly stated in the transcript"],
  "combatEncounters": ["brief descriptions of fights that clearly occurred"],
  "itemsOrLoot": ["notable items clearly named"],
  "quotes": ["verbatim quotes from the transcript that are clearly audible and amusing/notable — include the raw text exactly as transcribed"],
  "uncertainEvents": ["things that MIGHT have happened but the transcript is too garbled to confirm"],
  "transcriptQuality": "good|fair|poor"
}

STRICT RULES — VIOLATIONS WILL PRODUCE INCORRECT DATA:
- ONLY "high" confidence events go in keyEvents. If you're not sure, it goes in uncertainEvents or is omitted entirely.
- Do NOT attribute actions to "a player" or "someone" — if you can't identify WHO did something, put it in uncertainEvents.
- Do NOT invent narrative connections between garbled fragments. If two events seem related but the transcript doesn't clearly link them, report them separately.
- Do NOT fill in story beats from your knowledge of the Pathfinder adventure path. Report ONLY what the transcript says, not what you think should have happened.
- Do NOT guess character motivations or emotional states. Report actions only.
- Quotes must be VERBATIM from the transcript. Do not clean them up or paraphrase.
- If the transcript is mostly garbled, return minimal keyEvents and put everything in uncertainEvents. An empty keyEvents array is better than a hallucinated one.
- ABSENCE IS BETTER THAN INACCURACY. When in doubt, leave it out.

TRANSCRIPT:
${transcript}`;
    }

    /**
     * Process a single transcript file through Haiku
     */
    async summarizeTranscript(filePath, campaignCode) {
        const content = fs.readFileSync(filePath, 'utf8');

        // Extract transcript text (everything after the frontmatter and header)
        const parts = content.split('---');
        if (parts.length < 3) {
            console.log(`  Skipping ${path.basename(filePath)}: no frontmatter`);
            return null;
        }

        // Parse frontmatter
        const frontmatter = parts[1];
        const titleMatch = frontmatter.match(/title:\s*"(.+)"/);
        const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');
        const videoIdMatch = frontmatter.match(/videoId:\s*"(.+)"/);
        const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

        // Get transcript body
        const body = parts.slice(2).join('---').trim();
        // Strip the header section (everything before the first timestamp)
        const transcriptStart = body.indexOf('[0');
        const transcript = transcriptStart >= 0 ? body.substring(transcriptStart) : body;

        if (transcript.length < 100) {
            console.log(`  Skipping ${path.basename(filePath)}: transcript too short (${transcript.length} chars)`);
            return null;
        }

        // Extract session number from title if possible
        const sessionNumMatch = title.match(/session\s*(\d+)/i);
        const sessionNumber = sessionNumMatch ? parseInt(sessionNumMatch[1]) : null;

        // Get timeline events for this campaign
        const timelineEvents = this._getTimelineForCampaign(campaignCode);

        // Truncate very long transcripts to fit Haiku's context
        // Haiku handles ~200K tokens, but we want to be efficient
        const maxChars = 150000; // ~37K tokens
        const truncatedTranscript = transcript.length > maxChars
            ? transcript.substring(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED — session was very long]'
            : transcript;

        const prompt = this._buildPrompt(truncatedTranscript, campaignCode, title, timelineEvents, sessionNumber);

        try {
            const response = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }]
            });

            const text = response.content[0]?.text || '';
            this.stats.totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

            // Parse JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.log(`  Warning: No JSON found in response for ${path.basename(filePath)}`);
                return null;
            }

            const extraction = JSON.parse(jsonMatch[0]);
            extraction.videoId = videoId;
            extraction.sourceFile = path.basename(filePath);
            extraction.processedAt = new Date().toISOString();

            // Quality gate: if the transcript was too garbled to extract anything
            // useful, return a minimal stub rather than hallucinated content.
            const quality = (extraction.transcriptQuality || 'unknown').toLowerCase();
            const eventCount = (extraction.keyEvents || []).length;
            if (quality === 'poor' && eventCount === 0) {
                console.log(`  Quality gate: "${title}" — transcript too garbled, saving minimal stub`);
                extraction.summary = 'Transcript quality was too poor to extract reliable events. Cross-reference with timeline data or re-watch the session.';
                extraction.keyEvents = [];
                extraction.uncertainEvents = extraction.uncertainEvents || [];
                extraction.combatEncounters = [];
                extraction.itemsOrLoot = [];
                extraction.quotes = [];
            }

            return extraction;
        } catch (err) {
            console.error(`  Error processing ${path.basename(filePath)}:`, err.message);
            return null;
        }
    }

    /**
     * Save a summary to the vault as markdown
     */
    _saveSummary(extraction, campaignCode) {
        const campaignName = CAMPAIGN_CODES[campaignCode] || campaignCode;
        const campaignDir = path.join(SUMMARIES_DIR, campaignName);
        if (!fs.existsSync(campaignDir)) fs.mkdirSync(campaignDir, { recursive: true });

        const sanitizedTitle = (extraction.sessionTitle || extraction.sourceFile)
            .replace(/[<>:"/\\|?*]/g, '-')
            .substring(0, 120);
        const fileName = `${campaignCode} - ${sanitizedTitle}.md`;
        const filePath = path.join(campaignDir, fileName);

        const events = (extraction.keyEvents || [])
            .map(e => {
                const conf = e.confidence === 'high' ? '' : ' *(medium confidence)*';
                const timeline = e.timelineCorrelation ? `\n  - Timeline: ${e.timelineCorrelation}` : '';
                const chars = e.characters?.length ? `\n  - Characters: ${e.characters.join(', ')}` : '';
                const loc = e.location ? `\n  - Location: ${e.location}` : '';
                return `- ${e.description}${conf}${chars}${loc}${timeline}`;
            }).join('\n');

        const uncertain = (extraction.uncertainEvents || [])
            .map(e => `- ${e}`).join('\n');

        const combat = (extraction.combatEncounters || [])
            .map(e => `- ${e}`).join('\n');

        const items = (extraction.itemsOrLoot || [])
            .map(e => `- ${e}`).join('\n');

        const quotes = (extraction.quotes || [])
            .map(q => `> ${q}`).join('\n');

        const md = `---
title: "${(extraction.sessionTitle || sanitizedTitle).replace(/"/g, '\\"')}"
type: session-summary
campaign: "${campaignCode}"
campaignName: "${campaignName}"
videoId: "${extraction.videoId}"
sourceFile: "${extraction.sourceFile}"
processedAt: "${extraction.processedAt}"
transcriptQuality: "${extraction.transcriptQuality || 'unknown'}"
charactersPresent: [${(extraction.charactersPresent || []).map(c => `"${c}"`).join(', ')}]
tags: ["summary", "${campaignCode.toLowerCase()}", "session"]
---

# ${extraction.sessionTitle || sanitizedTitle}

**Campaign:** ${campaignName} | **Video:** [Watch on YouTube](https://youtube.com/watch?v=${extraction.videoId})
**Transcript Quality:** ${extraction.transcriptQuality || 'unknown'}
**Characters Present:** ${(extraction.charactersPresent || []).join(', ') || 'unknown'}

## Summary

${extraction.summary || 'Unable to extract a reliable summary from this transcript.'}

${events ? `## Key Events\n\n${events}\n` : ''}
${(extraction.npcsEncountered || []).length ? `## NPCs Encountered\n\n${extraction.npcsEncountered.map(n => `- [[${n}]]`).join('\n')}\n` : ''}
${(extraction.locationsVisited || []).length ? `## Locations\n\n${extraction.locationsVisited.map(l => `- [[${l}]]`).join('\n')}\n` : ''}
${combat ? `## Combat Encounters\n\n${combat}\n` : ''}
${items ? `## Items & Loot\n\n${items}\n` : ''}
${quotes ? `## Notable Quotes\n\n${quotes}\n` : ''}
${uncertain ? `## Uncertain Events\n\n*These events may have occurred but the transcript is too garbled to confirm. Cross-reference with timeline data.*\n\n${uncertain}\n` : ''}
`;

        fs.writeFileSync(filePath, md, 'utf8');
        return filePath;
    }

    /**
     * Get all raw transcript files, sorted by campaign and filename
     */
    _getAllTranscripts(campaignFilter) {
        const transcripts = [];
        const campaignDirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
            fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
        );

        for (const dir of campaignDirs) {
            const code = CAMPAIGN_FOLDERS[dir];
            if (!code) continue;
            if (campaignFilter && code !== campaignFilter.toUpperCase()) continue;

            const files = fs.readdirSync(path.join(SESSIONS_DIR, dir))
                .filter(f => f.endsWith('.md'))
                .sort(); // alphabetical = roughly chronological

            for (const file of files) {
                transcripts.push({
                    path: path.join(SESSIONS_DIR, dir, file),
                    campaignCode: code,
                    campaignName: dir,
                    fileName: file
                });
            }
        }

        return transcripts;
    }

    /**
     * Main entry point
     */
    async run(options = {}) {
        const { campaign, limit, dryRun, delay = 2000 } = options;

        console.log('\n=== Bulk Transcript Summarizer ===\n');
        console.log(`Timeline events loaded: ${this.timeline.length}`);
        console.log(`Previously summarized: ${this.state.summarized.length}`);

        const allTranscripts = this._getAllTranscripts(campaign);
        const toProcess = allTranscripts.filter(t =>
            !this.state.summarized.includes(t.fileName)
        );

        console.log(`Total transcripts: ${allTranscripts.length}`);
        console.log(`New to summarize: ${toProcess.length}`);
        if (limit) console.log(`Limit: ${limit}`);
        if (dryRun) console.log('DRY RUN — will not call Haiku\n');
        else console.log('');

        const batch = limit ? toProcess.slice(0, limit) : toProcess;

        for (let i = 0; i < batch.length; i++) {
            const t = batch[i];
            process.stdout.write(`[${i + 1}/${batch.length}] ${t.campaignCode} | ${t.fileName.substring(0, 70)}... `);

            if (dryRun) {
                console.log('(dry run)');
                continue;
            }

            try {
                const extraction = await this.summarizeTranscript(t.path, t.campaignCode);
                if (extraction) {
                    const savedPath = this._saveSummary(extraction, t.campaignCode);
                    this.state.summarized.push(t.fileName);
                    this._saveState();
                    this.stats.processed++;

                    const quality = extraction.transcriptQuality || '?';
                    const eventCount = (extraction.keyEvents || []).length;
                    console.log(`✅ ${eventCount} events (quality: ${quality})`);
                } else {
                    this.stats.skipped++;
                    console.log('⚠️  skipped (no usable content)');
                }
            } catch (err) {
                this.stats.failed++;
                console.log(`❌ ${err.message?.substring(0, 60)}`);
                this.state.errors.push({ file: t.fileName, error: err.message, at: new Date().toISOString() });
                this._saveState();
            }

            // Rate limiting
            if (i < batch.length - 1 && delay) {
                await new Promise(r => setTimeout(r, delay));
            }
        }

        console.log('\n=== Summary Complete ===');
        console.log(`✅ Processed: ${this.stats.processed}`);
        console.log(`⚠️  Skipped: ${this.stats.skipped}`);
        console.log(`❌ Failed: ${this.stats.failed}`);
        console.log(`📊 Total tokens used: ~${this.stats.totalTokens.toLocaleString()}`);
        console.log(`💰 Estimated cost: ~$${(this.stats.totalTokens * 0.0000008).toFixed(4)}`);
    }
}

// CLI
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--campaign' && args[i + 1]) options.campaign = args[++i];
    if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i]);
    if (args[i] === '--delay' && args[i + 1]) options.delay = parseInt(args[++i]);
    if (args[i] === '--dry-run') options.dryRun = true;
}

const summarizer = new TranscriptSummarizer();
summarizer.run(options).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
