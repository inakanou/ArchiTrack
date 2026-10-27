/**
 * @fileoverview 工事写真の出力（工事写真台帳の PDF・写真項目画像の一括 ZIP）の事前記録の E2E テスト
 *
 * construction-photo タスク30.3。design.md の「Requirement 21: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の画面の出力は、生成を始める前に `POST /api/v1/audit-logs/exports`（user-authentication の
 * ExportAuditService）へ出力の記録を要求し、記録が成功したときだけ生成とダウンロードを始める。
 * 記録の要求が失敗したときは生成もダウンロードも始めず、エラーメッセージを表示する。
 *
 * Requirements coverage (construction-photo):
 * - REQ-21.8: 工事写真台帳の PDF・写真項目画像の一括 ZIP の出力は、生成の前に種別と案件を添えた
 *   出力の記録を 1 回だけ要求し、その記録の応答が生成の始まりとダウンロードより前に返る
 * - REQ-21.9: 記録の要求が失敗すると生成もダウンロードも始まらず、
 *   「出力を記録できなかったため中止しました」が表示される
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * 生成の始まりは、出力の処理が送る取得（台帳の PDF は会社情報と印字画像、一括 ZIP は印字画像）で観測する。
 * 画面の一覧のサムネイルの読み込みは img 要素（resourceType が image）であり数えない。
 *
 * 検証に使う案件・アルバムはテストの中で DB に作り（名前の接頭辞 `PROJECT_NAME_PREFIX`、営業担当者と
 * 作成者は REGULAR_USER）、写真項目は REGULAR_USER が API でアップロードして作る（印字画像を実ストレージに
 * 置くため）。印刷対象の指定は DB で行う。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  test,
  expect,
  request as playwrightRequest,
  type Page,
  type Request,
} from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { loginAsUser } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { TEST_USERS } from '../../helpers/test-users';
import { assertPrepared } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const PROJECT_NAME_PREFIX = 'e2e-photo-export-audit-';

/** 出力の記録の経路（user-authentication タスク53.3） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 記録の失敗で表示するエラーメッセージ（Requirement 21.9） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

/** 出力の生成が送る取得の経路（会社情報、写真項目の印字画像・原本） */
const GENERATION_PATH_REGEX =
  /^\/api\/(?:company-info|construction-photos\/images\/[^/]+\/(?:print-image|original))$/;

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** 出力の生成が送る取得か（画面の表示のための img 要素の読み込みは数えない） */
function isGenerationRequest(request: Request): boolean {
  if (request.resourceType() !== 'fetch' && request.resourceType() !== 'xhr') {
    return false;
  }
  const requestPath = pathOf(request.url());
  return requestPath !== null && GENERATION_PATH_REGEX.test(requestPath);
}

/** 出力の操作で観測した出来事 */
type ExportEvent = 'record-request' | 'record-response' | 'generation-request' | 'download';

/** 出力の操作の観測を始める（画面の読み込みが落ち着いてから呼ぶ） */
function observeExport(page: Page) {
  const events: ExportEvent[] = [];
  const recordRequestBodies: unknown[] = [];
  const recordStatuses: number[] = [];

  page.on('request', (request) => {
    const requestPath = pathOf(request.url());
    if (requestPath === RECORD_PATH && request.method() === 'POST') {
      events.push('record-request');
      recordRequestBodies.push(request.postDataJSON());
    } else if (isGenerationRequest(request)) {
      events.push('generation-request');
    }
  });
  page.on('response', (response) => {
    if (pathOf(response.url()) === RECORD_PATH && response.request().method() === 'POST') {
      events.push('record-response');
      recordStatuses.push(response.status());
    }
  });
  page.on('download', () => {
    events.push('download');
  });

  return { events, recordRequestBodies, recordStatuses };
}

/** 記録の要求だけを 500（記録の失敗）にし、要求の回数を返す関数を返す */
async function failExportRecords(page: Page): Promise<() => number> {
  let attempts = 0;
  await page.route('**/api/v1/audit-logs/exports', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    attempts += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Export record failed', code: 'EXPORT_RECORD_FAILED' }),
    });
  });
  return () => attempts;
}

