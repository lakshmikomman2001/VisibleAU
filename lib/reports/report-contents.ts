import { z } from "zod/v4";
import type { FindingRule } from "./report-findings";

/**
 * S01 part 5 (LLD 8.1.3, contract P08): what a brand's report says it will do next, and the rules for what the report
 * contents panel saves.
 *
 * "What to do next" (Standard and Enhanced reports), in groups and in this order:
 *   1. Measured actions: the basis audit's open or in-progress Action Center items that rest on its measured answers
 *      (the same items, order and display basis the audit page uses), each with its evidence line, priority and
 *      status. On Agency and up the agency includes or hides each, reorders them and adds a note for its client.
 *   2. Recommended by {agency}: actions the agency wrote (agency_actions), never shown as measured. Agency and up.
 *   3. Done since the last report: items marked done (action_items.done_at) since the brand's previous generated
 *      report (the audit page has no status history: LLD 0.2 #17). Toggle, on by default.
 *   4. General advice, not drawn from this audit: evidence-backed items only (part 4). Toggle, on by default.
 * Below Agency (Growth) every measured action shows in priority order with no notes and both groups on: the panel is
 * read-only there (D1, P08 planLock).
 */

export const NOTE_MAX = 400;
export const AGENCY_TITLE_MIN = 5;
export const AGENCY_TITLE_MAX = 120;
export const AGENCY_DETAIL_MAX = 600;
/** A brand has at most this many saved choices and live agency actions: the panel lists them all in one page. */
export const MAX_CHOICES = 100;
export const MAX_AGENCY_ACTIONS = 30;

const trimmedNote = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().max(NOTE_MAX, { message: `A note is ${NOTE_MAX} characters or fewer.` }))
  .transform((v) => (v === "" ? null : v));

export const actionChoiceSchema = z.strictObject({
  actionItemId: z.uuid(),
  included: z.boolean(),
  position: z.number().int().min(0).max(1000).nullable(),
  note: trimmedNote.nullable(),
});
export type ActionChoiceInput = z.infer<typeof actionChoiceSchema>;

/** PUT /api/brands/:id/report-preferences, and the `contents` the panel sends with Generate. */
export const reportPreferencesSchema = z.strictObject({
  includeGeneralAdvice: z.boolean().optional(),
  includeDoneSinceLast: z.boolean().optional(),
  defaultTier: z.enum(["basic", "standard", "enhanced"]).nullable().optional(),
  choices: z
    .array(actionChoiceSchema)
    .max(MAX_CHOICES)
    .refine((list) => new Set(list.map((c) => c.actionItemId)).size === list.length, {
      message: "Each action appears once.",
    })
    .optional(),
});
export type ReportPreferencesInput = z.infer<typeof reportPreferencesSchema>;

const agencyTitle = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(AGENCY_TITLE_MIN, {
        message: `A title is ${AGENCY_TITLE_MIN} to ${AGENCY_TITLE_MAX} characters.`,
      })
      .max(AGENCY_TITLE_MAX, {
        message: `A title is ${AGENCY_TITLE_MIN} to ${AGENCY_TITLE_MAX} characters.`,
      }),
  );
const agencyDetail = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .max(AGENCY_DETAIL_MAX, { message: `Details are ${AGENCY_DETAIL_MAX} characters or fewer.` }),
  )
  .transform((v) => (v === "" ? null : v));

/** POST /api/brands/:id/agency-actions */
export const agencyActionCreateSchema = z.strictObject({
  title: agencyTitle,
  detail: agencyDetail.nullable().optional(),
  priority: z.enum(["high", "medium", "low"]),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  position: z.number().int().min(0).max(1000).nullable().optional(),
});

/** PATCH /api/brands/:id/agency-actions (by `id`): any field, at least one. */
export const agencyActionUpdateSchema = z
  .strictObject({
    id: z.uuid(),
    title: agencyTitle.optional(),
    detail: agencyDetail.nullable().optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    status: z.enum(["open", "in_progress", "done"]).optional(),
    position: z.number().int().min(0).max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: "Nothing to change." });

/** The first problem in a failed parse, as one sentence for the panel ("title: A title is 5 to 120 characters."). */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

