import { describe, expect, it } from "vitest";
import { RESIDENCY_CONFIG } from "@/lib/governance/residency-config";

// ---------------------------------------------------------------------------
// D3 — residency-config.ts is the single source of truth for what
// recordDataResidency writes. This test pins the values directly (no DB
// needed) so it goes RED the instant anyone reverts `database` to `supabase`
// or drops one of the LLM providers — the exact class of bug this fix
// addresses (F3: the writer claimed Supabase for data that actually lives in
// Neon Postgres).
// ---------------------------------------------------------------------------
describe("RESIDENCY_CONFIG — data residency log source of truth", () => {
  it("has exactly 13 entries", () => {
    expect(RESIDENCY_CONFIG).toHaveLength(13);
  });

  it("attributes the primary database to Neon, not Supabase", () => {
    const database = RESIDENCY_CONFIG.find((e) => e.dataType === "database");
    expect(database).toBeDefined();
    expect(database?.provider).toBe("neon");
  });

  it("only pdf_reports is attributed to Supabase", () => {
    const supabaseEntries = RESIDENCY_CONFIG.filter((e) => e.provider === "supabase");
    expect(supabaseEntries.map((e) => e.dataType)).toEqual(["pdf_reports"]);
  });

  it("has all four LLM processing rows, each mapped to its real provider in the US", () => {
    const llmEntries = RESIDENCY_CONFIG.filter((e) => e.dataType.startsWith("llm_processing_"));
    expect(llmEntries).toHaveLength(4);
    expect(llmEntries.map((e) => e.provider).sort()).toEqual([
      "anthropic",
      "google",
      "openai",
      "perplexity",
    ]);
    for (const entry of llmEntries) {
      expect(entry.storageRegion).toBe("US");
    }
  });

  it("every Neon-backed data type shares the same region as the database row", () => {
    const database = RESIDENCY_CONFIG.find((e) => e.dataType === "database");
    const neonEntries = RESIDENCY_CONFIG.filter((e) => e.provider === "neon");
    expect(neonEntries.length).toBeGreaterThan(1);
    for (const entry of neonEntries) {
      expect(entry.storageRegion).toBe(database?.storageRegion);
    }
  });

  it("has no duplicate data_type keys", () => {
    const dataTypes = RESIDENCY_CONFIG.map((e) => e.dataType);
    expect(new Set(dataTypes).size).toBe(dataTypes.length);
  });
});
