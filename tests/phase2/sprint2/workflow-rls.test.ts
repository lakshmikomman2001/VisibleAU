import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("workflow RLS — all 3 tables have org_isolation policies", () => {
  const migration = fs.readFileSync(
    path.resolve("db/migrations/0011_phase2_sprint2_workflow.sql"),
    "utf-8",
  );

  const tables = ["remediation_tasks", "workflow_runs", "content_drafts"];

  for (const table of tables) {
    it(`${table} has ENABLE ROW LEVEL SECURITY`, () => {
      expect(migration).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      );
    });

    it(`${table} has DROP POLICY IF EXISTS before CREATE POLICY (MI-01)`, () => {
      const dropPattern = `DROP POLICY IF EXISTS ${table}_org_isolation ON ${table}`;
      const createPattern = `CREATE POLICY ${table}_org_isolation ON ${table}`;
      const dropIdx = migration.indexOf(dropPattern);
      const createIdx = migration.indexOf(createPattern);
      expect(dropIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(-1);
      expect(dropIdx).toBeLessThan(createIdx);
    });

    it(`${table} RLS policy uses app.current_org_id`, () => {
      const policySection = migration.slice(
        migration.indexOf(`CREATE POLICY ${table}_org_isolation`),
      );
      expect(policySection).toContain("current_setting('app.current_org_id'");
    });
  }

  it("fan_out_gap_id has no REFERENCES constraint (BD-01)", () => {
    const fanOutLine = migration
      .split("\n")
      .find((l) => l.includes("fan_out_gap_id"));
    expect(fanOutLine).toBeDefined();
    expect(fanOutLine).not.toContain("REFERENCES");
  });

  it("topical_gap_id has no REFERENCES constraint (BD-01)", () => {
    const topicalLine = migration
      .split("\n")
      .find((l) => l.includes("topical_gap_id"));
    expect(topicalLine).toBeDefined();
    expect(topicalLine).not.toContain("REFERENCES");
  });

  it("migration is MI-01 idempotent — 3 CREATE TABLE IF NOT EXISTS statements", () => {
    const lines = migration.split("\n").filter(
      (l) => l.trimStart().startsWith("CREATE TABLE IF NOT EXISTS"),
    );
    expect(lines).toHaveLength(3);
  });

  it("migration is MI-01 idempotent — 3 DROP POLICY IF EXISTS statements", () => {
    const lines = migration.split("\n").filter(
      (l) => l.trimStart().startsWith("DROP POLICY IF EXISTS"),
    );
    expect(lines).toHaveLength(3);
  });
});

describe("schema defaults — status columns", () => {
  const migration = fs.readFileSync(
    path.resolve("db/migrations/0011_phase2_sprint2_workflow.sql"),
    "utf-8",
  );

  it("remediation_tasks.status defaults to 'open'", () => {
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'open'");
  });

  it("workflow_runs.status defaults to 'scheduled'", () => {
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'scheduled'");
  });

  it("content_drafts.status defaults to 'draft'", () => {
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'draft'");
  });

  it("workflow_runs uses 'completed' (-ed) deliberately different from audits 'complete'", () => {
    const schemaSource = fs.readFileSync(
      path.resolve("db/schema/workflow-runs.ts"),
      "utf-8",
    );
    expect(schemaSource).toContain("completed");
  });
});

describe("schema NOT NULL constraints", () => {
  const migration = fs.readFileSync(
    path.resolve("db/migrations/0011_phase2_sprint2_workflow.sql"),
    "utf-8",
  );

  it("remediation_tasks.title is NOT NULL", () => {
    expect(migration).toContain("title TEXT NOT NULL");
  });

  it("remediation_tasks.priority is NOT NULL", () => {
    expect(migration).toContain("priority INTEGER NOT NULL");
  });

  it("content_drafts.draft_type is NOT NULL", () => {
    expect(migration).toContain("draft_type TEXT NOT NULL");
  });

  it("content_drafts.content_format is NOT NULL", () => {
    expect(migration).toContain("content_format TEXT NOT NULL");
  });

  it("content_drafts.body is NOT NULL", () => {
    expect(migration).toContain("body TEXT NOT NULL");
  });

  it("workflow_runs.workflow_type is NOT NULL", () => {
    expect(migration).toContain("workflow_type TEXT NOT NULL");
  });

  it("workflow_runs.scheduled_for is NOT NULL", () => {
    expect(migration).toContain("scheduled_for TIMESTAMPTZ NOT NULL");
  });
});

describe("MI-01 — CREATE INDEX IF NOT EXISTS", () => {
  const migration = fs.readFileSync(
    path.resolve("db/migrations/0011_phase2_sprint2_workflow.sql"),
    "utf-8",
  );

  it("has 4 CREATE INDEX IF NOT EXISTS statements", () => {
    const lines = migration.split("\n").filter(
      (l) => l.trimStart().startsWith("CREATE INDEX IF NOT EXISTS"),
    );
    expect(lines).toHaveLength(4);
  });

  it("indexes include tasks_brand_status_idx", () => {
    expect(migration).toContain("tasks_brand_status_idx");
  });

  it("indexes include tasks_assigned_idx", () => {
    expect(migration).toContain("tasks_assigned_idx");
  });

  it("indexes include workflow_runs_org_status_idx", () => {
    expect(migration).toContain("workflow_runs_org_status_idx");
  });

  it("indexes include workflow_runs_brand_scheduled_idx", () => {
    expect(migration).toContain("workflow_runs_brand_scheduled_idx");
  });
});

describe("workflow-orchestrator — source-level status lifecycle", () => {
  const orchSource = fs.readFileSync(
    path.resolve("lib/workflow/workflow-orchestrator.ts"),
    "utf-8",
  );

  it("markCompleted uses status 'completed' (with -ed)", () => {
    expect(orchSource).toContain('status: "completed"');
  });

  it("markFailed uses status 'failed'", () => {
    expect(orchSource).toContain('status: "failed"');
  });

  it("markRunning uses status 'running'", () => {
    expect(orchSource).toContain('status: "running"');
  });

  it("getScheduledRuns filters by status 'scheduled'", () => {
    expect(orchSource).toContain('"scheduled"');
  });

  it("markFailed constructs WorkflowRunResult with durationMs: 0", () => {
    expect(orchSource).toContain("durationMs: 0");
  });

  it("markFailed stores errorMessage in WorkflowRunResult", () => {
    expect(orchSource).toContain("errorMessage");
  });

  it("markCompleted sets completedAt", () => {
    expect(orchSource).toContain("completedAt: new Date()");
  });

  it("markRunning sets startedAt", () => {
    expect(orchSource).toContain("startedAt: new Date()");
  });
});

describe("WorkflowRunResult — type shape", () => {
  const typesSource = fs.readFileSync(
    path.resolve("lib/workflow/types.ts"),
    "utf-8",
  );

  it("has durationMs as required field", () => {
    expect(typesSource).toContain("durationMs: number;");
  });

  it("has errorMessage as optional field", () => {
    expect(typesSource).toContain("errorMessage?: string;");
  });

  it("has auditsTriggered as optional field", () => {
    expect(typesSource).toContain("auditsTriggered?: number;");
  });
});
