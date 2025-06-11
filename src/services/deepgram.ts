import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { ServerWebSocket } from 'bun';
import { TextToSpeechService } from './textToSpeech';

export class DeepgramService {
  private connection: any = null;
  private clientWs: ServerWebSocket<undefined> | null = null;
  private ttsWs: ServerWebSocket<undefined> | null = null;
  private streamSid: string | null = null;

  constructor(
    private apiKey: string,
    private textToSpeechService: TextToSpeechService
  ) {
    if (!apiKey) {
      console.error('Deepgram API key is missing or invalid');
    }
  }

  public connect(clientWs: ServerWebSocket<undefined>) {
    this.clientWs = clientWs;
    this.setupDeepgramConnection();
  }

  private setupDeepgramConnection() {
    // Create a Deepgram client using the API key
    const deepgram = createClient(this.apiKey);

    // Create a live transcription connection
    this.connection = deepgram.listen.live({
      encoding: 'mulaw',
      sample_rate: 8000,
      model: 'nova-2',
      punctuate: true,
      interim_results: true,
      endpointing: 200,
      utterance_end_ms: 1000
    });

    // Set up event listeners
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('Connected to Deepgram WebSocket');
    });

    this.connection.on(LiveTranscriptionEvents.Close, (event: any) => {
      console.log('Disconnected from Deepgram WebSocket', {
        code: event?.code,
        reason: event?.reason,
        wasClean: event?.wasClean,
        timestamp: new Date().toISOString()
      });
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (transcript) {
        // Print the transcribed text
        console.log('\n🎤 Deepgram Transcription:', transcript);
        
        // Send the transcript back to the client
        this.clientWs?.send(JSON.stringify({
          event: 'tts',
          transcript: transcript
        }));

        // Call text-to-speech service to convert the transcript to speech
        try {
          await this.textToSpeechService.convertToSpeech(transcript);
        } catch (error) {
          console.error('Error converting transcript to speech:', error);
        }
      }
    });

    this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
      console.log('Metadata received:', JSON.stringify(data, null, 2));
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('Error in Deepgram connection:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });
  }

  public handleMessage(message: string) {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case 'media':
          if (this.connection) {
            // Send audio data to Deepgram
            const audioBuffer = Buffer.from(data.media.payload, 'base64');
            this.connection.send(audioBuffer);
          }
          break;
        case 'start':
          this.streamSid = data.start.streamSid;
          console.log('Incoming stream has started', this.streamSid);
          break;
        default:
          console.log('Received non-media event:', data.event);
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  public disconnect() {
    if (this.connection) {
      console.log('Manually disconnecting Deepgram service...');
      this.connection.finish();
      this.connection = null;
    }
    this.clientWs = null;
    this.streamSid = null;
  }
}
