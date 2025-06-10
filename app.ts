import { Serve } from "bun";
import { HealthHandler } from "./src/api/healths";

const SYSTEM_MESSAGE = 'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.';
const VOICE = 'alloy'; // 'alloy', 'nova', 'shimmer', 'echo'
const PORT = process.env.PORT || 3000;
// List of Event Types to log to the console. See OpenAI Realtime API Documentation. (session.updated is handled separately.)
const LOG_EVENT_TYPES = [
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created'
];
const model = "gpt-4o"

const incomingHandler = (request: Request) => {
  const twimlResponse = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Please wait while we connect your call to the AI voice assistant, powered by Twilio and the OpenAI Realtime API</Say>
      <Pause length="1"/>
      <Say>OK, you can start talking!</Say>
      <Connect>
        <Stream url="wss://${request.headers.get('host')}"/>
      </Connect>
    </Response>
  `;

  return new Response(twimlResponse, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
};

const server: Serve = {
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === '/health') {
      return HealthHandler.GET(req);
    }  else if (pathname === '/voice/incoming') {
      return incomingHandler(req);
    } else if (pathname === '/media-stream') {
      // Upgrade the request to WebSocket
      const upgrade = req.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }

      // Create WebSocket pair for client and server
      const { 0: client, 1: server } = new WebSocketPair();
      
      // Accept the server connection
      server.accept();

      // Connect to OpenAI's WebSocket
      const openaiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`);
      openaiWs.setHeader('Authorization', `Bearer ${process.env.OPENAI_API_KEY}`);
      openaiWs.setHeader('OpenAI-Beta', 'realtime=v1');

      let streamId: string | null = null;

      const sendSessionUpdate = () => {
        const sessionUpdate = {
          type: 'session.update',
          session: {
            turn_detection: { type: 'server_vad' },
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            voice: VOICE,
            instructions: SYSTEM_MESSAGE,
            modalities: ["text", "audio"],
            temperature: 0.8,
          }
        };
        console.log('Sending session update:', JSON.stringify(sessionUpdate));
        openaiWs.send(JSON.stringify(sessionUpdate));
      };

      openaiWs.onopen = () => {
        console.log('Connected to the OpenAI Realtime API');
        setTimeout(sendSessionUpdate, 250);
      };

      openaiWs.onmessage = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);
          if (LOG_EVENT_TYPES.includes(response.type)) {
            console.log(`Received event: ${response.type}`, response);
          }
          if (response.type === 'session.updated') {
            console.log('Session updated successfully:', response);
          }
          if (response.type === 'response.audio.delta' && response.delta) {
            const audioDelta = {
              event: 'media',
              streamSid: streamId,
              media: { payload: Buffer.from(response.delta, 'base64').toString('base64') }
            };
            server.send(JSON.stringify(audioDelta));
          }
        } catch (error) {
          console.error('Error processing OpenAI message:', error, 'Raw message:', event.data);
        }
      };

      openaiWs.onerror = (event: Event) => {
        console.error('WebSocket error:', event);
        server.close();
      };

      // Handle client WebSocket events
      server.addEventListener('message', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'start') {
            streamId = data.streamSid;
          }
          // Forward client messages to OpenAI
          openaiWs.send(JSON.stringify(data));
        } catch (error) {
          console.error('Error processing client message:', error);
        }
      });

      server.addEventListener('close', () => {
        console.log('Client disconnected');
        openaiWs.close();
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not Found', { status: 404 });
  },
  websocket: {
    message: (ws: WebSocket, message: string) => {
      console.log('WebSocket message:', message);
    },
    open: (ws: WebSocket) => {
      console.log('WebSocket opened');
    },
    close: (ws: WebSocket) => {
      console.log('WebSocket closed');
    }
  }
};

console.log(`Server is running on port ${PORT}`);
Bun.serve(server); 