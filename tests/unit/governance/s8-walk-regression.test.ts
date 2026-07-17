import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";

const SRC = resolve(__dirname, "../../..");

function src(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf-8");
}

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) results.push(...findRouteFiles(full));
    else if (entry.name === "route.ts") results.push(full);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 3.1 — NAV-ORPHAN guard (F3 recurrence-killer, shipped S5→S8)
// Set-difference: settings sub-routes MINUS sidebar ACCOUNT_ITEMS = empty.
// Catches the NEXT orphan automatically — no hard-coded route list.
// ---------------------------------------------------------------------------
describe("3.1 — NAV-ORPHAN: every settings sub-route reachable from sidebar ACCOUNT section", () => {
  const sidebarSrc = src("components/domain/app-sidebar.tsx");
  const settingsDir = resolve(SRC, "app/(auth)/settings");

  // Explicit nav waiver — adding a route here requires a test change (review gate).
  // FINDING: /settings/notifications is an F3-class orphan (per-user prefs page, no sidebar entry).
  const NAV_WAIVER = new Set(["/settings/notifications"]);

  const settingsSubRoutes = readdirSync(settingsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(resolve(settingsDir, d.name, "page.tsx")))
    .map(d => `/settings/${d.name}`)
    .filter(r => !NAV_WAIVER.has(r));

  const accountBlock = sidebarSrc.split("ACCOUNT_ITEMS")[1]?.split("];")[0] ?? "";
  const sidebarHrefs = [...accountBlock.matchAll(/href:\s*"([^"]+)"/g)].map(m => m[1]);

  it("every settings sub-route has a sidebar ACCOUNT_ITEMS entry (set-difference = empty)", () => {
    const orphans = settingsSubRoutes.filter(r => !sidebarHrefs.includes(r));
    expect(orphans).toEqual([]);
  });

  it("ACCOUNT_ITEMS order: Team → Audit Trail → Data residency → Webhooks → View plans", () => {
    const labels = [...accountBlock.matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);
    expect(labels).toEqual(["Team", "Audit Trail", "Data residency", "Webhooks", "View plans"]);
  });

  it("sidebar renders ACCOUNT_ITEMS via .map (not hard-coded JSX)", () => {
    expect(sidebarSrc).toContain("ACCOUNT_ITEMS.map");
  });
});

