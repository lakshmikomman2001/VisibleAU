#!/usr/bin/env tsx
import autocannon from "autocannon";

const STAGING_URL = process.env.STAGING_URL || "http://localhost:3000";
const SESSION_COOKIE = process.env.TEST_SESSION_COOKIE || "";

async function run() {
  console.log("🔄 Load test: dashboard (100 connections, 30s)");
  console.log(`   Target: ${STAGING_URL}/dashboard\n`);

  const dashResult = await autocannon({
    url: `${STAGING_URL}/dashboard`,
    connections: 100,
    duration: 30,
    headers: {
      Cookie: SESSION_COOKIE,
    },
  });

  console.log("\n--- Dashboard Load Results ---");
  console.log(`  Requests:    ${dashResult.requests.total}`);
  console.log(`  Throughput:  ${dashResult.requests.average} req/s`);
  console.log(`  Latency p50: ${dashResult.latency.p50}ms`);
  console.log(`  Latency p95: ${dashResult.latency.p97_5}ms (target: <500ms)`);
  console.log(`  Errors:      ${dashResult.errors}`);
  console.log(`  Timeouts:    ${dashResult.timeouts}`);

  return dashResult;
}

run().catch(console.error);
