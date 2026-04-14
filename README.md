# Casandalee Discord Bot

A sophisticated Discord bot for Pathfinder 1e campaigns, featuring multi-tier LLM intelligence, 113 unique personalities, character dossiers, and campaign timeline management.

## Features

### Core Commands
- **Dice Rolling** (`/roll`) - Standard D&D notation with advantage/disadvantage
- **Reincarnation Tables** (`/reincarnate standard`, `/reincarnate aquatic`) - Standard (1d43) and aquatic/Shackles (1d100) tables with PF1 racial traits; both options appear when you type `/reincarnate`. The legacy `/reincarnate-aquatic` command still works.
- **Ancestry Lookup** (`/ancestry`) - View racial traits for any reincarnation race, with autocomplete and fuzzy matching
- **Character Dossiers** (`/character`, `/characterupdate`) - View and update character profiles with notes, roll history, and timeline mentions
- **Character Sheet Import** (`/charactersheet`) - Upload a screenshot of a PF1 character sheet and Claude Vision extracts stats into a dossier
- **Campaign Timeline** (`/timeline`) - Search 350+ campaign events by keyword, character, or location
- **Campaign Info** (`/campaign`) - Current campaign date, world state, and context
- **Ask Casandalee** (`/ask`) - AI-powered Q&A about the campaign, rules, and world
- **Daily History** (`/daily-history`, `/today`) - Historical events and campaign milestones
- **Memory** (`/memory`) - Have Casandalee post a random in-character timeline quote from one of her 113 lives

### Natural Language
Mention Casandalee or use `/cass` for natural conversation:
```
@Casandalee when did Hellion die?
@Casandalee how is Tokala doing?
@Casandalee reincarnate standard Bob
@Casandalee roll a d20
```

### Intelligence Architecture

**Multi-Provider LLM Routing (`src/utils/llmRouter.js`):**
- **Claude (Anthropic):** User-facing queries and complex analysis. Haiku 4.5 for most responses, Sonnet 4.6 for deep reasoning.
- **Gemini (Google, free tier):** Crosstalk generation, quality gate, query classification, relationship extraction, character-growth distillation. Uses `gemini-2.5-flash` with thinking mode disabled for speed.
- **Ollama (local, RTX 5080):** YouTube transcript extraction (bulk token workhorse), dossier generation, generic fallback. Runs `gemma4:e4b`.
- **OpenRouter:** Fallback when Claude is rate-limited.

Each task routes to its primary provider with a graceful fallback chain. See `src/utils/llmRouter.js` for details.

### Past-Life Crosstalk System (`src/utils/crosstalk.js`)

Automated daily conversations between random past lives. The pipeline:
1. Pick 2–3 random personas weighted by underuse
2. Pick a topic from the topic pool (casual, dark, reflective, funny, etc.)
3. Generate turn-by-turn dialogue via Gemini. **Strict round-robin** — once the initiator speaks, subsequent turns cycle through `(prevSpeakerIdx + 1) % personas.length`, guaranteeing no persona speaks twice in a row.
4. Quality gate via Gemini (GOOD / POLISH / REJECT) with strict preservation of lines that are already fine
5. Post to the crosstalk channel with staggered delays and a topic header at the top so readers see what question started the conversation
6. Save to vault, extract relationship sentiments, distill character growth back to persona files
7. When players reply to a crosstalk message, the correct persona responds in-character (name-based lookup, consistent emoji across all turns + replies)

Model-specific prompt steering addresses each backend's known failure modes — Gemini is warned against philosophical-debate energy and mystic-poet word salad; Ollama gets reminders to commit hard to specific character voice rather than drifting into a generic "wise sage" tone. Conflict and resolution are explicitly optional — three good-aligned paladins just agreeing is a valid conversation.

