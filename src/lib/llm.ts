/**
 * OpenRouter LLM client.
 *
 * Thin wrapper around the OpenRouter chat completions API.
 * All model calls go through this single function.
 */

import type { LLMMessage, LLMResponse } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Parse JSON from an LLM response, stripping markdown code fences if present.
 * Models sometimes return ```json ... ``` even with response_format: json_object.
 * Also attempts to recover truncated JSON (when model hits max_tokens).
 */
export function parseJSON<T = unknown>(raw: string): T {
  let cleaned = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` wrappers
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // ── Pass 1: structural repairs ──────────────────────────────
    let repaired = cleaned;

    // Fix missing colon between key and value: "key""value" → "key": "value"
    // Pattern: a closing quote, optional whitespace, then opening quote of value
    // (not preceded by colon, comma, brace, or bracket)
    repaired = repaired.replace(/(?<=\w)"(\s*)"(?![:,}\]])/g, '": "');

    try {
      return JSON.parse(repaired);
    } catch {
      // Continue to pass 2
    }

    // ── Pass 2: truncation recovery ────────────────────────────
    // If cut mid-string, close the string
    const quotes = (repaired.match(/"/g) || []).length;
    if (quotes % 2 !== 0) {
      repaired = repaired.replace(/[^"]*$/, '"');
    }
    // Close any open brackets/braces
    const opens: string[] = [];
    let inStr = false;
    let escape = false;
    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") opens.push("}");
      else if (ch === "[") opens.push("]");
      else if (ch === "}" || ch === "]") opens.pop();
    }
    // Remove any trailing comma before closing
    repaired = repaired.replace(/,\s*$/, "");
    repaired += opens.reverse().join("");

    try {
      console.warn(`[parseJSON] Recovered malformed JSON (${raw.length} chars)`);
      return JSON.parse(repaired);
    } catch {
      // Recovery failed, throw original error
      throw firstError;
    }
  }
}

/**
 * When a file is attached, swap text-only models (DeepSeek R1) for
 * a vision-capable alternative so every agent can see the document.
 */
const FILE_MODEL_SWAPS: Record<string, string> = {
  "deepseek/deepseek-r1": "google/gemini-3.1-pro-preview",
};

export function resolveModel(model: string, hasFile: boolean): string {
  if (!hasFile) return model;
  return FILE_MODEL_SWAPS[model] ?? model;
}

export async function callModel(
  model: string,
  messages: LLMMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    /** Optional JSON mode — instructs the model to respond with valid JSON */
    json?: boolean;
    /** Enable OpenRouter web search — model can fetch live internet data */
    webSearch?: boolean;
    /** Per-user API key (BYOK) — falls back to env OPENROUTER_API_KEY */
    apiKey?: string;
    /** Enable reasoning/thinking traces (billed as output tokens) */
    reasoning?: {
      effort?: "low" | "medium" | "high";
      max_tokens?: number;
    };
  }
): Promise<LLMResponse & { _durationMs: number }> {
  const apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("No OpenRouter API key available. Please add your API key in Settings.");
  }

  const startTime = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096,
    // Privacy: prefer providers that don't collect/train on data
    provider: {
      data_collection: "deny",
    },
  };

  // Use free Cloudflare AI for PDF parsing (avoid Mistral OCR costs)
  // Only add the plugin if any message contains a file attachment
  const hasFile = messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "file")
  );
  if (hasFile) {
    body.plugins = [
      { id: "file-parser", pdf: { engine: "cloudflare-ai" } },
    ];
  }

  // JSON mode and web search are MUTUALLY EXCLUSIVE on OpenRouter.
  // Web search is on by default for non-JSON calls.
  const useJson = options?.json === true;
  const useWebSearch = !useJson && options?.webSearch !== false;

  if (useJson) {
    body.response_format = { type: "json_object" };
  }

  if (useWebSearch) {
    body.tools = [{ type: "openrouter:web_search" }];
  }

  if (options?.reasoning) {
    body.reasoning = {
      effort: options.reasoning.effort ?? "medium",
      ...(options.reasoning.max_tokens
        ? { max_tokens: options.reasoning.max_tokens }
        : {}),
    };
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rightmind.app",
      "X-Title": "RightMind Advisory Platform",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(
      `OpenRouter API error (${res.status}): ${errorBody}`
    );
  }

  const data = await res.json();
  const durationMs = Date.now() - startTime;

  if (data.error) {
    const errorMsg = data.error.message || JSON.stringify(data.error);
    throw new Error(`OpenRouter Error: ${errorMsg}`);
  }

  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error(
      `OpenRouter returned no content. Response: ${JSON.stringify(data)}`
    );
  }

  // Extract reasoning from the response (OpenRouter unified field)
  const reasoning = choice.message.reasoning || undefined;

  return {
    id: data.id || "unknown",
    model: data.model || model,
    content: choice.message.content,
    reasoning,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
      costUsd: typeof data.usage?.cost === "number" ? data.usage.cost : 0,
    },
    _durationMs: durationMs,
  };
}

