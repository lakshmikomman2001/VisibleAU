import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/* ── Generate Draft Modal ── */

describe("generate-draft-modal — structure", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/generate-draft-modal.tsx"),
    "utf-8",
  );

  it("has role=dialog and aria-modal=true", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain("aria-modal");
  });

  it("accepts taskId and taskTitle props", () => {
    expect(source).toContain("taskId: string");
    expect(source).toContain("taskTitle: string");
  });

  it("accepts brandId prop", () => {
    expect(source).toContain("brandId: string");
  });

  it("has content format select with id=draft-format", () => {
    expect(source).toContain('id="draft-format"');
  });

  it("offers all 8 valid content format enum values", () => {
    expect(source).toContain('"expert_article"');
    expect(source).toContain('"how_to_guide"');
    expect(source).toContain('"listicle"');
    expect(source).toContain('"faq_block"');
    expect(source).toContain('"comparison_article"');
    expect(source).toContain('"case_study"');
    expect(source).toContain('"press_release"');
    expect(source).toContain('"linkedin_article"');
  });

  it("defaults to expert_article", () => {
    expect(source).toContain('useState("expert_article")');
  });

  it("closes on Escape key", () => {
    expect(source).toContain('"Escape"');
  });

  it("closes on backdrop click", () => {
    expect(source).toContain("e.target === e.currentTarget");
  });
});

describe("generate-draft-modal — POST call", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/generate-draft-modal.tsx"),
    "utf-8",
  );

  it("POSTs to /api/brands/{brandId}/drafts", () => {
    expect(source).toContain("/api/brands/${brandId}/drafts");
  });

  it("sends taskId and contentFormat in body", () => {
    expect(source).toContain("taskId, contentFormat");
  });

  it("navigates to drafts page on success", () => {
    expect(source).toContain("/brands/${brandId}/workflow/drafts");
  });

  it("shows error on failure", () => {
    expect(source).toContain("Failed to queue draft generation");
  });

  it("disables submit button while submitting", () => {
    expect(source).toContain("disabled={submitting}");
  });
});

/* ── Task Card — Generate draft button ── */

describe("task-card — Generate draft button", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-card.tsx"),
    "utf-8",
  );

  it("accepts onGenerateDraft callback prop", () => {
    expect(source).toContain("onGenerateDraft?: (taskId: string, title: string) => void");
  });

  it("renders Generate draft button when onGenerateDraft is provided", () => {
    expect(source).toContain("Generate draft");
  });

  it("does NOT show Generate draft for complete tasks", () => {
    expect(source).toContain('status !== "complete"');
  });

  it("calls onGenerateDraft with task id and title", () => {
    expect(source).toContain("onGenerateDraft(id, title)");
  });

  it("stopPropagation on generate draft click", () => {
    const genSection = source.slice(source.indexOf("onGenerateDraft &&"));
    expect(genSection).toContain("e.stopPropagation()");
  });

  it("uses FileText icon", () => {
    expect(source).toContain("FileText");
  });

  it("uses content layer color for the button", () => {
    expect(source).toContain("var(--layer-content)");
  });

  it("has aria-label for accessibility", () => {
    expect(source).toContain('aria-label="Generate content draft"');
  });
});

/* ── Task Kanban — draft modal integration ── */

describe("task-kanban — generate draft modal integration", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("imports GenerateDraftModal", () => {
    expect(source).toContain("GenerateDraftModal");
  });

  it("maintains draftTarget state", () => {
    expect(source).toContain("draftTarget");
    expect(source).toContain("setDraftTarget");
  });

  it("passes onGenerateDraft to desktop TaskCards", () => {
    expect(source).toContain("onGenerateDraft={(taskId, title) => setDraftTarget({ taskId, title })");
  });

  it("renders GenerateDraftModal when draftTarget is set", () => {
    expect(source).toContain("{draftTarget && (");
  });

  it("passes brandId to GenerateDraftModal", () => {
    expect(source).toContain("brandId={brandId}");
  });

  it("passes taskId and taskTitle from draftTarget", () => {
    expect(source).toContain("taskId={draftTarget.taskId}");
    expect(source).toContain("taskTitle={draftTarget.title}");
  });

  it("clears draftTarget on modal close", () => {
    expect(source).toContain("onClose={() => setDraftTarget(null)}");
  });
});

