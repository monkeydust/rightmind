/**
 * POST /api/advisor/jobs/[id]/follow-up/refine
 *
 * Two-step follow-up refinement with full job context:
 *   step: "questions"   → generates clarifying questions for the follow-up
 *   step: "synthesise"  → weaves rough question + answers into a precise follow-up
 */

import { callModel } from "@/lib/llm";
import type { LLMMessage } from "@/lib/types";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const MODEL = "google/gemini-3.1-flash-lite-preview";

const QUESTIONS_SYSTEM = `You are helping a user formulate a follow-up question to a strategic analysis they received. They have a rough idea of what they want to explore further. Generate 3-5 clarifying questions to help them write a precise, targeted follow-up.

CONTEXT: The user already received an in-depth multi-agent analysis. Their follow-up should drill deeper, explore a different angle, or challenge specific conclusions.

RULES:
- Questions should be specific to what they want to explore NEXT
- Each question must have pre-defined options — the user should never need to type  
- Use question types: "multi" (pick one or more), "yesno", or "scale" (ordered options)
- Questions should reference specific aspects of the analysis they received
- Limit to 3-5 questions
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

const SYNTHESISE_SYSTEM = `You are helping a user craft a precise follow-up question for a strategic analysis they received. Weave their rough question and their answers to the clarifying questions into a single, well-formulated follow-up question.

RULES:
- Write as a clear, specific question or request directed at the analyst
- Reference specific parts of the analysis where relevant
- Keep it to 1-3 sentences
- Make it actionable — the analyst should know exactly what to explore
- For skipped questions, infer reasonable context or leave those aspects out

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "refined": "The follow-up question text..."
}`;

/** Strip markdown fences that models sometimes wrap around JSON */
function safeParseJSON(raw: string) {
  let s = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(s);
}

/** Call model and parse JSON, retrying once on failure */
async function callAndParse(
  messages: LLMMessage[],
  opts: { temperature: number; max_tokens: number; apiKey?: string }
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch job for context
    const job = await prisma.advisorJob.findUnique({
      where: { id },
      select: {
        userId: true,
        challenge: true,
        report: true,
        status: true,
      },
    });

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (job.status !== "DONE") {
      return Response.json(
        { error: "Cannot refine follow-up for a job that is not complete" },
        { status: 400 }
      );
    }

    // Use the user's own API key if they have one (BYOK)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { openRouterKey: true },
    });
    const apiKey = user?.openRouterKey || undefined;

    const body = await request.json();
    const { step, prompt } = body;

    if (!prompt?.trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Truncate report to first 2000 chars for context
    const reportSummary = (job.report || "").slice(0, 2000);

    if (step === "questions") {
      const userMsg = `The user's original challenge was: ${job.challenge}\n\nThey received this report: ${reportSummary}\n\nNow they want to ask a follow-up: ${prompt.trim()}`;

      const parsed = await callAndParse(
        [
          { role: "system", content: QUESTIONS_SYSTEM },
          { role: "user", content: userMsg },
        ],
        { temperature: 0.7, max_tokens: 3000, apiKey }
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
        ? `Original challenge:\n${job.challenge}\n\nReport summary:\n${reportSummary}\n\nRough follow-up question:\n${prompt.trim()}\n\nClarifying answers:\n${answeredParts}`
        : `Original challenge:\n${job.challenge}\n\nReport summary:\n${reportSummary}\n\nRough follow-up question:\n${prompt.trim()}`;

      const parsed = await callAndParse(
        [
          { role: "system", content: SYNTHESISE_SYSTEM },
          { role: "user", content: userMsg },
        ],
        { temperature: 0.6, max_tokens: 3000, apiKey }
      );
      return Response.json(parsed);

    } else {
      return Response.json(
        { error: "Invalid step. Use 'questions' or 'synthesise'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Follow-up refine error:", error);
    return Response.json(
      { error: "Follow-up refinement failed" },
      { status: 500 }
    );
  }
}
