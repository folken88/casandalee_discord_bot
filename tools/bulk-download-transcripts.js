#!/usr/bin/env node
/**
 * Bulk Transcript Downloader
 * Downloads ALL transcripts from all playlists and saves raw to the vault.
 * No LLM processing — just grab and store.
 *
 * Usage: node tools/bulk-download-transcripts.js [--playlist PL...] [--delay 2000]
 */

require('dotenv').config({ override: true });

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../obsidian_cass/cassvault');
const SESSIONS_DIR = path.join(VAULT_DIR, 'Sessions');
const STATE_PATH = path.join(__dirname, '../data/cache/transcript-download-state.json');

// All playlists
const PLAYLISTS = {
    'PL0y2CS3X3x777aFfVyhTg0eviGTAu-L52': 'Iron Gods',
    'PL0y2CS3X3x74xd18b9sEcuhiI5QWFkv9U': 'Skull & Shackles',
    'PL0y2CS3X3x762i7XlRLRbHMacOszf6jsy': 'Carrion Crown',
    'PL0y2CS3X3x75Nnv-XfVJqTGkApnQsozDx': 'Hells Vengeance',
    'PL0y2CS3X3x75wxU-qV6S9a_7WDbKG0eZI': 'Hells Rebels',
};

const CAMPAIGN_CODES = {
    'PL0y2CS3X3x777aFfVyhTg0eviGTAu-L52': 'IG',
    'PL0y2CS3X3x74xd18b9sEcuhiI5QWFkv9U': 'SS',
    'PL0y2CS3X3x762i7XlRLRbHMacOszf6jsy': 'CC',
    'PL0y2CS3X3x75Nnv-XfVJqTGkApnQsozDx': 'HV',
    'PL0y2CS3X3x75wxU-qV6S9a_7WDbKG0eZI': 'HR',
};

// Delay between transcript fetches (ms) — be nice to YouTube
const DEFAULT_DELAY = 3000;

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {
        return { downloaded: [], failed: [], lastRun: null };
    }
}

