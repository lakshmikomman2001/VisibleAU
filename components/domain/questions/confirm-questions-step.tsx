"use client";

import { useEffect, useRef, useState } from "react";
import { AddQuestionDrawer, type Draft } from "@/components/domain/questions/question-editor";
import { QuestionRow } from "@/components/domain/questions/questions-tab";
import { Banner } from "@/components/shared/banner";
import type { ConfirmPreview, ShownQuestion } from "@/lib/questions/confirm-questions";
import type { QuestionView } from "@/lib/questions/questions-view";

/**
 * S03 part 7 (LLD 8.3.6, client request C4; contract P10 step 3 as S03 builds it): the Questions step of "Confirm your
 * business details" for a new brand. It lists the questions the first audit will ask, grouped by reach (Local only
 * until S04), in P02's rows; an everyday question can be swapped for a spare (every paid plan), and Growth and up add
 * their own through P03's drawer and checks. "Confirm and start the first audit" sends exactly the list shown.
 */

interface Item {
  key: string;
  text: string;
  kind: "everyday" | "branded";
  source: QuestionView["source"];
}

const button = (primary: boolean, disabled = false): React.CSSProperties => ({
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  background: primary ? "var(--accent-primary)" : "var(--bg-elevated)",
  color: primary ? "var(--accent-primary-fg)" : "var(--text-primary)",
  border: primary ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
});

const view = (item: Item, position: number): QuestionView => ({
  id: item.key,
  position,
  text: item.text,
  kind: item.kind,
  reach: "local",
  source: item.source,
  serviceLabel: null,
  intent: null,
  lastResult: null,
});

