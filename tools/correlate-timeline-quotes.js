#!/usr/bin/env node
/**
 * Correlate timeline events to each of Cass's 72 lives and generate one in-character
 * quote per life using the secondary LLM (Ollama on RTX 5080). Safe to run for hours;
 * processes one life at a time with delays and retries.
 *
 * Usage: node tools/correlate-timeline-quotes.js [--dry-run]
 *   --dry-run  Load data and log what would be done, do not call Ollama or write files
 * Lives that already have a real ## Timeline Quote are skipped (never overwritten).
 * A quote that is only the fallback "(I remember the years X to Y.)" is treated as missing so a real one can be generated.
 *
 * Requires: OLLAMA_URL (default http://localhost:5080), timeline CSV or Google Sheets
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const CSV_PATH = path.join(__dirname, '..', 'pf_folkengames_timeline.csv');
const LIFESPAN_YEARS = 80;
const DELAY_MS = 60 * 1000;
const OLLAMA_TIMEOUT_MS = 300000;  // 5 min — 5080 is free, we're not in a rush
const MAX_RETRIES = 2;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;

function parseDate(dateStr) {
    if (!dateStr) return 0;
    const clean = String(dateStr).replace(/"/g, '').replace(/,/g, '').trim();
    if (clean.includes('.')) {
        const yearPart = clean.split('.')[0];
        return parseFloat(yearPart) || 0;
    }
    return parseFloat(clean) || 0;
}

function parseCSVLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQ = !inQ;
        else if (c === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
        else cur += c;
    }
    out.push(cur.trim());
    return out;
}

function loadTimelineFromCSV() {
    const timeline = [];
    if (!fs.existsSync(CSV_PATH)) return timeline;
    const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = parseCSVLine(line);
        if (parts.length < 4) continue;
        const date = parts[0].replace(/^"|"$/g, '').trim();
        const location = (parts[1] || '').replace(/^"|"$/g, '').trim();
        const ap = (parts[2] || '').replace(/^"|"$/g, '').trim();
        const description = (parts[3] || '').replace(/^"|"$/g, '').trim();
        const year = parseDate(date);
        if (isNaN(year)) continue;
        timeline.push({ date, location, ap, description, parsedDate: year });
    }
    return timeline.sort((a, b) => a.parsedDate - b.parsedDate);
}

async function loadTimelineFromSheets() {
    try {
        const { google } = require('googleapis');
        const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_SHEETS_API_KEY });
        const range = process.env.GOOGLE_SHEETS_TIMELINE_RANGE || 'Sheet1!A1:D800';
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
            range
        });
        const rows = res.data.values || [];
        const startRow = rows[0] && String(rows[0][0]).toLowerCase().includes('date') ? 1 : 0;
        const timeline = [];
        for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 4 || !row[0]) continue;
            const year = parseDate(row[0]);
            if (isNaN(year)) continue;
            timeline.push({
                date: row[0] || '',
                location: row[1] || '',
                ap: row[2] || '',
                description: row[3] || '',
                parsedDate: year
            });
        }
        return timeline.sort((a, b) => a.parsedDate - b.parsedDate);
    } catch (e) {
        console.warn('Google Sheets load failed:', e.message);
        return [];
    }
}

function eventsInRange(timeline, startYear, endYear) {
    return timeline.filter(e => e.parsedDate >= startYear && e.parsedDate <= endYear);
}

/** Fallback written when Ollama fails; treat as "no quote" so we regenerate. */
const FALLBACK_QUOTE_PATTERN = /^\s*\(I remember the years -?\d+ to -?\d+\.\)\s*$/;

/**
 * Returns true if the given quote body is the generic fallback (not a real in-character quote).
 * @param {string} quoteContent - Trimmed content of the ## Timeline Quote section
 * @returns {boolean}
 */
