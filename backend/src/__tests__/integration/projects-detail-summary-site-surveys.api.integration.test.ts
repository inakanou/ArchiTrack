/**
 * @fileoverview プロジェクト詳細サマリ 現場調査セクションと個別APIの互換性の統合テスト
 *
 * Task 72.2: detail-summary の現場調査セクションに、個別API
 * （`GET /api/projects/:projectId/site-surveys/latest`）が返す `annotatedThumbnailUrl` が
 * 欠けており、レスポンスの形が個別APIと一致していなかった。
 *
 * Requirements (project-management):
 * - REQ-29.6: 一括取得APIのレスポンス形式を、既存の個別APIと互換性のあるデータ構造で提供する
 *
 * Scope:
 * - 同じプロジェクトについて、detail-summary の `sections.siteSurveys` と
 *   個別API `/site-surveys/latest` の応答が、キーの集合も値も一致する。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

describe('Project Detail Summary - Site Surveys Section Compatibility Integration Tests', () => {
  let prisma: PrismaClient;
  let projectId: string;
  let accessToken: string;

  const PROJECT_NAME = 'Detail Summary SS Compatibility Project';
  const TEST_EMAIL = 'test-detail-summary-ss-integration@example.com';

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash('TestPassword123!@#', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, displayName: 'Detail Summary SS Test User', passwordHash },
    });
    const role = await prisma.role.findUnique({ where: { name: 'user' } });
    if (role) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: TEST_EMAIL,
      password: 'TestPassword123!@#',
    });
    accessToken = loginResponse.body.accessToken;

    const project = await prisma.project.create({
      data: { name: PROJECT_NAME, salesPersonId: user.id, createdById: user.id },
    });
    projectId = project.id;

    await prisma.siteSurvey.createMany({
      data: [
        { projectId, name: '互換性検証の現場調査1', surveyDate: new Date('2026-01-01') },
        { projectId, name: '互換性検証の現場調査2', surveyDate: new Date('2026-01-02') },
      ],
    });
  });

  afterAll(async () => {
    await prisma.siteSurvey.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { name: PROJECT_NAME } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('rl:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  /**
   * @requirement project-management/REQ-29.6
   */
  it('detail-summary の siteSurveys が個別API /site-surveys/latest と同じ形・同じ値で返る (project-management/REQ-29.6)', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };

    const summaryResponse = await request(app)
      .get(`/api/projects/${projectId}/detail-summary`)
      .set(auth);
    const latestResponse = await request(app)
      .get(`/api/projects/${projectId}/site-surveys/latest`)
      .set(auth);

    expect(summaryResponse.status).toBe(200);
    expect(latestResponse.status).toBe(200);

    const fromSummary = summaryResponse.body.sections.siteSurveys;
    const fromLatest = latestResponse.body;

    // 前提: 比べる現場調査が実在する（空配列どうしの一致は互換の証明にならない）
    expect(fromLatest.latestSurveys.length).toBe(2);

    for (const survey of fromSummary.latestSurveys) {
      expect(Object.keys(survey)).toContain('annotatedThumbnailUrl');
    }
    expect(fromSummary).toEqual(fromLatest);
  });
});
