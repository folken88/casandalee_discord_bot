#!/usr/bin/env node
/**
 * dedup-characters-v3.js
 * Phase 1: Merge duplicate character files into canonical entries
 * Phase 2: Move orphan files to Characters/Orphans/
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', 'obsidian_cass', 'cassvault', 'Characters');
const ORPHAN_DIR = path.join(VAULT, 'Orphans');

const log = [];
function report(msg) {
  console.log(msg);
  log.push(msg);
}

function fileExists(name) {
  return fs.existsSync(path.join(VAULT, name));
}

function readFile(name) {
  const fp = path.join(VAULT, name);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, 'utf-8');
}

function writeFile(name, content) {
  fs.writeFileSync(path.join(VAULT, name), content, 'utf-8');
}

function deleteFile(name) {
  const fp = path.join(VAULT, name);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    report(`  DELETED: ${name}`);
  }
}

function moveToOrphans(name) {
  const src = path.join(VAULT, name);
  const dst = path.join(ORPHAN_DIR, name);
  if (!fs.existsSync(src)) return false;
  fs.renameSync(src, dst);
  report(`  ORPHANED: ${name}`);
  return true;
}

function fileSize(name) {
  const fp = path.join(VAULT, name);
  if (!fs.existsSync(fp)) return 0;
  return fs.statSync(fp).size;
}

// --- Parsing helpers ---

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: '', body: content, fmObj: {} };
  const fmText = match[1];
  const body = match[2];
  // Simple YAML-ish parser for our frontmatter
  const fmObj = {};
  for (const line of fmText.split('\n')) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (m) {
      fmObj[m[1]] = m[2].trim();
    }
  }
  return { fm: fmText, body, fmObj };
}

function extractNoteBullets(body) {
  // Extract all bullet points from "## Notes & Updates" sections
  const bullets = [];
  const lines = body.split('\n');
  let inNotes = false;
  for (const line of lines) {
    if (/^## Notes & Updates/.test(line)) {
      inNotes = true;
      continue;
    }
    if (/^## /.test(line) && !/^## Notes & Updates/.test(line)) {
      inNotes = false;
      continue;
    }
    if (inNotes && /^- /.test(line)) {
      bullets.push(line.trim());
    }
  }
  return [...new Set(bullets)]; // deduplicate
}

function extractSessionAppearances(body) {
  // Extract session appearance blocks (### heading + content)
  const sessions = [];
  const lines = body.split('\n');
  let inSessionSection = false;
  let currentSession = null;

  for (const line of lines) {
    if (/^## Session Appearances/.test(line)) {
      inSessionSection = true;
      continue;
    }
    if (/^## /.test(line) && !/^## Session Appearances/.test(line)) {
      if (currentSession) sessions.push(currentSession);
      inSessionSection = false;
      currentSession = null;
      continue;
    }
    if (inSessionSection) {
      if (/^### /.test(line)) {
        if (currentSession) sessions.push(currentSession);
        currentSession = { heading: line.trim(), content: [] };
      } else if (currentSession && line.trim() && !line.trim().startsWith('*Session activity')) {
        currentSession.content.push(line);
      }
    }
  }
  if (currentSession) sessions.push(currentSession);
  return sessions;
}

function getExistingSessionHeadings(body) {
  const headings = new Set();
  const lines = body.split('\n');
  let inSessionSection = false;
  for (const line of lines) {
    if (/^## Session Appearances/.test(line)) {
      inSessionSection = true;
      continue;
    }
    if (/^## /.test(line) && !/^## Session Appearances/.test(line)) {
      inSessionSection = false;
      continue;
    }
    if (inSessionSection && /^### /.test(line)) {
      headings.add(line.trim());
    }
  }
  return headings;
}

function normalizeForComparison(text) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase().substring(0, 80);
}

function mergeIntoCanonical(canonicalName, duplicateNames, frontmatterUpdates = {}) {
  report(`\nMERGE GROUP: ${canonicalName}`);

  const canonicalContent = readFile(canonicalName);
  if (!canonicalContent) {
    report(`  WARNING: Canonical file ${canonicalName} not found, skipping`);
    return;
  }

  const { fm: canonFm, body: canonBody } = parseFrontmatter(canonicalContent);
  const existingBullets = new Set(extractNoteBullets(canonBody).map(normalizeForComparison));
  const existingHeadings = getExistingSessionHeadings(canonBody);

  let newBullets = [];
  let newSessions = [];

  for (const dupName of duplicateNames) {
    if (!fileExists(dupName)) {
      report(`  SKIP (not found): ${dupName}`);
      continue;
    }

    const dupContent = readFile(dupName);
    const { body: dupBody } = parseFrontmatter(dupContent);

    // Collect unique note bullets
    const dupBullets = extractNoteBullets(dupBody);
    for (const b of dupBullets) {
      if (!existingBullets.has(normalizeForComparison(b))) {
        existingBullets.add(normalizeForComparison(b));
        newBullets.push(b);
      }
    }

    // Collect unique session appearances
    const dupSessions = extractSessionAppearances(dupBody);
    for (const sess of dupSessions) {
      if (!existingHeadings.has(sess.heading)) {
        existingHeadings.add(sess.heading);
        newSessions.push(sess);
      }
    }

    report(`  Merged from: ${dupName} (${dupBullets.length} bullets, ${dupSessions.length} sessions)`);
  }

  // Now rebuild the canonical file with appended content
  let updatedContent = canonicalContent;

  // Apply frontmatter updates
  if (Object.keys(frontmatterUpdates).length > 0) {
    let { fm, body } = parseFrontmatter(updatedContent);
    let fmLines = fm.split('\n');

    for (const [key, value] of Object.entries(frontmatterUpdates)) {
      const existingIdx = fmLines.findIndex(l => l.startsWith(key + ':'));
      const formattedValue = typeof value === 'string' ? `"${value}"` :
                             Array.isArray(value) ? JSON.stringify(value) : value;
      if (existingIdx >= 0) {
        fmLines[existingIdx] = `${key}: ${formattedValue}`;
      } else {
        // Add before tags line, or at end
        const tagsIdx = fmLines.findIndex(l => l.startsWith('tags:'));
        if (tagsIdx >= 0) {
          fmLines.splice(tagsIdx, 0, `${key}: ${formattedValue}`);
        } else {
          fmLines.push(`${key}: ${formattedValue}`);
        }
      }
    }

    updatedContent = `---\n${fmLines.join('\n')}\n---\n${body}`;
  }

  // Append new bullets to Notes & Updates section
  if (newBullets.length > 0) {
    // Find the last "## Notes & Updates" section and append before next ##
    const lines = updatedContent.split('\n');
    let lastNotesIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^## Notes & Updates/.test(lines[i])) {
        lastNotesIdx = i;
        break;
      }
    }

    if (lastNotesIdx >= 0) {
      // Find the end of this Notes section
      let insertIdx = lines.length;
      for (let i = lastNotesIdx + 1; i < lines.length; i++) {
        if (/^## /.test(lines[i]) && !/^## Notes & Updates/.test(lines[i])) {
          insertIdx = i;
          break;
        }
      }
      // Insert new bullets before the next section
      const bulletLines = newBullets.map(b => b);
      lines.splice(insertIdx, 0, ...bulletLines);
      updatedContent = lines.join('\n');
    }

    report(`  Added ${newBullets.length} unique note bullets`);
  }

  // Append new session appearances
  if (newSessions.length > 0) {
    const lines = updatedContent.split('\n');
    // Find "## Session Appearances" section
    let sessIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^## Session Appearances/.test(lines[i])) {
        sessIdx = i;
        break;
      }
    }

    if (sessIdx >= 0) {
      // Remove placeholder text if present
      const placeholderIdx = lines.findIndex((l, i) => i > sessIdx && l.includes('*Session activity from YouTube transcripts will appear here.*'));
      if (placeholderIdx >= 0) {
        lines.splice(placeholderIdx, 1);
      }

      // Append sessions at end of file (after Session Appearances section)
      const sessionLines = [];
      for (const sess of newSessions) {
        sessionLines.push('');
        sessionLines.push(sess.heading);
        for (const line of sess.content) {
          sessionLines.push(line);
        }
      }
      lines.push(...sessionLines);
      updatedContent = lines.join('\n');
    }

    report(`  Added ${newSessions.length} unique session appearances`);
  }

  // Remove duplicate "## Notes & Updates" sections (keep content from all, but under one heading)
  updatedContent = deduplicateNoteSections(updatedContent);

  writeFile(canonicalName, updatedContent);

  // Delete duplicate files
  for (const dupName of duplicateNames) {
    deleteFile(dupName);
  }
}

function deduplicateNoteSections(content) {
  const lines = content.split('\n');
  const result = [];
  let notesSectionCount = 0;
  let inDuplicateNotes = false;
  let collectedBullets = new Set();
  let firstNotesIdx = -1;
  let bulletsToAppend = [];

  // First pass: identify all Notes sections and collect unique bullets
  for (let i = 0; i < lines.length; i++) {
    if (/^## Notes & Updates/.test(lines[i])) {
      notesSectionCount++;
      if (notesSectionCount === 1) {
        firstNotesIdx = i;
        result.push(lines[i]);
      } else {
        inDuplicateNotes = true;
      }
      continue;
    }
    if (inDuplicateNotes) {
      if (/^## /.test(lines[i])) {
        inDuplicateNotes = false;
        result.push(lines[i]);
        continue;
      }
      // Collect bullets from duplicate Notes sections
      if (/^- /.test(lines[i])) {
        const norm = normalizeForComparison(lines[i]);
        if (!collectedBullets.has(norm)) {
          collectedBullets.add(norm);
          bulletsToAppend.push(lines[i]);
        }
      }
      continue;
    }
    if (notesSectionCount === 1 && firstNotesIdx >= 0 && /^- /.test(lines[i])) {
      collectedBullets.add(normalizeForComparison(lines[i]));
    }
    result.push(lines[i]);
  }

  // Insert collected unique bullets from duplicate sections
  if (bulletsToAppend.length > 0 && firstNotesIdx >= 0) {
    // Find end of first Notes section in result
    let insertAt = result.length;
    for (let i = firstNotesIdx + 1; i < result.length; i++) {
      if (/^## /.test(result[i]) && !/^## Notes & Updates/.test(result[i])) {
        insertAt = i;
        break;
      }
    }
    result.splice(insertAt, 0, ...bulletsToAppend);
  }

  return result.join('\n');
}

// ============================================================
// PHASE 1: MERGES
// ============================================================

report('=== PHASE 1: MERGES ===');

// 1. Storgrim
mergeIntoCanonical('Storgrim.md', ['Stor Grim.md', 'Store Grim.md'], { player: 'Daemon' });

// 2. Maginnis
const magDups = ['McGinnis.md', 'Toca McGinnis.md'];
if (fileExists('Tokala and Maginnis.md')) magDups.push('Tokala and Maginnis.md');
mergeIntoCanonical('Maginnis.md', magDups, { player: 'Hans' });

// 3. Dinvaya
const dinDups = ['Denva.md', 'Denva Denise.md', 'Denva Sylvia.md', 'Denvaya.md'];
// Also check Dinvaya Denva
if (fileExists('Dinvaya Denva.md')) dinDups.push('Dinvaya Denva.md');
mergeIntoCanonical('Dinvaya.md', dinDups, { campaign: ['IG', 'CC'], player: 'Josh' });

// 4. Rhyarca Jillyr
mergeIntoCanonical('Rhyarca Jillyr.md', ['Rhyarca.md']);

// 5. Abrogail Thrune II
mergeIntoCanonical('Abrogail Thrune II.md', ['Abrogail.md']);

// 6. 5th Sword Knight
mergeIntoCanonical('5th Sword Knight.md', ['Fifth Sword Knight.md']);

// 7. Sila Desaulis
if (fileExists('Sila Desaulis (MIA).md') && fileExists('Sila Desaulis MIA.md')) {
  const s1 = fileSize('Sila Desaulis (MIA).md');
  const s2 = fileSize('Sila Desaulis MIA.md');
  if (s1 >= s2) {
    mergeIntoCanonical('Sila Desaulis (MIA).md', ['Sila Desaulis MIA.md']);
  } else {
    mergeIntoCanonical('Sila Desaulis MIA.md', ['Sila Desaulis (MIA).md']);
  }
}

// 8. Olbryn
{
  const variants = ['Olbryn (josh).md', 'Olbryn josh.md'];
  const existing = variants.filter(v => fileExists(v));
  if (fileExists('Olbryn.md') && existing.length > 0) {
    mergeIntoCanonical('Olbryn.md', existing);
  }
}

// 9. Mr Brow
{
  const variants = ['Mr Brow (enrique).md', 'Mr Brow enrique.md', 'Mr Brow (Olbryn).md'];
  const existing = variants.filter(v => fileExists(v));
  if (fileExists('Mr Brow.md') && existing.length > 0) {
    mergeIntoCanonical('Mr Brow.md', existing);
  }
}

// 10. Bertram Iron Bert Smythee
{
  const v1 = 'Bertram -Iron Bert- Smythee.md';
  const v2 = 'Bertram Iron Bert Smythee.md';
  if (fileExists(v1) && fileExists(v2)) {
    const s1 = fileSize(v1);
    const s2 = fileSize(v2);
    if (s1 >= s2) {
      mergeIntoCanonical(v1, [v2]);
    } else {
      mergeIntoCanonical(v2, [v1]);
    }
  }
}

// ============================================================
// PHASE 2: ORPHAN SWEEP
// ============================================================

report('\n=== PHASE 2: ORPHAN SWEEP ===');

if (!fs.existsSync(ORPHAN_DIR)) {
  fs.mkdirSync(ORPHAN_DIR, { recursive: true });
  report('Created Orphans/ directory');
}

// Specific files to orphan (locations/orgs mistakenly in Characters)
const specificOrphans = [
  '-Slippery- Syl Lonegan.md',
  '-Slippery- Syl Lonegan - DEAD.md',
  'House Thrune.md',
  'Abernathys house.md',
  'Midnight Temple.md',
  'Temple.md',
  'Inner Sea.md',
  'Uskwood Inn.md',
];

report('\n--- Specific orphan moves ---');
for (const name of specificOrphans) {
  if (fileExists(name)) {
    moveToOrphans(name);
  }
}

// Generic orphan detection
report('\n--- Auto-detected orphans ---');

const templateTexts = [
  'no notes yet',
  'session activity from youtube transcripts will appear here',
  'information will be added as cass learns more',
  'no session notes yet',
];

const garbledNamePatterns = [
  /^[A-Z]\.md$/,             // Single letter
  /^[A-Z]{1,2}\.md$/,        // 1-2 letters
  /^A [a-z]+ [a-z]*\.md$/i,  // "A barbarian", "A female bard"
  /^An? .+\.md$/i,            // "An unnamed..."
  /^The .+\.md$/i,            // "The ..."
];

// Known players to protect
const knownPlayers = ['daemon', 'hans', 'josh', 'mandi', 'enrique', 'will', 'nick',
  'kyle', 'toby', 'tobias', 'dan', 'danny', 'sarah', 'mike', 'michael'];

const allFiles = fs.readdirSync(VAULT).filter(f => f.endsWith('.md') && !f.startsWith('.'));
let orphanCount = 0;

for (const name of allFiles) {
  const fp = path.join(VAULT, name);
  const stat = fs.statSync(fp);

  // Skip directories
  if (stat.isDirectory()) continue;

  // Must be under 400 bytes
  if (stat.size >= 400) continue;

  const content = readFile(name);
  if (!content) continue;

  const { fmObj, body } = parseFrontmatter(content);

  // Check race and class are both Unknown
  const race = (fmObj.race || '').replace(/"/g, '').toLowerCase();
  const cls = (fmObj.class || '').replace(/"/g, '').toLowerCase();
  if (race !== 'unknown' || cls !== 'unknown') continue;

  // Check for known player
  const player = (fmObj.player || '').replace(/"/g, '').toLowerCase();
  if (player && knownPlayers.includes(player)) continue;

  // Check for foundry sync
  if (fmObj.foundry_synced) continue;

  // Check notes are empty/template
  const bodyLower = body.toLowerCase();
  const hasRealNotes = bodyLower.split('\n').some(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('**') || trimmed.startsWith('*Session')) return false;
    if (templateTexts.some(t => trimmed.includes(t))) return false;
    if (trimmed === '*no notes yet. information will be added as cass learns more from conversations and sessions.*') return false;
    if (/^\*no notes yet/i.test(trimmed)) return false;
    if (/^- /.test(trimmed)) return true; // Has actual bullet content
    if (/^### /.test(trimmed)) return true; // Has session headings
    return false;
  });

  if (hasRealNotes) continue;

  // Check multiple session appearances (protect files with real session data)
  const sessions = extractSessionAppearances(body);
  if (sessions.length > 0) continue;

  // Check if name is garbled or generic
  const isGarbled = garbledNamePatterns.some(p => p.test(name)) ||
    name.length <= 5 || // e.g., "V.md", "Al.md"
    /^\d/.test(name);   // starts with number

  // Also check for very short names that are likely garbled
  const baseName = name.replace('.md', '');
  const isVeryShort = baseName.length <= 2;
  const isSingleWord = !baseName.includes(' ') && baseName.length <= 4;

  if (isGarbled || isVeryShort || isSingleWord) {
    moveToOrphans(name);
    orphanCount++;
  }
}

// ============================================================
// SUMMARY
// ============================================================

report('\n=== SUMMARY ===');
report(`Total actions logged: ${log.length}`);

// Count actions
const merges = log.filter(l => l.includes('Merged from:')).length;
const deletes = log.filter(l => l.includes('DELETED:')).length;
const orphans = log.filter(l => l.includes('ORPHANED:')).length;
report(`Merges performed: ${merges} duplicate files merged`);
report(`Files deleted after merge: ${deletes}`);
report(`Files moved to Orphans: ${orphans}`);

// Remaining file count
const remaining = fs.readdirSync(VAULT).filter(f => f.endsWith('.md')).length;
report(`Remaining character files: ${remaining}`);
