"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StrategyDiagram } from "@/components/StrategyDiagram";

interface AgentSummary {
  role: string;
  model: string;
  color: string;
  systemPrompt?: string;
}

interface StrategySummary {
  id: string;
  name: string;
  icon: string;
  description: string;
  bestFor: string;
  workflow: string;
  estimatedCost: { instant: string; overnight: string };
  estimatedLatency: { instant: string; overnight: string };
  agentCount: number;
  agents: AgentSummary[];
  judge?: { role: string; color: string; systemPrompt?: string };
  arxivPapers: { title: string; url: string; insight: string }[];
}

const WORKFLOW_LABELS: Record<string, string> = {
  parallel_aggregate: "Parallel → Aggregate",
  sequential_debate: "Sequential Debate",
  multi_round_consensus: "Multi-Round Consensus",
  manager_worker: "Manager → Workers → Review",
};

/* ─── Fable placeholders (random on each load) ────────────── */
const FABLE_PLACEHOLDERS = [
  "I'm a tortoise who's been challenged to a race by a hare. He's significantly faster than me but notoriously overconfident. The whole forest is watching and I've got my life savings riding on the outcome. Should I accept the race, and if so, what's my strategy?",
  "I'm a king and two women have come to my court, both claiming to be the mother of the same baby. One of them is lying but I have no witnesses, no documents, and no DNA testing. My entire reputation as a just ruler depends on getting this right. How do I determine the truth?",
  "I'm a shepherd boy and I've been crying wolf to get attention from the villagers. It's worked three times now, but I've noticed the response time getting slower each time. The problem is, I've actually spotted what I think are real wolf tracks near my flock this morning. How do I rebuild credibility fast enough to save my sheep?",
  "I'm a pig and I need to build a house. My two brothers went with straw and sticks because they're cheap and fast, but there's a wolf in the area who's been making threats. I'm considering bricks but my brothers say I'm overthinking it and wasting money. What's the right level of investment in defence given the threat?",
  "I'm a Greek general and we've been besieging Troy for 10 years with no result. My army is exhausted, morale is collapsing, and the supply lines are strained. An engineer has proposed building a giant wooden horse and hiding soldiers inside as a gift. It sounds insane but conventional approaches have failed. Should I take the gamble?",
  "I'm an ant who's been working all summer stockpiling food while my neighbour the grasshopper plays music and mocks my work ethic. Winter is coming and he's now asking me to share my supplies. If I help him, I risk running short. If I refuse, he might not survive. But he also has a network of friends who could be useful allies in spring. What should I do?",
  "I'm a young boy at a royal parade and I can clearly see the Emperor has no clothes on, but every adult around me is praising the outfit. My parents are nudging me to stay quiet. If I speak up, I'll either be a hero or publicly humiliated. There's also a chance the Emperor already knows and this is some kind of loyalty test. Should I say something?",
  "I found a monkey's paw that grants three wishes, but every wish comes with a terrible unintended consequence. I've already used one wish for money and a family member died in an accident, with the insurance payout being the exact amount I wished for. I have two wishes left. Is there any way to use them safely, or should I destroy the paw?",
  "I'm a farmer and I own a goose that lays a golden egg every single day. The eggs sell for a fortune but my neighbour reckons there must be a huge lump of gold inside the goose. He's offering to buy the goose and split whatever's inside 50/50. My wife thinks we should keep the goose but I'm worried someone will steal it. What's my optimal strategy?",
  "I run a ship that's been sailing for decades, and over the years I've replaced every single plank, nail, and sail. My crew is now asking whether this is still the same ship. It matters because our trading licence, insurance, and reputation are all tied to the ship's name and identity. A rival captain has built a ship from all my old parts and claims HIS is the original. How do I resolve this?",
];

/* ─── Animated dots for loading states ──────────────────────── */

function AnimatedDots() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <span style={{ display: "inline-block", width: "16px", textAlign: "left" }}>{".".repeat(dots)}</span>;
}

/* ─── Refine Question Types ────────────────────────────────── */
interface RefineQuestion {
  id: string;
  question: string;
  type: "multi" | "yesno" | "scale";
  options: string[];
  multiSelect?: boolean;
}

interface RefineAnswer {
  id: string;
  question: string;
  selected: string[];
  detail?: string;
}

