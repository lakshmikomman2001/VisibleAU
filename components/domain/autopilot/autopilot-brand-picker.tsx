import { Target } from "lucide-react";
import Link from "next/link";

/**
 * No arbitrary "first brand" (7 Nov): Autopilot works one brand at a time. With several brands and
 * none selected, the Overview asks which one -- it used to show the progress of whichever brand
 * Postgres returned first, without naming it.
 */
export function AutopilotBrandPicker({
  brands,
  moreBrands,
}: {
  brands: ReadonlyArray<{ id: string; name: string }>;
  moreBrands: number;
}) {
  return (
    <section
      data-autopilot-picker=""
      aria-labelledby="overview-autopilot-title"
      className="rounded-xl p-5 mb-6"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Target size={14} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />
        <h2
          id="overview-autopilot-title"
          className="text-[13px] font-semibold m-0"
          style={{ color: "var(--text-primary)" }}
        >
          Autopilot
        </h2>
      </div>
      <p className="text-[13px] mt-0 mb-3" style={{ color: "var(--text-secondary)" }}>
        Select a brand to see what&apos;s been closed this month and what&apos;s next.
      </p>
      <ul className="flex flex-wrap gap-2 m-0 p-0" style={{ listStyle: "none" }}>
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link
              href={`/brands/${brand.id}/autopilot`}
              className="inline-flex items-center rounded-full px-3 text-[12px] font-medium hover:underline focus-visible:underline"
              style={{
                minHeight: 32,
                background: "var(--accent-muted)",
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              {brand.name}
            </Link>
          </li>
        ))}
      </ul>
      {moreBrands > 0 && (
        <Link
          href="/brands"
          className="inline-block text-xs mt-3 hover:underline focus-visible:underline"
          style={{ color: "var(--text-secondary)", textDecoration: "none" }}
        >
          {moreBrands} more brand{moreBrands === 1 ? "" : "s"}
        </Link>
      )}
    </section>
  );
}
