import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [audit] = await db.select().from(technicalAudits).where(eq(technicalAudits.id, id));
  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(audit);
}
