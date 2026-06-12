"use client";

import React, { useState, useEffect } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DimensionPosition {
  stance: string;
  reason: string;
}

interface KeyDimension {
  question: string;
  positions: Record<string, DimensionPosition>;
}

interface StrategyVerdict {
  strategy_id: string;
  strategy_name: string;
  icon: string;
  verdict: string;
  one_liner: string;
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

// ─── Constants ─────────────────────────────────────────────────────────────────

const STRATEGY_IDS = [
  "consensus-board",
  "deep-dive",
  "stress-tester",
  "round-table",
] as const;

/** Colors per strategy for radar polygon fills / legend dots */
const STRATEGY_COLORS: Record<string, string> = {
  "consensus-board": "#4A9EAF",
  "deep-dive": "#8B5CF6",
  "stress-tester": "#EF4444",
  "round-table": "#22C55E",
};

/** Short display names with emoji icons */
const STRATEGY_SHORT: Record<string, string> = {
  "consensus-board": "🏛️ Board",
  "deep-dive": "🔬 Dive",
  "stress-tester": "⚔️ Stress",
  "round-table": "🤝 Table",
};

/** Map verdict labels to solid + background colors */
const VERDICT_COLORS: Record<string, { solid: string; bg: string }> = {
  GO:      { solid: "var(--teal)",   bg: "rgba(0,128,128,0.12)" },
  MODIFY:  { solid: "#b8860b",      bg: "rgba(184,134,11,0.12)" },
  HOLD:    { solid: "#6366f1",      bg: "rgba(99,102,241,0.12)" },
  "NO-GO": { solid: "var(--claret)", bg: "rgba(180,50,50,0.12)" },
};

/** Map stance text to a numeric radius for the radar chart (0..1) */
const STANCE_RADIUS: Record<string, number> = {
  for: 1.0,
  modify: 0.66,
  defer: 0.33,
  against: 0.0,
};

/** Map stance text to indicator colors */
const STANCE_COLORS: Record<string, { fill: string; label: string }> = {
  for:     { fill: "var(--teal)",   label: "var(--teal)" },
  against: { fill: "var(--claret)", label: "var(--claret)" },
  modify:  { fill: "#b8860b",      label: "#b8860b" },
  defer:   { fill: "transparent",  label: "var(--grey)" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Section header - small uppercase label above each visualization */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--grey)",
        marginBottom: "10px",
        fontFamily: "var(--font-display)",
      }}
    >
      {children}
    </div>
  );
}

/** Truncate a string to `max` chars, adding ellipsis if needed */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}

/** Convert polar (angle in radians, radius 0..1) to SVG x,y */
function polar(
  angleRad: number,
  radiusFraction: number,
  cx: number,
  cy: number,
  maxR: number
): [number, number] {
  const r = radiusFraction * maxR;
  // Start from top (subtract PI/2 so first spoke points up)
  const x = cx + r * Math.cos(angleRad - Math.PI / 2);
  const y = cy + r * Math.sin(angleRad - Math.PI / 2);
  return [x, y];
}

// ─── Section 1: Verdict Comparison Bar ─────────────────────────────────────────

