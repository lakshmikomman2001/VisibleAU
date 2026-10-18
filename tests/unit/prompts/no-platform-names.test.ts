import { describe, expect, it } from "vitest";
import { CATEGORY_KEYS, CATEGORY_TEMPLATES } from "@/lib/prompts/templates";

/**
 * Vunnara hotfix 2 (19 Oct, post-609e323), item 2 -- an ORGANIC
 * question ("Top-rated tradies in {region} reviewed on hipages?")
 * steers the AI toward a third-party directory and makes the question
 * about that platform, not the customer's need -- the opposite of
 * what this product is trying to measure (whether AI engines recommend
 * the BRAND, independent of any one listing site). Sweeps every
 * organic template in every category, not just the one trades_general
 * case that surfaced this.
 */
const KNOWN_PLATFORMS = [
  "hipages",
  "serviceseeking",
  "oneflare",
  "airtasker",
  "yellow pages",
  "trustpilot",
  "productreview",
  "yelp",
];

function allTemplates(category: string): string[] {
  return Object.values(CATEGORY_TEMPLATES[category] ?? {}).flat();
}

describe("CATEGORY_TEMPLATES -- no organic template names a third-party platform", () => {
  for (const category of CATEGORY_KEYS) {
    it(`${category}: no known platform name in any organic template`, () => {
      const templates = allTemplates(category);
      for (const template of templates) {
        for (const platform of KNOWN_PLATFORMS) {
          expect(template.toLowerCase()).not.toContain(platform);
        }
      }
    });
  }
});
