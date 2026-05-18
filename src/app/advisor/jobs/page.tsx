"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface JobSummary {
  id: string;
  challenge: string;
  strategyId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--grey-light)", label: "Pending" },
  RUNNING: { color: "var(--teal)", label: "Running" },
  DONE: { color: "var(--charcoal)", label: "Done" },
  FAILED: { color: "var(--claret)", label: "Failed" },
  CANCELLED: { color: "#d97706", label: "Cancelled" },
};

const STRATEGY_ICONS: Record<string, string> = {
  "consensus-board": "🏛️",
  "deep-dive": "🔬",
  "stress-tester": "⚔️",
  "round-table": "🤝",
  "all-angles": "🔮",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function JobRow({ job, onDelete }: { job: JobSummary; onDelete: (id: string) => void }) {
  const st = STATUS_STYLES[job.status] || STATUS_STYLES.PENDING;
  const isAllAngles = job.strategyId === "all-angles";
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<JobSummary[]>([]);
  const [childrenLoaded, setChildrenLoaded] = useState(false);

  function handleExpand() {
    if (!expanded && !childrenLoaded) {
      // Fetch child jobs from the parent job's report (which contains childJobIds)
      fetch(`/api/advisor/jobs/${job.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.report) {
            try {
              const parsed = JSON.parse(data.report);
              if (parsed.childJobIds) {
                Promise.all(
                  parsed.childJobIds.map((cid: string) =>
                    fetch(`/api/advisor/jobs/${cid}`)
                      .then((r) => r.json())
                      .then((cj) => ({
                        id: cj.id,
                        challenge: cj.challenge,
                        strategyId: cj.strategyId,
                        status: cj.status,
                        createdAt: cj.createdAt,
                        completedAt: cj.completedAt,
                      }))
                      .catch(() => null)
                  )
                ).then((results) => {
                  setChildren(results.filter(Boolean) as JobSummary[]);
                  setChildrenLoaded(true);
                });
              } else {
                setChildrenLoaded(true);
              }
            } catch {
              setChildrenLoaded(true);
            }
          } else {
            setChildrenLoaded(true);
          }
        })
        .catch(() => setChildrenLoaded(true));
    }
    setExpanded(!expanded);
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this job? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/advisor/jobs/${job.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete(job.id);
      } else {
        alert("Failed to delete job.");
      }
    } catch {
      alert("Network error.");
    }
  }

  return (
    <>
      <tr>
        <td>
          <div className="flex items-center" style={{ gap: "6px" }}>
            {isAllAngles && (
              <button
                onClick={handleExpand}
                style={{
                  background: "none",
                  border: "1px solid var(--rule)",
                  borderRadius: "4px",
                  width: "20px",
                  height: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "10px",
                  color: "var(--grey)",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
                title={expanded ? "Collapse child strategies" : "Show child strategies"}
              >
                {expanded ? "−" : "+"}
              </button>
            )}
            <span style={{ fontSize: "14px" }}>
              {job.challenge.length > 80
                ? job.challenge.slice(0, 77) + "..."
                : job.challenge}
            </span>
          </div>
        </td>
        <td style={{ color: "var(--grey)", fontSize: "13px", whiteSpace: "nowrap" }}>
          <span style={{ marginRight: "4px" }}>{STRATEGY_ICONS[job.strategyId] || ""}</span>
          {job.strategyId}
        </td>
        <td>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: st.color,
            }}
          >
            {st.label}
          </span>
        </td>
        <td
          style={{
            fontSize: "12px",
            color: "var(--grey-light)",
            fontFamily: "'Menlo','Consolas',monospace",
          }}
        >
          {formatDate(job.createdAt)}
        </td>
        <td>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Link
              href={`/advisor/jobs/${job.id}`}
              style={{
                fontSize: "12px",
                color: "var(--claret)",
                fontWeight: 500,
              }}
            >
              View →
            </Link>
            <button
              onClick={handleDelete}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                color: "var(--grey-light)",
                padding: "2px",
              }}
              title="Delete job"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>

      {/* Child strategy rows for All Angles */}
      {isAllAngles && expanded && (
        <>
          {!childrenLoaded ? (
            <tr>
              <td colSpan={5} style={{ padding: "6px 0 6px 32px", color: "var(--grey-light)", fontSize: "12px", fontStyle: "italic" }}>
                Loading child strategies...
              </td>
            </tr>
          ) : children.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "6px 0 6px 32px", color: "var(--grey-light)", fontSize: "12px" }}>
                {job.status === "RUNNING" || job.status === "PENDING"
                  ? "Strategies still initialising..."
                  : "No child strategy data available."}
              </td>
            </tr>
          ) : (
            children.map((child) => {
              const cst = STATUS_STYLES[child.status] || STATUS_STYLES.PENDING;
              return (
                <tr key={child.id} style={{ background: "rgba(0,0,0,0.015)" }}>
                  <td style={{ paddingLeft: "32px" }}>
                    <span style={{ fontSize: "13px", color: "var(--grey)" }}>
                      └ {STRATEGY_ICONS[child.strategyId] || ""}{" "}
                      {child.strategyId}
                    </span>
                  </td>
                  <td style={{ color: "var(--grey-light)", fontSize: "12px" }}>
                    child
                  </td>
                  <td>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.05em", color: cst.color,
                    }}>
                      {cst.label}
                    </span>
                  </td>
                  <td style={{
                    fontSize: "12px", color: "var(--grey-light)",
                    fontFamily: "'Menlo','Consolas',monospace",
                  }}>
                    {formatDate(child.createdAt)}
                  </td>
                  <td>
                    <Link
                      href={`/advisor/jobs/${child.id}`}
                      style={{ fontSize: "12px", color: "var(--grey-light)", fontWeight: 500 }}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })
          )}
        </>
      )}
    </>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/advisor/jobs")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data.jobs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 style={{ marginBottom: "8px" }}>Jobs</h1>
      <p style={{ color: "var(--grey)", marginBottom: "24px", fontSize: "16px" }}>
        Past and in-progress analyses.
      </p>

      {loading ? (
        <p style={{ color: "var(--grey-light)", fontStyle: "italic" }}>Loading...</p>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ padding: "32px", textAlign: "center" }}>
          <p style={{ color: "var(--grey)", marginBottom: "12px" }}>
            No jobs yet. Submit your first challenge to get started.
          </p>
          <Link
            href="/advisor"
            className="btn btn-primary"
            style={{ textDecoration: "none", borderBottom: "none" }}
          >
            Submit a challenge →
          </Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Challenge</th>
              <th>Strategy</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <JobRow 
                key={job.id} 
                job={job} 
                onDelete={(id) => setJobs(prev => prev.filter(j => j.id !== id))} 
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
