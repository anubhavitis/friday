import { MemoryService } from "./memory";
import { Memory } from "mem0ai";
import AgendaDbService from "../repository/agendas";

export interface AIContextData {
  currentDate: string;
  persona: string;
  userId: number;
  memoryService: MemoryService;
}

export async function buildMorningInitialAIContext({
  currentDate,
  persona,
  userId,
  memoryService
}: AIContextData): Promise<string> {
  // Fetch all the data
  const userInfo = await getUserInfo(memoryService);
  console.log("userInfo", userInfo, "and length", userInfo.length);
  const userPersonalInfo = await getUserPersonalInfo(userInfo);
  const userWorkInfo = await getUserWorkInfo(userInfo);
  const userHobbiesInfo = await getUserHobbiesInfo(userInfo);
  const userInterestsInfo = await getUserInterestsInfo(userInfo);
  const userAgendasSummary = await getUserAgendasSummary(userInfo);
  const todayAgendas = await getTodayAgendas(userId, currentDate);
  const previousAgendas = await getPreviousAgendas(userId, currentDate);

  console.log("userPersonalInfo", userPersonalInfo);
  console.log("userWorkInfo", userWorkInfo);
  console.log("userHobbiesInfo", userHobbiesInfo);
  console.log("userInterestsInfo", userInterestsInfo);
  console.log("userAgendasSummary", userAgendasSummary);
  // Build agenda context
  const agendaContext = buildMorningAgendaContext(previousAgendas, currentDate);
  
  return `Today is ${currentDate}. You are ${persona}. Here is what I know about the user: ${JSON.stringify(userPersonalInfo)}, work information: ${JSON.stringify(userWorkInfo)}, hobbies: ${JSON.stringify(userHobbiesInfo)}, interests: ${JSON.stringify(userInterestsInfo)}, and some previous agendas: ${JSON.stringify(userAgendasSummary)}, and check for their interests and get to know them better, about the things they are doing. 
Use this information to greet them naturally with their name, and just simply ask how was your day. Once you get to know about the users day ask about their planned activities suggest something based on their interests.
You need to take into account the users interests and preferences.
IMPORTANT: ${agendaContext}
When asking about the user agendas for the day, ask about the agenda user might be interested in.
IMPORTANT: Be more engaging and more human like. And keep the sentences short and concise.
IMPORTANT: Do not use emojis in your responses.
IMPORTANT: While suggesting activities, suggest based on the users interests and preferences.
IMPORTANT: Go through the user information, to get to know them better. Go through any projects there are working on.

IMPORTANT: Break your responses into natural chunks. Send one sentence or question at a time, then wait for a response before continuing. Use "•" as a delimiter between chunks to help with text-to-speech timing.`;
}

export async function buildEveningInitialAIContext({
  currentDate,
  persona,
  userId,
  memoryService
}: AIContextData): Promise<string> {
  // Fetch all the data
  const userInfo = await getUserInfo(memoryService);
  console.log("userInfo", userInfo, "and length", userInfo.length);
  const userPersonalInfo = await getUserPersonalInfo(userInfo);
  const userWorkInfo = await getUserWorkInfo(userInfo);
  const userHobbiesInfo = await getUserHobbiesInfo(userInfo);
  const userInterestsInfo = await getUserInterestsInfo(userInfo);
  const todayAgendas = await getTodayAgendas(userId, currentDate);
  const previousAgendas = await getPreviousAgendas(userId, currentDate);

  console.log("userPersonalInfo", userPersonalInfo);
  console.log("userWorkInfo", userWorkInfo);
  console.log("userHobbiesInfo", userHobbiesInfo);
  console.log("userInterestsInfo", userInterestsInfo);
  // Build agenda context
  const agendaContext = buildEveningAgendaContext(todayAgendas, currentDate);
  
  return `Today is ${currentDate}. You are ${persona}. Here is what I know about the user: ${JSON.stringify(userPersonalInfo)}, work information: ${JSON.stringify(userWorkInfo)}, hobbies: ${JSON.stringify(userHobbiesInfo)}, and interests: ${JSON.stringify(userInterestsInfo)}, and check for their interests and get to know them better, about the things they are doing. 
Use this information to greet them naturally with their name, and just simply ask how was your day. You will be given the agendas for today, ask user about how the agendas went one by one.
You need to take into account the users interests and preferences.
IMPORTANT: ${agendaContext}
IMPORTANT: Once user answers the agenda question, ask about the next agenda. Once all the agendas are answered, just greet them how they did wonderful job and greet them good night. And also say Bye to the user.
IMPORTANT: Be more engaging and more human like. And keep the sentences short and concise.
IMPORTANT: Do not use emojis in your responses.
IMPORTANT: While asking about the agendas, ask one by one.
IMPORTANT: Go through the user information, to get to know them better. Go through any projects there are working on.
IMPORTANT: Break your responses into natural chunks. Send one sentence or question at a time, then wait for a response before continuing. Use "•" as a delimiter between chunks to help with text-to-speech timing.`;
}


