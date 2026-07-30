/**
 * Model tier resolution.
 *
 * Every agent role has a premium model pin and an optional `dragonModel`
 * pin (cheaper, predominantly open-weight labs). This module is the single
 * place that decides which one actually runs, and it is also what the
 * orchestrators record as `AgentResponse.agentModel` — so the transcript
 * always names the model that really executed, not the configured default.
 */

import { resolveModel } from "./llm";
import type { FileAttachment, ModelTier, StrategyConfig } from "./types";

/** Pick the tier-appropriate pin, falling back to premium if no Dragon pin exists. */
export function pickTierModel(
  cfg: { model: string; dragonModel?: string },
  tier: ModelTier
): string {
  if (tier === "dragon" && cfg.dragonModel) return cfg.dragonModel;
  return cfg.model;
}

/** The configured model for a role, before any file-attachment swap. */
export function getModelForRole(
  strategy: StrategyConfig,
  role: string,
  tier: ModelTier
): string {
  const agent = strategy.agents.find((a) => a.role === role);
  if (agent) return pickTierModel(agent, tier);
  if (strategy.judge.role === role) return pickTierModel(strategy.judge, tier);
  throw new Error(`No model found for role: ${role}`);
}

/**
 * The model that will actually be sent to OpenRouter — tier applied, then
 * swapped for a vision-capable sibling if a file is attached.
 *
 * Use this for both the API call and the persisted `agentModel`.
 */
export function resolveModelForRole(
  strategy: StrategyConfig,
  role: string,
  tier: ModelTier,
  file?: FileAttachment
): string {
  return resolveModel(getModelForRole(strategy, role, tier), !!file);
}

/** As above, when the caller already holds the agent config. */
export function resolveTierModel(
  cfg: { model: string; dragonModel?: string },
  tier: ModelTier,
  file?: FileAttachment
): string {
  return resolveModel(pickTierModel(cfg, tier), !!file);
}
