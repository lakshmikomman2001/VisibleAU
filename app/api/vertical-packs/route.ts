import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const packs = await db.execute(sql`
    SELECT vp.*,
      COUNT(b.id) FILTER (WHERE b.deleted_at IS NULL) AS brands_count
    FROM vertical_packs vp
    LEFT JOIN brands b ON b.vertical = vp.vertical
      AND b.organization_id = ${currentUser.organizationId}
    WHERE vp.retired_at IS NULL
    GROUP BY vp.id
    ORDER BY vp.vertical ASC
  `);

  return NextResponse.json(
    packs.map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      vertical: p.vertical,
      region: p.region,
      version: p.version,
      promptsCount: p.prompts_count,
      publishedAt: p.published_at,
      updatedAt: p.updated_at,
      brandsCount: Number(p.brands_count ?? 0),
    })),
  );
}
