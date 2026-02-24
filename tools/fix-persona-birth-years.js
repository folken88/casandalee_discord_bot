#!/usr/bin/env node
/**
 * Fix persona birth/death years so lives do not overlap and are spread across
 * ~8000 years from Rain of Stars (-4363) to last body-death (4226).
 * - Life 1 (Cassula): canon -4363; left unchanged.
 * - Life 72 (Casandalee oracle): canon 3983–4226; left unchanged.
 * - Lives 2–71: assigned across the gap from life 1 end to life 72 start
 *   (-4362 to 3982) with even spacing (~119 years per slot, 80-year lifespans).
 * Adds/updates Death Year in persona files when assigning.
 *
 * Run from repo root: node tools/fix-persona-birth-years.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const LIFESPAN_YEARS = 80;
const DRY_RUN = process.argv.includes('--dry-run');

/** Life 1 death (Rain of Stars); life 3 starts the year after. */
const LIFE_1_END = -4363;
/** Life 72 (oracle) starts this year; life 71 must end the year before. */
const LIFE_72_BIRTH = 3983;
/** First year available for life 2 (first after Cassula). */
const SPAN_START = LIFE_1_END + 1;
/** Last year life 71 may end (year before life 72 starts). */
const SPAN_END = LIFE_72_BIRTH - 1;
/** Number of lives to place in the span (chronological lives 2–71). */
const LIVES_IN_SPAN = 70;

/**
 * Parse life number, birth year, death year, and raw content from a persona file.
 * @param {string} filePath - Path to the .md file
 * @returns {{ lifeNumber: number|null, birthYear: number|null, deathYear: number|null, filePath: string, content: string }}
 */
function parsePersonalityFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lifeNumMatch = content.match(/\*\*Life Number:\*\*\s*(\d+)/i);
    const lifeNumber = lifeNumMatch ? parseInt(lifeNumMatch[1], 10) : null;
    const birthYearMatch = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)/i);
    const birthYear = birthYearMatch ? parseInt(birthYearMatch[1], 10) : null;
    const deathYearMatch = content.match(/\*\*Death Year:\*\*\s*(-?\d+)/i);
    const deathYear = deathYearMatch ? parseInt(deathYearMatch[1], 10) : null;
    return { lifeNumber, birthYear, deathYear, filePath, content };
}

/**
 * Replace Birth Year line with new value.
 * @param {string} content - File content
 * @param {number} year - New birth year
 * @returns {string}
 */
function setBirthYearInContent(content, year) {
    return content.replace(/\*\*Birth Year:\*\*\s*-?\d+/i, `**Birth Year:** ${year}`);
}

/**
 * Set or add Death Year in content (after Birth Year line).
 * @param {string} content - File content
 * @param {number} year - New death year
 * @returns {string}
 */
function setDeathYearInContent(content, year) {
    if (/\*\*Death Year:\*\*\s*-?\d+/i.test(content)) {
        return content.replace(/\*\*Death Year:\*\*\s*-?\d+/i, `**Death Year:** ${year}`);
    }
    return content.replace(/(\*\*Birth Year:\*\*\s*-?\d+)(\s*\n)/i, `$1\n- **Death Year:** ${year}$2`);
}

/**
 * Compute canonical birth and death for a life in the middle span (chronological 2–71).
 * Spreads 70 lives across SPAN_START..SPAN_END with ~119-year spacing and 80-year lifespans.
 * @param {number} lifeNum - Life number (2..71)
 * @returns {{ birthYear: number, deathYear: number }}
 */
function spreadYearsForLife(lifeNum) {
    const index = lifeNum - 2; // 0..69
    const slotYears = Math.floor((SPAN_END - SPAN_START + 1) / LIVES_IN_SPAN); // 119
    const birthYear = SPAN_START + index * slotYears;
    const deathYear = birthYear + LIFESPAN_YEARS - 1;
    return { birthYear, deathYear };
}

function main() {
    console.log('Fix persona birth/death years — spread lives 3–72 across ~8000 years (Rain of Stars to 4226)\n');
    if (DRY_RUN) console.log('DRY RUN — no files will be written.\n');
    if (!fs.existsSync(PERSONALITY_DIR)) {
        console.error('Missing data/personalities');
        process.exit(1);
    }
    const files = fs.readdirSync(PERSONALITY_DIR)
        .filter(f => f.endsWith('.md') && /^\d{2}_/.test(f))
        .sort();
    const personas = files.map(f => parsePersonalityFile(path.join(PERSONALITY_DIR, f))).filter(p => p.lifeNumber != null);
    const byLife = new Map(personas.map(p => [p.lifeNumber, p]));
    const ordered = [...byLife.entries()].sort((a, b) => a[0] - b[0]);

    let changed = 0;
    for (const [num, p] of ordered) {
        if (num === 1 || num === 72) {
            // Canon: do not change life 1 (Cassula) or life 72 (Casandalee oracle)
            continue;
        }
        if (num >= 2 && num <= 71) {
            const { birthYear: newBirth, deathYear: newDeath } = spreadYearsForLife(num);
            const birthChanged = p.birthYear !== newBirth;
            const deathChanged = p.deathYear !== newDeath;
            if (birthChanged || deathChanged) {
                console.log(`Life ${num}: Birth ${p.birthYear ?? '?'} -> ${newBirth}, Death ${p.deathYear ?? '?'} -> ${newDeath}  [${path.basename(p.filePath)}]`);
                changed++;
                if (!DRY_RUN) {
                    let newContent = setBirthYearInContent(p.content, newBirth);
                    newContent = setDeathYearInContent(newContent, newDeath);
                    fs.writeFileSync(p.filePath, newContent, 'utf8');
                }
            }
        }
    }
    console.log(`\n${DRY_RUN ? 'Would change' : 'Changed'} ${changed} persona(s) (lives 2–71).`);
    if (changed > 0 && DRY_RUN) console.log('Run without --dry-run to apply.');
}

main();
