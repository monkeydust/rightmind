/**
 * POST /api/advisor/jobs/[id]/follow-up
 *
 * Accepts a follow-up question on a completed job report.
 * Builds the full conversation history (original challenge + report + prior follow-ups)
 * and returns the model's response.
 */

import { callModel } from "@/lib/llm";
import type { LLMMessage } from "@/lib/types";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const FOLLOW_UP_MODEL = "openai/gpt-5.4";

const SYSTEM_PROMPT = `You are an expert strategic advisor continuing an analysis. The user received a multi-agent advisory report and wants to explore it further. Build on the existing analysis — don't just repeat it. Be specific, actionable, and maintain the analytical depth of the original report. Format your response in markdown.`;

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

    // Fetch job with existing follow-ups
    const job = await prisma.advisorJob.findUnique({
      where: { id },
      select: {
        userId: true,
        challenge: true,
        report: true,
        strategyId: true,
        status: true,
        followUps: {
          orderBy: { turnNumber: "asc" },
          select: {
            prompt: true,
            response: true,
          },
        },
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
        { error: "Cannot follow up on a job that is not complete" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { prompt } = body;

    if (!prompt?.trim()) {
      return Response.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Fetch user's BYOK key
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { openRouterKey: true },
    });
    const apiKey = user?.openRouterKey || undefined;

    // Build the message array with full conversation history
    const messages: LLMMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: job.challenge },
      { role: "assistant", content: job.report || "" },
    ];

    // Add existing follow-up turns
    for (const followUp of job.followUps) {
      messages.push({ role: "user", content: followUp.prompt });
      messages.push({ role: "assistant", content: followUp.response });
    }

    // Add the new follow-up prompt
    messages.push({ role: "user", content: prompt.trim() });

    // Call the model
    const res = await callModel(FOLLOW_UP_MODEL, messages, {
      temperature: 0.5,
      max_tokens: 16384,
      apiKey,
    });

    // Determine next turn number
    const turnNumber = job.followUps.length + 1;

    // Save to database
    const followUp = await prisma.jobFollowUp.create({
      data: {
        jobId: id,
        turnNumber,
        prompt: prompt.trim(),
        response: res.content,
        model: res.model,
        tokens: res.usage.total_tokens,
        costUsd: res.usage.costUsd,
        durationMs: res._durationMs,
      },
      select: {
        id: true,
        turnNumber: true,
        prompt: true,
        response: true,
        model: true,
        tokens: true,
        costUsd: true,
        durationMs: true,
        createdAt: true,
      },
    });

    // Update job-level cost totals
    await prisma.advisorJob.update({
      where: { id },
      data: {
        totalCostUsd: { increment: res.usage.costUsd },
        totalTokens: { increment: res.usage.total_tokens },
      },
    });

    return Response.json(followUp);
  } catch (error) {
    console.error("Follow-up error:", error);
    return Response.json(
      { error: "Follow-up failed" },
      { status: 500 }
    );
  }
}
