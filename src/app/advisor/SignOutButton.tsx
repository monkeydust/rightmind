"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Sign out"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px",
        display: "inline-flex",
        alignItems: "center",
        color: "var(--grey)",
        transition: "color 100ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--claret)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--grey)")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  );
}
