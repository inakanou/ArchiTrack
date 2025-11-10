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
import {
  seedRoles,
  seedPermissions,
  seedRolePermissions,
  seedAdminUser,
} from '../src/utils/seed-helpers';

// 環境変数を読み込み
config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // 1. ロールのシーディング
  await seedRoles(prisma);

  // 2. 権限のシーディング
  await seedPermissions(prisma);

  // 3. ロール・権限の紐付け
  await seedRolePermissions(prisma);

  // 4. 初期管理者アカウントの作成
  await seedAdminUser(prisma);

  console.log('✅ Seed completed successfully');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('❌ Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
