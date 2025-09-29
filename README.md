# Casandalee Discord Bot

A sophisticated Discord bot for D&D and Pathfinder campaigns, featuring natural language processing, campaign timeline management, and character reincarnation mechanics.

## Features

### 🎲 **Core Functionality**
- **Natural Language Processing** - Ask questions using `@Casandalee` mentions
- **Dice Rolling** - Standard D&D notation with advantage/disadvantage
- **Campaign Timeline** - Search through 350+ campaign events with focused results
- **Character Reincarnation** - Custom reincarnation table for sea-giant and sahuagin druids
- **FoundryVTT Integration** - Connect to your FoundryVTT instance for table lookups
- **Google Sheets Integration** - Real-time campaign data from Google Sheets
- **Docker Support** - Easy deployment with Docker containers
- **Log Management** - Automatic log rotation and cleanup
- **Persistent Personality System** - 72 unique personalities with automatic switching

### 🗣️ **Natural Language Commands**
- `@Casandalee when did Hellion die?` - Timeline lookups
- `@Casandalee reincarnate Bob` - Character reincarnation
- `@Casandalee roll a d20` - Dice rolling
- `@Casandalee what's the campaign year?` - Campaign information

### ⚡ **Slash Commands**
- `/ask [question]` - Direct question to Casandalee
- `/roll [notation]` - Dice rolling with advantage/disadvantage
- `/reincarnate [character]` - Character reincarnation
- `/timeline [search]` - Search campaign timeline
- `/campaign` - Campaign information and status
- `/table [name]` - Roll on FoundryVTT tables
- `/refresh [type]` - Refresh data from Google Sheets
- `/logs [action]` - Manage bot logs (status/cleanup)
- `/date` - Get current campaign date (auto-updated from timeline)
- `/today` - Show historical events for today's date
- `/characters` - List available characters
- `/daily-history` - Get daily history from timeline

### 🎭 **Personality System**
Casandalee has 72 different personalities from her various lives, each with unique speaking styles and worldviews. She was unusual among androids in remembering fragments of all her past lives, stretching back to the Rain of Stars. Her journey includes:

**Core Identity:**
- Initial worship then betrayal of Unity (4221 AR)
- Survival as an AI backup for centuries
- Rescue by her friends and ascension to goddess
- 72 unique personalities from her android incarnations
- Final goddess form with divine wisdom

**Personality Selection:**
- **Automatic Switching**: Every 1d7 queries or hourly, Casandalee switches personalities
- **Random roll 1-71**: Embodies a specific past life personality
- **Random roll 72-100**: Responds as the ascended goddess
- **Persistent System**: Players can ask "who are you right now?" or "what iteration is this?"
- Each personality has detailed backstory, unique speaking style, and worldview
- Memory fragments are not in chronological order
- Oldest life: Cassandra (pilot of the Divinity, 7000 years ago)
- Most recent life: Casandalee (Oracle of Unity, before AI-core backup)

**Example Personalities:**
- **Cassandra (72)**: Disciplined pilot who calculated the Divinity's crash trajectory
- **Cassrilyn (40)**: Tinker who created living clockwork animals as her children
- **Cassithra (27)**: Inquisitor who killed herself in despair over her cruelty
- **Casandalee (2)**: Final life who betrayed Unity and ascended to godhood

## Docker Management

### Essential Batch Files
- `docker-force-rebuild.bat` - Complete rebuild with space cleanup (use this for updates)
- `start-docker.bat` - Start the bot
- `stop-docker.bat` - Stop the bot
- `start-local.bat` - Start bot locally (development)
- `stop-local.bat` - Stop local bot

### Docker Commands
- `docker-compose ps` - Check container status
- `docker-compose logs -f cass-bot` - View live logs
- `docker-compose down` - Stop and remove containers

## Installation

### Prerequisites
- Node.js 18+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- Discord Bot Token
- OpenAI API Key
- Google Sheets API Key (optional, for real-time data)
- FoundryVTT instance (optional)

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
   Edit `.env` with your credentials:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   OPENAI_API_KEY=your_openai_api_key
   FOUNDRY_URL=your_foundry_url (optional)
   FOUNDRY_USER=your_foundry_username (optional)
   FOUNDRY_PASSWORD=your_foundry_password (optional)
   GOOGLE_SHEETS_API_KEY=your_google_api_key (optional)
   GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id (optional)
   ```

4. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

5. **Start the bot**

   **Option A: Local Development**
   ```bash
   npm start
   ```

   **Option B: Docker Deployment (Recommended)**
   ```bash
   # Build and start with Docker
   docker-rebuild.bat
   
   # Or manually:
   docker-compose build --no-cache
   docker-compose up -d
   ```

   **Management Scripts:**
   ```bash
   # Start Docker bot
   start-docker.bat
   
   # Stop Docker bot  
   stop-docker.bat
   
   # Rebuild after code changes
   docker-rebuild.bat
   
   # Clean up logs
   cleanup-logs.bat
   ```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `DISCORD_CLIENT_ID` | Discord application ID | Yes |
| `OPENAI_API_KEY` | OpenAI API key for LLM | Yes |
| `FOUNDRY_URL` | FoundryVTT instance URL | No |
| `FOUNDRY_USER` | FoundryVTT username | No |
| `FOUNDRY_PASSWORD` | FoundryVTT password | No |
| `CAMPAIGN_YEAR` | Current campaign year | No |
| `CAMPAIGN_MONTH` | Current campaign month | No |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API key | No |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets document ID | No |
| `GOOGLE_SHEETS_TIMELINE_RANGE` | Timeline data range (e.g., Sheet1!A1:D800) | No |
| `GOOGLE_SHEETS_CHARACTERS_RANGE` | Character data range | No |
| `GOOGLE_SHEETS_REFRESH_INTERVAL` | Auto-refresh interval in milliseconds | No |

### Campaign Timeline
The bot loads campaign events from `pf_folkengames_timeline.csv` or Google Sheets. This data should contain:
- Date (in AR format, e.g., 4717.25 for April 4717)
- Location  
- AP (Adventure Path)
- Description

**Dynamic Date System**: The bot automatically determines the current campaign date from the most recent event in the timeline. The date updates automatically when new events are added to the Google Sheet.

### Reincarnation Table
Custom reincarnation table in `reincarnation_table.json` with 44 entries for sea-giant and sahuagin druids.

## Usage

### Natural Language Examples
```
@Casandalee what's happening in the campaign?
@Casandalee roll me a d20 for initiative
@Casandalee reincarnate my druid character
@Casandalee when did the Battle of Bloodsworn Vale happen?
```

### Slash Command Examples
```
/ask What's the weather like in the Shackles?
/roll 1d20+5 with advantage
/reincarnate character:Bob
/timeline search:Hellion
/campaign
```

## Development

### Project Structure
```
src/
├── commands/          # Slash command handlers
├── utils/           # Utility functions
│   ├── logger.js    # Logging system
│   ├── llmHandler.js # OpenAI integration
│   ├── diceRoller.js # Dice mechanics
│   └── campaignContext.js # Campaign data
├── index.js         # Main bot file
└── deploy-commands.js # Command deployment
```

### Scripts
- `npm start` - Start the bot
- `npm run dev` - Start with nodemon for development
- `npm run deploy` - Deploy slash commands to Discord

### Logging
The bot includes comprehensive logging:
- Console output for development
- Daily log files in `logs/` directory
- Debug information for troubleshooting

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Tobias Merriman**  
Folken Games

## Support

For support, please open an issue on GitHub or contact the author.

---

*Casandalee - Your faithful campaign companion across the ages* 🎲✨