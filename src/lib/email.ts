/**
 * Email utilities — Resend integration for magic links and job notifications.
 *
 * Uses the Resend SDK to send transactional emails. In development without
 * a Resend key, falls back to logging to the terminal.
 */

import { Resend } from "resend";

const resend = process.env.AUTH_RESEND_KEY
  ? new Resend(process.env.AUTH_RESEND_KEY)
  : null;

const FROM_ADDRESS = "RightMind <onboarding@resend.dev>";

// ─── Magic Link Email ────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(email: string, url: string) {
  console.log(`[Email] sendMagicLinkEmail called for ${email}`);
  console.log(`[Email] Resend client initialized: ${!!resend}`);

  if (!resend) {
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  🔗  MAGIC LOGIN LINK (no Resend key)            ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(`║  Email: ${email}`);
    console.log(`║  Link:  ${url}`);
    console.log("╚══════════════════════════════════════════════════╝\n");
    return;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Sign in to RightMind",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.02em;">RightMind</span>
          </div>
          <h2 style="color: #1a1a1a; font-size: 18px; margin: 0 0 12px;">Sign in to your account</h2>
          <p style="color: #666; line-height: 1.6; font-size: 15px; margin: 0 0 24px;">
            Click the button below to sign in. This link expires in 10 minutes.
          </p>
          <a href="${url}" style="display: inline-block; padding: 12px 28px; background: #0d7680; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Sign in →
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 32px; line-height: 1.5;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #bbb; font-size: 11px; margin: 0;">
            RightMind — Multi-agent advisory
          </p>
        </div>
      `,
    });
    console.log(`[Email] Magic link sent successfully to ${email}:`, JSON.stringify(result));
  } catch (error) {
    console.error(`[Email] Failed to send magic link to ${email}:`, error);
    throw error; // Re-throw so Auth.js can handle it
  }
}

// ─── Job Completion Email ────────────────────────────────────────────────────

interface JobCompletionData {
  jobId: string;
  challenge: string;
  strategyName: string;
  strategyIcon: string;
  report: string;
}

/**
 * Structured summary extracted from a report, with separate fields
 * for verdict/score and narrative text.
 */
interface ReportSummary {
  /** A short verdict line, e.g. "MODIFY · 0.76 alignment" or "Robustness: 8/10" */
  verdict: string | null;
  /** Strategy-level verdicts for All Angles */
  strategyVerdicts: { icon: string; name: string; verdict: string; oneLiner: string }[];
  /** The opening narrative paragraphs of the report — HTML-safe */
  paragraphs: string[];
}

/**
 * Extracts a structured summary from the full report.
 * Handles both All Angles JSON and single-strategy markdown.
 */
function extractSummary(report: string): ReportSummary {
  const result: ReportSummary = { verdict: null, strategyVerdicts: [], paragraphs: [] };

  // Try parsing as All Angles JSON
  try {
    const parsed = JSON.parse(report);
    if (parsed._type === "all-angles" && parsed.metaSynthesis) {
      const meta = parsed.metaSynthesis;

      // Verdict line
      const verdict = meta.meta_verdict || "—";
      const score = meta.alignment_score != null
        ? `${Math.round(meta.alignment_score * 100)}% alignment`
        : "";
      const label = meta.alignment_label || "";
      result.verdict = `${verdict}${score ? ` · ${label} (${score})` : ""}`;

      // Strategy verdicts
      if (Array.isArray(meta.strategy_verdicts)) {
        result.strategyVerdicts = meta.strategy_verdicts.map((sv: Record<string, string>) => ({
          icon: sv.icon || "",
          name: sv.strategy_name || sv.strategy_id || "",
          verdict: sv.verdict || "—",
          oneLiner: sv.one_liner || "",
        }));
      }

      // Narrative — meta_recommendation is the main prose output
      if (meta.meta_recommendation) {
        const paras = meta.meta_recommendation
          .split(/\n{2,}/)
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0);
        result.paragraphs = paras.slice(0, 3);
      } else if (meta.meta_verdict_rationale) {
        result.paragraphs = [meta.meta_verdict_rationale];
      }

      return result;
    }
  } catch {
    // Not JSON — treat as markdown
  }

  // Markdown report — extract the first heading and opening paragraphs
  const lines = report.split("\n");
  let firstHeading: string | null = null;
  const contentLines: string[] = [];
  let paraCount = 0;

  for (const line of lines) {
    // Capture first heading as the verdict/score line
    if (!firstHeading && /^#{1,3}\s+.+/.test(line)) {
      firstHeading = line.replace(/^#{1,3}\s+/, "").replace(/\*\*/g, "");
      continue;
    }

    // Skip subsequent headings
    if (/^#{1,4}\s+/.test(line)) {
      // If we already have content, this heading starts a new section — stop
      if (contentLines.length > 0) break;
      continue;
    }

    const trimmed = line.trim();

    // Empty line = paragraph boundary
    if (trimmed === "") {
      if (contentLines.length > 0) {
        paraCount++;
        if (paraCount >= 3) break;
        contentLines.push("");
      }
      continue;
    }

    // Strip bold markers for cleaner display
    contentLines.push(trimmed.replace(/\*\*/g, ""));
  }

  if (firstHeading) {
    result.verdict = firstHeading;
  }

  // Split collected content into paragraphs
  const joined = contentLines.join("\n").trim();
  if (joined) {
    result.paragraphs = joined
      .split(/\n{2,}/)
      .map(p => p.replace(/\n/g, " ").trim())
      .filter(p => p.length > 0)
      .slice(0, 3);
  }

  return result;
}

/**
 * Renders a verdict badge with appropriate colour.
 */
function verdictBadgeHtml(verdict: string): string {
  const v = verdict.toUpperCase();
  let bg = "#f0f9fa"; let border = "#d1e7ea"; let color = "#0d7680"; // default teal

  if (v.includes("GO") && !v.includes("NO-GO")) {
    bg = "#d1fae5"; border = "#a7f3d0"; color = "#065f46";
  } else if (v.includes("NO-GO")) {
    bg = "#fef2f2"; border = "#fecaca"; color = "#991b1b";
  } else if (v.includes("MODIFY")) {
    bg = "#fef9c3"; border = "#fde68a"; color = "#92400e";
  } else if (v.includes("HOLD")) {
    bg = "#ede9fe"; border = "#c4b5fd"; color = "#5b21b6";
  }

  return `<span style="display: inline-block; padding: 4px 14px; background: ${bg}; border: 1px solid ${border}; border-radius: 16px; font-size: 14px; color: ${color}; font-weight: 700; letter-spacing: 0.03em;">${escapeHtml(verdict)}</span>`;
}

export async function sendJobCompletionEmail(
  email: string,
  data: JobCompletionData
) {
  if (!resend) {
    console.log(`[Email] Would send job completion email to ${email} for job ${data.jobId}`);
    return;
  }

  const baseUrl = process.env.AUTH_URL || "http://192.168.178.58:3000";
  const jobUrl = `${baseUrl}/advisor/jobs/${data.jobId}`;
  const summary = extractSummary(data.report);

  // Build verdict section
  let verdictHtml = "";
  if (summary.verdict) {
    verdictHtml = `
      <div style="margin-bottom: 20px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 8px;">Verdict</div>
        ${verdictBadgeHtml(summary.verdict)}
      </div>`;
  }

  // Build strategy verdicts table (All Angles only)
  let strategyVerdictsHtml = "";
  if (summary.strategyVerdicts.length > 0) {
    const rows = summary.strategyVerdicts.map(sv => `
      <tr>
        <td style="padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #f0f0f0;">${sv.icon} ${escapeHtml(sv.name)}</td>
        <td style="padding: 6px 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #f0f0f0; color: ${sv.verdict === "GO" ? "#065f46" : sv.verdict === "NO-GO" ? "#991b1b" : sv.verdict === "MODIFY" ? "#92400e" : "#5b21b6"};">${escapeHtml(sv.verdict)}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #666; line-height: 1.4; border-bottom: 1px solid #f0f0f0;">${escapeHtml(sv.oneLiner.length > 120 ? sv.oneLiner.slice(0, 117) + "…" : sv.oneLiner)}</td>
      </tr>`).join("");

    strategyVerdictsHtml = `
      <div style="margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 8px;">Strategy verdicts</div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
          ${rows}
        </table>
      </div>`;
  }

  // Build narrative paragraphs
  let narrativeHtml = "";
  if (summary.paragraphs.length > 0) {
    const paras = summary.paragraphs
      .map(p => `<p style="margin: 0 0 12px; font-size: 14px; color: #333; line-height: 1.7;">${escapeHtml(p)}</p>`)
      .join("");
    narrativeHtml = `
      <div style="margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 8px;">Summary</div>
        <div style="padding: 16px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          ${paras}
        </div>
      </div>`;
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `${data.strategyIcon} Your analysis is ready — ${data.strategyName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <!-- Header -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.02em;">RightMind</span>
          </div>

          <!-- Status -->
          <div style="background: #d1fae5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; align-items: center;">
            <span style="font-size: 16px; margin-right: 8px;">✅</span>
            <span style="font-size: 14px; font-weight: 600; color: #065f46;">Analysis complete</span>
          </div>

          <!-- Strategy badge -->
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; padding: 4px 12px; background: #f0f9fa; border: 1px solid #d1e7ea; border-radius: 16px; font-size: 13px; color: #0d7680; font-weight: 600;">
              ${data.strategyIcon} ${data.strategyName}
            </span>
          </div>

          <!-- Challenge -->
          <div style="margin-bottom: 24px;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 6px;">Your challenge</div>
            <div style="font-size: 14px; color: #444; line-height: 1.6; padding: 12px 16px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
              ${escapeHtml(data.challenge.length > 300 ? data.challenge.slice(0, 300) + "…" : data.challenge)}
            </div>
          </div>

          <!-- Verdict -->
          ${verdictHtml}

          <!-- Strategy Verdicts (All Angles) -->
          ${strategyVerdictsHtml}

          <!-- Narrative Summary -->
          ${narrativeHtml}

          <!-- CTA -->
          <a href="${jobUrl}" style="display: inline-block; padding: 12px 28px; background: #0d7680; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            View full report →
          </a>

          <!-- Footer -->
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
          <p style="color: #bbb; font-size: 11px; margin: 0; line-height: 1.5;">
            You received this because you have email notifications enabled in your
            <a href="${baseUrl}/advisor/settings" style="color: #999;">settings</a>.
            RightMind — Multi-agent advisory
          </p>
        </div>
      `,
    });

    console.log(`[Email] Job completion email sent to ${email} for job ${data.jobId}`);
  } catch (error) {
    console.error(`[Email] Failed to send job completion email to ${email}:`, error);
  }
}

// ─── Job Failure Email ────────────────────────────────────────────────────────

interface JobFailureData {
  jobId: string;
  strategyName: string;
  strategyIcon: string;
  errorMessage: string;
}

export async function sendJobFailureEmail(
  email: string,
  data: JobFailureData
) {
  if (!resend) {
    console.log(`[Email] Would send job failure email to ${email} for job ${data.jobId}`);
    return;
  }

  const baseUrl = process.env.AUTH_URL || "http://192.168.178.58:3000";
  const jobUrl = `${baseUrl}/advisor/jobs/${data.jobId}`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `⚠️ Analysis Failed — ${data.strategyName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <!-- Header -->
          <div style="margin-bottom: 28px;">
            <span style="font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.02em;">RightMind</span>
          </div>

          <!-- Status -->
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; align-items: center;">
            <span style="font-size: 16px; margin-right: 8px;">⚠️</span>
            <span style="font-size: 14px; font-weight: 600; color: #991b1b;">Analysis failed to complete</span>
          </div>

          <!-- Strategy badge -->
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; padding: 4px 12px; background: #f0f9fa; border: 1px solid #d1e7ea; border-radius: 16px; font-size: 13px; color: #0d7680; font-weight: 600;">
              ${data.strategyIcon} ${data.strategyName}
            </span>
          </div>

          <!-- Error Details -->
          <div style="margin-bottom: 28px;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 6px;">Error Details</div>
            <div style="font-size: 13px; color: #7f1d1d; line-height: 1.6; padding: 12px 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; font-family: monospace; word-break: break-all;">
              ${escapeHtml(data.errorMessage)}
            </div>
            <p style="font-size: 14px; color: #444; margin-top: 16px; line-height: 1.6;">
              This usually happens when an AI model rate limit is reached or the prompt was too large. 
              You can check the job details or try running it again.
            </p>
          </div>

          <!-- CTA -->
          <a href="${jobUrl}" style="display: inline-block; padding: 12px 28px; background: #dc2626; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            View job details →
          </a>

          <!-- Footer -->
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
          <p style="color: #bbb; font-size: 11px; margin: 0; line-height: 1.5;">
            You received this because you have email notifications enabled in your
            <a href="${baseUrl}/advisor/settings" style="color: #999;">settings</a>.
            RightMind — Multi-agent advisory
          </p>
        </div>
      `,
    });

    console.log(`[Email] Job failure email sent to ${email} for job ${data.jobId}`);
  } catch (error) {
    console.error(`[Email] Failed to send job failure email to ${email}:`, error);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
