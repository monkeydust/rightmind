/**
 * GET /api/advisor/jobs/[id]/agents
 *
 * Returns agent responses for a job — the full text each agent produced plus
 * reasoning traces, cost and timing. Used by the flow visualizer's click-to-
 * inspect panel.
 *
 * Optional query param:
 *   ?role=Risk+Analyst   (filter by agent role; matches exactly or by prefix)
 *
 * Without a role filter, returns all agent responses for the job.
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: jobId } = await params;

  try {
    // Verify job exists and belongs to this user
    const job = await prisma.advisorJob.findUnique({
      where: { id: jobId },
      select: { userId: true },
    });

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const roleParam = url.searchParams.get("role");

    const responses = await prisma.agentResponse.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
      select: {
        agentRole: true,
        agentModel: true,
        phase: true,
        round: true,
        response: true,
        reasoning: true,
        tokens: true,
        promptTokens: true,
        completionTokens: true,
        costUsd: true,
        durationMs: true,
      },
    });

    let agents = responses.map((r) => ({
      agentRole: r.agentRole,
      agentModel: r.agentModel,
      phase: r.phase,
      round: r.round,
      response: r.response,
      reasoning: r.reasoning,
      tokens: r.tokens,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
    }));

    if (roleParam) {
      agents = agents.filter(
        (a) =>
          a.agentRole === roleParam ||
          a.agentRole.startsWith(roleParam) ||
          a.agentRole.includes(roleParam)
      );
    }

    return Response.json({ agents });
  } catch (error) {
    console.error("Failed to fetch agent responses:", error);
    return Response.json(
      { error: "Failed to fetch agent responses" },
      { status: 500 }
    );
  }
}
