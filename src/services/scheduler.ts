import { scheduler, Scheduler } from "../schema/scheduler";
import SchedulerDbService from "../repository/scheduler";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { DateTime } from 'luxon';


export const CreateScheduleSchema = z.object({
    user_id: z.number().positive("User ID must be a positive number"),
    time: z.string()
        .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in 24-hour format (HH:mm)"),
    scheduled: z.boolean(),
    is_morning: z.boolean().default(true)
});

export interface ICreateSchedule {
    user_id: number;
    time: string;
    scheduled: boolean;
    is_morning?: boolean;
}


export const UpdateScheduleSchema = z.object({
    id: z.number().positive("Schedule ID must be a positive number"),
    time: z.string()
        .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in 24-hour format (HH:mm)")
        .optional(),
    scheduled: z.boolean().optional(),
    is_morning: z.boolean().optional()
});

export interface IUpdateSchedule {
    id: number;
    time?: string;
    scheduled?: boolean;
    is_morning?: boolean;
}


export const GetSchedulesSchema = z.object({
    user_id: z.number().positive("User ID must be a positive number")
});


export const SchedulerService = {
    async createSchedule(schedule: ICreateSchedule): Promise<Scheduler> {
        try {
            
            // Step 1: Get current time in Asia/Kolkata
            const nowIST = DateTime.now().setZone('Asia/Kolkata');

            // Step 2: Parse the scheduled time as today in IST
            let nextCallIST = DateTime.fromFormat(schedule.time, 'HH:mm', { zone: 'Asia/Kolkata' })
                .set({ year: nowIST.year, month: nowIST.month, day: nowIST.day });

            // Step 3: If that time has already passed, move to next day
            if (nextCallIST <= nowIST) {
                nextCallIST = nextCallIST.plus({ days: 1 });
            }
      
            // Step 4: Convert to UTC for storage/scheduling
            const nextCallUTC = nextCallIST.toUTC().toJSDate();
           
            
            console.log("nextCallTime calculated:", nextCallUTC);
            
            const scheduleData: Partial<Scheduler> = {
                userId: schedule.user_id,
                time: nextCallUTC,
                scheduled: schedule.scheduled,
                isMorning: schedule.is_morning ?? true,
                nextCallTime: nextCallUTC,
            };
            
            const result = await SchedulerDbService.createSchedule(scheduleData);
            return result;
        } catch (error) {
            console.error('Error creating schedule:', error);
            throw new Error(error instanceof Error ? error.message : 'Unknown error occurred while creating schedule');
        }
    },

    async updateSchedule(schedule: IUpdateSchedule): Promise<Scheduler> {
        try {
            // Validate input
            const validationResult = UpdateScheduleSchema.safeParse(schedule);
            if (!validationResult.success) {
                throw new Error(`Validation error: ${validationResult.error.errors.map(e => e.message).join(', ')}`);
            }

            // Check if schedule exists
            const existingSchedule = await SchedulerDbService.getScheduleById(schedule.id);
            if (!existingSchedule) {
                throw new Error(`Schedule with ID ${schedule.id} not found`);
            }

            const updates: Partial<Scheduler> = {};

            // Update fields if provided
            if (schedule.scheduled !== undefined) {
                updates.scheduled = schedule.scheduled;
            }
            if (schedule.is_morning !== undefined) {
                updates.isMorning = schedule.is_morning;
            }

            // If time is provided, recalculate nextCallTime using the same logic as createSchedule
            if (schedule.time) {
                // Step 1: Get current time in Asia/Kolkata
                const nowIST = DateTime.now().setZone('Asia/Kolkata');

                // Step 2: Parse the scheduled time as today in IST
                let nextCallIST = DateTime.fromFormat(schedule.time, 'HH:mm', { zone: 'Asia/Kolkata' })
                    .set({ year: nowIST.year, month: nowIST.month, day: nowIST.day });

                // Step 3: If that time has already passed, move to next day
                if (nextCallIST <= nowIST) {
                    nextCallIST = nextCallIST.plus({ days: 1 });
                }
          
                // Step 4: Convert to UTC for storage/scheduling
                const nextCallUTC = nextCallIST.toUTC().toJSDate();
                
                console.log("nextCallTime calculated for update:", nextCallUTC);
                
                updates.time = nextCallUTC;
                updates.nextCallTime = nextCallUTC;
            }

            const result = await SchedulerDbService.updateScheduleById(schedule.id, updates);
            if (!result) {
                throw new Error(`Failed to update schedule with ID ${schedule.id}`);
            }

            return result;
        } catch (error) {
            console.error('Error updating schedule:', error);
            throw new Error(error instanceof Error ? error.message : 'Unknown error occurred while updating schedule');
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