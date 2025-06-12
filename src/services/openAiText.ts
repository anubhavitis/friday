import { WebSocket, MessageEvent } from "ws";
import { ServerWebSocket } from "bun";
import { TextToSpeechService } from "./textToSpeech";

export class OpenAITextService {
  private ws: WebSocket | null = null;
  private clientWs: ServerWebSocket<undefined> | null = null;

  private readonly SYSTEM_MESSAGE =
    "You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested in and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.";
  private readonly MODEL = "gpt-4o-realtime-preview-2024-12-17";
  private readonly LOG_EVENT_TYPES = [
    "response.content.done",
    "rate_limits.updated",
    "response.done",
    "session.created",
  ];

  constructor(
    private apiKey: string,
    private textToSpeechService: TextToSpeechService
  ) {}

  public connect(clientWs: ServerWebSocket<undefined>) {
    this.clientWs = clientWs;
    this.ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${this.MODEL}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers() {
    if (!this.ws) return;

    this.ws.onmessage = async (event: MessageEvent) => {
      try {
        const response = JSON.parse(event.data.toString());
        if (this.LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response);
        }
        if (response.type === "session.updated") {
          console.log("Session updated successfully:", response);
        }
        if (response.type === "response.done" && response.response?.output?.[0]?.content?.[0]?.text) {
          const responseText = response.response.output[0].content[0].text;
          console.log(`OpenAI received text response: ${responseText}`);
          
          // Convert the response to speech
          try {
            console.log("Converting response to speech", responseText);
            await this.textToSpeechService.convertToSpeech(responseText);
          } catch (error) {
            console.error('Error converting OpenAI response to speech:', error);
          }
        }
      } catch (error) {
        console.error("Error processing OpenAI message:", error, "Raw message:", event);
      }
    };

    this.ws.onopen = () => {
      console.log("Connected to the OpenAI Realtime API");
      console.log("WebSocket readyState:", this.ws?.readyState);
      setTimeout(() => this.sendSessionUpdate(), 250);
    };

    this.ws.onclose = (event: any) => {
      console.log("Disconnected from the OpenAI Realtime API", {
        code: event?.code,
        reason: event?.reason,
        wasClean: event?.wasClean,
        timestamp: new Date().toISOString()
      });
      console.log("WebSocket readyState at close:", this.ws?.readyState);
    };

    this.ws.onerror = (error: any) => {
      console.error("Error in the OpenAI WebSocket:", {
        message: error.message,
        type: error.type,
        timestamp: new Date().toISOString()
      });
      console.log("WebSocket readyState at error:", this.ws?.readyState);
    };
  }

  private sendSessionUpdate() {
    if (!this.ws) {
      console.error("Cannot send session update: WebSocket is null");
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error(`Cannot send session update: WebSocket is not OPEN (state: ${this.ws.readyState})`);
      return;
    }

    const sessionUpdate = {
      type: "session.update",
      session: {
        instructions: this.SYSTEM_MESSAGE,
        modalities: ["text"],
        temperature: 0.8,
      },
    };
    console.log("Sending session update:", JSON.stringify(sessionUpdate));
    this.ws.send(JSON.stringify(sessionUpdate));
  }

  public initConversation() {
    if (!this.ws) {
      console.error("WebSocket not connected to start initial conversation");
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error(`Cannot initialize conversation: WebSocket is not OPEN (state: ${this.ws.readyState})`);
      return;
    }

    const initialConversationItem = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: 'Greet the user with "Hello there! I\'m an AI text assistant powered by OpenAI. How can I help you today?"',
          },
        ],
      },
    };

    console.log("Sending initial conversation item:");
    this.ws.send(JSON.stringify(initialConversationItem));
    this.ws.send(JSON.stringify({ type: "response.create" }));
    console.log("Sent initial conversation item and response.create");
  }

  public handleMessage(message: string) {
    try {
      const data = JSON.parse(message);

      if (data.event === "text" && this.ws?.readyState === WebSocket.OPEN) {
        console.log("Processing text message:", data.text);
        const textMessage = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: data.text,
              },
            ],
          },
        };
        this.ws.send(JSON.stringify(textMessage));
        this.ws.send(JSON.stringify({ type: "response.create" }));
        console.log("Sent text message to OpenAI");
      } else {
        console.log(`Received non-text event or WebSocket not OPEN (state: ${this.ws?.readyState}):`, data.event);
      }
    } catch (error) {
      console.error("Error parsing message:", error, "Message:", message);
    }
  }

  public disconnect() {
    console.log("Disconnecting OpenAI Text service...");
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("Closing WebSocket connection...");
      this.ws.close();
    } else {
      console.log(`WebSocket not OPEN during disconnect (state: ${this.ws?.readyState})`);
    }
    this.ws = null;
    this.clientWs = null;
    console.log("OpenAI Text service disconnected");
  }
} 