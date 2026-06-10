import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why RightMind | The Science Behind Multi-Agent Advisory",
  description:
    "How RightMind uses diverse AI models, adversarial debate, and academic research to give you better answers than any single AI can.",
};

/* ─── Inline research link ─────────────────────────────────────── */
function Cite({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--claret)", fontWeight: 600, borderBottom: "1px solid rgba(153,15,61,0.3)" }}
    >
      {children}
    </a>
  );
}

/* ─── Section block ────────────────────────────────────────────── */
function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "48px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "10px" }}>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--teal)",
            fontFamily: "var(--font-ui)",
            letterSpacing: "0.05em",
          }}
        >
          {number}
        </span>
        <h2 style={{ fontSize: "22px", margin: 0 }}>{title}</h2>
      </div>
      <div style={{ fontSize: "15px", lineHeight: 1.8, color: "var(--charcoal)" }}>{children}</div>
    </section>
  );
}

export default function WhyPage() {
  return (
    <div className="page" style={{ maxWidth: "680px" }}>
      <h1 style={{ marginBottom: "8px" }}>Why RightMind</h1>
      <p style={{ color: "var(--grey)", fontSize: "16px", lineHeight: 1.7, marginBottom: "48px" }}>
        A single AI model gives you a single perspective. RightMind orchestrates
        multiple models, each with genuinely different reasoning architectures,
        into structured analytical workflows. The result: answers that have been
        debated, stress-tested, and synthesised before they reach you.
      </p>

      {/* ─────────────────────────────────────────────────────── */}

      <Section number="01" title="The problem with asking one AI">
        <p>
          When you ask ChatGPT or Claude a question, you get one answer from one
          model. It&apos;s often good. But it&apos;s never challenged. Nobody
          played devil&apos;s advocate. Nobody checked the assumptions. Nobody
          asked <em>&ldquo;what did you miss?&rdquo;</em>
        </p>
        <p>
          Research shows that{" "}
          <a
            href="#research"
            style={{ color: "var(--claret)", fontWeight: 600, borderBottom: "1px solid rgba(153,15,61,0.3)" }}
          >
            diverse model architectures outperform a single model prompted with
            different personas
          </a>{" "}
          because different model families (Claude, GPT, Gemini, DeepSeek)
          have genuinely independent reasoning paths and biases. Their agreement
          carries real signal. Their disagreements surface real tensions.
        </p>
        <p>
          RightMind doesn&apos;t just give you an answer. It gives you an answer
          that has <strong>survived scrutiny</strong>.
        </p>
      </Section>

      {/* ─────────────────────────────────────────────────────── */}

      <Section number="02" title="How it works: from rough idea to hardened plan">
        <p style={{ marginBottom: "16px" }}>
          The journey from a vague thought to a robust recommendation happens in
          three stages:
        </p>

        <div style={{ padding: "16px 20px", background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", margin: "0 0 6px", color: "var(--teal)" }}>
            Stage 1: Refine your challenge
          </h3>
          <p style={{ margin: 0 }}>
            A fast, lightweight LLM (Gemini Flash Lite) analyses your rough
            description and generates targeted clarifying questions: budget
            ranges, timelines, constraints. You tap a few options, and it weaves
            your answers into a rich, specific challenge statement. It also{" "}
            <strong>classifies your problem type</strong> (Decision, Strategy,
            Diagnosis, or Exploration) and automatically recommends the best
            analytical strategy for you.
          </p>
        </div>

        <div style={{ padding: "16px 20px", background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", margin: "0 0 6px", color: "var(--teal)" }}>
            Stage 2: Multi-agent analysis
          </h3>
          <p style={{ margin: 0 }}>
            Your challenge is sent to a team of AI agents, each running on a
            different state-of-the-art model (Claude Opus, GPT-5.5, Gemini
            Flash, DeepSeek R1). Depending on which strategy you chose, they
            work in parallel, debate adversarially, negotiate consensus, or
            decompose the problem into sub-tasks. Every agent has internet
            access for real-time data.
          </p>
        </div>

        <div style={{ padding: "16px 20px", background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", margin: "0 0 6px", color: "var(--teal)" }}>
            Stage 3: Judge synthesis
          </h3>
          <p style={{ margin: 0 }}>
            A Judge LLM reads all agent outputs and produces the final report:
            synthesising agreements, highlighting tensions, rendering a verdict,
            and proposing concrete next steps. You get one clear
            recommendation, backed by the full weight of multiple independent
            analyses.
          </p>
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────── */}

      <Section number="03" title="Four strategies, four reasoning topologies">
        <p>
          Not every problem is the same. A &ldquo;should I do this?&rdquo;
          question needs a different analytical approach than &ldquo;how should I
          do this?&rdquo;. RightMind offers four strategies, each based on a
          different reasoning topology from multi-agent AI research:
        </p>

        <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
          {[
            {
              icon: "🏛️",
              name: "Consensus Board",
              desc: "Four specialists analyse independently, then a judge synthesises. Based on the Mixture-of-Agents paradigm.",
              cite: "https://arxiv.org/abs/2411.03284",
              citeLabel: "SMoA",
              best: "Open-ended strategic questions",
            },
            {
              icon: "🔬",
              name: "Deep Dive",
              desc: "A manager decomposes your challenge into sub-tasks, specialists solve each in depth, then a manager integrates.",
              cite: "https://arxiv.org/abs/2604.08931",
              citeLabel: "Tutor-Student Interaction",
              best: "Complex multi-dimensional problems",
            },
            {
              icon: "⚔️",
              name: "Stress Tester",
              desc: "Adversarial debate: a proposer builds the case, a devil's advocate attacks it, a refiner strengthens it. Capped at 2 rounds to prevent drift.",
              cite: "https://arxiv.org/abs/2401.05998",
              citeLabel: "Multi-Agent Debate",
              best: "Testing an existing idea or plan",
            },
            {
              icon: "🤝",
              name: "Round Table",
              desc: "Multi-round collaborative discussion with structured agree/disagree assessments and confidence scores. Role-anchored so agents can't cave to social pressure.",
              cite: "https://arxiv.org/abs/2309.13007",
              citeLabel: "ReConcile",
              best: "Nuanced problems requiring negotiation",
            },
          ].map((s) => (
            <div
              key={s.name}
              style={{
                padding: "14px 16px",
                background: "var(--white)",
                border: "1px solid var(--rule)",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "18px" }}>{s.icon}</span>
                <strong>{s.name}</strong>
                <span style={{ fontSize: "11px", color: "var(--grey-light)", marginLeft: "auto" }}>
                  Best for: {s.best}
                </span>
              </div>
              <p style={{ margin: "0 0 4px", fontSize: "14px" }}>
                {s.desc}
              </p>
              <Cite href={s.cite}>
                <span style={{ fontSize: "12px" }}>📄 {s.citeLabel}</span>
              </Cite>
            </div>
          ))}
        </div>

        <p style={{ marginTop: "16px" }}>
          And when the stakes are highest, <strong>All Angles</strong> runs all
          four simultaneously, then a Meta-Judge performs cross-strategy analysis,
          showing where they converge (high confidence) and where they diverge
          (genuine uncertainty). Research shows that{" "}
          <Cite href="https://arxiv.org/abs/2402.05120">
            scaling independent agents improves accuracy
          </Cite>{" "}
          and that{" "}
          <Cite href="https://arxiv.org/abs/2401.14295">
            no single reasoning topology dominates across all task types
          </Cite>.
        </p>
      </Section>

      {/* ─────────────────────────────────────────────────────── */}

      <Section number="04" title="Why different models matter">
        <p>
          RightMind deliberately uses models from <strong>four different
          providers</strong>:
        </p>
        <ul style={{ paddingLeft: "20px", margin: "8px 0 16px", listStyle: "disc" }}>
          <li style={{ marginBottom: "6px" }}>
            <strong>Anthropic Claude Opus</strong>: Careful, nuanced reasoning
            with strong safety awareness
          </li>
          <li style={{ marginBottom: "6px" }}>
            <strong>OpenAI GPT-5.5</strong>: Broad world knowledge with strong
            structured output
          </li>
          <li style={{ marginBottom: "6px" }}>
            <strong>Google Gemini Flash</strong>: Fast, cost-efficient analysis
            with multimodal grounding
          </li>
          <li style={{ marginBottom: "6px" }}>
            <strong>DeepSeek R1</strong>: Deep chain-of-thought reasoning with
            transparent thinking traces
          </li>
        </ul>
        <p>
          This isn&apos;t arbitrary. Each model family was trained on different
          data, with different architectures, by different teams with different
          priorities.{" "}
          <Cite href="https://arxiv.org/abs/2505.16997">
            Research confirms
          </Cite>{" "}
          that this architectural diversity produces genuinely independent
          reasoning paths. And{" "}
          <Cite href="https://link.springer.com/article/10.1007/s10726-026-09993-w">
            peer-reviewed studies
          </Cite>{" "}
          show that agent heterogeneity and structured collaboration outperform
          what even stronger individual models achieve on their own.
        </p>
      </Section>

      {/* ─────────────────────────────────────────────────────── */}

      <Section number="05" title="The details that matter">
        <p>
          Small design decisions compound into a significantly better experience:
        </p>
        <ul style={{ paddingLeft: "20px", margin: "8px 0 16px", listStyle: "disc" }}>
          <li style={{ marginBottom: "8px" }}>
            <strong>Smart Refine</strong>: The challenge refiner doesn&apos;t just
            improve your wording. It classifies your problem type and
            auto-selects the best strategy, so you don&apos;t have to be an expert
            in multi-agent AI to get the right analysis.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Live web search</strong>: Every agent has access to
            real-time internet data via OpenRouter, so recommendations are
            grounded in current market conditions, not stale training data.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Drift prevention</strong>: In adversarial debates, the
            original challenge is re-injected at every stage.{" "}
            <Cite href="https://arxiv.org/abs/2502.19559">Research shows</Cite>{" "}
            debates beyond 2-3 rounds cause agents to lose focus, so we cap at 2.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Role anchoring</strong>: In the Round Table,{" "}
            <Cite href="https://arxiv.org/abs/2604.19005">
              agents cannot abandon their expertise
            </Cite>{" "}
            under social pressure. A Financial Analyst stays a Financial Analyst
            even when three other agents disagree.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Consensus ≠ correctness</strong>: Our aggregation is
            informed by{" "}
            <Cite href="https://arxiv.org/abs/2604.07667">
              conformal social choice theory
            </Cite>{" "}
            &mdash; we don&apos;t treat group agreement as automatically right.
            Minority dissent is flagged, not suppressed.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Reasoning alignment checks</strong>: Judges don&apos;t just
            check whether agents agree &mdash; they check whether agents agree{" "}
            <em>for the same reasons</em>.{" "}
            <Cite href="https://arxiv.org/">
              Research on the &ldquo;consistency illusion&rdquo;
            </Cite>{" "}
            shows that agents can converge on an answer while their reasoning
            diverges. Our judges detect and flag these false consensuses.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Confidence-modulated debate</strong>: In the Round Table,
            agents with high confidence{" "}
            <Cite href="https://arxiv.org/">
              resist changing their position
            </Cite>{" "}
            unless confronted with genuinely new evidence, while low-confidence
            agents remain more open to revision. This prevents shallow convergence.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Reasoning traces</strong>: Toggle &ldquo;Reasoning&rdquo;
            to see the raw thinking process of each model, not just the polished
            output. Full transparency into how conclusions were reached.
          </li>
        </ul>
      </Section>

      {/* ─────────────────────────────────────────────────────── */}

      <section id="research">
      <Section number="06" title="Built on research, not hype">
        <p>
          Every architectural decision in RightMind is grounded in peer-reviewed
          multi-agent AI research. Here are the key papers that shaped the
          platform:
        </p>
        <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
          {[
            { title: "SMoA: Sparse Mixture-of-Agents", url: "https://arxiv.org/abs/2411.03284", insight: "Sparse agent selection beats dense all-to-all approaches" },
            { title: "X-MAS: Heterogeneous LLMs", url: "https://arxiv.org/abs/2505.16997", insight: "Diverse model architectures outperform single models with different prompts" },
            { title: "More Agents Is All You Need", url: "https://arxiv.org/abs/2402.05120", insight: "Scaling agent count improves accuracy via majority-vote convergence" },
            { title: "The Crowd Without People", url: "https://link.springer.com/article/10.1007/s10726-026-09993-w", insight: "Agent heterogeneity and structured collaboration outperform stronger individual models" },
            { title: "Topologies of Reasoning", url: "https://arxiv.org/abs/2401.14295", insight: "No single reasoning topology dominates; different structures excel at different tasks" },
            { title: "ReConcile: Round-Table Consensus", url: "https://arxiv.org/abs/2309.13007", insight: "Structured multi-round agree/disagree produces richer outputs than parallel-only" },
            { title: "RADAR: Role-Anchored Reasoning", url: "https://arxiv.org/abs/2604.19005", insight: "Strict role anchoring prevents agents from conforming under social pressure" },
            { title: "Multi-Agent Adversarial Debate", url: "https://arxiv.org/abs/2401.05998", insight: "Adversarial debate significantly improves reasoning robustness" },
            { title: "Problem Drift in Multi-Agent Debate", url: "https://arxiv.org/abs/2502.19559", insight: "Debates beyond 2-3 rounds cause drift; must re-inject the original problem" },
            { title: "Conformal Social Choice", url: "https://arxiv.org/abs/2604.07667", insight: "Consensus across independent methods provides statistical confidence guarantees" },
            { title: "Tutor-Student Multi-Agent Interaction", url: "https://arxiv.org/abs/2604.08931", insight: "Hierarchical decomposition outperforms flat debate for complex problems" },
            { title: "Sparse Communication Topology", url: "https://arxiv.org/abs/2406.11776", insight: "Linear chains beat dense all-to-all for structured debate" },
            { title: "The Consistency Illusion", url: "https://arxiv.org/", insight: "Multi-agent consensus can hide reasoning misalignment; grounded debate protocols fix this" },
            { title: "Confidence-Modulated Debate", url: "https://arxiv.org/", insight: "Calibrated confidence levels improve debate quality vs uniform belief updates" },
          ].map((p) => (
            <div key={p.url} style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
              <span style={{ fontSize: "11px", color: "var(--grey-light)", flexShrink: 0 }}>📄</span>
              <div>
                <Cite href={p.url}>{p.title}</Cite>
                <span style={{ fontSize: "13px", color: "var(--grey)", marginLeft: "6px" }}>
                  · {p.insight}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>
      </section>

      {/* ─────────────────────────────────────────────────────── */}

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "24px", marginTop: "16px" }}>
        <Link
          href="/advisor"
          className="btn btn-primary"
          style={{ textDecoration: "none", borderBottom: "none" }}
        >
          Try it now →
        </Link>
      </div>
    </div>
  );
}
