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
    ["full-width letters fold (NFKC)", "Ｙａｂｂｙ Services", "Yabby Services"],
    ["zero-width characters and soft hyphens go", "Ya​bby‌ ‍Ser⁠vi﻿ces­", "Yabby Services"],
    [
      "hyphen variants become -",
      "Yabby‐Services Yabby‑Services Yabby‒Services",
      "Yabby-Services Yabby-Services Yabby-Services",
    ],
    ["_ becomes a space", "Yabby_Services _here_", "Yabby Services  here "],
    [
      "emphasis around a word goes",
      "**Yabby** Services and *Norwest*",
      "Yabby Services and Norwest",
    ],
    ["code and link brackets around a word go", "`Yabby` [Services]", "Yabby Services"],
    ["a marker between two letters stays", "Yabby**Services", "Yabby**Services"],
    ["a list bullet stays", "*   **Yabby Services** - Norwest", "*   Yabby Services - Norwest"],
    ["plain text is unchanged", "Yabby Services, Norwest NSW.", "Yabby Services, Norwest NSW."],
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
