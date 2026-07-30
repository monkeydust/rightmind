/**
 * Strategy graph layout engine.
 *
 * Pure functions that take a strategy config summary + the live SSE step list
 * and return ReactFlow `Node[]` / `Edge[]`. No React — just layout math.
 *
 * One layout function per workflow topology. Node `id`s are set to the step's
 * `agentRole` (unique within a job) so SSE progress updates can be matched to
 * nodes directly.
 */

import { type Edge, MarkerType, type Node } from "@xyflow/react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentNodeStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

/** Agent metadata as returned by GET /api/advisor/strategies */
export interface StrategyAgentSummary {
  role: string;
  model: string;
  color: string;
}

export interface StrategySummary {
  id: string;
  name: string;
  icon: string;
  workflow: string;
  agents: StrategyAgentSummary[];
  judge?: { role: string; color: string } | null;
}

export interface StepInput {
  agentRole: string;
  agentModel: string;
  status: AgentNodeStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentNodeData {
  role: string;
  model: string;
  color: string;
  status: AgentNodeStatus;
  isJudge: boolean;
  isStrategyNode: boolean;
  jobId?: string;
  skipped?: boolean;
  startedAt?: string;
  completedAt?: string;
  [key: string]: unknown;
}

export interface AgentEdgeData {
  state: "idle" | "active" | "done";
  isLoop?: boolean;
  label?: string;
  [key: string]: unknown;
}

export type AgentGraphNode = Node<AgentNodeData, "agent">;
export type AgentGraphEdge = Edge<AgentEdgeData>;

export interface GraphLayout {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip a trailing " (Round N)" suffix from a step role. */
export function baseRole(role: string): string {
  return role.replace(/\s*\(Round\s*\d+\)\s*$/, "").trim();
}

/** Extract the round number from a step role like "Proposer (Round 2)". */
function roundOf(role: string): number {
  const m = role.match(/\(Round\s*(\d+)\)/);
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * ReactFlow is happiest when internal ids are simple ASCII strings. Visible
 * role names can contain apostrophes, emoji, em dashes, and parentheses, so we
 * keep those in node data and use a deterministic safe id internally.
 */
function nodeId(role: string): string {
  const slug =
    role
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "node";

  let hash = 0;
  for (let i = 0; i < role.length; i++) {
    hash = (hash * 31 + role.charCodeAt(i)) | 0;
  }
  return `${slug}-${Math.abs(hash).toString(36)}`;
}

/** Fixed representative colours for All Angles child-strategy nodes. */
const ALL_ANGLES_COLORS: Record<string, string> = {
  "consensus-board": "#0D7680",
  "deep-dive": "#f59e0b",
  "stress-tester": "#ef4444",
  "round-table": "#6366f1",
};

/** Map an All Angles step role (e.g. "🏛️ Consensus Board") → strategy id. */
const ALL_ANGLES_STEP_TO_ID: Record<string, string> = {
  "🏛️ Consensus Board": "consensus-board",
  "🔬 Deep Dive": "deep-dive",
  "⚔️ Stress Tester": "stress-tester",
  "🤝 Round Table": "round-table",
};

/** Resolve the colour for a step role from the strategy config. */
function resolveColor(stepRole: string, strategy: StrategySummary): string {
  const base = baseRole(stepRole);

  // Deep Dive worker: "Specialist Worker — <title>" or "Specialist Worker"
  if (base === "Specialist Worker" || base.startsWith("Specialist Worker —")) {
    const worker = strategy.agents.find((a) => a.role === "Specialist Worker");
    return worker?.color ?? "#3b82f6";
  }

  const agent = strategy.agents.find((a) => a.role === base);
  if (agent) return agent.color;

  if (strategy.judge && base === strategy.judge.role) return strategy.judge.color;

  // All Angles strategy / meta-judge nodes
  if (strategy.id === "all-angles") {
    const sid = ALL_ANGLES_STEP_TO_ID[stepRole];
    if (sid) return ALL_ANGLES_COLORS[sid] ?? "#999999";
    if (base === "Meta-Judge" || stepRole.includes("Meta-Judge")) {
      return strategy.judge?.color ?? "#6366f1";
    }
  }

  return "#999999";
}

/** Whether a step role corresponds to the strategy's judge. */
function isJudgeRole(stepRole: string, strategy: StrategySummary): boolean {
  const base = baseRole(stepRole);
  if (strategy.judge && base === strategy.judge.role) return true;
  if (strategy.judge && stepRole === strategy.judge.role) return true;
  // All Angles meta-judge step role carries an emoji prefix ("🔮 Meta-Judge")
  if (strategy.judge) {
    const stripped = stepRole.replace(/^[^\p{L}\p{N}]+/u, "").trim();
    if (stripped === strategy.judge.role) return true;
  }
  return false;
}

/** Edge state derived from the statuses of its source/target nodes. */
function edgeState(
  sourceStatus: AgentNodeStatus,
  targetStatus: AgentNodeStatus
): "idle" | "active" | "done" {
  if (sourceStatus === "done" && targetStatus === "done") return "done";
  if (sourceStatus === "done" && targetStatus === "running") return "active";
  if (sourceStatus === "done" && targetStatus === "pending") return "active";
  if (sourceStatus === "done") return "done";
  return "idle";
}

/** Build a node object from a step. */
function makeNode(
  step: StepInput,
  strategy: StrategySummary,
  x: number,
  y: number,
  opts: { isJudge?: boolean; isStrategyNode?: boolean; jobId?: string; skipped?: boolean } = {}
): AgentGraphNode {
  return {
    id: nodeId(step.agentRole),
    type: "agent",
    position: { x, y },
    data: {
      role: step.agentRole,
      model: step.agentModel,
      color: resolveColor(step.agentRole, strategy),
      status: step.status,
      isJudge: opts.isJudge ?? isJudgeRole(step.agentRole, strategy),
      isStrategyNode: opts.isStrategyNode ?? false,
      jobId: opts.jobId,
      skipped: opts.skipped,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
    },
    draggable: false,
    selectable: step.status === "done",
  };
}

/** Colour for an edge + its arrowhead, based on state.
 *  Faint when idle → teal when data is flowing → dark when done. */
function edgeStrokeColor(state: "idle" | "active" | "done"): string {
  switch (state) {
    case "active":
      return "#0D7680"; // --teal
    case "done":
      return "#333333"; // --charcoal
    default:
      return "#CCC1B7"; // --rule-dark (faint)
  }
}

function edgeOpacity(state: "idle" | "active" | "done"): number {
  switch (state) {
    case "active":
      return 1;
    case "done":
      return 0.85;
    default:
      return 0.4;
  }
}

function edgeWidth(state: "idle" | "active" | "done"): number {
  switch (state) {
    case "active":
      return 2;
    case "done":
      return 1.8;
    default:
      return 1.2;
  }
}

/** Build an edge using the built-in smoothstep type with a custom SVG marker.
 *  The arrowhead markers are defined by EdgeMarkerDefs in the visualizer. */
function makeEdge(
  source: string,
  target: string,
  sourceStatus: AgentNodeStatus,
  targetStatus: AgentNodeStatus,
  opts: { isLoop?: boolean; label?: string } = {}
): AgentGraphEdge {
  const state = edgeState(sourceStatus, targetStatus);
  const color = edgeStrokeColor(state);
  const sourceId = nodeId(source);
  const targetId = nodeId(target);
  return {
    id: `${sourceId}->${targetId}`,
    source: sourceId,
    target: targetId,
    type: "smoothstep",
    animated: state === "active",
    label: opts.label,
    labelStyle: { fontSize: 9, fill: "#999999", fontFamily: "var(--font-ui)" },
    labelBgStyle: { fill: "var(--white)" },
    style: {
      stroke: color,
      strokeWidth: edgeWidth(state),
      opacity: edgeOpacity(state),
      strokeDasharray: opts.isLoop ? "4 3" : undefined,
      transition: "stroke 0.4s ease, stroke-width 0.4s ease, opacity 0.4s ease",
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color,
    },
    data: {
      state,
      isLoop: opts.isLoop,
      label: opts.label,
    },
  };
}

/** A step is "skipped" if it never ran (pending when the job already finished). */
function stepSkipped(step: StepInput, jobFinished: boolean): boolean {
  return jobFinished && step.status === "pending";
}

// ─── Layouts ─────────────────────────────────────────────────────────────────

/** Consensus Board: agents stacked on the left → judge on the right. */
function layoutConsensusBoard(
  strategy: StrategySummary,
  steps: StepInput[],
  jobFinished: boolean
): GraphLayout {
  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraphEdge[] = [];

  const agents = steps.filter((s) => !isJudgeRole(s.agentRole, strategy));
  const judgeStep = steps.find((s) => isJudgeRole(s.agentRole, strategy));

  const agentX = 0;
  const judgeX = 420;
  const spacing = 90;
  const topY = 0;
  const judgeY = topY + ((agents.length - 1) * spacing) / 2;

  agents.forEach((step, i) => {
    const skipped = stepSkipped(step, jobFinished);
    nodes.push(
      makeNode(step, strategy, agentX, topY + i * spacing, { skipped })
    );
  });

  if (judgeStep) {
    nodes.push(
      makeNode(judgeStep, strategy, judgeX, judgeY, { isJudge: true, skipped: stepSkipped(judgeStep, jobFinished) })
    );
    agents.forEach((step) => {
      edges.push(
        makeEdge(step.agentRole, judgeStep.agentRole, step.status, judgeStep.status)
      );
    });
  }

  return { nodes, edges };
}

/** Stress Tester: linear chain per round, stacked vertically, → judge. */
function layoutStressTester(
  strategy: StrategySummary,
  steps: StepInput[],
  jobFinished: boolean
): GraphLayout {
  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraphEdge[] = [];

  const rounds = Array.from(new Set(steps.map((s) => roundOf(s.agentRole)))).sort(
    (a, b) => a - b
  );
  const judgeStep = steps.find((s) => isJudgeRole(s.agentRole, strategy));
  const chainRoles = ["Proposer", "Devil's Advocate", "Refiner"];

  const colX = [0, 200, 400];
  const rowGap = 150;

  rounds.forEach((r, ri) => {
    chainRoles.forEach((role, ci) => {
      const step = steps.find(
        (s) => baseRole(s.agentRole) === role && roundOf(s.agentRole) === r
      );
      if (!step) return;
      const skipped = stepSkipped(step, jobFinished);
      nodes.push(
        makeNode(step, strategy, colX[ci], ri * rowGap, { skipped })
      );
      // Chain within round
      if (ci > 0) {
        const prev = steps.find(
          (s) =>
            baseRole(s.agentRole) === chainRoles[ci - 1] &&
            roundOf(s.agentRole) === r
        );
        if (prev) {
          edges.push(
            makeEdge(prev.agentRole, step.agentRole, prev.status, step.status)
          );
        }
      }
    });
  });

  // Loop edges between rounds (Refiner → next round Proposer)
  for (let i = 0; i < rounds.length - 1; i++) {
    const refiner = steps.find(
      (s) => baseRole(s.agentRole) === "Refiner" && roundOf(s.agentRole) === rounds[i]
    );
    const nextProposer = steps.find(
      (s) => baseRole(s.agentRole) === "Proposer" && roundOf(s.agentRole) === rounds[i + 1]
    );
    if (refiner && nextProposer) {
      edges.push(
        makeEdge(refiner.agentRole, nextProposer.agentRole, refiner.status, nextProposer.status, {
          isLoop: true,
          label: `Round ${rounds[i + 1]}`,
        })
      );
    }
  }

  // Last refiner → judge
  if (judgeStep && rounds.length > 0) {
    const lastRefiner = steps.find(
      (s) =>
        baseRole(s.agentRole) === "Refiner" &&
        roundOf(s.agentRole) === rounds[rounds.length - 1]
    );
    if (lastRefiner) {
      const judgeY = ((rounds.length - 1) * rowGap);
      nodes.push(
        makeNode(judgeStep, strategy, 600, judgeY, {
          isJudge: true,
          skipped: stepSkipped(judgeStep, jobFinished),
        })
      );
      edges.push(
        makeEdge(lastRefiner.agentRole, judgeStep.agentRole, lastRefiner.status, judgeStep.status)
      );
    } else {
      nodes.push(
        makeNode(judgeStep, strategy, 600, 0, {
          isJudge: true,
          skipped: stepSkipped(judgeStep, jobFinished),
        })
      );
    }
  }

  return { nodes, edges };
}

/** Round Table: round columns of agents → judge on the right. */
function layoutRoundTable(
  strategy: StrategySummary,
  steps: StepInput[],
  jobFinished: boolean
): GraphLayout {
  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraphEdge[] = [];

  const rounds = Array.from(new Set(steps.map((s) => roundOf(s.agentRole)))).sort(
    (a, b) => a - b
  );
  const judgeStep = steps.find((s) => isJudgeRole(s.agentRole, strategy));
  const agentSteps = steps.filter((s) => !isJudgeRole(s.agentRole, strategy));

  // Unique base roles (the 4 agents), preserving first-seen order
  const seen = new Set<string>();
  const agentRoles: string[] = [];
  agentSteps.forEach((s) => {
    const b = baseRole(s.agentRole);
    if (!seen.has(b)) {
      seen.add(b);
      agentRoles.push(b);
    }
  });

  const colX = (r: number) => r * 230;
  const spacing = 90;
  const topY = 0;
  const midY = topY + ((agentRoles.length - 1) * spacing) / 2;

  rounds.forEach((r, ri) => {
    agentRoles.forEach((role, ai) => {
      const step = steps.find(
        (s) => baseRole(s.agentRole) === role && roundOf(s.agentRole) === r
      );
      if (!step) return;
      const skipped = stepSkipped(step, jobFinished);
      nodes.push(
        makeNode(step, strategy, colX(ri), topY + ai * spacing, { skipped })
      );
    });

    // Dashed cross-connections within the round (every pair of agents)
    const roundSteps = agentRoles
      .map((role) =>
        steps.find(
          (s) => baseRole(s.agentRole) === role && roundOf(s.agentRole) === r
        )
      )
      .filter((s): s is StepInput => Boolean(s));

    for (let i = 0; i < roundSteps.length; i++) {
      for (let j = i + 1; j < roundSteps.length; j++) {
        const s = roundSteps[i];
        const t = roundSteps[j];
        edges.push({
          id: `x-${r}-${i}-${j}-${nodeId(s.agentRole)}-${nodeId(t.agentRole)}`,
          source: nodeId(s.agentRole),
          target: nodeId(t.agentRole),
          type: "smoothstep",
          data: { state: "idle" as const },
          style: { stroke: "#CCC1B7", strokeDasharray: "3 3", opacity: 0.3 },
          animated: false,
        });
      }
    }

    // Arrow to next round (each agent → same agent next round)
    if (ri < rounds.length - 1) {
      agentRoles.forEach((role) => {
        const from = steps.find(
          (s) => baseRole(s.agentRole) === role && roundOf(s.agentRole) === r
        );
        const to = steps.find(
          (s) => baseRole(s.agentRole) === role && roundOf(s.agentRole) === rounds[ri + 1]
        );
        if (from && to) {
          edges.push(makeEdge(from.agentRole, to.agentRole, from.status, to.status));
        }
      });
    }
  });

  // Last round agents → judge
  if (judgeStep && rounds.length > 0) {
    const lastRound = rounds[rounds.length - 1];
    nodes.push(
      makeNode(judgeStep, strategy, colX(rounds.length) + 60, midY, {
        isJudge: true,
        skipped: stepSkipped(judgeStep, jobFinished),
      })
    );
    agentRoles.forEach((role) => {
      const from = steps.find(
        (s) => baseRole(s.agentRole) === role && roundOf(s.agentRole) === lastRound
      );
      if (from) {
        edges.push(makeEdge(from.agentRole, judgeStep.agentRole, from.status, judgeStep.status));
      }
    });
  }

  return { nodes, edges };
}

/** Deep Dive: Manager → workers (stacked) → Judge. */
function layoutDeepDive(
  strategy: StrategySummary,
  steps: StepInput[],
  jobFinished: boolean
): GraphLayout {
  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraphEdge[] = [];

  const managerStep = steps.find((s) => baseRole(s.agentRole) === "Manager");
  const judgeStep = steps.find((s) => isJudgeRole(s.agentRole, strategy));
  const workerSteps = steps.filter(
    (s) =>
      baseRole(s.agentRole) !== "Manager" && !isJudgeRole(s.agentRole, strategy)
  );

  const managerX = 0;
  const workerX = 320;
  const judgeX = 640;
  const spacing = 100;
  const topY = 0;
  const midY = topY + ((Math.max(workerSteps.length, 1) - 1) * spacing) / 2;

  if (managerStep) {
    nodes.push(
      makeNode(managerStep, strategy, managerX, midY, {
        isJudge: true,
        skipped: stepSkipped(managerStep, jobFinished),
      })
    );
  }

  workerSteps.forEach((step, i) => {
    nodes.push(
      makeNode(step, strategy, workerX, topY + i * spacing, {
        skipped: stepSkipped(step, jobFinished),
      })
    );
    if (managerStep) {
      edges.push(
        makeEdge(managerStep.agentRole, step.agentRole, managerStep.status, step.status)
      );
    }
    if (judgeStep) {
      edges.push(
        makeEdge(step.agentRole, judgeStep.agentRole, step.status, judgeStep.status)
      );
    }
  });

  if (judgeStep) {
    nodes.push(
      makeNode(judgeStep, strategy, judgeX, midY, {
        isJudge: true,
        skipped: stepSkipped(judgeStep, jobFinished),
      })
    );
  }

  // Handle the placeholder case: single "Specialist Worker" with no title
  // is shown as-is (the makeNode above already handles it).

  return { nodes, edges };
}

/** All Angles: 2×2 strategy grid → meta-judge. */
function layoutAllAngles(
  strategy: StrategySummary,
  steps: StepInput[],
  jobFinished: boolean,
  childJobIds: string[] = []
): GraphLayout {
  const nodes: AgentGraphNode[] = [];
  const edges: AgentGraphEdge[] = [];

  const strategyOrder = ["consensus-board", "deep-dive", "stress-tester", "round-table"];
  const positions: Record<string, { x: number; y: number }> = {
    "consensus-board": { x: 0, y: 0 },
    "deep-dive": { x: 280, y: 0 },
    "stress-tester": { x: 0, y: 160 },
    "round-table": { x: 280, y: 160 },
  };

  steps.filter((s) => !isJudgeRole(s.agentRole, strategy)).forEach((step) => {
    const sid = ALL_ANGLES_STEP_TO_ID[step.agentRole];
    const idx = sid ? strategyOrder.indexOf(sid) : -1;
    const pos = idx >= 0 ? positions[sid!] : { x: 0, y: 0 };
    const jobId = idx >= 0 ? childJobIds[idx] : undefined;
    nodes.push(
      makeNode(step, strategy, pos.x, pos.y, {
        isStrategyNode: true,
        jobId,
        skipped: stepSkipped(step, jobFinished),
      })
    );
  });

  const metaJudge = steps.find((s) => isJudgeRole(s.agentRole, strategy));
  if (metaJudge) {
    nodes.push(
      makeNode(metaJudge, strategy, 600, 80, {
        isJudge: true,
        skipped: stepSkipped(metaJudge, jobFinished),
      })
    );
    strategyOrder.forEach((sid) => {
      const stepRole = Object.entries(ALL_ANGLES_STEP_TO_ID).find(
        ([, id]) => id === sid
      )?.[0];
      const step = steps.find((s) => s.agentRole === stepRole);
      if (step) {
        edges.push(
          makeEdge(step.agentRole, metaJudge.agentRole, step.status, metaJudge.status)
        );
      }
    });
  }

  return { nodes, edges };
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Build a ReactFlow graph layout for a strategy.
 *
 * @param strategy   Strategy summary (workflow, agents, judge)
 * @param steps      Live step list from SSE progress
 * @param jobFinished Whether the job has reached a terminal state (DONE/FAILED/CANCELLED)
 * @param childJobIds For All Angles: the child job ids, in strategy order
 */
export function buildStrategyGraph(
  strategy: StrategySummary,
  steps: StepInput[],
  jobFinished: boolean,
  childJobIds?: string[]
): GraphLayout {
  switch (strategy.workflow) {
    case "parallel_aggregate":
      return layoutConsensusBoard(strategy, steps, jobFinished);
    case "sequential_debate":
      return layoutStressTester(strategy, steps, jobFinished);
    case "multi_round_consensus":
      return layoutRoundTable(strategy, steps, jobFinished);
    case "manager_worker":
      return layoutDeepDive(strategy, steps, jobFinished);
    case "all_angles":
      return layoutAllAngles(strategy, steps, jobFinished, childJobIds);
    default:
      return { nodes: [], edges: [] };
  }
}
