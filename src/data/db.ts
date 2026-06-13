import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { loadConfig } from '../config/index.js';

const config = loadConfig();

const client = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
