/**
 * GET  /api/advisor/settings — returns the user's masked API key
 * POST /api/advisor/settings — updates the user's API key
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

function maskKey(key: string): string {
  if (!key || key.length < 12) return "••••••••";
  return key.slice(0, 10) + "••••••••" + key.slice(-4);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { openRouterKey: true, email: true, emailOnComplete: true },
  });

  // Count user's jobs
  const jobCount = await prisma.advisorJob.count({
    where: { userId: session.user.id, parentJobId: null },
  });

  // Fetch OpenRouter credit balance
  let credits: { balance: number | null; totalCredits: number | null; totalUsage: number | null; keyUsage: number | null } = {
    balance: null, totalCredits: null, totalUsage: null, keyUsage: null,
  };
  const orKey = user?.openRouterKey || process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      // Account-level credits (total purchased vs total spent)
      const creditsRes = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: { Authorization: `Bearer ${orKey}` },
      });
      if (creditsRes.ok) {
        const data = await creditsRes.json();
        const totalCredits = data?.data?.total_credits ?? null;
        const totalUsage = data?.data?.total_usage ?? 0;
        credits.totalCredits = totalCredits;
        credits.totalUsage = totalUsage;
        credits.balance = totalCredits !== null ? Math.max(0, totalCredits - totalUsage) : null;
      }
    } catch {
      // Silently ignore
    }

    try {
      // Key-level usage stats
      const keyRes = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${orKey}` },
      });
      if (keyRes.ok) {
        const data = await keyRes.json();
        credits.keyUsage = data?.data?.usage ?? null;
        // Fallback: if /credits didn't work, try limit-based balance
        if (credits.balance === null) {
          const limit = data?.data?.limit ?? null;
          const usage = data?.data?.usage ?? 0;
          if (limit !== null) {
            credits.balance = Math.max(0, limit - usage);
            credits.totalCredits = limit;
            credits.totalUsage = usage;
          }
        }
      }
    } catch {
      // Silently ignore
    }
  }

  return Response.json({
    email: user?.email || "",
    hasKey: !!user?.openRouterKey,
    maskedKey: user?.openRouterKey ? maskKey(user.openRouterKey) : null,
    emailOnComplete: user?.emailOnComplete ?? false,
    credits,
    jobCount,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();

  // Handle emailOnComplete toggle
  if (typeof body.emailOnComplete === "boolean") {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { emailOnComplete: body.emailOnComplete },
    });
    return Response.json({ success: true, emailOnComplete: body.emailOnComplete });
  }

  // Handle API key update
  const apiKey = body.apiKey;
  if (typeof apiKey !== "string") {
    return Response.json({ error: "Invalid API key" }, { status: 400 });
  }

  // Allow empty string to clear the key
  await prisma.user.update({
    where: { id: session.user.id },
    data: { openRouterKey: apiKey.trim() || null },
  });

  return Response.json({
    success: true,
    hasKey: !!apiKey.trim(),
    maskedKey: apiKey.trim() ? maskKey(apiKey.trim()) : null,
  });
}