async function getUserInfo(memoryService: MemoryService): Promise<Array<Memory>> {
  const query = "give every information related to this user";
  const memories = await memoryService.search(query);
  
  if (memories.length === 0) {
    return [];
  }
  return memories;
}

async function getUserPersonalInfo(userInfo: Array<Memory>): Promise<string> {
  // Filter userInfo to get only personal_details from metadata
  const personalDetailsMemories = userInfo.filter(memory => 
    memory.metadata?.category === "personal_details"
  );
  
  if (personalDetailsMemories.length === 0) {
    return "No specific personal details available.";
  }
  
  const memoryContents = personalDetailsMemories.map(memory => memory.memory).join(". ");
  return memoryContents;
}

async function getUserWorkInfo(userInfo: Array<Memory>): Promise<string> {
  // Filter userInfo to get only work from metadata
  const workMemories = userInfo.filter(memory => 
    memory.metadata?.category === "work"
  );
  
  if (workMemories.length === 0) {
    return "No specific work information available.";
  }
  
  const memoryContents = workMemories.map(memory => memory.memory).join(". ");
  return memoryContents;
}

async function getUserHobbiesInfo(userInfo: Array<Memory>): Promise<string> {
  // Filter userInfo to get only hobbies from metadata
  const hobbiesMemories = userInfo.filter(memory => 
    memory.metadata?.category === "hobbies"
  );
  
  if (hobbiesMemories.length === 0) {
    return "No specific hobbies information available.";
  }
  
  const memoryContents = hobbiesMemories.map(memory => memory.memory).join(". ");
  return memoryContents;
}

async function getUserInterestsInfo(userInfo: Array<Memory>): Promise<string> {
  // Filter userInfo to get only interests from metadata
  const interestsMemories = userInfo.filter(memory => 
    memory.metadata?.category === "interests"
  );
  
  if (interestsMemories.length === 0) {
    return "No specific interests information available.";
  }
  
  const memoryContents = interestsMemories.map(memory => memory.memory).join(". ");
  return memoryContents;
}

  async function getUserAgendasSummary(userInfo: Array<Memory>): Promise<string> {
  const agendas = userInfo.filter(memory => 
    memory.metadata?.category === "agenda_summary"
  );
  if (agendas.length === 0) {
    return "No specific agendas information available.";
  }
  const memoryContents = agendas.map(memory => memory.memory).join(". ");
  return memoryContents;
}

async function getTodayAgendas(userId: number, currentDate: string) {
  return await AgendaDbService.getAgendasByDate(userId, currentDate);
}

async function getPreviousAgendas(userId: number, currentDate: string) {
  const previousDate = new Date(currentDate);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateString = previousDate.toISOString().split('T')[0];
  console.log("AGENDA: Previous date:", previousDateString);
  return await AgendaDbService.getAgendasByDate(userId, previousDateString);
}

function buildMorningAgendaContext(previousAgendas: any[], currentDate: string): string {
  if (previousAgendas.length > 0) {
    const agendaList = previousAgendas.map(agenda => 
      `- ${agenda.name} (${agenda.status})`
    ).join('\n');
    return `These are the agendas from the previous day: ${agendaList}, when you ask about the user agendas for the day, ask about the agenda user might be interested in based on the agendas from the previous day.
    Ask about the agendas that are not completed, mention they missed it yesterday and ask if they want to do it today.`;
  } else {
    return "No specific agendas planned for yesterday. Suggest some activities based on the user's interests.";
  }
}

function buildEveningAgendaContext(currentAgendas: any[], currentDate: string): string {
  if (currentAgendas.length > 0) {
    const agendaList = currentAgendas.map(agenda => 
      `- ${agenda.name} (${agenda.status})`
    ).join('\n'); 
    return `These are the agendas for today: ${agendaList}, Ask user did he completed the agendas today. Ask question one by one.`;
  } else {
    return "No specific agendas planned for today. Just ask user how was their day.";
  }
}

