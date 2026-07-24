# Conversation Pipeline v2 — design

**Date:** 2026-07-24
**Status:** Shipped
**Trigger:** Cass gave a vague, nonsensical reply to a GM lore message replying to a Recollection.

## Root causes of the old system's failure (observed 2026-07-24 13:34)

1. **No conversational context** — only the reply's own text reached the LLM; the
   replied-to message and channel history were absent, so pronouns ("she", "him")
   had no antecedent.
2. **Dead classifier** — queryClassifier's ladder (Gemini→Ollama→OpenRouter) had
   no OpenAI rung; on this deployment it always returned `unknown`.
3. **Garbage retrieval** — the unknown-intent path keyword-searched the vault with
   raw stopwords (`angry, cannot, let, shit, …`) and stuffed ~7k chars of noise
   into the prompt.
4. **Voice/provider mismatch** — a random past-life persona chosen for the Ollama
   path (Life #94, INT 10) was used with a gpt-4o-mini generation.

## New architecture (`src/utils/conversation.js`)

One pipeline for @mentions, replies, and `/ask`:

1. **UNDERSTAND** — a single `llmRouter.route()` call (with the recent channel
   transcript) returns `{intent, entities, search_terms, wants_timeline}`.
   Pronouns are resolved to names here. If every provider fails, a proper-noun
   heuristic takes over — the pipeline never dead-ends.
2. **RETRIEVE** — `vaultSearch.contextFor` on the resolved entities/terms (not
   raw prose). Retrieval itself now prefers proper nouns and carries an extended
   stopword list. `gm-eyes-only` notes are excluded at the search layer
   (`byText` + `contextFor`), so plot secrets cannot leak into context.
3. **RESPOND** — always Cass's **current-self voice** (shared module
   `src/utils/cassVoice.js`, also used by the daily Recollection): the AI in the
   core, not a goddess. Conversation rules: address the speaker by the exact
   given name; engage with what was actually said; be specific; 1–4 sentences;
   GM = worldbuilder (his statements are canon); one sharp follow-up question
   allowed on GM lore. Generation via `llmRouter.route()` so provider fallback
   and voice can never mismatch. Past-life personas remain only in `/memory`,
   `/persona`, and crosstalk.
4. **LEARN** — when the GM's message classifies as `lore_statement`, it is
   appended verbatim to `obsidian_cass/cassvault/Learned/gm-lore.md`
   (dated, campaign-tagged) — GM table-talk becomes durable knowledge.

**Context gathering (index.js):** `buildTranscript()` fetches the last 8 channel
messages (content + embeds rendered to text, ~2.6k char cap) and the replied-to
message is rendered separately as `repliedTo`. Both flow into the pipeline.

**`/ask` (commands/ask.js):** now uses the same pipeline (no transcript), with
the same GM-role/campaign-aware speaker resolution as the mention handler.

## Legacy

`llmHandler.processQuery` / `generateLLMResponse` are no longer called by the
mention handler or `/ask` (kept for reference; the personality fast-path
`isPersonalityQuery`/`handlePersonalityQuery` is still used via the new
pipeline). `queryClassifier` gained an OpenAI rung and remains available but the
new understand pass supersedes it for conversation.

## Verified (2026-07-24)

- Replicated the exact failed exchange: response resolved "she"→Freya, engaged
  the substance, asked one follow-up; GM lore captured to `Learned/gm-lore.md`.
- `gm-eyes-only` absent from `byText` results and `contextFor` output.
- Daily Recollection statement generates on the shared voice module.
- Bot logs in; all 7 changed files pass `node --check`.
