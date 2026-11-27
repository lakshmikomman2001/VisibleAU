"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Banner } from "@/components/shared/banner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pill } from "@/components/shared/pill";
import type { QuestionReach } from "@/db/schema/questions";
import { questionTextKey } from "@/lib/questions/text-key";
import type { QuestionCheck } from "@/lib/questions/validate";
import type { QuestionsResponse } from "./questions-tab";

/**
 * S03 part 4 (LLD 8.3.1; contract P02 edit mode, P03 add drawer, P04 apply modal): editing a brand's questions as a
 * draft, then applying it from the next audit. The draft lives in this tab's sessionStorage (a convenience: the server
 * checks everything again on apply, lib/questions/apply.ts). Rows move by drag, by their handle and Alt+↑/↓, or by the
 * menu; questions come in from the suggestions or the add drawer (Growth and up: Starter chooses among suggestions,
 * D4); a removed question can be archived when the set is applied. The draft bar counts what changed; Apply opens the
 * confirmation, whose answer (201, 409, 402, 422) is handled in place. No toast library is mounted (D-UI4): success is
 * an inline status.
 */

export interface DraftItem {
  /** Stable within the draft: the library id, or "new:{n}" for a typed question. */
  key: string;
  questionId?: string;
  text: string;
  kind: "everyday" | "branded";
  source: "original" | "template" | "ai_suggested" | "agency";
  /** S04 part 6: the question's reach (Local until the brand adds others; a typed question is Local until P03's area). */
  reach: QuestionReach;
  /** A typed question that rewords this library question (archived on apply). */
  replaces?: string;
}

export interface Draft {
  baseVersion: number;
  items: DraftItem[];
  /** Library questions to archive once the set is applied. */
  archive: string[];
}

const storageKey = (brandId: string) => `vunnara:questions-draft:${brandId}`;

export function initialDraft(view: QuestionsResponse): Draft {
  return {
    baseVersion: view.set?.version ?? 0,
    items: view.questions.map((q) => ({
      key: q.id,
      questionId: q.id,
      text: q.text,
      kind: q.kind,
      source: q.source,
      reach: q.reach,
    })),
    archive: [],
  };
}

export function readStoredDraft(brandId: string, baseVersion: number): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(brandId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft.baseVersion === baseVersion && Array.isArray(draft.items) ? draft : null;
  } catch {
    return null;
  }
}

export function storeDraft(brandId: string, draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(storageKey(brandId), JSON.stringify(draft));
    else window.sessionStorage.removeItem(storageKey(brandId));
  } catch {
    // Private windows can refuse storage: the draft then lasts as long as the page.
  }
}

/** What the draft changes against the current set: added, removed, moved (still there, in another place). */
export function draftChanges(view: QuestionsResponse, draft: Draft) {
  const before = view.questions.map((q) => q.id);
  const after = draft.items.map((i) => i.questionId).filter((id): id is string => !!id);
  const added = draft.items.filter((i) => !i.questionId || !before.includes(i.questionId));
  const removed = view.questions.filter((q) => !after.includes(q.id));
  const keptBefore = before.filter((id) => after.includes(id));
  const keptAfter = after.filter((id) => before.includes(id));
  const moved = keptAfter.filter((id, n) => keptBefore[n] !== id).length;
  return { added, removed, moved };
}

/**
 * S04 part 0c (LLD amendment 96): whether a kept draft changes anything against the current set. One that doesn't is
 * dropped silently when the page comes back (live, "Keep your draft?" asked with "No changes yet").
 */
export function draftDiffers(view: QuestionsResponse, draft: Draft): boolean {
  const { added, removed, moved } = draftChanges(view, draft);
  return added.length + removed.length + moved > 0 || draft.archive.length > 0;
}

/** S04 part 0c (LLD amendment 96; appendix E): the plan's limit, as the apply route's 402 says it. */
export const limitSentence = (limit: number) =>
  `Your plan includes ${limit} everyday questions per brand. Remove one, or add a question pack.`;

const sourceLabel = (item: Pick<DraftItem, "source">, agencyName: string) =>
  item.source === "agency"
    ? `Written by ${agencyName}`
    : item.source === "template"
      ? "From your business type"
      : item.source === "ai_suggested"
        ? "AI-suggested"
        : "Original set";
const sourceTone = (item: Pick<DraftItem, "source">) =>
  item.source === "agency" ? "agency" : item.source === "ai_suggested" ? "ai" : "neutral";

const button = (primary: boolean): React.CSSProperties => ({
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: primary ? "var(--accent-primary)" : "var(--bg-elevated)",
  color: primary ? "var(--accent-primary-fg)" : "var(--text-primary)",
  border: primary ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
});

