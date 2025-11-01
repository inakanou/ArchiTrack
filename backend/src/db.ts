import pg from 'pg';
import logger from './utils/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

// Lazy initialization - only create pool when DATABASE_URL is available
function getPool(): pg.Pool | null {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    pool.on('connect', () => {
      logger.info('PostgreSQL connected');
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'PostgreSQL error');
    });
  }
  return pool;
}

export default {
  query: (text: string, params?: unknown[]): Promise<pg.QueryResult> => {
    const p = getPool();
    if (!p) {
      throw new Error('DATABASE_URL not configured');
    }
    return p.query(text, params);
  },
  end: async (): Promise<void> => {
    if (pool) {
      await pool.end();
    }
  },
};
