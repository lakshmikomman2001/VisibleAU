export interface WorkflowRunResult {
  durationMs: number;
  auditsTriggered?: number;
  reportsGenerated?: number;
  auditId?: string;
  fanOutResultsCount?: number;
  linkedinScore?: number;
  consensusScore?: number;
  errorMessage?: string;
}
