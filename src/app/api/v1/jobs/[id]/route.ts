import { prisma } from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateApiRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized. Invalid or missing API key." }, { status: 401 });
    }

    const resolvedParams = await params;
    const jobId = resolvedParams.id;

    const job = await prisma.advisorJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        userId: true,
        status: true,
        progress: true,
        report: true,
        error: true,
      },
    });

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== user.id) {
      return Response.json({ error: "Unauthorized access to job" }, { status: 403 });
    }

    let progressObj;
    try {
      progressObj = JSON.parse(job.progress);
    } catch {
      progressObj = { steps: [] };
    }

    const responsePayload: any = {
      job_id: job.id,
      status: job.status,
      progress: {
        current_phase: progressObj.currentPhase,
        steps: progressObj.steps?.map((s: any) => ({
          agent_role: s.agentRole,
          status: s.status,
        })) || []
      }
    };

    if (job.status === "DONE" && job.report) {
      try {
        responsePayload.report = JSON.parse(job.report);
      } catch {
        responsePayload.report = job.report; // fallback to string if not JSON
      }
    } else if (job.status === "FAILED") {
      responsePayload.error = job.error;
    }

    return Response.json(responsePayload);
  } catch (error) {
    console.error("API GET /v1/jobs/[id] error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
