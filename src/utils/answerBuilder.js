/**
 * Structured Answer Builder for Casandalee
 *
 * Does the "thinking" in code so the LLM just needs to rephrase facts.
 * Especially important for Ollama 7B fallback — a small model can't reason
 * over 6000 chars of unstructured vault dumps, but it CAN rephrase a clean
 * bullet-point fact sheet in Cass's voice.
 *
 * Pipeline: query → classifyQuery → buildFactSheet → buildOllamaPrompt
 */

const vaultSearch = require('./vaultSearch');
const nameResolver = require('./nameResolver');
const timelineCache = require('./timelineCache');
const logger = require('./logger');

// Query type patterns — checked in order, first match wins
const QUERY_PATTERNS = [
    { type: 'WHO', patterns: [
        /^who\s+is\s+/i, /^who'?s\s+/i, /^tell\s+me\s+about\s+/i,
        /^what\s+do\s+you\s+know\s+about\s+/i, /^describe\s+/i,
        /^what\s+(?:race|class|level)\s+is\s+/i,
        /^what\s+can\s+you\s+tell\s+me\s+about\s+/i
    ]},
    { type: 'WHEN', patterns: [
        /^when\s+did\s+/i, /^what\s+(?:date|year|time)\s+/i,
        /^how\s+long\s+ago\s+/i, /^what\s+happened\s+(?:on|in|at|during)\s+/i
    ]},
    { type: 'WHERE', patterns: [
        /^where\s+is\s+/i, /^where\s+did\s+/i, /^where\s+(?:can|do)\s+/i,
        /^what\s+is\s+.+\s+located/i
    ]},
    { type: 'ITEM', patterns: [
        /^what\s+does\s+.+\s+do\b/i, /^what\s+is\s+(?:the\s+)?(?:a\s+)?.+(?:weapon|sword|armor|ring|cloak|item|staff|wand|bow|gun|rifle|pistol)/i,
        /^how\s+does\s+.+\s+work/i
    ]},
    { type: 'WHAT', patterns: [
        /^what\s+(?:happened|is|are|was|were)\s+/i, /^how\s+did\s+/i,
        /^explain\s+/i, /^what'?s\s+/i, /^what\s+do\s+/i
    ]}
];

// Stop words to strip from entity extraction
const STOP_WORDS = new Set([
    'the','a','an','is','was','were','are','did','do','does','when','where','who',
    'what','how','why','about','have','has','had','can','could','will','would',
    'should','this','that','with','from','for','and','but','not','tell','me',
    'know','you','your','my','our','their','his','her','its','be','been','being',
    'get','got','say','said','like','just','also','very','really','please',
    'happened','happen','start','started','die','died','killed','kill'
]);

class AnswerBuilder {

    /**
     * Classify a query into a type and extract entity names.
     * @returns {{ type: string, entities: string[], terms: string[] }}
     */
    classifyQuery(query) {
        const cleaned = query.replace(/[?!.,;:'"()]/g, '').trim();
        const terms = cleaned.toLowerCase().split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));

        // Extract entity names from the query
        const entities = this._extractEntities(query);

        // Check entity types in vault — order matters: lore > character > item > place
        if (entities.length > 0) {
            const firstEntity = entities[0];

            // Campaign Lore check FIRST — "what is the whispering way" should be LORE not ITEM
            // Direct folder check: does a Campaign Lore file exist with this name?
            const idx = vaultSearch.buildIndex();
            const entityLower = firstEntity.toLowerCase();
            const directLoreHit = idx.find(n =>
                (n.folder || '').toLowerCase().includes('campaign lore') &&
                (n.filename.toLowerCase() === entityLower || n.filename.toLowerCase() === 'the ' + entityLower)
            );
            if (directLoreHit) return { type: 'LORE', entities, terms };

            // Broader text search fallback for lore
            const loreHits = vaultSearch.byText(firstEntity, 5).filter(n =>
                (n.folder || '').toLowerCase().includes('campaign lore') ||
                (n.frontmatter.type || '').toLowerCase() === 'lore'
            );
            if (loreHits.length > 0 && /what\s+is/i.test(query)) return { type: 'LORE', entities, terms };

            // Place check for WHERE queries
            const placeHits = vaultSearch.byNameAndType(firstEntity, 'place');
            if (placeHits.length > 0 && /where/i.test(query)) return { type: 'WHERE', entities, terms };

            // Item check — but only if the query is actually about an item, not a person/org
            const itemHits = vaultSearch.byNameAndType(firstEntity, 'item');
            if (itemHits.length > 0) {
                // Only classify as ITEM if pattern matches item queries or "what is/does" + no lore match
                if (/what\s+does|how\s+does|weapon|armor|sword|item/i.test(query) || loreHits.length === 0) {
                    return { type: 'ITEM', entities, terms };
                }
            }
        }

        // Pattern-based classification
        for (const { type, patterns } of QUERY_PATTERNS) {
            if (patterns.some(p => p.test(query))) {
                // WHO pattern but entity is an item → reclassify as ITEM
                if (type === 'WHO' && entities.length > 0) {
                    const itemHits = vaultSearch.byNameAndType(entities[0], 'item');
                    if (itemHits.length > 0) return { type: 'ITEM', entities, terms };
                }
                return { type, entities, terms };
            }
        }

        // Fallback lore check for unclassified queries with entities
        if (entities.length > 0) {
            const loreHits = vaultSearch.byText(entities[0], 5).filter(n =>
                (n.folder || '').toLowerCase().includes('campaign lore') ||
                (n.frontmatter.type || '').toLowerCase() === 'lore'
            );
            if (loreHits.length > 0) return { type: 'LORE', entities, terms };
        }

        return { type: 'GENERAL', entities, terms };
    }

