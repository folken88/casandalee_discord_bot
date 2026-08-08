/**
 * Timeline → Vault sync
 * Regenerates obsidian_cass/cassvault/Timeline/<AP>_timeline.md from the loaded
 * timeline (CSV or Google Sheets — whatever timelineSearch holds). These vault
 * files are what conversational RAG (vaultSearch.contextFor) reads for its
 * TIMELINE section; before this module they were only written by the Google
 * Sheets sync, which is not configured — so they froze (last 2026-06-04) and
 * CSV edits never reached conversation context.
 *
 * Runs at startup (CSV changes require a rebuild+restart anyway, so startup
 * sync always keeps the vault current). GM planning rows (PLAN:/TODO:/GM:) and
 * the GM pseudo-campaign are excluded; GM_timeline.md (tagged gm-only, RAG-
 * excluded) is left untouched.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const TIMELINE_DIR = path.join(__dirname, '../../obsidian_cass/cassvault/Timeline');

const CAMPAIGN_NAMES = {
    IG: 'Iron Gods',
    CC: 'Carrion Crown',
    HR: "Hell's Rebels",
    HV: "Hell's Vengeance",
    SS: 'Skull & Shackles',
    IS: 'Inner Sea (Shared)',
    JG: 'Justice Gorls',
    TALDOR: 'Taldor',
    CN: 'CN',
    LW: 'LW'
};

/**
 * @param {Array<{date:string, location:string, ap:string, description:string}>} timeline
 * @returns {{files:number, rows:number}}
 */
function sync(timeline) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
        logger.warn('[TimelineVaultSync] No timeline data; skipping vault sync');
        return { files: 0, rows: 0 };
    }

    const byAp = {};
    for (const ev of timeline) {
        if (!ev || !ev.date || !ev.description || !ev.description.trim()) continue;
        if (/^\s*(PLAN|TODO|GM)\s*:/i.test(ev.description)) continue; // GM planning rows are not player-visible
        const ap = String(ev.ap || '').trim().toUpperCase();
        if (!ap || ap === 'GM') continue;
        (byAp[ap] = byAp[ap] || []).push(ev);
    }

    let files = 0, rows = 0;
    for (const [ap, events] of Object.entries(byAp)) {
        const name = CAMPAIGN_NAMES[ap] || ap;
        const lines = events.map(ev =>
            `| ${String(ev.date).trim()} | ${String(ev.location || '').trim()} | ${String(ev.description).trim().replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ')} |`
        );
        const content = `---
title: "${name} Timeline"
type: timeline
campaign: "${ap}"
campaignName: "${name.replace(/"/g, '\\"')}"
eventCount: ${events.length}
lastSync: "${new Date().toISOString()}"
tags: ["timeline", "${ap.toLowerCase()}"]
---

# ${name} Timeline

*Synced automatically from the campaign timeline. Edit the timeline source (CSV/Sheet), not this file.*

| Date | Location | Event |
|------|----------|-------|
${lines.join('\n')}
`;
        try {
            fs.mkdirSync(TIMELINE_DIR, { recursive: true });
            fs.writeFileSync(path.join(TIMELINE_DIR, `${ap}_timeline.md`), content, 'utf8');
            files++; rows += events.length;
        } catch (err) {
            logger.error(`[TimelineVaultSync] Failed to write ${ap}_timeline.md: ${err.message}`);
        }
    }
    logger.info(`[TimelineVaultSync] Wrote ${files} vault timeline file(s), ${rows} rows`);
    return { files, rows };
}

module.exports = { sync };