function isFallbackQuote(quoteContent) {
    if (!quoteContent || typeof quoteContent !== 'string') return true;
    return FALLBACK_QUOTE_PATTERN.test(quoteContent.trim());
}

function parsePersonalityFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const name = content.match(/^# Life \d+: (.+)$/m)?.[1]?.trim() || '';
    const cls = content.match(/\*\*Class:\*\*\s*(.+)/)?.[1]?.trim() || '';
    const alignment = content.match(/\*\*Alignment:\*\*\s*(.+)/i)?.[1]?.trim() || '';
    const birthYearMatch = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)/i);
    const birthYear = birthYearMatch ? parseInt(birthYearMatch[1], 10) : null;
    const timelineQuoteMatch = content.match(/## Timeline Quote\s*\n([\s\S]*?)(?=\n\s*## |$)/);
    const quoteContent = timelineQuoteMatch ? timelineQuoteMatch[1].trim() : '';
    const isFallback = quoteContent.length > 0 && isFallbackQuote(quoteContent);
    const hasTimelineQuote = quoteContent.length > 0 && !isFallback;
    const personalityBlock = content.match(/## Personality\s*\n([\s\S]*?)(?=\n## |$)/);
    const personality = personalityBlock ? personalityBlock[1].trim() : '';
    const speechBlock = content.match(/## Speech Style\s*\n([\s\S]*?)(?=\n## |$)/);
    const speechStyle = speechBlock ? speechBlock[1].trim() : '';
    const toneMatch = content.match(/## Tone\s*\n([^\n]+)/);
    const tone = toneMatch ? toneMatch[1].trim() : '';
    return { name, class: cls, alignment, birthYear, hasTimelineQuote, hadFallbackQuote: isFallback, personality, speechStyle, tone };
}

function setOrReplaceTimelineQuote(content, quote) {
    const block = `## Timeline Quote\n${quote.trim()}\n`;
    if (content.includes('## Timeline Quote')) {
        return content.replace(/## Timeline Quote\s*\n[\s\S]*?(\n(?=## )|$)/, block + '\n');
    }
    if (content.includes('## Memory Snippets')) {
        return content.replace(/(\n## Memory Snippets)/, '\n' + block.trim() + '\n$1');
    }
    if (content.includes('## Flavor Notes')) {
        return content.replace(/(\n## Flavor Notes)/, '\n' + block.trim() + '\n$1');
    }
    return content.trimEnd() + '\n\n' + block.trim() + '\n';
}

async function ollamaGenerate(prompt, system, options = {}) {
    const url = (process.env.OLLAMA_URL || 'http://localhost:5080').replace(/\/$/, '');
    const model = options.model || process.env.OLLAMA_MODEL_FAST || 'qwen2.5:7b';
    const body = {
        model,
        prompt: system ? `${system}\n\n${prompt}` : prompt,
        stream: false,
        options: {
            num_predict: options.maxTokens ?? 1024,
            temperature: options.temperature ?? 0.5
        }
    };
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), options.timeout || OLLAMA_TIMEOUT_MS);
    try {
        const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(to);
        if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.response || '').trim();
    } finally {
        clearTimeout(to);
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('Correlate timeline quotes — Ollama (5080), stable batch run');
    console.log('Options:', { DRY_RUN, DELAY_MS: DELAY_MS / 1000 + 's', limit: LIMIT ?? 'none' });

    let timeline = await loadTimelineFromSheets();
    if (timeline.length === 0) {
        timeline = loadTimelineFromCSV();
        console.log(`Timeline from CSV: ${timeline.length} events`);
    } else {
        console.log(`Timeline from Google Sheets: ${timeline.length} events`);
    }
    if (timeline.length === 0) {
        console.error('No timeline data. Set GOOGLE_* or ensure pf_folkengames_timeline.csv exists.');
        process.exit(1);
    }

    const files = fs.readdirSync(PERSONALITY_DIR)
        .filter(f => f.endsWith('.md') && /^\d{2}_/.test(f) && !f.startsWith('00_'))
        .sort();
    const lives = files.map(f => {
        const filePath = path.join(PERSONALITY_DIR, f);
        const p = parsePersonalityFile(filePath);
        return { file: f, filePath, ...p };
    }).filter(l => l.birthYear != null);

    console.log(`Personalities with birth year: ${lives.length}`);

    let done = 0;
    for (const life of lives) {
        if (life.hasTimelineQuote) {
            console.log(`[SKIP] ${life.file} (already has Timeline Quote — not overwriting)`);
            continue;
        }

        if (life.hadFallbackQuote) {
            console.log(`[REPLACE] ${life.file} had fallback quote — generating real one`);
        }

        const startYear = life.birthYear;
        const endYear = life.birthYear + LIFESPAN_YEARS;
        const events = eventsInRange(timeline, startYear, endYear);

        const eventBlurb = events.length === 0
            ? `No specific events in range ${startYear}-${endYear}. Write one short generic in-character line about her time as ${life.name} (${life.class}).`
            : events.slice(0, 25).map(e => `- ${e.date} (${e.location}): ${e.description}`).join('\n');

        const personaBlurb = [
            life.personality && `Personality & worldview: ${life.personality}`,
            life.speechStyle && `Speech style: ${life.speechStyle}`,
            life.tone && `Tone: ${life.tone}`,
            life.alignment && `Alignment: ${life.alignment}`
        ].filter(Boolean).join('\n');

        const prompt = events.length === 0
            ? `Life: ${life.name}, ${life.class}, born ${life.birthYear} AR (${startYear}-${endYear}).\n\n${personaBlurb}\n\nWrite one short in-character quote (1-2 sentences) as ${life.name} would recall this period. Output only the quote.`
            : `Life: ${life.name}, ${life.class}, born ${life.birthYear} AR. Events during her lifetime (${startYear}-${endYear}):\n\n${personaBlurb}\n\nTimeline events:\n${eventBlurb}\n\nConsider this persona's attitudes and how they would view these events. Choose 1 or 2 events that they would find relevant or meaningful. Write a single in-character comment (1-2 sentences) as ${life.name} would say it—first person, in their voice, commenting on what mattered to them. Output only the quote, no preamble or attribution.`;

        const sys = `You are writing a single in-character memory quote for an android who lived as "${life.name}" in a past life in the Pathfinder world. Use the persona's personality, attitudes, and speech style so the quote sounds like them. The quote must be first person, 1-2 sentences, commenting on timeline events they would find relevant. No preamble—output only the in-character quote.`;

        if (DRY_RUN) {
            console.log(`[DRY] ${life.file} ${life.name}: ${events.length} events → would call Ollama`);
            continue;
        }

        let quote = '';
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                quote = await ollamaGenerate(prompt, sys, { maxTokens: 1024, timeout: OLLAMA_TIMEOUT_MS });
                if (quote && quote.length > 10) break;
            } catch (err) {
                console.warn(`  ${life.file} attempt ${attempt} failed:`, err.message);
                if (attempt <= MAX_RETRIES) await sleep(10000);
                else quote = `(I remember the years ${startYear} to ${endYear}.)`;
            }
        }
        if (!quote || quote.length < 5) quote = `(I remember the years ${startYear} to ${endYear}.)`;

        const content = fs.readFileSync(life.filePath, 'utf8');
        const newContent = setOrReplaceTimelineQuote(content, quote);
        fs.writeFileSync(life.filePath, newContent, 'utf8');
        done++;
        console.log(`[${done}] ${life.file} ${life.name} — ${quote.substring(0, 60)}...`);

        if (LIMIT != null && done >= LIMIT) {
            console.log(`Stopping after ${LIMIT} lives (--limit).`);
            break;
        }
        if (done < lives.length) await sleep(DELAY_MS);
    }

    console.log(`\nDone. Processed ${done} lives.`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
