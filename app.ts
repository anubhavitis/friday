import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import twilio from "twilio";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";

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

let openAiWs: WebSocket;
let streamSid: string | null = null;

const SYSTEM_MESSAGE =
  "You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested in and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.";
const VOICE = "alloy"; // 'alloy', 'nova', 'shimmer', 'echo'
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


// List of Event Types to log to the console. See OpenAI Realtime API Documentation. (session.updated is handled separately.)
const LOG_EVENT_TYPES = [
  "response.content.done",
  "rate_limits.updated",
  "response.done",
  "input_audio_buffer.committed",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.speech_started",
  "session.created",
];

const model = "gpt-4o-realtime-preview-2024-12-17";

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

      openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
        // @ts-ignore
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      // we set up our Session configuration with OpenAI
      const sendSessionUpdate = () => {
        const sessionUpdate = {
          type: "session.update",
          session: {
            turn_detection: { type: "server_vad" },
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: VOICE,
            instructions: SYSTEM_MESSAGE,
            modalities: ["text", "audio"],
            temperature: 0.8,
          },
        };
        console.log("Sending session update:", JSON.stringify(sessionUpdate));
        openAiWs.send(JSON.stringify(sessionUpdate));

        const initialConversationItem = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: 'Greet the user with "Hello there! I\'m an AI voice assistant from Twilio and the OpenAI Realtime API. How can I help?"',
              },
            ],
          },
        };

        console.log("Sending initial conversation item:");

        openAiWs.send(JSON.stringify(initialConversationItem));
        openAiWs.send(JSON.stringify({ type: "response.create" }));

        console.log("Sent initial conversation item and response.create");
      };

      openAiWs.onmessage = (data: MessageEvent) => {
        try {
          const response = JSON.parse(data.data);
          if (LOG_EVENT_TYPES.includes(response.type)) {
            console.log(`Received event: ${response.type}`, response);
          }
          if (response.type === "session.updated") {
            console.log("Session updated successfully:", response);
          }
          if (response.type === "response.audio.delta" && response.delta) {
            const audioDelta = {
              event: "media",
              streamSid: streamSid,
              media: { payload: Buffer.from(response.delta, "base64").toString("base64") },
            };
            ws.send(JSON.stringify(audioDelta));
          }
        } catch (error) {
          console.error("Error processing OpenAI message:", error, "Raw message:", data);
        }
      };

      openAiWs.onopen = () => {
        console.log("Connected to the OpenAI Realtime API");
        setTimeout(sendSessionUpdate, 250); // Ensure connection stability, send after .25 seconds
      };

      openAiWs.onclose = () => {
        console.log("Disconnected from the OpenAI Realtime API");
      };

      openAiWs.onerror = (error: any) => {
        console.error("Error in the OpenAI WebSocket:", error);
      };
    },

    message: (ws: ServerWebSocket<undefined>, message: string) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case "media":
            if (openAiWs.readyState === WebSocket.OPEN) {
              const audioAppend = {
                type: "input_audio_buffer.append",
                audio: data.media.payload,
              };

              openAiWs.send(JSON.stringify(audioAppend));
            }
            break;
          case "start":
            streamSid = data.start.streamSid;
            console.log("Incoming stream has started", streamSid);
            break;
          default:
            console.log("Received non-media event:", data.event);
            break;
        }
      } catch (error) {
        console.error("Error parsing message:", error, "Message:", message);
      }
    },

    close: (ws: ServerWebSocket<undefined>) => {
      if (openAiWs.readyState === WebSocket.OPEN) {
        openAiWs.close();
      }
      console.log("Client disconnected.");
    },
  },
};

console.log(`Server is running on port ${PORT}`);
Bun.serve(server);
