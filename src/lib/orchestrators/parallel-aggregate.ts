/**
 * Parallel-Aggregate orchestrator (Consensus Board strategy).
 *
 * Phase 1: All agents analyse the challenge in parallel (independent perspectives)
 * Phase 2: Judge synthesises all agent outputs into a single executive briefing
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

export async function orchestrateParallelAggregate({
  jobId,
  strategy,
  challenge,
  promptOverrides,
  includeReasoning,
  file,
}: OrchestrationOptions): Promise<void> {
  const judgeRole = strategy.judge.role;

  // Build initial step list: all agents + judge
  const agentSteps: AgentStepProgress[] = strategy.agents.map((a) => ({
    agentRole: a.role,
    agentModel: a.model,
    status: "pending" as const,
  }));

  const judgeStep: AgentStepProgress = {
    agentRole: judgeRole,
    agentModel: getModel(strategy, judgeRole),
    status: "pending",
  };

  const allSteps = [...agentSteps, judgeStep];

  try {
    // ───────────────────────────────────────────────────────────────────────
    // PHASE 1: All agents analyse in parallel
    // ───────────────────────────────────────────────────────────────────────
    let totalCostUsd = 0;
    let totalTokens = 0;

    console.log(`[Job ${jobId}] Consensus Board: ${strategy.agents.length} agents running in parallel...`);
    await updateProgress(jobId, "analyse", allSteps);

    const agentResults = await Promise.all(
      strategy.agents.map(async (agent, idx) => {
        // Mark running
        agentSteps[idx].status = "running";
        agentSteps[idx].startedAt = new Date().toISOString();
        await updateProgress(jobId, "analyse", [...agentSteps, judgeStep]);

        const prompt = getPrompt(strategy, agent.role, promptOverrides);
        const model = resolveAgentModel(agent.model, file);
        const response = await callModel(
          model,
          [
            { role: "system", content: prompt },
            { role: "user", content: await buildUserContent(challenge, file) },
          ],
          { temperature: 0.6, ...reasoningOpts(includeReasoning) }
        );

        // Save
        await prisma.agentResponse.create({
          data: {
            jobId,
            agentRole: agent.role,
            agentModel: agent.model,
            round: 1,
            phase: "analyse",
            prompt,
            response: response.content,
            reasoning: response.reasoning || null,
            tokens: response.usage.total_tokens,
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            costUsd: response.usage.costUsd,
            durationMs: response._durationMs || 0,
          },
        });

        totalCostUsd += response.usage.costUsd;
        totalTokens += response.usage.total_tokens;

        // Mark done
        agentSteps[idx].status = "done";
        agentSteps[idx].completedAt = new Date().toISOString();
        await updateProgress(jobId, "analyse", [...agentSteps, judgeStep]);

        console.log(`[Job ${jobId}] ${agent.role} done.`);
        return { role: agent.role, content: response.content };
      })
    );

    // ───────────────────────────────────────────────────────────────────────
    // PHASE 2: Judge synthesises all outputs
    // ───────────────────────────────────────────────────────────────────────
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");

    console.log(`[Job ${jobId}] Consensus Board: Judge synthesising...`);
    judgeStep.status = "running";
    judgeStep.startedAt = new Date().toISOString();
    await updateProgress(jobId, "synthesise", [...agentSteps, judgeStep]);

    const judgePrompt = getPrompt(strategy, judgeRole, promptOverrides);

    const advisorOutputs = agentResults
      .map((r) => `## ${r.role}\n\n${r.content}`)
      .join("\n\n---\n\n");

    const judgeUserMessage = `# Original Challenge\n\n${challenge}\n\n---\n\n# Advisory Board Analyses\n\n${advisorOutputs}`;

    const judgeResponse = await callModel(
      resolveAgentModel(getModel(strategy, judgeRole), file),
      [
        { role: "system", content: judgePrompt },
        { role: "user", content: await buildUserContent(judgeUserMessage, file) },
      ],
      { temperature: 0.5, max_tokens: 16384, ...reasoningOpts(includeReasoning) }
    );

    await prisma.agentResponse.create({
      data: {
        jobId,
        agentRole: judgeRole,
        agentModel: getModel(strategy, judgeRole),
        round: 1,
        phase: "synthesise",
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

    judgeStep.status = "done";
    judgeStep.completedAt = new Date().toISOString();

    // ─── DONE ─────────────────────────────────────────────────────────────
    await prisma.advisorJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        report: judgeResponse.content,
        completedAt: new Date(),
        totalCostUsd,
        totalTokens,
        progress: JSON.stringify({ currentPhase: "done", steps: [...agentSteps, judgeStep] }),
      },
    });

    console.log(`[Job ${jobId}] ✅ Consensus Board complete.`);
    clearCancellation(jobId);
    await onJobComplete(jobId);
  } catch (error) {
    const cancelled = isJobCancelled(jobId);
    clearCancellation(jobId);

    if (cancelled) {
      console.log(`[Job ${jobId}] 🛑 Consensus Board cancelled by user.`);
      await prisma.advisorJob.update({
        where: { id: jobId },
        data: {
          status: "CANCELLED",
          progress: JSON.stringify({
            currentPhase: "cancelled",
            steps: allSteps.map((s) =>
              s.status === "running" ? { ...s, status: "cancelled" } : s
            ),
          }),
        },
      });
    } else {
      console.error(`[Job ${jobId}] ❌ Consensus Board failed:`, error);
      await prisma.advisorJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          progress: JSON.stringify({
            currentPhase: "failed",
            steps: allSteps.map((s) =>
              s.status === "running" ? { ...s, status: "failed" } : s
            ),
          }),
        },
      });
    }
  }
}