function saveState(state) {
    const dir = path.dirname(STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function fetchPlaylistVideos(playlistId) {
    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    console.log(`  Fetching playlist: ${PLAYLISTS[playlistId]}...`);

    try {
        const { stdout } = await execFileAsync('yt-dlp', [
            '--flat-playlist',
            '--print', '%(id)s\t%(title)s\t%(upload_date)s',
            '--no-warnings',
            url
        ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });

        const videos = [];
        for (const line of stdout.trim().split('\n').filter(Boolean)) {
            const [videoId, title, uploadDate] = line.split('\t');
            if (videoId && title) {
                let publishedAt = null;
                if (uploadDate && uploadDate !== 'NA' && uploadDate.length === 8) {
                    publishedAt = `${uploadDate.slice(0,4)}-${uploadDate.slice(4,6)}-${uploadDate.slice(6,8)}`;
                }
                videos.push({ videoId, title, publishedAt, playlistId });
            }
        }
        console.log(`  Found ${videos.length} videos`);
        return videos;
    } catch (err) {
        console.error(`  ERROR listing playlist: ${err.message}`);
        return [];
    }
}

async function fetchTranscript(videoId) {
    // Use yt-dlp to download auto-generated captions as json3, then parse
    const tmpDir = path.join(__dirname, '../data/cache/sub-tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const outTemplate = path.join(tmpDir, videoId);
    const subFile = `${outTemplate}.en.json3`;

    try {
        // Clean up any previous attempt
        if (fs.existsSync(subFile)) fs.unlinkSync(subFile);

        // Step 1: Get metadata (--print can't combine with --write-auto-sub)
        let meta = { duration: 0, uploadDate: null };
        try {
            const { stdout: metaOut } = await execFileAsync('yt-dlp', [
                '--skip-download', '--no-warnings',
                '--print', '%(duration)s\t%(upload_date)s',
                `https://www.youtube.com/watch?v=${videoId}`
            ], { timeout: 30000 });
            const metaLine = metaOut.trim().split('\n').pop();
            const [durationStr, uploadDate] = (metaLine || '').split('\t');
            meta.duration = parseInt(durationStr) || 0;
            if (uploadDate && uploadDate !== 'NA' && uploadDate.length === 8) {
                meta.uploadDate = `${uploadDate.slice(0,4)}-${uploadDate.slice(4,6)}-${uploadDate.slice(6,8)}`;
            }
        } catch {}

        // Step 2: Download auto-captions (separate call)
        await execFileAsync('yt-dlp', [
            '--write-auto-sub',
            '--sub-lang', 'en',
            '--sub-format', 'json3',
            '--skip-download',
            '-o', outTemplate,
            `https://www.youtube.com/watch?v=${videoId}`
        ], { timeout: 60000 });

        if (!fs.existsSync(subFile)) return { transcript: null, meta };

        const data = JSON.parse(fs.readFileSync(subFile, 'utf-8'));

        // Build readable transcript with timestamps
        const lines = [];
        for (const event of data.events || []) {
            if (!event.segs) continue;
            const text = event.segs.map(s => s.utf8).join('').trim();
            if (!text) continue;

            const startMs = event.tStartMs || 0;
            const mins = Math.floor(startMs / 60000);
            const secs = Math.floor((startMs % 60000) / 1000);
            const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            lines.push(`[${timestamp}] ${text}`);
        }

        // Clean up temp file
        try { fs.unlinkSync(subFile); } catch {}

        return {
            transcript: lines.length > 0 ? lines.join('\n') : null,
            meta,
        };
    } catch (err) {
        // Clean up on error
        try { fs.unlinkSync(subFile); } catch {}
        return { transcript: null, meta: {} };
    }
}

function saveTranscript(video, transcript, campaignCode, meta = {}) {
    const safeTitle = video.title.replace(/[^a-zA-Z0-9\s_-]/g, '').substring(0, 80).trim();
    const fileName = `${campaignCode} - ${video.videoId} - ${safeTitle}.md`;

    // Organize by campaign subfolder
    const campaignDir = path.join(SESSIONS_DIR, PLAYLISTS[video.playlistId] || campaignCode);
    if (!fs.existsSync(campaignDir)) fs.mkdirSync(campaignDir, { recursive: true });

    const filePath = path.join(campaignDir, fileName);

    const publishDate = meta.uploadDate || video.publishedAt || 'unknown';
    const durationMins = meta.duration ? Math.round(meta.duration / 60) : 0;
    const durationStr = durationMins > 0
        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
        : 'unknown';

    const md = `---
title: "${safeTitle}"
type: raw-transcript
videoId: "${video.videoId}"
campaign: "${campaignCode}"
publishedAt: "${publishDate}"
duration: ${meta.duration || 0}
durationFormatted: "${durationStr}"
capturedAt: "${new Date().toISOString()}"
transcriptLength: ${transcript.length}
tags: ["session", "transcript", "${campaignCode.toLowerCase()}"]
---

# ${safeTitle}

**Campaign:** ${campaignCode} | **Video:** [Watch on YouTube](https://youtube.com/watch?v=${video.videoId})
**Published:** ${publishDate} | **Duration:** ${durationStr} | **Transcript:** ${transcript.length.toLocaleString()} characters

---

${transcript}
`;

    fs.writeFileSync(filePath, md, 'utf8');
    return filePath;
}

async function main() {
    const args = process.argv.slice(2);
    const delay = parseInt(args.find((a, i) => args[i-1] === '--delay') || DEFAULT_DELAY);
    const filterPlaylist = args.find((a, i) => args[i-1] === '--playlist');

    console.log('\n=== Bulk Transcript Downloader ===\n');

    // Ensure output dirs
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    const state = loadState();
    console.log(`Previously downloaded: ${state.downloaded.length} videos`);
    console.log(`Previously failed: ${state.failed.length} videos`);
    console.log(`Delay between fetches: ${delay}ms\n`);

    // Gather all videos from all playlists
    const allVideos = [];
    const playlistIds = filterPlaylist ? [filterPlaylist] : Object.keys(PLAYLISTS);

    for (const playlistId of playlistIds) {
        const videos = await fetchPlaylistVideos(playlistId);
        allVideos.push(...videos);
    }

    console.log(`\nTotal videos found: ${allVideos.length}`);

    // Filter out already downloaded
    const toDownload = allVideos.filter(v => !state.downloaded.includes(v.videoId));
    console.log(`New to download: ${toDownload.length}`);
    console.log(`Already have: ${allVideos.length - toDownload.length}\n`);

    if (toDownload.length === 0) {
        console.log('Nothing new to download!');
        return;
    }

    let success = 0, failed = 0, noTranscript = 0;
    let totalDuration = 0;

    for (let i = 0; i < toDownload.length; i++) {
        const video = toDownload[i];
        const campaignCode = CAMPAIGN_CODES[video.playlistId] || 'UNKNOWN';
        const progress = `[${i + 1}/${toDownload.length}]`;

        process.stdout.write(`${progress} ${campaignCode} | ${video.title.substring(0, 60)}... `);

        try {
            const result = await fetchTranscript(video.videoId);
            const { transcript, meta } = result || {};

            if (meta?.duration) totalDuration += meta.duration;

            if (!transcript || transcript.length < 100) {
                console.log('⚠️  NO TRANSCRIPT');
                noTranscript++;
                state.failed.push(video.videoId);
                saveState(state);
            } else {
                const filePath = saveTranscript(video, transcript, campaignCode, meta);
                const sizeKB = Math.round(transcript.length / 1024);
                const dur = meta?.duration ? `${Math.floor(meta.duration/3600)}h${Math.floor((meta.duration%3600)/60)}m` : '?';
                console.log(`✅ ${sizeKB}KB (${dur})`);
                success++;
                state.downloaded.push(video.videoId);
                saveState(state);
            }
        } catch (err) {
            console.log(`❌ ERROR: ${err.message.substring(0, 60)}`);
            failed++;
            state.failed.push(video.videoId);
            saveState(state);
        }

        // Rate limit
        if (i < toDownload.length - 1) {
            await new Promise(r => setTimeout(r, delay));
        }
    }

    state.lastRun = new Date().toISOString();
    saveState(state);

    const totalHours = Math.round(totalDuration / 3600);
    console.log(`\n=== Download Complete ===`);
    console.log(`✅ Success: ${success}`);
    console.log(`⚠️  No transcript: ${noTranscript}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total in vault: ${state.downloaded.length}`);
    console.log(`Total duration scraped this run: ~${totalHours} hours`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
