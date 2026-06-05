import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../../db/schema";

const pg = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pg, { schema });
export { schema };
export { applyAntiPatternFilter } from "../../../../lib/recommendations/anti-patterns";
export { classifyConfidence } from "../../../../lib/recommendations/confidence-labels";
export { evaluateTriggers } from "../../../../lib/recommendations/triggers";
export { buildRecommendations } from "../../../../lib/recommendations/index";
export type { TriggerContext } from "../../../../lib/recommendations/types";
