/**
 * @fileoverview 現場調査・画像・注釈への案件の閲覧範囲の適用の E2E テスト
 *
 * site-survey タスク119.1。design.md の「Requirement 39: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。画像の表示元URL（原画像・サムネイル・注釈付き
 * サムネイル）は範囲内に限って発行する。
 *
 * Requirements coverage (site-survey):
 * - REQ-39.1: 営業担当者・作成者、全案件閲覧の権限（project:read_all）を持つ利用者は、現場調査とその画像・注釈を
 *   従来どおり閲覧・操作できる（ロール名でなく権限で判定する）
 * - REQ-39.2: 担当外の利用者が現場調査の URL を直接開くと存在しない現場調査と同じ表示になり、ID 指定の
 *   閲覧・更新・削除は 404 で、データは変わらない
 * - REQ-39.3: 範囲外の 404 の本文は存在しない場合の本文と（要求の経路を写す `instance` を除いて）一致し、
 *   プロジェクトID を含まない
 * - REQ-39.4: 画像の一括更新の対象に範囲外の画像が混じると要求全体が 404 になってどの画像も変わらず、
 *   注釈の一括取得では範囲外の画像の注釈が返らない
 * - REQ-39.5: 担当外の利用者には、現場調査の一覧・直近の件数・プロジェクトの写真一覧が返らない
 *   （本機能の一覧・件数はどれもプロジェクト単位で、案件をまたぐ一覧・件数の経路は無い）
 * - REQ-39.6: 範囲内の利用者には 3 種の表示元URLが発行され、範囲外の利用者にはどれも発行されない
 *
 * 検証に使う案件・現場調査・画像はテストの中で DB に作り（名前の接頭辞 `PROJECT_NAME_PREFIX`）、
 * 画像の実体は置かない（テスト環境のローカルストレージは実体の有無を問わず表示元URLを発行する）。
 * 利用者はテストの中で作る一意のメールアドレスの利用者で、後始末で案件を先に消してから利用者を消す
 * （案件が営業担当者・作成者として利用者を参照し、外部キーが Restrict のため）。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createCustomUser,
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す。現場調査・画像・注釈は案件の削除に連なって消える） */
const PROJECT_NAME_PREFIX = 'e2e-survey-scope-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-survey-scope-role-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000119101';

interface Fixture {
  projectId: string;
  surveyId: string;
  surveyName: string;
  imageId: string;
}

interface ImageWithUrls {
  id: string;
  originalUrl: string | null;
  thumbnailUrl: string | null;
  annotatedThumbnailUrl: string | null;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・現場調査・画像 1 枚・注釈を DB に作る */
async function createFixture(
  label: string,
  people: { salesPersonId: string; createdById: string }
): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = uniqueSuffix();
  const project = await prisma.project.create({
    data: {
      name: `${PROJECT_NAME_PREFIX}${label}-${suffix}`,
      salesPersonId: people.salesPersonId,
      createdById: people.createdById,
    },
    select: { id: true },
  });
  const surveyName = `閲覧範囲検証の現場調査 ${label}-${suffix}`;
  const survey = await prisma.siteSurvey.create({
    data: {
      projectId: project.id,
      name: surveyName,
      surveyDate: new Date('2026-10-27'),
      memo: 'before',
    },
    select: { id: true },
  });
  const image = await prisma.surveyImage.create({
    data: {
      surveyId: survey.id,
      originalPath: `surveys/${survey.id}/original.jpg`,
      thumbnailPath: `surveys/${survey.id}/thumbnail.jpg`,
      annotatedThumbnailPath: `annotated-thumbnails/${survey.id}.jpg`,
      fileName: `${label}.jpg`,
      fileSize: 1024,
      width: 100,
      height: 100,
      displayOrder: 1,
      comment: 'before',
    },
    select: { id: true },
  });
  await prisma.imageAnnotation.create({
    data: {
      imageId: image.id,
      data: { version: '6.0.0', objects: [] },
      hasDrawnAnnotations: false,
    },
  });
  return { projectId: project.id, surveyId: survey.id, surveyName, imageId: image.id };
}

