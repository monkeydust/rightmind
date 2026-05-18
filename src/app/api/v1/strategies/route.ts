import { authenticateApiRequest } from "@/lib/api-auth";
import { getStrategySummaries } from "@/lib/strategies";

export async function GET(request: Request) {
  const user = await authenticateApiRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized. Invalid or missing API key." }, { status: 401 });
  }

  const strategies = getStrategySummaries();
  // Map internal structure to the simplified schema agreed upon
  const mappedStrategies = strategies.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    best_for: s.bestFor
  }));

  return Response.json(mappedStrategies);
}
