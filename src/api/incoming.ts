import VoiceResponse from "twilio/lib/twiml/VoiceResponse";

export const IncomingHandler = {
  GET: (request: Request) => {
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/media-stream` });

    return new Response(response.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  },
};