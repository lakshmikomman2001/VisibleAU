"use client";

import { MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EngineDots } from "@/components/domain/audit/engine-dots";
import { Banner } from "@/components/shared/banner";
import { Chip } from "@/components/shared/chip";
import { Pill, type PillTone } from "@/components/shared/pill";
import { formatCheckDate } from "@/lib/format/date";
import { useJson } from "@/lib/hooks/use-load";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import type { QuestionsView, QuestionView } from "@/lib/questions/questions-view";
import { type Draft, QuestionEditor, readStoredDraft } from "./question-editor";

/**
 * S02 part 4 (contract P02, view mode; LLD 8.2.2): the brand's Questions tab, read-only until S03. One request
 * (GET /api/brands/:id/questions) gives the whole tab. Sections by reach -- one, "Everyday questions", until
 * visibility_reach (S04) -- then "Names your business"; each question with its source, its facts when known and the last
 * audit's answer per engine. Every state the contract lists: loading, empty, error, view-only for roles that won't be
 * able to edit, and (on the route) the flag being off.
 */

export interface QuestionsResponse extends QuestionsView {
  /** S03 part 4: who writes the agency's questions, for "Written by {agencyName}". */
  agencyName?: string;
  /** S03 part 4: the apply modal's subtitle, "{brand} · version {from} → {to}". */
  brandName?: string;
  limits: {
    plan: string;
    /** The engines the plan's audits ask, for the intro until the brand has an audit. */
    engines: string[];
    suggestionsShown: boolean;
    canEdit: boolean;
    /** S03 part 4: agency_questions on, a role that edits, a plan that edits (not Free). */
    editable: boolean;
    everydayAllowed?: number;
    everydayMin?: number;
    maxBranded?: number;
    canWriteQuestions?: boolean;
  };
}

const INTENTS: Record<string, string> = {
  best: "Best",
  reviews: "Reviews",
  price: "Price",
  near: "Near me",
  problem: "Problem",
  emergency: "Emergency",
  comparison: "Comparison",
  other: "Other",
};

// P02.row: "Source pill: Original set (neutral) / AI-suggested (ai) / Written by {agencyName} (agency)". Template
// questions are only suggestions until S03 adds them to a set.
const SOURCE_PILL: Record<QuestionView["source"], { label: string; tone: PillTone }> = {
  original: { label: "Original set", tone: "neutral" },
  template: { label: "From your business type", tone: "neutral" },
  ai_suggested: { label: "AI-suggested", tone: "ai" },
  agency: { label: "Written by your agency", tone: "agency" },
};

const nameOf = (engine: string) =>
  ENGINE_DISPLAY_NAMES[engine as keyof typeof ENGINE_DISPLAY_NAMES] ?? engine;

