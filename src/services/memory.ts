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
    
    public async add(messages: Message[]) {
        if (!this.user_id) {
            throw new Error("MemoryService not initialized");
        }
        const options = { user_id: this.user_id };
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
}