import { Twilio } from "twilio";
import UserDbService from "../repository/users";
import CallHistoryDbService from "../repository/callHistory";
import { User } from "../schema/users";


export class CallHistoryService {
    private twilioClient: Twilio;

    constructor(twilioClient: Twilio) {
        this.twilioClient = twilioClient;
    }

    // returns username for the call
    public async startCallHistory(callSid: string, user: User)  {
        console.log("APP: User:", JSON.stringify(user));
            CallHistoryDbService.addCallHistory({  
              userId: user.id,
              callSid: callSid,
              duration: 0,
              startAt: new Date(),
              endAt: new Date(),
            });
            console.log('APP: OpenAI Text service connected');
    }

    public async endCallHistory(callSid: string) {
        const call = await CallHistoryDbService.getCallHistoryBySid(callSid);
        if (!call) {
            console.warn('CallHistory: No call history found for callSid:', callSid);
            return;
        }
        
        const endAt = new Date();
        const duration = endAt.getTime() - call.startAt.getTime();
        
        await CallHistoryDbService.updateCallHistoryBySid(callSid, {
            endAt,
            duration,
        });
    }
}