# Casandalee Discord Bot

A sophisticated Discord bot for Pathfinder 1e campaigns, featuring multi-tier LLM intelligence, 72 unique personalities, character dossiers, and campaign timeline management.

## Features

### Core Commands
- **Dice Rolling** (`/roll`) - Standard D&D notation with advantage/disadvantage
- **Reincarnation Tables** (`/reincarnate`, `/reincarnate-aquatic`) - Standard (1d43) and aquatic/Shackles (1d100) tables with PF1 racial traits
- **Ancestry Lookup** (`/ancestry`) - View racial traits for any reincarnation race, with autocomplete and fuzzy matching
- **Character Dossiers** (`/character`, `/characterupdate`) - View and update character profiles with notes, roll history, and timeline mentions
- **Character Sheet Import** (`/charactersheet`) - Upload a screenshot of a PF1 character sheet and Claude Vision extracts stats into a dossier
- **Campaign Timeline** (`/timeline`) - Search 350+ campaign events by keyword, character, or location
- **Campaign Info** (`/campaign`) - Current campaign date, world state, and context
- **Ask Casandalee** (`/ask`) - AI-powered Q&A about the campaign, rules, and world
- **Daily History** (`/daily-history`, `/today`) - Historical events and campaign milestones

### Natural Language
Mention Casandalee or use `/cass` for natural conversation:
```
@Casandalee when did Hellion die?
@Casandalee how is Tokala doing?
@Casandalee reincarnate Bob
@Casandalee roll a d20
```

### Intelligence Architecture

**3-Tier LLM Routing:**
- **Tier 1 (Background):** Ollama local models (qwen2.5:7b / llama3.1:8b on RTX 5080) for data parsing, compaction, and daily random messages
- **Tier 2 (User-Facing):** Claude Haiku 3.5 for most interactive responses and personality-flavored answers
- **Tier 3 (Complex):** Claude Sonnet / GPT-4 for deep analysis and fallback

**Smart Data Systems:**
- **Timeline Cache** - Pre-indexed keyword, character, and location indexes; rebuilds daily at 6 AM
- **Dossier Manager** - Auto-generated character profiles with player notes, roll history, emoji reaction tracking, and sheet imports
- **Name Resolver** - Fuzzy matching with Levenshtein distance, aliases, and prefix/substring search
- **Google Sheets Integration** - Real-time campaign data with new-event notifications

### Personality System
Casandalee has 72 unique past-life personalities plus her goddess form, each stored as individual Markdown files with:
- Unique speaking styles, emojis, and tone markers
- Dynamic weighting — underused personalities get selected more often
- Hidden switching every 1d7 queries or hourly
- Context-aware selection with subtle response flavoring
- 1-2 random in-character daily messages (generated via Ollama)

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
| `GOOGLE_SHEETS_REFRESH_INTERVAL` | Auto-refresh interval in ms | No |
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
│   ├── refresh.js             # /refresh - data refresh
│   ├── reincarnate.js         # /reincarnate - standard table
│   ├── reincarnate-aquatic.js # /reincarnate-aquatic - Shackles table
│   ├── roll.js                # /roll - dice rolling
│   ├── timeline.js            # /timeline - event search
│   └── today.js               # /today - historical events
├── utils/
│   ├── llmRouter.js           # 3-tier LLM routing (Ollama/Claude/GPT)
│   ├── llmHandler.js          # Query processing and response generation
│   ├── personalityManager.js  # 72 personality loading, selection, flavoring
│   ├── dossierManager.js      # Character dossier CRUD and auto-save
│   ├── nameResolver.js        # Fuzzy name matching with aliases
│   ├── timelineCache.js       # Pre-indexed timeline with daily cron
│   ├── timelineSearch.js      # Timeline search engine
│   ├── googleSheetsIntegration.js # Google Sheets data fetcher
│   ├── campaignContext.js     # Campaign state and context
│   ├── raceTraits.js          # PF1 racial traits database
│   ├── reincarnationTable.js  # Reincarnation table loader
│   ├── diceRoller.js          # Dice mechanics
│   ├── dailyHistory.js        # Scheduled daily posts and random messages
│   └── logger.js              # Logging system
├── index.js                   # Main bot entry point
└── deploy-commands.js         # Slash command deployment

data/                          # Runtime data (gitignored)
├── personalities/             # 73 individual .md personality files
├── dossiers/                  # Character dossier JSON files
├── cache/                     # Timeline cache
└── avatar.png                 # Bot avatar image

tools/
├── cass-cli.js                # CLI test harness for direct LLM testing
└── generate-personalities.js  # One-time personality file generator
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

## Author

**Tobias Merriman** - Folken Games

## License

MIT License - see [LICENSE](LICENSE) for details.

---

*Casandalee - Your faithful campaign companion across the ages*
