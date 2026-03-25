#!/usr/bin/env node
/**
 * Generate Character Stubs
 * Scans all session summaries and timeline for character names,
 * deduplicates, and creates vault Character files for any that don't exist.
 *
 * Usage: node tools/generate-character-stubs.js [--dry-run] [--min-mentions 2]
 */

const fs = require('fs');
const path = require('path');

const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../obsidian_cass/cassvault');
const CHARS_DIR = path.join(VAULT_DIR, 'Characters');
const SUMMARIES_DIR = path.join(VAULT_DIR, 'Session Summaries');
const TIMELINE_DIR = path.join(VAULT_DIR, 'Timeline');

// Known aliases — map variant names to canonical names
// This prevents duplicates like "Conchobar" vs "Conchobar Turlach Shortstone"
const ALIAS_MAP = {
    // Iron Gods
    'alfred': 'Ulfred', 'alf': 'Ulfred', 'ulfred stronginthearm': 'Ulfred',
    'nom': 'Nomkath', 'nomkat': 'Nomkath',
    'brow': 'Mr Brow', 'mr. brow': 'Mr Brow', 'augustus': 'Mr Brow', 'augustus teabrow': 'Mr Brow', 'mr augustus teabrow': 'Mr Brow', 'teabrow': 'Mr Brow',
    'olb': 'Olbryn', 'olbrynn': 'Olbryn',
    'akrad': 'Akradenn', 'akradden': 'Akradenn', 'akraden': 'Akradenn',
    'gavrilo': 'Gavrilo', 'gabrilo': 'Gavrilo',
    'kroktah': 'Kroktah', 'cckatha': 'Kroktah', 'kokta': 'Kroktah', 'krokta': 'Kroktah', 'coca': 'Kroktah', 'croktail': 'Kroktah', 'crock tail': 'Kroktah',
    'cass': 'Casandalee', 'cassie': 'Casandalee', 'casandalee (ai core)': 'Casandalee', 'casandalee (ai, present via network)': 'Casandalee', 'casandalee (ai)': 'Casandalee', 'casandalee (goddess)': 'Casandalee',
    'brigh': 'Brigh', 'bry': 'Brigh',
    'mey': 'Meyanda', 'meyanda (reformed android cleric)': 'Meyanda',
    'tok': 'Tokala', 'tokalla': 'Tokala',
    'eld': 'Eldrin', 'eldryn': 'Eldrin',
    'mag': 'Maginnis', 'mcginnis': 'Maginnis', 'maginnis (npc ally)': 'Maginnis',
    'khonnir': 'Khonnir Baine', 'baine': 'Khonnir Baine', 'khonnir baine (rescued councilman)': 'Khonnir Baine',
    'osman': 'Osman', 'osman (technic league leader)': 'Osman', 'osman (technic league)': 'Osman',
    'captain grin': 'Captain Grin', 'captain grin (void dragon, polymorphed wizard)': 'Captain Grin', 'captain grin (polymorphed void dragon wizard)': 'Captain Grin',
    'hellion': 'Hellion', 'hellion (ai god)': 'Hellion',
    'unity': 'Unity', 'unity (ai)': 'Unity', 'unity (the ai overlord)': 'Unity',
    'dolga': 'Dolga Fredidotr', 'dolga fredidotr': 'Dolga Fredidotr',

    // Skull & Shackles
    'holden aleistair': 'Holden', 'aleistair': 'Holden', 'captain oblivious': 'Holden', 'holden alastair': 'Holden',
    'storgrim thunderbeard': 'Storgrim', 'thunderbeard': 'Storgrim', 'stor': 'Storgrim',
    'sha feng': 'Sha-Feng', 'shafeng': 'Sha-Feng', 'sha': 'Sha-Feng',
    'ser toche': 'Ser-Toche', 'sertoche': 'Ser-Toche', 'toche': 'Ser-Toche',
    'lil vaughan': 'Vaughan', 'lil vaughn': 'Vaughan',
    'towa hershel': 'Towa', 'hershel': 'Towa',
    'bujon storm of cheliax': 'Bujon', 'storm of cheliax': 'Bujon',
    'rhyaerca': 'Rhyarca', 'rhyarca jillyr': 'Rhyarca', 'jillyr': 'Rhyarca',
    'conchobar': 'Conchobar Turlach Shortstone', 'conchobar shortstone': 'Conchobar Turlach Shortstone', 'conchobar the smelly': 'Conchobar Turlach Shortstone', 'conchobar turlach shortstone': 'Conchobar Turlach Shortstone',

    // Carrion Crown
    'william gaspar': 'Gaspar', 'william': 'Gaspar',
    'kate': 'Kate Blackwood', 'kate-blackwood': 'Kate Blackwood', 'blackwood': 'Kate Blackwood',
    'rodney': 'Rodney Danger Smith', 'rodney-danger-smith': 'Rodney Danger Smith', 'rds': 'Rodney Danger Smith', 'danger smith': 'Rodney Danger Smith',
    'dismas aevrett': 'Dismas', 'aevrett': 'Dismas',
    'kai gin': 'Kai',
    'judge embreth darymid': 'Judge Embreth Darymid', 'embreth darymid': 'Judge Embreth Darymid', 'embreth': 'Judge Embreth Darymid', 'judge darymid': 'Judge Embreth Darymid',
    'kendra lorrimor': 'Kendra Lorrimor', 'kendra': 'Kendra Lorrimor',
    'professor lorrimor': 'Professor Lorrimor', 'lorrimor': 'Professor Lorrimor',

    // Hells Rebels / Vengeance
    'gabe': 'Gabriel',
};

