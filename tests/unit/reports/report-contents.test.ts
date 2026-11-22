/**
 * S01 part 5 (LLD 8.1.3, D1; contract P08): the report contents panel's rules and the "What to do next" groups.
 * - Requests: notes <= 400, titles 5-120, details <= 600, priorities and statuses from the LLD's lists, each action
 *   once, no unknown field; text is kept as typed (an XSS payload is just text: React and react-pdf print it).
 * - Groups: Agency and up get their saved order, hidden items and notes; below Agency every measured action in
 *   priority order, no notes, no agency actions, both toggles on.
 */
import { describe, expect, it } from "vitest";
import {
  agencyActionCreateSchema,
  agencyActionUpdateSchema,
  assembleWhatToDoNext,
  firstIssue,
  type MeasuredActionSource,
  reportPreferencesSchema,
} from "@/lib/reports/report-contents";

const ITEM_A = "11111111-1111-4111-8111-111111111111";
const ITEM_B = "22222222-2222-4222-8222-222222222222";
const XSS = '<script>alert("x")</script> **bold** [link](javascript:alert(1))';

describe("request rules", () => {
  it("preferences: toggles, tier and choices; a note is trimmed, empty is none, over 400 is refused", () => {
    const ok = reportPreferencesSchema.parse({
      includeGeneralAdvice: false,
      defaultTier: "standard",
      choices: [{ actionItemId: ITEM_A, included: true, position: 0, note: "  Done in October  " }],
    });
    expect(ok.choices?.[0].note).toBe("Done in October");
    expect(
      reportPreferencesSchema.parse({
        choices: [{ actionItemId: ITEM_A, included: false, position: null, note: "   " }],
      }).choices?.[0].note,
    ).toBeNull();
    const long = reportPreferencesSchema.safeParse({
      choices: [{ actionItemId: ITEM_A, included: true, position: 0, note: "x".repeat(401) }],
    });
    expect(long.success).toBe(false);
    if (!long.success)
      expect(firstIssue(long.error)).toBe("choices.0.note: A note is 400 characters or fewer.");
  });

  it("preferences: each action once, a real tier, no unknown field", () => {
    const twice = { actionItemId: ITEM_A, included: true, position: 0, note: null };
    expect(reportPreferencesSchema.safeParse({ choices: [twice, twice] }).success).toBe(false);
    expect(reportPreferencesSchema.safeParse({ defaultTier: "platinum" }).success).toBe(false);
    expect(reportPreferencesSchema.safeParse({ beyondAi: true }).success).toBe(false);
  });

  it("agency actions: title 5-120 trimmed, detail <= 600, the LLD's priorities and statuses", () => {
    expect(
      agencyActionCreateSchema.parse({
        title: "  Ask five clients for reviews ",
        priority: "high",
      }),
    ).toEqual({
      title: "Ask five clients for reviews",
      priority: "high",
    });
    expect(agencyActionCreateSchema.safeParse({ title: "Shrt", priority: "low" }).success).toBe(
      false,
    );
    expect(
      agencyActionCreateSchema.safeParse({ title: "x".repeat(121), priority: "low" }).success,
    ).toBe(false);
    expect(
      agencyActionCreateSchema.safeParse({
        title: "A fine title",
        detail: "x".repeat(601),
        priority: "low",
      }).success,
    ).toBe(false);
    expect(
      agencyActionCreateSchema.safeParse({ title: "A fine title", priority: "urgent" }).success,
    ).toBe(false);
    expect(agencyActionUpdateSchema.safeParse({ id: ITEM_A }).success).toBe(false);
    expect(agencyActionUpdateSchema.safeParse({ id: ITEM_A, status: "done" }).success).toBe(true);
  });

  it("an XSS payload is kept as typed: it's text, never markup", () => {
    expect(
      agencyActionCreateSchema.parse({ title: XSS.slice(0, 120), priority: "low" }).title,
    ).toBe(XSS.slice(0, 120).trim());
    expect(
      reportPreferencesSchema.parse({
        choices: [{ actionItemId: ITEM_A, included: true, position: 0, note: XSS }],
      }).choices?.[0].note,
    ).toBe(XSS);
  });
});

const measured: MeasuredActionSource[] = [
  {
    key: ITEM_A,
    actionItemId: ITEM_A,
    title: "Link your Yellow Pages profile",
    evidence: "Yellow Pages cited in 17 of 40 answers · audit #54",
    priority: "high",
    status: "open",
  },
  {
    key: "finding:b",
    actionItemId: null,
    title: "Gemini didn't name you in any of 10 answers",
    evidence: "ChatGPT named you in 4 of 10 answers · audit #54",
    priority: "high",
    status: "open",
  },
  {
    key: ITEM_B,
    actionItemId: ITEM_B,
    title: "Get mentioned in relevant Reddit threads",
    evidence: "Reddit was cited in 3 of 40 answers · audit #54",
    priority: "medium",
    status: "in_progress",
  },
];
const agency = [
  {
    id: "a2",
    title: "Refresh the service pages",
    detail: null,
    priority: "low" as const,
    status: "open" as const,
    position: 2,
  },
  {
    id: "a1",
    title: "Ask five clients for reviews",
    detail: "By December",
    priority: "high" as const,
    status: "open" as const,
    position: 1,
  },
];
const base = {
  measured,
  choices: [
    { actionItemId: ITEM_B, included: true, position: 0, note: "Started in November" },
    { actionItemId: ITEM_A, included: false, position: 1, note: null },
  ],
  agencyActions: agency,
  doneSinceLast: [{ title: "Claim your Google Business Profile", doneAt: "2026-11-18" }],
  generalAdvice: [
    {
      title: "Create or update your LinkedIn company page",
      evidence: "LinkedIn was cited in 9 of 40 answers",
    },
  ],
  includeGeneralAdvice: false,
  includeDoneSinceLast: true,
};

describe("assembleWhatToDoNext", () => {
  it("Agency and up: saved order first, hidden items kept as hidden, notes, agency actions by position, toggles", () => {
    const next = assembleWhatToDoNext({ ...base, curated: true });
    expect(next.measured.map((m) => [m.title, m.included, m.note])).toEqual([
      ["Get mentioned in relevant Reddit threads", true, "Started in November"],
      ["Link your Yellow Pages profile", false, null],
      ["Gemini didn't name you in any of 10 answers", true, null],
    ]);
    expect(next.agencyActions.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(next.includeGeneralAdvice).toBe(false);
    expect(next.curated).toBe(true);
  });

  it("below Agency: priority order as measured, all included, no notes or agency actions, both toggles on", () => {
    const next = assembleWhatToDoNext({ ...base, curated: false });
    expect(next.measured.map((m) => [m.key, m.included, m.note])).toEqual([
      [ITEM_A, true, null],
      ["finding:b", true, null],
      [ITEM_B, true, null],
    ]);
    expect(next.agencyActions).toEqual([]);
    expect(next.includeGeneralAdvice).toBe(true);
    expect(next.includeDoneSinceLast).toBe(true);
  });

  it("evidence lines are never changed by the agency's choices", () => {
    const next = assembleWhatToDoNext({ ...base, curated: true });
    for (const m of next.measured)
      expect(measured.find((x) => x.key === m.key)?.evidence).toBe(m.evidence);
  });
});
