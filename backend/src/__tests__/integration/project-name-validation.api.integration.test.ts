/**
 * @fileoverview プロジェクト名の制約を本番の経路で確かめる統合テスト
 *
 * 本番の入口（`backend/src/index.ts`）が起動する Express アプリ（`backend/src/app.ts`）を
 * supertest で直接駆動する。要求は本番と同じ経路
 * （`app.ts` → `routes/projects.routes.ts` → `middleware/validate.middleware.ts` →
 * `schemas/project.schema.ts`）を通るため、ここでの観測は本番到達モジュールの振る舞いである。
 *
 * この受入基準は一つの番号だが、独立した三つの観測に分かれる。番号ではなく観測を数えること。
 *   1. 必須である（欄が無い場合と空文字の場合が拒否される）
 *   2. 下限は1文字（ちょうど1文字が受理される）
 *   3. 上限は255文字（ちょうど255文字が受理され、256文字は拒否される）
 * 制約は作成（POST /api/projects）と更新（PUT /api/projects/:id）の双方の入口に定義されて
 * いるため、両方の入口で同じ観測を行う。片方だけを見ると、もう片方の制約が消えても気づけない。
 *
 * Requirements (project-management):
 * - REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（アプリのモジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

/** 本テストが作るユーザー（他の統合テストと衝突しない接頭辞） */
const OWNER_EMAIL = 'test-project-name-validation-owner@example.com';
const SALES_EMAIL = 'test-project-name-validation-sales@example.com';
const PASSWORD = 'TestPassword123!';

/**
 * 下限ちょうど（1文字）
 *
 * 接頭辞を付けると1文字でなくなるため、観測の都合上ここだけ識別しやすい名前にできない。
 * 衝突を避けるため、他の検証が使わない字を選ぶ。
 */
const NAME_MIN_LENGTH = 'ヱ';
/** 上限ちょうど（255文字） */
const NAME_MAX_LENGTH = `p255-${'x'.repeat(250)}`;
/** 上限を1文字超える（256文字） */
const NAME_OVER_MAX_LENGTH = `p256-${'x'.repeat(251)}`;
/** 更新の入口を確かめるための土台 */
const NAME_UPDATE_BASE = 'test-project-name-validation-update-base';
/**
 * 更新で下限ちょうど（1文字）へ書き換えた結果
 *
 * 作成の下限と別の字にするのは、どちらの入口の観測が崩れたかを記録から見分けるため。
 */
const NAME_UPDATE_MIN_LENGTH = 'ヰ';
/** 更新で上限ちょうどへ書き換えた結果 */
const NAME_UPDATE_MAX_LENGTH = `u255-${'x'.repeat(250)}`;

const MANAGED_NAMES = [
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  NAME_OVER_MAX_LENGTH,
  NAME_UPDATE_BASE,
  NAME_UPDATE_MIN_LENGTH,
  NAME_UPDATE_MAX_LENGTH,
];

interface ValidationDetail {
  path: string;
  message: string;
  code: string;
}

/** 応答本文（RFC 7807）から、指定した欄に付いたバリデーション詳細を取り出す */
const detailsForField = (body: unknown, field: string): ValidationDetail[] => {
  const details = (body as { details?: ValidationDetail[] }).details;
  if (!Array.isArray(details)) return [];
  return details.filter((detail) => detail.path === field);
};

