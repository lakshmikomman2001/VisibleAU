import { Pill } from "@/components/shared/pill";
import type { AuditReachView } from "@/lib/reach/display";
import { reachTileTooltip } from "@/lib/reach/labels";
import { smallSampleNote } from "@/lib/reach/split";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";

/**
 * S04 part 7 (contract P07.reachRow): "Where AI recommends you" -- one tile per reach, in reach order, only for an
 * audit with more than one reach (visibility_reach on). Each tile: the reach's label, its Visibility, "{m} of {n}
 * answers · 95% CI {lo}–{hi}%", and "Small sample" under 5 questions. The tiles' answers and mentions add up to the
 * headline's (lib/reach/results.ts). Grid: 3 columns from 1024 (4 with Worldwide), 2 from 641, 1 below.
 */
export function ReachRow({ view, partial }: { view: AuditReachView; partial: boolean }) {
  if (view.tiles.length === 0) return null;
  const four = view.tiles.length >= 4;
  return (
    <section
      data-testid="p07-reach-row"
      aria-labelledby="p07-reach-row-title"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <h3
        id="p07-reach-row-title"
        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
      >
        Where AI recommends you
      </h3>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 16px" }}>
        Each area has its own questions
      </p>
      <ul
        className={`grid grid-cols-1 min-[641px]:grid-cols-2 ${four ? "min-[1024px]:grid-cols-4" : "min-[1024px]:grid-cols-3"}`}
        style={{ gap: 12, listStyle: "none", margin: 0, padding: 0 }}
      >
        {view.tiles.map((t) => {
          const value = t.pct === null ? "—" : formatVisibilityPercent(t.pct);
          const detail = [
            `${t.mentioned} of ${t.everydayAnswers} answers`,
            t.ciLow !== null && t.ciHigh !== null
              ? `95% CI ${t.ciLow.toFixed(0)}–${t.ciHigh.toFixed(0)}%`
              : null,
            partial ? "partial" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={t.reach}
              data-testid={`p07-reach-tile-${t.reach}`}
              title={reachTileTooltip(t)}
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "14px 16px",
                background: "var(--bg-elevated)",
              }}
            >
              <span className="sr-only">
                {`${t.label}: ${value}, ${detail}${t.smallSample ? ", small sample" : ""}`}
              </span>
              <div
                aria-hidden="true"
                className="flex items-center justify-between"
                style={{ gap: 8 }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                  {t.label}
                </span>
                {t.smallSample && t.questions !== null && (
                  <span title={smallSampleNote(t.questions)}>
                    <Pill tone="warn">Small sample</Pill>
                  </span>
                )}
              </div>
              <div
                aria-hidden="true"
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-primary)",
                  marginTop: 6,
                }}
              >
                {value}
              </div>
              <div
                aria-hidden="true"
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  marginTop: 2,
                }}
              >
                {detail}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
