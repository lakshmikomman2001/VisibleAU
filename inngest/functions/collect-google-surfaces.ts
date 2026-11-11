import {
  collectGoogleSurfaces,
  finishGoogleSurfaces,
  type GoogleStepTools,
} from "@/lib/audit/google-surfaces/collect";
import {
  GOOGLE_COLLECT_EVENT,
  type GoogleCollectEventData,
} from "@/lib/audit/google-surfaces/dispatch";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";

/**
 * Google AI surfaces, Phase 1, part 2 -- one audit's Google AI Overviews and AI Mode answers, collected after
 * its four engines have finished (lib/audit/google-surfaces/collect.ts). Its own function, so it never
 * shares run-audit's steps, step IDs, concurrency or retries:
 * - concurrency: the account's post-audit pool (lib/inngest/concurrency.ts: the one headroom slot of the
 *   Hobby plan's 5, account-scoped), so it never takes a slot from ChatGPT, Claude, Gemini or Perplexity;
 *   step.sleep holds no slot while it waits;
 * - its step IDs are google:* (google:post, google:wait:N, google:poll:N, google:live:<row>, google:finish);
 * - triggered only by google-surfaces/collect, which is sent only when a surface was on for the audit, so
 *   with the switches off it never runs (registering it is all a deploy does);
 * - if it runs out of retries, onFailure marks what's left "not completed" and, for a run-audit audit,
 *   still sends audit.complete, so the email, drift and recommendations go out as before.
 */
export const collectGoogleSurfacesFn = inngest.createFunction(
  {
    id: "collect-google-surfaces",
    retries: 2,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: GOOGLE_COLLECT_EVENT }],
    onFailure: async ({
      event,
      step,
    }: {
      event: { data: { event: { data: GoogleCollectEventData } } };
      step: GoogleStepTools;
    }) => {
      const data = event.data.event.data;
      await step.run("google:failed", () =>
        finishGoogleSurfaces(
          data.auditId,
          "Not completed: Google couldn't be checked for this audit.",
        ),
      );
      if (data.sendAuditComplete) {
        await step.sendEvent("google:audit-complete-after-failure", {
          name: "audit.complete",
          data: {
            auditId: data.auditId,
            brandId: data.brandId,
            organizationId: data.organizationId,
          },
        });
      }
    },
  },
  async ({ event, step }: { event: { data: GoogleCollectEventData }; step: GoogleStepTools }) =>
    collectGoogleSurfaces(step, event.data),
);
