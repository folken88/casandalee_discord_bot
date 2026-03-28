#!/usr/bin/env node
/**
 * clean-empty-templates.js
 * Scans Characters/ vault files and removes empty template stubs that have
 * no substantive content — garbled transcript names with Unknown race/class
 * and no real session data, notes, or player assignments.
 */

const fs = require('fs');
const path = require('path');

const CHARS_DIR = path.join(__dirname, '..', 'obsidian_cass', 'cassvault', 'Characters');

// Template boilerplate lines to strip when measuring "real" content
const TEMPLATE_NOISE = [
  /^\s*$/,
  /^#+ /,                                     // markdown headers
  /^\*Session activity from YouTube transcripts will appear here\.\*$/,
  /^\*\*Race:\*\*.*\|\s*\*\*Class:\*\*/,      // **Race:** Unknown | **Class:** Unknown | **Level:** ?
  /^## Notes & Updates\s*$/,
  /^## Session Appearances\s*$/,
  /^---\s*$/,
];

// Names that should never be deleted regardless of content
const PROTECTED_NAMES = new Set([
  // Deities / major lore figures
  'Aroden', 'Asmodeus', 'Gorum', 'Pharasma', 'Iomedae', 'Desna',
  'Cayden Cailean', 'Sarenrae', 'Nethys', 'Norgorber', 'Urgathoa',
  'Tar Baphon', 'The Whispering Tyrant',
  // Known important NPCs from memory
  'Casandalee', 'Cass', 'Unity', 'Kevoth-Kul',
]);

function parseFrontmatter(content) {
  const fm = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: fm, body: content };
  const fmBlock = match[1];
  const body = content.slice(match[0].length).trim();

  for (const line of fmBlock.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      let val = kv[2].trim();
      // strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[kv[1]] = val;
    }
  }
  return { frontmatter: fm, body };
}

function getSubstantiveContent(body) {
  const lines = body.split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (TEMPLATE_NOISE.some(rx => rx.test(trimmed))) continue;
    if (trimmed.length > 0) kept.push(trimmed);
  }
  return kept.join('\n');
}

function hasSessionAppearances(body) {
  // Look for ### session headers that have content after them
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^### /.test(lines[i].trim())) {
      // Check if there's actual content in the next few lines
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trim();
        if (next.length > 0 && !next.startsWith('#') && !next.startsWith('*Session activity')) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasPlayerAssignment(content) {
  return /player:\s*["']?\w/i.test(content);
}

function shouldDelete(filePath, content) {
  const { frontmatter, body } = parseFrontmatter(content);
  const name = frontmatter.name || path.basename(filePath, '.md');

  // Never delete protected names
  if (PROTECTED_NAMES.has(name)) return { del: false, reason: 'protected name' };

  // Never delete if player assigned
  if (hasPlayerAssignment(content)) return { del: false, reason: 'has player assignment' };

  // Check race and class
  const race = (frontmatter.race || '').toLowerCase();
  const cls = (frontmatter.class || '').toLowerCase();
  const raceUnknown = !race || race === 'unknown' || race === '?';
  const classUnknown = !cls || cls === 'unknown' || cls === '?';

  // Also check inline **Race:** Unknown pattern
  const inlineUnknown = /\*\*Race:\*\*\s*Unknown.*\*\*Class:\*\*\s*Unknown/.test(body);
  const bothUnknown = (raceUnknown && classUnknown) || inlineUnknown;

  // Get substantive content (non-template, non-header text)
  const substance = getSubstantiveContent(body);

  // Has real session appearances?
  const hasSessions = hasSessionAppearances(body);

  // Decision: delete if both unknown AND substance is under 100 chars AND no session appearances
  if (bothUnknown && substance.length < 100 && !hasSessions) {
    return { del: true, reason: `race/class Unknown, body=${substance.length} chars, no sessions` };
  }

  // Also catch files where body is extremely short with no real content at all
  if (substance.length < 30 && !hasSessions && !hasPlayerAssignment(content)) {
    return { del: true, reason: `near-empty body (${substance.length} chars), no sessions` };
  }

  return { del: false, reason: `substance=${substance.length} chars, sessions=${hasSessions}` };
}

function main() {
  const files = fs.readdirSync(CHARS_DIR).filter(f => f.endsWith('.md'));
  console.log(`Scanning ${files.length} character files in ${CHARS_DIR}\n`);

  const toDelete = [];
  const kept = [];

  for (const file of files) {
    const filePath = path.join(CHARS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = shouldDelete(filePath, content);
    if (result.del) {
      toDelete.push({ file, reason: result.reason });
    } else {
      kept.push({ file, reason: result.reason });
    }
  }

  if (toDelete.length === 0) {
    console.log('No empty template files found to delete.');
    return;
  }

  console.log(`=== FILES TO DELETE (${toDelete.length}) ===\n`);
  for (const { file, reason } of toDelete) {
    console.log(`  DELETE: ${file}`);
    console.log(`          ${reason}`);
  }

  console.log(`\n=== DELETING ${toDelete.length} files ===\n`);
  let deleted = 0;
  for (const { file } of toDelete) {
    const filePath = path.join(CHARS_DIR, file);
    try {
      fs.unlinkSync(filePath);
      deleted++;
    } catch (err) {
      console.error(`  ERROR deleting ${file}: ${err.message}`);
    }
  }

  console.log(`\nDone. Deleted ${deleted}/${toDelete.length} empty template files.`);
  console.log(`Kept ${kept.length} files with real content.`);
}

main();