// ---------------------------------------------------------------------------
// 3.2 — MIGRATION IDEMPOTENCY guard (F1 CRITICAL / MI-01)
// Every CREATE TABLE/INDEX/POLICY uses IF NOT EXISTS or DROP IF EXISTS.
// A re-run/partial-replay must not crash.
// ---------------------------------------------------------------------------
describe("3.2 — MI-01: S8 migrations are fully idempotent (re-runnable)", () => {
  const MIGRATION_FILES = [
    "db/migrations/0021_phase2_sprint8_governance.sql",
    "db/migrations/sprint-8-tables.sql",
  ];

  for (const file of MIGRATION_FILES) {
    const sqlContent = src(file);

    it(`${file}: every CREATE TABLE has IF NOT EXISTS`, () => {
      const stmts = [...sqlContent.matchAll(/CREATE TABLE\b[^(]*/gi)];
      expect(stmts.length).toBeGreaterThan(0);
      for (const m of stmts) {
        expect(m[0].toUpperCase()).toContain("IF NOT EXISTS");
      }
    });

    it(`${file}: every CREATE INDEX has IF NOT EXISTS`, () => {
      const stmts = [...sqlContent.matchAll(/CREATE (?:UNIQUE )?INDEX\b[^\n]*/gi)];
      for (const m of stmts) {
        expect(m[0].toUpperCase()).toContain("IF NOT EXISTS");
      }
    });

    it(`${file}: every CREATE POLICY preceded by DROP POLICY IF EXISTS`, () => {
      const lines = sqlContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const createMatch = lines[i].match(/CREATE POLICY\s+"([^"]+)"\s+ON\s+(\w+)/i);
        if (!createMatch) continue;
        const [, policyName, tableName] = createMatch;
        let foundDrop = false;
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (lines[j].match(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${policyName}"\\s+ON\\s+${tableName}`, "i"))) {
            foundDrop = true;
            break;
          }
        }
        expect(foundDrop).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3.3 — /api/auth/me contract guard (F7)
// Route must exist and return the shape governance pages consume.
// ---------------------------------------------------------------------------
describe("3.3 — /api/auth/me contract (F7 — route exists with expected shape)", () => {
  const meExists = existsSync(resolve(SRC, "app/api/auth/me/route.ts"));
  const meSrc = meExists ? src("app/api/auth/me/route.ts") : "";

  it("route module exists at app/api/auth/me/route.ts", () => {
    expect(meExists).toBe(true);
  });

  it("exports a GET handler", () => {
    expect(meSrc).toContain("export async function GET");
  });

  it("returns 401 for unauthenticated requests", () => {
    expect(meSrc).toContain("401");
    expect(meSrc).toContain("Unauthenticated");
  });

  it("response includes governance-consumed fields: id, organizationId, role, tier, email", () => {
    const blocks = meSrc.split("NextResponse.json(");
    const successBlock = blocks[blocks.length - 1].split(");")[0];
    for (const field of ["id:", "organizationId:", "role:", "tier:", "email:"]) {
      expect(successBlock).toContain(field);
    }
  });

  it("tier sourced from subscriptions table (not org)", () => {
    expect(meSrc).toContain("subscriptions.tier");
  });

  it("ROLE_MAP maps member→analyst", () => {
    expect(meSrc).toMatch(/member.*analyst/s);
  });
});

// ---------------------------------------------------------------------------
// 3.4 — PROVIDER display-name (F13) + no-hex-alpha (§13)
// ---------------------------------------------------------------------------
describe("3.4 — PROVIDER display (F13) + no-hex-alpha (§13)", () => {
  const tableSrc = src("components/domain/governance/residency-table.tsx");

  it("PROVIDER_DISPLAY has 'OpenAI' not 'Openai' (F13 naive-capitalize guard)", () => {
    const providerBlock = tableSrc.split("PROVIDER_DISPLAY")[1]?.split("};")[0] ?? "";
    expect(providerBlock).toContain('"OpenAI"');
    expect(providerBlock).not.toContain('"Openai"');
  });

  it("residency-table.tsx does not CSS-capitalize the provider column", () => {
    expect(tableSrc).not.toMatch(/capitalize/i);
  });

  it("no hex-alpha opacity suffix on governance component CSS vars", () => {
    const govDir = resolve(SRC, "components/domain/governance");
    const files = readdirSync(govDir).filter(f => f.endsWith(".tsx") || f.endsWith(".ts"));
    for (const file of files) {
      const content = readFileSync(resolve(govDir, file), "utf-8");
      const hexAlpha = content.match(/var\(--[a-z-]+\)[0-9a-fA-F]{2}/g) ?? [];
      expect(hexAlpha).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 3.5 — S8-01: event emits exist at source AND in fanout map
// ---------------------------------------------------------------------------
describe("3.5 — S8-01 event emits present at source and fanout-mapped", () => {
  it("'visibility/trend-updated' emitted in aggregate-visibility-trend.ts", () => {
    const trendSrc = src("inngest/functions/aggregate-visibility-trend.ts");
    expect(trendSrc).toContain('"visibility/trend-updated"');
  });

  it("'hallucination/acknowledged' emitted in hallucination acknowledge route", () => {
    const hallSrc = src("app/api/brands/[brandId]/hallucinations/[id]/route.ts");
    expect(hallSrc).toContain('"hallucination/acknowledged"');
  });

  it("fanout EVENT_NAME_MAP includes both S8-01 emits", () => {
    const fanoutSrc = src("inngest/functions/fanout-webhooks.ts");
    expect(fanoutSrc).toContain('"visibility/trend-updated"');
    expect(fanoutSrc).toContain('"hallucination/acknowledged"');
  });
});

// ---------------------------------------------------------------------------
// 3.6 — OQ-1: deferred local-SEO surface must NOT exist (canon §0.6 = DEFER)
// Guards the schema file, page, API route, component dir, Inngest fn, lib dir,
// nav entry, and serve() registration. If ANY reappear, the guard fires.
// ---------------------------------------------------------------------------
describe("3.6 — OQ-1: deferred local-SEO surface must not exist", () => {
  it("db/schema/local-seo-results.ts does not exist", () => {
    expect(existsSync(resolve(SRC, "db/schema/local-seo-results.ts"))).toBe(false);
  });

  it("local-seo page does not exist", () => {
    expect(existsSync(resolve(SRC, "app/(auth)/brands/[brandId]/local-seo/page.tsx"))).toBe(false);
  });

  it("local-seo API route does not exist", () => {
    expect(existsSync(resolve(SRC, "app/api/local-seo"))).toBe(false);
  });

  it("local-seo component directory does not exist", () => {
    expect(existsSync(resolve(SRC, "components/domain/local-seo"))).toBe(false);
  });

  it("local-seo-audit Inngest function does not exist", () => {
    expect(existsSync(resolve(SRC, "inngest/functions/local-seo-audit.ts"))).toBe(false);
  });

  it("lib/local-seo directory does not exist", () => {
    expect(existsSync(resolve(SRC, "lib/local-seo"))).toBe(false);
  });

  it("no nav entry points to local-seo", () => {
    const brandDetail = src("components/domain/brand/brand-detail-client.tsx");
    expect(brandDetail).not.toMatch(/local-seo/);
  });

  it("localSeoAuditFn is NOT in serve()", () => {
    const inngestRoute = src("app/api/webhooks/inngest/route.ts");
    expect(inngestRoute).not.toContain("localSeoAuditFn");
  });
});

// ---------------------------------------------------------------------------
// 3.7 — S8b-01: brand-access RETROFIT — assertBrandAccess on all brand routes
// Set-difference guard: routes without assertBrandAccess = empty.
// ---------------------------------------------------------------------------
describe("3.7 — S8b-01: brand-access RETROFIT — all brand-data routes enforce assertBrandAccess", () => {
  const brandApiDir = resolve(SRC, "app/api/brands/[brandId]");
  const brandRoutes = findRouteFiles(brandApiDir);

  it("at least 40 brand-data routes exist (sanity — detects accidental dir)", () => {
    expect(brandRoutes.length).toBeGreaterThanOrEqual(40);
  });

  it("every /api/brands/[brandId] route calls assertBrandAccess (set-difference = empty)", () => {
    const missing: string[] = [];
    for (const file of brandRoutes) {
      const content = readFileSync(file, "utf-8");
      if (!content.includes("assertBrandAccess(")) {
        missing.push(file.replace(/\\/g, "/").split("app/api/brands/")[1] ?? file);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3.8 — Inngest serve() registration: defined-but-not-registered = never runs
// ---------------------------------------------------------------------------
describe("3.8 — Inngest serve() registration completeness", () => {
  const serveSrc = src("app/api/webhooks/inngest/route.ts");

  it("every imported function appears in serve({ functions: [...] })", () => {
    const imports = [...serveSrc.matchAll(/import\s*\{\s*(\w+)\s*\}/g)]
      .map(m => m[1])
      .filter(name => name !== "serve" && name !== "inngest");
    const serveBlock = serveSrc.split("functions: [")[1]?.split("]")[0] ?? "";
    const unregistered = imports.filter(fn => !serveBlock.includes(fn));
    expect(unregistered).toEqual([]);
  });

  it("S8 governance functions are registered: fanoutWebhooksFn, deliverWebhookFn, auditDataRetention", () => {
    const serveBlock = serveSrc.split("functions: [")[1]?.split("]")[0] ?? "";
    for (const fn of ["fanoutWebhooksFn", "deliverWebhookFn", "auditDataRetention"]) {
      expect(serveBlock).toContain(fn);
    }
  });
});

// ---------------------------------------------------------------------------
// 3.9 — NAV-ORPHAN: brand-hub sub-routes reachable from their hub page (AA-17)
// Set-difference: hub sub-route pages MINUS segments linked in the hub = orphans.
// Catches the NEXT orphan automatically — covers ALL hubs, not just retrieval.
// ---------------------------------------------------------------------------
describe("3.9 — NAV-ORPHAN: every brand-hub sub-route reachable from its hub page", () => {
  const brandsDir = resolve(SRC, "app/(auth)/brands/[brandId]");

  // Sub-routes reached ONLY by in-page buttons, not hub nav — adding here requires a test change.
  const HUB_SUBROUTE_WAIVER = new Set([
    "workflow/drafts", // reached from task action buttons, not the workflow hub nav
  ]);

  const hubs = readdirSync(brandsDir, { withFileTypes: true })
    .filter(d => d.isDirectory()
      && existsSync(resolve(brandsDir, d.name, "page.tsx"))
      && readdirSync(resolve(brandsDir, d.name), { withFileTypes: true })
          .some(sub => sub.isDirectory() && existsSync(resolve(brandsDir, d.name, sub.name, "page.tsx")))
    )
    .map(d => d.name);

  it("at least 3 hubs with sub-routes exist (retrieval, trust, discovery)", () => {
    expect(hubs).toEqual(expect.arrayContaining(["retrieval", "trust", "discovery"]));
  });

  it("every hub sub-route has a link in its hub page (set-difference = empty)", () => {
    const orphans: string[] = [];

    for (const hub of hubs) {
      const hubDir = resolve(brandsDir, hub);

      // Read all .tsx files at the hub level (page + client components) to find links
      const hubSources = readdirSync(hubDir, { withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith(".tsx"))
        .map(f => readFileSync(resolve(hubDir, f.name), "utf-8"))
        .join("\n");

      const subRoutes = readdirSync(hubDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("[") && existsSync(resolve(hubDir, d.name, "page.tsx")))
        .map(d => d.name);

      for (const sub of subRoutes) {
        const qualifiedKey = `${hub}/${sub}`;
        if (HUB_SUBROUTE_WAIVER.has(qualifiedKey)) continue;
        if (!hubSources.includes(sub)) {
          orphans.push(qualifiedKey);
        }
      }
    }

    expect(orphans).toEqual([]);
  });
});
