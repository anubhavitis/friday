import {
  CreateScheduleSchema,
  SchedulerService,
  ICreateSchedule,
} from "../services/scheduler";

export class SchedulerHandler {
  static async POST(req: Request) {
    const body = await req.json();
    const { user_id, time, scheduled } = body as ICreateSchedule;

    const validationResult = CreateScheduleSchema.safeParse({
      user_id,
      time,
      scheduled,
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
}
