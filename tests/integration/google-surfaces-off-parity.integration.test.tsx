/**
 * Google AI surfaces, Phase 1, part 0 (Sri, 1 Nov: "turning this on or off must not interrupt the
 * existing flow, not impact any existing feature, and not break anything") -- the off-parity golden.
 *
 * Runs the REAL audit pipeline on fixtures (both runners, MockLLM's recorded scenarios, a growth-plan
 * workspace) with every Google switch at its default (off), and compares everything an audit produces
 * with tests/integration/__golden__/google-surfaces-off-parity.json, which was written by THIS test on
 * the commit before any Google code existed (8f89390):
 * - the stored rows (audit, citations, engine_call_failures, cost snapshots)
 * - the headline and per-engine numbers (resolveAuditDimensionsAndHeadline)
 * - the run-audit step IDs, their order by phase, the events it sends, and its Inngest config
 * - the running page and the finished audit page (HTML), and GET /api/audits/[id] at both points
 * - GET /api/audits/[id]/full, the CSV export, the data handed to the PDF renderer, the narrative
 *   report's data, and the audit-complete email
 *
 * Volatile values (ids, timestamps, dates, times) are normalised; nothing else is. Regenerate the
 * golden only on purpose: UPDATE_GOLDEN=1 vitest run <this file>, and say why in the commit.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const GOLDEN = join(process.cwd(), "tests/integration/__golden__/google-surfaces-off-parity.json");

const { session, captured } = vi.hoisted(() => ({
  session: { organizationId: "" },
  captured: { pdfData: [] as unknown[], emails: [] as unknown[] },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: null, organizationId: session.organizationId })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/audits",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// What the PDF renderer is handed (its bytes carry render timestamps); the export route is unchanged.
vi.mock("@/lib/pdf/render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/render")>();
  return {
    ...actual,
    renderAuditPdf: vi.fn(async (data: unknown) => {
      captured.pdfData.push(data);
      return Buffer.from("%PDF-golden");
    }),
  };
});

vi.mock("@/lib/email/recipients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/recipients")>();
  return {
    ...actual,
    resolveNotificationRecipients: vi.fn(async () => ({
      enabled: true,
      recipients: ["owner@example.test"],
    })),
  };
});

vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendEmailOrThrow: vi.fn(async (email: unknown) => {
      captured.emails.push(email);
      return { id: "golden" };
    }),
  };
});

const ORG_ID = randomUUID();
const INNGEST_BRAND = randomUUID();
const INLINE_BRAND = randomUUID();
const INNGEST_AUDIT = randomUUID();
const INLINE_AUDIT = randomUUID();
const QUESTIONS = [
  "Golden parity: best plumber in Bondi, NSW?",
  "Golden parity: who do locals trust for a blocked drain in Bondi, NSW?",
  "Golden parity: licensed electrician in Bondi, NSW for a switchboard upgrade?",
];

let client: ReturnType<typeof postgres>;

// ---------------------------------------------------------------------------------------------
// Normalisation: only what changes run to run.
// ---------------------------------------------------------------------------------------------
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function normalizeText(text: string): string {
  return (
    text
      .replace(UUID, "<uuid>")
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<iso>")
      .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?/g, "<ts>")
      // The run's date in a recommendation ("checked 2026-11-11"): missed on 11 Nov, so the golden failed
      // the next day. The golden's one such value was set to <date> by hand (12 Nov), not regenerated.
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<date>")
      .replace(new RegExp(`\\b\\d{1,2} (?:${MONTHS})[a-z]* \\d{4}\\b`, "g"), "<date>")
      .replace(new RegExp(`\\b(?:${MONTHS})[a-z]* \\d{1,2},? \\d{4}\\b`, "g"), "<date>")
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?/gi, "<time>")
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "<date>")
      // How long the mock run took ("· 2s ·" in the page header).
      .replace(/· (?:\d+m )?\d+s ·/g, "· <duration> ·")
      .replace(/cus_test_<uuid>|sub_test_<uuid>/g, "<stripe>")
      .replace(/golden-off-parity-org-<uuid>/g, "<slug>")
  );
}

/** Rows from concurrent calls arrive in insert order: sort answer-shaped arrays by engine, then question. */
function rowKey(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const engine = r.engine;
  // /full's citations carry the question text, not its index.
  const index = r.promptIndex ?? r.prompt_index ?? r.prompt;
  if (typeof engine !== "string" || (typeof index !== "number" && typeof index !== "string")) {
    return null;
  }
  const at = typeof index === "number" ? String(index).padStart(4, "0") : index;
  return `${engine}:${at}:${String(r.runNumber ?? r.run_number ?? 1)}`;
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return "<date>";
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) {
    const items = value.map(normalize);
    if (items.length > 1 && items.every((v) => rowKey(v) !== null)) {
      return [...items].sort((a, b) => (rowKey(a) as string).localeCompare(rowKey(b) as string));
    }
    return items;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalize(v);
    return out;
  }
  return value;
}

