/**
 * POST /api/advisor/refine
 *
 * Two-step challenge refinement:
 *   step: "questions"   → generates clarifying questions from a rough challenge
 *   step: "synthesise"  → weaves original + answers into a rich challenge
 */

import { callModel } from "@/lib/llm";

const MODEL = "google/gemini-3.1-flash-lite-preview";

const QUESTIONS_SYSTEM = `You are a strategic challenge analyst. The user has given you a rough description of a problem they face. Your job is to generate 4-6 clarifying questions that will help turn their vague description into a rich, specific challenge statement.

RULES:
- Questions should extract CONCRETE DATA: numbers, locations, timelines, constraints, trade-offs
- Each question must have pre-defined options — the user should never need to type
- Use question types: "multi" (pick one or more), "yesno", or "scale" (ordered options)
- Questions should be CONTEXTUAL — adapt to what the user wrote, don't ask generic questions
- If the user already provided specific data (numbers, locations, etc.), do NOT ask about it again
- Limit to 4-6 questions — enough to enrich, not so many it feels like a form
- Options should cover realistic scenarios for the user's specific domain
- For "multi" questions, set multiSelect:true when multiple answers make sense

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "type": "multi",
      "options": ["...", "..."],
      "multiSelect": false
    }
  ]
}`;

const SYNTHESISE_SYSTEM = `You are a strategic problem statement writer. You have a user's rough challenge description and their answers to clarifying questions. Some questions may have been skipped — that's fine, just work with what you have and fill gaps with plausible assumptions.

RULES:
- Write in FIRST PERSON from the user's perspective
- Weave the answers naturally into prose — don't make it sound like a form was filled out
- Add realistic detail that follows logically from the answers (e.g. if they said revenue is £100-250k, pick a specific plausible number like £180,000)
- Include tensions and trade-offs that make the challenge genuinely complex and debatable
- End with a clear question or decision that advisory strategies can address
- Keep it to 1-2 paragraphs, ~100-200 words
- Make it sound like a real person describing a real problem, not a corporate brief
- For skipped questions, either infer reasonable values or leave those aspects out
- IMPORTANT: Wrap any NEW detail that was NOT in the original challenge with [[double brackets]]. Content from the original should NOT be wrapped. Only wrap phrases/clauses that came from the Q&A answers or were inferred from them.
- CLASSIFY the problem into one of 4 types: Decision (choosing between paths), Strategy (how to execute a goal), Diagnosis (finding root causes), or Exploration (mapping unknown territory).
- RECOMMEND a strategy:
  - Decision -> "stress-tester"
  - Strategy -> "deep-dive"
  - Diagnosis -> "round-table"
  - Exploration -> "all-angles" (or consensus-board for simpler exploration)

Respond with ONLY valid JSON (no markdown, no backticks):
{ 
  "refined": "I run a bakery [[in Bristol with 3 staff]]. Revenue is...",
  "category": "Decision",
  "recommended_strategy": "stress-tester",
  "rationale": "Because you are weighing two specific options, an adversarial debate will highlight the hidden risks in your preferred path."
}`;

/** Strip markdown fences that models sometimes wrap around JSON */
function safeParseJSON(raw: string) {
  let s = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"");
  return JSON.parse(s);
}

/** Call model and parse JSON, retrying once on failure */
async function callAndParse(
  messages: { role: string; content: string }[],
  opts: { temperature: number; max_tokens: number }
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callModel(MODEL, messages, {
      ...opts,
      json: true,
    });
    try {
      return safeParseJSON(res.content);
    } catch (e) {
      console.warn(`JSON parse failed (attempt ${attempt + 1}):`, (e as Error).message, "| Raw:", res.content.slice(0, 200));
      if (attempt === 1) throw e; // give up after 2nd try
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { step, challenge } = body;

    if (!challenge?.trim()) {
      return Response.json({ error: "Challenge is required" }, { status: 400 });
    }

    if (step === "questions") {
      const parsed = await callAndParse(
        [
          { role: "system", content: QUESTIONS_SYSTEM },
          { role: "user", content: challenge.trim() },
        ],
        { temperature: 0.7, max_tokens: 3000 }
      );
      return Response.json(parsed);

    } else if (step === "synthesise") {
      const { answers } = body;

      // Build context from answers
      const answeredParts = (answers || [])
        .filter((a: { selected?: string[] }) => a.selected?.length)
        .map((a: { question?: string; selected: string[]; detail?: string }) =>
          `Q: ${a.question || "?"}\nA: ${a.selected.join(", ")}${a.detail ? ` (${a.detail})` : ""}`
        )
        .join("\n\n");

      const userMsg = answeredParts
        ? `Original challenge:\n${challenge.trim()}\n\nClarifying answers:\n${answeredParts}`
        : challenge.trim();

      const parsed = await callAndParse(
        [
          { role: "system", content: SYNTHESISE_SYSTEM },
          { role: "user", content: userMsg },
        ],
        { temperature: 0.6, max_tokens: 3000 }
      );
      return Response.json(parsed);

    } else {
      return Response.json(
        { error: "Invalid step. Use 'questions' or 'synthesise'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Refine error:", error);
    return Response.json(
      { error: "Refinement failed" },
      { status: 500 }
    );
  }
}
