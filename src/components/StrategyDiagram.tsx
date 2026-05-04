/**
 * Strategy workflow diagrams.
 *
 * Inline SVG "timeline sequence" diagrams that visualise how agents interact
 * in each strategy. Uses circles for agents, arrows for flow, and
 * loop symbols for iteration rounds.
 */

import React from "react";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface AgentSummary {
  role: string;
  color: string;
}

interface DiagramProps {
  workflow: string;
  agents: AgentSummary[];
  judgeColor?: string;
  /** compact = card view (~220×64), full = detail page (~380×100) */
  size?: "compact" | "full";
}

/* ─── Shared primitives ──────────────────────────────────────────────── */

function AgentDot({
  cx,
  cy,
  r,
  fill,
  label,
  showLabel,
  labelY,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  label?: string;
  showLabel?: boolean;
  labelY?: number;
}) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      {showLabel && label && (
        <text
          x={cx}
          y={labelY ?? cy + r + 12}
          textAnchor="middle"
          fill="#999"
          fontSize="8"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        >
          {label.length > 12 ? label.slice(0, 11) + "…" : label}
        </text>
      )}
    </>
  );
}

function JudgeDot({
  cx,
  cy,
  r,
  fill,
  label,
  showLabel,
  labelY,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  label?: string;
  showLabel?: boolean;
  labelY?: number;
}) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke={fill} strokeWidth="1.5" strokeDasharray="3 2" />
      {showLabel && label && (
        <text
          x={cx}
          y={labelY ?? cy + r + 14}
          textAnchor="middle"
          fill="#999"
          fontSize="8"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        >
          {label.length > 14 ? label.slice(0, 13) + "…" : label}
        </text>
      )}
    </>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const headLen = 5;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#CCC1B7" strokeWidth="1.2" />
      <polygon
        points={`
          ${x2},${y2}
          ${x2 - headLen * Math.cos(angle - Math.PI / 6)},${y2 - headLen * Math.sin(angle - Math.PI / 6)}
          ${x2 - headLen * Math.cos(angle + Math.PI / 6)},${y2 - headLen * Math.sin(angle + Math.PI / 6)}
        `}
        fill="#CCC1B7"
      />
    </>
  );
}

function StepLabel({
  x,
  y,
  text,
}: {
  x: number;
  y: number;
  text: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill="#999"
      fontSize="9"
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
      fontWeight="500"
    >
      {text}
    </text>
  );
}

