/**
 * GET /api/advisor/jobs
 *
 * Returns a list of the current user's advisor jobs, newest first.
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const jobs = await prisma.advisorJob.findMany({
      where: {
        parentJobId: null, // Hide child jobs (they appear under All Angles parents)
        userId: session.user.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        challenge: true,
        strategyId: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return Response.json({ jobs });
  } catch (error) {
    console.error("Failed to list jobs:", error);
    return Response.json(
      { error: "Failed to list jobs" },
      { status: 500 }
    );
  }
}
