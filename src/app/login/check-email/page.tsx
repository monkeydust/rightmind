export default function CheckEmailPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)" }}>
      <div style={{ maxWidth: "420px", textAlign: "center", padding: "40px 32px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📧</div>
        <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Check your email</h1>
        <p style={{ color: "var(--grey)", fontSize: "15px", lineHeight: 1.6 }}>
          A sign-in link has been sent to your email address.
          Click it to log in — it expires in 10 minutes.
        </p>
      </div>
    </div>
  );
}
