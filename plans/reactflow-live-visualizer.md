# Live Execution Visualizer — Implementation Plan

Build a ReactFlow-powered live execution visualizer that replaces the current flat step list with an animated graph showing agents working in real time, with click-to-inspect reasoning traces on completed nodes.

---

## Current State

| What exists | Where |
|---|---|
| SSE progress stream (1.5s poll) | `src/app/api/advisor/jobs/[id]/stream/route.ts` — pushes `AgentStepProgress[]` with `pending/running/done/failed` per agent |
| Per-agent responses + reasoning | `prisma/schema.prisma` AgentResponse model — `response`, `reasoning`, `phase`, `round`, `costUsd`, `durationMs` |
| Reasoning traces API | `src/app/api/advisor/jobs/[id]/reasoning/route.ts` — returns all reasoning after job completion |
| Transcript API | `src/app/api/advisor/jobs/[id]/transcript/route.ts` — returns all agent responses |
| Static SVG diagrams | `src/components/StrategyDiagram.tsx` — hardcoded SVGs per topology |
| Flat step list UI | `src/app/advisor/jobs/[id]/page.tsx` lines ~1058-1222 — linear list with status icons |
| Strategy configs with agent colors | `src/strategies/*.md` — each agent has `role`, `model`, `color`, `phase` |
| Strategy summaries API | `src/app/api/advisor/strategies/route.ts` — returns agent metadata including colors |

## What We're Building

The flat progress step list gets replaced with an interactive ReactFlow canvas. Nodes represent agents and judges, edges represent data flow. During execution, active nodes pulse, edges animate along the flow direction, and completed nodes become clickable to reveal agent responses and reasoning traces.

> **IMPORTANT:** This is a **read-only visualizer**, not a builder. The graph is auto-generated from the strategy config. No new orchestrator logic is needed.

---

## Open Questions

> **View toggle vs full replacement?** Should the visualizer fully replace the current flat step list, or should users be able to toggle between "Graph view" and "List view"? Recommendation is **toggle with graph as default** — the list view is useful for accessibility and for users who prefer scanning text.

> **All Angles sub-graphs?** The All Angles strategy runs 4 child strategies. Should each child be expandable into its own sub-graph within the canvas, or remain as a single "strategy node" that links to the child job page? Expandable sub-graphs are significantly more complex. Recommendation is **single nodes with links** for v1.

---

## Proposed Changes

### Phase 1 — Dependencies & Foundation

#### [NEW] Install ReactFlow

```bash
npm install @xyflow/react
```

`@xyflow/react` is the v12+ package (formerly `reactflow`). It's React 19 compatible, tree-shakeable, and ~45kb gzipped.

---

### Phase 2 — Graph Layout Engine

#### [NEW] `src/components/flow/strategyGraphLayout.ts`

Pure function that takes a strategy config + step progress and returns ReactFlow `Node[]` and `Edge[]`. No React — just layout math. One layout function per workflow type:

```typescript
interface GraphLayout {
  nodes: Node[];
  edges: Edge[];
}

function layoutConsensusBoard(agents, judge, steps): GraphLayout
// 4 agent nodes on left → merge point → judge node on right
// Horizontal layout, agents stacked vertically on the left

function layoutStressTester(agents, judge, steps, maxRounds): GraphLayout
// Linear chain: Proposer → Critic → Refiner → Judge
// Loop edge from Refiner back to Proposer (if maxRounds > 1)
// Duplicated per round: Round 1 chain, Round 2 chain, → Judge

function layoutDeepDive(agents, judge, steps): GraphLayout
// Manager (left) → fan-out to N worker nodes (center) → Manager Review (right)
// Worker count is dynamic (from progress steps, not strategy config)

function layoutRoundTable(agents, judge, steps, maxRounds): GraphLayout
// Round columns: each round has 4 agent nodes vertically
// Cross-connections within each round (dashed)
// Arrows between rounds → Judge on far right

function layoutAllAngles(steps): GraphLayout
// 4 strategy nodes (consensus-board, deep-dive, stress-tester, round-table)
// arranged in a 2×2 grid → Meta-Judge node below/right
```

