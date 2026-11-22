import { describe, expect, it } from "vitest";
import {
  buildHealthCheckCards,
  type HealthCheckData,
} from "@/components/domain/autopilot/health-check-panel";
import { shownHeadlineBand } from "@/lib/scoring/headline-color";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";

/**
 * §1.1 — the Health Check's bands, since 7 Nov (Sri's decision 2). The per-check table this file used
 * to pin (AI Presence green ≥60 / amber ≥30, Site Readiness ≥75 / ≥45, ...) is retired:
 *
 * | Check            | Bands                                                      |
 * |------------------|------------------------------------------------------------|
 * | AI presence      | the Visibility bands: ≥30 Strong, 10–29 Developing, <10 Low |
 * | Site readiness   | none documented: not coloured                              |
 * | Local authority  | none documented: not coloured                              |
 *
 * so the same Visibility rate gets the same band on the Health Check and the audit page.
 */

function withPresence(value: number): HealthCheckData {
  const display = visibilityDisplay({
    headline: { status: "scored", value, ci: { lower: 0, upper: 100 } },
    mentionedCount: 1,
    sampleCount: 10,
  });
  return {
    aiPresence: { ...display, ci: null },
    siteReadiness: { score: 90, max: 98, on: "1 Nov" },
    localAuthority: { score: 95, max: 100, on: "1 Nov" },
    topAction: null,
    brandName: "Band Test",
    auditDate: "1 Nov 2026",
    engineCount: 4,
    isSaas: false,
  };
}

const presenceBand = (value: number) => buildHealthCheckCards(withPresence(value))[0].band?.label;

describe("AI presence: the Visibility bands", () => {
  it("≥30 is Strong", () => {
    expect(presenceBand(30)).toBe("Strong");
    expect(presenceBand(100)).toBe("Strong");
  });

  // S01 part 0 (LLD section 0.1, D-BAND: "The score band colour follows the figure shown (the rounded value), so
  // '10%' is never coloured Low"): 29.9 shows "30%" and is Strong, 9.9 shows "10%" and is Developing. S00's
  // expectations here were the rate's own band (29.9 Developing, 9.9 Low); 29.4 and 9.4 keep them.
  it("10–29 is Developing (13% included)", () => {
    expect(presenceBand(10)).toBe("Developing");
    expect(presenceBand(13)).toBe("Developing");
    expect(presenceBand(29.4)).toBe("Developing");
    expect(presenceBand(29.9)).toBe("Strong");
  });

  it("<10 is Low", () => {
    expect(presenceBand(9.4)).toBe("Low");
    expect(presenceBand(9.9)).toBe("Developing");
    expect(presenceBand(0)).toBe("Low");
  });

  it("matches shownHeadlineBand (the band of the figure shown) at every boundary", () => {
    for (const value of [0, 9.99, 10, 29.99, 30, 59, 60, 100]) {
      const expected = { strong: "Strong", developing: "Developing", low: "Low" }[
        shownHeadlineBand(value)
      ];
      expect(presenceBand(value)).toBe(expected);
    }
  });
});

describe("site readiness and local authority: no documented bands, so no colour", () => {
  it("even a high score carries no band", () => {
    const [, site, local] = buildHealthCheckCards(withPresence(50));
    expect(site.band).toBeNull();
    expect(local.band).toBeNull();
  });
});
