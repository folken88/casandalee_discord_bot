#!/usr/bin/env node
/**
 * Renumber persona lives chronologically: life 1 = first by birth year, life 113 = last.
 * Canon: first chronologically is Cassula (Rain of Stars), last is Casandalee (oracle).
 * Updates each file's "Life Number" and "# Life N: Name" title, and renames files to
 * NNN_suffix.md (e.g. 002_casandalee.md becomes 113_casandalee.md).
 * Uses a temp directory to avoid overwriting when new and old numbers differ.
 *
 * Run from repo root: node tools/renumber-personas-chronologically.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const TEMP_SUBDIR = '.chrono_renumber_temp';
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Parse life number, birth year, and content from a persona file.
 * @param {string} filePath - Full path to .md file
 * @param {string} baseName - Filename only (e.g. 02_casandalee.md)
 * @returns {{ lifeNumber: number|null, birthYear: number|null, filePath: string, baseName: string, content: string }}
 */
function parsePersonalityFile(filePath, baseName) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lifeNumMatch = content.match(/\*\*Life Number:\*\*\s*(\d+)/i);
    const lifeNumber = lifeNumMatch ? parseInt(lifeNumMatch[1], 10) : null;
    const birthYearMatch = content.match(/\*\*Birth Year:\*\*\s*(-?\d+)/i);
    const birthYear = birthYearMatch ? parseInt(birthYearMatch[1], 10) : null;
    return { lifeNumber, birthYear, filePath, baseName, content };
}

/**
 * Get suffix from filename (part after NN_), e.g. 02_casandalee.md -> casandalee.md
 * @param {string} baseName
 * @returns {string}
 */
function suffixFromFilename(baseName) {
    const m = baseName.match(/^\d{2}_(.+)$/);
    return m ? m[1] : baseName;
}

/**
 * Update content so Life Number and title use newNum.
 * @param {string} content - File content
 * @param {number} oldNum - Current life number
 * @param {number} newNum - New life number
 * @returns {string}
 */
function updateContentLifeNumber(content, oldNum, newNum) {
    let out = content.replace(/\*\*Life Number:\*\*\s*\d+/i, `**Life Number:** ${newNum}`);
    const titleRe = new RegExp(`^# Life ${oldNum}:\\s*(.+)$`, 'm');
    out = out.replace(titleRe, `# Life ${newNum}: $1`);
    return out;
}

function main() {
    console.log('Renumber persona lives chronologically (life 1 = first by birth, life 113 = last)\n');
    if (DRY_RUN) console.log('DRY RUN — no files will be written or renamed.\n');
    if (!fs.existsSync(PERSONALITY_DIR)) {
        console.error('Missing data/personalities');
        process.exit(1);
    }

    const files = fs.readdirSync(PERSONALITY_DIR)
        .filter(f => f.endsWith('.md') && /^\d{2}_/.test(f))
        .sort();
    const personas = files.map(f => {
        const p = parsePersonalityFile(path.join(PERSONALITY_DIR, f), f);
        return { ...p, suffix: suffixFromFilename(f) };
    }).filter(p => p.lifeNumber != null && p.birthYear != null);

    if (personas.length !== 113) {
        console.error(`Expected 113 personas with birth year; found ${personas.length}`);
        process.exit(1);
    }

    // Sort by birth year (chronological); ties broken by current life number
    personas.sort((a, b) => a.birthYear !== b.birthYear ? a.birthYear - b.birthYear : a.lifeNumber - b.lifeNumber);

    const tempDir = path.join(PERSONALITY_DIR, TEMP_SUBDIR);
    if (!DRY_RUN) {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true });
        }
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const moves = [];
    for (let i = 0; i < personas.length; i++) {
        const p = personas[i];
        const newNum = i + 1;
        const newBaseName = `${String(newNum).padStart(2, '0')}_${p.suffix}`;
        const newPath = path.join(PERSONALITY_DIR, newBaseName);
        const oldPath = p.filePath;
        const oldBaseName = p.baseName;

        if (p.lifeNumber === newNum && oldBaseName === newBaseName) {
            // No change
            continue;
        }

        moves.push({
            oldPath,
            oldBaseName,
            newPath,
            newBaseName,
            oldNum: p.lifeNumber,
            newNum,
            name: p.content.match(/^# Life \d+: (.+)$/m)?.[1]?.trim() || '?',
        });

        if (!DRY_RUN) {
            const newContent = updateContentLifeNumber(p.content, p.lifeNumber, newNum);
            const writePath = path.join(tempDir, newBaseName);
            fs.writeFileSync(writePath, newContent, 'utf8');
        }
    }

    if (moves.length > 0) {
        moves.forEach(m => {
            console.log(`Life ${m.oldNum} -> ${m.newNum} (${m.name})  ${m.oldBaseName} -> ${m.newBaseName}`);
        });
        console.log(`\n${DRY_RUN ? 'Would renumber' : 'Renumbered'} ${moves.length} persona(s).`);

        if (!DRY_RUN) {
            // Remove old files that are being replaced by a new number
            const newNames = new Set(moves.map(m => m.newBaseName));
            for (const m of moves) {
                if (m.oldBaseName !== m.newBaseName && fs.existsSync(m.oldPath)) {
                    fs.unlinkSync(m.oldPath);
                }
            }
            // Move temp files into place
            const tempFiles = fs.readdirSync(tempDir);
            for (const f of tempFiles) {
                fs.renameSync(path.join(tempDir, f), path.join(PERSONALITY_DIR, f));
            }
            fs.rmdirSync(tempDir);
        }
    } else {
        console.log('Already in chronological order; no changes.');
    }
    if (moves.length > 0 && DRY_RUN) console.log('Run without --dry-run to apply.');
}

main();
