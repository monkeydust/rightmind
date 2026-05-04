"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { StrategyDiagram } from "@/components/StrategyDiagram";

interface AgentInfo { role: string; model: string; color: string; phase?: string; }
interface JudgeInfo { role: string; model: string; color: string; }
interface ArxivPaper { title: string; url: string; insight: string; }

interface StrategyDetail {
  id: string;
  name: string;
  icon: string;
  description: string;
  bestFor: string;
  workflow: string;
  maxRounds?: number;
  maxSubTasks?: number;
  consensusThreshold?: number;
  estimatedCost: { instant: string; overnight: string };
  estimatedLatency: { instant: string; overnight: string };
  arxivPapers: ArxivPaper[];
  agents: AgentInfo[];
  judge: JudgeInfo;
  content: string;
}

const WORKFLOW_LABELS: Record<string, string> = {
  parallel_aggregate: "Parallel → Aggregate",
  sequential_debate: "Sequential Debate (2 rounds)",
  multi_round_consensus: "Multi-Round Consensus (up to 3 rounds)",
  manager_worker: "Manager → Workers → Review",
};

function modelShort(m: string) { return m.split("/").pop() || m; }
function provider(m: string) {
  const p = m.split("/")[0];
  return { anthropic: "Anthropic", openai: "OpenAI", google: "Google", deepseek: "DeepSeek" }[p] || p;
}

export default function StrategyDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [s, setS] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/advisor/strategies/${id}`)
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then((d) => { setS(d.strategy); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="page" style={{ color: "var(--grey-light)", fontStyle: "italic" }}>Loading...</div>
  );

  if (error || !s) return (
    <div className="page">
      <p style={{ color: "var(--claret)", marginBottom: "12px" }}>{error || "Strategy not found"}</p>
      <Link href="/advisor">← Back</Link>
    </div>
  );

  return (
    <div className="page">
      {/* Back */}
      <div style={{ marginBottom: "20px" }}>
        <Link href="/advisor" style={{ fontSize: "13px", color: "var(--grey)", borderBottom: "none" }}>
          ← Back to advisor
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <span className="topic-tag" style={{ display: "inline-block", marginBottom: "8px" }}>
          {WORKFLOW_LABELS[s.workflow] || s.workflow}
        </span>
        <h1 style={{ marginBottom: "6px" }}>
          <span style={{ marginRight: "8px" }}>{s.icon}</span>{s.name}
        </h1>
        <p style={{ fontSize: "18px", color: "var(--grey)", lineHeight: 1.5, fontFamily: "var(--font-text)" }}>
          {s.description}
        </p>
      </div>

      {/* Workflow diagram (full size) */}
      <div className="mb-24" style={{ borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", padding: "16px 0" }}>
        <div className="section-label">How agents interact</div>
        <StrategyDiagram
          workflow={s.workflow}
          agents={s.agents.map((a) => ({ role: a.role, color: a.color }))}
          judgeColor={s.judge.color}
          size="full"
        />
      </div>

      {/* Key facts */}
      <div className="grid-4 mb-24">
        <div className="card">
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--grey-light)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
            Best for
          </div>
          <div style={{ fontSize: "14px", color: "var(--charcoal)", lineHeight: 1.5 }}>
            {s.bestFor}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--grey-light)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
            Cost
          </div>
          <div style={{ fontSize: "14px", color: "var(--charcoal)" }}>
            <div>⚡ {s.estimatedCost.instant}</div>
            <div>💤 {s.estimatedCost.overnight}</div>
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--grey-light)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
            Latency
          </div>
          <div style={{ fontSize: "14px", color: "var(--charcoal)" }}>
            <div>⚡ {s.estimatedLatency.instant}</div>
            <div>💤 {s.estimatedLatency.overnight}</div>
          </div>
        </div>
      </div>

      {/* Agents table */}
      <div className="mb-24">
        <div className="section-label">Agents &amp; models</div>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Provider</th>
              <th>Model</th>
              {s.agents.some((a) => a.phase) && <th>Phase</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {s.agents.map((a) => (
              <tr key={a.role}>
                <td>
                  <span className="flex items-center gap-8">
                    <span style={{ width: "6px", height: "6px", background: a.color, display: "inline-block" }} />
                    <strong>{a.role}</strong>
                  </span>
                </td>
                <td style={{ color: "var(--grey)" }}>{provider(a.model)}</td>
                <td style={{ fontFamily: "'Menlo','Consolas',monospace", fontSize: "13px" }}>{modelShort(a.model)}</td>
                {s.agents.some((ag) => ag.phase) && <td style={{ color: "var(--grey)" }}>{a.phase || "—"}</td>}
                <td></td>
              </tr>
            ))}
            <tr>
              <td>
                <span className="flex items-center gap-8">
                  <span style={{ width: "6px", height: "6px", background: s.judge.color, display: "inline-block" }} />
                  <strong>{s.judge.role}</strong>
                  <span className="topic-tag" style={{ marginLeft: "4px", fontSize: "9px" }}>JUDGE</span>
                </span>
              </td>
              <td style={{ color: "var(--grey)" }}>{provider(s.judge.model)}</td>
              <td style={{ fontFamily: "'Menlo','Consolas',monospace", fontSize: "13px" }}>{modelShort(s.judge.model)}</td>
              {s.agents.some((a) => a.phase) && <td style={{ color: "var(--grey)" }}>synthesis</td>}
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Markdown */}
      {s.content && (
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "24px" }}>
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Research — reference material */}
      {s.arxivPapers.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div className="section-label">Research and evidence base</div>
          {s.arxivPapers.map((p) => (
            <div key={p.url} style={{ marginBottom: "10px" }}>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--claret)", fontWeight: 600, fontSize: "15px" }}
              >
                {p.title}
              </a>
              <p style={{ fontSize: "14px", color: "var(--grey)", margin: "2px 0 0", lineHeight: 1.5 }}>
                {p.insight}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={{ marginTop: "32px", borderTop: "1px solid var(--rule)", paddingTop: "16px" }}>
        <Link href="/advisor" className="btn btn-primary" style={{ textDecoration: "none", borderBottom: "none" }}>
          Use this strategy →
        </Link>
      </div>
    </div>
  );
}
