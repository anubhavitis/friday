import { OpenAIService } from './openai/openai';

export interface AIServiceConfig {
  apiKey: string;
  model?: string;
}

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  stream?: boolean;
}

export interface AIService {
  startVoice(): Promise<void>;
  stopVoice(): Promise<void>;
}

export enum AIServiceType {
  OpenAI = 'openai'
}

export class AIServiceFactory {
  static createService(type: AIServiceType): AIService {
    switch (type) {
      case AIServiceType.OpenAI:
        return new OpenAIService();
      default:
        throw new Error(`Unsupported AI service type: ${type}`);
    }
  }
}
