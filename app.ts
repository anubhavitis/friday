import { Serve, ServerWebSocket } from "bun";
import { HealthHandler } from "./src/api/healths";
import { OpenAIService } from "./src/services/openAi";
import { IncomingHandler } from "./src/api/incoming";

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  FROM_NUMBER,
  SERVER,
  OPENAI_API_KEY,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !FROM_NUMBER || !SERVER || !OPENAI_API_KEY) {
  console.error(
    "One or more environment variables are missing. Please ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PHONE_NUMBER_FROM, DOMAIN, and OPENAI_API_KEY are set."
  );
  process.exit(1);
}

let openAiService: OpenAIService | null = null;
const PORT = process.env.PORT || 3000;


const server: Serve = {
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/health") {
      return HealthHandler.GET(req);
    } else if (pathname === "/voice/incoming") {
      return IncomingHandler.GET(req);
    } else if (pathname === "/media-stream") {
      console.log("Media stream request received, host:", req.headers.get("host"));
      if (this.upgrade(req)) {
        console.log("Upgraded to WebSocket");
        return; // WebSocket will take over
      }
      console.log("Failed to upgrade to WebSocket");
      return new Response("Failed to upgrade to WebSocket", { status: 400 });
    } else {
      return new Response("Not Found", { status: 404 });
    }
  },
  websocket: {
    open: (ws: ServerWebSocket<undefined>) => {
      console.log("Connected to Server WebSocket");
      openAiService = new OpenAIService(OPENAI_API_KEY);
      openAiService.connect(ws);
      openAiService.initConversation();
    },

    message: (ws: ServerWebSocket<undefined>, message: string) => {
      openAiService?.handleMessage(message);
    },

    close: (ws: ServerWebSocket<undefined>) => {
      openAiService?.disconnect();
      openAiService = null;
      console.log("Client disconnected.");
    },
  },
};

console.log(`Server is running on port ${PORT}`);
Bun.serve(server);
