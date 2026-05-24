// Prisma 7 config — the connection URL lives here, not in schema.prisma.
// Used by the Prisma CLI (db push, generate). The app reads DATABASE_URL
// directly in src/lib/db.ts via the Neon driver adapter.

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