/** 対象の行の状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(fixture: Fixture): Promise<unknown> {
  const prisma = getPrismaClient();
  return {
    survey: await prisma.siteSurvey.findUniqueOrThrow({
      where: { id: fixture.surveyId },
      select: { name: true, memo: true, deletedAt: true, updatedAt: true },
    }),
    images: await prisma.surveyImage.findMany({
      where: { surveyId: fixture.surveyId },
      select: { id: true, comment: true, includeInReport: true, displayOrder: true },
      orderBy: { id: 'asc' },
    }),
    annotation: await prisma.imageAnnotation.findUnique({
      where: { imageId: fixture.imageId },
      select: { data: true, updatedAt: true },
    }),
  };
}

/** 権限を ID で引く（無ければ前提の誤りとして失敗する） */
async function permissionId(resource: string, action: string): Promise<string> {
  const permission = await getPrismaClient().permission.findFirst({
    where: { resource, action },
    select: { id: true },
  });
  if (!permission) {
    throw new Error(`権限 ${resource}:${action} が見つかりません（検証の前提の誤り）`);
  }
  return permission.id;
}

/** 指定の権限だけを持つロール（システムロールでない）を作り、そのロールの利用者を作る */
async function createUserWithPermissions(
  label: string,
  permissions: ReadonlyArray<readonly [string, string]>
): Promise<CreatedUser> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${label}-${uniqueSuffix()}`,
      description: `E2E 現場調査の閲覧範囲の検証（${label}）`,
      priority: 0,
      isSystem: false,
    },
    select: { id: true, name: true },
  });
  for (const [resource, action] of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}survey-scope-${label}-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: `現場調査の閲覧範囲検証 ${label}`,
    roles: [role.name],
  });
}

/** 現場調査の閲覧と全案件閲覧の権限を持つ利用者（ロール名は admin ではない） */
function createReadAllUser(): Promise<CreatedUser> {
  return createUserWithPermissions('read-all', [
    ['site_survey', 'read'],
    ['project', 'read'],
    ['project', 'read_all'],
  ]);
}

/** 利用者として API にログインし、Bearer のヘッダーを返す */
async function bearerFor(
  request: APIRequestContext,
  user: CreatedUser
): Promise<Record<string, string>> {
  const { accessToken } = await loginViaApi(request, user);
  expect(accessToken, `${user.email} のアクセストークン`).toBeTruthy();
  return { Authorization: `Bearer ${accessToken}` };
}

function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'instance'));
}

/** 現場調査の詳細の URL を直接開き、詳細の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openSurveyDetail(page: Page, surveyId: string): Promise<void> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/site-surveys/${surveyId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/site-surveys/${surveyId}`);
  await loaded;
}