/** A step stub that records each step ID, in call order, and runs it at once (no memoising). */
function recordingStep(onStep?: (name: string) => Promise<void>) {
  const log: { kind: "run" | "sendEvent"; id: string; event?: string; dataKeys?: string[] }[] = [];
  return {
    log,
    step: {
      run: async (name: string, fn: () => unknown) => {
        log.push({ kind: "run", id: name });
        const result = await fn();
        if (onStep) await onStep(name);
        return result;
      },
      sendEvent: async (name: string, payload: { name: string; data: Record<string, unknown> }) => {
        log.push({
          kind: "sendEvent",
          id: name,
          event: payload.name,
          dataKeys: Object.keys(payload.data).sort(),
        });
        return { ids: [] };
      },
    },
  };
}

/** The step IDs as a set, plus the order of phases (the call:* steps run concurrently). */
function stepShape(log: ReturnType<typeof recordingStep>["log"]) {
  const phases: string[] = [];
  for (const entry of log) {
    const phase = entry.id.startsWith("call:") ? "call:*" : entry.id;
    if (phases[phases.length - 1] !== phase) phases.push(phase);
  }
  return {
    ids: log.map((e) => e.id).sort(),
    phases,
    events: log.filter((e) => e.kind === "sendEvent"),
  };
}

async function auditPageHtml(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const html = renderToStaticMarkup(
    await AuditPage({ params: Promise.resolve({ auditId }), searchParams: Promise.resolve({}) }),
  );
  return normalizeText(html.replace(/<!-- -->/g, ""));
}

async function getJson(modulePath: "poll" | "full", auditId: string): Promise<unknown> {
  const mod =
    modulePath === "poll"
      ? await import("@/app/api/audits/[auditId]/route")
      : await import("@/app/api/audits/[auditId]/full/route");
  const res = await mod.GET(new Request(`http://localhost/api/audits/${auditId}`), {
    params: Promise.resolve({ auditId }),
  });
  return { status: res.status, body: normalize(await res.json()) };
}

async function exportOf(auditId: string, format: "csv" | "pdf" | "json"): Promise<unknown> {
  const { GET } = await import("@/app/api/audits/[auditId]/export/route");
  captured.pdfData.length = 0;
  const res = await GET(
    new Request(`http://localhost/api/audits/${auditId}/export?format=${format}`),
    {
      params: Promise.resolve({ auditId }),
    },
  );
  if (format === "csv") {
    // One row per answer, in insert order: the header, then the rows sorted.
    const [header, ...rows] = normalizeText(await res.text()).split("\n");
    return { status: res.status, header, rows: rows.sort() };
  }
  if (format === "json") return { status: res.status, body: normalize(await res.json()) };
  return { status: res.status, pdfData: normalize(captured.pdfData[0] ?? null) };
}

