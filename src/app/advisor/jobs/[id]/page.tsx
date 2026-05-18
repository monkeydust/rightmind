"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentStep {
  agentRole: string;
  agentModel: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
}

interface Progress {
  currentPhase?: string;
  currentRound?: number;
  totalRounds?: number;
  steps?: AgentStep[];
}

interface JobData {
  status: string;
  progress: Progress;
  challenge?: string;
  fileName?: string;
  strategyId?: string;
  report?: string;
  error?: string;
}

interface ReasoningTrace {
  id: string;
  agentRole: string;
  agentModel: string;
  phase: string | null;
  reasoning: string;
  durationMs: number;
  tokens: number;
}

const STATUS_ICONS: Record<string, string> = {
  pending: "○",
  running: "◉",
  done: "✓",
  failed: "✗",
  cancelled: "⊘",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "var(--grey-light)",
  running: "var(--teal)",
  done: "var(--charcoal)",
  failed: "var(--claret)",
  cancelled: "#d97706",
};

const PHASE_LABELS: Record<string, string> = {
  decompose: "Decomposing challenge",
  execute: "Executing sub-tasks",
  review: "Reviewing & synthesising",
  analyse: "Agents analysing",
  synthesise: "Judge synthesising",
  draft: "Drafting proposal",
  critique: "Devil's advocate critiquing",
  refine: "Refining position",
  judge: "Judge evaluating",
  aggregate: "Judge aggregating rounds",
  launching: "Launching strategies",
  running: "Strategies running",
  "meta-synthesis": "Meta-judge synthesising",
  done: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

// ─── All Angles types ─────────────────────────────────────────────────────

interface StrategyVerdict {
  strategy_id: string;
  strategy_name: string;
  icon: string;
  verdict: string;
  one_liner: string;
}

interface DimensionPosition {
  stance: string;
  reason: string;
}

interface KeyDimension {
  question: string;
  positions: Record<string, DimensionPosition>;
}

interface MetaSynthesis {
  alignment_score: number;
  alignment_label: string;
  strategy_verdicts: StrategyVerdict[];
  key_dimensions: KeyDimension[];
  convergence_points: string[];
  divergence_points: string[];
  blind_spots: string[];
  meta_verdict: string;
  meta_verdict_rationale: string;
  meta_recommendation: string;
}

interface AllAnglesReport {
  _type: string;
  childJobIds: string[];
  metaSynthesis: MetaSynthesis;
}

// ─── Reusable Reasoning Panel ─────────────────────────────────────────────

function ReasoningPanel({ traces, loaded, expandedTraces, toggleTrace }: {
  traces: ReasoningTrace[];
  loaded: boolean;
  expandedTraces: Set<string>;
  toggleTrace: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: "24px", border: "1px solid var(--rule)", background: "var(--white)" }}>
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid var(--rule)",
        fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)",
      }}>
        Agent reasoning traces
      </div>
      {!loaded ? (
        <div style={{ padding: "16px", color: "var(--grey-light)", fontSize: "13px", fontStyle: "italic" }}>Loading reasoning traces...</div>
      ) : traces.length === 0 ? (
        <div style={{ padding: "16px", color: "var(--grey-light)", fontSize: "13px" }}>
          No reasoning traces available for this job. Reasoning was not enabled when this challenge was submitted.
        </div>
      ) : (
        traces.map((trace) => {
          const isExpanded = expandedTraces.has(trace.id);
          return (
            <div key={trace.id} style={{ borderBottom: "1px solid var(--rule)" }}>
              <button onClick={() => toggleTrace(trace.id)} style={{
                display: "flex", alignItems: "center", gap: "8px", width: "100%",
                padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
                fontSize: "13px", textAlign: "left", color: "var(--charcoal)",
              }}>
                <span style={{ fontSize: "10px", color: "var(--teal)", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
                <span style={{ fontWeight: 600 }}>{trace.agentRole}</span>
                <span style={{ fontSize: "11px", color: "var(--grey-light)" }}>{trace.agentModel}</span>
                <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--grey-light)", fontFamily: "'Menlo','Consolas',monospace" }}>{trace.tokens} tok</span>
              </button>
              {isExpanded && (
                <div style={{
                  padding: "0 14px 14px 32px", fontSize: "13px", lineHeight: 1.65, color: "var(--grey)",
                  fontFamily: "var(--font-text)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: "400px", overflowY: "auto", borderLeft: "2px solid var(--teal)", marginLeft: "14px",
                }}>
                  {trace.reasoning}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Child Strategy Reports (drill-down for All Angles) ───────────────────

interface ChildJobReport {
  id: string;
  strategyId: string;
  status: string;
  report: string | null;
  models: string[];
}

const STRATEGY_LABELS: Record<string, { icon: string; name: string }> = {
  "consensus-board": { icon: "🏛️", name: "Consensus Board" },
  "deep-dive": { icon: "🔬", name: "Deep Dive" },
  "stress-tester": { icon: "⚔️", name: "Stress Tester" },
  "round-table": { icon: "🤝", name: "Round Table" },
  "all-angles": { icon: "🔮", name: "All Angles" },
};

function ChildStrategyReports({ childJobIds }: { childJobIds: string[] }) {
  const [childJobs, setChildJobs] = useState<ChildJobReport[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all(
      childJobIds.map((id) =>
        fetch(`/api/advisor/jobs/${id}`)
          .then((r) => r.json())
          .then((data) => {
            let models: string[] = [];
            if (data.progress?.steps) {
              const uniqueModels = new Set(data.progress.steps.map((s: any) => s.agentModel).filter(Boolean));
              models = Array.from(uniqueModels) as string[];
            }
            return { id, strategyId: data.strategyId, status: data.status, report: data.report, models } as ChildJobReport;
          })
          .catch(() => ({ id, strategyId: "unknown", status: "FAILED", report: null, models: [] } as ChildJobReport))
      )
    ).then((jobs) => {
      setChildJobs(jobs);
      setLoaded(true);
    });
  }, [childJobIds]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!loaded) return <p style={{ color: "var(--grey-light)", fontSize: "13px", fontStyle: "italic" }}>Loading strategy reports...</p>;

  return (
    <div>
      <div className="section-label">Individual strategy reports</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {childJobs.map((cj) => {
          const label = STRATEGY_LABELS[cj.strategyId] || { icon: "📄", name: cj.strategyId };
          const isOpen = expanded.has(cj.id);
          return (
            <div key={cj.id} style={{ border: "1px solid var(--rule)", background: "var(--white)" }}>
              <button onClick={() => toggleExpand(cj.id)} style={{
                display: "flex", alignItems: "center", gap: "8px", width: "100%",
                padding: "12px 14px", background: "none", border: "none", cursor: "pointer",
                fontSize: "14px", textAlign: "left", color: "var(--charcoal)",
              }}>
                <span style={{ fontSize: "10px", color: "var(--teal)", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
                <span style={{ fontSize: "18px" }}>{label.icon}</span>
                <span style={{ fontWeight: 600 }}>{label.name}</span>
                {cj.models.length > 0 && (
                  <span style={{
                    fontSize: "11px", color: "var(--grey-light)", fontFamily: "'Menlo','Consolas',monospace", marginLeft: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "250px"
                  }}>
                    {cj.models.map(m => m.split('/').pop()).join(", ")}
                  </span>
                )}
                <span style={{
                  marginLeft: "auto", fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                  color: cj.status === "DONE" ? "var(--teal)" : cj.status === "FAILED" ? "var(--claret)" : "var(--grey-light)",
                }}>
                  {cj.status}
                </span>
              </button>
              {isOpen && cj.report && (
                <div style={{ padding: "0 14px 16px 42px", borderTop: "1px solid var(--rule)" }}>
                  <div className="prose" style={{ maxHeight: "600px", overflowY: "auto" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cj.report}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Copy / Export Action Bar ─────────────────────────────────────────────

interface TranscriptEntry {
  agentRole: string;
  agentModel: string;
  phase: string | null;
  round: number;
  response: string;
  reasoning: string | null;
}

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  "consensus-board": "4 specialist agents (Risk Analyst, Growth Strategist, Operations Manager, Technical Feasibility Assessor) analysed the challenge independently and in parallel. A Chief Executive Synthesiser then reviewed all four analyses and produced the final briefing below.",
  "stress-tester": "A Proposer drafted an initial position, then a Devil's Advocate attacked it across multiple rounds. A Verdict Judge reviewed the full debate and produced the final briefing below.",
  "round-table": "Multiple agents debated the challenge across several rounds, explicitly agreeing and disagreeing with each other until consensus emerged. A Consensus Judge evaluated the final positions.",
  "deep-dive": "A Manager agent decomposed the challenge into sub-tasks, specialist Worker agents tackled each one independently, then a Review Judge synthesised all findings into the final briefing below.",
  "all-angles": "All four strategies (Consensus Board, Stress Tester, Round Table, Deep Dive) were run in parallel. A Meta-Judge then analysed where they agreed and diverged, producing a cross-strategy alignment matrix and confidence-weighted recommendation.",
};

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for non-HTTPS environments like local IPs
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Fallback copy failed", err);
    }
    textArea.remove();
  }
}

function CopyBar({ jobId, challenge, strategyId, report, showReasoning, reasoningTraces }: {
  jobId: string;
  challenge: string;
  strategyId: string;
  report: string;
  showReasoning: boolean;
  reasoningTraces: ReasoningTrace[];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied-report" | "copied-discussion" | "copied-transcript" | "loading">("idle");

  function resetCopy() {
    setTimeout(() => setCopyState("idle"), 2500);
  }

  function buildReasoningBlock(traces: ReasoningTrace[]): string {
    if (!traces.length) return "";
    const lines = traces.map((t) =>
      `### ${t.agentRole} (${t.agentModel})\nTokens: ${t.tokens}\n\n${t.reasoning}`
    );
    return `\n\n---\n\n## Agent Reasoning Traces\n\nThese are the internal thinking/reasoning traces from each agent before they produced their response.\n\n${lines.join("\n\n---\n\n")}`;
  }

  async function copyForDiscussion() {
    const strategyLabel = STRATEGY_LABELS[strategyId] || { icon: "📄", name: strategyId };
    const strategyDesc = STRATEGY_DESCRIPTIONS[strategyId] || "";
    const reasoning = showReasoning ? buildReasoningBlock(reasoningTraces) : "";

    const text = `I've had the following challenge analysed by a multi-agent AI advisory system called RightMind. Here's the full context — I'd like to discuss the findings with you.

## My Challenge

${challenge}

## Strategy Used: ${strategyLabel.icon} ${strategyLabel.name}

${strategyDesc}

## Final Analysis

${report}${reasoning}

---

Please review this analysis. I'd like your perspective on:
1. Whether the reasoning is sound
2. What might have been missed or underweighted
3. What you'd do differently
4. Any blind spots in the analysis`;

    await copyTextToClipboard(text);
    setCopyState("copied-discussion");
    resetCopy();
  }

  const btnStyle: React.CSSProperties = {
    padding: "4px 12px",
    fontSize: "11px",
    fontFamily: "var(--font-ui)",
    fontWeight: 500,
    background: "none",
    border: "1px solid var(--rule)",
    color: "var(--grey)",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    borderColor: "var(--teal)",
    color: "var(--teal)",
    fontWeight: 600,
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "16px",
      flexWrap: "wrap",
    }}>
      <button
        onClick={copyForDiscussion}
        style={copyState === "copied-discussion" ? activeBtnStyle : btnStyle}
        onMouseEnter={(e) => { if (copyState !== "copied-discussion") { e.currentTarget.style.borderColor = "var(--charcoal)"; e.currentTarget.style.color = "var(--charcoal)"; } }}
        onMouseLeave={(e) => { if (copyState !== "copied-discussion") { e.currentTarget.style.borderColor = "var(--rule)"; e.currentTarget.style.color = "var(--grey)"; } }}
        title="Copy with your original challenge + discussion prompts — ready to paste into ChatGPT, Claude, or Gemini"
      >
        {copyState === "copied-discussion" ? "✓ Copied" : "💬 Copy for discussion"}
      </button>
      {showReasoning && (
        <span style={{ fontSize: "10px", color: "var(--teal)", fontStyle: "italic" }}>
          + reasoning traces
        </span>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobData>({
    status: "PENDING",
    progress: {},
  });
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  // Reasoning state
  const [showReasoning, setShowReasoning] = useState(false);
  const [reasoningTraces, setReasoningTraces] = useState<ReasoningTrace[]>([]);
  const [reasoningLoaded, setReasoningLoaded] = useState(false);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailNotify, setEmailNotify] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Are you sure you want to delete this job? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/advisor/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/advisor/jobs");
      } else {
        alert("Failed to delete job.");
        setDeleting(false);
      }
    } catch {
      alert("Network error while trying to delete job.");
      setDeleting(false);
    }
  }

  async function handleRerun() {
    if (rerunning || !job.challenge || !job.strategyId) return;
    setRerunning(true);
    try {
      const res = await fetch("/api/advisor/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: job.challenge,
          strategyId: job.strategyId,
          executionMode: "instant",
        }),
      });
      const data = await res.json();
      if (data.jobId) {
        router.push(`/advisor/jobs/${data.jobId}`);
      } else {
        setRerunning(false);
        alert(data.error || "Failed to re-run job");
      }
    } catch {
      setRerunning(false);
      alert("Network error while trying to re-run job");
    }
  }

  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/advisor/jobs/${jobId}/cancel`, { method: "POST" });
      if (res.ok) {
        setJob((prev) => ({ ...prev, status: "CANCELLED" }));
      }
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    const es = new EventSource(`/api/advisor/jobs/${jobId}/stream`);
    sourceRef.current = es;

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setJob((prev) => ({
        ...prev,
        status: data.status,
        challenge: data.challenge || prev.challenge,
        strategyId: data.strategyId || prev.strategyId,
        progress: data.progress,
      }));
      setConnected(true);
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setJob((prev) => ({
        ...prev,
        status: "DONE",
        report: data.report,
      }));
      es.close();
    });

    es.addEventListener("failed", (e) => {
      const data = JSON.parse(e.data);
      setJob((prev) => ({
        ...prev,
        status: "FAILED",
        error: data.error,
      }));
      es.close();
    });

    es.addEventListener("error", () => {
      setConnected(false);
    });

    return () => {
      es.close();
    };
  }, [jobId]);

  // Fetch email notification preference
  useEffect(() => {
    fetch("/api/advisor/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.emailOnComplete) setEmailNotify(true); })
      .catch(() => {});
  }, []);

  // Tick the elapsed timer every second while job is running
  useEffect(() => {
    if (job.status !== "RUNNING" && job.status !== "PENDING") return;
    const interval = setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [job.status]);

  // Fetch reasoning traces when user toggles on (and job is done)
  useEffect(() => {
    if (showReasoning && !reasoningLoaded && job.status === "DONE") {
      fetch(`/api/advisor/jobs/${jobId}/reasoning`)
        .then((r) => r.json())
        .then((data) => {
          setReasoningTraces(data.traces || []);
          setReasoningLoaded(true);
        })
        .catch(() => setReasoningLoaded(true));
    }
  }, [showReasoning, reasoningLoaded, job.status, jobId]);

  function toggleTrace(id: string) {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const steps = job.progress?.steps ?? [];
  const phase = job.progress?.currentPhase ?? "";

  return (
    <div className="page">
      {/* Back */}
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/advisor/jobs"
          style={{ fontSize: "13px", color: "var(--grey)", borderBottom: "none" }}
        >
          ← Back to jobs
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ marginBottom: "6px" }}>
          {job.strategyId ? STRATEGY_LABELS[job.strategyId]?.name || "Analysis" : "Analysis"}
        </h1>
        <p
          style={{
            fontFamily: "'Menlo','Consolas',monospace",
            fontSize: "12px",
            color: "var(--grey-light)",
          }}
        >
          {jobId}
        </p>
      </div>

      {/* Original challenge */}
      {job.challenge && (
        <div style={{ marginBottom: "24px" }}>
          <div className="section-label">Your challenge</div>
          <blockquote
            style={{
              margin: 0,
              padding: "12px 16px",
              borderLeft: "3px solid var(--claret)",
              background: "var(--white)",
              fontFamily: "var(--font-text)",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "var(--charcoal)",
              fontStyle: "italic",
            }}
          >
            {job.challenge}
          </blockquote>
          {job.strategyId && (
            <p style={{ fontSize: "12px", color: "var(--grey-light)", marginTop: "6px" }}>
              Strategy: {job.strategyId}
              {job.fileName && (
                <span style={{ marginLeft: "12px", padding: "2px 8px", background: "rgba(13,118,128,0.06)", border: "1px solid rgba(13,118,128,0.15)", borderRadius: "10px", fontSize: "11px", color: "var(--teal)" }}>
                  📎 {job.fileName}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Status badge */}
      <div style={{ marginBottom: "24px" }}>
        <span
          style={{
            display: "inline-block",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "3px 10px",
            border: "1px solid",
            borderColor:
              job.status === "DONE"
                ? "var(--teal)"
                : job.status === "FAILED"
                ? "var(--claret)"
                : "var(--grey-light)",
            color:
              job.status === "DONE"
                ? "var(--teal)"
                : job.status === "FAILED"
                ? "var(--claret)"
                : "var(--grey)",
          }}
        >
          {job.status === "RUNNING"
            ? PHASE_LABELS[phase] || "Running"
            : job.status}
        </span>

        {!connected && job.status !== "DONE" && job.status !== "FAILED" && job.status !== "CANCELLED" && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--grey-light)",
              marginLeft: "8px",
              fontStyle: "italic",
            }}
          >
            Connecting...
          </span>
        )}

        {(job.status === "RUNNING" || job.status === "PENDING") && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              marginLeft: "12px",
              padding: "3px 12px",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "var(--font-ui)",
              background: "none",
              border: "1px solid #dc2626",
              borderRadius: "4px",
              color: "#dc2626",
              cursor: cancelling ? "wait" : "pointer",
              opacity: cancelling ? 0.5 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {cancelling ? "Cancelling..." : "Cancel job"}
          </button>
        )}

        {(job.status === "DONE" || job.status === "FAILED" || job.status === "CANCELLED") && (
          <button
            onClick={handleRerun}
            disabled={rerunning}
            style={{
              marginLeft: "12px",
              padding: "3px 12px",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "var(--font-ui)",
              background: "none",
              border: "1px solid var(--teal)",
              borderRadius: "4px",
              color: "var(--teal)",
              cursor: rerunning ? "wait" : "pointer",
              opacity: rerunning ? 0.5 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {rerunning ? "Starting..." : "↺ Re-run"}
          </button>
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            marginLeft: "12px",
            padding: "3px 12px",
            fontSize: "11px",
            fontWeight: 600,
            fontFamily: "var(--font-ui)",
            background: "none",
            border: "1px solid var(--grey-light)",
            borderRadius: "4px",
            color: "var(--grey)",
            cursor: deleting ? "wait" : "pointer",
            opacity: deleting ? 0.5 : 1,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {deleting ? "Deleting..." : "🗑️ Delete"}
        </button>
      </div>

      {/* Progress steps */}
      {steps.length > 0 && (
        <div className="mb-24">
          <div className="section-label">Progress</div>

          {/* Phase & round indicator */}
          {(job.status === "RUNNING" || job.status === "PENDING") && (
            <div style={{ marginBottom: "14px" }}>
              {/* Progress bar */}
              {(() => {
                const done = steps.filter((s) => s.status === "done").length;
                const total = steps.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", color: "var(--grey)", fontWeight: 500 }}>
                        {PHASE_LABELS[phase] || phase || "Initialising"}
                        {job.progress?.currentRound && job.progress?.totalRounds && (
                          <span style={{ color: "var(--grey-light)", marginLeft: "6px" }}>
                            · Round {job.progress.currentRound}/{job.progress.totalRounds}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--grey-light)", fontFamily: "'Menlo','Consolas',monospace" }}>
                        {done}/{total} agents · {pct}%
                      </span>
                    </div>
                    <div style={{ height: "4px", background: "var(--rule)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: "var(--teal)",
                        borderRadius: "2px",
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Step list */}
          <div style={{
            border: "1px solid var(--rule)",
            background: "var(--white)",
            borderRadius: "4px",
            overflow: "hidden",
          }}>
            {steps.map((step, i) => {
              const elapsed = step.status === "running" && step.startedAt
                ? Math.round((elapsedNow - new Date(step.startedAt).getTime()) / 1000)
                : null;
              const duration = step.status === "done" && step.completedAt && step.startedAt
                ? ((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1)
                : null;

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 14px",
                    borderBottom: i < steps.length - 1 ? "1px solid var(--rule)" : "none",
                    background: step.status === "running" ? "rgba(13,118,128,0.03)" : "transparent",
                    transition: "background 0.3s ease",
                  }}
                >
                  {/* Status icon */}
                  <span style={{
                    color: STATUS_COLORS[step.status],
                    fontWeight: step.status === "running" ? 600 : 400,
                    width: "16px",
                    textAlign: "center",
                    fontSize: step.status === "running" ? "12px" : "14px",
                    ...(step.status === "running" ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
                  }}>
                    {STATUS_ICONS[step.status]}
                  </span>

                  {/* Agent role */}
                  <span style={{
                    color: step.status === "done" ? "var(--charcoal)"
                      : step.status === "running" ? "var(--teal)"
                      : "var(--grey-light)",
                    fontWeight: step.status === "running" ? 600 : 400,
                    fontSize: "13px",
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {step.agentRole}
                  </span>

                  {/* Model badge */}
                  <span style={{
                    fontSize: "10px",
                    color: "var(--grey-light)",
                    fontFamily: "'Menlo','Consolas',monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "140px",
                  }}>
                    {step.agentModel}
                  </span>

                  {/* Running elapsed or done duration */}
                  {step.status === "running" && elapsed !== null && (
                    <span style={{
                      fontSize: "11px",
                      color: "var(--teal)",
                      fontFamily: "'Menlo','Consolas',monospace",
                      whiteSpace: "nowrap",
                      minWidth: "44px",
                      textAlign: "right",
                    }}>
                      {elapsed}s
                    </span>
                  )}
                  {step.status === "done" && duration !== null && (
                    <span style={{
                      fontSize: "11px",
                      color: "var(--grey-light)",
                      fontFamily: "'Menlo','Consolas',monospace",
                      whiteSpace: "nowrap",
                      minWidth: "44px",
                      textAlign: "right",
                    }}>
                      {duration}s
                    </span>
                  )}
                  {step.status === "pending" && (
                    <span style={{ minWidth: "44px" }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Email notification indicator */}
          {emailNotify && (job.status === "RUNNING" || job.status === "PENDING") && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "10px",
              padding: "8px 12px",
              background: "rgba(13,118,128,0.04)",
              border: "1px solid rgba(13,118,128,0.12)",
              borderRadius: "4px",
              fontSize: "12px",
              color: "var(--grey)",
            }}>
              <span style={{ fontSize: "14px" }}>✉️</span>
              <span>You&apos;ll receive an email when this analysis completes.</span>
            </div>
          )}

          {/* Pulse animation */}
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      )}

      {/* Error */}
      {job.status === "FAILED" && job.error && (
        <div
          className="card mb-24"
          style={{
            padding: "16px",
            borderLeft: "3px solid var(--claret)",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--claret)",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Error
          </div>
          <pre
            style={{
              fontSize: "13px",
              color: "var(--charcoal)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
              fontFamily: "'Menlo','Consolas',monospace",
            }}
          >
            {job.error}
          </pre>
        </div>
      )}

      {/* Final report */}
      {job.status === "DONE" && job.report && (() => {
        // Detect All Angles structured report
        const isAllAngles = job.strategyId === "all-angles";
        let allAnglesData: AllAnglesReport | null = null;
        if (isAllAngles) {
          try {
            allAnglesData = JSON.parse(job.report);
          } catch { /* fall back to plain markdown */ }
        }

        if (allAnglesData?.metaSynthesis) {
          const meta = allAnglesData.metaSynthesis;
          return (
            <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "24px" }}>
              {/* Report header with reasoning toggle */}
              <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
                <div className="section-label" style={{ marginBottom: 0 }}>🔮 All Angles Report</div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: showReasoning ? "var(--teal)" : "var(--grey-light)",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "color 0.2s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showReasoning}
                    onChange={(e) => setShowReasoning(e.target.checked)}
                    style={{ width: "13px", height: "13px", accentColor: "var(--teal)", cursor: "pointer" }}
                  />
                  Show reasoning
                </label>
              </div>

              {/* Export action bar */}
              <CopyBar
                jobId={jobId}
                challenge={job.challenge || ""}
                strategyId={job.strategyId || "all-angles"}
                report={meta.meta_recommendation || ""}
                showReasoning={showReasoning}
                reasoningTraces={reasoningTraces}
              />

              {/* Reasoning traces */}
              {showReasoning && <ReasoningPanel traces={reasoningTraces} loaded={reasoningLoaded} expandedTraces={expandedTraces} toggleTrace={toggleTrace} />}

              {/* ── Alignment Score ──────────────────────────────── */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
                padding: "12px 16px",
                background: "var(--white)",
                border: "1px solid var(--rule)",
              }}>
                <span style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  color: meta.alignment_score >= 0.7 ? "var(--teal)" : meta.alignment_score >= 0.4 ? "#b8860b" : "var(--claret)",
                  fontFamily: "var(--font-display)",
                }}>
                  {Math.round(meta.alignment_score * 100)}%
                </span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>
                    {meta.alignment_label} Alignment
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--grey)" }}>
                    Cross-strategy agreement score
                  </div>
                </div>
                <div style={{
                  marginLeft: "auto",
                  padding: "4px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  borderRadius: "4px",
                  background: meta.meta_verdict === "GO" ? "rgba(0,128,128,0.1)" : meta.meta_verdict === "NO-GO" ? "rgba(180,50,50,0.1)" : meta.meta_verdict === "HOLD" ? "rgba(99,102,241,0.1)" : "rgba(184,134,11,0.1)",
                  color: meta.meta_verdict === "GO" ? "var(--teal)" : meta.meta_verdict === "NO-GO" ? "var(--claret)" : meta.meta_verdict === "HOLD" ? "#6366f1" : "#b8860b",
                  letterSpacing: "0.03em",
                }}>
                  {meta.meta_verdict}
                </div>
              </div>

              {/* ── Verdict Strip ────────────────────────────────── */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px",
                marginBottom: "24px",
              }}>
                {meta.strategy_verdicts?.map((sv: StrategyVerdict) => (
                  <div key={sv.strategy_id} style={{
                    padding: "10px 12px",
                    background: "var(--white)",
                    border: "1px solid var(--rule)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>{sv.icon}</div>
                    <div style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: sv.verdict === "GO" ? "var(--teal)" : sv.verdict === "NO-GO" ? "var(--claret)" : sv.verdict === "HOLD" ? "#6366f1" : "#b8860b",
                      marginBottom: "4px",
                      letterSpacing: "0.03em",
                    }}>
                      {sv.verdict}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--grey)", lineHeight: 1.4 }}>
                      {sv.one_liner}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Dimension Alignment Table ────────────────────── */}
              {meta.key_dimensions && meta.key_dimensions.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <div className="section-label">Decision alignment matrix</div>
                  <div style={{
                    border: "1px solid var(--rule)",
                    background: "var(--white)",
                    overflow: "auto",
                  }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "12px",
                    }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--rule)" }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--charcoal)", width: "28%" }}>Decision</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, width: "18%" }}>🏛️ Board</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, width: "18%" }}>🔬 Dive</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, width: "18%" }}>⚔️ Stress</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, width: "18%" }}>🤝 Table</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meta.key_dimensions.map((dim: KeyDimension, idx: number) => (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--rule)" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--charcoal)", lineHeight: 1.4 }}>
                              {dim.question}
                            </td>
                            {(["consensus-board", "deep-dive", "stress-tester", "round-table"] as const).map((sid) => {
                              const pos = dim.positions?.[sid];
                              const stance = pos?.stance || "—";
                              const stanceColor = stance === "for" ? "var(--teal)" : stance === "against" ? "var(--claret)" : stance === "modify" ? "#b8860b" : stance === "defer" ? "#6366f1" : "var(--grey-light)";
                              const stanceBg = stance === "for" ? "rgba(0,128,128,0.08)" : stance === "against" ? "rgba(180,50,50,0.08)" : stance === "modify" ? "rgba(184,134,11,0.08)" : stance === "defer" ? "rgba(99,102,241,0.08)" : "transparent";
                              return (
                                <td key={sid} style={{ padding: "6px 8px", textAlign: "center" }} title={pos?.reason || ""}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    borderRadius: "10px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                    color: stanceColor,
                                    background: stanceBg,
                                  }}>
                                    {stance}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--grey-light)", marginTop: "6px", fontStyle: "italic" }}>
                    Hover over a cell to see the strategy&apos;s reasoning
                  </p>
                </div>
              )}

              {/* ── Convergence / Divergence / Blind Spots ─────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
                {meta.convergence_points && meta.convergence_points.length > 0 && (
                  <div style={{ padding: "12px 14px", background: "rgba(0,128,128,0.04)", border: "1px solid rgba(0,128,128,0.15)" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--teal)", marginBottom: "8px" }}>
                      ✓ All strategies agree
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "13px", lineHeight: 1.6, color: "var(--charcoal)" }}>
                      {meta.convergence_points.map((p: string, i: number) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {meta.divergence_points && meta.divergence_points.length > 0 && (
                  <div style={{ padding: "12px 14px", background: "rgba(184,134,11,0.04)", border: "1px solid rgba(184,134,11,0.15)" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#b8860b", marginBottom: "8px" }}>
                      ⚡ Points of divergence
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "13px", lineHeight: 1.6, color: "var(--charcoal)" }}>
                      {meta.divergence_points.map((p: string, i: number) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {meta.blind_spots && meta.blind_spots.length > 0 && (
                <div style={{ padding: "12px 14px", marginBottom: "24px", background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6366f1", marginBottom: "8px" }}>
                    🔎 Blind spots — found by only one strategy
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "13px", lineHeight: 1.6, color: "var(--charcoal)" }}>
                    {meta.blind_spots.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Meta Recommendation (narrative) ──────────────── */}
              <div className="section-label">Meta-synthesis</div>
              {meta.meta_verdict_rationale && (
                <p style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.5, marginBottom: "16px", color: "var(--charcoal)" }}>
                  {meta.meta_verdict_rationale}
                </p>
              )}
              <div className="prose" style={{ marginBottom: "32px" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {meta.meta_recommendation || ""}
                </ReactMarkdown>
              </div>

              {/* ── Child Strategy Reports (drill-down) ──────────── */}
              {allAnglesData.childJobIds && allAnglesData.childJobIds.length > 0 && (
                <ChildStrategyReports childJobIds={allAnglesData.childJobIds} />
              )}
            </div>
          );
        }

        // Standard single-strategy report
        return (
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "24px" }}>
            {/* Report header with reasoning toggle */}
            <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
              <div className="section-label" style={{ marginBottom: 0 }}>Final report</div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: showReasoning ? "var(--teal)" : "var(--grey-light)",
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "color 0.2s",
                }}
              >
                <input
                  type="checkbox"
                  checked={showReasoning}
                  onChange={(e) => setShowReasoning(e.target.checked)}
                  style={{ width: "13px", height: "13px", accentColor: "var(--teal)", cursor: "pointer" }}
                />
                Show reasoning
              </label>
            </div>

            {/* Export action bar */}
            <CopyBar
              jobId={jobId}
              challenge={job.challenge || ""}
              strategyId={job.strategyId || ""}
              report={job.report}
              showReasoning={showReasoning}
              reasoningTraces={reasoningTraces}
            />

            {/* Reasoning traces panel */}
            {showReasoning && <ReasoningPanel traces={reasoningTraces} loaded={reasoningLoaded} expandedTraces={expandedTraces} toggleTrace={toggleTrace} />}

            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {job.report}
              </ReactMarkdown>
            </div>
          </div>
        );
      })()}

      {/* Back to advisor CTA when done */}
      {(job.status === "DONE" || job.status === "FAILED") && (
        <div
          style={{
            marginTop: "32px",
            borderTop: "1px solid var(--rule)",
            paddingTop: "16px",
          }}
        >
          <Link
            href="/advisor"
            className="btn btn-primary"
            style={{ textDecoration: "none", borderBottom: "none" }}
          >
            ← Submit another challenge
          </Link>
        </div>
      )}
    </div>
  );
}
