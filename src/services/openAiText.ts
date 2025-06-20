import { EventEmitter } from "events";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MemoryService } from "./memory";
import { Memory } from "mem0ai";
import * as fs from "fs";
import AgendaDbService from "../repository/agendas";
// import { personasService } from "./personas";
import { buildInitialAIContext } from "./aiContext";
import { SummaryService } from "./summary";

interface OpenAIResponse {
  partialResponseIndex: number;
  partialResponse: string;
}

interface ConversationHistory {
  speaker: "user" | "assistant";
  content: string;
}

export class OpenAITextService extends EventEmitter {
  private client: OpenAI;
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private persona: string;
  private memoryService: MemoryService;
  private agendaService: typeof AgendaDbService;
  private summaryService: SummaryService;
  private readonly MODEL = "gpt-4o-mini";
  private partialResponseIndex: number = 0;
  private conversationHistoryArray: ConversationHistory[] = [];
  private currentDate: string;
  private currentUserId: number | null = null;

  constructor(private apiKey: string, memoryService: MemoryService, summaryService: SummaryService, userId?: number) {
    super();
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });

    if (!memoryService) {
      throw new Error("MemoryService is required");
    }
    
    this.memoryService = memoryService;
    this.agendaService = AgendaDbService;
    this.summaryService = summaryService;
    this.persona = fs.readFileSync("src/services/aiPersona.txt", "utf8");
    this.currentDate = new Date().toISOString().split("T")[0];
    this.currentUserId = userId || null;
  }

  public setUserId(userId: number): void {
    this.currentUserId = userId;
  }

  private formatTextForTTS(text: string): string {
    return text.replace(/•/g, "").trim();
  }

  private shouldEmitChunk(content: string, finishReason: string | null): boolean {
    // Emit on bullet points (existing logic)
    if (content.trim().slice(-1) === "•") {
      return true;
    }
    
    // Emit when response ends
    if (finishReason === "stop") {
      return true;
    }
    
    // Emit on sentence endings (., !, ?)
    const sentenceEndings = ['.', '!', '?'];
    const lastChar = content.trim().slice(-1);
    if (sentenceEndings.includes(lastChar)) {
      return true;
    }
    
    // Emit on natural pauses (comma followed by space and capital letter)
    if (content.includes(', ') && /[A-Z]/.test(content.slice(-1))) {
      const parts = content.split(', ');
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (lastPart.length > 0 && /^[A-Z]/.test(lastPart)) {
          return true;
        }
      }
    }
    
    // Emit on question marks (questions should always be separate)
    if (content.includes('?')) {
      return true;
    }
    
    // Emit on exclamation marks (exclamations should be separate)
    if (content.includes('!')) {
      return true;
    }
    
    return false;
  }

  public async connect(): Promise<void> {
    try {
      await this.initConversation();
      console.log("OPENAI_TEXT: Connected to OpenAI API");
    } catch (error) {
      console.error("OPENAI_TEXT: Error connecting to OpenAI:", error);
      throw error;
    }
  }

  private async initConversation(): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error("User ID not set");
      }

      const initialContext = await buildInitialAIContext({
        currentDate: this.currentDate,
        persona: this.persona,
        userId: this.currentUserId,
        memoryService: this.memoryService
      });
      console.log("OPENAI_TEXT: Initial context:", initialContext);
      const contextMessage: ChatCompletionMessageParam = {
        role: "system",
        content: initialContext
      };

      this.conversationHistory.push(contextMessage);

      const stream = await this.client.chat.completions.create({
        model: this.MODEL,
        messages: this.conversationHistory,
        temperature: 0.8,
        stream: true,
      });

      let completeResponse = "";
      let partialResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        const finishReason = chunk.choices[0]?.finish_reason;

        completeResponse += content;
        partialResponse += content;

        // Emit chunk when we hit a delimiter or end of response
        if (this.shouldEmitChunk(partialResponse, finishReason)) {
          const formattedText = this.formatTextForTTS(partialResponse);
          
          if (formattedText) {
            const response: OpenAIResponse = {
              partialResponseIndex: this.partialResponseIndex,
              partialResponse: formattedText,
            };

            this.emit("openai_response_done", response);
            this.conversationHistoryArray.push({
              speaker: "assistant",
              content: formattedText,
            });
            this.partialResponseIndex++;
          }
          
          partialResponse = "";
        }
      }

      // Add complete response to conversation history
      if (completeResponse) {
        this.conversationHistory.push({
          role: "assistant",
          content: completeResponse,
        });
      }
    } catch (error) {
      console.error("OPENAI_TEXT: Error in initial conversation:", error);
      throw error;
    }
  }

  public async handleMessage(message: string): Promise<void> {
    try {
      const data = JSON.parse(message);

      if (data.event === "text") {
        console.log("OPENAI_TEXT: Processing text message:", data.text);

        this.conversationHistoryArray.push({ 
          speaker: "user", 
          content: data.text 
        });

        const memoryQuery = `give any information related to this user question: ${data.text}`;
        await this.memoryService.search(memoryQuery);

        // Add user message to conversation history
        this.conversationHistory.push({ 
          role: "user", 
          content: data.text 
        });

        const stream = await this.client.chat.completions.create({
          model: this.MODEL,
          messages: this.conversationHistory,
          temperature: 0.8,
          stream: true,
        });

        let completeResponse = "";
        let partialResponse = "";

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          const finishReason = chunk.choices[0]?.finish_reason;

          completeResponse += content;
          partialResponse += content;

          // Emit chunk when we hit a delimiter or end of response
          if (this.shouldEmitChunk(partialResponse, finishReason)) {
            const formattedText = this.formatTextForTTS(partialResponse);
            
            if (formattedText) {
              const response: OpenAIResponse = {
                partialResponseIndex: this.partialResponseIndex,
                partialResponse: formattedText,
              };

              this.emit("openai_response_done", response);
              this.partialResponseIndex++;
            }
            
            partialResponse = "";
          }
        }

        // Add complete response to conversation history
        if (completeResponse) {
          this.conversationHistory.push({
            role: "assistant",
            content: completeResponse,
          });
          
          if (completeResponse.includes("Bye") || completeResponse.includes("later")) {
            this.emit('openai_response_ended', completeResponse);
          }
        }
      } else {
        console.log("OPENAI_TEXT: Received non-text event:", data.event);
      }
    } catch (error) {
      console.error("OPENAI_TEXT: Error processing message:", error);
      throw error;
    }
  }

  private async updateMemory(): Promise<void> {
    await this.summaryService.updateMemory(
      this.conversationHistoryArray,
      this.memoryService,
      this.currentUserId
    );
  }

  public async disconnect(): Promise<void> {
    console.log("OPENAI_TEXT: Disconnecting OpenAI Text service...");
    
    await this.updateMemory();

    this.conversationHistory = [];
    this.conversationHistoryArray = [];
    this.partialResponseIndex = 0;
    
    console.log("OPENAI_TEXT: OpenAI Text service disconnected");
  }
}
