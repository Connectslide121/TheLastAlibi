export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    if (request.method !== "POST") {
      return new Response("Only POST allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      if (url.pathname === "/image" || url.pathname === "/") {
        return await handleImage(request, env, corsHeaders);
      }

      if (url.pathname === "/text") {
        return await handleText(request, env, corsHeaders);
      }

      if (url.pathname === "/puzzle") {
        return await handlePuzzle(request, env, corsHeaders);
      }

      if (url.pathname === "/tts") {
        return await handleTts(request, env, corsHeaders);
      }

      return jsonResponse(
        { error: `Unknown route: ${url.pathname}` },
        404,
        corsHeaders
      );
    } catch (err) {
      return jsonResponse(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        500,
        corsHeaders
      );
    }
  },
};

async function handleImage(request, env, corsHeaders) {
  const { prompt, width, height, seed } = await request.json();

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(width || 1024));
  form.append("height", String(height || 768));
  if (seed !== undefined && seed !== null) {
    form.append("seed", String(seed));
  }

  const formResponse = new Response(form);
  const formStream = formResponse.body;
  const formContentType = formResponse.headers.get("content-type");

  const result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-9b", {
    multipart: {
      body: formStream,
      contentType: formContentType,
    },
  });

  const imageBytes = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0));

  return new Response(imageBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "image/png",
    },
  });
}

async function handleText(request, env, corsHeaders) {
  const {
    prompt,
    systemPrompt,
    maxTokens = 1500,
    temperature = 0.7,
  } = await request.json();

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  return jsonResponse(
    {
      text: result.response || "",
      raw: result,
    },
    200,
    corsHeaders
  );
}

async function handlePuzzle(request, env, corsHeaders) {
  const {
    prompt,
    systemPrompt,
    maxTokens = 4000,
    temperature = 0.4,
  } = await request.json();

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const result = await env.AI.run("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", {
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  return jsonResponse(
    {
      text: result.response || "",
      raw: result,
    },
    200,
    corsHeaders
  );
}

async function handleTts(request, env, corsHeaders) {
  const {
    text,
    encoding = "mp3",
    speaker = "zeus",
  } = await request.json();

  if (!text || typeof text !== "string") {
    return jsonResponse(
      { error: "Missing text" },
      400,
      corsHeaders
    );
  }

  const audioStream = await env.AI.run("@cf/deepgram/aura-2-en", {
    text,
    speaker,
    encoding,
  });

  return new Response(audioStream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
