import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

async function makeOutBoundCall() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  const client = twilio(accountSid, authToken);

  try {
    const call = await client.calls.create({
      url: `https://${process.env.SERVER}/voice/incoming`,
      to: process.env.TO_NUMBER!,
      from: process.env.FROM_NUMBER!
    });
    console.log(call.sid);
  } catch (error) {
    console.error('Error making outbound call:', error);
  }
}

makeOutBoundCall();