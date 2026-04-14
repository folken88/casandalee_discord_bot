#!/usr/bin/env node
/**
 * Hidden crosstalk testing — generates N sample conversations without
 * posting to Discord, saving to vault, or touching relationships.
 *
 * Usage (inside docker container):
 *   node tools/test-crosstalk.js [count]
 *
 * Default count is 5.
 */

// Load env from .env if present (same pattern as src/index.js)
require('dotenv').config();

const { _test } = require('../src/utils/crosstalk');
const { generateConversation, qualityGate } = _test;

async function runSamples(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const startTs = Date.now();
        try {
            const convo = await generateConversation();
            const gate = await qualityGate(convo.raw, convo.personas, convo.topic);
            results.push({
                index: i + 1,
                personas: convo.personas.map(p => `${p.name} (${p.birthYear != null ? `${p.birthYear} AR` : `Life ${p.lifeNumber}`}, ${p.class}, ${p.alignment})`),
                topic: convo.topic,
                verdict: gate.verdict,
                text: gate.text,
                rawText: convo.raw,
                elapsedMs: Date.now() - startTs
            });
        } catch (err) {
            results.push({
                index: i + 1,
                error: err.message,
                elapsedMs: Date.now() - startTs
            });
        }
    }
    return results;
}

async function main() {
    const count = parseInt(process.argv[2], 10) || 5;
    const fs = require('fs');
    const path = require('path');
    // Write to data/ which is volume-mounted to host
    const outPath = path.join(__dirname, '../data/crosstalk-test-output.txt');

    console.log(`\n=== CROSSTALK HIDDEN TEST — generating ${count} samples ===\n`);
    const results = await runSamples(count);

    const lines = [];
    lines.push(`\n=== CROSSTALK HIDDEN TEST — ${count} samples — ${new Date().toISOString()} ===\n`);
    for (const r of results) {
        lines.push('\n' + '='.repeat(70));
        lines.push(`SAMPLE ${r.index}  (${Math.round(r.elapsedMs / 1000)}s)`);
        lines.push('='.repeat(70));
        if (r.error) {
            lines.push(`ERROR: ${r.error}`);
            continue;
        }
        lines.push(`PERSONAS: ${r.personas.join(' | ')}`);
        lines.push(`TOPIC:    "${r.topic.opener}" (${r.topic.tone})`);
        lines.push(`VERDICT:  ${r.verdict}`);
        lines.push('---');
        lines.push(r.text);
        if (r.verdict === 'POLISH') {
            lines.push('---');
            lines.push('RAW (before polish):');
            lines.push(r.rawText);
        }
    }

    lines.push('\n' + '='.repeat(70));
    lines.push('DONE');
    lines.push('='.repeat(70));
    const verdicts = results.filter(r => !r.error).reduce((acc, r) => {
        acc[r.verdict] = (acc[r.verdict] || 0) + 1;
        return acc;
    }, {});
    lines.push(`Verdicts: ${JSON.stringify(verdicts)}`);
    const errors = results.filter(r => r.error).length;
    if (errors > 0) lines.push(`Errors: ${errors}`);

    const output = lines.join('\n');
    console.log(output);
    fs.writeFileSync(outPath, output, 'utf8');
    console.log(`\nWritten to: ${outPath}`);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
