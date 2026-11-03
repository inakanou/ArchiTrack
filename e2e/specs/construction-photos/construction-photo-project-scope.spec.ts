/**
 * @fileoverview 工事写真アルバム・写真項目・工事看板への案件の閲覧範囲の適用の E2E テスト
 *
 * construction-photo タスク30.1・30.2。design.md の「Requirement 21: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。写真項目の画像の署名付きURL と原本・印字画像は範囲内に限る。
 *
 * Requirements coverage (construction-photo):
 * - REQ-21.1: 営業担当者・作成者、全案件閲覧の権限（project:read_all）を持つ利用者は、アルバム・写真項目・
 *   工事看板を従来どおり閲覧・操作できる（ロール名でなく権限で判定する）
 * - REQ-21.2: 担当外の利用者がアルバムの URL を直接開くと存在しないアルバムと同じ表示になり、ID 指定の
 *   閲覧・作成・更新は 404 で、データは変わらない
 * - REQ-21.3: 範囲外の 404 の本文は存在しない場合の本文と（要求の経路を写す `instance` を除いて）一致し、
 *   プロジェクトID を含まない
 * - REQ-21.4: メタデータの一括更新・表示順序の更新の対象に範囲外の写真項目が混じると要求全体が 404 になり、
 *   どの写真項目も変わらない
 * - REQ-21.5: 現場調査写真のコピーで、コピー元の現場調査写真またはコピー先のアルバムが範囲外なら 404 で、
 *   写真項目は作成されない
 * - REQ-21.6: 担当外の利用者には、アルバム一覧・工事看板一覧・写真項目一覧が返らず、一覧の画面にアルバムの行が出ない
 * - REQ-21.7: 範囲内の利用者には写真項目一覧・アルバム一覧の代表サムネイルの署名付きURLが発行され、原本・
 *   印字画像が返る。範囲外の利用者には署名付きURLも画像も返らない
 *
 * タスク31.1 で、画面が 404 を受けたときの表示（Requirement 22.1・22.2）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、取得・操作の
 * 失敗を告げる文言、応答の英語の文言と再試行の釦を出さない。被覆する受入基準は各テストの `@requirement` の印が
 * 名乗る。
 *
 * 検証に使う案件・アルバム・工事看板・現場調査写真はテストの中で DB に作り（名前の接頭辞 `PROJECT_NAME_PREFIX`）、
 * 写真項目は関係者が API でアップロードして作る（原本・印字画像・サムネイルを実ストレージに置くため）。
 * 現場調査写真は画像の実体を置かない（コピーは範囲の判定で拒否され、実体を読まない）。
 * 利用者はテストの中で作る一意のメールアドレスの利用者で、後始末で案件を先に消してから利用者を消す。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';
import { test, expect, type APIRequestContext, type Page, type Route } from '@playwright/test';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const PROJECT_NAME_PREFIX = 'e2e-photo-scope-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-photo-scope-role-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000030201';

/** 見つからない旨のメッセージ（タスク31.1。design.md の Requirement 22 の章の決定の逐語） */
const ALBUM_GONE = '工事写真アルバムが見つかりません。存在しないか、削除されています。';
const PROJECT_GONE = 'プロジェクトが見つかりません。存在しないか、削除されています。';
const PHOTO_ITEM_GONE = '写真項目が見つかりません。存在しないか、削除されています。';
const ALBUM_OR_ITEM_GONE =
  '工事写真アルバムまたは写真項目が見つかりません。存在しないか、削除されています。';
const ALBUM_OR_SURVEY_IMAGE_GONE =
  '工事写真アルバムまたは現場調査写真が見つかりません。存在しないか、削除されています。';
const SIGNBOARD_GONE = '工事看板が見つかりません。存在しないか、削除されています。';

/** 工事写真の画面が 404 を受けたときに出してはならない、障害を告げる文言（タスク31.1） */
const FAILURE_TEXTS = [
  '工事写真アルバムの取得に失敗しました',
  'データの取得に失敗しました',
  'プロジェクトの取得に失敗しました',
  '看板一覧の取得に失敗しました',
  'アルバムの削除に失敗しました',
  '写真項目の削除に失敗しました',
  '保存に失敗しました',
  'PDF出力に失敗しました',
  'エクスポートに失敗しました',
  '現調写真の追加に失敗しました',
  '原本画像の取得に失敗しました',
  '作成中にエラーが発生しました',
  '更新中にエラーが発生しました',
  '登録中にエラーが発生しました',
  '削除中にエラーが発生しました',
] as const;

interface Fixture {
  projectId: string;
  albumId: string;
  albumName: string;
  signboardId: string;
  surveyImageId: string;
}

interface PhotoWithUrls {
  id: string;
  thumbnailUrl: string | null;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・アルバム・工事看板・現場調査写真を DB に作る（写真項目は {@link uploadPhoto} で作る） */
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
  const albumName = `閲覧範囲検証のアルバム ${label}-${suffix}`;
  const album = await prisma.constructionPhotoAlbum.create({
    data: { projectId: project.id, name: albumName, memo: 'before' },
    select: { id: true },
  });
  const signboard = await prisma.constructionSignboard.create({
    data: { projectId: project.id, workName: `${label}工事`, workLocation: `${label}現場` },
    select: { id: true },
  });
  const survey = await prisma.siteSurvey.create({
    data: {
      projectId: project.id,
      name: `閲覧範囲検証の現場調査 ${label}`,
      surveyDate: new Date(),
    },
    select: { id: true },
  });
  const surveyImage = await prisma.surveyImage.create({
    data: {
      surveyId: survey.id,
      originalPath: `surveys/${survey.id}/original.jpg`,
      thumbnailPath: `surveys/${survey.id}/thumbnail.jpg`,
      fileName: `${label}-survey.jpg`,
      fileSize: 1024,
      width: 100,
      height: 100,
      displayOrder: 1,
    },
    select: { id: true },
  });
  return {
    projectId: project.id,
    albumId: album.id,
    albumName,
    signboardId: signboard.id,
    surveyImageId: surveyImage.id,
  };
}

