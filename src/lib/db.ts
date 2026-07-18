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

// Neon suspends its compute after ~5 idle minutes, and the wake-up costs
// multiple seconds — enough to blow Vapi's hard 7.5s assistant-request budget
// on the first call after a quiet spell. A cheap periodic ping keeps the
// compute awake while the server runs; the boot-time ping also warms the very
// first call after a deploy.
export function startDbKeepWarm(
  intervalMs = 4 * 60_000,
  ping: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
): () => void {
  const run = () => {
    void ping().catch((err) => console.warn('[db] keep-warm ping failed:', err));
  };
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}
