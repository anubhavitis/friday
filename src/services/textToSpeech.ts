import { createClient } from '@deepgram/sdk';
import { EventEmitter } from "events";

interface QueuedResponse {
  text: string;
  index: number;
}

export class TextToSpeechService extends EventEmitter {
  private deepgram: any;
  private streamSid: string | null = null;
  private responseQueue: QueuedResponse[] = [];
  private isProcessing: boolean = false;
  private currentIndex: number = 0;

  constructor(private apiKey: string) {
    super();
    this.deepgram = createClient(apiKey);
  }

  public connect() {
  
  }

  public async convertToSpeech(text: string, index: number) {
    try {
      if (!this.streamSid) {
        console.warn('TTS: No streamSid set, cannot send audio response');
        return;
      }

      // Add to queue
      this.responseQueue.push({ text, index });
      console.log(`TTS: Added response ${index} to queue. Queue length: ${this.responseQueue.length}`);

      // Start processing if not already processing
      if (!this.isProcessing) {
        await this.processQueue();
      }
    } catch (error) {
      console.error('TTS: Error queueing text-to-speech conversion:', error);
      throw error;
    }
  }

  private async processQueue() {
    if (this.isProcessing || this.responseQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.responseQueue.length > 0) {
      // Find the next response in sequence
      const nextIndex = this.responseQueue.findIndex(item => item.index === this.currentIndex);
      
      if (nextIndex === -1) {
        // If we can't find the next response, wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const { text } = this.responseQueue[nextIndex];
      this.responseQueue.splice(nextIndex, 1);

      try {
        // Request audio from Deepgram
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
          
          // Send the audio back to the client with the current streamSid
          this.emit('text_to_speech_done', {
            streamSid: this.streamSid,
            base64Audio
          });

          console.log(`TTS: Text-to-Speech conversion completed for chunk ${this.currentIndex}`);
          this.currentIndex++;
        } else {
          console.error('TTS: Error generating audio: No stream received');
        }
      } catch (error) {
        console.error(`TTS: Error processing text-to-speech for chunk ${this.currentIndex}:`, error);
        // Continue with next chunk even if this one failed
        this.currentIndex++;
      }
    }

    this.isProcessing = false;
  }

  public setStreamSid(streamSid: string) {
    console.log('TTS: Setting streamSid:', streamSid);
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

    this.streamSid = null;
    this.responseQueue = [];
    this.isProcessing = false;
    this.currentIndex = 0;
  }
} 