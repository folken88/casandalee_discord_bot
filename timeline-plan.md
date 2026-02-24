# Timeline plan

## Goal

Give each of Cass’s 72 past lives a short **in-character timeline quote**: something that persona would say about 1–2 events that happened during their lifetime, in their voice and from their worldview. Those quotes are used alongside Memory Snippets for daily “Name (life#): …” messages and make the timeline feel personal to each life.

## What we’re doing

1. **Timeline events**  
   One source of truth for campaign events (date, location, description): Google Sheet (preferred) or fallback CSV (`pf_folkengames_timeline.csv`).

2. **Per-life window**  
   For each past life we have a **birth year** (in the personality `.md`). We treat their lifetime as `[birthYear, birthYear + 80]` and only consider events in that window.

3. **Persona-aware quotes**  
   For each life we don’t just dump events into the model. We pass:
   - **Personality** and **Speech style**, **Tone**, **Alignment** from the `.md`
   - The list of events in their window  

   The model is asked to **choose 1 or 2 events** that this persona would find relevant or meaningful, then write **one in-character comment** (1–2 sentences) as that person would say it—no generic summary.

4. **Generation**  
   A single script, `tools/correlate-timeline-quotes.js`, uses the local LLM (Ollama on port 5080, e.g. RTX 5080) to generate that quote per life. We run one life at a time with a delay and retries; we never overwrite an existing `## Timeline Quote` so hand-edits are safe.

5. **Where it lands**  
   Each quote is written as a **## Timeline Quote** section in `data/personalities/NN_name.md`. The personality editor (port 3960) can show and edit it; the bot uses it in the pool for daily random messages.

## Summary

- **Input:** Timeline (Sheet/CSV) + personality files (birth year, personality, speech, tone, alignment).  
- **Process:** For each life with a birth year, find events in [birthYear, birthYear+80], call Ollama with persona + events, get one in-character quote.  
- **Output:** `## Timeline Quote` in each life’s `.md`; used by the bot and editable in the portal.  
- **Rules:** No overwriting existing real quotes; the fallback `(I remember the years X to Y.)` is treated as missing so re-runs will replace it. Optional dry-run and `--limit N`; high token limit and timeout on 5080.
- **Daily messages:** Random daily posts use only these timeline quotes (1–2 per day, random time 6am–6pm). `/memory` posts one on demand.

**Timeline / character emoji (server-specific)**  
- The bot can attach server custom emoji to timeline events and persona quotes when they mention known entities. Edit `data/timeline-emoji-map.json`: keys are display names (as in the sheet or descriptions), values are the server emoji shortcode names (e.g. `"Unity": "unity"`). Used in `/timeline`, `/today`, and random persona quotes (e.g. `/memory` and daily posts).

**More things for personas to say**  
- `tools/generate-persona-lines.js` uses Ollama (5080) to generate extra in-character one-liners per persona. Slow batch, one life at a time; never overwrites existing `## One-Liners`. Run: `node tools/generate-persona-lines.js` (optional `--resume`, `--dry-run`). One-liners are parsed into the bot and mixed into the daily/random quote pool.

**Continuity**  
- `tools/check-persona-continuity.js` checks birth-year ordering (chronological), duplicates, and canonical alignment (e.g. life 72 Casandalee 4221–4226). Run: `node tools/check-persona-continuity.js`.
- `tools/fix-persona-birth-years.js` spreads lives 2–71 across the ~8000-year span (no overlap); `tools/renumber-personas-chronologically.js` renumbers so life 1 = first by birth, life 72 = last.
- `tools/design-persona-lives-5080.js` uses Ollama to assign birth/death, era events, timeline quote, and one-liners per life (2–71). See `docs/persona-lives-vision.md`.

See `tools/TIMELINE_QUOTES.md` for run instructions and environment (OLLAMA_URL, Google Sheets, Docker).
