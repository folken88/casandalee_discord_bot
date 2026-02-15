#!/usr/bin/env node
/**
 * Apply Pathfinder 1e conventional 25-point-buy stats to all personality files
 * by class. Run from repo root: node tools/apply-class-stats.js
 *
 * Stats order: STR, DEX, CON, WIS, INT, CHA (all arrays sum to 25 point cost)
 * Point costs: 7=-4, 8=-2, 9=-1, 10=0, 11=1, 12=2, 13=3, 14=5, 15=7, 16=10, 17=13, 18=17
 */

const fs = require('fs');
const path = require('path');

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');

/** Pathfinder 1e conventional 25-point arrays by class. [STR, DEX, CON, WIS, INT, CHA] – all sum to 25 */
const CLASS_STATS_25 = {
    // Full casters – primary casting stat high
    'Wizard':        [ 8, 15, 14, 12, 18,  7 ],  // INT
    'Sorcerer':      [ 8, 14, 12, 10, 13, 18 ],  // CHA
    'Cleric':        [15,  8, 14, 18, 10,  8 ],  // WIS
    'Druid':         [10, 14, 14, 18, 10,  8 ],  // WIS (24 – keep)
    'Oracle':        [10, 14, 14, 10, 12, 17 ],  // CHA
    'Witch':         [ 8, 14, 14, 18, 12,  8 ],  // WIS (25)
    'Psychic':       [ 8, 14, 12, 18, 14,  8 ],  // WIS (24)
    'Arcanist':      [ 8, 14, 12, 10, 18, 10 ],  // INT

    // Prepared / hybrid
    'Archivist':     [ 8, 14, 12, 14, 18,  8 ],  // INT (24)
    'Alchemist':     [12, 15, 14, 10, 17,  8 ],  // INT
    'Investigator':  [12, 16, 12, 10, 17,  8 ],  // INT, DEX
    'Magus':         [14, 16, 12, 10, 16,  8 ],  // INT (25)
    'Summoner':      [ 8, 14, 14, 10, 16, 15 ],  // INT, CHA
    'Synthesist Summoner': [ 8, 14, 14, 10, 16, 15 ],
    'Technomancer':  [ 8, 14, 14, 10, 18, 10 ],  // INT (24→25: CHA 10)

    // Martial – STR or DEX primary
    'Fighter':       [18, 13, 14, 10, 12,  8 ],  // STR (25)
    'Barbarian':     [18, 15, 14, 10,  8,  8 ],  // STR
    'Bloodrager':    [18, 12, 14, 10,  8, 13 ],  // STR, CHA
    'Cavalier':      [18, 10, 14, 10, 12, 11 ],  // STR
    'Samurai':       [18, 12, 14, 10, 10, 11 ],  // STR
    'Gunslinger':    [10, 18, 14, 12, 13,  8 ],  // DEX
    'Kineticist':    [10, 16, 16, 10, 14, 10 ],  // CON, DEX

    // Skilled / DEX
    'Rogue':         [13, 18, 12, 10, 14,  8 ],  // DEX
    'Ninja':         [12, 18, 12, 10, 14,  8 ],  // DEX
    'Bard':          [ 8, 14, 12, 10, 13, 18 ],  // CHA
    'Skald':         [14, 12, 14, 10, 10, 17 ],  // CHA, STR
    'Mesmerist':     [ 8, 14, 12, 10, 15, 17 ],  // CHA

    // Divine / WIS
    'Paladin':       [16, 10, 14, 10, 10, 16 ],  // STR, CHA
    'Warpriest':     [16, 10, 14, 16, 12,  8 ],  // STR, WIS
    'Inquisitor':    [15, 14, 12, 16, 10, 11 ],  // WIS
    'Monk':          [10, 18, 12, 16, 10,  7 ],  // DEX, WIS
    'Ranger':        [14, 16, 14, 14, 12,  8 ],  // DEX, WIS

    // Occult / hybrid
    'Occultist':     [10, 14, 12, 10, 18, 11 ],  // INT
    'Spiritualist':  [ 8, 14, 12, 18, 13, 10 ],  // WIS
    'Medium':        [ 8, 14, 14, 18, 12,  8 ],  // WIS
    'Shaman':        [10, 14, 14, 17, 12, 10 ],  // WIS
    'Data Seer':     [ 8, 14, 12, 14, 18,  8 ],  // INT

    // Tech / non-core
    'Engineer':      [14, 14, 14, 10, 16, 10 ],  // INT
    'Mechanist':     [14, 14, 14, 10, 16, 10 ],
    'Tinker':        [10, 16, 12, 10, 16, 13 ],  // INT, DEX
    'Pilot':         [10, 17, 14, 12, 14, 10 ],  // DEX, INT
};

/** Default 25-point array if class unknown: balanced */
const DEFAULT_STATS_25 = [17, 14, 14, 12, 12, 8];

function pointCost(score) {
    const costs = { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 };
    return costs[score] ?? 0;
}

function totalCost(arr) {
    return arr.reduce((sum, s) => sum + pointCost(s), 0);
}

function getStatsForClass(className) {
    if (!className || !className.trim()) return DEFAULT_STATS_25;
    const key = Object.keys(CLASS_STATS_25).find(k => k.toLowerCase() === className.trim().toLowerCase());
    const arr = key ? CLASS_STATS_25[key] : DEFAULT_STATS_25;
    return [...arr];
}

function parseClass(content) {
    const m = content.match(/\*\*Class:\*\*\s*(.+)/);
    return m ? m[1].trim() : '';
}

function replaceStatsSection(content, stats) {
    const [str, dex, con, wis, int, cha] = stats;
    const newBlock = `## Stats
- **STR:** ${str}
- **DEX:** ${dex}
- **CON:** ${con}
- **WIS:** ${wis}
- **INT:** ${int}
- **CHA:** ${cha}
`;
    if (content.includes('## Stats')) {
        return content.replace(/## Stats\n[\s\S]*?(\n(?=## )|$)/, newBlock + '\n');
    }
    // Insert before ## Memory Snippets or before ## Flavor Notes or at end
    if (content.includes('## Memory Snippets')) {
        return content.replace(/(\n## Memory Snippets)/, '\n' + newBlock.trim() + '\n$1');
    }
    if (content.includes('## Flavor Notes')) {
        return content.replace(/(\n## Flavor Notes)/, '\n' + newBlock.trim() + '\n$1');
    }
    return content.trimEnd() + '\n\n' + newBlock.trim() + '\n';
}

function run() {
    if (!fs.existsSync(PERSONALITY_DIR)) {
        console.error('Personality directory not found:', PERSONALITY_DIR);
        process.exit(1);
    }

    const files = fs.readdirSync(PERSONALITY_DIR).filter(f => f.endsWith('.md')).sort();
    let updated = 0;

    for (const file of files) {
        const filePath = path.join(PERSONALITY_DIR, file);
        let content = fs.readFileSync(filePath, 'utf8');
        const className = parseClass(content);
        const stats = getStatsForClass(className);
        const cost = totalCost(stats);
        const newContent = replaceStatsSection(content, stats);
        if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            updated++;
            console.log(`  ${file}  Class: ${className || '(none)'}  → STR ${stats[0]} DEX ${stats[1]} CON ${stats[2]} WIS ${stats[3]} INT ${stats[4]} CHA ${stats[5]}  (${cost} pt)`);
        }
    }

    console.log(`\nDone. Updated ${updated} of ${files.length} personality files.`);
}

run();
