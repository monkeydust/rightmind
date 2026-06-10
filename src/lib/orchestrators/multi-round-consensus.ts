/**
 * Multi-Round Consensus orchestrator (Round Table strategy).
 *
 * Round 1: All agents independently analyse the challenge
 * Round 2+: Each agent sees all others' previous outputs and responds with
 *           structured agree/disagree + revised_answer + confidence
 * Final:   Judge aggregates using confidence-weighted synthesis
 *
 * Consensus threshold: if avg confidence ≥ threshold, stop early.
 */

import { prisma } from "@/lib/db";
import { callModel, parseJSON } from "@/lib/llm";
import { isJobCancelled, clearCancellation } from "@/lib/cancellation";
import { onJobComplete, onJobFailed } from "@/lib/job-complete";
import { buildUserContent, resolveAgentModel } from "@/lib/file-content";
import type { StrategyConfig, AgentStepProgress, RoundTableResponse, FileAttachment } from "@/lib/types";

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

export async function orchestrateMultiRoundConsensus({
  jobId,
  strategy,
  challenge,
  promptOverrides,
  includeReasoning,
  file,
}: OrchestrationOptions): Promise<void> {
  const maxRounds = strategy.maxRounds ?? 3;
  const consensusThreshold = strategy.consensusThreshold ?? 0.8;
  const judgeRole = strategy.judge.role;
  const agents = strategy.agents;

  // Build the full step list for UI (all rounds + judge)
  const allSteps: AgentStepProgress[] = [];
  for (let r = 1; r <= maxRounds; r++) {
    for (const agent of agents) {
      allSteps.push({
        agentRole: `${agent.role} (Round ${r})`,
        agentModel: agent.model,
        status: "pending",
      });
    }
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

    // Track each agent's latest output per round
    const roundOutputs: Map<string, string>[] = [];
    // Track per-agent confidence scores (ConfMAD: confidence-modulated belief updates)
    const confidenceScores: Map<string, number>[] = [];
    const allRoundData: string[] = [];
    let consensusReached = false;
    let roundsCompleted = 0;

    for (let round = 1; round <= maxRounds; round++) {
      console.log(`[Job ${jobId}] Round Table: Round ${round}/${maxRounds}`);
      if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");
      const stepOffset = (round - 1) * agents.length;
      const roundMap = new Map<string, string>();
      const confidenceMap = new Map<string, number>();
      const confidences: number[] = [];

      const agentPromises = agents.map(async (agent, idx) => {
        const stepIdx = stepOffset + idx;
        allSteps[stepIdx].status = "running";
        allSteps[stepIdx].startedAt = new Date().toISOString();
        await updateProgress(jobId, `round-${round}`, allSteps, round, maxRounds);

        const prompt = getPrompt(strategy, agent.role, promptOverrides);

        let userMsg: string;

        if (round === 1) {
          // Round 1: independent analysis (no JSON structure required)
          userMsg = challenge;
        } else {
          // Round 2+: show all other agents' previous outputs WITH confidence scores
          const prevRound = roundOutputs[round - 2]; // 0-indexed
          const prevConfidences = confidenceScores[round - 2];
          const otherOutputs = agents
            .filter((a) => a.role !== agent.role)
            .map((a) => {
              const conf = prevConfidences?.get(a.role);
              const confLabel = conf != null ? ` (confidence: ${conf.toFixed(2)})` : "";
              return `### ${a.role}${confLabel}\n\n${prevRound.get(a.role) || "(no response)"}`;
            })
            .join("\n\n---\n\n");

          userMsg = `# Original Challenge\n\n${challenge}\n\n---\n\n# Other Agents' Analyses (Round ${round - 1})\n\nNote: Each agent's confidence score (0.0–1.0) is shown next to their name.\n\nIMPORTANT — Confidence-weighted debate rules:\n- If YOUR confidence from the previous round was HIGH (≥0.8), you should RESIST changing your position unless presented with compelling new evidence or logic you hadn't considered. Don't cave to social pressure.\n- If YOUR confidence was LOW (<0.6), you should be MORE OPEN to revising your position based on high-confidence arguments from others.\n- A high-confidence disagreement from another agent deserves serious engagement. A low-confidence agreement from another agent should not reinforce your view — it may be uninformed agreement.\n- When you agree with another agent, explicitly state whether you agree for the SAME reasons or DIFFERENT reasons. Same-answer-different-reasoning is a flag, not a consensus.\n\n${otherOutputs}\n\n---\n\nRespond with your structured agree/disagree assessment as valid JSON.`;
        }

        const response = await callModel(
          resolveAgentModel(agent.model, file),
          [
            { role: "system", content: prompt },
            { role: "user", content: await buildUserContent(userMsg, file) },
          ],
          {
            temperature: 0.5,
            ...(round > 1 ? { json: true } : {}),
            ...reasoningOpts(includeReasoning),
          }
        );

        // Save response
        await prisma.agentResponse.create({
          data: {
            jobId,
            agentRole: agent.role,
            agentModel: agent.model,
            round,
            phase: `round-${round}`,
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

        // Extract confidence for rounds 2+ (they return JSON)
        if (round > 1) {
          try {
            const parsed: RoundTableResponse = parseJSON(response.content);
            const conf = parsed.confidence ?? 0.5;
            confidences.push(conf);
            confidenceMap.set(agent.role, conf);
            roundMap.set(agent.role, parsed.revised_answer || response.content);
          } catch {
            // If JSON parse fails, just use the raw text
            confidences.push(0.5);
            confidenceMap.set(agent.role, 0.5);
            roundMap.set(agent.role, response.content);
          }
        } else {
          roundMap.set(agent.role, response.content);
        }

        allSteps[stepIdx].status = "done";
        allSteps[stepIdx].completedAt = new Date().toISOString();
        await updateProgress(jobId, `round-${round}`, allSteps, round, maxRounds);

        console.log(`[Job ${jobId}] ${agent.role} (R${round}) done.`);
        return { role: agent.role, content: response.content };
      });

      const roundResults = await Promise.all(agentPromises);
      roundOutputs.push(roundMap);
      confidenceScores.push(confidenceMap);
      roundsCompleted = round;

      // Format for judge
      allRoundData.push(
        `# Round ${round}\n\n${roundResults.map((r) => `## ${r.role}\n\n${r.content}`).join("\n\n---\n\n")}`
      );

      // Check consensus (only for rounds 2+)
      if (round > 1 && confidences.length > 0) {
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        console.log(`[Job ${jobId}] Round ${round} avg confidence: ${avgConfidence.toFixed(2)} (threshold: ${consensusThreshold})`);

        if (avgConfidence >= consensusThreshold) {
          console.log(`[Job ${jobId}] Consensus reached! Skipping remaining rounds.`);
          consensusReached = true;

          // Mark remaining rounds as skipped
          for (let futureStep = stepOffset + agents.length; futureStep < allSteps.length - 1; futureStep++) {
            allSteps[futureStep].status = "done";
            allSteps[futureStep].completedAt = new Date().toISOString();
          }
          break;
        }
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // FINAL: Judge aggregates all rounds
    // ───────────────────────────────────────────────────────────────────────
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");
    console.log(`[Job ${jobId}] Round Table: Judge aggregating ${roundsCompleted} rounds...`);
    const judgeIdx = allSteps.length - 1;
    allSteps[judgeIdx].status = "running";
    allSteps[judgeIdx].startedAt = new Date().toISOString();
    await updateProgress(jobId, "aggregate", allSteps);

    const judgePrompt = getPrompt(strategy, judgeRole, promptOverrides);

    const consensusNote = consensusReached
      ? `\n\n**Note:** Consensus was reached after ${roundsCompleted} rounds (threshold: ${consensusThreshold}).`
      : `\n\n**Note:** The full ${roundsCompleted} rounds completed without reaching the consensus threshold of ${consensusThreshold}.`;

    const judgeUserMsg = `# Original Challenge\n\n${challenge}\n\n---\n\n${allRoundData.join("\n\n---\n\n")}${consensusNote}`;

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
        round: roundsCompleted,
        phase: "aggregate",
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

    console.log(`[Job ${jobId}] ✅ Round Table complete (${roundsCompleted} rounds, consensus: ${consensusReached}).`);
    clearCancellation(jobId);
    await onJobComplete(jobId);
  } catch (error) {
    const cancelled = isJobCancelled(jobId);
    clearCancellation(jobId);
    const status = cancelled ? "CANCELLED" : "FAILED";
    const phase = cancelled ? "cancelled" : "failed";
    if (cancelled) console.log(`[Job ${jobId}] 🛑 Round Table cancelled.`);
    else console.error(`[Job ${jobId}] ❌ Round Table failed:`, error);
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

    if (!cancelled) {
      await onJobFailed(jobId);
    }
  }
}