async function storedRows(auditId: string) {
  const [audit] = await client`
    SELECT audit_number, status, triggered_by, engines, prompts_count, runs_per_prompt, total_calls,
      score_composite, score_frequency, score_position, score_sentiment, score_sentiment_numeric,
      score_context, score_context_numeric, score_accuracy, score_confidence_low, score_confidence_high,
      confidence_intervals, engine_count, total_cost_usd, metadata, error_message, estimated_cost_cents,
      quality_status, prompt_pack_version, methodology_version,
      started_at IS NOT NULL AS started, completed_at IS NOT NULL AS completed, failed_at IS NOT NULL AS failed
    FROM audits WHERE id = ${auditId}
  `;
  const answers = await client`
    SELECT engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
      mention_verification, position, sentiment_label, sentiment_score, context_label, response_snippet,
      response_text, context_snippets, cited_sources, llm_cost_usd, llm_cost_source, stop_reason,
      answer_truncated, llm_tokens_used, llm_input_tokens, llm_output_tokens, llm_model,
      llm_model_answered, cited_source_type, cited_source_engine_affinity, is_accurate,
      hallucination_flags, is_cache_hit, cached_from_at
    FROM citations WHERE audit_id = ${auditId} ORDER BY engine, prompt_index, run_number
  `;
  const failures = await client`
    SELECT engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts,
      cost_usd, cost_source
    FROM engine_call_failures WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
  const costs = await client`
    SELECT source, market_code, locale, estimated_cost_cents, actual_cost_cents, prompt_count,
      provider_call_count
    FROM audit_cost_snapshots WHERE audit_id = ${auditId} ORDER BY source
  `;
  return normalize({ audit, answers, failures, costs });
}

async function headlineOf(auditId: string): Promise<unknown> {
  const { withRlsContext } = await import("@/db/client");
  const { resolveAuditDimensionsAndHeadline } = await import(
    "@/lib/scoring/resolve-audit-dimensions"
  );
  return normalize(
    await withRlsContext(ORG_ID, (tx) => resolveAuditDimensionsAndHeadline(tx, auditId)),
  );
}

async function reportDataOf(brandId: string, auditId: string): Promise<unknown> {
  const { withRlsContext } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const data = await withRlsContext(ORG_ID, (tx) =>
    buildReportData(tx, {
      organizationId: ORG_ID,
      brandId,
      periodType: "monthly",
      periodLabel: "November 2026",
      auditId,
      now: new Date("2026-11-20T00:00:00.000Z"),
    }),
  );
  return normalize(data);
}

async function completionEmail(auditId: string, brandId: string): Promise<unknown> {
  const { sendAuditCompleteEmail } = await import("@/inngest/functions/send-audit-complete-email");
  type Handler = (ctx: {
    event: { data: Record<string, string> };
    step: unknown;
  }) => Promise<unknown>;
  const fn = (sendAuditCompleteEmail as unknown as { fn: Handler }).fn;
  captured.emails.length = 0;
  const { step, log } = recordingStep();
  const result = await fn({
    event: { data: { auditId, brandId, organizationId: ORG_ID } },
    step,
  });
  return normalize({ result, steps: log.map((e) => e.id), emails: captured.emails });
}

function inngestConfig(fn: unknown): unknown {
  const opts = (fn as { opts?: Record<string, unknown> }).opts ?? {};
  return normalize({
    id: opts.id,
    retries: opts.retries,
    concurrency: opts.concurrency,
    throttle: opts.throttle ?? null,
    triggers: opts.triggers,
  });
}

// ---------------------------------------------------------------------------------------------

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.organizationId = ORG_ID;

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`golden-off-parity-${ORG_ID}`}, 'Golden Parity Plumbing Group', ${`golden-off-parity-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_test_${ORG_ID}`}, ${`sub_test_${ORG_ID}`}, 'price_test_growth', 'growth', 'monthly', 'active')
  `;
  for (const brandId of [INNGEST_BRAND, INLINE_BRAND]) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
        prompt_pack_generator_version, classification_status, classification, categories, audience,
        category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
      VALUES (${brandId}, ${ORG_ID}, 'Bondi Plumbing', 'bondiplumbing.com.au', 'tradies', 'au',
        ARRAY['NSW:Bondi']::text[], ${client.json(QUESTIONS)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
        ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
        ARRAY['trades_plumbing']::text[], 'households', now(), 'Bondi', 'NSW', 'Australia', 'fixed', now())
    `;
  }
  // The Inngest runner on the happy path; the inline runner with every ChatGPT call failing (a
  // deterministic failure scenario), so the failure rows, "N failed" and coverage notes are covered.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES
      (${INNGEST_AUDIT}, ${INNGEST_BRAND}, ${ORG_ID}, 1, 'manual', 'pending', ${client.json({ mockScenario: "happy_path" })}),
      (${INLINE_AUDIT}, ${INLINE_BRAND}, ${ORG_ID}, 2, 'manual', 'pending', ${client.json({ mockScenario: "openai_out_of_quota" })})
  `;
}, 60_000);

