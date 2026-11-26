// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- what customers read on the wizard and brand pages is plain words, not the product's internals:
 * "Region determines vertical packs and prompt library." and "prompts", "classifier", "Vertical" are gone; the delete
 * dialog says what deletion does (a soft delete: removed from the workspace, schedules and report emails stop, can't be
 * restored, past audits stay) instead of "Audit history is preserved ... This cannot be undone."; and a brand made
 * before the confirm step is asked in its own terms, without its past audits being hidden.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ts from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ClassificationConfirmCard } from "@/components/domain/brand/classification-confirm-card";
import { listFiles, readSourcesBeforeAll, sourceText } from "@/tests/helpers/source-files";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/b1",
}));

const JARGON =
  /vertical pack|prompt librar|prompt pack|classifier|classification|\bprompts?\b|\bVertical\b/;
const PAGES = [
  "app/(auth)/brands/wizard",
  "app/(auth)/brands/[brandId]/page.tsx",
  "app/(auth)/brands/page.tsx",
  "components/domain/brand",
  "components/domain/vertical/business-kind-picker.tsx",
  "components/domain/vertical/prompt-preview.tsx",
] as const;

readSourcesBeforeAll(PAGES, /\.tsx$/);

/** Every sentence a customer reads in the file: JSX text, and strings with a space in them (labels, titles, copy). */
function sentences(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    sourceText(file),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxText(node) ||
      ((ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
        /\s/.test(node.text.trim()) &&
        !node.text.includes("/api/"))
    ) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text.length > 0) out.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

describe("plain words on the wizard and brand pages", () => {
  it("no copy says vertical pack, prompt library, prompt pack, prompts, classifier, classification or Vertical", () => {
    const files = listFiles(PAGES).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(10);
    const found: string[] = [];
    for (const file of files)
      for (const s of sentences(file))
        if (JARGON.test(s)) found.push(`${file}: ${s.slice(0, 100)}`);
    expect(found).toEqual([]);
  });

  it("the wizard's region note says what the region is for", () => {
    const wizard = readFileSync(
      join(process.cwd(), "app/(auth)/brands/wizard/wizard-form.tsx"),
      "utf-8",
    );
    expect(wizard).toContain(
      "We use your region to choose the questions and directories we check.",
    );
    expect(wizard).not.toContain("Region determines vertical packs and prompt library.");
  });
});

describe("the delete brand dialog", () => {
  it("says what deletion does, without contradicting itself", () => {
    const page = readFileSync(
      join(process.cwd(), "components/domain/brand/brand-detail-client.tsx"),
      "utf-8",
    ).replace(/\s+/g, " ");
    expect(page).toContain(
      "The brand will be removed from your workspace, and its scheduled audits and report emails stop. You can&apos;t restore it afterwards. Its past audits stay in your audit history.",
    );
    expect(page).not.toMatch(/Audit history is preserved|This cannot be undone/);
  });
});

describe("a brand made before the confirm step, with audits", () => {
  it("is asked in its own terms: confirm so its questions stay accurate, its past audits as they are", () => {
    render(
      <ClassificationConfirmCard
        brandId="b1"
        suggestedCategory={null}
        suggestedAudience={null}
        suggestedCompetitors={[]}
        confidence={null}
        mode="could_not_classify"
        vertical="tradies"
        hasAudits
      />,
    );
    expect(
      screen.getByText(/Confirm what this business does so its questions stay accurate/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/its first audit starts/)).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  describe("on its page", () => {
    beforeAll(async () => {
      await import("@/components/domain/brand/brand-detail-client");
    }, 60_000);

    it("the confirmation doesn't hide its audit history", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({})),
      );
      const { BrandDetailClient } = await import("@/components/domain/brand/brand-detail-client");
      render(
        <BrandDetailClient
          brand={{
            id: "b1",
            name: "Yabby Services",
            domain: "omega.com.au",
            vertical: "tradies",
            region: "au",
            competitors: [],
            primaryRegions: ["NSW:Norwest"],
            classificationStatus: "needs_confirmation",
            locationConfirmedAt: "2026-10-18T11:20:59.000Z",
          }}
          classificationState="needs_confirmation"
          auditCount={3}
          recentAudits={[
            { scoreComposite: "24.0", completedAt: "2026-11-01T00:00:00.000Z" },
            { scoreComposite: "30.0", completedAt: "2026-11-08T00:00:00.000Z" },
          ]}
          latestAudit={null}
          avgPosition={null}
          totalMentions={0}
          engineStats={[]}
        />,
      );
      expect(await screen.findByText("Confirm your business details")).toBeInTheDocument();
      expect(screen.getByText(/so its questions stay accurate/)).toBeInTheDocument();
      expect(screen.getByText("Audit history")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/audits");
      expect(document.querySelectorAll("[data-spark-point]").length).toBe(2);
      vi.unstubAllGlobals();
    }, 30_000);
  });
});
