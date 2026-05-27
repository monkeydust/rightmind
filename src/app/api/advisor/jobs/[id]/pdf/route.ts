/**
 * GET /api/advisor/jobs/[id]/pdf
 *
 * Generates a professional PDF of a completed job report.
 * Uses puppeteer-core to render styled HTML → PDF.
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import { marked } from "marked";

const STRATEGY_META: Record<string, { name: string; icon: string }> = {
  "consensus-board": { name: "Consensus Board", icon: "🏛️" },
  "deep-dive": { name: "Deep Dive", icon: "🔬" },
  "round-table": { name: "Round Table", icon: "🤝" },
  "stress-tester": { name: "Stress Tester", icon: "⚔️" },
  "all-angles": { name: "All Angles", icon: "🔮" },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build HTML for an All Angles JSON report.
 */
function buildAllAnglesHtml(report: string, challenge: string): string {
  const parsed = JSON.parse(report);
  const meta = parsed.metaSynthesis;

  // Verdict badge
  const verdict = meta.meta_verdict || "—";
  const score = meta.alignment_score != null
    ? `${Math.round(meta.alignment_score * 100)}%`
    : "";
  const label = meta.alignment_label || "";

  const verdictColor = verdict === "GO" ? "#065f46"
    : verdict === "NO-GO" ? "#991b1b"
    : verdict === "MODIFY" ? "#92400e"
    : verdict === "HOLD" ? "#5b21b6" : "#333";
  const verdictBg = verdict === "GO" ? "#d1fae5"
    : verdict === "NO-GO" ? "#fef2f2"
    : verdict === "MODIFY" ? "#fef9c3"
    : verdict === "HOLD" ? "#ede9fe" : "#f0f9fa";

  // Strategy verdicts table
  let strategyRows = "";
  if (Array.isArray(meta.strategy_verdicts)) {
    strategyRows = meta.strategy_verdicts.map((sv: Record<string, string>) => {
      const svColor = sv.verdict === "GO" ? "#065f46"
        : sv.verdict === "NO-GO" ? "#991b1b"
        : sv.verdict === "MODIFY" ? "#92400e"
        : "#5b21b6";
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${sv.icon || ""} ${escapeHtml(sv.strategy_name || "")}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 700; text-transform: uppercase; color: ${svColor};">${escapeHtml(sv.verdict || "—")}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #555; font-size: 12px;">${escapeHtml(sv.one_liner || "")}</td>
      </tr>`;
    }).join("");
  }

  // Key dimensions matrix
  let dimensionsHtml = "";
  if (Array.isArray(meta.key_dimensions) && meta.key_dimensions.length > 0) {
    const stanceColor = (s: string) =>
      s === "for" ? "#0d7680" : s === "against" ? "#991b1b" : s === "modify" ? "#92400e" : s === "defer" ? "#5b21b6" : "#999";
    const stanceBg = (s: string) =>
      s === "for" ? "rgba(13,118,128,0.1)" : s === "against" ? "rgba(153,27,27,0.1)" : s === "modify" ? "rgba(146,64,14,0.1)" : s === "defer" ? "rgba(91,33,182,0.1)" : "transparent";

    const dimRows = meta.key_dimensions.map((dim: { question: string; positions: Record<string, { stance: string; reason: string }> }) => {
      const strategies = ["consensus-board", "deep-dive", "stress-tester", "round-table"];
      const cells = strategies.map(sid => {
        const pos = dim.positions?.[sid];
        const stance = pos?.stance || "—";
        return `<td style="padding: 6px 8px; text-align: center; border-bottom: 1px solid #eee;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${stanceColor(stance)}; background: ${stanceBg(stance)};">${stance}</span>
        </td>`;
      }).join("");
      return `<tr>
        <td style="padding: 8px 12px; font-weight: 600; color: #333; border-bottom: 1px solid #eee; font-size: 12px;">${escapeHtml(dim.question)}</td>
        ${cells}
      </tr>`;
    }).join("");

    dimensionsHtml = `
      <h3 style="margin: 28px 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #999;">Decision Alignment Matrix</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; font-size: 13px; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #ddd; background: #fafafa;">
            <th style="padding: 8px 12px; text-align: left; width: 28%;">Decision</th>
            <th style="padding: 8px; text-align: center; width: 18%;">🏛️ Board</th>
            <th style="padding: 8px; text-align: center; width: 18%;">🔬 Dive</th>
            <th style="padding: 8px; text-align: center; width: 18%;">⚔️ Stress</th>
            <th style="padding: 8px; text-align: center; width: 18%;">🤝 Table</th>
          </tr>
        </thead>
        <tbody>${dimRows}</tbody>
      </table>`;
  }

  // Convergence / Divergence / Blind spots
  const listSection = (title: string, items: string[], color: string, bg: string) => {
    if (!items || items.length === 0) return "";
    const lis = items.map(p => `<li style="margin-bottom: 4px;">${escapeHtml(p)}</li>`).join("");
    return `<div style="padding: 12px 16px; margin-bottom: 12px; background: ${bg}; border: 1px solid ${color}20; border-radius: 4px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: ${color}; margin-bottom: 8px;">${title}</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: #333;">${lis}</ul>
    </div>`;
  };

  const insightsHtml = [
    listSection("✓ All strategies agree", meta.convergence_points, "#0d7680", "rgba(13,118,128,0.05)"),
    listSection("⚡ Points of divergence", meta.divergence_points, "#b8860b", "rgba(184,134,11,0.05)"),
    listSection("🔎 Blind spots", meta.blind_spots, "#6366f1", "rgba(99,102,241,0.05)"),
  ].join("");

  // Narrative
  const narrativeHtml = meta.meta_recommendation
    ? marked.parse(meta.meta_recommendation)
    : "";

  return `
    <!-- Challenge -->
    <div style="margin-bottom: 24px; padding: 16px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 6px;">Your challenge</div>
      <div style="font-size: 14px; color: #444; line-height: 1.6;">${escapeHtml(challenge)}</div>
    </div>

    <!-- Verdict -->
    <div style="margin-bottom: 24px; text-align: center;">
      <span style="display: inline-block; padding: 8px 24px; background: ${verdictBg}; border-radius: 20px; font-size: 18px; font-weight: 800; color: ${verdictColor}; letter-spacing: 0.04em;">
        ${verdict}${score ? ` · ${label} (${score} alignment)` : ""}
      </span>
    </div>

    ${meta.meta_verdict_rationale ? `<p style="font-size: 15px; font-weight: 600; line-height: 1.5; margin-bottom: 16px; color: #333; text-align: center; font-style: italic;">${escapeHtml(meta.meta_verdict_rationale)}</p>` : ""}

    <!-- Strategy Verdicts -->
    ${strategyRows ? `
    <h3 style="margin: 28px 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #999;">Strategy Verdicts</h3>
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; margin-bottom: 20px;">
      <thead><tr style="background: #fafafa; border-bottom: 2px solid #ddd;">
        <th style="padding: 8px 12px; text-align: left;">Strategy</th>
        <th style="padding: 8px 12px; text-align: left;">Verdict</th>
        <th style="padding: 8px 12px; text-align: left;">Summary</th>
      </tr></thead>
      <tbody>${strategyRows}</tbody>
    </table>` : ""}

    <!-- Key Dimensions -->
    ${dimensionsHtml}

    <!-- Insights -->
    ${insightsHtml}

    <!-- Meta Recommendation -->
    <h3 style="margin: 28px 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #999;">Meta-synthesis</h3>
    <div class="prose">${narrativeHtml}</div>
  `;
}

/**
 * Build HTML for a single-strategy markdown report.
 */
function buildMarkdownHtml(report: string, challenge: string): string {
  const reportHtml = marked.parse(report);
  return `
    <div style="margin-bottom: 24px; padding: 16px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 6px;">Your challenge</div>
      <div style="font-size: 14px; color: #444; line-height: 1.6;">${escapeHtml(challenge)}</div>
    </div>
    <div class="prose">${reportHtml}</div>
  `;
}

/**
 * Wrap report HTML in a full page with print CSS.
 */
function wrapInPage(bodyHtml: string, title: string, strategyName: string, strategyIcon: string, date: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      margin: 18mm 16mm 20mm 16mm;
      size: A4;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }

    /* Header */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #0d7680;
      padding-bottom: 12px;
      margin-bottom: 28px;
    }
    .report-header .brand {
      font-size: 22px;
      font-weight: 800;
      color: #1a1a1a;
      letter-spacing: -0.02em;
    }
    .report-header .meta {
      text-align: right;
      font-size: 12px;
      color: #666;
    }
    .report-header .strategy-badge {
      display: inline-block;
      padding: 3px 12px;
      background: #f0f9fa;
      border: 1px solid #d1e7ea;
      border-radius: 14px;
      font-size: 12px;
      color: #0d7680;
      font-weight: 600;
    }

    /* Prose */
    .prose h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 28px 0 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .prose h2 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 24px 0 10px; }
    .prose h3 { font-size: 15px; font-weight: 700; color: #333; margin: 20px 0 8px; }
    .prose p { margin: 0 0 12px; line-height: 1.7; }
    .prose ul, .prose ol { margin: 0 0 12px; padding-left: 24px; }
    .prose li { margin-bottom: 4px; line-height: 1.6; }
    .prose strong { font-weight: 700; }
    .prose em { font-style: italic; }
    .prose blockquote {
      margin: 12px 0;
      padding: 8px 16px;
      border-left: 3px solid #0d7680;
      background: #f8fafa;
      color: #444;
    }
    .prose table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }
    .prose th, .prose td {
      padding: 6px 10px;
      border: 1px solid #ddd;
      text-align: left;
    }
    .prose th { background: #fafafa; font-weight: 600; }
    .prose code {
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 12px;
      background: #f4f4f4;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .prose pre {
      background: #f4f4f4;
      padding: 12px 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
    }
    .prose pre code { background: none; padding: 0; }

    /* Print-specific */
    h1, h2, h3 { break-after: avoid; }
    table, tr { break-inside: avoid; }

    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #bbb;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="brand">RightMind</div>
    </div>
    <div class="meta">
      <span class="strategy-badge">${strategyIcon} ${escapeHtml(strategyName)}</span>
      <br>
      <span style="font-size: 11px; color: #999; margin-top: 4px; display: inline-block;">${escapeHtml(date)}</span>
    </div>
  </div>

  ${bodyHtml}

  <div class="report-footer">
    Generated by RightMind — Multi-agent advisory platform
  </div>
</body>
</html>`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.advisorJob.findUnique({
    where: { id },
    select: {
      id: true,
      challenge: true,
      strategyId: true,
      status: true,
      report: true,
      userId: true,
      createdAt: true,
    },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (job.status !== "DONE" || !job.report) {
    return Response.json({ error: "Report not ready" }, { status: 400 });
  }

  const strategy = STRATEGY_META[job.strategyId] || { name: job.strategyId, icon: "📊" };
  const dateStr = new Date(job.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Build HTML body based on report type
  let bodyHtml: string;
  try {
    const parsed = JSON.parse(job.report);
    if (parsed._type === "all-angles" && parsed.metaSynthesis) {
      bodyHtml = buildAllAnglesHtml(job.report, job.challenge);
    } else {
      bodyHtml = buildMarkdownHtml(job.report, job.challenge);
    }
  } catch {
    bodyHtml = buildMarkdownHtml(job.report, job.challenge);
  }

  const titleSnippet = job.challenge.length > 60
    ? job.challenge.slice(0, 57) + "…"
    : job.challenge;

  const fullHtml = wrapInPage(
    bodyHtml,
    `${strategy.name} — ${titleSnippet}`,
    strategy.name,
    strategy.icon,
    dateStr,
  );

  // Launch Puppeteer and generate PDF
  let browser;
  try {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
      || (process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : "/usr/bin/chromium");

    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });

    await browser.close();

    const safeFilename = `rightmind-${strategy.name.toLowerCase().replace(/\s+/g, "-")}-${job.id.slice(0, 8)}.pdf`;

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    console.error("[PDF] Generation failed:", error);
    return Response.json(
      { error: "PDF generation failed. Chromium may not be available." },
      { status: 500 }
    );
  }
}
