import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import type { VerticalPack } from "@/db/schema";
import { verticalPacks } from "@/db/schema";

export { expandPrompt, formatCompetitors, formatLocation } from "./expand-prompt";

export async function getVerticalPack(
  vertical: string,
  region: string,
): Promise<VerticalPack | undefined> {
  const [row] = await db
    .select()
    .from(verticalPacks)
    .where(
      and(
        eq(verticalPacks.vertical, vertical as never),
        eq(verticalPacks.region, region as never),
        isNull(verticalPacks.retiredAt),
      ),
    )
    .limit(1);
  return row;
}
