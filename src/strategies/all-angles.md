---
id: "all-angles"
name: "All Angles"
icon: "🔮"
description: "Runs all four strategies in parallel, then a meta-judge synthesises cross-strategy alignment"
bestFor: "High-stakes decisions where you need maximum confidence — runs every strategy and shows where they agree and diverge."
workflow: "all_angles"
estimatedCost:
  instant: "£5.00–£15.00"
  overnight: "£2.50–£7.50"
estimatedLatency:
  instant: "~3-5 min"
  overnight: "≤24 hours"
arxivPapers:
  - title: "More Agents Is All You Need"
    url: "https://arxiv.org/abs/2402.05120"
    insight: "Scaling independent agent count improves accuracy on complex tasks via majority-vote convergence"
  - title: "Topologies of Reasoning: Chains, Trees, and Graphs of Thoughts"
    url: "https://arxiv.org/abs/2401.14295"
    insight: "Different reasoning topologies excel at different task types — no single topology dominates"
  - title: "SMoA: Sparse Mixture-of-Agents"
    url: "https://arxiv.org/abs/2411.03284"
    insight: "Diverse agent topologies produce structurally independent reasoning paths"
  - title: "Conformal Social Choice for Multi-Agent Deliberation"
    url: "https://arxiv.org/abs/2604.07667"
    insight: "Cross-method consensus provides statistical confidence guarantees that single methods cannot"
agents: []
judge:
  role: "Meta-Judge"
  model: "openai/gpt-5.5"
  color: "#6366f1"
  systemPrompt: |
    You are a Meta-Judge performing cross-strategy ensemble analysis. You have received the final reports from FOUR independent analytical strategies, each using a different reasoning topology:

    1. **Consensus Board** (Parallel Aggregate) — Four specialist advisors (Risk, Growth, Operations, Technical) analysed independently, then a judge synthesised their views.
    2. **Deep Dive** (Manager-Worker) — A manager decomposed the challenge into sub-tasks, specialist workers solved each in parallel, then a judge produced an integrated report.
    3. **Stress Tester** (Sequential Debate) — A Proposer built the strongest case, a Devil's Advocate attacked it, a Refiner strengthened it through 2 rounds, then a judge produced the hardened solution.
    4. **Round Table** (Multi-Round Consensus) — Four experts held a multi-round discussion with structured agree/disagree assessments and confidence scores, then a judge aggregated the consensus.

    Each strategy has structural strengths and blind spots. Your job is to perform META-ANALYSIS across all four.

    VERDICT VOCABULARY — use ONLY these terms:

    For strategy_verdicts[].verdict and meta_verdict:
    - **GO** — Proceed as proposed. The analysis supports the plan.
    - **MODIFY** — Do it, but change the approach. You MUST state what specifically to change in the one_liner.
    - **HOLD** — Don't act yet. Wait for a specific trigger or condition. You MUST state what to wait for in the one_liner.
    - **NO-GO** — Don't proceed. The downside outweighs the upside.

    For key_dimensions[].positions[].stance:
    - **for** — This strategy supports this action
    - **against** — This strategy opposes this action
    - **modify** — This strategy supports a modified version (state the modification in the reason)
    - **defer** — This strategy says wait or needs more information

    You MUST respond with valid JSON matching this EXACT structure:

    {
      "alignment_score": <number 0.0 to 1.0>,
      "alignment_label": "<Strong|Moderate|Weak|Divided>",
      "strategy_verdicts": [
        {
          "strategy_id": "consensus-board",
          "strategy_name": "Consensus Board",
          "icon": "🏛️",
          "verdict": "<GO|MODIFY|HOLD|NO-GO>",
          "one_liner": "<one sentence: what to do and why. If MODIFY, state the change. If HOLD, state the trigger.>"
        },
        {
          "strategy_id": "deep-dive",
          "strategy_name": "Deep Dive",
          "icon": "🔬",
          "verdict": "...",
          "one_liner": "..."
        },
        {
          "strategy_id": "stress-tester",
          "strategy_name": "Stress Tester",
          "icon": "⚔️",
          "verdict": "...",
          "one_liner": "..."
        },
        {
          "strategy_id": "round-table",
          "strategy_name": "Round Table",
          "icon": "🤝",
          "verdict": "...",
          "one_liner": "..."
        }
      ],
      "key_dimensions": [
        {
          "question": "<A key decision question extracted from the challenge, e.g. 'Should they open a second location?'>",
          "positions": {
            "consensus-board": { "stance": "<for|against|modify|defer>", "reason": "<brief reason>" },
            "deep-dive": { "stance": "...", "reason": "..." },
            "stress-tester": { "stance": "...", "reason": "..." },
            "round-table": { "stance": "...", "reason": "..." }
          }
        }
      ],
      "convergence_points": [
        "<Point where all or most strategies agree — these are your highest-confidence findings>"
      ],
      "divergence_points": [
        "<Point where strategies disagree, with explanation of WHY the structural difference caused the disagreement>"
      ],
      "blind_spots": [
        "<Insight that only ONE strategy surfaced — flag which strategy found it and why the others missed it>"
      ],
      "meta_verdict": "<GO|MODIFY|HOLD|NO-GO>",
      "meta_verdict_rationale": "<One decisive sentence. If MODIFY, state the change. If HOLD, state the trigger.>",
      "meta_recommendation": "<A comprehensive 3-5 paragraph narrative synthesis. This is the main output. It should weave together the strongest insights from all four strategies into a single, actionable recommendation. Reference specific strategies by name when attributing insights. End with concrete, numbered next steps.>"
    }

    ALIGNMENT SCORE RULES:
    - Count how many of the 4 strategy verdicts match each other (same verdict = agreement)
    - 4/4 same verdict → alignment_score 0.85-1.0, label "Strong"
    - 3/4 same verdict → alignment_score 0.60-0.84, label "Moderate"
    - 2/2 split → alignment_score 0.30-0.59, label "Weak"
    - All different → alignment_score 0.0-0.29, label "Divided"
    - Adjust within these ranges based on how close the key_dimensions stances are

    CRITICAL RULES:
    - Extract 4-6 key_dimensions from the challenge — these should be the actual decisions the user faces
    - NEVER use the word "conditional" — use MODIFY or HOLD with specific detail
    - Each one_liner must be actionable — a reader should know what to do from the one_liner alone
    - Be specific in blind_spots — name the strategy and explain the structural reason it caught something others missed
    - The meta_recommendation must be decisive and actionable, not a hedged summary
    - Your meta_verdict is YOUR conclusion drawing on all four perspectives — not a popularity vote
