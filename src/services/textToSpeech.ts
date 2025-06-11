import { createClient } from '@deepgram/sdk';
import { ServerWebSocket } from 'bun';

export class TextToSpeechService {
  private clientWs: ServerWebSocket<undefined> | null = null;
  private deepgram: any;

  constructor(private apiKey: string) {
    this.deepgram = createClient(apiKey);
  }

  public connect(clientWs: ServerWebSocket<undefined>) {
    this.clientWs = clientWs;
  }

  public async convertToSpeech(text: string) {
    try {
      // Request audio from Deepgram
      const audio = await this.deepgram.speak.sync({
        text: text,
        model: "aura-asteria-en", // Using Deepgram's latest TTS model
        encoding: "mulaw",
        container: "wav",
        sample_rate: 8000,
        voice: "asteria", // Female voice optimized for Indian English
      });

      if (audio) {
        // Convert the audio to base64
        const base64Audio = Buffer.from(audio).toString('base64');
        
        // Send the audio back to the client
        this.clientWs?.send(JSON.stringify({
          event: 'media',
          media: {
            payload: base64Audio
          }
        }));

        console.log('🎵 Text-to-Speech conversion completed');
      }
    } catch (error) {
      console.error('Error in text-to-speech conversion:', error);
      throw error;
    }
  }

  public disconnect() {
    this.clientWs = null;
  }
} 