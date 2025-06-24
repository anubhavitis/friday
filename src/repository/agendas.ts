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
  getAgendasByDate: async function(userId: number, date: string): Promise<Agenda[]> {
    console.log("AGENDA: Getting agendas for user", userId, "on date", date);
    const userAgendas = await db
      .select()
      .from(agendas)
      .where(
        and(
          eq(agendas.userId, userId),
          eq(agendas.date, date)
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
   * Mark an agenda as not completed
   * @param agendaId The agenda ID to mark as not completed
   * @returns The updated agenda
   */
  markAgendaAsNotCompleted: async function(agendaId: number): Promise<Agenda | null> {
    console.log("AGENDA: Marking agenda as not completed:", agendaId);
    const [updatedAgenda] = await db
      .update(agendas)
      .set({ 
        status: 'not_completed',
        updatedAt: new Date()
      })
      .where(eq(agendas.id, agendaId))
      .returning();
    
    console.log("AGENDA: Marked agenda as not completed:", updatedAgenda);
    return updatedAgenda;
  },

  /**
   * Use AI to analyze conversation and determine which agendas were completed or not completed
   * @param userId The user ID
   * @param conversationHistory The full conversation between user and AI
   * @param currentDate The current date
   * @param openaiApiKey OpenAI API key for analysis
   * @returns Object with completed and not completed agenda IDs
   */
  analyzeConversationForCompletion: async function(
    userId: number, 
    conversationHistory: string, 
    currentDate: string,
    openaiApiKey: string
  ): Promise<{ completed: number[], notCompleted: number[] }> {
    console.log("AGENDA: Analyzing conversation for agenda completion");
    
    try {
      // Get today's planned agendas
      const todayAgendas = await this.getAgendasByDate(userId, currentDate);
      const plannedAgendas = todayAgendas.filter(agenda => agenda.status === 'planned');
      
      if (plannedAgendas.length === 0) {
        console.log("AGENDA: No planned agendas to analyze");
        return { completed: [], notCompleted: [] };
      }
      
      // Create OpenAI client
      const openai = new OpenAI({ apiKey: openaiApiKey });

      // Prepare agenda information for AI analysis
      const agendaInfo = plannedAgendas.map(agenda => 
        `ID: ${agenda.id}, Name: "${agenda.name}", Details: "${agenda.details || 'No details'}"`
      ).join('\n');

      console.log("AGENDA: Planned agendas:", agendaInfo);

      console.log("AGENDA: Conversation history being analyzed:", conversationHistory);

      const analysisPrompt = `Today is ${currentDate}. Analyze the following conversation between a user and an AI assistant to determine which agendas were completed and which were not completed.

Available agendas:
${agendaInfo}

Conversation:
${conversationHistory}

Based on the conversation, determine which agendas were completed and which were not completed by the user. Look for:

COMPLETED AGENDAS:
1. Direct confirmations (Yes, I did, completed, finished, etc.)
2. Contextual clues that indicate completion
3. Positive responses to questions about specific agendas
4. Statements indicating the task was done

NOT COMPLETED AGENDAS:
1. Direct denials (No, I didn't, haven't done it yet, etc.)
2. Negative responses to questions about specific agendas
3. Statements indicating the task was not done
4. Excuses or explanations for why it wasn't done

Important: Pay attention to the context. If the AI asks about a specific agenda and the user responds:
- Positively (like "Yes", "Yes I did", "Yeah", etc.) → mark as completed
- Negatively (like "No", "I didn't", "Not yet", etc.) → mark as not completed

Return a JSON object with two arrays:
{
  "completed": [1, 3, 5],
  "notCompleted": [2, 4]
}

If no agendas were mentioned or no clear completion status was given, return empty arrays.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an AI assistant that analyzes conversations to determine which agenda items were completed or not completed. Your task is to identify when a user confirms or denies they completed specific agenda items. Look for positive responses like 'yes', 'yeah', 'I did' for completion, and negative responses like 'no', 'I didn't', 'not yet' for non-completion. Return only valid JSON objects with 'completed' and 'notCompleted' arrays."
          },
          {
            role: "user",
            content: analysisPrompt
          }
        ],
        temperature: 0.1,
      });
      console.log("AGENDA: AI analysis response:", response);
      const content = response.choices[0]?.message?.content || "{}";
      console.log("AGENDA: AI analysis response:", content);

      // Parse the JSON response
      let analysisResult: { completed: number[], notCompleted: number[] } = { completed: [], notCompleted: [] };
      try {
        // Extract JSON from the response (in case there's extra text)
        const jsonMatch = content.match(/\{.*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          analysisResult = JSON.parse(content);
        }
      } catch (error) {
        console.error("AGENDA: Error parsing AI response:", error, content);
        return { completed: [], notCompleted: [] };
      }

      // Ensure we have the expected structure
      const completedIds = Array.isArray(analysisResult.completed) ? analysisResult.completed : [];
      const notCompletedIds = Array.isArray(analysisResult.notCompleted) ? analysisResult.notCompleted : [];

      // Validate that the IDs are numbers and exist in our agendas
      const validCompletedIds = completedIds.filter(id => 
        typeof id === 'number' && plannedAgendas.some(agenda => agenda.id === id)
      );
      const validNotCompletedIds = notCompletedIds.filter(id => 
        typeof id === 'number' && plannedAgendas.some(agenda => agenda.id === id)
      );

      console.log("AGENDA: Valid completed agenda IDs:", validCompletedIds);
      console.log("AGENDA: Valid not completed agenda IDs:", validNotCompletedIds);

      // Mark the agendas as completed
      const actuallyCompletedIds: number[] = [];
      for (const agendaId of validCompletedIds) {
        const completedAgenda = await this.markAgendaAsCompleted(agendaId);
        if (completedAgenda) {
          actuallyCompletedIds.push(agendaId);
        }
      }

      // Mark the agendas as not completed
      const actuallyNotCompletedIds: number[] = [];
      for (const agendaId of validNotCompletedIds) {
        const notCompletedAgenda = await this.markAgendaAsNotCompleted(agendaId);
        if (notCompletedAgenda) {
          actuallyNotCompletedIds.push(agendaId);
        }
      }

      console.log("AGENDA: Actually completed agenda IDs:", actuallyCompletedIds);
      console.log("AGENDA: Actually not completed agenda IDs:", actuallyNotCompletedIds);
      
      return { 
        completed: actuallyCompletedIds, 
        notCompleted: actuallyNotCompletedIds 
      };

    } catch (error) {
      console.error("AGENDA: Error analyzing conversation for completion:", error);
      return { completed: [], notCompleted: [] };
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
  }
};

export default AgendaDbService; 