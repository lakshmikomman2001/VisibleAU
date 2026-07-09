import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("append-only tables — no UNIQUE, no ON CONFLICT", () => {
  const crawlerSchema = readFileSync(
    join(__dirname, "../../../db/schema/crawler-visit-logs.ts"),
    "utf-8",
  );

  const agentSchema = readFileSync(
    join(__dirname, "../../../db/schema/agent-readiness-scores.ts"),
    "utf-8",
  );

  it("crawler_visit_logs has no .unique() constraint", () => {
    expect(crawlerSchema).not.toContain(".unique()");
  });

  it("crawler_visit_logs has no onConflict", () => {
    expect(crawlerSchema).not.toContain("onConflict");
  });

  it("agent_readiness_scores has no .unique() constraint", () => {
    expect(agentSchema).not.toContain(".unique()");
  });

  it("agent_readiness_scores has no onConflict", () => {
    expect(agentSchema).not.toContain("onConflict");
  });
});

describe("UPSERT table — content_structure_audits HAS unique", () => {
  const csaSchema = readFileSync(
    join(__dirname, "../../../db/schema/content-structure-audits.ts"),
    "utf-8",
  );

  it("content_structure_audits has unique on brand_id + page_url", () => {
    expect(csaSchema).toContain("unique");
    expect(csaSchema).toContain("brandId");
    expect(csaSchema).toContain("pageUrl");
  });
});
