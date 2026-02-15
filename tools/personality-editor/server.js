/**
 * Local web app to view and edit Casandalee personality .md files.
 * Run: node tools/personality-editor/server.js
 * Open: http://localhost:3960
 * Saves go to data/personalities/; the bot watches that folder and reloads on change.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

// Use env for explicit path (Docker/local), else cwd-relative so "data/personalities" is same in container and host
const DATA_DIR = process.env.PERSONALITIES_DATA_DIR
    ? path.resolve(process.env.PERSONALITIES_DATA_DIR)
    : path.join(process.cwd(), 'data', 'personalities');
const PORT = parseInt(process.env.PERSONALITY_EDITOR_PORT, 10) || 3960;

/** Default Pathfinder 25-point buy (STR DEX CON WIS INT CHA) */
const DEFAULT_STATS = { str: 15, dex: 15, con: 14, wis: 12, int: 12, cha: 10 };

/**
 * Parse a personality .md file into structured data (mirrors personalityManager._parseMd)
 */
function parsePersonalityMd(content, filename) {
    content = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const data = {
        name: '',
        class: '',
        alignment: '',
        personality: '',
        speechStyle: '',
        tone: 'neutral',
        emojis: ['✨'],
        stats: null,
        memorySnippets: [],
        birthYear: null,
        timelineQuote: null  // Generated from timeline correlation (Ollama)
    };

    const nameMatch = content.match(/^# (?:Life \d+: |Goddess Form: )(.+)$/m);
    if (nameMatch) data.name = nameMatch[1].trim();

    const classMatch = content.match(/\*\*Class:\*\*\s*(.+)/);
    if (classMatch) data.class = classMatch[1].trim();

    const alignMatch = content.match(/\*\*Alignment:\*\*\s*(.+)/);
    if (alignMatch) data.alignment = alignMatch[1].trim();

    const birthYearMatch = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)|Birth Year:\s*(-?\d+)/i);
    if (birthYearMatch) {
        const y = parseInt(birthYearMatch[1] || birthYearMatch[2], 10);
        if (!isNaN(y)) data.birthYear = y;
    }

    const persMatch = content.match(/## Personality\n([\s\S]*?)(?=\n## |$)/);
    if (persMatch) data.personality = persMatch[1].trim();

    const speechMatch = content.match(/## Speech Style\n([\s\S]*?)(?=\n## |$)/);
    if (speechMatch) data.speechStyle = speechMatch[1].trim();

    const toneMatch = content.match(/## Tone\n(.+)/);
    if (toneMatch) data.tone = toneMatch[1].trim();

    const emojiMatch = content.match(/## Preferred Emojis\n(.+)/);
    if (emojiMatch) {
        data.emojis = emojiMatch[1].trim().split(/\s+/).filter(e => e.length > 0);
    }

    // Parse stats: lines like "- **STR:** 8" (colon can be inside or outside bold)
    const statsFound = {};
    const lineRe = /\*\*(STR|DEX|CON|WIS|INT|CHA)(?:\*\*:?|:\*\*)\s*(\d+)/i;
    content.split('\n').forEach(line => {
        const m = line.match(lineRe);
        if (m) statsFound[m[1].toUpperCase()] = parseInt(m[2], 10);
    });
    if (Object.keys(statsFound).length > 0) {
        data.stats = {
            str: statsFound.STR ?? 10, dex: statsFound.DEX ?? 10, con: statsFound.CON ?? 10,
            wis: statsFound.WIS ?? 10, int: statsFound.INT ?? 10, cha: statsFound.CHA ?? 10
        };
    }

    const snippetsSection = content.match(/## Memory Snippets\n([\s\S]*?)(?=\n## |$)/);
    if (snippetsSection) {
        const lines = snippetsSection[1].split(/\n/).map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
        if (lines.length) data.memorySnippets = lines;
    }

    const timelineQuoteSection = content.match(/## Timeline Quote\s*\n([\s\S]*?)(?=\n\s*## |$)/);
    if (timelineQuoteSection) {
        const q = timelineQuoteSection[1].trim();
        if (q.length) data.timelineQuote = q;
    }

    return data;
}

/**
 * Build .md content from form payload
 */
function buildPersonalityMd(payload) {
    const {
        name,
        class: cls,
        alignment,
        personality,
        speechStyle,
        tone,
        emojis,
        stats,
        memorySnippets,
        lifeNumber,
        type,
        birthYear,
        timelineQuote
    } = payload;

    const isGoddess = type === 'goddess' || (lifeNumber === 0 && !payload.lifeNumber);
    const title = isGoddess ? '# Goddess Form: Casandalee Ascended' : `# Life ${lifeNumber}: ${name || 'Unnamed'}`;

    const birthYearLine = !isGoddess && (birthYear !== undefined && birthYear !== null && birthYear !== '')
        ? `\n- **Birth Year:** ${birthYear}` : '';

    let md = `${title}

## Identity
- **Name:** ${name || 'Unnamed'}
- **Class:** ${cls || '—'}
- **Alignment:** ${alignment || '—'}
${!isGoddess ? `- **Life Number:** ${lifeNumber}` : '- **Form:** Ascended Goddess'}${birthYearLine}

## Personality
${personality || ''}

## Speech Style
${speechStyle || ''}

## Tone
${tone || 'neutral'}

## Preferred Emojis
${Array.isArray(emojis) ? emojis.join(' ') : (emojis || '✨')}
`;

    const s = stats || DEFAULT_STATS;
    if (s && typeof s === 'object') {
        md += `
## Stats
- **STR:** ${s.str ?? 10}
- **DEX:** ${s.dex ?? 10}
- **CON:** ${s.con ?? 10}
- **WIS:** ${s.wis ?? 10}
- **INT:** ${s.int ?? 10}
- **CHA:** ${s.cha ?? 10}
`;
    }

    const snippets = Array.isArray(memorySnippets) ? memorySnippets : (memorySnippets ? String(memorySnippets).split('\n').map(l => l.trim()).filter(Boolean) : []);
    md += `
## Memory Snippets
${snippets.length ? snippets.map(l => `- ${l}`).join('\n') : '- (Add memory lines for daily "Name (life#): ..." messages)'}
`;
    if (timelineQuote != null && String(timelineQuote).trim()) {
        md += `
## Timeline Quote
${String(timelineQuote).trim()}
`;
    }
    md += `
## Flavor Notes
- When this personality is active, subtly incorporate their speaking style.
- Do NOT explicitly state which personality is speaking.
`;
    return md;
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** GET /api/config — so the portal can show which folder is used (confirm correct docs) */
app.get('/api/config', (req, res) => {
    let fileCount = 0;
    try {
        if (fs.existsSync(DATA_DIR)) fileCount = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md')).length;
    } catch (_) { /* ignore */ }
    res.json({ dataDir: DATA_DIR, fileCount });
});

/** GET /api/personalities — list all */
app.get('/api/personalities', (req, res) => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md')).sort();
        const list = files.map(filename => {
            const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
            const parsed = parsePersonalityMd(content, filename);
            const lifeNum = filename.startsWith('00_') ? 0 : parseInt(filename.split('_')[0], 10);
            return {
                filename,
                lifeNumber: isNaN(lifeNum) ? null : lifeNum,
                name: parsed.name || filename,
                class: parsed.class,
                alignment: parsed.alignment
            };
        });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/personalities/:filename — get one (filename can be URL-encoded) */
app.get('/api/personalities/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        if (!filename.endsWith('.md') || filename.includes('..')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Not found' });
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = parsePersonalityMd(content, filename);
        const lifeNum = filename.startsWith('00_') ? 0 : parseInt(filename.split('_')[0], 10);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.json({
            filename,
            lifeNumber: isNaN(lifeNum) ? null : lifeNum,
            type: lifeNum === 0 ? 'goddess' : 'past_life',
            ...parsed
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** PUT /api/personalities/:filename — save one */
app.put('/api/personalities/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        if (!filename.endsWith('.md') || filename.includes('..')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        const filePath = path.join(DATA_DIR, filename);
        const md = buildPersonalityMd(req.body);
        fs.writeFileSync(filePath, md, 'utf8');
        res.json({ ok: true, filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/personalities — create new (body: { lifeNumber, name, class, alignment?, ... }) */
app.post('/api/personalities', (req, res) => {
    try {
        const lifeNumber = parseInt(req.body.lifeNumber, 10);
        if (isNaN(lifeNumber) || lifeNumber < 1 || lifeNumber > 72) {
            return res.status(400).json({ error: 'lifeNumber must be 1–72' });
        }
        const name = (req.body.name || 'New Life').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeName = name.toLowerCase() || 'newlife';
        const filename = `${String(lifeNumber).padStart(2, '0')}_${safeName}.md`;
        const filePath = path.join(DATA_DIR, filename);
        if (fs.existsSync(filePath)) {
            return res.status(409).json({ error: 'File already exists', filename });
        }
        const payload = {
            ...req.body,
            lifeNumber,
            type: 'past_life',
            stats: req.body.stats || DEFAULT_STATS,
            memorySnippets: req.body.memorySnippets || []
        };
        const md = buildPersonalityMd(payload);
        fs.writeFileSync(filePath, md, 'utf8');
        res.status(201).json({ ok: true, filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Personality editor: http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
});