// Names to skip entirely (not real characters)
const SKIP_NAMES = new Set([
    'various', 'unknown', 'multiple', 'unnamed', 'several', 'party', 'group',
    'gm', 'dm', 'toby', 'npc', 'npcs', 'the party', 'various npcs',
    'various technic league soldiers and undead constructs',
    'various undead', 'various npcs and monsters', 'local townsfolk',
    'n/a', 'none', 'unclear', 'unidentified',
    // Places (not characters)
    'lepidstadt', 'cheliax', 'taldor', 'torch', 'numeria', 'ustalav', 'absalom',
    'kintargo', 'scrapwall', 'starfall', 'silver mount', 'isger', 'oppara',
    'iadenveigh', 'caliphas', 'carrion hill', 'ravengro', 'golarion', 'avistan',
    'aldronard', 'choking tower', 'citadel dinyar', 'longacre', 'egorian',
    'scar of the spider', 'black hill caves', 'feldgrau', 'schloss caromarc',
    'harrowstone', 'illmarsh', 'thrushmoor', 'cassomir',
    // Common words / not characters
    'she', 'he', 'they', 'man', 'woman', 'battle', 'the beast', 'beast',
    'silver ravens', 'technic league', 'the empire', 'empire',
    'prince', 'queen', 'king', 'lord', 'lady',
    'party members', 'crew', 'captain', 'guards', 'soldiers',
]);

function resolveCanonical(name) {
    if (!name || name.length < 2) return null;
    const lower = name.toLowerCase().trim();
    if (SKIP_NAMES.has(lower)) return null;
    if (lower.startsWith('various ') || lower.startsWith('unnamed ') || lower.startsWith('multiple ')) return null;
    if (lower.startsWith('several ')) return null;

    // Check alias map
    if (ALIAS_MAP[lower]) return ALIAS_MAP[lower];

    // Return original with title case
    return name.trim();
}