**Obsidian Vault Brain (`obsidian_cass/cassvault/`):**
Cass's entire knowledge base lives in an Obsidian-compatible markdown vault — browsable, editable, and version-controlled:
- **Characters/** - 53 live read-write character dossiers
- **Personas/** - 113 past-life personalities + goddess form
- **Sessions/** - 239 raw YouTube session transcripts (auto-captions)
- **Session Summaries/** - 234 Haiku-extracted summaries with key events, NPCs, locations
- **Timeline/** - Per-campaign timeline files synced daily from Google Sheets
- **Logs/** - Daily conversation logs (every Discord interaction)
- **Learned/** - Facts extracted from conversations via daily memory consolidation
- **Meta/** - Lore files, discord user map, emoji mappings

**Smart Data Systems:**
- **Vault Search (RAG)** - Searches all vault files for relevant context on every query
- **Conversation Logger** - Logs every Discord interaction; daily Haiku review extracts facts to permanent memory
- **Timeline Cache** - Pre-indexed keyword, character, and location indexes; rebuilds daily at 6 AM
- **Dossier Manager** - Character profiles with player notes, roll history, and timeline mentions (vault is sole source of truth)
- **Name Resolver** - Fuzzy matching with Levenshtein distance, aliases, and prefix/substring search across 5 campaigns
- **Google Sheets Integration** - Daily campaign timeline sync with per-campaign vault files and new-event notifications
- **YouTube Transcript Processor** - Daily check for new session uploads, auto-downloads captions, Haiku summarization

### Personality System
Casandalee has 113 unique past-life personalities plus her goddess form, stored in the vault's `Personas/` folder as individual Markdown files with:
- Unique speaking styles, emojis, and tone markers
- Dynamic weighting — underused personalities get selected more often
- Hidden switching every 1d7 queries or hourly
- Context-aware selection with subtle response flavoring
- 1–2 random in-character daily messages (timeline quotes only), posted at random times between 6am–6pm

## Installation

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Discord Bot Token
- Anthropic API Key (Claude)
- OpenAI API Key (optional fallback)
- Ollama with RTX GPU (optional, for local background processing)
- Google Sheets API Key (optional, for real-time campaign data)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/folken88/casandalee_discord_bot.git
   cd casandalee_discord_bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   Edit `.env` with your credentials (see Environment Variables below).

4. **Generate personality files** (first time only)
   ```bash
   node tools/generate-personalities.js
   ```

5. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

6. **Start the bot**
   ```bash
   # Docker (recommended)
   docker-compose build --no-cache
   docker-compose up -d

   # Or locally
   npm start
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `CLIENT_ID` | Discord application client ID | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Yes |
| `OPENAI_API_KEY` | OpenAI API key (fallback) | No |
| `OLLAMA_URL` | Ollama API URL (default: `http://ollama:11434`) | No |
| `OLLAMA_MODEL_FAST` | Ollama fast model (default: `qwen2.5:7b`) | No |
| `OLLAMA_MODEL_QUALITY` | Ollama quality model (default: `llama3.1:8b`) | No |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API key | No |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets document ID | No |
| `GOOGLE_SHEETS_TIMELINE_RANGE` | Timeline data range (e.g., `Sheet1!A1:D800`) | No |
| `GOOGLE_SHEETS_CHARACTERS_RANGE` | Character data range | No |
| `GOOGLE_SHEETS_REFRESH_INTERVAL` | Auto-refresh interval in ms (default: `86400000` = once daily) | No |
| `CAMPAIGN_YEAR` | Current campaign year | No |
| `CAMPAIGN_MONTH` | Current campaign month | No |
| `BOT_NAME` | Bot display name (default: `Casandalee`) | No |

## Docker Management

### Batch Files
- `docker-force-rebuild.bat` - Complete rebuild with space cleanup
- `start-docker.bat` / `stop-docker.bat` - Start/stop the bot
- `start-local.bat` / `stop-local.bat` - Local development

### Docker Commands
```bash
docker-compose ps              # Check status
docker-compose logs -f         # Live logs
docker-compose logs --tail=50  # Recent logs
docker-compose down            # Stop containers
```

## Project Structure
```
src/
├── commands/
│   ├── ancestry.js            # /ancestry - race trait lookup
│   ├── ask.js                 # /ask - AI-powered Q&A
│   ├── campaign.js            # /campaign - campaign info
│   ├── character.js           # /character - view dossier
│   ├── charactersheet.js      # /charactersheet - vision import
│   ├── characterupdate.js     # /characterupdate - player notes
│   ├── daily-history.js       # /daily-history
│   ├── date.js                # /date - campaign date
│   ├── help.js                # /help
│   ├── logs.js                # /logs - log management
│   ├── memory.js              # /memory - random timeline quote
│   ├── persona.js             # /persona - current personality
│   ├── refresh.js             # /refresh - data refresh
│   ├── reincarnate.js         # /reincarnate (subcommands: standard, aquatic)
│   ├── reincarnate-aquatic.js # /reincarnate-aquatic - Shackles table (legacy, also used by /reincarnate aquatic)
│   ├── roll.js                # /roll - dice rolling
│   ├── timeline.js            # /timeline - event search
│   └── today.js               # /today - historical events
├── utils/
│   ├── llmRouter.js           # 3-tier LLM routing (Ollama/Claude/GPT)
│   ├── llmHandler.js          # Query processing and response generation
│   ├── personalityManager.js  # 72 personality loading from vault Personas/
│   ├── dossierManager.js      # Character dossier CRUD (vault-only storage)
│   ├── conversationLogger.js  # Logs Discord conversations + daily memory consolidation
│   ├── vaultSearch.js         # RAG search across entire Obsidian vault
│   ├── transcriptKnowledge.js # Session transcript context injection
│   ├── nameResolver.js        # Fuzzy name matching with aliases
│   ├── timelineCache.js       # Pre-indexed timeline with daily setInterval rebuild
│   ├── timelineSearch.js      # Timeline search engine
│   ├── googleSheetsIntegration.js # Google Sheets sync + vault timeline writer
│   ├── youtubeTranscriptProcessor.js # YouTube playlist monitor + transcript fetcher
│   ├── campaignContext.js     # Campaign state and context
│   ├── raceTraits.js          # PF1 racial traits database
│   ├── reincarnationTable.js  # Reincarnation table loader
│   ├── diceRoller.js          # Dice mechanics
│   ├── dailyHistory.js        # Scheduled daily posts and random messages
│   └── logger.js              # Logging system
├── index.js                   # Main bot entry point
└── deploy-commands.js         # Slash command deployment

obsidian_cass/cassvault/       # Cass's Obsidian vault brain (git-tracked)
├── Characters/                # 53 character dossiers (live read-write)
├── Personas/                  # 113 past-life personalities + goddess form
├── Sessions/                  # 239 raw YouTube session transcripts
├── Session Summaries/         # 234 Haiku-extracted session summaries
├── Timeline/                  # Per-campaign timelines (synced from Google Sheets)
├── Logs/                      # Daily conversation logs
├── Learned/                   # Facts extracted from conversations
├── Places/                    # Location/setting notes
└── Meta/                      # Lore files, discord user map, emoji map

data/                          # Runtime data (gitignored)
├── cache/                     # Timeline cache, download state
└── avatar.png                 # Bot avatar image

tools/
├── bulk-download-transcripts.js  # Download all YouTube transcripts to vault
├── bulk-summarize-transcripts.js # Haiku summarization of all transcripts
├── cass-cli.js               # CLI test harness for direct LLM testing
├── correlate-timeline-quotes.js # Generate ## Timeline Quote per life (Ollama 5080)
├── generate-personalities.js # One-time personality file generator
└── TIMELINE_QUOTES.md        # Run instructions for timeline quote correlation
```

## Development

### CLI Test Tool
Test Cass's systems directly without Discord:
```bash
node tools/cass-cli.js
```
Supports: health checks, LLM stats, timeline search, dossier lookup, direct Ollama/Claude/OpenAI calls.

### Scripts
- `npm start` - Start the bot
- `npm run dev` - Start with nodemon
- `npm run deploy` - Deploy slash commands

### Backup / Zipping
To create a smaller backup zip, **exclude** `node_modules/` (run `npm install` after extracting). The `logs/` folder can be cleared before zipping; `data/` contains dossiers and personalities—keep it for a full backup.

## Author

**Tobias Merriman** - Folken Games

## License

MIT License - see [LICENSE](LICENSE) for details.

---

*Casandalee - Your faithful campaign companion across the ages*
