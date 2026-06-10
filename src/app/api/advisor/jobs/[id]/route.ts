/**
 * GET /api/advisor/jobs/[id]
 *
 * Returns the full job data for a given job ID.
 * Used by the child strategy reports component in All Angles view.
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

  const { id } = await params;

  const job = await prisma.advisorJob.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      challenge: true,
      fileName: true,
      strategyId: true,
      status: true,
      report: true,
      error: true,
      progress: true,
      parentJobId: true,
      totalCostUsd: true,
      totalTokens: true,
      createdAt: true,
      completedAt: true,
      followUps: {
        orderBy: { turnNumber: "asc" },
        select: {
          id: true,
          turnNumber: true,
          prompt: true,
          response: true,
          model: true,
          tokens: true,
          durationMs: true,
          createdAt: true,
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

  let progress = {};
  try {
    progress = JSON.parse(job.progress);
  } catch { /* ignore */ }

  return Response.json({
    ...job,
    progress,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const job = await prisma.advisorJob.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete child jobs first (if it's a parent)
    await prisma.advisorJob.deleteMany({
      where: { parentJobId: id, userId: session.user.id },
    });

    // Delete the job itself
    await prisma.advisorJob.delete({
      where: { id },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete job:", error);
    return Response.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
