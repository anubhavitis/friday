export function logRequest(req: Request): void {
  const url = new URL(req.url);
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${url.pathname} - ${req.headers.get('user-agent') || 'Unknown'}`);
}

export function logResponse(req: Request, response: Response, startTime: number): void {
  const url = new URL(req.url);
  const timestamp = new Date().toISOString();
  const duration = Date.now() - startTime;
  console.log(`[${timestamp}] ${req.method} ${url.pathname} - ${response.status} (${duration}ms)`);
} 