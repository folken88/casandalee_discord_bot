#!/usr/bin/env node
/**
 * Test battery for Cass — runs 25 questions against Ollama and grades results.
 * Forces Ollama-only mode by unsetting ANTHROPIC_API_KEY.
 * Usage: node tools/test-battery.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

// Force Ollama-only by removing Claude API key
delete process.env.ANTHROPIC_API_KEY;

// Override Docker hostname for local testing
// Docker Ollama is mapped to port 5080 on the host
if (process.env.OLLAMA_URL) {
    process.env.OLLAMA_URL = 'http://localhost:5080';
}

const llmHandler = require('../src/utils/llmHandler');

const QUESTIONS = [
    // Previously failed questions
    { q: "what heads does rhyarca have for 'speak with head' activities?", expect: "should mention Body Bag, humanoid skulls, Chelish Agent, Tiefling Diabolist, etc." },
    { q: "who is Tokala?", expect: "half-orc warpriest, Iron Gods campaign, player character" },
    { q: "what happened to Hellion?", expect: "should reference Iron Gods events — Hellion was an AI/deity in Scrapwall" },
    { q: "who is Nomkath?", expect: "catfolk rogue, Iron Gods party member" },

    // Character knowledge
    { q: "what class is Rhyarca?", expect: "Oracle" },
    { q: "who plays Storgrim?", expect: "should identify the player" },
    { q: "tell me about Meyanda", expect: "android cleric, reformed, Iron Gods" },
    { q: "who is Kate Blackwood?", expect: "Carrion Crown character, Mandi's character" },
    { q: "what campaign is Dismas in?", expect: "Carrion Crown" },

    // Item knowledge
    { q: "what does the Bank of Besmara do?", expect: "locket, bag of holding for coins, no magic aura" },
    { q: "what is the Corsair's Coat?", expect: "mithral chain shirt, acrobatics bonus, CMD bonus" },
    { q: "what is the Body Bag?", expect: "container used by Rhyarca, Carriers by Calvin" },

    // Place knowledge
    { q: "where is Torch?", expect: "Numeria, town with a flame that went out" },
    { q: "tell me about Scrapwall", expect: "Numeria, junkyard settlement, Iron Gods" },
    { q: "what is Tidewater Rock?", expect: "Shackles, fortress/castle" },

    // Timeline / event knowledge
    { q: "when did the party arrive at Scrapwall?", expect: "should give a date or session reference" },
    { q: "what happened at Feldgrau?", expect: "Carrion Crown, Whispering Way battle, Vrood" },

    // Lore knowledge
    { q: "what is the Whispering Way?", expect: "undead cult/organization in Carrion Crown" },
    { q: "who is the Whispering Tyrant?", expect: "Tar-Baphon, undead lich king" },
    { q: "what is the Glorious Reclamation?", expect: "paladin uprising, Hells Vengeance" },

    // Cross-reference / reasoning
    { q: "what items does Rhyarca carry?", expect: "should list equipment from character sheet" },
    { q: "how many campaigns does Cass track?", expect: "5 campaigns (IG, SS, CC, HR, HV)" },

    // Edge cases
    { q: "who is Cass?", expect: "should identify as Casandalee, the AI/goddess" },
    { q: "what's Goats Head Port?", expect: "Shackles location, port town" },
    { q: "tell me about the Cumbers of Ustalav", expect: "novel series, book lore" },
];

async function runBattery() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  CASS TEST BATTERY — ${QUESTIONS.length} questions`);
    console.log(`  Model: ${process.env.OLLAMA_MODEL_FAST || 'qwen2.5:14b'}`);
    console.log(`  Mode: Ollama-only (Claude API key removed)`);
    console.log(`${'='.repeat(70)}\n`);

    const results = [];

    for (let i = 0; i < QUESTIONS.length; i++) {
        const { q, expect } = QUESTIONS[i];
        console.log(`\n--- Question ${i + 1}/${QUESTIONS.length} ---`);
        console.log(`Q: ${q}`);
        console.log(`Expected: ${expect}`);

        const start = Date.now();
        try {
            const response = await llmHandler.processQuery(q, 'Toby', '303941189332107264', 'test-channel');
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`A (${elapsed}s): ${response}`);
            results.push({ i: i + 1, q, expect, response, elapsed, error: null });
        } catch (err) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`ERROR (${elapsed}s): ${err.message}`);
            results.push({ i: i + 1, q, expect, response: null, elapsed, error: err.message });
        }
    }

    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('  RESULTS SUMMARY');
    console.log(`${'='.repeat(70)}`);
    for (const r of results) {
        const status = r.error ? 'ERROR' : 'OK';
        const answer = r.error ? r.error : (r.response || '').substring(0, 120).replace(/\n/g, ' ');
        console.log(`  ${String(r.i).padStart(2)}. [${status}] (${r.elapsed}s) ${r.q}`);
        console.log(`      → ${answer}`);
    }
    console.log(`\n  Total: ${results.length} | Errors: ${results.filter(r => r.error).length}`);
    console.log(`${'='.repeat(70)}\n`);
}

runBattery().catch(err => {
    console.error('Battery failed:', err);
    process.exit(1);
});
