"use client";

/**
 * Main flow-visualizer component rendered by the job detail page.
 *
 * Builds a ReactFlow canvas from the strategy config + live SSE step list.
 * Nodes pulse while running, edges animate as data flows between agents, and
 * completed nodes become clickable to open the inspector panel.
 *
 * The canvas is non-interactive (no drag/zoom/pan) — it's a visualisation,
 * not a builder. All-graph fitView is re-run when the node count changes (e.g.
 * Deep Dive expanding its dynamic workers).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./flow.css";

import { AgentNode } from "./AgentNode";
import {
  buildStrategyGraph,
  type AgentNodeData,
  type StepInput,
  type StrategySummary,
} from "./strategyGraphLayout";

const nodeTypes = { agent: AgentNode };

interface AgentStepLike {
  agentRole: string;
  agentModel: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
}

interface Props {
  strategyId: string;
  steps: AgentStepLike[];
  status: string;
  childJobIds?: string[];
  onNodeClick: (step: StepInput, color: string) => void;
  onStrategyNodeClick?: (childJobId: string) => void;
}

function FlowCanvas({
  strategy,
  steps,
  status,
  childJobIds,
  onNodeClick,
  onStrategyNodeClick,
}: Props & { strategy: StrategySummary }) {
  const rf = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevNodeCount = useRef(0);

  const jobFinished =
    status === "DONE" || status === "FAILED" || status === "CANCELLED";

  const { nodes, edges } = useMemo(
    () =>
      buildStrategyGraph(
        strategy,
        steps as StepInput[],
        jobFinished,
        childJobIds
      ),
    [strategy, steps, jobFinished, childJobIds]
  );

  // Re-fit the view when the node count changes (e.g. Deep Dive worker expansion)
  useEffect(() => {
    if (nodes.length !== prevNodeCount.current) {
      prevNodeCount.current = nodes.length;
      const id = window.setTimeout(() => {
        rf.fitView({ padding: 0.18, duration: 300 });
      }, 60);
      return () => window.clearTimeout(id);
    }
    return;
  }, [nodes.length, rf]);

  function handleNodeClick(_event: React.MouseEvent, node: Node) {
    const data = node.data as AgentNodeData;
    if (data.isStrategyNode && data.jobId && onStrategyNodeClick) {
      onStrategyNodeClick(data.jobId);
      return;
    }
    const step: StepInput = {
      agentRole: data.role,
      agentModel: data.model,
      status: data.status,
      startedAt: data.startedAt as string | undefined,
      completedAt: data.completedAt as string | undefined,
    };
    onNodeClick(step, data.color);
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: strategy.workflow === "all_angles" ? 380 : 280,
        border: "1px solid var(--rule)",
        background: "var(--white)",
      }}
    >
      <ReactFlow
        className="strategy-flow"
        nodes={nodes}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={strategy.workflow === "all_angles"}
        zoomOnPinch={strategy.workflow === "all_angles"}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="var(--rule)" />
      </ReactFlow>
    </div>
  );
}

export function StrategyFlowVisualizer(props: Props) {
  const [strategy, setStrategy] = useState<StrategySummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/advisor/strategies")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (!active) return;
        const found = (data.strategies ?? []).find(
          (s: StrategySummary) => s.id === props.strategyId
        );
        if (found) setStrategy(found);
        else setLoadError(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [props.strategyId]);

  if (loadError) {
    return (
      <div
        style={{
          padding: "24px",
          border: "1px solid var(--rule)",
          background: "var(--white)",
          color: "var(--grey-light)",
          fontSize: 13,
          fontStyle: "italic",
        }}
      >
        Couldn't load the strategy diagram.
      </div>
    );
  }

  if (!strategy) {
    return (
      <div
        style={{
          height: props.strategyId === "all-angles" ? 380 : 280,
          border: "1px solid var(--rule)",
          background: "var(--white)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--grey-light)",
          fontSize: 13,
          fontStyle: "italic",
        }}
      >
        Loading diagram…
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} strategy={strategy} />
    </ReactFlowProvider>
  );
}