function VerdictComparisonBar({ meta }: { meta: MetaSynthesis }) {
  // Group verdicts by type and preserve ordering
  const verdictOrder = ["GO", "MODIFY", "HOLD", "NO-GO"];
  const groups: Record<string, StrategyVerdict[]> = {};
  for (const v of verdictOrder) groups[v] = [];
  for (const sv of meta.strategy_verdicts) {
    const key = sv.verdict.toUpperCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(sv);
  }

  const total = meta.strategy_verdicts.length || 1;

  return (
    <div style={{ marginBottom: "28px" }}>
      <SectionLabel>Verdict comparison</SectionLabel>

      {/* Stacked bar */}
      <div
        style={{
          display: "flex",
          height: "60px",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid var(--rule)",
          background: "var(--white)",
        }}
      >
        {verdictOrder.map((verdict) => {
          const items = groups[verdict];
          if (!items || items.length === 0) return null;
          const pct = (items.length / total) * 100;
          const colors = VERDICT_COLORS[verdict] || VERDICT_COLORS.HOLD;
          return (
            <div
              key={verdict}
              style={{
                width: `${pct}%`,
                background: colors.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                borderRight: "1px solid var(--rule)",
                transition: "width 0.4s ease",
              }}
            >
              {/* Icons row */}
              <div style={{ fontSize: "16px", lineHeight: 1 }}>
                {items.map((sv) => (
                  <span key={sv.strategy_id} title={sv.strategy_name}>
                    {sv.icon}
                  </span>
                ))}
              </div>
              {/* Verdict label + count */}
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: colors.solid,
                  letterSpacing: "0.04em",
                }}
              >
                {verdict} ({items.length})
              </div>
            </div>
          );
        })}
      </div>

      {/* Meta verdict badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "10px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 18px",
            borderRadius: "6px",
            background:
              VERDICT_COLORS[meta.meta_verdict]?.bg || "rgba(99,102,241,0.12)",
            color:
              VERDICT_COLORS[meta.meta_verdict]?.solid || "#6366f1",
            fontSize: "13px",
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            letterSpacing: "0.03em",
          }}
        >
          <span style={{ fontSize: "10px", opacity: 0.7 }}>META</span>
          {meta.meta_verdict}
        </div>
      </div>
    </div>
  );
}

// ─── Section 2: Strategy Radar Chart (SVG) ─────────────────────────────────────

function StrategyRadarChart({ meta }: { meta: MetaSynthesis }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const dims = meta.key_dimensions;
  const n = dims.length;
  if (n < 3) return null; // need at least 3 spokes

  const CX = 150;
  const CY = 150;
  const MAX_R = 120;
  const angleStep = (2 * Math.PI) / n;

  // Build polygon points for each strategy
  const polygons = STRATEGY_IDS.map((sid) => {
    const pts = dims.map((dim, i) => {
      const stance = dim.positions?.[sid]?.stance || "defer";
      const r = STANCE_RADIUS[stance] ?? 0.33;
      return polar(i * angleStep, r, CX, CY, MAX_R);
    });
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
    return { sid, d, color: STRATEGY_COLORS[sid] };
  });

  // Guide circles at 0.33, 0.66, 1.0
  const guideRadii = [0.33, 0.66, 1.0];

  return (
    <div style={{ marginBottom: "28px" }}>
      <SectionLabel>Strategy radar</SectionLabel>

      <div
        style={{
          background: "var(--white)",
          border: "1px solid var(--rule)",
          borderRadius: "8px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: "380px" }}>
          {/* Guide circles */}
          {guideRadii.map((r) => (
            <circle
              key={r}
              cx={CX}
              cy={CY}
              r={MAX_R * r}
              fill="none"
              stroke="var(--rule)"
              strokeWidth={r === 1 ? 1.2 : 0.7}
              strokeDasharray={r < 1 ? "3,3" : "none"}
            />
          ))}

          {/* Spokes */}
          {dims.map((_, i) => {
            const [ex, ey] = polar(i * angleStep, 1, CX, CY, MAX_R);
            return (
              <line
                key={i}
                x1={CX}
                y1={CY}
                x2={ex}
                y2={ey}
                stroke="var(--rule)"
                strokeWidth={0.7}
              />
            );
          })}

          {/* Strategy polygons */}
          {polygons.map(({ sid, d, color }) => (
            <path
              key={sid}
              d={d}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeWidth={1.8}
              strokeLinejoin="round"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "scale(1)" : "scale(0)",
                transformOrigin: `${CX}px ${CY}px`,
                transition: "opacity 0.5s ease, transform 0.5s ease",
              }}
            />
          ))}

          {/* Spoke labels */}
          {dims.map((dim, i) => {
            const [lx, ly] = polar(i * angleStep, 1.18, CX, CY, MAX_R);
            // Determine text-anchor based on position
            const angle = i * angleStep - Math.PI / 2;
            const cosA = Math.cos(angle);
            const anchor =
              Math.abs(cosA) < 0.15
                ? "middle"
                : cosA > 0
                  ? "start"
                  : "end";
            return (
              <text
                key={i}
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="central"
                style={{
                  fontSize: "8px",
                  fill: "var(--grey)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                }}
              >
                {truncate(dim.question, 28)}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "14px",
            justifyContent: "center",
            marginTop: "8px",
          }}
        >
          {STRATEGY_IDS.map((sid) => (
            <div
              key={sid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "var(--charcoal)",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: STRATEGY_COLORS[sid],
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {STRATEGY_SHORT[sid]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section 3: Enhanced Stance Heatmap ────────────────────────────────────────

function StanceHeatmap({ meta }: { meta: MetaSynthesis }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div style={{ marginBottom: "28px" }}>
      <SectionLabel>Stance heatmap</SectionLabel>

      <div
        style={{
          background: "var(--white)",
          border: "1px solid var(--rule)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr repeat(4, 48px) 52px",
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "2px solid var(--rule)",
            gap: "4px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--grey)",
            }}
          >
            Dimension
          </div>
          {STRATEGY_IDS.map((sid) => (
            <div
              key={sid}
              style={{
                fontSize: "14px",
                textAlign: "center",
              }}
              title={STRATEGY_SHORT[sid]}
            >
              {STRATEGY_SHORT[sid].split(" ")[0]}
            </div>
          ))}
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--grey)",
              textAlign: "center",
            }}
          >
            Agree
          </div>
        </div>

        {/* Data rows */}
        {meta.key_dimensions.map((dim, idx) => {
          const isOpen = expanded.has(idx);

          // Compute agreement percentage
          const stances = STRATEGY_IDS.map(
            (sid) => dim.positions?.[sid]?.stance || "defer"
          );
          const counts: Record<string, number> = {};
          for (const s of stances) counts[s] = (counts[s] || 0) + 1;
          const maxCount = Math.max(...Object.values(counts));
          const agreePct = Math.round((maxCount / STRATEGY_IDS.length) * 100);

          // Row tint
          const rowBg =
            agreePct === 100
              ? "rgba(0,128,128,0.04)"
              : agreePct <= 50
                ? "rgba(184,134,11,0.04)"
                : "transparent";

          return (
            <React.Fragment key={idx}>
              <div
                onClick={() => toggle(idx)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr repeat(4, 48px) 52px",
                  alignItems: "center",
                  padding: "10px 12px",
                  gap: "4px",
                  borderBottom: isOpen ? "none" : "1px solid var(--rule)",
                  background: rowBg,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                {/* Dimension question */}
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--charcoal)",
                    lineHeight: 1.4,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "8px",
                      color: "var(--grey-light)",
                      transition: "transform 0.15s",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  >
                    ▶
                  </span>
                  {dim.question}
                </div>

                {/* Stance circles */}
                {STRATEGY_IDS.map((sid) => {
                  const stance = dim.positions?.[sid]?.stance || "defer";
                  const colors = STANCE_COLORS[stance] || STANCE_COLORS.defer;
                  const isDefer = stance === "defer";
                  return (
                    <div
                      key={sid}
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                      title={`${STRATEGY_SHORT[sid]}: ${stance}`}
                    >
                      <span
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: isDefer ? "transparent" : colors.fill,
                          border: isDefer
                            ? "2px solid var(--grey-light)"
                            : "none",
                          display: "inline-block",
                        }}
                      />
                    </div>
                  );
                })}

                {/* Agreement % */}
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textAlign: "center",
                    color:
                      agreePct === 100
                        ? "var(--teal)"
                        : agreePct <= 50
                          ? "var(--claret)"
                          : "var(--charcoal)",
                  }}
                >
                  {agreePct}%
                </div>
              </div>

              {/* Expanded reasoning panel */}
              {isOpen && (
                <div
                  style={{
                    padding: "0 12px 12px",
                    background: rowBg,
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "6px",
                    }}
                  >
                    {STRATEGY_IDS.map((sid) => {
                      const pos = dim.positions?.[sid];
                      const stance = pos?.stance || "defer";
                      const reason = pos?.reason;
                      if (!reason) return null;
                      const colors =
                        STANCE_COLORS[stance] || STANCE_COLORS.defer;
                      return (
                        <div
                          key={sid}
                          style={{
                            padding: "8px 10px",
                            background: "var(--white)",
                            border: "1px solid var(--rule)",
                            borderRadius: "4px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: colors.label,
                              textTransform: "uppercase",
                              marginBottom: "3px",
                              letterSpacing: "0.03em",
                            }}
                          >
                            {STRATEGY_SHORT[sid]} &middot; {stance}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--grey)",
                              lineHeight: 1.5,
                            }}
                          >
                            {reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Legend below heatmap */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          marginTop: "8px",
          fontSize: "10px",
          color: "var(--grey)",
        }}
      >
        {(["for", "modify", "defer", "against"] as const).map((stance) => {
          const isDefer = stance === "defer";
          const colors = STANCE_COLORS[stance];
          return (
            <div
              key={stance}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: isDefer ? "transparent" : colors.fill,
                  border: isDefer ? "2px solid var(--grey-light)" : "none",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {stance}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section 4: Strategy Pair Similarity Matrix ────────────────────────────────

function SimilarityMatrix({ meta }: { meta: MetaSynthesis }) {
  const n = STRATEGY_IDS.length;
  const dims = meta.key_dimensions;
  const totalDims = dims.length || 1;

  // Precompute pairwise agreement
  const agreement = (a: string, b: string): number => {
    let same = 0;
    for (const dim of dims) {
      const sa = dim.positions?.[a]?.stance || "defer";
      const sb = dim.positions?.[b]?.stance || "defer";
      if (sa === sb) same++;
    }
    return same / totalDims;
  };

  // Build matrix
  const matrix: number[][] = [];
  for (let r = 0; r < n; r++) {
    matrix[r] = [];
    for (let c = 0; c < n; c++) {
      matrix[r][c] = agreement(STRATEGY_IDS[r], STRATEGY_IDS[c]);
    }
  }

  /** Map a 0..1 agreement score to a background color */
  const cellBg = (score: number): string => {
    if (score >= 0.8) return "rgba(0,128,128,0.15)";
    if (score >= 0.6) return "rgba(0,128,128,0.08)";
    if (score >= 0.4) return "rgba(184,134,11,0.08)";
    return "rgba(180,50,50,0.08)";
  };
  const cellColor = (score: number): string => {
    if (score >= 0.8) return "var(--teal)";
    if (score >= 0.6) return "var(--charcoal)";
    if (score >= 0.4) return "#b8860b";
    return "var(--claret)";
  };

  return (
    <div style={{ marginBottom: "28px" }}>
      <SectionLabel>Pairwise agreement</SectionLabel>

      <div
        style={{
          background: "var(--white)",
          border: "1px solid var(--rule)",
          borderRadius: "8px",
          overflow: "auto",
          padding: "12px",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            maxWidth: "420px",
            margin: "0 auto",
          }}
        >
          <thead>
            <tr>
              {/* Empty top-left cell */}
              <th style={{ width: "64px" }} />
              {STRATEGY_IDS.map((sid) => (
                <th
                  key={sid}
                  style={{
                    padding: "4px 6px 8px",
                    fontSize: "14px",
                    textAlign: "center",
                    fontWeight: 400,
                  }}
                  title={STRATEGY_SHORT[sid]}
                >
                  {STRATEGY_SHORT[sid].split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STRATEGY_IDS.map((rowSid, r) => (
              <tr key={rowSid}>
                {/* Row header */}
                <td
                  style={{
                    padding: "6px 8px",
                    fontSize: "14px",
                    textAlign: "center",
                  }}
                  title={STRATEGY_SHORT[rowSid]}
                >
                  {STRATEGY_SHORT[rowSid].split(" ")[0]}
                </td>

                {STRATEGY_IDS.map((colSid, c) => {
                  // Diagonal - show strategy colored dot
                  if (r === c) {
                    return (
                      <td
                        key={colSid}
                        style={{
                          padding: "6px",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            background: STRATEGY_COLORS[rowSid],
                          }}
                        />
                      </td>
                    );
                  }

                  // Upper triangle - empty
                  if (c > r) {
                    return (
                      <td
                        key={colSid}
                        style={{ padding: "6px" }}
                      />
                    );
                  }

                  // Lower triangle - show agreement
                  const score = matrix[r][c];
                  const pct = Math.round(score * 100);
                  return (
                    <td
                      key={colSid}
                      style={{
                        padding: "6px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "48px",
                          height: "32px",
                          borderRadius: "6px",
                          background: cellBg(score),
                          color: cellColor(score),
                          fontSize: "12px",
                          fontWeight: 700,
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {pct}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AllAnglesVisualView({
  meta,
}: {
  meta: MetaSynthesis;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* 1. Verdict Comparison Bar */}
      <VerdictComparisonBar meta={meta} />

      {/* 2. Strategy Radar Chart */}
      {meta.key_dimensions && meta.key_dimensions.length >= 3 && (
        <StrategyRadarChart meta={meta} />
      )}

      {/* 3. Enhanced Stance Heatmap */}
      {meta.key_dimensions && meta.key_dimensions.length > 0 && (
        <StanceHeatmap meta={meta} />
      )}

      {/* 4. Strategy Pair Similarity Matrix */}
      {meta.key_dimensions && meta.key_dimensions.length > 0 && (
        <SimilarityMatrix meta={meta} />
      )}
    </div>
  );
}
