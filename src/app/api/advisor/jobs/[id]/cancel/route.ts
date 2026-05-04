/**
 * POST /api/advisor/jobs/[id]/cancel
 *
 * Cancels a running job. Sets the in-memory cancellation flag
 * and updates the database status to CANCELLED.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cancelJob } from "@/lib/cancellation";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the job belongs to the user
  const job = await prisma.advisorJob.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, status: true, parentJobId: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "PENDING" && job.status !== "RUNNING") {
    return Response.json({ error: "Job is not running" }, { status: 400 });
  }

  // Set the in-memory cancellation flag
  cancelJob(id);

  // If this is a child job of All Angles, also cancel the parent
  if (job.parentJobId) {
    cancelJob(job.parentJobId);
  }

  // Also cancel any child jobs (for All Angles parent)
  const childJobs = await prisma.advisorJob.findMany({
    where: { parentJobId: id, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  });
  for (const child of childJobs) {
    cancelJob(child.id);
    await prisma.advisorJob.update({
      where: { id: child.id },
      data: { status: "CANCELLED" },
    });
  }

  // Update the database
  await prisma.advisorJob.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return Response.json({ success: true, status: "CANCELLED" });
}
