/**
 * Manager-Worker orchestrator (Deep Dive strategy).
 *
 * Phase 1: Manager decomposes the challenge into 3-5 sub-tasks (JSON output)
 * Phase 2: Specialist Worker executes each sub-task in parallel
 * Phase 3: Manager reviews all worker outputs → final comprehensive report
 */

import { prisma } from "@/lib/db";
import { callModel } from "@/lib/llm";
import { isJobCancelled, clearCancellation } from "@/lib/cancellation";
import type {
  StrategyConfig,
  AgentStepProgress,
  ManagerDecomposition,
} from "@/lib/types";

interface OrchestrationOptions {
  jobId: string;
  strategy: StrategyConfig;
  challenge: string;
  promptOverrides?: Record<string, string>;
  includeReasoning?: boolean;
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

/** Build reasoning options only if the user opted in */
function reasoningOpts(includeReasoning?: boolean) {
  if (!includeReasoning) return {};
  return { reasoning: { effort: "medium" as const } };
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

export async function orchestrateManagerWorker({
  jobId,
  strategy,
  challenge,
  promptOverrides,
  includeReasoning,
}: OrchestrationOptions): Promise<void> {
  const managerRole = "Manager";
  const workerRole = "Specialist Worker";
  const judgeRole = strategy.judge.role;
  const maxSubTasks = strategy.maxSubTasks ?? 5;

  const steps: AgentStepProgress[] = [
    { agentRole: managerRole, agentModel: getModel(strategy, managerRole), status: "pending" },
    { agentRole: workerRole, agentModel: getModel(strategy, workerRole), status: "pending" },
    { agentRole: judgeRole, agentModel: getModel(strategy, judgeRole), status: "pending" },
  ];

  try {
    // ───────────────────────────────────────────────────────────────────────
    // PHASE 1: Manager decomposes the challenge
    // ───────────────────────────────────────────────────────────────────────
    console.log(`[Job ${jobId}] Phase 1: Manager decomposing challenge...`);
    steps[0].status = "running";
    steps[0].startedAt = new Date().toISOString();
    await updateProgress(jobId, "decompose", steps);

    const managerPrompt = getPrompt(strategy, managerRole, promptOverrides);
    const managerResponse = await callModel(
      getModel(strategy, managerRole),
      [
        { role: "system", content: managerPrompt },
        { role: "user", content: challenge },
      ],
      { json: true, temperature: 0.4, ...reasoningOpts(includeReasoning) }
    );

    // Save the manager response
    await prisma.agentResponse.create({
      data: {
        jobId,
        agentRole: managerRole,
        agentModel: getModel(strategy, managerRole),
        round: 1,
        phase: "decompose",
        prompt: managerPrompt,
        response: managerResponse.content,
        reasoning: managerResponse.reasoning || null,
        tokens: managerResponse.usage.total_tokens,
        durationMs: managerResponse._durationMs || 0,
      },
    });

    // Parse the decomposition
    let decomposition: ManagerDecomposition;
    try {
      decomposition = JSON.parse(managerResponse.content);
    } catch {
      throw new Error(
        `Manager returned invalid JSON. Raw response:\n${managerResponse.content}`
      );
    }

    if (!decomposition.sub_tasks || decomposition.sub_tasks.length === 0) {
      throw new Error("Manager produced zero sub-tasks.");
    }

    // Cap at maxSubTasks
    const subTasks = decomposition.sub_tasks.slice(0, maxSubTasks);

    steps[0].status = "done";
    steps[0].completedAt = new Date().toISOString();
    console.log(
      `[Job ${jobId}] Phase 1 complete: ${subTasks.length} sub-tasks. Summary: ${decomposition.challenge_summary}`
    );

    // Update steps to include individual worker tasks
    const workerSteps: AgentStepProgress[] = subTasks.map((t) => ({
      agentRole: `${workerRole} — ${t.title}`,
      agentModel: getModel(strategy, workerRole),
      status: "pending" as const,
    }));

    const fullSteps = [steps[0], ...workerSteps, steps[2]];
    await updateProgress(jobId, "execute", fullSteps);

    // ───────────────────────────────────────────────────────────────────────
    // PHASE 2: Workers execute sub-tasks in parallel
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");
    // ───────────────────────────────────────────────────────────────────────
    console.log(`[Job ${jobId}] Phase 2: Executing ${subTasks.length} sub-tasks in parallel...`);

    const workerPrompt = getPrompt(strategy, workerRole, promptOverrides);
    const workerModel = getModel(strategy, workerRole);

    const workerResults = await Promise.all(
      subTasks.map(async (task, idx) => {
        // Mark this worker as running
        workerSteps[idx].status = "running";
        workerSteps[idx].startedAt = new Date().toISOString();
        const currentSteps = [steps[0], ...workerSteps, steps[2]];
        await updateProgress(jobId, "execute", currentSteps);

        const taskPromptForWorker = `## Sub-Task ${task.id}: ${task.title}\n\n${task.description}\n\n**Expertise needed:** ${task.expertise_needed}\n**Expected output:** ${task.expected_output}`;

        const workerResponse = await callModel(
          workerModel,
          [
            { role: "system", content: workerPrompt },
            { role: "user", content: taskPromptForWorker },
          ],
          { temperature: 0.6, ...reasoningOpts(includeReasoning) }
        );

        // Save worker response
        await prisma.agentResponse.create({
          data: {
            jobId,
            agentRole: `${workerRole} — Task ${task.id}`,
            agentModel: workerModel,
            round: 1,
            phase: "execute",
            prompt: `${workerPrompt}\n\n---\n\n${taskPromptForWorker}`,
            response: workerResponse.content,
            reasoning: workerResponse.reasoning || null,
            tokens: workerResponse.usage.total_tokens,
            durationMs: workerResponse._durationMs || 0,
          },
        });

        // Mark done
        workerSteps[idx].status = "done";
        workerSteps[idx].completedAt = new Date().toISOString();
        const updatedSteps = [steps[0], ...workerSteps, steps[2]];
        await updateProgress(jobId, "execute", updatedSteps);

        console.log(`[Job ${jobId}] Worker ${idx + 1}/${subTasks.length} done: "${task.title}"`);
        return { task, response: workerResponse.content };
      })
    );

    // ───────────────────────────────────────────────────────────────────────
    // PHASE 3: Manager review (Judge)
    if (isJobCancelled(jobId)) throw new Error("Job cancelled by user");
    // ───────────────────────────────────────────────────────────────────────
    console.log(`[Job ${jobId}] Phase 3: Manager reviewing all worker outputs...`);
    const judgeIdx = fullSteps.length - 1;
    fullSteps[judgeIdx].status = "running";
    fullSteps[judgeIdx].startedAt = new Date().toISOString();
    await updateProgress(jobId, "review", fullSteps);

    const judgePrompt = getPrompt(strategy, judgeRole, promptOverrides);

    // Build the context for the judge: original challenge + all worker outputs
    const workerOutputs = workerResults
      .map(
        (r) =>
          `## Sub-Task ${r.task.id}: ${r.task.title}\n\n**Expertise:** ${r.task.expertise_needed}\n\n### Specialist Output:\n${r.response}`
      )
      .join("\n\n---\n\n");

    const judgeUserMessage = `# Original Challenge\n\n${challenge}\n\n---\n\n# Manager's Decomposition\n\n**Summary:** ${decomposition.challenge_summary}\n**Rationale:** ${decomposition.decomposition_rationale}\n\n---\n\n# Specialist Worker Outputs\n\n${workerOutputs}`;

    const judgeResponse = await callModel(
      getModel(strategy, judgeRole),
      [
        { role: "system", content: judgePrompt },
        { role: "user", content: judgeUserMessage },
      ],
      { temperature: 0.5, max_tokens: 8192, ...reasoningOpts(includeReasoning) }
    );

    // Save the judge response
    await prisma.agentResponse.create({
      data: {
        jobId,
        agentRole: judgeRole,
        agentModel: getModel(strategy, judgeRole),
        round: 1,
        phase: "review",
        prompt: judgePrompt,
        response: judgeResponse.content,
        reasoning: judgeResponse.reasoning || null,
        tokens: judgeResponse.usage.total_tokens,
        durationMs: judgeResponse._durationMs || 0,
      },
    });

    fullSteps[judgeIdx].status = "done";
    fullSteps[judgeIdx].completedAt = new Date().toISOString();

    // ───────────────────────────────────────────────────────────────────────
    // DONE: Update job with final report
    // ───────────────────────────────────────────────────────────────────────
    await prisma.advisorJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        report: judgeResponse.content,
        completedAt: new Date(),
        progress: JSON.stringify({ currentPhase: "done", steps: fullSteps }),
      },
    });

    console.log(`[Job ${jobId}] ✅ Complete.`);
    clearCancellation(jobId);
  } catch (error) {
    const cancelled = isJobCancelled(jobId);
    clearCancellation(jobId);
    const status = cancelled ? "CANCELLED" : "FAILED";
    const phase = cancelled ? "cancelled" : "failed";
    if (cancelled) console.log(`[Job ${jobId}] 🛑 Cancelled by user.`);
    else console.error(`[Job ${jobId}] ❌ Failed:`, error);
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
  }
}
