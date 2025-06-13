import MemoryClient, { Message, MemoryOptions } from "mem0ai";

export class MemoryService {

    private client: MemoryClient;
    
  constructor(private apiKey: string) {
      this.client = new MemoryClient({ apiKey: this.apiKey });
      const messages: Message[] = [
  { role: "user", content: "Hi, I'm Anubhav. I'm a 25yo vegetarian currently living in Bangalore. I have ." },
  { role: "assistant", content: "Hello Alex! I've noted that you're a vegetarian and have a nut allergy. I'll keep this in mind for any food-related recommendations or discussions." }
      ]
      
      this.add(messages, { user_id: "anubhav" }).then(_ => console.log("added inital memory for anubhav"));
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