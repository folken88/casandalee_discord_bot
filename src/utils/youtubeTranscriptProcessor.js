/**
 * YouTube Transcript Processor for Casandalee
 * Monitors YouTube playlists for D&D session recordings, fetches transcripts,
 * processes them through LLM to extract campaign knowledge, correlates with
 * Google Sheets timeline, updates dossiers, and posts persona-flavored summaries.
 *
 * Storage: Obsidian-compatible markdown vault in data/transcripts/
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const llmRouter = require('./llmRouter');
const dossierManager = require('./dossierManager');
const nameResolver = require('./nameResolver');
const personalityManager = require('./personalityManager');
const timelineSearch = require('./timelineSearch');

// YouTube transcript fetching (built-in, no external package needed)

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const STATE_PATH = path.join(__dirname, '../../data/cache/youtube-state.json');
const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../../obsidian_cass/cassvault');

// Vault folder structure
const VAULT_PATHS = {
    characters: path.join(VAULT_DIR, 'Characters'),
    places: path.join(VAULT_DIR, 'Places'),
    sessions: path.join(VAULT_DIR, 'Sessions'),          // Raw transcripts
    summaries: path.join(VAULT_DIR, 'Session Summaries'), // Processed summaries
    timeline: path.join(VAULT_DIR, 'Timeline'),           // Combined with Google Sheets
};
const INDEX_PATH = path.join(VAULT_DIR, '_index.json');

// Player-to-character mapping per campaign (AP codes match timeline CSV)
const DEFAULT_PLAYER_MAP = {
    // Format: 'player_name_lowercase': { characterName, campaign }
    // Populated from env or hardcoded defaults
};

class YouTubeTranscriptProcessor {
    constructor() {
        this.playlistIds = (process.env.YOUTUBE_PLAYLIST_IDS || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);

        // Default to the same channel as daily history posts (general)
        this.summaryChannelId = process.env.YOUTUBE_SUMMARY_CHANNEL_ID || '303941538021638164';
        this.checkInterval = parseInt(process.env.YOUTUBE_CHECK_INTERVAL) || 24 * 60 * 60 * 1000; // Once per day
        this.chunkSize = parseInt(process.env.YOUTUBE_TRANSCRIPT_CHUNK_SIZE) || 4000;
        this.apiKey = process.env.GOOGLE_SHEETS_API_KEY || null;
        // Max videos to process per check cycle (pacing to avoid API usage walls)
        this.maxVideosPerCycle = parseInt(process.env.YOUTUBE_MAX_VIDEOS_PER_CYCLE) || 1;
        // Delay between chunk processing (ms) — paces API usage
        this.chunkDelay = parseInt(process.env.YOUTUBE_CHUNK_DELAY) || 5000; // 5 seconds

        this.intervalHandle = null;
        this.client = null;
        this.processing = false;

        // Player name -> character name mapping
        this.playerCharacterMap = this._loadPlayerMap();
        // GM name — this speaker voices all NPCs, not a single PC
        this.gmName = (process.env.YOUTUBE_GM_NAME || '').toLowerCase();

        // State
        this.state = this._loadState();

        // Ensure directories exist
        this._ensureDirectories();
    }

    /**
     * Load player-to-character mapping from env or defaults
     * Format in .env: YOUTUBE_PLAYER_MAP=kip:ulfred:IG,kip:holden:SS,tobias:nomkath:IG
     */
    _loadPlayerMap() {
        const map = new Map();
        const raw = process.env.YOUTUBE_PLAYER_MAP || '';
        if (raw) {
            for (const entry of raw.split(',')) {
                const [player, character, campaign] = entry.trim().split(':');
                if (player && character) {
                    if (!map.has(player.toLowerCase())) {
                        map.set(player.toLowerCase(), []);
                    }
                    map.get(player.toLowerCase()).push({
                        characterName: character,
                        campaign: (campaign || '').toUpperCase()
                    });
                }
            }
        }
        return map;
    }

    /**
     * Resolve a player name to their character name for a given campaign
     */
    resolvePlayerToCharacter(playerName, campaignCode) {
        if (!playerName) return null;
        const entries = this.playerCharacterMap.get(playerName.toLowerCase());
        if (!entries) return null;

        // If campaign specified, match it; otherwise return first
        if (campaignCode) {
            const match = entries.find(e => e.campaign === campaignCode.toUpperCase());
            if (match) return match.characterName;
        }
        return entries[0]?.characterName || null;
    }

    _ensureDirectories() {
        for (const dir of Object.values(VAULT_PATHS)) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info(`Created vault directory: ${dir}`);
            }
        }
        const cacheDir = path.dirname(STATE_PATH);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
    }

    _loadState() {
        try {
            if (fs.existsSync(STATE_PATH)) {
                return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
            }
        } catch (err) {
            logger.error('Error loading YouTube state:', err.message);
        }
        return {
            processedVideoIds: [],
            lastCheck: null,
            processingErrors: []
        };
    }

    _saveState() {
        try {
            fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2), 'utf8');
        } catch (err) {
            logger.error('Error saving YouTube state:', err.message);
        }
    }

    /**
     * Start the processor — called from index.js on ClientReady
     */
    start(client) {
        if (!this.playlistIds.length) {
            logger.info('YouTube processor: No playlist IDs configured, skipping');
            return;
        }
        if (!this.apiKey) {
            logger.warn('YouTube processor: No Google API key available for playlist access');
            return;
        }

        this.client = client;
        logger.info(`YouTube processor started: monitoring ${this.playlistIds.length} playlist(s), interval ${this.checkInterval / 1000}s`);

        // Run first check after a short delay (let other systems initialize)
        setTimeout(() => this.checkForNewVideos(), 30000);

        // Set up recurring check
        this.intervalHandle = setInterval(() => this.checkForNewVideos(), this.checkInterval);
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
        logger.info('YouTube processor stopped');
    }

    /**
     * Check all configured playlists for new (unprocessed) videos
     */
    async checkForNewVideos() {
        if (this.processing) {
            logger.debug('YouTube processor: already processing, skipping check');
            return;
        }

        this.processing = true;
        logger.info('YouTube processor: checking for new videos...');

        try {
            for (const playlistId of this.playlistIds) {
                const videos = await this.fetchPlaylistVideos(playlistId);
                const newVideos = videos.filter(v => !this.state.processedVideoIds.includes(v.videoId));

                if (newVideos.length > 0) {
                    logger.info(`Found ${newVideos.length} new video(s) in playlist ${playlistId}`);
                }

                // Process oldest first, limited per cycle to pace API usage
                const toProcess = newVideos.reverse().slice(0, this.maxVideosPerCycle);
                if (newVideos.length > toProcess.length) {
                    logger.info(`Pacing: processing ${toProcess.length} of ${newVideos.length} new videos this cycle`);
                }

                for (const video of toProcess) {
                    try {
                        await this.processVideo(video);
                    } catch (err) {
                        logger.error(`Error processing video ${video.videoId}:`, err.message);
                        this.state.processingErrors.push({
                            videoId: video.videoId,
                            title: video.title,
                            error: err.message,
                            timestamp: new Date().toISOString()
                        });
                        // Keep only last 50 errors
                        if (this.state.processingErrors.length > 50) {
                            this.state.processingErrors = this.state.processingErrors.slice(-50);
                        }
                        this._saveState();
                    }
                }
            }

            this.state.lastCheck = new Date().toISOString();
            this._saveState();
        } catch (err) {
            logger.error('YouTube processor check failed:', err.message);
        } finally {
            this.processing = false;
        }
    }

    /**
     * Fetch video list from a YouTube playlist via yt-dlp (no API key needed)
     */
    async fetchPlaylistVideos(playlistId) {
        try {
            const url = `https://www.youtube.com/playlist?list=${playlistId}`;
            const { stdout } = await execFileAsync('yt-dlp', [
                '--flat-playlist',
                '--print', '%(id)s\t%(title)s\t%(upload_date)s',
                '--no-warnings',
                url
            ], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });

            const videos = [];
            const lines = stdout.trim().split('\n').filter(Boolean);

            for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].split('\t');
                if (parts.length >= 2) {
                    const [videoId, title, uploadDate] = parts;
                    // Parse upload date from YYYYMMDD to ISO
                    let publishedAt = null;
                    if (uploadDate && uploadDate !== 'NA' && uploadDate.length === 8) {
                        publishedAt = `${uploadDate.slice(0,4)}-${uploadDate.slice(4,6)}-${uploadDate.slice(6,8)}T00:00:00Z`;
                    }
                    videos.push({
                        videoId,
                        title,
                        description: '',
                        publishedAt,
                        playlistId,
                        position: i
                    });
                }
            }

            logger.info(`Fetched ${videos.length} videos from playlist ${playlistId} via yt-dlp`);
            return videos;
        } catch (err) {
            logger.error(`Error fetching playlist ${playlistId}:`, err.message);
            return [];
        }
    }

    /**
     * Process a single video: fetch transcript, extract knowledge, store, notify
     */
    async processVideo(video) {
        logger.info(`Processing video: "${video.title}" (${video.videoId})`);

        // Step 1: Fetch transcript
        const transcript = await this.fetchTranscript(video.videoId);
        if (!transcript) {
            logger.warn(`No transcript available for "${video.title}" (${video.videoId}), skipping`);
            // Still mark as processed to avoid retrying endlessly
            this.state.processedVideoIds.push(video.videoId);
            this._saveState();
            return;
        }

        logger.info(`Transcript fetched: ${transcript.length} characters`);

        // Step 2: Determine campaign from playlist or title
        const campaignCode = this._detectCampaign(video);

        // Step 3: Fetch relevant timeline events for correlation
        const timelineEvents = await this._getTimelineEventsForCorrelation(campaignCode);

        // Step 4: Save raw transcript to Sessions/
        this._saveRawTranscript(video, transcript, campaignCode);

        // Step 5: Chunk and extract
        const extraction = await this.processTranscript(video, transcript, campaignCode, timelineEvents);

        // Step 6: Update dossiers
        await this.updateDossiers(extraction.characterMentions);

        // Step 7: Save processed data to vault (summaries, characters, places, timeline)
        await this.saveToVault(video, extraction, campaignCode);

        // Step 8: Post summary to Discord ONLY for new episodes (published in last 7 days)
        const publishDate = video.publishedAt ? new Date(video.publishedAt) : null;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (publishDate && publishDate > sevenDaysAgo) {
            await this.postSummaryEmbed(video, extraction, campaignCode);
        } else {
            logger.info(`Skipping Discord post for old video "${video.title}" (published ${video.publishedAt || 'unknown'})`);
        }

        // Step 9: Mark as processed
        this.state.processedVideoIds.push(video.videoId);
        this._saveState();

        logger.info(`Completed processing: "${video.title}"`);
    }

    /**
     * Detect campaign AP code from playlist ID or video title
     */
    _detectCampaign(video) {
        const playlistMap = {};
        const raw = process.env.YOUTUBE_PLAYLIST_CAMPAIGNS || '';
        if (raw) {
            for (const entry of raw.split(',')) {
                const [plId, code] = entry.trim().split(':');
                if (plId && code) playlistMap[plId.trim()] = code.trim().toUpperCase();
            }
        }

        if (playlistMap[video.playlistId]) return playlistMap[video.playlistId];

        // Try to detect from title
        const title = (video.title || '').toLowerCase();
        if (title.includes('iron gods')) return 'IG';
        if (title.includes('skull') || title.includes('shackles')) return 'SS';
        if (title.includes('carrion crown')) return 'CC';
        if (title.includes('hell') && title.includes('vengeance')) return 'HV';
        if (title.includes('hell') && title.includes('rebels')) return 'HR';

        return 'UNKNOWN';
    }

    /**
     * Get timeline events for a campaign to help LLM correlate transcript content
     */
    async _getTimelineEventsForCorrelation(campaignCode) {
        if (!campaignCode || campaignCode === 'UNKNOWN') return [];
        try {
            // timelineSearch stores events on this.timeline after initialize()
            const allEvents = timelineSearch.timeline || [];
            const filtered = allEvents.filter(e => (e.ap || '').toUpperCase() === campaignCode);
            logger.info(`Found ${filtered.length} timeline events for campaign ${campaignCode}`);
            return filtered.slice(0, 100);
        } catch (err) {
            logger.warn('Could not load timeline events for correlation:', err.message);
            return [];
        }
    }

    /**
     * Fetch transcript for a YouTube video using YouTube's innertube API
     */
    async fetchTranscript(videoId) {
        try {
            // Step 1: Get caption tracks via innertube player API
            const playerResp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
                },
                body: JSON.stringify({
                    context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
                    videoId
                })
            });

            if (!playerResp.ok) {
                logger.error(`YouTube player API returned ${playerResp.status} for ${videoId}`);
                return null;
            }

            const playerData = await playerResp.json();
            const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

            if (!Array.isArray(tracks) || tracks.length === 0) {
                // Fallback: try scraping the watch page
                return await this._fetchTranscriptFromPage(videoId);
            }

            // Prefer English, fall back to first track
            const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
            const trackUrl = track.baseUrl;

            // Validate URL
            try {
                const url = new URL(trackUrl);
                if (!url.hostname.endsWith('.youtube.com')) {
                    logger.error(`Suspicious transcript URL hostname: ${url.hostname}`);
                    return null;
                }
            } catch {
                return null;
            }

            // Step 2: Fetch the transcript XML
            const transcriptResp = await fetch(trackUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!transcriptResp.ok) {
                logger.error(`Transcript fetch returned ${transcriptResp.status} for ${videoId}`);
                return null;
            }

            const xml = await transcriptResp.text();
            const segments = this._parseTranscriptXml(xml);

            if (segments.length === 0) {
                logger.warn(`No transcript segments parsed for ${videoId}`);
                return null;
            }

            const fullText = segments.join(' ').replace(/\s+/g, ' ').trim();

            if (fullText.length > 150000) {
                logger.warn(`Transcript for ${videoId} is very long (${fullText.length} chars), truncating to 150k`);
                return fullText.substring(0, 150000);
            }

            logger.info(`Fetched transcript for ${videoId}: ${fullText.length} chars, ${segments.length} segments`);
            return fullText;
        } catch (err) {
            logger.error(`Error fetching transcript for ${videoId}:`, err.message);
            return null;
        }
    }

    /**
     * Fallback: fetch transcript by scraping the YouTube watch page
     */
    async _fetchTranscriptFromPage(videoId) {
        try {
            const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!pageResp.ok) return null;

            const html = await pageResp.text();

            // Extract ytInitialPlayerResponse
            const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
            if (!match) return null;

            let playerData;
            try {
                // Parse carefully - find matching brace
                const jsonStr = match[1];
                playerData = JSON.parse(jsonStr);
            } catch {
                // Try to find the end of the JSON object manually
                const start = html.indexOf('var ytInitialPlayerResponse = ') + 'var ytInitialPlayerResponse = '.length;
                let depth = 0;
                let end = start;
                for (let i = start; i < html.length && i < start + 500000; i++) {
                    if (html[i] === '{') depth++;
                    else if (html[i] === '}') {
                        depth--;
                        if (depth === 0) { end = i + 1; break; }
                    }
                }
                try {
                    playerData = JSON.parse(html.slice(start, end));
                } catch {
                    return null;
                }
            }

            const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (!Array.isArray(tracks) || tracks.length === 0) return null;

            const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
            const transcriptResp = await fetch(track.baseUrl);
            if (!transcriptResp.ok) return null;

            const xml = await transcriptResp.text();
            const segments = this._parseTranscriptXml(xml);
            const fullText = segments.join(' ').replace(/\s+/g, ' ').trim();

            logger.info(`Fetched transcript via page scrape for ${videoId}: ${fullText.length} chars`);
            return fullText || null;
        } catch (err) {
            logger.error(`Page scrape transcript failed for ${videoId}:`, err.message);
            return null;
        }
    }

    /**
     * Parse YouTube transcript XML into text segments
     */
    _parseTranscriptXml(xml) {
        const segments = [];

        // Try new format: <p t="offset" d="duration">text</p>
        const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
        let match;
        while ((match = pRegex.exec(xml)) !== null) {
            let text = match[3];
            // Extract text from <s> tags if present
            const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
            let sMatch;
            let combined = '';
            while ((sMatch = sRegex.exec(text)) !== null) {
                combined += sMatch[1];
            }
            text = combined || text.replace(/<[^>]+>/g, '');
            text = this._decodeEntities(text).trim();
            if (text) segments.push(text);
        }

        // Fallback: old format <text start="..." dur="...">text</text>
        if (segments.length === 0) {
            const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
            while ((match = textRegex.exec(xml)) !== null) {
                const text = this._decodeEntities(match[3]).trim();
                if (text) segments.push(text);
            }
        }

        return segments;
    }

    /**
     * Decode HTML entities
     */
    _decodeEntities(text) {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
    }

    /**
     * Process a full transcript: chunk, extract, merge
     */
    async processTranscript(video, transcript, campaignCode, timelineEvents) {
        const chunks = this._chunkTranscript(transcript);
        logger.info(`Processing ${chunks.length} chunks for "${video.title}"`);

        // Build known names for the extraction prompt
        const knownNames = nameResolver.getAllNames().join(', ');

        // Build timeline context for correlation
        let timelineContext = '';
        if (timelineEvents.length > 0) {
            timelineContext = '\n\nKnown timeline events for this campaign (use these to correlate what you hear):\n' +
                timelineEvents.slice(0, 50).map(e => `- [${e.date}] ${e.location}: ${e.description}`).join('\n');
        }

        // Player map context
        let playerMapContext = '';
        if (this.playerCharacterMap.size > 0) {
            const entries = [];
            for (const [player, chars] of this.playerCharacterMap) {
                for (const c of chars) {
                    if (!campaignCode || campaignCode === 'UNKNOWN' || c.campaign === campaignCode) {
                        entries.push(`${player} (player) = ${c.characterName} (character)`);
                    }
                }
            }
            if (entries.length > 0) {
                playerMapContext = '\n\nPlayer-to-character mapping:\n' + entries.join('\n');
            }
        }

        // GM context
        if (this.gmName) {
            playerMapContext += `\n\nGM: "${this.gmName}" is the Game Master. When ${this.gmName} speaks, he is voicing NPCs, narrating, or describing the world — NOT playing a single player character. Attribute his dialogue to the specific NPC being voiced when identifiable.`;
        }

        const allResults = [];

        for (let i = 0; i < chunks.length; i++) {
            try {
                const result = await this.extractFromChunk(
                    chunks[i], i + 1, chunks.length, video.title,
                    knownNames, campaignCode, timelineContext, playerMapContext
                );
                allResults.push(result);
            } catch (err) {
                logger.error(`Error extracting chunk ${i + 1}/${chunks.length}:`, err.message);
            }

            // Delay between chunks to pace API usage
            if (i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, this.chunkDelay));
            }
        }

        // Merge all chunk results
        const merged = this.mergeExtractions(allResults);

        // Generate overall summary via one final LLM call
        merged.summary = await this.generateSummary(video, merged, campaignCode);

        return merged;
    }

    /**
     * Split transcript into overlapping chunks
     */
    _chunkTranscript(transcript) {
        const chunks = [];
        const chunkSize = this.chunkSize || 4000;
        const overlap = Math.min(200, Math.floor(chunkSize / 4));
        let start = 0;

        while (start < transcript.length) {
            const end = Math.min(start + chunkSize, transcript.length);
            chunks.push(transcript.substring(start, end));

            // If we've reached the end, stop
            if (end >= transcript.length) break;

            // Advance past the chunk minus overlap
            start = end - overlap;
        }

        return chunks;
    }

    /**
     * Extract structured data from a single transcript chunk via Ollama
     */
    async extractFromChunk(chunk, chunkNum, totalChunks, videoTitle, knownNames, campaignCode, timelineContext, playerMapContext) {
        const systemPrompt = `You are analyzing a D&D/Pathfinder tabletop RPG session transcript (chunk ${chunkNum}/${totalChunks}).
Video title: "${videoTitle}"
Campaign: ${campaignCode}

Known character/NPC names: ${knownNames}
${playerMapContext}
${timelineContext}

IMPORTANT: Players speak as themselves (real names) but control characters. When a player says "I attack", they mean their character does. Map player names to character names when possible.

Extract the following as JSON. Be thorough but concise:

{
  "characterMentions": [
    { "name": "CharacterName", "context": "Brief description of what they did or what was said about them", "significance": "low|medium|high" }
  ],
  "events": [
    { "description": "What happened", "location": "Where (if mentioned)", "characters": ["who was involved"], "significance": "low|medium|high", "correlatedTimelineDate": "matching timeline date if this seems to match a known event, or null" }
  ],
  "deaths": [
    { "name": "Who died", "description": "How they died", "killedBy": "Who/what killed them" }
  ],
  "acquisitions": [
    { "character": "Who got it", "item": "What they acquired", "context": "How they got it" }
  ],
  "places": [
    { "name": "Location name", "country": "Country/Region (e.g. Numeria, Ustalav, The Shackles)", "city": "City or settlement if applicable", "description": "Brief description of this place from what was discussed", "significance": "low|medium|high" }
  ],
  "quotes": [
    { "speaker": "CharacterName", "quote": "Notable or funny quote", "context": "Brief context" }
  ],
  "knowledge": [
    "General campaign facts, lore revealed, plot points discovered"
  ]
}

Respond ONLY with valid JSON. No markdown formatting, no code fences.`;

        try {
            const result = await llmRouter.claudeGenerate(chunk, {
                system: systemPrompt,
                model: 'claude-haiku-4-5-20251001',
                maxTokens: 2000,
                temperature: 0.1
            });

            return this._parseJSON(result, chunkNum);
        } catch (err) {
            logger.warn(`Claude extraction failed for chunk ${chunkNum}, trying Ollama fallback:`, err.message);
            try {
                const result = await llmRouter.ollamaGenerate(chunk, {
                    system: systemPrompt,
                    model: llmRouter.ollamaModelQuality,
                    maxTokens: 2000,
                    temperature: 0.1,
                    timeout: 120000
                });
                return this._parseJSON(result, chunkNum);
            } catch (err2) {
                logger.error(`All extraction failed for chunk ${chunkNum}:`, err2.message);
                return this._emptyExtraction();
            }
        }
    }

    /**
     * Parse JSON from LLM response, with retry on failure
     */
    _parseJSON(text, chunkNum) {
        // Try to extract JSON from the response (might have extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    characterMentions: parsed.characterMentions || [],
                    events: parsed.events || [],
                    deaths: parsed.deaths || [],
                    acquisitions: parsed.acquisitions || [],
                    places: parsed.places || [],
                    quotes: parsed.quotes || [],
                    knowledge: parsed.knowledge || []
                };
            } catch (err) {
                logger.warn(`JSON parse failed for chunk ${chunkNum}, attempting cleanup`);
            }
        }

        // Try to fix common JSON issues
        try {
            const cleaned = text
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']')
                .trim();
            const jsonMatch2 = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch2) {
                const parsed = JSON.parse(jsonMatch2[0]);
                return {
                    characterMentions: parsed.characterMentions || [],
                    events: parsed.events || [],
                    deaths: parsed.deaths || [],
                    acquisitions: parsed.acquisitions || [],
                    places: parsed.places || [],
                    quotes: parsed.quotes || [],
                    knowledge: parsed.knowledge || []
                };
            }
        } catch (err) {
            logger.error(`Could not parse LLM output for chunk ${chunkNum}`);
        }

        return this._emptyExtraction();
    }

    _emptyExtraction() {
        return {
            characterMentions: [],
            events: [],
            deaths: [],
            acquisitions: [],
            places: [],
            quotes: [],
            knowledge: []
        };
    }

    /**
     * Merge extractions from all chunks, deduplicating
     */
    mergeExtractions(results) {
        const merged = this._emptyExtraction();

        for (const result of results) {
            // Character mentions — dedupe by name, keep highest significance
            for (const mention of (result.characterMentions || [])) {
                const existing = merged.characterMentions.find(
                    m => m.name?.toLowerCase() === mention.name?.toLowerCase()
                );
                if (existing) {
                    // Append context if different
                    if (!existing.context.includes(mention.context)) {
                        existing.context += '; ' + mention.context;
                    }
                    // Escalate significance
                    if (mention.significance === 'high') existing.significance = 'high';
                    else if (mention.significance === 'medium' && existing.significance === 'low') {
                        existing.significance = 'medium';
                    }
                } else {
                    merged.characterMentions.push({ ...mention });
                }
            }

            // Events — simple append (hard to dedupe across chunks)
            merged.events.push(...(result.events || []));

            // Deaths — dedupe by name
            for (const death of (result.deaths || [])) {
                if (!merged.deaths.some(d => d.name?.toLowerCase() === death.name?.toLowerCase())) {
                    merged.deaths.push(death);
                }
            }

            // Acquisitions — append
            merged.acquisitions.push(...(result.acquisitions || []));

            // Places — dedupe by name, merge descriptions
            for (const place of (result.places || [])) {
                const existing = merged.places.find(
                    p => p.name?.toLowerCase() === place.name?.toLowerCase()
                );
                if (existing) {
                    if (place.description && !existing.description.includes(place.description)) {
                        existing.description += '; ' + place.description;
                    }
                    if (!existing.country && place.country) existing.country = place.country;
                    if (!existing.city && place.city) existing.city = place.city;
                } else {
                    merged.places.push({ ...place });
                }
            }

            // Quotes — append, dedupe exact matches
            for (const quote of (result.quotes || [])) {
                if (!merged.quotes.some(q => q.quote === quote.quote)) {
                    merged.quotes.push(quote);
                }
            }

            // Knowledge — dedupe exact matches
            for (const fact of (result.knowledge || [])) {
                if (!merged.knowledge.includes(fact)) {
                    merged.knowledge.push(fact);
                }
            }
        }

        return merged;
    }

    /**
     * Generate an overall summary of the session using LLM
     */
    async generateSummary(video, extraction, campaignCode) {
        const summaryPrompt = `Summarize this D&D/Pathfinder session in 3-5 paragraphs.
Campaign: ${campaignCode}
Video: "${video.title}"

Key events: ${JSON.stringify(extraction.events.filter(e => e.significance !== 'low').slice(0, 20))}
Deaths: ${JSON.stringify(extraction.deaths)}
Notable acquisitions: ${JSON.stringify(extraction.acquisitions.slice(0, 10))}
Characters involved: ${extraction.characterMentions.map(m => m.name).join(', ')}

Write a narrative summary suitable for a campaign journal. Be specific about what happened.`;

        try {
            const summary = await llmRouter.claudeGenerate(summaryPrompt, {
                model: 'claude-haiku-4-5-20251001',
                maxTokens: 1000,
                temperature: 0.3
            });
            return summary;
        } catch (err) {
            logger.error('Error generating summary:', err.message);
            return 'Summary generation failed.';
        }
    }

    /**
     * Update character dossiers with extracted information
     */
    async updateDossiers(characterMentions) {
        for (const mention of characterMentions) {
            if (!mention.name || mention.significance === 'low') continue;

            const resolved = nameResolver.resolve(mention.name);
            if (resolved) {
                dossierManager.addPlayerUpdate(
                    resolved,
                    mention.context,
                    'youtube-transcript'
                );
            }
        }
    }

    /**
     * Save raw transcript to Sessions/ folder
     */
    _saveRawTranscript(video, transcript, campaignCode) {
        const safeTitle = video.title.replace(/[^a-zA-Z0-9\s_-]/g, '').substring(0, 80).trim();
        const fileName = `${video.videoId} - ${safeTitle}.md`;
        const filePath = path.join(VAULT_PATHS.sessions, fileName);

        const md = `---
title: "${safeTitle}"
type: raw-transcript
videoId: "${video.videoId}"
campaign: "${campaignCode}"
publishedAt: "${video.publishedAt || ''}"
capturedAt: "${new Date().toISOString()}"
tags: [session, transcript, ${campaignCode.toLowerCase()}]
---

# ${safeTitle} — Raw Transcript

**Campaign:** ${campaignCode} | **Video:** [Watch on YouTube](https://youtube.com/watch?v=${video.videoId})

---

${transcript}
`;

        fs.writeFileSync(filePath, md, 'utf8');
        logger.info(`Saved raw transcript: ${fileName}`);
    }

    /**
     * Save processed extraction to vault (Session Summaries, Characters, Places, Timeline)
     */
    async saveToVault(video, extraction, campaignCode) {
        // 1. Session Summary → Session Summaries/
        this._saveSummary(video, extraction, campaignCode);

        // 2. Character pages → Characters/
        this._updateCharacterVaultPages(extraction, campaignCode, video);

        // 3. Place pages → Places/{Country}/{City}/{Location}.md
        this._updatePlaceVaultPages(extraction, campaignCode, video);

        // 4. Timeline → Timeline/ (merged with Google Sheets data)
        this._updateTimelineVault(extraction, campaignCode, video);

        // 5. Index
        this._updateIndex(video, extraction, campaignCode);
    }

    /**
     * Save session summary to Session Summaries/ folder
     */
    _saveSummary(video, extraction, campaignCode) {
        const safeTitle = video.title.replace(/[^a-zA-Z0-9\s_-]/g, '').substring(0, 80).trim();
        const fileName = `${video.videoId} - ${safeTitle}.md`;
        const filePath = path.join(VAULT_PATHS.summaries, fileName);

        const characters = extraction.characterMentions.map(m => m.name).filter(Boolean);
        const places = extraction.places.map(p => p.name).filter(Boolean);
        const tags = [
            campaignCode.toLowerCase(),
            'session-summary',
            ...characters.map(c => c.toLowerCase().replace(/\s+/g, '-'))
        ].filter(Boolean);

        let md = `---
title: "${safeTitle}"
type: session-summary
videoId: "${video.videoId}"
campaign: "${campaignCode}"
publishedAt: "${video.publishedAt || ''}"
processedAt: "${new Date().toISOString()}"
characters: [${characters.map(c => `"${c}"`).join(', ')}]
places: [${places.map(p => `"${p}"`).join(', ')}]
tags: [${tags.map(t => `"${t}"`).join(', ')}]
---

# ${safeTitle}

**Campaign:** ${campaignCode} | **Video:** [Watch on YouTube](https://youtube.com/watch?v=${video.videoId}) | **Raw:** [[${video.videoId} - ${safeTitle}|Transcript]]

## Summary

${extraction.summary || 'No summary generated.'}

`;

        if (extraction.events.length > 0) {
            md += `## Key Events\n\n`;
            for (const event of extraction.events.filter(e => e.significance !== 'low')) {
                const corr = event.correlatedTimelineDate ? ` *(Timeline: ${event.correlatedTimelineDate})*` : '';
                md += `- **${event.description}**${corr}\n`;
                if (event.location) md += `  - Location: [[${event.location}]]\n`;
                if (event.characters?.length) md += `  - Characters: ${event.characters.map(c => `[[${c}]]`).join(', ')}\n`;
            }
            md += '\n';
        }

        if (extraction.deaths.length > 0) {
            md += `## Deaths\n\n`;
            for (const death of extraction.deaths) {
                md += `- **[[${death.name}]]** — ${death.description}`;
                if (death.killedBy) md += ` (killed by ${death.killedBy})`;
                md += '\n';
            }
            md += '\n';
        }

        if (extraction.acquisitions.length > 0) {
            md += `## Acquisitions\n\n`;
            for (const acq of extraction.acquisitions) {
                md += `- **[[${acq.character}]]** acquired *${acq.item}*`;
                if (acq.context) md += ` — ${acq.context}`;
                md += '\n';
            }
            md += '\n';
        }

        if (extraction.quotes.length > 0) {
            md += `## Notable Quotes\n\n`;
            for (const quote of extraction.quotes.slice(0, 10)) {
                md += `> "${quote.quote}"\n> — [[${quote.speaker}]]`;
                if (quote.context) md += ` (${quote.context})`;
                md += '\n\n';
            }
        }

        if (extraction.knowledge.length > 0) {
            md += `## Campaign Knowledge\n\n`;
            for (const fact of extraction.knowledge) {
                md += `- ${fact}\n`;
            }
            md += '\n';
        }

        if (extraction.characterMentions.length > 0) {
            md += `## Character Activity\n\n`;
            for (const mention of extraction.characterMentions) {
                md += `### [[${mention.name}]]\n${mention.context}\n\n`;
            }
        }

        fs.writeFileSync(filePath, md, 'utf8');
        logger.info(`Saved session summary: ${fileName}`);
    }

    /**
     * Create/update per-character pages in Characters/ folder
     */
    _updateCharacterVaultPages(extraction, campaignCode, video) {
        for (const mention of extraction.characterMentions) {
            if (!mention.name || mention.significance === 'low') continue;

            const safeName = mention.name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
            const charFile = path.join(VAULT_PATHS.characters, `${safeName}.md`);

            let existing = '';
            let isNew = true;
            if (fs.existsSync(charFile)) {
                existing = fs.readFileSync(charFile, 'utf8');
                isNew = false;
            }

            if (isNew) {
                const dossier = dossierManager.getDossier(mention.name);
                const md = `---
name: "${safeName}"
type: character
campaign: "${campaignCode}"
tags: [character, ${campaignCode.toLowerCase()}]
---

# ${safeName}

${dossier ? `**Race:** ${dossier.race || 'Unknown'} | **Class:** ${dossier.class || 'Unknown'} | **Level:** ${dossier.level || '?'}` : ''}
${dossier?.description ? `\n${dossier.description}\n` : ''}

## Session Appearances

### ${video.title}
${mention.context}

`;
                fs.writeFileSync(charFile, md, 'utf8');
            } else {
                const entry = `\n### ${video.title}\n${mention.context}\n`;
                if (!existing.includes(video.title)) {
                    fs.appendFileSync(charFile, entry, 'utf8');
                }
            }
        }
    }

    /**
     * Create/update place pages in Places/{Country}/{City|location}.md hierarchy
     */
    _updatePlaceVaultPages(extraction, campaignCode, video) {
        for (const place of (extraction.places || [])) {
            if (!place.name || place.significance === 'low') continue;

            // Build folder path: Places/{Country}/{City or location}
            const country = (place.country || 'Unknown Region').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
            const countryDir = path.join(VAULT_PATHS.places, country);
            if (!fs.existsSync(countryDir)) {
                fs.mkdirSync(countryDir, { recursive: true });
            }

            // If there's a city AND a separate location name, nest further
            let placeDir = countryDir;
            if (place.city && place.city !== place.name) {
                const safeCity = place.city.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
                placeDir = path.join(countryDir, safeCity);
                if (!fs.existsSync(placeDir)) {
                    fs.mkdirSync(placeDir, { recursive: true });
                }
            }

            const safeName = place.name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
            const placeFile = path.join(placeDir, `${safeName}.md`);

            let existing = '';
            let isNew = true;
            if (fs.existsSync(placeFile)) {
                existing = fs.readFileSync(placeFile, 'utf8');
                isNew = false;
            }

            if (isNew) {
                const md = `---
name: "${safeName}"
type: place
country: "${country}"
${place.city ? `city: "${place.city}"` : ''}
campaign: "${campaignCode}"
tags: [place, ${campaignCode.toLowerCase()}, ${country.toLowerCase().replace(/\s+/g, '-')}]
---

# ${safeName}

**Region:** ${country}${place.city ? ` | **City:** ${place.city}` : ''}

## Description

${place.description || ''}

## Session References

### ${video.title}
Mentioned in this session.

`;
                fs.writeFileSync(placeFile, md, 'utf8');
            } else {
                if (!existing.includes(video.title)) {
                    const entry = `\n### ${video.title}\n${place.description || 'Mentioned in this session.'}\n`;
                    fs.appendFileSync(placeFile, entry, 'utf8');
                }
            }
        }
    }

    /**
     * Update Timeline/ folder — merges session events with Google Sheets data
     * Google Sheets is treated as the authoritative source; session data supplements it
     */
    _updateTimelineVault(extraction, campaignCode, video) {
        const events = extraction.events.filter(e => e.significance !== 'low');
        if (events.length === 0) return;

        const timelineFile = path.join(VAULT_PATHS.timeline, `${campaignCode}_timeline.md`);

        let existing = '';
        if (fs.existsSync(timelineFile)) {
            existing = fs.readFileSync(timelineFile, 'utf8');
        } else {
            // Build initial timeline from Google Sheets data
            const sheetEvents = (timelineSearch.timeline || [])
                .filter(e => (e.ap || '').toUpperCase() === campaignCode);

            existing = `---
type: timeline
campaign: "${campaignCode}"
tags: [timeline, ${campaignCode.toLowerCase()}]
source: google-sheets + session-transcripts
---

# ${campaignCode} Campaign Timeline

> Google Sheets events are authoritative. Session transcript events supplement the record.

`;
            if (sheetEvents.length > 0) {
                existing += `## Google Sheets Timeline (Authoritative)\n\n`;
                for (const e of sheetEvents) {
                    existing += `- **[${e.date}]** ${e.location ? `*(${e.location})* ` : ''}${e.description}\n`;
                }
                existing += '\n';
            }

            existing += `## Session Transcript Events\n\n`;
        }

        // Only add events not already recorded
        const newEntries = [];
        for (const event of events) {
            const desc = (event.description || '').substring(0, 50);
            if (desc && !existing.includes(desc)) {
                let entry = `- **${event.description}**`;
                if (event.location) entry += ` *(${event.location})*`;
                if (event.correlatedTimelineDate) entry += ` — Correlates to: ${event.correlatedTimelineDate}`;
                if (event.characters?.length) entry += `\n  - Characters: ${event.characters.map(c => `[[${c}]]`).join(', ')}`;
                newEntries.push(entry);
            }
        }

        if (newEntries.length > 0) {
            const section = `\n### From: ${video.title}\n\n${newEntries.join('\n')}\n`;
            fs.writeFileSync(timelineFile, existing + section, 'utf8');
            logger.info(`Added ${newEntries.length} events to ${campaignCode} timeline vault`);
        }
    }

    /**
     * Update the transcript index file
     */
    _updateIndex(video, extraction, campaignCode) {
        let index = {};
        try {
            if (fs.existsSync(INDEX_PATH)) {
                index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
            }
        } catch (err) {
            logger.warn('Could not load transcript index, creating new one');
        }

        index[video.videoId] = {
            title: video.title,
            publishedAt: video.publishedAt,
            processedAt: new Date().toISOString(),
            campaign: campaignCode,
            characters: extraction.characterMentions.map(m => m.name).filter(Boolean),
            eventCount: extraction.events.length,
            deathCount: extraction.deaths.length,
            summary: (extraction.summary || '').substring(0, 300)
        };

        fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
    }

    /**
     * Post a persona-flavored summary embed to Discord
     */
    async postSummaryEmbed(video, extraction, campaignCode) {
        if (!this.client || !this.summaryChannelId) return;

        // Don't post if summary generation failed or had no events
        if (!extraction || !extraction.summary || extraction.summary.includes('generation failed')) {
            logger.debug(`Skipping Discord post for "${video.title}" — no meaningful summary`);
            return;
        }

        try {
            const channel = await this.client.channels.fetch(this.summaryChannelId);
            if (!channel || !channel.isTextBased()) {
                logger.warn('YouTube summary channel not found or not text-based');
                return;
            }

            // Get current personality for flavored commentary
            const personality = personalityManager.getRandomPersonality?.() || null;
            let commentary = '';

            if (personality && extraction.summary) {
                try {
                    const commentPrompt = `You are Casandalee, an AI goddess with 72 past lives. Your current persona is: ${personality.name || 'Goddess'}.
${personalityManager.buildPromptFragment?.(personality) || ''}

React to this D&D session summary in 1-2 sentences, in character. Be brief and flavorful.

Session: ${extraction.summary.substring(0, 500)}`;

                    commentary = await llmRouter.claudeGenerate(commentPrompt, {
                        model: 'claude-haiku-4-5-20251001',
                        maxTokens: 150,
                        temperature: 0.7
                    });
                } catch (err) {
                    logger.warn('Could not generate persona commentary:', err.message);
                }
            }

            // Build embed
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle(`📹 Session Transcript Processed`)
                .setURL(`https://youtube.com/watch?v=${video.videoId}`)
                .setDescription(
                    `**${video.title}**\nCampaign: **${campaignCode}**` +
                    (commentary ? `\n\n*${commentary}*` : '')
                )
                .setTimestamp();

            // Summary field
            if (extraction.summary) {
                embed.addFields({
                    name: '📜 Summary',
                    value: extraction.summary.substring(0, 1024)
                });
            }

            // Characters
            if (extraction.characterMentions.length > 0) {
                const charList = extraction.characterMentions
                    .filter(m => m.significance !== 'low')
                    .map(m => m.name)
                    .slice(0, 15)
                    .join(', ');
                if (charList) {
                    embed.addFields({ name: '👥 Characters', value: charList, inline: true });
                }
            }

            // Deaths
            if (extraction.deaths.length > 0) {
                const deathList = extraction.deaths
                    .map(d => `💀 ${d.name}`)
                    .join('\n');
                embed.addFields({ name: 'Deaths', value: deathList.substring(0, 1024), inline: true });
            }

            // Stats
            const stats = [
                `${extraction.events.length} events`,
                `${extraction.acquisitions.length} items acquired`,
                `${extraction.quotes.length} notable quotes`,
                `${extraction.knowledge.length} facts learned`
            ].join(' | ');
            embed.setFooter({ text: stats });

            await channel.send({ embeds: [embed] });
            logger.info(`Posted session summary for "${video.title}" to Discord`);

            // If there are notable quotes, post a couple as follow-up
            if (extraction.quotes.length > 0) {
                const topQuotes = extraction.quotes
                    .slice(0, 3)
                    .map(q => `> *"${q.quote}"* — **${q.speaker}**`)
                    .join('\n');
                if (topQuotes.length > 0 && topQuotes.length < 2000) {
                    await channel.send(`**Notable quotes from this session:**\n${topQuotes}`);
                }
            }

        } catch (err) {
            logger.error('Error posting YouTube summary embed:', err.message);
        }
    }

    /**
     * Get processing stats
     */
    getStats() {
        return {
            playlistCount: this.playlistIds.length,
            processedCount: this.state.processedVideoIds.length,
            lastCheck: this.state.lastCheck,
            errorCount: this.state.processingErrors.length,
            isProcessing: this.processing
        };
    }
}

module.exports = YouTubeTranscriptProcessor;
