import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

export const OutboundHandler = {
  POST: async (req: Request): Promise<Response> => {
    try {
      const body = await req.json();
      const { to_phonenumber } = body;

    if (!to_phonenumber) {
      return new Response(
        JSON.stringify({ error: 'to_phonenumber is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.FROM_NUMBER;
    const server = process.env.SERVER;

    if (!accountSid || !authToken || !fromNumber || !server) {
      return new Response(
        JSON.stringify({ error: 'Missing required Twilio configuration' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      url: `https://${server}/voice/incoming`,
      to: to_phonenumber,
      from: fromNumber
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: call.sid,
        message: 'Outbound call initiated successfully'
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error making outbound call:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to initiate outbound call',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
}
