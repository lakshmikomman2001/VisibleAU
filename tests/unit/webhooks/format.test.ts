import { describe, expect, it } from "vitest";
import { formatForChannel } from "@/lib/webhooks/format";

const PAYLOAD = {
  brandName: "Test Co",
  scoreComposite: 72,
  url: "https://app.visibleau.com/audit/123",
  createdAt: "2026-01-01T00:00:00.000Z",
  severity: "significant_drop",
  delta: -8,
};

describe("formatForChannel", () => {
  it("slack: returns Block Kit with header and section", () => {
    const result = formatForChannel("slack", "audit.complete", PAYLOAD) as Record<string, unknown>;
    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("blocks");
    const blocks = result.blocks as Array<{ type: string }>;
    expect(blocks[0].type).toBe("header");
    expect(blocks[1].type).toBe("section");
  });

  it("slack: includes action button when URL present", () => {
    const result = formatForChannel("slack", "audit.complete", PAYLOAD) as Record<string, unknown>;
    const blocks = result.blocks as Array<{ type: string }>;
    expect(blocks.some((b) => b.type === "actions")).toBe(true);
  });

  it("discord: returns embed with color", () => {
    const result = formatForChannel("discord", "drift.detected", PAYLOAD) as { embeds: Array<{ color: number; title: string }> };
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0].color).toBe(0xef4444); // significant_drop → red
    expect(result.embeds[0].title).toContain("Test Co");
  });

  it("sheets: returns flat JSON with event field", () => {
    const result = formatForChannel("sheets", "audit.complete", PAYLOAD) as Record<string, unknown>;
    expect(result).toHaveProperty("event", "audit.complete");
    expect(result).toHaveProperty("brand", "Test Co");
    expect(result).toHaveProperty("score", 72);
  });

  it("airtable: returns {fields: {...}} format", () => {
    const result = formatForChannel("airtable", "audit.complete", PAYLOAD) as { fields: Record<string, unknown> };
    expect(result).toHaveProperty("fields");
    expect(result.fields.Event).toBe("audit.complete");
    expect(result.fields.Brand).toBe("Test Co");
    expect(result.fields.Score).toBe(72);
  });

  it("email: returns to/subject/html", () => {
    const result = formatForChannel("email", "audit.complete", PAYLOAD) as Record<string, unknown>;
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(String(result.subject)).toContain("audit.complete");
  });

  it("custom: returns envelope with event/timestamp/data", () => {
    const result = formatForChannel("custom", "audit.complete", PAYLOAD) as Record<string, unknown>;
    expect(result).toHaveProperty("event", "audit.complete");
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("data");
  });

  it("unknown channel: returns payload as-is", () => {
    const result = formatForChannel("unknown-channel", "event", PAYLOAD);
    expect(result).toEqual(PAYLOAD);
  });
});
