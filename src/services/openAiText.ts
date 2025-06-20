import { EventEmitter } from "events";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MemoryService } from "./memory";
import { Memory } from "mem0ai";
import fs from "fs";
import AgendaDbService from "../repository/agendas";
import type { Agenda } from "../schema/agendas";

interface OpenAIResponse {
  partialResponseIndex: number;
  partialResponse: string;
}

interface ConversationHistory {
  speaker: "user" | "assistant";
  content: string;
}

// Import AgendaItem type from MemoryService
type AgendaItem = {
  type: string;
  date: string;
  name: string;
  status: string;
  details: string;
  context: string;
  id: string;
  completed?: boolean;
  completedAt?: string;
};

export class OpenAITextService extends EventEmitter {
  private client: OpenAI;
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private persona: string;
  private memoryService: MemoryService;
  private agendaService: typeof AgendaDbService;
  private readonly MODEL = "gpt-4o-mini";
  private partialResponseIndex: number = 0;
  private conversationHistoryArray: ConversationHistory[] = [];
  private currentDate: string;
  private currentUserId: number | null = null;

  constructor(private apiKey: string, memoryService: MemoryService, userId?: number) {
    super();
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });

    if (!memoryService) {
      throw new Error("MemoryService is required");
    }
    
    this.memoryService = memoryService;
    this.agendaService = AgendaDbService;
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

  private async getUserInfo(): Promise<Memory[]> {
    const query = "give every information related to this user";
    return await this.memoryService.search(query);
  }

  private async getUserPersonalInfo(): Promise<Memory[]> {
    const query = "give every information related to this user personal details";
    return await this.memoryService.searchWithCategory(query, ["personal_details"]);
  }

  private async initConversation(): Promise<void> {
    try {
      if (!this.currentUserId) {
        throw new Error("User ID not set");
      }

      const userInfo = await this.getUserInfo();
      console.log("OPENAI_TEXT: User info:", userInfo);
      const userPersonalInfo = await this.getUserPersonalInfo();
      console.log("OPENAI_TEXT: User personal info:", userPersonalInfo);
      const todayAgendas = await this.agendaService.getTodayAgendas(this.currentUserId, this.currentDate);
      console.log("OPENAI_TEXT: Today's agendas:", todayAgendas);
      let agendaContext = "";
      if (todayAgendas.length > 0) {
        const agendaList = todayAgendas.map(agenda => 
          `- ${agenda.name} (${agenda.status})`
        ).join('\n');
        agendaContext = `Today's planned agendas:\n${agendaList}\n\nPlease ask the user about each agenda item and whether they completed it. Be specific and ask about each one individually.`;
      } else {
        agendaContext = "No specific agendas planned for today. Suggest some activities based on the user's interests.";
      }

      const contextMessage: ChatCompletionMessageParam = {
        role: "system",
        content: `Today is ${this.currentDate}. You are ${this.persona}. Here is what I know about the user: ${JSON.stringify(userInfo)}, with personal details: ${JSON.stringify(userPersonalInfo)} and check for their interests. 

${agendaContext}

Use this information to greet them naturally with their name and ask about their planned activities if any exist, if not, based on their interests, ask them about their plans for today.
If they mention completing any agenda items, mark them as completed. Be friendly and light — don't dig too deeply into specific activities like shows or workouts unless the user brings it up. Keep it breezy.

IMPORTANT: Break your responses into natural chunks. Send one sentence or question at a time, then wait for a response before continuing. Use "•" as a delimiter between chunks to help with text-to-speech timing.`
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

  private async extractAgendaItems(formattedHistory: string, today: string): Promise<Partial<Agenda>[]> {
    const response = await this.client.chat.completions.create({
      model: this.MODEL,
      messages: [
        {
          role: "system",
          content: `Today is ${today}. Extract and COMBINE all related agenda items from this conversation into as few actionable items as possible. 
Return a JSON array of objects like:

{
  "name": "Plan to go to the gym and run for 2 kms",
  "date": "YYYY-MM-DD",
  "status": "planned",
  "details": "...",
  "context": "..."
}

Do not include context-only or interest-only items. Only include actionable plans with a date. Do not include summary text or markdown formatting.`
        },
        {
          role: "user",
          content: formattedHistory,
        },
      ],
      temperature: 0.3,
    });

    const rawText = response.choices[0]?.message?.content || "[]";
    const startIdx = rawText.indexOf("[");
    const endIdx = rawText.lastIndexOf("]") + 1;
    const jsonString = rawText.slice(startIdx, endIdx);

    try {
      const agendaItems = JSON.parse(jsonString);
      // Only keep actionable agenda items (with date and name)
      const actionableAgendas = (agendaItems as any[]).filter(item => 
        item.date && item.name
      ).map(item => ({
        name: item.name,
        date: item.date,
        status: item.status || 'planned',
        details: item.details || '',
        context: item.context || ''
      }));
      return actionableAgendas;
    } catch (err) {
      console.error("OPENAI_TEXT: Error parsing agenda JSON:", err, rawText);
      return [];
    }
  }

  private async extractInterestsSummary(formattedHistory: string, today: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.MODEL,
      messages: [
        {
          role: "system",
          content: `Today is ${today}. Summarize any new or recurring interests expressed in this conversation. 
Focus on what the user is excited about, exploring, or doing regularly. 
Do not include agenda items or specific plans. Return a single paragraph summary without any markdown formatting.`,
        },
        {
          role: "user",
          content: formattedHistory,
        },
      ],
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }

  private async filterSummaryWithAgendas(summary: string, agendaItems: Partial<Agenda>[]): Promise<string> {
    const agendaList = agendaItems.map(a => a.name).join('\n');
    const response = await this.client.chat.completions.create({
      model: this.MODEL,
      messages: [
        {
          role: "system",
          content: "Given the following summary and agenda items, remove from the summary any information that is already covered by the agenda items. Only return the remaining summary text."
        },
        {
          role: "user",
          content: `Summary: ${summary}\nAgendas:\n${agendaList}`
        }
      ],
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content?.trim() || "";
  }

  private async updateMemory(): Promise<void> {
    console.log("OPENAI_TEXT: Updating memory with conversation history length:", this.conversationHistoryArray.length);
    
    // Skip if no conversation history
    if (this.conversationHistoryArray.length === 0) {
      return;
    }

    try {
      // Format conversation history for the prompt
      const formattedHistory = this.conversationHistoryArray
        .map((msg) => `${msg.speaker}: ${msg.content}`)
        .join("\n");

      const today = new Date().toISOString().split("T")[0]; // e.g., "2025-06-19"

      // First, analyze conversation for agenda completion using AI
      if (this.currentUserId) {
        console.log("OPENAI_TEXT: Analyzing conversation for agenda completion...");
        
        // First, merge any similar agendas to prevent confusion
        await this.agendaService.mergeSimilarAgendas(this.currentUserId, today);
        
        const completedAgendaIds = await this.agendaService.analyzeConversationForCompletion(
          this.currentUserId,
          formattedHistory,
          today,
          this.apiKey
        );
        
        if (completedAgendaIds.length > 0) {
          // Save completion summary to memory
          const completedAgendas = await Promise.all(
            completedAgendaIds.map(id => this.agendaService.getAgendaById(id))
          );
          
          const agendaNames = completedAgendas
            .filter(agenda => agenda !== null)
            .map(agenda => agenda!.name)
            .join(', ');
          
          if (agendaNames) {
            const summary = `User completed: ${agendaNames} on ${today}`;
            await this.memoryService.saveAgendaSummary(summary);
            console.log("OPENAI_TEXT: Saved completion summary:", summary);
          }
        }
      }

      // Extract agenda items
      const agendaItems = await this.extractAgendaItems(formattedHistory, today);
      console.log("OPENAI_TEXT: Agenda items:", agendaItems);

      // Extract interests summary
      const interestsSummary = await this.extractInterestsSummary(formattedHistory, today);
      console.log("OPENAI_TEXT: Interests summary:", interestsSummary);

      // Filter summary to remove agenda-related info
      const filteredSummary = await this.filterSummaryWithAgendas(interestsSummary, agendaItems);
      console.log("OPENAI_TEXT: Filtered summary:", filteredSummary);

      // Save filtered summary if not empty
      if (filteredSummary && filteredSummary.trim()) {
        await this.memoryService.add([{
          role: "user",
          content: filteredSummary,
        }]);
      }

      // Save agenda items using AgendaService
      if (agendaItems.length > 0 && this.currentUserId) {
        const agendaItemsWithUserId = agendaItems
          .filter(item => item.name && item.date) // Ensure required fields exist
          .map(item => ({
            userId: this.currentUserId!,
            name: item.name!,
            date: item.date!,
            status: item.status || 'planned',
            details: item.details || null,
            context: item.context || null
          }));
        await this.agendaService.addAgendaItems(agendaItemsWithUserId);
        
        // Save summary to memory
        const agendaNames = agendaItems.map(item => item.name).join(', ');
        const summary = `User is planning to: ${agendaNames} on ${today}`;
        await this.memoryService.saveAgendaSummary(summary);
      }

      console.log("OPENAI_TEXT: Memory updated successfully");
    } catch (error) {
      console.error("OPENAI_TEXT: Error updating memory:", error);
    }
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
