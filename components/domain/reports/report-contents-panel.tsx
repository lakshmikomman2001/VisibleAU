"use client";

import { ArrowDown, ArrowUp, Lock, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { actionFailureMessage, fetchOrFail } from "@/lib/load/fetch-json";
import type { AgencyActionRow, WhatToDoNext } from "@/lib/reports/report-contents";

/**
 * S01 part 5 (LLD 8.1.3, contract P08): the report contents panel, opened from "Generate report" on a brand's
 * Reports page while report_v2 is on. Left: what to do next (measured actions with include, order and a note for the
 * client), the agency's own actions, the two sections. Right: the report outline and the buttons. Agency and up
 * curate; Growth sees it read-only with the Agency lock and can still generate (D1). Saved feedback is inline
 * (role="status", D-UI4). The report type picker (P08.tier) comes with the tiers (S01 part 8).
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type MeasuredRow = WhatToDoNext["measured"][number];

export interface ReportContentsPanelProps {
  brandId: string;
  brandName: string;
  basisAuditNumber: number | null;
  periodLabel: string;
  agencyName: string;
  curated: boolean;
  whatToDoNext: WhatToDoNext | null;
  onClose: () => void;
  /** After Generate was accepted: the page starts waiting for the new report. */
  onGenerated: () => void;
}

function weekOf(periodLabel: string): string {
  const m = /W(\d{1,2})$/.exec(periodLabel);
  return m ? `Week ${Number(m[1])}` : periodLabel;
}

const SAVE_FAILED = "We couldn't save your choices. Try again.";

const PRIORITY_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  strength: "Strength",
};

function pillStyle(priority: string): React.CSSProperties {
  const tone =
    priority === "high"
      ? "var(--danger)"
      : priority === "strength"
        ? "var(--success)"
        : "var(--warning)";
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 9999,
    background: `color-mix(in srgb, ${tone} 12%, transparent)`,
    color: tone,
    flexShrink: 0,
  };
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  width: "100%",
};

function LockMarker() {
  return (
    <span
      data-testid="p08-lock"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--text-tertiary)",
      }}
    >
      <Lock aria-hidden style={{ width: 12, height: 12 }} />
      Agency · Available on Agency and up ·{" "}
      <Link href="/pricing" style={{ color: "var(--accent-blue)" }}>
        Upgrade
      </Link>
    </span>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      onClick={() => !disabled && onChange(!checked)}
      className="focus-visible:outline focus-visible:outline-2"
      style={{
        width: 36,
        height: 20,
        borderRadius: 9999,
        position: "relative",
        flexShrink: 0,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        background: checked ? "var(--accent-blue)" : "var(--border-control)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: "var(--switch-thumb)",
          transition: "left 160ms ease-out",
        }}
      />
    </button>
  );
}

