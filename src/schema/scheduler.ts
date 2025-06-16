import { pgTable, serial, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const scheduler = pgTable('scheduler', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  scheduled: boolean('scheduled').default(false).notNull(),
  time: timestamp('time').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index('user_id_scheduler_idx').on(table.userId),
}));

// Types for TypeScript
export type Scheduler = typeof scheduler.$inferSelect;
export type NewScheduler = typeof scheduler.$inferInsert;
