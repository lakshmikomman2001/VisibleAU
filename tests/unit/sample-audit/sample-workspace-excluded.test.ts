/**
 * 20 Nov (Sri's decision, part 9): the home page's free sample runs in a system workspace (slug __sample__, no members)
 * whose brands are visitors' domains. Nothing that walks workspaces or brands may touch it -- the crons, the public
 * badge, the operator pages' lists and counts -- and its data is deleted 24 hours on, brand row included. Each surface
 * below is checked where it reads, with why it's safe.
 */
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { inOpenWorkspace, liveBrandsOnly, notTheSampleWorkspace } from "@/db/open-workspace";
import { brands } from "@/db/schema/brands";
import { SAMPLE_COSTS_LINE } from "@/lib/admin/costs";
import { SAMPLE_AUDIT_RETENTION_HOURS } from "@/lib/governance/residency-config";
import { SAMPLE_DATA_DELETED } from "@/lib/legal/data-facts";
import { SAMPLE_ORG_SLUG } from "@/lib/sample-audit/sample-org-slug";

const dialect = new PgDialect();
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const src = (path: string) => strip(readFileSync(path, "utf8"));

describe("an open workspace is never the sample's", () => {
  it("inOpenWorkspace and liveBrandsOnly leave it out, by its slug", () => {
    for (const clause of [inOpenWorkspace(brands.organizationId), liveBrandsOnly()]) {
      const q = dialect.sqlToQuery(clause);
      expect(q.sql).toContain('"slug" IS DISTINCT FROM');
      expect(q.params).toContain(SAMPLE_ORG_SLUG);
    }
    expect(dialect.sqlToQuery(notTheSampleWorkspace()).params).toEqual(["__sample__"]);
  });

  it("every brand-walking cron reads liveBrandsOnly (YouTube, web mentions, LinkedIn, consensus, classification)", () => {
    for (const path of [
      "inngest/functions/audit-youtube-presence.ts",
      "inngest/functions/track-brand-web-mentions.ts",
      "inngest/functions/audit-linkedin-presence.ts",
      "inngest/functions/check-cross-platform-consensus.ts",
      "inngest/functions/classify-existing-brands.ts",
    ]) {
      expect(src(path), path).toContain("liveBrandsOnly()");
    }
  });

  it("the public badge and the operator's classification backfill read inOpenWorkspace", () => {
    expect(src("app/api/badge/route.ts")).toContain("inOpenWorkspace(brands.organizationId)");
    expect(src("app/api/admin/backfill-classify/route.ts")).toContain(
      "inOpenWorkspace(brands.organizationId)",
    );
  });
});

describe("the operator pages", () => {
  it("/admin/settings' workspace picker and /admin/audits leave it out", () => {
    expect(src("lib/governance/google-surfaces.ts")).toContain(
      ".where(and(isNull(organizations.deletedAt), notTheSampleWorkspace()))",
    );
    expect(src("lib/admin/trend-exclusions.ts")).toContain(
      "notInTheSampleWorkspace(audits.organizationId)",
    );
  });

  it("/admin/costs keeps its real provider spend in the totals, on its own line that says what it is", () => {
    expect(SAMPLE_COSTS_LINE).toBe("Free sample audits (home page, no workspace)");
    const costs = src("lib/admin/costs.ts");
    expect(costs).toContain("a.organizationSlug === SAMPLE_ORG_SLUG ? SAMPLE_COSTS_LINE");
    expect(costs).toContain('plan: ws.isSample ? "No plan (free sample)"');
  });

  it("the weekly residency refresh doesn't record it", () => {
    expect(src("inngest/functions/audit-data-retention.ts")).toContain(
      ".where(and(isNull(organizations.deletedAt), notTheSampleWorkspace()))",
    );
  });
});

describe("the rest, already apart", () => {
  it("a sample audit returns before emails, drift, model drift, webhooks and GA4 (they follow audit.complete)", () => {
    const runner = src("lib/audit/run-audit-inline.ts");
    const sampleReturn = runner.indexOf('if (a.triggeredBy === "sample") return;');
    expect(sampleReturn).toBeGreaterThan(-1);
    expect(runner.indexOf("sendAuditComplete", sampleReturn)).toBeGreaterThan(sampleReturn);
  });

  it("a failed sample keeps isSample, so its status page says failed rather than 404", () => {
    expect(src("lib/audit/run-audit-inline.ts")).toContain(
      ["metadata: sql`coalesce($", "{audits.metadata}, '{}'::jsonb) ||"].join(""),
    );
  });
});

describe("its data is deleted a day on, and the FAQ says so", () => {
  it("24 hours -- 'a day' in the FAQ's words (it never says an audit's questions go after 24 hours: they're kept)", () => {
    expect(SAMPLE_AUDIT_RETENTION_HOURS).toBe(24);
    expect(SAMPLE_DATA_DELETED).toBe(
      "If you run the free sample audit, we delete the website address you gave and its questions and answers a day after you ran it.",
    );
    expect(src("components/domain/landing/faq-section.tsx")).toContain("SAMPLE_DATA_DELETED,");
    expect(readFileSync("docs/privacy-policy-draft.md", "utf8")).toContain(
      "24 hours after the brand was made, brand row included",
    );
  });
});
