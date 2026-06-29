import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computePriorityScore } from "@/lib/workflow/priority-scorer";

describe("task-manager — recommendation-to-task creation flow", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/task-manager.ts"),
    "utf-8",
  );

  it("exports createTaskFromRecommendation", () => {
    expect(source).toContain("export async function createTaskFromRecommendation");
  });

  it("exports findExistingTaskForRecommendation", () => {
    expect(source).toContain("export async function findExistingTaskForRecommendation");
  });

  it("CONFIDENCE_TO_QUALITY maps confirmed→sufficient, likely→partial, hypothesis→insufficient", () => {
    expect(source).toContain('confirmed: "sufficient"');
    expect(source).toContain('likely: "partial"');
    expect(source).toContain('hypothesis: "insufficient"');
  });

  it("IMPACT_TO_SCORE maps high=80, medium=50, low=20", () => {
    expect(source).toContain("high: 80");
    expect(source).toContain("medium: 50");
    expect(source).toContain("low: 20");
  });

  it("createTaskFromRecommendation checks for existing task before creating", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    const existingCheckIdx = fn.indexOf("findExistingTaskForRecommendation");
    const createIdx = fn.indexOf("createTask(");
    expect(existingCheckIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(existingCheckIdx).toBeLessThan(createIdx);
  });

  it("returns { existing: true } when duplicate found", () => {
    expect(source).toContain("existing: true");
  });

  it("returns { existing: false } on new creation", () => {
    expect(source).toContain("existing: false");
  });

  it("populates title from recommendation", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("title: rec.title");
  });

  it("populates description from recommendation action", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("description: rec.action");
  });

  it("populates dimension from recommendation", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("dimension: rec.dimension");
  });

  it("populates auditId from recommendation", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("auditId: rec.auditId");
  });

  it("populates recommendationKey from recommendation", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("recommendationKey: rec.recommendationKey");
  });

  it("maps recommendation confidenceLabel to qualityStatus", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("CONFIDENCE_TO_QUALITY[rec.confidenceLabel]");
  });

  it("maps recommendation expectedImpactScore to scoreBefore", () => {
    const fn = source.slice(source.indexOf("async function createTaskFromRecommendation"));
    expect(fn).toContain("IMPACT_TO_SCORE[rec.expectedImpactScore]");
  });
});

describe("task-manager — duplicate guard", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/task-manager.ts"),
    "utf-8",
  );

  it("checks for active tasks (open, in_progress, ready_for_review)", () => {
    const fn = source.slice(source.indexOf("async function findExistingTaskForRecommendation"));
    expect(fn).toContain('"open"');
    expect(fn).toContain('"in_progress"');
    expect(fn).toContain('"ready_for_review"');
  });

  it("uses inArray for status filtering", () => {
    expect(source).toContain("inArray(remediationTasks.status");
  });

  it("matches on recommendationId", () => {
    const fn = source.slice(source.indexOf("async function findExistingTaskForRecommendation"));
    expect(fn).toContain("remediationTasks.recommendationId");
  });
});

describe("task-manager — default manual impact", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/task-manager.ts"),
    "utf-8",
  );

  it("DEFAULT_MANUAL_IMPACT is 50", () => {
    expect(source).toContain("const DEFAULT_MANUAL_IMPACT = 50");
  });

  it("uses DEFAULT_MANUAL_IMPACT when no score inputs exist", () => {
    expect(source).toContain("hasScoreInputs");
    expect(source).toContain("DEFAULT_MANUAL_IMPACT");
  });

  it("manual task with effort=low gets priority > 1", () => {
    const priorityScore = computePriorityScore(50, null, "low");
    const priority = Math.max(1, Math.round(priorityScore * 100));
    expect(priority).toBeGreaterThan(1);
  });

  it("manual task with effort=medium gets priority > 1", () => {
    const priorityScore = computePriorityScore(50, null, "medium");
    const priority = Math.max(1, Math.round(priorityScore * 100));
    expect(priority).toBeGreaterThan(1);
  });

  it("manual task with effort=high gets priority > 1", () => {
    const priorityScore = computePriorityScore(50, null, "high");
    const priority = Math.max(1, Math.round(priorityScore * 100));
    expect(priority).toBeGreaterThan(1);
  });

  it("manual task effort ordering: low > medium > high priority", () => {
    const lowEffort = computePriorityScore(50, null, "low");
    const medEffort = computePriorityScore(50, null, "medium");
    const highEffort = computePriorityScore(50, null, "high");
    expect(lowEffort).toBeGreaterThan(medEffort);
    expect(medEffort).toBeGreaterThan(highEffort);
  });
});

