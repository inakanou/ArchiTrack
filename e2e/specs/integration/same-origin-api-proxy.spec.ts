/**
 * @fileoverview 画面の配信元から API を同一オリジンへ中継する構成の E2E テスト
 *
 * user-authentication タスク44.7（要件33.8 の準備）。画面を配信する nginx が `/api/` と
 * `/csrf-token` を backend へ中継し（design.md「画面配信」の FrontendNginxConfig）、
 * 画面の API の接続先（`VITE_API_URL`）を画面と同じオリジンにした構成を、試験環境の
 * 実際の nginx・backend を通して確かめる。準備のタスクのため被覆の印は掲げない
 * （要件33.8 の振る舞いはリフレッシュの Cookie 化のタスクで主張する）。
 *
 * 確かめること:
 * 1. 画面から見た API の呼び出し（ログインと一覧の取得）が画面と同じオリジンで成功する
 * 2. CSRF トークンの発行（`GET /csrf-token`）が画面と同じオリジンで backend から返る
 *    （中継が無いと SPA の index.html が返る）
 * 3. 中継の本文の上限が backend の上限を下回らない:
 *    - 10MB に近い画像 1 枚のアップロードが成功する
 *    - 10MB に近い画像 10 枚の一括アップロード（backend が一度に受け付ける最大）が成功する
 * 4. サイズ超過の判定とエラー文言が backend に残る: 10MB を超える画像を画面から送ると、
 *    backend の文言（`ファイルサイズが上限（10MB）を超えています`）が画面に表示される
 *
 * 観測の方針:
 * - 応答の差し替え（`page.route`）は用いない。中継そのものを検証するため、実際の nginx と
 *   backend の応答を観測する。
 * - アップロードは `SAME_ORIGIN_API_BASE_URL`（画面と同じオリジン）へ送る。backend へ直接
 *   送ると中継の上限を経由せず、本ファイルの主張が恒真になるため。
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import { seedProject } from '../../helpers/project-list-preconditions';
import { FRONTEND_BASE_URL, SAME_ORIGIN_API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 元にする有効な JPEG（小さい画像。COM セグメントで 10MB 近くまで膨らませる） */
const FIXTURE_IMAGE_PATH = path.join(__dirname, '../../fixtures/test-image.jpg');

/** backend の 1 ファイルの上限（construction-photo.schema.ts の MAX_UPLOAD_FILE_SIZE と同じ 10MB） */
const BACKEND_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** backend が一度に受け付ける最大のファイル数（MAX_UPLOAD_FILES と同じ 10 件） */
const BACKEND_MAX_FILES = 10;

/** 「10MB に近い」画像の大きさ（上限から 4KB 小さい） */
const NEAR_LIMIT_SIZE = BACKEND_MAX_FILE_SIZE - 4 * 1024;

/** backend がサイズ超過で返す文言（CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILE_SIZE_EXCEEDED） */
const BACKEND_FILE_SIZE_EXCEEDED_DETAIL = 'ファイルサイズが上限（10MB）を超えています';

/** 画面のオリジン */
const APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;

/**
 * 有効な JPEG の SOI の直後に COM（コメント）セグメントを詰め、指定の大きさの JPEG を作る。
 *
 * COM セグメントは画像の復号に影響しないため、backend の形式の検証と画像の処理を通る。
 *
 * @param targetSize 作る JPEG のバイト数
 */
function buildPaddedJpeg(targetSize: number): Buffer {
  const original = fs.readFileSync(FIXTURE_IMAGE_PATH);
  expect(original[0], '前提: 元の画像が JPEG の SOI で始まる').toBe(0xff);
  expect(original[1], '前提: 元の画像が JPEG の SOI で始まる').toBe(0xd8);

  const MAX_SEGMENT_PAYLOAD = 0xffff - 2;
  const segments: Buffer[] = [];
  let remaining = targetSize - original.length;
  expect(remaining, '前提: 元の画像が目標の大きさより小さい').toBeGreaterThan(4);
  while (remaining > 0) {
    // 1 セグメントはマーカー 2 バイト＋長さ 2 バイト＋本文。最後の端数が 4 バイト未満に
    // ならないよう、残りが 1 セグメントに収まるときだけ残り全部を使う
    const payload =
      remaining - 4 <= MAX_SEGMENT_PAYLOAD
        ? remaining - 4
        : Math.min(MAX_SEGMENT_PAYLOAD, remaining - 4 - 4);
    const segment = Buffer.alloc(4 + payload, 0x20);
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment.writeUInt16BE(payload + 2, 2);
    segments.push(segment);
    remaining -= segment.length;
  }

  const padded = Buffer.concat([original.subarray(0, 2), ...segments, original.subarray(2)]);
  expect(padded.length, '前提: 作った JPEG が目標の大きさである').toBe(targetSize);
  return padded;
}

