/**
 * GET /api/advisor/jobs/[id]/transcript
 *
 * Returns all agent responses for a job — the full text each agent produced,
 * ordered by creation time. Used by the "Copy full transcript" export feature
 * so users can paste the complete multi-agent analysis into another LLM.
 */

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { auth } from "@/auth";

export async function GET(
  _request: NextRequest,
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
        agentRole: true,
        agentModel: true,
        phase: true,
        round: true,
        response: true,
        reasoning: true,
      },
    });

    return Response.json({ responses });
  } catch (error) {
    console.error("Failed to fetch transcript:", error);
    return Response.json(
      { error: "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}
