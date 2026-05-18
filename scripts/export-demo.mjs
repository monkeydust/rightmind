import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const db = new Database('./prisma/dev.db');

const DEMO_JOB_IDS = [
  '841cf93f-bfda-49a8-a077-554aeab08ca2', // Deep Dive: bakery
  'ac33e9c5-0b04-4eeb-83ed-606bc8948921', // All Angles: Amersham vs Chalfont
];

function exportJob(id) {
  const job = db.prepare(`SELECT * FROM AdvisorJob WHERE id = ?`).get(id);
  if (!job) throw new Error(`Job ${id} not found`);
  
  const responses = db.prepare(`
    SELECT agentRole, agentModel, round, phase, prompt, response, reasoning, tokens, durationMs
    FROM AgentResponse WHERE jobId = ? ORDER BY createdAt ASC
  `).all(id);

  // For all-angles, also grab child jobs
  const children = db.prepare(`
    SELECT * FROM AdvisorJob WHERE parentJobId = ? AND status = 'DONE'
  `).all(id);

  const childData = children.map(child => {
    const childResponses = db.prepare(`
      SELECT agentRole, agentModel, round, phase, prompt, response, reasoning, tokens, durationMs
      FROM AgentResponse WHERE jobId = ? ORDER BY createdAt ASC
    `).all(child.id);
    return { ...child, agentResponses: childResponses };
  });

  return {
    challenge: job.challenge,
    strategyId: job.strategyId,
    status: job.status,
    report: job.report,
    progress: job.progress,
    agentResponses: responses,
    childJobs: childData,
  };
}

const fixtures = DEMO_JOB_IDS.map(id => exportJob(id));
writeFileSync('./src/lib/demo-fixtures.json', JSON.stringify(fixtures, null, 2));
console.log(`Exported ${fixtures.length} demo fixtures`);
fixtures.forEach((f, i) => {
  console.log(`  ${i}: ${f.strategyId} — "${f.challenge.substring(0, 80)}..." (${f.agentResponses.length} responses, ${f.childJobs.length} children)`);
});

db.close();
