/**
 * Trust Intelligence honesty pass -- Consensus Score fabricated a 100%/
 * "top tier" result for every brand from a hardcoded stub (every field
 * "matches" -> consistencyScore always 100), and LinkedIn/YouTube presence
 * always scored a stubbed 0. Per Sri's rule ("no tile may assert a result
 * it did not measure"), all three checks must be gated behind
 * TRUST_CHECK_IMPLEMENTED until their real implementations land -- the GET
 * routes, refresh routes, and cron jobs must all refuse to read/write/
 * present a result while the flag is false.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";

describe("TRUST_CHECK_IMPLEMENTED -- all three stubs are flagged not-implemented", () => {
  it("linkedinPresence, youtubePresence, consensusScore are all false", () => {
    expect(TRUST_CHECK_IMPLEMENTED.linkedinPresence).toBe(false);
    expect(TRUST_CHECK_IMPLEMENTED.youtubePresence).toBe(false);
    expect(TRUST_CHECK_IMPLEMENTED.consensusScore).toBe(false);
  });
});

interface GatedFile {
  file: string;
  flagKey: keyof typeof TRUST_CHECK_IMPLEMENTED;
  guardedMarker: string;
}

const GET_ROUTES: GatedFile[] = [
  {
    file: "app/api/brands/[brandId]/linkedin-presence/route.ts",
    flagKey: "linkedinPresence",
    guardedMarker: "return withRlsContext",
  },
  {
    file: "app/api/brands/[brandId]/youtube-presence/route.ts",
    flagKey: "youtubePresence",
    guardedMarker: "return withRlsContext",
  },
  {
    file: "app/api/brands/[brandId]/consensus-score/route.ts",
    flagKey: "consensusScore",
    guardedMarker: "return withRlsContext",
  },
];

describe("GET routes refuse to read/present a stub result while not implemented", () => {
  for (const { file, flagKey, guardedMarker } of GET_ROUTES) {
    it(`${file} checks TRUST_CHECK_IMPLEMENTED.${flagKey} before ${guardedMarker}`, () => {
      const src = readFileSync(file, "utf8");
      const gateIndex = src.indexOf(`TRUST_CHECK_IMPLEMENTED.${flagKey}`);
      const guardedIndex = src.indexOf(guardedMarker);
      expect(gateIndex, `${file} must reference the flag`).toBeGreaterThan(-1);
      expect(guardedIndex, `${file} must still contain its real logic (dead code until flipped)`).toBeGreaterThan(-1);
      expect(gateIndex, `the gate must run BEFORE ${guardedMarker}`).toBeLessThan(guardedIndex);
    });

    it(`${file} returns an "implemented: false" response from the gate`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/if \(!TRUST_CHECK_IMPLEMENTED\.\w+\)\s*\{\s*return NextResponse\.json\(NOT_YET_IMPLEMENTED_RESPONSE\)/);
    });
  }
});

const REFRESH_ROUTES: GatedFile[] = [
  {
    file: "app/api/brands/[brandId]/linkedin-presence/refresh/route.ts",
    flagKey: "linkedinPresence",
    guardedMarker: "return withRlsContext",
  },
  {
    file: "app/api/brands/[brandId]/youtube-presence/refresh/route.ts",
    flagKey: "youtubePresence",
    guardedMarker: "return withRlsContext",
  },
  {
    file: "app/api/brands/[brandId]/consensus-score/refresh/route.ts",
    flagKey: "consensusScore",
    guardedMarker: "return withRlsContext",
  },
];

describe("refresh (POST) routes refuse to write a fabricated row while not implemented", () => {
  for (const { file, flagKey, guardedMarker } of REFRESH_ROUTES) {
    it(`${file} checks TRUST_CHECK_IMPLEMENTED.${flagKey} before ${guardedMarker} (the write path)`, () => {
      const src = readFileSync(file, "utf8");
      const gateIndex = src.indexOf(`TRUST_CHECK_IMPLEMENTED.${flagKey}`);
      const guardedIndex = src.indexOf(guardedMarker);
      expect(gateIndex).toBeGreaterThan(-1);
      expect(guardedIndex).toBeGreaterThan(-1);
      expect(gateIndex).toBeLessThan(guardedIndex);
    });

    it(`${file} returns a 501 when not implemented`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/NOT_YET_IMPLEMENTED_RESPONSE,\s*\{\s*status:\s*501\s*\}/);
    });
  }
});

const CRON_FILES: GatedFile[] = [
  {
    file: "inngest/functions/audit-linkedin-presence.ts",
    flagKey: "linkedinPresence",
    guardedMarker: "load-brands",
  },
  {
    file: "inngest/functions/audit-youtube-presence.ts",
    flagKey: "youtubePresence",
    guardedMarker: "load-brands",
  },
  {
    file: "inngest/functions/check-cross-platform-consensus.ts",
    flagKey: "consensusScore",
    guardedMarker: "load-brands",
  },
];

describe("cron jobs skip entirely (no DB write) while not implemented", () => {
  for (const { file, flagKey, guardedMarker } of CRON_FILES) {
    it(`${file} checks TRUST_CHECK_IMPLEMENTED.${flagKey} before ${guardedMarker}`, () => {
      const src = readFileSync(file, "utf8");
      const gateIndex = src.indexOf(`TRUST_CHECK_IMPLEMENTED.${flagKey}`);
      const guardedIndex = src.indexOf(guardedMarker);
      expect(gateIndex).toBeGreaterThan(-1);
      expect(guardedIndex).toBeGreaterThan(-1);
      expect(gateIndex).toBeLessThan(guardedIndex);
    });

    it(`${file} returns early with a "skipped" result`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("skipped:");
    });
  }
});

describe("Consensus Score specifically: 100/\"top tier\" can never render while not implemented", () => {
  it("the GET route's gate runs before ExplainabilityService.annotate() is ever called -- the fabricated avgScore=100 path is unreachable", () => {
    const src = readFileSync("app/api/brands/[brandId]/consensus-score/route.ts", "utf8");
    const gateIndex = src.indexOf("TRUST_CHECK_IMPLEMENTED.consensusScore");
    const annotateIndex = src.indexOf("const annotation = ExplainabilityService.annotate");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(annotateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(annotateIndex);
  });

  it("the consensus page renders NotYetMeasuredCard, not the scorecard, when implemented is false", () => {
    const src = readFileSync("app/(auth)/brands/[brandId]/trust/consensus/page.tsx", "utf8");
    expect(src).toContain('data.implemented === false');
    expect(src).toContain("NotYetMeasuredCard");
  });
});
