#!/usr/bin/env node
/**
 * foundry-vault-sync.js
 *
 * Reads actor data from all Foundry VTT LevelDB world/compendium databases
 * and generates:
 *   1. Cleaned JSON actor files in Meta/foundry-actors/{campaign}/
 *   2. Optimized Obsidian markdown files in Characters/{Name}.md
 *
 * Foundry's LevelDB is typically locked while the server runs, so this script
 * copies each database to a temp directory, reads it with classic-level,
 * then cleans up.
 *
 * Usage:
 *   node tools/foundry-vault-sync.js [--dry-run] [--campaign IG|SS|CC|HR|HV]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ClassicLevel } = require('classic-level');
const nameResolver = require('../src/utils/nameResolver');

// ─── Paths ──────────────────────────────────────────────────────────────────

const FOUNDRY_BASE = 'F:/foundryvttstorage/foundryvtt-worlds/f1-world/Data';
const VAULT_BASE = path.resolve(__dirname, '..', 'obsidian_cass', 'cassvault');
const JSON_OUT_BASE = path.join(VAULT_BASE, 'Meta', 'foundry-actors');
const CHAR_OUT_DIR = path.join(VAULT_BASE, 'Characters');

const WORLD_DBS = {
  IG: path.join(FOUNDRY_BASE, 'worlds/03irongodspub/data/actors'),
  SS: path.join(FOUNDRY_BASE, 'worlds/03-shackletastic/data/actors'),
  CC: path.join(FOUNDRY_BASE, 'worlds/carrioncrown/data/actors'),
  HR: path.join(FOUNDRY_BASE, 'worlds/hellsrebelsog/data/actors'),
  HV: path.join(FOUNDRY_BASE, 'worlds/hellsvengeance/data/actors'),
};

const COMPENDIUM_DBS = {
  IG: path.join(FOUNDRY_BASE, 'modules/folken-games-iron-gods-pathfinder-rpg/packs/iron-gods-actors-pf1e'),
  CC: path.join(FOUNDRY_BASE, 'modules/folken-games-carrion-crown-pathfinder-rpg/packs/folken-games-carrion-crown-actors-pf1e'),
  SS: path.join(FOUNDRY_BASE, 'worlds/03-shackletastic/packs/shackles-actors'),
};

// ─── Player–Character Mapping ───────────────────────────────────────────────

const PC_MAP = {
  IG: {
    'Ulfred': 'Kip', 'Nomkath': 'Daemon', 'Mr Brow': 'Enrique',
    'Augustus Teabrow': 'Enrique', 'Olbryn': 'Josh', 'Akradenn': 'Tim',
    'Luna Kresnik': 'Rye', 'Luna': 'Rye', 'Blackout': 'Tracy',
    'Maginnis': 'Hans',
  },
  SS: {
    'Holden': 'Kip', 'Storgrim Thunderbeard': 'Daemon', 'Storgrim': 'Daemon',
    'Sha-Feng': 'Enrique', 'ShaFeng': 'Enrique', 'Sha Feng': 'Enrique',
    'Ser Toche': 'Josh', 'Vaughan': 'Tim', 'Lil Vaughan': 'Tim',
    'Riviera Silvear': 'Rye', 'Riviera': 'Rye', 'Towa Hershel': 'Rye',
    'Towa': 'Rye', 'Bujon': 'Graham', 'Rhyarca Jillyr': 'Mandi',
    'Rhyarca': 'Mandi',
  },
  CC: {
    'William Gaspar': 'Tim', 'Gaspar': 'Tim', 'Kovira': 'Sydney',
    'Kai Gin': 'Graham', 'Kai': 'Graham', 'Elfrip': 'Anna',
    'Dinvaya': 'Josh', 'Dismas Aevrett': 'Harrison', 'Dismas': 'Harrison',
    'Kate Blackwood': 'Mandi', 'Rodney': 'Chris',
  },
  HR: {
    'Celeb': 'Tim', 'Femmick': 'Harrison', 'Gabriel': 'Josh', 'Nigel': 'Chris',
  },
  HV: {
    'Jamal': 'Tim', 'Draymus': 'Harrison', 'Reese': 'Josh',
    'Bruce': 'Chris', 'Jason': 'Charles', 'Freya Kusanagi': 'Betty',
    'Freya': 'Betty',
  },
};

// ─── Skip Filters ───────────────────────────────────────────────────────────

const SKIP_SUBSTRINGS = [
  'Shop', 'Store', 'Tavern', 'Inn', 'Chest', 'Barrel', 'Bookshelf', 'Coffin',
  'Rack', 'Pile', 'Papers', 'Clutter', 'Wardrobe', 'Statue', 'Cabinet',
  'Cupboard', 'Tent', 'Sarcophagus', 'Forge', 'Guard', 'Soldier', 'Warrior',
  'Warden',
];

const SKIP_STARTS = [
  'Drone', 'Gearsman', 'Mecha', 'WW ', 'TL ', 'Numerian ', 'Starfall ',
  'Bronze Fleet', 'Chelish', 'Taldor', 'Nidalese', 'Caliphas Bar',
  'Human Zombie', 'CAL-OPS',
];

// Named characters that contain skip words but should NOT be skipped
const SKIP_EXCEPTIONS = new Set([
  'Keeper Waldur Crove', 'Keeper Arand Hive', 'Gaol Warden',
  'Warden Hawkran', 'Keeper Grove', 'Keeper Hive', 'Keeper Meer',
  'Keeper Roy', 'Guard Captain', 'Savage Security',
]);

const FURNITURE_NAMES = new Set([
  'Treasure', 'Corpse', 'Supply Pile', 'Papers', 'Magic Chest',
  'Killin Tools', 'Grumpymart', 'Stroke Pit', 'Penitent Hearth',
  'Beetle Brewmaster', 'Muh Fuckin Dingay', 'Arrow Trap', 'Deathknell',
  'Chastel Services', 'The Harrow Hearse', 'The Fearsome Fancy',
  'Whispering Sentinal', 'Numerian Ink',
]);

// Allowed item types for export
const KEEP_ITEM_TYPES = new Set(['weapon', 'equipment', 'consumable', 'container', 'loot']);

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // Strip Foundry UUID references like @UUID[Compendium.pf1.feats.Item.xxx]{Display Text}
    .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/@UUID\[[^\]]*\]/g, '')
    // Strip Foundry roll formulas like [[1d8]]
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeFilename(name) {
  // Obsidian uses the name as-is for filenames (with some restrictions)
  return name.replace(/[<>:"/\\|?*]/g, '-').trim();
}

function shouldSkipActor(name) {
  if (!name) return true;
  if (FURNITURE_NAMES.has(name)) return true;
  if (SKIP_EXCEPTIONS.has(name)) return false;

  const nameLower = name.toLowerCase();
  for (const sub of SKIP_SUBSTRINGS) {
    if (nameLower.includes(sub.toLowerCase())) return true;
  }
  for (const pfx of SKIP_STARTS) {
    if (name.startsWith(pfx)) return true;
  }
  return false;
}

function getPlayerForActor(name, campaign) {
  const map = PC_MAP[campaign] || {};
  // Exact match first
  if (map[name]) return map[name];
  // Try partial/fuzzy match
  for (const [pcName, player] of Object.entries(map)) {
    if (name.toLowerCase() === pcName.toLowerCase()) return player;
    if (name.includes(pcName) || pcName.includes(name)) return player;
  }
  return null;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ─── LevelDB Reading ────────────────────────────────────────────────────────

/**
 * Copy a LevelDB directory to a temp location (to bypass LOCK) and open it.
 * Returns { db, tmpDir } — caller must close db and clean up tmpDir.
 */
