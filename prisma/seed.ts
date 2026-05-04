/**
 * Seed script — creates the initial admin user with the existing OpenRouter API key.
 * Run: npx tsx prisma/seed.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

// Use the same db module the app uses (resolves via tsconfig paths)
import { prisma } from "../src/lib/db";

async function main() {
  const email = "jklondon@gmail.com";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  const user = await prisma.user.upsert({
    where: { email },
    update: { openRouterKey },
    create: {
      email,
      emailVerified: new Date(),
      openRouterKey,
    },
  });

  console.log(`✓ Seeded user: ${user.email} (id: ${user.id})`);
  console.log(`  OpenRouter key: ${openRouterKey.slice(0, 20)}...`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
