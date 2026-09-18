import 'server-only';
import { getDb, type PrismaClient } from '@printflow/db';

/**
 * Web-side DB accessor. Single import point so we can swap or mock the client
 * in one place. All lib/data + route handlers use getDb() from @printflow/db.
 */
export function db(): PrismaClient {
  return getDb();
}

export { PrismaClient };
