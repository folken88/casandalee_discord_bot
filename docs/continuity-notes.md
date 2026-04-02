# Persona continuity notes

Casandalee is slightly mentally damaged but her memories are generally accurate — so we avoid **overlapping lives** (two incarnations alive at once would indicate a memory error).

## What the check does

`tools/check-persona-continuity.js` orders lives by **birth year** (chronological order), then reports:

- **Overlapping lives**: each life’s end is Death Year if set, else birth + 80. The chronologically next life must start after the previous one ended. Any overlap is flagged.
- **Duplicate birth years** across lives.
- **Life 113 (Casandalee oracle)**: canonical window 4221–4223 AR at Silver Mount; birth year should allow that (e.g. ~3983–4146).
- **Birth after 4717**: any life born after campaign present.

## Fixing overlaps

Run:

```bash
node tools/fix-persona-birth-years.js [--dry-run]
```

The fix script **spreads lives 2–112** across the ~8000-year span from life 1’s end (-4363) to life 113’s start (3983); it does not change life 1 (Cassula) or life 113 (Casandalee). With `--dry-run` it only prints what would change.

**Renumbering:** `tools/renumber-personas-chronologically.js` renumbers files and Life Number so that life 1 = first by birth year, life 113 = last (oracle). Run after changing birth/death if you want chronological file order.

## Iron Gods canon

- **Life 1 (Cassula):** -4363 AR (Rain of Stars), engineer on the Divinity.
- **Life 113 (Casandalee, oracle of Unity):** Birth 3983 AR. At Silver Mount 4221, fled 4223; uploaded mind to AI core; **body killed 4223 AR** by Unity’s gearsmen in the Aurora wreck (Iadenveigh). That was her last life as the oracle; mind continued in the AI core until ascension.
- **Ascension:** Late 4717 AR (not a “life” — she was already digital).

Where the Google Sheet or CSV timeline disagrees with the Iron Gods books, the **sheet/CSV take priority** for the bot and tools.
