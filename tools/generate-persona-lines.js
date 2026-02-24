#!/usr/bin/env node
/**
 * Generate extra in-character lines (one-liners / reactions) for each persona using Ollama.
 * Slow, no-deadline batch: one personality at a time with delay. Never overwrites existing.
 *
 * Usage: node tools/generate-persona-lines.js [--dry-run] [--resume]
 *   --dry-run  Log what would be done; no Ollama calls or file writes
 *   --resume   Skip personalities that already have ## One-Liners
 *
 * Requires: OLLAMA_URL (default http://localhost:5080)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PERSONALITY_DIR = path.join(__dirname, '..', 'data', 'personalities');
const DELAY_MS = 60 * 1000;
const OLLAMA_TIMEOUT_MS = 300000;
const MAX_RETRIES = 2;
const LINES_PER_PERSONA = 5;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

function parsePersonalityFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const name = content.match(/^# Life \d+: (.+)$/m)?.[1]?.trim() || '';
    const cls = content.match(/\*\*Class:\*\*\s*(.+)/)?.[1]?.trim() || '';
    const alignment = content.match(/\*\*Alignment:\*\*\s*(.+)/i)?.[1]?.trim() || '';
    const hasOneLiners = /## One-Liners\s*\n/.test(content);
    const personalityBlock = content.match(/## Personality\s*\n([\s\S]*?)(?=\n## |$)/);
    const personality = personalityBlock ? personalityBlock[1].trim() : '';
    const speechBlock = content.match(/## Speech Style\s*\n([\s\S]*?)(?=\n## |$)/);
    const speechStyle = speechBlock ? speechBlock[1].trim() : '';
    const toneMatch = content.match(/## Tone\s*\n([^\n]+)/);
    const tone = toneMatch ? toneMatch[1].trim() : '';
    return { name, class: cls, alignment, hasOneLiners, personality, speechStyle, tone };
}

function setOrAppendOneLiners(content, lines) {
    const block = '## One-Liners\n' + lines.map(l => `- ${l.trim()}`).join('\n') + '\n';
    if (content.includes('## One-Liners')) {
        return content.replace(/## One-Liners\s*\n[\s\S]*?(\n(?=## )|$)/, block + '\n');
    }
    if (content.includes('## Flavor Notes')) {
        return content.replace(/(\n## Flavor Notes)/, '\n' + block.trim() + '\n$1');
    }
    if (content.includes('## Memory Snippets')) {
        return content.replace(/(\n## Memory Snippets)/, '\n' + block.trim() + '\n$1');
    }
    return content.trimEnd() + '\n\n' + block.trim() + '\n';
}

async function ollamaGenerate(prompt, system, options = {}) {
    const url = (process.env.OLLAMA_URL || 'http://localhost:5080').replace(/\/$/, '');
    const model = options.model || process.env.OLLAMA_MODEL_FAST || 'qwen2.5:7b';
    const body = {
        model,
        prompt: system ? `${system}\n\n${prompt}` : prompt,
        stream: false,
        options: {
            num_predict: options.maxTokens ?? 512,
            temperature: options.temperature ?? 0.6
        }
    };
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), options.timeout || OLLAMA_TIMEOUT_MS);
    try {
        const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(to);
        if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.response || '').trim();
    } finally {
        clearTimeout(to);
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('Generate persona one-liners — Ollama, slow batch');
    console.log('Options:', { DRY_RUN, RESUME, DELAY_MS: DELAY_MS / 1000 + 's' });

    const files = fs.readdirSync(PERSONALITY_DIR)
        .filter(f => f.endsWith('.md') && /^\d{2}_/.test(f))
        .sort();
    const personas = files.map(f => ({
        file: f,
        filePath: path.join(PERSONALITY_DIR, f),
        ...parsePersonalityFile(path.join(PERSONALITY_DIR, f))
    }));

    let done = 0;
    for (const p of personas) {
        if (RESUME && p.hasOneLiners) {
            console.log(`[SKIP] ${p.file} (already has One-Liners)`);
            continue;
        }
        const personaBlurb = [
            p.personality && `Personality: ${p.personality}`,
            p.speechStyle && `Speech style: ${p.speechStyle}`,
            p.tone && `Tone: ${p.tone}`,
            p.alignment && `Alignment: ${p.alignment}`
        ].filter(Boolean).join('\n');

        const prompt = `Persona: ${p.name}, ${p.class}.\n\n${personaBlurb}\n\nGenerate exactly ${LINES_PER_PERSONA} short in-character one-liners or reactions (each 1 short sentence, first person, as ${p.name} would say it). Variety: a memory, a reaction to something, a belief, a quip. Output only the ${LINES_PER_PERSONA} lines, one per line, no numbering or bullets.`;
        const sys = `You are writing one-liners for an android's past-life personality in Pathfinder. Output only the lines, one per line. No preamble.`;

        if (DRY_RUN) {
            console.log(`[DRY] ${p.file} ${p.name} → would call Ollama for ${LINES_PER_PERSONA} lines`);
            continue;
        }

        let raw = '';
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                raw = await ollamaGenerate(prompt, sys, { maxTokens: 400, timeout: OLLAMA_TIMEOUT_MS });
                const lines = raw.split('\n').map(l => l.replace(/^[\d\-*.]+\s*/, '').trim()).filter(l => l.length > 5);
                if (lines.length >= 2) {
                    const toWrite = lines.slice(0, LINES_PER_PERSONA);
                    const content = fs.readFileSync(p.filePath, 'utf8');
                    const newContent = setOrAppendOneLiners(content, toWrite);
                    fs.writeFileSync(p.filePath, newContent, 'utf8');
                    done++;
                    console.log(`[${done}] ${p.file} ${p.name} — ${toWrite.length} lines`);
                    break;
                }
            } catch (err) {
                console.warn(`  ${p.file} attempt ${attempt} failed:`, err.message);
                if (attempt <= MAX_RETRIES) await sleep(10000);
            }
        }
        if (done < personas.length) await sleep(DELAY_MS);
    }
    console.log(`\nDone. Processed ${done} personas.`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
