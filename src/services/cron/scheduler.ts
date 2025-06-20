import { gte, lte } from "drizzle-orm";
import { scheduler } from "../../schema/scheduler";
import SchedulerDbService from "../../repository/scheduler";
import { Twilio } from "twilio";
import UserDbService from "../../repository/users";

export class SchedulerCronService {
  private twilioClient: Twilio;
  private appPhoneNumber: string;
  constructor(twilioClient: Twilio, appPhoneNumber: string) {
    this.twilioClient = twilioClient;
    this.appPhoneNumber = appPhoneNumber;
  }

  public async makeCall(user_id: number) {
    const user = await UserDbService.getUserById(user_id);
    try {
      const call = await this.twilioClient.calls.create({
        url: `https://${process.env.SERVER}/voice/incoming`,
        to: user.phoneNumber,
        from: this.appPhoneNumber,
      });
      console.log(call.sid);
    } catch (error) {
      console.error("Error making outbound call:", error);
    }
  }

  async checkRecentScheduledEvents() {
    try {
      // Get current time in HH:mm format
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      console.log("checking for events between", fiveMinutesAgo, "and", now);

      const options = {
        where:
          gte(scheduler.nextCallTime, fiveMinutesAgo) &&
          lte(scheduler.nextCallTime, now),
      };
      const recentEvents = await SchedulerDbService.getSchedules(options);
      console.log("recentEvents length:", recentEvents.length);

      recentEvents.forEach(async (event) => {
        await this.makeCall(event.userId);
        await SchedulerDbService.updateScheduleNextCallTime(event);
      });

      return recentEvents;
    } catch (error) {
      console.error("Error checking recent scheduled events:", error);
      throw error;
    }
  }
}
