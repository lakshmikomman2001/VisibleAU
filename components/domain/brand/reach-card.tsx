"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Draft, storeDraft } from "@/components/domain/questions/question-editor";
import { Banner } from "@/components/shared/banner";
import { Chip } from "@/components/shared/chip";
import { Pill } from "@/components/shared/pill";
import { Stepper } from "@/components/shared/stepper";
import type { QuestionReach } from "@/db/schema/questions";
import { isPlanRefusal } from "@/lib/pricing/plan-refusal";
import type { ReachSetting, ReachSettingsView } from "@/lib/reach/settings";
import {
  defaultSplit,
  enabledInOrder,
  isSmallSample,
  LIMIT_REACHED_COPY,
  type ReachTargets,
  smallSampleNote,
  stepperBounds,
  usedQuestions,
} from "@/lib/reach/split";

/**
 * S04 part 6 (contract P01.reach, LLD 8.4.1): "Where do you want to be visible?" on brand settings, with visibility_reach
 * on. Local is always on (its switch locked); State, Country and Worldwide switch on within the plan's reach limit (a
 * switch past it stays off with the plan that allows it and an Upgrade link). Each enabled reach has a stepper (Local at
 * least 4; the others at least 1; together within the plan's everyday questions); the total, the bar and the legend
 * follow live. Nothing is saved until "Save and review questions": PUT /api/brands/:id/reaches, then the Questions tab
 * in edit mode with the returned draft (P02 -> P04), where it's applied. The card's places and numbers come from the
 * API (lib/markets through lib/reach), never written here.
 */

const VIEW_ONLY = "View only. Owners and admins can change these settings.";
const LOAD_ERROR = "We couldn't load these settings. Check your connection and try again.";
const SAVE_ERROR = "We couldn't save these settings. Try again.";
const WORLDWIDE_HELP =
  "Measured on the four AI engines only. Google's AI answers always depend on a country.";
/** SegmentedBar: one segment per enabled reach in reach order, the accent at 100%, 60%, 30%, 15%. */
const BAR_SHARES = [100, 60, 30, 15];

type Loaded =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; view: ReachSettingsView };

interface Form {
  enabled: QuestionReach[];
  targets: ReachTargets;
}

function formFrom(view: ReachSettingsView): Form {
  const enabled = view.reaches.filter((r) => r.enabled).map((r) => r.reach);
  const targets: ReachTargets = {};
  for (const r of view.reaches) targets[r.reach] = r.enabled ? r.targetCount : 0;
  return { enabled: enabledInOrder(enabled), targets };
}

const sameForm = (a: Form, b: Form) =>
  JSON.stringify(a.enabled) === JSON.stringify(b.enabled) &&
  a.enabled.every((r) => (a.targets[r] ?? 0) === (b.targets[r] ?? 0));

/** "NSW, Australia or worldwide". */
function orList(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** The legend's and the bar's name for a reach: "Local", then its label ("NSW", "Australia", "Worldwide"). */
const shortName = (r: ReachSetting) => (r.reach === "local" ? "Local" : r.label);

function LockMarker({ plan }: { plan: string }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}
    >
      <Lock aria-hidden="true" style={{ width: 12, height: 12 }} />
      {plan}
      <span className="sr-only"> plan and up</span>
    </span>
  );
}

