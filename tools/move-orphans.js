#!/usr/bin/env node
/**
 * move-orphans.js — Identify and move orphan character files to Orphans/ subfolders.
 *
 * Orphan criteria (ALL must be true):
 *   - No `player:` field in frontmatter
 *   - No real session appearance headings (### lines that aren't template)
 *   - No meaningful Notes & Updates content
 *   - Not in protected names list
 *
 * Exceptions that KEEP a file:
 *   - mentions >= 3 in frontmatter
 *   - Name matches protected list
 *
 * Destination subfolders:
 *   Orphans/Foundry Bestiary/  — foundry_synced + has HP/stats, no campaign connection
 *   Orphans/Empty Stubs/       — no real content at all
 *   Orphans/Misplaced/         — (pre-existing, not created here)
 */

const fs = require('fs');
const path = require('path');

const CHARS_DIR = path.join(__dirname, '..', 'obsidian_cass', 'cassvault', 'Characters');
const ORPHANS_DIR = path.join(CHARS_DIR, 'Orphans');
const BESTIARY_DIR = path.join(ORPHANS_DIR, 'Foundry Bestiary');
const STUBS_DIR = path.join(ORPHANS_DIR, 'Empty Stubs');
const MISPLACED_DIR = path.join(ORPHANS_DIR, 'Misplaced');

// Protected names — case-insensitive substring match against filename and frontmatter name
const PROTECTED_NAMES = [
  'Barzillai Thrune', 'Harrigan', 'Barnabas Harrigan', 'Plugg', 'Master Scourge',
  'Sandara Quinn', 'Conchobar', 'Owlbear', 'Cut-Throat Grok', 'Rickety Hake',
  'Tessa Fairwind', 'Kerdak Bonefist', 'The Hurricane King',
  'Kevoth-Kul', 'Black Sovereign', 'Technic League',
  'Count Aldred Haserton', 'Adivion Adrissant', 'Judge Embreth',
  'Petros Lorrimor', 'Kendra Lorrimor', 'The Beast',
  'Jilia Bainilus', 'Shensen', 'Laria Longroad', 'Corthos',
  'Iomedae', 'Asmodeus', 'Pharasma', 'Gorum', 'Besmara', 'Saranrae', 'Brigh', 'Desna', 'Norgorber',
  'Casandalee', 'Unity', 'Hellion', 'Meyanda', 'Khonnir Baine',
  'Whispering Tyrant', 'Tar-Baphon',
].map(n => n.toLowerCase());

// Ensure destination dirs exist
for (const dir of [ORPHANS_DIR, BESTIARY_DIR, STUBS_DIR, MISPLACED_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ─── Helpers ───

function parseFrontmatter(content) {
  const fm = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return fm;
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[m[1]] = val;
    }
  }
  return fm;
}

function isProtected(filename, fmName) {
  const base = path.basename(filename, '.md').toLowerCase();
  const name = (fmName || '').toLowerCase();
  for (const prot of PROTECTED_NAMES) {
    if (base.includes(prot) || name.includes(prot)) return true;
    // Also check if the protected name includes the file's base name (for short names like "Unity")
    if (prot === base || prot === name) return true;
  }
  return false;
}

function hasPlayerField(fm) {
  return fm.player !== undefined && fm.player !== '' && fm.player !== '""' && fm.player !== "''";
}

function getMentions(fm) {
  const v = parseInt(fm.mentions, 10);
  return isNaN(v) ? 0 : v;
}

function hasRealSessionHeadings(content) {
  // Look for ### lines that are actual session appearances (not template text)
  const lines = content.split(/\r?\n/);
  const templatePatterns = [
    /session activity from youtube/i,
    /will appear here/i,
    /no session/i,
    /^###\s*$/,
  ];
  for (const line of lines) {
    if (/^### /.test(line)) {
      const isTemplate = templatePatterns.some(p => p.test(line));
      if (!isTemplate) return true;
    }
  }
  return false;
}

