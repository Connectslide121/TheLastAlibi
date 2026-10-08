// The Last Alibi's AI Worker (https://thelastalibi.jonmendi.workers.dev).
//
//   POST /text    { prompt, systemPrompt?, maxTokens?, temperature?, task?, json? }
//   POST /puzzle  same body; puzzles are HTML, written by the case-generation chain
//   POST /image   { prompt, width?, height?, seed? }  -> image bytes
//   POST /tts     { text, speaker?, encoding? }        -> audio/mpeg
//
// Text and image jobs are routed across several providers' free tiers (see
// providers.js and the chains in wrangler.toml). `task` picks the chain:
// "case" (default; strong models only), "chat" (interviews) or "utility".
// `json: true` asks for JSON mode and makes the Worker reject answers that do
// not parse, moving on to the next model instead.
//
// Responses carry X-AI-Provider / X-AI-Model saying who answered; the JSON
// body's `raw.attempts` lists every provider tried, for the game's Debug panel.

import { parseChain, runImage, runText } from "./providers.js";

// Used when wrangler.toml does not set a chain.
const DEFAULT_CHAINS = {
  TEXT_CASE_CHAIN: "workers-ai:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  TEXT_CHAT_CHAIN: "workers-ai:@cf/meta/llama-3.1-8b-instruct-fast",
  TEXT_UTILITY_CHAIN: "workers-ai:@cf/meta/llama-3.1-8b-instruct-fast",
  IMAGE_CHAIN: "workers-ai:@cf/black-forest-labs/flux-2-klein-9b",
};

const TASK_CHAINS = { case: "TEXT_CASE_CHAIN", chat: "TEXT_CHAT_CHAIN", utility: "TEXT_UTILITY_CHAIN" };

const chainFor = (env, name) => parseChain(env[name] || DEFAULT_CHAINS[name]);

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "X-AI-Provider, X-AI-Model",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method !== "POST") {
      return new Response("Only POST allowed", { status: 405, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/image" || url.pathname === "/") {
        return await handleImage(request, env, corsHeaders);
      }
      if (url.pathname === "/text") {
        return await handleText(request, env, corsHeaders, "text");
      }
      if (url.pathname === "/puzzle") {
        return await handleText(request, env, corsHeaders, "puzzle");
      }
      if (url.pathname === "/tts") {
        return await handleTts(request, env, corsHeaders);
      }
      return jsonResponse({ error: `Unknown route: ${url.pathname}` }, 404, corsHeaders);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500, corsHeaders);
    }
  },
};

/**
 * When every provider in a chain is out of quota, answer the way Workers AI
 * does (error 4006): the game already recognises that and tells the player to
 * come back after midnight UTC.
 */
function exhaustedResponse(result, corsHeaders) {
  const error = result.quota
    ? "4006: daily free allocation used up on every configured provider"
    : "Every configured provider failed";
  return jsonResponse({ error, attempts: result.attempts }, result.quota ? 429 : 502, corsHeaders);
}

async function handleText(request, env, corsHeaders, route) {
  const body = await request.json();
  const {
    prompt,
    systemPrompt,
    maxTokens = route === "puzzle" ? 4000 : 1500,
    temperature = route === "puzzle" ? 0.4 : 0.7,
    json = false,
  } = body;
  // Puzzles are part of building a case: same strong-only chain.
  const task = route === "puzzle" ? "case" : TASK_CHAINS[body.task] ? body.task : "case";

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const result = await runText(env, chainFor(env, TASK_CHAINS[task]), {
    messages,
    maxTokens,
    temperature,
    json: !!json,
    task,
  });
  if (!result.ok) return exhaustedResponse(result, corsHeaders);

  return jsonResponse(
    {
      text: result.text,
      raw: { provider: result.provider, model: result.model, usage: result.usage, attempts: result.attempts },
    },
    200,
    { ...corsHeaders, "X-AI-Provider": result.provider, "X-AI-Model": result.model },
  );
}

async function handleImage(request, env, corsHeaders) {
  const { prompt, width, height, seed } = await request.json();
  const result = await runImage(env, chainFor(env, "IMAGE_CHAIN"), {
    prompt,
    width: width || 1024,
    height: height || 768,
    seed,
  });
  if (!result.ok) return exhaustedResponse(result, corsHeaders);

  return new Response(result.bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": result.type,
      "X-AI-Provider": result.provider,
      "X-AI-Model": result.model,
    },
  });
}

async function handleTts(request, env, corsHeaders) {
  const { text, encoding = "mp3", speaker = "zeus" } = await request.json();

  if (!text || typeof text !== "string") {
    return jsonResponse({ error: "Missing text" }, 400, corsHeaders);
  }

  const audioStream = await env.AI.run("@cf/deepgram/aura-2-en", { text, speaker, encoding });

  return new Response(audioStream, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
