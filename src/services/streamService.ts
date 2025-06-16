import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ServerWebSocket } from 'bun';

interface MediaPayload {
  payload: string;
}

interface MarkPayload {
  name: string;
}

interface WebSocketMessage {
  streamSid: string;
  event: 'media' | 'mark';
  media?: MediaPayload;
  mark?: MarkPayload;
}

export class StreamService extends EventEmitter {
  private ws: ServerWebSocket;
  private expectedAudioIndex: number;
  private audioBuffer: { [key: number]: string };
  private streamSid: string;

  constructor(websocket: ServerWebSocket) {
    super();
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.streamSid = '';
  }

  setStreamSid(streamSid: string): void {
    this.streamSid = streamSid;
  }

  buffer(index: number | null, audio: string): void {
    // Escape hatch for intro message, which doesn't have an index
    if (index === null) {
      this.sendAudio(audio);
    } else if (index === this.expectedAudioIndex) {
      console.log(`Sending audio for index ${index}, and expected index is ${this.expectedAudioIndex}`);
      this.sendAudio(audio);
      this.expectedAudioIndex++;

      while (Object.prototype.hasOwnProperty.call(this.audioBuffer, this.expectedAudioIndex)) {
        console.log(`Sending buffered audio for index ${this.expectedAudioIndex}`);
        const bufferedAudio = this.audioBuffer[this.expectedAudioIndex];
        this.sendAudio(bufferedAudio);
        this.expectedAudioIndex++;
      }
    } else {
      this.audioBuffer[index] = audio;
    }
  }

  public sendAudio(audio: string): void {
    const mediaMessage: WebSocketMessage = {
      streamSid: this.streamSid,
      event: 'media',
      media: {
        payload: audio,
      },
    };
    this.ws.send(JSON.stringify(mediaMessage));

    // When the media completes you will receive a `mark` message with the label
    const markLabel = uuidv4();
    const markMessage: WebSocketMessage = {
      streamSid: this.streamSid,
      event: 'mark',
      mark: {
        name: markLabel,
      },
    };
    this.ws.send(JSON.stringify(markMessage));
    this.emit('audiosent', markLabel);
  }
}
