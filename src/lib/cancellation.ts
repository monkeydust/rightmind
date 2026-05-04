/**
 * Job cancellation registry.
 *
 * Tracks which jobs have been cancelled via an in-memory Set.
 * Orchestrators check `isJobCancelled(jobId)` between LLM steps
 * and bail out early if the job has been flagged.
 */

const cancelledJobs = new Set<string>();

export function cancelJob(jobId: string) {
  cancelledJobs.add(jobId);
}

export function isJobCancelled(jobId: string): boolean {
  return cancelledJobs.has(jobId);
}

export function clearCancellation(jobId: string) {
  cancelledJobs.delete(jobId);
}
