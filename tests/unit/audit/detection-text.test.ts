/**
 * "Mention detection" (6 Nov), part 4 -- the normalised copy of an answer that detection reads
 * (lib/audit/detection-text.ts), and diag-0122's Postgres copy of the same steps. What detection then finds
 * is tests/unit/audit/detect-mention-formats.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectionText, detectionTextSql } from "@/lib/audit/detection-text";

describe("detectionText", () => {
  it.each([
    ["full-width letters fold (NFKC)", "Ｏｍｅｇａ Services", "Omega Services"],
    ["zero-width characters and soft hyphens go", "Om​ega‌ ‍Ser⁠vi﻿ces­", "Omega Services"],
    [
      "hyphen variants become -",
      "Omega‐Services Omega‑Services Omega‒Services",
      "Omega-Services Omega-Services Omega-Services",
    ],
    ["_ becomes a space", "Omega_Services _here_", "Omega Services  here "],
    [
      "emphasis around a word goes",
      "**Omega** Services and *Norwest*",
      "Omega Services and Norwest",
    ],
    ["code and link brackets around a word go", "`Omega` [Services]", "Omega Services"],
    ["a marker between two letters stays", "Omega**Services", "Omega**Services"],
    ["a list bullet stays", "*   **Omega Services** - Norwest", "*   Omega Services - Norwest"],
    ["plain text is unchanged", "Omega Services, Norwest NSW.", "Omega Services, Norwest NSW."],
  ])("%s", (_name, input, expected) => {
    expect(detectionText(input)).toBe(expected);
  });
});

describe("diag-0122's Postgres copy of the detector is in step", () => {
  const DIAG = readFileSync(
    join(process.cwd(), "db/prod-fixes/diag-0122-engine-mention-detection.sql"),
    "utf8",
  );
  const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

  it("query 4 normalises the answer with exactly the SQL generated from lib/audit/detection-text.ts", () => {
    expect(squash(DIAG)).toContain(squash(`${detectionTextSql("c0.t")} AS nt`));
  });
});
