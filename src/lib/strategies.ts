/**
 * Strategy config parser.
 *
 * Reads the Markdown+YAML-frontmatter strategy files from src/strategies/
 * and returns typed StrategyConfig objects. Uses `gray-matter` for parsing.
 *
 * Usage:
 *   import { getAllStrategies, getStrategyById } from "@/lib/strategies";
 *   const all = getAllStrategies();
 *   const board = getStrategyById("consensus-board");
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { StrategyConfig } from "./types";

// ─── Directory containing strategy .md files ────────────────────────────────

const STRATEGIES_DIR = path.join(process.cwd(), "src", "strategies");

// ─── Parse a single strategy file ───────────────────────────────────────────

function parseStrategyFile(filePath: string): StrategyConfig {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    id: data.id,
    name: data.name,
    icon: data.icon,
    description: data.description,
    bestFor: data.bestFor,
    workflow: data.workflow,
    maxRounds: data.maxRounds,
    maxSubTasks: data.maxSubTasks,
    consensusThreshold: data.consensusThreshold,
    estimatedCost: data.estimatedCost,
    estimatedLatency: data.estimatedLatency,
    arxivPapers: data.arxivPapers ?? [],
    agents: data.agents ?? [],
    judge: data.judge,
    content: content.trim(),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load and parse all strategy config files from src/strategies/.
 * Results are cached after first call within the same process.
 */
let _cache: StrategyConfig[] | null = null;

export function getAllStrategies(): StrategyConfig[] {
  // In development, always re-read files so edits are reflected immediately
  if (_cache && process.env.NODE_ENV === "production") return _cache;

  const files = fs
    .readdirSync(STRATEGIES_DIR)
    .filter((f) => f.endsWith(".md"));

  _cache = files.map((f) => parseStrategyFile(path.join(STRATEGIES_DIR, f)));
  return _cache;
}

/**
 * Get a single strategy by its `id` field (e.g. "consensus-board").
 * Returns undefined if not found.
 */
export function getStrategyById(id: string): StrategyConfig | undefined {
  return getAllStrategies().find((s) => s.id === id);
}

/**
 * Get a summary of all strategies suitable for the frontend selection UI.
 * Strips out the full system prompts and content to keep payloads small.
 */
export function getStrategySummaries() {
  return getAllStrategies().map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    description: s.description,
    bestFor: s.bestFor,
    workflow: s.workflow,
    estimatedCost: s.estimatedCost,
    estimatedLatency: s.estimatedLatency,
    agentCount: s.agents.length,
    agents: s.agents.map((a) => ({
      role: a.role,
      model: a.model,
      color: a.color,
      systemPrompt: a.systemPrompt,
    })),
    judge: s.judge
      ? { role: s.judge.role, color: s.judge.color, systemPrompt: s.judge.systemPrompt }
      : undefined,
    arxivPapers: s.arxivPapers,
  }));
}

/**
 * Invalidate the cache. Useful in development when strategy files change.
 */
export function clearStrategyCache(): void {
  _cache = null;
}
