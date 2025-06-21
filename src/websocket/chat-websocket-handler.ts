import { ServerWebSocket } from "bun";
import { MemoryService } from "../services/memory";
import { OpenAITextService } from "../services/openAiText";
import { SummaryService } from "../services/summary";
import { env } from "../config/env";

export interface ChatWebSocketData {
  memoryService: MemoryService;
  summaryService: SummaryService;
  openAiService: OpenAITextService;
  userId: string | null;
}

export class ChatWebSocketHandler {
  handleOpen(ws: ServerWebSocket<undefined>) {
    console.log("APP: Connected to Chat WebSocket");

    const memoryService = new MemoryService(env.MEM0_API_KEY);
    const summaryService = new SummaryService(env.OPENAI_API_KEY);
    const openAiService = new OpenAITextService(env.OPENAI_API_KEY, memoryService, summaryService);

    (ws as any).data = {
      memoryService,
      summaryService,
      openAiService,
      userId: null,
    } as ChatWebSocketData;
    this.setupEventListeners(ws);
  }

  private setupEventListeners(ws: ServerWebSocket<undefined>) {
    const data = (ws as any).data as ChatWebSocketData;

    // Add event listener for OpenAI response done events
    data.openAiService.on('openai_response_done', (response: { partialResponseIndex: number, partialResponse: string }) => {
      console.log(`APP: Received OpenAI chat response chunk ${response.partialResponseIndex}:`, response.partialResponse);
      
      // Send partial response to client
      ws.send(JSON.stringify({
        event: 'chat_output',
        payload: {
          partialResponse: response.partialResponse,
          partialResponseIndex: response.partialResponseIndex
        }
      }));
    });

    // Handle when OpenAI response is completely finished
    data.openAiService.on('openai_response_ended', (response: string) => {
      console.log('APP: OpenAI chat response ended:', response);
      
      // Send final response to client
      ws.send(JSON.stringify({
        event: 'chat_output_complete',
        payload: {
          finalResponse: response
        }
      }));
    });
  }

  async handleMessage(ws: ServerWebSocket<undefined>, message: string) {
    try {
      const data = (ws as any).data as ChatWebSocketData;
      const parsedData = JSON.parse(message);
      
      if (parsedData.event === 'connect') {
        console.log('APP: Chat WebSocket connect event received');
        const { user_id } = parsedData.payload;
        
        // Initialize user in memory service
        data.memoryService?.init_user(user_id);
        
        // Set user ID and connect OpenAI service
        data.openAiService?.setUserId(user_id);
        data.openAiService?.connect();
        
        data.userId = user_id;
        
        // Send connection confirmation
        ws.send(JSON.stringify({
          event: 'connected',
          payload: {
            user_id: user_id,
            message: 'Successfully connected to chat service'
          }
        }));
      }
      else if (parsedData.event === 'chat_input') {
        console.log('APP: Chat input received');
        
        // Handle the chat message through OpenAI service
        data.openAiService?.handleMessage(JSON.stringify({
          event: 'text',
          text: parsedData.payload.message
        }));
      }
      else {
        console.log('APP: Unknown chat event:', parsedData.event);
        ws.send(JSON.stringify({
          event: 'error',
          payload: {
            message: 'Unknown event type'
          }
        }));
      }
    } catch (error) {
      console.error('APP: Error handling chat WebSocket message:', error);
      ws.send(JSON.stringify({
        event: 'error',
        payload: {
          message: 'Error processing message'
        }
      }));
    }
  }

  async handleClose(ws: ServerWebSocket<undefined>, code: number, reason: string) {
    const data = (ws as any).data as ChatWebSocketData;
    
    // Disconnect all services
    await data?.openAiService?.disconnect();
    
    // Clear data
    (ws as any).data = undefined;
    console.log("APP: Chat WebSocket client disconnected.");
  }
} 