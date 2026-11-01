import {
  findEngineTotalFailures,
  sendEngineTotalFailureEmails,
} from "@/lib/audit/engine-total-failure-alert";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";

/**
 * URGENT audit #37 (31 Oct), item 2 -- an audit in which every call to
 * an engine failed is loud: `engine_total_failure` is logged per engine
 * and the org's owners and admins and the operator are emailed
 * (lib/audit/engine-total-failure-alert.ts). A new function on
 * audit.complete rather than a new step inside run-audit, so no
 * in-flight audit's step plan changes. The memoized steps plus a
 * per-audit idempotency key per recipient mean a replay never sends twice.
 */
export const notifyEngineTotalFailure = inngest.createFunction(
  {
    id: "notify-engine-total-failure",
    retries: 3,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }) => {
    const { auditId } = event.data as { auditId: string };

    const alert = await step.run("find-engine-total-failures", () =>
      findEngineTotalFailures(auditId),
    );
    if (!alert) return { sent: 0 };

    const sent = await step.run("send-engine-total-failure-alert", () =>
      sendEngineTotalFailureEmails(alert),
    );
    return { sent, engines: alert.engines.map((e) => e.engine) };
  },
);
