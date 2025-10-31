import pg from 'pg';
import logger from './utils/logger.js';

const { Pool } = pg;

let pool = null;

// Lazy initialization - only create pool when DATABASE_URL is available
function getPool() {
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
  query: (...args) => {
    const p = getPool();
    if (!p) {
      throw new Error('DATABASE_URL not configured');
    }
    return p.query(...args);
  },
  end: () => {
    if (pool) {
      return pool.end();
    }
  },
};
