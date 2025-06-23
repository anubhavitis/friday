import { eq, and, SQL } from "drizzle-orm";
import { db } from "../pkg/db";
import { CheckIn, checkIn, CallStatus, CallType } from "../schema/checkIn";

const CheckInDbService = {
  // Get current call status for a user on a specific date
  getCurrentCallStatus: async function (
    userId: number,
    date: string
  ): Promise<{ callType: CallType; status: CallStatus } | null> {
    const [result] = await db
      .select()
      .from(checkIn)
      .where(
        and(
          eq(checkIn.userId, userId),
          eq(checkIn.date, date)
        )
      );

    if (!result) {
      return null;
    }

    // Determine call type based on which call is pending
    if (result.isMorningCallAttended === CallStatus.PENDING) {
      return {
        callType: CallType.MORNING,
        status: result.isMorningCallAttended as CallStatus
      };
    } else if (result.isEveningCallAttended === CallStatus.PENDING) {
      return {
        callType: CallType.EVENING,
        status: result.isEveningCallAttended as CallStatus
      };
    }

    // If neither is pending, return null (no active call)
    return null;
  },

  // Add checkIn data for a user on a specific date
  addCheckInData: async function (
    userId: number,
    date: string,
    isMorning: boolean
  ): Promise<CheckIn> {
    // Check if check-in data already exists for this user and date
    const existingCheckIn = await this.getCheckInData(userId, date);

    if (existingCheckIn) {
      // Row exists, handle based on call type
      if (isMorning) {
        // Morning call: update morning to pending, keep evening as is
        const [result] = await db
          .update(checkIn)
          .set({ isMorningCallAttended: CallStatus.PENDING })
          .where(
            and(
              eq(checkIn.userId, userId),
              eq(checkIn.date, date)
            )
          )
          .returning();
        return result;
      } else {
        // Evening call: update evening to pending, and if morning is pending, mark it as not_attended
        const updateData: any = { isEveningCallAttended: CallStatus.PENDING };
        
        if (existingCheckIn.isMorningCallAttended === CallStatus.PENDING) {
          updateData.isMorningCallAttended = CallStatus.NOT_ATTENDED;
        }

        const [result] = await db
          .update(checkIn)
          .set(updateData)
          .where(
            and(
              eq(checkIn.userId, userId),
              eq(checkIn.date, date)
            )
          )
          .returning();
        return result;
      }
    } else {
      // Row doesn't exist, create new row
      const checkInData = {
        userId,
        date,
        isMorningCallAttended: isMorning ? CallStatus.PENDING : CallStatus.UNINITIATED,
        isEveningCallAttended: isMorning ? CallStatus.UNINITIATED : CallStatus.PENDING,
      };

      const [result] = await db
        .insert(checkIn)
        .values(checkInData)
        .returning();
      
      return result;
    }
  },

  // Update checkIn data for a user on a specific date
  updateCheckInData: async function (
    userId: number,
    date: string,
    callType: CallType,
    status: CallStatus
  ): Promise<CheckIn> {
    const updateData = callType === CallType.MORNING 
      ? { isMorningCallAttended: status }
      : { isEveningCallAttended: status };

    const [result] = await db
      .update(checkIn)
      .set(updateData)
      .where(
        and(
          eq(checkIn.userId, userId),
          eq(checkIn.date, date)
        )
      )
      .returning();
    
    return result;
  },

  // Get checkIn data for a user on a specific date
  getCheckInData: async function (
    userId: number,
    date: string
  ): Promise<CheckIn | null> {
    const [result] = await db
      .select()
      .from(checkIn)
      .where(
        and(
          eq(checkIn.userId, userId),
          eq(checkIn.date, date)
        )
      );
    
    return result || null;
  },

  // Get checkIn data with custom where clause
  getCheckInDataWithOptions: async function (options: {
    where: SQL | undefined;
  }): Promise<CheckIn[]> {
    return await db.select().from(checkIn).where(options.where);
  },
};

export default CheckInDbService; 