export function ReachCard({
  brandId,
  canEdit,
  onChangeLocation,
}: {
  brandId: string;
  canEdit: boolean;
  /** "Change" on the Local row: the brand settings' existing location editor. */
  onChangeLocation: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [form, setForm] = useState<Form>({ enabled: ["local"], targets: {} });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const firstChanged = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setLoaded({ status: "loading" });
    try {
      const res = await fetch(`/api/brands/${brandId}/reaches`);
      if (!res.ok) throw new Error(String(res.status));
      const view = (await res.json()) as ReachSettingsView;
      setLoaded({ status: "ready", view });
      setForm(formFrom(view));
    } catch {
      setLoaded({ status: "error" });
    }
  }, [brandId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.status === "loading") return <ReachCardSkeleton />;
  if (loaded.status === "error") {
    return (
      <section style={card} data-testid="p01-reach">
        <Banner
          tone="warn"
          role="alert"
          testId="p01-reach-error"
          actions={
            <button type="button" onClick={() => void load()} style={ghostButton}>
              Retry
            </button>
          }
        >
          {LOAD_ERROR}
        </Banner>
      </section>
    );
  }

  const { view } = loaded;
  const saved = formFrom(view);
  const changed = !sameForm(form, saved);
  const limit = view.everydayAllowed;
  const used = usedQuestions(form.targets, form.enabled);
  const atReachLimit = form.enabled.length >= view.plan.reachesAllowed;
  const lockPlan = view.plansForReaches[form.enabled.length + 1];
  const others = view.reaches.filter((r) => r.reach !== "local" && r.available);
  const help = `Local is always on. Add ${orList(
    others.map((r) => (r.reach === "global" ? "worldwide" : r.label)),
  )} to see whether AI recommends you beyond your area. Each area gets its own questions and its own score.`;
  const suggestion = !dismissed ? view.suggestions[0] : undefined;

  const turnOn = (reaches: QuestionReach[]) => {
    const enabled = enabledInOrder([...form.enabled, ...reaches]);
    setForm({ enabled, targets: { ...form.targets, ...defaultSplit(enabled, limit) } });
    setLimitError(null);
    setSaveError(null);
  };
  const toggle = (reach: QuestionReach) => {
    if (reach === "local" || !canEdit) return;
    if (form.enabled.includes(reach)) {
      setForm({
        enabled: form.enabled.filter((r) => r !== reach),
        targets: { ...form.targets, [reach]: 0 },
      });
      setLimitError(null);
      setSaveError(null);
    } else turnOn([reach]);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setLimitError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/reaches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reaches: view.reaches.map((r) => {
            const on = form.enabled.includes(r.reach);
            return {
              reach: r.reach,
              enabled: on,
              place: on ? r.place : null,
              targetCount: on ? (form.targets[r.reach] ?? 0) : 0,
            };
          }),
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as ReachSettingsView & { draft: Draft };
        storeDraft(brandId, body.draft);
        router.push(`/brands/${brandId}/questions?edit=1`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.status === 402) setLimitError(body.message ?? SAVE_ERROR);
      else if (await isPlanRefusal(res)) setSaveError(body.error ?? SAVE_ERROR);
      else setSaveError(body.message ?? SAVE_ERROR);
    } catch {
      setSaveError(SAVE_ERROR);
    }
    setSaving(false);
  };

  const enabledRows = view.reaches.filter((r) => form.enabled.includes(r.reach));
  const legend = enabledRows.map((r) => ({
    name: shortName(r),
    n: form.targets[r.reach] ?? 0,
  }));

  return (
    <section style={card} data-testid="p01-reach" aria-labelledby="p01-reach-title">
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 12 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <h3 id="p01-reach-title" style={title}>
            Where do you want to be visible?
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{help}</p>
        </div>
        <span data-testid="p01-reach-plan">
          <Pill tone="neutral">
            {view.plan.name}: up to {view.plan.reachesAllowed}{" "}
            {view.plan.reachesAllowed === 1 ? "area" : "areas"}
          </Pill>
        </span>
      </div>

      {!canEdit && (
        <div style={{ marginTop: 16 }}>
          <Banner tone="neutral" testId="p01-reach-no-permission">
            {VIEW_ONLY}
          </Banner>
        </div>
      )}

      {suggestion && canEdit && (
        <section aria-label="Suggested areas" style={{ marginTop: 16 }}>
          <Banner
            tone="info"
            testId="p01-reach-suggest"
            actions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    turnOn(suggestion.reaches);
                    setDismissed(true);
                    requestAnimationFrame(() => firstChanged.current?.focus());
                  }}
                  style={{ ...primaryButton, height: 32, background: "var(--accent-blue)" }}
                >
                  Add
                </button>
                <button type="button" onClick={() => setDismissed(true)} style={ghostButton}>
                  Not now
                </button>
              </>
            }
          >
            Your website says you work across {suggestion.scope} ("{suggestion.quote}"). Add{" "}
            {suggestion.reaches
              .map((r) => view.reaches.find((s) => s.reach === r)?.label ?? r)
              .join(" and ")}
            ?
          </Banner>
        </section>
      )}

      <ul
        data-testid="p01-reach-list"
        style={{
          listStyle: "none",
          margin: "16px 0 0",
          padding: 0,
          border: "1px solid var(--border-default)",
          borderRadius: 8,
        }}
      >
        {view.reaches.map((r, index) => {
          const on = form.enabled.includes(r.reach);
          const locked = r.reach !== "local" && !on && r.available && atReachLimit;
          const switchOff = r.reach === "local" || !canEdit || !r.available || locked;
          const bounds = stepperBounds(r.reach, form.targets, form.enabled, limit);
          const value = on ? (form.targets[r.reach] ?? 0) : 0;
          const name = shortName(r);
          const isFirstSuggested = suggestion?.reaches[0] === r.reach;
          return (
            <li
              key={r.reach}
              data-testid={`p01-reach-row-${r.reach}`}
              className="grid grid-cols-[44px_1fr] min-[641px]:grid-cols-[44px_1fr_auto]"
              style={{
                gap: 12,
                padding: "14px 16px",
                alignItems: "start",
                borderBottom:
                  index < view.reaches.length - 1 ? "1px solid var(--border-default)" : "none",
              }}
            >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={r.reach === "local" ? "Local, always on" : r.title}
                aria-disabled={switchOff || undefined}
                ref={isFirstSuggested ? firstChanged : undefined}
                onClick={() => {
                  if (!switchOff) toggle(r.reach);
                }}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 999,
                  border: "none",
                  position: "relative",
                  marginTop: 1,
                  cursor: switchOff ? "not-allowed" : "pointer",
                  opacity: r.reach === "local" ? 0.6 : switchOff ? 0.5 : 1,
                  background: on ? "var(--accent-blue)" : "var(--border-control)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 2,
                    left: on ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    background: "var(--switch-thumb)",
                  }}
                />
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                    {r.title}
                  </span>
                  {r.reach === "local" && <Pill tone="neutral">Always on</Pill>}
                  {locked && lockPlan && (
                    <span
                      className="inline-flex items-center flex-wrap"
                      style={{ gap: 8 }}
                      data-testid={`p01-reach-lock-${r.reach}`}
                    >
                      <LockMarker plan={lockPlan.name} />
                      <span style={helpText}>Available on {lockPlan.name} and up</span>
                      <Link href="/pricing" style={link}>
                        Upgrade
                      </Link>
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                  <RowDetail
                    setting={r}
                    areas={view.areas}
                    stateCapital={view.stateCapital}
                    canEdit={canEdit}
                    onChangeLocation={onChangeLocation}
                  />
                </div>
              </div>
              <div
                className="col-start-2 min-[641px]:col-start-auto flex items-center"
                style={{ gap: 10 }}
              >
                <span style={helpText}>Questions</span>
                <Stepper
                  value={value}
                  min={bounds.min}
                  max={bounds.max}
                  label={`${name} questions`}
                  thing={`${name} questions`}
                  disabled={!on || !canEdit}
                  invalid={!!limitError}
                  limitTitle={used >= limit ? LIMIT_REACHED_COPY : undefined}
                  onChange={(n) => {
                    setForm({ ...form, targets: { ...form.targets, [r.reach]: n } });
                    setLimitError(null);
                    setSaveError(null);
                  }}
                  testId={`p01-reach-stepper-${r.reach}`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          className="flex items-baseline justify-between"
          aria-live="polite"
          data-testid="p01-reach-total"
        >
          <span style={helpText}>Everyday questions used</span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-primary)",
            }}
          >
            {used} of {limit}
          </span>
        </div>
        <div
          role="img"
          aria-label={legend.map((l) => `${l.name} ${l.n}`).join(", ")}
          data-testid="p01-reach-bar"
          className="flex"
          style={{
            height: 8,
            borderRadius: 999,
            overflow: "hidden",
            background: "var(--bg-subtle)",
          }}
        >
          {legend.map((l, i) => (
            <span
              key={l.name}
              style={{
                width: `${limit > 0 ? (l.n / limit) * 100 : 0}%`,
                background: `color-mix(in srgb, var(--accent-blue) ${BAR_SHARES[i] ?? 15}%, var(--bg-elevated))`,
              }}
            />
          ))}
        </div>
        <p
          className="flex flex-wrap"
          data-testid="p01-reach-legend"
          style={{ ...helpText, margin: 0, gap: 6 }}
        >
          {legend.map((l, i) => (
            <span key={l.name}>
              {i > 0 ? "· " : ""}
              {l.name} {l.n}
              {isSmallSample(l.n) && <span title={smallSampleNote(l.n)}> (small sample)</span>}
            </span>
          ))}
          {view.packsOffered && (
            <span>
              · Want more?{" "}
              <Link href="/settings/billing" style={link}>
                Add a question pack
              </Link>
            </span>
          )}
        </p>
        {limitError && (
          <p role="alert" data-testid="p01-reach-over-limit" style={errorText}>
            {limitError}
          </p>
        )}
      </div>

      {canEdit && (
        <div
          className="flex flex-col min-[641px]:flex-row min-[641px]:items-center"
          style={{ gap: 12, marginTop: 20 }}
        >
          <button
            type="button"
            data-testid="p01-reach-save"
            onClick={() => void save()}
            disabled={!changed || saving}
            className="w-full min-[641px]:w-auto"
            style={{
              ...primaryButton,
              cursor: !changed || saving ? "not-allowed" : "pointer",
              opacity: !changed || saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : "Save and review questions"}
          </button>
          <button
            type="button"
            data-testid="p01-reach-cancel"
            onClick={() => {
              setForm(saved);
              setLimitError(null);
              setSaveError(null);
            }}
            className="w-full min-[641px]:w-auto"
            style={ghostButton}
          >
            Cancel
          </button>
          {saveError && (
            <p role="alert" data-testid="p01-reach-save-error" style={{ ...errorText, margin: 0 }}>
              {saveError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function RowDetail({
  setting,
  areas,
  stateCapital,
  canEdit,
  onChangeLocation,
}: {
  setting: ReachSetting;
  areas: string[];
  stateCapital: string | null;
  canEdit: boolean;
  onChangeLocation: () => void;
}) {
  const place = setting.place ?? {};
  if (setting.reach === "local") {
    const areaNames = areas.map((a) => a.split(":").pop()?.trim()).filter((a): a is string => !!a);
    const suburb = [place.suburb, place.state, place.postcode].filter(Boolean).join(" ");
    return (
      <>
        {place.city && <Chip name="City" value={place.city} />}
        {areaNames.length > 0 && <Chip name="Areas" value={areaNames.join(", ")} />}
        {place.suburb && <Chip name="Suburb" value={suburb} />}
        {canEdit && (
          <button
            type="button"
            onClick={onChangeLocation}
            style={{ ...link, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            Change
          </button>
        )}
      </>
    );
  }
  if (!setting.available) {
    return (
      <span style={helpText}>
        {setting.reach === "state"
          ? "Add the business's state to measure it."
          : "Not available for this market yet."}
      </span>
    );
  }
  if (setting.reach === "state") {
    return (
      <>
        <PlaceChip>{setting.label}</PlaceChip>
        <span style={helpText}>
          Google AI checked from {setting.label}
          {stateCapital ? `, or ${stateCapital} if a state can't be set (labelled)` : ""}
        </span>
      </>
    );
  }
  if (setting.reach === "country") return <PlaceChip>{setting.label}</PlaceChip>;
  return <span style={helpText}>{WORLDWIDE_HELP}</span>;
}

/** The place chip on a State or Country row (C-06: the row's title is "State"/"Country", its place a chip). */
function PlaceChip({ children }: { children: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{
        height: 24,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        boxSizing: "border-box",
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-default)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </span>
  );
}

function ReachCardSkeleton() {
  return (
    <section style={card} data-testid="p01-reach-loading" aria-busy="true">
      <div style={{ ...bone, width: 260, height: 16 }} />
      <div style={{ ...bone, width: "70%", height: 12, marginTop: 10 }} />
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...bone, height: 64 }} />
        ))}
      </div>
    </section>
  );
}

const card = {
  padding: 24,
  borderRadius: 8,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
} as const;
const title = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-primary)",
  margin: 0,
} as const;
const helpText = { fontSize: 12.5, color: "var(--text-tertiary)" } as const;
const errorText = { fontSize: 12.5, color: "var(--danger)", margin: "4px 0 0" } as const;
const link = {
  fontSize: 12.5,
  color: "var(--accent-primary)",
  textDecoration: "underline",
} as const;
const bone = { borderRadius: 8, background: "var(--bg-subtle)" } as const;
const primaryButton = {
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  background: "var(--accent-primary)",
  color: "var(--accent-primary-fg)",
  border: "none",
} as const;
const ghostButton = {
  height: 36,
  padding: "0 12px",
  borderRadius: 6,
  fontSize: 13,
  background: "none",
  color: "var(--text-primary)",
  border: "none",
  cursor: "pointer",
} as const;
