"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}><p style={{ color: "var(--grey)" }}>Loading...</p></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const [email, setEmail] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<{ balance: number | null; totalCredits: number | null; totalUsage: number | null; keyUsage: number | null }>({ balance: null, totalCredits: null, totalUsage: null, keyUsage: null });
  const [jobCount, setJobCount] = useState(0);
  const [emailOnComplete, setEmailOnComplete] = useState(false);
  const [togglingEmail, setTogglingEmail] = useState(false);
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; prefix: string; createdAt: string }[]>([]);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<{ plainKey: string; name: string } | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  const searchParams = useSearchParams();
  const isSetup = searchParams.get("setup") === "1";

  const loadSettings = useCallback(async () => {
    try {
      const [res, keysRes] = await Promise.all([
        fetch("/api/advisor/settings"),
        fetch("/api/advisor/apikeys")
      ]);
      const data = await res.json();
      setEmail(data.email || "");
      setHasKey(data.hasKey);
      setMaskedKey(data.maskedKey);
      setCredits(data.credits || { balance: null, limit: null });
      setJobCount(data.jobCount || 0);
      setEmailOnComplete(data.emailOnComplete ?? false);

      const keysData = await keysRes.json();
      if (keysData.keys) {
        setApiKeys(keysData.keys);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/advisor/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newKey }),
      });
      const data = await res.json();
      if (data.success) {
        setHasKey(data.hasKey);
        setMaskedKey(data.maskedKey);
        setEditing(false);
        setNewKey("");
        setMessage({ type: "ok", text: data.hasKey ? "OpenRouter API key saved." : "OpenRouter API key removed." });
      } else {
        setMessage({ type: "err", text: data.error || "Failed to save." });
      }
    } catch {
      setMessage({ type: "err", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEmail() {
    setTogglingEmail(true);
    try {
      const res = await fetch("/api/advisor/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOnComplete: !emailOnComplete }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailOnComplete(data.emailOnComplete);
        setMessage({ type: "ok", text: data.emailOnComplete ? "Email notifications enabled." : "Email notifications disabled." });
      }
    } catch {
      setMessage({ type: "err", text: "Failed to update notification preference." });
    } finally {
      setTogglingEmail(false);
    }
  }

  async function handleCreateApiKey() {
    if (!newApiKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch("/api/advisor/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newApiKeyName.trim() }),
      });
      const data = await res.json();
      if (data.plainKey) {
        setCreatedKey({ plainKey: data.plainKey, name: data.name });
        setNewApiKeyName("");
        // Reload list
        const keysRes = await fetch("/api/advisor/apikeys");
        const keysData = await keysRes.json();
        if (keysData.keys) setApiKeys(keysData.keys);
      } else {
        setMessage({ type: "err", text: data.error || "Failed to create API key." });
      }
    } catch {
      setMessage({ type: "err", text: "Failed to create API key." });
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeApiKey(id: string) {
    if (!confirm("Are you sure you want to revoke this key? Any services using it will immediately lose access.")) return;
    try {
      const res = await fetch(`/api/advisor/apikeys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setApiKeys((prev) => prev.filter((k) => k.id !== id));
        setMessage({ type: "ok", text: "API key revoked successfully." });
      } else {
        setMessage({ type: "err", text: "Failed to revoke API key." });
      }
    } catch {
      setMessage({ type: "err", text: "Failed to revoke API key." });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
        <p style={{ color: "var(--grey)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>{isSetup ? "Welcome to RightMind 👋" : "Settings"}</h1>
      <p style={{ color: "var(--grey)", fontSize: "14px", marginBottom: isSetup ? "16px" : "32px" }}>
        {isSetup ? "One last step before you can start running analyses." : "Manage your account and API key."}
      </p>

      {/* Status message */}
      {message && (
        <div style={{
          padding: "10px 16px", borderRadius: "6px", fontSize: "13px", fontFamily: "var(--font-ui)",
          background: message.type === "ok" ? "#d1fae5" : "#fef2f2",
          color: message.type === "ok" ? "#065f46" : "#991b1b",
          border: `1px solid ${message.type === "ok" ? "#a7f3d0" : "#fecaca"}`,
          marginBottom: "32px"
        }}>
          {message.text}
        </div>
      )}

      {isSetup && (
        <div style={{
          background: "linear-gradient(135deg, #dbeafe, #ede9fe)",
          border: "1px solid #93c5fd",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "32px",
          fontSize: "14px",
          lineHeight: 1.6,
          color: "#1e3a5f",
        }}>
          <strong>Add your OpenRouter API key below to get started.</strong><br />
          This key powers the multi-model AI analyses. You pay OpenRouter directly at their rates,
          and we never see or store your billing details. Get a key at{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)", fontWeight: 600 }}>openrouter.ai/keys</a>.
        </div>
      )}

      {/* Account */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "12px" }}>
          Account
        </h2>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "13px", color: "var(--grey)", fontFamily: "var(--font-ui)" }}>Email</div>
              <div style={{ fontSize: "15px", marginTop: "2px" }}>{email}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "13px", color: "var(--grey)", fontFamily: "var(--font-ui)" }}>Jobs run</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "2px", color: "var(--charcoal)" }}>{jobCount}</div>
            </div>
          </div>
        </div>
      </section>

      {/* OpenRouter Balance */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "12px" }}>
          OpenRouter Balance
        </h2>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "20px" }}>
          {!hasKey ? (
            <p style={{ fontSize: "13px", color: "var(--grey-light)", margin: 0 }}>
              Add an API key to see your balance.
            </p>
          ) : credits.balance !== null ? (
            <>
              <div style={{ fontSize: "12px", color: "var(--grey)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Remaining</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: credits.balance > 1 ? "#059669" : "#dc2626", marginTop: "2px" }}>
                ${credits.balance.toFixed(2)}
              </div>
            </>
          ) : (
            <p style={{ fontSize: "13px", color: "var(--grey-light)", margin: 0 }}>
              Could not fetch balance. Check your API key is valid.
            </p>
          )}
        </div>
      </section>

      {/* API Key */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "12px" }}>
          OpenRouter API Key
        </h2>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "20px" }}>
          {!editing ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "13px", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "4px" }}>
                    {hasKey ? "Key configured" : "No key set"}
                  </div>
                  {maskedKey && (
                    <code style={{ fontSize: "14px", color: "var(--charcoal)", background: "var(--cream)", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace" }}>
                      {maskedKey}
                    </code>
                  )}
                  {!hasKey && (
                    <p style={{ fontSize: "13px", color: "var(--grey-light)", marginTop: "4px" }}>
                      Add your key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>openrouter.ai/keys</a>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                    fontFamily: "var(--font-ui)", background: "var(--cream)",
                    border: "1px solid var(--rule)", borderRadius: "6px",
                    cursor: "pointer", color: "var(--charcoal)",
                  }}
                >
                  {hasKey ? "Change" : "Add key"}
                </button>
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="api-key"
                style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--grey)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-ui)" }}
              >
                Paste your OpenRouter API key
              </label>
              <input
                id="api-key"
                type="password"
                autoFocus
                placeholder="sk-or-v1-..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", fontSize: "14px",
                  border: "1px solid var(--rule)", borderRadius: "6px",
                  background: "var(--cream)", color: "var(--charcoal)",
                  fontFamily: "monospace", marginBottom: "12px", outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: "8px 20px", fontSize: "13px", fontWeight: 600,
                    fontFamily: "var(--font-ui)", background: "var(--teal)",
                    color: "var(--white)", border: "none", borderRadius: "6px",
                    cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => { setEditing(false); setNewKey(""); }}
                  style={{
                    padding: "8px 16px", fontSize: "13px", fontFamily: "var(--font-ui)",
                    background: "none", border: "1px solid var(--rule)",
                    borderRadius: "6px", cursor: "pointer", color: "var(--grey)",
                  }}
                >
                  Cancel
                </button>
                {hasKey && (
                  <button
                    onClick={() => { setNewKey(""); handleSave(); }}
                    style={{
                      padding: "8px 16px", fontSize: "13px", fontFamily: "var(--font-ui)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "#dc2626", marginLeft: "auto",
                    }}
                  >
                    Remove key
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* RightMind API Keys */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "12px" }}>
          Developer API Keys
        </h2>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "20px" }}>
          <p style={{ fontSize: "13px", color: "var(--grey)", marginBottom: "16px", lineHeight: 1.5 }}>
            Create API keys to integrate RightMind into external services (e.g. OpenClaw, Telegram bots, or CI/CD pipelines). 
            Anyone with these keys can run jobs on your behalf using your OpenRouter credits.
          </p>

          {/* Create new key */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
            <input 
              type="text" 
              placeholder="Key Name (e.g. 'OpenClaw Bot')" 
              value={newApiKeyName}
              onChange={(e) => setNewApiKeyName(e.target.value)}
              style={{
                flex: 1, padding: "8px 12px", fontSize: "13px",
                border: "1px solid var(--rule)", borderRadius: "6px",
                background: "var(--cream)", outline: "none",
              }}
            />
            <button 
              onClick={handleCreateApiKey}
              disabled={creatingKey || !newApiKeyName.trim()}
              style={{
                padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                background: "var(--charcoal)", color: "var(--white)",
                border: "none", borderRadius: "6px", cursor: "pointer",
                opacity: creatingKey || !newApiKeyName.trim() ? 0.6 : 1,
              }}
            >
              {creatingKey ? "Creating..." : "Create new key"}
            </button>
          </div>

          {/* New Key Display (One-time) */}
          {createdKey && (
            <div style={{ background: "#fefce8", border: "1px solid #fef08a", borderRadius: "6px", padding: "16px", marginBottom: "20px" }}>
              <p style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 600, color: "#854d0e" }}>Save your new API key</p>
              <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#a16207" }}>
                Make sure to copy your new API key for <strong>{createdKey.name}</strong> now. You won&apos;t be able to see it again!
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <code style={{ flex: 1, padding: "10px", background: "#fff", border: "1px solid #fde047", borderRadius: "4px", fontSize: "14px", color: "#422006", wordBreak: "break-all" }}>
                  {createdKey.plainKey}
                </code>
                <button 
                  onClick={() => { navigator.clipboard.writeText(createdKey.plainKey); setCreatedKey(null); }}
                  style={{ padding: "8px 12px", background: "#fde047", color: "#854d0e", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
                >
                  Copy & Close
                </button>
              </div>
            </div>
          )}

          {/* Existing Keys List */}
          {apiKeys.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {apiKeys.map((key) => (
                <div key={key.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--rule)", borderRadius: "6px", background: "var(--cream)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--charcoal)", marginBottom: "4px" }}>{key.name}</div>
                    <code style={{ fontSize: "12px", color: "var(--grey)", fontFamily: "monospace" }}>{key.prefix}••••••••••••••••</code>
                  </div>
                  <button 
                    onClick={() => handleRevokeApiKey(key.id)}
                    style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
             <div style={{ fontSize: "13px", color: "var(--grey-light)", textAlign: "center", padding: "20px 0" }}>
              No API keys created yet.
            </div>
          )}
        </div>
      </section>

      {/* Notifications */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "12px" }}>
          Notifications
        </h2>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Email when job completes</div>
              <p style={{ fontSize: "13px", color: "var(--grey)", lineHeight: 1.6, margin: 0 }}>
                Receive a summary email with a link to the full report when an analysis finishes.
              </p>
            </div>
            <button
              onClick={handleToggleEmail}
              disabled={togglingEmail}
              aria-label={emailOnComplete ? "Disable email notifications" : "Enable email notifications"}
              style={{
                position: "relative",
                width: "44px",
                height: "24px",
                borderRadius: "12px",
                border: "none",
                background: emailOnComplete ? "var(--teal)" : "#ccc",
                cursor: togglingEmail ? "wait" : "pointer",
                transition: "background 0.2s ease",
                flexShrink: 0,
                marginLeft: "16px",
                opacity: togglingEmail ? 0.6 : 1,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: emailOnComplete ? "22px" : "2px",
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  transition: "left 0.2s ease",
                }}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grey)", fontFamily: "var(--font-ui)", marginBottom: "12px" }}>
          Privacy &amp; Data
        </h2>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "20px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px", lineHeight: 1 }}>🔒</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>We never look at your data</div>
              <p style={{ fontSize: "13px", color: "var(--grey)", lineHeight: 1.6, margin: 0 }}>
                Your challenges, reports, and API keys are stored locally in your database.
                We have no analytics, no tracking, and no access to your content. Your data stays on your infrastructure.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px", lineHeight: 1 }}>🛡️</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>OpenRouter privacy protections</div>
              <p style={{ fontSize: "13px", color: "var(--grey)", lineHeight: 1.6, margin: 0 }}>
                All LLM requests go through OpenRouter with maximum privacy settings enabled.
                We do not send any personally identifiable information in prompts. OpenRouter does not
                log or train on data from API requests made with your own key (BYOK). Your prompts and
                completions are ephemeral and not retained by model providers.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px", lineHeight: 1 }}>🔑</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Bring Your Own Key</div>
              <p style={{ fontSize: "13px", color: "var(--grey)", lineHeight: 1.6, margin: 0 }}>
                Your OpenRouter API key gives you direct control over your LLM spend. We never proxy billing
                or add markup. You pay OpenRouter directly at their published rates and can revoke
                your key at any time from your{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)" }}>OpenRouter dashboard</a>.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <span style={{ fontSize: "20px", lineHeight: 1 }}>📋</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>What we store</div>
              <p style={{ fontSize: "13px", color: "var(--grey)", lineHeight: 1.6, margin: 0 }}>
                Only the minimum needed to run the platform: your email address, your encrypted API key, and
                your job history (challenges and reports). Nothing is shared with third parties.
                You can delete your account and all associated data at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
