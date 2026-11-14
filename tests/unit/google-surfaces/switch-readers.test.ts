/**
 * Google AI surfaces, Phase 1, part 1 -- one reader for each switch. lib/governance/google-surfaces.ts is
 * the only code that reads the env kill switch, the global settings tables, the brand postcodes or the two
 * workspace flag keys; lib/serp/credentials.ts is the only reader of the provider's credentials. Any other
 * reader could decide differently from resolveGoogleSurfaces (an audit running Google with the kill switch
 * off), so this scan fails on one.
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const SCANNED = [
  "app",
  "components",
  "inngest",
  "lib",
  "scripts",
  "middleware.ts",
  "instrumentation.ts",
];
const RESOLVER = "lib/governance/google-surfaces.ts";
const CREDENTIALS = "lib/serp/credentials.ts";
/** 14 Nov, part 5: /admin/audits' trend exclusions, logged in the operator's change history. */
const TREND_EXCLUSIONS = "lib/admin/trend-exclusions.ts";

readSourcesBeforeAll(SCANNED);

function files(): string[] {
  return sourcePaths(SCANNED, /\.(ts|tsx|js|mjs|cjs)$/);
}

/** Code without comments: an explanation that names a switch isn't a read of it. */
function code(path: string): string {
  return sourceText(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function readersOf(pattern: RegExp): string[] {
  return files().filter((path) => pattern.test(code(path)));
}

describe("each Google switch has one reader", () => {
  it("the env kill switch: read only by the resolver", () => {
    expect(readersOf(/process\.env(\.GOOGLE_AI_SURFACES|\[\s*["'`]GOOGLE_AI_SURFACES)/)).toEqual(
      [],
    );
    expect(readersOf(/process\.env\[\s*GOOGLE_SURFACES_ENV\s*\]/)).toEqual([
      "lib/governance/google-surfaces-env.ts",
    ]);
  });

  it("the provider's credentials: read only by lib/serp/credentials.ts", () => {
    expect(readersOf(/process\.env(\.DATAFORSEO_|\[\s*["'`]DATAFORSEO_)/)).toEqual([CREDENTIALS]);
  });

  it("the global settings, their history and brand postcodes: only the resolver's module", () => {
    expect(readersOf(/\b(featureSettings|brandGoogleLocations)\b/)).toEqual([RESOLVER]);
    // 14 Nov, part 5: the change history is the operator's log, not a switch -- /admin/audits writes and lists
    // its own rows there (an audit excluded from trends), and only those.
    expect(readersOf(/\bfeatureSettingChanges\b/).sort()).toEqual(
      [RESOLVER, TREND_EXCLUSIONS].sort(),
    );
    expect(code(TREND_EXCLUSIONS)).toContain(
      "eq(featureSettingChanges.settingKey, TREND_EXCLUSION_SETTING_KEY)",
    );
    // By table name: only the RLS check's list of global tables (it names them, it doesn't read them).
    expect(
      readersOf(/\b(feature_settings|feature_setting_changes|brand_google_locations)\b/),
    ).toEqual(["scripts/qa/schema-drift.ts"]);
  });

  it("the workspace override keys: only the resolver (and the existing canonical flag list)", () => {
    expect(readersOf(/["'`]google_ai_overviews_enabled["'`]/)).toEqual([RESOLVER]);
    expect(readersOf(/["'`]google_ai_mode_enabled["'`]/).sort()).toEqual(
      [RESOLVER, "lib/governance/feature-flags.ts"].sort(),
    );
  });

  it("the scan reads the code that ships", () => {
    expect(files().length).toBeGreaterThan(500);
    expect(files()).toContain(RESOLVER);
    expect(files()).toContain(CREDENTIALS);
  });
});
