/**
 * "Mention detection" (6 Nov), part 4 -- diag-0122's Postgres copy of the detector must read the same
 * normalised text the app does. tests/unit/audit/detection-text.test.ts checks the diag file carries
 * detectionTextSql()'s text; this checks Postgres, running that SQL, gives what detectionText() gives.
 *
 * (DEV/TEST DB ONLY -- evaluates expressions; reads and writes no table.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectionText, detectionTextSql } from "@/lib/audit/detection-text";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const SAMPLES = [
  "Ｏｍｅｇａ Services",
  "Om​ega‌ ‍Ser⁠vi﻿ces­",
  "Omega‐Services Omega‑Services Omega‒Services",
  "Omega_Services _here_",
  "**Omega** Services and *Norwest*",
  "`Omega` [Services]",
  "Omega**Services",
  "*   **Omega Services** - Norwest\n2. [Jim's Plumbing](https://jims.com.au) **24/7**",
  "Line one.\n\n**Omega**\tServices\r\n_Norwest_",
  "Omega Services, Norwest NSW.",
  "",
];

let client: ReturnType<typeof postgres>;

beforeAll(() => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });
});

afterAll(async () => {
  await client.end();
});

describe("detectionTextSql() in Postgres = detectionText() in JavaScript", () => {
  it.each(SAMPLES.map((s) => [JSON.stringify(s), s]))("%s", async (_label, sample) => {
    const [row] = await client.unsafe<{ nt: string }[]>(
      `SELECT ${detectionTextSql("c0.t")} AS nt FROM (SELECT $1::text AS t) c0`,
      [sample],
    );
    expect(row.nt).toBe(detectionText(sample));
  });
});
