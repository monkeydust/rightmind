/**
 * Shared post-completion hook for all orchestrators.
 *
 * Called after a job is marked DONE — sends email notification if the user
 * has opted in via their settings.
 */

import { prisma } from "@/lib/db";
import { sendJobCompletionEmail, sendJobFailureEmail } from "@/lib/email";
import { sendJobWebhook } from "@/lib/webhook";

const STRATEGY_META: Record<string, { name: string; icon: string }> = {
  "consensus-board": { name: "Consensus Board", icon: "🏛️" },
  "deep-dive": { name: "Deep Dive", icon: "🔬" },
  "round-table": { name: "Round Table", icon: "🤝" },
  "stress-tester": { name: "Stress Tester", icon: "⚔️" },
  "all-angles": { name: "All Angles", icon: "🔮" },
};

/**
 * True spend for a job, recovered from its persisted AgentResponse rows
 * (plus child-job totals, for All Angles parents).
 *
 * Used on the FAILED/CANCELLED paths: the orchestrators' in-memory cost
 * accumulators are only flushed on success, but partial spend is real
 * spend — the per-call rows are written as each call returns, so they are
 * the source of truth when a job dies partway through.
 */
export async function recordedSpend(
  jobId: string
): Promise<{ totalCostUsd: number; totalTokens: number }> {
  const own = await prisma.agentResponse.aggregate({
    where: { jobId },
    _sum: { costUsd: true, tokens: true },
  });
  const children = await prisma.advisorJob.aggregate({
    where: { parentJobId: jobId },
    _sum: { totalCostUsd: true, totalTokens: true },
  });
  return {
    totalCostUsd: (own._sum.costUsd ?? 0) + (children._sum.totalCostUsd ?? 0),
    totalTokens: (own._sum.tokens ?? 0) + (children._sum.totalTokens ?? 0),
  };
}

export async function onJobComplete(jobId: string): Promise<void> {
  try {
    const job = await prisma.advisorJob.findUnique({
      where: { id: jobId },
      select: {
        challenge: true,
        strategyId: true,
        report: true,
        userId: true,
        parentJobId: true,
        status: true,
        webhookUrl: true,
        webhookSecret: true,
        user: {
          select: { email: true, emailOnComplete: true },
        },
      },
    });

    if (!job || job.parentJobId) return;

    // Webhook Delivery
    if (job.webhookUrl) {
      let reportPayload = job.report;
      if (job.status === "DONE" && job.report) {
        try {
          reportPayload = JSON.parse(job.report);
        } catch {
          // Leave as string
        }
      }

      await sendJobWebhook(job.webhookUrl, job.webhookSecret, {
        job_id: jobId,
        status: job.status,
        report: reportPayload,
      });
    }

    // Skip email if disabled or missing report
    if (!job.user?.emailOnComplete || !job.user.email || !job.report) {
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

export async function onJobFailed(jobId: string): Promise<void> {
  try {
    const job = await prisma.advisorJob.findUnique({
      where: { id: jobId },
      select: {
        strategyId: true,
        error: true,
        userId: true,
        parentJobId: true,
        status: true,
        webhookUrl: true,
        webhookSecret: true,
        user: {
          select: { email: true, emailOnComplete: true },
        },
      },
    });

    if (!job || job.parentJobId) return;

    // Webhook Delivery for failure
    if (job.webhookUrl) {
      await sendJobWebhook(job.webhookUrl, job.webhookSecret, {
        job_id: jobId,
        status: job.status,
        error: job.error || "Unknown error",
      });
    }

    if (!job.user?.emailOnComplete || !job.user.email) {
      return;
    }

    const meta = STRATEGY_META[job.strategyId] || {
      name: job.strategyId,
      icon: "📊",
    };

    await sendJobFailureEmail(job.user.email, {
      jobId,
      strategyName: meta.name,
      strategyIcon: meta.icon,
      errorMessage: job.error || "Unknown error occurred during analysis.",
    });
  } catch (error) {
    console.error(`[onJobFailed] Failed to process failure for job ${jobId}:`, error);
  }
}
