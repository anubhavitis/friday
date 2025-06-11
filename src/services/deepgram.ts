import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { ServerWebSocket } from 'bun';

export class DeepgramService {
  private connection: any = null;
  private clientWs: ServerWebSocket<undefined> | null = null;
  private streamSid: string | null = null;

  constructor(private apiKey: string) {}

  public connect(clientWs: ServerWebSocket<undefined>) {
    this.clientWs = clientWs;
    this.setupDeepgramConnection();
  }

  private setupDeepgramConnection() {
    // Create a Deepgram client using the API key
    const deepgram = createClient(this.apiKey);

    // Create a live transcription connection
    this.connection = deepgram.listen.live({
      model: 'nova-3',
      language: 'en-IN',
      smart_format: true,
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      diarize: false,
      punctuate: true,
      vad_turnoff: 500,
      utterances: true,
      endpointing: 300,
    });

    // Set up event listeners
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('Connected to Deepgram WebSocket');
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('Disconnected from Deepgram WebSocket');
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (transcript) {
        // Print the transcribed text
        console.log('\n🎤 Deepgram Transcription:', transcript);
        
        // Send the transcript back to the client
        this.clientWs?.send(JSON.stringify({
          event: 'transcript',
          transcript: transcript
        }));
      }
    });

    this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
      console.log('Metadata received:', data);
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('Error in Deepgram connection:', error);
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
      this.connection.finish();
      this.connection = null;
    }
    this.clientWs = null;
    this.streamSid = null;
  }
}