export function ReportContentsPanel(props: ReportContentsPanelProps) {
  const { brandId, brandName, curated, agencyName, whatToDoNext } = props;
  // Reports are Growth and up: a plan refusal (the plan changed while the panel was open) says so as the page does.
  const { planRefused } = useBrandFeatureGate("reports");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  const [measured, setMeasured] = useState<MeasuredRow[]>(whatToDoNext?.measured ?? []);
  const [agency, setAgency] = useState<AgencyActionRow[]>(whatToDoNext?.agencyActions ?? []);
  const [generalAdvice, setGeneralAdvice] = useState(whatToDoNext?.includeGeneralAdvice ?? true);
  const [doneSince, setDoneSince] = useState(whatToDoNext?.includeDoneSinceLast ?? true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [form, setForm] = useState<{
    id: string | null;
    title: string;
    detail: string;
    priority: "high" | "medium" | "low";
  } | null>(null);
  const doneCount = whatToDoNext?.doneSinceLast.length ?? 0;
  const adviceCount = whatToDoNext?.generalAdvice.length ?? 0;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKeyDown(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, []);

  const includedCount = measured.filter((m) => m.included).length + (curated ? agency.length : 0);

  const contents = useMemo(
    () => ({
      includeGeneralAdvice: generalAdvice,
      includeDoneSinceLast: doneSince,
      choices: measured.flatMap((m, i) =>
        m.actionItemId
          ? [{ actionItemId: m.actionItemId, included: m.included, position: i, note: m.note }]
          : [],
      ),
    }),
    [measured, generalAdvice, doneSince],
  );

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= measured.length) return;
    const row = measured[index];
    const without = measured.filter((_, k) => k !== index);
    const next = [...without.slice(0, to), row, ...without.slice(to)];
    setMeasured(next);
    setAnnounce(`${row.title}: position ${to + 1} of ${next.length}`);
  };

  const update = (key: string, change: Partial<MeasuredRow>) =>
    setMeasured((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  /** One request; any failure (no answer, or not 2xx) is said inline, in the server's words when it gave some. */
  async function send(url: string, init: RequestInit, fallback: string): Promise<Response | null> {
    try {
      const res = await fetchOrFail(url, init);
      if (res.ok) return res;
      // A plan refusal is said in the server's words ("This is part of the Growth plan").
      if (await planRefused(res)) {
        setError(await actionFailureMessage(res, fallback));
        return null;
      }
      setError(await actionFailureMessage(res, fallback));
      return null;
    } catch {
      setError(fallback);
      return null;
    }
  }

  async function save(): Promise<boolean> {
    setError(null);
    setStatus(null);
    const res = await send(
      `/api/brands/${brandId}/report-preferences`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(curated ? contents : {}),
      },
      SAVE_FAILED,
    );
    return res !== null;
  }

  async function saveOnly() {
    setBusy(true);
    try {
      if (await save()) setStatus("Report contents saved.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await send(
        `/api/brands/${brandId}/reports/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodType: "weekly", ...(curated ? { contents } : {}) }),
        },
        "The report couldn't be started.",
      );
      if (!res) return;
      props.onGenerated();
      props.onClose();
    } finally {
      setBusy(false);
    }
  }

  async function submitAgencyAction() {
    if (!form) return;
    setError(null);
    const body = {
      ...(form.id ? { id: form.id } : {}),
      title: form.title,
      detail: form.detail,
      priority: form.priority,
    };
    const res = await send(
      `/api/brands/${brandId}/agency-actions`,
      {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      SAVE_FAILED,
    );
    if (!res) return;
    const { action } = (await res.json()) as { action: AgencyActionRow };
    setAgency((list) =>
      form.id ? list.map((a) => (a.id === action.id ? action : a)) : [...list, action],
    );
    setForm(null);
  }

  async function archiveAgencyAction(id: string) {
    setError(null);
    const res = await send(
      `/api/brands/${brandId}/agency-actions?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
      SAVE_FAILED,
    );
    if (!res) return;
    setAgency((list) => list.filter((a) => a.id !== id));
    setForm(null);
  }

  const outline = [
    "Cover",
    "Summary",
    "Engine by engine",
    "Google Search AI",
    "Where AI looks",
    "Competitors",
    `Why, and what to do next · ${includedCount} actions`,
    "Over time",
    "Method and notes",
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      style={{ background: "var(--overlay-scrim)" }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="p08-panel"
        className="flex h-full w-full flex-col overflow-hidden sm:h-auto sm:max-h-[90vh] sm:rounded-xl min-[901px]:flex-row"
        style={{
          maxWidth: 1100,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: 24, borderRight: "1px solid var(--border-default)" }}
        >
          <div data-testid="p08-header" className="flex items-start justify-between gap-3">
            <div>
              <h2
                id={titleId}
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Report contents
              </h2>
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {brandName}
                {props.basisAuditNumber !== null
                  ? ` · based on audit #${props.basisAuditNumber}`
                  : ""}{" "}
                · {weekOf(props.periodLabel)}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={props.onClose}
              className="rounded-md p-1 focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--text-secondary)" }}
            >
              <X aria-hidden style={{ width: 16, height: 16 }} />
            </button>
          </div>
          {!curated && (
            <div className="mt-3">
              <LockMarker />
            </div>
          )}

          <section data-testid="p08-measured" aria-labelledby={`${titleId}-measured`}>
            <h3
              id={`${titleId}-measured`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                margin: "18px 0 8px",
              }}
            >
              What to do next · measured
            </h3>
            {measured.length === 0 ? (
              <p
                className="text-[13px]"
                data-testid="p08-empty"
                style={{ color: "var(--text-secondary)" }}
              >
                No measured actions for this audit. You can still add your own.
              </p>
            ) : (
              <ol
                className="flex flex-col gap-2"
                style={{ listStyle: "none", padding: 0, margin: 0 }}
              >
                {measured.map((m, i) => (
                  <li
                    key={m.key}
                    data-testid="p08-measured-item"
                    className="grid items-start gap-2"
                    style={{
                      gridTemplateColumns: "20px 44px 1fr auto",
                      padding: "10px 12px",
                      border: "1px solid var(--border-default)",
                      borderRadius: 8,
                    }}
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Move up: ${m.title}`}
                        disabled={!curated || i === 0}
                        onClick={() => move(i, -1)}
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <ArrowUp aria-hidden style={{ width: 14, height: 14 }} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move down: ${m.title}`}
                        disabled={!curated || i === measured.length - 1}
                        onClick={() => move(i, 1)}
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <ArrowDown aria-hidden style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                    <Switch
                      checked={m.included}
                      onChange={(v) => update(m.key, { included: v })}
                      label={`Include: ${m.title}`}
                      disabled={!curated || !m.actionItemId}
                    />
                    <div style={{ opacity: m.included ? 1 : 0.6, minWidth: 0 }}>
                      <div
                        className="text-[13px] font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {m.title}
                      </div>
                      <div
                        data-testid="p08-evidence"
                        className="text-[12px]"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-secondary)",
                          marginTop: 2,
                        }}
                      >
                        {m.evidence}
                      </div>
                      {curated && m.included && m.actionItemId && (
                        <input
                          aria-label={`Note for your client: ${m.title}`}
                          placeholder="Add a note for your client (optional)"
                          maxLength={400}
                          value={m.note ?? ""}
                          onChange={(e) => update(m.key, { note: e.target.value || null })}
                          style={{ ...inputStyle, marginTop: 8 }}
                        />
                      )}
                    </div>
                    <span style={pillStyle(m.priority)}>
                      {PRIORITY_LABEL[m.priority] ?? m.priority}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p aria-live="polite" className="sr-only">
              {announce}
            </p>
          </section>

          <section data-testid="p08-agency" style={{ marginTop: 18 }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                margin: "0 0 8px",
              }}
            >
              Recommended by {agencyName}
            </h3>
            {agency.map((a) => (
              <div
                key={a.id}
                data-testid="p08-agency-item"
                className="flex items-start gap-3"
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    background: "var(--agency-soft)",
                    color: "var(--agency)",
                    flexShrink: 0,
                  }}
                >
                  Your recommendation
                </span>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {a.title}
                  </div>
                  {a.detail && (
                    <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {a.detail}
                    </div>
                  )}
                </div>
                {curated && (
                  <button
                    type="button"
                    className="text-[12px] underline"
                    style={{ color: "var(--accent-blue)" }}
                    onClick={() =>
                      setForm({
                        id: a.id,
                        title: a.title,
                        detail: a.detail ?? "",
                        priority: a.priority,
                      })
                    }
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
            <p className="text-[12px]" style={{ color: "var(--text-tertiary)", margin: "0 0 8px" }}>
              Shown as &ldquo;Recommended by {agencyName}&rdquo;, never as measured.
            </p>
            {form && (
              <div
                data-testid="p08-agency-form"
                className="flex flex-col gap-2"
                style={{ marginBottom: 8 }}
              >
                <input
                  aria-label="Title"
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  style={inputStyle}
                />
                <textarea
                  aria-label="Details"
                  value={form.detail}
                  maxLength={600}
                  rows={3}
                  onChange={(e) => setForm({ ...form, detail: e.target.value })}
                  style={{ ...inputStyle, height: "auto", padding: "8px 10px" }}
                />
                <select
                  aria-label="Priority"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value as "high" | "medium" | "low" })
                  }
                  style={inputStyle}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitAgencyAction}
                    className="h-8 rounded-md px-3 text-[13px] font-medium"
                    style={{
                      background: "var(--accent-primary)",
                      color: "var(--accent-primary-fg)",
                    }}
                  >
                    Save
                  </button>
                  {form.id && (
                    <button
                      type="button"
                      onClick={() => archiveAgencyAction(form.id as string)}
                      className="h-8 rounded-md px-3 text-[13px]"
                      style={{
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="h-8 rounded-md px-3 text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              data-testid="p08-add-action"
              disabled={!curated}
              onClick={() => setForm({ id: null, title: "", detail: "", priority: "medium" })}
              className="h-8 rounded-md px-3 text-[13px] font-medium"
              style={{
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                opacity: curated ? 1 : 0.6,
              }}
            >
              + Add your own action
            </button>
          </section>

          <section data-testid="p08-sections" style={{ marginTop: 18 }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                margin: "0 0 8px",
              }}
            >
              Sections
            </h3>
            {doneCount > 0 && (
              <div className="flex items-center justify-between gap-3" style={{ padding: "6px 0" }}>
                <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                  Done since the last report ({doneCount} items)
                </span>
                <Switch
                  checked={doneSince}
                  onChange={setDoneSince}
                  label={`Done since the last report (${doneCount} items)`}
                  disabled={!curated}
                  testId="p08-done-since"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3" style={{ padding: "6px 0" }}>
              <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                General advice, not drawn from this audit
                {adviceCount > 0 ? ` (${adviceCount})` : ""}
              </span>
              <Switch
                checked={generalAdvice}
                onChange={setGeneralAdvice}
                label="General advice, not drawn from this audit"
                disabled={!curated}
                testId="p08-general-advice"
              />
            </div>
          </section>
        </div>

        <div
          className="flex flex-col min-[901px]:max-w-[320px]"
          style={{
            width: "100%",
            minWidth: 0,
            padding: 24,
            background: "var(--bg-subtle)",
          }}
        >
          <div data-testid="p08-outline">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Report outline
            </h3>
            <ol
              className="mt-2 text-[12px]"
              style={{ color: "var(--text-secondary)", paddingLeft: 18 }}
            >
              {outline.map((o) => (
                <li
                  key={o}
                  style={{
                    fontWeight: o.startsWith("Why, and what") ? 600 : 400,
                    color: o.startsWith("Why, and what") ? "var(--text-primary)" : undefined,
                  }}
                >
                  {o}
                </li>
              ))}
            </ol>
          </div>
          <div
            data-testid="p08-footer"
            className="mt-auto flex flex-col gap-2"
            style={{ paddingTop: 16 }}
          >
            <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              Your choices are saved for {brandName} and used next time. Generated reports never
              change afterwards.
            </p>
            {error && (
              <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            {status && (
              <p role="status" className="text-[12px]" style={{ color: "var(--success)" }}>
                {status}
              </p>
            )}
            <button
              type="button"
              data-testid="p08-generate"
              disabled={busy}
              onClick={generate}
              className="h-9 rounded-md px-4 text-[13px] font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
            >
              Generate report
            </button>
            <button
              type="button"
              data-testid="p08-save"
              disabled={busy}
              onClick={saveOnly}
              className="h-9 rounded-md px-4 text-[13px]"
              style={{ color: "var(--text-primary)" }}
            >
              Save without generating
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
