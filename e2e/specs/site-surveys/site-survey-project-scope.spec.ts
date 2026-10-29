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
 * タスク120.1 で、画面が 404 を受けたときの表示（Requirement 40.1・40.2）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、取得・操作の
 * 失敗を告げる文言、応答の英語の文言と再試行の釦を出さない。被覆する受入基準は各テストの `@requirement` の印が
 * 名乗る。
 *
 * 検証に使う案件・現場調査・画像はテストの中で DB に作り（名前の接頭辞 `PROJECT_NAME_PREFIX`）、
 * 画像の実体は置かない（テスト環境のローカルストレージは実体の有無を問わず表示元URLを発行する）。
 * 利用者はテストの中で作る一意のメールアドレスの利用者で、後始末で案件を先に消してから利用者を消す
 * （案件が営業担当者・作成者として利用者を参照し、外部キーが Restrict のため）。
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** 実体のある画像を置くためのアップロード用フィクスチャ画像（注釈の編集の画面は画像の実体を読む） */
const FIXTURE_IMAGE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/test-image.jpg'
);

/** 見つからない旨のメッセージ（タスク120.1。design.md の Requirement 40 の章の決定の逐語） */
const SURVEY_GONE = '現場調査が見つかりません。存在しないか、削除されています。';
const PROJECT_GONE = 'プロジェクトが見つかりません。存在しないか、削除されています。';
const IMAGE_GONE = '画像が見つかりません。存在しないか、削除されています。';
const SURVEY_OR_IMAGE_GONE = '現場調査または画像が見つかりません。存在しないか、削除されています。';

/** 現場調査の画面が 404 を受けたときに出してはならない、障害を告げる文言（タスク120.1） */
const FAILURE_TEXTS = [
  '現場調査の取得に失敗しました',
  'データの取得に失敗しました',
  'プロジェクトの取得に失敗しました',
  '保存に失敗しました',
  '削除に失敗しました',
  '画像の削除に失敗しました',
  '作成中にエラーが発生しました',
  '現場調査の更新に失敗しました',
  '注釈の保存に失敗しました',
  '保存された注釈データがありません。先に保存してください。',
  'PDF生成に失敗しました。再度お試しください。',
] as const;

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

/** 画面の URL を直接開き、指定のパスの GET の応答の状態を返す（オリジンは問わずパスで照合する） */
async function openAndWait(page: Page, url: string, apiPath: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === apiPath,
    { timeout: getTimeout(30000) }
  );
  await page.goto(url);
  return (await loaded).status();
}

/**
 * 読み込み中の表示が消えた後の、本文の領域の表示の文字列。
 * 現場調査の画面は共通の枠の main の内側に自分の main を置くため、内側（文書の順で後ろ）を読む
 */
async function settledMainText(page: Page): Promise<string> {
  const main = page.getByRole('main').last();
  await expect(main.getByText('読み込み中...')).toHaveCount(0, { timeout: getTimeout(15000) });
  return main.innerText();
}

/** 障害を告げる文言・サーバーエラーの理由・応答の英語の文言が画面のどこにも無いことを主張する */
async function expectNoFailureFeedback(page: Page): Promise<void> {
  for (const text of FAILURE_TEXTS) {
    await expect(page.getByText(text, { exact: true }), text).toHaveCount(0);
  }
  await expect(page.getByText(/サーバーエラー|再度お試しください|not found/i)).toHaveCount(0);
}

