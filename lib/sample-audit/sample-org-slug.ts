/**
 * The system workspace the home page's free sample audits run in (lib/sample-audit/synthetic-org.ts makes it). 20 Nov
 * (part 9): in one place, so the crons, operator pages and counts that must leave it out (db/open-workspace.ts) and
 * the clean-up that deletes its data (lib/sample-audit/retention.ts) name the same workspace.
 */
export const SAMPLE_ORG_SLUG = "__sample__";
