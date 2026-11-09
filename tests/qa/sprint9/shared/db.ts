import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../../db/schema";
import { assertE2eDatabaseUrl } from "../../../e2e/helpers/e2e-database";

// The local e2e database only: anything else is refused before connecting.
const client = postgres(
  assertE2eDatabaseUrl(process.env.DIRECT_URL ?? process.env.DATABASE_URL, "DIRECT_URL"),
  { max: 1 },
);
export const db = drizzle(client, { schema });
export { schema };
