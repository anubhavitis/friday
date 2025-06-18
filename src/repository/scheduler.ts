import { SQL } from "drizzle-orm";
import { db } from "../pkg/db";
import { Scheduler, scheduler } from "../schema/scheduler";

const SchedulerDbService = {
    createSchedule: async function (schedule: Partial<Scheduler>): Promise<Scheduler> {
        const { userId, time, scheduled} = schedule; 
        const [result] = await db.insert(scheduler).values({
            userId: userId as number,
            time: time as Date,
            scheduled: scheduled as boolean,
        }).returning();
        return result;
    },

  getSchedules: async function (options: {
    where: SQL | undefined;
  }): Promise<Scheduler[]> {
    return await db.select().from(scheduler).where(options.where);
  },

};

export default SchedulerDbService;
