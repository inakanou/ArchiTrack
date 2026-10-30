/**
 * @fileoverview 見積依頼の詳細画面の出力（内訳書の Excel・現場調査報告書の PDF）の事前記録の E2E テスト
 *
 * estimate-request タスク103.2。design.md の「Requirement 42: 案件の閲覧範囲と出力の記録の適用」の章。
 * 見積依頼の詳細画面の出力は、生成を始める前に `POST /api/v1/audit-logs/exports`（user-authentication の
 * ExportAuditService）へ出力の記録を要求し、記録が成功したときだけ生成とダウンロードを始める。
 * 記録の要求が失敗したときは生成もダウンロードも始めず、エラーメッセージを表示する。
 *
 * Requirements coverage (estimate-request):
 * - REQ-42.8: 内訳書の Excel・現場調査報告書の PDF の出力は、生成の前に種別と案件を添えた出力の記録を
 *   1 回だけ要求し、その記録の応答が生成の始まりとダウンロードより前に返る
 * - REQ-42.9: 記録の要求が失敗すると生成もダウンロードも始まらず、
 *   「出力を記録できなかったため中止しました」が表示される
 * - REQ-42.13: 見積依頼文の本文のコピーと選択した項目の一覧のコピーは、種別と案件を添えた出力の記録を 1 回だけ
 *   要求し、記録の要求中はクリップボードが前の中身のまま、記録の成功の後にだけ中身が書き込まれる
 *   （タスク107.1。describe「見積依頼文と選択した項目の一覧のコピー・メールで開く操作の事前記録」）
 * - REQ-42.14: コピーの記録の要求が失敗するとクリップボードへ何も書き込まれず、エラーメッセージが表示される
 * - REQ-42.15: 「Gmailで開く」は記録の要求の後にだけ Gmail の作成画面を開く（記録の要求中は空のタブのまま）
 * - REQ-42.16: 「Gmailで開く」の記録の要求が失敗すると作成画面を開かず（空のタブは閉じる）、エラーメッセージが表示される
 *   （「メールで開く」は OS のメールクライアントを起動するため E2E では押さない。記録の後の起動は単体テストと
 *   本番ビルドの画面の実ブラウザの確認が受け持つ）
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * 現場調査報告書の生成の始まりは、報告書の描画が送る取得（画像の実体の fetch と注釈の取得）で観測する。
 * 出力対象の写真を決めるための現場調査の詳細の取得（`/api/site-surveys/:id`）は記録の前に行うため数えない。
 * 内訳書の Excel はブラウザの中で生成するため通信が無く、ダウンロードとの前後で観測する。
 *
 * 検証に使う案件・取引先・内訳書・見積依頼はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`、
 * 営業担当者と作成者は REGULAR_USER）、現場調査と写真は REGULAR_USER が API で作る（写真の実体を
 * ストレージに置くため）。
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
const FIXTURE_PNG = path.join(__dirname, '../../fixtures/test-image.png');

/** テストの中で作る案件・取引先の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-er-export-audit-';

/** 出力の記録の経路（user-authentication タスク53.3） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 記録の失敗で表示するエラーメッセージ（Requirement 42.9） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

/** 報告書の描画が送る注釈の取得の経路 */
const ANNOTATION_PATH_REGEX =
  /^\/api\/site-surveys\/(?:annotations\/batch|images\/[^/]+\/annotations)$/;

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * 出力の生成が送る取得か
 *
 * 画像の実体の取得（API 以外への fetch）と、注釈の取得を生成の始まりとして数える。
 * 画面の表示のための画像の読み込みは img 要素（resourceType が image）であり数えない。
 */
