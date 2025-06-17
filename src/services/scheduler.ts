import { gte, lte } from "drizzle-orm";
import { scheduler } from "../schema/scheduler";
import SchedulerDbService from "../repository/scheduler";
import { Twilio } from "twilio";
import UserDbService from "../repository/users";

export class SchedulerService {
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
      // Calculate time range: from 5 minutes ago to now
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Query events scheduled in the last 5 minutes
      const options = {
        where: gte(scheduler.time, fiveMinutesAgo) && lte(scheduler.time, now),
      };
      const recentEvents = await SchedulerDbService.getSchedules(options);

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
