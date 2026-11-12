"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useState } from "react";
import type { GoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import type {
  GoogleSurface,
  GoogleSurfaceAdminView,
  GoogleSurfaceDecision,
} from "@/lib/governance/google-surfaces";
import { usePostAction } from "@/lib/hooks/use-action";

/**
 * Google AI surfaces, Phase 1, part 1 -- /admin/settings. Each control saves on its own (POST
 * /api/admin/settings) and the page reloads what the server now has. The env kill switch is shown but
 * can't be changed here: it's GOOGLE_AI_SURFACES_ENABLED in Vercel, and needs a redeploy.
 */

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
 * 12 Nov, part 2: the provider's own code and message, for the operator only (customers see a plain
 * sentence; lib/audit/google-surfaces/reasons.ts).
 */
function ProviderErrors({ errors }: { errors: GoogleOperatorHealth["providerErrors"] }) {
  return (
    <section className="mb-6 p-5 rounded-xl" style={card} data-admin-provider-errors="">
      <h2 className="text-sm font-semibold mb-1" style={label}>
        Provider errors
      </h2>
      <p className="text-[12px] mb-3" style={muted}>
        The latest Google questions the provider failed, with its code and its own message.
        Customers are shown only a plain reason (for example "a problem on our side").
      </p>
      {errors.length === 0 ? (
        <p className="text-[13px]" style={muted}>
          None recorded.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="text-[12px] w-full" style={muted}>
            <thead>
              <tr style={label}>
                <th className="text-left pr-3 pb-1">When (UTC)</th>
                <th className="text-left pr-3 pb-1">Audit</th>
                <th className="text-left pr-3 pb-1">Surface</th>
                <th className="text-left pr-3 pb-1">Code</th>
                <th className="text-left pb-1">What the provider said</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} data-admin-provider-error={e.code ?? "none"}>
                  <td className="pr-3 py-1 whitespace-nowrap">
                    {e.at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="pr-3 py-1">
                    {e.auditNumber !== null ? `#${e.auditNumber}` : "—"}
                    {e.brand ? ` · ${e.brand}` : ""}
                    {e.workspace ? ` (${e.workspace})` : ""}
                  </td>
                  <td className="pr-3 py-1 whitespace-nowrap">{e.surface}</td>
                  <td className="pr-3 py-1 whitespace-nowrap">
                    {e.code ?? "no answer"} · {e.category}
                  </td>
                  <td className="py-1" style={{ wordBreak: "break-word" }}>
                    {e.message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function GoogleSurfacesAdmin({
  view,
  health,
}: {
  view: GoogleSurfaceAdminView;
  health: GoogleOperatorHealth;
}) {
  const router = useRouter();
  const save = usePostAction("/api/admin/settings", {
    onDone: () => router.refresh(),
    failure: "The change couldn't be saved.",
  });
  const send = (change: Record<string, unknown>) =>
    save.run({ headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
  const [ceiling, setCeiling] = useState(String(view.settings.maxCostUsdPerAudit));
  const [postcodes, setPostcodes] = useState<Record<string, string>>(
    Object.fromEntries((view.selected?.brands ?? []).map((b) => [b.id, b.postcode ?? ""])),
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }} data-admin-settings="">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={label}>
            Operator settings
          </h1>
          <p className="text-[13px] mt-1" style={muted}>
            Google Search AI (AI Overviews and AI Mode). A change applies to the next audit; an
            audit keeps what it started with.
          </p>
        </div>

        {save.error ? (
          <p role="alert" className="mb-4 text-[13px]" style={{ color: "var(--danger)" }}>
            {save.error}
          </p>
        ) : null}

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
        </section>

        <section className="mb-6 p-5 rounded-xl" style={card} data-admin-global="">
          <h2 className="text-sm font-semibold mb-3" style={label}>
            Global settings
          </h2>
          <div className="flex flex-col gap-3">
            {SURFACES.map(({ name, settingName }) => (
              <label
                key={settingName}
                className="flex items-center gap-2 text-[13px]"
                style={label}
              >
                <input
                  type="checkbox"
                  checked={view.settings[settingName]}
                  disabled={save.running}
                  onChange={(e) =>
                    send({ kind: "setting", name: settingName, value: e.target.checked })
                  }
                />
                {name} on for every eligible workspace (Growth and up)
              </label>
            ))}
            <label className="flex items-center gap-2 text-[13px]" style={label}>
              <input
                type="checkbox"
                checked={view.settings.countInHeadline}
                disabled={save.running}
                onChange={(e) =>
                  send({ kind: "setting", name: "countInHeadline", value: e.target.checked })
                }
              />
              Count Google in the headline Visibility % (off: shown in its own block)
            </label>
            <label className="flex flex-wrap items-center gap-2 text-[13px]" style={label}>
              Queue
              <select
                value={view.settings.queueMode}
                disabled={save.running}
                className="px-2 py-1 rounded-md"
                style={field}
                onChange={(e) =>
                  send({ kind: "setting", name: "queueMode", value: e.target.value })
                }
              >
                <option value="standard">Standard (cheapest; minutes)</option>
                <option value="priority">Priority</option>
                <option value="live">Live (seconds; most expensive)</option>
              </select>
            </label>
            <label className="flex flex-wrap items-center gap-2 text-[13px]" style={label}>
              Device
              <select
                value={view.settings.device}
                disabled={save.running}
                className="px-2 py-1 rounded-md"
                style={field}
                onChange={(e) => send({ kind: "setting", name: "device", value: e.target.value })}
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 text-[13px]" style={label}>
              <label htmlFor="google-ceiling">Cost ceiling per audit (US$)</label>
              <input
                id="google-ceiling"
                inputMode="decimal"
                value={ceiling}
                onChange={(e) => setCeiling(e.target.value)}
                className="px-2 py-1 rounded-md w-24"
                style={field}
              />
              <button
                type="button"
                disabled={save.running}
                className="px-3 py-1 rounded-md text-[13px]"
                style={{ background: "var(--accent-blue)", color: "var(--accent-blue-fg)" }}
                onClick={() =>
                  send({ kind: "setting", name: "maxCostUsdPerAudit", value: ceiling })
                }
              >
                Save
              </button>
            </div>
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
                Plan: {view.selected.tier}
              </p>
              {SURFACES.map(({ surface, name }) => {
                const selected = view.selected;
                if (!selected) return null;
                const override = selected.overrides[surface];
                return (
                  <div key={surface} className="flex flex-col gap-1" data-admin-surface={surface}>
                    <label className="flex flex-wrap items-center gap-2 text-[13px]" style={label}>
                      {name} for this workspace
                      <select
                        value={override === null ? "default" : override ? "on" : "off"}
                        disabled={save.running}
                        className="px-2 py-1 rounded-md"
                        style={field}
                        onChange={(e) =>
                          send({
                            kind: "workspace",
                            workspaceId: selected.id,
                            surface,
                            state: e.target.value,
                          })
                        }
                      >
                        <option value="default">Global setting</option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </label>
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
                  Brands have no postcode. With one set here, Google results are for that postcode;
                  without one, for the nearest place the provider has (the suburb, then the city,
                  then the state's capital), and the audit says so.
                </p>
                <div className="flex flex-col gap-2">
                  {view.selected.brands.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center gap-2 text-[13px]"
                      data-admin-brand={b.id}
                    >
                      <span style={label}>{b.name}</span>
                      <span style={muted}>
                        {[b.suburb, b.state].filter(Boolean).join(" ") || "no suburb"}
                      </span>
                      <input
                        aria-label={`Postcode for ${b.name}`}
                        inputMode="numeric"
                        maxLength={4}
                        value={postcodes[b.id] ?? ""}
                        onChange={(e) => setPostcodes((p) => ({ ...p, [b.id]: e.target.value }))}
                        className="px-2 py-1 rounded-md w-20"
                        style={field}
                      />
                      <button
                        type="button"
                        disabled={save.running}
                        className="px-3 py-1 rounded-md"
                        style={field}
                        onClick={() =>
                          send({
                            kind: "brand",
                            brandId: b.id,
                            postcode: (postcodes[b.id] ?? "").trim() || null,
                          })
                        }
                      >
                        Save
                      </button>
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

        <ProviderErrors errors={health.providerErrors} />

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
                    <th className="text-left pr-3 pb-1">When (UTC)</th>
                    <th className="text-left pr-3 pb-1">Setting</th>
                    <th className="text-left pr-3 pb-1">Where</th>
                    <th className="text-left pr-3 pb-1">From → to</th>
                    <th className="text-left pb-1">By</th>
                  </tr>
                </thead>
                <tbody>
                  {view.history.map((h) => (
                    <tr key={`${h.at}-${h.setting}-${h.target ?? "global"}`}>
                      <td className="pr-3 py-1 whitespace-nowrap">
                        {h.at.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="pr-3 py-1">{h.setting}</td>
                      <td className="pr-3 py-1">{h.target ?? "Global"}</td>
                      <td className="pr-3 py-1">
                        {shown(h.from)} → {shown(h.to)}
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