async function openDbCopy(srcDir) {
  const tmpDir = path.join(os.tmpdir(), 'foundry-vault-sync-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(tmpDir, { recursive: true });

  // Copy all LevelDB files except LOCK
  const files = fs.readdirSync(srcDir);
  for (const f of files) {
    if (f === 'LOCK' || f === 'lost') continue;
    const src = path.join(srcDir, f);
    const stat = fs.statSync(src);
    if (stat.isFile()) {
      fs.copyFileSync(src, path.join(tmpDir, f));
    }
  }

  const db = new ClassicLevel(tmpDir, {
    createIfMissing: false,
    valueEncoding: 'utf8',
  });
  await db.open();
  return { db, tmpDir };
}

function cleanupTmp(tmpDir) {
  try {
    const files = fs.readdirSync(tmpDir);
    for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
    fs.rmdirSync(tmpDir);
  } catch (e) {
    // Non-critical
  }
}

/**
 * Read all actors + their items from a LevelDB database.
 * Returns an array of raw actor objects with items attached.
 */
async function readActorsFromDb(srcDir) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`  [SKIP] Directory not found: ${srcDir}`);
    return [];
  }

  let db, tmpDir;
  try {
    ({ db, tmpDir } = await openDbCopy(srcDir));
  } catch (e) {
    console.warn(`  [SKIP] Could not open DB at ${srcDir}: ${e.message}`);
    return [];
  }

  const actors = new Map(); // id -> actor object
  const items = [];         // { actorId, item }

  try {
    for await (const [key, value] of db.iterator()) {
      const keyStr = typeof key === 'string' ? key : key.toString();

      // Top-level actor: !actors!<id>
      if (/^!actors![^.]+$/.test(keyStr)) {
        try {
          const obj = JSON.parse(value);
          if (obj._id && obj.name && (obj.type === 'character' || obj.type === 'npc')) {
            actors.set(obj._id, obj);
          }
        } catch (e) { /* skip unparseable */ }
      }

      // Item: !actors.items!<actorId>.<itemId>
      if (keyStr.startsWith('!actors.items!')) {
        const match = keyStr.match(/^!actors\.items!([^.]+)\./);
        if (match) {
          try {
            const item = JSON.parse(value);
            items.push({ actorId: match[1], item });
          } catch (e) { /* skip */ }
        }
      }
    }
  } finally {
    await db.close();
    cleanupTmp(tmpDir);
  }

  // Attach items to their actors (including items nested inside containers)
  for (const { actorId, item } of items) {
    const actor = actors.get(actorId);
    if (actor) {
      if (!actor._items) actor._items = [];
      actor._items.push(item);

      // If this item is a container with embedded items, extract those too
      const containerItems = item.system?.items;
      if (containerItems && typeof containerItems === 'object') {
        for (const nested of Object.values(containerItems)) {
          if (nested && nested.name) {
            // Tag with container name so we know where it came from
            nested._containerName = item.name;
            actor._items.push(nested);
          }
        }
      }
    }
  }

  return Array.from(actors.values());
}

