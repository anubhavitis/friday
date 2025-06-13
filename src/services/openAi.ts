import { WebSocket, MessageEvent } from "ws";
import { ServerWebSocket } from "bun";

export class OpenAIService {
  private ws: WebSocket | null = null;
  private streamSid: string | null = null;
  private clientWs: ServerWebSocket<undefined> | null = null;

  private readonly SYSTEM_MESSAGE =
    "You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested in and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.";
  private readonly VOICE = "alloy";
  private readonly MODEL = "gpt-4o-realtime-preview-2024-12-17";
  private readonly LOG_EVENT_TYPES = [
    "response.content.done",
    "rate_limits.updated",
    "response.done",
    "input_audio_buffer.committed",
    "input_audio_buffer.speech_stopped",
    "input_audio_buffer.speech_started",
    "session.created",
  ];

  constructor(private apiKey: string) {}

  public connect(clientWs: ServerWebSocket<undefined>) {
    this.clientWs = clientWs;
    this.ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${this.MODEL}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers() {
    if (!this.ws) return;

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const response = JSON.parse(event.data.toString());
        if (this.LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`OPENAI: Received event: ${response.type}`, response);
        }
        if (response.type === "session.updated") {
          console.log("OPENAI: Session updated successfully:", response);
        }
        if (response.type === "response.audio.delta" && response.delta) {
          console.log(
            `OPENAI: Received event: ${response.type}, ${this.streamSid}`
          );
          const audioDelta = {
            event: "media",
            streamSid: this.streamSid,
            media: {
              payload: Buffer.from(response.delta, "base64").toString("base64"),
            },
          };
          if (this.clientWs) {
            this.clientWs.send(JSON.stringify(audioDelta));
          } else {
            console.error("OPENAI: No client WebSocket found to send audio delta");
          }
        }
      } catch (error) {
        console.error(
          "OPENAI: Error processing OpenAI message:",
          error,
          "Raw message:",
          event
        );
      }
    };

    this.ws.onopen = () => {
      console.log("OPENAI: Connected to the OpenAI Realtime API");
      setTimeout(() => this.sendSessionUpdate(), 250);
    };

    this.ws.onclose = () => {
      console.log("OPENAI: Disconnected from the OpenAI Realtime API");
    };

    this.ws.onerror = (error: any) => {
      console.error("OPENAI: Error in the OpenAI WebSocket:", error);
    };
  }

  private sendSessionUpdate() {
    if (!this.ws) return;

    const sessionUpdate = {
      type: "session.update",
      session: {
        turn_detection: { type: "server_vad" },
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: this.VOICE,
        instructions: this.SYSTEM_MESSAGE,
        modalities: ["text", "audio"],
        temperature: 0.8,
      },
    };
    console.log("OPENAI: Sending session update:", JSON.stringify(sessionUpdate));
    this.ws.send(JSON.stringify(sessionUpdate));
  }

  public initConversation() {
    if (!this.ws) {
      console.error("OPENAI: WebSocket not connected to start initial conversation");
      return;
    }

    // Define the persona for the AI
    const persona = {
        description: "You are a virtual AI assistant, similar to Jarvis from Marvel's Tony Stark. Your personality is friendly and fun, making conversations enjoyable. " +
        "Respond in a concise manner, using a maximum of 2 sentences for each response. Avoid lengthy explanations and stick to simple, direct answers. " +
        "Make sure to stay on topic and keep communications clear and straightforward."
    };


    // Sending persona to the AI
    this.ws.send(JSON.stringify({ type: "persona.update", persona }));


    // Initial greeting message
    const initialConversationItem = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `greet user as per your persona, and ask them how is their day going.`,
          },
        ],
      },
    };

    console.log("OPENAI: Sending initial conversation item:");
    this.ws.send(JSON.stringify(initialConversationItem));
    this.ws.send(JSON.stringify({ type: "response.create" }));
    console.log("OPENAI: Sent initial conversation item and response.create");
  }

  public handleMessage(message: string) {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case "media":
          if (this.ws?.readyState === WebSocket.OPEN) {
            const audioAppend = {
              type: "input_audio_buffer.append",
              audio: data.media.payload,
            };
            this.ws.send(JSON.stringify(audioAppend));
          }
          break;
        case "start":
          this.streamSid = data.start.streamSid;
          console.log("OPENAI: Incoming stream has started", this.streamSid);
          break;
        default:
          console.log("OPENAI: Received non-media event:", data.event);
          break;
      }
    } catch (error) {
      console.error("OPENAI: Error parsing message:", error, "Message:", message);
    }
  }

  public disconnect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.clientWs = null;
    this.streamSid = null;
  }
}
