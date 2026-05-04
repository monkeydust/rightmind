/**
 * POST /api/advisor/submit
 *
 * Accepts a challenge submission, creates an AdvisorJob in the database,
 * and kicks off the appropriate orchestrator in the background.
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getStrategyById } from "@/lib/strategies";
import { orchestrateManagerWorker } from "@/lib/orchestrators/manager-worker";
import { orchestrateParallelAggregate } from "@/lib/orchestrators/parallel-aggregate";
import { orchestrateSequentialDebate } from "@/lib/orchestrators/sequential-debate";
import { orchestrateMultiRoundConsensus } from "@/lib/orchestrators/multi-round-consensus";
import { orchestrateAllAngles } from "@/lib/orchestrators/all-angles";

interface SubmitRequest {
  challenge: string;
  strategyId: string;
  executionMode: "instant" | "overnight";
  promptOverrides?: Record<string, string>;
  includeReasoning?: boolean;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check the user has an API key before allowing job submission
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { openRouterKey: true },
    });

    if (!user?.openRouterKey) {
      return Response.json(
        { error: "No OpenRouter API key configured. Please add your key in Settings before running a job." },
        { status: 403 }
      );
    }

    const body: SubmitRequest = await request.json();

    // Validate inputs
    if (!body.challenge?.trim()) {
      return Response.json(
        { error: "Challenge text is required" },
        { status: 400 }
      );
    }

    if (!body.strategyId) {
      return Response.json(
        { error: "Strategy selection is required" },
        { status: 400 }
      );
    }

    const strategy = getStrategyById(body.strategyId);
    if (!strategy) {
      return Response.json(
        { error: `Unknown strategy: "${body.strategyId}"` },
        { status: 400 }
      );
    }

    // Create the job in the database
    const job = await prisma.advisorJob.create({
      data: {
        userId: session.user.id,
        challenge: body.challenge.trim(),
        strategyId: body.strategyId,
        executionMode: "instant",
        status: "PENDING",
        progress: JSON.stringify([]),
      },
    });

    // Fire-and-forget: kick off the orchestrator
    const orchestrationOpts = {
      jobId: job.id,
      strategy,
      challenge: body.challenge.trim(),
      promptOverrides: body.promptOverrides,
      includeReasoning: body.includeReasoning,
    };

    // Route to the correct orchestrator based on workflow type
    switch (strategy.workflow) {
      case "manager_worker":
        orchestrateManagerWorker(orchestrationOpts).catch((err) =>
          console.error(`[Orchestrator] manager_worker failed for job ${job.id}:`, err)
        );
        break;
      case "parallel_aggregate":
        orchestrateParallelAggregate(orchestrationOpts).catch((err) =>
          console.error(`[Orchestrator] parallel_aggregate failed for job ${job.id}:`, err)
        );
        break;
      case "sequential_debate":
        orchestrateSequentialDebate(orchestrationOpts).catch((err) =>
          console.error(`[Orchestrator] sequential_debate failed for job ${job.id}:`, err)
        );
        break;
      case "multi_round_consensus":
        orchestrateMultiRoundConsensus(orchestrationOpts).catch((err) =>
          console.error(`[Orchestrator] multi_round_consensus failed for job ${job.id}:`, err)
        );
        break;
      case "all_angles":
        orchestrateAllAngles(orchestrationOpts).catch((err) =>
          console.error(`[Orchestrator] all_angles failed for job ${job.id}:`, err)
        );
        break;
      default:
        await prisma.advisorJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: `Orchestrator for workflow "${strategy.workflow}" is not yet implemented.`,
          },
        });
        break;
    }

    return Response.json({
      jobId: job.id,
      status: "PENDING",
      message: "Job created. Analysis starting now.",
    });
  } catch (error) {
    console.error("Failed to submit job:", error);
    return Response.json(
      { error: "Failed to submit challenge" },
      { status: 500 }
    );
  }
}
