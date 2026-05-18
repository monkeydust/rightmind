/**
 * Seeds demo jobs for new users so they can see example reports
 * without burning any API tokens.
 *
 * Called once when a user first signs in and has no jobs yet.
 */

import { prisma } from "@/lib/db";
import demoFixtures from "./demo-fixtures.json";

interface DemoFixture {
  challenge: string;
  strategyId: string;
  status: string;
  report: string | null;
  progress: string;
  agentResponses: {
    agentRole: string;
    agentModel: string;
    round: number;
    phase: string | null;
    prompt: string;
    response: string;
    reasoning: string | null;
    tokens: number;
    durationMs: number;
  }[];
  childJobs: {
    challenge: string;
    strategyId: string;
    status: string;
    report: string | null;
    progress: string;
    agentResponses: {
      agentRole: string;
      agentModel: string;
      round: number;
      phase: string | null;
      prompt: string;
      response: string;
      reasoning: string | null;
      tokens: number;
      durationMs: number;
    }[];
  }[];
}

const fixtures = demoFixtures as DemoFixture[];

export async function seedDemoJobs(userId: string): Promise<void> {
  // Check if user already has jobs (don't seed twice)
  const existingCount = await prisma.advisorJob.count({
    where: { userId },
  });

  if (existingCount > 0) return;

  console.log(`[Demo] Seeding ${fixtures.length} sample jobs for user ${userId}`);

  for (const fixture of fixtures) {
    // Create the parent job
    const job = await prisma.advisorJob.create({
      data: {
        userId,
        challenge: fixture.challenge,
        strategyId: fixture.strategyId,
        status: fixture.status,
        report: fixture.report,
        progress: fixture.progress,
        executionMode: "instant",
        completedAt: new Date(),
      },
    });

    // Create agent responses
    for (const resp of fixture.agentResponses) {
      await prisma.agentResponse.create({
        data: {
          jobId: job.id,
          agentRole: resp.agentRole,
          agentModel: resp.agentModel,
          round: resp.round,
          phase: resp.phase,
          prompt: resp.prompt,
          response: resp.response,
          reasoning: resp.reasoning,
          tokens: resp.tokens,
          durationMs: resp.durationMs,
        },
      });
    }

    // For all-angles jobs, create child jobs
    if (fixture.childJobs.length > 0) {
      const childJobIds: string[] = [];

      for (const child of fixture.childJobs) {
        const childJob = await prisma.advisorJob.create({
          data: {
            userId,
            challenge: child.challenge,
            strategyId: child.strategyId,
            status: child.status,
            report: child.report,
            progress: child.progress,
            executionMode: "instant",
            parentJobId: job.id,
            completedAt: new Date(),
          },
        });
        childJobIds.push(childJob.id);

        for (const resp of child.agentResponses) {
          await prisma.agentResponse.create({
            data: {
              jobId: childJob.id,
              agentRole: resp.agentRole,
              agentModel: resp.agentModel,
              round: resp.round,
              phase: resp.phase,
              prompt: resp.prompt,
              response: resp.response,
              reasoning: resp.reasoning,
              tokens: resp.tokens,
              durationMs: resp.durationMs,
            },
          });
        }
      }

      // Update parent job's report with correct child job IDs
      if (fixture.report) {
        try {
          const reportData = JSON.parse(fixture.report);
          if (reportData._type === "all-angles") {
            reportData.childJobIds = childJobIds;
            await prisma.advisorJob.update({
              where: { id: job.id },
              data: { report: JSON.stringify(reportData) },
            });
          }
        } catch {
          // Report isn't JSON, leave as-is
        }
      }
    }
  }

  console.log(`[Demo] ✅ Seeded ${fixtures.length} sample jobs for user ${userId}`);
}
