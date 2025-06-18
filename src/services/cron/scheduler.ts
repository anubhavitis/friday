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

  private getTimeRange() {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // Gets HH:mm format
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const fiveMinutesAgoTime = fiveMinutesAgo.toTimeString().slice(0, 5); // Gets HH:mm format
    const time2001 = new Date("2001-01-01T" + currentTime);
    const time2001FiveMinutesAgo = new Date("2001-01-01T" + fiveMinutesAgoTime);
    return { time2001, time2001FiveMinutesAgo };
  }

  async checkRecentScheduledEvents() {
    try {
      // Get current time in HH:mm format
      const { time2001, time2001FiveMinutesAgo } = this.getTimeRange();
      console.log("checking for time window", time2001FiveMinutesAgo, time2001);

      const options = {
        where:
          gte(scheduler.time, time2001FiveMinutesAgo) &&
          lte(scheduler.time, time2001),
      };
      const recentEvents = await SchedulerDbService.getSchedules(options);
      console.log("recentEvents length:", recentEvents.length);

      recentEvents.forEach(async (event) => {
        await this.makeCall(event.userId);
      });

      return recentEvents;
    } catch (error) {
      console.error("Error checking recent scheduled events:", error);
      throw error;
    }
  }
}
