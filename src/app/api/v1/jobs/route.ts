import { prisma } from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getStrategyById } from "@/lib/strategies";
import { orchestrateManagerWorker } from "@/lib/orchestrators/manager-worker";
import { orchestrateParallelAggregate } from "@/lib/orchestrators/parallel-aggregate";
import { orchestrateSequentialDebate } from "@/lib/orchestrators/sequential-debate";
import { orchestrateMultiRoundConsensus } from "@/lib/orchestrators/multi-round-consensus";
import { orchestrateAllAngles } from "@/lib/orchestrators/all-angles";
import type { FileAttachment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await authenticateApiRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized. Invalid or missing API key." }, { status: 401 });
    }

    if (!user.openRouterKey) {
      return Response.json({ error: "No OpenRouter API key configured for this user." }, { status: 403 });
    }

    const body = await request.json();
    const { strategy_id, challenge, include_reasoning, webhook_url, webhook_secret, file } = body;

    if (!challenge || typeof challenge !== "string" || !challenge.trim()) {
      return Response.json({ error: "Challenge text is required" }, { status: 400 });
    }

    if (!strategy_id || typeof strategy_id !== "string") {
      return Response.json({ error: "strategy_id is required" }, { status: 400 });
    }

    const strategy = getStrategyById(strategy_id);
    if (!strategy) {
      return Response.json({ error: `Unknown strategy: "${strategy_id}"` }, { status: 400 });
    }

    // Build file attachment if present
    const fileAttachment: FileAttachment | undefined =
      file && file.file_data && file.file_name && file.mime_type
        ? { fileData: file.file_data, fileName: file.file_name, mimeType: file.mime_type }
        : undefined;

    // Create the job in the database
    const job = await prisma.advisorJob.create({
      data: {
        userId: user.id,
        challenge: challenge.trim(),
        fileName: fileAttachment?.fileName || null,
        strategyId: strategy_id,
        executionMode: "instant",
        status: "PENDING",
        progress: JSON.stringify([]),
        webhookUrl: webhook_url || null,
        webhookSecret: webhook_secret || null,
      },
    });

    const orchestrationOpts = {
      jobId: job.id,
      strategy,
      challenge: challenge.trim(),
      includeReasoning: !!include_reasoning,
      file: fileAttachment,
    };

    // Route to the correct orchestrator
    switch (strategy.workflow) {
      case "manager_worker":
        orchestrateManagerWorker(orchestrationOpts).catch((err) => console.error(err));
        break;
      case "parallel_aggregate":
        orchestrateParallelAggregate(orchestrationOpts).catch((err) => console.error(err));
        break;
      case "sequential_debate":
        orchestrateSequentialDebate(orchestrationOpts).catch((err) => console.error(err));
        break;
      case "multi_round_consensus":
        orchestrateMultiRoundConsensus(orchestrationOpts).catch((err) => console.error(err));
        break;
      case "all_angles":
        orchestrateAllAngles(orchestrationOpts).catch((err) => console.error(err));
        break;
      default:
        await prisma.advisorJob.update({
          where: { id: job.id },
          data: { status: "FAILED", error: "Orchestrator not implemented." },
        });
        break;
    }

    return Response.json({ job_id: job.id, status: "PENDING" }, { status: 202 });
  } catch (error) {
    console.error("API POST /v1/jobs error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
