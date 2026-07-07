import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
});

afterAll(async () => {
  if (client) await client.end();
});

describe("entity-alter migration — real DB schema (D-01 compliance)", () => {
  let columns: Array<{ column_name: string; data_type: string; is_nullable: string }>;

  beforeAll(async () => {
    columns = await client`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'brand_entity_scores'
      ORDER BY ordinal_position
    `;
  });

  const colNames = () => columns.map((c) => c.column_name);
  const findCol = (name: string) => columns.find((c) => c.column_name === name);

  // S5 ALTER columns must exist
  const S5_COLUMNS = [
    "organization_id",
    "market_code",
    "local_reg_verified",
    "local_reg_number",
    "wikipedia_local_present",
    "wikipedia_local_url",
    "au_tld_present",
    "hipages_present",
    "hipages_rating",
    "yellow_pages_present",
    "service_seeking_present",
    "word_of_mouth_present",
    "word_of_mouth_rating",
    "local_directory_count",
    "local_directory_details",
    "knowledge_panel_present",
    "knowledge_panel_accurate",
    "knowledge_panel_url",
    "wikidata_entry_present",
    "wikidata_entry_url",
  ];

  it("has all 20 S5 ALTER columns", () => {
    const names = colNames();
    for (const col of S5_COLUMNS) {
      expect(names, `missing column: ${col}`).toContain(col);
    }
  });

  it("organization_id is nullable (ALTER ADD without NOT NULL)", () => {
    expect(findCol("organization_id")?.is_nullable).toBe("YES");
  });

  it("knowledge_panel_present is boolean and nullable", () => {
    const col = findCol("knowledge_panel_present");
    expect(col?.data_type).toBe("boolean");
    expect(col?.is_nullable).toBe("YES");
  });

  it("hipages_rating is numeric", () => {
    expect(findCol("hipages_rating")?.data_type).toBe("numeric");
  });

  it("local_directory_details is jsonb", () => {
    expect(findCol("local_directory_details")?.data_type).toBe("jsonb");
  });

  it("local_directory_count is integer", () => {
    expect(findCol("local_directory_count")?.data_type).toBe("integer");
  });

  // D-01: score_of_10 is canonical — entity_score and scored_at must NOT exist
  it("does NOT have entity_score column (D-01: score_of_10 is canonical)", () => {
    expect(colNames()).not.toContain("entity_score");
  });

  it("does NOT have scored_at column (D-01: checked_at is canonical)", () => {
    expect(colNames()).not.toContain("scored_at");
  });

  // Phase 1 canonical columns still present
  it("retains Phase 1 score_of_10 column", () => {
    expect(findCol("score_of_10")?.data_type).toBe("numeric");
  });

  it("retains Phase 1 checked_at column", () => {
    expect(findCol("checked_at")).toBeDefined();
  });

  it("brand_entity_market_idx index exists", async () => {
    const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'brand_entity_scores' AND indexname = 'brand_entity_market_idx'
    `;
    expect(rows).toHaveLength(1);
  });
});
