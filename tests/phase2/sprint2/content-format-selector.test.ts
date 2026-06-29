import { describe, it, expect } from "vitest";
import { selectContentFormat } from "@/lib/workflow/content-format-selector";

describe("content-format-selector — detected → draft format mapping", () => {
  it("passes through listicle directly", () => {
    const { format } = selectContentFormat("listicle", null);
    expect(format).toBe("listicle");
  });

  it("passes through how_to_guide directly", () => {
    const { format } = selectContentFormat("how_to_guide", null);
    expect(format).toBe("how_to_guide");
  });

  it("passes through faq_block directly", () => {
    const { format } = selectContentFormat("faq_block", null);
    expect(format).toBe("faq_block");
  });

  it("passes through comparison_article directly", () => {
    const { format } = selectContentFormat("comparison_article", null);
    expect(format).toBe("comparison_article");
  });

  it("passes through expert_article directly", () => {
    const { format } = selectContentFormat("expert_article", null);
    expect(format).toBe("expert_article");
  });

  it("passes through case_study directly", () => {
    const { format } = selectContentFormat("case_study", null);
    expect(format).toBe("case_study");
  });

  it("maps product_page → comparison_article", () => {
    const { format } = selectContentFormat("product_page", null);
    expect(format).toBe("comparison_article");
  });

  it("falls back to expert_article for unknown formats", () => {
    const { format } = selectContentFormat("unknown_format", null);
    expect(format).toBe("expert_article");
  });

  it("falls back to expert_article when no format detected", () => {
    const { format } = selectContentFormat(null, null);
    expect(format).toBe("expert_article");
  });

  it("press-release recommendation_key overrides detected format", () => {
    const { format } = selectContentFormat("listicle", "press-release");
    expect(format).toBe("press_release");
  });

  it("linkedin-presence recommendation_key overrides detected format", () => {
    const { format } = selectContentFormat("faq_block", "linkedin-presence");
    expect(format).toBe("linkedin_article");
  });

  it("provides a reason for the format selection", () => {
    const { reason } = selectContentFormat("listicle", null);
    expect(reason).toBeTruthy();
    expect(typeof reason).toBe("string");
  });

  it("linkedin-post recommendation_key overrides to linkedin_article", () => {
    const { format } = selectContentFormat("listicle", "linkedin-post");
    expect(format).toBe("linkedin_article");
  });

  it("KEY_FORMAT_OVERRIDES take priority over FORMAT_MAP", () => {
    const { format, reason } = selectContentFormat("expert_article", "press-release");
    expect(format).toBe("press_release");
    expect(reason).toContain("recommendation type");
  });

  it("detected format reason mentions detected format name", () => {
    const { reason } = selectContentFormat("case_study", null);
    expect(reason).toContain("case_study");
  });

  it("default fallback reason mentions default", () => {
    const { reason } = selectContentFormat(null, null);
    expect(reason).toContain("Default");
  });

  it("override reason mentions recommendation key", () => {
    const { reason } = selectContentFormat(null, "linkedin-presence");
    expect(reason).toContain("linkedin-presence");
  });

  it("non-override recommendation_key falls through to FORMAT_MAP", () => {
    const { format } = selectContentFormat("case_study", "some-random-key");
    expect(format).toBe("case_study");
  });

  it("null format + non-override key falls back to expert_article", () => {
    const { format } = selectContentFormat(null, "some-random-key");
    expect(format).toBe("expert_article");
  });
});
