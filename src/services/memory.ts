import MemoryClient, { Message } from "mem0ai";

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

    public async searchWithCategory(query: string, categories: string[]) {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        const options = { user_id: this.user_id, categories: categories };
        const result = await this.client.search(query, options);
        return result;
    }

    public async searchWithMetadata(query: string, metadata: any) {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        const options = { user_id: this.user_id, metadata: metadata };
        const result = await this.client.search(query, options);
        return result;
    }
    /**
     * Save a simple summary of agenda activities
     * @param summary The summary to save
     */
    public async saveAgendaSummary(summary: string): Promise<void> {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        try {
            const memory = {
                role: "user" as const,
                content: summary
            };
            await this.add([memory], { user_id: this.user_id, metadata: { category: "agenda_summary" } });
            console.log("MEMORY: Saved agenda summary:", summary);
        } catch (error) {
            console.error("MEMORY: Error saving agenda summary:", error);
        }
    }
}