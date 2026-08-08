/**
 * Cross-reference retrieval — Cass's connective tissue.
 *
 * Builds conversation context by following the graph, not just matching words:
 *   HOP 1 — for each resolved entity: its dossier note (character/item/place),
 *           every timeline event mentioning it (date-sorted — a coherent arc,
 *           not a score-shuffled pile), and top session-summary matches.
 *   DISCOVER — collect NEW names surfaced by hop 1 (wiki-links from dossiers +
 *           proper nouns recurring in the arc) that weren't asked about.
 *   HOP 2 — pull those discovered entities' dossiers and key events too, so
 *           "who killed X" surfaces the killer's own record, "what happened to
 *           the artifacts" surfaces where they ended up, an item question
 *           surfaces its wielder, and so on.
 *
 * All sections are GM-secret filtered (vaultSearch._isGmSecret) and GM PLAN
 * timeline rows are excluded. Output is typed, labeled sections the voice
 * rules treat as ground truth.
 */

const vaultSearch = require('./vaultSearch');
const timelineSearch = require('./timelineSearch');
const logger = require('./logger');

const norm = s => String(s || '').toLowerCase().replace(/[-–—]/g, '');

/** Numeric sort key from a "YYYY.MM.DD"-ish date string. */
function dateKey(d) {
    const m = String(d || '').match(/^(-?\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 10000 + (parseInt(m[2] || '0', 10) * 100) + parseInt(m[3] || '0', 10);
}

/** Timeline events mentioning any of the entities, date-sorted. */
function eventsFor(entities, cap) {
    const all = timelineSearch.timeline || [];
    const needles = entities.map(norm).filter(n => n.length > 2);
    if (needles.length === 0) return [];
    const hits = all.filter(ev => {
        if (!ev || !ev.description) return false;
        if (/^\s*(PLAN|TODO|GM)\s*:/i.test(ev.description)) return false;
        const hay = norm(`${ev.description} ${ev.location || ''}`);
        return needles.some(n => hay.includes(n));
    });
    hits.sort((a, b) => dateKey(a.date) - dateKey(b.date));
    if (hits.length <= cap) return hits;
    // Keep the arc's shape when trimming: first few, last few, thin the middle
    const head = hits.slice(0, Math.ceil(cap / 3));
    const tail = hits.slice(-Math.ceil(cap / 3));
    const midPool = hits.slice(head.length, hits.length - tail.length);
    const step = Math.max(1, Math.floor(midPool.length / (cap - head.length - tail.length)));
    const mid = midPool.filter((_, i) => i % step === 0).slice(0, cap - head.length - tail.length);
    return [...head, ...mid, ...tail];
}

/** Find an entity's own note (character/item/place dossier) by name. */
function dossierFor(entity) {
    try {
        const idx = vaultSearch.buildIndex();
        const target = norm(entity);
        const note = idx.find(n => norm((n.filename || '').replace(/\.md$/, '')) === target
            || norm(n.frontmatter?.name) === target);
        if (note && note.body && !vaultSearch._isGmSecret(note)) return note;
    } catch (_) { /* ignore */ }
    return null;
}

/** Proper nouns in a blob of text (for discovery), minus noise + known names. */
function discoverNames(text, known) {
    const SKIP = new Set(['The', 'A', 'An', 'In', 'At', 'On', 'And', 'But', 'For', 'With', 'From', 'After', 'Before', 'During', 'When', 'While', 'They', 'He', 'She', 'It', 'His', 'Her', 'Their', 'This', 'That', 'These', 'Those', 'PLAN', 'TODO', 'City', 'Town', 'Date', 'Location', 'Event', 'Session', 'Timeline', 'Campaign', 'Professor', 'Captain', 'Lord', 'Lady', 'Judge', 'Queen', 'King']);
    const knownNorm = new Set(known.map(norm));
    const counts = new Map();
    for (const m of String(text || '').matchAll(/\b[A-Z][a-zA-Z''-]{2,}(?:\s+[A-Z][a-zA-Z''-]{2,})?\b/g)) {
        const name = m[0];
        const first = name.split(/\s+/)[0];
        if (SKIP.has(first)) continue;
        if (knownNorm.has(norm(name)) || knownNorm.has(norm(first))) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

function fmtEvent(ev) {
    return `- ${ev.date} · ${ev.location || '—'} [${(ev.ap || '').toUpperCase()}]: ${ev.description.trim().replace(/\s*\n\s*/g, ' ').slice(0, 240)}`;
}

/**
 * Build cross-referenced context for a set of entities.
 * @param {string[]} entities  Resolved entity names from the understanding pass
 * @param {Object} [opts]
 * @param {string} [opts.fallbackQuery]  Used for session-summary search when helpful
 * @param {number} [opts.maxChars=7000]
 * @returns {string}
 */
function buildContext(entities, opts = {}) {
    const { fallbackQuery = '', maxChars = 7000 } = opts;
    const sections = [];
    const known = [...entities];

    // ── HOP 1: dossiers for asked-about entities ─────────────────────────────
    const hop1Dossiers = [];
    for (const ent of entities.slice(0, 4)) {
        const note = dossierFor(ent);
        if (note) hop1Dossiers.push({ ent, note });
    }
    for (const { ent, note } of hop1Dossiers.slice(0, 3)) {
        sections.push(`[DOSSIER: ${note.filename.replace(/\.md$/, '')}]\n${note.body.trim().slice(0, 1400)}`);
    }

    // ── HOP 1: the arc — timeline events mentioning the entities ────────────
    const arc = eventsFor(entities, 16);
    if (arc.length > 0) {
        sections.push(`[TIMELINE — Verified canonical events, in order]\n${arc.map(fmtEvent).join('\n')}`);
    }

    // ── DISCOVER: names surfaced by hop 1 that weren't asked about ───────────
    const hop1Text = [
        ...arc.map(ev => ev.description),
        ...hop1Dossiers.map(d => d.note.body.slice(0, 1400)),
        ...hop1Dossiers.flatMap(d => Array.isArray(d.note.links) ? d.note.links : [])
    ].join('\n');
    const discovered = discoverNames(hop1Text, known).slice(0, 4);

    // ── HOP 2: the discovered entities' own records ──────────────────────────
    const hop2Bits = [];
    for (const name of discovered) {
        const note = dossierFor(name);
        if (note) hop2Bits.push(`[LINKED — ${note.filename.replace(/\.md$/, '')}]\n${note.body.trim().slice(0, 650)}`);
        const evs = eventsFor([name], 5);
        // Only add events not already in the arc
        const arcSet = new Set(arc.map(e => e.date + e.description));
        const fresh = evs.filter(e => !arcSet.has(e.date + e.description));
        if (fresh.length > 0) hop2Bits.push(`[LINKED EVENTS — ${name}]\n${fresh.map(fmtEvent).join('\n')}`);
    }
    sections.push(...hop2Bits.slice(0, 5));

    // ── Session lore: summaries matching the entities (or the raw query) ─────
    try {
        const hits = vaultSearch.byText(entities.join(' ') || fallbackQuery, 4);
        let added = 0;
        for (const h of hits) {
            const note = h?.note || h;
            if (!note || !note.body || added >= 2) continue;
            if ((note.frontmatter?.type || '') === 'timeline') continue; // already covered
            sections.push(`[${note.folder || 'Note'}: ${note.filename.replace(/\.md$/, '')}]\n${note.body.trim().slice(0, 1100)}`);
            added++;
        }
    } catch (_) { /* ignore */ }

    let out = sections.join('\n\n');
    if (out.length > maxChars) out = out.slice(0, maxChars);
    logger.info(`[CrossRef] entities=[${entities.join(', ')}] discovered=[${discovered.join(', ')}] sections=${sections.length} chars=${out.length}`);
    return out;
}

module.exports = { buildContext, eventsFor, dossierFor, discoverNames };
