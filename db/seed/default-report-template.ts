import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { reportTemplates } from "../schema";

const DEFAULT_SECTIONS = [
  { type: "executive_summary", include: true },
  { type: "score_breakdown", include: true },
  { type: "mention_source_divide", include: true },
  { type: "fan_out_coverage", include: true },
  { type: "topical_gap_summary", include: true },
  { type: "source_type_gaps", include: true },
  { type: "agent_readiness", include: true },
  { type: "linkedin_performance", include: true },
  { type: "consensus_score", include: true },
  { type: "knowledge_panel_status", include: true },
  { type: "entity_home_status", include: true },
  { type: "evidence_snapshots", include: true },
] as const;

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

async function seedDefaultTemplates() {
  console.log("[seed] Seeding default report templates...");

  const orgs = await db.execute<{ id: string }>(
    sql`SELECT id FROM organizations`,
  );

  let created = 0;
  let updated = 0;
  for (const org of orgs) {
    const existing = await db
      .select({ id: reportTemplates.id })
      .from(reportTemplates)
      .where(
        sql`${reportTemplates.organizationId} = ${org.id} AND ${reportTemplates.isDefault} = true`,
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(reportTemplates).values({
        organizationId: org.id,
        name: "Default Report",
        templateType: "standard",
        sections: DEFAULT_SECTIONS,
        tone: "professional",
        isDefault: true,
      });
      created++;
    } else {
      await db
        .update(reportTemplates)
        .set({ sections: DEFAULT_SECTIONS, updatedAt: new Date() })
        .where(sql`${reportTemplates.id} = ${existing[0].id}`);
      updated++;
    }
  }

  console.log(
    `[seed] ✓ ${created} default templates created, ${updated} updated (${orgs.length} orgs checked).`,
  );
  await client.end();
}

seedDefaultTemplates().catch(console.error);