function isGenerationRequest(request: Request): boolean {
  if (request.resourceType() !== 'fetch') {
    return false;
  }
  const requestPath = pathOf(request.url());
  if (requestPath === null) {
    return false;
  }
  return !requestPath.startsWith('/api/') || ANNOTATION_PATH_REGEX.test(requestPath);
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

test.describe('見積依頼の詳細画面の出力の事前記録（内訳書の Excel・現場調査報告書の PDF）', () => {
  let projectId: string | null = null;
  let estimateRequestId: string | null = null;
  /** 選択済みの見積依頼の項目の ID（表示順） */
  let estimateRequestItemIds: string[] = [];
  let surveyId: string | null = null;
  /** 報告書の出力対象の写真の ID */
  let reportImageIds: string[] = [];

  /**
   * 事前準備: REGULAR_USER が営業担当者・作成者の案件に、項目 2 件を選んだ見積依頼と、
   * 報告書の出力対象の写真 1 枚を持つ現場調査を作る
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
        name: `${NAME_PREFIX}${suffix}`,
        salesPersonId: regularUser.id,
        createdById: regularUser.id,
      },
      select: { id: true },
    });
    projectId = project.id;
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${NAME_PREFIX}partner-${suffix}`,
        nameKana: 'イーツーイーシュツリョクキロク',
        address: '東京都千代田区1-1-1',
        email: 'e2e-er-export-audit-partner@example.com',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
      select: { id: true },
    });
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId: project.id,
        name: `出力の事前記録の内訳書 ${suffix}`,
        sourceQuantityTableId: `${NAME_PREFIX}${suffix}-qt`,
        sourceQuantityTableName: '出力の事前記録の数量表',
        items: {
          create: [
            { workType: '工種1', name: '名称1', unit: '式', quantity: 1, displayOrder: 1 },
            { workType: '工種2', name: '名称2', unit: 'm', quantity: 2, displayOrder: 2 },
          ],
        },
      },
      select: { id: true },
    });
    const statementItems = await prisma.itemizedStatementItem.findMany({
      where: { itemizedStatementId: statement.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    const estimateRequest = await prisma.estimateRequest.create({
      data: {
        projectId: project.id,
        tradingPartnerId: partner.id,
        itemizedStatementId: statement.id,
        name: `出力の事前記録の見積依頼 ${suffix}`,
        selectedItems: {
          create: statementItems.map((item) => ({
            itemizedStatementItemId: item.id,
            selected: true,
          })),
        },
      },
      select: { id: true },
    });
    estimateRequestId = estimateRequest.id;
    const selectedItems = await prisma.estimateRequestItem.findMany({
      where: { estimateRequestId: estimateRequest.id },
      select: { id: true, itemizedStatementItemId: true },
    });
    estimateRequestItemIds = statementItems.map((statementItem) => {
      const selected = selectedItems.find(
        (item) => item.itemizedStatementItemId === statementItem.id
      );
      assertPrepared(selected, '内訳書の項目に対応する見積依頼の項目');
      return selected.id;
    });
    expect(estimateRequestItemIds, '前提: 見積依頼の項目が 2 件選ばれている').toHaveLength(2);

    const apiContext = await playwrightRequest.newContext();
    try {
      const { accessToken } = await loginViaApi(apiContext, 'REGULAR_USER');
      assertPrepared(accessToken, 'REGULAR_USER のアクセストークン');
      const headers = { Authorization: `Bearer ${accessToken}` };

      const surveyResponse = await apiContext.post(
        `${API_BASE_URL}/api/projects/${project.id}/site-surveys`,
        { headers, data: { name: `出力の事前記録の現場調査 ${suffix}`, surveyDate: '2026-10-01' } }
      );
      expect(surveyResponse.status(), '前提: 現場調査を作れる').toBe(201);
      surveyId = ((await surveyResponse.json()) as { id: string }).id;

      const uploadResponse = await apiContext.post(
        `${API_BASE_URL}/api/site-surveys/${surveyId}/images`,
        {
          headers,
          multipart: {
            images: {
              name: 'export-audit-1.png',
              mimeType: 'image/png',
              buffer: fs.readFileSync(FIXTURE_PNG),
            },
          },
        }
      );
      expect(
        uploadResponse.ok(),
        `前提: 写真をアップロードできる (status=${uploadResponse.status()})`
      ).toBeTruthy();
      const uploaded = (await uploadResponse.json()) as { successful?: Array<{ id: string }> };
      const imageId = uploaded.successful?.[0]?.id;
      assertPrepared(imageId, 'アップロードした写真のID');

      const patchResponse = await apiContext.patch(
        `${API_BASE_URL}/api/site-surveys/images/${imageId}`,
        { headers, data: { includeInReport: true } }
      );
      expect(
        patchResponse.ok(),
        `前提: 写真を報告書の出力対象にできる (status=${patchResponse.status()})`
      ).toBeTruthy();
      const patched = (await patchResponse.json()) as { includeInReport?: boolean };
      expect(patched.includeInReport, '前提: 写真が報告書の出力対象になる').toBe(true);
      reportImageIds = [imageId];
    } finally {
      await apiContext.dispose();
    }
  });

  /**
   * 後始末: 作った案件（配下の内訳書・見積依頼・現場調査は連鎖で消える）と取引先を消す
   */
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /** 見積依頼の詳細画面を開き、表示が落ち着いてから観測を始める */
  async function openEstimateRequestDetail(page: Page) {
    assertPrepared(estimateRequestId, '事前準備で作成した見積依頼のID');
    await page.goto(`/estimate-requests/${estimateRequestId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(
      page.getByRole('button', { name: '選択された2件の項目をExcelでエクスポート' })
    ).toBeEnabled({ timeout: getTimeout(15000) });
    return observeExport(page);
  }

  /** 現場調査報告書の選択 UI を開き、事前準備の現場調査を選ぶ */
  async function selectSurveyForReport(page: Page) {
    assertPrepared(surveyId, '事前準備で作成した現場調査のID');
    await page.getByRole('button', { name: '現場調査報告書出力' }).click();
    const selector = page.locator('select').filter({ hasText: '現場調査を選択...' });
    await expect(selector).toBeVisible({ timeout: getTimeout(10000) });
    await selector.selectOption(surveyId);
  }

  /**
   * @requirement estimate-request/REQ-42.8
   */
  test('内訳書の Excel の出力が生成より前に出力の記録を1回要求する (estimate-request/REQ-42.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const observed = await openEstimateRequestDetail(page);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });
    await page.getByRole('button', { name: '選択された2件の項目をExcelでエクスポート' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/_\d{8}\.xlsx$/);

    expect(
      observed.recordStatuses,
      'REQ-42.8: 内訳書の Excel の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'estimate_request_xlsx',
      projectId,
      targetIds: estimateRequestItemIds,
      itemCount: 2,
    });

    // Excel はブラウザの中で生成してすぐダウンロードするため、記録の応答とダウンロードの前後で確かめる
    expect(
      observed.events.indexOf('record-response'),
      'REQ-42.8: 記録の応答が Excel のダウンロードより前に返る'
    ).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement estimate-request/REQ-42.9
   */
  test('出力の記録が失敗すると内訳書の Excel を生成せずエラーメッセージを表示する (estimate-request/REQ-42.9)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    const observed = await openEstimateRequestDetail(page);

    const excelButton = page.getByRole('button', {
      name: '選択された2件の項目をExcelでエクスポート',
    });
    await excelButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-42.9: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(excelButton, '記録の失敗の後は再び出力を始められる').toBeEnabled();

    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-42.9: 記録の失敗の後に Excel のダウンロードが始まらない'
    ).toEqual([]);
  });

  /**
   * @requirement estimate-request/REQ-42.8
   */
  test('現場調査報告書の PDF の出力が生成より前に出力の記録を1回要求する (estimate-request/REQ-42.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const observed = await openEstimateRequestDetail(page);
    await selectSurveyForReport(page);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(120000) });
    await page.getByRole('button', { name: '出力', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^現場調査報告書_\d{8}\.pdf$/);

    const firstGeneration = observed.events.indexOf('generation-request');
    expect(
      firstGeneration,
      '前提: 報告書の生成が画像の実体・注釈の取得を送る'
    ).toBeGreaterThanOrEqual(0);

    expect(
      observed.recordStatuses,
      'REQ-42.8: 現場調査報告書の PDF の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'site_survey_report_pdf',
      projectId,
      targetIds: reportImageIds,
      itemCount: 1,
    });

    const recordResponse = observed.events.indexOf('record-response');
    expect(recordResponse, 'REQ-42.8: 記録の応答が生成の始まりより前に返る').toBeLessThan(
      firstGeneration
    );
    expect(recordResponse).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement estimate-request/REQ-42.9
   */
  test('出力の記録が失敗すると現場調査報告書の PDF を生成せずエラーメッセージを表示する (estimate-request/REQ-42.9)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    const observed = await openEstimateRequestDetail(page);
    await selectSurveyForReport(page);

    const outputButton = page.getByRole('button', { name: '出力', exact: true });
    await outputButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-42.9: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(outputButton, '記録の失敗の後は再び出力を始められる').toBeEnabled();

    expect(
      observed.events.filter((event) => event === 'generation-request'),
      'REQ-42.9: 記録の失敗の後に報告書の生成（画像の実体・注釈の取得）が始まらない'
    ).toEqual([]);
    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-42.9: 記録の失敗の後にダウンロードが始まらない'
    ).toEqual([]);
  });
});

/** コピーの前にクリップボードへ入れておく中身（記録の失敗で変わらないことを確かめる） */
const PREVIOUS_CLIPBOARD = 'e2e-er-previous-clipboard-content';

/** Gmail の作成画面の URL の照合（外部への通信は route で止める） */
const GMAIL_URL_REGEX = /^https:\/\/mail\.google\.com\//;

/** クリップボードの中身を読む（Chromium に読み書きの権限を与えてある前提） */
async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(async () => navigator.clipboard.readText());
}

/** クリップボードへ前の中身を入れ、入ったことを確かめる */
async function seedClipboard(page: Page): Promise<void> {
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), PREVIOUS_CLIPBOARD);
  expect(await readClipboard(page), '前提: クリップボードに前の中身が入っている').toBe(
    PREVIOUS_CLIPBOARD
  );
}

/**
 * 記録の要求を止めておく（`release` で実際の backend へ通す）
 *
 * `arrived` は記録の要求が届いたときに解決する。
 */
async function holdExportRecords(page: Page) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markArrived!: () => void;
  const arrived = new Promise<void>((resolve) => {
    markArrived = resolve;
  });
  await page.route('**/api/v1/audit-logs/exports', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    markArrived();
    await gate;
    await route.continue();
  });
  return { arrived, release: () => release() };
}

test.describe('見積依頼文と選択した項目の一覧のコピー・メールで開く操作の事前記録', () => {
  /** テストの中で作る案件・取引先の名前の接頭辞（後始末で消す） */
  const COPY_PREFIX = `${NAME_PREFIX}copy-`;
  let projectId: string | null = null;
  let estimateRequestId: string | null = null;
  /** 選択済みの見積依頼の項目の ID（表示順） */
  let estimateRequestItemIds: string[] = [];

  /**
   * 事前準備: REGULAR_USER が営業担当者・作成者の案件に、メールアドレスのある取引先への
   * 項目 2 件を選んだ見積依頼（見積依頼方法はメール）を作る
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
        name: `${COPY_PREFIX}${suffix}`,
        salesPersonId: regularUser.id,
        createdById: regularUser.id,
      },
      select: { id: true },
    });
    projectId = project.id;
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${COPY_PREFIX}partner-${suffix}`,
        nameKana: 'イーツーイーコピーキロク',
        address: '東京都千代田区1-1-1',
        email: 'e2e-er-copy-audit-partner@example.com',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
      select: { id: true },
    });
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId: project.id,
        name: `コピーの事前記録の内訳書 ${suffix}`,
        sourceQuantityTableId: `${COPY_PREFIX}${suffix}-qt`,
        sourceQuantityTableName: 'コピーの事前記録の数量表',
        items: {
          create: [
            { workType: '工種1', name: '名称1', unit: '式', quantity: 1, displayOrder: 1 },
            { workType: '工種2', name: '名称2', unit: 'm', quantity: 2, displayOrder: 2 },
          ],
        },
      },
      select: { id: true },
    });
    const statementItems = await prisma.itemizedStatementItem.findMany({
      where: { itemizedStatementId: statement.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    const estimateRequest = await prisma.estimateRequest.create({
      data: {
        projectId: project.id,
        tradingPartnerId: partner.id,
        itemizedStatementId: statement.id,
        name: `コピーの事前記録の見積依頼 ${suffix}`,
        method: 'EMAIL',
        selectedItems: {
          create: statementItems.map((item) => ({
            itemizedStatementItemId: item.id,
            selected: true,
          })),
        },
      },
      select: { id: true },
    });
    estimateRequestId = estimateRequest.id;
    const selectedItems = await prisma.estimateRequestItem.findMany({
      where: { estimateRequestId: estimateRequest.id },
      select: { id: true, itemizedStatementItemId: true },
    });
    estimateRequestItemIds = statementItems.map((statementItem) => {
      const selected = selectedItems.find(
        (item) => item.itemizedStatementItemId === statementItem.id
      );
      assertPrepared(selected, '内訳書の項目に対応する見積依頼の項目');
      return selected.id;
    });
    expect(estimateRequestItemIds, '前提: 見積依頼の項目が 2 件選ばれている').toHaveLength(2);
  });

  test.afterAll(async () => {
    const prisma = getPrismaClient();
    await prisma.project.deleteMany({ where: { name: { startsWith: COPY_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: COPY_PREFIX } } });
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /** 見積依頼の詳細画面を開き、表示が落ち着いてから観測を始める */
  async function openDetail(page: Page) {
    assertPrepared(estimateRequestId, '事前準備で作成した見積依頼のID');
    await page.goto(`/estimate-requests/${estimateRequestId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('button', { name: 'クリップボードにコピー' })).toBeEnabled({
      timeout: getTimeout(15000),
    });
    return observeExport(page);
  }

  /** 見積依頼文のパネルを開き、本文が表示されるのを待つ */
  async function openTextPanel(page: Page) {
    await page.getByRole('button', { name: '見積依頼文を表示' }).click();
    const panel = page.getByRole('region', { name: '見積依頼文' });
    await expect(panel.getByRole('heading', { name: '見積依頼文' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(panel.locator('pre')).toBeVisible({ timeout: getTimeout(15000) });
    return panel;
  }

  /**
   * @requirement estimate-request/REQ-42.13
   */
  test('見積依頼文の本文のコピーは記録を種別・案件つきで1回要求し、記録の成功の後にだけクリップボードへ書き込む (estimate-request/REQ-42.13)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAsUser(page, 'REGULAR_USER');
    const held = await holdExportRecords(page);
    const observed = await openDetail(page);
    const panel = await openTextPanel(page);
    const bodyText = await panel.locator('pre').textContent();
    expect(bodyText, '前提: 見積依頼文の本文が表示されている').toBeTruthy();
    await seedClipboard(page);

    // 宛先・表題・本文の順のコピーのボタンのうち本文
    const bodyCopy = panel.getByRole('button', { name: 'コピー', exact: true }).nth(2);
    await bodyCopy.click();

    await held.arrived;
    // 記録の要求中: そのコピーのボタンは止まり、クリップボードは前の中身のまま
    await expect(bodyCopy).toBeDisabled();
    expect(
      await readClipboard(page),
      'REQ-42.13: 記録の応答より前にクリップボードへ書き込まれない'
    ).toBe(PREVIOUS_CLIPBOARD);

    held.release();

    await expect(
      panel.getByRole('button', { name: 'コピーしました', exact: true }),
      'REQ-42.13: 記録の成功の後にコピーが成功する'
    ).toBeVisible({ timeout: getTimeout(30000) });
    expect(
      observed.recordStatuses,
      'REQ-42.13: 本文のコピーが出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies).toEqual([
      {
        kind: 'estimate_request_text_clipboard',
        projectId,
        targetIds: [estimateRequestId],
        itemCount: 1,
      },
    ]);
    expect(
      await readClipboard(page),
      'REQ-42.13: 記録の成功の後に表示中の本文がそのまま書き込まれる'
    ).toBe(bodyText);
  });

  /**
   * @requirement estimate-request/REQ-42.13
   */
  test('選択した項目の一覧のコピーは記録を種別・案件・選択した項目つきで1回要求し、記録の成功の後にだけ書き込む (estimate-request/REQ-42.13)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAsUser(page, 'REGULAR_USER');
    const held = await holdExportRecords(page);
    const observed = await openDetail(page);
    await seedClipboard(page);

    const copyButton = page.getByRole('button', { name: 'クリップボードにコピー' });
    await copyButton.click();

    await held.arrived;
    await expect(copyButton).toBeDisabled();
    expect(
      await readClipboard(page),
      'REQ-42.13: 記録の応答より前にクリップボードへ書き込まれない'
    ).toBe(PREVIOUS_CLIPBOARD);

    held.release();

    await expect(
      page.getByRole('button', { name: 'コピーしました', exact: true }),
      'REQ-42.13: 記録の成功の後にコピーが成功する'
    ).toBeVisible({ timeout: getTimeout(30000) });
    expect(
      observed.recordStatuses,
      'REQ-42.13: 選択した項目の一覧のコピーが出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies).toEqual([
      {
        kind: 'estimate_request_items_clipboard',
        projectId,
        targetIds: estimateRequestItemIds,
        itemCount: 2,
      },
    ]);
    expect(
      await readClipboard(page),
      'REQ-42.13: 記録の成功の後に選択した 2 件がタブ区切りで書き込まれる'
    ).toBe(['\t工種1\t名称1\t\t式\t1', '\t工種2\t名称2\t\tm\t2'].join('\n'));
  });

  /**
   * @requirement estimate-request/REQ-42.14
   */
  test('本文のコピーの記録が失敗するとクリップボードへ何も書き込まず、パネルにエラーメッセージを表示する (estimate-request/REQ-42.14)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    await openDetail(page);
    const panel = await openTextPanel(page);
    await seedClipboard(page);

    const bodyCopy = panel.getByRole('button', { name: 'コピー', exact: true }).nth(2);
    await bodyCopy.click();

    await expect(
      panel.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-42.14: 記録の失敗で「${RECORD_FAILED_MESSAGE}」がパネルに表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(bodyCopy, '記録の失敗の後は再びコピーできる').toBeEnabled();
    expect(
      await readClipboard(page),
      'REQ-42.14: 記録の失敗ではクリップボードへ何も書き込まれず、前の中身のまま'
    ).toBe(PREVIOUS_CLIPBOARD);
    await expect(
      panel.getByRole('button', { name: 'コピーしました', exact: true }),
      'REQ-42.14: 記録の失敗でコピーの成功を表示しない'
    ).toHaveCount(0);
  });

  /**
   * @requirement estimate-request/REQ-42.14
   */
  test('選択した項目の一覧のコピーの記録が失敗するとクリップボードへ何も書き込まず、エラーメッセージを表示する (estimate-request/REQ-42.14)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    await openDetail(page);
    await seedClipboard(page);

    const copyButton = page.getByRole('button', { name: 'クリップボードにコピー' });
    await copyButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-42.14: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(copyButton, '記録の失敗の後は再びコピーできる').toBeEnabled();
    expect(
      await readClipboard(page),
      'REQ-42.14: 記録の失敗ではクリップボードへ何も書き込まれず、前の中身のまま'
    ).toBe(PREVIOUS_CLIPBOARD);
    await expect(
      page.getByRole('button', { name: 'コピーしました', exact: true }),
      'REQ-42.14: 記録の失敗でコピーの成功を表示しない'
    ).toHaveCount(0);
    // 書き込みの失敗の表示（ボタンの名前が「コピーに失敗しました」へ変わる）にならず、名前は元のまま
    await expect(
      copyButton,
      'REQ-42.14: 記録の失敗は書き込みの失敗の表示に代えて記録の失敗の文言で表示する'
    ).toHaveAccessibleName('クリップボードにコピー');
  });

  /**
   * @requirement estimate-request/REQ-42.15
   */
  test('「Gmailで開く」は記録を種別・案件つきで1回要求し、記録の成功の後にだけ Gmail の作成画面を開く (estimate-request/REQ-42.15)', async ({
    page,
    context,
  }) => {
    // 外部の Gmail へは通信させず、作成画面の要求を捕まえて空のページを返す
    const gmailRequests: Array<{ url: string; referer: string | undefined }> = [];
    const order: string[] = [];
    await context.route(GMAIL_URL_REGEX, async (route) => {
      gmailRequests.push({
        url: route.request().url(),
        referer: route.request().headers()['referer'],
      });
      order.push('gmail-request');
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>gmail-stub</title><p>gmail-stub</p>',
      });
    });
    await loginAsUser(page, 'REGULAR_USER');
    const held = await holdExportRecords(page);
    const observed = await openDetail(page);
    page.on('response', (response) => {
      if (pathOf(response.url()) === RECORD_PATH && response.request().method() === 'POST') {
        order.push('record-response');
      }
    });
    const panel = await openTextPanel(page);

    const gmailButton = panel.getByRole('button', { name: 'Gmailで開く' });
    await expect(gmailButton).toBeEnabled();
    const popupPromise = context.waitForEvent('page', { timeout: getTimeout(10000) });
    await gmailButton.click();
    const popup = await popupPromise;

    await held.arrived;
    // 記録の要求中: 両ボタンが止まり、開いたタブは空のまま（作成画面の要求は出ていない）
    await expect(gmailButton).toBeDisabled();
    await expect(panel.getByRole('link', { name: 'メールで開く' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(gmailRequests, 'REQ-42.15: 記録の応答より前に Gmail の作成画面を開かない').toEqual([]);

    held.release();

    await expect
      .poll(() => gmailRequests.length, {
        message: 'REQ-42.15: 記録の成功の後に Gmail の作成画面を開く',
        timeout: getTimeout(30000),
      })
      .toBe(1);
    await expect(popup).toHaveURL(GMAIL_URL_REGEX, { timeout: getTimeout(10000) });
    const gmailUrl = new URL(gmailRequests[0]!.url);
    expect(gmailUrl.searchParams.get('view')).toBe('cm');
    expect(gmailUrl.searchParams.get('to')).toBe('e2e-er-copy-audit-partner@example.com');
    expect(
      order.indexOf('record-response'),
      'REQ-42.15: 記録の応答が作成画面の要求より前に返る'
    ).toBeLessThan(order.indexOf('gmail-request'));
    expect(
      observed.recordStatuses,
      'REQ-42.15: 「Gmailで開く」が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies).toEqual([
      {
        kind: 'estimate_request_text_mail',
        projectId,
        targetIds: [estimateRequestId],
        itemCount: 1,
      },
    ]);
    // 従来の noopener,noreferrer の保ち方: 作成画面へ参照元を送らず、作成画面から元の画面を参照できない
    expect(gmailRequests[0]!.referer, '作成画面の要求に参照元を付けない').toBeUndefined();
    expect(
      await popup.evaluate(() => ({ opener: window.opener === null, referrer: document.referrer })),
      '作成画面から元の画面を参照できない'
    ).toEqual({ opener: true, referrer: '' });
    await expect(gmailButton).toBeEnabled();
    await popup.close();
  });

  /**
   * @requirement estimate-request/REQ-42.16
   */
  test('「Gmailで開く」の記録が失敗すると作成画面を開かずに空のタブを閉じ、エラーメッセージを表示する (estimate-request/REQ-42.16)', async ({
    page,
    context,
  }) => {
    const gmailRequests: string[] = [];
    await context.route(GMAIL_URL_REGEX, async (route) => {
      gmailRequests.push(route.request().url());
      await route.abort();
    });
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    await openDetail(page);
    const panel = await openTextPanel(page);

    const gmailButton = panel.getByRole('button', { name: 'Gmailで開く' });
    const popupPromise = context.waitForEvent('page', { timeout: getTimeout(10000) });
    await gmailButton.click();
    const popup = await popupPromise;

    await expect(
      panel.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-42.16: 記録の失敗で「${RECORD_FAILED_MESSAGE}」がパネルに表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    await expect
      .poll(() => popup.isClosed(), {
        message: 'REQ-42.16: 記録の失敗で先に開いた空のタブを閉じる',
        timeout: getTimeout(10000),
      })
      .toBe(true);
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    expect(gmailRequests, 'REQ-42.16: 記録の失敗では Gmail の作成画面を開かない').toEqual([]);
    await expect(gmailButton, '記録の失敗の後は再び操作できる').toBeEnabled();
  });
});
