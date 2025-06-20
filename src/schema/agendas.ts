import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const agendas = pgTable('agendas', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD format
  status: varchar('status', { length: 20 }).notNull().default('planned'), // planned, completed, cancelled
  details: text('details'),
  context: text('context'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index('user_id_idx').on(table.userId),
  dateIdx: index('date_idx').on(table.date),
  statusIdx: index('status_idx').on(table.status),
}));

// Types for TypeScript
export type Agenda = typeof agendas.$inferSelect;
export type NewAgenda = typeof agendas.$inferInsert; 