/* ── POST /api/brands/[brandId]/drafts route ── */

describe("POST /api/brands/[brandId]/drafts — backend", () => {
  const source = fs.readFileSync(
    path.resolve("app/api/brands/[brandId]/drafts/route.ts"),
    "utf-8",
  );

  it("validates taskId as uuid", () => {
    expect(source).toContain("taskId: z.string().uuid()");
  });

  it("contentFormat is optional", () => {
    expect(source).toContain("contentFormat: z.string().optional()");
  });

  it("emits draft/generate event via inngest", () => {
    expect(source).toContain('"draft/generate"');
    expect(source).toContain("inngest.send");
  });

  it("passes taskId, brandId, orgId, contentFormat in event data", () => {
    expect(source).toContain("taskId: parsed.data.taskId");
    expect(source).toContain("brandId");
    expect(source).toContain("orgId: currentUser.organizationId");
    expect(source).toContain("contentFormat: parsed.data.contentFormat");
  });

  it("returns 202 with queued: true", () => {
    expect(source).toContain("status: 202");
    expect(source).toContain("queued: true");
  });
});

/* ── PATCH /api/brands/[brandId]/drafts/[id] — approve/reject ── */

describe("PATCH /api/brands/[brandId]/drafts/[id] — approve/reject", () => {
  const source = fs.readFileSync(
    path.resolve("app/api/brands/[brandId]/drafts/[id]/route.ts"),
    "utf-8",
  );

  it("accepts status: approved | rejected | published", () => {
    expect(source).toContain('"approved"');
    expect(source).toContain('"rejected"');
    expect(source).toContain('"published"');
  });

  it("sets approvedAt and approvedBy on approve", () => {
    expect(source).toContain("approvedAt");
    expect(source).toContain("approvedBy");
  });

  it("sets publishedAt on publish", () => {
    expect(source).toContain("publishedAt");
  });

  it("accepts title and body updates", () => {
    expect(source).toContain("title: z.string()");
    expect(source).toContain("body: z.string()");
  });

  it("recalculates wordCount on body update", () => {
    expect(source).toContain('body.split(/\\s+/).length');
  });
});

/* ── Drafts page empty state — no dead button ── */

describe("drafts-page-client — empty state directs to tasks", () => {
  const source = fs.readFileSync(
    path.resolve(
      "app/(auth)/brands/[brandId]/workflow/drafts/drafts-page-client.tsx",
    ),
    "utf-8",
  );

  it("does NOT show a dead 'Generate draft' button", () => {
    expect(source).not.toContain('message="No draft yet — Generate draft"');
  });

  it("directs user to the tasks board", () => {
    expect(source).toContain("Remediation Tasks board");
  });
});

/* ── Workflow hub — Generate draft navigates to tasks ── */

describe("workflow-hub-client — Generate draft link goes to tasks", () => {
  const source = fs.readFileSync(
    path.resolve(
      "app/(auth)/brands/[brandId]/workflow/workflow-hub-client.tsx",
    ),
    "utf-8",
  );

  it("Generate draft links to tasks page (not drafts page)", () => {
    expect(source).toContain("/brands/${brandId}/workflow/tasks");
  });

  it("uses content layer color", () => {
    expect(source).toContain("var(--layer-content)");
  });
});

/* ── Inngest function wiring ── */

describe("generateContentDraft Inngest function — wiring", () => {
  const source = fs.readFileSync(
    path.resolve("inngest/functions/generate-content-draft.ts"),
    "utf-8",
  );

  it("triggers on draft/generate event", () => {
    expect(source).toContain('"draft/generate"');
  });

  it("is registered in the serve endpoint", () => {
    const serveSource = fs.readFileSync(
      path.resolve("app/api/webhooks/inngest/route.ts"),
      "utf-8",
    );
    expect(serveSource).toContain("generateContentDraft");
  });

  it("uses selectModel with content_draft task", () => {
    expect(source).toContain('"content_draft"');
    expect(source).toContain("selectModel");
  });

  it("inserts into content_drafts with status draft", () => {
    expect(source).toContain('status: "draft"');
  });
});
