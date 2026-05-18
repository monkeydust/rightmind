/**
 * GET /api/advisor/jobs/[id]
 *
 * Returns the full job data for a given job ID.
 * Used by the child strategy reports component in All Angles view.
 */

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.advisorJob.findUnique({
    where: { id },
    select: {
      id: true,
      challenge: true,
      fileName: true,
      strategyId: true,
      status: true,
      report: true,
      error: true,
      progress: true,
      parentJobId: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  let progress = {};
  try {
    progress = JSON.parse(job.progress);
  } catch { /* ignore */ }

  return Response.json({
    ...job,
    progress,
  });
}