/** 不在の表示（ResourceNotFound）。戻り先はプロジェクトの一覧で、再試行の釦を出さない */
async function expectNotFoundView(page: Page, resourceType: '現場調査' | 'プロジェクト') {
  const main = page.getByRole('main').last();
  await expect(main.getByRole('heading', { name: `${resourceType}が見つかりません` })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(main.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
  await expectNoFailureFeedback(page);
}

/** 実体のある画像を 1 枚アップロードし、その ID を返す */
async function uploadRealImage(
  request: APIRequestContext,
  headers: Record<string, string>,
  surveyId: string,
  fileName: string
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/site-surveys/${surveyId}/images`, {
    headers,
    multipart: {
      images: {
        name: fileName,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_IMAGE_PATH),
      },
    },
  });
  expect(response.ok(), `前提: 画像のアップロードが成功する (status=${response.status()})`).toBe(
    true
  );
  const body = (await response.json()) as { successful?: Array<{ id: string }> };
  const imageId = body.successful?.[0]?.id;
  if (!imageId) {
    throw new Error('前提: アップロードした画像の ID が返らない（検証の前提の誤り）');
  }
  return imageId;
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
    // タスク120.1: 表示は不在の表示（ResourceNotFound。role="alert" を持たない）になったため、本文の領域の
    // 見つからない旨の表示どうしを比べる
    await openSurveyDetail(page, MISSING_ID);
    await expectNotFoundView(page, '現場調査');
    const missingText = await settledMainText(page);
    expect(missingText.trim().length, '存在しない現場調査の表示がある').toBeGreaterThan(0);

    await openSurveyDetail(page, target.surveyId);
    await expectNotFoundView(page, '現場調査');
    expect(await settledMainText(page), '存在しない現場調査と同じ表示').toBe(missingText);
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

  /**
   * 詳細・編集の画面は現場調査の読み込みの 404 で、一覧・新規作成の画面はプロジェクトの読み込みの 404 で、
   * 見つからない旨とプロジェクトの一覧へのリンクを表示する。画像の閲覧と編集の画面は画像が見つからない旨と
   * 現場調査への戻り先のリンクを表示する（site-survey タスク120.1）。範囲外と不在は同じ表示。
   *
   * @requirement site-survey/REQ-40.1
   */
  test('担当外の利用者が現場調査の画面の URL を開くと見つからない旨と戻り先のリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    await loginAsUser(page, outsider);

    // 詳細の画面と編集の画面: 現場調査が見つからない旨と、プロジェクトの一覧へのリンク
    for (const suffix of ['', '/edit']) {
      expect(
        await openAndWait(
          page,
          `/site-surveys/${MISSING_ID}${suffix}`,
          `/api/site-surveys/${MISSING_ID}`
        )
      ).toBe(404);
      await expectNotFoundView(page, '現場調査');
      const missingText = await settledMainText(page);
      expect(
        await openAndWait(
          page,
          `/site-surveys/${target.surveyId}${suffix}`,
          `/api/site-surveys/${target.surveyId}`
        )
      ).toBe(404);
      await expectNotFoundView(page, '現場調査');
      expect(await settledMainText(page), `存在しない現場調査と同じ表示（${suffix}）`).toBe(
        missingText
      );
      await expect(page.getByText(target.surveyName)).toHaveCount(0);
    }

    // 一覧の画面と新規作成の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク
    for (const [suffix, apiSuffix] of [
      ['', '/site-surveys'],
      ['/new', ''],
    ] as const) {
      expect(
        await openAndWait(
          page,
          `/projects/${MISSING_ID}/site-surveys${suffix}`,
          `/api/projects/${MISSING_ID}${apiSuffix}`
        )
      ).toBe(404);
      await expectNotFoundView(page, 'プロジェクト');
      const missingText = await settledMainText(page);
      expect(
        await openAndWait(
          page,
          `/projects/${target.projectId}/site-surveys${suffix}`,
          `/api/projects/${target.projectId}${apiSuffix}`
        )
      ).toBe(404);
      await expectNotFoundView(page, 'プロジェクト');
      expect(await settledMainText(page), `存在しないプロジェクトと同じ表示（${suffix}）`).toBe(
        missingText
      );
      await expect(page.getByText(target.surveyName)).toHaveCount(0);
    }
    // 新規作成の画面は作成の手段を出さない
    await expect(page.getByRole('button', { name: '作成', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('調査名')).toHaveCount(0);

    // 画像の閲覧と編集の画面: 画像が見つからない旨と、現場調査への戻り先のリンク
    expect(
      await openAndWait(
        page,
        `/site-surveys/${MISSING_ID}/images/${MISSING_ID}`,
        `/api/site-surveys/${MISSING_ID}`
      )
    ).toBe(404);
    const viewerMain = page.getByRole('main').last();
    await expect(viewerMain.getByRole('heading', { name: '画像が見つかりません' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const missingViewerText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/site-surveys/${target.surveyId}/images/${target.imageId}`,
        `/api/site-surveys/${target.surveyId}`
      )
    ).toBe(404);
    await expect(viewerMain.getByRole('heading', { name: '画像が見つかりません' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(viewerMain.getByRole('link', { name: '前の画面に戻る' })).toHaveAttribute(
      'href',
      `/site-surveys/${target.surveyId}`
    );
    expect(await settledMainText(page), '存在しない画像と同じ表示').toBe(missingViewerText);
    await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
    await expectNoFailureFeedback(page);
  });

  /**
   * 開いた後に画像が削除される、または現場調査（作成ではプロジェクト）が論理的に取り除かれると、操作の要求は
   * 404 を受ける。画面は見つからない旨のメッセージを従来の失敗の表示の場所に表示し、操作の失敗を告げる汎用の
   * 文言、サーバーエラーである旨や応答の英語の文言を出さない（site-survey タスク120.1）。注釈の保存の再試行の
   * 導線（9.5）とアップロードに失敗した画像の保持（37）は保つ。
   *
   * @requirement site-survey/REQ-40.2
   */
  test('開いた後に削除された画像・取り除かれた現場調査とプロジェクトへの操作で、見つからない旨のメッセージが表示される', async ({
    page,
    request,
  }) => {
    test.setTimeout(getTimeout(180000));
    // 画像と現場調査の削除の釦はシステム管理者のロールで出るため、システム管理者を営業担当者・作成者にする
    const owner = await createSessionUser('ADMIN_USER');
    const people = { salesPersonId: owner.id, createdById: owner.id };
    const detailTarget = await createFixture('gone-detail', people);
    const editTarget = await createFixture('gone-edit', people);
    const createTarget = await createFixture('gone-create', people);
    const prisma = getPrismaClient();
    const headers = await bearerFor(request, owner);
    /** 指定の方法とパスの要求の応答を待つ（オリジンは問わずパスで照合する） */
    const responseOf = (method: string, pathname: string) =>
      page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname === pathname,
        { timeout: getTimeout(60000) }
      );

    // 詳細の画面の画像の削除と画像の情報の保存に使う 2 枚目の画像（実体は要らない）。報告書の出力の対象にする
    const secondImage = await prisma.surveyImage.create({
      data: {
        surveyId: detailTarget.surveyId,
        originalPath: `surveys/${detailTarget.surveyId}/second.jpg`,
        thumbnailPath: `surveys/${detailTarget.surveyId}/second-thumbnail.jpg`,
        fileName: 'gone-second.jpg',
        fileSize: 1024,
        width: 100,
        height: 100,
        displayOrder: 2,
      },
      select: { id: true },
    });
    await prisma.surveyImage.updateMany({
      where: { surveyId: detailTarget.surveyId },
      data: { includeInReport: true },
    });
    // 注釈の編集の画面は画像の実体を読むため、実体のある画像を 1 枚置く
    const realImageId = await uploadRealImage(
      request,
      headers,
      detailTarget.surveyId,
      'gone-annotation.jpg'
    );
    await loginAsUser(page, owner);

    // --- 注釈の保存（従来は応答の英語の文言）。開いた後に画像を削除する。再試行の導線は保つ ---
    expect(
      await openAndWait(
        page,
        `/site-surveys/${detailTarget.surveyId}/images/${realImageId}`,
        `/api/site-surveys/${detailTarget.surveyId}`
      )
    ).toBe(200);
    await page.getByRole('button', { name: '編集モード', exact: true }).click();
    await expect(page.getByTestId('annotation-toolbar')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await prisma.surveyImage.delete({ where: { id: realImageId } });
    const annotationSaved = responseOf(
      'PUT',
      `/api/site-surveys/images/${realImageId}/annotations`
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await annotationSaved).status()).toBe(404);
    const annotationError = page.getByTestId('annotation-save-error');
    await expect(annotationError).toContainText(IMAGE_GONE, { timeout: getTimeout(10000) });
    await expect(page.getByTestId('save-retry-button')).toBeVisible();
    await expectNoFailureFeedback(page);

    // --- 注釈の JSON の出力（従来は保存された注釈データが無い旨）。記録は成功し、取得が 404 を受ける ---
    await page.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const exportDialog = page.getByRole('dialog');
    await expect(exportDialog).toBeVisible({ timeout: getTimeout(10000) });
    const recorded = responseOf('POST', '/api/v1/audit-logs/exports');
    const exported = responseOf(
      'GET',
      `/api/site-surveys/images/${realImageId}/annotations/export`
    );
    await exportDialog
      .getByRole('button', { name: '注釈データ(JSON)をダウンロード', exact: true })
      .click();
    expect((await recorded).status()).toBe(201);
    expect((await exported).status()).toBe(404);
    await expect(annotationError).toHaveText(IMAGE_GONE, { timeout: getTimeout(10000) });
    // 出力の失敗の分岐は再試行の導線を外す（saveFailed: false）。直前の保存の失敗の表示が残っているだけでは
    // この主張は成り立たないため、出力の側が表示を置き換えたことを確かめる
    await expect(page.getByTestId('save-retry-button')).toHaveCount(0);
    await expectNoFailureFeedback(page);

    // --- 詳細の画面の画像の削除（従来は応答の英語の文言）。開いた後に画像を削除する ---
    expect(
      await openAndWait(
        page,
        `/site-surveys/${detailTarget.surveyId}`,
        `/api/site-surveys/${detailTarget.surveyId}`
      )
    ).toBe(200);
    const panelItems = page.getByTestId('photo-panel-item');
    await expect(panelItems).toHaveCount(2, { timeout: getTimeout(15000) });
    await prisma.surveyImage.delete({ where: { id: secondImage.id } });
    await page.getByRole('button', { name: '画像を削除: gone-second.jpg' }).click();
    const imageDeleted = responseOf('DELETE', `/api/site-surveys/images/${secondImage.id}`);
    await page.getByRole('button', { name: '削除する', exact: true }).click();
    expect((await imageDeleted).status()).toBe(404);
    const detailError = page.getByTestId('site-survey-detail-error');
    await expect(detailError).toHaveText(IMAGE_GONE, { timeout: getTimeout(10000) });
    await expect(detailError).toHaveAttribute('role', 'alert');
    await expectNoFailureFeedback(page);
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();

    // --- 画像の情報の保存（従来は応答の英語の文言）。コメントを変えた後に、その画像を削除する ---
    const firstComment = panelItems.first().getByRole('textbox', { name: 'コメント' });
    await firstComment.fill('削除された後の変更');
    await prisma.surveyImage.delete({ where: { id: detailTarget.imageId } });
    const metadataSaved = responseOf('PATCH', '/api/site-surveys/images/batch');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await metadataSaved).status()).toBe(404);
    await expect(detailError).toHaveText(SURVEY_OR_IMAGE_GONE, { timeout: getTimeout(10000) });
    await expectNoFailureFeedback(page);

    // ここから現場調査を論理的に取り除く（開いた画面はそのまま）
    await prisma.siteSurvey.update({
      where: { id: detailTarget.surveyId },
      data: { deletedAt: new Date() },
    });

    // --- 画像のアップロード（従来は失敗の理由をサーバーエラーと表示）。全件の失敗の構成と保持を保つ ---
    const uploaded = responseOf('POST', `/api/site-surveys/${detailTarget.surveyId}/images`);
    await page.getByTestId('file-input').setInputFiles({
      name: 'gone-upload.jpg',
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_IMAGE_PATH),
    });
    expect((await uploaded).status()).toBe(404);
    await expect(detailError).toContainText('全1件のアップロードに失敗しました。', {
      timeout: getTimeout(20000),
    });
    await expect(detailError).toContainText(`gone-upload.jpg: ${SURVEY_GONE}`);
    await expect(page.getByTestId('pending-upload-reason')).toHaveText(SURVEY_GONE, {
      timeout: getTimeout(20000),
    });
    await expectNoFailureFeedback(page);

    // --- 調査報告書の PDF の出力（従来は生成の失敗と再度の試行を促す文言）。記録は成功し、取り直しが 404 ---
    const reportRecorded = responseOf('POST', '/api/v1/audit-logs/exports');
    const refetched = responseOf('GET', `/api/site-surveys/${detailTarget.surveyId}`);
    await page.getByRole('button', { name: '調査報告書出力', exact: true }).click();
    expect((await reportRecorded).status()).toBe(201);
    expect((await refetched).status()).toBe(404);
    // 詳細の画面の上のエラーの欄にも直前のアップロードの理由として同じ文言が出ているため、報告書の出力の
    // エラーの欄そのものを完全一致で主張する
    await expect(page.getByTestId('site-survey-report-export-error')).toHaveText(SURVEY_GONE, {
      timeout: getTimeout(20000),
    });
    await expectNoFailureFeedback(page);

    // --- 現場調査の削除（従来は応答の英語の文言） ---
    await page.getByRole('button', { name: '削除', exact: true }).click();
    const surveyDeleted = responseOf('DELETE', `/api/site-surveys/${detailTarget.surveyId}`);
    await page.getByRole('button', { name: '削除する', exact: true }).click();
    expect((await surveyDeleted).status()).toBe(404);
    await expect(detailError).toHaveText(SURVEY_GONE, { timeout: getTimeout(10000) });
    await expectNoFailureFeedback(page);

    // --- 編集の画面の更新（従来は応答の英語の文言）。開いた後に現場調査を論理的に取り除く ---
    expect(
      await openAndWait(
        page,
        `/site-surveys/${editTarget.surveyId}/edit`,
        `/api/site-surveys/${editTarget.surveyId}`
      )
    ).toBe(200);
    await expect(page.getByRole('heading', { name: '現場調査を編集' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await prisma.siteSurvey.update({
      where: { id: editTarget.surveyId },
      data: { deletedAt: new Date() },
    });
    const updated = responseOf('PUT', `/api/site-surveys/${editTarget.surveyId}`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await updated).status()).toBe(404);
    await expect(
      page.getByRole('main').last().getByRole('alert').filter({ hasText: SURVEY_GONE })
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/site-surveys/${editTarget.surveyId}/edit$`));
    await expectNoFailureFeedback(page);

    // --- 新規作成の画面の作成（従来は応答の英語の文言）。開いた後にプロジェクトを論理削除する ---
    expect(
      await openAndWait(
        page,
        `/projects/${createTarget.projectId}/site-surveys/new`,
        `/api/projects/${createTarget.projectId}`
      )
    ).toBe(200);
    await expect(page.getByRole('heading', { name: '新規現場調査' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await prisma.project.update({
      where: { id: createTarget.projectId },
      data: { deletedAt: new Date() },
    });
    const created = responseOf('POST', `/api/projects/${createTarget.projectId}/site-surveys`);
    await page.getByRole('button', { name: '作成', exact: true }).click();
    expect((await created).status()).toBe(404);
    await expect(
      page.getByRole('main').last().getByRole('alert').filter({ hasText: PROJECT_GONE })
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(
      new RegExp(`/projects/${createTarget.projectId}/site-surveys/new$`)
    );
    await expectNoFailureFeedback(page);
    expect(
      await prisma.siteSurvey.count({ where: { projectId: createTarget.projectId } }),
      '作成されない（fixture の 1 件のまま）'
    ).toBe(1);
  });
});
