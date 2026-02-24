#!/usr/bin/env node
/**
 * Verify persona continuity: no overlapping lives, no life past ascension (4717).
 * Uses Death Year when set; otherwise end = birth + DEFAULT_MAX_YEARS.
 * Lives are ordered by birth year (chronological), not life number — so life 72
 * (oracle 3983–4226) is the last chronologically.
 *
 * Run: node tools/check-persona-continuity.js
 * Fix: node tools/fix-persona-birth-years.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const DEFAULT_MAX_YEARS = 80;
const ASCENSION_YEAR = 4717;

function parsePersonalityFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const name = content.match(/^# Life \d+: (.+)$/m)?.[1]?.trim() || '';
    const lifeNumMatch = content.match(/\*\*Life Number:\*\*\s*(\d+)/i);
    const lifeNumber = lifeNumMatch ? parseInt(lifeNumMatch[1], 10) : null;
    const birthYearMatch = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)/i);
    const birthYear = birthYearMatch ? parseInt(birthYearMatch[1], 10) : null;
    const deathYearMatch = content.match(/\*\*Death Year:\*\*\s*(-?\d+)/i);
    const deathYear = deathYearMatch ? parseInt(deathYearMatch[1], 10) : null;
    return { name, lifeNumber, birthYear, deathYear };
}

function endOfLife(life) {
    if (life.deathYear != null) return life.deathYear;
    if (life.birthYear != null) return life.birthYear + DEFAULT_MAX_YEARS;
    return null;
}

function main() {
    console.log('Persona continuity (no overlap, no life past ascension 4717)\n');
    if (!fs.existsSync(PERSONALITY_DIR)) {
        console.error('Missing data/personalities');
        process.exit(1);
    }
    const files = fs.readdirSync(PERSONALITY_DIR)
        .filter(f => f.endsWith('.md') && /^\d{2}_/.test(f))
        .sort();
    const lives = files.map(f => {
        const p = parsePersonalityFile(path.join(PERSONALITY_DIR, f));
        return { file: f, ...p };
    }).filter(l => l.lifeNumber != null);

    let issues = 0;
    const overlaps = [];
    const pastAscension = [];

    // Order by birth year (chronological) so overlap check is correct (life 72 is last in time).
    const chrono = lives
        .filter(l => l.birthYear != null)
        .map(l => ({ ...l, end: endOfLife(l) }))
        .sort((a, b) => a.birthYear - b.birthYear);

    let prevEnd = -Infinity;
    for (const data of chrono) {
        const end = data.end;
        if (data.birthYear < prevEnd) {
            overlaps.push({ life: data.lifeNumber, name: data.name, file: data.file, birthYear: data.birthYear, required: prevEnd });
            issues++;
        }
        if (end != null && end > ASCENSION_YEAR) {
            pastAscension.push({ life: data.lifeNumber, name: data.name, file: data.file, end });
            issues++;
        }
        if (end != null && end > prevEnd) prevEnd = end;
    }

    if (overlaps.length > 0) {
        console.log('Overlapping lives (next life starts before previous ended):');
        overlaps.forEach(o => console.log(`  Life ${o.life} (${o.name}) birth ${o.birthYear} — should be >= ${o.required}  [${o.file}]`));
    }
    if (pastAscension.length > 0) {
        console.log('Life end past ascension (4717):');
        pastAscension.forEach(p => console.log(`  Life ${p.life} (${p.name}) end ${p.end}  [${p.file}]`));
    }
    if (issues === 0) console.log('No continuity issues.');
    console.log(`\nChecked ${lives.length} lives. Run fix-persona-birth-years.js to assign dates.`);
}

main();
