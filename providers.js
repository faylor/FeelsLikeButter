// ─── Provider Adapters ────────────────────────────────────────────────────────
// Each adapter receives the raw request body from the client (Anthropic format)
// and returns a normalised { text } response.
// Adding a new provider = adding one function here + one case in getProvider().

import fetch from "node-fetch";

// ── Claude (Anthropic) ────────────────────────────────────────────────────────
async function callClaude(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Anthropic error ${res.status}`);

  const text = data.content?.map((b) => b.text || "").join("") || "";
  return { text };
}

// ── Gemma 4 / Ollama (local or remote) ───────────────────────────────────────
// Ollama uses the OpenAI-compatible /api/chat endpoint.
// Images are passed as base64 strings in the content array.
async function callOllama(body) {
  const host   = process.env.OLLAMA_HOST || "http://localhost:11434";
  const model  = process.env.OLLAMA_MODEL || "gemma4:27b";

  // Convert Anthropic message format → Ollama format
  // Anthropic: content = [ {type:"image", source:{data,media_type}}, {type:"text", text} ]
  // Ollama:    content = "text", images = ["base64string", ...]
  const ollamaMessages = body.messages.map((msg) => {
    const parts  = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }];
    const texts  = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    const images = parts
      .filter((p) => p.type === "image")
      .map((p) => p.source?.data)
      .filter(Boolean);

    return { role: msg.role, content: texts, ...(images.length ? { images } : {}) };
  });

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Ollama error ${res.status}`);

  const text = data.message?.content || "";
  return { text };
}

// ── Router ────────────────────────────────────────────────────────────────────
export function getProvider() {
  const provider = (process.env.PROVIDER || "claude").toLowerCase();
  switch (provider) {
    case "gemma":
    case "ollama":
      return { name: provider, call: callOllama };
    case "claude":
    default:
      return { name: "claude", call: callClaude };
  }
}
