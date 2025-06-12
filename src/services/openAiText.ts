import { EventEmitter } from "events";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export class OpenAITextService extends EventEmitter {
  private client: OpenAI;
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private readonly SYSTEM_MESSAGE =
    "You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested in and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate. And also reply with a short and concise answer.";
  private readonly MODEL = "gpt-4";

  constructor(
    private apiKey: string,
  ) {
    super();
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
    // Initialize conversation history with system message
    this.conversationHistory = [
      { role: "system", content: this.SYSTEM_MESSAGE }
    ];
  }

  public async connect() {
    try {
      // Initialize conversation with a greeting
      await this.initConversation();
      console.log("Connected to OpenAI API");
    } catch (error) {
      console.error("Error connecting to OpenAI:", error);
      throw error;
    }
  }

  private async initConversation() {
    try {
      const greetingMessage = 'Greet the user with "Hello there! I\'m an AI text assistant powered by OpenAI. How can I help you today?"';
      this.conversationHistory.push({ role: "user", content: greetingMessage });

      const response = await this.client.chat.completions.create({
        model: this.MODEL,
        messages: this.conversationHistory,
        temperature: 0.8,
      });

      const responseText = response.choices[0]?.message?.content;
      if (responseText) {
        // Add AI's response to conversation history
        this.conversationHistory.push({ role: "assistant", content: responseText });
        console.log("OpenAI received response:", responseText);
        this.emit('openai_response_done', responseText);
      }
    } catch (error) {
      console.error("Error in initial conversation:", error);
      throw error;
    }
  }

  public async handleMessage(message: string) {
    try {
      const data = JSON.parse(message);

      if (data.event === "text") {
        console.log("Processing text message:", data.text);
        
        // Add user message to conversation history
        this.conversationHistory.push({ role: "user", content: data.text });

        const response = await this.client.chat.completions.create({
          model: this.MODEL,
          messages: this.conversationHistory,
          temperature: 0.8,
        });

        const responseText = response.choices[0]?.message?.content;
        if (responseText) {
          // Add AI's response to conversation history
          this.conversationHistory.push({ role: "assistant", content: responseText });
          console.log("OpenAI received response:", responseText);
          this.emit('openai_response_done', responseText);
        }
      } else {
        console.log("Received non-text event:", data.event);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  public disconnect() {
    console.log("Disconnecting OpenAI Text service...");
    // Clear conversation history on disconnect
    this.conversationHistory = [
      { role: "system", content: this.SYSTEM_MESSAGE }
    ];
    console.log("OpenAI Text service disconnected");
  }
} 