// ---------------------------------------------------------------- assembly

export type Priority = "high" | "medium" | "low";
/** A measured action's pill: a finding's High or Medium, a strength, or an Action Center item's own priority. */
export type MeasuredPriority = Priority | "strength";
export type ActionStatus = "open" | "in_progress" | "done";

/**
 * One measured action as the audit page has it, before the agency's choices. `key` is stable for the report: the
 * finding's rule ("finding:a") or the Action Center item's id. `actionItemId` is the item the agency's choice is
 * saved against; null for a finding with no Action Center item (rules b-e), which is always included.
 */
export interface MeasuredActionSource {
  key: string;
  actionItemId: string | null;
  title: string;
  evidence: string;
  priority: MeasuredPriority;
  status: ActionStatus;
  /**
   * S01B part 4c (LLD amendment 52): the finding this action comes from, when it does, so the PDF shows each finding
   * once -- its card carries this action's pills and note -- and lists only the other actions after the findings.
   * Absent on snapshots written before S01B (the PDF then matches by title).
   */
  findingRule?: FindingRule;
}

export interface SavedChoice {
  actionItemId: string;
  included: boolean;
  position: number | null;
  note: string | null;
}

export interface AgencyActionRow {
  id: string;
  title: string;
  detail: string | null;
  priority: Priority;
  status: ActionStatus;
  position: number | null;
}

export interface WhatToDoNext {
  measured: Array<MeasuredActionSource & { included: boolean; note: string | null }>;
  agencyActions: AgencyActionRow[];
  doneSinceLast: Array<{ title: string; doneAt: string }>;
  generalAdvice: Array<{ title: string; evidence: string }>;
  includeGeneralAdvice: boolean;
  includeDoneSinceLast: boolean;
  curated: boolean;
}

/**
 * The groups, with the agency's choices applied when `curated` (Agency and up): measured actions in the saved order
 * (unsaved ones after, in priority order), hidden ones kept with `included: false` (the panel lists them; the PDF
 * drops them), notes kept. Not curated: priority order, every action included, no notes, no agency actions, both
 * toggles on.
 */
export function assembleWhatToDoNext(input: {
  measured: readonly MeasuredActionSource[];
  choices: readonly SavedChoice[];
  agencyActions: readonly AgencyActionRow[];
  doneSinceLast: ReadonlyArray<{ title: string; doneAt: string }>;
  generalAdvice: ReadonlyArray<{ title: string; evidence: string }>;
  includeGeneralAdvice: boolean;
  includeDoneSinceLast: boolean;
  curated: boolean;
}): WhatToDoNext {
  if (!input.curated) {
    return {
      measured: input.measured.map((m) => ({ ...m, included: true, note: null })),
      agencyActions: [],
      doneSinceLast: [...input.doneSinceLast],
      generalAdvice: [...input.generalAdvice],
      includeGeneralAdvice: true,
      includeDoneSinceLast: true,
      curated: false,
    };
  }
  const byId = new Map(input.choices.map((c) => [c.actionItemId, c]));
  const choiceOf = (m: MeasuredActionSource) =>
    m.actionItemId ? byId.get(m.actionItemId) : undefined;
  const rank = (m: MeasuredActionSource, i: number) => {
    const p = choiceOf(m)?.position;
    return p === null || p === undefined ? 1000 + i : p;
  };
  const measured = input.measured
    .map((m, i) => ({ m, r: rank(m, i) }))
    .sort((a, b) => a.r - b.r)
    .map(({ m }) => {
      const c = choiceOf(m);
      return { ...m, included: c ? c.included : true, note: c?.note ?? null };
    });
  const agencyActions = [...input.agencyActions].sort(
    (a, b) => (a.position ?? 1000) - (b.position ?? 1000) || a.title.localeCompare(b.title),
  );
  return {
    measured,
    agencyActions,
    doneSinceLast: [...input.doneSinceLast],
    generalAdvice: [...input.generalAdvice],
    includeGeneralAdvice: input.includeGeneralAdvice,
    includeDoneSinceLast: input.includeDoneSinceLast,
    curated: true,
  };
}