function hasMeaningfulNotes(content) {
  // Extract Notes & Updates section content
  const notesMatch = content.match(/## Notes & Updates\s*\r?\n([\s\S]*?)(?=\n## |\n---|\Z)/);
  if (!notesMatch) return false;
  const notes = notesMatch[1].trim();
  if (!notes) return false;

  const placeholderPatterns = [
    /^\*?no notes yet\.?\*?$/i,
    /^\*?no session notes yet\.?\*?$/i,
    /^\*?session activity from youtube transcripts will appear here\.?\*?$/i,
    /^\*?no updates yet\.?\*?$/i,
  ];
  // Check if it's only placeholders
  const lines = notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return false;
  const allPlaceholder = lines.every(l => placeholderPatterns.some(p => p.test(l)));
  return !allPlaceholder;
}

function isFoundryBestiary(fm, content) {
  // Has foundry_synced + HP/stats but no real campaign connection
  if (!fm.foundry_synced) return false;
  if (fm.hp || /\*\*STR\*\*/.test(content) || /\*\*HP\*\*/.test(content)) return true;
  // Also check class field for creature types
  const cls = (fm.class || '').toLowerCase();
  const creatureTypes = [
    'construct', 'undead', 'outsider', 'animal', 'magical beast', 'aberration',
    'dragon', 'elemental', 'fey', 'giant', 'humanoid', 'monstrous humanoid',
    'ooze', 'plant', 'vermin', 'beast',
  ];
  if (creatureTypes.some(t => cls.includes(t))) return true;
  return false;
}

function isEmptyStub(content, fm) {
  // File with essentially no real content
  // Strip frontmatter
  const body = content.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
  if (!body) return true;

  // Strip headings, template lines, and standard boilerplate
  const meaningful = body.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => {
      if (!l) return false;
      if (/^#/.test(l)) return false; // headings
      if (/^\*\*Race:\*\*/.test(l)) return false; // race/class line
      if (/^\*\*Class:\*\*/.test(l)) return false;
      if (/^\*\*STR\*\*/.test(l)) return false; // stat line
      if (/^\*\*HP:\*\*/.test(l)) return false;
      if (/^\*?no notes yet\.?\*?$/i.test(l)) return false;
      if (/^\*?no session notes yet\.?\*?$/i.test(l)) return false;
      if (/^\*?session activity from youtube transcripts will appear here\.?\*?$/i.test(l)) return false;
      if (/^\*?no updates yet\.?\*?$/i.test(l)) return false;
      if (/^\*\*Race:\*\* Unknown \| \*\*Class:\*\* Unknown/.test(l)) return false;
      return true;
    });

  return meaningful.length === 0;
}

// ─── Main ───

const files = fs.readdirSync(CHARS_DIR)
  .filter(f => f.endsWith('.md') && !fs.statSync(path.join(CHARS_DIR, f)).isDirectory());

const counts = { bestiary: 0, stubs: 0, other: 0, kept: 0, skippedPlayer: 0, skippedProtected: 0, skippedMentions: 0, skippedSessions: 0, skippedNotes: 0 };
const moved = [];

for (const file of files) {
  const filePath = path.join(CHARS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);

  // ─── Keep checks ───

  // Has player field → PC, keep
  if (hasPlayerField(fm)) {
    counts.skippedPlayer++;
    counts.kept++;
    continue;
  }

  // Protected name
  if (isProtected(file, fm.name)) {
    counts.skippedProtected++;
    counts.kept++;
    continue;
  }

  // mentions >= 3
  if (getMentions(fm) >= 3) {
    counts.skippedMentions++;
    counts.kept++;
    continue;
  }

  // Has real session headings
  if (hasRealSessionHeadings(content)) {
    counts.skippedSessions++;
    counts.kept++;
    continue;
  }

  // Has meaningful notes
  if (hasMeaningfulNotes(content)) {
    counts.skippedNotes++;
    counts.kept++;
    continue;
  }

  // ─── This file is an orphan — classify it ───

  let dest;
  let category;

  if (isFoundryBestiary(fm, content)) {
    dest = path.join(BESTIARY_DIR, file);
    category = 'bestiary';
  } else if (isEmptyStub(content, fm)) {
    dest = path.join(STUBS_DIR, file);
    category = 'stubs';
  } else {
    // Generic orphan — put in Orphans/ root
    dest = path.join(ORPHANS_DIR, file);
    category = 'other';
  }

  // Check for collision
  if (fs.existsSync(dest)) {
    console.log(`  SKIP (already exists): ${file} → ${path.relative(CHARS_DIR, dest)}`);
    counts.kept++;
    continue;
  }

  fs.renameSync(filePath, dest);
  counts[category]++;
  moved.push({ file, dest: path.relative(CHARS_DIR, dest) });
}

// ─── Summary ───

console.log('\n=== Orphan Move Summary ===\n');
console.log(`Total .md files scanned: ${files.length}`);
console.log(`\nKept (not orphans):`);
console.log(`  Player characters:     ${counts.skippedPlayer}`);
console.log(`  Protected names:       ${counts.skippedProtected}`);
console.log(`  Mentions >= 3:         ${counts.skippedMentions}`);
console.log(`  Has session headings:  ${counts.skippedSessions}`);
console.log(`  Has meaningful notes:  ${counts.skippedNotes}`);
console.log(`  Total kept:            ${counts.kept}`);
console.log(`\nMoved to Orphans/:`);
console.log(`  Foundry Bestiary:      ${counts.bestiary}`);
console.log(`  Empty Stubs:           ${counts.stubs}`);
console.log(`  Other (Orphans root):  ${counts.other}`);
console.log(`  Total moved:           ${counts.bestiary + counts.stubs + counts.other}`);

const remaining = fs.readdirSync(CHARS_DIR)
  .filter(f => f.endsWith('.md') && !fs.statSync(path.join(CHARS_DIR, f)).isDirectory());
console.log(`\nRemaining in Characters/: ${remaining.length}`);

if (moved.length > 0 && moved.length <= 50) {
  console.log('\nMoved files:');
  for (const m of moved) {
    console.log(`  ${m.file} → ${m.dest}`);
  }
} else if (moved.length > 50) {
  console.log(`\n(${moved.length} files moved — too many to list individually)`);
}