describe('プロジェクト名の制約（project-management/REQ-13.1）', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let salesPersonId: string;

  /**
   * 本テストが作ったプロジェクトを、関連レコードごと取り除く
   *
   * 名前の一覧だけで消すと、制約が壊れた状態で予期しない名前の記録が残り、
   * その外部キーで後片付けが止まる。本テスト専用の営業担当者を作り主体として使い、
   * 「この検証が作ったもの」を名前に依らず消す。
   */
  const cleanupProjects = async (): Promise<void> => {
    const salesUser = await prisma.user.findUnique({
      where: { email: SALES_EMAIL },
      select: { id: true },
    });
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { name: { in: MANAGED_NAMES } },
          ...(salesUser ? [{ salesPersonId: salesUser.id }] : []),
        ],
      },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length > 0) {
      await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.auditLog.deleteMany({
        where: { targetType: 'Project', targetId: { in: projectIds } },
      });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
  };

  /** 本テストが作ったユーザーを取り除く */
  const cleanupUsers = async (): Promise<void> => {
    const users = await prisma.user.findMany({
      where: { email: { in: [OWNER_EMAIL, SALES_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) return;
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  };

  /** 一般ユーザー（`user` ロール）を作る。ロールの権限は投入処理の定義をそのまま使う */
  const createUser = async (email: string, displayName: string): Promise<string> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });

    const user = await prisma.user.create({ data: { email, displayName, passwordHash } });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (!userRole) {
      throw new Error('user ロールが存在しない（投入処理の前提が崩れている）');
    }
    await prisma.userRole.create({ data: { userId: user.id, roleId: userRole.id } });

    return user.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    await cleanupProjects();
    await cleanupUsers();

    await createUser(OWNER_EMAIL, 'プロジェクト名検証ユーザー');
    salesPersonId = await createUser(SALES_EMAIL, '営業担当者');

    // ログインが回数制限に当たらないよう、直前に制限のキーを落とす
    const client = redis.getClient();
    if (client) {
      const rateLimitKeys = await client.keys('rl:*');
      if (rateLimitKeys.length > 0) {
        await client.del(...rateLimitKeys);
      }
    }

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: OWNER_EMAIL, password: PASSWORD })
      .expect(200);
    accessToken = loginResponse.body.accessToken;
  });

  // 作成の入口には同名の拒否があるため、各観測の前に本テストが作った分を取り除く
  beforeEach(async () => {
    await cleanupProjects();
  });

  afterAll(async () => {
    await cleanupProjects();
    await cleanupUsers();
    await prisma.$disconnect();
    await redis.disconnect();
  });

  /** 名前以外は正しい作成要求。名前だけを差し替えて観測する */
  const createProject = (name?: string) => {
    const body: Record<string, unknown> = { salesPersonId };
    if (name !== undefined) body.name = name;
    return request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
  };

  describe('作成の入口', () => {
    /**
     * 観測1: 必須である
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('名前の欄が無い作成要求を拒否すること', async () => {
      const before = await prisma.project.count({ where: { salesPersonId } });

      const response = await createProject(undefined).expect(400);

      expect(detailsForField(response.body, 'name').length).toBeGreaterThan(0);
      expect(await prisma.project.count({ where: { salesPersonId } })).toBe(before);
    });

    /**
     * 観測1: 必須である（0文字は下限を割る）
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('空文字の名前による作成要求を拒否すること', async () => {
      const before = await prisma.project.count({ where: { salesPersonId } });

      const response = await createProject('').expect(400);

      expect(detailsForField(response.body, 'name').length).toBeGreaterThan(0);
      expect(await prisma.project.count({ where: { salesPersonId } })).toBe(before);
    });

    /**
     * 観測2: 下限は1文字
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('ちょうど1文字の名前による作成要求を受理すること', async () => {
      expect(NAME_MIN_LENGTH).toHaveLength(1);

      const response = await createProject(NAME_MIN_LENGTH).expect(201);

      expect(response.body.name).toBe(NAME_MIN_LENGTH);
      const stored = await prisma.project.findUnique({ where: { id: response.body.id } });
      expect(stored?.name).toBe(NAME_MIN_LENGTH);
    });

    /**
     * 観測3: 上限は255文字（境界の内側）
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('ちょうど255文字の名前による作成要求を受理すること', async () => {
      expect(NAME_MAX_LENGTH).toHaveLength(255);

      const response = await createProject(NAME_MAX_LENGTH).expect(201);

      expect(response.body.name).toBe(NAME_MAX_LENGTH);
      const stored = await prisma.project.findUnique({ where: { id: response.body.id } });
      expect(stored?.name).toHaveLength(255);
    });

    /**
     * 観測3: 上限は255文字（境界の外側）
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('256文字の名前による作成要求を拒否すること', async () => {
      expect(NAME_OVER_MAX_LENGTH).toHaveLength(256);

      const response = await createProject(NAME_OVER_MAX_LENGTH).expect(400);

      expect(detailsForField(response.body, 'name').length).toBeGreaterThan(0);
      expect(await prisma.project.count({ where: { name: NAME_OVER_MAX_LENGTH } })).toBe(0);
    });
  });

  describe('更新の入口', () => {
    /** 更新の土台を作り、その id と楽観的排他制御に使う日時を返す */
    const createUpdateBase = async (): Promise<{ id: string; expectedUpdatedAt: string }> => {
      const response = await createProject(NAME_UPDATE_BASE).expect(201);
      return { id: response.body.id, expectedUpdatedAt: response.body.updatedAt };
    };

    const updateName = (id: string, name: string, expectedUpdatedAt: string) =>
      request(app)
        .put(`/api/projects/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name, expectedUpdatedAt });

    /**
     * 観測1: 必須である（更新でも空文字へは落とせない）
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('空文字への更新要求を拒否し、元の名前を保つこと', async () => {
      const { id, expectedUpdatedAt } = await createUpdateBase();

      const response = await updateName(id, '', expectedUpdatedAt).expect(400);

      expect(detailsForField(response.body, 'name').length).toBeGreaterThan(0);
      const stored = await prisma.project.findUnique({ where: { id } });
      expect(stored?.name).toBe(NAME_UPDATE_BASE);
    });

    /**
     * 観測2: 下限は1文字（更新でも境界の内側は受理される）
     *
     * 空文字の拒否だけでは下限の上側が空く。下限が1から2へ動いても空文字は拒否されたままで、
     * 「1文字は通る」という約束が壊れたことに気づけない。受理されることに加えて、
     * その値が実際に記録へ入るところまで見る。拒否の不在は上側を固定しない。
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('ちょうど1文字への更新要求を受理し、その値が記録に入ること', async () => {
      expect(NAME_UPDATE_MIN_LENGTH).toHaveLength(1);
      const { id, expectedUpdatedAt } = await createUpdateBase();

      const response = await updateName(id, NAME_UPDATE_MIN_LENGTH, expectedUpdatedAt).expect(200);

      expect(response.body.name).toBe(NAME_UPDATE_MIN_LENGTH);
      const stored = await prisma.project.findUnique({ where: { id } });
      expect(stored?.name).toBe(NAME_UPDATE_MIN_LENGTH);
      expect(stored?.name).toHaveLength(1);
    });

    /**
     * 観測3: 上限は255文字（更新でも境界の内側は受理される）
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('ちょうど255文字への更新要求を受理すること', async () => {
      expect(NAME_UPDATE_MAX_LENGTH).toHaveLength(255);
      const { id, expectedUpdatedAt } = await createUpdateBase();

      const response = await updateName(id, NAME_UPDATE_MAX_LENGTH, expectedUpdatedAt).expect(200);

      expect(response.body.name).toBe(NAME_UPDATE_MAX_LENGTH);
      const stored = await prisma.project.findUnique({ where: { id } });
      expect(stored?.name).toHaveLength(255);
    });

    /**
     * 観測3: 上限は255文字（更新でも境界の外側は拒否される）
     *
     * @requirement project-management/REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
     */
    it('256文字への更新要求を拒否し、元の名前を保つこと', async () => {
      const { id, expectedUpdatedAt } = await createUpdateBase();

      const response = await updateName(id, NAME_OVER_MAX_LENGTH, expectedUpdatedAt).expect(400);

      expect(detailsForField(response.body, 'name').length).toBeGreaterThan(0);
      const stored = await prisma.project.findUnique({ where: { id } });
      expect(stored?.name).toBe(NAME_UPDATE_BASE);
    });
  });
});
