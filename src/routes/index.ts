import { HealthHandler } from "../api/healths";
import { IncomingHandler } from "../api/incoming";
import { UsersHandler } from "../api/users";
import { SchedulerHandler } from "../api/scheduler";
import { OutboundHandler } from "../api/outbound";
import { logRequest, logResponse } from "../middleware/logger";
import { addCorsHeaders } from "../middleware/cors";

export interface RouteHandler {
  path: string;
  method: string;
  handler: (req: Request) => Response | Promise<Response>;
}

export const routes: RouteHandler[] = [
  {
    path: "/health",
    method: "GET",
    handler: HealthHandler.GET
  },
  {
    path: "/voice/incoming",
    method: "POST", 
    handler: IncomingHandler.GET
  },
  {
    path: "/users",
    method: "POST",
    handler: UsersHandler.POST
  },
  {
    path: "/users",
    method: "GET",
    handler: UsersHandler.GET
  },
  {
    path: "/scheduler",
    method: "POST",
    handler: SchedulerHandler.POST
  },
  {
    path: "/outbound",
    method: "POST",
    handler: OutboundHandler.POST
  },
];

export async function handleRequest(req: Request): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // Log incoming request
    logRequest(req);
    
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // Handle OPTIONS requests for CORS
    if (method === "OPTIONS") {
      const response = new Response(null, { status: 200 });
      return addCorsHeaders(response);
    }

    // Find matching route
    const route = routes.find(r => r.path === pathname && r.method === method);
    
    if (route) {
      const response = await route.handler(req);
      const responseWithCors = addCorsHeaders(response);
      logResponse(req, responseWithCors, startTime);
      return responseWithCors;
    }

    // Handle WebSocket upgrade for media-stream
    if (pathname === "/media-stream") {
      console.log("APP: Media stream request received, host:", req.headers.get("host"));
      return new Response("WebSocket upgrade handled separately", { status: 200 });
    }

    // 404 Not Found
    const notFoundResponse = new Response("Not Found", { status: 404 });
    const notFoundWithCors = addCorsHeaders(notFoundResponse);
    logResponse(req, notFoundWithCors, startTime);
    return notFoundWithCors;
    
  } catch (error) {
    console.error('APP: Error handling request:', error);
    const errorResponse = new Response("Internal Server Error", { status: 500 });
    const errorWithCors = addCorsHeaders(errorResponse);
    logResponse(req, errorWithCors, startTime);
    return errorWithCors;
  }
} 