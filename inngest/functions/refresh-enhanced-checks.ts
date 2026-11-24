import { inngest } from "@/lib/inngest/client";
import {
  ENHANCED_CHECKS_REQUESTED,
  enhancedChecksRequest,
  runEnhancedRefresh,
  writeEnhancedSnapshot,
} from "@/lib/reports/enhanced-report-steps";

/**
 * S01B part 1 (LLD amendment 49, D-RT4): an Enhanced report's checks, in their own function. Until S01B they were a
 * step of generate-narrative-report, which runs in POST_AUDIT_POOL (account-wide limit 1), so one refresh (up to five
 * minutes) held every workspace's post-audit jobs. Here:
 * - one refresh per brand at a time (two Enhanced reports for one brand: the second finds the first one's results
 *   fresh and runs nothing), and at most two account-wide -- never in POST_AUDIT_POOL;
 * - the same steps as before: the stale checks (refresh-enhanced-checks), then the contents and snapshot as of then
 *   (write-report-snapshot), then report/generated starts the PDF (emit-report-generated).
 */
export const ENHANCED_CHECKS_CONCURRENCY: [
  { key: string; limit: number },
  { scope: "account"; key: string; limit: number },
] = [
  { key: "event.data.brandId", limit: 1 },
  { scope: "account", key: '"enhanced-checks"', limit: 2 },
];

export const refreshEnhancedChecksFn = inngest.createFunction(
  {
    id: "refresh-enhanced-checks",
    concurrency: ENHANCED_CHECKS_CONCURRENCY,
    triggers: [{ event: ENHANCED_CHECKS_REQUESTED }],
  },
  async ({ event, step }) => {
    const req = enhancedChecksRequest(event.data);
    const outcomes = await step.run("refresh-enhanced-checks", () => runEnhancedRefresh(req));
    await step.run("write-report-snapshot", () => writeEnhancedSnapshot(req, outcomes));
    await step.run("emit-report-generated", async () => {
      await inngest.send({
        name: "report/generated",
        data: {
          organizationId: req.organizationId,
          brandId: req.brandId,
          reportId: req.reportId,
        },
      });
    });
    return { reportId: req.reportId, brandId: req.brandId, refreshed: outcomes.length };
  },
);
