/**
 * S04 part 0d (LLD amendment 95; contract v1.9 P05): Workspace -> Questions.
 * - The page sits in the Account pages' wrapper (side padding 32, centred, max width 1200 as Team's), for owners and
 *   admins and for the no-permission line alike -- live at about 1920 wide its title and cards started at the
 *   sidebar's edge and ran off the right edge.
 * - "Last change": "Original questions · {date}" for 0155's version 1 (it printed "backfill"), "Confirmed · {date} ·
 *   {userName}" for a version the confirm screen saved, "{date} · {userName}" for one applied in P04.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const can = vi.hoisted(() => ({ manage: true }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "u-1", organizationId: "o-1", role: "owner" })),
}));
vi.mock("@/lib/flags/flags", () => ({ isEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/governance/access-control", () => ({ userCan: vi.fn(async () => can.manage) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import QuestionSettingsPage from "@/app/(auth)/settings/questions/page";
import { lastChangeText } from "@/components/domain/questions/question-settings";

describe("the page wrapper", () => {
  it.each([
    ["an owner", true],
    ["someone who can't open it", false],
  ])("%s: padding 32, centred, max width 1200", async (_who, manage) => {
    can.manage = manage;
    const html = renderToStaticMarkup(await QuestionSettingsPage());
    expect(html).toMatch(
      /<div class="flex-1 overflow-y-auto" data-testid="p05-page" style="background:var\(--bg-base\)"><div style="max-width:1200px;margin:0 auto;padding:32px">/,
    );
    if (!manage) expect(html).toContain("Only owners and admins can open question settings.");
  });
});

describe("Last change", () => {
  const at = "2026-11-27T03:00:00.000Z";
  it("0155's version 1: Original questions · {date}", () => {
    expect(lastChangeText({ at, by: null, backfill: true })).toBe(
      "Original questions · 27 Nov 2026",
    );
  });
  it("saved by the confirm screen: Confirmed · {date} · {userName}", () => {
    expect(lastChangeText({ at, by: "Pat Owner", backfill: false, confirmed: true })).toBe(
      "Confirmed · 27 Nov 2026 · Pat Owner",
    );
  });
  it("applied in P04: {date} · {userName}", () => {
    expect(lastChangeText({ at, by: "Pat Owner", backfill: false, confirmed: false })).toBe(
      "27 Nov 2026 · Pat Owner",
    );
    expect(lastChangeText({ at, by: "Pat Owner", backfill: false })).toBe(
      "27 Nov 2026 · Pat Owner",
    );
  });
});
