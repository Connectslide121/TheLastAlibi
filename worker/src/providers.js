// Provider routing for the Worker.
//
// Every AI job goes down a CHAIN of provider:model entries, configured in
// wrangler.toml ([vars]) so a model can be swapped without touching code:
//
//   TEXT_CASE_CHAIN    case generation and puzzles: strong models only
//   TEXT_CHAT_CHAIN    suspect interviews: fast models
//   TEXT_UTILITY_CHAIN small jobs (rewriting image prompts)
//   IMAGE_CHAIN        images, on providers that do nothing else
//   SPEECH_CHAIN       narration
//
// The first entry that answers wins. An entry is skipped when its provider has
// no API key configured, or when it ran out of quota recently (remembered until
// its Retry-After, or until the next 00:00 UTC for daily limits). A JSON answer
// that does not parse moves on to the next entry, so a weak or truncated answer
// never reaches the game while a stronger model is still available.

// --- OpenAI-compatible chat providers -----------------------------------------

const OPENAI_COMPATIBLE = {
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: "GEMINI_API_KEY" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: "GROQ_API_KEY" },
  cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", key: "CEREBRAS_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: "OPENROUTER_API_KEY" },
};

/** Models that think before answering: they need room for it in max_tokens. */
const REASONING = /gpt-oss|gemini-3|qwen3|deepseek-r|magistral/i;

/** Parse "provider:model, provider:model" into entries. */
export function parseChain(spec) {
  return String(spec || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      return { provider: s.slice(0, i), model: s.slice(i + 1) };
    });
}

export function hasCredentials(env, provider) {
  if (provider === "workers-ai") return !!env.AI;
  if (provider === "pollinations") return !!env.POLLINATIONS_API_KEY;
  const p = OPENAI_COMPATIBLE[provider];
  return !!(p && env[p.key]);
}

// --- quota memory ------------------------------------------------------------

const exhaustedUntil = new Map(); // "provider:model" -> epoch ms (this isolate)

function nextUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * Waits up to this long are sat out inside the request (a free tier's
 * per-minute limit: Groq allows 8,000 tokens a minute, and building a case
 * sends several large requests at once). Longer ones skip the provider.
 */
const SHORT_WAIT_MS = 20_000;
/** At most this much waiting per request, across all its providers. */
const WAIT_BUDGET_MS = 45_000;
/** A provider out for longer than this counts as "out for the day". */
const LONG_OUT_MS = 10 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Until when a provider is out (epoch ms), or 0. */
async function exhaustedUntilFor(env, key) {
  const local = exhaustedUntil.get(key);
  if (local && local > Date.now()) return local;
  if (env.QUOTA) {
    const until = Number(await env.QUOTA.get(`exhausted:${key}`));
    if (until > Date.now()) {
      exhaustedUntil.set(key, until);
      return until;
    }
  }
  return 0;
}

async function markExhausted(env, key, until) {
  exhaustedUntil.set(key, until);
  // Only lasting windows are shared: KV keeps values for at least a minute and
  // takes a while to reach other servers, too slow for a seconds-long wait.
  if (env.QUOTA && until - Date.now() > 60_000) {
    const ttl = Math.ceil((until - Date.now()) / 1000);
    await env.QUOTA.put(`exhausted:${key}`, String(until), { expirationTtl: ttl }).catch(() => {});
  }
}

