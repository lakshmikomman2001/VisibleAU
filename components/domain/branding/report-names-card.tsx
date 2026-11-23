"use client";

import { useId, useMemo, useState } from "react";
import {
  TIER_NAME_MAX,
  TIER_NAME_PROBLEM,
  tierNameProblems,
} from "@/lib/branding/report-tier-name-rules";
import { actionFailureMessage, fetchOrFail } from "@/lib/load/fetch-json";
import {
  DEFAULT_TIER_NAMES,
  REPORT_TIERS,
  type ReportTier,
  TIER_DESCRIPTIONS,
  type TierNames,
} from "@/lib/reports/report-tiers";

/**
 * S01 part 10 (contract P18; LLD 8.1.7 D-RT3): Report branding -> "Report names". Three names an agency sells its
 * report types under (shown on the cover, in the reports list, in the report contents panel and the client portal),
 * a live cover preview, Save / Reset, and a read-only table of what each report contains (appendix E's words) the
 * agency can describe to its clients. Report branding is Agency and up and owners and admins only: the page itself
 * shows the plan lock and the no-permission note before this card is reached. Saved feedback is inline (D-UI4).
 */
const LABELS: Record<ReportTier, { label: string; help: string }> = {
  basic: { label: "Basic report name", help: `Default: Basic · up to ${TIER_NAME_MAX} characters` },
  standard: { label: "Standard report name", help: "Default: Standard" },
  enhanced: { label: "Enhanced report name", help: "Default: Enhanced" },
};

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border-control)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  width: "100%",
};

export function ReportNamesCard({ initial }: { initial: TierNames }) {
  const baseId = useId();
  const [saved, setSaved] = useState<TierNames>(initial);
  const [names, setNames] = useState<TierNames>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problems = useMemo(() => new Set(tierNameProblems(names)), [names]);
  const changed = REPORT_TIERS.some((t) => names[t] !== saved[t]);

  async function save() {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetchOrFail("/api/report-branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportTierNames: names }),
      });
      if (!res.ok) {
        setError(await actionFailureMessage(res, "We couldn't save your report names. Try again."));
        return;
      }
      const trimmed: TierNames = {
        basic: names.basic.trim(),
        standard: names.standard.trim(),
        enhanced: names.enhanced.trim(),
      };
      setNames(trimmed);
      setSaved(trimmed);
      setStatus("Report names saved.");
    } catch {
      setError("We couldn't save your report names. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        data-testid="p18-card"
        aria-labelledby={`${baseId}-title`}
        className="rounded-xl"
        style={{
          marginTop: 24,
          padding: 24,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2
          id={`${baseId}-title`}
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Report names
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
          Shown on the report cover, in your reports list and in the client portal. Use the names
          you sell under.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 min-[641px]:grid-cols-3">
          {REPORT_TIERS.map((t) => {
            const id = `${baseId}-${t}`;
            const bad = problems.has(t);
            return (
              <div key={t} data-testid={`p18-${t}`}>
                <label
                  htmlFor={id}
                  className="block text-[12px] font-medium"
                  style={{ color: "var(--text-secondary)", marginBottom: 4 }}
                >
                  {LABELS[t].label}
                </label>
                <input
                  id={id}
                  value={names[t]}
                  maxLength={TIER_NAME_MAX + 8}
                  aria-invalid={bad || undefined}
                  aria-describedby={`${id}-help${bad ? ` ${id}-error` : ""}`}
                  onChange={(e) => {
                    setNames({ ...names, [t]: e.target.value });
                    setStatus(null);
                  }}
                  style={inputStyle}
                />
                <p
                  id={`${id}-help`}
                  className="text-[12px]"
                  style={{ color: "var(--text-tertiary)", margin: "4px 0 0" }}
                >
                  {LABELS[t].help}
                </p>
                {bad && (
                  <p
                    id={`${id}-error`}
                    className="text-[12px]"
                    style={{ color: "var(--danger)", margin: "4px 0 0" }}
                  >
                    {TIER_NAME_PROBLEM}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p
          data-testid="p18-preview"
          aria-live="polite"
          className="mt-4 rounded-lg text-[12px]"
          style={{
            padding: "12px 14px",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          Cover preview:{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: ".14em" }}>
            {(names.enhanced.trim() || DEFAULT_TIER_NAMES.enhanced).toUpperCase()}
          </span>{" "}
          · Your clients see these names, not Basic, Standard or Enhanced, unless you keep them.
        </p>
        <div
          data-testid="p18-actions"
          className="mt-4 flex flex-col gap-2 min-[641px]:flex-row min-[641px]:items-center"
        >
          <button
            type="button"
            onClick={save}
            disabled={busy || !changed || problems.size > 0}
            className="h-9 rounded-md px-4 text-[13px] font-medium"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              opacity: busy || !changed || problems.size > 0 ? 0.6 : 1,
            }}
          >
            Save names
          </button>
          <button
            type="button"
            onClick={() => {
              setNames({ ...DEFAULT_TIER_NAMES });
              setStatus(null);
            }}
            className="h-9 rounded-md px-4 text-[13px]"
            style={{ color: "var(--text-primary)" }}
          >
            Reset to defaults
          </button>
          {status && (
            <p role="status" className="text-[12px]" style={{ color: "var(--success)", margin: 0 }}>
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12px]" style={{ color: "var(--danger)", margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      </section>

      <section
        data-testid="p18-contents"
        aria-labelledby={`${baseId}-contents`}
        className="rounded-xl"
        style={{
          marginTop: 16,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflowX: "auto",
        }}
      >
        <h2
          id={`${baseId}-contents`}
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)", padding: "20px 24px 8px" }}
        >
          What each report contains
        </h2>
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--text-tertiary)", textAlign: "left" }}>
              <th className="font-medium" style={{ padding: "8px 24px", width: 180 }}>
                Report
              </th>
              <th className="font-medium" style={{ padding: "8px 24px" }}>
                Contains
              </th>
            </tr>
          </thead>
          <tbody>
            {REPORT_TIERS.map((t) => (
              <tr key={t} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "10px 24px", color: "var(--text-primary)", fontWeight: 500 }}>
                  {saved[t]}
                </td>
                <td style={{ padding: "10px 24px", color: "var(--text-secondary)" }}>
                  {TIER_DESCRIPTIONS[t]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