function SwapMenu({
  item,
  spares,
  onSwap,
}: {
  item: Item;
  spares: Item[];
  onSwap: (spare: Item) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Swap “${item.text}”`}
        onClick={() => setOpen((o) => !o)}
        style={{ ...button(false), height: 30, fontSize: 12.5 }}
      >
        Swap
      </button>
      {open ? (
        <div
          ref={panel}
          data-testid="p10-swap-menu"
          className="w-[min(360px,80vw)]"
          style={{
            position: "absolute",
            right: 0,
            top: 34,
            zIndex: 20,
            padding: 6,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-pop)",
            display: "grid",
            gap: 2,
          }}
        >
          <p style={{ margin: "4px 8px 6px", fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Swap for a suggestion
          </p>
          {spares.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setOpen(false);
                onSwap(s);
              }}
              className="hover:bg-[var(--bg-hover)]"
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                lineHeight: "18px",
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              {s.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A row's Swap and Remove; nothing when it has neither (Free, or a question the generator wrote that names the business). */
function RowActions({
  item,
  swappable,
  removable,
  spares,
  onSwap,
  onRemove,
}: {
  item: Item;
  swappable: boolean;
  removable: boolean;
  spares: Item[];
  onSwap: (to: Item) => void;
  onRemove: () => void;
}) {
  const swap = swappable && spares.length > 0;
  if (!swap && !removable) return null;
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      {swap ? <SwapMenu item={item} spares={spares} onSwap={onSwap} /> : null}
      {removable ? (
        <button
          type="button"
          aria-label={`Remove “${item.text}”`}
          onClick={onRemove}
          style={{ ...button(false), height: 30, fontSize: 12.5 }}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

export function ConfirmQuestionsStep({
  brandId,
  preview,
  saving,
  error,
  onBack,
  onConfirm,
}: {
  brandId: string;
  preview: ConfirmPreview;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: (shown: ShownQuestion[]) => void;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    preview.questions.map((q, i) => ({ ...q, key: `q:${i}` })),
  );
  const [spares, setSpares] = useState<Item[]>(() =>
    preview.spares.map((q, i) => ({ ...q, key: `s:${i}` })),
  );
  const [adding, setAdding] = useState(false);
  const typed = useRef(0);
  const { limits } = preview;
  const everyday = items.filter((i) => i.kind === "everyday").length;
  const full = everyday >= limits.everydayAllowed;

  const swap = (from: Item, to: Item) => {
    setItems((list) => list.map((i) => (i.key === from.key ? to : i)));
    setSpares((list) => [
      ...list.filter((s) => s.key !== to.key),
      ...(from.source === "agency" ? [] : [from]),
    ]);
  };
  // A removed question the step offered goes back to the spares; a typed one is gone. Never below the minimum.
  const remove = (item: Item) => {
    setItems((list) => list.filter((i) => i.key !== item.key));
    if (item.source !== "agency") setSpares((list) => [...list, item]);
  };
  const canRemove = everyday > limits.everydayMin;
  // S04 part 0b (LLD amendment 85; contract P10.step3): with nothing to swap in, no Swap buttons (RowActions) and one
  // line under the everyday list, on a plan that swaps. A removed question the step offered becomes a spare again.
  const noSpares = limits.canSwap && spares.length === 0;
  const draft: Draft = {
    baseVersion: 0,
    items: items.map((i) => ({
      key: i.key,
      text: i.text,
      kind: i.kind,
      source: i.source,
      reach: "local",
    })),
    archive: [],
  };

  const sections: Array<{ kind: Item["kind"]; title: string }> = [
    { kind: "everyday", title: "Everyday questions" },
    { kind: "branded", title: "Questions that name the business" },
  ];

  return (
    <div data-testid="p10-step3">
      <div
        className="flex flex-col min-[641px]:flex-row min-[641px]:items-baseline min-[641px]:justify-between"
        style={{ gap: 4, marginBottom: 12 }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          Questions
        </h3>
        <span data-testid="p10-count" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {everyday} of {limits.everydayAllowed} everyday
        </span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-secondary)" }}>
        The first audit asks exactly these. You can change them later in the brand's Questions tab.
      </p>
      <section
        aria-labelledby="p10-reach-local"
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          background: "var(--bg-elevated)",
        }}
      >
        <h4
          id="p10-reach-local"
          style={{
            margin: 0,
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          {preview.reachLabel}
        </h4>
        {sections.map(({ kind, title }) => {
          const rows = items.filter((i) => i.kind === kind);
          if (rows.length === 0) return null;
          return (
            <div key={kind}>
              <p
                style={{
                  margin: 0,
                  padding: "10px 16px 0",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-tertiary)",
                }}
              >
                {title}
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {rows.map((item) => (
                  <QuestionRow
                    key={item.key}
                    question={view(item, items.indexOf(item))}
                    engines={[]}
                    auditId={null}
                    agencyName={preview.agencyName}
                    action={
                      <RowActions
                        item={item}
                        swappable={
                          kind === "everyday" && limits.canSwap && item.source !== "agency"
                        }
                        removable={
                          item.source === "agency" ||
                          (kind === "everyday" && limits.canSwap && canRemove)
                        }
                        spares={spares}
                        onSwap={(to) => swap(item, to)}
                        onRemove={() => remove(item)}
                      />
                    }
                  />
                ))}
              </ul>
              {kind === "everyday" && noSpares ? (
                <p
                  data-testid="p10-no-spares"
                  style={{
                    margin: 0,
                    padding: "10px 16px",
                    fontSize: 12.5,
                    color: "var(--text-tertiary)",
                  }}
                >
                  No other questions to swap in for this business type yet.
                </p>
              ) : null}
            </div>
          );
        })}
      </section>
      {limits.canWriteQuestions ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={full}
            data-testid="p10-add"
            style={button(false, full)}
          >
            Add your own question
          </button>
          {full ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
              Your plan includes {limits.everydayAllowed} everyday questions per brand. Remove one,
              or add a question pack.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 16 }}>
          <Banner tone="bad" role="alert" testId="p10-error">
            {error}
          </Banner>
        </div>
      ) : null}
      <div
        className="flex flex-col-reverse min-[641px]:flex-row min-[641px]:justify-end"
        style={{ gap: 8, marginTop: 16 }}
      >
        <button type="button" onClick={onBack} disabled={saving} style={button(false, saving)}>
          Back
        </button>
        <button
          type="button"
          data-testid="p10-confirm"
          disabled={saving || everyday < limits.everydayMin}
          onClick={() =>
            onConfirm(
              items.map((i) => ({
                text: i.text,
                source: i.source === "ai_suggested" ? "template" : i.source,
              })),
            )
          }
          style={button(true, saving || everyday < limits.everydayMin)}
        >
          {saving ? "Starting…" : "Confirm and start the first audit"}
        </button>
      </div>
      {adding ? (
        <AddQuestionDrawer
          brandId={brandId}
          agencyName={preview.agencyName}
          draft={draft}
          maxBranded={limits.maxBranded}
          addLabel="Add question"
          onAdd={({ text, kind }) => {
            typed.current += 1;
            setItems((list) => {
              const next: Item = { key: `new:${typed.current}`, text, kind, source: "agency" };
              // A typed everyday question joins the everyday ones; a branded one goes last, as the rows show them.
              if (kind === "branded") return [...list, next];
              const lastEveryday = list.map((i) => i.kind).lastIndexOf("everyday");
              return [...list.slice(0, lastEveryday + 1), next, ...list.slice(lastEveryday + 1)];
            });
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
