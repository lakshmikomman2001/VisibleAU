/**
 * Service-role Drizzle client for QA seed/cleanup operations.
 * Uses DIRECT_URL to bypass RLS — never expose this connection to browser.
 * Import dotenv before using in scripts.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../../db/schema";

const pgClient = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });
