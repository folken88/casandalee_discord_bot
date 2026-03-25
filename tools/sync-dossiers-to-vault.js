#!/usr/bin/env node
/**
 * Sync all dossiers from data/dossiers/ to the Obsidian vault Characters/ folder.
 * Creates Obsidian-compatible markdown pages with frontmatter, stats, history, etc.
 * Safe to re-run — overwrites existing character pages with fresh data.
 *
 * Usage: node tools/sync-dossiers-to-vault.js
 */

const fs = require('fs');
const path = require('path');

const DOSSIERS_DIR = path.join(__dirname, '../data/dossiers');
const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, '../obsidian_cass/cassvault');
const CHARACTERS_DIR = path.join(VAULT_DIR, 'Characters');

// Ensure output dir exists
if (!fs.existsSync(CHARACTERS_DIR)) {
    fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
}

const files = fs.readdirSync(DOSSIERS_DIR).filter(f => f.endsWith('.json'));
let created = 0;
let updated = 0;

for (const file of files) {
    const raw = fs.readFileSync(path.join(DOSSIERS_DIR, file), 'utf8');
    const d = JSON.parse(raw);

    const name = d.canonicalName || file.replace('.json', '');
    const safeName = name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    const outPath = path.join(CHARACTERS_DIR, `${safeName}.md`);

    // Determine campaign tags from source or timeline refs
    const tags = ['character'];
    if (d._source === 'foundry-vtt-mcp') tags.push('pc');
    if (d.player) tags.push('pc');

    // Build markdown
    let md = `---
name: "${name}"
type: character
race: "${d.race || 'Unknown'}"
class: "${d.class || 'Unknown'}"
level: ${d.level || '?'}
${d.player ? `player: "${d.player}"` : ''}
aliases: [${(d.aliases || []).map(a => `"${a}"`).join(', ')}]
tags: [${tags.map(t => `"${t}"`).join(', ')}]
created: "${d.createdAt || ''}"
updated: "${d.updatedAt || ''}"
---

# ${name}

`;

    // Stats line
    const statParts = [];
    if (d.race) statParts.push(`**Race:** ${d.race}`);
    if (d.class) statParts.push(`**Class:** ${d.class}`);
    if (d.level) statParts.push(`**Level:** ${d.level}`);
    if (d.player) statParts.push(`**Player:** ${d.player}`);
    if (statParts.length > 0) {
        md += statParts.join(' | ') + '\n\n';
    }

    if (d.description) {
        md += `${d.description}\n\n`;
    }

    // Player updates / notes
    if (d.playerUpdates && d.playerUpdates.length > 0) {
        md += `## Notes & Updates\n\n`;
        for (const update of d.playerUpdates) {
            const date = update.timestamp ? new Date(update.timestamp).toLocaleDateString() : '';
            const source = update.updatedBy || 'unknown';
            md += `- ${update.text}`;
            if (date || source) md += ` *(${source}${date ? ', ' + date : ''})*`;
            md += '\n';
        }
        md += '\n';
    }

    // Timeline references
    if (d.timelineReferences && d.timelineReferences.length > 0) {
        md += `## Timeline References\n\n`;
        for (const ref of d.timelineReferences) {
            md += `- **[${ref.date}]** ${ref.location ? `*(${ref.location})* ` : ''}${ref.description}\n`;
        }
        md += '\n';
    }

    // Roll history
    if (d.rollHistory && d.rollHistory.length > 0) {
        md += `## Roll History\n\n`;
        for (const roll of d.rollHistory.slice(-10)) {
            const date = roll.timestamp ? new Date(roll.timestamp).toLocaleDateString() : '';
            md += `- **${roll.type}**: ${roll.roll} → ${roll.result}`;
            if (roll.command) md += ` (${roll.command})`;
            if (date) md += ` *${date}*`;
            md += '\n';
        }
        md += '\n';
    }

    // Emoji reactions
    const reactions = Object.entries(d.emojiReactions || {});
    if (reactions.length > 0) {
        md += `## Reactions\n\n`;
        md += reactions.map(([emoji, count]) => `${emoji} ×${count}`).join('  ') + '\n\n';
    }

    // Session appearances placeholder (will be appended by transcript processor)
    md += `## Session Appearances\n\n*Session activity from YouTube transcripts will appear here.*\n`;

    const existed = fs.existsSync(outPath);
    fs.writeFileSync(outPath, md, 'utf8');

    if (existed) {
        updated++;
    } else {
        created++;
    }
    console.log(`${existed ? '🔄' : '✅'} ${name}`);
}

console.log(`\nDone! ${created} created, ${updated} updated in ${CHARACTERS_DIR}`);
