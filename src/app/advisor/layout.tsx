import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SignOutButton } from "./SignOutButton";
import { KeyBanner } from "./KeyBanner";

export const metadata: Metadata = {
  title: "RightMind — Advisory Platform",
  description: "Multi-agent LLM advisory platform.",
};

export default async function AdvisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Check if user has an API key
  let hasKey = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { openRouterKey: true },
    });
    hasKey = !!user?.openRouterKey;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="masthead">
        <a href="/advisor" className="masthead-brand">
          RightMind
        </a>
        <div className="masthead-links">
          <Link href="/advisor/why" className="masthead-link">Why</Link>
          <Link href="/advisor/jobs" className="masthead-link">Jobs</Link>
          <Link href="/advisor/settings" className="masthead-link">Settings</Link>
          {session?.user && (
            <>
              <span style={{ fontSize: "12px", color: "var(--grey)", fontFamily: "var(--font-ui)" }}>
                {session.user.email}
              </span>
              <SignOutButton />
            </>
          )}
        </div>
      </header>
      {!hasKey && session?.user && <KeyBanner />}
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
