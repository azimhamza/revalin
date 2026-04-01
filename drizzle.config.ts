import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

function readDatabaseUrlFromEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);

  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const contents = fs.readFileSync(filePath, 'utf8');

  for (const line of contents.split(/\r?\n/)) {
    if (!line.startsWith('DATABASE_URL=')) {
      continue;
    }

    return line.slice('DATABASE_URL='.length).trim();
  }

  return undefined;
}

const databaseUrl =
  process.env.DATABASE_URL ||
  readDatabaseUrlFromEnvFile('.env.local') ||
  readDatabaseUrlFromEnvFile('.env');

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL. Set it in the environment or in .env.local.');
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
