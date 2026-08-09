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

// ── Alias expansion ─────────────────────────────────────────────────────────
// 254+ dossiers carry `aliases:` frontmatter (Meyanda = "Purple Cow"…) and the
// nameResolver holds PC aliases — retrieval must see every variant of a name.
let _aliasCache = { size: -1, map: null };

/** normalized variant -> Set of all variants (filename, name, aliases). */
function aliasMap() {
    const idx = vaultSearch.buildIndex();
    if (_aliasCache.map && _aliasCache.size === idx.length) return _aliasCache.map;
    const m = new Map();
    for (const n of idx) {
        const variants = new Set();
        const base = (n.filename || '').replace(/\.md$/, '').trim();
        if (base) variants.add(base);
        if (n.frontmatter?.name) variants.add(String(n.frontmatter.name).trim());
        const al = n.frontmatter?.aliases;
        const list = Array.isArray(al) ? al : (typeof al === 'string' && al ? [al] : []);
        for (const a of list) if (a && String(a).trim()) variants.add(String(a).trim());
        if (variants.size < 2) continue;
        for (const v of variants) {
            const key = norm(v);
            if (!key) continue;
            if (!m.has(key)) m.set(key, new Set());
            for (const v2 of variants) m.get(key).add(v2);
        }
    }
    _aliasCache = { size: idx.length, map: m };
    return m;
}

/** All known name-variants for an entity (itself + resolver canonical + dossier aliases). */
function expandEntity(entity) {
    const out = new Set([String(entity)]);
    try {
        const nameResolver = require('./nameResolver');
        const canon = nameResolver.resolve(entity);
        if (canon) out.add(canon);
    } catch (_) { /* resolver optional */ }
    try {
        const m = aliasMap();
        for (const e of [...out]) {
            const grp = m.get(norm(e));
            if (grp) for (const v of grp) out.add(v);
        }
    } catch (_) { /* ignore */ }
    return [...out];
}

