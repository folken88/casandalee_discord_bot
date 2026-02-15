# Timeline Quote Correlation

The script `correlate-timeline-quotes.js` uses the secondary LLM (Ollama on RTX 5080) to generate one in-character quote per past life, based on campaign timeline events from the Google Sheet (or CSV fallback).

## What it does

- Loads timeline events (Google Sheets if configured, else `pf_folkengames_timeline.csv`)
- For each of Cass's 72 past lives (with a birth year):
  - Reads the persona’s **Personality**, **Speech Style**, **Tone**, and **Alignment** from the `.md` file
  - Finds events in that life’s window: `[birthYear, birthYear + 80]` years
  - Calls Ollama with those events and the full persona (attitudes, worldview, voice)
  - Asks the model to choose **1 or 2 events** that this persona would find relevant or meaningful, then write a single **in-character comment** (1–2 sentences) in that persona’s voice
  - Writes a **## Timeline Quote** section in that life’s `.md` file
- Rate limit: 1 life per minute (configurable), 2-minute timeout per Ollama call, up to 2 retries on failure

## Run

From repo root:

```bash
node tools/correlate-timeline-quotes.js
```

Options:

- **`--dry-run`** — Load data and log what would be done; no Ollama calls, no file writes.
- **`--limit N`** — Process at most N lives (useful for testing). Example: `--limit 2`.

The script **never overwrites** an existing real `## Timeline Quote`. If a life already has one (or you've edited it), that file is skipped. A quote that is only the fallback `(I remember the years X to Y.)` is treated as missing so a real in-character quote will be generated and written.

## Environment

- **OLLAMA_URL** — Default `http://localhost:5080`. From a container with Ollama on the host use `http://host.docker.internal:5080`.
- **OLLAMA_MODEL_FAST** — Optional; default `qwen2.5:7b`.
- **GOOGLE_SHEETS_*** — Same as the bot; if set, timeline is loaded from the sheet. Otherwise the script uses `pf_folkengames_timeline.csv`.

## Running in Docker

To use the bot’s network (e.g. to reach Ollama on another container):

```bash
docker compose run --rm cass-bot node tools/correlate-timeline-quotes.js
```

If Ollama runs on your host on port 5080, from Docker use `-e OLLAMA_URL=http://host.docker.internal:5080`. On the host: `node tools/correlate-timeline-quotes.js` (default is `http://localhost:5080`).

## Output

- Each life gets a **## Timeline Quote** section in `data/personalities/NN_name.md`.
- The personality editor shows and can edit this field.
- The bot uses **only** timeline quotes for daily random messages (1-2 per day, random time 6am-6pm). `/memory` posts one on demand.

## Stability

- One life at a time, with a delay between calls.
- Retries and a fallback quote if Ollama fails.
- Never overwrites existing quotes, so you can edit by hand and re-run safely.
