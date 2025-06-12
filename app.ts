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

      openAiTextService = new OpenAITextService(OPENAI_API_KEY);
      openAiTextService.connect();
      console.log('🤖 OpenAI Text service connected');

      deepgramService = new DeepgramService(DEEPGRAM_API_KEY);
      deepgramService.connect(ws);
      console.log('🎤 Deepgram service connected');

      // Add event listener for transcript events
      deepgramService.on('deepgram_transcript_received', (transcript: string) => {
        console.log('📝 Received transcript event:', transcript);
        openAiTextService?.handleMessage(JSON.stringify({
          event: 'text',
          text: transcript
        }));
      });

      // Add event listener for OpenAI response done events
      openAiTextService.on('openai_response_done', (response: { partialResponseIndex: number, partialResponse: string }) => {
        console.log(`📝 Received OpenAI response chunk ${response.partialResponseIndex}:`, response.partialResponse);
        textToSpeechService?.convertToSpeech(response.partialResponse, response.partialResponseIndex);
      });

      textToSpeechService.on('text_to_speech_done', (response: { streamSid: string, base64Audio: string }) => {
        console.log('🎵 Text-to-Speech conversion completed');
        ws.send(JSON.stringify({
          event: 'media',
          streamSid: response.streamSid,
          media: { payload: response.base64Audio }
        }));
      });
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
          const streamSid = data.start?.streamSid;
          if (streamSid) {
            textToSpeechService?.setStreamSid(streamSid);
          } else {
            console.warn('No streamSid found in start event');
          }
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
