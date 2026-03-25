#!/usr/bin/env node
// Run with: node --max-old-space-size=512 tools/test-youtube-transcript.js
/**
 * Test script: Process a single YouTube video transcript
 * Usage: node tools/test-youtube-transcript.js [videoId]
 *
 * Default: first video from Iron Gods playlist
 */

require('dotenv').config({ override: true });

const YouTubeTranscriptProcessor = require('../src/utils/youtubeTranscriptProcessor');

// Override env for testing
if (!process.env.YOUTUBE_PLAYLIST_IDS) {
    // Iron Gods playlist
    process.env.YOUTUBE_PLAYLIST_IDS = 'PL0y2CS3X3x777aFfVyhTg0eviGTAu-L52';
}
if (!process.env.YOUTUBE_PLAYLIST_CAMPAIGNS) {
    process.env.YOUTUBE_PLAYLIST_CAMPAIGNS = 'PL0y2CS3X3x777aFfVyhTg0eviGTAu-L52:IG';
}

async function main() {
    const videoId = process.argv[2] || 'GrVccgefn9g'; // First Iron Gods video

    console.log(`\n=== YouTube Transcript Test ===`);
    console.log(`Video ID: ${videoId}`);
    console.log(`API Key: ${process.env.GOOGLE_SHEETS_API_KEY ? 'configured' : 'MISSING'}`);
    console.log(`Anthropic Key: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING'}`);
    console.log('');

    const processor = new YouTubeTranscriptProcessor();

    // Step 1: Fetch transcript
    console.log('Step 1: Fetching transcript...');
    const transcript = await processor.fetchTranscript(videoId);
    if (!transcript) {
        console.error('No transcript available for this video. Try a different video ID.');
        process.exit(1);
    }
    console.log(`  Transcript length: ${transcript.length} characters`);
    console.log(`  First 200 chars: ${transcript.substring(0, 200)}...`);
    console.log('');

    // Step 2: Process through LLM
    const video = {
        videoId,
        title: `Test Video ${videoId}`,
        publishedAt: new Date().toISOString(),
        playlistId: process.env.YOUTUBE_PLAYLIST_IDS.split(',')[0]
    };

    // Try to get real title from playlist
    try {
        const videos = await processor.fetchPlaylistVideos(video.playlistId);
        const match = videos.find(v => v.videoId === videoId);
        if (match) {
            video.title = match.title;
            video.publishedAt = match.publishedAt;
            console.log(`  Video title: ${video.title}`);
        }
    } catch (err) {
        console.log(`  Could not fetch video metadata: ${err.message}`);
    }

    const campaignCode = processor._detectCampaign(video);
    console.log(`  Campaign: ${campaignCode}`);

    const timelineEvents = await processor._getTimelineEventsForCorrelation(campaignCode);
    console.log(`  Timeline events for correlation: ${timelineEvents.length}`);
    console.log('');

    console.log('Step 2: Processing transcript through Claude Haiku...');
    const startTime = Date.now();
    const extraction = await processor.processTranscript(video, transcript, campaignCode, timelineEvents);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Processing took ${elapsed}s`);
    console.log('');

    // Step 3: Show results
    console.log('=== EXTRACTION RESULTS ===');
    console.log(`\nCharacter Mentions (${extraction.characterMentions.length}):`);
    for (const m of extraction.characterMentions) {
        console.log(`  [${m.significance}] ${m.name}: ${m.context?.substring(0, 100)}`);
    }

    console.log(`\nEvents (${extraction.events.length}):`);
    for (const e of extraction.events.slice(0, 10)) {
        console.log(`  [${e.significance}] ${e.description?.substring(0, 100)}`);
        if (e.correlatedTimelineDate) console.log(`    -> Correlated: ${e.correlatedTimelineDate}`);
    }

    console.log(`\nDeaths (${extraction.deaths.length}):`);
    for (const d of extraction.deaths) {
        console.log(`  ${d.name}: ${d.description}`);
    }

    console.log(`\nAcquisitions (${extraction.acquisitions.length}):`);
    for (const a of extraction.acquisitions.slice(0, 10)) {
        console.log(`  ${a.character}: ${a.item}`);
    }

    console.log(`\nQuotes (${extraction.quotes.length}):`);
    for (const q of extraction.quotes.slice(0, 5)) {
        console.log(`  "${q.quote}" — ${q.speaker}`);
    }

    console.log(`\nKnowledge Facts (${extraction.knowledge.length}):`);
    for (const k of extraction.knowledge.slice(0, 10)) {
        console.log(`  - ${k}`);
    }

    console.log(`\nSummary:\n${extraction.summary}`);

    // Step 4: Save to vault (no Discord posting in test mode)
    console.log('\nStep 3: Saving to Obsidian vault...');
    await processor.saveToVault(video, extraction, campaignCode);
    console.log('  Done!');

    // Step 4: Update dossiers
    console.log('\nStep 4: Updating dossiers...');
    await processor.updateDossiers(extraction.characterMentions);
    console.log('  Done!');

    console.log('\n=== Test complete ===');
    process.exit(0);
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
