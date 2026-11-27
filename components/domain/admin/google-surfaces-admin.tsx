"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, useState } from "react";
import { SaveFeedback, useSave } from "@/components/shared/save-feedback";
import { collapseNoChangeSaves, noChangeText } from "@/lib/admin/settings-history-view";
import type { GoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import {
  type CleanGoogleRun,
  splitProviderErrors,
} from "@/lib/audit/google-surfaces/provider-errors-view";
import type {
  GoogleSurface,
  GoogleSurfaceAdminView,
  GoogleSurfaceDecision,
} from "@/lib/governance/google-surfaces";
import { MAX_COST_CEILING_USD } from "@/lib/governance/google-surfaces-limits";
import { fetchOrFail, LoadFailure, readJson } from "@/lib/load/fetch-json";
import { ADMIN_PAGE_TITLES } from "@/lib/navigation/breadcrumbs";
import { tierDisplayName } from "@/lib/pricing/tiers";
import { LOW_BALANCE_USD, type TestConnectionResult } from "@/lib/serp/test-connection";

/**
 * Google AI surfaces, Phase 1, part 1 -- /admin/settings. Each control saves on its own (POST
 * /api/admin/settings), says so ("Saving…", "Saved", or why not: 12 Nov, part 5), and the page reloads
 * what the server now has. The env kill switch is shown but
 * can't be changed here: it's GOOGLE_AI_SURFACES_ENABLED in Vercel, and needs a redeploy.
 *
 * 19 Nov (Sri's review): the tick boxes and dropdowns save the moment they change, and "Count Google in the headline"
 * was ticked by accident (on for 2 minutes). It asks first now (COUNT_IN_HEADLINE_CONFIRM), every control says how it
 * saves, the Changes log folds runs of identical saves that changed nothing ("13 saves, no change"), and Provider
 * errors says when the last one was, from the data, with the ones before the last clean run folded away.
 */

/** What "Count Google in the headline" asks before it saves, either way. */
export const COUNT_IN_HEADLINE_CONFIRM =
  "This changes how every new audit's score is calculated, and those scores won't compare with earlier audits.";

/** Beside a control that saves the moment it changes (a typed value has its own Save instead). */
function SavesOnChange({ asksFirst = false }: { asksFirst?: boolean }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[11px]"
      style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
      data-admin-saves={asksFirst ? "asks-first" : "on-change"}
    >
      {asksFirst ? "Asks first, then saves" : "Saves when changed"}
    </span>
  );
}

const SURFACES: {
  surface: GoogleSurface;
  name: string;
  settingName: "aiOverviewsEnabled" | "aiModeEnabled";
}[] = [
  { surface: "google_ai_overviews", name: "AI Overviews", settingName: "aiOverviewsEnabled" },
  { surface: "google_ai_mode", name: "AI Mode", settingName: "aiModeEnabled" },
];

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

function OnOff({ on }: { on: boolean }) {
  return (
    <span
      className="px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{
        background: on ? "var(--success-soft)" : "var(--bg-active)",
        color: on ? "var(--success)" : "var(--text-secondary)",
      }}
    >
      {on ? "On" : "Off"}
    </span>
  );
}

function Decision({ title, decision }: { title: string; decision: GoogleSurfaceDecision }) {
  return (
    <p className="text-[12px]" style={muted}>
      {title}: <OnOff on={decision.on} /> {decision.reason}
    </p>
  );
}

