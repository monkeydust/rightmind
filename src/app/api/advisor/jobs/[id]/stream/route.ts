/**
 * GET /api/advisor/jobs/[id]/stream
 *
 * Server-Sent Events endpoint for real-time job progress.
 * Polls the database every 1.5 seconds and emits progress updates.
 * Closes the stream when the job is DONE or FAILED.
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: jobId } = await params;

  // Verify job exists and belongs to this user before opening stream
  const job = await prisma.advisorJob.findUnique({
    where: { id: jobId },
    select: { userId: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      }

      let lastProgressHash = "";

      async function poll() {
        if (closed) return;

        try {
          const job = await prisma.advisorJob.findUnique({
            where: { id: jobId },
          });

          if (!job) {
            send("error", { message: "Job not found" });
            controller.close();
            closed = true;
            return;
          }

          // Only send update if progress changed
          const progressHash = `${job.status}:${job.progress}`;
          if (progressHash !== lastProgressHash) {
            lastProgressHash = progressHash;

            let progress;
            try {
              progress = JSON.parse(job.progress || "{}");
            } catch {
              progress = {};
            }

            send("progress", {
              status: job.status,
              challenge: job.challenge,
              strategyId: job.strategyId,
              progress,
            });
          }

          // If done or failed, send the final event and close
          if (job.status === "DONE") {
            send("done", {
              status: "DONE",
              report: job.report,
              completedAt: job.completedAt?.toISOString(),
            });
            controller.close();
            closed = true;
            return;
          }

          if (job.status === "FAILED") {
            send("failed", {
              status: "FAILED",
              error: job.error,
            });
            controller.close();
            closed = true;
            return;
          }

          // Poll again in 1.5 seconds
          setTimeout(poll, 1500);
        } catch (err) {
          console.error(`[SSE] Error polling job ${jobId}:`, err);
          send("error", { message: "Internal error" });
          controller.close();
          closed = true;
        }
      }

      // Start polling
      poll();
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
