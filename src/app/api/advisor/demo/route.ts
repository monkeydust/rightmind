/**
 * POST /api/advisor/demo
 *
 * Returns an existing demo job for the user (seeded on first login).
 * If no seeded demo exists, seeds it on-demand then returns the ID.
 *
 * Body: { demoIndex: 0 | 1 }
 *   0 = Bristol bakery (deep-dive fixture)
 *   1 = London housing (all-angles fixture)
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { seedDemoJobs } from "@/lib/seed-demo";
import demoFixtures from "@/lib/demo-fixtures.json";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { demoIndex } = await request.json();
  const fixture = demoFixtures[demoIndex as number];
  if (!fixture) {
    return Response.json({ error: "Invalid demo index" }, { status: 400 });
  }

  // Look for an existing seeded job matching this fixture's challenge text
  let job = await prisma.advisorJob.findFirst({
    where: {
      userId: session.user.id,
      challenge: fixture.challenge,
      status: "DONE",
      parentJobId: null,
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  // If not found, seed all demo jobs for this user then retry
  if (!job) {
    await seedDemoJobs(session.user.id);
    job = await prisma.advisorJob.findFirst({
      where: {
        userId: session.user.id,
        challenge: fixture.challenge,
        status: "DONE",
        parentJobId: null,
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!job) {
    return Response.json({ error: "Demo job could not be created" }, { status: 500 });
  }

  return Response.json({ jobId: job.id });
}
