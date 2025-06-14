import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import { OpenAITextService } from "./src/services/openAiText";
import { DeepgramService } from "./src/services/deepgram";
import { TextToSpeechService } from "./src/services/textToSpeech";
import { IncomingHandler } from "./src/api/incoming";

import { MemoryService } from "./src/services/memory";
import { Twilio } from "twilio";
import yaml from 'js-yaml';

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  FROM_NUMBER,
  SERVER,
  OPENAI_API_KEY,
  DEEPGRAM_API_KEY,
  MEM0_API_KEY
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !FROM_NUMBER || !SERVER || !OPENAI_API_KEY || !DEEPGRAM_API_KEY || !MEM0_API_KEY) {
  console.error(
    "APP: One or more environment variables are missing. Please ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PHONE_NUMBER_FROM, DOMAIN, OPENAI_API_KEY, and DEEPGRAM_API_KEY are set."
  );
  process.exit(1);
}

interface Config {
  users: {
    [key: string]: string;
  }
}

const configFile = Bun.file("config.yaml");
const configContent = await configFile.text();
const config: Config = yaml.load(configContent) as Config;
console.log("APP: Config:", config);

const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
let memoryService: MemoryService | null = null;
let openAiTextService: OpenAITextService | null = null;
let deepgramService: DeepgramService | null = null;
let textToSpeechService: TextToSpeechService | null = null;
let streamSidTwilio: string | null = null;
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
      console.log("APP: Media stream request received, host:", req.headers.get("host"));
      if (this.upgrade(req)) {
        console.log("APP: Upgraded to WebSocket");
        return; // WebSocket will take over
      }
      console.log("APP: Failed to upgrade to WebSocket");
      return new Response("Failed to upgrade to WebSocket", { status: 400 });
    } else {
      return new Response("Not Found", { status: 404 });
    }
  },
  websocket: {
    open: (ws: ServerWebSocket<undefined>) => {
      console.log("APP: Connected to Server WebSocket");

      memoryService = new MemoryService(MEM0_API_KEY);
      
      // Initialize services in the correct order with dependencies
      textToSpeechService = new TextToSpeechService(DEEPGRAM_API_KEY);
      textToSpeechService.connect();
      console.log('APP: Text-to-Speech service connected');

      openAiTextService = new OpenAITextService(OPENAI_API_KEY, memoryService);


      deepgramService = new DeepgramService(DEEPGRAM_API_KEY);
      deepgramService.connect();
      console.log('APP: Deepgram service connected');

      // Add event listener for transcript events
      deepgramService.on('transcription', (transcript: string) => {
        console.log('📝 Received transcript event:', transcript);
        openAiTextService?.handleMessage(JSON.stringify({
          event: 'text',
          text: transcript
        }));
      });

      // Handle user speaking events
      deepgramService.on('user_speaking', (isSpeaking: boolean) => {
        console.log(`🎤 User ${isSpeaking ? 'started' : 'stopped'} speaking`);
        if (isSpeaking) {
          // Clear current AI response when user starts speaking
          ws.send(JSON.stringify({
            streamSid: streamSidTwilio,
            event: 'clear',
          }));
        }
      });

      deepgramService.on('utterance', (utterance: string) => {
        console.log('🎤 Received utterance event:', utterance);
      });

      // Add event listener for OpenAI response done events
      openAiTextService.on('openai_response_done', (response: { partialResponseIndex: number, partialResponse: string }) => {
        console.log(`APP: Received OpenAI response chunk ${response.partialResponseIndex}:`, response.partialResponse);
        textToSpeechService?.convertToSpeech(response.partialResponse, response.partialResponseIndex);
      });

      textToSpeechService.on('text_to_speech_done', (response: { streamSid: string, base64Audio: string }) => {
        console.log('APP: Text-to-Speech conversion completed');
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
          const { callSid } = data.start;
          const call = await twilioClient.calls(callSid).fetch();
          const { from, to } = call;
          console.log("APP: Call details:", { from, to });
          console.log("APP: Config:", config.users);
          const user_id = config.users[to];
          if (user_id) {
            console.log(`MemoryService: Initializing user ${user_id}`);
            memoryService?.init_user(user_id);
            openAiTextService?.connect();
            console.log('APP: OpenAI Text service connected');
          } else {
            throw new Error(`APP: No user_id found in config for number: ${to}`);
          }
          const streamSid = data.start?.streamSid;
          if (streamSid) {
            textToSpeechService?.setStreamSid(streamSid);
            streamSidTwilio = streamSid;
          } else {
            console.warn('APP: No streamSid found in start event');
          }
        }
      } catch (error) {
        console.error('APP: Error handling WebSocket message:', error);
      }
    },

    close: (ws: ServerWebSocket<undefined>) => {
      openAiTextService?.disconnect();
      deepgramService?.disconnect();
      textToSpeechService?.disconnect();
      openAiTextService = null;
      deepgramService = null;
      textToSpeechService = null;
      console.log("APP: Client disconnected.");
    },
  },
};

console.log(`APP: Server is running on port ${PORT}`);
Bun.serve(server);
