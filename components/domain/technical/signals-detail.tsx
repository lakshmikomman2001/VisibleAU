import { AlertCircle, Shield } from "lucide-react";

interface NegativeSignalRow {
  pattern: string;
  severity: string;
  count: number;
  detail?: string;
}

interface PromptInjectionRow {
  pattern: string;
  severity: string;
  element: string;
  detail?: string;
  pagesAffected?: string[];
}

const PATTERN_LABELS: Record<string, string> = {
  "cta-overload": "CTA overload",
  "popup-density": "Popup density",
  "thin-content": "Thin content",
  "keyword-stuffing": "Keyword stuffing",
  "missing-author": "Missing author",
  "high-boilerplate": "High boilerplate ratio",
  "ad-density": "Ad density",
  "hidden-text": "Hidden text",
  "invisible-unicode": "Invisible Unicode",
  "llm-instruction": "LLM-instruction injection",
  "html-comment-injection": "HTML comment injection",
  "monochrome-text": "Monochrome text",
  "micro-font": "Micro-font text",
  "data-attr-injection": "Data-attribute injection",
  "aria-hidden-abuse": "aria-hidden abuse",
};

const ACRONYMS = /\b(Cta|Html|Llm|Ssr|Ai|Json|Url)\b/g;

function patternLabel(pattern: string): string {
  if (PATTERN_LABELS[pattern]) return PATTERN_LABELS[pattern];
  return pattern
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(ACRONYMS, (m) => m.toUpperCase());
}

function extractLocator(detail: string | undefined, pattern: string): string | null {
  if (!detail) return null;
  if (pattern === "keyword-stuffing") {
    const term = detail.match(/^'([^']+)'/)?.[1];
    if (term) return `'${term}'`;
  }
  const path = detail.match(/ on (\/\S+)/)?.[1];
  if (path) return path;
  const siteWide = detail.match(/site-wide \(\d+ pages\)/);
  if (siteWide) return siteWide[0];
  return null;
}

function severityColor(severity: string): { bg: string; fg: string } {
  if (severity === "critical") return { bg: "var(--danger-soft)", fg: "var(--danger)" };
  if (severity === "warning") return { bg: "var(--warning-soft)", fg: "var(--warning)" };
  return { bg: "var(--bg-subtle)", fg: "var(--text-tertiary)" };
}

export function SignalsDetail({
  negativeSignals,
  promptInjections,
}: {
  negativeSignals: NegativeSignalRow[];
  promptInjections: PromptInjectionRow[];
}) {
  return (
    <>
      {/* Negative Signals */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 24 }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Negative signals
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          ({negativeSignals.length})
        </span>
      </div>

      {negativeSignals.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
            No negative signals detected.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {negativeSignals.map((sig, i) => {
            const tone = severityColor(sig.severity);
            const locator = extractLocator(sig.detail, sig.pattern);
            return (
              <section
                // biome-ignore lint/suspicious/noArrayIndexKey: static server-rendered list, no reordering
                key={`neg-${sig.pattern}-${i}`}
                aria-label={`${patternLabel(sig.pattern)}: ${sig.severity}`}
                style={{
                  padding: 20,
                  borderRadius: 8,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <AlertCircle
                    style={{
                      width: 20,
                      height: 20,
                      marginTop: 2,
                      flexShrink: 0,
                      color: tone.fg,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        {patternLabel(sig.pattern)}
                        {locator && (
                          <span
                            style={{
                              fontWeight: 400,
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {" "}
                            · {locator}
                          </span>
                        )}
                      </h3>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          background: tone.bg,
                          color: tone.fg,
                        }}
                      >
                        {sig.severity}
                      </span>
                    </div>
                    {sig.detail && (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          margin: "4px 0 0",
                        }}
                      >
                        {sig.detail}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Prompt Injection Detections */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Shield style={{ width: 16, height: 16, color: "var(--text-tertiary)" }} />
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Prompt injection detections
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          ({promptInjections.length})
        </span>
      </div>

      {promptInjections.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
            No prompt injection detected.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {promptInjections.map((inj, i) => {
            const tone = severityColor(inj.severity);
            const locator = extractLocator(inj.detail, inj.pattern);
            return (
              <section
                // biome-ignore lint/suspicious/noArrayIndexKey: static server-rendered list, no reordering
                key={`inj-${inj.pattern}-${i}`}
                aria-label={`${patternLabel(inj.pattern)}: ${inj.severity}`}
                style={{
                  padding: 20,
                  borderRadius: 8,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <AlertCircle
                    style={{
                      width: 20,
                      height: 20,
                      marginTop: 2,
                      flexShrink: 0,
                      color: tone.fg,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <h3
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        {patternLabel(inj.pattern)}
                        {locator && (
                          <span
                            style={{
                              fontWeight: 400,
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {" "}
                            · {locator}
                          </span>
                        )}
                      </h3>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          background: tone.bg,
                          color: tone.fg,
                        }}
                      >
                        {inj.severity}
                      </span>
                    </div>
                    {inj.detail && (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          margin: "0 0 8px",
                        }}
                      >
                        {inj.detail}
                      </p>
                    )}
                    {inj.pagesAffected && inj.pagesAffected.length > 1 && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          margin: "0 0 8px",
                        }}
                      >
                        Found on {inj.pagesAffected.length} pages: {inj.pagesAffected.join(", ")}
                      </p>
                    )}
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        overflowX: "auto",
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {inj.element}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Why this matters */}
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Shield
          style={{
            width: 16,
            height: 16,
            marginTop: 2,
            flexShrink: 0,
            color: "var(--accent-primary)",
          }}
        />
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <strong>Why this matters:</strong> Modern LLMs are trained to distrust pages that use
          manipulation. Hidden text, injected instructions, and spammy signals can get a site
          down-weighted or skipped entirely as a citation source — the opposite of the intended
          effect. Removing these is one of the fastest trust wins.
        </div>
      </div>
    </>
  );
}
