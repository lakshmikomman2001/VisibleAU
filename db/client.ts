import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export async function setRlsContext(
  dbInstance: ReturnType<typeof drizzle>,
  orgId: string,
): Promise<void> {
  await dbInstance.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
}