    /**
     * Extract entity names from a query string.
     * Simple approach: try progressively shorter word combos against
     * vault filenames and nameResolver. No fuzzy matching on short/common words.
     */
    _extractEntities(query) {
        const entities = [];
        const words = query.replace(/[?!.,;:'"()]/g, '').split(/\s+/)
            .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
        const idx = vaultSearch.buildIndex();

        // Build a map of lowercase vault filenames for O(1) lookup
        const vaultNames = new Map();
        for (const n of idx) {
            vaultNames.set(n.filename.toLowerCase(), n.frontmatter.name || n.filename);
        }

        const used = new Set(); // track consumed word indices

        // Pass 1: Try 3-word combos, then 2-word, then 1-word
        for (let len = 3; len >= 1; len--) {
            for (let i = 0; i <= words.length - len; i++) {
                if (used.has(i)) continue;
                const combo = words.slice(i, i + len).join(' ');
                const comboLower = combo.toLowerCase();

                // Skip if all words are stop words
                if (combo.split(' ').every(w => STOP_WORDS.has(w.toLowerCase()))) continue;

                // Check vault filename (exact, case-insensitive) + "The " prefix fallback
                const vaultMatch = vaultNames.get(comboLower) || vaultNames.get('the ' + comboLower);
                if (vaultMatch) {
                    entities.push(vaultMatch);
                    for (let j = i; j < i + len; j++) used.add(j);
                    continue;
                }

                // Check nameResolver (registered aliases)
                const resolved = nameResolver.resolve(combo);
                if (resolved) {
                    entities.push(resolved);
                    for (let j = i; j < i + len; j++) used.add(j);
                    continue;
                }
            }
        }

        return [...new Set(entities)];
    }

    /**
     * Build a structured fact sheet from vault data.
     * @returns {string|null} — formatted fact string, or null if nothing found
     */
    buildFactSheet(query, classification, options = {}) {
        const { type, entities, terms } = classification;

        try {
            switch (type) {
                case 'WHO': return this._buildCharacterFacts(entities, terms);
                case 'ITEM': return this._buildItemFacts(entities, terms);
                case 'WHEN': return this._buildTimelineFacts(query, entities, terms);
                case 'WHERE': return this._buildPlaceFacts(entities, terms);
                case 'WHAT': return this._buildEventFacts(query, entities, terms);
                case 'LORE': return this._buildLoreFacts(entities, terms);
                default: return null;
            }
        } catch (err) {
            logger.warn(`AnswerBuilder error for ${type}: ${err.message}`);
            return null;
        }
    }

    // === Fact builders by query type ===

    _buildCharacterFacts(entities, terms) {
        const facts = [];

        for (const entity of entities.slice(0, 2)) {
            const notes = vaultSearch.byName(entity);
            if (notes.length === 0) continue;

            const note = notes[0];
            const fm = note.frontmatter;
            const lines = [`FACTS ABOUT ${(fm.name || entity).toUpperCase()}:`];

            // Core stats from frontmatter
            if (fm.race || fm.class) {
                lines.push(`- Race: ${fm.race || 'Unknown'} | Class: ${fm.class || 'Unknown'}`);
            }
            if (fm.level) lines.push(`- Level: ${fm.level}`);
            if (fm.player) lines.push(`- Player: ${fm.player}`);
            if (fm.campaign) lines.push(`- Campaign: ${fm.campaign}`);
            if (fm.hp) lines.push(`- HP: ${fm.hp}`);

            // Extract Key Equipment section (just item names)
            const equipMatch = note.body.match(/## Key Equipment\n([\s\S]*?)(?=\n## |\n---|\Z)/);
            if (equipMatch) {
                const itemNames = equipMatch[1].match(/\*\*([^*]+)\*\*/g);
                if (itemNames && itemNames.length > 0) {
                    const cleaned = itemNames.slice(0, 5).map(n => n.replace(/\*\*/g, ''));
                    lines.push(`- Key items: ${cleaned.join(', ')}`);
                }
            }

            // First 2 Notes & Updates bullets
            const notesMatch = note.body.match(/## Notes & Updates\n([\s\S]*?)(?=\n## |\Z)/);
            if (notesMatch) {
                const bullets = notesMatch[1].match(/^- .+/gm);
                if (bullets && bullets.length > 0) {
                    const recent = bullets[0].substring(0, 200);
                    lines.push(`- Recent: ${recent}`);
                }
            }

            // Timeline events for this character
            try {
                const events = timelineCache.search(entity);
                if (events && events.length > 0) {
                    const topEvents = events.slice(0, 3);
                    for (const e of topEvents) {
                        lines.push(`- [${e.date}] ${e.location || ''}: ${(e.description || '').substring(0, 120)}`);
                    }
                }
            } catch (e) { /* timeline cache may not be ready */ }

            facts.push(lines.join('\n'));
        }

        return facts.length > 0 ? facts.join('\n\n') : null;
    }

    _buildItemFacts(entities, terms) {
        const facts = [];

        for (const entity of entities.slice(0, 2)) {
            // Try item type first, then general search
            let notes = vaultSearch.byNameAndType(entity, 'item');
            if (notes.length === 0) notes = vaultSearch.byName(entity);
            if (notes.length === 0) continue;

            const note = notes[0];
            const fm = note.frontmatter;
            const lines = [`FACTS ABOUT ${(fm.name || entity).toUpperCase()}:`];

            if (fm.subtype) lines.push(`- Type: ${fm.subtype}`);
            if (fm.owner) lines.push(`- Owner: ${fm.owner}${fm.player ? ` (${fm.player})` : ''}`);
            if (fm.campaign) lines.push(`- Campaign: ${fm.campaign}`);

            // Item body is already well-structured, take first 600 chars
            const body = note.body.replace(/^#.+\n/gm, '').trim();
            if (body.length > 0) {
                lines.push(`- ${body.substring(0, 600)}`);
            }

            facts.push(lines.join('\n'));
        }

        return facts.length > 0 ? facts.join('\n\n') : null;
    }

    _buildTimelineFacts(query, entities, terms) {
        const lines = ['TIMELINE FACTS:'];

        // Search timeline cache
        try {
            const allTerms = [...entities, ...terms];
            const events = timelineCache.search(allTerms.join(' '));
            if (events && events.length > 0) {
                for (const e of events.slice(0, 8)) {
                    lines.push(`- [${e.date}] ${e.location || 'Unknown'}: ${(e.description || '').substring(0, 150)}`);
                }
            }
        } catch (e) { /* cache may not be ready */ }

        // Also check vault timeline notes
        const idx = vaultSearch.buildIndex();
        const timelineNotes = idx.filter(n => (n.frontmatter.type || '').toLowerCase() === 'timeline');
        for (const note of timelineNotes) {
            const tableLines = note.body.split('\n').filter(l =>
                l.startsWith('|') && !l.startsWith('| Date') && !l.startsWith('|---')
            );
            for (const line of tableLines) {
                const lineLower = line.toLowerCase();
                const matchCount = terms.filter(t => lineLower.includes(t)).length;
                if (matchCount >= 2) {
                    lines.push(line.trim());
                }
            }
        }

        // Deduplicate by taking unique lines
        const unique = [...new Set(lines)];
        return unique.length > 1 ? unique.slice(0, 10).join('\n') : null;
    }

    _buildPlaceFacts(entities, terms) {
        const facts = [];

        for (const entity of entities.slice(0, 2)) {
            let notes = vaultSearch.byNameAndType(entity, 'place');
            if (notes.length === 0) notes = vaultSearch.byName(entity);
            if (notes.length === 0) continue;

            const note = notes[0];
            const fm = note.frontmatter;
            const lines = [`FACTS ABOUT ${(fm.name || entity).toUpperCase()}:`];

            if (fm.country) lines.push(`- Region: ${fm.country}`);
            if (fm.city) lines.push(`- City: ${fm.city}`);
            if (fm.campaign) lines.push(`- Campaign: ${fm.campaign}`);

            // First paragraph of body
            const body = note.body.replace(/^#.+\n/gm, '').trim();
            const firstPara = body.split('\n\n')[0];
            if (firstPara) lines.push(`- ${firstPara.substring(0, 300)}`);

            facts.push(lines.join('\n'));
        }

        return facts.length > 0 ? facts.join('\n\n') : null;
    }

    _buildEventFacts(query, entities, terms) {
        const parts = [];

        // First: search vault for notes containing the QUERY TERMS directly
        // This catches things like "elfrope" which is in a Signature Maneuvers section
        const textHits = vaultSearch.byText(query, 5);
        for (const note of textHits.slice(0, 3)) {
            // Find paragraphs/sections containing query terms
            const queryLower = query.toLowerCase();
            const relevantTerms = terms.filter(t => t.length > 3); // skip short words
            const sections = note.body.split(/\n(?=##?\s)/);
            for (const section of sections) {
                const sectionLower = section.toLowerCase();
                const matchCount = relevantTerms.filter(t => sectionLower.includes(t)).length;
                if (matchCount >= 1 && section.length > 20) {
                    // Found a relevant section — include it
                    const cleaned = section.replace(/^#+\s*/gm, '').trim().substring(0, 400);
                    parts.push(`FROM ${note.frontmatter.name || note.filename}:\n${cleaned}`);
                    break; // one section per note is enough
                }
            }
        }

        // Then: character facts for mentioned entities
        const charFacts = this._buildCharacterFacts(entities, terms);
        if (charFacts) parts.push(charFacts);

        // Then: timeline facts
        const timeFacts = this._buildTimelineFacts(query, entities, terms);
        if (timeFacts) parts.push(timeFacts);

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    _buildLoreFacts(entities, terms) {
        for (const entity of entities) {
            // Direct filename match in Campaign Lore folder first
            const idx = vaultSearch.buildIndex();
            const entityLower = entity.toLowerCase();
            const directHit = idx.find(n =>
                (n.folder || '').toLowerCase().includes('campaign lore') &&
                (n.filename.toLowerCase() === entityLower ||
                 n.filename.toLowerCase() === 'the ' + entityLower ||
                 n.filename.toLowerCase().includes(entityLower))
            );
            if (directHit) {
                const body = directHit.body.replace(/^#.+\n/gm, '').trim();
                return `LORE: ${directHit.frontmatter.name || entity}\n${body.substring(0, 800)}`;
            }

            // Text search fallback for Campaign Lore
            const hits = vaultSearch.byText(entity, 5).filter(n =>
                (n.folder || '').toLowerCase().includes('campaign lore') ||
                (n.folder || '').toLowerCase().includes('lore')
            );
            if (hits.length > 0) {
                const note = hits[0];
                const body = note.body.replace(/^#.+\n/gm, '').trim();
                return `LORE: ${note.frontmatter.name || entity}\n${body.substring(0, 800)}`;
            }

            // Also check general vault
            const general = vaultSearch.byName(entity);
            if (general.length > 0) {
                const note = general[0];
                const body = note.body.replace(/^#.+\n/gm, '').trim();
                return `LORE: ${note.frontmatter.name || entity}\n${body.substring(0, 800)}`;
            }
        }
        return null;
    }

    // === Ollama Prompt Builder ===

    /**
     * Build a minimal, focused system prompt for Ollama 7B.
     * Total budget: under 2000 tokens.
     */
    buildOllamaPrompt(factSheet, personalityName, personalityAlignment) {
        return `You are Casandalee, an AI from Numeria in the Pathfinder RPG world. You speak as ${personalityName || 'yourself'} (${personalityAlignment || 'Neutral Good'}).

YOUR MEMORY (use these facts to answer):
${factSheet}

RULES:
- The facts above ARE your memories. Rephrase them conversationally to answer the question.
- Be brief (2-3 sentences). Do not repeat the facts word-for-word, put them in your own voice.
- Do not add details beyond what the facts state. Do not guess or invent.
- Only say "I don't have that in my memories" if the facts above are completely irrelevant to the question asked.`;
    }
}

module.exports = new AnswerBuilder();
