/**
 * Sequential-Debate orchestrator (Stress Tester strategy).
 *
 * Phase 1: Proposer builds the strongest case FOR the idea
 * Phase 2: Devil's Advocate tears it apart
 * Phase 3: Refiner addresses valid critiques and strengthens the proposal
 * (Phases 1-3 can repeat for maxRounds)
 * Final:   Judge produces the hardened solution
 */

import { prisma } from "@/lib/db";
import { callModel } from "@/lib/llm";
import { isJobCancelled, clearCancellation } from "@/lib/cancellation";
import { onJobComplete, onJobFailed } from "@/lib/job-complete";
import { buildUserContent, resolveAgentModel } from "@/lib/file-content";
import type { StrategyConfig, AgentStepProgress, FileAttachment } from "@/lib/types";

interface OrchestrationOptions {
  jobId: string;
  strategy: StrategyConfig;
  challenge: string;
  promptOverrides?: Record<string, string>;
  includeReasoning?: boolean;
  file?: FileAttachment;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateProgress(
  jobId: string,
  phase: string,
  steps: AgentStepProgress[],
  round?: number,
  totalRounds?: number
) {
  await prisma.advisorJob.update({
    where: { id: jobId },
    data: {
      progress: JSON.stringify({
        currentPhase: phase,
        currentRound: round,
        totalRounds,
        steps,
      }),
      status: "RUNNING",
    },
  });
}

function getPrompt(
  strategy: StrategyConfig,
  role: string,
  overrides?: Record<string, string>
): string {
  if (overrides?.[role]) return overrides[role];
  const agent = strategy.agents.find((a) => a.role === role);
  if (agent) return agent.systemPrompt;
  if (strategy.judge.role === role) return strategy.judge.systemPrompt;
  throw new Error(`No prompt found for role: ${role}`);
}

function getModel(strategy: StrategyConfig, role: string): string {
  const agent = strategy.agents.find((a) => a.role === role);
  if (agent) return agent.model;
  if (strategy.judge.role === role) return strategy.judge.model;
  throw new Error(`No model found for role: ${role}`);
}

function reasoningOpts(includeReasoning?: boolean) {
  if (!includeReasoning) return {};
  return { reasoning: { effort: "medium" as const } };
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

export async function orchestrateSequentialDebate({
  jobId,
  strategy,
  challenge,
  promptOverrides,
  includeReasoning,
  file,
}: OrchestrationOptions): Promise<void> {
  const maxRounds = strategy.maxRounds ?? 2;
  const judgeRole = strategy.judge.role;

  // The debate chain: Proposer → Devil's Advocate → Refiner
  const proposerRole = "Proposer";
  const criticRole = "Devil's Advocate";
  const refinerRole = "Refiner";

  // Build step list for all rounds
  const allSteps: AgentStepProgress[] = [];
  for (let r = 1; r <= maxRounds; r++) {
    allSteps.push(
      { agentRole: `${proposerRole}${maxRounds > 1 ? ` (Round ${r})` : ""}`, agentModel: getModel(strategy, proposerRole), status: "pending" },
      { agentRole: `${criticRole}${maxRounds > 1 ? ` (Round ${r})` : ""}`, agentModel: getModel(strategy, criticRole), status: "pending" },
      { agentRole: `${refinerRole}${maxRounds > 1 ? ` (Round ${r})` : ""}`, agentModel: getModel(strategy, refinerRole), status: "pending" }
    );
  }
  const judgeStep: AgentStepProgress = {
    agentRole: judgeRole,
    agentModel: getModel(strategy, judgeRole),
    status: "pending",
  };
  allSteps.push(judgeStep);

  try {
    let totalCostUsd = 0;
    let totalTokens = 0;

    let proposalText = "";
    let critiqueText = "";
    let refinedText = "";

    // Accumulate debate history for the judge
    const debateHistory: string[] = [];

    for (let round = 1; round <= maxRounds; round++) {
      const stepOffset = (round - 1) * 3;
      console.log(`[Job ${jobId}] Stress Tester: Round ${round}/${maxRounds}`);
      if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");

      // ─── Proposer ─────────────────────────────────────────────────────
      const proposerStep = allSteps[stepOffset];
      proposerStep.status = "running";
      proposerStep.startedAt = new Date().toISOString();
      await updateProgress(jobId, "draft", allSteps, round, maxRounds);

      const proposerPrompt = getPrompt(strategy, proposerRole, promptOverrides);

      // In round 1, propose from scratch. In later rounds, revise based on critique.
      const proposerUserMsg = round === 1
        ? challenge
        : `# Original Challenge\n\n${challenge}\n\n---\n\n# Previous Critique\n\n${critiqueText}\n\n---\n\n# Your Previous Refined Proposal\n\n${refinedText}\n\n---\n\nBased on the above critique of your refined proposal, produce an EVEN STRONGER version. Address every valid point.`;

      const proposerResponse = await callModel(
        resolveAgentModel(getModel(strategy, proposerRole), file),
        [
          { role: "system", content: proposerPrompt },
          { role: "user", content: await buildUserContent(proposerUserMsg, file) },
        ],
        { temperature: 0.6, ...reasoningOpts(includeReasoning) }
      );

      proposalText = proposerResponse.content;

      await prisma.agentResponse.create({
        data: {
          jobId,
          agentRole: proposerRole,
          agentModel: getModel(strategy, proposerRole),
          round,
          phase: "draft",
          prompt: proposerPrompt,
          response: proposalText,
          reasoning: proposerResponse.reasoning || null,
          tokens: proposerResponse.usage.total_tokens,
          promptTokens: proposerResponse.usage.prompt_tokens,
          completionTokens: proposerResponse.usage.completion_tokens,
          costUsd: proposerResponse.usage.costUsd,
          durationMs: proposerResponse._durationMs || 0,
        },
      });

      totalCostUsd += proposerResponse.usage.costUsd;
      totalTokens += proposerResponse.usage.total_tokens;

      proposerStep.status = "done";
      proposerStep.completedAt = new Date().toISOString();
      debateHistory.push(`## Round ${round} — Proposal\n\n${proposalText}`);
      console.log(`[Job ${jobId}] Proposer (R${round}) done.`);

      // ─── Devil's Advocate ─────────────────────────────────────────────
      const criticStep = allSteps[stepOffset + 1];
      criticStep.status = "running";
      criticStep.startedAt = new Date().toISOString();
      await updateProgress(jobId, "critique", allSteps, round, maxRounds);

      const criticPrompt = getPrompt(strategy, criticRole, promptOverrides);

      const criticUserMsg = `# Original Challenge\n\n${challenge}\n\n---\n\n# Proposal to Critique\n\n${proposalText}`;

      const criticResponse = await callModel(
        resolveAgentModel(getModel(strategy, criticRole), file),
        [
          { role: "system", content: criticPrompt },
          { role: "user", content: await buildUserContent(criticUserMsg, file) },
        ],
        { temperature: 0.6, ...reasoningOpts(includeReasoning) }
      );

      critiqueText = criticResponse.content;

      await prisma.agentResponse.create({
        data: {
          jobId,
          agentRole: criticRole,
          agentModel: getModel(strategy, criticRole),
          round,
          phase: "critique",
          prompt: criticPrompt,
          response: critiqueText,
          reasoning: criticResponse.reasoning || null,
          tokens: criticResponse.usage.total_tokens,
          promptTokens: criticResponse.usage.prompt_tokens,
          completionTokens: criticResponse.usage.completion_tokens,
          costUsd: criticResponse.usage.costUsd,
          durationMs: criticResponse._durationMs || 0,
        },
      });

      totalCostUsd += criticResponse.usage.costUsd;
      totalTokens += criticResponse.usage.total_tokens;

      criticStep.status = "done";
      criticStep.completedAt = new Date().toISOString();
      debateHistory.push(`## Round ${round} — Critique\n\n${critiqueText}`);
      console.log(`[Job ${jobId}] Devil's Advocate (R${round}) done.`);

      // ─── Refiner ──────────────────────────────────────────────────────
      const refinerStep = allSteps[stepOffset + 2];
      refinerStep.status = "running";
      refinerStep.startedAt = new Date().toISOString();
      await updateProgress(jobId, "refine", allSteps, round, maxRounds);

      const refinerPrompt = getPrompt(strategy, refinerRole, promptOverrides);

      const refinerUserMsg = `# Original Challenge\n\n${challenge}\n\n---\n\n# Proposal\n\n${proposalText}\n\n---\n\n# Devil's Advocate Critique\n\n${critiqueText}\n\n---\n\nProduce a STRONGER, REVISED version that addresses the valid criticisms.`;

      const refinerResponse = await callModel(
        resolveAgentModel(getModel(strategy, refinerRole), file),
        [
          { role: "system", content: refinerPrompt },
          { role: "user", content: await buildUserContent(refinerUserMsg, file) },
        ],
        { temperature: 0.5, ...reasoningOpts(includeReasoning) }
      );

      refinedText = refinerResponse.content;

      await prisma.agentResponse.create({
        data: {
          jobId,
          agentRole: refinerRole,
          agentModel: getModel(strategy, refinerRole),
          round,
          phase: "refine",
          prompt: refinerPrompt,
          response: refinedText,
          reasoning: refinerResponse.reasoning || null,
          tokens: refinerResponse.usage.total_tokens,
          promptTokens: refinerResponse.usage.prompt_tokens,
          completionTokens: refinerResponse.usage.completion_tokens,
          costUsd: refinerResponse.usage.costUsd,
          durationMs: refinerResponse._durationMs || 0,
        },
      });

      totalCostUsd += refinerResponse.usage.costUsd;
      totalTokens += refinerResponse.usage.total_tokens;

      refinerStep.status = "done";
      refinerStep.completedAt = new Date().toISOString();
      debateHistory.push(`## Round ${round} — Refined Proposal\n\n${refinedText}`);
      console.log(`[Job ${jobId}] Refiner (R${round}) done.`);
    }

    // ───────────────────────────────────────────────────────────────────────
    // FINAL: Judge produces hardened solution
    // ───────────────────────────────────────────────────────────────────────
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");
    console.log(`[Job ${jobId}] Stress Tester: Judge producing hardened solution...`);
    const judgeIdx = allSteps.length - 1;
    allSteps[judgeIdx].status = "running";
    allSteps[judgeIdx].startedAt = new Date().toISOString();
    await updateProgress(jobId, "judge", allSteps);

    const judgePrompt = getPrompt(strategy, judgeRole, promptOverrides);
    const judgeUserMsg = `# Original Challenge\n\n${challenge}\n\n---\n\n# Full Debate History\n\n${debateHistory.join("\n\n---\n\n")}`;

    const judgeResponse = await callModel(
      resolveAgentModel(getModel(strategy, judgeRole), file),
      [
        { role: "system", content: judgePrompt },
        { role: "user", content: await buildUserContent(judgeUserMsg, file) },
      ],
      { temperature: 0.5, max_tokens: 16384, ...reasoningOpts(includeReasoning) }
    );

    await prisma.agentResponse.create({
      data: {
        jobId,
        agentRole: judgeRole,
        agentModel: getModel(strategy, judgeRole),
        round: maxRounds,
        phase: "judge",
        prompt: judgePrompt,
        response: judgeResponse.content,
        reasoning: judgeResponse.reasoning || null,
        tokens: judgeResponse.usage.total_tokens,
        promptTokens: judgeResponse.usage.prompt_tokens,
        completionTokens: judgeResponse.usage.completion_tokens,
        costUsd: judgeResponse.usage.costUsd,
        durationMs: judgeResponse._durationMs || 0,
      },
    });

    totalCostUsd += judgeResponse.usage.costUsd;
    totalTokens += judgeResponse.usage.total_tokens;

    allSteps[judgeIdx].status = "done";
    allSteps[judgeIdx].completedAt = new Date().toISOString();

    // ─── DONE ─────────────────────────────────────────────────────────────
    await prisma.advisorJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        report: judgeResponse.content,
        completedAt: new Date(),
        totalCostUsd,
        totalTokens,
        progress: JSON.stringify({ currentPhase: "done", steps: allSteps }),
      },
    });

    console.log(`[Job ${jobId}] ✅ Stress Tester complete.`);
    clearCancellation(jobId);
    await onJobComplete(jobId);
  } catch (error) {
    const cancelled = isJobCancelled(jobId);
    clearCancellation(jobId);
    const status = cancelled ? "CANCELLED" : "FAILED";
    const phase = cancelled ? "cancelled" : "failed";
    if (cancelled) console.log(`[Job ${jobId}] 🛑 Stress Tester cancelled.`);
    else console.error(`[Job ${jobId}] ❌ Stress Tester failed:`, error);
    await prisma.advisorJob.update({
      where: { id: jobId },
      data: {
        status,
        error: cancelled ? undefined : (error instanceof Error ? error.message : String(error)),
        progress: JSON.stringify({
          currentPhase: phase,
          steps: allSteps.map((s) =>
            s.status === "running" ? { ...s, status: phase } : s
          ),
        }),
      },
    });
  }
}
