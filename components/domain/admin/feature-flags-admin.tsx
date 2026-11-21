"use client";

import { type CSSProperties, useCallback } from "react";
import { LoadError } from "@/components/shared/load-error";
import { SaveFeedback, useSave } from "@/components/shared/save-feedback";
import type { FeatureFlagAdminRow, FeatureFlagAdminView } from "@/lib/flags/admin";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchJson } from "@/lib/load/fetch-json";

/**
 * S00 part 2 (22 Nov; LLD section 17): the "Feature flags" card on /admin/settings, operators only (the page and
 * /api/admin/feature-flags both check). One row per flag: its global value (a tick box that saves when changed) and,
 * for the workspace chosen in "One workspace" above, its override (Default / On / Off) and what that workspace gets.
 * Each change lands in the Changes log below. Every flag is off until it's turned on here.
 *
 * The card loads its own view (GET /api/admin/feature-flags) through the app's one loader (lib/hooks/use-load.ts):
 * "Loading…", then the table, or "Couldn't load the feature flags" with Try again, never a table of defaults that
 * didn't load. After each save it loads again.
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

const FLAGS_ROUTE = "/api/admin/feature-flags";

function GlobalSwitch({ flag, onSaved }: { flag: FeatureFlagAdminRow; onSaved: () => void }) {
  const s = useSave(FLAGS_ROUTE, { onSaved });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-[13px]" style={label}>
        <input
          type="checkbox"
          checked={flag.global}
          disabled={s.saving}
          onChange={(e) =>
            void s.save({ scope: "global", flag: flag.name, enabled: e.target.checked })
          }
          data-testid={`admin-flag-global-${flag.name}`}
        />
        {flag.global ? "On" : "Off"}
        <span className="sr-only">{` for every workspace: ${flag.name}`}</span>
      </label>
      <SaveFeedback status={s.status} error={s.error} />
    </div>
  );
}

function overrideValue(override: boolean | null): "default" | "on" | "off" {
  if (override === null) return "default";
  return override ? "on" : "off";
}

function WorkspaceOverride({
  flag,
  workspace,
  onSaved,
}: {
  flag: FeatureFlagAdminRow;
  workspace: { id: string; name: string };
  onSaved: () => void;
}) {
  const s = useSave(FLAGS_ROUTE, { onSaved });
  const value = overrideValue(flag.override);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        disabled={s.saving}
        className="px-2 py-1 rounded-md text-[13px]"
        style={field}
        aria-label={`${flag.name} for ${workspace.name}`}
        data-testid={`admin-flag-override-${flag.name}`}
        onChange={(e) => {
          if (e.target.value !== value)
            void s.save({
              scope: "workspace",
              workspaceId: workspace.id,
              flag: flag.name,
              state: e.target.value,
            });
        }}
      >
        <option value="default">{`Default (${flag.global ? "on" : "off"})`}</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
      <SaveFeedback status={s.status} error={s.error} />
    </div>
  );
}

/** The flags table for a loaded view. `onSaved` runs after each save (the card loads the view again). */
export function FeatureFlagsTable({
  view,
  onSaved,
}: {
  view: FeatureFlagAdminView;
  onSaved: () => void;
}) {
  const { workspace } = view;
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="text-[13px] w-full" style={muted}>
          <thead>
            <tr style={label}>
              <th scope="col" className="text-left pr-3 pb-2">
                Flag
              </th>
              <th scope="col" className="text-left pr-3 pb-2">
                Everyone
              </th>
              {workspace ? (
                <>
                  <th scope="col" className="text-left pr-3 pb-2">
                    {workspace.name}
                  </th>
                  <th scope="col" className="text-left pb-2">
                    It gets
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {view.flags.map((flag) => (
              <tr
                key={flag.name}
                style={{ borderTop: "1px solid var(--border-default)" }}
                data-admin-flag={flag.name}
              >
                <td className="pr-3 py-2 align-top">
                  <div className="font-mono text-[12px]" style={label}>
                    {flag.name}
                  </div>
                  <div className="text-[12px]">{`${flag.gates} (${flag.sprint})`}</div>
                </td>
                <td className="pr-3 py-2 align-top">
                  <GlobalSwitch flag={flag} onSaved={onSaved} />
                </td>
                {workspace ? (
                  <>
                    <td className="pr-3 py-2 align-top">
                      <WorkspaceOverride flag={flag} workspace={workspace} onSaved={onSaved} />
                    </td>
                    <td
                      className="py-2 align-top"
                      data-admin-flag-effective={flag.effective ? "on" : "off"}
                    >
                      {flag.effective ? "On" : "Off"}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {workspace ? null : (
        <p className="text-[12px] mt-3" style={muted}>
          Choose a workspace under One workspace to set its own value for a flag.
        </p>
      )}
    </>
  );
}

/** The card: loads the view for `workspaceId` (the page's ?workspace=, null for none) and shows the table. */
export function FeatureFlagsAdmin({ workspaceId }: { workspaceId: string | null }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchJson<FeatureFlagAdminView>(
        workspaceId ? `${FLAGS_ROUTE}?workspace=${encodeURIComponent(workspaceId)}` : FLAGS_ROUTE,
        { signal },
      ),
    [workspaceId],
  );
  const flags = useLoad(load);
  return (
    <section className="mb-6 p-5 rounded-xl" style={card} data-admin-flags="">
      <h2 className="text-sm font-semibold mb-1" style={label}>
        Feature flags
      </h2>
      <p className="text-[12px] mb-3" style={muted}>
        Each client-enhancements feature ships behind one of these and stays off until it's turned
        on here: for one workspace first (choose it under One workspace), then for everyone. Off
        means the app works as it does today. Tick boxes and dropdowns save as soon as you change
        them; every change is in Changes below.
      </p>
      {flags.status === "error" ? (
        <LoadError what="the feature flags" detail={flags.detail} onRetry={flags.retry} />
      ) : flags.status === "loading" ? (
        <p className="text-[13px]" style={muted} aria-busy="true" data-admin-flags-loading="">
          Loading the feature flags…
        </p>
      ) : (
        <FeatureFlagsTable view={flags.data} onSaved={flags.retry} />
      )}
    </section>
  );
}
