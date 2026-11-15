import { inngest } from "@/lib/inngest/client";

/**
 * Leftovers task, part 2 (17 Nov): how an audit says it's finished, the one way for every runner.
 *
 * `audit.complete` is what every follow-up listens for (app/api/webhooks/inngest/route.ts): recommendations, drift,
 * the completion email, the engine-failure and model-drift alerts, the weekly trend (and from it the narrative report,
 * its PDF and the scheduled report emails), topical gaps, citation sources, evidence snapshots, hallucination checks,
 * the GA4 push, head-to-head comparisons and the `audit.completed` webhooks. An audit started by hand sent it
 * (inngest/functions/run-audit.ts); a scheduled, bulk, workflow or validation audit (lib/audit/run-audit-inline.ts)
 * never did, so none of them ran for it -- only inline copies of drift, recommendations and the two alerts.
 */
export const AUDIT_COMPLETE_EVENT = "audit.complete";

export interface AuditCompleteEvent {
  name: typeof AUDIT_COMPLETE_EVENT;
  data: { auditId: string; brandId: string; organizationId: string };
}

/** The event, as both runners and the Google collector send it. */
export function auditCompleteEvent(audit: {
  id: string;
  brandId: string;
  organizationId: string;
}): AuditCompleteEvent {
  return {
    name: AUDIT_COMPLETE_EVENT,
    data: { auditId: audit.id, brandId: audit.brandId, organizationId: audit.organizationId },
  };
}

/**
 * The inline runner's `audit.complete`, sent from inside the step that ran it. True when Inngest took it (the
 * follow-ups will run, exactly as for an audit started by hand); false when it couldn't be reached -- the caller then
 * runs what it can inline, as it always did.
 */
export async function sendAuditComplete(audit: {
  id: string;
  brandId: string;
  organizationId: string;
}): Promise<boolean> {
  try {
    await inngest.send(auditCompleteEvent(audit));
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "audit_complete_send_failed",
        auditId: audit.id,
        error: err instanceof Error ? err.name : "unknown",
      }),
    );
    return false;
  }
}
