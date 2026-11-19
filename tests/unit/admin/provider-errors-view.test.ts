/**
 * 19 Nov (Sri's review of /admin/settings): 12 Nov's "40100 login rejected" was shown as if current, though every
 * Google run since succeeded. With no error newer than the last clean run the page says "No provider errors since
 * <the latest error> (last Google run: ...)", from the data; errors from before that run are folded away.
 */
import { describe, expect, it } from "vitest";
import {
  type CleanGoogleRun,
  cleanRunText,
  splitProviderErrors,
  sydneyShort,
} from "@/lib/audit/google-surfaces/provider-errors-view";

// 12 Nov 19:31 Sydney time (AEDT, UTC+11) is 08:31 UTC.
const LOGIN_REJECTED = { key: "a44|40100|login", at: "2026-11-12T08:31:00.000Z" };
const OLDER = { key: "a40|40100|login", at: "2026-11-12T03:03:00.000Z" };
const CLEAN: CleanGoogleRun = {
  startedAt: "2026-11-19T08:55:00.000Z",
  at: "2026-11-19T09:10:00.000Z",
  auditNumber: 61,
  brand: "Omega Services",
  questions: 26,
  checked: 26,
};

describe("Provider errors say when the last one was, from the data", () => {
  it("every error older than the last clean run: 'No provider errors since ...', and all of them folded", () => {
    const view = splitProviderErrors([LOGIN_REJECTED, OLDER], CLEAN);
    expect(sydneyShort(LOGIN_REJECTED.at)).toBe("12 Nov 19:31");
    expect(view.summary).toBe(
      "No provider errors since 12 Nov 19:31 Sydney time (last Google run: 26 of 26 questions checked at 19 Nov 20:10 Sydney time, audit #61, Omega Services)",
    );
    expect(view.recent).toEqual([]);
    expect(view.older).toEqual([LOGIN_REJECTED, OLDER]);
  });

  it("an error from the last clean run's start on is current: shown, and no 'none since' line", () => {
    const current = { key: "a62|408|timeout", at: "2026-11-19T09:00:00.000Z" };
    const view = splitProviderErrors([current, LOGIN_REJECTED], CLEAN);
    expect(view.summary).toBeNull();
    expect(view.recent).toEqual([current]);
    expect(view.older).toEqual([LOGIN_REJECTED]);
  });

  it("no clean run yet: every error is shown, nothing is folded, nothing claimed", () => {
    const view = splitProviderErrors([LOGIN_REJECTED], null);
    expect(view).toEqual({ summary: null, recent: [LOGIN_REJECTED], older: [] });
  });

  it("no errors at all: no 'since' line (the page says 'None recorded')", () => {
    expect(splitProviderErrors([], CLEAN)).toEqual({ summary: null, recent: [], older: [] });
  });

  it("the run's text leaves out what isn't known", () => {
    expect(cleanRunText({ ...CLEAN, auditNumber: null, brand: null })).toBe(
      "26 of 26 questions checked at 19 Nov 20:10 Sydney time",
    );
  });
});
