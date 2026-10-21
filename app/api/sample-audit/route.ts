import { after, NextResponse } from "next/server";
import { z } from "zod/v4";
import { AU_STATES } from "@/lib/constants/au";
import { AU_LOCATIONS } from "@/lib/locations";
import { checkSampleAuditDailyCap } from "@/lib/sample-audit/daily-cap";
import { checkSampleAuditRateLimit } from "@/lib/sample-audit/rate-limit";
import { runSampleAudit } from "@/lib/sample-audit/run";

const AU_STATE_CODES = AU_STATES.map((s) => s.code) as [string, ...string[]];

// Reliability follow-up, item 4 -- "My suburb isn't listed": the same
// character set/length the task specifies, deliberately more
// permissive than the wizard's own existing free-text check
// (lib/locations.ts's SUBURB_ENTRY_REGEX allows letters/spaces only --
// no hyphens or apostrophes, which real AU suburb names do use, e.g.
// O'Connor, O'Malley). Letters, spaces, hyphens and apostrophes,
// 2-40 characters.
const CUSTOM_SUBURB_REGEX = /^[A-Za-z][A-Za-z\s'-]{1,39}$/;

// Audit reliability, Part C, item 4 / reliability follow-up item 4 --
// a visitor picks EITHER one of the curated AU_LOCATIONS values (the
// same list the wizard uses) OR, when their suburb isn't in that
// 20-entry list, types it plus a real AU state. Never a free-text
// field validated by shape alone with no closed set anywhere: the
// curated branch must always resolve to a REAL curated suburb/city/
// state (findLocation() would otherwise reject it at runSampleAudit),
// and the custom branch's state must be a real AU_STATE_CODES value.
const sampleAuditSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
  vertical: z.string().min(1).max(100),
  location: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("curated"),
      value: z.enum(AU_LOCATIONS.map((l) => l.value) as [string, ...string[]]),
    }),
    z.object({
      type: z.literal("custom"),
      suburb: z
        .string()
        .trim()
        .regex(CUSTOM_SUBURB_REGEX, "Letters, spaces, hyphens and apostrophes only, 2-40 characters"),
      state: z.enum(AU_STATE_CODES),
    }),
  ]),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { allowed, remaining, retryAfterSeconds } = await checkSampleAuditRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "You've used your 3 free sample audits for today. Please try again tomorrow, or sign up for unlimited audits.",
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sampleAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Vunnara (sample-audit follow-up, 20 Oct), item 5: checked BEFORE
  // runSampleAudit does anything -- a brand/audit row, let alone an
  // engine call -- so a tripped cap costs nothing and the caller gets
  // an honest, friendly reason immediately, never a fake/fabricated
  // result and never silence. This is a GLOBAL cap (every sample audit
  // shares one synthetic organisation, lib/sample-audit/daily-cap.ts),
  // not per-IP -- the IP rate limit above already bounds one caller's
  // own usage; this bounds the whole public feature's spend.
  const dailyCap = await checkSampleAuditDailyCap();
  if (!dailyCap.allowed) {
    return NextResponse.json(
      { error: "Samples are busy right now — please try again later." },
      { status: 503 },
    );
  }

  try {
    const { completion, ...result } = await runSampleAudit(
      parsed.data.domain,
      parsed.data.vertical,
      parsed.data.location,
    );
    // Vunnara (sample-audit follow-up, 20 Oct): on a serverless
    // platform (this project deploys to Vercel), nothing guarantees
    // code keeps running once the response below has been sent --
    // without `waitUntil`/`after()`, the execution environment can be
    // frozen mid-flight, silently killing the sample before it ever
    // writes a citation. `after()` must be called from within an
    // active Next.js request scope -- it throws otherwise (confirmed
    // directly: Next.js's own after.ts checks
    // workAsyncStorage.getStore()). That's true when this Route
    // Handler is actually served by Next.js, but NOT when it's invoked
    // directly (a test calling `POST(req)` with no real request
    // context, e.g. this route's own integration test) -- `completion`
    // is already running regardless (started inside runSampleAudit,
    // same fire-and-forget as before this fix), so the fallback below
    // just keeps that same pre-existing behaviour instead of 500-ing
    // the whole request over a platform API that genuinely isn't
    // available in that context.
    try {
      after(completion);
    } catch {
      completion.catch(() => {});
    }
    return NextResponse.json(result, {
      status: 201,
      headers: { "X-RateLimit-Remaining": String(remaining) },
    });
  } catch (err) {
    console.error("[sample-audit] Failed:", err);
    return NextResponse.json({ error: "Failed to start sample audit" }, { status: 500 });
  }
}
