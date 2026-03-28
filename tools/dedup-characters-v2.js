#!/usr/bin/env node
/**
 * dedup-characters-v2.js
 *
 * Deduplicates character files in obsidian_cass/cassvault/Characters/
 * - Deletes garbage/stub files
 * - Merges alias files into canonical targets (unique notes only)
 * - Moves misplaced files to correct directories
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', 'obsidian_cass', 'cassvault');
const CHARS = path.join(VAULT, 'Characters');

const stats = { deleted: 0, merged: 0, moved: 0, skipped: 0, errors: [] };

// ─── HELPERS ───────────────────────────────────────────────────────────────

function charPath(name) {
  return path.join(CHARS, name);
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    stats.errors.push(`READ FAIL: ${filePath} — ${e.message}`);
    return null;
  }
}

function safeDelete(filePath, label) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP (not found): ${label}`);
      stats.skipped++;
      return false;
    }
    fs.unlinkSync(filePath);
    console.log(`  DELETED: ${label}`);
    stats.deleted++;
    return true;
  } catch (e) {
    stats.errors.push(`DELETE FAIL: ${label} — ${e.message}`);
    return false;
  }
}

/**
 * Extract bullet points from all "## Notes & Updates" sections in a file.
 * Returns an array of trimmed bullet strings (without leading "- ").
 */
function extractNotes(content) {
  if (!content) return [];
  const notes = [];
  const lines = content.split('\n');
  let inNotes = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect start of Notes section
    if (/^##\s+Notes\s*&\s*Updates/i.test(trimmed)) {
      inNotes = true;
      continue;
    }
    // Detect start of another section (end of Notes)
    if (inNotes && /^##\s+/.test(trimmed) && !/^##\s+Notes/i.test(trimmed)) {
      inNotes = false;
      continue;
    }
    // Collect bullet points
    if (inNotes && trimmed.startsWith('- ')) {
      notes.push(trimmed.slice(2).trim());
    }
  }
  return notes;
}

/**
 * Extract Session Appearances sections (everything after "## Session Appearances").
 * Returns array of lines.
 */
function extractSessionAppearances(content) {
  if (!content) return [];
  const lines = content.split('\n');
  const sessions = [];
  let inSessions = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+Session\s+Appearances/i.test(trimmed)) {
      inSessions = true;
      continue;
    }
    if (inSessions) {
      sessions.push(line);
    }
  }
  return sessions;
}

/**
 * Normalize a note string for dedup comparison.
 * Strips source tags, collapses whitespace, lowercases.
 */
