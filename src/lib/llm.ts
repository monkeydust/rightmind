/**
 * OpenRouter LLM client.
 *
 * Thin wrapper around the OpenRouter chat completions API.
 * All model calls go through this single function.
 */

import type { LLMMessage, LLMResponse } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
    },
    _durationMs: durationMs,
  };
}
