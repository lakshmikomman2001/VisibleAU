"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Banner } from "@/components/shared/banner";
import { Pill } from "@/components/shared/pill";
import { formatCheckDate } from "@/lib/format/date";
import { useJson } from "@/lib/hooks/use-load";
import type { QuestionDefaults, QuestionSettingsView } from "@/lib/questions/settings";

/**
 * S03 part 5 (LLD 8.3.4; contract P05): the workspace's Questions settings. Defaults for new brands (everyday count
 * within the plan, filling empty slots with suggestions, Local always on) save 500 ms after a change with an inline
 * status (D-UI4) and never touch an existing brand. The brands table comes from one request (one query); "Copy
 * questions from another brand" copies one brand's everyday questions into another's library as suggestions. On a plan
 * that doesn't write questions (Starter) the controls are off with the Growth marker, and the table is read-only.
 */

const PAGE_SIZE = 50;
const SEARCH_FROM = 10;

const card: React.CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  background: "var(--bg-elevated)",
};
const button = (primary: boolean, disabled = false): React.CSSProperties => ({
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  background: primary ? "var(--accent-primary)" : "var(--bg-elevated)",
  color: primary ? "var(--accent-primary-fg)" : "var(--text-primary)",
  border: primary ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
});
const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};
const help: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12.5,
  color: "var(--text-tertiary)",
};

function GrowthMarker() {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}
      data-testid="p05-lock"
    >
      <span aria-hidden="true">🔒</span>
      Growth
      <span className="sr-only"> plan and up</span>
    </span>
  );
}

function Defaults({ view }: { view: QuestionSettingsView }) {
  const [values, setValues] = useState<QuestionDefaults>(view.defaults);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const countId = useId();
  const locked = !view.canWrite;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/settings/questions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          setError(body.message ?? "We couldn't save that. Try again.");
          setStatus("error");
          return;
        }
        setError(null);
        setStatus("saved");
      } catch {
        setError("We couldn't save that. Try again.");
        setStatus("error");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [values]);

  const step = (by: number) =>
    setValues((v) => ({
      ...v,
      everydayCount: Math.min(view.included, Math.max(5, v.everydayCount + by)),
    }));

  return (
    <section
      style={{ ...card, padding: 20 }}
      data-testid="p05-defaults"
      aria-labelledby="p05-defaults-title"
    >
      <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 16 }}>
        <h2
          id="p05-defaults-title"
          style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
        >
          Defaults for new brands
        </h2>
        <span
          role="status"
          style={{
            fontSize: 12.5,
            color: status === "error" ? "var(--danger)" : "var(--text-tertiary)",
          }}
          data-testid="p05-saved"
        >
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : status === "error"
                ? error
                : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 min-[901px]:grid-cols-3" style={{ gap: 16 }}>
        <div data-testid="p05-defaults-count">
          <span id={countId} style={label}>
            Everyday questions per brand {locked ? <GrowthMarker /> : null}
          </span>
          <div className="inline-flex items-center" style={{ gap: 8 }}>
            <button
              type="button"
              aria-label="Fewer everyday questions"
              disabled={locked || values.everydayCount <= 5}
              onClick={() => step(-1)}
              style={{
                ...button(false, locked || values.everydayCount <= 5),
                width: 36,
                padding: 0,
              }}
            >
              −
            </button>
            <span
              role="spinbutton"
              tabIndex={locked ? -1 : 0}
              aria-labelledby={countId}
              aria-valuemin={5}
              aria-valuemax={view.included}
              aria-valuenow={values.everydayCount}
              aria-disabled={locked}
              onKeyDown={(e) => {
                if (locked) return;
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  step(1);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  step(-1);
                }
              }}
              style={{
                minWidth: 32,
                textAlign: "center",
                fontSize: 15,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-primary)",
              }}
            >
              {values.everydayCount}
            </span>
            <button
              type="button"
              aria-label="More everyday questions"
              disabled={locked || values.everydayCount >= view.included}
              onClick={() => step(1)}
              style={{
                ...button(false, locked || values.everydayCount >= view.included),
                width: 36,
                padding: 0,
              }}
            >
              +
            </button>
          </div>
          <p style={help}>
            {view.planName} includes {view.included} per brand, plus packs
          </p>
        </div>
        <div data-testid="p05-defaults-fill">
          <span style={label}>
            Fill empty slots with AI suggestions {locked ? <GrowthMarker /> : null}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={values.fillWithSuggestions}
            aria-label="Fill empty slots with AI suggestions"
            disabled={locked}
            onClick={() =>
              setValues((v) => ({ ...v, fillWithSuggestions: !v.fillWithSuggestions }))
            }
            style={{
              width: 44,
              height: 24,
              borderRadius: 999,
              border: "none",
              position: "relative",
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.5 : 1,
              // D-UI1: the off track is a control boundary (--border-control), as every switch.
              background: values.fillWithSuggestions
                ? "var(--accent-blue)"
                : "var(--border-control)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 2,
                left: values.fillWithSuggestions ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: 999,
                background: "var(--switch-thumb)",
                transition: "left 150ms",
              }}
            />
          </button>
        </div>
        <div data-testid="p05-defaults-reach">
          <span style={label}>Default areas</span>
          <span
            style={{
              display: "inline-block",
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--accent-muted)",
              color: "var(--text-primary)",
            }}
          >
            Local · always on
          </span>
          <p style={help}>Add more areas per brand</p>
        </div>
      </div>
    </section>
  );
}