// The drawer and the modal sit at z-50, like the cookie banner and later in the page, so they cover it, as the
// mobile-nav drawer and the confirm dialog do (the app's value wins over the contract's overlay 40).

/* ------------------------------------------------------------------------------------------------------------------
 * P03 · the add drawer
 * ---------------------------------------------------------------------------------------------------------------- */

type CheckState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error" }
  | { status: "done"; ok: boolean; kind: "everyday" | "branded"; checks: QuestionCheck[] };

const DISC: Record<
  QuestionCheck["status"] | "pending",
  { glyph: string; fg: string; bg: string; sr: string }
> = {
  pass: { glyph: "✓", fg: "var(--success)", bg: "var(--success-soft)", sr: "Passed:" },
  warn: { glyph: "!", fg: "var(--warning)", bg: "var(--warning-soft)", sr: "Warning:" },
  fail: { glyph: "✕", fg: "var(--danger)", bg: "var(--danger-soft)", sr: "Problem:" },
  pending: { glyph: "·", fg: "var(--text-tertiary)", bg: "var(--bg-subtle)", sr: "Checking:" },
};

const ALWAYS = [
  "One question, 10–200 characters",
  "Not already in your questions",
  "Doesn't name your business, so it counts toward your score",
  "No links, emails or phone numbers",
];

function CheckLine({
  status,
  message,
  fix,
  onFix,
}: {
  status: QuestionCheck["status"] | "pending";
  message: string;
  fix?: { label: string; text: string };
  onFix?: (text: string) => void;
}) {
  const d = DISC[status];
  return (
    <li style={{ fontSize: 13, lineHeight: "19px" }}>
      <div className="flex items-start" style={{ gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            flex: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: d.fg,
            background: d.bg,
          }}
        >
          {d.glyph}
        </span>
        <span style={{ color: status === "fail" ? "var(--danger)" : "var(--text-primary)" }}>
          <span className="sr-only">{d.sr} </span>
          {message}
        </span>
      </div>
      {fix && onFix ? (
        <button
          type="button"
          onClick={() => onFix(fix.text)}
          style={{
            marginTop: 6,
            marginLeft: 28,
            height: 30,
            padding: "0 10px",
            borderRadius: 6,
            fontSize: 12.5,
            fontWeight: 500,
            background: "var(--accent-blue)",
            color: "var(--accent-blue-fg)",
            border: "none",
            cursor: "pointer",
          }}
        >
          {fix.label}
        </button>
      ) : null}
    </li>
  );
}

