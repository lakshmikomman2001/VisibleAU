import { findModelDriftAlert, sendModelDriftEmails } from "@/lib/audit/model-drift-alert";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";

/**
 * Sri's decision 6 (7 Nov) -- an audit a provider answered with a different model than the one asked for
 * (lib/llm/model-drift.ts) emails the org's owners and admins and the operator ([ops]), once
 * (lib/audit/model-drift-alert.ts). Its own function on audit.complete, as notify-engine-total-failure.ts
 * is, so no in-flight audit's step plan changes. The memoized steps plus a per-audit idempotency key per
 * recipient mean a replay never sends twice.
 */
export const notifyModelDrift = inngest.createFunction(
  {
    id: "notify-model-drift",
    retries: 3,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }) => {
    const { auditId } = event.data as { auditId: string };

    const alert = await step.run("find-model-drift", () => findModelDriftAlert(auditId));
    if (!alert) return { sent: 0 };

    const sent = await step.run("send-model-drift-alert", () => sendModelDriftEmails(alert));
    return { sent, engines: [...new Set(alert.drift.map((d) => d.engine))] };
  },
);
