#!/usr/bin/env node
/**
 * cass-probe — manual test harness for the conversation pipeline.
 *
 * Sends a question through the REAL conversation.respond() pipeline (same code
 * path as Discord mentions//ask) and prints the answer plus pipeline internals,
 * WITHOUT posting to Discord and WITHOUT writing conversation logs or GM lore
 * (noLog test mode) unless --live is passed.
 *
 * Usage (inside the container):
 *   node tools/cass-probe.js "When did Hellion die?"
 *   node tools/cass-probe.js "why acid on his face?" --speaker Toni --campaign jg \
 *        --replied "Casandalee: [embed] Recollection | ... Anotep villa ..." \
 *        --transcript "Toni: creepy stuff last session"
 *   node tools/cass-probe.js "lore statement here" --speaker Toby --gm
 * Flags:
 *   --speaker <name>     speaker name Cass addresses (default: Probe)
 *   --gm                 speaker is the GM (worldbuilder)
 *   --campaign <code>    ig|ss|cc|jg|hr|hv|km|oa
 *   --transcript <text>  recent-conversation block ("Name: text" lines, \n-separated)
 *   --replied <text>     the message being replied to
 *   --live               real mode: DO write conversation log + GM lore capture
 *   --quiet              print only the response (no internals)
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));
const conversation = require('../src/utils/conversation');

function parseArgs(argv) {
    const opts = { query: null, speaker: 'Probe', gm: false, campaign: null, transcript: '', replied: '', live: false, quiet: false };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--speaker') opts.speaker = argv[++i];
        else if (a === '--gm') opts.gm = true;
        else if (a === '--campaign') opts.campaign = (argv[++i] || '').toLowerCase();
        else if (a === '--transcript') opts.transcript = argv[++i] || '';
        else if (a === '--replied') opts.replied = argv[++i] || '';
        else if (a === '--live') opts.live = true;
        else if (a === '--quiet') opts.quiet = true;
        else rest.push(a);
    }
    opts.query = rest.join(' ').trim();
    return opts;
}

(async () => {
    const o = parseArgs(process.argv.slice(2));
    if (!o.query) {
        console.error('Usage: node tools/cass-probe.js "<question>" [--speaker X] [--gm] [--campaign cc] [--transcript "..."] [--replied "..."] [--live] [--quiet]');
        process.exit(1);
    }

    const t0 = Date.now();
    const result = await conversation.respond({
        query: o.query,
        speakerName: o.speaker,
        userId: 'probe',
        channelName: 'probe',
        campaign: o.campaign,
        isGM: o.gm,
        transcript: o.transcript,
        repliedTo: o.replied,
        noLog: !o.live,
        debug: true
    });
    const ms = Date.now() - t0;

    if (o.quiet) {
        console.log(result.response);
    } else {
        console.log('══════ CASS-PROBE ══════');
        console.log(`speaker=${o.speaker}${o.gm ? ' (GM)' : ''}  campaign=${o.campaign || '—'}  live=${o.live}  ${ms}ms`);
        console.log(`intent=${result.understanding.intent}  entities=[${result.understanding.entities.join(', ')}]  terms=[${result.understanding.search_terms.join(', ')}]  context=${result.contextChars} chars${result.wouldCaptureLore ? '  [would capture GM lore]' : ''}`);
        console.log('──────── RESPONSE ────────');
        console.log(result.response);
    }
    process.exit(0);
})().catch(err => { console.error('PROBE ERROR:', err.message); process.exit(1); });
