import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  var __revalinDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable.');
  }

  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    prepare: false,
  });

  return drizzle(client, { schema });
}

export const db = globalThis.__revalinDb ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__revalinDb = db;
}
