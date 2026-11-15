import { RESPONSE_SNIPPET_CHARS } from "@/lib/audit/response-snippet";

/**
 * DEMO-BLOCKER (1 Nov), part 5 point 8 -- what the evidence archive really
 * keeps, as the report PDF's method page and the Evidence Archive page state
 * it. It used to say "immutable evidence snapshots ... for compliance and
 * audit purposes"; nothing makes them immutable (the table has UPDATE and
 * DELETE policies, no trigger or hash, and prod-fix 0040 deleted rows --
 * diag-0111). True because captureEvidenceSnapshots
 * (lib/trust/evidence-archiver.ts) copies every run-1 answer's engine,
 * question and response_snippet (its first RESPONSE_SNIPPET_CHARS
 * characters) with a capture time.
 *
 * Its own file (17 Nov, part 3) so the Evidence Archive page, a client
 * component, can show the same sentence without importing the archiver's
 * database code.
 */
export const EVIDENCE_ARCHIVE_SENTENCE = `For each audit we keep the first ${RESPONSE_SNIPPET_CHARS} characters of every first-run answer, with its engine, question and capture time.`;

/**
 * 17 Nov, part 3: the key that ties an archived answer back to its citations
 * row (same audit, engine and question; the archive keeps only run 1), so the
 * Evidence Archive can mark the answers to questions that named the business.
 */
export function evidenceAnswerKey(auditId: string, engine: string, prompt: string): string {
  return `${auditId}\u0000${engine}\u0000${prompt}`;
}
