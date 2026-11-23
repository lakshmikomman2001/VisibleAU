import Link from "next/link";
import { type BeyondAiAnswers, type BeyondTone, beyondTileViews } from "@/lib/reports/beyond-ai";

/**
 * S01 part 6 (contract P07.beyond, LLD 8.1.4): the audit page's "Beyond AI answers" card -- business identity, YouTube,
 * AI crawlers and the website's technical score, each with its own date, from getBeyondAiAnswers. Shown only while
 * report_v2 is on (the caller decides). Separate from the Visibility score: nothing here is ever counted in it.
 */

const PILL: Record<BeyondTone, { color: string; background: string }> = {
  good: { color: "var(--success)", background: "var(--success-soft)" },
  warn: { color: "var(--warning)", background: "var(--warning-soft)" },
  bad: { color: "var(--danger)", background: "var(--danger-soft)" },
  neutral: { color: "var(--text-secondary)", background: "var(--bg-subtle)" },
};

export function BeyondAiCard({ answers, brandId }: { answers: BeyondAiAnswers; brandId: string }) {
  const tiles = beyondTileViews(answers, brandId);
  return (
    <section
      data-testid="p07-beyond"
      aria-labelledby="p07-beyond-title"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 24,
        marginTop: 24,
      }}
    >
      <div
        className="flex flex-wrap items-baseline justify-between gap-2"
        style={{ marginBottom: 16 }}
      >
        <h3
          id="p07-beyond-title"
          style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
        >
          Beyond AI answers
        </h3>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          Separate from the Visibility score
        </span>
      </div>
      {/* Contract P07 responsive: 1 column <= 640, 2 from 641, 4 from 1100. Both are arbitrary breakpoints on purpose:
          Tailwind v4 emits arbitrary min-[...] rules before the named ones, so sm:grid-cols-2 would override 4. */}
      <ul
        data-testid="p07-beyond-tiles"
        className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2 min-[1100px]:grid-cols-4"
        style={{ margin: 0, padding: 0 }}
      >
        {tiles.map((t) => {
          const value = t.value ? `${t.value.main} ${t.value.of}` : (t.pill?.text ?? "");
          const detail = [...t.lines.map((l) => l.text), t.action?.text].filter(Boolean).join(", ");
          return (
            <li
              key={t.key}
              data-testid={`p07-beyond-${t.key}`}
              aria-label={`${t.label}: ${value}${detail ? `, ${detail}` : ""}`}
              style={{
                listStyle: "none",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 16,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                {t.label}
              </div>
              {t.value ? (
                <div style={{ marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 22,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {t.value.main}
                  </span>{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {t.value.of}
                  </span>
                </div>
              ) : null}
              {t.pill ? (
                <span
                  data-tone={t.pill.tone}
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 9999,
                    padding: "2px 8px",
                    marginBottom: 6,
                    ...PILL[t.pill.tone],
                  }}
                >
                  {t.pill.text}
                </span>
              ) : null}
              {t.lines.map((l) => (
                <p
                  key={l.text}
                  data-tone={l.tone ?? ""}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    lineHeight: 1.5,
                    margin: "2px 0 0",
                    overflowWrap: "anywhere",
                    color: l.tone === "warn" ? "var(--warning)" : "var(--text-tertiary)",
                  }}
                >
                  {l.text}
                </p>
              ))}
              {t.action ? (
                <Link
                  href={t.action.href}
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontSize: 12,
                    color: "var(--accent-blue)",
                    textDecoration: "underline",
                  }}
                >
                  {t.action.text}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