/**
 * ログイン済みのページからアクセストークンを得る。
 */
async function getAccessToken(page: Page): Promise<string> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
  assertPrepared(accessToken, '認証トークン');
  return accessToken;
}

test.describe('画面の配信元から API を同一オリジンへ中継する構成（user-authentication 44.7）', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string | null = null;
  let albumId: string | null = null;
  /** 後始末で消す写真項目 */
  const uploadedImageIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      const headers = { Authorization: `Bearer ${await getAccessToken(page)}` };
      for (const imageId of uploadedImageIds) {
        await page.request.delete(
          `${SAME_ORIGIN_API_BASE_URL}/api/construction-photos/images/${imageId}`,
          { headers }
        );
      }
      if (albumId) {
        await page.request.delete(
          `${SAME_ORIGIN_API_BASE_URL}/api/construction-photos/${albumId}`,
          {
            headers,
          }
        );
      }
      if (projectId) {
        await page.request.delete(`${SAME_ORIGIN_API_BASE_URL}/api/projects/${projectId}`, {
          headers,
        });
      }
    } finally {
      await context.close();
    }
  });

  test('画面から見た API の呼び出しが画面と同じオリジンで成功する', async ({ page }) => {
    const apiResponses: Response[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/api/')) {
        apiResponses.push(response);
      }
    });

    await loginAsUser(page, 'ADMIN_USER');

    const projectListResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/projects' &&
        response.request().method() === 'GET',
      { timeout: getTimeout(30000) }
    );
    await page.goto('/projects');
    const listResponse = await projectListResponse;

    // 一覧の取得が画面と同じオリジンへ送られ、backend の応答（JSON）が返る
    expect(new URL(listResponse.url()).origin).toBe(APP_ORIGIN);
    expect(listResponse.status()).toBe(200);
    expect(listResponse.headers()['content-type']).toContain('application/json');

    // ログインの要求も画面と同じオリジンで成功している
    const loginResponses = apiResponses.filter(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/auth/login' &&
        response.request().method() === 'POST'
    );
    expect(loginResponses).toHaveLength(1);
    expect(new URL(loginResponses[0]!.url()).origin).toBe(APP_ORIGIN);
    expect(loginResponses[0]!.status()).toBe(200);

    // 画面が送った API の要求は全て画面と同じオリジンへ向かう（別オリジンの backend へ直接
    // 向かう要求が残っていない）
    const foreignOrigins = apiResponses
      .map((response) => new URL(response.url()).origin)
      .filter((origin) => origin !== APP_ORIGIN);
    expect(foreignOrigins).toEqual([]);
  });

  test('CSRF トークンの発行が画面と同じオリジンで backend から返る', async ({ page }) => {
    const response = await page.request.get(`${SAME_ORIGIN_API_BASE_URL}/csrf-token`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = (await response.json()) as { csrfToken?: unknown };
    expect(body.csrfToken).toMatch(/^[0-9a-f]{64}$/);

    // backend が付けた CSRF の Cookie が画面のオリジンの Cookie として保存される
    const cookies = await page.context().cookies(APP_ORIGIN);
    const csrfCookie = cookies.find((cookie) => cookie.name === 'csrf-token');
    expect(csrfCookie?.value).toBe(body.csrfToken);
  });

  test('事前準備: 写真を送るアルバムを作る', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');
    const project = await seedProject(page, '同一オリジン中継E2E');
    projectId = project.id;

    const headers = { Authorization: `Bearer ${await getAccessToken(page)}` };
    const albumResponse = await page.request.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/projects/${projectId}/construction-photos`,
      { headers, data: { name: `同一オリジン中継E2E_${Date.now()}` } }
    );
    expect(
      albumResponse.status(),
      `前提: アルバムが作られる (body=${await albumResponse.text()})`
    ).toBe(201);
    const album = (await albumResponse.json()) as { id?: string };
    assertPrepared(album.id, '作ったアルバムのID');
    albumId = album.id;
  });

  test('10MB に近い画像 1 枚のアップロードが画面と同じオリジンで成功する', async ({ page }) => {
    assertPrepared(albumId, 'アルバムID（事前準備のテスト）');
    await loginAsUser(page, 'ADMIN_USER');
    const headers = { Authorization: `Bearer ${await getAccessToken(page)}` };

    const image = buildPaddedJpeg(NEAR_LIMIT_SIZE);
    const form = new FormData();
    form.append(
      'images',
      new Blob([new Uint8Array(image)], { type: 'image/jpeg' }),
      'near-10mb.jpg'
    );

    const response = await page.request.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/construction-photos/${albumId}/images`,
      { headers, multipart: form, timeout: getTimeout(120000) }
    );

    expect(response.status(), `body=${await response.text()}`).toBe(201);
    const result = (await response.json()) as {
      successful: Array<{ id: string; fileName: string }>;
      failed: unknown[];
    };
    uploadedImageIds.push(...result.successful.map((photo) => photo.id));
    expect(result.failed).toEqual([]);
    expect(result.successful.map((photo) => photo.fileName)).toEqual(['near-10mb.jpg']);
  });

  test('10MB に近い画像 10 枚の一括アップロードが画面と同じオリジンで成功する', async ({
    page,
  }) => {
    assertPrepared(albumId, 'アルバムID（事前準備のテスト）');
    test.setTimeout(getTimeout(240000));
    await loginAsUser(page, 'ADMIN_USER');
    const headers = { Authorization: `Bearer ${await getAccessToken(page)}` };

    const image = new Uint8Array(buildPaddedJpeg(NEAR_LIMIT_SIZE));
    const fileNames = Array.from(
      { length: BACKEND_MAX_FILES },
      (_, index) => `bulk-near-10mb-${index + 1}.jpg`
    );
    const form = new FormData();
    for (const fileName of fileNames) {
      form.append('images', new Blob([image], { type: 'image/jpeg' }), fileName);
    }

    const response = await page.request.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/construction-photos/${albumId}/images`,
      { headers, multipart: form, timeout: getTimeout(180000) }
    );

    expect(response.status(), `body=${(await response.text()).slice(0, 500)}`).toBe(201);
    const result = (await response.json()) as {
      successful: Array<{ id: string; fileName: string }>;
      failed: unknown[];
    };
    uploadedImageIds.push(...result.successful.map((photo) => photo.id));
    expect(result.failed).toEqual([]);
    expect(result.successful.map((photo) => photo.fileName)).toEqual(fileNames);
  });

  test('10MB を超える画像を画面から送ると、backend のサイズ超過の文言が表示される', async ({
    page,
  }, testInfo) => {
    assertPrepared(albumId, 'アルバムID（事前準備のテスト）');
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto(`/construction-photos/${albumId}`);
    await expect(page.getByTestId('photo-uploader')).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByTestId('file-input')).toBeAttached({ timeout: getTimeout(10000) });

    // 画面の上限（50MB）より小さく backend の上限（10MB）より大きい、復号できないファイル。
    // 送信前の圧縮は復号できないファイルを元のまま送るため、10MB を超える本文が中継を通る
    const fileName = 'over-10mb.jpg';
    const oversizePath = testInfo.outputPath(fileName);
    fs.mkdirSync(path.dirname(oversizePath), { recursive: true });
    fs.writeFileSync(oversizePath, '');
    fs.truncateSync(oversizePath, BACKEND_MAX_FILE_SIZE + 512 * 1024);

    try {
      const uploadResponse = page.waitForResponse(
        (response) =>
          /^\/api\/construction-photos\/[^/]+\/images$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );
      await page.getByTestId('file-input').setInputFiles(oversizePath);
      const response = await uploadResponse;

      // 上限の判定は backend が行い、backend の問題の詳細（JSON）が画面のオリジンへ返る
      expect(new URL(response.url()).origin).toBe(APP_ORIGIN);
      expect(response.status()).toBe(413);
      expect(response.headers()['content-type']).toContain('application/json');
      const body = (await response.json()) as { code?: string; detail?: string };
      expect(body.code).toBe('FILE_SIZE_EXCEEDED');
      expect(body.detail).toBe(BACKEND_FILE_SIZE_EXCEEDED_DETAIL);

      // 画面には backend の文言が表示される
      const panel = page.getByTestId('pending-upload-panel');
      await expect(panel).toBeVisible({ timeout: getTimeout(20000) });
      const item = panel.getByTestId('pending-upload-item');
      await expect(item).toHaveCount(1);
      await expect(item).toHaveAttribute('data-kind', 'permanent');
      await expect(panel.getByTestId('pending-upload-filename')).toHaveText(fileName);
      await expect(panel.getByTestId('pending-upload-permanent-note')).toContainText(
        BACKEND_FILE_SIZE_EXCEEDED_DETAIL
      );
    } finally {
      fs.rmSync(oversizePath, { force: true });
    }
  });
});
