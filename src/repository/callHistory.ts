import { db } from '../pkg/db';
import { callHistory, type NewCallHistory } from '../schema/callHistory';
import { eq } from 'drizzle-orm';

/**
 * Adds a new entry to the call history table
 */
export async function addCallHistory(entry: NewCallHistory) {
  try {
    console.log('Adding call history:', entry);
    const result = await db.insert(callHistory).values(entry).returning();
    return result[0];
  } catch (error) {
    console.error('Error adding call history:', error);
    throw error;
  }
}

/**
 * Updates a specific call history entry by callSid
 */
export async function updateCallHistoryBySid(callSid: string, updates: Partial<NewCallHistory>) {
  try {
    console.log('Updating call history for callSid:', callSid, 'with updates:', updates);
    const result = await db
      .update(callHistory)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(callHistory.callSid, callSid))
      .returning();
    
    return result[0];
  } catch (error) {
    console.error('Error updating call history:', error);
    throw error;
  }
} 