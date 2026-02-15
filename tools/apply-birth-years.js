#!/usr/bin/env node
/**
 * Add Birth Year to personality files when missing.
 * Life 1 (Rain of Stars) = -4363; lives 2-72 = random 2050-4717 AR.
 * Run: node tools/apply-birth-years.js
 */

const fs = require('fs');
const path = require('path');

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');

const RAIN_OF_STARS = -4363;
const BIRTH_YEAR_MIN = 2050;
const BIRTH_YEAR_MAX = 4717;

function parseLifeNumber(content) {
    const m = content.match(/^# Life (\d+):/m);
    return m ? parseInt(m[1], 10) : null;
}

function hasBirthYear(content) {
    return /\*\*Birth Year:\*\*\s*-?\d+/i.test(content);
}

function getBirthYear(lifeNum) {
    return lifeNum === 1 ? RAIN_OF_STARS : BIRTH_YEAR_MIN + Math.floor(Math.random() * (BIRTH_YEAR_MAX - BIRTH_YEAR_MIN + 1));
}

function addBirthYearLine(content, lifeNum, year) {
    if (content.includes('**Life Number:**')) {
        return content.replace(/(\n-\s*\*\*Life Number:\*\*\s*\d+)/, `$1\n- **Birth Year:** ${year}`);
    }
    if (content.includes('## Identity')) {
        return content.replace(/(## Identity\n[\s\S]*?)(\n## )/, (_, block, rest) => block + `\n- **Birth Year:** ${year}` + rest);
    }
    return content;
}

function run() {
    if (!fs.existsSync(PERSONALITY_DIR)) {
        console.error('Personality directory not found:', PERSONALITY_DIR);
        process.exit(1);
    }
    const files = fs.readdirSync(PERSONALITY_DIR).filter(f => f.endsWith('.md') && f !== '00_goddess.md').sort();
    let updated = 0;
    for (const file of files) {
        const filePath = path.join(PERSONALITY_DIR, file);
        let content = fs.readFileSync(filePath, 'utf8');
        if (hasBirthYear(content)) continue;
        const lifeNum = parseLifeNumber(content);
        if (lifeNum == null) continue;
        const year = getBirthYear(lifeNum);
        content = addBirthYearLine(content, lifeNum, year);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  ${file}  Life ${lifeNum} → Birth Year ${year}`);
        updated++;
    }
    console.log(`\nDone. Added birth year to ${updated} of ${files.length} past-life files.`);
}

run();
