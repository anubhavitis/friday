import { ServerWebSocket } from "bun";
import { WebSocketHandler } from "./websocket-handler";
import { ChatWebSocketHandler } from "./chat-websocket-handler";
import { UserService } from "../services/user";
import { CallHistoryService } from "../services/callHistory";
import { TwilioVoiceService } from "../services/twilioVoice";

export { WebSocketHandler } from "./websocket-handler";
export { ChatWebSocketHandler } from "./chat-websocket-handler";
export type { WebSocketData } from "./websocket-handler";
export type { ChatWebSocketData } from "./chat-websocket-handler";

export function createWebSocketHandler(
  userService: UserService,
  callHistoryService: CallHistoryService,
  twilioVoiceService: TwilioVoiceService
): WebSocketHandler {
  return new WebSocketHandler(userService, callHistoryService, twilioVoiceService);
}

export function createChatWebSocketHandler(): ChatWebSocketHandler {
  return new ChatWebSocketHandler();
}

export function setupWebSocketHandlers(handler: WebSocketHandler) {
  return {
    open: (ws: ServerWebSocket<undefined>) => {
      handler.handleOpen(ws);
    },
    message: async (ws: ServerWebSocket<undefined>, message: string) => {
      await handler.handleMessage(ws, message);
    },
    close: async (ws: ServerWebSocket<undefined>, code: number, reason: string) => {
      await handler.handleClose(ws, code, reason);
    }
  };
}

export function setupChatWebSocketHandlers(handler: ChatWebSocketHandler) {
  return {
    open: (ws: ServerWebSocket<undefined>) => {
      handler.handleOpen(ws);
    },
    message: async (ws: ServerWebSocket<undefined>, message: string) => {
      await handler.handleMessage(ws, message);
    },
    close: async (ws: ServerWebSocket<undefined>, code: number, reason: string) => {
      await handler.handleClose(ws, code, reason);
    }
  };
} 