import OpenAI from "openai";
import { MemoryService } from "./memory";
import AgendaDbService from "../repository/agendas";
import type { Agenda } from "../schema/agendas";

interface ConversationHistory {
  speaker: "user" | "assistant";
  content: string;
}

export class SummaryService {
  private client: OpenAI;
  private readonly MODEL = "gpt-4o-mini";

  constructor(private apiKey: string) {
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
  }

  private async extractAgendaItems(formattedHistory: string, today: string): Promise<Partial<Agenda>[]> {
    const response = await this.client.chat.completions.create({
      model: this.MODEL,
      messages: [
        {
          role: "system",
          content: `Today is ${today}. Extract and COMBINE all related agenda items from this conversation into as few actionable items as possible. 
Return a JSON array of objects like:

[
  {
    "name": "Plan to go to the gym and run for 2 kms",
    "date": "YYYY-MM-DD",
    "status": "planned",
    "details": "...",
    "context": "..."
  }
]

IMPORTANT: Always return a JSON array, even if there's only one item. Do not include context-only or interest-only items. Only include actionable plans with a date. Do not include summary text or markdown formatting.`
        },
        {
          role: "user",
          content: formattedHistory,
        },
      ],
      temperature: 0.3,
    });

    const rawText = response.choices[0]?.message?.content || "[]";
    console.log("SUMMARY: Raw AI response:", rawText);
    
    try {
      // Try to find JSON array in the response
      const startIdx = rawText.indexOf("[");
      const endIdx = rawText.lastIndexOf("]") + 1;
      
      let jsonString = rawText;
      if (startIdx !== -1 && endIdx > startIdx) {
        jsonString = rawText.slice(startIdx, endIdx);
      } else {
        // If no array brackets found, try to find a single object
        const objStartIdx = rawText.indexOf("{");
        const objEndIdx = rawText.lastIndexOf("}") + 1;
        if (objStartIdx !== -1 && objEndIdx > objStartIdx) {
          // Wrap single object in array
          jsonString = `[${rawText.slice(objStartIdx, objEndIdx)}]`;
        }
      }
      
      console.log("SUMMARY: Parsing JSON:", jsonString);
      const agendaItems = JSON.parse(jsonString);
      
      // Ensure we have an array
      const itemsArray = Array.isArray(agendaItems) ? agendaItems : [agendaItems];
      
      // Only keep actionable agenda items (with date and name)
      const actionableAgendas = itemsArray.filter(item => 
        item && item.date && item.name
      ).map(item => ({
        name: item.name,
        date: item.date,
        status: item.status || 'planned',
        details: item.details || '',
        context: item.context || ''
      }));
      
      console.log("SUMMARY: Parsed agenda items:", actionableAgendas);
      return actionableAgendas;
    } catch (err) {
      console.error("SUMMARY: Error parsing agenda JSON:", err, "Raw text:", rawText);
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

  public async updateMemory(
    conversationHistoryArray: ConversationHistory[],
    memoryService: MemoryService,
    currentUserId: number | null
  ): Promise<void> {
    console.log("SUMMARY: Updating memory with conversation history length:", conversationHistoryArray.length);
    
    // Skip if no conversation history
    if (conversationHistoryArray.length === 0) {
      return;
    }

    try {
      // Format conversation history for the prompt
      const formattedHistory = conversationHistoryArray
        .map((msg) => `${msg.speaker}: ${msg.content}`)
        .join("\n");

      const today = new Date().toISOString().split("T")[0]; // e.g., "2025-06-19"

      // First, analyze conversation for agenda completion using AI
      if (currentUserId) {
        console.log("SUMMARY: Analyzing conversation for agenda completion...");
        
        // First, merge any similar agendas to prevent confusion
        await AgendaDbService.mergeSimilarAgendas(currentUserId, today);
        
        const completedAgendaIds = await AgendaDbService.analyzeConversationForCompletion(
          currentUserId,
          formattedHistory,
          today,
          this.apiKey
        );
        
        if (completedAgendaIds.length > 0) {
          // Save completion summary to memory
          const completedAgendas = await Promise.all(
            completedAgendaIds.map(id => AgendaDbService.getAgendaById(id))
          );
          
          const agendaNames = completedAgendas
            .filter(agenda => agenda !== null)
            .map(agenda => agenda!.name)
            .join(', ');
          
          if (agendaNames) {
            const summary = `User completed: ${agendaNames} on ${today}`;
            await memoryService.saveAgendaSummary(summary);
            console.log("SUMMARY: Saved completion summary:", summary);
          }
        }
      }

      // Extract agenda items
      const agendaItems = await this.extractAgendaItems(formattedHistory, today);
      console.log("SUMMARY: Agenda items:", agendaItems);

      // Extract interests summary
      const interestsSummary = await this.extractInterestsSummary(formattedHistory, today);
      console.log("SUMMARY: Interests summary:", interestsSummary);

      // Filter summary to remove agenda-related info
      // const filteredSummary = await this.filterSummaryWithAgendas(interestsSummary, agendaItems);
      const filteredSummary = interestsSummary;
      console.log("SUMMARY: Filtered summary:", filteredSummary);

      // Save filtered summary if not empty
      if (filteredSummary && filteredSummary.trim()) {
        await memoryService.add([{
          role: "user",
          content: filteredSummary,
        }]);
      }

      // Save agenda items using AgendaService
      if (agendaItems.length > 0 && currentUserId) {
        console.log("SUMMARY: Saving agenda items to database:", agendaItems);
        const agendaItemsWithUserId = agendaItems
          .filter(item => item.name && item.date) // Ensure required fields exist
          .map(item => ({
            userId: currentUserId,
            name: item.name!,
            date: item.date!,
            status: item.status || 'planned',
            details: item.details || null,
            context: item.context || null
          }));
        
        try {
          const savedAgendas = await AgendaDbService.addAgendaItems(agendaItemsWithUserId);
          console.log("SUMMARY: Successfully saved agenda items:", savedAgendas);
          
          // Save summary to memory
          const agendaNames = agendaItems.map(item => item.name).join(', ');
          const summary = `User is planning to: ${agendaNames} on ${today}`;
          await memoryService.saveAgendaSummary(summary);
          console.log("SUMMARY: Saved agenda summary to memory:", summary);
        } catch (error) {
          console.error("SUMMARY: Error saving agenda items to database:", error);
        }
      } else {
        console.log("SUMMARY: No agenda items to save or no user ID");
      }

      console.log("SUMMARY: Memory updated successfully");
    } catch (error) {
      console.error("SUMMARY: Error updating memory:", error);
    }
  }
}