**Key design decisions:**
- Each node gets an `id` that maps to `AgentStepProgress.agentRole` (e.g. `"Risk Analyst"`, `"Devil's Advocate (Round 2)"`) so we can match SSE progress to nodes
- Positions are calculated in absolute pixels — no auto-layout library needed (the topologies are fixed)
- Edge animation state (`idle`, `active`, `done`) is derived from the connected nodes' statuses

---

### Phase 3 — Custom ReactFlow Nodes & Edges

#### [NEW] `src/components/flow/AgentNode.tsx`

Custom ReactFlow node for agent dots:
- **Pending**: Muted circle with agent color at 30% opacity, grey label
- **Running**: Pulsing glow ring around the circle (CSS `@keyframes` using the agent's own color), bold label, elapsed time counter
- **Done**: Solid circle at full opacity, subtle checkmark overlay, clickable cursor. Shows duration badge
- **Failed**: Red ring, error icon

Props derived from node `data`:
```typescript
{
  role: string;           // "Risk Analyst"
  model: string;          // "anthropic/claude-opus-4-7"
  color: string;          // "#ef4444" from strategy config
  status: "pending" | "running" | "done" | "failed";
  startedAt?: string;
  completedAt?: string;
  onClick?: () => void;   // opens inspector panel
}
```

#### [NEW] `src/components/flow/JudgeNode.tsx`

Same as AgentNode but with a dashed outer ring (matching the existing StrategyDiagram visual language where judges have `strokeDasharray`).

#### [NEW] `src/components/flow/AnimatedEdge.tsx`

Custom ReactFlow edge with three visual states:
- **Idle**: Thin grey line (same `#CCC1B7` as current diagrams)
- **Active**: Animated dashed stroke moving in the flow direction (CSS `stroke-dashoffset` animation). The edge is "active" when its source node is `done` and its target node is `running`
- **Done**: Solid line at slightly higher opacity, indicating data has flowed through
- **Loop edge** variant: Curved return path for Stress Tester rounds, with a "Round N" label

#### [NEW] `src/components/flow/flow.css`

CSS animations and ReactFlow overrides:
- `@keyframes nodeGlow` — pulsing box-shadow using agent color as CSS variable
- `@keyframes edgeFlow` — `stroke-dashoffset` animation for active edges
- ReactFlow chrome removal — hide minimap, controls, attribution (keeps it clean within the page)
- Dark-mode-aware colors using existing CSS custom properties (`--charcoal`, `--rule`, `--teal`, etc.)

---

### Phase 4 — Live Data Integration

#### [NEW] `src/components/flow/StrategyFlowVisualizer.tsx`

The main component. This is what the job detail page renders.

```typescript
interface Props {
  strategyId: string;       // e.g. "consensus-board"
  steps: AgentStep[];       // from SSE progress
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  currentPhase?: string;
  currentRound?: number;
  totalRounds?: number;
  onNodeClick?: (agentRole: string) => void;
}
```

**Behaviour:**
1. On mount, fetches strategy metadata from `/api/advisor/strategies` to get agent colors and the workflow type
2. Calls the appropriate layout function from Phase 2 to generate nodes/edges
3. On each SSE progress update (steps prop changes), updates node `data.status` to match. ReactFlow re-renders only the changed nodes
4. When a node is clicked and its status is `done`, fires `onNodeClick` with the agent role — the parent handles opening the inspector
5. Canvas is non-interactive (no drag, no zoom, no pan) by default — it's a visualization, not a builder. Can add `zoomOnScroll` for very large graphs (All Angles)

**Sizing:**
- Fixed height: ~280px for standard strategies, ~400px for All Angles
- Width: 100% of container (responsive)
- `fitView` on initial render so the graph fills the space

#### [MODIFY] `src/app/advisor/jobs/[id]/page.tsx`

Replace the "Progress" section (lines ~1058-1222) with:

```tsx
{steps.length > 0 && (
  <div className="mb-24">
    {/* Toggle: Graph / List */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div className="section-label">Progress</div>
      <ViewToggle view={progressView} onChange={setProgressView} />
    </div>

    {progressView === "graph" ? (
      <StrategyFlowVisualizer
        strategyId={job.strategyId}
        steps={steps}
        status={job.status}
        currentPhase={phase}
        currentRound={job.progress?.currentRound}
        totalRounds={job.progress?.totalRounds}
        onNodeClick={(role) => setInspectedAgent(role)}
      />
    ) : (
      /* existing flat step list JSX — preserved as-is */
    )}
  </div>
)}
```

New state variables:
- `progressView: "graph" | "list"` — defaults to `"graph"`
- `inspectedAgent: string | null` — which agent's panel is open

---

### Phase 5 — Response Inspector Panel

#### [NEW] `src/components/flow/AgentInspector.tsx`

Slide-out panel (right side, 400px wide) that appears when a completed node is clicked. Shows:

1. **Header**: Agent role, model name, color badge, duration, token count, cost
2. **Response tab**: Full markdown response from that agent (rendered with `react-markdown`)
3. **Reasoning tab**: The thinking/reasoning trace (if present), styled like the existing ReasoningPanel in `page.tsx`
4. **Close button**: X or click outside

#### [NEW] `src/app/api/advisor/jobs/[id]/agents/route.ts`

New API endpoint to fetch individual agent responses for a job, supporting query-by-role:

```
GET /api/advisor/jobs/:id/agents?role=Risk+Analyst
GET /api/advisor/jobs/:id/agents              (all agents)
```

Returns:
```json
{
  "agents": [{
    "agentRole": "Risk Analyst",
    "agentModel": "anthropic/claude-opus-4-7",
    "phase": "analyse",
    "round": 1,
    "response": "...",
    "reasoning": "...",
    "tokens": 2847,
    "costUsd": 0.034,
    "durationMs": 12450
  }]
}
```

This is needed because:
- The existing `/reasoning` endpoint only returns reasoning (no response text)
- The existing `/transcript` endpoint returns everything but has no filtering
- We need to fetch a single agent's data when a node is clicked, not the entire transcript

---

### Phase 6 — Polish & Edge Cases

#### Deep Dive dynamic workers

The Deep Dive strategy creates worker nodes dynamically — the Manager decides at runtime how many sub-tasks to create (3-5). The layout engine handles this by:
1. Initially showing: Manager → placeholder "Workers" node → Judge
2. When the SSE progress reveals the actual worker step names (e.g. `"Specialist Worker — Market Analysis"`), the layout recalculates with the correct number of worker nodes

This works because `updateProgress()` in `src/lib/orchestrators/manager-worker.ts` (line ~185) sends the expanded `fullSteps` array once the Manager decomposes the challenge.

#### Round Table early consensus

The Round Table can stop early if consensus is reached. The layout handles this by rendering all 3 rounds initially, but when SSE reports skipped rounds (steps with `status: "done"` and no `startedAt`), those round columns fade to 20% opacity with a "Skipped — consensus reached" label.

#### All Angles

Four nodes in a 2×2 grid (each representing a child strategy) → Meta-Judge node. Each strategy node shows its child job's status. Clicking a strategy node navigates to `/advisor/jobs/:childJobId` (existing page) rather than opening an inspector panel.

#### Cancelled / Failed states

- If a job is cancelled, running nodes freeze with an amber ring and "Cancelled" overlay
- If an agent fails, that node shows a red error state; downstream nodes stay in pending

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `src/components/flow/strategyGraphLayout.ts` | NEW | Pure layout functions → Node[]/Edge[] per strategy |
| `src/components/flow/AgentNode.tsx` | NEW | Custom ReactFlow node for agents |
| `src/components/flow/JudgeNode.tsx` | NEW | Custom ReactFlow node for judges |
| `src/components/flow/AnimatedEdge.tsx` | NEW | Custom edge with idle/active/done animation |
| `src/components/flow/StrategyFlowVisualizer.tsx` | NEW | Main component: layout + ReactFlow canvas |
| `src/components/flow/AgentInspector.tsx` | NEW | Slide-out panel for agent response + reasoning |
| `src/components/flow/flow.css` | NEW | Animations, ReactFlow overrides |
| `src/app/api/advisor/jobs/[id]/agents/route.ts` | NEW | API: fetch agent responses with optional role filter |
| `src/app/advisor/jobs/[id]/page.tsx` | MODIFY | Replace flat step list with flow visualizer + toggle |

**No changes to:** orchestrators, strategy configs, database schema, SSE stream, or any existing API endpoints.

---

## Verification Plan

### Manual Verification Test Cases

#### Test 1 — Consensus Board (parallel fan-out)
1. Submit a challenge using the Consensus Board strategy
2. **Expected**: Graph shows 4 agent nodes on the left, 1 judge node on the right
3. All 4 agent nodes should pulse simultaneously (parallel)
4. Edges from agents to merge point should animate when agents are running
5. When all 4 complete, the judge node starts pulsing
6. Click any completed agent node → inspector opens with their response

#### Test 2 — Stress Tester (sequential chain)
1. Submit using Stress Tester
2. **Expected**: Linear chain: Proposer → Devil's Advocate → Refiner → Judge, with a loop edge
3. Only one node pulses at a time (sequential)
4. Each edge animates only when its source is done and target is running
5. If `maxRounds > 1`, the graph shows Round 1 and Round 2 chains
6. Click the Devil's Advocate node → inspector shows the critique text

#### Test 3 — Deep Dive (dynamic workers)
1. Submit using Deep Dive
2. **Expected**: Initially shows Manager → placeholder → Judge
3. After Manager completes, graph recalculates to show actual worker nodes (3-5)
4. Worker nodes pulse in parallel
5. Click a worker node → inspector shows that sub-task's analysis

#### Test 4 — Round Table (multi-round consensus)
1. Submit using Round Table
2. **Expected**: 3 round columns with 4 agents each, then judge
3. Round 1: all 4 agents pulse simultaneously
4. Round 2: all 4 pulse simultaneously after Round 1 completes
5. If consensus reached early (Round 2), Round 3 columns fade to 20% opacity
6. Cross-connection dashed lines visible within each round column

#### Test 5 — All Angles (meta-strategy)
1. Submit using All Angles
2. **Expected**: 4 strategy nodes in a 2×2 grid + Meta-Judge
3. Each strategy node shows the child job's status (running/done)
4. Click a strategy node → navigates to that child job's page
5. Meta-Judge node activates after all 4 strategy nodes complete

#### Test 6 — Reasoning traces on completed nodes
1. Submit any strategy with reasoning enabled
2. Wait for completion
3. Click a completed agent node
4. **Expected**: Inspector opens with two tabs — "Response" and "Reasoning"
5. Reasoning tab shows the thinking trace with the teal left border style
6. Token count and cost displayed in the header

#### Test 7 — View toggle (graph ↔ list)
1. While a job is running, toggle between "Graph" and "List" views
2. **Expected**: List view shows the existing flat step list (preserved exactly)
3. Graph view shows the ReactFlow canvas
4. Both views update live from the same SSE stream
5. Toggle state persists while viewing the page (resets on navigation)

#### Test 8 — Job reload (completed job)
1. Navigate directly to a completed job URL (no SSE stream)
2. **Expected**: Graph renders with all nodes in `done` state
3. All nodes are clickable → inspector works
4. Edges show `done` state (solid, not animated)

#### Test 9 — Failed job
1. Trigger a failure (e.g. invalid API key)
2. **Expected**: The failing agent node turns red
3. Downstream nodes remain in `pending` state (grey)
4. Failed node is not clickable (no response to inspect)

#### Test 10 — Cancelled job
1. Start a job and click "Cancel"
2. **Expected**: Running nodes freeze with amber ring
3. "Cancelled" overlay appears on the graph
4. Completed nodes before cancellation are still clickable

#### Test 11 — Mobile / narrow viewport
1. View the graph on a ~375px wide screen
2. **Expected**: ReactFlow canvas scales down via `fitView`
3. Nodes remain readable (minimum text size)
4. Inspector panel becomes full-width overlay on mobile rather than side panel

#### Test 12 — Demo mode
1. Log in as `demo@demo.com`
2. View a pre-seeded completed demo job
3. **Expected**: Graph renders correctly from the stored progress JSON
4. All nodes clickable, inspector works with the fixture data

#### Test 13 — SSE reconnection
1. While a job is running, disconnect network briefly, then reconnect
2. **Expected**: Graph catches up to the current state on reconnect
3. No duplicate nodes or stale states

#### Test 14 — Performance: All Angles (15+ nodes)
1. Run All Angles (4 strategy nodes + Meta-Judge = 5 top-level nodes)
2. **Expected**: No visible lag or jank when nodes update
3. ReactFlow canvas stays responsive during rapid SSE updates
4. Memory usage doesn't grow unboundedly (no node/edge duplication)