export function AddQuestionDrawer({
  brandId,
  agencyName,
  draft,
  maxBranded,
  initialText = "",
  replaces,
  addLabel = "Add to draft",
  areas,
  initialReach,
  onAdd,
  onClose,
}: {
  brandId: string;
  agencyName: string;
  draft: Draft;
  maxBranded: number;
  initialText?: string;
  replaces?: DraftItem;
  /** S04 part 0b (amendment 93; contract P03.footer): the confirm screen's drawer reads "Add question". */
  addLabel?: string;
  /** S04 part 7 (P03.area): the brand's enabled reaches and their labels; Local alone when absent. */
  areas?: ReadonlyArray<{ reach: QuestionReach; label: string }>;
  /** The area chosen when the drawer opens (the reworded question's); Local when absent. */
  initialReach?: QuestionReach;
  onAdd: (item: { text: string; kind: "everyday" | "branded"; reach: QuestionReach }) => void;
  onClose: () => void;
}) {
  const choices = areas && areas.length > 0 ? areas : [{ reach: "local" as const, label: "Local" }];
  const [reach, setReach] = useState<QuestionReach>(
    choices.some((c) => c.reach === initialReach) && initialReach ? initialReach : "local",
  );
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<CheckState>({ status: "idle" });
  const [asking, setAsking] = useState(false);
  const titleId = useId();
  const counterId = useId();
  const checksId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(0);

  useEffect(() => {
    area.current?.focus();
  }, []);

  // The server's checks for one text; only the latest request's answer is shown.
  const runCheck = useCallback(
    async (value: string) => {
      const id = ++latest.current;
      setState({ status: "pending" });
      try {
        const res = await fetch(`/api/brands/${brandId}/questions/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value, reach }),
        });
        if (id !== latest.current) return;
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          ok: boolean;
          kind: "everyday" | "branded";
          checks: QuestionCheck[];
        };
        setState({ status: "done", ...body });
      } catch {
        if (id === latest.current) setState({ status: "error" });
      }
    },
    [brandId, reach],
  );

  // Checks run 250 ms after typing stops.
  useEffect(() => {
    if (!text.trim()) {
      latest.current++;
      setState({ status: "idle" });
      return;
    }
    setState({ status: "pending" });
    const timer = window.setTimeout(() => void runCheck(text), 250);
    return () => window.clearTimeout(timer);
  }, [text, runCheck]);

  // The server knows the library and the current set; the draft's own additions and its count are checked here.
  const checks = useMemo(() => {
    if (state.status !== "done") return null;
    const key = questionTextKey(text);
    const others = draft.items.filter((i) => i.key !== replaces?.key);
    const inDraft = others.some((i) => questionTextKey(i.text) === key);
    const brandedInDraft = others.filter((i) => i.kind === "branded").length;
    let list = state.checks.map((c) =>
      c.id === "duplicate" && inDraft ? { ...c, status: "fail" as const } : c,
    );
    list = list.filter((c) => c.id !== "branded_limit");
    if (state.kind === "branded" && brandedInDraft >= maxBranded) {
      list.push({
        id: "branded_limit",
        status: "fail",
        message: "Already 5 questions name your business. Remove one first.",
      });
    }
    return list;
  }, [state, text, draft.items, replaces, maxBranded]);
  const blocked = !checks || checks.some((c) => c.status === "fail");
  const kind = state.status === "done" ? state.kind : "everyday";

  const close = useCallback(() => {
    if (text.trim() && text !== initialText) setAsking(true);
    else onClose();
  }, [text, initialText, onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !asking) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, asking]);

  return (
    <div className="fixed inset-0 z-50" style={{ background: "var(--overlay-scrim)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="p03"
        className="absolute right-0 top-0 h-full w-full min-[641px]:w-[480px] flex flex-col"
        style={{
          background: "var(--bg-elevated)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-pop)",
          padding: 24,
          gap: 16,
          overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <h2
            id={titleId}
            style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}
          >
            Add a question
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="p03-close"
            onClick={close}
            className="inline-flex items-center justify-center w-11 h-11 min-[641px]:w-8 min-[641px]:h-8"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        <div>
          <label
            htmlFor={`${titleId}-text`}
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Question a customer would ask AI
          </label>
          <textarea
            id={`${titleId}-text`}
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            data-testid="p03-text"
            aria-describedby={`${counterId} ${checksId}`}
            style={{
              width: "100%",
              minHeight: 84,
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 14,
              lineHeight: "20px",
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-control, var(--border-default))",
              resize: "vertical",
            }}
          />
          <p
            id={counterId}
            style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-tertiary)" }}
          >
            {text.trim().length} / 200 characters
          </p>
        </div>

        <fieldset data-testid="p03-area" style={{ border: "none", padding: 0, margin: 0 }}>
          <legend
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Area
          </legend>
          {/* S04 part 7 (P03.area): the brand's enabled reaches, the chosen one checked against; Local alone without
              visibility_reach (one segment, chosen). Changing it re-runs the checks. */}
          <div
            className="inline-flex flex-wrap"
            style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: 2 }}
          >
            {choices.map((c) => {
              const on = c.reach === reach;
              return (
                <label
                  key={c.reach}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: choices.length > 1 ? "pointer" : "default",
                    background: on ? "var(--accent-blue-soft)" : "transparent",
                    color: on ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  <input
                    type="radio"
                    name="p03-area"
                    value={c.reach}
                    checked={on}
                    onChange={() => setReach(c.reach)}
                    className="sr-only"
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div aria-live="polite" id={checksId} data-testid="p03-checks">
          {state.status === "error" ? (
            <Banner
              tone="warn"
              actions={
                <button type="button" style={button(false)} onClick={() => void runCheck(text)}>
                  Try again
                </button>
              }
            >
              We couldn't check this question. Try again.
            </Banner>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {checks
                ? checks.map((c) => (
                    <CheckLine
                      key={c.id}
                      status={c.status}
                      message={c.message}
                      fix={c.fix}
                      onFix={(fixed) => {
                        setText(fixed);
                        window.setTimeout(() => {
                          const el = area.current;
                          if (el) {
                            el.focus();
                            el.setSelectionRange(el.value.length, el.value.length);
                          }
                        }, 0);
                      }}
                    />
                  ))
                : ALWAYS.map((message) => (
                    <CheckLine
                      key={message}
                      status="pending"
                      message={state.status === "pending" ? `${message} · Checking…` : message}
                    />
                  ))}
            </ul>
          )}
        </div>

        <Banner tone="neutral" testId="p03-label">
          It will be labelled{" "}
          <Pill tone={kind === "branded" ? "branded" : "agency"}>
            {kind === "branded" ? "Names your business · not scored" : `Written by ${agencyName}`}
          </Pill>{" "}
          on the audit page and in reports.
        </Banner>

        <div
          data-testid="p03-footer"
          className="flex flex-col min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between"
          style={{
            marginTop: "auto",
            gap: 12,
            position: "sticky",
            bottom: 0,
            background: "var(--bg-elevated)",
            paddingTop: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Added to your draft. Nothing changes until you apply.
          </p>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onAdd({ text: text.replace(/[^\S\r\n]+/g, " ").trim(), kind, reach })}
            className="w-full min-[641px]:w-auto"
            style={{
              ...button(true),
              opacity: blocked ? 0.5 : 1,
              cursor: blocked ? "not-allowed" : "pointer",
            }}
          >
            {addLabel}
          </button>
        </div>
      </div>
      {asking ? (
        <ConfirmDialog
          title="Discard this question?"
          confirmLabel="Discard"
          cancelLabel="Keep"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onClose();
          }}
        >
          What you typed isn't in your draft yet.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * P04 · the apply modal
 * ---------------------------------------------------------------------------------------------------------------- */

type ApplyError = { kind: "limit" | "checks"; message: string } | null;

export function ApplyModal({
  brandId,
  view,
  draft,
  agencyName,
  onCancel,
  onApplied,
  onConflict,
}: {
  brandId: string;
  view: QuestionsResponse;
  draft: Draft;
  agencyName: string;
  onCancel: () => void;
  onApplied: (version: number) => void;
  onConflict: () => void;
}) {
  const titleId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApplyError>(null);
  const { added, removed } = draftChanges(view, draft);
  const everyday = draft.items.filter((i) => i.kind === "everyday").length;
  const branded = draft.items.length - everyday;
  const limit = view.limits.everydayAllowed ?? 10;
  const from = view.set?.version ?? 0;
  const run = view.history.find((h) => h.version === from)?.audits ?? null;

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function apply() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/question-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersion: draft.baseVersion,
          count: everyday,
          items: draft.items.map((item, position) =>
            item.questionId
              ? { questionId: item.questionId, reach: item.reach, position }
              : { text: item.text, replaces: item.replaces, reach: item.reach, position },
          ),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { version?: number; message?: string };
      if (res.status === 201 && body.version) {
        onApplied(body.version);
        return;
      }
      if (res.status === 409) {
        onConflict();
        return;
      }
      if (res.status === 402) {
        setError({
          kind: "limit",
          message: `Your plan includes ${limit} everyday questions per brand. Remove one, or add a question pack.`,
        });
      } else {
        setError({
          kind: "checks",
          message: "Some questions didn't pass the checks. Fix them in your draft and try again.",
        });
      }
    } catch {
      setError({
        kind: "checks",
        message: "Some questions didn't pass the checks. Fix them in your draft and try again.",
      });
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="p04"
        className="w-full min-[641px]:w-[560px]"
        style={{
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          padding: 24,
          borderRadius: 14,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <h2
          id={titleId}
          data-testid="p04-title"
          style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}
        >
          Apply new questions from the next audit?
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          {view.brandName ?? "This brand"} · version {from} → {from + 1}
        </p>
        <ul
          data-testid="p04-changes"
          style={{ margin: "16px 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}
        >
          {added.map((item) => (
            <li
              key={`+${item.key}`}
              className="flex flex-wrap items-center"
              style={{ gap: 6, fontSize: 13, color: "var(--text-primary)" }}
            >
              <span aria-hidden="true" style={{ color: "var(--success)", fontWeight: 700 }}>
                +
              </span>
              <span className="sr-only">Added:</span>
              <span>{item.text}</span>
              <Pill tone={item.kind === "branded" ? "branded" : sourceTone(item)}>
                {item.kind === "branded"
                  ? "Names your business · not scored"
                  : sourceLabel(item, agencyName)}
              </Pill>
            </li>
          ))}
          {removed.map((q) => (
            <li
              key={`-${q.id}`}
              className="flex items-center"
              style={{ gap: 6, fontSize: 13, color: "var(--text-secondary)" }}
            >
              <span aria-hidden="true" style={{ color: "var(--danger)", fontWeight: 700 }}>
                −
              </span>
              <span className="sr-only">Removed:</span>
              <span>{q.text}</span>
            </li>
          ))}
        </ul>
        <Banner tone="warn" testId="p04-notice">
          {run ? (
            <>
              <strong>This starts a new comparison.</strong>{" "}
              {run.from === run.to
                ? `Audit #${run.from} stays in your history; the trend restarts from the next audit.`
                : `Audits #${run.from}–#${run.to} stay in your history; the trend restarts from the next audit.`}{" "}
              An audit that is already running keeps the current questions.
            </>
          ) : (
            <>
              <strong>This starts a new comparison.</strong> Your trend hasn't started yet, so
              nothing restarts.
            </>
          )}
        </Banner>
        {error ? (
          <p role="alert" style={{ margin: "16px 0 0", fontSize: 13, color: "var(--danger)" }}>
            {error.message}
          </p>
        ) : null}
        <div
          data-testid="p04-footer"
          className="flex flex-col-reverse min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between"
          style={{ marginTop: 20, gap: 12 }}
        >
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-tertiary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {everyday} of {limit} everyday · {branded} naming you
          </span>
          <div className="flex flex-col-reverse min-[641px]:flex-row" style={{ gap: 8 }}>
            <button
              ref={cancel}
              type="button"
              onClick={onCancel}
              className="w-full min-[641px]:w-auto"
              style={button(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              aria-busy={busy}
              className="w-full min-[641px]:w-auto"
              style={{ ...button(true), opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Applying…" : "Apply from the next audit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * P02 · edit mode
 * ---------------------------------------------------------------------------------------------------------------- */

function EditRowMenu({
  item,
  first,
  last,
  canSwap,
  onEdit,
  onSwap,
  onUp,
  onDown,
  onRemove,
  onArchive,
}: {
  item: DraftItem;
  first: boolean;
  last: boolean;
  canSwap: boolean;
  onEdit: () => void;
  onSwap: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
    trigger.current?.focus();
  };
  const entries: Array<[string, () => void, boolean]> = [
    ["Edit wording", onEdit, item.kind === "everyday"],
    ["Swap for a suggestion", onSwap, canSwap && item.kind === "everyday"],
    ["Move up", onUp, !first],
    ["Move down", onDown, !last],
    ["Remove from set", onRemove, true],
    ["Archive", onArchive, !!item.questionId],
  ];
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={trigger}
        type="button"
        aria-label={`More actions for ${item.text}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        data-testid="p02-row-more"
        className="inline-flex items-center justify-center w-11 h-11 min-[641px]:w-8 min-[641px]:h-8"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        •••
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 30,
            minWidth: 210,
            padding: 4,
            borderRadius: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          {entries
            .filter(([, , shown]) => shown)
            .map(([label, action]) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={choose(action)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: label === "Archive" ? "var(--danger)" : "var(--text-primary)",
                }}
              >
                {label}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuestionEditor({
  brandId,
  view,
  restored,
  onClose,
  onApplied,
  onReload,
}: {
  brandId: string;
  view: QuestionsResponse;
  /** A draft kept in this tab from before: the page asks whether to keep it. */
  restored: Draft | null;
  onClose: () => void;
  onApplied: (version: number, notArchived: number) => void;
  onReload: () => void;
}) {
  const agencyName = view.agencyName ?? "your agency";
  const limit = view.limits.everydayAllowed ?? 10;
  const maxBranded = view.limits.maxBranded ?? 5;
  const canWrite = view.limits.canWriteQuestions ?? false;
  const [draft, setDraft] = useState<Draft>(() => restored ?? initialDraft(view));
  const [askKeep, setAskKeep] = useState(!!restored);
  const [drawer, setDrawer] = useState<null | { replaces?: DraftItem }>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [live, setLive] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  const dragKey = useRef<string | null>(null);
  const hintId = useId();

  useEffect(() => {
    storeDraft(brandId, draft);
  }, [brandId, draft]);

  const { added, removed, moved } = draftChanges(view, draft);
  const changed = added.length + removed.length + moved > 0 || draft.archive.length > 0;
  const everydayItems = draft.items.filter((i) => i.kind === "everyday");
  const brandedItems = draft.items.filter((i) => i.kind === "branded");
  // S04 part 0c (LLD amendment 96; contract P02.suggestions, P02.addQuestion): at the plan's limit nothing more comes
  // in -- the suggestions' Add and "+ Add question" are off, with the plan's sentence as their tooltip and as a help
  // line under the everyday list; Swap, Remove and Edit wording still work (they don't add one). A suggestion that
  // names the business is off at the 5 that may (P03's sentence), so neither reaches the server's 402 or 422.
  const atLimit = everydayItems.length >= limit;
  const brandedFull = brandedItems.length >= maxBranded;
  const limitHelpId = useId();
  const inDraft = new Set(draft.items.map((i) => i.questionId).filter(Boolean));
  const spare = view.suggestions.filter((s) => !inDraft.has(s.id));

  const addOff = (s: { kind?: DraftItem["kind"] }) =>
    s.kind === "branded" ? brandedFull : atLimit;
  const addOffReason = (s: { kind?: DraftItem["kind"] }) =>
    s.kind === "branded"
      ? "Already 5 questions name your business. Remove one first."
      : limitSentence(limit);

  const update = (items: DraftItem[], extra: Partial<Draft> = {}) =>
    setDraft((d) => ({ ...d, ...extra, items }));

  /** Moves an item within its kind's section by `by` places. */
  function move(key: string, by: -1 | 1) {
    const item = draft.items.find((i) => i.key === key);
    if (!item) return;
    const section = draft.items.filter((i) => i.kind === item.kind);
    const at = section.findIndex((i) => i.key === key);
    const to = at + by;
    if (to < 0 || to >= section.length) return;
    const reordered = [...section];
    [reordered[at], reordered[to]] = [reordered[to], reordered[at]];
    const others = draft.items.filter((i) => i.kind !== item.kind);
    update(item.kind === "everyday" ? [...reordered, ...others] : [...others, ...reordered]);
    setLive(`Moved to position ${to + 1} of ${section.length}`);
  }

  function dropOn(targetKey: string) {
    const from = dragKey.current;
    dragKey.current = null;
    if (!from || from === targetKey) return;
    const section = draft.items.filter((i) => i.kind === "everyday");
    const a = section.findIndex((i) => i.key === from);
    const b = section.findIndex((i) => i.key === targetKey);
    if (a < 0 || b < 0) return;
    const item = section[a];
    const without = section.filter((_, n) => n !== a);
    const reordered = [...without.slice(0, b), item, ...without.slice(b)];
    update([...reordered, ...draft.items.filter((i) => i.kind !== "everyday")]);
    setLive(`Moved to position ${b + 1} of ${section.length}`);
  }

  function addItem(item: DraftItem) {
    const at = draft.items.map((i) => i.kind).lastIndexOf(item.kind) + 1;
    update([...draft.items.slice(0, at), item, ...draft.items.slice(at)]);
  }

  function handleKeys(e: KeyboardEvent<HTMLButtonElement>, key: string) {
    if (!e.altKey) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(key, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(key, 1);
    }
  }

  function row(item: DraftItem, index: number, list: DraftItem[]) {
    const branded = item.kind === "branded";
    // S04 part 0a: a regenerated suggestion may name the business; a row swaps only for one of its own kind.
    const swaps = spare.filter((s) => (s.kind ?? "everyday") === item.kind);
    return (
      <li
        key={item.key}
        data-testid="p02-row"
        data-kind={item.kind}
        draggable={!branded}
        onDragStart={() => {
          dragKey.current = item.key;
        }}
        onDragOver={(e) => !branded && e.preventDefault()}
        onDrop={() => !branded && dropOn(item.key)}
        className="grid items-start hover:bg-[var(--bg-subtle)]"
        style={{
          gridTemplateColumns: branded ? "1fr auto" : "20px 1fr auto",
          gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        {!branded ? (
          <button
            type="button"
            aria-label={`Reorder: ${item.text}`}
            aria-describedby={hintId}
            onKeyDown={(e) => handleKeys(e, item.key)}
            className="hidden min-[641px]:inline-flex items-center justify-center"
            style={{
              width: 20,
              height: 24,
              background: "transparent",
              border: "none",
              color: "var(--text-tertiary)",
              cursor: "grab",
              padding: 0,
            }}
          >
            ⋮⋮
          </button>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: "21px",
              color: "var(--text-primary)",
              overflowWrap: "anywhere",
            }}
          >
            {item.text}
          </p>
          <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 6 }}>
            {branded ? (
              <Pill tone="branded">Names your business · not scored</Pill>
            ) : (
              <Pill tone={sourceTone(item)}>{sourceLabel(item, agencyName)}</Pill>
            )}
            {/* S04 part 7: a question beyond Local says its reach in edit mode (the sections are view mode's). */}
            {!branded && item.reach !== "local" ? (
              <Pill tone="neutral" testId="p02-row-reach">
                {view.reaches?.find((r) => r.reach === item.reach)?.label ?? item.reach}
              </Pill>
            ) : null}
          </div>
          {swapping === item.key ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "var(--text-tertiary)" }}>
                Swap for:
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {swaps.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        update(
                          draft.items.map((i) =>
                            i.key === item.key
                              ? {
                                  key: s.id,
                                  questionId: s.id,
                                  text: s.text,
                                  kind: item.kind,
                                  source: s.source ?? "template",
                                  reach: s.reach ?? item.reach,
                                }
                              : i,
                          ),
                        );
                        setSwapping(null);
                        setLive("Question swapped in your draft");
                      }}
                      style={{
                        ...button(false),
                        height: "auto",
                        padding: "6px 10px",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      {s.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <EditRowMenu
          item={item}
          first={index === 0}
          last={index === list.length - 1}
          canSwap={swaps.length > 0}
          onEdit={() => setDrawer({ replaces: item })}
          onSwap={() => setSwapping(item.key)}
          onUp={() => move(item.key, -1)}
          onDown={() => move(item.key, 1)}
          onRemove={() => {
            update(draft.items.filter((i) => i.key !== item.key));
            setLive("Question removed from your draft");
          }}
          onArchive={() => {
            update(
              draft.items.filter((i) => i.key !== item.key),
              { archive: item.questionId ? [...draft.archive, item.questionId] : draft.archive },
            );
            setLive("Question removed; it will be archived when you apply");
          }}
        />
      </li>
    );
  }

  function section(title: string, list: DraftItem[], testId: string, branded: boolean) {
    const headId = `${brandId}-edit-${testId}`;
    const n = list.length;
    return (
      <section
        aria-labelledby={headId}
        data-testid={testId}
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          background: "var(--bg-elevated)",
          overflow: "visible",
        }}
      >
        <div
          className="flex items-baseline"
          style={{
            gap: 8,
            padding: "12px 16px",
            background: "var(--bg-subtle)",
            borderBottom: "1px solid var(--border-default)",
            borderRadius: "12px 12px 0 0",
          }}
        >
          <h2
            id={headId}
            style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            {branded
              ? `${n} ${n === 1 ? "question" : "questions"} · not scored`
              : `${n} ${n === 1 ? "question" : "questions"}${n < 5 ? " · small sample" : ""}`}
          </span>
        </div>
        <ul
          style={{ margin: 0, padding: 0, listStyle: "none" }}
          className="[&>li:last-child]:border-b-0"
        >
          {list.map((item, i) => row(item, i, list))}
        </ul>
        {!branded ? (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-default)" }}>
            {canWrite ? (
              <button
                ref={addButton}
                type="button"
                data-testid="p02-add-question"
                onClick={() => setDrawer({})}
                disabled={atLimit}
                title={atLimit ? limitSentence(limit) : undefined}
                aria-describedby={atLimit ? limitHelpId : undefined}
                style={{
                  ...button(false),
                  height: 32,
                  fontSize: 12.5,
                  ...(atLimit ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                }}
              >
                + Add question
              </button>
            ) : (
              <p
                className="flex flex-wrap items-center"
                style={{ margin: 0, gap: 8, fontSize: 12.5, color: "var(--text-tertiary)" }}
                data-testid="p02-plan-lock"
              >
                <span aria-hidden="true">🔒</span>
                <span>Growth</span>
                <span>Writing your own questions is available on Growth and up.</span>
                <Link
                  href="/pricing"
                  style={{ color: "var(--accent-blue)", textDecoration: "underline" }}
                >
                  Upgrade
                </Link>
              </p>
            )}
            {atLimit ? (
              <p
                id={limitHelpId}
                data-testid="p02-limit-help"
                style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-tertiary)" }}
              >
                {limitSentence(limit)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  const chip = (text: string) => (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        background: "var(--accent-muted)",
        color: "var(--text-primary)",
      }}
    >
      {text}
    </span>
  );

  return (
    <div style={{ display: "grid", gap: 20, paddingBottom: 8 }} data-testid="p02-edit">
      <p id={hintId} className="sr-only">
        Press Alt and the up or down arrow to move
      </p>
      <div aria-live="polite" className="sr-only" data-testid="p02-live">
        {live}
      </div>
      {askKeep ? (
        <Banner
          tone="neutral"
          testId="p02-keep-draft"
          actions={
            <div className="flex" style={{ gap: 8 }}>
              <button type="button" style={button(false)} onClick={() => setAskKeep(false)}>
                Keep
              </button>
              <button
                type="button"
                style={button(false)}
                onClick={() => {
                  setDraft(initialDraft(view));
                  setAskKeep(false);
                }}
              >
                Discard
              </button>
            </div>
          }
        >
          Keep your draft?
        </Banner>
      ) : null}

      {section("Everyday questions", everydayItems, "p02-section-local", false)}
      {brandedItems.length > 0
        ? section("Names your business", brandedItems, "p02-section-branded", true)
        : null}

      {view.limits.suggestionsShown && spare.length > 0 ? (
        <section
          data-testid="p02-suggestions"
          aria-label="Suggestions"
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            className="flex flex-col min-[641px]:flex-row min-[641px]:items-baseline min-[641px]:justify-between"
            style={{ gap: 2 }}
          >
            <h2
              id={`${brandId}-suggestions`}
              tabIndex={-1}
              style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
            >
              Suggestions
            </h2>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
              From your business type
            </p>
          </div>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
            {spare.map((s) => (
              <li
                key={s.id}
                className="flex flex-col min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between"
                style={{ gap: 8, padding: "12px 0", borderTop: "1px solid var(--border-default)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14.5,
                      lineHeight: "21px",
                      color: "var(--text-primary)",
                    }}
                  >
                    {s.text}
                  </p>
                  {s.kind === "branded" ? (
                    <div style={{ marginTop: 6 }}>
                      <Pill tone="branded">Names your business · not scored</Pill>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={`Add: ${s.text}`}
                  disabled={addOff(s)}
                  title={addOff(s) ? addOffReason(s) : undefined}
                  aria-describedby={addOff(s) && s.kind !== "branded" ? limitHelpId : undefined}
                  onClick={() => {
                    addItem({
                      key: s.id,
                      questionId: s.id,
                      text: s.text,
                      kind: s.kind ?? "everyday",
                      source: s.source ?? "template",
                      reach: s.reach ?? "local",
                    });
                    setLive("Question added to your draft");
                  }}
                  style={{
                    ...button(false),
                    height: 32,
                    fontSize: 12.5,
                    alignSelf: "flex-start",
                    ...(addOff(s) ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                  }}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {conflict ? (
        <Banner
          tone="warn"
          role="alert"
          testId="p02-conflict"
          actions={
            <button
              type="button"
              style={button(false)}
              onClick={() => {
                storeDraft(brandId, null);
                onReload();
              }}
            >
              Reload
            </button>
          }
        >
          Someone else changed these questions. Reload to see their version.
        </Banner>
      ) : null}

      <section
        aria-label="Draft changes"
        data-testid="p02-draft-bar"
        className="fixed min-[641px]:sticky bottom-0 left-0 right-0 flex flex-col min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between rounded-none min-[641px]:rounded-xl"
        style={{
          zIndex: 10,
          gap: 12,
          padding: "12px 16px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong, var(--border-default))",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <div className="flex flex-wrap items-center" style={{ gap: 8 }} aria-live="polite">
          <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>Draft</strong>
          {changed ? (
            <>
              {added.length > 0 ? chip(`+${added.length} added`) : null}
              {removed.length > 0 ? chip(`−${removed.length} removed`) : null}
              {moved > 0 ? chip(`${moved} moved`) : null}
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No changes yet</span>
          )}
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {everydayItems.length} of {limit} everyday · {brandedItems.length} of {maxBranded}{" "}
            naming you
          </span>
        </div>
        <div className="flex flex-col-reverse min-[641px]:flex-row" style={{ gap: 8 }}>
          <button
            type="button"
            onClick={() => (changed ? setDiscarding(true) : onClose())}
            className="w-full min-[641px]:w-auto"
            style={{ ...button(false), background: "transparent", border: "none" }}
          >
            Discard
          </button>
          <button
            ref={applyButton}
            type="button"
            disabled={!changed}
            onClick={() => setApplying(true)}
            className="w-full min-[641px]:w-auto"
            style={{
              ...button(true),
              opacity: changed ? 1 : 0.5,
              cursor: changed ? "pointer" : "not-allowed",
            }}
          >
            Apply from the next audit
          </button>
        </div>
      </section>

      {drawer ? (
        <AddQuestionDrawer
          brandId={brandId}
          agencyName={agencyName}
          draft={draft}
          maxBranded={maxBranded}
          initialText={drawer.replaces?.text ?? ""}
          replaces={drawer.replaces}
          onClose={() => {
            setDrawer(null);
            addButton.current?.focus();
          }}
          areas={view.reaches?.filter((r) => r.enabled)}
          initialReach={drawer.replaces?.reach}
          onAdd={({ text, kind, reach }) => {
            const replaced = drawer.replaces;
            const typed: DraftItem = {
              key: `new:${Date.now()}`,
              text,
              kind,
              source: "agency",
              reach,
              replaces: replaced?.questionId ?? replaced?.replaces,
            };
            if (replaced) update(draft.items.map((i) => (i.key === replaced.key ? typed : i)));
            else addItem(typed);
            setDrawer(null);
            setLive(replaced ? "Question reworded in your draft" : "Question added to your draft");
          }}
        />
      ) : null}

      {applying ? (
        <ApplyModal
          brandId={brandId}
          view={view}
          draft={draft}
          agencyName={agencyName}
          onCancel={() => {
            setApplying(false);
            applyButton.current?.focus();
          }}
          onConflict={() => {
            setApplying(false);
            setConflict(true);
          }}
          onApplied={async (version) => {
            storeDraft(brandId, null);
            // The set is applied; questions chosen for archiving are archived now. One that fails is said, never dropped.
            let notArchived = 0;
            for (const id of draft.archive) {
              try {
                const res = await fetch(`/api/brands/${brandId}/questions/${id}/archive`, {
                  method: "POST",
                });
                if (!res.ok) notArchived++;
              } catch {
                notArchived++;
              }
            }
            setApplying(false);
            onApplied(version, notArchived);
          }}
        />
      ) : null}

      {discarding ? (
        <ConfirmDialog
          title="Discard your changes?"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onCancel={() => setDiscarding(false)}
          onConfirm={() => {
            setDiscarding(false);
            storeDraft(brandId, null);
            onClose();
          }}
        >
          Your draft goes, and the questions stay as they are.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
