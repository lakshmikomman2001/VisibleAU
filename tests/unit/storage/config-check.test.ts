/**
 * URGENT PDF reports (1 Nov), part 0 -- the storage env vars are checked
 * before a PDF is built, and a setting that can't work stops the run at
 * once, without retries, naming the setting and never its value.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/governance/inngest-scope-guard", () => ({
  loadScopedOrAbort: vi.fn(async () => ({
    organizationId: "org-1",
    brandId: "brand-1",
    headline: "AI Visibility Report",
    narrativeText: "Narrative.",
    fanOutSummary: null,
    topicalSummary: null,
    mentionSourceSummary: null,
    linkedinSummary: null,
    consensusSummary: null,
    knowledgePanelSummary: null,
  })),
}));
const buildReportPdf = vi.hoisted(() => vi.fn());
vi.mock("@/lib/communication/pdf-builder", () => ({ buildReportPdf }));
const getStorage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ getStorage }));
// Part 2: the failure is recorded on the report (mark-pdf-failed) and, for a
// storage reason, alerted -- both stubbed here; the integration test runs them.
const recorded = vi.hoisted(() => ({ set: [] as unknown[] }));
vi.mock("@/db/client", () => ({
  serviceDb: {
    update: () => ({
      set: (values: unknown) => {
        recorded.set.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));
const sendReportPdfFailedAlert = vi.hoisted(() => vi.fn(async () => 2));
vi.mock("@/lib/communication/report-pdf-failed-alert", () => ({ sendReportPdfFailedAlert }));

import { renderReportPdf } from "@/inngest/functions/render-report-pdf";
import { checkStorageConfig } from "@/lib/storage/config-check";

const REF = "abcdefghijklmnopqrst";
const URL_OK = `https://${REF}.supabase.co`;

/** A made-up JWT-shaped string with these claims; never a real key. */
function fakeJwt(claims: Record<string, unknown>): string {
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJlLW5vdC1yZWFs`;
}
const KEY_OK = fakeJwt({ role: "service_role", ref: REF, exp: 2_000_000_000 });

function check(env: Record<string, string | undefined>) {
  return checkStorageConfig({ STORAGE_DRIVER: "supabase", ...env });
}

describe("checkStorageConfig: what's wrong, never the value", () => {
  it("a good URL and service-role key: no problems", () => {
    expect(check({ SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: KEY_OK })).toEqual({
      problems: [],
      warnings: [],
    });
    expect(
      check({ SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_AbCdEf0123456789" })
        .problems,
    ).toEqual([]);
  });

  const cases: Array<[string, Record<string, string | undefined>, string]> = [
    ["URL missing", { SUPABASE_URL: undefined }, "storage URL missing (SUPABASE_URL)"],
    ["URL empty", { SUPABASE_URL: "  " }, "storage URL missing (SUPABASE_URL)"],
    [
      "an API key saved as the URL",
      { SUPABASE_URL: "re_live_9f8e7d6c5b4a" },
      "storage URL is not an https://*.supabase.co URL (SUPABASE_URL)",
    ],
    [
      "http, not https",
      { SUPABASE_URL: `http://${REF}.supabase.co` },
      "storage URL is not an https://*.supabase.co URL (SUPABASE_URL)",
    ],
    [
      "the database host, not the project URL",
      { SUPABASE_URL: "https://aws-0-ap-southeast-1.pooler.supabase.com" },
      "storage URL is not an https://*.supabase.co URL (SUPABASE_URL)",
    ],
    [
      "a path",
      { SUPABASE_URL: `${URL_OK}/rest/v1` },
      "storage URL has a path; it must be just https://<project-ref>.supabase.co (SUPABASE_URL)",
    ],
    [
      "a query",
      { SUPABASE_URL: `${URL_OK}/?apikey=x` },
      "storage URL has a query, port or credentials in it (SUPABASE_URL)",
    ],
    [
      "key missing",
      { SUPABASE_SERVICE_ROLE_KEY: undefined },
      "storage key missing (SUPABASE_SERVICE_ROLE_KEY)",
    ],
    [
      "a key of the wrong shape (another provider's)",
      { SUPABASE_SERVICE_ROLE_KEY: "re_live_9f8e7d6c5b4a" },
      "storage key doesn't look like a Supabase key (wrong shape) (SUPABASE_SERVICE_ROLE_KEY)",
    ],
    [
      "the publishable key",
      { SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_AbCdEf0123456789" },
      "storage key is a publishable key, not the secret (service role) key (SUPABASE_SERVICE_ROLE_KEY)",
    ],
    [
      "the anon key",
      { SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "anon", ref: REF }) },
      "storage key isn't a service-role key (SUPABASE_SERVICE_ROLE_KEY)",
    ],
    [
      "another project's key",
      { SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role", ref: "zyxwvutsrqponmlkjihg" }) },
      "storage key belongs to a different Supabase project than the storage URL (SUPABASE_SERVICE_ROLE_KEY)",
    ],
    [
      "an expired key",
      {
        SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role", ref: REF, exp: 1_000_000_000 }),
      },
      "storage key has expired (SUPABASE_SERVICE_ROLE_KEY)",
    ],
  ];
  for (const [name, env, reason] of cases) {
    it(`${name}: "${reason}", with no value in it`, () => {
      const full = { SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: KEY_OK, ...env };
      const { problems } = check(full);
      expect(problems).toContain(reason);
      for (const value of Object.values(full)) {
        if (value && value.trim().length > 3)
          expect(problems.join(" ")).not.toContain(value.trim());
      }
    });
  }

  it("whitespace or a trailing slash: a warning, not a problem (supabase-js trims and adds the slash)", () => {
    const r = check({ SUPABASE_URL: ` ${URL_OK}/\n`, SUPABASE_SERVICE_ROLE_KEY: `${KEY_OK} ` });
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([
      "storage URL has whitespace around it (SUPABASE_URL)",
      "storage URL has a trailing slash (SUPABASE_URL)",
      "storage key has whitespace around it (SUPABASE_SERVICE_ROLE_KEY)",
    ]);
  });

  it("the local driver: fine in dev and tests, a problem on Vercel; an unknown driver is a problem", () => {
    expect(checkStorageConfig({ STORAGE_DRIVER: "local" }).problems).toEqual([]);
    expect(checkStorageConfig({ STORAGE_DRIVER: "local", VERCEL: "1" }).problems).toEqual([
      "STORAGE_DRIVER is local, but files written on Vercel aren't kept",
    ]);
    expect(checkStorageConfig({ STORAGE_DRIVER: "s3" }).problems).toEqual([
      'STORAGE_DRIVER is neither "local" nor "supabase"',
    ]);
  });
});

