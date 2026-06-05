import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../../db/schema";

const pg = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pg, { schema });
export { schema };
export { expandPrompt, formatLocation, formatCompetitors } from "../../../../lib/verticals/expand-prompt";
