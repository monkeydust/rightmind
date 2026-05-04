/**
 * GET /api/advisor/strategies
 *
 * Returns summaries of all available strategies (without full system prompts).
 * Used by the frontend to render strategy selection cards.
 */

import { getStrategySummaries } from "@/lib/strategies";

export async function GET() {
  try {
    const strategies = getStrategySummaries();
    return Response.json({ strategies });
  } catch (error) {
    console.error("Failed to load strategies:", error);
    return Response.json(
      { error: "Failed to load strategies" },
      { status: 500 }
    );
  }
}
