/**
 * GET /api/advisor/strategies/[id]
 *
 * Returns the full strategy config including markdown content for the detail view.
 */

import { getStrategyById } from "@/lib/strategies";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const strategy = getStrategyById(id);

    if (!strategy) {
      return Response.json(
        { error: `Strategy "${id}" not found` },
        { status: 404 }
      );
    }

    // Return everything EXCEPT the full system prompts (keep the response clean)
    // The markdown content includes the research notes and usage guidance
    return Response.json({
      strategy: {
        id: strategy.id,
        name: strategy.name,
        icon: strategy.icon,
        description: strategy.description,
        bestFor: strategy.bestFor,
        workflow: strategy.workflow,
        maxRounds: strategy.maxRounds,
        maxSubTasks: strategy.maxSubTasks,
        consensusThreshold: strategy.consensusThreshold,
        estimatedCost: strategy.estimatedCost,
        estimatedLatency: strategy.estimatedLatency,
        arxivPapers: strategy.arxivPapers,
        agents: strategy.agents.map((a) => ({
          role: a.role,
          model: a.model,
          color: a.color,
          phase: a.phase,
        })),
        judge: {
          role: strategy.judge.role,
          model: strategy.judge.model,
          color: strategy.judge.color,
        },
        content: strategy.content,
      },
    });
  } catch (error) {
    console.error(`Failed to load strategy "${id}":`, error);
    return Response.json(
      { error: "Failed to load strategy" },
      { status: 500 }
    );
  }
}
