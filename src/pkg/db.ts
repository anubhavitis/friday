import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as usersSchema from '../schema/users';
import * as callHistorySchema from '../schema/callHistory';
import * as schedulerSchema from '../schema/scheduler';

// Database connection configuration
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Create Drizzle instance with all schemas
export const db = drizzle(pool, { 
  schema: {
    ...usersSchema,
    ...callHistorySchema,
    ...schedulerSchema
  }
});

// Export the pool for direct access if needed
export { pool };
