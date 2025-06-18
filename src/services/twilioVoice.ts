import { Twilio } from "twilio";

export class TwilioVoiceService {
    private twilio: Twilio;
    constructor(twilio: Twilio) {
        this.twilio = twilio;
    }

    public async hangupCall(callSid: string) {
        // wait 5 seconds before hanging up
        await new Promise(resolve => setTimeout(resolve, 10000));
        const call = await this.twilio.calls(callSid).update({
            status: 'completed',
        });
        console.log('Twilio call hung up', callSid, call.status);
    }
}
