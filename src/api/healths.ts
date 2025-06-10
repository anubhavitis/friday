export const HealthHandler = {
  GET: (req: Request) => {
    return new Response(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
    );
  },
};