import MemoryClient, { Message } from "mem0ai";

interface AgendaItem {
  type: string;
  date: string;
  name: string;
  status: string;
  details: string;
  context: string;
  id: string;
  completed?: boolean;
  completedAt?: string;
}

function generateAgendaId(date: string, name: string): string {
  // Use date and a hash of the name for uniqueness
  const hash = Math.abs(
    name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  );
  return `agenda_${date.replace(/-/g, '')}_${hash}`;
}

export class MemoryService {
    private user_id: string | null = null;
    private client: MemoryClient;
    
  constructor(private apiKey: string) {
      this.client = new MemoryClient({ apiKey: this.apiKey });
  }
    
    public init_user(userId: string) {
        this.user_id = userId;
    }
    
    public async add(messages: Message[], optionsOverride?: any) {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        const options = optionsOverride || { user_id: this.user_id };
        const result = await this.client.add(messages, options)
        return result;
    }
    
    public async greetings() {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        const query = "ask user how is their day going";
        const options = { user_id: this.user_id };
        const result = await this.client.search(query, options);
        return result;
    }

    public async search(query: string) {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        const options = { user_id: this.user_id };
        const result = await this.client.search(query, options);
        return result;
    }

    public async getTodayAgendas(date: string): Promise<AgendaItem[]> {
        try {
            if (!this.user_id) throw new Error("MemoryService not initialized");
            
            // Try to use metadata filter if supported
            let memories: any[] = [];
            try {
                const options = { user_id: this.user_id as string, filter: { "metadata.category": "agenda" } };
                memories = await this.client.search("Search for any planned activities", options);
            } catch (err) {
                memories = await this.search("");
            }
            console.log("MEMORY: Memories:", memories);
            // Filter for agenda memories with correct metadata and date
            const agendas = memories
                .filter(mem =>
                    mem.metadata?.category === "agenda" &&
                    mem.memory && mem.memory.includes(date)
                )
                .map(mem => {
                    // Try to match formatted agenda first
                    const formattedMatch = mem.memory.match(/AG_ID: (\S+) \| Agenda: (.+?) \| Date: (\d{4}-\d{2}-\d{2})/);
                    if (formattedMatch) {
                        return {
                            id: formattedMatch[1],
                            name: formattedMatch[2],
                            date: formattedMatch[3],
                            type: 'agenda_item',
                            status: 'planned',
                            details: '',
                            context: '',
                        };
                    }
                    
                    // Try to match unformatted agenda
                    const planMatch = mem.memory.match(/Plan to (.+?) on (\d{4}-\d{2}-\d{2})/);
                    if (planMatch) {
                        const name = planMatch[1];
                        const matchedDate = planMatch[2];
                        return {
                            id: generateAgendaId(matchedDate, name),
                            name: name,
                            date: matchedDate,
                            type: 'agenda_item',
                            status: 'planned',
                            details: mem.memory,
                            context: '',
                        };
                    }
                    
                    return null;
                })
                .filter((item): item is AgendaItem => item !== null);

            console.log("MEMORY: Today's agendas:", agendas);
            return agendas;
        } catch (error) {
            console.error("MEMORY: Error getting today's agendas:", error);
            return [];
        }
    }

    public async addAgendaItems(agendaItems: AgendaItem[]): Promise<void> {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        try {
            const memories = agendaItems.map(item => {
                const agendaId = item.id || generateAgendaId(item.date, item.name);
                return {
                    role: "user" as const,
                    content: `AG_ID: ${agendaId} | Agenda: ${item.name} | Date: ${item.date} | Details: ${item.details || 'No additional details'} | Status: ${item.status}`
                };
            });
            await this.add(memories, { user_id: this.user_id, metadata: { category: "agenda" } });
            console.log("MEMORY: Added agenda items to memory");
        } catch (error) {
            console.error("MEMORY: Error adding agenda items:", error);
        }
    }

    public async markAgendaAsCompleted(agendaId: string): Promise<void> {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        try {
            const completionMemory = {
                role: "user" as const,
                content: `✅ COMPLETED [${agendaId}] - Completed at ${new Date().toISOString()}`,
                categories: ["agenda"]
            };
            await this.add([completionMemory]);
            console.log(`MEMORY: Marked agenda ${agendaId} as completed`);
        } catch (error) {
            console.error("MEMORY: Error marking agenda as completed:", error);
        }
    }

    public async checkAgendaCompletion(userMessage: string, currentDate: string): Promise<void> {
        try {
            // Query for agenda category and today's date
            const query = `category:agenda date:${currentDate}`;
            const memories = await this.search(query);
            for (const mem of memories as any[]) {
                const agendaMatch = mem.content?.match(/AG_ID: (\S+) \| Agenda: (.+?) \| Date: (\d{4}-\d{2}-\d{2})/);
                if (agendaMatch) {
                    const agendaId = agendaMatch[1];
                    const agendaName = agendaMatch[2];
                    if (agendaName && userMessage.toLowerCase().includes(agendaName.toLowerCase())) {
                        await this.markAgendaAsCompleted(agendaId);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error("MEMORY: Error checking for agenda completion:", error);
        }
    }
}