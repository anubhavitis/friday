import { pgTable, serial, integer, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const checkIn = pgTable('check_in', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  date: text('date').notNull(), // Format: "2025-06-19"
  isMorningCallAttended: text('is_morning_call_attended').notNull().default('uninitiated'), // 'uninitiated' | 'pending' | 'completed' | 'not_attended'
  isEveningCallAttended: text('is_evening_call_attended').notNull().default('uninitiated'), // 'uninitiated' | 'pending' | 'completed' | 'not_attended'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdDateIdx: uniqueIndex('user_id_date_check_in_idx').on(table.userId, table.date),
}));

// Types for TypeScript
export type CheckIn = typeof checkIn.$inferSelect;
export type NewCheckIn = typeof checkIn.$inferInsert;

// Call status enum
export enum CallStatus {
  UNINITIATED = 'uninitiated',
  PENDING = 'pending',
  COMPLETED = 'completed',
  NOT_ATTENDED = 'not_attended'
}

// Call type enum
export enum CallType {
  MORNING = 'morning',
  EVENING = 'evening'
}
