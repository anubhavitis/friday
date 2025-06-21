import { ServerWebSocket } from "bun";
import { MemoryService } from "../services/memory";
import { OpenAITextService } from "../services/openAiText";
import { DeepgramService } from "../services/deepgram";
import { TextToSpeechService } from "../services/textToSpeech";
import { SummaryService } from "../services/summary";
import { TwilioVoiceService } from "../services/twilioVoice";
import { UserService } from "../services/user";
import { CallHistoryService } from "../services/callHistory";
import { env } from "../config/env";

export interface WebSocketData {
  memoryService: MemoryService;
  textToSpeechService: TextToSpeechService;
  openAiTextService: OpenAITextService;
  deepgramService: DeepgramService;
  callSidTwilio: string | null;
  streamSidTwilio: string | null;
}

export class WebSocketHandler {
  private userService: UserService;
  private callHistoryService: CallHistoryService;
  private twilioVoiceService: TwilioVoiceService;

  constructor(
    userService: UserService,
    callHistoryService: CallHistoryService,
    twilioVoiceService: TwilioVoiceService
  ) {
    this.userService = userService;
    this.callHistoryService = callHistoryService;
    this.twilioVoiceService = twilioVoiceService;
  }

  handleOpen(ws: ServerWebSocket<undefined>) {
    console.log("APP: Connected to Server WebSocket");

    const memoryService = new MemoryService(env.MEM0_API_KEY);
    
    // Initialize services in the correct order with dependencies
    const textToSpeechService = new TextToSpeechService(env.DEEPGRAM_API_KEY);
    const summaryService = new SummaryService(env.OPENAI_API_KEY);
    textToSpeechService.connect();
    console.log('APP: Text-to-Speech service connected');

    const openAiTextService = new OpenAITextService(env.OPENAI_API_KEY, memoryService, summaryService);

    const deepgramService = new DeepgramService(env.DEEPGRAM_API_KEY);
    deepgramService.connect();
    console.log('APP: Deepgram service connected');

    (ws as any).data = {
      memoryService,
      textToSpeechService,
      openAiTextService,
      deepgramService,
      callSidTwilio: null,
      streamSidTwilio: null,
    } as WebSocketData;

    this.setupEventListeners(ws);
  }

  private setupEventListeners(ws: ServerWebSocket<undefined>) {
    const data = (ws as any).data as WebSocketData;

    // Add event listener for transcript events
    data.deepgramService.on('transcription', (transcript: string) => {
      console.log('📝 Received transcript event:', transcript);
      data.openAiTextService?.handleMessage(JSON.stringify({
        event: 'text',
        text: transcript
      }));
    });

    // Handle user speaking events
    data.deepgramService.on('user_speaking', (isSpeaking: boolean) => {
      console.log(`🎤 User ${isSpeaking ? 'started' : 'stopped'} speaking`);
      if (isSpeaking) {
        // Clear current AI response when user starts speaking
        ws.send(JSON.stringify({
          streamSid: data.streamSidTwilio,
          event: 'clear',
        }));
      }
    });

    data.deepgramService.on('utterance', (utterance: string) => {
      console.log('🎤 Received utterance event:', utterance);
    });

    // Add event listener for OpenAI response done events
    data.openAiTextService.on('openai_response_done', (response: { partialResponseIndex: number, partialResponse: string }) => {
      console.log(`APP: Received OpenAI response chunk ${response.partialResponseIndex}:`, response.partialResponse);
      data.textToSpeechService?.convertToSpeech(response.partialResponse, response.partialResponseIndex);
    });

    data.openAiTextService.on('openai_response_ended', (response: string) => {
      console.log('APP: OpenAI response ended:', response);
      if (data.callSidTwilio) {
        this.twilioVoiceService.hangupCall(data.callSidTwilio);
      }
    });

    data.textToSpeechService.on('text_to_speech_done', (response: { base64Audio: string }) => {
      console.log('APP: Text-to-Speech conversion completed');
      ws.send(JSON.stringify({
        event: 'media',
        streamSid: data.streamSidTwilio,
        media: { payload: response.base64Audio }
      }));
    });
  }

  async handleMessage(ws: ServerWebSocket<undefined>, message: string) {
    try {
      const data = (ws as any).data as WebSocketData;
      const parsedData = JSON.parse(message);
      
      // Handle media events from Twilio
      if (parsedData.event === 'media') {
        // Send audio to Deepgram for speech-to-text
        data.deepgramService?.handleMessage(message);
      }
      // Handle start event to set streamSid
      else if (parsedData.event === 'start') {
        console.log('APP: Received start event');
        const { callSid, streamSid } = parsedData.start;
        let user = await this.userService.getUserByCallSid(callSid);
        data.memoryService?.init_user(user.id.toString());
        data.openAiTextService?.setUserId(user.id);
        data.openAiTextService?.connect();
        data.callSidTwilio = callSid;
        data.streamSidTwilio = streamSid;
        await this.callHistoryService.startCallHistory(callSid, user);
      }
    } catch (error) {
      console.error('APP: Error handling WebSocket message:', error);
    }
  }

  async handleClose(ws: ServerWebSocket<undefined>, code: number, reason: string) {
    const data = (ws as any).data as WebSocketData;
    
    await data?.openAiTextService?.disconnect();
    data?.deepgramService?.disconnect();
    data?.textToSpeechService?.disconnect();
    
    const callSid = data?.callSidTwilio;
    if (!callSid) {
      console.warn('APP: No callSid found in close event');
      return;
    }
    
    await this.callHistoryService.endCallHistory(callSid);
    (ws as any).data = undefined;
    console.log("APP: Client disconnected.");
  }
} 