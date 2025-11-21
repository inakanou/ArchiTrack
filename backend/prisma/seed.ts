/**
 * @fileoverview Prisma Seedスクリプト
 *
 * Requirements:
 * - 3.1-3.5: 初期管理者アカウントのセットアップ
 * - 17: 動的ロール管理（事前定義ロール）
 * - 18: 権限管理（事前定義権限）
 *
 * 実行方法:
 * npm run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import logger from '../src/utils/logger.js';
import {
  seedRoles,
  seedPermissions,
  seedRolePermissions,
  seedAdminUser,
} from '../src/utils/seed-helpers.js';

// 環境変数を読み込み
config();

const prisma = new PrismaClient();

async function main() {
  const startTime = Date.now();
  logger.info('🌱 Starting database seed...');

  // 1. ロールのシーディング
  await seedRoles(prisma);

  // 2. 権限のシーディング
  await seedPermissions(prisma);

  // 3. ロール・権限の紐付け
  await seedRolePermissions(prisma);

  // 4. 初期管理者アカウントの作成
  await seedAdminUser(prisma);

  const duration = Date.now() - startTime;
  logger.info(`✅ Seed completed successfully (${duration}ms)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error({ err: error }, '❌ Seed failed');
    await prisma.$disconnect();
    process.exit(1);
  });