/** 関係者として写真を 1 枚アップロードし、写真項目の ID を返す */
async function uploadPhoto(
  request: APIRequestContext,
  headers: Record<string, string>,
  albumId: string,
  fileName = 'scope.jpg'
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/construction-photos/${albumId}/images`, {
    headers,
    multipart: {
      images: {
        name: fileName,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      },
    },
  });
  expect(response.status(), '前提: 関係者の写真のアップロード').toBe(201);
  const body = (await response.json()) as { successful: Array<{ id: string }> };
  return body.successful[0]!.id;
}

/** 対象の案件の工事写真のデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(fixture: Fixture): Promise<unknown> {
  const prisma = getPrismaClient();
  return {
    albums: await prisma.constructionPhotoAlbum.findMany({
      where: { projectId: fixture.projectId },
      select: { id: true, name: true, memo: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    photos: await prisma.constructionPhoto.findMany({
      where: { album: { projectId: fixture.projectId } },
      select: { id: true, comment: true, displayOrder: true, originalPath: true },
      orderBy: { id: 'asc' },
    }),
    signboards: await prisma.constructionSignboard.findMany({
      where: { projectId: fixture.projectId },
      select: { id: true, workName: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
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

/** 工事写真・工事看板の閲覧と全案件閲覧の権限を持つ利用者（ロール名は admin ではない） */
async function createReadAllUser(): Promise<CreatedUser> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}read-all-${uniqueSuffix()}`,
      description: 'E2E 工事写真の閲覧範囲の検証（全案件閲覧）',
      priority: 0,
      isSystem: false,
    },
    select: { id: true, name: true },
  });
  for (const [resource, action] of [
    ['construction_photo', 'read'],
    ['construction_signboard', 'read'],
    ['project', 'read'],
    ['project', 'read_all'],
  ] as const) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}photo-scope-read-all-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: '工事写真の閲覧範囲検証 read-all',
    roles: [role.name],
  });
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
 * 工事写真の画面は共通の枠の main の内側に自分の main を置くため、内側（文書の順で後ろ）を読む
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
async function expectNotFoundView(page: Page, resourceType: '工事写真アルバム' | 'プロジェクト') {
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

/**
 * トーストの文言が完全一致で 1 件だけ出ていることを主張し、閉じる。
 * トーストの閉じる釦の名前は文言そのものに「を閉じる」を続けたものであるため、名前の完全一致で文言の
 * 完全一致を確かめる（前の操作のトーストと取り違えないよう、確かめた後に閉じる）
 */
async function expectToastAndDismiss(page: Page, message: string): Promise<void> {
  const close = page.getByRole('button', { name: `${message}を閉じる`, exact: true });
  await expect(close).toHaveCount(1, { timeout: getTimeout(15000) });
  await close.click();
  await expect(close).toHaveCount(0);
}

/** アルバムの詳細の URL を直接開き、アルバムの取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openAlbumDetail(page: Page, albumId: string): Promise<void> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/construction-photos/${albumId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/construction-photos/${albumId}`);
  await loaded;
}

test.describe('工事写真アルバム・写真項目・工事看板の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    const projects = await prisma.project.findMany({
      where: { name: { startsWith: PROJECT_NAME_PREFIX } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    await prisma.constructionPhoto.deleteMany({
      where: { album: { projectId: { in: projectIds } } },
    });
    await prisma.constructionSignboard.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement construction-photo/REQ-21.1
   * @requirement construction-photo/REQ-21.2
   * @requirement construction-photo/REQ-21.3
   * @requirement construction-photo/REQ-21.7
   */
  test('担当外の利用者がアルバムの URL を直接開くと存在しないアルバムと同じ表示になり、署名付きURLも原本・印字画像も返らない', async ({
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
    const ownerHeaders = await bearerFor(request, owner);
    const photoId = await uploadPhoto(request, ownerHeaders, target.albumId);

    // 対照: 関係者（営業担当者・作成者）は詳細を開け、写真項目が表示される
    await loginAsUser(page, owner);
    await openAlbumDetail(page, target.albumId);
    await expect(page.getByRole('heading', { name: target.albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(1, {
      timeout: getTimeout(20000),
    });

    // 関係者と全案件閲覧の権限の利用者には、サムネイルの署名付きURLと原本・印字画像が返る
    for (const [label, headers] of [
      ['関係者', ownerHeaders],
      ['全案件閲覧', await bearerFor(request, readAll)],
    ] as const) {
      const photos = await request.get(
        `${API_BASE_URL}/api/construction-photos/${target.albumId}/images`,
        { headers }
      );
      expect(photos.status(), `${label} の写真項目一覧`).toBe(200);
      const [photo] = (await photos.json()) as PhotoWithUrls[];
      expect(photo?.id).toBe(photoId);
      expect(photo?.thumbnailUrl, `${label} のサムネイルの署名付きURL`).toBeTruthy();

      const albums = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/construction-photos`,
        { headers }
      );
      expect(albums.status(), `${label} のアルバム一覧`).toBe(200);
      const albumList = (await albums.json()) as {
        data: Array<{ id: string; thumbnailUrl: string | null }>;
      };
      expect(albumList.data.map((a) => a.id)).toEqual([target.albumId]);
      expect(albumList.data[0]?.thumbnailUrl, `${label} の代表サムネイル`).toBeTruthy();

      for (const kind of ['original', 'print-image']) {
        const image = await request.get(
          `${API_BASE_URL}/api/construction-photos/images/${photoId}/${kind}`,
          { headers }
        );
        expect(image.status(), `${label} の ${kind}`).toBe(200);
        expect(image.headers()['content-type'], `${label} の ${kind}`).toContain('image/');
      }
    }

    // 本体: 担当外の利用者は、存在しないアルバムを開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    // タスク31.1: 表示は不在の表示（ResourceNotFound。role="alert" を持たない）になったため、本文の領域の
    // 見つからない旨の表示どうしを比べる
    await openAlbumDetail(page, MISSING_ID);
    await expectNotFoundView(page, '工事写真アルバム');
    const missingText = await settledMainText(page);
    expect(missingText.trim().length, '存在しないアルバムの表示がある').toBeGreaterThan(0);

    await openAlbumDetail(page, target.albumId);
    await expectNotFoundView(page, '工事写真アルバム');
    expect(await settledMainText(page), '存在しないアルバムと同じ表示').toBe(missingText);
    await expect(page.getByText(target.albumName)).toHaveCount(0);
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(0);

    // API: アルバム・写真項目一覧・原本・印字画像は存在しない ID と同じ 404 の本文で、
    // 署名付きURL も画像もプロジェクトID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [`/api/construction-photos/${target.albumId}`, `/api/construction-photos/${MISSING_ID}`],
      [
        `/api/construction-photos/${target.albumId}/images`,
        `/api/construction-photos/${MISSING_ID}/images`,
      ],
      [
        `/api/construction-photos/images/${photoId}/original`,
        `/api/construction-photos/images/${MISSING_ID}/original`,
      ],
      [
        `/api/construction-photos/images/${photoId}/print-image`,
        `/api/construction-photos/images/${MISSING_ID}/print-image`,
      ],
    ] as const) {
      const missing = await request.get(`${API_BASE_URL}${missingPath}`, { headers });
      const outOfScope = await request.get(`${API_BASE_URL}${outOfScopePath}`, { headers });
      expect(missing.status(), missingPath).toBe(404);
      expect(outOfScope.status(), outOfScopePath).toBe(404);
      expect(outOfScope.headers()['content-type'], outOfScopePath).not.toContain('image/');
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(body.code, outOfScopePath).toBe('NOT_FOUND');
      expect(withoutInstance(body), outOfScopePath).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(withoutInstance(body)), outOfScopePath).not.toContain(target.projectId);
      expect(JSON.stringify(body), outOfScopePath).not.toContain('thumbnail');
    }
  });

  /**
   * @requirement construction-photo/REQ-21.2
   * @requirement construction-photo/REQ-21.3
   */
  test('担当外の利用者のアルバム・工事看板の作成・更新、写真のアップロード・メタデータの更新は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は工事写真・工事看板の閲覧・作成・編集の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('write', { salesPersonId: owner.id, createdById: owner.id });
    const photoId = await uploadPhoto(request, await bearerFor(request, owner), target.albumId);
    const before = await snapshot(target);
    const prisma = getPrismaClient();
    const album = await prisma.constructionPhotoAlbum.findUniqueOrThrow({
      where: { id: target.albumId },
      select: { updatedAt: true },
    });
    const signboard = await prisma.constructionSignboard.findUniqueOrThrow({
      where: { id: target.signboardId },
      select: { updatedAt: true },
    });
    const headers = await bearerFor(request, outsider);

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/construction-photos`, {
        headers,
        data: { name: 'intrusion' },
      }),
      await request.patch(`${API_BASE_URL}/api/construction-photos/${target.albumId}`, {
        headers,
        data: { name: 'intrusion', updatedAt: album.updatedAt.toISOString() },
      }),
      await request.post(`${API_BASE_URL}/api/construction-photos/${target.albumId}/images`, {
        headers,
        multipart: {
          images: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(FIXTURE_JPG) },
        },
      }),
      await request.patch(`${API_BASE_URL}/api/construction-photos/images/batch`, {
        headers,
        data: { items: [{ id: photoId, comment: 'intrusion' }] },
      }),
      await request.put(`${API_BASE_URL}/api/construction-photos/${target.albumId}/images/order`, {
        headers,
        data: { orders: [{ id: photoId, order: 2 }] },
      }),
      await request.post(
        `${API_BASE_URL}/api/projects/${target.projectId}/construction-signboards`,
        { headers, data: { workName: 'intrusion', workLocation: 'intrusion' } }
      ),
      await request.patch(`${API_BASE_URL}/api/construction-signboards/${target.signboardId}`, {
        headers,
        data: { workName: 'intrusion', updatedAt: signboard.updatedAt.toISOString() },
      }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(body)), response.url()).not.toContain(target.projectId);
    }

    expect(await snapshot(target)).toEqual(before);
  });

  /**
   * @requirement construction-photo/REQ-21.4
   */
  test('メタデータの一括更新・表示順序の更新に範囲外の写真項目を混ぜると、存在しない写真項目と同じ 404 になり、どの写真項目も変わらない', async ({
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
    const headers = await bearerFor(request, owner);
    const ownPhotoId = await uploadPhoto(request, headers, target.albumId);
    const foreignPhotoId = await uploadPhoto(
      request,
      await bearerFor(request, other),
      foreign.albumId
    );
    const beforeTarget = await snapshot(target);
    const beforeForeign = await snapshot(foreign);

    const batch = (id: string) =>
      request.patch(`${API_BASE_URL}/api/construction-photos/images/batch`, {
        headers,
        data: {
          items: [
            { id: ownPhotoId, comment: 'mixed' },
            { id, comment: 'mixed' },
          ],
        },
      });
    const order = (id: string) =>
      request.put(`${API_BASE_URL}/api/construction-photos/${target.albumId}/images/order`, {
        headers,
        data: {
          orders: [
            { id: ownPhotoId, order: 2 },
            { id, order: 1 },
          ],
        },
      });

    for (const [label, call] of [
      ['メタデータの一括更新', batch],
      ['表示順序の更新', order],
    ] as const) {
      const missing = await call(MISSING_ID);
      const mixed = await call(foreignPhotoId);
      expect(missing.status(), label).toBe(404);
      expect(mixed.status(), label).toBe(404);
      const body = (await mixed.json()) as Record<string, unknown>;
      expect(withoutInstance(body), label).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(body), label).not.toContain(foreignPhotoId);
      expect(JSON.stringify(withoutInstance(body)), label).not.toContain(foreign.projectId);
    }

    expect(await snapshot(target)).toEqual(beforeTarget);
    expect(await snapshot(foreign)).toEqual(beforeForeign);
  });

  /**
   * @requirement construction-photo/REQ-21.5
   */
  test('現場調査写真のコピーは、コピー元またはコピー先が範囲外の案件に属すると 404 になり、写真項目を作成しない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('copy-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('copy-foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeTarget = await snapshot(target);
    const beforeForeign = await snapshot(foreign);
    const headers = await bearerFor(request, owner);
    const copy = (albumId: string, surveyImageIds: string[]) =>
      request.post(`${API_BASE_URL}/api/construction-photos/${albumId}/images/from-surveys`, {
        headers,
        data: { surveyImageIds },
      });

    // コピー元が範囲外: 存在しないコピー元と同じ 404
    const missing = await copy(target.albumId, [MISSING_ID]);
    const foreignSource = await copy(target.albumId, [foreign.surveyImageId]);
    expect(missing.status()).toBe(404);
    expect(foreignSource.status()).toBe(404);
    const body = (await foreignSource.json()) as Record<string, unknown>;
    expect(withoutInstance(body)).toEqual(
      withoutInstance((await missing.json()) as Record<string, unknown>)
    );
    expect(JSON.stringify(withoutInstance(body))).not.toContain(foreign.projectId);
    expect(JSON.stringify(body)).not.toContain(foreign.surveyImageId);

    // コピー先が範囲外: 範囲内のコピー元を指定しても 404
    const foreignTarget = await copy(foreign.albumId, [target.surveyImageId]);
    expect(foreignTarget.status()).toBe(404);
    expect(((await foreignTarget.json()) as { code?: string }).code).toBe('NOT_FOUND');

    expect(await snapshot(target)).toEqual(beforeTarget);
    expect(await snapshot(foreign)).toEqual(beforeForeign);
  });

  /**
   * @requirement construction-photo/REQ-21.1
   * @requirement construction-photo/REQ-21.6
   */
  test('担当外の利用者にはアルバム一覧・工事看板一覧・写真項目一覧が返らず、関係者と全案件閲覧の権限の利用者には返る', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const readAll = await createReadAllUser();
    const target = await createFixture('list', { salesPersonId: owner.id, createdById: owner.id });

    for (const user of [owner, readAll]) {
      const headers = await bearerFor(request, user);
      const albums = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/construction-photos`,
        { headers }
      );
      expect(albums.status(), `${user.email} のアルバム一覧`).toBe(200);
      expect(
        ((await albums.json()) as { data: Array<{ id: string }> }).data.map((a) => a.id)
      ).toEqual([target.albumId]);
      const signboards = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/construction-signboards`,
        { headers }
      );
      expect(signboards.status(), `${user.email} の工事看板一覧`).toBe(200);
      expect(JSON.stringify(await signboards.json())).toContain(target.signboardId);
      const photos = await request.get(
        `${API_BASE_URL}/api/construction-photos/${target.albumId}/images`,
        { headers }
      );
      expect(photos.status(), `${user.email} の写真項目一覧`).toBe(200);
    }

    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [
        `/api/projects/${target.projectId}/construction-photos`,
        `/api/projects/${MISSING_ID}/construction-photos`,
      ],
      [
        `/api/projects/${target.projectId}/construction-signboards`,
        `/api/projects/${MISSING_ID}/construction-signboards`,
      ],
      [
        `/api/construction-photos/${target.albumId}/images`,
        `/api/construction-photos/${MISSING_ID}/images`,
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
      expect(JSON.stringify(body), outOfScopePath).not.toContain(target.signboardId);
    }

    // 画面: 担当外の利用者がアルバム一覧の URL を開いてもアルバムの行は出ない
    await loginAsUser(page, outsider);
    const listed = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/projects/${target.projectId}`,
      { timeout: getTimeout(30000) }
    );
    await page.goto(`/projects/${target.projectId}/construction-photos`);
    expect((await listed).status()).toBe(404);
    // タスク31.1: プロジェクトが見つからない旨は ResourceNotFound（role="alert" を持たない）で出るため、
    // alert の役割でなくプロジェクトが見つからない旨の表示で観測する
    await expectNotFoundView(page, 'プロジェクト');
    await expect(page.getByText(target.albumName)).toHaveCount(0);
  });

  /**
   * 詳細・編集の画面は工事写真アルバムの読み込みの 404 で、工事写真の一覧・アルバムの新規作成・工事看板の一覧の
   * 画面はプロジェクトの読み込みの 404 で、見つからない旨とプロジェクトの一覧へのリンクを表示する。写真の閲覧の
   * 画面はアルバムの読み込みの 404 と原本の取得の 404 で写真が見つからない旨とアルバムへの戻り先を表示する
   * （construction-photo タスク31.1）。範囲外と不在は同じ表示。
   *
   * @requirement construction-photo/REQ-22.1
   */
  test('担当外の利用者が工事写真の画面の URL を開くと見つからない旨と戻り先のリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
    request,
  }) => {
    test.setTimeout(getTimeout(180000));
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const photoId = await uploadPhoto(request, await bearerFor(request, owner), target.albumId);
    await loginAsUser(page, outsider);

    // 詳細の画面と編集の画面: 工事写真アルバムが見つからない旨と、プロジェクトの一覧へのリンク
    for (const suffix of ['', '/edit']) {
      expect(
        await openAndWait(
          page,
          `/construction-photos/${MISSING_ID}${suffix}`,
          `/api/construction-photos/${MISSING_ID}`
        )
      ).toBe(404);
      await expectNotFoundView(page, '工事写真アルバム');
      const missingText = await settledMainText(page);
      expect(
        await openAndWait(
          page,
          `/construction-photos/${target.albumId}${suffix}`,
          `/api/construction-photos/${target.albumId}`
        )
      ).toBe(404);
      await expectNotFoundView(page, '工事写真アルバム');
      expect(await settledMainText(page), `存在しないアルバムと同じ表示（${suffix}）`).toBe(
        missingText
      );
      await expect(page.getByText(target.albumName)).toHaveCount(0);
    }
    // 編集の画面は更新の手段を出さない
    await expect(page.getByLabel('アルバム名')).toHaveCount(0);

    // 工事写真の一覧・アルバムの新規作成・工事看板の一覧の画面: プロジェクトが見つからない旨と、
    // プロジェクトの一覧へのリンク。一覧と工事看板の一覧は一覧の取得の 404 を待つ（プロジェクトの取得と
    // 並行するため、どちらの 404 でも同じ表示になること）
    for (const [url, apiPath] of [
      ['/construction-photos', '/construction-photos'],
      ['/construction-photos/new', ''],
      ['/construction-signboards', '/construction-signboards'],
    ] as const) {
      expect(
        await openAndWait(
          page,
          `/projects/${MISSING_ID}${url}`,
          `/api/projects/${MISSING_ID}${apiPath}`
        )
      ).toBe(404);
      await expectNotFoundView(page, 'プロジェクト');
      const missingText = await settledMainText(page);
      expect(
        await openAndWait(
          page,
          `/projects/${target.projectId}${url}`,
          `/api/projects/${target.projectId}${apiPath}`
        )
      ).toBe(404);
      await expectNotFoundView(page, 'プロジェクト');
      expect(await settledMainText(page), `存在しないプロジェクトと同じ表示（${url}）`).toBe(
        missingText
      );
      await expect(page.getByText(target.albumName)).toHaveCount(0);
    }
    // 新規作成の画面は作成の手段を出さない。工事看板の一覧の画面は看板の行と登録の手段を出さない
    await expect(page.getByRole('button', { name: '新規登録', exact: true })).toHaveCount(0);
    await expect(page.getByText(`not-found-view工事`)).toHaveCount(0);

    // 写真の閲覧の画面: 写真が見つからない旨と、アルバムへの戻り先のリンク
    expect(
      await openAndWait(
        page,
        `/construction-photos/${MISSING_ID}/photos/${MISSING_ID}`,
        `/api/construction-photos/${MISSING_ID}`
      )
    ).toBe(404);
    const viewerHeading = page.getByRole('heading', { name: '写真が見つかりません', exact: true });
    await expect(viewerHeading).toBeVisible({ timeout: getTimeout(15000) });
    const missingViewerText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/construction-photos/${target.albumId}/photos/${photoId}`,
        `/api/construction-photos/${target.albumId}`
      )
    ).toBe(404);
    await expect(viewerHeading).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByRole('link', { name: '前の画面に戻る', exact: true })).toHaveAttribute(
      'href',
      `/construction-photos/${target.albumId}`
    );
    expect(await settledMainText(page), '存在しない写真と同じ表示').toBe(missingViewerText);
    await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
    await expectNoFailureFeedback(page);

    // 写真の閲覧の画面の原本の取得の 404: 関係者が開き、アルバムと写真項目の読み込みの後、原本の取得の前に
    // 写真項目が取り除かれる。原本の取得の 404 でも読み込みの 404 と同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, owner);
    const originalPath = `/api/construction-photos/images/${photoId}/original`;
    const removeBeforeOriginal = async (route: Route): Promise<void> => {
      await getPrismaClient().constructionPhoto.deleteMany({ where: { id: photoId } });
      await route.continue();
    };
    const originalMatcher = (url: URL): boolean => url.pathname === originalPath;
    await page.route(originalMatcher, removeBeforeOriginal);
    try {
      const original = page.waitForResponse(
        (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === originalPath,
        { timeout: getTimeout(30000) }
      );
      expect(
        await openAndWait(
          page,
          `/construction-photos/${target.albumId}/photos/${photoId}`,
          `/api/construction-photos/${target.albumId}/images`
        )
      ).toBe(200);
      expect((await original).status()).toBe(404);
      await expect(viewerHeading).toBeVisible({ timeout: getTimeout(15000) });
      await expect(page.getByRole('link', { name: '前の画面に戻る', exact: true })).toHaveAttribute(
        'href',
        `/construction-photos/${target.albumId}`
      );
      expect(await settledMainText(page), '読み込みの 404 と同じ表示').toBe(missingViewerText);
      await expectNoFailureFeedback(page);
    } finally {
      await page.unroute(originalMatcher, removeBeforeOriginal);
    }
  });

  /**
   * 開いた後に写真項目が削除される、またはアルバム・工事看板・プロジェクトが論理的に取り除かれると、操作の要求は
   * 404 を受ける。画面は見つからない旨のメッセージを従来の失敗の表示の場所に表示し、操作の失敗を告げる汎用の
   * 文言、サーバーエラーである旨や応答の英語の文言を出さない（construction-photo タスク31.1）。アップロードに
   * 失敗した画像の保持（Requirement 20）は保つ。
   *
   * @requirement construction-photo/REQ-22.2
   */
  test('開いた後に取り除かれたアルバム・写真項目・工事看板・プロジェクトへの操作で、見つからない旨のメッセージが表示される', async ({
    page,
    request,
  }) => {
    test.setTimeout(getTimeout(240000));
    // アルバム・写真項目の削除の釦はシステム管理者のロールで出るため、システム管理者を営業担当者・作成者にする
    const owner = await createSessionUser('ADMIN_USER');
    const people = { salesPersonId: owner.id, createdById: owner.id };
    const detailTarget = await createFixture('gone-detail', people);
    const listTarget = await createFixture('gone-list', people);
    const editTarget = await createFixture('gone-edit', people);
    const createTarget = await createFixture('gone-create', people);
    const signboardTarget = await createFixture('gone-signboard', people);
    const prisma = getPrismaClient();
    const headers = await bearerFor(request, owner);
    /** 指定の方法とパスの要求の応答を待つ（オリジンは問わずパスで照合する） */
    const responseOf = (method: string, pathname: string) =>
      page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname === pathname,
        { timeout: getTimeout(60000) }
      );

    // 詳細の画面の写真項目を 3 枚置き、すべて印刷対象にする（PDF の出力の対象にする）
    const photoA = await uploadPhoto(request, headers, detailTarget.albumId, 'gone-a.jpg');
    const photoB = await uploadPhoto(request, headers, detailTarget.albumId, 'gone-b.jpg');
    const photoC = await uploadPhoto(request, headers, detailTarget.albumId, 'gone-c.jpg');
    await prisma.constructionPhoto.updateMany({
      where: { albumId: detailTarget.albumId },
      data: { includeInReport: true },
    });
    await loginAsUser(page, owner);

    expect(
      await openAndWait(
        page,
        `/construction-photos/${detailTarget.albumId}`,
        `/api/construction-photos/${detailTarget.albumId}/images`
      )
    ).toBe(200);
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(3, {
      timeout: getTimeout(20000),
    });
    const pageMessage = page.getByTestId('construction-photo-page-message');

    // --- 工事写真台帳の PDF の出力（従来は応答の英語の文言）。開いた後に写真項目を削除する ---
    await prisma.constructionPhoto.delete({ where: { id: photoC } });
    const ledgerRecorded = responseOf('POST', '/api/v1/audit-logs/exports');
    const printImage = responseOf('GET', `/api/construction-photos/images/${photoC}/print-image`);
    await page.getByRole('button', { name: 'PDF出力', exact: true }).click();
    expect((await ledgerRecorded).status()).toBe(201);
    expect((await printImage).status()).toBe(404);
    await expect(pageMessage).toHaveText(PHOTO_ITEM_GONE, { timeout: getTimeout(30000) });
    await expect(pageMessage).toHaveAttribute('role', 'alert');
    await expectNoFailureFeedback(page);

    // --- 写真項目の削除（従来は応答の英語の文言）。開いた後に写真項目を削除する ---
    // 上の通知の枠にも直前の出力の失敗として同じ文言が出ているため、取り除こうとした写真項目の中の表示を
    // 完全一致で主張する
    await prisma.constructionPhoto.delete({ where: { id: photoB } });
    await page.getByRole('button', { name: '写真項目を削除: gone-b.jpg', exact: true }).click();
    const photoDeleted = responseOf('DELETE', `/api/construction-photos/images/${photoB}`);
    await page
      .getByRole('dialog', { name: '写真項目を削除' })
      .getByRole('button', { name: '削除する', exact: true })
      .click();
    expect((await photoDeleted).status()).toBe(404);
    const itemB = page.getByRole('article', { name: 'gone-b.jpg' });
    await expect(itemB.getByRole('alert')).toHaveText(PHOTO_ITEM_GONE, {
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);

    // --- メタデータの保存（従来は応答の英語の文言）。印刷対象を変えた後に、その写真項目を削除する ---
    const itemA = page.getByRole('article', { name: 'gone-a.jpg' });
    await itemA.getByLabel('印刷対象に含める').click();
    await prisma.constructionPhoto.delete({ where: { id: photoA } });
    const metadataSaved = responseOf('PATCH', '/api/construction-photos/images/batch');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await metadataSaved).status()).toBe(404);
    // 保存ボタンの近くの表示（タスク 22.2）。写真項目 gone-b.jpg の中の削除の失敗の表示（role=alert）も同じ
    // パネルにあるため、保存の失敗の表示そのものを完全一致で主張する
    await expect(
      page
        .getByRole('region', { name: '写真項目管理パネル' })
        .getByRole('alert')
        .and(page.locator('[id^="save-failure-"]'))
    ).toHaveText(ALBUM_OR_ITEM_GONE, { timeout: getTimeout(10000) });
    await expect(pageMessage).toHaveText(ALBUM_OR_ITEM_GONE);
    await expectNoFailureFeedback(page);

    // ここからアルバムを論理的に取り除く（開いた画面はそのまま）
    await prisma.constructionPhotoAlbum.update({
      where: { id: detailTarget.albumId },
      data: { deletedAt: new Date() },
    });

    // --- 写真のアップロード（従来は失敗した画像の理由が応答の英語の文言）。失敗の通知の構成と保持を保つ ---
    const uploaded = responseOf('POST', `/api/construction-photos/${detailTarget.albumId}/images`);
    await page.getByTestId('file-input').setInputFiles({
      name: 'gone-upload.jpg',
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    expect((await uploaded).status()).toBe(404);
    await expect(pageMessage).toHaveText('全1件の追加に失敗しました。\ngone-upload.jpg', {
      timeout: getTimeout(20000),
    });
    await expect(page.getByTestId('pending-upload-filename')).toHaveText('gone-upload.jpg', {
      timeout: getTimeout(20000),
    });
    await expect(page.getByTestId('pending-upload-reason')).toHaveText(ALBUM_GONE);
    await expect(page.getByTestId('pending-upload-item')).toHaveAttribute('data-kind', 'retriable');
    await expectNoFailureFeedback(page);

    // --- 現場調査写真のコピー（従来は応答の英語の文言）。コピー先のアルバムが取り除かれている ---
    await page.getByRole('button', { name: '現場調査写真から選択', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '現場調査写真から選択' });
    await picker.getByText('閲覧範囲検証の現場調査 gone-detail', { exact: true }).click();
    await picker.getByLabel('gone-detail-survey.jpg を選択').click();
    const copied = responseOf(
      'POST',
      `/api/construction-photos/${detailTarget.albumId}/images/from-surveys`
    );
    await picker.getByRole('button', { name: /追加/ }).click();
    expect((await copied).status()).toBe(404);
    await expect(pageMessage).toHaveText(ALBUM_OR_SURVEY_IMAGE_GONE, {
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);
    await picker.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(picker).toHaveCount(0);

    // --- アルバムの削除（従来は応答の英語の文言） ---
    await page.getByRole('button', { name: '削除', exact: true }).click();
    const albumDeleted = responseOf('DELETE', `/api/construction-photos/${detailTarget.albumId}`);
    await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();
    expect((await albumDeleted).status()).toBe(404);
    await expect(pageMessage).toHaveText(ALBUM_GONE, { timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${detailTarget.albumId}$`));
    await expectNoFailureFeedback(page);

    // --- コピー元の選択の読み込み（従来は応答の英語の文言）。プロジェクトを論理削除してから開く ---
    await prisma.project.update({
      where: { id: detailTarget.projectId },
      data: { deletedAt: new Date() },
    });
    const surveysListed = responseOf('GET', `/api/projects/${detailTarget.projectId}/site-surveys`);
    await page.getByRole('button', { name: '現場調査写真から選択', exact: true }).click();
    expect((await surveysListed).status()).toBe(404);
    await expect(picker.getByRole('alert')).toHaveText(PROJECT_GONE, {
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);
    await picker.getByRole('button', { name: 'キャンセル', exact: true }).click();

    // --- 工事写真の一覧の画面のアルバムの削除（従来は応答の英語の文言）。開いた後にアルバムを取り除く ---
    expect(
      await openAndWait(
        page,
        `/projects/${listTarget.projectId}/construction-photos`,
        `/api/projects/${listTarget.projectId}/construction-photos`
      )
    ).toBe(200);
    const listRow = page.getByTestId(`album-row-${listTarget.albumId}`);
    await expect(listRow).toBeVisible({ timeout: getTimeout(15000) });
    await prisma.constructionPhotoAlbum.update({
      where: { id: listTarget.albumId },
      data: { deletedAt: new Date() },
    });
    await listRow.getByRole('button', { name: /削除/ }).click();
    const listAlbumDeleted = responseOf('DELETE', `/api/construction-photos/${listTarget.albumId}`);
    await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();
    expect((await listAlbumDeleted).status()).toBe(404);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('main').last().getByRole('alert')).toHaveText(ALBUM_GONE, {
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);

    // --- 編集の画面の更新（従来は応答の英語の文言）。開いた後にアルバムを論理的に取り除く ---
    expect(
      await openAndWait(
        page,
        `/construction-photos/${editTarget.albumId}/edit`,
        `/api/construction-photos/${editTarget.albumId}`
      )
    ).toBe(200);
    await expect(page.getByRole('heading', { name: 'アルバムを編集' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await prisma.constructionPhotoAlbum.update({
      where: { id: editTarget.albumId },
      data: { deletedAt: new Date() },
    });
    const albumUpdated = responseOf('PATCH', `/api/construction-photos/${editTarget.albumId}`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await albumUpdated).status()).toBe(404);
    await expectToastAndDismiss(page, ALBUM_GONE);
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${editTarget.albumId}/edit$`));
    await expectNoFailureFeedback(page);

    // --- 新規作成の画面の作成（従来は応答の英語の文言）。開いた後にプロジェクトを論理削除する ---
    expect(
      await openAndWait(
        page,
        `/projects/${createTarget.projectId}/construction-photos/new`,
        `/api/projects/${createTarget.projectId}`
      )
    ).toBe(200);
    await expect(page.getByRole('heading', { name: '新規アルバム' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await prisma.project.update({
      where: { id: createTarget.projectId },
      data: { deletedAt: new Date() },
    });
    await page.getByLabel('アルバム名').fill('取り除かれた後の作成');
    const albumCreated = responseOf(
      'POST',
      `/api/projects/${createTarget.projectId}/construction-photos`
    );
    await page.getByRole('button', { name: '作成', exact: true }).click();
    expect((await albumCreated).status()).toBe(404);
    await expectToastAndDismiss(page, PROJECT_GONE);
    await expect(page).toHaveURL(
      new RegExp(`/projects/${createTarget.projectId}/construction-photos/new$`)
    );
    await expectNoFailureFeedback(page);
    expect(
      await prisma.constructionPhotoAlbum.count({ where: { projectId: createTarget.projectId } }),
      '作成されない（fixture の 1 件のまま）'
    ).toBe(1);

    // --- 工事看板の更新・削除・登録（従来は応答の英語の文言） ---
    const secondSignboard = await prisma.constructionSignboard.create({
      data: {
        projectId: signboardTarget.projectId,
        workName: 'gone-second工事',
        workLocation: 'gone-second現場',
      },
      select: { id: true },
    });
    expect(
      await openAndWait(
        page,
        `/projects/${signboardTarget.projectId}/construction-signboards`,
        `/api/projects/${signboardTarget.projectId}/construction-signboards`
      )
    ).toBe(200);
    const signboardRow = (workName: string) =>
      page.getByRole('row').filter({ has: page.getByText(workName, { exact: true }) });
    await expect(signboardRow('gone-signboard工事')).toBeVisible({ timeout: getTimeout(15000) });

    // 更新: 開いた後に看板を論理的に取り除く
    await signboardRow('gone-signboard工事').getByRole('button', { name: '編集' }).click();
    await prisma.constructionSignboard.update({
      where: { id: signboardTarget.signboardId },
      data: { deletedAt: new Date() },
    });
    const signboardUpdated = responseOf(
      'PATCH',
      `/api/construction-signboards/${signboardTarget.signboardId}`
    );
    await page.getByRole('button', { name: '更新', exact: true }).click();
    expect((await signboardUpdated).status()).toBe(404);
    await expectToastAndDismiss(page, SIGNBOARD_GONE);
    await expectNoFailureFeedback(page);
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();

    // 削除: 開いた後に看板を論理的に取り除く（直前の更新のトーストは閉じてある）
    await prisma.constructionSignboard.update({
      where: { id: secondSignboard.id },
      data: { deletedAt: new Date() },
    });
    await signboardRow('gone-second工事').getByRole('button', { name: '削除' }).click();
    const signboardDeleted = responseOf(
      'DELETE',
      `/api/construction-signboards/${secondSignboard.id}`
    );
    await page.getByRole('dialog').getByRole('button', { name: '削除する', exact: true }).click();
    expect((await signboardDeleted).status()).toBe(404);
    await expectToastAndDismiss(page, SIGNBOARD_GONE);
    await expectNoFailureFeedback(page);
    // 失敗では確認のダイアログが開いたまま残るため閉じる
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 登録: 開いた後にプロジェクトを論理削除する
    await prisma.project.update({
      where: { id: signboardTarget.projectId },
      data: { deletedAt: new Date() },
    });
    await page.getByRole('button', { name: '新規登録', exact: true }).click();
    await page.getByLabel(/工事件名/).fill('取り除かれた後の登録');
    await page.getByLabel(/工事場所/).fill('取り除かれた後の現場');
    const signboardCreated = responseOf(
      'POST',
      `/api/projects/${signboardTarget.projectId}/construction-signboards`
    );
    await page.getByRole('button', { name: '登録', exact: true }).click();
    expect((await signboardCreated).status()).toBe(404);
    await expectToastAndDismiss(page, PROJECT_GONE);
    await expectNoFailureFeedback(page);
    expect(
      await prisma.constructionSignboard.count({
        where: { projectId: signboardTarget.projectId },
      }),
      '登録されない（fixture の 2 件のまま）'
    ).toBe(2);
  });
});
