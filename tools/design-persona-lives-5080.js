#!/usr/bin/env node
/**
 * Design the 70 middle lives (2–71) using Ollama (5080): birth/death, major events,
 * timeline quote, and one-liners that fit each life's era and personality.
 * Uses Golarion timeline + vision doc as context. No deadline; run overnight if needed.
 *
 * Usage: node tools/design-persona-lives-5080.js [--dry-run] [--resume] [--life N] [--batch N]
 *   --dry-run   Log prompts and parsing only; no Ollama calls or file writes
 *   --resume    Skip lives that already have a "## Era / Major Events" section (or --no-overwrite-quote)
 *   --life N    Only process life N (2–71)
 *   --batch N   Process N lives per run then exit (default: all)
 *
 * Requires: OLLAMA_URL (default http://localhost:5080), OLLAMA_MODEL_FAST or similar.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const TIMELINE_CSV = path.join(__dirname, '..', 'pf_folkengames_timeline.csv');
const VISION_MD = path.join(__dirname, '..', 'docs', 'persona-lives-vision.md');
const IRON_GODS_MD = path.join(__dirname, '..', 'iron-gods-timeline.md');
const DELAY_MS = 45 * 1000;
const OLLAMA_TIMEOUT_MS = 600000;
const MAX_RETRIES = 2;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');
const LIFE_ONLY = (() => { const i = args.indexOf('--life'); return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : null; })();
const BATCH = (() => { const i = args.indexOf('--batch'); return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : null; })();

/** Parse year from CSV date (e.g. "-1,293.00", "0499.00.00", "4221.06.18") */
function parseTimelineYear(s) {
    if (s == null || s === '') return null;
    const cleaned = String(s).replace(/,/g, '').trim();
    const match = cleaned.match(/^(-?\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/** Load timeline events from CSV; return array of { year, location, description } */
function loadTimelineCsv() {
    if (!fs.existsSync(TIMELINE_CSV)) return [];
    const text = fs.readFileSync(TIMELINE_CSV, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter(l => l.trim());
    const out = [];
    const header = lines[0].toLowerCase();
    const dateIdx = header.includes('date') ? 0 : -1;
    const locIdx = header.includes('location') ? 1 : -1;
    const descIdx = header.includes('description') ? 3 : 2;
    for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        const year = dateIdx >= 0 ? parseTimelineYear(row[dateIdx]) : null;
        if (year == null || isNaN(year)) continue;
        const location = (locIdx >= 0 && row[locIdx]) ? row[locIdx].trim() : '';
        const description = (descIdx < row.length && row[descIdx]) ? row[descIdx].trim() : '';
        out.push({ year, location, description });
    }
    return out.sort((a, b) => a.year - b.year);
}

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQuotes = !inQuotes; continue; }
        if (!inQuotes && c === ',') { out.push(cur); cur = ''; continue; }
        cur += c;
    }
    out.push(cur);
    return out;
}

/** Events in [fromYear, toYear] with a small margin */
function eventsInWindow(events, fromYear, toYear, margin = 80) {
    const lo = fromYear - margin;
    const hi = toYear + margin;
    return events.filter(e => e.year >= lo && e.year <= hi);
}

function loadVisionContext() {
    let s = '';
    if (fs.existsSync(VISION_MD)) s += fs.readFileSync(VISION_MD, 'utf8') + '\n\n';
    if (fs.existsSync(IRON_GODS_MD)) s += fs.readFileSync(IRON_GODS_MD, 'utf8').slice(0, 4000) + '\n\n';
    return s;
}

function parsePersonalityFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const name = content.match(/^# Life \d+: (.+)$/m)?.[1]?.trim() || '';
    const lifeNum = content.match(/\*\*Life Number:\*\*\s*(\d+)/i)?.[1];
    const birthYear = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)/i)?.[1];
    const deathYear = content.match(/\*\*Death Year:\*\*\s*(-?\d+)/i)?.[1];
    const cls = content.match(/\*\*Class:\*\*\s*(.+)/)?.[1]?.trim() || '';
    const personalityBlock = content.match(/## Personality\s*\n([\s\S]*?)(?=\n## |$)/);
    const personality = personalityBlock ? personalityBlock[1].trim() : '';
    const hasEraSection = /## Era \/ Major Events/i.test(content);
    return {
        name,
        lifeNumber: lifeNum ? parseInt(lifeNum, 10) : null,
        birthYear: birthYear ? parseInt(birthYear, 10) : null,
        deathYear: deathYear ? parseInt(deathYear, 10) : null,
        class: cls,
        personality,
        content,
        filePath,
        hasEraSection,
    };
}

