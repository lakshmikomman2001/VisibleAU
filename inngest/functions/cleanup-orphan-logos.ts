import { serviceDb } from "@/db/client";
import { logoCleanupMode, sweepOrphanLogos } from "@/lib/branding/cleanup-orphan-logos";
import { inngest } from "@/lib/inngest/client";
import { getStorage } from "@/lib/storage";

/**
 * 3 Nov -- weekly, Sunday 05:00 UTC. A dry run until LOGO_CLEANUP_MODE=delete is
 * set: the rules are in lib/branding/cleanup-orphan-logos.ts. One step, so a retry
 * recomputes everything: a file already gone is simply no longer listed.
 */
export const cleanupOrphanLogos = inngest.createFunction(
  {
    id: "cleanup-orphan-logos",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 5 * * 0" }],
  },
  async ({ step }) =>
    step.run("logo-cleanup:sweep", () =>
      sweepOrphanLogos({
        db: serviceDb,
        storage: getStorage("logos"),
        mode: logoCleanupMode(),
      }),
    ),
);
