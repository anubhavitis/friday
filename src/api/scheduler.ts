import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  SchedulerService,
  ICreateSchedule,
  IUpdateSchedule,
} from "../services/scheduler";

export class SchedulerHandler {
  static async POST(req: Request) {
    const body = await req.json();
    const { user_id, time, scheduled, is_morning } = body as ICreateSchedule;

    const validationResult = CreateScheduleSchema.safeParse({
      user_id,
      time,
      scheduled,
      is_morning,
    });
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: `Validation error: ${validationResult.error.errors
            .map((e: any) => e.message)
            .join(", ")}`,
        }),
        { status: 400 }
      );
    }

    try {
      const schedule = await SchedulerService.createSchedule({
        user_id,
        time,
        scheduled,
        is_morning,
      });
      return new Response(JSON.stringify(schedule), { status: 201 });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Unknown error occurred while creating schedule",
        }),
        { status: 500 }
      );
    }
  }

  static async PUT(req: Request) {
    const body = await req.json();
    const { id, time, scheduled, is_morning } = body as IUpdateSchedule;

    const validationResult = UpdateScheduleSchema.safeParse({
      id,
      time,
      scheduled,
      is_morning,
    });
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: `Validation error: ${validationResult.error.errors
            .map((e: any) => e.message)
            .join(", ")}`,
        }),
        { status: 400 }
      );
    }

    try {
      const schedule = await SchedulerService.updateSchedule({
        id,
        time,
        scheduled,
        is_morning,
      });
      return new Response(JSON.stringify(schedule), { status: 200 });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Unknown error occurred while updating schedule",
        }),
        { status: 500 }
      );
    }
  }
}
