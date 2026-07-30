/**
 * Server-startup hook (Next.js instrumentation convention).
 *
 * Orchestrators are fire-and-forget promises inside this single process, so
 * they do not survive a restart or redeploy. Any job still PENDING/RUNNING
 * when the server boots is therefore permanently orphaned — the old process
 * that owned it is gone. Without this sweep such jobs spin in the UI forever
 * (production accumulated zombies up to 59 days old).
 *
 * The sweep marks them FAILED and records their true partial spend via
 * recordedSpend(). Children are swept before parents so an All Angles
 * parent's spend can aggregate its children's just-written totals.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { prisma } = await import("@/lib/db");
  const { recordedSpend } = await import("@/lib/job-complete");

  const stuck = await prisma.advisorJob.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true, parentJobId: true, progress: true },
    // children first: parents aggregate child totals in recordedSpend()
    orderBy: { parentJobId: { sort: "desc", nulls: "last" } },
  });
  if (stuck.length === 0) return;

  for (const job of stuck) {
    // Freeze the progress display: anything still "running" failed with it.
    let progress = job.progress;
    try {
      const p = JSON.parse(job.progress);
      if (Array.isArray(p.steps)) {
        for (const s of p.steps) {
          if (s.status === "running" || s.status === "pending") s.status = "failed";
        }
      }
      p.currentPhase = "failed";
      progress = JSON.stringify(p);
    } catch {
      // progress not JSON-parseable — leave as-is
    }

    const spend = await recordedSpend(job.id);
    await prisma.advisorJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error:
          "Interrupted by a server restart — analyses do not survive redeploys. Use RE-RUN to retry.",
        progress,
        ...spend,
      },
    });
  }

  console.log(
    `[startup] Swept ${stuck.length} orphaned job(s) left RUNNING by a previous server process.`
  );
}