afterAll(async () => {
  await deleteOrgRows(client, ORG_ID);
  await client.end();
});

describe("Google AI surfaces off: the audit pipeline's output is identical to the commit before them", () => {
  it("both runners, every surface an audit reaches, match the golden from 8f89390", async () => {
    const { runAudit } = await import("@/inngest/functions/run-audit");
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    type Handler = (ctx: {
      event: { data: Record<string, string> };
      step: unknown;
    }) => Promise<unknown>;
    const fn = (runAudit as unknown as { fn: Handler }).fn;

    // The running page and its poll endpoint, captured the moment the prompt count is recorded.
    const running: Record<string, unknown> = {};
    const { step, log } = recordingStep(async (name) => {
      if (name === "record-prompt-count") {
        running.page = await auditPageHtml(INNGEST_AUDIT);
        running.poll = await getJson("poll", INNGEST_AUDIT);
      }
    });
    const inngestResult = await fn({
      event: { data: { auditId: INNGEST_AUDIT, organizationId: ORG_ID } },
      step,
    });
    await runAuditInline(INLINE_AUDIT);

    const actual = {
      runAuditConfig: inngestConfig(runAudit),
      inngest: {
        result: normalize(inngestResult),
        steps: stepShape(log),
        running,
        rows: await storedRows(INNGEST_AUDIT),
        headline: await headlineOf(INNGEST_AUDIT),
        page: await auditPageHtml(INNGEST_AUDIT),
        poll: await getJson("poll", INNGEST_AUDIT),
        full: await getJson("full", INNGEST_AUDIT),
        csv: await exportOf(INNGEST_AUDIT, "csv"),
        json: await exportOf(INNGEST_AUDIT, "json"),
        pdf: await exportOf(INNGEST_AUDIT, "pdf"),
        report: await reportDataOf(INNGEST_BRAND, INNGEST_AUDIT),
        email: await completionEmail(INNGEST_AUDIT, INNGEST_BRAND),
      },
      inline: {
        rows: await storedRows(INLINE_AUDIT),
        headline: await headlineOf(INLINE_AUDIT),
        page: await auditPageHtml(INLINE_AUDIT),
        poll: await getJson("poll", INLINE_AUDIT),
        full: await getJson("full", INLINE_AUDIT),
        csv: await exportOf(INLINE_AUDIT, "csv"),
        pdf: await exportOf(INLINE_AUDIT, "pdf"),
        report: await reportDataOf(INLINE_BRAND, INLINE_AUDIT),
        email: await completionEmail(INLINE_AUDIT, INLINE_BRAND),
      },
    };

    if (process.env.UPDATE_GOLDEN === "1") {
      mkdirSync(dirname(GOLDEN), { recursive: true });
      writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
    }
    // GOLDEN_DUMP=<path>: also write this run's output there, to diff a mismatch by hand.
    if (process.env.GOLDEN_DUMP)
      writeFileSync(process.env.GOLDEN_DUMP, JSON.stringify(actual, null, 2));
    expect(
      existsSync(GOLDEN),
      "golden missing: run once with UPDATE_GOLDEN=1 on the parent commit",
    ).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    // Compared part by part so a difference names the surface it's in.
    for (const runner of ["inngest", "inline"] as const) {
      for (const [part, value] of Object.entries(actual[runner])) {
        expect(JSON.parse(JSON.stringify(value)), `${runner}.${part}`).toEqual(
          golden[runner][part],
        );
      }
    }
    expect(JSON.parse(JSON.stringify(actual.runAuditConfig)), "runAuditConfig").toEqual(
      golden.runAuditConfig,
    );
  }, 300_000);
});
