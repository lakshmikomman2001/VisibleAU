/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- no page fails silently. A client component whose
 * fetch failed used to show what it would show for no data: "No activity yet", "No brands found", a form's
 * defaults as if saved, "Not measured yet", or nothing at all. Each did it through one of a few shapes, and
 * this scan fails on any of them in a client component:
 *
 * - `if (res.ok) setX(...)` with nothing for a failure;
 * - `if (!res.ok) return;` (a bare return: the page carries on as if it worked);
 * - `.then((r) => r.json())` (an error body read as the data);
 * - `r.ok ? r.json() : null` / `!r.ok ? null : ...` (a failure as "no data");
 * - `.catch(() => {})`, `.catch(() => [])`, `.catch(() => null)` on a fetch, and an empty `catch {}`.
 *
 * A load goes through useLoad / useJson / useGatedJson (lib/hooks/use-load.ts) and fetchJson / readJson
 * (lib/load/fetch-json.ts); a button through usePostAction (lib/hooks/use-action.ts) or
 * actionFailureMessage. Reading a failed answer's body for its reason (`res.json().catch(() => null)`) is
 * allowed: it doesn't decide what the page shows.
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const ROOTS = ["app", "components", "lib"];
const CLIENT_FILE = /\.tsx?$/;
readSourcesBeforeAll(ROOTS, CLIENT_FILE);

const SHAPES: Array<[name: string, pattern: RegExp]> = [
  ["a success branch with no failure (`if (res.ok) setX(...)`)", /if \(\s*\w+\.ok\s*\)\s*set\w+\(/],
  [
    "a bare return on a failed answer (`if (!res.ok) return;`)",
    /if \(\s*!\w+\.ok\s*\)\s*return\s*;/,
  ],
  [
    "an answer read with no ok check (`.then((r) => r.json())`)",
    /\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.json\(\)\s*\)/,
  ],
  [
    // With `await` and parentheses too (`res.ok ? ((await res.json())?.audit ?? null) : null`): the autopilot
    // and health-check pages had that, and the first version of this pattern let it through.
    "a failure as no data (`r.ok ? r.json() : null`)",
    /\.ok\s*\?\s*[(\s]*(await\s+)?[(\s]*\w+\.json\(\)[^:]*:\s*(null|undefined|\[\]|\{\})/,
  ],
  [
    "a failure as no data (`!r.ok ? null : ...`)",
    /!\s*\w+\.ok\s*\?\s*(null|undefined|\[\]|\{\})\s*:/,
  ],
  [
    "a swallowed failure (`.catch(() => {})`, `[]`, `null`)",
    /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|\[\]|null|undefined|\(\s*\{\s*\}\s*\))\s*\)/,
  ],
  ["an empty `catch {}`", /catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/],
];

/** A failed answer's body read for its reason: it doesn't decide what the page shows. */
const READS_A_BODY = /\.json\(\)\s*\.catch\(/;

/**
 * Each a line that matches a shape but handles the failure, with why. `file` + the line's text (trimmed).
 * A new entry needs its reason; a line that no longer matches fails the last test, so this list can't rot.
 */
const HANDLED: Array<{ file: string; line: string; why: string }> = [
  {
    file: "app/invite/[orgId]/[token]/invite-client.tsx",
    line: '} else if (res.ok) setState({ kind: "accepted" });',
    why: "one branch of an if/else chain whose last else sets the error state",
  },
  {
    file: "app/invite/[orgId]/[token]/invite-client.tsx",
    line: ").catch(() => null);",
    why: "a null answer goes to the error state on the next lines (`res?.ok`)",
  },
  {
    file: "app/sign-in/[[...sign-in]]/sign-in-form.tsx",
    line: ").catch(() => null);",
    why: 'a null answer falls through to setError("Sign in failed")',
  },
  {
    file: "components/domain/auth/invite-sign-up.tsx",
    line: "}).catch(() => null);",
    why: "a null answer falls through to the error message (`res?.ok`)",
  },
  {
    file: "components/domain/brand/competitor-websites-form.tsx",
    line: "}).catch(() => null);",
    why: 'a null answer is `!res?.ok`: setStatus("error") with a message',
  },
  {
    file: "components/domain/onboarding/welcome-modal.tsx",
    line: "} catch {}",
    why: "marking onboarding done when the modal closes: nothing is shown from it, and a miss shows the modal again next time",
  },
];

interface Hit {
  file: string;
  line: number;
  text: string;
  shape: string;
}

function clientFiles(): string[] {
  return sourcePaths(ROOTS, CLIENT_FILE).filter((path) =>
    sourceText(path).startsWith('"use client"'),
  );
}

function hits(): Hit[] {
  const out: Hit[] = [];
  for (const file of clientFiles()) {
    sourceText(file)
      .split("\n")
      .forEach((raw, i) => {
        const text = raw.trim();
        if (text.startsWith("//") || text.startsWith("*") || READS_A_BODY.test(text)) return;
        for (const [shape, pattern] of SHAPES) {
          if (pattern.test(text)) out.push({ file, line: i + 1, text, shape });
        }
      });
  }
  return out;
}

const handled = (hit: Hit) => HANDLED.some((h) => h.file === hit.file && h.line === hit.text);

describe("no client component's fetch fails into empty data", () => {
  it("finds the client components (the scan reads something)", () => {
    expect(clientFiles().length).toBeGreaterThan(100);
  });

  it("no fetch failure is dropped, read as data, or shown as nothing", () => {
    const found = hits()
      .filter((hit) => !handled(hit))
      .map((hit) => `${hit.file}:${hit.line} ${hit.shape}: ${hit.text}`);
    expect(found).toEqual([]);
  });

  it("each allowed line still exists and still matches (the list can't rot)", () => {
    const all = hits();
    const stale = HANDLED.filter(
      (h) => !all.some((hit) => hit.file === h.file && hit.text === h.line),
    );
    expect(stale.map((h) => `${h.file}: ${h.line}`)).toEqual([]);
    for (const h of HANDLED) expect(h.why.length).toBeGreaterThan(10);
  });

  it("catches each shape (the patterns aren't vacuous)", () => {
    const samples = [
      "if (res.ok) setData(await res.json());",
      "if (!meRes.ok) return;",
      ".then((r) => r.json())",
      "fetch(url).then((r) => (r.ok ? r.json() : null)),",
      "const site = siteRes.ok ? await siteRes.json() : null;",
      "const tasksData = tasksRes.ok ? await tasksRes.json() : [];",
      "const audit = auditRes.ok ? ((await auditRes.json())?.audit ?? null) : null;",
      ".then(async (r) => ((await planRefused(r)) || !r.ok ? null : r.json()))",
      ".catch(() => {});",
      "} catch {}",
    ];
    for (const sample of samples) {
      expect(
        SHAPES.some(([, pattern]) => pattern.test(sample)),
        sample,
      ).toBe(true);
    }
    expect(READS_A_BODY.test("const body = await res.json().catch(() => null);")).toBe(true);
  });
});
