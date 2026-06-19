import path from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: path.resolve(process.cwd(), ".env.local") });

const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.includes("better-auth"))?.split(";")[0];
  if (!session) throw new Error("No session cookie");
  return session;
}

async function setOrgTierToAgency() {
  console.log("[setup] Setting org tier to 'agency'...");
  const { organizations } = await import("../db/schema/organizations.js");
  await db.update(organizations).set({ tier: "agency" });
  console.log("[setup] ✓ All organizations set to agency tier (4 engines)");
}

async function createBrand(
  cookie: string,
  name: string,
  domain: string,
  vertical: string,
  competitors: string[],
  regions: string[],
) {
  console.log(`[brand] Creating: ${name} (${domain})...`);
  const res = await fetch(`${BASE}/api/brands`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, domain, vertical, competitors, primaryRegions: regions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create brand failed: ${JSON.stringify(data)}`);
  console.log(`[brand] ✓ Created: ${data.brand.id}`);
  return data.brand;
}

async function runAudit(cookie: string, brandId: string) {
  console.log(`[audit] Triggering audit for brand ${brandId}...`);
  const start = Date.now();
  const res = await fetch(`${BASE}/api/audits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ brandId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create audit failed: ${JSON.stringify(data)}`);
  console.log(`[audit] ✓ Audit created: ${data.auditId} (#${data.auditNumber})`);
  return { auditId: data.auditId, startTime: start };
}

async function pollAuditStatus(cookie: string, auditId: string, maxWaitSec = 600) {
  console.log(`[poll] Waiting for audit ${auditId} to complete (max ${maxWaitSec}s)...`);
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWaitSec) {
    const res = await fetch(`${BASE}/api/audits/${auditId}`, {
      headers: { Cookie: cookie },
    });
    if (res.ok) {
      const data = await res.json();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const status = data.audit?.status ?? data.status;
      const progress = data.audit?.metadata?.progress ?? "?";
      console.log(`[poll] ${elapsed}s — status: ${status}, progress: ${progress}%, citations: ${data.citationCount ?? 0}`);
      if (status === "completed" || status === "complete" || status === "failed") {
        return { status, ...data };
      }
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("Audit timed out");
}

async function getAuditResults(auditId: string) {
  console.log(`[results] Fetching audit results from DB...`);
  const { audits } = await import("../db/schema/audits.js");
  const { citations } = await import("../db/schema/citations.js");
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
  const allCitations = await db.select().from(citations).where(eq(citations.auditId, auditId));
  return { audit, citations: allCitations };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  VisibleAU — Real LLM End-to-End Audit Test            ║");
  console.log("║  Environment: PRODUCTION (real API calls)               ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Pre-flight
  console.log(`LLM_MODE: ${process.env.LLM_MODE}`);
  console.log(`DATABASE: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@")}`);
  console.log(`OPENAI:   ${process.env.OPENAI_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`ANTHROPIC: ${process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`GOOGLE:   ${process.env.GOOGLE_AI_API_KEY ? "✓ set" : "✗ MISSING"}`);
  console.log(`PERPLEXITY: ${process.env.PERPLEXITY_API_KEY ? "✓ set" : "✗ MISSING"}\n`);

  // Setup
  await setOrgTierToAgency();
  const cookie = await signIn("sri@visibleau.local", "password123");
  console.log("[auth] ✓ Signed in as sri@visibleau.local\n");

  // ═══ TEST 1: Canva (well-known AU brand — expect HIGH scores) ═══
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  TEST 1: Canva (real AU brand — expect HIGH scores)");
  console.log("═══════════════════════════════════════════════════════════\n");

  const canva = await createBrand(
    cookie,
    "Canva",
    "canva.com",
    "saas",
    ["Adobe Express", "Figma", "Microsoft Designer"],
    ["NSW:Sydney CBD"],
  );

  const canvaAudit = await runAudit(cookie, canva.id);
  const canvaStatus = await pollAuditStatus(cookie, canvaAudit.auditId);
  const elapsed1 = ((Date.now() - canvaAudit.startTime) / 1000).toFixed(1);

  console.log(`\n[TEST 1 RESULTS] Duration: ${elapsed1}s`);
  console.log(`  Status: ${canvaStatus.status}`);

  const canvaResults = await getAuditResults(canvaAudit.auditId);
  const a1 = canvaResults.audit;
  console.log(`  Composite Score: ${a1.scoreComposite ?? "N/A"}`);
  console.log(`  Frequency:       ${a1.scoreFrequency ?? "N/A"}`);
  console.log(`  Position:        ${a1.scorePosition ?? "N/A"}`);
  console.log(`  Sentiment:       ${a1.scoreSentiment ?? "N/A"} (numeric: ${a1.scoreSentimentNumeric ?? "N/A"})`);
  console.log(`  Context:         ${a1.scoreContext ?? "N/A"} (numeric: ${a1.scoreContextNumeric ?? "N/A"})`);
  console.log(`  Accuracy:        ${a1.scoreAccuracy ?? "N/A"}`);
  console.log(`  Total citations: ${canvaResults.citations.length}`);
  console.log(`  Cost (USD):      $${a1.totalCostUsd ?? "N/A"}`);
  const dur1calc = a1.completedAt && a1.startedAt ? ((new Date(a1.completedAt).getTime() - new Date(a1.startedAt).getTime()) / 1000).toFixed(1) : "N/A";
  console.log(`  Duration (s):    ${dur1calc}`);

  // Engine breakdown
  const engineCounts: Record<string, number> = {};
  for (const c of canvaResults.citations) {
    engineCounts[c.engine] = (engineCounts[c.engine] || 0) + 1;
  }
  console.log(`  Engines:         ${JSON.stringify(engineCounts)}`);

  // Sample responses (first 3)
  console.log("\n  Sample citations:");
  for (const c of canvaResults.citations.slice(0, 3)) {
    const snippet = (c.responseSnippet ?? "").substring(0, 120);
    console.log(`    [${c.engine}] ${snippet}...`);
  }

  // Competitor check
  const responseTexts = canvaResults.citations.map((c) => c.responseSnippet ?? "").join(" ");
  const competitors = ["Adobe", "Figma", "Microsoft Designer", "Google Slides", "Canva"];
  const detected = competitors.filter(
    (comp) => responseTexts.toLowerCase().includes(comp.toLowerCase()),
  );
  console.log(`\n  Competitors detected: ${detected.join(", ") || "NONE"}`);

  // Validation
  console.log("\n  VALIDATION:");
  const freq1 = parseFloat(a1.scoreFrequency ?? "0");
  const dur1 = a1.completedAt && a1.startedAt ? (new Date(a1.completedAt).getTime() - new Date(a1.startedAt).getTime()) / 1000 : 0;
  console.log(`  [${dur1 > 10 ? "✓" : "✗"}] Duration > 10s (real, not mock): ${dur1.toFixed(1)}s`);
  console.log(`  [${freq1 > 30 ? "✓" : "✗"}] Frequency > 30 (well-known brand): ${freq1}`);
  console.log(`  [${Object.keys(engineCounts).length >= 2 ? "✓" : "✗"}] Multiple engines responded: ${Object.keys(engineCounts).length}`);
  console.log(`  [${canvaResults.citations.length > 5 ? "✓" : "✗"}] Citations > 5: ${canvaResults.citations.length}`);
  console.log(`  [${detected.length >= 2 ? "✓" : "✗"}] Competitors detected >= 2: ${detected.length}`);

  // Check for mock responses (all identical = mock)
  const uniqueResponses = new Set(canvaResults.citations.map((c) => c.responseSnippet?.substring(0, 50)));
  console.log(`  [${uniqueResponses.size > 3 ? "✓" : "✗"}] Unique responses (not mock): ${uniqueResponses.size}`);

  // ═══ TEST 2: Fake brand (unknown — expect LOW/zero scores) ═══
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  TEST 2: XYZ Plumbing Bondi (fake — expect NEAR-ZERO)");
  console.log("═══════════════════════════════════════════════════════════\n");

  const fake = await createBrand(
    cookie,
    "XYZ Plumbing Bondi",
    "xyzplumbingbondi.com.au",
    "tradies",
    [],
    ["NSW:Bondi"],
  );

  const fakeAudit = await runAudit(cookie, fake.id);
  const fakeStatus = await pollAuditStatus(cookie, fakeAudit.auditId);
  const elapsed2 = ((Date.now() - fakeAudit.startTime) / 1000).toFixed(1);

  console.log(`\n[TEST 2 RESULTS] Duration: ${elapsed2}s`);
  console.log(`  Status: ${fakeStatus.status}`);

  const fakeResults = await getAuditResults(fakeAudit.auditId);
  const a2 = fakeResults.audit;
  console.log(`  Composite Score: ${a2.scoreComposite ?? "N/A"}`);
  console.log(`  Frequency:       ${a2.scoreFrequency ?? "N/A"}`);
  console.log(`  Position:        ${a2.scorePosition ?? "N/A"}`);
  console.log(`  Sentiment:       ${a2.scoreSentiment ?? "N/A"} (numeric: ${a2.scoreSentimentNumeric ?? "N/A"})`);
  console.log(`  Context:         ${a2.scoreContext ?? "N/A"} (numeric: ${a2.scoreContextNumeric ?? "N/A"})`);
  console.log(`  Accuracy:        ${a2.scoreAccuracy ?? "N/A"}`);
  console.log(`  Total citations: ${fakeResults.citations.length}`);
  console.log(`  Cost (USD):      $${a2.totalCostUsd ?? "N/A"}`);

  const freq2 = parseFloat(a2.scoreFrequency ?? "0");
  console.log("\n  VALIDATION:");
  console.log(`  [${freq2 < 30 ? "✓" : "✗"}] Frequency < 30 (unknown brand): ${freq2}`);
  console.log(`  [${fakeResults.citations.length > 0 ? "✓" : "✗"}] Citations exist (LLMs responded): ${fakeResults.citations.length}`);

  // Final summary
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  FINAL SUMMARY                                         ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Canva:    Composite=${a1.scoreComposite ?? "?"} Freq=${a1.scoreFrequency ?? "?"} Cost=$${a1.totalCostUsd ?? "?"} Citations=${canvaResults.citations.length}`);
  console.log(`║  Fake:     Composite=${a2.scoreComposite ?? "?"} Freq=${a2.scoreFrequency ?? "?"} Cost=$${a2.totalCostUsd ?? "?"} Citations=${fakeResults.citations.length}`);
  const pass = freq1 > 30 && freq2 < freq1;
  console.log(`║  Result:   ${pass ? "✓ PASS — Real LLM path validated!" : "✗ FAIL — Check scores"}`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  console.log("\n\n═══ TEST ACCOUNT DETAILS ═══");
  console.log("  Email:    sri@visibleau.local");
  console.log("  Password: password123");
  console.log("  Org:      VisibleAU Dev");
  console.log("  Tier:     Agency (4 engines: ChatGPT, Claude, Gemini, Perplexity)");
  console.log("  Database: visibleau_prod");
  console.log("  URL:      http://localhost:3000/sign-in");

  await client.end();
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  client.end();
  process.exit(1);
});