describe("POST route — schema changes", () => {
  const source = fs.readFileSync(
    path.resolve("app/api/brands/[brandId]/tasks/route.ts"),
    "utf-8",
  );

  it("title is optional in the schema", () => {
    expect(source).toContain("title: z.string().min(1).max(500).optional()");
  });

  it("has refine requiring title or recommendationId", () => {
    expect(source).toContain("data.title || data.recommendationId");
  });

  it("calls createTaskFromRecommendation when recommendationId provided without title", () => {
    expect(source).toContain("createTaskFromRecommendation");
  });

  it("returns 200 for existing task (duplicate)", () => {
    expect(source).toContain("result.existing ? 200 : 201");
  });

  it("returns 201 for new task", () => {
    expect(source).toContain("status: 201");
  });
});

describe("action-status-buttons — Create task button", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/action-center/action-status-buttons.tsx"),
    "utf-8",
  );

  it("accepts brandId prop", () => {
    expect(source).toContain("brandId: string");
  });

  it("accepts existingTaskUrl prop", () => {
    expect(source).toContain("existingTaskUrl");
  });

  it("shows 'Task created' link when existingTaskUrl is set", () => {
    expect(source).toContain("Task created");
  });

  it("shows 'Create task' button when no existing task", () => {
    expect(source).toContain("Create task");
  });

  it("POSTs to /api/brands/{brandId}/tasks with recommendationId", () => {
    expect(source).toContain("/api/brands/${brandId}/tasks");
    expect(source).toContain("recommendationId: itemId");
  });

  it("navigates to workflow tasks on success", () => {
    expect(source).toContain("/brands/${brandId}/workflow/tasks");
  });
});

describe("action detail page — passes brandId + existingTaskUrl", () => {
  const source = fs.readFileSync(
    path.resolve("app/(auth)/action-center/[id]/page.tsx"),
    "utf-8",
  );

  it("queries for existing task on the recommendation", () => {
    expect(source).toContain("remediationTasks.recommendationId");
  });

  it("passes brandId to ActionStatusButtons", () => {
    expect(source).toContain("brandId={item.brandId}");
  });

  it("passes existingTaskUrl to ActionStatusButtons", () => {
    expect(source).toContain("existingTaskUrl={existingTaskUrl}");
  });
});

describe("create-task-modal — New task form", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/create-task-modal.tsx"),
    "utf-8",
  );

  it("has role=dialog and aria-modal=true", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain("aria-modal");
  });

  it("has title input (required)", () => {
    expect(source).toContain('id="task-title"');
    expect(source).toContain("required");
  });

  it("has effort select with low/medium/high options", () => {
    expect(source).toContain('id="task-effort"');
    expect(source).toContain('"low"');
    expect(source).toContain('"medium"');
    expect(source).toContain('"high"');
  });

  it("has optional description textarea", () => {
    expect(source).toContain('id="task-description"');
  });

  it("POSTs to /api/brands/{brandId}/tasks", () => {
    expect(source).toContain("/api/brands/${brandId}/tasks");
  });

  it("sends title, effort, and description in payload", () => {
    expect(source).toContain("title:");
    expect(source).toContain("effort");
    expect(source).toContain("description:");
  });

  it("has focus management — autofocuses title", () => {
    expect(source).toContain("titleRef.current?.focus()");
  });

  it("closes on Escape key", () => {
    expect(source).toContain('"Escape"');
  });

  it("uses --focus-ring on focus", () => {
    expect(source).toContain("var(--focus-ring)");
  });
});

describe("workflow-hub-client — New task modal integration", () => {
  const source = fs.readFileSync(
    path.resolve("app/(auth)/brands/[brandId]/workflow/workflow-hub-client.tsx"),
    "utf-8",
  );

  it("imports CreateTaskModal", () => {
    expect(source).toContain("CreateTaskModal");
  });

  it("New task is a button (not a Link)", () => {
    expect(source).toContain('type="button"');
    expect(source).toContain("setShowCreateModal(true)");
  });

  it("renders CreateTaskModal when showCreateModal is true", () => {
    expect(source).toContain("{showCreateModal && (");
  });

  it("calls router.refresh() on success", () => {
    expect(source).toContain("router.refresh()");
  });
});
