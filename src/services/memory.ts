import MemoryClient, { Message, MemoryOptions } from "mem0ai";

export class MemoryService {

    private client: MemoryClient;
    
  constructor(private apiKey: string) {
      this.client = new MemoryClient({ apiKey: this.apiKey });
      const messages: Message[] = [
  { role: "user", content: "Hi, I'm Abhishek. I'm a 26yo non-vegetarian currently living in Bangalore. Now I am currently in a Keto Diet. Binging Modern Family" },
      ]
      
      this.add(messages, { user_id: "abhishek" }).then(_ => console.log("added inital memory for abhishek"));
  }
    
    public async add(messages: Message[], options: MemoryOptions) {
      const result = await this.client.add(messages, options)
        return result;
    }
    
    public async greetings(user_id: string) {
        const query = "ask user how is their day going";
        const options = { user_id: user_id };
        const result = await this.client.search(query, options);
        return result;
    }

    public async search(query: string, options: MemoryOptions) {
        const result = await this.client.search(query, options);
        return result;
    }
}