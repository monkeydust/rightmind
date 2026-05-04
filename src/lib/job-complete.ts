/**
 * Shared post-completion hook for all orchestrators.
 *
 * Called after a job is marked DONE — sends email notification if the user
 * has opted in via their settings.
 */

import { prisma } from "@/lib/db";
import { sendJobCompletionEmail } from "@/lib/email";

const STRATEGY_META: Record<string, { name: string; icon: string }> = {
  "consensus-board": { name: "Consensus Board", icon: "🏛️" },
  "deep-dive": { name: "Deep Dive", icon: "🔬" },
  "round-table": { name: "Round Table", icon: "🤝" },
  "stress-tester": { name: "Stress Tester", icon: "⚔️" },
  "all-angles": { name: "All Angles", icon: "🔮" },
};

export async function onJobComplete(jobId: string): Promise<void> {
  try {
    const job = await prisma.advisorJob.findUnique({
      where: { id: jobId },
      select: {
        challenge: true,
        strategyId: true,
        report: true,
        userId: true,
        user: {
          select: { email: true, emailOnComplete: true },
        },
      },
    });

    if (!job?.user?.emailOnComplete || !job.user.email || !job.report) {
      return;
    }

    const meta = STRATEGY_META[job.strategyId] || {
      name: job.strategyId,
      icon: "📊",
    };

    await sendJobCompletionEmail(job.user.email, {
      jobId,
      challenge: job.challenge,
      strategyName: meta.name,
      strategyIcon: meta.icon,
      report: job.report,
    });
  } catch (error) {
    // Never let email failure crash the orchestrator
    console.error(`[onJobComplete] Failed for job ${jobId}:`, error);
  }
}
