import { eq, SQL } from "drizzle-orm";
import { db } from "../pkg/db";
import { Scheduler, scheduler } from "../schema/scheduler";

const SchedulerDbService = {
  createSchedule: async function (
    schedule: Partial<Scheduler>
  ): Promise<Scheduler> {
    const { userId, time, scheduled, nextCallTime } = schedule;
    const [result] = await db
      .insert(scheduler)
      .values({
        userId: userId as number,
        time: time as Date,
        scheduled: scheduled as boolean,
        nextCallTime: nextCallTime as Date,
      })
      .returning();
    return result;
  },

  updateScheduleNextCallTime: async function (
    schedule: Scheduler
  ): Promise<Scheduler> {
    // This is incorrect - setDate() expects a day of month, not a timestamp
    // We should create a new Date and add 24 hours
    const nextCallTime = new Date(schedule.nextCallTime.getTime() + 24 * 60 * 60 * 1000);
    
    const [result] = await db
      .update(scheduler)
      .set({ nextCallTime })
      .where(eq(scheduler.id, schedule.id))
      .returning();
    return result;
  },

  getSchedules: async function (options: {
    where: SQL | undefined;
  }): Promise<Scheduler[]> {
    return await db.select().from(scheduler).where(options.where);
  },
};

export default SchedulerDbService;
