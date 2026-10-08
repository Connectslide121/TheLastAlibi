// Routing tests: the real Worker, with every provider mocked. `npm test`.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { _resetQuotaMemory, quotaWindow } from "../src/providers.js";

const VARS = {
  TEXT_CASE_CHAIN: "gemini:g-strong, groq:q-strong",
  TEXT_CHAT_CHAIN: "groq:q-fast, workers-ai:@cf/small",
  TEXT_UTILITY_CHAIN: "workers-ai:@cf/small",
  IMAGE_CHAIN: "pollinations:flux-p, workers-ai:@cf/flux",
};
const KEYS = { GEMINI_API_KEY: "g", GROQ_API_KEY: "q", POLLINATIONS_API_KEY: "p" };

/** Mock providers: `plan[host]` is a list of responses served in order. */
function mockFetch(plan) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const host = new URL(url).host;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host, url: String(url), body });
    const next = (plan[host] || []).shift();
    if (!next) throw new Error(`unexpected call to ${host}`);
    return next(body);
  };
  return calls;
}

const chat = (content, status = 200, headers = {}) => () =>
  new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }) : content, {
    status,
    headers,
  });

const env = (extra = {}) => ({
  ...VARS,
  ...KEYS,
  AI: { run: async (model) => ({ response: `{"from":"${model}"}`, image: btoa("PNG") }) },
  ...extra,
});

const post = (path, body) =>
  new Request(`https://w.example${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => _resetQuotaMemory());

test("case generation uses the first strong model, in JSON mode", async () => {
  const calls = mockFetch({ "generativelanguage.googleapis.com": [chat('{"ok":1}')] });
  const res = await worker.fetch(post("/text", { prompt: "p", json: true }), env());
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.text, '{"ok":1}');
  assert.equal(res.headers.get("X-AI-Provider"), "gemini");
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
});

test("a daily limit moves on, and the provider is skipped afterwards", async () => {
  const daily = chat('{"error":"Rate limit reached ... requests per day (RPD)"}', 429);
  mockFetch({
    "generativelanguage.googleapis.com": [daily],
    "api.groq.com": [chat('{"n":1}'), chat('{"n":2}')],
  });
  const first = await (await worker.fetch(post("/text", { prompt: "p", json: true }), env())).json();
  assert.equal(first.raw.provider, "groq");
  // Gemini is remembered as out: the second request goes straight to Groq.
  const second = await (await worker.fetch(post("/text", { prompt: "p", json: true }), env())).json();
  assert.equal(second.raw.provider, "groq");
  assert.equal(second.raw.attempts[0].skipped, "quota");
});

test("invalid JSON from one strong model falls through to the next", async () => {
  mockFetch({
    "generativelanguage.googleapis.com": [chat('{"half": ')],
    "api.groq.com": [chat("```json\n{\"whole\":true}\n```")],
  });
  const data = await (await worker.fetch(post("/text", { prompt: "p", json: true }), env())).json();
  assert.equal(data.raw.provider, "groq");
  assert.match(data.raw.attempts[0].error, /invalid JSON/);
});

test("case generation never falls back to a small model", async () => {
  mockFetch({
    "generativelanguage.googleapis.com": [chat("down", 503)],
    "api.groq.com": [chat("down", 503)],
  });
  const res = await worker.fetch(post("/text", { prompt: "p", json: true }), env());
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.ok(!data.attempts.some((a) => a.key.startsWith("workers-ai")));
});

test("when every strong model is out of quota the game gets a 4006 error", async () => {
  const out = chat('{"error":"tokens per day exceeded"}', 429);
  mockFetch({ "generativelanguage.googleapis.com": [out], "api.groq.com": [out] });
  const res = await worker.fetch(post("/text", { prompt: "p", json: true }), env());
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /4006/);
});

test("providers without a key are skipped", async () => {
  mockFetch({ "api.groq.com": [chat('{"k":1}')] });
  const { GEMINI_API_KEY, ...noGemini } = env();
  const data = await (await worker.fetch(post("/text", { prompt: "p", json: true }), noGemini)).json();
  assert.equal(data.raw.provider, "groq");
  assert.equal(data.raw.attempts[0].skipped, "no key");
});