function shown(value: unknown): string {
  if (value === null || value === undefined) return "none";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * 12 Nov, part 4: asks DataForSEO (its free account endpoint) whether it accepts the login, and the
 * balance. Once per 30 seconds; the server says so when it's too soon.
 */
function TestConnection() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestConnectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetchOrFail("/api/admin/settings/test-connection", { method: "POST" });
      setResult(await readJson<TestConnectionResult>(res));
    } catch (err) {
      setError(
        err instanceof LoadFailure && err.detail
          ? err.detail
          : "The connection test couldn't be run. Check your connection and try again.",
      );
    } finally {
      setRunning(false);
    }
  };
  const tone =
    result?.state === "accepted"
      ? "var(--success)"
      : result
        ? "var(--danger)"
        : "var(--text-secondary)";
  return (
    <div className="mt-3 flex flex-col gap-1" data-admin-test-connection="">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running}
          aria-busy={running}
          onClick={run}
          className="px-3 py-1 rounded-md text-[13px]"
          style={field}
        >
          {running ? "Testing…" : "Test connection"}
        </button>
        {result ? (
          <span
            className="text-[13px]"
            style={{ color: tone }}
            data-admin-test-result={result.state}
          >
            {result.line} · checked <SydneyTime iso={result.checkedAt} timeOnly /> Sydney time
          </span>
        ) : null}
      </div>
      {result?.lowBalance ? (
        <p
          role="alert"
          className="text-[13px]"
          style={{ color: "var(--warning)" }}
          data-admin-low-balance=""
        >
          The balance is below US${LOW_BALANCE_USD}. Top it up at DataForSEO before it runs out:
          when it does, Google checks stop with "out of credit".
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 13 Nov (part 13): times on this page read in Sydney (the operators are there, and the rest of the app
 * reads times there), with UTC on hover.
 */
function SydneyTime({ iso, timeOnly = false }: { iso: string; timeOnly?: boolean }) {
  const at = new Date(iso);
  const sydney = at
    .toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      ...(timeOnly ? {} : { day: "numeric", month: "short" }),
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

/**
 * 12 Nov, part 2: the provider's own code and message, for the operator only (customers see a plain
 * sentence; lib/audit/google-surfaces/reasons.ts). 13 Nov, part 13: one line per audit and answer -- "Audit
 * #44 · Yabby Services · AI Mode ×13, AI Overviews ×13 · 40100 login rejected · <message>" -- with each
 * question behind it, and how many are shown (it listed 10 identical rows, silently capped).
 */
/** One audit's identical failures: a line, with each question behind it. */
function ProviderErrorGroupRow({
  g,
}: {
  g: GoogleOperatorHealth["providerErrorGroups"]["groups"][number];
}) {
  return (
    <details className="text-[12px]" style={muted} data-admin-provider-error={g.code ?? "none"}>
      <summary style={{ cursor: "pointer", wordBreak: "break-word" }}>
        <SydneyTime iso={g.at} /> · Audit {g.auditNumber !== null ? `#${g.auditNumber}` : "—"}
        {g.brand ? ` · ${g.brand}` : ""}
        {g.workspace ? ` (${g.workspace})` : ""} ·{" "}
        {g.surfaces.map((x) => `${x.surface} ×${x.count}`).join(", ")} ·{" "}
        <span style={label}>
          {g.code !== null ? `${g.code} ` : ""}
          {g.category}
        </span>{" "}
        · {g.message ?? "—"}
      </summary>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table className="text-[12px] w-full">
          <thead>
            <tr style={label}>
              <th className="text-left pr-3 pb-1">When (Sydney time)</th>
              <th className="text-left pr-3 pb-1">Surface</th>
              <th className="text-left pb-1">Question</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.id}>
                <td className="pr-3 py-1 whitespace-nowrap">
                  <SydneyTime iso={r.at} />
                </td>
                <td className="pr-3 py-1 whitespace-nowrap">{r.surface}</td>
                <td className="py-1">{r.prompt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ProviderErrors({
  errors,
  lastCleanRun,
}: {
  errors: GoogleOperatorHealth["providerErrorGroups"];
  lastCleanRun: CleanGoogleRun | null;
}) {
  // 19 Nov: errors from before the last clean run are history, folded away; "No provider errors since ..." when no
  // error is newer (lib/audit/google-surfaces/provider-errors-view.ts).
  const { summary, recent, older } = splitProviderErrors(errors.groups, lastCleanRun);
  return (
    <section className="mb-6 p-5 rounded-xl" style={card} data-admin-provider-errors="">
      <h2 className="text-sm font-semibold mb-1" style={label}>
        Provider errors
      </h2>
      <p className="text-[12px] mb-3" style={muted}>
        The latest Google questions the provider failed, with its code and its own message.
        Customers are shown only a plain reason (for example "a problem on our side").
      </p>
      {summary ? (
        <p
          className="text-[13px] mb-2"
          style={{ color: "var(--success)" }}
          data-admin-provider-errors-summary=""
        >
          {summary}
        </p>
      ) : null}
      {errors.total > errors.groups.length && (
        <p className="text-[12px] mb-2" style={muted} data-admin-provider-errors-shown="">
          Showing the latest {errors.groups.length} of {errors.total}.
        </p>
      )}
      {errors.groups.length === 0 ? (
        <p className="text-[13px]" style={muted}>
          None recorded.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map((g) => (
            <ProviderErrorGroupRow key={g.key} g={g} />
          ))}
          {older.length > 0 ? (
            <details className="text-[12px]" style={muted} data-admin-provider-errors-older="">
              <summary style={{ cursor: "pointer" }}>
                {`${older.length} older ${older.length === 1 ? "error" : "errors"}, from before the last clean Google run`}
              </summary>
              <div className="flex flex-col gap-2 mt-2">
                {older.map((g) => (
                  <ProviderErrorGroupRow key={g.key} g={g} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * A checkbox that saves when it's ticked or unticked -- or, given `confirm`, says what the change does and saves
 * only once that's accepted (the box keeps the saved value until then).
 */
function SettingCheckbox({
  name,
  checked,
  confirm,
  children,
}: {
  name: "aiOverviewsEnabled" | "aiModeEnabled" | "countInHeadline";
  checked: boolean;
  confirm?: string;
  children: string;
}) {
  const s = useSave("/api/admin/settings");
  const [pending, setPending] = useState<boolean | null>(null);
  const change = (value: boolean) => {
    if (confirm) setPending(value);
    else void s.save({ kind: "setting", name, value });
  };
  return (
    <div className="flex flex-col gap-2" data-admin-setting={name}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px]" style={label}>
          <input
            type="checkbox"
            checked={checked}
            disabled={s.saving || pending !== null}
            onChange={(e) => change(e.target.checked)}
          />
          {children}
        </label>
        <SavesOnChange asksFirst={Boolean(confirm)} />
        <SaveFeedback status={s.status} error={s.error} />
      </div>
      {confirm && pending !== null ? (
        <div
          role="alertdialog"
          aria-labelledby={`confirm-${name}`}
          className="p-3 rounded-md flex flex-col gap-2"
          style={{ border: "1px solid var(--warning)", background: "var(--bg-base)" }}
          data-admin-confirm={name}
        >
          <p id={`confirm-${name}`} className="text-[13px]" style={{ color: "var(--warning)" }}>
            {confirm}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-md text-[13px]"
              style={field}
              onClick={() => {
                const value = pending;
                setPending(null);
                void s.save({ kind: "setting", name, value });
              }}
            >
              {pending ? "Yes, turn it on" : "Yes, turn it off"}
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-md text-[13px]"
              style={field}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A dropdown that saves when it's changed (to a value other than the one in force). */
function SavingSelect({
  title,
  value,
  options,
  change,
  dataKey,
}: {
  title: string;
  value: string;
  options: { value: string; label: string }[];
  change: (value: string) => Record<string, unknown>;
  dataKey: string;
}) {
  const s = useSave("/api/admin/settings");
  return (
    <div className="flex flex-wrap items-center gap-2" data-admin-select={dataKey}>
      <label className="flex flex-wrap items-center gap-2 text-[13px]" style={label}>
        {title}
        <select
          value={value}
          disabled={s.saving}
          className="px-2 py-1 rounded-md"
          style={field}
          onChange={(e) => {
            if (e.target.value !== value) s.save(change(e.target.value));
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <SavesOnChange />
      <SaveFeedback status={s.status} error={s.error} />
    </div>
  );
}

/** A typed value with its own Save: enabled only when it's valid and differs from the one in force. */
function SavingField({
  id,
  title,
  saved,
  validate,
  change,
  inputMode,
  maxLength,
  width,
  dataKey,
}: {
  id: string;
  title: string;
  /** The value in force, as the field shows it. */
  saved: string;
  /** Why the typed value can't be saved, or null. */
  validate: (typed: string) => string | null;
  change: (typed: string) => Record<string, unknown>;
  inputMode: "numeric" | "decimal";
  maxLength?: number;
  width: string;
  dataKey: string;
}) {
  const s = useSave("/api/admin/settings");
  const [typed, setTyped] = useState(saved);
  const problem = validate(typed.trim());
  const unchanged = typed.trim() === saved;
  return (
    <div className="flex flex-col gap-1" data-admin-field={dataKey}>
      <div className="flex flex-wrap items-center gap-2 text-[13px]" style={label}>
        <label htmlFor={id}>{title}</label>
        <input
          id={id}
          inputMode={inputMode}
          maxLength={maxLength}
          value={typed}
          aria-invalid={problem !== null}
          onChange={(e) => {
            setTyped(e.target.value);
            s.reset();
          }}
          className={`px-2 py-1 rounded-md ${width}`}
          style={field}
        />
        <button
          type="button"
          disabled={s.saving || unchanged || problem !== null}
          className="px-3 py-1 rounded-md text-[13px]"
          style={field}
          onClick={() => s.save(change(typed.trim()))}
        >
          {s.saving ? "Saving…" : "Save"}
        </button>
        {s.status !== "saving" ? <SaveFeedback status={s.status} error={s.error} /> : null}
      </div>
      {problem && !unchanged ? (
        <p className="text-[12px]" style={{ color: "var(--warning)" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

const postcodeProblem = (typed: string) =>
  typed === "" || /^\d{4}$/.test(typed) ? null : "An Australian postcode is four digits.";

const ceilingProblem = (typed: string) => {
  const n = Number(typed);
  return typed !== "" && Number.isFinite(n) && n >= 0 && n <= MAX_COST_CEILING_USD
    ? null
    : `A number from 0 to ${MAX_COST_CEILING_USD}.`;
};

export function GoogleSurfacesAdmin({
  view,
  health,
  flags,
}: {
  view: GoogleSurfaceAdminView;
  health: GoogleOperatorHealth;
  /** S00 part 2: the Feature flags card, shown above Changes (whose log it writes to). None: the page as before. */
  flags?: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }} data-admin-settings="">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={label}>
            {ADMIN_PAGE_TITLES.settings}
          </h1>
          <p className="text-[13px] mt-1" style={muted}>
            Google Search AI (AI Overviews and AI Mode). A change applies to the next audit; an
            audit keeps what it started with. <Link href="/admin/costs">Provider costs →</Link>
          </p>
        </div>

        <section className="mb-6 p-5 rounded-xl" style={card} data-admin-env="">
          <h2 className="text-sm font-semibold mb-2" style={label}>
            Kill switch
          </h2>
          <p className="text-[13px] flex flex-wrap items-center gap-2" style={muted}>
            GOOGLE_AI_SURFACES_ENABLED: <OnOff on={view.envEnabled} /> Set in Vercel; a change needs
            a redeploy. Off means no Google call is made, whatever this page says.
          </p>
          <p className="text-[13px] mt-2 flex flex-wrap items-center gap-2" style={muted}>
            Provider credentials (DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD):{" "}
            <OnOff on={view.credentialsPresent} /> {view.credentialsPresent ? "set" : "not set"}
          </p>
          {/* 12 Nov, part 3: "set" only means the env vars exist; this is what the provider last said. */}
          <p
            className="text-[13px] mt-2"
            style={health.lastRun?.problem ? { color: "var(--danger)" } : muted}
            data-admin-last-run={health.lastRun?.problem ? "problem" : "ok"}
          >
            {health.lastRun?.line ?? "Last Google run: none yet."}
          </p>
          <TestConnection />
        </section>

        <section className="mb-6 p-5 rounded-xl" style={card} data-admin-global="">
          <h2 className="text-sm font-semibold mb-1" style={label}>
            Global settings
          </h2>
          <p className="text-[12px] mb-3" style={muted} data-admin-saving-note="">
            Tick boxes and dropdowns save as soon as you change them; counting Google in the
            headline asks first. A typed value saves when you press its Save.
          </p>
          <div className="flex flex-col gap-3">
            {SURFACES.map(({ name, settingName }) => (
              <SettingCheckbox
                key={settingName}
                name={settingName}
                checked={view.settings[settingName]}
              >{`${name} on for every eligible workspace (Growth and up)`}</SettingCheckbox>
            ))}
            <SettingCheckbox
              name="countInHeadline"
              checked={view.settings.countInHeadline}
              confirm={COUNT_IN_HEADLINE_CONFIRM}
            >
              Count Google in the headline Visibility % (off: shown in its own block)
            </SettingCheckbox>
            <SavingSelect
              title="Queue"
              dataKey="queueMode"
              value={view.settings.queueMode}
              options={[
                { value: "standard", label: "Standard (cheapest; minutes)" },
                { value: "priority", label: "Priority" },
                { value: "live", label: "Live (seconds; most expensive)" },
              ]}
              change={(value) => ({ kind: "setting", name: "queueMode", value })}
            />
            <SavingSelect
              title="Device"
              dataKey="device"
              value={view.settings.device}
              options={[
                { value: "desktop", label: "Desktop" },
                { value: "mobile", label: "Mobile" },
              ]}
              change={(value) => ({ kind: "setting", name: "device", value })}
            />
            <SavingField
              id="google-ceiling"
              dataKey="maxCostUsdPerAudit"
              title="Cost ceiling per audit (US$)"
              saved={String(view.settings.maxCostUsdPerAudit)}
              validate={ceilingProblem}
              change={(value) => ({ kind: "setting", name: "maxCostUsdPerAudit", value })}
              inputMode="decimal"
              width="w-24"
            />
          </div>
        </section>

        <section className="mb-6 p-5 rounded-xl" style={card} data-admin-workspace="">
          <h2 className="text-sm font-semibold mb-3" style={label}>
            One workspace
          </h2>
          <form method="get" className="flex flex-wrap items-center gap-2 mb-4 text-[13px]">
            <label htmlFor="admin-workspace" style={label}>
              Workspace
            </label>
            <select
              id="admin-workspace"
              name="workspace"
              defaultValue={view.selected?.id ?? ""}
              className="px-2 py-1 rounded-md max-w-full"
              style={field}
            >
              <option value="">Choose one</option>
              {view.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button type="submit" className="px-3 py-1 rounded-md" style={field}>
              Show
            </button>
          </form>

          {view.selected ? (
            <div className="flex flex-col gap-4" data-admin-selected={view.selected.id}>
              <p className="text-[13px]" style={muted}>
                Plan: {tierDisplayName(view.selected.tier)}
              </p>
              {SURFACES.map(({ surface, name }) => {
                const selected = view.selected;
                if (!selected) return null;
                const override = selected.overrides[surface];
                return (
                  <div key={surface} className="flex flex-col gap-1" data-admin-surface={surface}>
                    <SavingSelect
                      title={`${name} for this workspace`}
                      dataKey={`override-${surface}`}
                      value={override === null ? "default" : override ? "on" : "off"}
                      options={[
                        { value: "default", label: "Global setting" },
                        { value: "on", label: "On" },
                        { value: "off", label: "Off" },
                      ]}
                      change={(state) => ({
                        kind: "workspace",
                        workspaceId: selected.id,
                        surface,
                        state,
                      })}
                    />
                    <Decision title="Next audit" decision={selected.now[surface]} />
                    {!view.envEnabled ? (
                      <Decision
                        title="With the kill switch on"
                        decision={selected.withEnvOn[surface]}
                      />
                    ) : null}
                  </div>
                );
              })}

              <div>
                <h3 className="text-[13px] font-semibold mb-1" style={label}>
                  Google location per brand
                </h3>
                <p className="text-[12px] mb-2" style={muted}>
                  Google results are for the brand&apos;s own postcode (its owner gives it with the
                  suburb). A postcode set here overrides it; with neither, they&apos;re for the
                  nearest place the provider has (the suburb, then the city, then the state&apos;s
                  capital), and the audit says so. Clear it and Save to remove the override.
                </p>
                <div className="flex flex-col gap-2">
                  {view.selected.brands.map((b) => (
                    <div key={b.id} className="flex flex-col gap-1" data-admin-brand={b.id}>
                      <span className="text-[13px]" style={label}>
                        {b.name}{" "}
                        <span style={muted}>
                          {[b.suburb, b.state].filter(Boolean).join(" ") || "no suburb"}
                          {b.ownPostcode
                            ? ` · own postcode ${b.ownPostcode}`
                            : " · no postcode of its own"}
                        </span>
                      </span>
                      <SavingField
                        id={`postcode-${b.id}`}
                        dataKey={`postcode-${b.id}`}
                        title={`Postcode for ${b.name}`}
                        saved={b.postcode ?? ""}
                        validate={postcodeProblem}
                        change={(postcode) => ({
                          kind: "brand",
                          brandId: b.id,
                          postcode: postcode || null,
                        })}
                        inputMode="numeric"
                        maxLength={4}
                        width="w-20"
                      />
                    </div>
                  ))}
                  {view.selected.brands.length === 0 ? (
                    <p className="text-[12px]" style={muted}>
                      No brands in this workspace.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px]" style={muted}>
              Choose a workspace to see what its next audit would run, and to switch Google on for
              it.
            </p>
          )}
        </section>

        <ProviderErrors errors={health.providerErrorGroups} lastCleanRun={health.lastCleanRun} />

        {flags}

        <section className="p-5 rounded-xl" style={card} data-admin-history="">
          <h2 className="text-sm font-semibold mb-3" style={label}>
            Changes
          </h2>
          {view.history.length === 0 ? (
            <p className="text-[13px]" style={muted}>
              Nothing has been changed yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="text-[12px] w-full" style={muted}>
                <thead>
                  <tr style={label}>
                    <th className="text-left pr-3 pb-1">When (Sydney time)</th>
                    <th className="text-left pr-3 pb-1">Setting</th>
                    <th className="text-left pr-3 pb-1">Where</th>
                    <th className="text-left pr-3 pb-1">From → to</th>
                    <th className="text-left pb-1">By</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 19 Nov: a run of identical saves that changed nothing is one row, "13 saves, no change (2153)";
                      the rows themselves stay in the history. */}
                  {collapseNoChangeSaves(view.history).map((h) => (
                    <tr
                      key={`${h.at}-${h.firstAt}-${h.setting}-${h.target ?? "global"}`}
                      data-admin-history-row={h.noChange ? "no-change" : "change"}
                    >
                      <td className="pr-3 py-1 whitespace-nowrap">
                        <SydneyTime iso={h.at} />
                      </td>
                      <td className="pr-3 py-1">{h.setting}</td>
                      <td className="pr-3 py-1">{h.target ?? "Global"}</td>
                      <td className="pr-3 py-1">
                        {noChangeText(h, shown(h.to)) ?? `${shown(h.from)} → ${shown(h.to)}`}
                      </td>
                      <td className="py-1">{h.by ?? "unknown"}</td>
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
