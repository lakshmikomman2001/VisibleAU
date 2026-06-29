import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/* ── WorkflowSubNav component ── */

describe("workflow-sub-nav — component structure", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/workflow-sub-nav.tsx"),
    "utf-8",
  );

  it("is a client component", () => {
    expect(source).toContain('"use client"');
  });

  it("accepts brandId prop", () => {
    expect(source).toContain("brandId: string");
  });

  it("renders Tasks and Drafts tabs", () => {
    expect(source).toContain('"Tasks"');
    expect(source).toContain('"Drafts"');
  });

  it("links to /workflow/{key} using brandId and tab key", () => {
    expect(source).toContain("/workflow/${tab.key}");
  });

  it("defines tasks and drafts tab keys", () => {
    expect(source).toContain('"tasks"');
    expect(source).toContain('"drafts"');
  });

  it("does NOT link to workflow/runs (page does not exist)", () => {
    expect(source).not.toContain("/workflow/runs");
  });

  it("uses usePathname for active detection", () => {
    expect(source).toContain("usePathname");
  });

  it("uses accent-blue for active tab border (matching audit tab convention)", () => {
    expect(source).toContain("var(--accent-blue)");
  });

  it("has aria-label for navigation", () => {
    expect(source).toContain('aria-label="Workflow sections"');
  });

  it("uses Link for navigation", () => {
    expect(source).toContain("from \"next/link\"");
  });
});

/* ── Integration: hub imports WorkflowSubNav ── */

describe("workflow-hub-client — sub-nav integration", () => {
  const source = fs.readFileSync(
    path.resolve(
      "app/(auth)/brands/[brandId]/workflow/workflow-hub-client.tsx",
    ),
    "utf-8",
  );

  it("imports WorkflowSubNav", () => {
    expect(source).toContain("WorkflowSubNav");
  });

  it("renders WorkflowSubNav with brandId", () => {
    expect(source).toContain("<WorkflowSubNav brandId={brandId}");
  });
});

/* ── Integration: tasks page imports WorkflowSubNav ── */

describe("tasks-page-client — sub-nav integration", () => {
  const source = fs.readFileSync(
    path.resolve(
      "app/(auth)/brands/[brandId]/workflow/tasks/tasks-page-client.tsx",
    ),
    "utf-8",
  );

  it("imports WorkflowSubNav", () => {
    expect(source).toContain("WorkflowSubNav");
  });

  it("renders WorkflowSubNav with brandId", () => {
    expect(source).toContain("<WorkflowSubNav brandId={brandId}");
  });
});

/* ── Integration: drafts page imports WorkflowSubNav ── */

describe("drafts-page-client — sub-nav integration", () => {
  const source = fs.readFileSync(
    path.resolve(
      "app/(auth)/brands/[brandId]/workflow/drafts/drafts-page-client.tsx",
    ),
    "utf-8",
  );

  it("imports WorkflowSubNav", () => {
    expect(source).toContain("WorkflowSubNav");
  });

  it("renders WorkflowSubNav with brandId", () => {
    expect(source).toContain("<WorkflowSubNav brandId={brandId}");
  });

  it("still has the single-draft viewer with back button", () => {
    expect(source).toContain("Back to drafts");
  });
});