function CopyModal({
  view,
  onClose,
  onCopied,
}: {
  view: QuestionSettingsView;
  onClose: () => void;
  onCopied: (message: string) => void;
}) {
  const titleId = useId();
  const [source, setSource] = useState(view.brands[0]?.id ?? "");
  const [target, setTarget] = useState(view.brands[1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const same = source === target;
  async function copy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${target}/questions/copy-from`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBrandId: source }),
      });
      const body = (await res.json().catch(() => ({}))) as { added?: number; message?: string };
      if (!res.ok || typeof body.added !== "number") {
        setError(body.message ?? "We couldn't copy those questions. Try again.");
        setBusy(false);
        return;
      }
      const name = view.brands.find((b) => b.id === target)?.name ?? "the brand";
      onCopied(
        `Copied ${body.added} questions to ${name} as suggestions. Review them in its Questions tab.`,
      );
    } catch {
      setError("We couldn't copy those questions. Try again.");
      setBusy(false);
    }
  }
  const select: React.CSSProperties = {
    width: "100%",
    height: 36,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 13,
    background: "var(--bg-base)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-control, var(--border-default))",
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="p05-copy"
        className="w-full min-[641px]:w-[560px]"
        style={{
          padding: 24,
          borderRadius: 14,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: "0 0 16px",
            fontSize: 17,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Copy questions from another brand
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            <span style={label}>Source brand</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={select}>
              {view.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={label}>Target brand</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={select}>
              {view.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <p style={{ ...help, margin: 0 }}>
            The source brand's everyday questions go into the target brand's suggestions, with its
            places swapped in. Nothing changes until someone applies them.
          </p>
        </div>
        {error || same ? (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--danger)" }}>
            {error ?? "Choose two different brands."}
          </p>
        ) : null}
        <div
          className="flex flex-col-reverse min-[641px]:flex-row min-[641px]:justify-end"
          style={{ gap: 8, marginTop: 20 }}
        >
          <button ref={cancel} type="button" onClick={onClose} style={button(false)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || same}
            onClick={copy}
            style={button(true, busy || same)}
          >
            {busy ? "Copying…" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandsTable({ view, onCopy }: { view: QuestionSettingsView; onCopy: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () => view.brands.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())),
    [view.brands, query],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 13,
    color: "var(--text-primary)",
    borderTop: "1px solid var(--border-default)",
    whiteSpace: "nowrap",
  };
  const copyLocked = !view.canWrite || view.brands.length < 2;
  return (
    <section
      style={{ ...card, overflow: "hidden" }}
      data-testid="p05-brands"
      aria-labelledby="p05-brands-title"
    >
      <div
        className="flex flex-col min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between"
        style={{
          gap: 8,
          padding: "12px 16px",
          background: "var(--bg-subtle)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <h2
          id="p05-brands-title"
          style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
        >
          Brands
        </h2>
        <div className="flex items-center" style={{ gap: 8 }}>
          {!view.canWrite ? <GrowthMarker /> : null}
          <button
            type="button"
            onClick={onCopy}
            disabled={copyLocked}
            data-testid="p05-copy-open"
            style={{ ...button(false, copyLocked), height: 32, fontSize: 12.5 }}
          >
            Copy questions from another brand
          </button>
        </div>
      </div>
      {view.brands.length === 0 ? (
        <div
          style={{ padding: 20, display: "grid", gap: 12, justifyItems: "start" }}
          data-testid="p05-empty"
        >
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-primary)" }}>
            No brands yet. Add a brand to set its questions.
          </p>
          <Link
            href="/brands/wizard"
            style={{ ...button(true), display: "inline-flex", alignItems: "center" }}
          >
            Add brand
          </Link>
        </div>
      ) : (
        <>
          {view.brands.length > SEARCH_FROM ? (
            <div style={{ padding: "12px 16px" }}>
              <label>
                <span className="sr-only">Search brands</span>
                <input
                  type="search"
                  placeholder="Search brands"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 6,
                    fontSize: 13,
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-control, var(--border-default))",
                  }}
                />
              </label>
            </div>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table
              data-testid="p05-brands-table"
              style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}
            >
              <thead>
                <tr>
                  {[
                    "Brand",
                    "Areas",
                    "Everyday",
                    "Written by you",
                    "Version",
                    "Last change",
                    "Edit questions",
                  ].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        ...th,
                        ...(i === 0
                          ? { position: "sticky", left: 0, background: "var(--bg-elevated)" }
                          : {}),
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id} data-testid="p05-brand-row">
                    <th
                      scope="row"
                      style={{
                        ...td,
                        fontWeight: 500,
                        textAlign: "left",
                        position: "sticky",
                        left: 0,
                        background: "var(--bg-elevated)",
                      }}
                    >
                      {b.name}
                    </th>
                    <td style={td}>{b.areas.join(", ")}</td>
                    <td style={td}>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {b.everydayActive} / {b.everydayAllowed}
                      </span>
                      {b.packs > 0 ? (
                        <span style={{ marginLeft: 6 }}>
                          <Pill tone="neutral">{`+${b.packs} ${b.packs === 1 ? "pack" : "packs"}`}</Pill>
                        </span>
                      ) : null}
                    </td>
                    <td style={td}>{b.writtenByAgency}</td>
                    <td style={td}>{b.version ?? "—"}</td>
                    <td style={td}>
                      {b.lastChange
                        ? b.lastChange.backfill
                          ? "backfill"
                          : `${formatCheckDate(b.lastChange.at)}${b.lastChange.by ? ` · ${b.lastChange.by}` : ""}`
                        : "—"}
                    </td>
                    <td style={td}>
                      <Link
                        href={`/brands/${b.id}/questions?edit=1`}
                        aria-label={`Edit questions for ${b.name}`}
                        style={{
                          color: "var(--accent-blue)",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        Edit questions
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div
              className="flex items-center justify-end"
              style={{ gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border-default)" }}
            >
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                style={button(false, page === 0)}
              >
                Previous
              </button>
              <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                Page {page + 1} of {pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pages - 1}
                style={button(false, page >= pages - 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function QuestionSettings() {
  const loaded = useJson<QuestionSettingsView>("/api/settings/questions");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const header = (
    <div data-testid="p05-header">
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
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
        Choose how many questions each brand is audited on, and write your own. Questions always
        belong to one brand.
      </p>
    </div>
  );

  if (loaded.status === "loading") {
    return (
      <div style={{ display: "grid", gap: 20 }} aria-busy="true" data-testid="p05-loading">
        {header}
        <div
          className="animate-pulse"
          style={{ ...card, height: 132, background: "var(--bg-subtle)" }}
        />
        <div
          className="animate-pulse"
          style={{ ...card, height: 260, background: "var(--bg-subtle)" }}
        />
        <span className="sr-only">Loading question settings</span>
      </div>
    );
  }
  if (loaded.status === "error") {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        {header}
        <Banner
          tone="warn"
          role="alert"
          testId="p05-error"
          actions={
            <button type="button" onClick={loaded.retry} style={button(false)}>
              Retry
            </button>
          }
        >
          We couldn't load question settings. Try again.
        </Banner>
      </div>
    );
  }
  const view = loaded.data;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {header}
      <Defaults view={view} />
      {copied ? (
        <p
          role="status"
          data-testid="p05-copied"
          style={{ margin: 0, fontSize: 13, color: "var(--success)" }}
        >
          {copied}
        </p>
      ) : null}
      <BrandsTable
        view={view}
        onCopy={() => {
          setCopied(null);
          setCopying(true);
        }}
      />
      {copying ? (
        <CopyModal
          view={view}
          onClose={() => setCopying(false)}
          onCopied={(message) => {
            setCopying(false);
            setCopied(message);
            loaded.retry();
          }}
        />
      ) : null}
    </div>
  );
}
