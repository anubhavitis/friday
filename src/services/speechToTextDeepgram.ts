import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { MemoryService } from './memory';
import { Memory } from 'mem0ai';
import { EventName } from '../enums/eventEmitter';

export class SpeechToTextDeepgramService extends EventEmitter {
  private connection: any = null;
  private streamSid: string | null = null;
  private shouldReconnect: boolean = true;
  private finalResult: string = '';
  private isUserSpeaking: boolean = false;
  private silenceThreshold: number = 1000; // 1 second of silence to consider speech ended
  private lastSpeechTime: number = 0;
  private utteranceTimeout: NodeJS.Timeout | null = null;

  constructor(
    private apiKey: string,
  ) {
    super();
    if (!apiKey) {
      console.error('DEEPGRAM: API key is missing or invalid');
    }
  }

  public connect() {
    this.setupDeepgramConnection();
  }

  private async setupDeepgramConnection() {
    try {
      const deepgram = createClient(this.apiKey);

      this.connection = deepgram.listen.live({
        encoding: 'mulaw',
        sample_rate: 8000,
        model: 'nova-2',
        punctuate: true,
        interim_results: true,
        endpointing: 200,
        utterance_end_ms: 1000,
        vad_events: true // Enable Voice Activity Detection events
      });
      
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('DEEPGRAM: Connected to Deepgram WebSocket');
      });

      this.connection.on(LiveTranscriptionEvents.Close, (event: any) => {
        console.log('DEEPGRAM: Disconnected from Deepgram WebSocket', event?.reason);

        if (this.shouldReconnect) {
          setTimeout(() => {
            console.log('DEEPGRAM: Attempting to reconnect to Deepgram...');
            this.setupDeepgramConnection();
          }, 2000);
        }
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const alternatives = data.channel?.alternatives;
        let text = '';
        if (alternatives) {
          text = alternatives[0]?.transcript;
        }

        // Clear any existing utterance timeout
        if (this.utteranceTimeout) {
          clearTimeout(this.utteranceTimeout);
          this.utteranceTimeout = null;
        }

        // Handle UtteranceEnd event
        if (data.type === 'UtteranceEnd') {
          console.log('UtteranceEnd received');
          if (this.finalResult.trim().length > 0) {
            console.log('Emitting final transcription:', this.finalResult);
            this.emit(EventName.STT_DEEPGRAM_TRANSCRIPTION, this.finalResult);
            this.finalResult = '';
          }
          this.isUserSpeaking = false;
          return;
        }

        // Handle final transcriptions
        if (data.is_final === true && text.trim().length > 0) {
          console.log('Final transcription received:', text);
          this.finalResult += ` ${text}`;
          this.lastSpeechTime = Date.now();
          
          if (data.speech_final === true) {
            console.log('Speech final received, emitting transcription');
            this.emit(EventName.STT_DEEPGRAM_TRANSCRIPTION, this.finalResult);
            this.finalResult = '';
            this.isUserSpeaking = false;
          }
        } else if (text.trim().length > 0) {
          // Handle interim results
          this.lastSpeechTime = Date.now();
          
          // If this is the first utterance after silence, emit user_speaking event
          if (!this.isUserSpeaking) {
            this.isUserSpeaking = true;
            this.emit(EventName.STT_DEEPGRAM_USER_SPEAKING, true);
          }
          
          this.emit(EventName.STT_DEEPGRAM_UTTERANCE, text);

          // Set a timeout to emit the transcription if we don't get a final result
          this.utteranceTimeout = setTimeout(() => {
            if (this.finalResult.trim().length > 0) {
              console.log('Emitting transcription after timeout:', this.finalResult);
              this.emit(EventName.STT_DEEPGRAM_TRANSCRIPTION, this.finalResult);
              this.finalResult = '';
              this.isUserSpeaking = false;
            }
          }, 2000); // Wait 2 seconds after last utterance
        } else {
          // Check for silence
          const timeSinceLastSpeech = Date.now() - this.lastSpeechTime;
          if (this.isUserSpeaking && timeSinceLastSpeech > this.silenceThreshold) {
            this.isUserSpeaking = false;
            this.emit(EventName.STT_DEEPGRAM_USER_SPEAKING, false);
            
            // If we have accumulated text, emit it as transcription
            if (this.finalResult.trim().length > 0) {
              console.log('Emitting transcription after silence:', this.finalResult);
              this.emit(EventName.STT_DEEPGRAM_TRANSCRIPTION, this.finalResult);
              this.finalResult = '';
            }
          }
        }
      });

      this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
        console.log('DEEPGRAM: Metadata received.');
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error('DEEPGRAM: Error in Deepgram connection:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });

        if (this.shouldReconnect) {
          setTimeout(() => {
            console.log('DEEPGRAM: Attempting to reconnect to Deepgram after error...');
            this.setupDeepgramConnection();
          }, 2000);
        }
      });
    } catch (error) {
      console.error('DEEPGRAM: Error setting up Deepgram connection:', error);
      if (this.shouldReconnect) {
        setTimeout(() => {
          console.log('DEEPGRAM: Attempting to reconnect to Deepgram after setup error...');
          this.setupDeepgramConnection();
        }, 2000);
      }
    }
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
          console.log('DEEPGRAM: Incoming stream has started', this.streamSid);
          break;
        default:
          console.log('DEEPGRAM: Received non-media event:', data.event);
          break;
      }
    } catch (error) {
      console.error('DEEPGRAM: Error handling message:', error);
    }
  }

  public disconnect() {
    this.shouldReconnect = false;
    
    if (this.connection) {
      console.log('DEEPGRAM: Manually disconnecting Deepgram service...');
      this.connection.finish();
      this.connection = null;
    }
    if (this.utteranceTimeout) {
      clearTimeout(this.utteranceTimeout);
      this.utteranceTimeout = null;
    }
    this.streamSid = null;
    this.finalResult = '';
    this.isUserSpeaking = false;
    this.lastSpeechTime = 0;
  }
}
