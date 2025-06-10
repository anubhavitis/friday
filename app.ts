import { Serve } from "bun";
import { HealthHandler } from "./src/api/healths";

const routes = {
  '/health': HealthHandler.GET,
} as const;

const server: Serve = {
  port: Number(process.env.PORT) || 3000,
  fetch(req: Request) {
    const url = new URL(req.url);
    const handler = routes[url.pathname as keyof typeof routes];

    if (handler) {  
      return handler(req);
    }

    return new Response('Not Found', { status: 404 });
  },
};

console.log(`Server is running on port ${server.port}`);

Bun.serve(server); 