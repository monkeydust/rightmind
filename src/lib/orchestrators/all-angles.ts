/**
 * All Angles orchestrator (ensemble meta-strategy).
 *
 * Creates 4 child jobs (one per strategy), runs them in parallel via
 * their native orchestrators, polls for completion, then feeds all 4
 * final reports into a Meta-Judge that produces cross-strategy analysis.
 */

import { prisma } from "@/lib/db";
import { callModel } from "@/lib/llm";
import { isJobCancelled, clearCancellation } from "@/lib/cancellation";
import { onJobComplete, onJobFailed } from "@/lib/job-complete";
import { buildUserContent, resolveAgentModel } from "@/lib/file-content";
import { getStrategyById } from "@/lib/strategies";
import { orchestrateParallelAggregate } from "./parallel-aggregate";
import { orchestrateSequentialDebate } from "./sequential-debate";
import { orchestrateManagerWorker } from "./manager-worker";
import { orchestrateMultiRoundConsensus } from "./multi-round-consensus";
import type { StrategyConfig, AgentStepProgress, FileAttachment } from "@/lib/types";

interface OrchestrationOptions {
  jobId: string;
  strategy: StrategyConfig;
  challenge: string;
  promptOverrides?: Record<string, string>;
  includeReasoning?: boolean;
  file?: FileAttachment;
}

const CHILD_STRATEGIES = [
  "consensus-board",
  "deep-dive",
  "stress-tester",
  "round-table",
] as const;

