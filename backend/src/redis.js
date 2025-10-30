import Redis from 'ioredis';

let redis = null;

// Lazy initialization - only create redis client when REDIS_URL is available
function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true, // Don't connect immediately
    });

    redis.on('connect', () => {
      console.log('✓ Redis connected');
    });

    redis.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }
  return redis;
}

export default {
  ping: async () => {
    const r = getRedis();
    if (!r) {
      throw new Error('REDIS_URL not configured');
    }
    if (r.status !== 'ready') {
      await r.connect();
    }
    return r.ping();
  },
  disconnect: () => {
    if (redis) {
      redis.disconnect();
    }
  },
};
