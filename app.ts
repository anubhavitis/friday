import { Serve } from "bun";
import { Twilio } from "twilio";
import { SchedulerCronService } from "./src/services/cron/scheduler";
import { CronService } from "./src/services/cron/cron";
import { initDb } from "./src/pkg/db";
import { env } from "./src/config/env";
import { CallHistoryService } from "./src/services/callHistory";
import { UserService } from "./src/services/user";
import { TwilioVoiceService } from "./src/services/twilioVoice";

// Import the new clean structure
import { handleRequest } from "./src/routes";
import { 
  createWebSocketHandler, 
  createChatWebSocketHandler,
  setupWebSocketHandlers,
  setupChatWebSocketHandlers 
} from "./src/websocket";

// Initialize database
const err = await initDb(env.DB_HOST, Number(env.DB_PORT), env.DB_USER, env.DB_PASSWORD, env.DB_NAME);
if (err) {
  console.error('APP: Database connection failed:', err);
  process.exit(1);
}

// Initialize Twilio client
const twilioClient = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

// Initialize services
const PORT = Number(env.PORT);
let schedulerService = new SchedulerCronService(twilioClient, env.FROM_NUMBER);
let cronService = new CronService(schedulerService);
let userService = new UserService(twilioClient);
let callHistoryService = new CallHistoryService(twilioClient);
let twilioVoiceService = new TwilioVoiceService(twilioClient);

// Start cron service
cronService.start();

// Create WebSocket handlers
const webSocketHandler = createWebSocketHandler(userService, callHistoryService, twilioVoiceService);
const chatWebSocketHandler = createChatWebSocketHandler();

const server: Serve = {
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle WebSocket upgrades for different paths
    if (pathname === "/media-stream" || pathname === "/chat-with-openai") {
      console.log(`APP: WebSocket request received for ${pathname}, host:`, req.headers.get("host"));
      if (this.upgrade(req, { data: { url: req.url } })) {
        console.log("APP: Upgraded to WebSocket");
        return; // WebSocket will take over
      }
      console.log("APP: Failed to upgrade to WebSocket");
      return new Response("Failed to upgrade to WebSocket", { status: 400 });
    }

    // Handle all other API routes
    return handleRequest(req);
  },
  websocket: {
    open: (ws: any) => {
      // Determine which WebSocket handler to use based on the path
      const url = new URL(ws.data.url);
      const pathname = url.pathname;

      if (pathname === "/chat-with-openai") {
        (ws as any).handler = setupChatWebSocketHandlers(chatWebSocketHandler);
      } else {
        // Default to media-stream handler
        (ws as any).handler = setupWebSocketHandlers(webSocketHandler);
      }
      (ws as any).handler.open(ws);
    },
    message: async (ws: any, message: string) => {
      if ((ws as any).handler) {
        await (ws as any).handler.message(ws, message);
      }
    },
    close: async (ws: any, code: number, reason: string) => {
      if ((ws as any).handler) {
        await (ws as any).handler.close(ws, code, reason);
      }
    },
  },
};

console.log(`APP: Server is running on port ${PORT}`);
Bun.serve(server);
