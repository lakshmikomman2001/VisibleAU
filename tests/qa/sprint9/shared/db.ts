import { drizzle }  from 'drizzle-orm/postgres-js';
import postgres      from 'postgres';
import * as schema   from '../../../../db/schema';

const client = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(client, { schema });
export { schema };
