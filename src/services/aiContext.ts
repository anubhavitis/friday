import { MemoryService } from "./memory";
import { Memory } from "mem0ai";
import AgendaDbService from "../repository/agendas";

export interface AIContextData {
  currentDate: string;
  persona: string;
  userId: number;
  memoryService: MemoryService;
}

export async function buildInitialAIContext({
  currentDate,
  persona,
  userId,
  memoryService
}: AIContextData): Promise<string> {
  // Fetch all the data
  const userInfo = await getUserInfo(memoryService);
  const userPersonalInfo = await getUserPersonalInfo(memoryService);
  const todayAgendas = await getTodayAgendas(userId, currentDate);
  
  // Build agenda context
  const agendaContext = buildAgendaContext(todayAgendas, currentDate);
  
  return `Today is ${currentDate}. You are ${persona}. Here is what I know about the user: ${userInfo}, with personal details: ${JSON.stringify(userPersonalInfo)} and check for their interests and get to know them better, about the things they are doing. 
Use this information to greet them naturally with their name, and just simply ask how was your day. Once you get to know about the users day ask about their planned activities suggest something based on their interests.
You need to take into account the users interests and preferences.
When asking about the user agendas for the day, ask about the agenda user might be interested in.
IMPORTANT: Be more engaging and more human like. And keep the sentences short and concise.
IMPORTANT: Do not use emojis in your responses.
IMPORTANT: While suggesting activities, suggest based on the users interests and preferences.
IMPORTANT: Go through the user information, to get to know them better. Go through any projects there are working on.

IMPORTANT: Break your responses into natural chunks. Send one sentence or question at a time, then wait for a response before continuing. Use "•" as a delimiter between chunks to help with text-to-speech timing.`;
}

async function getUserInfo(memoryService: MemoryService): Promise<string> {
  const query = "give every information related to this user";
  const memories = await memoryService.search(query);
  
  if (memories.length === 0) {
    return "No specific user information available.";
  }
  
  // Extract memory content and combine into a paragraph
  const memoryContents = memories.map(memory => memory.memory).join(". ");
  return memoryContents;
}

async function getUserPersonalInfo(memoryService: MemoryService): Promise<string> {
  const query = "give every information related to this user personal details";
  const memories = await memoryService.searchWithCategory(query, ["personal_details"]);
  
  if (memories.length === 0) {
    return "No specific personal details available.";
  }
  
  const memoryContents = memories.map(memory => memory.memory).join(". ");
  return memoryContents;
}
async function getTodayAgendas(userId: number, currentDate: string) {
  return await AgendaDbService.getTodayAgendas(userId, currentDate);
}

function buildAgendaContext(todayAgendas: any[], currentDate: string): string {
  if (todayAgendas.length > 0) {
    const agendaList = todayAgendas.map(agenda => 
      `- ${agenda.name} (${agenda.status})`
    ).join('\n');
    return `Today's planned agendas:\n${agendaList}\n\nPlease ask the user about each agenda item and whether they completed it. Be specific and ask about each one individually.`;
  } else {
    return "No specific agendas planned for today. Suggest some activities based on the user's interests.";
  }
}
