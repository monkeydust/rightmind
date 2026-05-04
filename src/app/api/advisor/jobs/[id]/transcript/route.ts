/**
 * GET /api/advisor/jobs/[id]/transcript
 *
 * Returns all agent responses for a job — the full text each agent produced,
 * ordered by creation time. Used by the "Copy full transcript" export feature
 * so users can paste the complete multi-agent analysis into another LLM.
 */

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
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
