# Smart Actor Index System

## Overview

The Smart Actor Index System provides lightweight, efficient access to FoundryVTT character data. Instead of loading all actor data into memory, it creates a simple text-based index that maps:

**Actor Name → World → Database Path**

This enables fast lookups with on-demand data retrieval from FoundryVTT's LevelDB databases.

## How It Works

### 1. Lightweight Index Creation
- Scans all FoundryVTT worlds for PC characters (type: 'character')
- Creates a simple text file: `data/actor_index.txt`
- Format: `ActorName|World|DbPath` (one line per actor)
- Only indexes PC characters, ignores NPCs

### 2. On-Demand Data Retrieval
- When asked about "Tokala", looks up in index
- Finds: `Tokala|irongods|/foundry/data/Data/worlds/irongods/data/actors`
- Opens that specific LevelDB database
- Retrieves only Tokala's data (stats, inventory, spells, abilities)

### 3. Smart Query Processing
- Natural language queries like "How is Tokala doing?" or "What spells does Tokala have?"
- Extracts character name from query
- Searches index for character
- Retrieves relevant data on-demand
- Formats response with requested information

## File Structure

```
src/utils/
├── actorIndex.js          # Core index system
└── ...

src/commands/
├── build-actor-index.js   # Build the index
├── actor.js              # Query actor information
└── ...

data/
└── actor_index.txt       # Lightweight index file
```

## Docker Configuration

The Docker container has read-only access to FoundryVTT data:

```yaml
volumes:
  - C:/foundryvttstorage:/foundry/data:ro
```

This mounts your FoundryVTT data directory as `/foundry/data` inside the container.

## Commands

### `/build-actor-index`
- Scans all FoundryVTT worlds
- Creates lightweight index of PC characters
- Shows summary of found characters

### `/actor name:CharacterName info:basic|stats|inventory|spells|abilities|all`
- Queries specific actor information
- Retrieves data on-demand from FoundryVTT databases
- Supports different information types

## Setup

1. **Run setup script:**
   ```bash
   setup-foundry-access.bat
   ```

2. **Test locally (optional):**
   ```bash
   node test-actor-index.js
   ```

3. **Build index in Discord:**
   ```
   /build-actor-index
   ```

4. **Query actors:**
   ```
   /actor name:Tokala info:stats
   /actor name:Tokala info:inventory
   /actor name:Tokala info:spells
   ```

## Natural Language Integration

The bot can also answer natural language questions about characters:

- "How is Tokala doing?"
- "What spells does Tokala have?"
- "What's in Tokala's inventory?"
- "What are Tokala's stats?"

The LLM handler will:
1. Extract character name from query
2. Search the actor index
3. Retrieve relevant data from FoundryVTT
4. Generate intelligent response

## Benefits

### Efficiency
- **Lightweight index** (just names, worlds, paths)
- **On-demand retrieval** (only fetch what's needed)
- **No memory bloat** (no huge reference files)

### Flexibility
- **PC characters only** (ignores NPCs)
- **Multiple worlds** (supports all FoundryVTT worlds)
- **Full data access** (stats, inventory, spells, abilities)

### Safety
- **Read-only access** (can't modify FoundryVTT data)
- **Docker isolation** (secure container environment)
- **Error handling** (graceful fallbacks)

## Path Configuration

The system looks for FoundryVTT data at:
- **Local:** `C:\foundryvttstorage\Data\worlds\`
- **Docker:** `/foundry/data/Data/worlds/`

Make sure your `.env` file has:
```
FOUNDRY_DATA_PATH=C:/foundryvttstorage
```

## Example Index File

```
Agu|irongods|/foundry/data/Data/worlds/irongods/data/actors
Tokala|irongods|/foundry/data/Data/worlds/irongods/data/actors
Eldrin|pathfinder|/foundry/data/Data/worlds/pathfinder/data/actors
```

## Example Usage

```
User: /actor name:Tokala info:stats
Bot: 📋 Tokala (irongods)
     📊 Stats:
     • Level: 8
     • Class: Ranger
     • Race: Human
     • Hit Points: 67/67
     • Armor Class: 18
```

This system provides efficient, intelligent access to all your FoundryVTT character data while maintaining security and performance!
