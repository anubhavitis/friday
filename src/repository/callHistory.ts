import { db } from "../pkg/db";
import { CallHistory, callHistory, type NewCallHistory } from "../schema/callHistory";
import { eq } from "drizzle-orm";

const CallHistoryDbService = {
  addCallHistory: async function (entry: NewCallHistory): Promise<CallHistory> {
    try {
      console.log("Adding call history with sid:", entry.callSid);
      const result = await db.insert(callHistory).values(entry).returning();
      return result[0];
    } catch (error) {
      console.error("Error adding call history:", error);
      throw error;
    }
  },

  getCallHistoryBySid: async function (callSid: string): Promise<CallHistory | null> {
    const result = await db.select().from(callHistory).where(eq(callHistory.callSid, callSid)).limit(1);
    return result[0] || null;
  },

  /**
   * Updates a specific call history entry by callSid
   */
  updateCallHistoryBySid: async function (
    callSid: string,
    updates: Partial<NewCallHistory>
  ): Promise<CallHistory | null>   {
    try {
      console.log(
        "Updating call history for callSid:",
        callSid,
        "with updates:",
        updates
      );
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
      console.error("Error updating call history:", error);
      throw error;
    }
  },
};

export default CallHistoryDbService;