function scanSummaries() {
    const chars = new Map(); // canonical -> { mentions, campaigns, type, aliases }

    function addChar(rawName, campaign, type) {
        const canonical = resolveCanonical(rawName);
        if (!canonical) return;

        if (!chars.has(canonical)) {
            chars.set(canonical, { mentions: 0, campaigns: new Set(), type, aliases: new Set() });
        }
        const entry = chars.get(canonical);
        entry.mentions++;
        if (campaign) entry.campaigns.add(campaign);
        if (rawName.trim() !== canonical) entry.aliases.add(rawName.trim());
    }

    function walk(dir) {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            if (fs.statSync(fp).isDirectory()) { walk(fp); continue; }
            if (!f.endsWith('.md')) continue;
            const content = fs.readFileSync(fp, 'utf8');

            const campMatch = content.match(/campaign:\s*"(\w+)"/);
            const camp = campMatch ? campMatch[1] : null;

            // PCs from frontmatter
            const charsMatch = content.match(/charactersPresent:\s*\[(.*?)\]/);
            if (charsMatch) {
                const names = charsMatch[1].match(/"([^"]+)"/g);
                if (names) names.forEach(n => addChar(n.replace(/"/g, ''), camp, 'pc'));
            }

            // NPCs from wiki links
            const npcSection = content.match(/## NPCs Encountered\n\n([\s\S]*?)(?=\n##|\n$)/);
            if (npcSection) {
                const npcLinks = npcSection[1].match(/\[\[([^\]]+)\]\]/g);
                if (npcLinks) npcLinks.forEach(n => addChar(n.replace(/\[\[|\]\]/g, ''), camp, 'npc'));
            }
        }
    }
    walk(SUMMARIES_DIR);

    // Also scan timeline for names
    if (fs.existsSync(TIMELINE_DIR)) {
        for (const f of fs.readdirSync(TIMELINE_DIR)) {
            if (!f.endsWith('.md')) continue;
            const content = fs.readFileSync(path.join(TIMELINE_DIR, f), 'utf8');
            const campMatch = f.match(/^(\w+)_timeline/);
            const camp = campMatch ? campMatch[1] : null;

            // Extract names from timeline descriptions (rough heuristic)
            const lines = content.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Date') && !l.startsWith('|---'));
            for (const line of lines) {
                const parts = line.split('|').map(p => p.trim()).filter(Boolean);
                if (parts.length >= 3) {
                    const desc = parts[2];
                    // Find capitalized names (2+ words starting with caps, or known single-word names)
                    const nameMatches = desc.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
                    if (nameMatches) {
                        for (const name of nameMatches) {
                            if (name.length < 3) continue;
                            if (['The', 'Party', 'After', 'During', 'Before', 'Several', 'Various', 'They', 'Their', 'Some', 'This'].includes(name)) continue;
                            addChar(name, camp, 'npc');
                        }
                    }
                }
            }
        }
    }

    return chars;
}

function getExistingFiles() {
    const existing = new Map(); // lowercase name -> filename
    if (!fs.existsSync(CHARS_DIR)) return existing;
    for (const f of fs.readdirSync(CHARS_DIR)) {
        if (!f.endsWith('.md')) continue;
        const name = f.replace('.md', '');
        existing.set(name.toLowerCase(), f);

        // Also read aliases from frontmatter
        try {
            const content = fs.readFileSync(path.join(CHARS_DIR, f), 'utf8');
            const aliasMatch = content.match(/aliases:\s*"?\[([^\]]*)\]"?/);
            if (aliasMatch) {
                const aliases = aliasMatch[1].match(/"([^"]+)"/g);
                if (aliases) aliases.forEach(a => existing.set(a.replace(/"/g, '').toLowerCase(), f));
            }
            const nameMatch = content.match(/name:\s*"([^"]+)"/);
            if (nameMatch) existing.set(nameMatch[1].toLowerCase(), f);
        } catch {}
    }
    return existing;
}

function createStub(canonical, info) {
    const safeName = canonical.replace(/[<>:"/\\|?*]/g, '-').trim();
    const filePath = path.join(CHARS_DIR, `${safeName}.md`);

    const campaigns = [...info.campaigns].join(', ');
    const aliases = [...info.aliases].filter(a => a.toLowerCase() !== canonical.toLowerCase());
    const aliasStr = aliases.length > 0 ? aliases.map(a => `"${a}"`).join(', ') : '';
    const tags = ['character', info.type];
    info.campaigns.forEach(c => tags.push(c.toLowerCase()));

    const md = `---
name: "${canonical}"
type: ${info.type}
aliases: [${aliasStr}]
campaign: [${[...info.campaigns].map(c => `"${c}"`).join(', ')}]
mentions: ${info.mentions}
tags: [${tags.map(t => `"${t}"`).join(', ')}]
---

# ${canonical}

**Type:** ${info.type === 'pc' ? 'Player Character' : 'NPC'}
**Campaigns:** ${campaigns || 'Unknown'}
**Mentions:** ${info.mentions} session(s)
${aliases.length > 0 ? `**Also known as:** ${aliases.join(', ')}` : ''}

## Notes & Updates

*No notes yet. Information will be added as Cass learns more from conversations and sessions.*
`;

    fs.writeFileSync(filePath, md, 'utf8');
    return filePath;
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minMentions = parseInt(args.find(a => a.startsWith('--min-mentions'))?.split('=')[1] || args[args.indexOf('--min-mentions') + 1]) || 2;

console.log('\n=== Character Stub Generator ===\n');
console.log(`Minimum mentions: ${minMentions}`);
if (dryRun) console.log('DRY RUN\n');

const chars = scanSummaries();
const existing = getExistingFiles();

console.log(`Found ${chars.size} unique characters`);
console.log(`Existing character files: ${existing.size} (including aliases)\n`);

let created = 0, skipped = 0, tooFew = 0;

const sorted = [...chars.entries()].sort((a, b) => b[1].mentions - a[1].mentions);

for (const [canonical, info] of sorted) {
    if (info.mentions < minMentions) { tooFew++; continue; }

    // Check if already exists
    if (existing.has(canonical.toLowerCase())) {
        skipped++;
        continue;
    }

    // Also check without special chars
    const simplified = canonical.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase();
    if (existing.has(simplified)) {
        skipped++;
        continue;
    }

    if (dryRun) {
        console.log(`  WOULD CREATE: ${canonical} (${info.mentions} mentions, ${info.type}, ${[...info.campaigns].join('/')})`);
    } else {
        createStub(canonical, info);
        console.log(`  ✅ ${canonical} (${info.mentions} mentions, ${info.type})`);
    }
    created++;
}

console.log(`\n=== Done ===`);
console.log(`Created: ${created}`);
console.log(`Already existed: ${skipped}`);
console.log(`Below ${minMentions} mentions (skipped): ${tooFew}`);
