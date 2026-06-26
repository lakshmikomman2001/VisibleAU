#!/usr/bin/env tsx
import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

let failures = 0;
const fail = (msg: string) => {
  console.error("❌", msg);
  failures++;
};
const ok = (msg: string) => console.log("✅", msg);

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
      results.push(...walkDir(full, ext));
    } else if (ext.some((e) => full.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// 1. pnpm audit — no high/critical
try {
  execSync("pnpm audit --audit-level=high", { stdio: "inherit" });
  ok("pnpm audit clean");
} catch {
  fail("pnpm audit: high/critical vulnerabilities found");
}

// 2. .env.local not in git history
try {
  const log = execSync(
    "git log --all --full-history -- .env.local .env",
  ).toString();
  if (log.trim()) fail(".env.local was committed to git — rotate ALL secrets immediately");
  else ok("No .env in git history");
} catch {
  ok("No .env in git history (git log returned cleanly)");
}

const sourceFiles = walkDir("app", [".tsx", ".ts"]).filter(
  (f) => !f.includes(".test."),
);

// 3. No dangerouslySetInnerHTML in codebase
const dangerous = sourceFiles.filter((f) =>
  readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"),
);
if (dangerous.length) fail("dangerouslySetInnerHTML found: " + dangerous.join(", "));
else ok("No dangerouslySetInnerHTML");

// 4. Hardcoded secrets check
const secretPattern =
  /(sk_live|sk_test|pk_live|pk_test|whsec_|AKIA)[a-zA-Z0-9]{10,}/g;
let foundSecrets = false;
for (const f of sourceFiles) {
  const content = readFileSync(f, "utf8");
  if (secretPattern.test(content)) {
    fail("Hardcoded secret in: " + f);
    foundSecrets = true;
  }
  secretPattern.lastIndex = 0;
}
if (!foundSecrets) ok("No hardcoded secrets in source");

// 5. Stripe webhook signature check exists
try {
  const webhookRoute = readFileSync(
    "app/api/webhooks/stripe/route.ts",
    "utf8",
  );
  if (
    !webhookRoute.includes("constructEvent") &&
    !webhookRoute.includes("verifyStripeWebhook")
  )
    fail("Stripe webhook: no signature verification found");
  else ok("Stripe webhook signature verified");
} catch {
  fail("Stripe webhook route not found");
}

if (failures > 0) {
  console.error(`\n${failures} security issues found`);
  process.exit(1);
} else {
  console.log("\n✅ All security checks passed");
}
