import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/api-keys";
import type { User } from "@/generated/prisma/client";

/**
 * Authenticates an incoming API request using a Bearer token (API Key).
 * Returns the User object if successful, or null if invalid.
 */
export async function authenticateApiRequest(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const plainKey = authHeader.split(" ")[1];
  if (!plainKey || !plainKey.startsWith("rm_live_")) {
    return null;
  }

  const keyHash = hashApiKey(plainKey);

  // Look up the key in the database
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKey) {
    return null;
  }

  // Update lastUsedAt in the background
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch((err) => console.error("Failed to update API key lastUsedAt:", err));

  return apiKey.user;
}
