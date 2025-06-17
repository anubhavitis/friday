import { SQL } from "drizzle-orm";
import { db } from "../pkg/db";
import { Scheduler, scheduler } from "../schema/scheduler";

const SchedulerDbService = {
    getSchedules: async function(options: {
    where: SQL | undefined
}): Promise<Scheduler[]> {
    return await db.select().from(scheduler).where(options.where);
    },
}

export default SchedulerDbService;