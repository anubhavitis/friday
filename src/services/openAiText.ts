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
  private readonly MODEL = "gpt-4o-mini";
  private partialResponseIndex: number = 0;
  private conversationHistoryArray: ConversationHistory[] = [];
  private currentDate: string;

  constructor(private apiKey: string, memoryService: MemoryService) {
    super();
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });

    if (!memoryService) {
      throw new Error("MemoryService is required");
    }
    
    this.memoryService = memoryService;
    this.persona = fs.readFileSync("src/services/aiPersona.txt", "utf8");
    this.currentDate = new Date().toISOString().split("T")[0];
  }

  private formatTextForTTS(text: string): string {
    return text.replace(/•/g, "").trim();
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

  private async initConversation(): Promise<void> {
    try {
      const userInfo = await this.getUserInfo();
      const todayAgendas = await this.memoryService.getTodayAgendas(this.currentDate);

      const contextMessage: ChatCompletionMessageParam = {
        role: "system",
        content: `Today is ${this.currentDate}. You are ${this.persona}. Here is what I know about the user: ${JSON.stringify(userInfo)}. 

${todayAgendas.length > 0 ? `Today's planned agendas: ${JSON.stringify(todayAgendas)}` : "No specific agendas planned for today."}

Use this information to greet them naturally and ask about their planned activities if any exist. If they mention completing any agenda items, mark them as completed. Be friendly and light — don't dig too deeply into specific activities like shows or workouts unless the user brings it up. Keep it breezy.`
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
        if (content.trim().slice(-1) === "•" || finishReason === "stop") {
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

        // Check if user is mentioning completing an agenda
        await this.checkForAgendaCompletion(data.text);

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
          if (content.trim().slice(-1) === "•" || finishReason === "stop") {
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

  private async checkForAgendaCompletion(userMessage: string): Promise<void> {
    try {
      // Look for completion keywords
      const completionKeywords = [
        'completed', 'finished', 'done', 'accomplished', 'finished with',
        'went to', 'attended', 'did', 'finished the', 'completed the'
      ];
      
      const hasCompletionKeyword = completionKeywords.some(keyword => 
        userMessage.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasCompletionKeyword) {
        // Use the memory service to check for agenda completion
        await this.memoryService.checkAgendaCompletion(userMessage, this.currentDate);
      }
    } catch (error) {
      console.error("OPENAI_TEXT: Error checking for agenda completion:", error);
    }
  }

  private async extractAgendaItems(formattedHistory: string, today: string): Promise<AgendaItem[]> {
    const response = await this.client.chat.completions.create({
      model: this.MODEL,
      messages: [
        {
          role: "system",
          content: `Today is ${today}. Extract and COMBINE all related agenda items from this conversation into as few actionable items as possible. 
Return a JSON array of objects like:

{
  "type": "agenda_item",
  "date": "YYYY-MM-DD",
  "name": "Plan to go to the gym and run for 2 kms",
  "status": "planned",
  "details": "...",
  "context": "...",
  "id": "unique_identifier"
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
      // Only keep actionable agenda items (with type, date, and name)
      const actionableAgendas = (agendaItems as any[]).filter(item => 
        item.type === "agenda_item" && item.date && item.name
      ).map(item => ({
        ...item,
        id: item.id || `agenda_${today.replace(/-/g, '')}_${Date.now()}`,
        completed: false,
        completedAt: undefined
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

  private async filterSummaryWithAgendas(summary: string, agendaItems: AgendaItem[]): Promise<string> {
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

      // Extract agenda items
      let agendaItems = await this.extractAgendaItems(formattedHistory, today);
      agendaItems = agendaItems.map(item => ({ ...item, id: item.id || `agenda_${today.replace(/-/g, '')}_${Date.now()}` }));
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

      // Save agenda items using MemoryService
      if (agendaItems.length > 0) {
        await this.memoryService.addAgendaItems(agendaItems);
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
