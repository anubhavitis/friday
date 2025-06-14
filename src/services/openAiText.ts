import { EventEmitter } from "events";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MemoryService } from "./memory";
import { Memory } from "mem0ai";
import fs from "fs";

interface OpenAIResponse {
  partialResponseIndex: number;
  partialResponse: string;
}

export class OpenAITextService extends EventEmitter {
  private client: OpenAI;
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private PERSONA: string;
  private memoryService: MemoryService;
  private readonly MODEL = "gpt-4";
  private partialResponseIndex: number = 0;

  constructor(
    private apiKey: string,
    memoryService: MemoryService
  ) {
    super();
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });

    if (!memoryService) {
      throw new Error("MemoryService is required");
    }
    this.memoryService = memoryService;
    this.PERSONA = fs.readFileSync('src/services/aiPersona.txt', 'utf8');
  }

  private formatTextForTTS(text: string): string {
    // Remove the delimiter and trim whitespace
    return text.replace(/•/g, '').trim();
  }

  public async connect() {
    try {
      // Initialize conversation with a greeting
      await this.initConversation();
      console.log("OPENAI_TEXT: Connected to OpenAI API");
    } catch (error) {
      console.error("OPENAI_TEXT: Error connecting to OpenAI:", error);
      throw error;
    }
  }

  private async get_user_info(): Promise<Memory[]> {
    const query = "give every information related to this user";
    const result = await this.memoryService.search(query);
    return result;
  }

  private async initConversation() {
    try {
      const user_info = await this.get_user_info();
      
      // Create a context message that includes both persona and user information
      const contextMessage: ChatCompletionMessageParam = {
        role: "system",
        content: `You are ${this.PERSONA}. Here is what I know about the user: ${JSON.stringify(user_info)}. 
        Use this information to create a personalized greeting. Be friendly and natural, like a friend would greet them.
        Reference specific details from their information to make the greeting more personal and engaging.
        After greeting, ask them how their day is going.`
      };

      this.conversationHistory.push(contextMessage);

      const stream = await this.client.chat.completions.create({
        model: this.MODEL,
        messages: this.conversationHistory,
        temperature: 0.8,
        stream: true,
      });

      let completeResponse = '';
      let partialResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const finishReason = chunk.choices[0]?.finish_reason;

        completeResponse += content;
        partialResponse += content;

        // Emit chunk when we hit a delimiter or end of response
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const formattedText = this.formatTextForTTS(partialResponse);
          if (formattedText) {
            const response: OpenAIResponse = {
              partialResponseIndex: this.partialResponseIndex,
              partialResponse: formattedText
            };

            this.emit('openai_response_done', response);
            this.partialResponseIndex++;
          }
          partialResponse = '';
        }
      }

      // Add complete response to conversation history
      if (completeResponse) {
        this.conversationHistory.push({ role: "assistant", content: completeResponse });
      }
    } catch (error) {
      console.error("OPENAI_TEXT: Error in initial conversation:", error);
      throw error;
    }
  }

  public async handleMessage(message: string) {
    try {
      const data = JSON.parse(message);

      if (data.event === "text") {
        console.log("OPENAI_TEXT: Processing text message:", data.text);


        const memory_query = "give any information related to this user question:" + data.text;
        const memory_result: Memory[] = await this.memoryService.search(memory_query);
        console.log("mem0ai result:", memory_result);
        
        // Add user message to conversation history
        this.conversationHistory.push({ role: "user", content: data.text });

        const stream = await this.client.chat.completions.create({
          model: this.MODEL,
          messages: this.conversationHistory,
          temperature: 0.8,
          stream: true,
        });

        let completeResponse = '';
        let partialResponse = '';

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          const finishReason = chunk.choices[0]?.finish_reason;

          completeResponse += content;
          partialResponse += content;

          // Emit chunk when we hit a delimiter or end of response
          if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
            const formattedText = this.formatTextForTTS(partialResponse);
            if (formattedText) {
              const response: OpenAIResponse = {
                partialResponseIndex: this.partialResponseIndex,
                partialResponse: formattedText
              };

              this.emit('openai_response_done', response);
              this.partialResponseIndex++;
            }
            partialResponse = '';
          }
        }

        // Add complete response to conversation history
        if (completeResponse) {
          this.conversationHistory.push({ role: "assistant", content: completeResponse });
        }
      } else {
        console.log("OPENAI_TEXT: Received non-text event:", data.event);
      }
    } catch (error) {
      console.error("OPENAI_TEXT: Error processing message:", error);
      throw error;
    }
  }

  public disconnect() {
    console.log("OPENAI_TEXT: Disconnecting OpenAI Text service...");
    this.conversationHistory = []; // clear conversation history
    this.partialResponseIndex = 0;
    console.log("OPENAI_TEXT: OpenAI Text service disconnected");
  }
} 