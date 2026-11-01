/**
 * How much of each answer citations.response_snippet keeps (both audit
 * runners cut it here). evidence_snapshots copies the snippet, and the
 * report PDF's method page says so (lib/trust/evidence-archiver.ts's
 * EVIDENCE_ARCHIVE_SENTENCE) -- one number, so the sentence stays true.
 */
export const RESPONSE_SNIPPET_CHARS = 500;
