"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // If already logged in, redirect to advisor
  useEffect(() => {
    if (session?.user) {
      const dest = searchParams.get("callbackUrl") || "/advisor";
      router.replace(dest);
    }
  }, [session, router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      // Get CSRF token first
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfRes.json();

      // Redirect destination after magic link is clicked
      const callbackUrl = searchParams.get("callbackUrl") || "/advisor";

      // POST directly to the NextAuth sign-in endpoint
      const res = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          email: email.trim(),
          callbackUrl,
        }),
        redirect: "manual",
      });

      if (res.ok || res.type === "opaqueredirect" || res.status === 0 || res.status === 302) {
        setSubmitted(true);
      } else {
        setError(`Something went wrong (status ${res.status}). Please try again.`);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)" }}>
        <div style={{ maxWidth: "420px", textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📧</div>
          <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Check your email</h1>
          <p style={{ color: "var(--grey)", fontSize: "15px", lineHeight: 1.6 }}>
            We sent a sign-in link to <strong style={{ color: "var(--charcoal)" }}>{email}</strong>.
            Click it to log in — it expires in 10 minutes.
          </p>
          <p style={{ color: "var(--grey-light)", fontSize: "13px", marginTop: "16px" }}>
            <strong>Dev mode:</strong> Check your terminal for the magic link.
          </p>
          <p style={{ color: "var(--grey-light)", fontSize: "13px", marginTop: "24px" }}>
            Didn&apos;t get it?{" "}
            <button
              onClick={() => { setSubmitted(false); setEmail(""); }}
              style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontWeight: 600, fontSize: "13px", fontFamily: "var(--font-text)" }}
            >
              Try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)" }}>
      <div style={{ width: "100%", maxWidth: "400px", padding: "0 24px" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h1 style={{ fontSize: "28px", fontFamily: "var(--font-heading)", marginBottom: "8px" }}>
            RightMind
          </h1>
          <p style={{ color: "var(--grey)", fontSize: "15px" }}>
            Multi-agent advisory platform
          </p>
        </div>

        {/* Login card */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid var(--rule)",
            borderRadius: "8px",
            padding: "32px 28px",
          }}
        >
          <h2 style={{ fontSize: "18px", marginBottom: "4px" }}>Sign in</h2>
          <p style={{ color: "var(--grey)", fontSize: "13px", marginBottom: "24px" }}>
            Enter your email and we&apos;ll send you a magic link
          </p>

          {error && (
            <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{error}</p>
          )}

          <form onSubmit={handleSubmit}>
            <label
              htmlFor="login-email"
              style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--grey)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-ui)" }}
            >
              Email address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "15px",
                border: "1px solid var(--rule)",
                borderRadius: "6px",
                background: "var(--cream)",
                color: "var(--charcoal)",
                fontFamily: "var(--font-text)",
                marginBottom: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "11px",
                fontSize: "15px",
                fontWeight: 600,
                fontFamily: "var(--font-ui)",
                background: "var(--teal)",
                color: "var(--white)",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {loading ? "Sending link..." : "Send magic link →"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", color: "var(--grey-light)", fontSize: "12px", marginTop: "20px", lineHeight: 1.6 }}>
          No password needed. We&apos;ll email you a secure link<br />
          that logs you in instantly.
        </p>
      </div>
    </div>
  );
}