async function ollamaGenerate(prompt, system, options = {}) {
    const url = (process.env.OLLAMA_URL || 'http://localhost:5080').replace(/\/$/, '');
    const model = options.model || process.env.OLLAMA_MODEL_FAST || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    const body = {
        model,
        prompt: system ? `${system}\n\n${prompt}` : prompt,
        stream: false,
        options: {
            num_predict: options.maxTokens ?? 1024,
            temperature: options.temperature ?? 0.5,
        },
    };
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), options.timeout || OLLAMA_TIMEOUT_MS);
    try {
        const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
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

/** Variety hints for the 70 lives (cycle so we get a good spread) */
const VARIETY_HINTS = [
    'This life traveled widely; reference places or journeys.',
    'This life was dangerous or violent; they saw or did hard things.',
    'This life was relatively safe and quiet; subtle, anonymous.',
    'This life observed or was close to major world events (wars, founding of nations, ascensions).',
    'This life was semi-famous or left a mark others remember.',
    'This life stayed in one region; deep local knowledge.',
    'This life dealt with technology or ruins (Numeria, Silver Mount, Kellid taboo).',
    'This life was a wanderer or outsider looking in.',
];

/** Voice and tone: personas vary — some succinct, some wordy; some happy, some reserved; some serious, some unconcerned with stress. */
const VOICE_HINTS = [
    'Voice: succinct and terse; short sentences, few words.',
    'Voice: more wordy and reflective; longer, flowing sentences.',
    'Voice: happy or light; warmth, humor, or optimism in the quote and one-liners.',
    'Voice: reserved and understated; quiet, measured, holding back.',
    'Voice: very serious; grave, weighty, no levity.',
    'Voice: unconcerned with stress; casual, breezy, or dismissive of danger.',
    'Voice: mix of warmth and brevity; kind but not verbose.',
    'Voice: mix of serious and dry; no-nonsense but not grim.',
];

function getVarietyHint(lifeIndex) {
    return VARIETY_HINTS[lifeIndex % VARIETY_HINTS.length];
}

function getVoiceHint(lifeIndex) {
    return VOICE_HINTS[lifeIndex % VOICE_HINTS.length];
}

/** Parse structured output from the model */
function parseStructuredOutput(raw) {
    const out = { birthYear: null, deathYear: null, majorEvents: '', timelineQuote: '', oneLiners: [] };
    const lines = raw.split('\n').map(l => l.trim());
    let section = null;
    let oneLinerBuf = [];
    for (const line of lines) {
        if (/^BIRTH_YEAR:\s*(-?\d+)/i.test(line)) {
            out.birthYear = parseInt(line.replace(/^BIRTH_YEAR:\s*(-?\d+).*$/i, '$1'), 10);
            continue;
        }
        if (/^DEATH_YEAR:\s*(-?\d+)/i.test(line)) {
            out.deathYear = parseInt(line.replace(/^DEATH_YEAR:\s*(-?\d+).*$/i, '$1'), 10);
            continue;
        }
        if (/^MAJOR_EVENTS?:/i.test(line)) {
            section = 'events';
            out.majorEvents = line.replace(/^MAJOR_EVENTS?:\s*/i, '').trim();
            continue;
        }
        if (/^TIMELINE_QUOTE:\s*/i.test(line)) {
            section = 'quote';
            out.timelineQuote = line.replace(/^TIMELINE_QUOTE:\s*/i, '').replace(/^["']|["']$/g, '').trim();
            continue;
        }
        if (/^ONE[-_]?LINERS?:/i.test(line)) {
            section = 'liners';
            oneLinerBuf = [];
            const rest = line.replace(/^ONE[-_]?LINERS?:\s*/i, '').trim();
            if (rest) oneLinerBuf.push(rest.replace(/^[-*]\s*/, ''));
            continue;
        }
        if (section === 'events' && line) out.majorEvents += (out.majorEvents ? ' ' : '') + line;
        if (section === 'quote' && line && !/^ONE[-_]?LINERS?/i.test(line)) out.timelineQuote += (out.timelineQuote ? ' ' : '') + line;
        if (section === 'liners' && line) {
            const t = line.replace(/^[-*]\s*/, '').trim();
            if (t && t.length > 5) oneLinerBuf.push(t);
        }
    }
    out.oneLiners = oneLinerBuf.filter(l => l.length > 3 && l.length < 300);
    return out;
}

/** Apply parsed design to persona file content */
function applyDesign(content, lifeNum, parsed, name) {
    let c = content;

    if (parsed.birthYear != null && !isNaN(parsed.birthYear)) {
        c = c.replace(/\*\*Birth Year:\*\*\s*-?\d+/i, `**Birth Year:** ${parsed.birthYear}`);
    }
    if (parsed.deathYear != null && !isNaN(parsed.deathYear)) {
        if (/\*\*Death Year:\*\*\s*-?\d+/i.test(c)) {
            c = c.replace(/\*\*Death Year:\*\*\s*-?\d+/i, `**Death Year:** ${parsed.deathYear}`);
        } else {
            c = c.replace(/(\*\*Birth Year:\*\*\s*-?\d+)(\s*\n)/i, `$1\n- **Death Year:** ${parsed.deathYear}$2`);
        }
    }

    if (parsed.majorEvents && parsed.majorEvents.trim()) {
        const eraBlock = `\n## Era / Major Events\n${parsed.majorEvents.trim()}\n`;
        if (/## Era \/ Major Events/i.test(c)) {
            c = c.replace(/## Era \/ Major Events\s*\n[\s\S]*?(\n(?=## )|$)/i, eraBlock + '\n');
        } else if (c.includes('## Memory Snippets')) {
            c = c.replace(/(\n## Memory Snippets)/, eraBlock + '$1');
        } else if (c.includes('## Timeline Quote')) {
            c = c.replace(/(\n## Timeline Quote)/, eraBlock + '$1');
        } else if (c.includes('## Flavor Notes')) {
            c = c.replace(/(\n## Flavor Notes)/, eraBlock + '$1');
        } else {
            c = c.replace(/(\n## Stats)/, eraBlock + '$1');
        }
    }

    if (parsed.timelineQuote && parsed.timelineQuote.trim()) {
        const quote = parsed.timelineQuote.trim().replace(/^["']|["']$/g, '');
        if (/## Timeline Quote\s*\n/.test(c)) {
            c = c.replace(/## Timeline Quote\s*\n[\s\S]*?(\n(?=## )|$)/m, `## Timeline Quote\n${quote}\n$1`);
        } else if (c.includes('## Memory Snippets')) {
            c = c.replace(/(\n## Memory Snippets)/, `\n## Timeline Quote\n${quote}\n$1`);
        } else if (c.includes('## Flavor Notes')) {
            c = c.replace(/(\n## Flavor Notes)/, `\n## Timeline Quote\n${quote}\n$1`);
        } else {
            c = c.replace(/(\n## Stats)/, `\n## Timeline Quote\n${quote}\n$1`);
        }
    }

    if (parsed.oneLiners && parsed.oneLiners.length > 0) {
        const block = '## One-Liners\n' + parsed.oneLiners.map(l => `- ${l.replace(/^[-*]\s*/, '').trim()}`).join('\n') + '\n';
        if (c.includes('## One-Liners')) {
            c = c.replace(/## One-Liners\s*\n[\s\S]*?(\n(?=## )|$)/, block + '\n');
        } else if (c.includes('## Flavor Notes')) {
            c = c.replace(/(\n## Flavor Notes)/, '\n' + block.trim() + '\n$1');
        } else if (c.includes('## Memory Snippets')) {
            c = c.replace(/(\n## Memory Snippets)/, '\n' + block.trim() + '\n$1');
        } else {
            c = c.trimEnd() + '\n\n' + block.trim() + '\n';
        }
    }

    return c;
}

function buildPromptForLife(life, eventsInRange, visionContext, slotStart, slotEnd) {
    const eventList = eventsInRange.slice(0, 35).map(e => `  ${e.year} (${e.location || '?'}): ${e.description.slice(0, 120)}${e.description.length > 120 ? '...' : ''}`).join('\n');
    const variety = getVarietyHint(life.lifeNumber - 2);
    const voice = getVoiceHint(life.lifeNumber - 2);

    const user = `
You are designing one of 70 past lives of an android on Golarion (Pathfinder). Life number ${life.lifeNumber}: **${life.name}**, ${life.class}.
Current slot (you may keep or adjust within bounds): birth ${life.birthYear}, death ${life.deathYear}. Slot must stay between ${slotStart} and ${slotEnd} (no overlap with other lives).

Golarion events in or near this life's window:
${eventList || '  (none in CSV for this window)'}

Variety: ${variety}
Voice/tone: ${voice} Write the timeline quote and one-liners in this style.

Personality summary: ${life.personality.slice(0, 400)}${life.personality.length > 400 ? '...' : ''}

Output exactly in this format (no extra preamble):

BIRTH_YEAR: <integer>
DEATH_YEAR: <integer>
MAJOR_EVENTS: <1–3 sentences: key world or regional events during this life's time that they witnessed or were affected by>
TIMELINE_QUOTE: "<one first-person sentence or two, as this person would say it, hinting at their life/era/personality>"
ONE_LINERS:
- <short first-person line 1>
- <short first-person line 2>
- <short first-person line 3>
- <optional 4–5 more>
`.trim();

    const system = `You are an expert on Golarion (Pathfinder) history and the Iron Gods setting. ${visionContext.slice(0, 2500)}

Your task: design birth/death, major events during this life's time, one timeline quote, and 3–5 one-liners. All must fit the life's time window and personality. Quote and one-liners must be first person, in character, and hint at their life, personality, or world events. Output only the requested format.`;

    return { system, user };
}

async function main() {
    const markerPath = path.join(__dirname, '..', '.design-persona-lives-complete');
    if (fs.existsSync(markerPath)) try { fs.unlinkSync(markerPath); } catch (_) {}

    console.log('Design persona lives (2–71) — Ollama 5080, timeline + vision context');
    console.log('When finished, a completion marker will be written to .design-persona-lives-complete in the repo root.');
    console.log('Options:', { DRY_RUN, RESUME, LIFE_ONLY, BATCH: BATCH ?? 'all' });

    const timelineEvents = loadTimelineCsv();
    const visionContext = loadVisionContext();
    console.log(`Timeline events loaded: ${timelineEvents.length}; vision context: ${visionContext.length} chars`);

    const files = fs.readdirSync(PERSONALITY_DIR)
        .filter(f => f.endsWith('.md') && /^\d{2}_/.test(f))
        .sort();
    const allPersonas = files.map(f => ({
        file: f,
        filePath: path.join(PERSONALITY_DIR, f),
        ...parsePersonalityFile(path.join(PERSONALITY_DIR, f)),
    })).filter(p => p.lifeNumber != null && p.birthYear != null);

    const byLife = new Map(allPersonas.map(p => [p.lifeNumber, p]));
    const livesToProcess = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]
        .filter(n => LIFE_ONLY == null || n === LIFE_ONLY)
        .filter(n => byLife.has(n))
        .filter(n => !RESUME || !byLife.get(n).hasEraSection);

    if (BATCH != null) {
        livesToProcess.splice(BATCH);
    }
    if (livesToProcess.length === 0) {
        console.log('No lives to process (--resume may have skipped all, or --life N not in 2–71).');
        return;
    }

    console.log(`Lives to process: ${livesToProcess.length} (${livesToProcess.join(', ')})`);

    let done = 0;
    for (const num of livesToProcess) {
        const p = byLife.get(num);
        const prevEnd = num === 2 ? -4363 : (byLife.get(num - 1).deathYear ?? p.birthYear + 80);
        const nextStart = num === 71 ? 3983 : (byLife.get(num + 1).birthYear ?? 3983);
        const slotStart = prevEnd + 1;
        const slotEnd = nextStart - 1;
        const eventsInRange = eventsInWindow(timelineEvents, p.birthYear, p.deathYear ?? p.birthYear + 80);

        const { system, user } = buildPromptForLife(p, eventsInRange, visionContext, slotStart, slotEnd);

        if (DRY_RUN) {
            console.log(`\n--- Life ${num} ${p.name} ---\n${user.slice(0, 800)}...`);
            continue;
        }

        let raw = '';
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                raw = await ollamaGenerate(user, system, { maxTokens: 800, timeout: OLLAMA_TIMEOUT_MS });
                const parsed = parseStructuredOutput(raw);
                if ((parsed.birthYear != null || parsed.timelineQuote) && (parsed.timelineQuote || parsed.oneLiners.length >= 2)) {
                    const newContent = applyDesign(p.content, num, parsed, p.name);
                    fs.writeFileSync(p.filePath, newContent, 'utf8');
                    if (parsed.birthYear != null) p.birthYear = parsed.birthYear;
                    if (parsed.deathYear != null) p.deathYear = parsed.deathYear;
                    p.content = newContent;
                    done++;
                    console.log(`[${done}] Life ${num} ${p.name} — birth ${parsed.birthYear ?? p.birthYear}, death ${parsed.deathYear ?? p.deathYear}, quote + ${parsed.oneLiners.length} lines`);
                    break;
                }
            } catch (err) {
                console.warn(`  Life ${num} attempt ${attempt} failed:`, err.message);
                if (attempt <= MAX_RETRIES) await sleep(15000);
            }
        }
        if (done < livesToProcess.length) await sleep(DELAY_MS);
    }

    console.log(`\nDone. Designed ${done} lives. Run again with --resume to continue, or re-run continuity/fix if birth/death changed.`);
    try {
        fs.writeFileSync(markerPath, JSON.stringify({ completedAt: new Date().toISOString(), designed: done }, null, 2), 'utf8');
        console.log(`Completion marker written to .design-persona-lives-complete`);
    } catch (_) {}
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
