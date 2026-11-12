/**
 * 13 Nov (Sri's walk-through, part 1) -- client-safe: the brand page's classification states and the timeout,
 * without the database imports of lib/brands/needs-confirmation.ts (whose classificationState() decides
 * the state on the server).
 *
 * How long classification may run before the brand page stops waiting for it and asks the owner to
 * choose. One classifier call takes seconds; Inngest's 3 retries with backoff can take a minute or two;
 * after 3 minutes a run that hasn't written its result (an event never delivered, a function killed
 * mid-run before its catch block) is treated as failed, so the owner is never stuck.
 */
export const CLASSIFICATION_TIMEOUT_MS = 3 * 60_000;

/**
 * - "running": the classifier is working (pending or processing, within the timeout);
 * - "needs_confirmation": it finished, not confident enough (or the old classifier's guess);
 * - "could_not_classify": it failed, or ran past CLASSIFICATION_TIMEOUT_MS -- the owner chooses;
 * - "complete": confirmed, or confident enough.
 * An audit is refused in every state but "complete" (brandReadyForAudit) -- there is no generic fallback.
 */
export type ClassificationState =
  | "running"
  | "needs_confirmation"
  | "could_not_classify"
  | "complete";
