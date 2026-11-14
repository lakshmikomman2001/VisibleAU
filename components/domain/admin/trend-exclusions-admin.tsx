"use client";

import Link from "next/link";
import { type CSSProperties, useState } from "react";
import { SaveFeedback, useSave } from "@/components/shared/save-feedback";
import type { TrendExclusionAdminView, TrendExclusionAudit } from "@/lib/admin/trend-exclusions";
import {
  EARLIER_MENTION_CHECK_REASON,
  normalizeTrendExclusionReason,
  TREND_EXCLUSION_REASON_MAX,
  trendExclusionLabel,
} from "@/lib/audit/trend-exclusion";
import { ADMIN_PAGE_TITLES } from "@/lib/navigation/breadcrumbs";

/**
 * 14 Nov, part 5 -- /admin/audits: the operator excludes an audit from trends and comparisons, with a reason,
 * or includes it again (POST /api/admin/audits; lib/admin/trend-exclusions.ts). Each row saves on its own and
 * says so ("Saving…", "Saved", or why not), and the page reloads what the server now has.
 */

const card: CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
};
const label: CSSProperties = { color: "var(--text-primary)" };
const muted: CSSProperties = { color: "var(--text-secondary)" };
const field: CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
};

const OTHER = "other";

function SydneyDate({ iso }: { iso: string | null }) {
  if (!iso) return <span>—</span>;
  const sydney = new Date(iso)
    .toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
  return (
    <time dateTime={iso} title={`${iso.slice(0, 16).replace("T", " ")} UTC`}>
      {sydney}
    </time>
  );
}

function ExclusionControl({ audit }: { audit: TrendExclusionAudit }) {
  const s = useSave("/api/admin/audits");
  const [choice, setChoice] = useState(EARLIER_MENTION_CHECK_REASON);
  const [typed, setTyped] = useState("");
  const reason = normalizeTrendExclusionReason(choice === OTHER ? typed : choice);

  if (audit.excludedFromTrendsReason) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={s.saving}
          className="px-3 py-1 rounded-md text-[13px]"
          style={field}
          onClick={() => s.save({ auditId: audit.id, reason: null })}
        >
          {s.saving ? "Saving…" : "Include again"}
        </button>
        {s.status !== "saving" ? <SaveFeedback status={s.status} error={s.error} /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`reason-${audit.id}`}>
        Reason for excluding audit #{audit.auditNumber}
      </label>
      <select
        id={`reason-${audit.id}`}
        value={choice}
        onChange={(e) => {
          setChoice(e.target.value);
          s.reset();
        }}
        className="px-2 py-1 rounded-md text-[13px] max-w-full"
        style={field}
      >
        <option value={EARLIER_MENTION_CHECK_REASON}>{EARLIER_MENTION_CHECK_REASON}</option>
        <option value={OTHER}>Another reason…</option>
      </select>
      {choice === OTHER ? (
        <>
          <label className="sr-only" htmlFor={`reason-text-${audit.id}`}>
            Another reason for excluding audit #{audit.auditNumber}
          </label>
          <input
            id={`reason-text-${audit.id}`}
            value={typed}
            maxLength={TREND_EXCLUSION_REASON_MAX}
            placeholder="e.g. measured before the brand's name was corrected"
            onChange={(e) => {
              setTyped(e.target.value);
              s.reset();
            }}
            className="px-2 py-1 rounded-md text-[13px] w-64 max-w-full"
            style={field}
          />
        </>
      ) : null}
      <button
        type="button"
        disabled={s.saving || reason === null}
        className="px-3 py-1 rounded-md text-[13px]"
        style={field}
        onClick={() => s.save({ auditId: audit.id, reason })}
      >
        {s.saving ? "Saving…" : "Exclude from trends"}
      </button>
      {s.status !== "saving" ? <SaveFeedback status={s.status} error={s.error} /> : null}
    </div>
  );
}

