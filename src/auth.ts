/**
 * Auth.js configuration — Magic Link (email) authentication.
 *
 * In development: logs the magic link URL to the terminal (no email service needed).
 * In production: uses Resend to send actual emails.
 */

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
  },
  providers: [
    {
      id: "email",
      name: "Email",
      type: "email",
      maxAge: 10 * 60, // Magic link valid for 10 minutes
      sendVerificationRequest: async ({ identifier: email, url }) => {
        // In development, just log the magic link to the terminal
        if (process.env.NODE_ENV === "development") {
          console.log("\n╔══════════════════════════════════════════════════╗");
          console.log("║  🔗  MAGIC LOGIN LINK (dev mode)                 ║");
          console.log("╠══════════════════════════════════════════════════╣");
          console.log(`║  Email: ${email}`);
          console.log(`║  Link:  ${url}`);
          console.log("╚══════════════════════════════════════════════════╝\n");
          return;
        }

        // Production: use Resend
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.AUTH_RESEND_KEY);
        await resend.emails.send({
          from: "RightMind <noreply@rightmind.app>",
          to: email,
          subject: "Sign in to RightMind",
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Sign in to RightMind</h2>
              <p style="color: #666; line-height: 1.6;">
                Click the button below to sign in. This link expires in 10 minutes.
              </p>
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #0d7680; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0;">
                Sign in →
              </a>
              <p style="color: #999; font-size: 13px; margin-top: 24px;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      },
    },
  ],
  callbacks: {
    async signIn({ user }) {
      // After sign-in, check if user has an API key
      // If not, redirect them to settings on first visit
      if (user?.id) {
        const { prisma } = await import("@/lib/db");
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { openRouterKey: true },
        });
        if (!dbUser?.openRouterKey) {
          // Signal to redirect — we'll handle this in the login page
          return "/advisor/settings?setup=1";
        }
      }
      return true;
    },
    async session({ session, user }) {
      // Include user ID in session so we can look up their API key
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
