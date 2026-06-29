import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { selectModel } from "@/lib/llm/model-selector";
import {
  deriveConfidenceLabel,
  computePriorityScore,
} from "@/lib/workflow/priority-scorer";
import { mapRecommendationKeyToDraftType } from "@/lib/workflow/content-generator";
import { selectContentFormat } from "@/lib/workflow/content-format-selector";

describe("cross-sprint: selectModel routes content_draft to DERIVED_TASK_MODELS", () => {
  const tiers = [
    "free",
    "starter",
    "growth",
    "agency",
    "agency_pro",
    "enterprise",
  ] as const;
  const engines = ["chatgpt", "claude", "gemini", "perplexity"] as const;

  for (const tier of tiers) {
    it(`${tier} tier routes content_draft to DERIVED_TASK_MODELS (not PRIMARY_MODELS)`, () => {
      const contentModel = selectModel(tier, "claude", "content_draft");
      const brandMentionModel = selectModel(tier, "claude", "brand_mention");

      expect(contentModel).toBe("claude-haiku-4-5");

      if (tier === "growth" || tier === "agency" || tier === "agency_pro" || tier === "enterprise") {
        expect(brandMentionModel).toBe("claude-sonnet-4-6");
        expect(contentModel).not.toBe(brandMentionModel);
      }
    });
  }

  for (const engine of engines) {
    it(`content_draft on ${engine} always uses derived model regardless of tier`, () => {
      const freeModel = selectModel("free", engine, "content_draft");
      const enterpriseModel = selectModel("enterprise", engine, "content_draft");
      expect(freeModel).toBe(enterpriseModel);
    });
  }
});

describe("cross-sprint: ModelTask type includes content_draft", () => {
  const interfaceSource = fs.readFileSync(
    path.resolve("lib/llm/interface.ts"),
    "utf-8",
  );

  it("ModelTask union includes content_draft", () => {
    expect(interfaceSource).toContain('"content_draft"');
  });

  it("ModelTask union includes all 4 tasks", () => {
    expect(interfaceSource).toContain('"brand_mention"');
    expect(interfaceSource).toContain('"sentiment"');
    expect(interfaceSource).toContain('"context"');
    expect(interfaceSource).toContain('"content_draft"');
  });
});

describe("cross-sprint: Sprint 2 quality_status values align with Sprint 1 conventions", () => {
  it("deriveConfidenceLabel handles all 4 quality_status values from Sprint 1", () => {
    const statuses = ["sufficient", "partial", "insufficient", "pending"];
    const expected = ["High", "Medium", "Low", null];
    statuses.forEach((s, i) => {
      expect(deriveConfidenceLabel(s)).toBe(expected[i]);
    });
  });

  it("computePriorityScore handles all Sprint 1 quality_status values without error", () => {
    const statuses = ["sufficient", "partial", "insufficient", "pending", null];
    for (const s of statuses) {
      expect(() => computePriorityScore(50, s, "medium")).not.toThrow();
    }
  });
});

describe("cross-sprint: content-generator → content-format-selector integration", () => {
  it("mapRecommendationKeyToDraftType and selectContentFormat agree on press-release", () => {
    const draftType = mapRecommendationKeyToDraftType("press-release");
    const { format } = selectContentFormat(null, "press-release");
    expect(draftType).toBe("press_release");
    expect(format).toBe("press_release");
  });

  it("linkedin-presence: draft_type is linkedin_post, format is linkedin_article", () => {
    const draftType = mapRecommendationKeyToDraftType("linkedin-presence");
    const { format } = selectContentFormat(null, "linkedin-presence");
    expect(draftType).toBe("linkedin_post");
    expect(format).toBe("linkedin_article");
  });
});

describe("cross-sprint: content-generator source uses Sprint 1 imports", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/content-generator.ts"),
    "utf-8",
  );

  it("imports selectModel from @/lib/llm/model-selector", () => {
    expect(source).toContain('import { selectModel } from "@/lib/llm/model-selector"');
  });

  it("imports getLLMService from @/lib/llm", () => {
    expect(source).toContain('import { getLLMService } from "@/lib/llm"');
  });

  it("imports Engine and ModelTask types from Sprint 1 interface", () => {
    expect(source).toContain('import type { Engine, ModelTask } from "@/lib/llm/interface"');
  });

  it("imports Tier from Sprint 1 schema enums", () => {
    expect(source).toContain('import type { Tier } from "@/db/schema/enums"');
  });
});

describe("cross-sprint: Inngest function registration", () => {
  const serveSource = fs.readFileSync(
    path.resolve("app/api/webhooks/inngest/route.ts"),
    "utf-8",
  );

  it("serve() includes Sprint 2 generate-content-draft function", () => {
    expect(serveSource).toContain("generateContentDraft");
  });

  it("serve() includes Sprint 2 trigger-validation-reaudit function", () => {
    expect(serveSource).toContain("triggerValidationReaudit");
  });

  it("serve() includes Sprint 2 schedule-workflow-runs function", () => {
    expect(serveSource).toContain("scheduleWorkflowRuns");
  });

  it("serve() still includes Sprint 1 functions (backward compat)", () => {
    expect(serveSource).toContain("runAudit");
  });
});