/** Numeric sort key from a "YYYY.MM.DD"-ish date string. */
function dateKey(d) {
    const m = String(d || '').match(/^(-?\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 10000 + (parseInt(m[2] || '0', 10) * 100) + parseInt(m[3] || '0', 10);
}

/**
 * Word-set needles: a multi-word entity matches when ALL its words appear —
 * "Professor Martin" must match "Professor Vellesca Martin" (middle names,
 * epithets, and reordered titles would defeat contiguous-phrase matching).
 */
function toNeedles(entities) {
    return entities
        .map(e => String(e || '').split(/\s+/).map(norm).filter(w => w.length > 2))
        .filter(words => words.length > 0);
}

function matchesNeedles(hay, needles) {
    return needles.some(words => words.every(w => hay.includes(w)));
}

/** Timeline events mentioning any of the entities, date-sorted. */
function eventsFor(entities, cap) {
    const all = timelineSearch.timeline || [];
    const needles = toNeedles(entities);
    if (needles.length === 0) return [];
    const hits = all.filter(ev => {
        if (!ev || !ev.description) return false;
        if (/^\s*(PLAN|TODO|GM)\s*:/i.test(ev.description)) return false;
        const hay = norm(`${ev.description} ${ev.location || ''}`);
        return matchesNeedles(hay, needles);
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

/**
 * Extract the lines of a note that actually mention the entity (any variant),
 * instead of blindly slicing the head of the file — deep facts (an item's
 * powers listed 4k chars into a summary) become reachable.
 * @param {string} body
 * @param {string[]} variants  Entity name variants
 * @param {number} maxChars
 * @returns {string}
 */
function entityExcerpt(body, variants, maxChars) {
    const needles = toNeedles(variants);
    if (needles.length === 0) return String(body || '').slice(0, maxChars);
    const lines = String(body || '').split('\n');
    const keep = [];
    for (const line of lines) {
        if (matchesNeedles(norm(line), needles)) {
            const t = line.trim();
            if (t) keep.push(t);
        }
    }
    const focused = keep.join('\n');
    // If focused extraction found real content, lead with it, then pad with the
    // head of the note for framing; otherwise fall back to the head alone.
    if (focused.length >= 120) {
        const head = String(body || '').slice(0, Math.max(0, maxChars - focused.length - 20));
        return `${focused}\n---\n${head}`.slice(0, maxChars);
    }
    return String(body || '').slice(0, maxChars);
}

/** Folders whose notes are noise for factual retrieval (garbled raw captions,
 *  Cass's own chat logs, crosstalk fiction). Clean summaries live elsewhere. */
function isNoiseFolder(folder) {
    const f = String(folder || '');
    return f.startsWith('Sessions') || f === 'Logs' || f === 'Past Life Conversations' || f === 'Personas';
}

/** Find an entity's own note (character/item/place dossier) by name. */
function dossierFor(entity) {
    try {
        const idx = vaultSearch.buildIndex();
        for (const variant of expandEntity(entity)) {
            const target = norm(variant);
            const note = idx.find(n => norm((n.filename || '').replace(/\.md$/, '')) === target
                || norm(n.frontmatter?.name) === target);
            if (note && note.body && !vaultSearch._isGmSecret(note)) return note;
        }
        const target = norm(entity);
        // Exact filename/frontmatter-name match first
        let note = idx.find(n => norm((n.filename || '').replace(/\.md$/, '')) === target
            || norm(n.frontmatter?.name) === target);
        // Fallback: every word of the entity appears in the filename — so
        // "Professor Martin" finds "Vellesca Martin.md", "Justice" finds
        // exact-only (single words must fully match to avoid false hits).
        if (!note) {
            const words = String(entity).split(/\s+/).map(norm).filter(w => w.length > 2);
            if (words.length >= 2) {
                note = idx.find(n => {
                    const fname = norm(n.filename || '');
                    return words.every(w => fname.includes(w));
                });
            }
        }
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
    // Expand every entity through its known aliases (dossier frontmatter +
    // nameResolver) so "Purple Cow" retrieves Meyanda's records and "Toni"
    // retrieves Antoinette's.
    const expanded = [...new Set(entities.flatMap(e => expandEntity(e)))];
    const known = [...expanded];

    // ── ALIAS BRIDGES: tell the model explicitly when an asked-about name is
    //    an alias — retrieval finding Meyanda's dossier for "Purple Cow" is
    //    useless unless the model knows they are the same person.
    for (const ent of entities.slice(0, 4)) {
        const variants = expandEntity(ent).filter(v => norm(v) !== norm(ent));
        if (variants.length > 0) {
            sections.push(`[ALIAS] "${ent}" is a known alias/name-variant of: ${variants.join(', ')} — these records are the SAME entity.`);
        }
    }

    // ── HOP 1: dossiers for asked-about entities ─────────────────────────────
    const hop1Dossiers = [];
    for (const ent of entities.slice(0, 4)) {
        const note = dossierFor(ent);
        if (note && !hop1Dossiers.some(d => d.note === note)) hop1Dossiers.push({ ent, note });
    }
    for (const { ent, note } of hop1Dossiers.slice(0, 3)) {
        sections.push(`[DOSSIER: ${note.filename.replace(/\.md$/, '')}]\n${note.body.trim().slice(0, 1400)}`);
    }

    // ── HOP 1: the arc — timeline events mentioning the entities (any alias) ─
    const arc = eventsFor(expanded, 16);
    if (arc.length > 0) {
        sections.push(`[TIMELINE — Verified canonical events, in order]\n${arc.map(fmtEvent).join('\n')}`);
    }

    // ── DISCOVER: names surfaced by hop 1 that weren't asked about ───────────
    const hop1Text = [
        ...arc.map(ev => ev.description),
        ...hop1Dossiers.map(d => d.note.body.slice(0, 1400)),
        ...hop1Dossiers.flatMap(d => Array.isArray(d.note.links) ? d.note.links : [])
    ].join('\n');
    // Rank discovered names: those with their own dossier first (real entities
    // beat regex noise), then by mention frequency.
    const candidates = discoverNames(hop1Text, known);
    const withDossier = [];
    const without = [];
    for (const name of candidates.slice(0, 10)) {
        (dossierFor(name) ? withDossier : without).push(name);
    }
    const discovered = [...withDossier, ...without].slice(0, 4);

    // ── HOP 2: the discovered entities' own records ──────────────────────────
    const hop2Bits = [];
    for (const name of discovered) {
        const note = dossierFor(name);
        if (note) hop2Bits.push(`[LINKED — ${note.filename.replace(/\.md$/, '')}]\n${note.body.trim().slice(0, 650)}`);
        const evs = eventsFor(expandEntity(name), 5);
        // Only add events not already in the arc
        const arcSet = new Set(arc.map(e => e.date + e.description));
        const fresh = evs.filter(e => !arcSet.has(e.date + e.description));
        if (fresh.length > 0) hop2Bits.push(`[LINKED EVENTS — ${name}]\n${fresh.map(fmtEvent).join('\n')}`);
    }
    // ── Session lore: summaries matching the entities (or the raw query) ─────
    // Raw caption transcripts / chat logs / crosstalk fiction are excluded (the
    // clean Session Summaries carry the same facts without the garble), and
    // each hit is excerpted around the entity mentions rather than head-sliced,
    // so facts buried deep in a summary (an item's powers, a confession) surface.
    const loreBits = [];
    try {
        const hits = vaultSearch.byText(expanded.slice(0, 8).join(' ') || fallbackQuery, 8);
        for (const h of hits) {
            const note = h?.note || h;
            if (!note || !note.body || loreBits.length >= 2) continue;
            if ((note.frontmatter?.type || '') === 'timeline') continue; // already covered
            if (isNoiseFolder(note.folder)) continue;
            loreBits.push(`[${note.folder || 'Note'}: ${note.filename.replace(/\.md$/, '')}]\n${entityExcerpt(note.body.trim(), expanded, 1300)}`);
        }
    } catch (_) { /* ignore */ }

    // ── Assemble by PRIORITY, adding whole sections while the budget allows:
    //    aliases/dossiers/timeline first, then session lore (often holds the
    //    only record of a deep fact), then hop-2 extras. A dumb tail-slice used
    //    to silently truncate the lore section away when hop 2 ran long.
    const ordered = [...sections, ...loreBits, ...hop2Bits.slice(0, 5)];
    const outParts = [];
    let used = 0;
    for (const sec of ordered) {
        if (used + sec.length + 2 > maxChars) {
            if (outParts.length === 0) { outParts.push(sec.slice(0, maxChars)); used = maxChars; }
            continue;
        }
        outParts.push(sec);
        used += sec.length + 2;
    }
    const out = outParts.join('\n\n');
    logger.info(`[CrossRef] entities=[${entities.join(', ')}] discovered=[${discovered.join(', ')}] sections=${outParts.length}/${ordered.length} chars=${out.length}`);
    return out;
}

module.exports = { buildContext, eventsFor, dossierFor, discoverNames };