function engineList(engines: readonly string[]): string {
  const names = ["chatgpt", "claude", "gemini", "perplexity"]
    .filter((e) => engines.includes(e))
    .map(nameOf);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** P02.header's line: "Version 1 · your original questions · 10 everyday + 3 that name your business · comparing since audit #50". */
export function headerLine(view: QuestionsView): string {
  const everyday = view.questions.filter((q) => q.kind === "everyday").length;
  const branded = view.questions.length - everyday;
  const set = view.set;
  const counts = `${everyday} everyday + ${branded} that ${branded === 1 ? "names" : "name"} your business`;
  if (!set) return counts;
  const version = set.original
    ? "Version 1 · your original questions"
    : `Version ${set.version} · applied ${formatCheckDate(set.appliedAt)}${set.appliedBy ? ` by ${set.appliedBy}` : ""}`;
  const comparing =
    set.comparingSinceAudit !== null
      ? `comparing since audit #${set.comparingSinceAudit}`
      : "not used in an audit yet";
  return `${version} · ${counts} · ${comparing}`;
}

/**
 * "Last audit (#54): 6 of 40 answers named you" for a section's everyday questions (unconfirmed mentions not counted).
 * S03 part 0 (LLD amendment 79, contract v1.8 P02.section.local): the line names its audit.
 */
export function lastAuditLine(
  questions: readonly QuestionView[],
  auditNumber: number | null,
): string | null {
  let named = 0;
  let answered = 0;
  let any = false;
  for (const q of questions) {
    if (!q.lastResult) continue;
    any = true;
    for (const r of Object.values(q.lastResult)) {
      if (r === "failed") continue;
      answered++;
      if (r === "named") named++;
    }
  }
  if (!any) return null;
  const audit = auditNumber === null ? "Last audit" : `Last audit (#${auditNumber})`;
  return `${audit}: ${named} of ${answered} answers named you`;
}

/**
 * S03 part 0 (LLD amendment 79, contract v1.8 P02.legend): what the squares are, once under the intro. The engines
 * the squares show, in EngineDots' order, joined with " · ".
 */
export function legendLine(engines: readonly string[]): string {
  const names = ["chatgpt", "claude", "gemini", "perplexity"]
    .filter((e) => engines.includes(e))
    .map(nameOf);
  return `Squares, left to right: ${names.join(" · ")} · ✓ named you · ? named but not verified · striped: no answer (failed). Only ✓ counts.`;
}

/** P02.row.more in view mode: copy the question, or open the last audit's answers. */
function RowMenu({ question, auditId }: { question: QuestionView; auditId: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const item: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  };
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={button}
        type="button"
        aria-label={`More actions for ${question.text}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        data-testid="p02-row-more"
        className="inline-flex items-center justify-center w-11 h-11 min-[641px]:w-8 min-[641px]:h-8"
        style={{
          borderRadius: 6,
          background: "transparent",
          border: "none",
          color: "var(--text-tertiary)",
          cursor: "pointer",
        }}
      >
        <MoreHorizontal aria-hidden="true" style={{ width: 16, height: 16 }} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 30,
            minWidth: 220,
            padding: 4,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-pop, 0 4px 12px rgba(0,0,0,.12))",
          }}
        >
          <button
            type="button"
            role="menuitem"
            style={item}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(question.text);
                setCopied(true);
              } catch {
                setCopied(false);
              }
              setOpen(false);
              button.current?.focus();
            }}
          >
            Copy text
          </button>
          {auditId && (
            <Link role="menuitem" href={`/audits/${auditId}?tab=responses`} style={item}>
              See answers in the last audit
            </Link>
          )}
        </div>
      )}
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

function QuestionRow({
  question,
  engines,
  auditId,
  agencyName,
}: {
  question: QuestionView;
  engines: readonly string[];
  auditId: string | null;
  agencyName: string;
}) {
  const branded = question.kind === "branded";
  return (
    <li
      data-testid="p02-row"
      data-kind={question.kind}
      className="grid items-start"
      style={{
        gridTemplateColumns: "1fr auto",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
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
          {question.text}
        </p>
        <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 6 }}>
          {branded ? (
            <Pill tone="branded">Names your business · not scored</Pill>
          ) : (
            <Pill tone={SOURCE_PILL[question.source].tone}>
              {question.source === "agency"
                ? `Written by ${agencyName}`
                : SOURCE_PILL[question.source].label}
            </Pill>
          )}
          {question.serviceLabel && <Chip name="Service" value={question.serviceLabel} />}
          {question.intent && INTENTS[question.intent] && (
            <Chip name="Intent" value={INTENTS[question.intent]} />
          )}
          {!branded && question.lastResult && (
            <EngineDots results={question.lastResult} engines={engines} />
          )}
        </div>
      </div>
      <RowMenu question={question} auditId={auditId} />
    </li>
  );
}

function Section({
  id,
  title,
  count,
  right,
  questions,
  engines,
  auditId,
  testId,
  agencyName,
}: {
  id: string;
  title: string;
  count: string;
  right: string | null;
  questions: QuestionView[];
  engines: readonly string[];
  auditId: string | null;
  testId: string;
  agencyName: string;
}) {
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex flex-col min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between"
        style={{
          gap: 4,
          padding: "12px 16px",
          background: "var(--bg-subtle)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <h2
            id={id}
            style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{count}</span>
        </div>
        {right && <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{right}</span>}
      </div>
      <ul
        style={{ margin: 0, padding: 0, listStyle: "none" }}
        className="[&>li:last-child]:border-b-0"
      >
        {questions.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            engines={engines}
            auditId={auditId}
            agencyName={agencyName}
          />
        ))}
      </ul>
    </section>
  );
}

/** P02.header.history: the versions, newest first, read-only. */
function HistoryDrawer({ view, onClose }: { view: QuestionsView; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <button
        type="button"
        aria-label="Close history"
        tabIndex={-1}
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--overlay-scrim)",
          border: "none",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="p02-history"
        className="w-full min-[641px]:w-[480px]"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          background: "var(--bg-elevated)",
          borderLeft: "1px solid var(--border-default)",
          padding: 24,
          overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <h2
            id={titleId}
            style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}
          >
            Question history
          </h2>
          <button
            ref={close}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex items-center justify-center w-11 h-11 min-[641px]:w-8 min-[641px]:h-8"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <X aria-hidden="true" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {view.history.map((h) => (
            <li
              key={h.version}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--border-default)",
                fontSize: 13.5,
                color: "var(--text-primary)",
              }}
            >
              {[
                `Version ${h.version}`,
                formatCheckDate(h.appliedAt),
                h.appliedBy,
                `${h.everyday} everyday`,
                h.audits
                  ? h.audits.from === h.audits.to
                    ? `used in audit #${h.audits.from}`
                    : `used in audits #${h.audits.from}–#${h.audits.to}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Skeleton() {
  const block = (h: number, w = "100%") => (
    <div
      className="anim-shimmer"
      style={{ height: h, width: w, borderRadius: 6, background: "var(--bg-subtle)" }}
    />
  );
  return (
    <div aria-busy="true" data-testid="p02-loading" style={{ display: "grid", gap: 20 }}>
      <span className="sr-only">Loading questions</span>
      <div style={{ display: "grid", gap: 8 }}>
        {block(28, "160px")}
        {block(16, "60%")}
      </div>
      {block(48)}
      {[0, 1].map((s) => (
        <div
          key={s}
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {block(44)}
          {[0, 1, 2].map((r) => (
            <div key={r} style={{ height: 72, padding: "14px 16px", display: "grid", gap: 8 }}>
              {block(16, "80%")}
              {block(14, "40%")}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function QuestionsTab({ brandId }: { brandId: string }) {
  const loaded = useJson<QuestionsResponse>(`/api/brands/${brandId}/questions`, {
    isEmpty: (d) => d.questions.length === 0,
  });
  const [history, setHistory] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => {
    setHistory(false);
    historyButton.current?.focus();
  }, []);
  // S03 part 4 (P02.header.edit): edit mode is the URL's ?edit=1, so a reload stays in it with the draft this tab kept.
  const [editing, setEditing] = useState(false);
  const [restored, setRestored] = useState<Draft | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [notArchived, setNotArchived] = useState(0);
  const editable = loaded.status === "ready" && loaded.data.limits.editable;
  const baseVersion = loaded.status === "ready" ? (loaded.data.set?.version ?? 0) : 0;
  useEffect(() => {
    if (!editable) return;
    const wanted = new URLSearchParams(window.location.search).get("edit") === "1";
    const kept = readStoredDraft(brandId, baseVersion);
    if (wanted || kept) {
      setRestored(kept);
      setEditing(true);
    }
  }, [editable, brandId, baseVersion]);
  const setEditUrl = (on: boolean) => {
    const url = new URL(window.location.href);
    if (on) url.searchParams.set("edit", "1");
    else url.searchParams.delete("edit");
    window.history.replaceState(window.history.state, "", url);
  };

  if (loaded.status === "loading") return <Skeleton />;
  if (loaded.status === "error") {
    return (
      <Banner
        tone="warn"
        role="alert"
        testId="p02-error"
        actions={
          <button
            type="button"
            onClick={loaded.retry}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        }
      >
        We couldn't load the questions. Try again.
      </Banner>
    );
  }

  const view = loaded.data;
  const title = (
    <h1
      style={{
        margin: 0,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        color: "var(--text-primary)",
      }}
    >
      Questions
    </h1>
  );

  if (loaded.status === "empty") {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        {title}
        <div
          data-testid="p02-empty"
          style={{
            padding: 24,
            borderRadius: 12,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            display: "grid",
            gap: 12,
            justifyItems: "start",
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-primary)" }}>
            No questions yet. Confirm your business details to create them.
          </p>
          <Link
            href={`/brands/${brandId}`}
            style={{
              height: 36,
              padding: "0 14px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
            }}
          >
            Confirm details
          </Link>
        </div>
      </div>
    );
  }

  const engines = view.lastAudit?.engines.length ? view.lastAudit.engines : view.limits.engines;
  const everyday = view.questions.filter((q) => q.kind === "everyday");
  const branded = view.questions.filter((q) => q.kind === "branded");
  const auditId = view.lastAudit?.id ?? null;
  const auditNumber = view.lastAudit?.number ?? null;
  const n = everyday.length;
  // P02.legend: only when a row shows EngineDots (a question with a last result).
  const showsDots = view.questions.some((q) => q.lastResult !== null);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div
        data-testid="p02-header"
        className="flex flex-col min-[641px]:flex-row min-[641px]:items-start min-[641px]:justify-between"
        style={{ gap: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          {title}
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {headerLine(view)}
          </p>
        </div>
        <div className="flex flex-col min-[641px]:flex-row" style={{ gap: 8 }}>
          {view.history.length > 0 && (
            <button
              ref={historyButton}
              type="button"
              onClick={() => setHistory(true)}
              data-testid="p02-header-history"
              className="w-full min-[641px]:w-auto h-11 min-[641px]:h-9"
              style={{
                padding: "0 14px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              History
            </button>
          )}
          {view.limits.editable && !editing && (
            <button
              type="button"
              onClick={() => {
                setApplied(null);
                setRestored(null);
                setEditing(true);
                setEditUrl(true);
              }}
              data-testid="p02-header-edit"
              className="w-full min-[641px]:w-auto h-11 min-[641px]:h-9"
              style={{
                padding: "0 14px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent-primary)",
                border: "1px solid var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                cursor: "pointer",
              }}
            >
              Edit questions
            </button>
          )}
        </div>
      </div>

      {applied !== null && (
        <p
          role="status"
          data-testid="p02-applied"
          style={{ margin: 0, fontSize: 13, color: "var(--success)" }}
        >
          Questions applied. The next audit will use version {applied}.
        </p>
      )}
      {applied !== null && notArchived > 0 && (
        <p
          role="alert"
          data-testid="p02-not-archived"
          style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}
        >
          {notArchived === 1
            ? "1 removed question couldn't be archived; it stays in the library."
            : `${notArchived} removed questions couldn't be archived; they stay in the library.`}
        </p>
      )}

      {!view.limits.canEdit && (
        <Banner tone="neutral" testId="p02-view-only">
          View only. Owners, admins and analysts can change questions.
        </Banner>
      )}

      <Banner tone="neutral" testId="p02-intro">
        <span>
          Every audit asks these questions on {engineList(engines)}. Only everyday questions count
          toward your score.{" "}
          <Link
            href="/methodology#how-we-gather-answers"
            style={{
              color: "var(--accent-blue)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            How questions are chosen
          </Link>
        </span>
      </Banner>

      {showsDots && (
        <p
          data-testid="p02-legend"
          className="text-[12.5px] leading-[17px]"
          style={{ margin: "-8px 0 0", color: "var(--text-tertiary)" }}
        >
          {legendLine(engines)}
        </p>
      )}

      {editing && (
        <QuestionEditor
          brandId={brandId}
          view={view}
          restored={restored}
          onClose={() => {
            setEditing(false);
            setEditUrl(false);
          }}
          onApplied={(version, failed) => {
            setEditing(false);
            setEditUrl(false);
            setApplied(version);
            setNotArchived(failed);
            loaded.retry();
          }}
          onReload={() => {
            setRestored(null);
            loaded.retry();
          }}
        />
      )}

      {!editing && everyday.length > 0 && (
        <Section
          id={`${brandId}-everyday`}
          testId="p02-section-local"
          title="Everyday questions"
          count={`${n} ${n === 1 ? "question" : "questions"}${n < 5 ? " · small sample" : ""}`}
          right={lastAuditLine(everyday, auditNumber)}
          questions={everyday}
          engines={engines}
          auditId={auditId}
          agencyName={view.agencyName ?? "your agency"}
        />
      )}

      {!editing && branded.length > 0 && (
        <Section
          id={`${brandId}-branded`}
          testId="p02-section-branded"
          title="Names your business"
          count={`${branded.length} ${branded.length === 1 ? "question" : "questions"} · not scored`}
          right="Shown in results, never counted"
          questions={branded}
          engines={engines}
          auditId={auditId}
          agencyName={view.agencyName ?? "your agency"}
        />
      )}

      {!editing && view.limits.suggestionsShown && view.suggestions.length > 0 && (
        <section
          aria-labelledby={`${brandId}-suggestions`}
          data-testid="p02-suggestions"
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          {/* The source line sits right of the title; at 640 and under, under it (prototype P02). */}
          <div
            className="flex flex-col min-[641px]:flex-row min-[641px]:items-baseline min-[641px]:justify-between"
            style={{ gap: 2 }}
          >
            <h2
              id={`${brandId}-suggestions`}
              style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
            >
              Suggestions
            </h2>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
              From your business type
            </p>
          </div>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
            {view.suggestions.map((s) => (
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
                  {s.serviceLabel && (
                    <div style={{ marginTop: 6 }}>
                      <Chip name="Service" value={s.serviceLabel} />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Edit questions to add"
                  aria-label={`Add: ${s.text} (edit questions to add)`}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 500,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-tertiary)",
                    cursor: "not-allowed",
                    opacity: 0.6,
                    alignSelf: "flex-start",
                  }}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history && <HistoryDrawer view={view} onClose={closeHistory} />}
    </div>
  );
}
