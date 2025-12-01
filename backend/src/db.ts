import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import logger from './utils/logger.js';

// Singleton Prisma Client instance
// https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prismaclient-in-long-running-applications
let prisma: PrismaClient | null = null;

// Lazy initialization - only create client when DATABASE_URL is available
function getPrismaClient(): PrismaClient {
  if (!prisma && process.env.DATABASE_URL) {
    const connectionString = process.env.DATABASE_URL;
    const adapter = new PrismaPg({ connectionString });

    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    logger.info(
      {
        databaseUrl: connectionString.replace(/:[^:@]+@/, ':***@'), // パスワードをマスク
      },
      'Prisma Client initialized'
    );
  }

  if (!prisma) {
    throw new Error('DATABASE_URL not configured');
  }

  return prisma;
}

// Export singleton instance getter
export default getPrismaClient;

// Graceful shutdown helper
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Prisma Client disconnected');
    prisma = null;
  }
}
