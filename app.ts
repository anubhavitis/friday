import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import { OpenAITextService } from "./src/services/openAiText";
import { DeepgramService } from "./src/services/deepgram";
import { TextToSpeechService } from "./src/services/textToSpeech";
import { IncomingHandler } from "./src/api/incoming";
import { UsersHandler } from "./src/api/users";

import { MemoryService } from "./src/services/memory";
import { Twilio } from "twilio";
import { SchedulerService } from "./src/services/scheduler";
import { CronService } from "./src/services/cron/cron";
import { initDb } from "./src/pkg/db";
import { env } from "./src/config/env";
import { OutboundHandler } from "./src/api/outbound";
import { CallHistoryService } from "./src/services/callHistory";
import { UserService } from "./src/services/user";

// Initialize database
const err = await initDb(env.DB_HOST, Number(env.DB_PORT), env.DB_USER, env.DB_PASSWORD, env.DB_NAME);
if (err) {
  console.error('APP: Database connection failed:', err);
  process.exit(1);
}

const twilioClient = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
let memoryService: MemoryService | null = null;
let openAiTextService: OpenAITextService | null = null;
let textToSpeechService: TextToSpeechService | null = null;
let deepgramService: DeepgramService | null = null;

const PORT = Number(env.PORT);

let schedulerService = new SchedulerService(twilioClient, env.FROM_NUMBER);
let cronService = new CronService(schedulerService);
let userService = new UserService(twilioClient);
let callHistoryService = new CallHistoryService(twilioClient);
cronService.start();

const server: Serve = {
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/health") {
      return HealthHandler.GET(req);
    } else if (pathname === "/voice/incoming") {
      return IncomingHandler.GET(req);
    } else if (pathname === "/users") {
      if (req.method === "POST") {
        return UsersHandler.POST(req);
      } else if (req.method === "GET") {
        return UsersHandler.GET(req);
      }
      return new Response("Method not allowed", { status: 405 });
    } else if (pathname === "/outbound") {
      return OutboundHandler.POST(req);
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

      memoryService = new MemoryService(env.MEM0_API_KEY);
      
      // Initialize services in the correct order with dependencies
      textToSpeechService = new TextToSpeechService(env.DEEPGRAM_API_KEY);
      textToSpeechService.connect();
      console.log('APP: Text-to-Speech service connected');

      openAiTextService = new OpenAITextService(env.OPENAI_API_KEY, memoryService);


      deepgramService = new DeepgramService(env.DEEPGRAM_API_KEY);
      deepgramService.connect();
      console.log('APP: Deepgram service connected');

      (ws as any).data = {
        memoryService,
        textToSpeechService,
        openAiTextService,
        deepgramService,
        callSidTwilio: null,
        streamSidTwilio: null,
      };

      // Add event listener for transcript events
      deepgramService.on('transcription', (transcript: string) => {
        console.log('📝 Received transcript event:', transcript);
        (ws as any).data.openAiTextService?.handleMessage(JSON.stringify({
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
            streamSid: (ws as any).data.streamSidTwilio,
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
        (ws as any).data.textToSpeechService?.convertToSpeech(response.partialResponse, response.partialResponseIndex);
      });

      textToSpeechService.on('text_to_speech_done', (response: { base64Audio: string }) => {
        console.log('APP: Text-to-Speech conversion completed');
        ws.send(JSON.stringify({
          event: 'media',
          streamSid: (ws as any).data.streamSidTwilio,
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
          (ws as any).data.deepgramService?.handleMessage(message);
        }
        // Handle start event to set streamSid
        else if (data.event === 'start') {
          console.log('APP: Received start event');
          const { callSid, streamSid } = data.start;
          let user = await userService.getUserByCallSid(callSid);
          (ws as any).data.memoryService?.init_user(user.name);
          (ws as any).data.openAiTextService?.connect();
          (ws as any).data.callSidTwilio = callSid;
          (ws as any).data.streamSidTwilio = streamSid;
          await callHistoryService.startCallHistory(callSid, user);
        }
      } catch (error) {
        console.error('APP: Error handling WebSocket message:', error);
      }
    },

    close: async (ws: ServerWebSocket<undefined>, code: number, reason: string) => {
      (ws as any).data?.openAiTextService?.disconnect();
      (ws as any).data?.deepgramService?.disconnect();
      (ws as any).data?.textToSpeechService?.disconnect();
      const callSid = (ws as any).data.callSidTwilio;
      if (!callSid) {
        console.warn('APP: No callSid found in close event');
        return;
      }
      await callHistoryService.endCallHistory(callSid);
      (ws as any).data = undefined;
      console.log("APP: Client disconnected.");
    },
  },
};

console.log(`APP: Server is running on port ${PORT}`);
Bun.serve(server);
