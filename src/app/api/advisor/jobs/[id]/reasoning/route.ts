/**
 * GET /api/advisor/jobs/[id]/reasoning
 *
 * Returns reasoning traces from all agent responses for a given job.
 * Only returns data for agents that had reasoning enabled.
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(
  _request: Request,
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

    const responses = await prisma.agentResponse.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        agentRole: true,
        agentModel: true,
        phase: true,
        reasoning: true,
        durationMs: true,
        tokens: true,
      },
    });

    // Filter to only include responses that have reasoning
    const traces = responses
      .filter((r) => r.reasoning)
      .map((r) => ({
        id: r.id,
        agentRole: r.agentRole,
        agentModel: r.agentModel,
        phase: r.phase,
        reasoning: r.reasoning,
        durationMs: r.durationMs,
        tokens: r.tokens,
      }));

    return Response.json({ traces });
  } catch (error) {
    console.error("Failed to fetch reasoning:", error);
    return Response.json(
      { error: "Failed to fetch reasoning traces" },
      { status: 500 }
    );
  }
}
