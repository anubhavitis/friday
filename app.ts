import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import { OpenAIService } from "./src/services/openAi";
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

let openAiService: OpenAIService | null = null;
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
      
      // Initialize OpenAI service
      openAiService = new OpenAIService(OPENAI_API_KEY);
      openAiService.connect(ws);
      openAiService.initConversation();

      // Initialize Deepgram service for speech-to-text
      deepgramService = new DeepgramService(DEEPGRAM_API_KEY);
      deepgramService.connect(ws);

      // Initialize Text-to-Speech service
      textToSpeechService = new TextToSpeechService(DEEPGRAM_API_KEY);
      textToSpeechService.connect(ws);
    },

    message: async (ws: ServerWebSocket<undefined>, message: string) => {
      try {
        const data = JSON.parse(message);

        // Handle media events for speech-to-text
        if (data.event === 'media') {
          openAiService?.handleMessage(message);
          deepgramService?.handleMessage(message);
        }
        // Handle text-to-speech requests
        else if (data.event === 'tts') {
          await textToSpeechService?.convertToSpeech(data.text);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    },

    close: (ws: ServerWebSocket<undefined>) => {
      openAiService?.disconnect();
      deepgramService?.disconnect();
      textToSpeechService?.disconnect();
      openAiService = null;
      deepgramService = null;
      textToSpeechService = null;
      console.log("Client disconnected.");
    },
  },
};

console.log(`Server is running on port ${PORT}`);
Bun.serve(server);
