"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function KeyBanner() {
  const pathname = usePathname();

  // Don't show on settings page (they're already there)
  if (pathname === "/advisor/settings") return null;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fef3c7, #fde68a)",
        borderBottom: "1px solid #f59e0b",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontSize: "14px",
        fontFamily: "var(--font-ui)",
      }}
    >
      <span style={{ fontSize: "18px" }}>🔑</span>
      <span style={{ color: "#92400e" }}>
        <strong>API key required.</strong>{" "}
        Add your OpenRouter key to start running analyses.
      </span>
      <Link
        href="/advisor/settings"
        style={{
          padding: "6px 16px",
          background: "#92400e",
          color: "#fff",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Go to Settings →
      </Link>
    </div>
  );
}