function LoopArrow({
  cx,
  cy,
  r,
}: {
  cx: number;
  cy: number;
  r: number;
}) {
  // A circular return arrow
  const startAngle = -0.3;
  const endAngle = Math.PI * 1.5 + 0.3;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);

  return (
    <>
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`}
        fill="none"
        stroke="#CCC1B7"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      <polygon
        points={`${x2},${y2} ${x2 + 3},${y2 - 4} ${x2 - 3},${y2 - 3}`}
        fill="#CCC1B7"
      />
    </>
  );
}

/* ─── Workflow Diagrams ──────────────────────────────────────────────── */

/**
 * Consensus Board: parallel_aggregate
 *
 * [Step 1]               [Step 2]
 * ● Agent 1  ──┐
 * ● Agent 2  ──┤──→  ◉ Judge
 * ● Agent 3  ──┤
 * ● Agent 4  ──┘
 */
function ParallelAggregate({
  agents,
  judgeColor,
  size,
}: {
  agents: AgentSummary[];
  judgeColor: string;
  size: "compact" | "full";
}) {
  const isCompact = size === "compact";
  const w = isCompact ? 220 : 380;
  const h = isCompact ? 64 : 100;
  const dotR = isCompact ? 5 : 7;
  const showLabels = !isCompact;
  const showAgentLabels = false; // agent names shown in table instead

  const agentX = isCompact ? 40 : 70;
  const judgeX = isCompact ? 180 : 310;
  const midY = h / 2;
  const spacing = isCompact ? 14 : 18;
  const topY = midY - ((agents.length - 1) * spacing) / 2;

  // Merge point
  const mergeX = isCompact ? 120 : 200;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      {/* Step labels */}
      {showLabels && <StepLabel x={agentX} y={12} text="Step 1: Analyse" />}
      {showLabels && <StepLabel x={judgeX} y={12} text="Step 2: Synthesise" />}

      {/* Agent dots + lines to merge point */}
      {agents.map((a, i) => {
        const y = topY + i * spacing;
        return (
          <React.Fragment key={a.role}>
            <AgentDot cx={agentX} cy={y} r={dotR} fill={a.color} label={a.role} showLabel={showAgentLabels} />
            <line x1={agentX + dotR + 2} y1={y} x2={mergeX} y2={midY} stroke="#CCC1B7" strokeWidth="1" />
          </React.Fragment>
        );
      })}

      {/* Arrow from merge to judge */}
      <Arrow x1={mergeX} y1={midY} x2={judgeX - dotR - 5} y2={midY} />

      {/* Judge */}
      <JudgeDot cx={judgeX} cy={midY} r={dotR + 1} fill={judgeColor} label="Judge" showLabel={showLabels} />
    </svg>
  );
}

/**
 * Stress Tester: sequential_debate
 *
 * ● Proposer ──→ ● Devil's Advocate ──→ ● Refiner
 *                    ↺ (loop)
 */
function SequentialDebate({
  agents,
  judgeColor,
  size,
}: {
  agents: AgentSummary[];
  judgeColor: string;
  size: "compact" | "full";
}) {
  const isCompact = size === "compact";
  const w = isCompact ? 220 : 380;
  const h = isCompact ? 64 : 100;
  const dotR = isCompact ? 5 : 7;
  const showLabels = !isCompact;
  const showAgentLabels = false;
  const midY = isCompact ? h / 2 : h / 2 - 4;

  // 3 agents spread left to right, plus a judge at the end
  const count = agents.length;
  const totalNodes = count + 1; // +1 for judge
  const padX = isCompact ? 30 : 50;
  const gap = (w - padX * 2) / (totalNodes - 1);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      {/* Step labels */}
      {showLabels && agents.map((a, i) => (
        <StepLabel key={`label-${a.role}`} x={padX + i * gap} y={12} text={`Step ${i + 1}`} />
      ))}
      {showLabels && <StepLabel x={padX + count * gap} y={12} text="Synthesise" />}

      {/* Agent nodes */}
      {agents.map((a, i) => {
        const x = padX + i * gap;
        return (
          <React.Fragment key={a.role}>
            <AgentDot cx={x} cy={midY} r={dotR} fill={a.color} label={a.role} showLabel={showAgentLabels} />
            {/* Arrow to next agent */}
            {i < count - 1 && (
              <Arrow
                x1={x + dotR + 4}
                y1={midY}
                x2={padX + (i + 1) * gap - dotR - 4}
                y2={midY}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Loop arrow between agent 1 and 2 */}
      {count >= 2 && (
        <LoopArrow
          cx={(padX + padX + gap) / 2}
          cy={midY - (isCompact ? 18 : 24)}
          r={isCompact ? 8 : 11}
        />
      )}

      {/* Arrow from last agent to judge */}
      <Arrow
        x1={padX + (count - 1) * gap + dotR + 4}
        y1={midY}
        x2={padX + count * gap - dotR - 5}
        y2={midY}
      />

      {/* Judge */}
      <JudgeDot
        cx={padX + count * gap}
        cy={midY}
        r={dotR + 1}
        fill={judgeColor}
        label="Judge"
        showLabel={showLabels}
      />
    </svg>
  );
}

/**
 * Round Table: multi_round_consensus
 *
 * Round 1    Round 2    Round 3
 * ● ● ● ●   ● ● ● ●   ◉ Judge
 * (all draft) (critique)  (consensus)
 */
function MultiRoundConsensus({
  agents,
  judgeColor,
  size,
}: {
  agents: AgentSummary[];
  judgeColor: string;
  size: "compact" | "full";
}) {
  const isCompact = size === "compact";
  const w = isCompact ? 220 : 380;
  const h = isCompact ? 64 : 100;
  const dotR = isCompact ? 4 : 6;
  const showLabels = !isCompact;
  const showAgentLabels = false;
  const midY = isCompact ? h / 2 : h / 2;

  // 3 rounds + judge
  const roundX = [
    isCompact ? 35 : 60,
    isCompact ? 90 : 150,
    isCompact ? 145 : 240,
  ];
  const judgeX = isCompact ? 195 : 340;

  // Stack agents vertically in each round column
  const spacing = isCompact ? 12 : 16;
  const topY = midY - ((agents.length - 1) * spacing) / 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      {/* Round labels */}
      {showLabels && <StepLabel x={roundX[0]} y={12} text="Round 1" />}
      {showLabels && <StepLabel x={roundX[1]} y={12} text="Round 2" />}
      {showLabels && <StepLabel x={roundX[2]} y={12} text="Round 3" />}
      {showLabels && <StepLabel x={judgeX} y={12} text="Synthesise" />}

      {/* Rounds 1-3: stacked agent dots */}
      {roundX.map((rx, roundIdx) => (
        <React.Fragment key={`round-${roundIdx}`}>
          {agents.map((a, i) => {
            const y = topY + i * spacing;
            return (
              <AgentDot key={`${roundIdx}-${a.role}`} cx={rx} cy={y} r={dotR} fill={a.color} />
            );
          })}

          {/* Cross-connections in round 2 (critique phase) */}
          {roundIdx === 1 &&
            agents.map((_, i) => {
              const y = topY + i * spacing;
              return agents.map((_, j) => {
                if (i >= j) return null;
                const y2 = topY + j * spacing;
                return (
                  <line
                    key={`conn-${i}-${j}`}
                    x1={rx + dotR + 1}
                    y1={y}
                    x2={rx + dotR + 1}
                    y2={y2}
                    stroke="#CCC1B7"
                    strokeWidth="0.5"
                    strokeDasharray="2 2"
                    opacity={0.6}
                  />
                );
              });
            })}

          {/* Arrow to next round */}
          {roundIdx < 2 && (
            <Arrow
              x1={rx + dotR + 6}
              y1={midY}
              x2={roundX[roundIdx + 1] - dotR - 6}
              y2={midY}
            />
          )}
        </React.Fragment>
      ))}

      {/* Arrow from round 3 to judge */}
      <Arrow x1={roundX[2] + dotR + 6} y1={midY} x2={judgeX - dotR - 5} y2={midY} />

      {/* Judge */}
      <JudgeDot cx={judgeX} cy={midY} r={dotR + 2} fill={judgeColor} label="Judge" showLabel={showLabels} />
    </svg>
  );
}

/**
 * Deep Dive: manager_worker
 *
 * ◉ Manager ──→ ● ● ● Workers ──→ ◉ Manager (review)
 */
function ManagerWorker({
  agents,
  judgeColor,
  size,
}: {
  agents: AgentSummary[];
  judgeColor: string;
  size: "compact" | "full";
}) {
  const isCompact = size === "compact";
  const w = isCompact ? 220 : 380;
  const h = isCompact ? 64 : 100;
  const dotR = isCompact ? 5 : 7;
  const showLabels = !isCompact;
  const showAgentLabels = false;
  const midY = isCompact ? h / 2 : h / 2;

  // Manager (left) → 2 workers (middle, stacked) → Manager review (right)
  const mgrX1 = isCompact ? 30 : 55;
  const workerX = isCompact ? 110 : 190;
  const mgrX2 = isCompact ? 190 : 325;

  // Find the manager and workers
  const managerAgent = agents.find(
    (a) => a.role.toLowerCase().includes("manager")
  );
  const workerAgents = agents.filter(
    (a) => !a.role.toLowerCase().includes("manager")
  );
  const managerColor = managerAgent?.color || judgeColor;

  // For Deep Dive, we show 3 "worker" dots even though there's just one "Specialist Worker" defined
  // because the manager decomposes the task into sub-tasks
  const workerCount = Math.max(workerAgents.length, 3);
  const workerColors = workerAgents.length > 0
    ? Array.from({ length: workerCount }, (_, i) => workerAgents[i % workerAgents.length].color)
    : ["#3b82f6", "#22c55e", "#a855f7"];
  const spacing = isCompact ? 14 : 18;
  const topY = midY - ((workerCount - 1) * spacing) / 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      {/* Phase labels */}
      {showLabels && <StepLabel x={mgrX1} y={12} text="Decompose" />}
      {showLabels && <StepLabel x={workerX} y={12} text="Execute" />}
      {showLabels && <StepLabel x={mgrX2} y={12} text="Review" />}

      {/* Manager 1 (decompose) */}
      <JudgeDot cx={mgrX1} cy={midY} r={dotR + 1} fill={managerColor} label="Manager" showLabel={showLabels} />

      {/* Fan-out arrows to workers */}
      {Array.from({ length: workerCount }, (_, i) => {
        const y = topY + i * spacing;
        return (
          <React.Fragment key={`worker-${i}`}>
            <Arrow x1={mgrX1 + dotR + 5} y1={midY} x2={workerX - dotR - 4} y2={y} />
            <AgentDot cx={workerX} cy={y} r={dotR} fill={workerColors[i]} label={`Task ${i + 1}`} showLabel={showAgentLabels} />
            <Arrow x1={workerX + dotR + 4} y1={y} x2={mgrX2 - dotR - 5} y2={midY} />
          </React.Fragment>
        );
      })}

      {/* Manager 2 (review) */}
      <JudgeDot cx={mgrX2} cy={midY} r={dotR + 1} fill={managerColor} label="Review" showLabel={showLabels} />
    </svg>
  );
}

/* ─── Public Component ───────────────────────────────────────────────── */

export function StrategyDiagram({ workflow, agents, judgeColor, size = "compact" }: DiagramProps) {
  const jc = judgeColor || "#f59e0b";

  switch (workflow) {
    case "parallel_aggregate":
      return <ParallelAggregate agents={agents} judgeColor={jc} size={size} />;
    case "sequential_debate":
      return <SequentialDebate agents={agents} judgeColor={jc} size={size} />;
    case "multi_round_consensus":
      return <MultiRoundConsensus agents={agents} judgeColor={jc} size={size} />;
    case "manager_worker":
      return <ManagerWorker agents={agents} judgeColor={jc} size={size} />;
    default:
      return null;
  }
}
