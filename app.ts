import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import { OpenAITextService } from "./src/services/openAiText";
import { DeepgramService } from "./src/services/deepgram";
import { TextToSpeechService } from "./src/services/textToSpeech";
import { IncomingHandler } from "./src/api/incoming";

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  FROM_NUMBER,
  SERVER,
  OPENAI_API_KEY,
  DEEPGRAM_API_KEY,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !FROM_NUMBER || !SERVER || !OPENAI_API_KEY || !DEEPGRAM_API_KEY) {
  console.error(
    "One or more environment variables are missing. Please ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PHONE_NUMBER_FROM, DOMAIN, OPENAI_API_KEY, and DEEPGRAM_API_KEY are set."
  );
  process.exit(1);
}

let openAiTextService: OpenAITextService | null = null;
let deepgramService: DeepgramService | null = null;
let textToSpeechService: TextToSpeechService | null = null;
const PORT = process.env.PORT || 3000;

const server: Serve = {
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/health") {
      return HealthHandler.GET(req);
    } else if (pathname === "/voice/incoming") {
      return IncomingHandler.GET(req);
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
      
      // Initialize services in the correct order with dependencies
      textToSpeechService = new TextToSpeechService(DEEPGRAM_API_KEY);
      textToSpeechService.connect(ws);
      console.log('🔊 Text-to-Speech service connected');

      openAiTextService = new OpenAITextService(OPENAI_API_KEY, textToSpeechService);
      openAiTextService.connect(ws);
      console.log('🤖 OpenAI Text service connected');

      deepgramService = new DeepgramService(DEEPGRAM_API_KEY, openAiTextService);
      deepgramService.connect(ws);
      console.log('🎤 Deepgram service connected');

      // Initialize the conversation
      openAiTextService.initConversation();
    },

    message: async (ws: ServerWebSocket<undefined>, message: string) => {
      try {
        const data = JSON.parse(message);

        // Handle media events from Twilio
        if (data.event === 'media') {
          // Send audio to Deepgram for speech-to-text
          deepgramService?.handleMessage(message);
        }
        // Handle start event to set streamSid
        else if (data.event === 'start') {
          console.log('🔊 Start event received:', data);
          textToSpeechService?.setStreamSid(data.start.streamSid);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    },

    close: (ws: ServerWebSocket<undefined>) => {
      openAiTextService?.disconnect();
      deepgramService?.disconnect();
      textToSpeechService?.disconnect();
      openAiTextService = null;
      deepgramService = null;
      textToSpeechService = null;
      console.log("Client disconnected.");
    },
  },
};

console.log(`Server is running on port ${PORT}`);
Bun.serve(server);
