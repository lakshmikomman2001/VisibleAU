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
    const result = formatForChannel("discord", "drift.detected", PAYLOAD) as {
      embeds: Array<{ color: number; title: string }>;
    };
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
    const result = formatForChannel("airtable", "audit.complete", PAYLOAD) as {
      fields: Record<string, unknown>;
    };
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

  // Vunnara (19 Oct): the score is now the mention rate, not the old
  // weighted blend -- every channel shape must carry score_basis next to
  // its (unchanged) score field so external consumers can tell.
  describe("score_basis (mention rate, not the old blend)", () => {
    it("slack: top-level score_basis + visible Score basis field", () => {
      const result = formatForChannel("slack", "audit.completed", PAYLOAD) as {
        score_basis: string;
        blocks: Array<{ type: string; fields?: Array<{ text: string }> }>;
      };
      expect(result.score_basis).toBe("mention_rate");
      const texts = result.blocks[1].fields?.map((f) => f.text) ?? [];
      expect(texts).toContain("*Score:* 72");
      expect(texts).toContain("*Score basis:* mention_rate");
    });

    it("discord: score_basis embed field next to Score", () => {
      const result = formatForChannel("discord", "audit.completed", PAYLOAD) as {
        embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
      };
      const fields = result.embeds[0].fields;
      expect(fields.find((f) => f.name === "Score")?.value).toBe("72");
      expect(fields.find((f) => f.name === "score_basis")?.value).toBe("mention_rate");
    });

    it("sheets: score_basis column next to score", () => {
      const result = formatForChannel("sheets", "audit.completed", PAYLOAD) as Record<string, unknown>;
      expect(result).toHaveProperty("score", 72);
      expect(result).toHaveProperty("score_basis", "mention_rate");
    });

    it("airtable: score_basis field next to Score", () => {
      const result = formatForChannel("airtable", "audit.completed", PAYLOAD) as {
        fields: Record<string, unknown>;
      };
      expect(result.fields.Score).toBe(72);
      expect(result.fields.score_basis).toBe("mention_rate");
    });

    it("airtable: null score (not enough data) -> empty cell, never a fabricated 0", () => {
      const result = formatForChannel("airtable", "audit.completed", {
        ...PAYLOAD,
        scoreComposite: null,
      }) as { fields: Record<string, unknown> };
      expect(result.fields.Score).toBeNull();
    });

    it("email: score_basis + mention-rate wording", () => {
      const result = formatForChannel("email", "audit.completed", PAYLOAD) as Record<string, unknown>;
      expect(result).toHaveProperty("score_basis", "mention_rate");
      expect(String(result.html)).toContain("mentioned in 72.0% of AI answers");
    });

    it("email: null score -> 'not enough data yet', not 'null'", () => {
      const result = formatForChannel("email", "audit.completed", {
        ...PAYLOAD,
        scoreComposite: null,
      }) as Record<string, unknown>;
      expect(String(result.html)).toContain("not enough data yet");
      expect(String(result.html)).not.toContain("null");
    });

    it("custom: score_basis added inside data next to scoreComposite", () => {
      const result = formatForChannel("custom", "audit.completed", PAYLOAD) as {
        data: Record<string, unknown>;
      };
      expect(result.data.scoreComposite).toBe(72);
      expect(result.data.score_basis).toBe("mention_rate");
    });

    it("custom: score-less payload is not given a score_basis", () => {
      const result = formatForChannel("custom", "recommendation.created", {
        brandName: "Test Co",
        recommendationCount: 3,
      }) as { data: Record<string, unknown> };
      expect(result.data).not.toHaveProperty("score_basis");
    });
  });

  it("unknown channel: returns payload as-is", () => {
    const result = formatForChannel("unknown-channel", "event", PAYLOAD);
    expect(result).toEqual(PAYLOAD);
  });
});
