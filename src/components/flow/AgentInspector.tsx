"use client";

/**
 * Slide-out inspector panel (right side, 440px) shown when a completed node is
 * clicked. Shows the agent's response and reasoning trace, with cost/timing
 * metadata in the header.
 *
 * Matching the clicked step role to a stored AgentResponse is non-trivial:
 *  - Stress Tester / Round Table step roles carry a " (Round N)" suffix, but
 *    stored responses use the bare role + a `round` field.
 *  - Deep Dive worker step roles are "Specialist Worker — <title>" while
 *    stored responses are "Specialist Worker — Task <id>". We parse the
 *    Manager's decomposition JSON to map title → id.
 *  - All Angles meta-judge step role has an emoji prefix ("🔮 Meta-Judge").
 */

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type StepInput } from "./strategyGraphLayout";

interface AgentResponseData {
  agentRole: string;
  agentModel: string;
  phase: string | null;
  round: number;
  response: string;
  reasoning: string | null;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
}

interface Props {
  jobId: string;
  step: StepInput;
  color: string;
  strategyId: string;
  onClose: () => void;
}

/** Strip a leading emoji/icon token like "🔮 " from a role. */
function stripEmoji(role: string): string {
  return role.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

interface SubTask {
  id: number;
  title: string;
}

/** Parse the Deep Dive Manager's decomposition to build a title → task-id map. */
function buildTitleToIdMap(responses: AgentResponseData[]): Map<string, number> {
  const map = new Map<string, number>();
  const manager = responses.find((r) => r.agentRole === "Manager");
  if (!manager) return map;
  try {
    const decomposed = JSON.parse(manager.response);
    (decomposed?.sub_tasks ?? []).forEach((t: SubTask) => {
      map.set(t.title.trim(), t.id);
    });
  } catch {
    /* not JSON / malformed — fall back below */
  }
  return map;
}

/** Match a clicked step role to a stored agent response. */
function matchResponse(
  stepRole: string,
  responses: AgentResponseData[],
  strategyId: string
): AgentResponseData | undefined {
  // 1. Exact match
  const exact = responses.find((r) => r.agentRole === stepRole);
  if (exact) return exact;

  // 2. Round suffix: "Proposer (Round 2)" → base "Proposer", round 2
  const roundMatch = stepRole.match(/^(.+?)\s*\(Round\s*(\d+)\)$/);
  if (roundMatch) {
    const [, base, roundStr] = roundMatch;
    const round = parseInt(roundStr, 10);
    const byRound = responses.filter(
      (r) => r.agentRole === base && r.round === round
    );
    if (byRound.length) return byRound[0];
    // Fall back to the round-th occurrence of the base role
    const byBase = responses.filter((r) => r.agentRole === base);
    if (byBase.length >= round) return byBase[round - 1];
  }

  // 3. Deep Dive worker: "Specialist Worker — <title>" → "Specialist Worker — Task <id>"
  if (stepRole.startsWith("Specialist Worker — ") && strategyId === "deep-dive") {
    const title = stepRole.slice("Specialist Worker — ".length).trim();
    const titleToId = buildTitleToIdMap(responses);
    const taskId = titleToId.get(title);
    if (taskId !== undefined) {
      const byTask = responses.find(
        (r) => r.agentRole === `Specialist Worker — Task ${taskId}`
      );
      if (byTask) return byTask;
    }
    // Fallback: first worker response
    const worker = responses.find((r) =>
      r.agentRole.startsWith("Specialist Worker")
    );
    if (worker) return worker;
  }

  // 4. Emoji-prefixed roles (All Angles meta-judge)
  const stripped = stripEmoji(stepRole);
  if (stripped !== stepRole) {
    const m = responses.find((r) => r.agentRole === stripped);
    if (m) return m;
  }

  // 5. Substring fallback
  const sub = responses.find(
    (r) => r.agentRole.includes(stripped) || stripped.includes(r.agentRole)
  );
  return sub;
}

export function AgentInspector({ jobId, step, color, strategyId, onClose }: Props) {
  const [agents, setAgents] = useState<AgentResponseData[] | null>(null);
  const [tab, setTab] = useState<"response" | "reasoning">("response");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/advisor/jobs/${jobId}/agents`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (active) setAgents(data.agents ?? []);
      })
      .catch(() => {
        if (active) setError("Failed to load agent response.");
      });
    return () => {
      active = false;
    };
  }, [jobId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matched = agents ? matchResponse(step.agentRole, agents, strategyId) : undefined;

  const role = step.agentRole;
  const model = step.agentModel;

  const durationLabel =
    step.completedAt && step.startedAt
      ? `${((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1)}s`
      : null;

  return (
    <>
      <div className="flow-inspector__overlay" onClick={onClose} />
      <div className="flow-inspector__panel" role="dialog" aria-label={`Agent response: ${role}`}>
        <div className="flow-inspector__header">
          <span
            style={{
              width: 12,
              height: 12,
              background: color,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--charcoal)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={role}
            >
              {role}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--grey-light)",
                fontFamily: "'Menlo','Consolas',monospace",
              }}
            >
              {model}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "var(--grey-light)",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Metadata strip */}
        {matched && (
          <div
            style={{
              display: "flex",
              gap: "14px",
              padding: "8px 18px",
              fontSize: "11px",
              color: "var(--grey-light)",
              fontFamily: "'Menlo','Consolas',monospace",
              borderBottom: "1px solid var(--rule)",
              flexWrap: "wrap",
            }}
          >
            {matched.tokens > 0 && <span>{matched.tokens.toLocaleString()} tok</span>}
            {matched.costUsd > 0 && <span>${matched.costUsd.toFixed(4)}</span>}
            {durationLabel && <span>⏱ {durationLabel}</span>}
            {matched.phase && <span style={{ textTransform: "uppercase" }}>{matched.phase}</span>}
            {matched.round > 1 && <span>Round {matched.round}</span>}
          </div>
        )}

        {/* Tabs */}
        {matched?.reasoning && (
          <div className="flow-inspector__tabs">
            <button
              className={`flow-inspector__tab ${tab === "response" ? "is-active" : ""}`}
              onClick={() => setTab("response")}
            >
              Response
            </button>
            <button
              className={`flow-inspector__tab ${tab === "reasoning" ? "is-active" : ""}`}
              onClick={() => setTab("reasoning")}
            >
              Reasoning
            </button>
          </div>
        )}

        <div className="flow-inspector__body">
          {error ? (
            <p style={{ color: "var(--claret)", fontSize: 13 }}>{error}</p>
          ) : agents === null ? (
            <p style={{ color: "var(--grey-light)", fontStyle: "italic" }}>Loading…</p>
          ) : !matched ? (
            <p style={{ color: "var(--grey-light)", fontStyle: "italic" }}>
              No stored response for “{role}”. The agent may not have completed.
            </p>
          ) : tab === "reasoning" && matched.reasoning ? (
            <div className="flow-inspector__reasoning">{matched.reasoning}</div>
          ) : (
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {matched.response || "_No response content._"}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
