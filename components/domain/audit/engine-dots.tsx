import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import type { EngineResult } from "@/lib/questions/questions-view";

/**
 * S02 part 4 (contract EngineDots, P02.row; D-UI6): one question's last result per engine, in the contract's fixed
 * order -- 12 x 12 squares: named (a tick on --success), unverified (the audit page's "Maybe": mentioned, not
 * confirmed as the business; "?" on --warning-soft), not named (empty, --bg-active), failed (a hatch). Fill, glyph and
 * hatch differ, so colour is never the only signal; the whole group is one image with the full sentence.
 */
const ORDER = ["chatgpt", "claude", "gemini", "perplexity"] as const;

const TIP: Record<EngineResult, (engine: string) => string> = {
  named: (e) => `${e}: named you`,
  unverified: (e) => `${e}: mentioned, not confirmed as you`,
  not_named: (e) => `${e}: didn't name you`,
  failed: (e) => `${e}: answer failed`,
};

const nameOf = (engine: string) =>
  ENGINE_DISPLAY_NAMES[engine as keyof typeof ENGINE_DISPLAY_NAMES] ?? engine;

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Named you on ChatGPT; unconfirmed on Gemini; not on Claude; failed on Perplexity" (empty groups left out). */
export function engineDotsLabel(
  results: Record<string, EngineResult>,
  engines: readonly string[],
): string {
  const of = (r: EngineResult) => engines.filter((e) => results[e] === r).map(nameOf);
  const parts = [
    of("named").length ? `Named you on ${list(of("named"))}` : null,
    of("unverified").length ? `unconfirmed on ${list(of("unverified"))}` : null,
    of("not_named").length ? `not on ${list(of("not_named"))}` : null,
    of("failed").length ? `failed on ${list(of("failed"))}` : null,
  ].filter((p): p is string => p !== null);
  const sentence = parts.join("; ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

const BASE = {
  width: 12,
  height: 12,
  borderRadius: 3,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 8,
  fontWeight: 700,
  lineHeight: 1,
  boxSizing: "border-box" as const,
};

const LOOK: Record<EngineResult, React.CSSProperties> = {
  named: {
    background: "var(--success)",
    border: "1px solid var(--success)",
    color: "var(--success-fg)",
  },
  unverified: {
    background: "var(--warning-soft)",
    border: "1px solid var(--warning)",
    color: "var(--warning)",
  },
  not_named: { background: "var(--bg-active)", border: "1px solid var(--border-default)" },
  failed: {
    background:
      "repeating-linear-gradient(45deg, var(--text-tertiary) 0 1.5px, var(--bg-active) 1.5px 4px)",
    border: "1px solid var(--border-default)",
  },
};

export function EngineDots({
  results,
  engines,
}: {
  results: Record<string, EngineResult>;
  /** The engines the audit asked (a Free audit asks two). */
  engines: readonly string[];
}) {
  const asked = ORDER.filter((e) => engines.includes(e) && results[e]);
  if (asked.length === 0) return null;
  return (
    <span className="inline-flex items-center" style={{ gap: 6 }} data-testid="p02-row-dots">
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Named you:</span>
      <span
        role="img"
        aria-label={engineDotsLabel(results, asked)}
        className="inline-flex"
        style={{ gap: 3 }}
      >
        {asked.map((engine) => {
          const result = results[engine];
          return (
            <span
              key={engine}
              title={TIP[result](nameOf(engine))}
              data-engine={engine}
              data-result={result}
              style={{ ...BASE, ...LOOK[result] }}
            >
              {result === "named" ? "✓" : result === "unverified" ? "?" : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
