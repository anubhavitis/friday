import { eq, and, like } from 'drizzle-orm';
import { db } from '../pkg/db';
import { agendas, type NewAgenda, type Agenda } from '../schema/agendas';
import OpenAI from "openai";

const AgendaDbService = {
  /**
   * Get all agendas for a specific user and date
   * @param userId The user ID
   * @param date The date in YYYY-MM-DD format
   * @returns Array of agendas for that date
   */
  getTodayAgendas: async function(userId: number, date: string): Promise<Agenda[]> {
    console.log("AGENDA: Getting agendas for user", userId, "on date", date);
    const userAgendas = await db
      .select()
      .from(agendas)
      .where(
        and(
          eq(agendas.userId, userId),
          eq(agendas.date, date),
          eq(agendas.status, 'planned')
        )
      )
      .orderBy(agendas.createdAt);
    
    console.log("AGENDA: Found agendas:", userAgendas);
    return userAgendas;
  },

  /**
   * Add multiple agenda items
   * @param agendaItems Array of agenda items to add
   * @returns Array of created agendas
   */
  addAgendaItems: async function(agendaItems: NewAgenda[]): Promise<Agenda[]> {
    console.log("AGENDA: Adding agenda items:", agendaItems);
    const createdAgendas = await db.insert(agendas).values(agendaItems).returning();
    console.log("AGENDA: Added agenda items:", createdAgendas);
    return createdAgendas;
  },

  /**
   * Mark an agenda as completed
   * @param agendaId The agenda ID to mark as completed
   * @returns The updated agenda
   */
  markAgendaAsCompleted: async function(agendaId: number): Promise<Agenda | null> {
    console.log("AGENDA: Marking agenda as completed:", agendaId);
    const [updatedAgenda] = await db
      .update(agendas)
      .set({ 
        status: 'completed',
        updatedAt: new Date()
      })
      .where(eq(agendas.id, agendaId))
      .returning();
    
    console.log("AGENDA: Marked agenda as completed:", updatedAgenda);
    return updatedAgenda;
  },

  /**
   * Use AI to analyze conversation and determine which agendas were completed
   * @param userId The user ID
   * @param conversationHistory The full conversation between user and AI
   * @param currentDate The current date
   * @param openaiApiKey OpenAI API key for analysis
   * @returns Array of completed agenda IDs
   */
  analyzeConversationForCompletion: async function(
    userId: number, 
    conversationHistory: string, 
    currentDate: string,
    openaiApiKey: string
  ): Promise<number[]> {
    console.log("AGENDA: Analyzing conversation for agenda completion");
    
    try {
      // Get today's planned agendas
      const todayAgendas = await this.getTodayAgendas(userId, currentDate);
      const plannedAgendas = todayAgendas.filter(agenda => agenda.status === 'planned');
      
      if (plannedAgendas.length === 0) {
        console.log("AGENDA: No planned agendas to analyze");
        return [];
      }

      // Create OpenAI client
      const openai = new OpenAI({ apiKey: openaiApiKey });

      // Prepare agenda information for AI analysis
      const agendaInfo = plannedAgendas.map(agenda => 
        `ID: ${agenda.id}, Name: "${agenda.name}", Details: "${agenda.details || 'No details'}"`
      ).join('\n');

      const analysisPrompt = `Today is ${currentDate}. Analyze the following conversation between a user and an AI assistant to determine which agendas were completed.

Available agendas:
${agendaInfo}

Conversation:
${conversationHistory}

Based on the conversation, determine which agendas were completed by the user. Look for:
1. Direct confirmations (Yes, I did, completed, finished, etc.)
2. Contextual clues that indicate completion
3. Responses to questions about specific agendas
4. Positive responses to questions about agenda completion

Important: Pay attention to the context. If the AI asks about a specific agenda and the user responds positively (like "Yes", "Yes I did", "Yeah", etc.), that agenda should be marked as completed.

Return ONLY a JSON array of agenda IDs that were completed, like: [1, 3, 5]
If no agendas were completed, return: []

Focus on the user's responses and whether they indicate completion of the specific agenda items. Be generous in interpretation - if there's any indication of completion, include the agenda ID.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an AI assistant that analyzes conversations to determine which agenda items were completed. Return only valid JSON arrays."
          },
          {
            role: "user",
            content: analysisPrompt
          }
        ],
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || "[]";
      console.log("AGENDA: AI analysis response:", content);

      // Parse the JSON response
      let completedIds: number[] = [];
      try {
        // Extract JSON from the response (in case there's extra text)
        const jsonMatch = content.match(/\[.*\]/);
        if (jsonMatch) {
          completedIds = JSON.parse(jsonMatch[0]);
        } else {
          completedIds = JSON.parse(content);
        }
      } catch (error) {
        console.error("AGENDA: Error parsing AI response:", error, content);
        return [];
      }

      // Validate that the IDs are numbers and exist in our agendas
      const validIds = completedIds.filter(id => 
        typeof id === 'number' && plannedAgendas.some(agenda => agenda.id === id)
      );

      console.log("AGENDA: Valid completed agenda IDs:", validIds);

      // Mark the agendas as completed
      const actuallyCompletedIds: number[] = [];
      for (const agendaId of validIds) {
        const completedAgenda = await this.markAgendaAsCompleted(agendaId);
        if (completedAgenda) {
          actuallyCompletedIds.push(agendaId);
        }
      }

      console.log("AGENDA: Actually completed agenda IDs:", actuallyCompletedIds);
      return actuallyCompletedIds;

    } catch (error) {
      console.error("AGENDA: Error analyzing conversation for completion:", error);
      return [];
    }
  },

  /**
   * Get agenda by ID
   * @param agendaId The agenda ID
   * @returns The agenda if found, null otherwise
   */
  getAgendaById: async function(agendaId: number): Promise<Agenda | null> {
    const [agenda] = await db
      .select()
      .from(agendas)
      .where(eq(agendas.id, agendaId))
      .limit(1);
    
    return agenda || null;
  },

  /**
   * Update agenda details
   * @param agendaId The agenda ID
   * @param updates The fields to update
   * @returns The updated agenda
   */
  updateAgenda: async function(agendaId: number, updates: Partial<NewAgenda>): Promise<Agenda | null> {
    const [updatedAgenda] = await db
      .update(agendas)
      .set({ 
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(agendas.id, agendaId))
      .returning();
    
    return updatedAgenda || null;
  },

  /**
   * Delete an agenda
   * @param agendaId The agenda ID to delete
   * @returns True if deleted, false otherwise
   */
  deleteAgenda: async function(agendaId: number): Promise<boolean> {
    const [deletedAgenda] = await db
      .delete(agendas)
      .where(eq(agendas.id, agendaId))
      .returning();
    
    return !!deletedAgenda;
  },

  /**
   * Merge similar agendas to prevent duplicates
   * @param userId The user ID
   * @param date The date
   * @returns Number of merged agendas
   */
  mergeSimilarAgendas: async function(userId: number, date: string): Promise<number> {
    console.log("AGENDA: Merging similar agendas for user", userId, "on date", date);
    
    try {
      const todayAgendas = await this.getTodayAgendas(userId, date);
      const plannedAgendas = todayAgendas.filter(agenda => agenda.status === 'planned');
      
      if (plannedAgendas.length <= 1) {
        return 0;
      }

      // Group agendas by similarity (simple approach - can be improved)
      const agendaGroups: { [key: string]: Agenda[] } = {};
      
      for (const agenda of plannedAgendas) {
        // Create a key based on the main activity (remove "Plan to", "Go to", etc.)
        const cleanName = agenda.name
          .toLowerCase()
          .replace(/^(plan to|go to|do|complete|finish)\s+/i, '')
          .replace(/\s+(today|now|tonight)$/i, '');
        
        if (!agendaGroups[cleanName]) {
          agendaGroups[cleanName] = [];
        }
        agendaGroups[cleanName].push(agenda);
      }

      let mergedCount = 0;
      
      // Merge agendas in each group
      for (const [key, agendas] of Object.entries(agendaGroups)) {
        if (agendas.length > 1) {
          console.log(`AGENDA: Found ${agendas.length} similar agendas for: ${key}`);
          
          // Keep the first agenda and delete the rest
          const [keepAgenda, ...deleteAgendas] = agendas;
          
          for (const deleteAgenda of deleteAgendas) {
            await this.deleteAgenda(deleteAgenda.id);
            mergedCount++;
          }
          
          console.log(`AGENDA: Kept agenda ID ${keepAgenda.id}, deleted ${deleteAgendas.length} duplicates`);
        }
      }
      
      return mergedCount;
    } catch (error) {
      console.error("AGENDA: Error merging similar agendas:", error);
      return 0;
    }
  }
};

export default AgendaDbService; 