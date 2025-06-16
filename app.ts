import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import { OpenAITextService } from "./src/services/openAiText";
import { SpeechToTextDeepgramService } from "./src/services/speechToTextDeepgram";
import { TextToSpeechDeepgramService } from "./src/services/textToSpeechDeepgram";
import { IncomingHandler } from "./src/api/incoming";
import { EventName } from "./src/enums/eventEmitter";
import MemoryClient, { Message } from 'mem0ai';
import { MemoryService } from "./src/services/memory";
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { StreamService } from "./src/services/streamService";
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

const memoryService = new MemoryService(MEM0_API_KEY);

let openAiTextService: OpenAITextService | null = null;
let speechToTextdeepgramService: SpeechToTextDeepgramService | null = null;
let textToSpeechDeepgramService: TextToSpeechDeepgramService | null = null;
let streamService: StreamService | null = null;
let streamSidTwilio: string | null = null;
const PORT = process.env.PORT || 3000;

// Function to save audio file
async function saveAudioFile(base64Audio: string, streamSid: string): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tts_${streamSid}_${timestamp}.wav`;
    const filepath = join(process.cwd(), 'audio_logs', filename);
    
    // Convert base64 to buffer and save
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    await writeFile(filepath, audioBuffer);
    console.log(`APP: Saved audio file: ${filename}`);
  } catch (error) {
    console.error('APP: Error saving audio file:', error);
  }
}

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
      
      // Initialize services in the correct order with dependencies
      textToSpeechDeepgramService = new TextToSpeechDeepgramService(DEEPGRAM_API_KEY);
      textToSpeechDeepgramService.connect();
      console.log('APP: Text-to-Speech service connected');

      openAiTextService = new OpenAITextService(OPENAI_API_KEY, memoryService);
      openAiTextService.connect();
      console.log('APP: OpenAI Text service connected');

      speechToTextdeepgramService = new SpeechToTextDeepgramService(DEEPGRAM_API_KEY);
      speechToTextdeepgramService.connect();
      console.log('APP: Deepgram service connected');

      streamService = new StreamService(ws);

      // Add event listener for transcript events
      speechToTextdeepgramService.on(EventName.STT_DEEPGRAM_TRANSCRIPTION, (transcript: string) => {
        console.log('📝 Received transcript event:', transcript);
        openAiTextService?.handleMessage(JSON.stringify({
          event: 'text',
          text: transcript
        }));
      });

      // Handle user speaking events
      speechToTextdeepgramService.on(EventName.STT_DEEPGRAM_USER_SPEAKING, (isSpeaking: boolean) => {
        console.log(`🎤 User ${isSpeaking ? 'started' : 'stopped'} speaking`);
        if (isSpeaking) {
          // Clear current AI response when user starts speaking
          ws.send(JSON.stringify({
            streamSid: streamSidTwilio,
            event: 'clear',
          }));
        }
      });

      speechToTextdeepgramService.on(EventName.STT_DEEPGRAM_UTTERANCE, (utterance: string) => {
        console.log('🎤 Received utterance event:', utterance);
      });

      // Add event listener for OpenAI response done events
      openAiTextService.on(EventName.OPENAI_RESPONSE_DONE, (response: { partialResponseIndex: number, partialResponse: string }) => {
        console.log(`APP: Received OpenAI response chunk ${response.partialResponseIndex}:`, response.partialResponse);
        textToSpeechDeepgramService?.convertToSpeech(response.partialResponse, response.partialResponseIndex);
      });

      textToSpeechDeepgramService.on(EventName.TTS_DEEPGRAM_DONE, async (response: { streamSid: string, base64Audio: string, index: number }) => {
        console.log('APP: Text-to-Speech conversion completed');
        
        // Save the audio file
        // await saveAudioFile(response.base64Audio, response.streamSid);
        
        streamService?.buffer(response.index, response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
        streamService?.sendAudio(response.base64Audio);
      });
    },

    message: async (ws: ServerWebSocket<undefined>, message: string) => {
      try {
        const data = JSON.parse(message);

        // Handle media events from Twilio
        if (data.event === 'media') {
          // Send audio to Deepgram for speech-to-text
          speechToTextdeepgramService?.handleMessage(message);
        }
        // Handle start event to set streamSid
        else if (data.event === 'start') {
          console.log('APP: Start event received, streamSid:', data?.streamSid);
          const streamSid = data.start?.streamSid;
          if (streamSid) {
            textToSpeechDeepgramService?.setStreamSid(streamSid);
            streamSidTwilio = streamSid;
            streamService?.setStreamSid(streamSid);
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
      speechToTextdeepgramService?.disconnect();
      textToSpeechDeepgramService?.disconnect();
      openAiTextService = null;
      speechToTextdeepgramService = null;
      textToSpeechDeepgramService = null;
      console.log("APP: Client disconnected.");
    },
  },
};

console.log(`APP: Server is running on port ${PORT}`);
Bun.serve(server);