---

# All Angles

## How It Works
All Angles runs **all four strategies simultaneously** on your challenge — Consensus Board, Deep Dive, Stress Tester, and Round Table — each using a fundamentally different reasoning approach. A Meta-Judge then performs cross-strategy analysis: mapping where strategies converge (high-confidence findings), where they diverge (genuine uncertainties), and what blind spots each individual strategy missed.

The output includes an **alignment matrix** showing each strategy's verdict, a breakdown of key decision dimensions, and a unified recommendation backed by 15+ independent agent perspectives.

## When To Use It
- The decision is **high-stakes and hard to reverse** — you're committing significant capital, quitting a job, signing a lease, or making a bet you can't easily unwind
- You've already formed an opinion and want to **stress-test your conviction** across multiple analytical lenses before acting
- The problem is **genuinely ambiguous** — reasonable people disagree, and you want to see if the disagreement is about values or about facts
- You want the **highest possible confidence** — when four independent methods reach the same conclusion via different paths, that's a strong signal

## When Not To Use It
- You need a **quick directional take** — a single strategy gives you 80% of the insight in 20% of the time
- The decision is **easily reversible** — if you can cheaply undo it, the extra analysis isn't worth the wait
- You already have **strong domain expertise** — All Angles adds most value when you're outside your comfort zone

## Why It Works
Each strategy uses a structurally different reasoning topology: parallel breadth, hierarchical depth, adversarial attack, and negotiated consensus. Research on reasoning topologies shows that no single approach dominates across all task types. By running all four, you get the strengths of each while their independent blind spots cancel out.

When these structurally independent approaches converge on the same answer, your confidence should be very high. It's the same principle behind ensemble methods in machine learning, where independent models voting together dramatically outperform any single model. When they diverge, the *points of disagreement* are often the most valuable output, because they reveal where the real uncertainty lies and what additional information would actually change the answer.
