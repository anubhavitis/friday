import { createClient } from '@deepgram/sdk';
import { ServerWebSocket } from 'bun';

export class TextToSpeechService {
  private clientWs: ServerWebSocket<undefined> | null = null;
  private deepgram: any;
  private streamSid: string | null = null;

  constructor(private apiKey: string) {
    this.deepgram = createClient(apiKey);
  }

  public connect(clientWs: ServerWebSocket<undefined>) {
    this.clientWs = clientWs;
  }

  public async convertToSpeech(text: string) {
    try {
      // Request audio from Deepgram using the correct API method
      const response = await this.deepgram.speak.request(
        { text },
        {
          model: "aura-2-thalia-en",
          encoding: "mulaw",
          container: "wav",
          sample_rate: 8000
        }
      );

      // Get the audio stream
      const stream = await response.getStream();
      
      if (stream) {
        // Convert the stream to an audio buffer
        const buffer = await this.getAudioBuffer(stream);
        
        // Convert the buffer to base64
        const base64Audio = buffer.toString('base64');
        
        // Send the audio back to the client
        this.clientWs?.send(JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: {
            payload: base64Audio
          }
        }));

        console.log('🎵 Text-to-Speech conversion completed');
      } else {
        console.error('Error generating audio: No stream received');
      }
    } catch (error) {
      console.error('Error in text-to-speech conversion:', error);
      throw error;
    }
  }

  public setStreamSid(streamSid: string) {
    console.log('🔊 Setting streamSid:', streamSid);
    this.streamSid = streamSid;
  }

  private async getAudioBuffer(response: any) {
    const reader = response.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const dataArray = chunks.reduce(
      (acc: Uint8Array, chunk: Uint8Array) => Uint8Array.from([...acc, ...chunk]),
      new Uint8Array(0)
    );

    return Buffer.from(dataArray.buffer);
  }

  public disconnect() {
    this.clientWs = null;
    this.streamSid = null;
  }
} 