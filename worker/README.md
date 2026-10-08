# The Last Alibi — AI Worker

Every AI call the game makes goes through this Cloudflare Worker
(`https://thelastalibi.jonmendi.workers.dev`). It spreads the work over several
providers' free tiers, so one provider's daily limit does not stop the game.

| Route | Job | Chain (in `wrangler.toml`) |
|---|---|---|
| `POST /text` (`task: "case"`, default) | Case generation, JSON | `TEXT_CASE_CHAIN`: strong models only |
| `POST /puzzle` | Puzzle HTML | `TEXT_CASE_CHAIN` |
| `POST /text` (`task: "chat"`) | Suspect interviews | `TEXT_CHAT_CHAIN` |
| `POST /text` (`task: "utility"`) | Rewriting image prompts | `TEXT_UTILITY_CHAIN` |
| `POST /image` | Images | `IMAGE_CHAIN`: providers used for nothing else |
| `POST /tts` | Narration | Workers AI (the game falls back to the browser's voice) |

Each chain is a list of `provider:model`, tried in order. An entry is skipped if
its key is not set or it ran out of quota recently; a JSON answer that does not
parse moves on to the next entry. When a whole chain is out, the Worker answers
with error 4006 and the game shows "closed for today". Every answer carries
`X-AI-Provider` / `X-AI-Model`, and `raw.attempts` in the JSON body lists what
was tried (visible in the game's Debug panel).

## Setup (once)

```sh
cd worker
npm install
npx wrangler login            # opens the browser to authorise this machine
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put CEREBRAS_API_KEY
npx wrangler secret put POLLINATIONS_API_KEY
# optional reserve: npx wrangler secret put OPENROUTER_API_KEY
```

Exhausted providers are remembered across Cloudflare's servers in the `QUOTA`
KV namespace (already set up in `wrangler.toml`).

## Day to day

```sh
npm test         # routing tests, all providers mocked
npm run check    # bundle without deploying
npm run deploy   # publish
```

To change a model, edit its chain in `wrangler.toml` and deploy. Provider model
lists: Gemini (Google AI Studio), Groq, Cerebras, Pollinations
(`https://gen.pollinations.ai/image/models`).