test.describe('工事写真の出力の事前記録（工事写真台帳の PDF・写真項目画像の一括 ZIP）', () => {
  let projectId: string | null = null;
  let albumId: string | null = null;
  /** 写真項目の ID（表示順） */
  let photoIds: string[] = [];

  /**
   * 事前準備: REGULAR_USER が営業担当者・作成者の案件とアルバムを作り、写真項目を 2 枚アップロードして
   * 両方を印刷対象にする
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    const regularUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.REGULAR_USER.email },
      select: { id: true },
    });
    const suffix = `${Date.now()}`;
    const project = await prisma.project.create({
      data: {
        name: `${PROJECT_NAME_PREFIX}${suffix}`,
        salesPersonId: regularUser.id,
        createdById: regularUser.id,
      },
      select: { id: true },
    });
    projectId = project.id;
    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId: project.id, name: `出力の事前記録のアルバム ${suffix}` },
      select: { id: true },
    });
    albumId = album.id;

    const apiContext = await playwrightRequest.newContext();
    try {
      const { accessToken } = await loginViaApi(apiContext, 'REGULAR_USER');
      assertPrepared(accessToken, 'REGULAR_USER のアクセストークン');
      const uploaded: string[] = [];
      for (const name of ['export-audit-1.jpg', 'export-audit-2.jpg']) {
        const response = await apiContext.post(
          `${API_BASE_URL}/api/construction-photos/${album.id}/images`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            multipart: {
              images: { name, mimeType: 'image/jpeg', buffer: fs.readFileSync(FIXTURE_JPG) },
            },
          }
        );
        expect(response.status(), `前提: 写真のアップロード（${name}）`).toBe(201);
        const body = (await response.json()) as { successful: Array<{ id: string }> };
        uploaded.push(body.successful[0]!.id);
      }
      photoIds = uploaded;
    } finally {
      await apiContext.dispose();
    }

    await prisma.constructionPhoto.updateMany({
      where: { id: { in: photoIds } },
      data: { includeInReport: true },
    });
    const stored = await prisma.constructionPhoto.findMany({
      where: { albumId: album.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    expect(
      stored.map((photo) => photo.id),
      '前提: 写真項目がアップロードの順に並ぶ'
    ).toEqual(photoIds);
  });

  /**
   * 後始末: 作った写真項目・アルバム・案件を消す
   */
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    const projects = await prisma.project.findMany({
      where: { name: { startsWith: PROJECT_NAME_PREFIX } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    await prisma.constructionPhoto.deleteMany({
      where: { album: { projectId: { in: projectIds } } },
    });
    await prisma.constructionPhotoAlbum.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /** アルバムの詳細画面を開き、写真項目の表示が落ち着いてから観測を始める */
  async function openAlbumDetail(page: Page) {
    assertPrepared(albumId, '事前準備で作成したアルバムのID');
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });
    return observeExport(page);
  }

  /** 全件エクスポートの設定のダイアログを開く */
  async function openBulkExportDialog(page: Page) {
    await page.getByRole('button', { name: '全件エクスポート' }).click();
    const settingsDialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(settingsDialog).toBeVisible({ timeout: getTimeout(10000) });
    return settingsDialog;
  }

  /**
   * @requirement construction-photo/REQ-21.8
   */
  test('工事写真台帳の PDF の出力が生成より前に出力の記録を1回要求する (construction-photo/REQ-21.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const observed = await openAlbumDetail(page);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await page.getByRole('button', { name: 'PDF出力' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const firstGeneration = observed.events.indexOf('generation-request');
    expect(
      firstGeneration,
      '前提: 台帳の生成が会社情報・印字画像の取得を送る'
    ).toBeGreaterThanOrEqual(0);

    expect(
      observed.recordStatuses,
      'REQ-21.8: 台帳の PDF の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'construction_photo_ledger_pdf',
      projectId,
      targetIds: photoIds,
      itemCount: 2,
    });

    const recordResponse = observed.events.indexOf('record-response');
    expect(recordResponse, 'REQ-21.8: 記録の応答が生成の始まりより前に返る').toBeLessThan(
      firstGeneration
    );
    expect(recordResponse).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement construction-photo/REQ-21.9
   */
  test('出力の記録が失敗すると工事写真台帳の PDF を生成せずエラーメッセージを表示する (construction-photo/REQ-21.9)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    const observed = await openAlbumDetail(page);

    const pdfButton = page.getByRole('button', { name: 'PDF出力' });
    await pdfButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-21.9: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求の 500 は API クライアントの再試行の対象のため、回数は 1 回に限らない
    expect(recordAttempts(), '記録の要求が送られ、失敗の応答を受けている').toBeGreaterThan(0);
    await expect(pdfButton).toBeEnabled();

    expect(
      observed.events.filter((event) => event === 'generation-request'),
      'REQ-21.9: 記録の失敗の後に台帳の生成（会社情報・印字画像の取得）が始まらない'
    ).toEqual([]);
    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-21.9: 記録の失敗の後にダウンロードが始まらない'
    ).toEqual([]);
  });

  /**
   * @requirement construction-photo/REQ-21.8
   */
  test('写真項目画像の一括 ZIP の出力が生成より前に出力の記録を1回要求する (construction-photo/REQ-21.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const observed = await openAlbumDetail(page);
    const settingsDialog = await openBulkExportDialog(page);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await settingsDialog.getByRole('button', { name: '開始' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    const firstGeneration = observed.events.indexOf('generation-request');
    expect(firstGeneration, '前提: 一括 ZIP の生成が印字画像の取得を送る').toBeGreaterThanOrEqual(
      0
    );

    expect(
      observed.recordStatuses,
      'REQ-21.8: 一括 ZIP の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'construction_photos_zip',
      projectId,
      targetIds: photoIds,
      itemCount: 2,
    });

    const recordResponse = observed.events.indexOf('record-response');
    expect(recordResponse, 'REQ-21.8: 記録の応答が生成の始まりより前に返る').toBeLessThan(
      firstGeneration
    );
    expect(recordResponse).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement construction-photo/REQ-21.9
   */
  test('出力の記録が失敗すると写真項目画像の一括 ZIP を生成せずエラーメッセージを表示する (construction-photo/REQ-21.9)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    const observed = await openAlbumDetail(page);
    const settingsDialog = await openBulkExportDialog(page);

    const startButton = settingsDialog.getByRole('button', { name: '開始' });
    await startButton.click();

    await expect(
      settingsDialog.getByRole('alert'),
      `REQ-21.9: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toContainText(RECORD_FAILED_MESSAGE, { timeout: getTimeout(30000) });
    // 記録の要求の 500 は API クライアントの再試行の対象のため、回数は 1 回に限らない
    expect(recordAttempts(), '記録の要求が送られ、失敗の応答を受けている').toBeGreaterThan(0);
    await expect(startButton).toBeEnabled();
    await expect(page.getByRole('dialog', { name: /一括エクスポート処理中/ })).toHaveCount(0);

    expect(
      observed.events.filter((event) => event === 'generation-request'),
      'REQ-21.9: 記録の失敗の後に生成（印字画像の取得）が始まらない'
    ).toEqual([]);
    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-21.9: 記録の失敗の後にダウンロードが始まらない'
    ).toEqual([]);
  });
});
