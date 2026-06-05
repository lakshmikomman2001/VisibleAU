import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

const createBrandSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().min(1).max(253),
  vertical: z.enum(["tradies", "allied_health", "saas"]),
  competitors: z.array(z.string()).optional().default([]),
  primaryRegions: z
    .array(z.string().regex(/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/, "Format: STATE:Suburb"))
    .optional()
    .default([]),
});

describe("Brand create form validation (Zod schema)", () => {
  it("accepts valid brand with all required fields", () => {
    const result = createBrandSchema.safeParse({
      name: "Bondi Plumbing",
      domain: "bondiplumbing.com.au",
      vertical: "tradies",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createBrandSchema.safeParse({
      name: "",
      domain: "test.com",
      vertical: "tradies",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const result = createBrandSchema.safeParse({
      name: "a".repeat(101),
      domain: "test.com",
      vertical: "tradies",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty domain", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "",
      vertical: "tradies",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid vertical", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "test.com",
      vertical: "invalid_vertical",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all 3 valid verticals", () => {
    for (const vertical of ["tradies", "allied_health", "saas"]) {
      const result = createBrandSchema.safeParse({
        name: "Test",
        domain: "test.com",
        vertical,
      });
      expect(result.success).toBe(true);
    }
  });

  it("defaults competitors to empty array when not provided", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "test.com",
      vertical: "saas",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.competitors).toEqual([]);
    }
  });

  it("defaults primaryRegions to empty array when not provided", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "test.com",
      vertical: "saas",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primaryRegions).toEqual([]);
    }
  });

  it("accepts valid primaryRegions format STATE:Suburb", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "test.com",
      vertical: "tradies",
      primaryRegions: ["NSW:Bondi", "VIC:Fitzroy", "QLD:Brisbane CBD"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects primaryRegions with numbers in suburb name", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "test.com",
      vertical: "tradies",
      primaryRegions: ["NSW:2000"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects primaryRegions with lowercase state code", () => {
    const result = createBrandSchema.safeParse({
      name: "Test",
      domain: "test.com",
      vertical: "tradies",
      primaryRegions: ["nsw:Bondi"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields entirely", () => {
    const result = createBrandSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