function normalizeNote(note) {
  return note
    .replace(/\s*\*\(.*?\)\*\s*/g, '')     // strip *(source)* tags
    .replace(/\s*\(merged from.*?\)\s*/g, '') // strip (merged from X)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Check if a note's content already appears in the target's existing notes.
 * Uses substring matching on normalized text to catch duplicates even with
 * slightly different source tags.
 */
function isNoteDuplicate(noteNorm, existingNormed) {
  if (!noteNorm || noteNorm.length < 10) return true; // skip trivially short
  for (const existing of existingNormed) {
    // Check if one contains the other (handles partial duplicates)
    if (existing.includes(noteNorm) || noteNorm.includes(existing)) {
      return true;
    }
    // Also check first 80 chars match (catches near-duplicates)
    const a = noteNorm.slice(0, 80);
    const b = existing.slice(0, 80);
    if (a === b) return true;
  }
  return false;
}

/**
 * Merge source file into target file, then delete source.
 * Only appends notes from source that are genuinely new.
 */
function mergeFiles(sourceName, targetName, sourceLabel) {
  const srcPath = charPath(sourceName);
  const tgtPath = charPath(targetName);

  if (!fs.existsSync(srcPath)) {
    console.log(`  SKIP (source not found): ${sourceName}`);
    stats.skipped++;
    return;
  }
  if (!fs.existsSync(tgtPath)) {
    stats.errors.push(`MERGE FAIL: target ${targetName} not found`);
    return;
  }

  const srcContent = safeRead(srcPath);
  const tgtContent = safeRead(tgtPath);
  if (!srcContent || !tgtContent) return;

  // Extract notes from source
  const srcNotes = extractNotes(srcContent);

  // Extract session appearances from source
  const srcSessions = extractSessionAppearances(srcContent);

  // Build normalized set of existing target notes
  const tgtNotes = extractNotes(tgtContent);
  const tgtNormed = tgtNotes.map(normalizeNote);

  // Also include target session text in dedup check
  const tgtSessionText = extractSessionAppearances(tgtContent).join('\n').toLowerCase();

  // Find genuinely new notes
  const newNotes = [];
  for (const note of srcNotes) {
    const norm = normalizeNote(note);
    if (isNoteDuplicate(norm, tgtNormed)) continue;
    // Also check if the note content appears in session appearances
    if (tgtSessionText.includes(norm.slice(0, 60))) continue;
    newNotes.push(note);
  }

  // Find genuinely new session appearances
  const tgtSessionLines = extractSessionAppearances(tgtContent);
  const tgtSessionNormed = tgtSessionLines.map(l => l.trim().toLowerCase());
  const newSessionLines = [];
  for (const line of srcSessions) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase();
    // Skip if already in target sessions
    if (tgtSessionNormed.some(t => t.includes(norm) || norm.includes(t))) continue;
    // Skip placeholder text
    if (norm.includes('session activity from youtube transcripts will appear here')) continue;
    newSessionLines.push(line);
  }

  let updated = tgtContent;

  // Append new notes to the FIRST "## Notes & Updates" section
  if (newNotes.length > 0) {
    const tag = `*(merged from ${sourceLabel || sourceName})*`;
    const notesBlock = newNotes.map(n => `- ${n} ${tag}`).join('\n');

    // Find the first Notes & Updates section and append after its last bullet
    const notesMatch = updated.match(/(## Notes & Updates\n)([\s\S]*?)(\n## |\n\*Session|\n$)/);
    if (notesMatch) {
      const sectionEnd = updated.indexOf(notesMatch[3], updated.indexOf(notesMatch[0]));
      updated = updated.slice(0, sectionEnd) + '\n' + notesBlock + '\n' + updated.slice(sectionEnd);
    } else {
      // Fallback: append before ## Session Appearances
      const sessIdx = updated.indexOf('## Session Appearances');
      if (sessIdx !== -1) {
        updated = updated.slice(0, sessIdx) + '## Notes & Updates\n\n' + notesBlock + '\n\n' + updated.slice(sessIdx);
      }
    }
  }

  // Append new session appearances
  if (newSessionLines.length > 0) {
    const sessIdx = updated.lastIndexOf('## Session Appearances');
    if (sessIdx !== -1) {
      // Find the end of the session section
      const afterSess = updated.slice(sessIdx);
      updated = updated.slice(0, sessIdx) + afterSess.trimEnd() + '\n\n' + newSessionLines.join('\n') + '\n';
    }
  }

  // Write updated target
  fs.writeFileSync(tgtPath, updated, 'utf8');

  // Delete source
  fs.unlinkSync(srcPath);

  const noteInfo = newNotes.length > 0 ? `${newNotes.length} new notes` : 'no new notes';
  const sessInfo = newSessionLines.length > 0 ? `, ${newSessionLines.length} new session lines` : '';
  console.log(`  MERGED: ${sourceName} -> ${targetName} (${noteInfo}${sessInfo})`);
  stats.merged++;
}

// ─── STEP 1: DELETE GARBAGE FILES ──────────────────────────────────────────

console.log('\n=== STEP 1: Deleting garbage/stub files ===\n');

const deleteList = [
  '__.md', 'f.md', 'ay.md', 'H.md', 'K.md', 'TR.md', 'DM.md', 'Bro.md',
  'Eastern.md', 'South.md', 'Edge.md', 'Heart.md', 'Hell.md', 'Church.md',
  'Meeting.md', 'Test.md', 'Temple.md', 'Chaos.md', 'Pride.md', 'Witch.md',
  'Ghost.md', 'Fish.md', 'Rust.md', 'Silver.md', 'Deva.md', 'River.md',
  'Ashes.md', 'Twins.md', 'Morg.md', 'Gala.md', 'Kov.md', 'Drus.md',
  'Dida.md', 'Ang.md', 'Aolm.md', 'Ionic.md', 'Coca.md', 'Sor.md',
  'Sid.md', 'Isuma.md', 'Raa.md', 'Rea.md', 'Corrine.md', 'Croden.md',
  'Crones.md', 'Denva.md', 'Dinvin.md', 'Fira.md', 'Gasbar.md',
  'Hearsick.md', 'Jim.md', 'Kalin.md', 'Kate.md', 'Kavala.md', 'Kayn.md',
  'Kira.md', 'Krabar.md', 'Krastus.md', 'Kyda.md', 'Bob.md', 'Tero.md',
  'Teru.md', 'Crocodile.md', 'Tyrannosaur.md', 'Saisea.md', 'Manticce.md',
  'Azuma.md', 'Jason.md', 'Acaden.md', 'Broken.md', 'Ryan.md',
  'Cerab Beth.md', 'Mathusse.md', 'Mattisse.md', 'Rissa.md',
  'Rissa Conetta.md', 'Stogram.md', 'Storrim.md', 'Unicorns.md',
  'Wolfies.md', 'Paladins.md', 'ncth.md', 'North.md', 'Feld grow.md',
  'North Guard.md', 'Tidewater Rock.md', 'Shudderwood.md', 'Coen.md'
];

for (const file of deleteList) {
  safeDelete(charPath(file), file);
}

// Also delete "The Whispering Way.md" (already in Campaign Lore)
safeDelete(charPath('The Whispering Way.md'), 'The Whispering Way.md (already in Campaign Lore)');

// ─── STEP 2: MERGE FILES ──────────────────────────────────────────────────

console.log('\n=== STEP 2: Merging alias files into canonical entries ===\n');

const merges = [
  // [source, target, label]
  ['Sha Feng.md', 'Sha-Feng.md', 'Sha Feng'],
  ['Buhan.md', 'Bujon.md', 'Buhan'],
  ['Buhon.md', 'Bujon.md', 'Buhon'],
  ['Riarcha.md', 'Rhyarca.md', 'Riarcha'],
  ['Riarchus.md', 'Rhyarca.md', 'Riarchus'],
  ['Riarka.md', 'Rhyarca.md', 'Riarka'],
  ['Gasar.md', 'Gaspar.md', 'Gasar'],
  ['Dena.md', 'Dinvaya.md', 'Dena'],
  ['Dena Danger Dismus.md', 'Dinvaya.md', 'Dena Danger Dismus'],
  ['Olen.md', 'Holden.md', 'Olen'],
  ['Kai Dismus.md', 'Dismas.md', 'Kai Dismus'],
  ['Reed.md', 'Reese.md', 'Reed'],
  ['Orrin.md', 'Orin.md', 'Orrin'],
  ['Orin Brood.md', 'Auren Vrood.md', 'Orin Brood'],
  ['Orin Vud.md', 'Auren Vrood.md', 'Orin Vud'],
  ['Eston.md', 'Estovion Lozarov.md', 'Eston'],
  ['Elod.md', 'Elodie.md', 'Elod'],
  ['alred.md', 'Ulfred.md', 'alred'],
  ['Ulr.md', 'Ulfred.md', 'Ulr'],
  ['garone.md', 'Garon.md', 'garone'],
  ['Nam cath.md', 'Nomkath.md', 'Nam cath'],
  ['Nom cath.md', 'Nomkath.md', 'Nom cath'],
  ['Nomad.md', 'Nomkath.md', 'Nomad'],
  ['Cass Sandel.md', 'Casandalee.md', 'Cass Sandel'],
  ['McInness.md', 'Maginnis.md', 'McInness'],
  ['Acrin.md', 'Corin.md', 'Acrin'],
  ['Sabrisa.md', 'Cybrisa Dorzhanev.md', 'Sabrisa'],
  ['Serona.md', 'Sirona.md', 'Serona'],
  ['Lady Augusta.md', 'Lady of Tidewater Rock.md', 'Lady Augusta'],
  ['Lady Smithy.md', 'Lady of Tidewater Rock.md', 'Lady Smithy'],
  ['Mr danger.md', 'Danger.md', 'Mr danger'],
  ['Blackwood.md', 'Kate Blackwood.md', 'Blackwood'],
  ['VOR Stags.md', 'Vorgstag.md', 'VOR Stags'],
  ['Aapol.md', 'Aapo.md', 'Aapol'],
  ['Bent Peak.md', 'Bent Beak.md', 'Bent Peak'],
  ['Bessie.md', 'Becki.md', 'Bessie'],
  ['Captain Pool.md', 'Captain Poor.md', 'Captain Pool'],
  ['Damid.md', 'Judge Embreth Darymid.md', 'Damid'],
  ['Judge Darymid.md', 'Judge Embreth Darymid.md', 'Judge Darymid'],
  ['Shaong.md', 'Sha-Feng.md', 'Shaong'],
  ['Farrah Richton.md', 'Farrah Delilah Richton.md', 'Farrah Richton'],
];

for (const [src, tgt, label] of merges) {
  mergeFiles(src, tgt, label);
}

// ─── STEP 3: MOVE FILES ───────────────────────────────────────────────────

console.log('\n=== STEP 3: Moving misplaced files ===\n');

function moveFile(srcName, destPath, label) {
  const srcPath = charPath(srcName);
  if (!fs.existsSync(srcPath)) {
    console.log(`  SKIP (not found): ${srcName}`);
    stats.skipped++;
    return;
  }
  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  try {
    fs.renameSync(srcPath, destPath);
    console.log(`  MOVED: ${srcName} -> ${path.relative(VAULT, destPath)}`);
    stats.moved++;
  } catch (e) {
    stats.errors.push(`MOVE FAIL: ${label} — ${e.message}`);
  }
}

moveFile('Chastel.md', path.join(VAULT, 'Places', 'Ustalav', 'Chastel.md'), 'Chastel -> Places/Ustalav/');
moveFile('Scrapwall Orcs.md', path.join(VAULT, 'Campaign Lore', 'Scrapwall Orcs.md'), 'Scrapwall Orcs -> Campaign Lore/');

// ─── SUMMARY ───────────────────────────────────────────────────────────────

console.log('\n=== SUMMARY ===\n');
console.log(`  Deleted: ${stats.deleted}`);
console.log(`  Merged:  ${stats.merged}`);
console.log(`  Moved:   ${stats.moved}`);
console.log(`  Skipped: ${stats.skipped}`);
if (stats.errors.length > 0) {
  console.log(`\n  ERRORS (${stats.errors.length}):`);
  for (const err of stats.errors) {
    console.log(`    - ${err}`);
  }
}
console.log('\nDone.');
