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
 * 検証に使う案件・アルバム・工事看板・現場調査写真はテストの中で DB に作り（名前の接頭辞 `PROJECT_NAME_PREFIX`）、
 * 写真項目は関係者が API でアップロードして作る（原本・印字画像・サムネイルを実ストレージに置くため）。
 * 現場調査写真は画像の実体を置かない（コピーは範囲の判定で拒否され、実体を読まない）。
 * 利用者はテストの中で作る一意のメールアドレスの利用者で、後始末で案件を先に消してから利用者を消す。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const PROJECT_NAME_PREFIX = 'e2e-photo-scope-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-photo-scope-role-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000030201';

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
  albumId: string
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/construction-photos/${albumId}/images`, {
    headers,
    multipart: {
      images: {
        name: 'scope.jpg',
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
    await openAlbumDetail(page, MISSING_ID);
    const missingAlert = page.getByRole('alert');
    await expect(missingAlert).toBeVisible({ timeout: getTimeout(15000) });
    const missingText = await missingAlert.innerText();

    await openAlbumDetail(page, target.albumId);
    const outOfScopeAlert = page.getByRole('alert');
    await expect(outOfScopeAlert).toBeVisible({ timeout: getTimeout(15000) });
    expect(await outOfScopeAlert.innerText(), '存在しないアルバムと同じ表示').toBe(missingText);
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
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText(target.albumName)).toHaveCount(0);
  });
});
