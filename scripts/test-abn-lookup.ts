import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid || guid.startsWith("<")) {
    console.error("ERROR: ABN_LOOKUP_GUID not set in .env.local");
    console.error("       Paste your GUID into .env.dev, then re-run START-DEV.bat");
    process.exit(1);
  }

  if (process.env.ABN_LOOKUP_BYPASS) {
    console.warn(`WARNING: ABN_LOOKUP_BYPASS=${process.env.ABN_LOOKUP_BYPASS} — bypass still active, remove it to use real ABR`);
  }

  const TEST_ABN = "51824753556"; // ATO's ABN — stable, always Active
  console.log("Testing ABN Lookup against ABR web service...");
  console.log(`  GUID:  ${guid.slice(0, 8)}...${guid.slice(-4)} (redacted)`);
  console.log(`  ABN:   ${TEST_ABN} (Australian Taxation Office)`);
  console.log();

  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${TEST_ABN}&guid=${guid}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log(`  HTTP:  ${res.status}`);

    const text = await res.text();
    const json = JSON.parse(text.replace(/^callback\(/, "").replace(/\)$/, ""));

    if (json.Abn) {
      console.log(`  ABN:   ${json.Abn}`);
      console.log(`  Name:  ${json.EntityName ?? json.BusinessName?.[0]?.Name ?? "N/A"}`);
      console.log(`  Status: ${json.AbnStatus}`);
      console.log(`  GST:   ${json.Gst ?? "N/A"}`);
      console.log();
      console.log(json.AbnStatus === "Active" ? "  ✓ PASS — ABN Lookup connectivity verified" : "  ✗ Unexpected status");
    } else {
      console.error("  ✗ FAIL — No ABN in response. GUID may be invalid or not activated.");
      console.error("  Response:", JSON.stringify(json, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error("  ✗ FAIL — Request error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
