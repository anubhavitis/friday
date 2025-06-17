import { Twilio } from "twilio";
import { User } from "../schema/users";
import UserDbService from "../repository/users";

export class UserService {
    private twilioClient: Twilio;

    constructor(twilioClient: Twilio) {
        this.twilioClient = twilioClient;
    }

    async getUserByCallSid(callSid: string): Promise<User> {
        const call = await this.twilioClient.calls(callSid).fetch();
        const { to } = call;
        const user = await UserDbService.findUserByPhoneNumber(to);
        if (!user) {
            throw new Error(`APP: No user_id found in config for number: ${to}`);
        }
        return user;
    }
}   