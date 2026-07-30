"use client";

/**
 * Custom ReactFlow node for agents and judges — rendered as a card.
 *
 * The card shows the agent role (bold), model (mono, truncated), and a status
 * row with icon + duration. A coloured left border identifies the agent.
 *
 * Visual states:
 *  - pending:   muted card, grey left border
 *  - running:   teal border + pulsing glow, spinning status dot
 *  - done:      full-colour left border, ✓ icon, clickable, shows duration
 *  - failed:    claret border, ✗ icon
 *  - cancelled: amber border (frozen)
 *
 * Judges render with a dashed border. Strategy nodes (All Angles) are wider.
 * Skipped rounds fade to 20% opacity.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNodeData } from "./strategyGraphLayout";

function durationSeconds(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt || !completedAt) return null;
  return ((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1);
}

const STATUS_ICON: Record<string, string> = {
  pending: "○",
  running: "◉",
  done: "✓",
  failed: "✗",
  cancelled: "⊘",
};

function AgentNodeComponent({ data }: NodeProps) {
  const d = data as AgentNodeData;

  const statusClass = `is-${d.status}`;
  const judgeClass = d.isJudge ? "is-judge" : "";
  const strategyClass = d.isStrategyNode ? "is-strategy" : "";
  const skippedClass = d.skipped ? "is-skipped" : "";

  const duration = durationSeconds(d.startedAt, d.completedAt);
  const modelShort = d.model.split("/").pop() || d.model;

  return (
    <div
      className={`flow-card ${statusClass} ${judgeClass} ${strategyClass} ${skippedClass}`.trim()}
      style={{ ["--node-color" as string]: d.color }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div className="flow-card__bar" />

      <div className="flow-card__body">
        <div className="flow-card__role" title={d.role}>{d.role}</div>
        <div className="flow-card__model" title={d.model}>{modelShort}</div>
        <div className="flow-card__status">
          <span className="flow-card__icon">{STATUS_ICON[d.status] ?? "○"}</span>
          {d.status === "done" && duration && (
            <span className="flow-card__duration">{duration}s</span>
          )}
          {d.status === "running" && <span className="flow-card__duration">running…</span>}
          {d.status === "pending" && <span className="flow-card__duration">queued</span>}
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
