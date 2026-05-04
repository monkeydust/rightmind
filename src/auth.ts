import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/email";

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
        await sendMagicLinkEmail(email, url);
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
