import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import * as schema from "../../../../db/schema";

export async function getRealPack(vertical: string, region = "au") {
  const [pack] = await db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        eq(schema.verticalPacks.vertical, vertical as never),
        eq(schema.verticalPacks.region, region as never),
        isNull(schema.verticalPacks.retiredAt),
      ),
    )
    .limit(1);
  return pack ?? undefined;
}
