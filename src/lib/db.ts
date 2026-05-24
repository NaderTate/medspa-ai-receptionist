// Single shared Prisma client, wired to Neon over the serverless driver adapter.
// We set the WebSocket constructor explicitly so it works in a long-running
// server on both Node and Bun (Neon uses WebSockets for pooled connections).

import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const adapter = new PrismaNeon({ connectionString });

export const prisma = new PrismaClient({ adapter });
