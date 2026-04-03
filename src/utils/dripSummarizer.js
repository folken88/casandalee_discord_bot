/**
 * Drip Summarizer — processes 2 unsummarized transcripts per day
 * Runs on a schedule to avoid burning through API budget all at once.
 * Automatically stops when all transcripts are summarized.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const SESSIONS_DIR = path.join(__dirname, '../../obsidian_cass/cassvault/Sessions');
const SUMMARIES_DIR = path.join(__dirname, '../../obsidian_cass/cassvault/Session Summaries');
const STATE_PATH = path.join(__dirname, '../../data/cache/summary-state.json');
const BATCH_SIZE = 5; // transcripts per run

class DripSummarizer {
    constructor() {
        this.timer = null;
    }

    /**
     * Start the daily drip schedule.
     * Always schedules the 24h interval — the YouTube scraper may add new
     * transcripts at any time, so we must keep checking even after catching up.
     */
    start() {
        const state = this._loadState();
        const allTranscripts = this._getAllTranscripts();
        const remaining = allTranscripts.filter(t => !state.summarized.includes(t));

        // First run after 5 minutes (let everything else initialize)
        setTimeout(() => {
            this._run();
            // Then every 24 hours — always, so we catch newly scraped transcripts
            this.timer = setInterval(() => this._run(), 24 * 60 * 60 * 1000);
        }, 5 * 60 * 1000);

        if (remaining.length === 0) {
            logger.info('✅ Drip summarizer scheduled (watching for new transcripts, none pending)');
        } else {
            logger.info(`✅ Drip summarizer scheduled (${BATCH_SIZE}/day, ${remaining.length} remaining)`);
        }
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    async _run() {
        try {
            // Check how many are left
            const state = this._loadState();
            const allTranscripts = this._getAllTranscripts();
            const remaining = allTranscripts.filter(t => !state.summarized.includes(t));

            if (remaining.length === 0) {
                logger.info('Drip summarizer: all transcripts summarized, nothing to do');
                return;
            }

            logger.info(`Drip summarizer: ${remaining.length} transcripts remaining, processing ${Math.min(BATCH_SIZE, remaining.length)}`);

            // Shell out to the bulk summarizer tool with a limit
            const { execFile } = require('child_process');
            const { promisify } = require('util');
            const execFileAsync = promisify(execFile);

            const toolPath = path.join(__dirname, '../../tools/bulk-summarize-transcripts.js');
            const { stdout, stderr } = await execFileAsync('node', [toolPath, '--limit', String(BATCH_SIZE)], {
                timeout: 5 * 60 * 1000, // 5 minute timeout
                maxBuffer: 1024 * 1024,
                env: { ...process.env }
            });

            logger.info(`Drip summarizer completed:\n${stdout.split('\n').slice(-8).join('\n')}`);
            if (stderr) logger.warn(`Drip summarizer stderr: ${stderr.substring(0, 200)}`);

        } catch (err) {
            // If it's a budget error, just log and wait for tomorrow
            if (err.message?.includes('usage limits') || err.stdout?.includes('usage limits')) {
                logger.warn('Drip summarizer: API budget limit reached, will retry tomorrow');
            } else {
                logger.error('Drip summarizer error:', err.message);
            }
        }
    }

    _loadState() {
        try {
            if (fs.existsSync(STATE_PATH)) {
                return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
            }
        } catch {}
        return { summarized: [], errors: [] };
    }

    _getAllTranscripts() {
        const files = [];
        if (!fs.existsSync(SESSIONS_DIR)) return files;

        const campaigns = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());

        for (const campaign of campaigns) {
            const campaignDir = path.join(SESSIONS_DIR, campaign.name);
            const mds = fs.readdirSync(campaignDir).filter(f => f.endsWith('.md'));
            files.push(...mds);
        }
        return files;
    }
}

module.exports = new DripSummarizer();