describe("render-report-pdf stops at once on a bad storage setting", () => {
  type Handler = (ctx: {
    event: { data: { reportId: string; organizationId: string; brandId: string } };
    step: { run: (name: string, fn: () => unknown) => unknown };
  }) => Promise<unknown>;

  it("fails without retrying (NonRetriableError), names the setting, and never builds or uploads the PDF", async () => {
    vi.stubEnv("STORAGE_DRIVER", "supabase");
    vi.stubEnv("SUPABASE_URL", "re_live_9f8e7d6c5b4a");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", KEY_OK);
    const err = await (renderReportPdf as unknown as { fn: Handler })
      .fn({
        event: { data: { reportId: "report-1", organizationId: "org-1", brandId: "brand-1" } },
        step: { run: (_name, fn) => fn() },
      })
      .then(() => null)
      .catch((e: Error) => e);
    vi.unstubAllEnvs();

    expect(err?.name).toBe("NonRetriableError");
    expect(err?.message).toContain(
      "Storage is misconfigured: storage URL is not an https://*.supabase.co URL (SUPABASE_URL)",
    );
    expect(err?.message).not.toContain("re_live_9f8e7d6c5b4a");
    expect(err?.message).not.toContain(KEY_OK);
    expect(buildReportPdf).not.toHaveBeenCalled();
    expect(getStorage).not.toHaveBeenCalled();
    // Part 2: recorded on the report, and alerted, as a storage setting problem.
    expect(err?.message).toMatch(
      /^PDF not created \(storage_misconfigured\): Storage is misconfigured: /,
    );
    expect(recorded.set).toEqual([
      expect.objectContaining({ pdfFailureReason: "storage_misconfigured" }),
    ]);
    expect(sendReportPdfFailedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "report-1", reason: "storage_misconfigured" }),
    );
  });
});
