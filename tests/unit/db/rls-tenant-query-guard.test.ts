import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// N — guard against the billing/methods class of bug: a FORCE-RLS tenant
// table queried through the RLS-enforced `db` client with no
// withRlsContext(...) establishing app.current_org_id. Two failure modes:
//   - loud: the RLS policy's current_setting(...)::uuid cast throws 22P02
//     on a corrupted/empty session value (the billing-page prod 500).
//   - silent: a pooled connection carrying a *real* org id from a prior
//     request returns another tenant's rows — a cross-tenant read.
//
// Convention in this codebase (verified true for every correct call site):
// code running inside withRlsContext(orgId, async (tx) => {...}) always
// queries via `tx`, never `db`. So any `db.<verb>(...)` — as opposed to
// `tx.<verb>(...)` (properly scoped) or `serviceDb.<verb>(...)` (a
// deliberate, explicit RLS bypass) — that targets a known tenant table is
// exactly the bug class, regardless of whether it happens to crash today.
//
// RLS_TENANT_TABLES below was captured by querying Neon directly:
//   select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
//   where n.nspname='public' and relkind='r' and relforcerowsecurity=true
// (2026-09-22, 49 tables). Re-verify against the live DB before editing this
// list — don't guess a table's RLS status from its name.
// ---------------------------------------------------------------------------

const RLS_TENANT_TABLES = new Set([
  "actionItems",
  "agencyBrandAssets",
  "agentReadinessScores",
  "aiReferralHits",
  "auditCostSnapshots",
  "auditExports",
  "auditSchedules",
  "auditTrail",
  "audits",
  "authInvitations",
  "authMembers",
  "brandConsensusChecks",
  "brandEntityScores",
  "brandWebMentions",
  "brands",
  "bulkOperations",
  "citationSourceIntelligence",
  "citations",
  "clientPortalInvites",
  "clientPortalViews",
  "comparisonPromptResults",
  "contentDrafts",
  "contentStructureAudits",
  "conversationJourneys",
  "crawlerVisitLogs",
  "dataResidencyLog",
  "driftAlerts",
  "evidenceSnapshots",
  "generatedReports",
  "googleAiModeResults",
  "hallucinationIncidents",
  "journeyRunResults",
  "linkedinPresenceAudits",
  "llmstxtVersions",
  "notificationPreferences",
  "orgFeatureFlags",
  "orgMembers",
  "organizations",
  "queryFanOutResults",
  "remediationTasks",
  "reportDeliverySchedules",
  "reportTemplates",
  "shareOfVoiceSnapshots",
  "subscriptions",
  "technicalAudits",
  "topicalCoverageGaps",
  "users",
  "visibilityTrends",
  "webhookDeliveries",
  "webhookEndpoints",
  "workflowRuns",
  "youtubePresenceAudits",
]);

// db.<verb>(...) only — never tx.<verb> or serviceDb.<verb> — matches even
// when `db` and the method are split across lines (this codebase's usual
// style once a query chain gets long).
const DB_CALL_RE = /\bdb\s*\.\s*(select|insert|update|delete)\s*\(/g;

interface Violation {
  file: string;
  verb: string;
  table: string;
  offset: number;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// A bare `db` token can also be a local variable or function parameter name
// (e.g. a function that accepts `db: DbClient` so its caller can pass a
// properly-scoped `tx`) — only the module-level singleton import from
// @/db/client is the RLS-enforced client this guard cares about. Skip files
// that never import it as a value (a `DbClient` type-only import doesn't
// count, and isn't matched here since `\bdb\b` is case-sensitive).
const DB_IMPORT_RE = /import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*["']@\/db\/client["']/;

function findViolations(file: string, source: string): Violation[] {
  if (!DB_IMPORT_RE.test(source)) return [];

  const violations: Violation[] = [];
  for (const match of source.matchAll(DB_CALL_RE)) {
    const verb = match[1];
    let table: string | null = null;

    if (verb === "select") {
      // The table comes from the .from(table) that follows, not the
      // select(...) argument (which is a column projection, if anything —
      // and can run well past a short lookahead once it lists many columns).
      const lookahead = source.slice(match.index, match.index + 3000);
      table = lookahead.match(/\.from\s*\(\s*([A-Za-z_$][\w$]*)/)?.[1] ?? null;
    } else {
      // insert(table) / update(table) / delete(table) — the table is the
      // direct argument.
      const afterParen = source.slice(match.index + match[0].length);
      table = afterParen.match(/^\s*([A-Za-z_$][\w$]*)/)?.[1] ?? null;
    }

    if (table && RLS_TENANT_TABLES.has(table)) {
      violations.push({ file, verb, table, offset: match.index ?? -1 });
    }
  }
  return violations;
}

describe("RLS guard — db.<verb>() must never target a tenant table (use withRlsContext or serviceDb)", () => {
  const files = [...listSourceFiles(join(process.cwd(), "app")), ...listSourceFiles(join(process.cwd(), "lib"))];

  it("scans a non-trivial number of source files (sanity check the scan itself runs)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds zero unwrapped tenant-table queries via db.<verb>()", () => {
    const violations = files.flatMap((file) => findViolations(file, readFileSync(file, "utf-8")));

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  ${v.file}: db.${v.verb}(${v.table}) at offset ${v.offset}`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} tenant-table quer${violations.length === 1 ? "y" : "ies"} via the RLS-enforced db client outside withRlsContext:\n${detail}\n` +
          "Fix: wrap in withRlsContext(orgId, async (tx) => tx.<verb>(...)), or use serviceDb if the bypass is deliberate.",
      );
    }
  });
});
