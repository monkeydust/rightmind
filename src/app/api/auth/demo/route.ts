/**
 * POST /api/auth/demo
 *
 * Instant demo login — creates (or finds) a demo user with email
 * "demo@demo.com", generates a session, and returns a Set-Cookie header
 * so the browser is immediately logged in.
 *
 * Called by the login page when the user types "demo@demo.com".
 */

import { prisma } from "@/lib/db";
import { seedDemoJobs } from "@/lib/seed-demo";
import { cookies } from "next/headers";

const DEMO_EMAIL = "demo@demo.com";
const SESSION_MAX_AGE = 24 * 60 * 60; // 24 hours for demo sessions

export async function POST() {
  try {
    // 1. Find or create the demo user
    let user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          name: "Demo User",
          emailVerified: new Date(),
          openRouterKey: process.env.OPENROUTER_API_KEY || null,
        },
      });
    } else if (!user.openRouterKey && process.env.OPENROUTER_API_KEY) {
      // Ensure demo user always has a working API key
      await prisma.user.update({
        where: { id: user.id },
        data: { openRouterKey: process.env.OPENROUTER_API_KEY },
      });
    }

    // 2. Clean up any expired demo sessions
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        expires: { lt: new Date() },
      },
    });

    // 3. Create a new session
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // 4. Seed demo jobs if the user has none
    await seedDemoJobs(user.id);

    // 5. Set the session cookie (NextAuth uses "authjs.session-token" for DB sessions)
    const cookieStore = await cookies();

    // Determine if we're in production (HTTPS)
    const isSecure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    cookieStore.set(cookieName, sessionToken, {
      expires,
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
    });

    return Response.json({ success: true, redirectTo: "/advisor" });
  } catch (error) {
    console.error("[Demo Login] Error:", error);
    return Response.json(
      { error: "Failed to create demo session" },
      { status: 500 }
    );
  }
}
