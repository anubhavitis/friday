import { Agent, run, RunResult } from '@openai/agents';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { AIService, AIServiceConfig, StreamOptions } from '../index';

export class OpenAIService implements AIService {
  private apiKey: string;
  private model: string;
  private agent: Agent;
  private realtimeAgent: RealtimeAgent;
  private realtimeSession: RealtimeSession | null = null;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? 
      (() => { throw new Error('OPENAI_API_KEY is not set') })();
      
    this.model = process.env.OPENAI_MODEL ??
      (() => { throw new Error('OPENAI_MODEL is not set') })();

    
    this.agent = new Agent({
      name: 'Assistant',
      instructions: 'You are a helpful assistant.',
    });

    this.realtimeAgent = new RealtimeAgent({
      name: 'Realtime Assistant',
      instructions: 'You are a helpful assistant.',
    });
  }

  async startVoice(): Promise<void> {
    console.log('Starting voice...');
    if (!this.realtimeSession) {
      this.realtimeSession = new RealtimeSession(this.realtimeAgent);
      await this.realtimeSession.connect({ apiKey: this.apiKey, model: this.model });
    }
  }

  async stopVoice(): Promise<void> {
    await this.realtimeSession?.close();
  }
  
}