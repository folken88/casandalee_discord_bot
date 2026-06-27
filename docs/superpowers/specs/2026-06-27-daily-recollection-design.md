# Daily Recollection — design

**Date:** 2026-06-27
**Component:** `src/utils/dailyHistory.js` (Casandalee Discord bot)
**Status:** Approved (pending spec review)

## Goal

Replace Cass's two existing automated daily mechanisms with a single daily
**"Casandalee's Recollection"** post: one campaign event the players might
recognize, paired with a quote from one of her past lives.

## What is removed

1. **"📜 Today in Golarion History"** (the 7:30 AM embed that matched timeline
   events to the real-world calendar month/day). The real-life-date alignment
   is gone entirely. `getTodaysEvents()` and `parseEventDate()`'s real-life
   matching usage are removed (or repurposed — see below).
2. **The standalone 1–2 random-time persona-quote messages** (`postRandomMessage`
   / `_scheduleRandomMessages` auto-scheduling). The persona quote now lives
   inside the single daily Recollection post.

## What stays unchanged

- `/memory` command — still calls `generateRandomMessageContent()` on demand to
  post a random persona timeline quote. That function is kept as-is.
- The scheduler's 60-second heartbeat (`_tick`), timezone handling, and
  restart catch-up via `data/cache/daily-state.json`.
- Persona selection logic (`personalityManager.getRandomPersonalityWithTimelineQuote`,
  `pickEmoji`, alignment/entity emoji decoration). Reused verbatim.

## What is added

A single **Daily Recollection** post per day at **7:30 AM America/Chicago**
(reuses the existing `past730` gate). It is an **embed** combining a campaign
event and a past-life quote.

### Event selection — `pickRecognizableEvent(state)`

- Source: the in-memory `timelineSearch.timeline` array (Google-Sheets-backed,
  CSV fallback). Each event has `{ date, location, ap, description, parsedDate }`.
- **Window filter** — keep an event when its parsed year/month satisfies:
  - `4700 ≤ year ≤ 4716` (any month), **or**
  - `year === 4717 && (month === 0 || month ≤ 6)`.
  - (The data currently stops at 4717.05, so nothing is excluded today; the cap
    is defensive against future "spoiler" rows.)
- Require a non-empty `description`. Malformed rows (CSV multiline-quote
  artifacts) naturally fail the year filter and drop out.
- **Recent-repeat avoidance:** `daily-state.json` gains `recentEventKeys` — an
  array of the last 30 posted event keys (key = `date|description.slice(0,40)`).
  Pick uniformly at random from the in-window pool, excluding keys in
  `recentEventKeys`. If every in-window event is in the recent list (pool ≤ 30),
  ignore the exclusion. Push the chosen key, trim to 30.
- Returns the chosen event, or `null` if the pool is empty (then skip the day's
  post with a log line).

### Date formatting — `formatGolarionDate(dateString)`

- Parse `YYYY.MM.DD` (handles `MM`/`DD` of `00`).
- Month 1–12 → Golarion (Absalom Reckoning) month names:
  `1 Abadius, 2 Calistril, 3 Pharast, 4 Gozran, 5 Desnus, 6 Sarenith,
   7 Erastus, 8 Arodus, 9 Rova, 10 Lamashan, 11 Neth, 12 Kuthona`.
- `day` present (`>0`) → `"18 Sarenith, 4716"`.
- `day === 0`, `month > 0` → `"Sarenith 4716"`.
- `month === 0` → `"sometime in 4716"`.

### Campaign name — `campaignName(ap)`

Small lookup, falls back to the raw code if unknown:

| AP | Name |
|----|------|
| IG | Iron Gods |
| CC | Carrion Crown |
| HR | Hell's Rebels |
| HV | Hell's Vengeance |
| SS | Skull & Shackles |
| IS | Inner Sea |
| JG | Justice Gorls |
| TALDOR | Taldor |
| GM | GM Lore |
| CN | CN |
| LW | LW |

### Post format — embed (`buildRecollectionEmbed(event, personaLine)`)

```
📜 Casandalee's Recollection            (title, color 0x8B4513)
**18 Sarenith, 4716** · *Torch* (Iron Gods)      ← embed description, line 1
Meyanda arrives in Torch and enters Black Hill   ← description, line 2 (event text)
Caves at night. She makes a deal with the Skulks
to guard the caves.

[field]
🌙 Casandalee, 4090                      ← field name (persona emoji + name + birthYear/life)
"In the depths of the Scar, I found my true      ← field value (italic quote)
purpose amidst Unity's betrayal…"

footer: Casandalee Historical Archive
```

- The persona half reuses `generateRandomMessageContent`'s building blocks but
  is composed into embed parts rather than a flat string: emoji prefix, display
  name, `birthYear` (or `life N`), and the quote text. Alignment/entity emoji
  decoration is applied to the quote value where it makes sense.
- If `location` is empty, drop the `· *location*` segment. If `ap` is missing,
  drop the `(campaign)` segment.

## State changes — `data/cache/daily-state.json`

- **Replace** `dailyHistoryDate` and `randomMessagesDate` with a single
  `dailyRecollectionDate` (YYYY-MM-DD in the post timezone).
- **Add** `recentEventKeys: string[]` (max 30).
- `loadState`/`saveState` updated; old keys ignored if present (no migration
  needed — stale keys are harmless).

## Scheduler flow (`_tick`)

- Drop the 6am–6pm random-message scheduling branch entirely.
- Keep the `past730` branch, renamed intent: if past 7:30 AM and
  `dailyRecollectionDate !== today`, run `_runDailyRecollection()` (build event +
  persona quote, post embed to the general channel `303941538021638164`, then
  stamp `dailyRecollectionDate` and save).

## Public API / call sites

- `index.js` constructs `DailyHistoryScheduler` and calls `.start()` — unchanged.
- `/daily-history` command currently calls `postDailyHistory()` /
  `testDailyHistory()`. Repoint these to the new
  `postDailyRecollection()` so the manual/admin trigger still works (it now
  posts a Recollection instead of the today-in-history list). Command
  description text updated accordingly.
- Module exports keep `generateRandomMessageContent` for `/memory`.

## Testing

- Manual: trigger `postDailyRecollection()` via the `/daily-history` admin path
  in the test guild; confirm the embed renders, the date is a Golarion date in
  range, the campaign name resolves, and a persona quote appears.
- Unit-style sanity (node REPL inside container): call `pickRecognizableEvent`
  ~50× and assert every returned event is in-window and that 30-deep repeat
  avoidance holds; call `formatGolarionDate` on `4716.06.18`, `4716.00.00`,
  `4717.03.00` and check output strings.

## Out of scope

- No change to the timeline data source, Google Sheets sync, persona files, or
  `/memory`.
- No new dependencies.
