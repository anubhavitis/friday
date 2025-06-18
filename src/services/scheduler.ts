import { scheduler, Scheduler } from "../schema/scheduler";
import SchedulerDbService from "../repository/scheduler";
import { z } from "zod";
import { eq } from "drizzle-orm";


export const CreateScheduleSchema = z.object({
    user_id: z.number().positive("User ID must be a positive number"),
    time: z.string()
        .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in 24-hour format (HH:mm)"),
    scheduled: z.boolean()
});

export interface ICreateSchedule {
    user_id: number;
    time: string;
    scheduled: boolean;
}


export const GetSchedulesSchema = z.object({
    user_id: z.number().positive("User ID must be a positive number")
});


export const SchedulerService = {
    async createSchedule(schedule: ICreateSchedule): Promise<Scheduler> {
        try {
            console.log("SCHEDULER: Schedule:", schedule.time);
            const time = new Date('2000-01-01T' + schedule.time);
            console.log("SCHEDULER: Time:", time);
            const scheduleData: Partial<Scheduler> = {
                userId: schedule.user_id,
                time: time,
                scheduled: schedule.scheduled,
            };
            
            const result = await SchedulerDbService.createSchedule(scheduleData);
            return result;
        } catch (error) {
            console.error('Error creating schedule:', error);
            throw new Error(error instanceof Error ? error.message : 'Unknown error occurred while creating schedule');
        }
    },

    async getSchedules(user_id: number): Promise<Scheduler[]> {
        try {
            // Validate input
            const validationResult = GetSchedulesSchema.safeParse({ user_id });
            if (!validationResult.success) {
                throw new Error(`Validation error: ${validationResult.error.errors.map(e => e.message).join(', ')}`);
            }

            const schedules = await SchedulerDbService.getSchedules({ where: eq(scheduler.userId, user_id) });
            return schedules;
        } catch (error) {
            console.error('Error fetching schedules:', error);
            throw new Error(error instanceof Error ? error.message : 'Unknown error occurred while fetching schedules');
        }
    }
}