test.describe('現場調査・画像・注釈の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    await prisma.project.deleteMany({ where: { name: { startsWith: PROJECT_NAME_PREFIX } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement site-survey/REQ-39.1
   * @requirement site-survey/REQ-39.2
   * @requirement site-survey/REQ-39.3
   * @requirement site-survey/REQ-39.6
   */
  test('担当外の利用者が現場調査の URL を直接開くと存在しない現場調査と同じ表示になり、表示元URLも返らない', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const readAll = await createReadAllUser();
    const target = await createFixture('direct-url', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 対照: 関係者（営業担当者・作成者）は詳細を開け、3 種の表示元URLが発行される
    await loginAsUser(page, owner);
    await openSurveyDetail(page, target.surveyId);
    await expect(page.getByRole('heading', { name: target.surveyName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('alert')).toHaveCount(0);

    for (const user of [owner, readAll]) {
      const headers = await bearerFor(request, user);
      const images = await request.get(
        `${API_BASE_URL}/api/site-surveys/${target.surveyId}/images`,
        { headers }
      );
      expect(images.status(), `${user.email} の画像一覧`).toBe(200);
      const [image] = (await images.json()) as ImageWithUrls[];
      expect(image?.id).toBe(target.imageId);
      expect(image?.originalUrl, '原画像の表示元URL').toBeTruthy();
      expect(image?.thumbnailUrl, 'サムネイルの表示元URL').toBeTruthy();
      expect(image?.annotatedThumbnailUrl, '注釈付きサムネイルの表示元URL').toBeTruthy();
    }

    // 本体: 担当外の利用者は、存在しない現場調査を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    await openSurveyDetail(page, MISSING_ID);
    const missingAlert = page.getByRole('alert');
    await expect(missingAlert).toBeVisible({ timeout: getTimeout(15000) });
    const missingText = await missingAlert.innerText();

    await openSurveyDetail(page, target.surveyId);
    const outOfScopeAlert = page.getByRole('alert');
    await expect(outOfScopeAlert).toBeVisible({ timeout: getTimeout(15000) });
    expect(await outOfScopeAlert.innerText(), '存在しない現場調査と同じ表示').toBe(missingText);
    await expect(page.getByText(target.surveyName)).toHaveCount(0);

    // API: 詳細・画像一覧・注釈は存在しない ID と同じ 404 の本文で、表示元URLもプロジェクトID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [`/api/site-surveys/${target.surveyId}`, `/api/site-surveys/${MISSING_ID}`],
      [`/api/site-surveys/${target.surveyId}/images`, `/api/site-surveys/${MISSING_ID}/images`],
      [
        `/api/site-surveys/images/${target.imageId}/annotations`,
        `/api/site-surveys/images/${MISSING_ID}/annotations`,
      ],
    ] as const) {
      const missing = await request.get(`${API_BASE_URL}${missingPath}`, { headers });
      const outOfScope = await request.get(`${API_BASE_URL}${outOfScopePath}`, { headers });
      expect(missing.status(), missingPath).toBe(404);
      expect(outOfScope.status(), outOfScopePath).toBe(404);
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(withoutInstance(body), outOfScopePath).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(withoutInstance(body)), outOfScopePath).not.toContain(target.projectId);
      expect(JSON.stringify(body), outOfScopePath).not.toContain('/storage');
    }
  });

  /**
   * @requirement site-survey/REQ-39.2
   * @requirement site-survey/REQ-39.3
   */
  test('担当外の利用者の更新・削除・注釈の保存は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 権限なしの 403 は範囲の判定より先に返るため、担当外の利用者には現場調査の更新・削除の権限を持たせる
    const outsider = await createUserWithPermissions('writer', [
      ['site_survey', 'read'],
      ['site_survey', 'update'],
      ['site_survey', 'delete'],
    ]);
    const target = await createFixture('write', { salesPersonId: owner.id, createdById: owner.id });
    const before = await snapshot(target);
    const survey = await getPrismaClient().siteSurvey.findUniqueOrThrow({
      where: { id: target.surveyId },
      select: { updatedAt: true },
    });
    const headers = await bearerFor(request, outsider);

    const responses = [
      await request.put(`${API_BASE_URL}/api/site-surveys/${target.surveyId}`, {
        headers,
        data: { memo: 'intrusion', expectedUpdatedAt: survey.updatedAt.toISOString() },
      }),
      await request.patch(`${API_BASE_URL}/api/site-surveys/images/${target.imageId}`, {
        headers,
        data: { comment: 'intrusion' },
      }),
      await request.put(`${API_BASE_URL}/api/site-surveys/images/${target.imageId}/annotations`, {
        headers,
        data: { data: { version: '6.0.0', objects: [] } },
      }),
      await request.delete(`${API_BASE_URL}/api/site-surveys/${target.surveyId}`, { headers }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(body))).not.toContain(target.projectId);
    }

    expect(await snapshot(target)).toEqual(before);
  });

  /**
   * @requirement site-survey/REQ-39.4
   */
  test('一括の要求に範囲外の画像を混ぜると、その画像のデータは返らず変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('batch-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('batch-foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeTarget = await snapshot(target);
    const beforeForeign = await snapshot(foreign);
    const headers = await bearerFor(request, owner);

    // 画像の一括更新: 範囲外の画像が混じると、存在しない画像が混じった場合と同じ 404 で、何も変わらない
    const missing = await request.patch(`${API_BASE_URL}/api/site-surveys/images/batch`, {
      headers,
      data: {
        updates: [
          { id: target.imageId, comment: 'mixed' },
          { id: MISSING_ID, comment: 'mixed' },
        ],
      },
    });
    const mixed = await request.patch(`${API_BASE_URL}/api/site-surveys/images/batch`, {
      headers,
      data: {
        updates: [
          { id: target.imageId, comment: 'mixed' },
          { id: foreign.imageId, comment: 'mixed' },
        ],
      },
    });
    expect(missing.status()).toBe(404);
    expect(mixed.status()).toBe(404);
    const mixedBody = (await mixed.json()) as Record<string, unknown>;
    expect(withoutInstance(mixedBody)).toEqual(
      withoutInstance((await missing.json()) as Record<string, unknown>)
    );
    expect(JSON.stringify(mixedBody)).not.toContain(foreign.imageId);
    expect(await snapshot(target)).toEqual(beforeTarget);
    expect(await snapshot(foreign)).toEqual(beforeForeign);

    // 注釈の一括取得: 範囲外の画像の注釈は返らない（範囲内の画像の注釈は返る）
    const batch = await request.post(`${API_BASE_URL}/api/site-surveys/annotations/batch`, {
      headers,
      data: { surveyId: target.surveyId, imageIds: [target.imageId, foreign.imageId] },
    });
    expect(batch.status()).toBe(200);
    const { annotations } = (await batch.json()) as { annotations: Record<string, unknown> };
    expect(annotations[target.imageId]).not.toBeNull();
    expect(annotations[foreign.imageId]).toBeNull();

    // 範囲外の現場調査を指定した注釈の一括取得は、存在しない現場調査と同じ 404
    const foreignSurvey = await request.post(`${API_BASE_URL}/api/site-surveys/annotations/batch`, {
      headers,
      data: { surveyId: foreign.surveyId, imageIds: [foreign.imageId] },
    });
    expect(foreignSurvey.status()).toBe(404);
    expect(((await foreignSurvey.json()) as { annotations?: unknown }).annotations).toBeUndefined();
  });

  /**
   * @requirement site-survey/REQ-39.1
   * @requirement site-survey/REQ-39.5
   */
  test('担当外の利用者には現場調査の一覧・直近の件数・写真一覧が返らず、関係者と全案件閲覧の権限の利用者には返る', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const readAll = await createReadAllUser();
    const target = await createFixture('list', { salesPersonId: owner.id, createdById: owner.id });

    for (const user of [owner, readAll]) {
      const headers = await bearerFor(request, user);
      const list = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/site-surveys`,
        { headers }
      );
      expect(list.status(), `${user.email} の一覧`).toBe(200);
      const listed = (await list.json()) as { data: Array<{ id: string }> };
      expect(listed.data.map((s) => s.id)).toEqual([target.surveyId]);

      const latest = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/site-surveys/latest`,
        { headers }
      );
      expect(latest.status()).toBe(200);
      expect(((await latest.json()) as { totalCount: number }).totalCount).toBe(1);

      const photos = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/survey-images`,
        { headers }
      );
      expect(photos.status()).toBe(200);
      const photoList = (await photos.json()) as { images: Array<{ id: string }> };
      expect(photoList.images.map((i) => i.id)).toEqual([target.imageId]);
    }

    const headers = await bearerFor(request, outsider);
    for (const suffix of ['site-surveys', 'site-surveys/latest', 'survey-images']) {
      const missing = await request.get(`${API_BASE_URL}/api/projects/${MISSING_ID}/${suffix}`, {
        headers,
      });
      const outOfScope = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/${suffix}`,
        { headers }
      );
      expect(missing.status(), suffix).toBe(404);
      expect(outOfScope.status(), suffix).toBe(404);
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(withoutInstance(body), suffix).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(body), suffix).not.toContain(target.surveyId);
    }

    // 画面: 担当外の利用者が現場調査一覧の URL を開いても現場調査の行は出ない
    await loginAsUser(page, outsider);
    const listed = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/projects/${target.projectId}/site-surveys`,
      { timeout: getTimeout(30000) }
    );
    await page.goto(`/projects/${target.projectId}/site-surveys`);
    expect((await listed).status()).toBe(404);
    await expect(page.getByText(target.surveyName)).toHaveCount(0);
  });
});