// ─── Actor → Clean JSON ─────────────────────────────────────────────────────

function extractCleanActor(raw, campaign, source) {
  const sys = raw.system || {};
  const abilities = {};
  if (sys.abilities) {
    for (const [ab, data] of Object.entries(sys.abilities)) {
      if (typeof data?.value === 'number') {
        abilities[ab] = data.value;
      }
    }
  }

  // Extract race from items
  const allItems = raw._items || [];
  const raceItem = allItems.find(i => i.type === 'race');
  const raceName = raceItem?.name || sys.details?.race?.value || null;

  // Extract classes from items (skip level-0 archetype markers)
  const classItems = allItems.filter(i => i.type === 'class');
  const classes = classItems
    .map(c => ({ name: c.name, level: c.system?.level || 0 }))
    .filter(c => c.name && c.level > 0);

  // HP — PF1e computes HP at runtime; best we can get statically is class rolled HP.
  // Try attributes.hp.max first (if system computed it), then sum class HP.
  let hpMax = sys.attributes?.hp?.max;
  if (!hpMax && classItems.length > 0) {
    const rolledHp = classItems.reduce((sum, c) => sum + (c.system?.hp || 0), 0);
    // Estimate total: rolledHP + (CON mod * total levels)
    const conMod = abilities.con ? Math.floor((abilities.con - 10) / 2) : 0;
    const totalLevels = classes.reduce((s, c) => s + c.level, 0);
    hpMax = rolledHp + (conMod * totalLevels);
    if (hpMax <= 0) hpMax = null;
  }

  // Filter items for export
  const exportItems = [];
  for (const item of allItems) {
    if (!KEEP_ITEM_TYPES.has(item.type)) continue;

    const equipped = item.system?.equipped === true ||
                     (item.system?.equipped && typeof item.system.equipped === 'object');
    const desc = stripHtml(item.system?.description?.value || '');

    // Keep if equipped OR has a meaningful description (more than 20 chars)
    if (!equipped && desc.length < 20) continue;

    exportItems.push({
      name: item.name,
      type: item.type,
      equipped: !!equipped,
      description: desc.substring(0, 500),
    });
  }

  return {
    name: raw.name,
    type: raw.type,
    campaign,
    source,
    race: raceName,
    classes,
    hp: { max: hpMax || null },
    abilities,
    items: exportItems,
  };
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/**
 * When the same actor name appears in both world and compendium,
 * keep the one with higher total class levels (or HP as tiebreak).
 */
function deduplicateActors(worldActors, compendiumActors) {
  const byName = new Map();

  for (const a of worldActors) {
    byName.set(a.name, a);
  }

  for (const a of compendiumActors) {
    const existing = byName.get(a.name);
    if (!existing) {
      byName.set(a.name, a);
    } else {
      // Compare total levels
      const existLvl = existing.classes.reduce((s, c) => s + c.level, 0);
      const newLvl = a.classes.reduce((s, c) => s + c.level, 0);
      if (newLvl > existLvl || (newLvl === existLvl && (a.hp.max || 0) > (existing.hp.max || 0))) {
        byName.set(a.name, a);
      }
    }
  }

  return Array.from(byName.values());
}

// ─── Markdown Generation ────────────────────────────────────────────────────

function generateMarkdown(actor, campaign, existingContent) {
  const player = getPlayerForActor(actor.name, campaign);
  const isPC = !!player;
  const classStr = actor.classes.map(c => `${c.name} ${c.level}`).join(' / ') || 'Unknown';
  const totalLevel = actor.classes.reduce((s, c) => s + c.level, 0) || null;
  const tags = ['character', isPC ? 'pc' : 'npc', campaign.toLowerCase()];

  // ─ Frontmatter
  const fm = [
    '---',
    `name: "${actor.name}"`,
    `type: ${actor.type}`,
    `campaign: ${campaign}`,
  ];
  if (actor.race) fm.push(`race: "${actor.race}"`);
  fm.push(`class: "${classStr}"`);
  if (actor.hp.max) fm.push(`hp: ${actor.hp.max}`);
  if (player) fm.push(`player: "${player}"`);
  fm.push(`tags: [${tags.map(t => `"${t}"`).join(', ')}]`);
  fm.push(`foundry_synced: "${today()}"`);
  fm.push('---');

  // ─ Stat block
  const lines = ['', `# ${actor.name}`, ''];
  const statParts = [];
  if (actor.race) statParts.push(`**Race:** ${actor.race}`);
  statParts.push(`**Class:** ${classStr}`);
  if (actor.hp.max) statParts.push(`**HP:** ${actor.hp.max}`);
  if (player) statParts.push(`**Player:** ${player}`);
  lines.push(statParts.join(' | '));

  // Ability scores
  const abs = actor.abilities;
  if (Object.keys(abs).length > 0) {
    const abLine = ['str', 'dex', 'con', 'int', 'wis', 'cha']
      .filter(a => abs[a] != null)
      .map(a => `**${a.toUpperCase()}** ${abs[a]}`)
      .join(' | ');
    if (abLine) lines.push(abLine);
  }

  // ─ Key Equipment
  const equippedItems = actor.items.filter(i => i.description && i.description.length > 10);
  if (equippedItems.length > 0) {
    lines.push('', '## Key Equipment');
    for (const item of equippedItems) {
      const eqTag = item.equipped ? 'equipped' : '';
      const tags = [item.type, eqTag].filter(Boolean).join(', ');
      const desc = item.description.substring(0, 500).replace(/\n/g, ' ');
      lines.push(`- **${item.name}** (${tags}) — ${desc}`);
    }
  }

  // ─ Preserve existing sections
  // Keep everything from "Notes & Updates" onward (including Session Appearances,
  // custom sections, etc). Skip "Key Equipment" since we regenerate that.
  let preservedSections = '';
  if (existingContent) {
    // Find the first preserve-worthy section heading
    const preserveHeadings = [
      '## Notes & Updates',
      '## Session Appearances',
      '## Signature Maneuvers',
      '## Relationships',
      '## Background',
      '## Backstory',
      '## History',
      '## Allies',
      '## Goals',
      '## Personality',
    ];
    let preserveStart = -1;
    for (const heading of preserveHeadings) {
      const idx = existingContent.indexOf(heading);
      if (idx >= 0 && (preserveStart < 0 || idx < preserveStart)) {
        preserveStart = idx;
      }
    }
    if (preserveStart >= 0) {
      preservedSections = existingContent.substring(preserveStart);
    }
  }

  if (preservedSections) {
    lines.push('', preservedSections.trim());
  } else {
    lines.push('', '## Notes & Updates', '', '*No session notes yet.*');
  }

  return fm.join('\n') + '\n' + lines.join('\n') + '\n';
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const campaignFilter = args.find(a => a !== '--dry-run' && a.startsWith('--campaign'));
  let onlyCampaign = null;
  if (campaignFilter) {
    onlyCampaign = args[args.indexOf(campaignFilter) + 1]?.toUpperCase();
  }
  // Also support --campaign=XX format
  const eqMatch = args.find(a => a.startsWith('--campaign='));
  if (eqMatch) onlyCampaign = eqMatch.split('=')[1].toUpperCase();

  console.log(`\n${'='.repeat(60)}`);
  console.log('  Foundry VTT → Obsidian Vault Sync');
  console.log(`  ${new Date().toISOString()}`);
  if (dryRun) console.log('  [DRY RUN — no files will be written]');
  if (onlyCampaign) console.log(`  Filtering to campaign: ${onlyCampaign}`);
  console.log(`${'='.repeat(60)}\n`);

  // Ensure output directories exist
  if (!dryRun) {
    fs.mkdirSync(JSON_OUT_BASE, { recursive: true });
    fs.mkdirSync(CHAR_OUT_DIR, { recursive: true });
  }

  const summary = {
    campaigns: {},
    totalActorsExtracted: 0,
    totalCharFilesWritten: 0,
    totalCharFilesUpdated: 0,
    totalJsonWritten: 0,
    errors: [],
  };

  const campaigns = onlyCampaign ? [onlyCampaign] : Object.keys(WORLD_DBS);

  for (const campaign of campaigns) {
    console.log(`\n── ${campaign} ${'─'.repeat(50)}`);
    const campSummary = { worldActors: 0, compendiumActors: 0, merged: 0, charsWritten: 0, charsUpdated: 0, skipped: 0 };

    // Read world DB
    const worldDir = WORLD_DBS[campaign];
    if (!worldDir) {
      console.warn(`  No world DB configured for ${campaign}`);
      continue;
    }

    console.log(`  Reading world DB: ${worldDir}`);
    let rawWorldActors = [];
    try {
      rawWorldActors = await readActorsFromDb(worldDir);
      console.log(`    Found ${rawWorldActors.length} actors`);
      campSummary.worldActors = rawWorldActors.length;
    } catch (e) {
      const msg = `Error reading ${campaign} world DB: ${e.message}`;
      console.error(`    ${msg}`);
      summary.errors.push(msg);
    }

    // Read compendium DB (if exists for this campaign)
    let rawCompActors = [];
    const compDir = COMPENDIUM_DBS[campaign];
    if (compDir) {
      console.log(`  Reading compendium: ${compDir}`);
      try {
        rawCompActors = await readActorsFromDb(compDir);
        console.log(`    Found ${rawCompActors.length} actors`);
        campSummary.compendiumActors = rawCompActors.length;
      } catch (e) {
        const msg = `Error reading ${campaign} compendium: ${e.message}`;
        console.error(`    ${msg}`);
        summary.errors.push(msg);
      }
    }

    // Convert to clean format
    const worldClean = rawWorldActors.map(a => extractCleanActor(a, campaign, 'world'));
    const compClean = rawCompActors.map(a => extractCleanActor(a, campaign, 'compendium'));

    // Deduplicate
    const merged = deduplicateActors(worldClean, compClean);
    campSummary.merged = merged.length;
    summary.totalActorsExtracted += merged.length;

    console.log(`  Merged: ${merged.length} unique actors`);

    // Write JSON files
    const jsonDir = path.join(JSON_OUT_BASE, campaign);
    if (!dryRun) fs.mkdirSync(jsonDir, { recursive: true });

    for (const actor of merged) {
      const jsonFile = path.join(jsonDir, safeFilename(actor.name) + '.json');
      if (!dryRun) {
        fs.writeFileSync(jsonFile, JSON.stringify(actor, null, 2));
      }
      summary.totalJsonWritten++;
    }

    // Write/update Markdown character files (skip furniture/generics)
    for (const actor of merged) {
      if (shouldSkipActor(actor.name)) {
        campSummary.skipped++;
        continue;
      }

      // Also skip actors with no meaningful data (no classes, no HP, no items)
      if (actor.classes.length === 0 && !actor.hp.max && actor.items.length === 0) {
        campSummary.skipped++;
        continue;
      }

      // Cross-campaign dedup: check if this actor exists under a different filename
      // (e.g., "Captain Plugg" should update "Mr. Plugg.md" not create a new file)
      let mdFile = path.join(CHAR_OUT_DIR, safeFilename(actor.name) + '.md');

      if (!fs.existsSync(mdFile)) {
        // Check nameResolver for canonical name
        const resolved = nameResolver.resolve(actor.name);
        if (resolved && resolved !== actor.name) {
          const resolvedFile = path.join(CHAR_OUT_DIR, safeFilename(resolved) + '.md');
          if (fs.existsSync(resolvedFile)) {
            mdFile = resolvedFile;
          }
        }
        // Check with/without "The " prefix
        if (!fs.existsSync(mdFile)) {
          const altNames = [
            'The ' + actor.name,
            actor.name.replace(/^The /, ''),
          ];
          for (const alt of altNames) {
            const altFile = path.join(CHAR_OUT_DIR, safeFilename(alt) + '.md');
            if (fs.existsSync(altFile)) {
              mdFile = altFile;
              break;
            }
          }
        }
      }

      // Read existing content if present
      let existingContent = null;
      if (fs.existsSync(mdFile)) {
        existingContent = fs.readFileSync(mdFile, 'utf8');

        // SAFETY: If the existing file has a foundry_synced date AND has custom sections
        // beyond what we generate (Key Abilities, Background, etc.), only update the
        // frontmatter + stats + equipment, never overwrite custom content.
        const hasCustomSections = /## (?:Key Abilities|Signature Maneuvers|Background|Backstory|History|Personality|Allies|Goals)/m.test(existingContent);
        if (hasCustomSections) {
          // Compare total class levels: only update if Foundry data is higher-level
          const existingLevel = (existingContent.match(/level:\s*(\d+)/i) || [])[1];
          const newLevel = actor.classes.reduce((s, c) => s + c.level, 0);
          if (existingLevel && newLevel <= parseInt(existingLevel)) {
            // Existing file is equal or higher level — skip to avoid overwriting richer data
            campSummary.skipped++;
            continue;
          }
        }
      }

      const md = generateMarkdown(actor, campaign, existingContent);

      if (!dryRun) {
        fs.writeFileSync(mdFile, md, 'utf8');
      }

      if (existingContent) {
        campSummary.charsUpdated++;
        summary.totalCharFilesUpdated++;
      } else {
        campSummary.charsWritten++;
        summary.totalCharFilesWritten++;
      }
    }

    console.log(`  JSON files: ${merged.length}`);
    console.log(`  Characters written: ${campSummary.charsWritten} new, ${campSummary.charsUpdated} updated`);
    console.log(`  Skipped (furniture/generic): ${campSummary.skipped}`);

    summary.campaigns[campaign] = campSummary;
  }

  // ─── Final Summary ──────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('  SYNC COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total actors extracted: ${summary.totalActorsExtracted}`);
  console.log(`  JSON files written:     ${summary.totalJsonWritten}`);
  console.log(`  Character files:        ${summary.totalCharFilesWritten} new, ${summary.totalCharFilesUpdated} updated`);
  if (summary.errors.length > 0) {
    console.log(`\n  ERRORS (${summary.errors.length}):`);
    for (const e of summary.errors) console.log(`    - ${e}`);
  }
  console.log('');

  return summary;
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
