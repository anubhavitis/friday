import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import twilio from "twilio";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { OpenAIService } from "./services/openAi";

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  FROM_NUMBER,
  SERVER,
  OPENAI_API_KEY,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !FROM_NUMBER || !SERVER || !OPENAI_API_KEY) {
  console.error(
    "One or more environment variables are missing. Please ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PHONE_NUMBER_FROM, DOMAIN, and OPENAI_API_KEY are set."
  );
  process.exit(1);
}

let openAiService: OpenAIService | null = null;
const PORT = process.env.PORT || 3000;

const outboundTwiML = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${SERVER}/media-stream" />
  </Connect>
</Response>`;

const inboundTwiML = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Please wait while we connect your call to the AI voice assistant, powered by Twilio and the OpenAI Realtime API</Say>
      <Pause length="1"/>
      <Say>OK, you can start talking!</Say>
      <Connect>
        <Stream url="wss://${SERVER}/media-stream" />
      </Connect>
    </Response>
  `;

// Function to check if a number is allowed to be called. With your own function, be sure 
// to do your own diligence to be compliant.
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function isNumberAllowed(to: string) {
  try {
    // Check if the number is a Twilio phone number in the account, for example, when making a call to the Twilio Dev Phone
    const incomingNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: to });
    if (incomingNumbers.length > 0) {
      return true;
    }

    // Check if the number is a verified outgoing caller ID. https://www.twilio.com/docs/voice/api/outgoing-caller-ids
    const outgoingCallerIds = await client.outgoingCallerIds.list({ phoneNumber: to });
    if (outgoingCallerIds.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error checking phone number:", error);
    return false;
  }
}

const incomingHandler = (request: Request) => {
  const response = new VoiceResponse();
  const connect = response.connect();
  connect.stream({ url: `wss://${SERVER}/media-stream` });

  return new Response(response.toString(), {
    headers: {
      "Content-Type": "text/xml",
    },
  });
};

const server: Serve = {
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/health") {
      return HealthHandler.GET(req);
    } else if (pathname === "/voice/incoming") {
      return incomingHandler(req);
    } else if (pathname === "/media-stream") {
      console.log("Media stream request received, host:", req.headers.get("host"));
      if (this.upgrade(req)) {
        console.log("Upgraded to WebSocket");
        return; // WebSocket will take over
      }
      console.log("Failed to upgrade to WebSocket");
      return new Response("Failed to upgrade to WebSocket", { status: 400 });
    } else {
      return new Response("Not Found", { status: 404 });
    }
  },
  websocket: {
    open: (ws: ServerWebSocket<undefined>) => {
      console.log("Connected to Server WebSocket");
      openAiService = new OpenAIService(OPENAI_API_KEY);
      openAiService.connect(ws);
    },

    message: (ws: ServerWebSocket<undefined>, message: string) => {
      openAiService?.handleMessage(message);
    },

    close: (ws: ServerWebSocket<undefined>) => {
      openAiService?.disconnect();
      openAiService = null;
      console.log("Client disconnected.");
    },
  },
};

console.log(`Server is running on port ${PORT}`);
Bun.serve(server);