test("an unsupported optional parameter is retried without it", async () => {
  const calls = mockFetch({
    "generativelanguage.googleapis.com": [chat('{"error":"Unknown name \\"response_format\\""}', 400), chat('{"r":1}')],
  });
  const data = await (await worker.fetch(post("/text", { prompt: "p", json: true }), env())).json();
  assert.equal(data.raw.provider, "gemini");
  assert.equal(calls[1].body.response_format, undefined);
});

test("reasoning models get room to think", async () => {
  const calls = mockFetch({ "generativelanguage.googleapis.com": [chat('{"a":1}')] });
  await worker.fetch(post("/text", { prompt: "p", json: true, maxTokens: 1000 }), env({ TEXT_CASE_CHAIN: "gemini:gemini-3-flash-preview" }));
  assert.equal(calls[0].body.max_tokens, 5096);
  assert.equal(calls[0].body.reasoning_effort, "medium");
});

test("interviews use the chat chain and may fall back to a small model", async () => {
  mockFetch({ "api.groq.com": [chat("busy", 429, { "retry-after": "20" })] });
  const data = await (await worker.fetch(post("/text", { prompt: "p", task: "chat", json: true }), env())).json();
  assert.equal(data.raw.provider, "workers-ai");
});

test("puzzles use the strong chain, without JSON checks", async () => {
  mockFetch({ "generativelanguage.googleapis.com": [chat("<html>puzzle</html>")] });
  const data = await (await worker.fetch(post("/puzzle", { prompt: "p" }), env())).json();
  assert.equal(data.text, "<html>puzzle</html>");
  assert.equal(data.raw.provider, "gemini");
});

test("images go to Pollinations, and to Workers AI when it is out of credit", async () => {
  mockFetch({
    "gen.pollinations.ai": [
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
      () => new Response('{"error":"PAYMENT_REQUIRED"}', { status: 402 }),
    ],
  });
  const a = await worker.fetch(post("/image", { prompt: "a moonlit alley", width: 768, height: 512 }), env());
  assert.equal(a.headers.get("X-AI-Provider"), "pollinations");
  assert.deepEqual([...new Uint8Array(await a.arrayBuffer())], [1, 2, 3]);
  const b = await worker.fetch(post("/image", { prompt: "a cellar" }), env());
  assert.equal(b.headers.get("X-AI-Provider"), "workers-ai");
});

test("quota windows: stated waits win, daily wording means midnight UTC", () => {
  const now = Date.now();
  const midnight = (() => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); })();
  assert.ok(Math.abs(quotaWindow(429, "Please try again in 7.5s") - (now + 7500)) < 1000);
  assert.ok(Math.abs(quotaWindow(429, "Please try again in 2m30s") - (now + 150000)) < 1000);
  assert.ok(Math.abs(quotaWindow(429, '{"retryDelay": "40s"} You exceeded your current quota') - (now + 40000)) < 1000);
  assert.equal(quotaWindow(429, "requests per day (RPD) reached"), midnight);
  assert.equal(quotaWindow(500, "4006: you have used up your daily free allocation"), midnight);
  assert.equal(quotaWindow(402, "out of pollen"), midnight);
  assert.equal(quotaWindow(500, "internal error"), 0);
});

test("narration uses Workers AI, then Pollinations with the matching voice", async () => {
  const calls = mockFetch({
    "gen.pollinations.ai": [() => new Response(new Uint8Array([9]), { headers: { "content-type": "audio/mpeg" } })],
  });
  const speech = { ...VARS, SPEECH_CHAIN: "workers-ai:@cf/aura, pollinations:openai/tts-1" };
  const ok = await worker.fetch(post("/tts", { text: "Act I." }), env({ ...speech, AI: { run: async () => new Uint8Array([7]) } }));
  assert.equal(ok.headers.get("X-AI-Provider"), "workers-ai");
  const out = { run: async () => { throw new Error("4006: you have used up your daily free allocation"); } };
  const fallback = await worker.fetch(post("/tts", { text: "Act II.", speaker: "zeus" }), env({ ...speech, AI: out }));
  assert.equal(fallback.headers.get("X-AI-Provider"), "pollinations");
  assert.equal(calls[0].body.voice, "onyx");
});
