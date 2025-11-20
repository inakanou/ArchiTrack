import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// テスト環境用の.env.testファイルを読み込む（validateEnv前に必須）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../../.env.test') });

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '@prisma/client';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';

/**
 * データベース統合テスト
 * 実際のPostgreSQLデータベースに接続してCRUD操作を検証
 */
describe('Database Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Prismaクライアントの初期化
    prisma = getPrismaClient();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-integration',
        },
      },
    });

    // 接続を切断
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に既存のテストデータをクリーンアップ
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-integration',
        },
      },
    });
  });

  describe('User CRUD Operations', () => {
    it('ユーザーを作成できること', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test-integration-create@example.com',
          displayName: 'Test User Create',
          passwordHash: 'test-hash',
        },
      });

      expect(user).toHaveProperty('id');
      expect(user.email).toBe('test-integration-create@example.com');
      expect(user.displayName).toBe('Test User Create');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('ユーザーを取得できること', async () => {
      // テストデータ作成
      const created = await prisma.user.create({
        data: {
          email: 'test-integration-read@example.com',
          displayName: 'Test User Read',
          passwordHash: 'test-hash',
        },
      });

      // IDで取得
      const retrieved = await prisma.user.findUnique({
        where: { id: created.id },
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.email).toBe('test-integration-read@example.com');
    });

    it('ユーザーを更新できること', async () => {
      // テストデータ作成
      const created = await prisma.user.create({
        data: {
          email: 'test-integration-update@example.com',
          displayName: 'Test User Update',
          passwordHash: 'test-hash',
        },
      });

      // 更新
      const updated = await prisma.user.update({
        where: { id: created.id },
        data: { displayName: 'Updated Name' },
      });

      expect(updated.displayName).toBe('Updated Name');
      expect(updated.email).toBe('test-integration-update@example.com');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    it('ユーザーを削除できること', async () => {
      // テストデータ作成
      const created = await prisma.user.create({
        data: {
          email: 'test-integration-delete@example.com',
          displayName: 'Test User Delete',
          passwordHash: 'test-hash',
        },
      });

      // 削除
      await prisma.user.delete({
        where: { id: created.id },
      });

      // 削除確認
      const retrieved = await prisma.user.findUnique({
        where: { id: created.id },
      });

      expect(retrieved).toBeNull();
    });

    it('複数ユーザーを取得できること', async () => {
      // テストデータ作成
      await prisma.user.createMany({
        data: [
          {
            email: 'test-integration-list-1@example.com',
            displayName: 'User 1',
            passwordHash: 'test-hash',
          },
          {
            email: 'test-integration-list-2@example.com',
            displayName: 'User 2',
            passwordHash: 'test-hash',
          },
          {
            email: 'test-integration-list-3@example.com',
            displayName: 'User 3',
            passwordHash: 'test-hash',
          },
        ],
      });

      // 取得
      const users = await prisma.user.findMany({
        where: {
          email: {
            contains: 'test-integration-list',
          },
        },
        orderBy: {
          email: 'asc',
        },
      });

      expect(users).toHaveLength(3);
      expect(users[0]?.email).toBe('test-integration-list-1@example.com');
      expect(users[1]?.email).toBe('test-integration-list-2@example.com');
      expect(users[2]?.email).toBe('test-integration-list-3@example.com');
    });
  });

  describe('Database Constraints', () => {
    it('重複したメールアドレスでユーザーを作成できないこと', async () => {
      const email = 'test-integration-duplicate@example.com';

      // 1人目のユーザー作成
      await prisma.user.create({
        data: { email, displayName: 'User 1', passwordHash: 'test-hash' },
      });

      // 2人目のユーザー作成（同じメールアドレス）
      await expect(
        prisma.user.create({
          data: { email, displayName: 'User 2', passwordHash: 'test-hash' },
        })
      ).rejects.toThrow();
    });

    it('メールアドレスが必須であること', async () => {
      await expect(
        prisma.user.create({
          // @ts-expect-error Testing missing required field
          data: { displayName: 'No Email User', passwordHash: 'test-hash' },
        })
      ).rejects.toThrow();
    });
  });

  describe('Database Connection', () => {
    it('データベースに接続できること', async () => {
      const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
      expect(result[0]?.result).toBe(1);
    });

    it('トランザクションが正常に動作すること', async () => {
      const email1 = 'test-integration-tx-1@example.com';
      const email2 = 'test-integration-tx-2@example.com';

      await prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: { email: email1, displayName: 'TX User 1', passwordHash: 'test-hash' },
        });

        await tx.user.create({
          data: { email: email2, displayName: 'TX User 2', passwordHash: 'test-hash' },
        });
      });

      const users = await prisma.user.findMany({
        where: {
          email: {
            in: [email1, email2],
          },
        },
      });

      expect(users).toHaveLength(2);
    });

    it('トランザクションロールバックが正常に動作すること', async () => {
      const email1 = 'test-integration-rollback-1@example.com';
      const email2 = 'test-integration-rollback-2@example.com';

      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: { email: email1, displayName: 'Rollback User 1', passwordHash: 'test-hash' },
          });

          // 意図的にエラーを発生させる（重複メール）
          await tx.user.create({
            data: { email: email1, displayName: 'Duplicate Email', passwordHash: 'test-hash' },
          });
        });
      } catch {
        // エラーを無視
      }

      // トランザクションがロールバックされたことを確認
      const user1 = await prisma.user.findUnique({
        where: { email: email1 },
      });

      const user2 = await prisma.user.findUnique({
        where: { email: email2 },
      });

      expect(user1).toBeNull();
      expect(user2).toBeNull();
    });
  });
});
