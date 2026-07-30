"use client";

/**
 * Custom ReactFlow edge with three visual states + manually-drawn arrowheads:
 *  - idle:   faint grey line + faint arrow
 *  - active: animated teal dashed line + teal arrow (data flowing)
 *  - done:   solid charcoal line + dark arrow
 *
 * Built on top of ReactFlow's BaseEdge (guaranteed to render) with a
 * manually-drawn polygon arrowhead layered on top.
 *
 * Uses smoothstep path routing for clean right-angle edges between nodes.
 * Loop variant (Stress Tester rounds): curved return path.
 */

import { memo } from "react";
import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  Position,
} from "@xyflow/react";
import type { AgentEdgeData } from "./strategyGraphLayout";

// ─── State → colour mapping ─────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  idle: "#CCC1B7",
  active: "#0D7680",
  done: "#333333",
};

const STATE_OPACITY: Record<string, number> = {
  idle: 0.45,
  active: 1,
  done: 0.85,
};

const STATE_WIDTH: Record<string, number> = {
  idle: 1.2,
  active: 2,
  done: 1.8,
};

// ─── Arrowhead geometry ──────────────────────────────────────────────────────

const ARROW_SIZE = 8;

function getArrowAngle(targetPosition: Position): number {
  switch (targetPosition) {
    case Position.Left:
      return 0;
    case Position.Right:
      return Math.PI;
    case Position.Top:
      return Math.PI / 2;
    case Position.Bottom:
      return -Math.PI / 2;
    default:
      return 0;
  }
}

function arrowPolygonPoints(
  tipX: number,
  tipY: number,
  angle: number
): string {
  const half = ARROW_SIZE / 2;
  const bx1 =
    tipX -
    ARROW_SIZE * Math.cos(angle) +
    half * Math.cos(angle + Math.PI / 2);
  const by1 =
    tipY -
    ARROW_SIZE * Math.sin(angle) +
    half * Math.sin(angle + Math.PI / 2);
  const bx2 =
    tipX -
    ARROW_SIZE * Math.cos(angle) -
    half * Math.cos(angle + Math.PI / 2);
  const by2 =
    tipY -
    ARROW_SIZE * Math.sin(angle) -
    half * Math.sin(angle + Math.PI / 2);

  return `${tipX},${tipY} ${bx1},${by1} ${bx2},${by2}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

function AnimatedEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const d = (data ?? {}) as AgentEdgeData;
  const state = d.state ?? "idle";
  const isLoop = d.isLoop ?? false;

  const color = STATE_COLORS[state] ?? STATE_COLORS.idle;
  const opacity = STATE_OPACITY[state] ?? STATE_OPACITY.idle;
  const strokeWidth = STATE_WIDTH[state] ?? STATE_WIDTH.idle;

  // Smoothstep for normal edges, bezier for loop-back edges
  const [edgePath, labelX, labelY] = isLoop
    ? getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      })
    : getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8,
      });

  // Arrowhead at the target handle
  const angle = getArrowAngle(targetPosition);
  const arrowPoints = arrowPolygonPoints(targetX, targetY, angle);

  // Active state gets animated dashes
  const edgeStyle: React.CSSProperties = {
    ...style,
    stroke: color,
    strokeWidth,
    opacity,
    strokeDasharray:
      state === "active" ? "6 3" : isLoop ? "4 3" : undefined,
    animation:
      state === "active"
        ? "flow-edge-dash 0.6s linear infinite"
        : undefined,
    transition:
      "stroke 0.4s ease, stroke-width 0.4s ease, opacity 0.4s ease",
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {/* Manual arrowhead — always visible */}
      <polygon
        points={arrowPoints}
        fill={color}
        opacity={opacity}
        style={{ transition: "opacity 0.4s ease, fill 0.4s ease" }}
      />
    </>
  );
}

export const AnimatedEdge = memo(AnimatedEdgeComponent);
