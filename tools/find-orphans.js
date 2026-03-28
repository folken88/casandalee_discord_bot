#!/usr/bin/env node
/**
 * find-orphans.js — Identify character files with no meaningful connections
 *
 * A character is an ORPHAN if it meets ALL criteria:
 * 1. No session appearances (no "### " headings, or only the placeholder text)
 * 2. No meaningful Notes & Updates (only placeholder text or empty)
 * 3. No wikilinks to other characters/places
 * 4. Not registered in nameResolver (src/index.js)
 *
 * Protected from orphan status:
 * - Files with player: field in frontmatter (PCs)
 * - Files with foundry_synced AND real session appearances
 * - Files already in Characters/Orphans/
 */

const fs = require('fs');
const path = require('path');

const CHARS_DIR = path.join(__dirname, '..', 'obsidian_cass', 'cassvault', 'Characters');
const INDEX_JS = path.join(__dirname, '..', 'src', 'index.js');

// --- Extract registered names from nameResolver in src/index.js ---
function getRegisteredNames() {
    const src = fs.readFileSync(INDEX_JS, 'utf-8');
    const names = new Set();
    // Match { name: 'Foo', aliases: [...] } blocks
    const nameRe = /name:\s*['"]([^'"]+)['"]/g;
    const aliasRe = /aliases:\s*\[([^\]]*)\]/g;
    let m;
    while ((m = nameRe.exec(src)) !== null) {
        names.add(m[1].toLowerCase());
    }
    while ((m = aliasRe.exec(src)) !== null) {
        const inner = m[1];
        const items = inner.match(/['"]([^'"]+)['"]/g);
        if (items) {
            for (const item of items) {
                names.add(item.replace(/['"]/g, '').toLowerCase());
            }
        }
    }
    return names;
}

// --- Parse frontmatter ---
function parseFrontmatter(content) {
    const fm = {};
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return fm;
    const block = fmMatch[1];
    for (const line of block.split('\n')) {
        const kv = line.match(/^(\w[\w_-]*):\s*(.*)/);
        if (kv) fm[kv[1]] = kv[2].trim();
    }
    return fm;
}

// --- Check criteria ---
function analyzeFile(filePath, registeredNames) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const basename = path.basename(filePath, '.md');
    const fm = parseFrontmatter(content);

    // Protected: has player: field
    if (fm.player) {
        return { orphan: false, reason: 'has player field (PC)' };
    }

    // Check name registration
    const nameLC = basename.toLowerCase();
    const fmName = (fm.name || '').replace(/^["']|["']$/g, '').toLowerCase();
    const isRegistered = registeredNames.has(nameLC) || registeredNames.has(fmName);

    if (isRegistered) {
        return { orphan: false, reason: 'registered in nameResolver' };
    }

    // --- Criterion 1: Session appearances ---
    const sessionHeadings = content.match(/^### .+/gm) || [];
    const hasRealSessions = sessionHeadings.length > 0;

    // Check if the only session content is the placeholder
    const sessionSection = content.split(/^## Session Appearances/m)[1] || '';
    const onlyPlaceholder = sessionSection.trim() === '' ||
        sessionSection.trim() === '*Session activity from YouTube transcripts will appear here.*';

    const hasMeaningfulSessions = hasRealSessions && !onlyPlaceholder;

    // Protected: foundry_synced with real sessions
    if (fm.foundry_synced && hasMeaningfulSessions) {
        return { orphan: false, reason: 'foundry_synced with real sessions' };
    }

    // --- Criterion 2: Notes & Updates ---
    const notesSection = content.split(/^## Notes & Updates/m)[1] || '';
    const notesTrimmed = notesSection.split(/^## /m)[0].trim();
    const emptyNotesPatterns = [
        '',
        '*No session notes yet.*',
        '*No notes yet.*',
        'No notes yet',
        'No session notes yet',
        '*No notes yet*',
        '*No session notes yet*',
    ];
    const hasEmptyNotes = emptyNotesPatterns.includes(notesTrimmed) ||
        notesTrimmed.startsWith('*No ');

    // Check for actual bullet-point notes (lines starting with -)
    const noteLines = notesTrimmed.split('\n').filter(l => l.trim().startsWith('-'));
    const hasMeaningfulNotes = noteLines.length > 0;

    // --- Criterion 3: Wikilinks ---
    const wikilinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
    const hasWikilinks = wikilinks.length > 0;

    // --- Combine: orphan if ALL criteria met ---
    if (!hasMeaningfulSessions && !hasMeaningfulNotes && !hasWikilinks) {
        // Categorize
        let category = 'empty template NPC';
        if (fm.foundry_synced) {
            category = 'Foundry stat block with no sessions';
        } else if (/^(a |an |the |some )/i.test(basename) || /\d+-foot/.test(basename) ||
                   /^(male|female|old|young|tall|short) /i.test(basename)) {
            category = 'generic descriptor';
        }
        return { orphan: true, category, name: basename, foundry: !!fm.foundry_synced, hp: fm.hp };
    }

    return { orphan: false, reason: 'has connections' };
}

// --- Main ---
function main() {
    const registeredNames = getRegisteredNames();
    console.log(`Registered names in nameResolver: ${registeredNames.size}`);

    // Get all .md files in Characters/ (not subdirectories)
    const allFiles = fs.readdirSync(CHARS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(CHARS_DIR, f));

    console.log(`Total character files: ${allFiles.length}\n`);

    const orphans = [];
    for (const filePath of allFiles) {
        const result = analyzeFile(filePath, registeredNames);
        if (result.orphan) {
            orphans.push(result);
        }
    }

    // Categorize
    const categories = {};
    for (const o of orphans) {
        categories[o.category] = categories[o.category] || [];
        categories[o.category].push(o);
    }

    console.log(`=== ORPHAN REPORT ===`);
    console.log(`Total files checked: ${allFiles.length}`);
    console.log(`Total orphans found: ${orphans.length}`);
    console.log(`Non-orphans: ${allFiles.length - orphans.length}\n`);

    console.log(`--- By Category ---`);
    for (const [cat, items] of Object.entries(categories).sort((a, b) => b[1].length - a[1].length)) {
        console.log(`\n${cat}: ${items.length}`);
        for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
            const extra = item.hp ? ` (HP: ${item.hp})` : '';
            console.log(`  - ${item.name}${extra}`);
        }
    }
}

main();
