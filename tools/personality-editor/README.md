# Casandalee Personality Editor

Web UI to view and edit personality files used by the bot.

## Run (Docker)

With the rest of the stack:

```bash
docker compose up -d
```

Then open **http://localhost:3960**. The editor runs as the `cass-editor` service and shares `./data` with the bot, so saves are picked up automatically.

## Run (local only)

```bash
npm run editor
```

Then open **http://localhost:3960**.

## What it does

- **List** all personalities in `data/personalities/` (goddess + lives 1–72).
- **Edit** name, class, alignment, personality text, speech style, tone, emojis.
- **Pathfinder stats**: STR, DEX, CON, WIS, INT, CHA (default 25-point buy: 15, 15, 14, 12, 12, 10).
- **Memory snippets**: one per line. Used for daily random channel messages as `"Name (life#): snippet"` (e.g. *Cassanda (48): They came at us day and night...*).

Saves write directly to `data/personalities/*.md`. If the bot is running, it watches that folder and reloads personalities on change.

## Port

Override with:

```bash
PERSONALITY_EDITOR_PORT=3961 npm run editor
```
