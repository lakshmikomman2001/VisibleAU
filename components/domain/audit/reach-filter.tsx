"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";

/**
 * S04B part 4 (LLD amendment 102; contract P07.reachFilter): "All areas · {reaches}" above the audit page's per-engine
 * table, for an audit with more than one reach. The choice filters the per-engine table and the competitor context to
 * that reach's answers; the page recomputes them on the server from one grouped read (lib/reach/views.ts). It lives in
 * the URL (?area=state), like the page's tabs: "All areas" (no ?area) is the page as it was, and the choice isn't kept
 * between audits. A radiogroup of radios, as P03's Area: arrow keys move and choose.
 */
export function ReachFilter({
  options,
  selected,
}: {
  /** "All areas" first, then the audit's reaches in reach order, with the Questions tab's labels. */
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const name = useId();
  const choose = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("area");
    else next.set("area", value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  return (
    <fieldset
      data-testid="p07-reach-filter"
      style={{ border: "none", padding: 0, margin: "0 0 12px" }}
    >
      <legend className="sr-only">Area</legend>
      <div
        role="radiogroup"
        aria-label="Area"
        className="flex flex-wrap w-full min-[641px]:inline-flex min-[641px]:w-auto"
        style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: 2 }}
      >
        {options.map((o) => {
          const on = o.value === selected;
          return (
            <label
              key={o.value}
              data-testid="p07-reach-filter-option"
              data-value={o.value}
              className="flex-1 min-[641px]:flex-none justify-center text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--accent-blue)]"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: on ? 600 : 500,
                cursor: "pointer",
                background: on ? "var(--accent-blue-soft)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                onChange={() => choose(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
