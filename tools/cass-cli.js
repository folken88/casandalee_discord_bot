#!/usr/bin/env node
/**
 * Casandalee CLI Test Harness
 * Send queries directly to Cass's systems without Discord.
 * 
 * Usage:
 *   node tools/cass-cli.js                     # Interactive REPL mode
 *   node tools/cass-cli.js "Who is Tokala?"     # Single query mode
 *   node tools/cass-cli.js --health             # Check LLM provider health
 *   node tools/cass-cli.js --stats              # Show LLM usage stats
 *   node tools/cass-cli.js --timeline "Hellion" # Search timeline directly
 *   node tools/cass-cli.js --dossier "Tokala"   # View a character dossier
 *   node tools/cass-cli.js --ollama "test"      # Test Ollama directly
 *   node tools/cass-cli.js --claude "test"      # Test Claude directly
 *   node tools/cass-cli.js --logs               # Show recent log entries
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Load environment from the project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Override Ollama URL for local (host) access instead of Docker-internal hostname
// In Docker: http://ollama:11434, from host: http://localhost:5080
if (!process.env.OLLAMA_HOST_URL) {
    process.env.OLLAMA_URL = 'http://localhost:5080';
}

// Import Cass's systems
const llmRouter = require('../src/utils/llmRouter');
const llmHandler = require('../src/utils/llmHandler');
const timelineCache = require('../src/utils/timelineCache');
const timelineSearch = require('../src/utils/timelineSearch');
const dossierManager = require('../src/utils/dossierManager');
const nameResolver = require('../src/utils/nameResolver');
const campaignContext = require('../src/utils/campaignContext');

// ANSI color helpers
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m'
};

function c(color, text) {
    return `${colors[color]}${text}${colors.reset}`;
}

function banner() {
    console.log(c('cyan', '╔═══════════════════════════════════════════╗'));
    console.log(c('cyan', '║') + c('bright', '   Casandalee CLI Test Harness            ') + c('cyan', '║'));
    console.log(c('cyan', '║') + c('dim', '   Direct access to Cass\'s brain           ') + c('cyan', '║'));
    console.log(c('cyan', '╚═══════════════════════════════════════════╝'));
    console.log();
}

async function showHealth() {
    console.log(c('yellow', '\n--- LLM Provider Health ---'));
    const health = await llmRouter.checkHealth();
    for (const [provider, available] of Object.entries(health)) {
        const status = available ? c('green', '✓ ONLINE') : c('red', '✗ OFFLINE');
        console.log(`  ${provider.padEnd(10)} ${status}`);
    }
    console.log();
}

function showStats() {
    console.log(c('yellow', '\n--- LLM Usage Stats ---'));
    const stats = llmRouter.getStats();
    for (const [provider, data] of Object.entries(stats)) {
        console.log(`  ${c('bright', provider.padEnd(10))} calls: ${data.calls}  errors: ${data.errors}  tokens: ${data.totalTokens}`);
    }
    console.log();
}

async function searchTimeline(query) {
    console.log(c('yellow', `\n--- Timeline Search: "${query}" ---`));
    
    // Try the indexed cache first
    const cacheResults = timelineCache.search(query);
    if (cacheResults.length > 0) {
        console.log(c('dim', `  (via indexed cache, ${cacheResults.length} results)`));
        for (const event of cacheResults.slice(0, 10)) {
            console.log(`  ${c('cyan', event.date?.padEnd(12) || '???')} ${c('dim', `[${event.location}]`)} ${event.description?.substring(0, 100)}`);
            console.log(c('dim', `    score: ${event.score}`));
        }
    } else {
        // Fallback to standard search
        const results = timelineSearch.search(query);
        console.log(c('dim', `  (via standard search, ${results.length} results)`));
        for (const event of results.slice(0, 10)) {
            console.log(`  ${c('cyan', event.date?.padEnd(12) || '???')} ${c('dim', `[${event.location}]`)} ${event.description?.substring(0, 100)}`);
        }
    }
    console.log();
}

function showDossier(name) {
    console.log(c('yellow', `\n--- Dossier: "${name}" ---`));
    const resolved = nameResolver.resolve(name);
    if (!resolved) {
        console.log(c('red', `  No match found for "${name}"`));
        console.log(c('dim', `  Known names: ${nameResolver.getAllNames().join(', ')}`));
        return;
    }
    console.log(c('green', `  Resolved: ${resolved}`));
    
    const dossier = dossierManager.getDossier(resolved);
    if (dossier) {
        console.log(c('bright', `  ${dossier.canonicalName}`));
        if (dossier.race) console.log(`    Race: ${dossier.race}`);
        if (dossier.class) console.log(`    Class: ${dossier.class}`);
        if (dossier.level) console.log(`    Level: ${dossier.level}`);
        if (dossier.playerUpdates?.length) {
            console.log(`    Notes: ${dossier.playerUpdates.length}`);
        }
        if (dossier.rollHistory?.length) {
            console.log(`    Rolls: ${dossier.rollHistory.length}`);
        }
        if (dossier.timelineReferences?.length) {
            console.log(`    Timeline refs: ${dossier.timelineReferences.length}`);
        }
    } else {
        console.log(c('dim', `  No dossier exists yet for ${resolved}`));
    }
    console.log();
}

async function testOllama(prompt) {
    console.log(c('yellow', `\n--- Ollama Direct Test ---`));
    console.log(c('dim', `  Model: ${process.env.OLLAMA_MODEL_FAST || 'qwen2.5:7b'}`));
    console.log(c('dim', `  URL: ${process.env.OLLAMA_URL || 'http://ollama:11434'}`));
    console.log(c('dim', `  Prompt: ${prompt}`));
    
    try {
        const start = Date.now();
        const result = await llmRouter.ollamaGenerate(prompt, {
            system: 'You are Casandalee, a helpful AI goddess. Keep responses brief.',
            maxTokens: 200,
            temperature: 0.7
        });
        const elapsed = Date.now() - start;
        
        console.log(c('green', `\n  Response (${elapsed}ms):`));
        console.log(`  ${result}`);
    } catch (err) {
        console.log(c('red', `  Error: ${err.message}`));
    }
    console.log();
}

async function testClaude(prompt) {
    console.log(c('yellow', `\n--- Claude Direct Test ---`));
    console.log(c('dim', `  Model: claude-3-5-haiku-latest`));
    console.log(c('dim', `  Prompt: ${prompt}`));
    
    try {
        const start = Date.now();
        const result = await llmRouter.claudeGenerate(prompt, {
            system: 'You are Casandalee, a helpful AI goddess. Keep responses brief.',
            maxTokens: 200,
            temperature: 0.7
        });
        const elapsed = Date.now() - start;
        
        console.log(c('green', `\n  Response (${elapsed}ms):`));
        console.log(`  ${result}`);
    } catch (err) {
        console.log(c('red', `  Error: ${err.message}`));
    }
    console.log();
}

function showLogs() {
    console.log(c('yellow', '\n--- Recent Log Entries ---'));
    const logsDir = path.join(__dirname, '..', 'logs');
    
    if (!fs.existsSync(logsDir)) {
        console.log(c('red', '  No logs directory found'));
        return;
    }

    const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse();

    if (files.length === 0) {
        console.log(c('dim', '  No log files found (check container logs instead)'));
        console.log(c('dim', '  Run: docker compose logs --tail=50'));
        return;
    }

    const latest = files[0];
    console.log(c('dim', `  Reading: ${latest}`));
    
    const content = fs.readFileSync(path.join(logsDir, latest), 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const tail = lines.slice(-20);
    
    for (const line of tail) {
        if (line.includes('ERROR')) {
            console.log(c('red', `  ${line}`));
        } else if (line.includes('WARN')) {
            console.log(c('yellow', `  ${line}`));
        } else {
            console.log(c('dim', `  ${line}`));
        }
    }
    console.log();
}

async function processQuery(query, username = 'CLI-Tester') {
    console.log(c('blue', `\n  Processing: "${query}"`));
    console.log(c('dim', `  Username: ${username}`));
    
    const start = Date.now();
    try {
        const response = await llmHandler.processQuery(query, username);
        const elapsed = Date.now() - start;
        
        console.log(c('green', `\n  Response (${elapsed}ms):`));
        console.log(`  ${response}`);
        
        // Show which personality was active
        const personality = llmHandler.getCurrentPersonality();
        if (personality) {
            console.log(c('magenta', `\n  Active Personality: ${personality.type === 'goddess' ? 'Goddess Form' : `Life #${personality.lifeNumber}: ${personality.name} (${personality.class})`}`));
        }
    } catch (err) {
        console.log(c('red', `  Error: ${err.message}`));
        if (err.stack) {
            console.log(c('dim', err.stack.split('\n').slice(1, 4).join('\n')));
        }
    }
    console.log();
}

async function interactiveMode() {
    banner();
    await showHealth();
    
    console.log(c('dim', 'Commands:'));
    console.log(c('dim', '  /health        - Check LLM providers'));
    console.log(c('dim', '  /stats         - Show usage stats'));
    console.log(c('dim', '  /timeline <q>  - Search timeline'));
    console.log(c('dim', '  /dossier <n>   - View character dossier'));
    console.log(c('dim', '  /ollama <q>    - Test Ollama directly'));
    console.log(c('dim', '  /claude <q>    - Test Claude directly'));
    console.log(c('dim', '  /personality   - Show current personality'));
    console.log(c('dim', '  /logs          - Show recent logs'));
    console.log(c('dim', '  /quit          - Exit'));
    console.log(c('dim', '  <anything>     - Send query to Cass'));
    console.log();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: c('cyan', 'cass> ')
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        if (input === '/quit' || input === '/exit' || input === '/q') {
            console.log(c('dim', 'Goodbye!'));
            process.exit(0);
        } else if (input === '/health') {
            await showHealth();
        } else if (input === '/stats') {
            showStats();
        } else if (input.startsWith('/timeline ')) {
            await searchTimeline(input.slice(10));
        } else if (input.startsWith('/dossier ')) {
            showDossier(input.slice(9));
        } else if (input.startsWith('/ollama ')) {
            await testOllama(input.slice(8));
        } else if (input.startsWith('/claude ')) {
            await testClaude(input.slice(8));
        } else if (input === '/personality') {
            const p = llmHandler.getCurrentPersonality();
            console.log(c('magenta', `\n  Current: ${p.type === 'goddess' ? 'Goddess Form' : `Life #${p.lifeNumber}: ${p.name} (${p.class}, ${p.alignment})`}`));
            console.log(c('dim', `  ${p.personality?.substring(0, 200)}`));
            console.log();
        } else if (input === '/logs') {
            showLogs();
        } else {
            await processQuery(input);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        console.log(c('dim', '\nGoodbye!'));
        process.exit(0);
    });
}

// --- Main ---
async function main() {
    const args = process.argv.slice(2);

    // Wait for timeline to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (args.length === 0) {
        await interactiveMode();
        return;
    }

    if (args[0] === '--health') {
        banner();
        await showHealth();
    } else if (args[0] === '--stats') {
        banner();
        showStats();
    } else if (args[0] === '--timeline' && args[1]) {
        await searchTimeline(args.slice(1).join(' '));
    } else if (args[0] === '--dossier' && args[1]) {
        showDossier(args.slice(1).join(' '));
    } else if (args[0] === '--ollama' && args[1]) {
        await testOllama(args.slice(1).join(' '));
    } else if (args[0] === '--claude' && args[1]) {
        await testClaude(args.slice(1).join(' '));
    } else if (args[0] === '--logs') {
        showLogs();
    } else {
        // Treat everything as a query
        const query = args.join(' ');
        banner();
        await processQuery(query);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(c('red', `Fatal error: ${err.message}`));
    process.exit(1);
});