/** "7.66s", "12m30s", "1h2m3.5s" -> seconds, or NaN. */
function parseDuration(s) {
  const m = String(s).match(/^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return NaN;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

/** How long the provider says to wait, in seconds, if it says so. */
function statedWait(body, retryAfter) {
  const header = Number(retryAfter);
  if (Number.isFinite(header) && header > 0) return header;
  const text = String(body || "");
  const delay = text.match(/"retryDelay"\s*:\s*"([\d.]+)s"/); // Gemini
  if (delay) return Number(delay[1]);
  const tryIn = text.match(/try again in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i); // Groq, OpenAI style
  if (tryIn) return parseDuration(tryIn[1]);
  return NaN;
}

/**
 * A failure that means "this provider is out for a while": until when (epoch
 * ms), or 0 when it is an ordinary error. A wait the provider states wins;
 * otherwise wording about daily limits means "until midnight UTC", which is
 * when Workers AI and most free tiers reset.
 */
export function quotaWindow(status, body, retryAfter) {
  const text = String(body || "");
  if (status === 402) return nextUtcMidnight(); // out of credit (Pollinations)
  if (status !== 429 && !/4006|daily free allocation/i.test(text)) return 0;
  const wait = statedWait(text, retryAfter);
  if (Number.isFinite(wait) && wait > 0) return Math.min(Date.now() + wait * 1000, nextUtcMidnight());
  if (/4006|daily|per day|\bRPD\b|\bTPD\b/i.test(text)) return nextUtcMidnight();
  return Date.now() + 60_000;
}

// --- output checks -----------------------------------------------------------

/** The JSON a model meant, without reasoning traces or code fences. */
export function cleanJsonText(raw) {
  return String(raw)
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export function isValidJson(raw) {
  try {
    JSON.parse(cleanJsonText(raw));
    return true;
  } catch {
    return false;
  }
}

// --- text ----------------------------------------------------------------------

async function openAiChat(env, provider, model, req, { jsonMode = true, reasoningHint = true } = {}) {
  const p = OPENAI_COMPATIBLE[provider];
  const reasoning = REASONING.test(model);
  const body = {
    model,
    messages: req.messages,
    temperature: req.temperature,
    // Reasoning models spend tokens thinking before they answer.
    max_tokens: reasoning ? req.maxTokens + 4096 : req.maxTokens,
  };
  if (req.json && jsonMode) body.response_format = { type: "json_object" };
  // Thinking tokens count against per-minute limits: Groq's free tier allows
  // only 8,000 a minute, so only Gemini (250k a minute) thinks harder.
  if (reasoning && reasoningHint) body.reasoning_effort = req.task === "case" && provider === "gemini" ? "medium" : "low";

  const res = await fetch(p.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env[p.key]}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    // Optional parameters are not supported everywhere: retry once without them.
    if (res.status === 400 && (jsonMode || reasoningHint) && /response_format|reasoning_effort|json_object|unsupported|unknown/i.test(raw)) {
      return openAiChat(env, provider, model, req, { jsonMode: false, reasoningHint: false });
    }
    return { ok: false, status: res.status, body: raw, retryAfter: res.headers.get("retry-after") };
  }
  const data = JSON.parse(raw);
  const message = data.choices?.[0]?.message ?? {};
  return {
    ok: true,
    text: typeof message.content === "string" ? message.content : "",
    finish: data.choices?.[0]?.finish_reason,
    usage: data.usage,
  };
}

async function workersAiChat(env, model, req) {
  try {
    const result = await env.AI.run(model, {
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
    });
    // Some models hand back JSON already parsed.
    const out = result.response;
    const text = typeof out === "string" ? out : out == null ? "" : JSON.stringify(out);
    return { ok: true, text, usage: result.usage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: /4006|daily free allocation/i.test(message) ? 429 : 500, body: message };
  }
}

/**
 * Run a job down its chain. `call(provider, model)` does one attempt and
 * returns { ok, ... } or { ok: false, status, body, retryAfter }; `reject`
 * may turn down a successful answer (empty, invalid JSON) so the next entry
 * gets a go.
 *
 * Returns the winning result with { provider, model, attempts }, or
 * { ok: false, quota, retryAfter, attempts }: `quota` is true only when every
 * provider is out for a long time (the game then says "come back tomorrow");
 * otherwise `retryAfter` says when trying again is worth it.
 */
async function runChain(env, chain, call, reject = () => null) {
  const attempts = [];
  const t0 = Date.now();
  const budgetLeft = () => WAIT_BUDGET_MS - (Date.now() - t0);
  for (const { provider, model } of chain) {
    const key = `${provider}:${model}`;
    if (!hasCredentials(env, provider)) {
      attempts.push({ key, skipped: "no key" });
      continue;
    }
    for (let tries = 0; ; tries++) {
      const until = await exhaustedUntilFor(env, key);
      if (until) {
        const wait = until - Date.now();
        if (wait <= SHORT_WAIT_MS && wait <= budgetLeft() && tries < 3) {
          await sleep(wait + 250);
        } else {
          attempts.push({ key, skipped: "quota", until });
          break;
        }
      }
      let result;
      try {
        result = await call(provider, model);
      } catch (err) {
        result = { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
      }
      if (result.ok) {
        const why = reject(result);
        if (why) {
          attempts.push({ key, error: why });
          break;
        }
        attempts.push({ key, ok: true });
        return { ...result, provider, model, attempts };
      }
      const out = quotaWindow(result.status, result.body, result.retryAfter);
      if (out) {
        await markExhausted(env, key, out);
        // A short wait: go round again and sit it out, if the budget allows.
        if (out - Date.now() <= SHORT_WAIT_MS && out - Date.now() <= budgetLeft() && tries < 2) continue;
        attempts.push({ key, status: result.status, until: out, error: String(result.body).slice(0, 200) });
      } else {
        attempts.push({ key, status: result.status, error: String(result.body).slice(0, 200) });
      }
      break;
    }
  }
  const outs = attempts.filter((a) => a.until);
  const now = Date.now();
  const quota = outs.length > 0 && attempts.every((a) => a.skipped === "no key" || (a.until && a.until - now > LONG_OUT_MS));
  const retryAfter = outs.length ? Math.max(1, Math.ceil((Math.min(...outs.map((a) => a.until)) - now) / 1000)) : undefined;
  return { ok: false, quota, retryAfter, attempts };
}

/**
 * Run a text job down its chain. `req`: { messages, maxTokens, temperature,
 * json, task }.
 */
export function runText(env, chain, req) {
  return runChain(
    env,
    chain,
    (provider, model) => (provider === "workers-ai" ? workersAiChat(env, model, req) : openAiChat(env, provider, model, req)),
    (result) => {
      if (!result.text.trim()) return "empty answer";
      if (req.json && !isValidJson(result.text)) return `invalid JSON${result.finish === "length" ? " (cut off)" : ""}`;
      return null;
    },
  );
}

// --- images ------------------------------------------------------------------

async function pollinationsImage(env, model, { prompt, width, height, seed }) {
  const params = new URLSearchParams({ model, width: String(width), height: String(height) });
  if (seed !== undefined && seed !== null) params.set("seed", String(seed));
  const res = await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params}`, {
    headers: { Authorization: `Bearer ${env.POLLINATIONS_API_KEY}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text().catch(() => ""), retryAfter: res.headers.get("retry-after") };
  }
  return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "image/jpeg" };
}

