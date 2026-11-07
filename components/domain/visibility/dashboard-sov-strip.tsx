import Link from "next/link";
import { InfoTip } from "@/components/domain/shared/info-tip";
import { SOV_NOTE, type SovLine } from "@/lib/visibility/share-of-voice-display";

/**
 * Overview (7 Nov), item 3: one line per brand -- the Overview covers every brand, and its brand
 * switcher never has one selected (choosing a brand opens that brand's pages) -- so the card never
 * shows one brand's share as if it were the workspace's. Each line is computed on the server
 * (lib/visibility/share-of-voice.ts); this only lays the lines out.
 */
export function DashboardSovStrip({ lines, moreBrands }: { lines: SovLine[]; moreBrands: number }) {
  return (
    <section
      aria-labelledby="overview-sov-title"
      className="rounded-xl p-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 mb-3">
        <h2
          id="overview-sov-title"
          className="text-xs font-medium m-0"
          style={{ color: "var(--text-tertiary)" }}
        >
          Share of Voice
        </h2>
        <InfoTip label="How Share of Voice is counted" note={SOV_NOTE} />
      </div>
      <ul className="space-y-3 m-0 p-0" style={{ listStyle: "none" }}>
        {lines.map((line) => (
          <li key={line.brandId} data-sov-brand={line.brandId}>
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/brands/${line.brandId}/visibility`}
                className="text-xs font-medium truncate min-w-0 hover:underline focus-visible:underline"
                style={{ color: "var(--text-primary)", textDecoration: "none" }}
              >
                {line.brandName}
              </Link>
              {line.share !== null && (
                <span
                  className="text-sm font-semibold flex-shrink-0"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--layer-visibility)",
                  }}
                >
                  {line.share}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5 mb-0" style={{ color: "var(--text-tertiary)" }}>
              {[line.detail, line.audit].filter(Boolean).join(" · ")}
              {line.smallSample && (
                <span
                  className="ml-1.5 text-[10px] px-1.5 py-px rounded font-medium"
                  style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}
                >
                  small sample
                </span>
              )}
            </p>
            {line.note && (
              <p className="text-[11px] mt-0.5 mb-0" style={{ color: "var(--warning)" }}>
                {line.note}
              </p>
            )}
            {line.share !== null && (
              <div
                className="h-[5px] rounded-full overflow-hidden mt-1"
                style={{ backgroundColor: "var(--bg-hover)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: line.share,
                    minWidth: 3,
                    backgroundColor: "var(--layer-visibility)",
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {moreBrands > 0 && (
        <Link
          href="/brands"
          className="inline-block text-xs mt-3 hover:underline focus-visible:underline"
          style={{ color: "var(--text-secondary)", textDecoration: "none" }}
        >
          {moreBrands} more brand{moreBrands === 1 ? "" : "s"}: see each brand&apos;s Visibility
          page
        </Link>
      )}
    </section>
  );
}
