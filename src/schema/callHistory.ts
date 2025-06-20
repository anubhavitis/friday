import { pgTable, serial, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const callHistory = pgTable('call_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  callSid: varchar('call_sid', { length: 255 }).notNull(),
  duration: integer('duration').notNull(),
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index('user_id_call_history_idx').on(table.userId),
  callSidIdx: index('call_sid_call_history_idx').on(table.callSid),
}));

// Types for TypeScript
export type CallHistory = typeof callHistory.$inferSelect;
export type NewCallHistory = typeof callHistory.$inferInsert;
