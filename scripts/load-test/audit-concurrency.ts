#!/usr/bin/env tsx
import autocannon from "autocannon";

const STAGING_URL = process.env.STAGING_URL || "http://localhost:3000";
const SESSION_COOKIE = process.env.TEST_SESSION_COOKIE || "";
const BRAND_ID = process.env.TEST_BRAND_ID || "";

async function run() {
  console.log("🔄 Load test: audit concurrency (50 connections, 30s)");
  console.log(`   Target: ${STAGING_URL}/api/audits`);
  console.log("   ⚠️  Ensure LLM_MODE=mock in staging env\n");

  const auditResult = await autocannon({
    url: `${STAGING_URL}/api/audits`,
    method: "POST",
    connections: 50,
    duration: 30,
    headers: {
      Cookie: SESSION_COOKIE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ brandId: BRAND_ID }),
  });

  console.log("\n--- Audit Trigger Results ---");
  console.log(`  Requests:    ${auditResult.requests.total}`);
  console.log(`  Throughput:  ${auditResult.requests.average} req/s`);
  console.log(`  Latency p50: ${auditResult.latency.p50}ms`);
  console.log(`  Latency p95: ${auditResult.latency.p97_5}ms (target: <300ms)`);
  console.log(`  Errors:      ${auditResult.errors}`);
  console.log(`  Timeouts:    ${auditResult.timeouts}`);

  return auditResult;
}

run().catch(console.error);