async function workersAiImage(env, model, { prompt, width, height, seed }) {
  try {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", String(width));
    form.append("height", String(height));
    if (seed !== undefined && seed !== null) form.append("seed", String(seed));
    const formResponse = new Response(form);
    const result = await env.AI.run(model, {
      multipart: { body: formResponse.body, contentType: formResponse.headers.get("content-type") },
    });
    return { ok: true, bytes: Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0)), type: "image/png" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: /4006|daily free allocation/i.test(message) ? 429 : 500, body: message };
  }
}

export function runImage(env, chain, req) {
  return runChain(env, chain, (provider, model) =>
    provider === "pollinations"
      ? pollinationsImage(env, model, req)
      : provider === "workers-ai"
        ? workersAiImage(env, model, req)
        : { ok: false, status: 0, body: `unknown image provider ${provider}` },
  );
}

// --- speech ------------------------------------------------------------------

/** Deepgram Aura speakers -> the nearest OpenAI voice (the game uses "zeus"). */
const OPENAI_VOICE = { zeus: "onyx", orion: "onyx", arcas: "echo", orpheus: "fable", athena: "nova", luna: "shimmer", asteria: "alloy" };

async function workersAiSpeech(env, model, { text, speaker, encoding }) {
  try {
    const audio = await env.AI.run(model, { text, speaker, encoding });
    return { ok: true, bytes: audio, type: "audio/mpeg" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: /4006|daily free allocation/i.test(message) ? 429 : 500, body: message };
  }
}

async function pollinationsSpeech(env, model, { text, speaker }) {
  const res = await fetch("https://gen.pollinations.ai/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.POLLINATIONS_API_KEY}` },
    body: JSON.stringify({ model, input: text, voice: OPENAI_VOICE[speaker] || "onyx", response_format: "mp3" }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text().catch(() => ""), retryAfter: res.headers.get("retry-after") };
  }
  return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), type: "audio/mpeg" };
}

export function runSpeech(env, chain, req) {
  return runChain(env, chain, (provider, model) =>
    provider === "workers-ai"
      ? workersAiSpeech(env, model, req)
      : provider === "pollinations"
        ? pollinationsSpeech(env, model, req)
        : { ok: false, status: 0, body: `unknown speech provider ${provider}` },
  );
}

/** Test hook: forget every remembered quota window. */
export function _resetQuotaMemory() {
  exhaustedUntil.clear();
}