export function TrendExclusionsAdmin({ view }: { view: TrendExclusionAdminView }) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div
        style={{ maxWidth: 1080, margin: "0 auto", padding: "32px clamp(16px, 4vw, 32px)" }}
        className="space-y-4"
        data-admin-trend-exclusions=""
      >
        <div>
          <h1 className="text-xl font-semibold" style={label}>
            {ADMIN_PAGE_TITLES.audits}
          </h1>
          <p className="text-[13px] mt-1" style={muted}>
            An audit measured wrongly can be left out of every trend and comparison: the report
            PDF&apos;s trend, the dashboard&apos;s average, the brand&apos;s audit history chart,
            the Visibility page, drift alerts and &quot;vs previous audit&quot;. It stays in the
            audit lists and on its own page, labelled with the reason. Nothing is deleted, and it
            can be included again. Operators only; every change is listed below.{" "}
            <Link href="/admin/settings">Settings →</Link>
          </p>
        </div>

        <section className="p-5 rounded-xl" style={card} data-admin-trend-audits="">
          <h2 className="text-sm font-semibold mb-3" style={label}>
            Complete audits, newest first
          </h2>
          {view.audits.length === 0 ? (
            <p className="text-[13px]" style={muted}>
              No audit has completed yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="text-[13px] w-full" style={muted}>
                <thead>
                  <tr style={label}>
                    <th className="text-left pr-3 pb-2">Audit</th>
                    <th className="text-left pr-3 pb-2">Brand · workspace</th>
                    <th className="text-left pr-3 pb-2">Completed (Sydney time)</th>
                    <th className="text-left pr-3 pb-2">In trends</th>
                    <th className="text-left pb-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {view.audits.map((a) => (
                    <tr
                      key={a.id}
                      className="align-top"
                      style={{ borderTop: "1px solid var(--border-default)" }}
                      data-admin-trend-audit={a.auditNumber}
                    >
                      <td className="pr-3 py-2 whitespace-nowrap">
                        <Link href={`/audits/${a.id}`} style={label}>
                          #{a.auditNumber}
                        </Link>
                      </td>
                      <td className="pr-3 py-2">
                        <span style={label}>{a.brandName}</span> · {a.workspaceName}
                      </td>
                      <td className="pr-3 py-2 whitespace-nowrap">
                        <SydneyDate iso={a.completedAt} />
                      </td>
                      <td
                        className="pr-3 py-2"
                        data-excluded-from-trends={a.excludedFromTrendsReason ? "" : undefined}
                      >
                        {a.excludedFromTrendsReason
                          ? trendExclusionLabel(a.excludedFromTrendsReason)
                          : "Counted"}
                      </td>
                      <td className="py-2">
                        <ExclusionControl audit={a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="p-5 rounded-xl" style={card} data-admin-trend-history="">
          <h2 className="text-sm font-semibold mb-3" style={label}>
            Changes
          </h2>
          {view.changes.length === 0 ? (
            <p className="text-[13px]" style={muted}>
              No audit has been excluded yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="text-[12px] w-full" style={muted}>
                <thead>
                  <tr style={label}>
                    <th className="text-left pr-3 pb-1">When (Sydney time)</th>
                    <th className="text-left pr-3 pb-1">Audit</th>
                    <th className="text-left pr-3 pb-1">Brand · workspace</th>
                    <th className="text-left pr-3 pb-1">Change</th>
                    <th className="text-left pb-1">By</th>
                  </tr>
                </thead>
                <tbody>
                  {view.changes.map((c) => (
                    <tr key={`${c.at}-${c.auditNumber ?? "?"}`}>
                      <td className="pr-3 py-1 whitespace-nowrap">
                        <SydneyDate iso={c.at} />
                      </td>
                      <td className="pr-3 py-1">{c.auditNumber ? `#${c.auditNumber}` : "—"}</td>
                      <td className="pr-3 py-1">
                        {c.brand ?? "a deleted brand"} · {c.workspace ?? "a deleted workspace"}
                      </td>
                      <td className="pr-3 py-1">
                        {c.to ? `Excluded: ${c.to}` : `Included again (was: ${c.from ?? "—"})`}
                      </td>
                      <td className="py-1">{c.by ?? "unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
