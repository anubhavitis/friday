import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as usersSchema from "../schema/users";
import * as callHistorySchema from "../schema/callHistory";
import * as schedulerSchema from "../schema/scheduler";
import * as agendasSchema from "../schema/agendas";

let db: NodePgDatabase<typeof usersSchema & typeof callHistorySchema & typeof schedulerSchema & typeof agendasSchema>;

export async function initDb(host: string, port: number, user: string, password: string, database: string): Promise<Error | null> {
  const pool = new Pool({
    host,
    port,
    user,
    password,
    database,
    ssl: false,
  });

  db = drizzle(pool, {
    schema: {
      ...usersSchema,
      ...callHistorySchema,
      ...schedulerSchema,
      ...agendasSchema,
    },
  });

  // check connection
  try {
    await db.execute('SELECT 1');
    console.log('✅ Database connection successful');
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error('Database connection failed');
  }
}

export { db };
