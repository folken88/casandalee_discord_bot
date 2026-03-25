#!/usr/bin/env node
/**
 * Test Cass locally — simulates a Discord @mention without needing Discord.
 * Usage: node tools/test-cass.js "what happened to hellion?"
 *        node tools/test-cass.js  (interactive mode)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const llmHandler = require('../src/utils/llmHandler');
const readline = require('readline');

const username = process.argv[3] || 'Toby';
const userId = process.argv[4] || '303941189332107264';

async function ask(query) {
    console.log(`\n🎤 ${username}: ${query}`);
    console.log('⏳ Processing...\n');
    const start = Date.now();
    try {
        const response = await llmHandler.processQuery(query, username, userId, 'test-channel');
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`🤖 Casandalee (${elapsed}s):\n${response}\n`);
    } catch (err) {
        console.log(`❌ Error: ${err.message}\n`);
    }
}

async function main() {
    // Single query mode
    if (process.argv[2] && !process.argv[2].startsWith('-')) {
        await ask(process.argv[2]);
        process.exit(0);
    }

    // Interactive mode
    console.log('=== Cass Test Console ===');
    console.log('Type questions to test. Ctrl+C to exit.\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> '
    });

    rl.prompt();
    rl.on('line', async (line) => {
        const query = line.trim();
        if (!query) { rl.prompt(); return; }
        if (query === 'quit' || query === 'exit') process.exit(0);
        await ask(query);
        rl.prompt();
    });
}

main().catch(console.error);