/* ─── Challenge Section with Inline Refiner ────────────────── */
function ChallengeSection({
  challenge,
  setChallenge,
  examples,
  onRecommendation,
  placeholder,
}: {
  challenge: string;
  setChallenge: (v: string) => void;
  examples: { label: string; text: string; onSelect?: () => void }[];
  onRecommendation?: (strategyId: string, rationale: string) => void;
  placeholder: string;
}) {
  const [refineState, setRefineState] = useState<
    "idle" | "loading" | "questions" | "synthesising" | "preview" | "done"
  >("idle");
  const [questions, setQuestions] = useState<RefineQuestion[]>([]);
  const [answers, setAnswers] = useState<RefineAnswer[]>([]);
  const [error, setError] = useState("");
  const [refinedPreview, setRefinedPreview] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Auto-size when challenge changes externally (examples, refine accept)
  useEffect(() => { setTimeout(autoSize, 0); }, [challenge, autoSize]);

  function resetRefiner() {
    setRefineState("idle");
    setQuestions([]);
    setAnswers([]);
    setError("");
    setRefinedPreview("");
  }

  async function handleRefine() {
    if (!challenge.trim()) return;
    setRefineState("loading");
    setError("");
    try {
      const res = await fetch("/api/advisor/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "questions", challenge: challenge.trim() }),
      });
      const data = await res.json();
      if (data.questions?.length) {
        setQuestions(data.questions);
        setAnswers(data.questions.map((q: RefineQuestion) => ({
          id: q.id,
          question: q.question,
          selected: [],
        })));
        setRefineState("questions");
      } else {
        setError("Couldn't generate questions. Try adding more detail.");
        setRefineState("idle");
      }
    } catch {
      setError("Network error. Please retry.");
      setRefineState("idle");
    }
  }

  function toggleOption(qId: string, option: string, multiSelect?: boolean) {
    setAnswers((prev) =>
      prev.map((a) => {
        if (a.id !== qId) return a;
        if (multiSelect) {
          const has = a.selected.includes(option);
          return { ...a, selected: has ? a.selected.filter((s) => s !== option) : [...a.selected, option] };
        }
        return { ...a, selected: a.selected[0] === option ? [] : [option] };
      })
    );
  }

  function setDetail(qId: string, detail: string) {
    setAnswers((prev) =>
      prev.map((a) => (a.id === qId ? { ...a, detail } : a))
    );
  }

  async function handleSynthesise() {
    setRefineState("synthesising");
    try {
      const res = await fetch("/api/advisor/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "synthesise",
          challenge: challenge.trim(),
          answers: answers.filter((a) => a.selected.length > 0),
        }),
      });
      const data = await res.json();
      if (data.refined) {
        setRefinedPreview(data.refined);
        setRefineState("preview");
        if (data.recommended_strategy && onRecommendation) {
          onRecommendation(data.recommended_strategy, data.rationale || "");
        }
      } else {
        setError("Synthesis failed. Try again.");
        setRefineState("questions");
      }
    } catch {
      setError("Network error. Please retry.");
      setRefineState("questions");
    }
  }

  const answeredCount = answers.filter((a) => a.selected.length > 0).length;

  /** Render text with [[brackets]] as highlighted spans */
  function renderHighlighted(text: string) {
    const parts = text.split(/(\[\[.*?\]\])/g);
    return parts.map((part, i) => {
      if (part.startsWith("[[") && part.endsWith("]]")) {
        return (
          <span
            key={i}
            style={{
              background: "rgba(0,128,128,0.10)",
              borderRadius: "2px",
              padding: "0 2px",
            }}
          >
            {part.slice(2, -2)}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  function acceptRefined() {
    // Strip [[brackets]] and set as challenge
    const clean = refinedPreview.replace(/\[\[/g, "").replace(/\]\]/g, "");
    setChallenge(clean);
    setRefineState("done");
    setRefinedPreview("");
    setTimeout(() => setRefineState("idle"), 4000);
  }

  function discardRefined() {
    setRefinedPreview("");
    setRefineState("questions");
  }

  return (
    <div className="mb-24">
      {/* Header row */}
      <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
        <div className="flex items-center" style={{ gap: "10px" }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Your challenge</div>
          {/* Refine button — teal pill */}
          {challenge.trim().length > 10 && refineState === "idle" && (
            <button
              type="button"
              onClick={handleRefine}
              style={{
                padding: "3px 12px",
                fontSize: "11px",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                letterSpacing: "0.03em",
                color: "var(--teal)",
                background: "rgba(13,118,128,0.06)",
                border: "1px solid rgba(13,118,128,0.3)",
                borderRadius: "14px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(13,118,128,0.12)";
                e.currentTarget.style.borderColor = "var(--teal)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(13,118,128,0.06)";
                e.currentTarget.style.borderColor = "rgba(13,118,128,0.3)";
              }}
            >
              ✦ Refine
            </button>
          )}
          {refineState === "done" && (
            <span style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 600 }}>
              ✓ Refined
            </span>
          )}
          {(refineState === "loading" || refineState === "synthesising") && (
            <span style={{ fontSize: "13px", color: "var(--teal)", fontWeight: 600 }}>
              {refineState === "loading" ? "Analysing" : "Crafting"}
              <AnimatedDots />
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => { setChallenge(ex.text); resetRefiner(); if (ex.onSelect) ex.onSelect(); }}
              style={{
                padding: "3px 10px",
                fontSize: "11px",
                fontFamily: "var(--font-text)",
                border: "1px solid var(--rule)",
                borderRadius: "12px",
                background: challenge === ex.text ? "var(--charcoal)" : "var(--white)",
                color: challenge === ex.text ? "var(--white)" : "var(--grey)",
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea with auto-size + clear/paste */}
      <div style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          id="challenge-input"
          className="textarea"
          placeholder={placeholder}
          value={challenge}
          onChange={(e) => { setChallenge(e.target.value); if (refineState === "done") setRefineState("idle"); autoSize(); }}
          style={{ resize: "none", minHeight: "80px", overflow: "hidden", paddingRight: "60px" }}
        />
        {/* Discreet action buttons */}
        <div style={{ position: "absolute", bottom: "8px", right: "8px", display: "flex", gap: "2px" }}>
          {!challenge && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) { setChallenge(text); setTimeout(autoSize, 0); }
                } catch { /* clipboard denied */ }
              }}
              title="Paste from clipboard"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--grey-light)", padding: "2px 4px", opacity: 0.5, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "0.5"}
            >
              📋
            </button>
          )}
          {challenge.length > 0 && (
            <button
              type="button"
              onClick={() => { setChallenge(""); resetRefiner(); setTimeout(autoSize, 0); }}
              title="Clear"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--grey-light)", padding: "2px 4px", opacity: 0.5, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "0.5"}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── Refined Preview with highlights ──────────────── */}
      {refineState === "preview" && refinedPreview && (
        <div
          style={{
            marginTop: "10px",
            padding: "14px 16px",
            border: "1px solid var(--teal)",
            borderRadius: "6px",
            background: "var(--white)",
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Refined challenge
            </span>
            <span style={{ fontSize: "10px", color: "var(--grey-light)" }}>
              Highlighted = new detail from your answers
            </span>
          </div>
          <div
            style={{
              fontSize: "14px",
              lineHeight: 1.7,
              color: "var(--charcoal)",
              fontFamily: "var(--font-text)",
            }}
          >
            {renderHighlighted(refinedPreview)}
          </div>
          <div className="flex items-center justify-end" style={{ marginTop: "12px", gap: "8px" }}>
            <button
              type="button"
              onClick={discardRefined}
              style={{
                background: "none",
                border: "none",
                fontSize: "12px",
                color: "var(--grey)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={acceptRefined}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                background: "var(--teal)",
                color: "var(--white)",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Accept ✓
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: "12px", color: "var(--claret)", marginTop: "6px" }}>{error}</p>
      )}

      {/* ─── Inline Refine Panel ────────────────────────────── */}
      {(refineState === "questions" || refineState === "synthesising") && questions.length > 0 && (
        <div
          style={{
            marginTop: "10px",
            padding: "14px 16px",
            border: "1px solid var(--rule)",
            borderRadius: "6px",
            background: "var(--white)",
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--grey)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Quick refine
            </span>
            <button
              type="button"
              onClick={resetRefiner}
              style={{
                background: "none",
                border: "none",
                fontSize: "11px",
                color: "var(--grey-light)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Cancel
            </button>
          </div>

          {/* Questions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {questions.map((q, qi) => {
              const ans = answers.find((a) => a.id === q.id);
              const showDetail = ans && ans.detail !== undefined && ans.detail !== "";
              return (
                <div key={q.id}>
                  <div style={{ fontSize: "13px", color: "var(--charcoal)", marginBottom: "6px", lineHeight: 1.4 }}>
                    <span style={{ color: "var(--grey-light)", fontSize: "11px", marginRight: "4px" }}>
                      {qi + 1}.
                    </span>
                    {q.question}
                    {q.multiSelect && (
                      <span style={{ fontSize: "10px", color: "var(--grey-light)", marginLeft: "4px" }}>
                        (select any)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap" style={{ gap: "4px" }}>
                    {q.type === "yesno" ? (
                      <>
                        {["Yes", "No"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleOption(q.id, opt.toLowerCase())}
                            style={{
                              padding: "3px 14px",
                              fontSize: "12px",
                              fontFamily: "var(--font-text)",
                              border: "1px solid",
                              borderColor: ans?.selected.includes(opt.toLowerCase()) ? "var(--teal)" : "var(--rule)",
                              borderRadius: "14px",
                              background: ans?.selected.includes(opt.toLowerCase()) ? "rgba(0,128,128,0.08)" : "transparent",
                              color: ans?.selected.includes(opt.toLowerCase()) ? "var(--teal)" : "var(--grey)",
                              cursor: "pointer",
                              transition: "all 0.12s",
                              fontWeight: ans?.selected.includes(opt.toLowerCase()) ? 600 : 400,
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </>
                    ) : (
                      q.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleOption(q.id, opt, q.multiSelect)}
                          style={{
                            padding: "3px 10px",
                            fontSize: "11px",
                            fontFamily: "var(--font-text)",
                            border: "1px solid",
                            borderColor: ans?.selected.includes(opt) ? "var(--teal)" : "var(--rule)",
                            borderRadius: "14px",
                            background: ans?.selected.includes(opt) ? "rgba(0,128,128,0.08)" : "transparent",
                            color: ans?.selected.includes(opt) ? "var(--teal)" : "var(--grey)",
                            cursor: "pointer",
                            transition: "all 0.12s",
                            fontWeight: ans?.selected.includes(opt) ? 600 : 400,
                          }}
                        >
                          {opt}
                        </button>
                      ))
                    )}
                  </div>
                  {/* Add detail — collapsed by default */}
                  {ans?.selected.length ? (
                    showDetail ? (
                      <input
                        type="text"
                        placeholder="Add detail (optional)"
                        value={ans.detail || ""}
                        onChange={(e) => setDetail(q.id, e.target.value)}
                        style={{
                          marginTop: "4px",
                          width: "100%",
                          padding: "4px 8px",
                          fontSize: "11px",
                          border: "1px solid var(--rule)",
                          borderRadius: "4px",
                          color: "var(--charcoal)",
                          fontFamily: "var(--font-text)",
                          background: "transparent",
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDetail(q.id, " ")}
                        style={{
                          marginTop: "3px",
                          background: "none",
                          border: "none",
                          fontSize: "10px",
                          color: "var(--grey-light)",
                          cursor: "pointer",
                          fontFamily: "var(--font-text)",
                          padding: 0,
                        }}
                      >
                        + add detail
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between" style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid var(--rule)" }}>
            <span style={{ fontSize: "11px", color: "var(--grey-light)" }}>
              {answeredCount} of {questions.length} answered
            </span>
            <button
              type="button"
              onClick={handleSynthesise}
              disabled={refineState === "synthesising"}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                background: "var(--charcoal)",
                color: "var(--white)",
                border: "none",
                borderRadius: "4px",
                cursor: refineState === "synthesising" ? "wait" : "pointer",
                opacity: refineState === "synthesising" ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {refineState === "synthesising" ? "Crafting..." : "Generate refined challenge →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdvisorPage() {
  const [fablePlaceholder, setFablePlaceholder] = useState(FABLE_PLACEHOLDERS[0]);
  useEffect(() => {
    setFablePlaceholder(FABLE_PLACEHOLDERS[Math.floor(Math.random() * FABLE_PLACEHOLDERS.length)]);
  }, []);

  const router = useRouter();
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [challenge, setChallenge] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [showPrompts, setShowPrompts] = useState(false);
  const [includeReasoning, setIncludeReasoning] = useState(false);
  const [allAngles, setAllAngles] = useState(false);
  const [demoMode, setDemoMode] = useState<number | null>(null); // index into EXAMPLE_CHALLENGES if a demo is selected
  const [recommendationRationale, setRecommendationRationale] = useState<{ id: string, text: string } | null>(null);

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; data: string; mimeType: string; size: number } | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ACCEPTED_TYPES = [
    "application/pdf",
    "image/png", "image/jpeg", "image/webp", "image/gif",
    "text/plain", "text/csv", "text/markdown",
  ];

  function handleFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      alert(`Unsupported file type: ${file.type}. Supported: PDF, images (PNG/JPG/WebP), text, CSV.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFile({
        name: file.name,
        data: reader.result as string,
        mimeType: file.type,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    fetch("/api/advisor/strategies")
      .then((r) => r.json())
      .then((data) => {
        setStrategies(data.strategies || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const selected = strategies.find((s) => s.id === selectedStrategy);

  function handleSelectStrategy(id: string) {
    setSelectedStrategy(id);
    setAllAngles(false);
    setPromptOverrides({});
    setShowPrompts(false);
    // Clear recommendation rationale if they manually pick something else
    if (recommendationRationale && recommendationRationale.id !== id) {
      setRecommendationRationale(null);
    }
  }

  function handleRecommendation(id: string, rationale: string) {
    if (id === "all-angles") {
      setAllAngles(true);
      setSelectedStrategy(null);
    } else {
      setSelectedStrategy(id);
      setAllAngles(false);
    }
    setRecommendationRationale({ id, text: rationale });
  }

  function handlePromptChange(role: string, value: string) {
    setPromptOverrides((prev) => ({ ...prev, [role]: value }));
  }

  async function handleSubmit() {
    if (!challenge.trim() || (!selectedStrategy && !allAngles)) return;
    setIsSubmitting(true);
    try {
      // Demo mode: fetch pre-seeded job instead of running LLM
      if (demoMode !== null) {
        const res = await fetch("/api/advisor/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demoIndex: demoMode }),
        });
        const data = await res.json();
        if (res.ok && data.jobId) {
          router.push(`/advisor/jobs/${data.jobId}`);
        } else {
          alert(data.error || "Demo failed");
        }
        return;
      }

      const res = await fetch("/api/advisor/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: challenge.trim(),
          strategyId: allAngles ? "all-angles" : selectedStrategy,
          executionMode: "instant",
          promptOverrides: Object.keys(promptOverrides).length > 0 ? promptOverrides : undefined,
          includeReasoning,
          ...(uploadedFile ? {
            fileData: uploadedFile.data,
            fileName: uploadedFile.name,
            mimeType: uploadedFile.mimeType,
          } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.jobId) {
        router.push(`/advisor/jobs/${data.jobId}`);
      } else {
        alert(data.error || "Submit failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setIsSubmitting(false);
    }
  }

  const EXAMPLE_CHALLENGES = [
    {
      label: "🧁 Bristol bakery dilemma",
      text: `I run a small bakery in Bristol with 3 full-time staff. Annual revenue is £180,000 but net profit margins have dropped from 14% two years ago to 8% now — mainly due to ingredient costs rising 22% and a new Greggs opening 200m away that's taken our lunchtime sandwich trade. We still have a loyal base of ~400 regular customers and our sourdough and pastries get 4.8 stars on Google (180 reviews). My lease is up for renewal in 14 months and the landlord has signalled a 15% rent increase. I have £35,000 in savings and could access a £50,000 SEIS-backed loan from a family friend. My partner thinks we should open a second location in Clifton where there's no artisan bakery. My accountant says fix margins first. A local food influencer (28k followers) has offered us a delivery partnership through her platform for 18% commission. What should I do?`,
      demoIndex: 0,
    },
    {
      label: "🏠 London family housing",
      text: `We're a family of 4 (kids aged 3 and 7) currently renting a 2-bed flat in Clapham for £2,400/month. Combined household income is £135,000. We have £120,000 saved for a deposit and my parents have offered to gift us another £80,000, but only if we buy somewhere within 30 minutes of their place in Bromley. Our eldest starts Year 3 in September and the local primary is rated Outstanding — if we move out of catchment we lose the place. My wife works hybrid from Canary Wharf (2 days in office), I'm fully remote. We've been offered a 5-year fixed rate at 4.2% but the broker says rates could drop to 3.5% by Q1 2027 if we wait. The 3-bed houses we want in Clapham start at £750,000 and need £40-60k of work. In Bromley, equivalent houses are £480,000 and move-in ready, but my wife's commute would go from 25 minutes to 55 minutes each way. A colleague suggested we keep renting and invest the deposit in an index fund instead. What's the right move?`,
      demoIndex: 1,
    },
  ];

  return (
    <div className="page">
      {/* ─── Headline ──────────────────────────────────────── */}
      <h1 style={{ marginBottom: "8px" }}>Submit a challenge</h1>
      <p style={{ color: "var(--grey)", marginBottom: "32px", fontSize: "16px" }}>
        Describe your problem, choose an intelligence strategy, and let
        multiple AI models analyse it from every angle.
      </p>

      {/* ─── Challenge ──────────────────────────────────────── */}
      <ChallengeSection
        challenge={challenge}
        setChallenge={(v) => {
          setChallenge(v);
          // If the user edits away from a demo example, clear demo mode
          const isDemo = EXAMPLE_CHALLENGES.some(ex => ex.text === v);
          if (!isDemo) setDemoMode(null);
        }}
        examples={EXAMPLE_CHALLENGES.map((ex) => ({
          label: ex.label,
          text: ex.text,
          onSelect: () => {
            setDemoMode(ex.demoIndex);
            setAllAngles(true);
          },
        }))}
        onRecommendation={handleRecommendation}
        placeholder={fablePlaceholder}
      />

      {/* ─── File Upload ─────────────────────────────────────── */}
      <div className="mb-24">
        <div className="section-label">Attach a file <span style={{ fontWeight: 400, color: "var(--grey-light)", textTransform: "none", letterSpacing: 0, fontSize: "11px" }}>— optional</span></div>

        {!uploadedFile ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setFileDragOver(true); }}
            onDragLeave={() => setFileDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setFileDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${fileDragOver ? "var(--teal)" : "var(--rule)"}`,
              borderRadius: "6px",
              padding: "20px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.15s",
              background: fileDragOver ? "rgba(13,118,128,0.04)" : "transparent",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.md"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = ""; // reset so same file can be re-selected
              }}
              style={{ display: "none" }}
            />
            <div style={{ fontSize: "22px", marginBottom: "6px" }}>📎</div>
            <div style={{ fontSize: "13px", color: "var(--grey)" }}>
              Drop a file here or <span style={{ color: "var(--teal)", fontWeight: 600 }}>click to browse</span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--grey-light)", marginTop: "4px" }}>
              PDF, images, text, CSV · Max 10MB
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 14px",
            border: "1px solid var(--teal)",
            borderRadius: "6px",
            background: "rgba(13,118,128,0.04)",
          }}>
            <span style={{ fontSize: "20px" }}>
              {uploadedFile.mimeType === "application/pdf" ? "📄" : uploadedFile.mimeType.startsWith("image/") ? "🖼️" : "📝"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: "var(--charcoal)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {uploadedFile.name}
              </div>
              <div style={{ fontSize: "11px", color: "var(--grey-light)" }}>
                {(uploadedFile.size / 1024).toFixed(0)}KB · {uploadedFile.mimeType.split("/")[1].toUpperCase()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUploadedFile(null)}
              style={{
                background: "none",
                border: "1px solid var(--rule)",
                borderRadius: "4px",
                padding: "3px 10px",
                fontSize: "11px",
                color: "var(--grey)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Remove
            </button>
          </div>
        )}

        {uploadedFile && (
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
            marginTop: "8px",
            padding: "8px 12px",
            background: "rgba(180,130,20,0.06)",
            border: "1px solid rgba(180,130,20,0.2)",
            borderRadius: "4px",
            fontSize: "12px",
            color: "var(--grey)",
            lineHeight: 1.4,
          }}>
            <span style={{ fontSize: "13px", flexShrink: 0 }}>💡</span>
            <span>Your file will be sent to every agent in the strategy. This increases token usage proportionally. Text-only models (DeepSeek R1) will be swapped for Gemini 3.1 Pro to enable document understanding.</span>
          </div>
        )}
      </div>

      {/* ─── Strategy ───────────────────────────────────────── */}
      <div className="mb-24">
        <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Intelligence strategy</div>
          {recommendationRationale && (
            <div style={{ fontSize: "12px", color: "var(--teal)", fontWeight: 500, background: "rgba(0,128,128,0.06)", padding: "4px 12px", borderRadius: "14px", border: "1px solid rgba(0,128,128,0.2)" }}>
              ✨ Recommended based on your challenge
            </div>
          )}
        </div>

        {recommendationRationale && (
          <div style={{ marginBottom: "16px", fontSize: "13px", color: "var(--charcoal)", background: "var(--white)", padding: "12px 16px", borderRadius: "6px", border: "1px solid var(--teal)", borderLeft: "4px solid var(--teal)" }}>
            <strong>Why we picked this:</strong> {recommendationRationale.text}
          </div>
        )}

        {!loaded ? (
          <p style={{ color: "var(--grey-light)", fontStyle: "italic" }}>Loading strategies...</p>
        ) : (
          <div className="grid-2">
            {strategies.filter((s) => s.id !== "all-angles").map((s) => (
              <div
                key={s.id}
                className="card"
                data-selected={allAngles || selectedStrategy === s.id ? "true" : "false"}
                onClick={() => handleSelectStrategy(s.id)}
                style={{ cursor: "pointer", padding: "14px 16px" }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: "4px" }}>
                  <h3 style={{ fontSize: "16px", margin: 0 }}>
                    <span style={{ marginRight: "6px" }}>{s.icon}</span>
                    {s.name}
                  </h3>
                  <Link
                    href={`/advisor/strategy/${s.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="topic-tag"
                    style={{ fontSize: "10px" }}
                  >
                    Details →
                  </Link>
                </div>
                <p style={{ fontSize: "13px", color: "var(--grey)", margin: 0, lineHeight: 1.5 }}>
                  {s.bestFor}
                </p>
              </div>
            ))}

            {/* All Angles — spans full width as the 5th card */}
            <div
              className="card"
              data-selected={allAngles ? "true" : "false"}
              onClick={() => {
                setAllAngles(!allAngles);
                if (!allAngles && !selectedStrategy) {
                  const first = strategies.find((s) => s.id !== "all-angles");
                  if (first) setSelectedStrategy(first.id);
                }
              }}
              style={{
                cursor: "pointer",
                padding: "14px 16px",
                gridColumn: "1 / -1",
                borderColor: allAngles ? "var(--teal)" : undefined,
                background: allAngles ? "rgba(0,128,128,0.04)" : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={allAngles}
                    readOnly
                    style={{ width: "14px", height: "14px", accentColor: "var(--teal)", cursor: "pointer" }}
                  />
                  <h3 style={{ fontSize: "16px", margin: 0 }}>
                    🔮 All Angles
                  </h3>
                  <span style={{ fontSize: "13px", color: "var(--grey)" }}>
                    Run all 4 strategies + meta-synthesis
                  </span>
                </div>
                <Link
                  href="/advisor/strategy/all-angles"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: "12px", color: "var(--claret)", fontWeight: 600, whiteSpace: "nowrap" }}
                >
                  Details →
                </Link>
              </div>
              {allAngles && (
                <p style={{ fontSize: "12px", color: "var(--grey)", margin: "6px 0 0 26px", lineHeight: 1.5 }}>
                  Runs all strategies in parallel. A meta-judge analyses where they agree and diverge,
                  producing a cross-strategy alignment matrix and confidence-weighted recommendation.
                </p>
              )}
            </div>
          </div>
        )}
      </div>





      {/* ─── Submit ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "16px" }}>
        <div className="flex items-center justify-between">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {allAngles ? (
              <div style={{ fontSize: "14px", color: "var(--grey)" }}>
                <strong style={{ color: "var(--black)" }}>🔮 All Angles</strong>
                {" · "}
                {demoMode !== null ? (
                  <span style={{ color: "var(--teal)" }}>pre-run demo — no tokens used</span>
                ) : (
                  "4 strategies + meta-judge"
                )}
              </div>
            ) : selected ? (
              <div style={{ fontSize: "14px", color: "var(--grey)" }}>
                <strong style={{ color: "var(--black)" }}>{selected.icon} {selected.name}</strong>
                {" · "}
                {selected.agentCount} agents + judge
              </div>
            ) : (
              <div style={{ fontSize: "14px", color: "var(--grey-light)", fontStyle: "italic" }}>
                Select a strategy to continue
              </div>
            )}

            {/* Reasoning toggle — inline in submit bar */}
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--grey)", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={includeReasoning}
                onChange={(e) => setIncludeReasoning(e.target.checked)}
                style={{ width: "12px", height: "12px", accentColor: "var(--teal)", cursor: "pointer" }}
              />
              Reasoning
            </label>

            {/* Advanced — toggles prompt editor */}
            {(selected || allAngles) && (
              <button
                type="button"
                onClick={() => setShowPrompts(!showPrompts)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "12px",
                  color: "var(--grey)",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                {showPrompts ? "Hide prompts" : "Advanced ▸"}
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!challenge.trim() || (!selectedStrategy && !allAngles) || isSubmitting}
            onClick={handleSubmit}
            title={!challenge.trim() ? "Describe your challenge first" : (!selectedStrategy && !allAngles) ? "Select a strategy" : ""}
          >
            {isSubmitting ? "Submitting..." : demoMode !== null ? "Submit demo →" : allAngles ? "Submit All Angles →" : "Submit challenge →"}
          </button>
        </div>

        {/* Inline prompt editor — shown when Advanced is clicked */}
        {showPrompts && selected && (
          <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {selected.agents.map((agent) => (
                <div key={agent.role} className="card" style={{ padding: "12px" }}>
                  <div className="flex items-center gap-8" style={{ marginBottom: "6px" }}>
                    <span style={{ width: "6px", height: "6px", background: agent.color, display: "inline-block" }} />
                    <strong style={{ fontSize: "13px" }}>{agent.role}</strong>
                    <span style={{ fontSize: "11px", color: "var(--grey-light)", fontFamily: "monospace" }}>
                      {agent.model.split("/").pop()}
                    </span>
                  </div>
                  <textarea
                    style={{ width: "100%", minHeight: "100px", padding: "8px 10px", background: "var(--white)", border: "1px solid var(--rule)", color: "var(--charcoal)", fontFamily: "var(--font-text)", fontSize: "12px", lineHeight: 1.5, resize: "vertical" }}
                    value={promptOverrides[agent.role] ?? agent.systemPrompt ?? ""}
                    onChange={(e) => handlePromptChange(agent.role, e.target.value)}
                  />
                  {promptOverrides[agent.role] && promptOverrides[agent.role] !== agent.systemPrompt && (
                    <div className="flex justify-between items-center" style={{ marginTop: "4px" }}>
                      <span style={{ fontSize: "10px", color: "var(--claret)" }}>Modified</span>
                      <button type="button" onClick={() => { const next = { ...promptOverrides }; delete next[agent.role]; setPromptOverrides(next); }} style={{ background: "none", border: "none", color: "var(--grey)", cursor: "pointer", fontSize: "10px", textDecoration: "underline" }}>Reset</button>
                    </div>
                  )}
                </div>
              ))}
              {selected.judge && (
                <div className="card" style={{ padding: "12px" }}>
                  <div className="flex items-center gap-8" style={{ marginBottom: "6px" }}>
                    <span style={{ width: "6px", height: "6px", background: selected.judge.color, display: "inline-block" }} />
                    <strong style={{ fontSize: "13px" }}>{selected.judge.role}</strong>
                    <span className="topic-tag" style={{ fontSize: "9px", marginLeft: "2px" }}>JUDGE</span>
                  </div>
                  <textarea
                    style={{ width: "100%", minHeight: "100px", padding: "8px 10px", background: "var(--white)", border: "1px solid var(--rule)", color: "var(--charcoal)", fontFamily: "var(--font-text)", fontSize: "12px", lineHeight: 1.5, resize: "vertical" }}
                    value={promptOverrides[selected.judge.role] ?? selected.judge.systemPrompt ?? ""}
                    onChange={(e) => handlePromptChange(selected.judge!.role, e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