const STRATEGY_LABELS: Record<string, string> = {
  "consensus-board": "🏛️ Consensus Board",
  "deep-dive": "🔬 Deep Dive",
  "stress-tester": "⚔️ Stress Tester",
  "round-table": "🤝 Round Table",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateProgress(
  jobId: string,
  phase: string,
  steps: AgentStepProgress[]
) {
  await prisma.advisorJob.update({
    where: { id: jobId },
    data: {
      progress: JSON.stringify({ currentPhase: phase, steps }),
      status: "RUNNING",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrchestrator(workflow: string) {
  switch (workflow) {
    case "parallel_aggregate": return orchestrateParallelAggregate;
    case "manager_worker": return orchestrateManagerWorker;
    case "sequential_debate": return orchestrateSequentialDebate;
    case "multi_round_consensus": return orchestrateMultiRoundConsensus;
    default: throw new Error(`Unknown workflow: ${workflow}`);
  }
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

export async function orchestrateAllAngles({
  jobId,
  strategy,
  challenge,
  promptOverrides,
  includeReasoning,
  file,
}: OrchestrationOptions): Promise<void> {
  const judgeRole = strategy.judge.role;

  // Build steps: one per child strategy + meta-judge
  const steps: AgentStepProgress[] = [
    ...CHILD_STRATEGIES.map((sid) => ({
      agentRole: STRATEGY_LABELS[sid],
      agentModel: "multi-agent",
      status: "pending" as const,
    })),
    {
      agentRole: "🔮 Meta-Judge",
      agentModel: strategy.judge.model,
      status: "pending" as const,
    },
  ];

  try {
    await updateProgress(jobId, "launching", steps);

    // ───────────────────────────────────────────────────────────────────────
    // PHASE 1: Create child jobs and launch all 4 strategies in parallel
    // ───────────────────────────────────────────────────────────────────────
    console.log(`[Job ${jobId}] All Angles: Launching 4 strategies in parallel...`);
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");

    const childJobIds: string[] = [];

    // Get parent job's userId to assign to child jobs
    const parentJob = await prisma.advisorJob.findUnique({
      where: { id: jobId },
      select: { userId: true },
    });

    // Create all child jobs first (sequential — fast DB writes)
    for (let idx = 0; idx < CHILD_STRATEGIES.length; idx++) {
      const strategyId = CHILD_STRATEGIES[idx];
      const childJob = await prisma.advisorJob.create({
        data: {
          userId: parentJob?.userId,
          challenge,
          strategyId,
          executionMode: "instant",
          status: "PENDING",
          progress: JSON.stringify([]),
          parentJobId: jobId,
        },
      });
      childJobIds[idx] = childJob.id;
    }

    // Mark ALL strategies as running in one write — so the UI shows them all active immediately
    const now = new Date().toISOString();
    for (const step of steps.slice(0, CHILD_STRATEGIES.length)) {
      step.status = "running";
      step.startedAt = now;
    }
    await updateProgress(jobId, "running", steps);

    // Now launch all orchestrators in parallel
    await Promise.all(
      CHILD_STRATEGIES.map(async (strategyId, idx) => {
        const childStrategy = getStrategyById(strategyId);
        if (!childStrategy) throw new Error(`Strategy not found: ${strategyId}`);

        // Launch the child orchestrator
        const orchestrate = getOrchestrator(childStrategy.workflow);
        try {
          await orchestrate({
            jobId: childJobIds[idx],
            strategy: childStrategy,
            challenge,
            promptOverrides,
            includeReasoning,
            file,
          });
          // Mark done
          steps[idx].status = "done";
          steps[idx].completedAt = new Date().toISOString();
          console.log(`[Job ${jobId}] ${STRATEGY_LABELS[strategyId]} done.`);
        } catch (err) {
          console.error(`[All Angles] ${strategyId} failed:`, err);
          steps[idx].status = "failed";
          steps[idx].completedAt = new Date().toISOString();
        }

        await updateProgress(jobId, "running", steps);
      })
    );

    // ───────────────────────────────────────────────────────────────────────
    // Check: at least 3 of 4 must succeed
    // ───────────────────────────────────────────────────────────────────────
    const successCount = steps.slice(0, 4).filter((s) => s.status === "done").length;
    if (successCount < 3) {
      throw new Error(
        `Only ${successCount}/4 strategies completed. Need at least 3 for meaningful meta-analysis.`
      );
    }

    // ───────────────────────────────────────────────────────────────────────
    // PHASE 2: Collect reports from child jobs
    // ───────────────────────────────────────────────────────────────────────
    const childJobs = await prisma.advisorJob.findMany({
      where: { id: { in: childJobIds } },
      select: { id: true, strategyId: true, status: true, report: true },
    });

    const strategyReports = childJobs
      .filter((j) => j.status === "DONE" && j.report)
      .map((j) => ({
        strategyId: j.strategyId,
        label: STRATEGY_LABELS[j.strategyId] || j.strategyId,
        report: j.report!,
      }));

    console.log(`[Job ${jobId}] All Angles: ${strategyReports.length} reports collected. Running Meta-Judge...`);

    // ───────────────────────────────────────────────────────────────────────
    // PHASE 3: Meta-Judge cross-strategy synthesis
    // ───────────────────────────────────────────────────────────────────────
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");
    const metaIdx = steps.length - 1;
    steps[metaIdx].status = "running";
    steps[metaIdx].startedAt = new Date().toISOString();
    await updateProgress(jobId, "meta-synthesis", steps);

    const judgePrompt = strategy.judge.systemPrompt;

    const reportsText = strategyReports
      .map((r) => `# ${r.label} Report\n\n${r.report}`)
      .join("\n\n===\n\n");

    const judgeUserMsg = `# Original Challenge\n\n${challenge}\n\n===\n\n# Strategy Reports\n\n${reportsText}`;

    const judgeResponse = await callModel(
      resolveAgentModel(strategy.judge.model, file),
      [
        { role: "system", content: judgePrompt },
        { role: "user", content: await buildUserContent(judgeUserMsg, file) },
      ],
      {
        temperature: 0.4,
        max_tokens: 8192,
        json: true,
        ...(includeReasoning ? { reasoning: { effort: "high" as const } } : {}),
      }
    );

    // Save meta-judge response
    await prisma.agentResponse.create({
      data: {
        jobId,
        agentRole: judgeRole,
        agentModel: strategy.judge.model,
        round: 1,
        phase: "meta-synthesis",
        prompt: judgePrompt,
        response: judgeResponse.content,
        reasoning: judgeResponse.reasoning || null,
        tokens: judgeResponse.usage.total_tokens,
        durationMs: judgeResponse._durationMs || 0,
      },
    });

    steps[metaIdx].status = "done";
    steps[metaIdx].completedAt = new Date().toISOString();

    // ───────────────────────────────────────────────────────────────────────
    // DONE: Store the JSON meta-synthesis as the report
    // Also store child job IDs for the frontend to look up
    // ───────────────────────────────────────────────────────────────────────
    const reportPayload = JSON.stringify({
      _type: "all-angles",
      childJobIds: childJobIds,
      metaSynthesis: JSON.parse(judgeResponse.content),
    });

    await prisma.advisorJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        report: reportPayload,
        completedAt: new Date(),
        progress: JSON.stringify({ currentPhase: "done", steps }),
      },
    });

    console.log(`[Job ${jobId}] ✅ All Angles complete.`);
    clearCancellation(jobId);
    await onJobComplete(jobId);
  } catch (error) {
    const cancelled = isJobCancelled(jobId);
    clearCancellation(jobId);
    const status = cancelled ? "CANCELLED" : "FAILED";
    const phase = cancelled ? "cancelled" : "failed";
    if (cancelled) console.log(`[Job ${jobId}] 🛑 All Angles cancelled.`);
    else console.error(`[Job ${jobId}] ❌ All Angles failed:`, error);
    await prisma.advisorJob.update({
      where: { id: jobId },
      data: {
        status,
        error: cancelled ? undefined : (error instanceof Error ? error.message : String(error)),
        progress: JSON.stringify({
          currentPhase: phase,
          steps: steps.map((s) =>
            s.status === "running" ? { ...s, status: phase } : s
          ),
        }),
      },
    });

    if (!cancelled) {
      await onJobFailed(jobId);
    }
  }
}
