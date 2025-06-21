import { env } from "./env";

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    enabled: boolean;
    origins: string[];
  };
  logging: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  websocket: {
    path: string;
    maxConnections: number;
  };
}

export const serverConfig: ServerConfig = {
  port: Number(env.PORT) || 3000,
  host: '0.0.0.0',
  cors: {
    enabled: true,
    origins: ['*'] // In production, specify actual origins
  },
  logging: {
    enabled: true,
    level: 'info'
  },
  websocket: {
    path: '/media-stream',
    maxConnections: 1000
  }
};

export function getCorsOrigins(): string[] {
  if (process.env.NODE_ENV === 'production') {
    return serverConfig.cors.origins.filter(origin => origin !== '*');
  }
  return serverConfig.cors.origins;
} 