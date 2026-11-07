"use client";

import { useId, useState } from "react";

/**
 * Fair competitor counting (7 Nov): each competitor's website, which is what verifies a mention of it
 * (its site among the sources the answer cited). A competitor without one can't be verified, so share
 * of voice leaves it out and says so. Saved through PATCH /api/brands/[brandId] (competitorWebsites),
 * which normalises each address and keeps only this brand's competitors.
 */
export function CompetitorWebsitesForm({
  brandId,
  competitors,
  websites,
}: {
  brandId: string;
  competitors: readonly string[];
  websites: Readonly<Record<string, string>>;
}) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(competitors.map((name) => [name, websites[name] ?? ""])),
  );
  const [saved, setSaved] = useState<Record<string, string>>({ ...websites });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (competitors.length === 0) return null;
  const missing = competitors.filter((name) => !saved[name]).length;

  async function save() {
    setStatus("saving");
    setError(null);
    const res = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorWebsites: values }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !body?.brand) {
      setStatus("error");
      setError(
        typeof body?.error === "string" ? body.error : "Couldn't save the websites. Try again.",
      );
      return;
    }
    const stored: Record<string, string> = body.brand.competitorWebsites ?? {};
    setSaved(stored);
    setValues(Object.fromEntries(competitors.map((name) => [name, stored[name] ?? ""])));
    setStatus("saved");
  }

  return (
    <form
      data-competitor-websites=""
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        Competitor websites: a mention of a competitor counts in share of voice only when its own
        site is among the sources the answer cited, the way yours is verified.
        {missing > 0 &&
          ` ${missing} ${missing === 1 ? "has" : "have"} no website yet, so ${missing === 1 ? "it's" : "they're"} left out.`}
      </p>
      {competitors.map((name, i) => (
        <div key={name} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <label
            htmlFor={`${formId}-${i}`}
            style={{ fontSize: 12, color: "var(--text-primary)", minWidth: 140 }}
          >
            {name}
          </label>
          <input
            id={`${formId}-${i}`}
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="their website, e.g. example.com.au"
            value={values[name] ?? ""}
            onChange={(event) => {
              setValues((v) => ({ ...v, [name]: event.target.value }));
              setStatus("idle");
            }}
            style={{
              flex: "1 1 200px",
              minWidth: 0,
              height: 36,
              padding: "0 10px",
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--bg-base)",
              color: "var(--text-primary)",
            }}
          />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="submit"
          disabled={status === "saving"}
          style={{
            height: 36,
            padding: "0 14px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: "none",
            background: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
            cursor: status === "saving" ? "default" : "pointer",
          }}
        >
          {status === "saving" ? "Saving…" : "Save websites"}
        </button>
        <span
          role="status"
          style={{ fontSize: 12, color: error ? "var(--danger)" : "var(--text-tertiary)" }}
        >
          {status === "saved" ? "Saved" : (error ?? "")}
        </span>
      </div>
    </form>
  );
}
