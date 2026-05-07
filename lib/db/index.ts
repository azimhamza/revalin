import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  var __revalinPg: ReturnType<typeof postgres> | undefined;
  var __revalinDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function toPositiveInt(value?: string | null) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolvePoolMax(databaseUrl: string) {
  const explicitMax = toPositiveInt(process.env.DATABASE_POOL_MAX);

  if (explicitMax) {
    return explicitMax;
  }

  try {
    const parsed = new URL(databaseUrl);
    const isSupabasePooler = parsed.hostname.endsWith('pooler.supabase.com');
    const isSessionPooler = isSupabasePooler && parsed.port === '5432';

    if (isSessionPooler) {
      return 1;
    }
  } catch {
    // Fall back to conservative defaults when the URL cannot be parsed.
  }

  return process.env.NODE_ENV === 'production' ? 10 : 5;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable.');
  }

  return databaseUrl;
}

function createClient(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: resolvePoolMax(databaseUrl),
    idle_timeout: 5,
    connect_timeout: 10,
    max_lifetime: 60 * 5,
    prepare: false,
  });
}

const databaseUrl = getDatabaseUrl();
const client = globalThis.__revalinPg ?? createClient(databaseUrl);

if (!globalThis.__revalinPg) {
  globalThis.__revalinPg = client;
}

export const db = globalThis.__revalinDb ?? drizzle(client, { schema });

if (!globalThis.__revalinDb) {
  globalThis.__revalinDb = db;
}
