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
    async signIn() {
      // Always allow sign-in. API key setup redirect is handled
      // client-side in the advisor layout after session is established.
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
