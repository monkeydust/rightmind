/**
 * Type definitions for the RightMind advisory platform.
 *
 * These types mirror the YAML frontmatter structure used in
 * the strategy config files (src/strategies/*.md).
 */

// ─── Strategy Config Types ──────────────────────────────────────────────────

export interface ArxivPaper {
  title: string;
  url: string;
  insight: string;
}

export interface AgentConfig {
  role: string;
  model: string;
  color: string;
  phase?: string; // Used by sequential strategies (stress-tester, deep-dive)
  systemPrompt: string;
}

export interface JudgeConfig {
  role: string;
  model: string;
  color: string;
  systemPrompt: string;
}

export interface CostEstimate {
  instant: string;
  overnight: string;
}

export interface LatencyEstimate {
  instant: string;
  overnight: string;
}

export type WorkflowType =
  | "parallel_aggregate"   // Consensus Board
  | "sequential_debate"    // Stress Tester
  | "multi_round_consensus" // Round Table
  | "manager_worker"       // Deep Dive
  | "all_angles";          // All Angles (ensemble meta-strategy)

export interface StrategyConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  bestFor: string;
  workflow: WorkflowType;
  maxRounds?: number;           // Stress Tester, Round Table
  maxSubTasks?: number;         // Deep Dive
  consensusThreshold?: number;  // Round Table
  estimatedCost: CostEstimate;
  estimatedLatency: LatencyEstimate;
  arxivPapers: ArxivPaper[];
  agents: AgentConfig[];
  judge: JudgeConfig;
  /** The markdown content below the frontmatter (research notes, etc.) */
  content: string;
}

// ─── Job Types ──────────────────────────────────────────────────────────────

export type JobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";
export type ExecutionMode = "instant" | "overnight";

export interface AgentStepProgress {
  agentRole: string;
  agentModel: string;
  status: "pending" | "running" | "done" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface JobProgress {
  currentPhase: string;
  currentRound?: number;
  totalRounds?: number;
  steps: AgentStepProgress[];
}

// ─── LLM Types ──────────────────────────────────────────────────────────────

/** Multimodal content parts for OpenRouter's chat completions API */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string } };

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/** File attachment passed through the orchestration pipeline */
export interface FileAttachment {
  /** Original filename (e.g. "business-plan.pdf") */
  fileName: string;
  /** Base64 data URL (e.g. "data:application/pdf;base64,...") */
  fileData: string;
  /** MIME type (e.g. "application/pdf", "image/png") */
  mimeType: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  reasoning?: string; // Thinking/reasoning trace if enabled
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    costUsd: number; // Cost in USD from OpenRouter
  };
}

// ─── Deep Dive Sub-Task Types ───────────────────────────────────────────────

export interface SubTask {
  id: number;
  title: string;
  description: string;
  expertise_needed: string;
  expected_output: string;
}

export interface ManagerDecomposition {
  challenge_summary: string;
  decomposition_rationale: string;
  sub_tasks: SubTask[];
}

// ─── Round Table Consensus Types ────────────────────────────────────────────

export interface RoundTableResponse {
  agree_with: string[];
  disagree_with: string[];
  revised_answer: string;
  confidence: number;
}
