/**
 * @fileoverview 外部の AI での読み取り（Claude Vision）の確認・停止・権限・上限と、受領見積書のプレビューの開き直しの E2E テスト
 *
 * estimate-request タスク120.2。design.md の章「Requirements 43-50: 受領見積書の台帳の項目と IPA の是正
 * （2026-11-08 の追加）」の Testing Strategy の E2E と、D7（Vision の送信の可否）・D8（設定の保存）・D12（署名付き URL）。
 * 実際の画面を通して、次を確かめる。
 *
 * - 受領見積書の PDF の OCR を始めると、送る前に確認が出て、三つの選択がそれぞれの読み方になること
 *   （送る: 抽出の要求がちょうど一件、端末: 抽出の要求が零件で端末の読み取りが走る、閉じる・Escape: OCR を始めず
 *   「OCR実行」の状態に戻る）
 * - 管理者がシステム設定の画面で外部の AI での読み取りを止めると、利用者の OCR は確認を出さずに停止の文言を出して
 *   端末で読み、抽出の経路は直接の要求も 503 で拒むこと。再開すると戻ること（変更は監査ログに残る）
 * - 専用の権限の無い利用者の OCR は確認を出さずに端末で読み、抽出の経路は 403 で拒むこと
 * - 利用者ごとの上限の 429 を受けると、上限の文言を出して端末で読むこと
 * - 受領見積書のプレビューを閉じて開き直すと、そのたびにプレビューの URL を取り直すこと
 *
 * 状態の模擬について: E2E の環境の backend は外部の AI の鍵（ANTHROPIC_API_KEY）を持たないため、状態は
 * `not_configured` になり確認が出ない。確認の三つの選択と上限の 429 は、`page.route` で状態の API を `available` に
 * 差し替え（e2e/helpers/claude-vision-consent.ts）、抽出の API を成功・429 に差し替えて決定論的にする。
 * 管理者の停止と権限なしは状態を差し替えず、本物の backend の状態で確かめる（理由の判定の順が
 * 停止 → 権限なし → 未設定のため、鍵が無くても停止と権限なしが返る。タスク119.1 の申し送り）。
 *
 * 全体の設定について: 外部の AI での読み取りの設定は全体で 1 行を共有する。停止の試験は直列で流し、
 * `afterEach` で API から有効へ戻す（タスク116.1 の申し送り）。
 *
 * 利用者の上限について: 回数制限は NODE_ENV=test では外れるため、上限の文言は 429 の応答の模擬で確かめる
 * （タスク116.2 の申し送り。上限そのものは経路の単体と統合が持つ）。
 *
 * 送信の記録（49.7）と URL の秒数（50.1）はこのファイルでは確かめない（除外の登録はタスク120.3）。
 *
 * 被覆する受入基準は各テストの `@requirement` の印が名乗る（印の無い受入基準は名乗らない）。
 * 検証に使う案件・取引先・見積依頼・受領見積書はテストの中で作り（名前の接頭辞 `NAME_PREFIX`）、利用者は
 * テストの中で作る一意のメールアドレスの利用者とする。DB の主張は自分の行に絞り、DB 全体の件数を主張しない。
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page, type Request } from '@playwright/test';
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
import {
  CLAUDE_VISION_STATUS_PATH,
  chooseSendToExternalAi,
  routeClaudeVisionStatusAvailable,
} from '../../helpers/claude-vision-consent';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件・取引先・見積依頼・受領見積書の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-cv-consent-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-cv-consent-role-';

/** テキスト入りの 2 ページの PDF（端末の読み取りは文字の層から本文を取り出す） */
const TEXT_PDF = 'e2e/fixtures/test-text-pdf.pdf';

/** 上の PDF の 1 ページ目の本文（端末で読み取ったことの観測に使う） */
const TEXT_PDF_PAGE1_TEXT = 'Test PDF Document - Page 1';

/** 抽出の API のパス */
const EXTRACT_PATH = '/api/claude-vision/extract';

/** 管理者の設定の API のパス */
const EXTERNAL_AI_READING_SETTING_PATH = '/api/v1/admin/settings/external-ai-reading';

/** 受入基準 49.4 の逐語（画面の知らせ） */
const DISABLED_BY_ADMIN_NOTICE = '外部のAIでの読み取りはシステム管理者により停止されています';

/** 受入基準 49.8 の逐語（画面の知らせ） */
const USER_RATE_LIMITED_NOTICE =
  '外部のAIでの読み取りの回数の上限に達したため、端末で読み取りました。しばらく待ってから再度お試しください';

/** 確認のダイアログの名前（本番の vision-consent-messages.ts の TITLE） */
const CONSENT_DIALOG_NAME = '外部のAIでの読み取りの確認';

/** 抽出の成功の模擬の明細行（Claude Vision の応答の形） */
const MOCK_VISION_LINE_ITEM = {
  customCategory: null,
  workType: '土工',
  name: '模擬の掘削工',
  specification: 'バックホウ',
  unit: 'm3',
  quantity: 10,
  unitPrice: 2500,
  amount: 25000,
  remarks: null,
};

/** 最小の 1x1 の PNG（抽出の経路へ直接送る本文に使う） */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

// ============================================================================
// DB の前提
// ============================================================================

/** 協力業者の取引先を DB に作る */
async function createPartner(label: string): Promise<{ id: string; name: string }> {
  return getPrismaClient().tradingPartner.create({
    data: {
      name: `${NAME_PREFIX}業者-${label}-${uniqueSuffix()}`,
      nameKana: 'イーツーイーシーブイギョウシャ',
      address: '東京都千代田区1-1-1',
      email: 'e2e-cv-consent-partner@example.com',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true, name: true },
  });
}

/**
 * 利用者を営業担当者・作成者とする案件と、内訳書の全項目を選んだ見積依頼を DB に作る
 * （利用者の閲覧範囲に入る）
 */
async function createEstimateRequestFor(owner: CreatedUser, label: string): Promise<string> {
  const prisma = getPrismaClient();
  const partner = await createPartner(label);
  const project = await prisma.project.create({
    data: {
      name: `${NAME_PREFIX}${label}-${uniqueSuffix()}`,
      salesPersonId: owner.id,
      createdById: owner.id,
    },
    select: { id: true },
  });
  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId: project.id,
      name: `外部の AI の検証の内訳書 ${label}`,
      sourceQuantityTableId: `${NAME_PREFIX}${label}-qt`,
      sourceQuantityTableName: `${label} の数量表`,
      items: {
        create: [{ workType: '土工', name: '掘削', unit: 'm3', quantity: 10, displayOrder: 1 }],
      },
    },
    select: { id: true },
  });
  const items = await prisma.itemizedStatementItem.findMany({
    where: { itemizedStatementId: statement.id },
    select: { id: true },
  });
  const created = await prisma.estimateRequest.create({
    data: {
      projectId: project.id,
      tradingPartnerId: partner.id,
      itemizedStatementId: statement.id,
      name: `${NAME_PREFIX}見積依頼-${label}-${uniqueSuffix()}`,
      selectedItems: {
        create: items.map((item) => ({ itemizedStatementItemId: item.id, selected: true })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * 一般のロール（`user`）の権限から外部の AI での読み取りの専用の権限（claude_vision:use）だけを除いた
 * ロールの利用者を作る（見積依頼の閲覧・更新はできるため、受領見積書のフォームを開いて OCR を始められる）
 */
async function createUserWithoutClaudeVision(): Promise<CreatedUser> {
  const prisma = getPrismaClient();
  const userRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'user' },
    select: { rolePermissions: { select: { permission: true } } },
  });
  const kept = userRole.rolePermissions
    .map((rp) => rp.permission)
    .filter((p) => !(p.resource === 'claude_vision' && p.action === 'use'));
  // 前提: 受領見積書のフォームを開ける権限を持ち、専用の権限を持たない
  expect(
    kept.some((p) => p.resource === 'estimate_request' && p.action === 'read'),
    '前提: 一般のロールが見積依頼の閲覧の権限を持つ'
  ).toBe(true);
  expect(
    kept.some((p) => p.resource === 'estimate_request' && p.action === 'update'),
    '前提: 一般のロールが見積依頼の更新の権限を持つ'
  ).toBe(true);
  expect(
    userRole.rolePermissions.length - kept.length,
    '前提: 一般のロールが外部の AI での読み取りの権限を一つ持つ（除いた数）'
  ).toBe(1);

  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${uniqueSuffix()}`,
      description: 'E2E 外部の AI での読み取りの権限なしの検証',
      priority: 0,
      isSystem: false,
      rolePermissions: { create: kept.map((p) => ({ permissionId: p.id })) },
    },
    select: { name: true },
  });
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}cv-consent-noperm-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: '外部の AI の権限なしの検証',
    roles: [role.name],
  });
}

// ============================================================================
// 設定の API
// ============================================================================

interface ExternalAiReadingSetting {
  enabled: boolean;
  version: number;
}

/** 管理者のトークンで設定を読む */
async function readSetting(
  request: APIRequestContext,
  adminToken: string
): Promise<ExternalAiReadingSetting> {
  const res = await request.get(`${API_BASE_URL}${EXTERNAL_AI_READING_SETTING_PATH}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(res.status(), '設定の取得').toBe(200);
  return (await res.json()) as ExternalAiReadingSetting;
}

/** 管理者のトークンで設定を変える（版は今の版を読んで送る） */
async function writeSetting(
  request: APIRequestContext,
  adminToken: string,
  enabled: boolean
): Promise<ExternalAiReadingSetting> {
  const current = await readSetting(request, adminToken);
  const res = await request.put(`${API_BASE_URL}${EXTERNAL_AI_READING_SETTING_PATH}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { enabled, version: current.version },
  });
  expect(res.status(), '設定の変更').toBe(200);
  return (await res.json()) as ExternalAiReadingSetting;
}

/** 利用者のトークンで状態の API を読む（本物の backend） */
async function readStatusViaApi(
  request: APIRequestContext,
  token: string
): Promise<{ available: boolean; reason: string | null }> {
  const res = await request.get(`${API_BASE_URL}${CLAUDE_VISION_STATUS_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status(), '状態の取得').toBe(200);
  return (await res.json()) as { available: boolean; reason: string | null };
}

/** 利用者のトークンで抽出の経路へ直接送る（受領見積書の読み取りの本文） */
async function postExtractDirectly(request: APIRequestContext, token: string) {
  return request.post(`${API_BASE_URL}${EXTRACT_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { images: [{ base64Data: MINIMAL_PNG_BASE64, mediaType: 'image/png' }] },
  });
}

/** 外部の AI での読み取りの設定の変更の監査ログ（自分の変更を、前からあった行と区別するために ID で引く） */
const SETTING_CHANGE_LOG_WHERE = {
  action: 'OPERATIONAL_SETTING_CHANGED',
  targetType: 'SystemSetting',
  targetId: 'externalAiReading',
} as const;

/** 今ある設定の変更の監査ログの ID */
async function settingChangeLogIds(): Promise<string[]> {
  const rows = await getPrismaClient().auditLog.findMany({
    where: SETTING_CHANGE_LOG_WHERE,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** 指定の ID より後に増えた設定の変更の監査ログ（実行者・変更の前後） */
async function settingChangeLogsAfter(knownIds: string[]) {
  return getPrismaClient().auditLog.findMany({
    where: { ...SETTING_CHANGE_LOG_WHERE, id: { notIn: knownIds } },
    select: { actorId: true, before: true, after: true },
  });
}

/** 共有の管理者の利用者の ID */
async function adminUserId(): Promise<string> {
  const admin = await getPrismaClient().user.findUniqueOrThrow({
    where: { email: TEST_USERS.ADMIN_USER.email },
    select: { id: true },
  });
  return admin.id;
}

// ============================================================================
// 画面の操作と観測
// ============================================================================

/** 画面が出した抽出の要求を数える（差し替えた要求も、本物へ届く要求も数える） */
function recordExtractRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === EXTRACT_PATH) {
      seen.push(req);
    }
  });
  return seen;
}

/** 抽出の API の応答を差し替え、差し替えた件数を返す関数を返す */
async function routeExtract(
  page: Page,
  status: number,
  body: Record<string, unknown>
): Promise<() => number> {
  let count = 0;
  await page.route(`**${EXTRACT_PATH}`, async (route) => {
    count += 1;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return () => count;
}

/** 見積依頼の詳細を開き、受領見積書の登録のフォームを開く */
async function openRegisterFormOnDetail(page: Page, estimateRequestId: string): Promise<void> {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  await page.getByRole('button', { name: '受領見積書登録', exact: true }).click();
  await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });
}

/** 受領見積書のフォームへテキスト入りの PDF を添える（OCR が自動で始まる） */
async function attachTextPdf(page: Page): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_PDF);
}

/** 状態の API の次の応答を待つ（本物の backend の応答の本文を返す） */
function waitForStatusResponse(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' && new URL(r.url()).pathname === CLAUDE_VISION_STATUS_PATH,
    { timeout: getTimeout(30000) }
  );
}

/** 確認のダイアログ */
function consentDialog(page: Page) {
  return page.getByRole('dialog', { name: CONSENT_DIALOG_NAME });
}

/** 端末で読み取った本文（PDF の文字の層の 1 ページ目）が抽出の結果に出るまで待つ */
async function expectReadOnDevice(page: Page): Promise<void> {
  await expect(page.getByTestId('ocr-extracted-text')).toContainText(TEXT_PDF_PAGE1_TEXT, {
    timeout: getTimeout(60000),
  });
  // Claude Vision の成功の知らせは出ていない（端末の読み取りの結果である）
  await expect(page.getByTestId('claude-vision-info-banner')).toHaveCount(0);
}

// ============================================================================
// テスト
// ============================================================================

test.describe('外部の AI での読み取りの確認・停止・権限・上限と、受領見積書のプレビューの開き直し', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ request }) => {
    // 全体の設定を必ず有効へ戻す（同じ実行の他の E2E へ停止を漏らさない。タスク116.1）
    const { accessToken: adminToken } = await loginViaApi(request, 'ADMIN_USER');
    const setting = await readSetting(request, adminToken);
    if (!setting.enabled) {
      await writeSetting(request, adminToken, true);
    }

    const prisma = getPrismaClient();
    await prisma.receivedQuotation.deleteMany({
      where: {
        OR: [
          { project: { name: { startsWith: NAME_PREFIX } } },
          { name: { startsWith: NAME_PREFIX } },
        ],
      },
    });
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  // --------------------------------------------------------------------------
  // 確認の三つの選択（状態は available に差し替える）
  // --------------------------------------------------------------------------

  /**
   * @requirement estimate-request/REQ-24.2
   * @requirement estimate-request/REQ-49.1
   */
  test('PDF の OCR を始めると送る前に確認が出て、送って読み取ると抽出の要求がちょうど一件出て結果が出る', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const estimateRequestId = await createEstimateRequestFor(owner, 'send');
    const statusCount = await routeClaudeVisionStatusAvailable(page);
    const extractCount = await routeExtract(page, 200, {
      lineItems: [MOCK_VISION_LINE_ITEM],
      pageCount: 2,
    });
    const extractRequests = recordExtractRequests(page);

    await loginAsUser(page, owner);
    await openRegisterFormOnDetail(page, estimateRequestId);
    await attachTextPdf(page);

    // 確認が出て、外部の AI（Anthropic 社の Claude）へ送ることを告げ、二つの読み方を選ばせる
    const dialog = consentDialog(page);
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    await expect(dialog).toContainText(
      'ページの画像を外部のAIサービス（Anthropic社のClaude）へ送って読み取ります。'
    );
    await expect(dialog.getByRole('button')).toHaveText([
      '送って読み取る',
      '送らずに端末で読み取る',
      '閉じる',
    ]);
    expect(statusCount(), '確認の前に状態の API が読まれていない').toBeGreaterThan(0);
    // 確認に答えるまでは外部へ送らない
    expect(extractRequests, '確認に答える前に抽出の要求が出た').toHaveLength(0);

    await chooseSendToExternalAi(page);

    // PDF のページを送って Claude Vision の結果を出す（24.2）
    await expect(page.getByTestId('claude-vision-info-banner')).toContainText(
      'Claude Vision APIで抽出しました',
      { timeout: getTimeout(30000) }
    );
    await expect(page.getByTestId('ocr-extracted-text')).toContainText(MOCK_VISION_LINE_ITEM.name);
    expect(extractRequests, '抽出の要求がちょうど一件ではない').toHaveLength(1);
    expect(extractCount()).toBe(1);
    const sent = extractRequests[0]!.postDataJSON() as { images: unknown[] };
    expect(sent.images, 'PDF の 2 ページを画像にして送る').toHaveLength(2);
  });

  /**
   * @requirement estimate-request/REQ-49.2
   */
  test('確認で送らずに端末で読み取ると、抽出の要求を出さずに端末の OCR で読み取る', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const estimateRequestId = await createEstimateRequestFor(owner, 'device');
    await routeClaudeVisionStatusAvailable(page);
    const extractRequests = recordExtractRequests(page);

    await loginAsUser(page, owner);
    await openRegisterFormOnDetail(page, estimateRequestId);
    await attachTextPdf(page);

    const dialog = consentDialog(page);
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    await dialog.getByRole('button', { name: '送らずに端末で読み取る', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // 端末の OCR（PDF の文字の層の抽出）の結果が出る
    await expectReadOnDevice(page);
    // 端末を選んだときは切り替えの知らせも停止・上限の知らせも出さない
    await expect(page.getByTestId('fallback-warning-banner')).toHaveCount(0);
    await expect(page.getByTestId('vision-reading-notice')).toHaveCount(0);
    expect(extractRequests, '端末を選んだのに抽出の要求が出た').toHaveLength(0);
  });

  /**
   * @requirement estimate-request/REQ-49.3
   * @requirement estimate-request/REQ-49.1
   */
  test('確認を閉じる・Escape で閉じると OCR を始めず、「OCR実行」から始め直すとまた確認が出る', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const estimateRequestId = await createEstimateRequestFor(owner, 'close');
    const statusCount = await routeClaudeVisionStatusAvailable(page);
    const extractRequests = recordExtractRequests(page);

    await loginAsUser(page, owner);
    await openRegisterFormOnDetail(page, estimateRequestId);
    await attachTextPdf(page);

    // 閉じるボタンで閉じる
    const dialog = consentDialog(page);
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // OCR を始めず、手動実行の状態へ戻る
    const manualButton = page.getByRole('button', { name: 'OCR実行', exact: true });
    await expect(manualButton).toBeVisible();
    await expect(page.getByTestId('ocr-progress-indicator')).toHaveCount(0);
    await expect(page.getByTestId('ocr-extracted-text')).toHaveCount(0);
    expect(extractRequests, '閉じたのに抽出の要求が出た').toHaveLength(0);

    // 手動実行でも状態を読み直して確認を出す。Escape で閉じても同じく始めない
    const statusBeforeManual = statusCount();
    await manualButton.click();
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    expect(statusCount(), '手動実行で状態の API を読み直していない').toBe(statusBeforeManual + 1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(manualButton).toBeVisible();
    // Escape は確認だけを閉じ、受領見積書のフォームは開いたまま
    await expect(page.locator('#quotation-name')).toBeVisible();
    await expect(page.getByTestId('ocr-extracted-text')).toHaveCount(0);
    expect(extractRequests, 'Escape で閉じたのに抽出の要求が出た').toHaveLength(0);

    // もう一度始めて端末を選ぶと読み取る（閉じた後も送っていないことを、読み取りの完了の後で確かめる）
    await manualButton.click();
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    await dialog.getByRole('button', { name: '送らずに端末で読み取る', exact: true }).click();
    await expectReadOnDevice(page);
    expect(extractRequests, '閉じた後に抽出の要求が出た').toHaveLength(0);
  });

  /**
   * @requirement estimate-request/REQ-49.8
   */
  test('送った抽出が利用者の上限の 429 を受けると、上限の文言を出して端末で読み取る', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const estimateRequestId = await createEstimateRequestFor(owner, 'limit');
    await routeClaudeVisionStatusAvailable(page);
    // 回数制限は NODE_ENV=test で外れるため、経路の 429 の本文（design の D7）を模擬する
    const extractCount = await routeExtract(page, 429, {
      error: '外部のAIでの読み取りの回数の上限に達しました',
      retryAfter: 3600,
      code: 'CLAUDE_VISION_USER_RATE_LIMITED',
    });

    await loginAsUser(page, owner);
    await openRegisterFormOnDetail(page, estimateRequestId);
    await attachTextPdf(page);
    await chooseSendToExternalAi(page);

    await expect(page.getByTestId('vision-reading-notice')).toHaveText(USER_RATE_LIMITED_NOTICE, {
      timeout: getTimeout(30000),
    });
    await expectReadOnDevice(page);
    // 上限は従来の切り替えの知らせではなく上限の文言で示す
    await expect(page.getByTestId('fallback-warning-banner')).toHaveCount(0);
    expect(extractCount(), '抽出の要求がちょうど一件ではない（429 を受けて再送した）').toBe(1);
  });

  // --------------------------------------------------------------------------
  // 権限なし（本物の backend の状態）
  // --------------------------------------------------------------------------

  /**
   * @requirement estimate-request/REQ-49.6
   */
  test('専用の権限の無い利用者の OCR は確認を出さずに端末で読み、抽出の経路は要求を拒む', async ({
    page,
    request,
  }) => {
    const user = await createUserWithoutClaudeVision();
    const estimateRequestId = await createEstimateRequestFor(user, 'noperm');
    const extractRequests = recordExtractRequests(page);

    await loginAsUser(page, user);
    await openRegisterFormOnDetail(page, estimateRequestId);
    const statusResponse = waitForStatusResponse(page);
    await attachTextPdf(page);

    // 状態は本物の backend が権限なしと答える（差し替えていない）
    const status = await statusResponse;
    expect(status.status()).toBe(200);
    expect(await status.json()).toEqual({ available: false, reason: 'no_permission' });

    await expectReadOnDevice(page);
    await expect(consentDialog(page)).toHaveCount(0);
    await expect(page.getByTestId('fallback-warning-banner')).toContainText(
      '外部のAIでの読み取りの権限がありません'
    );
    expect(extractRequests, '権限の無い利用者の画面が抽出の要求を出した').toHaveLength(0);

    // 経路も権限の無い利用者の要求を受け付けない
    const { accessToken } = await loginViaApi(request, user);
    const direct = await postExtractDirectly(request, accessToken);
    expect(direct.status()).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 受領見積書のプレビューの開き直し
  // --------------------------------------------------------------------------

  /**
   * @requirement estimate-request/REQ-50.2
   */
  test('受領見積書のプレビューを閉じて開き直すと、そのたびに署名付き URL を取り直してプレビューを開く', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const estimateRequestId = await createEstimateRequestFor(owner, 'preview');
    const { accessToken } = await loginViaApi(request, owner);
    const created = await request.post(
      `${API_BASE_URL}/api/estimate-requests/${estimateRequestId}/quotations`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
          name: `${NAME_PREFIX}プレビュー`,
          submittedAt: '2026-11-01T00:00:00.000Z',
          file: {
            name: 'preview.pdf',
            mimeType: 'application/pdf',
            buffer: readFileSync(TEXT_PDF),
          },
        },
      }
    );
    expect(created.status(), '前提: ファイルのある受領見積書の登録').toBe(201);
    const quotationId = ((await created.json()) as { id: string }).id;
    const previewPath = `/api/quotations/${quotationId}/preview`;

    const previewRequests: Request[] = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && new URL(req.url()).pathname === previewPath) {
        previewRequests.push(req);
      }
    });

    // プレビューの窓が取りに行ったファイルの URL（PDF は窓の URL に出ないことがあるため、要求で観測する）
    const openedFileUrls: string[] = [];
    page.context().on('request', (req) => {
      if (req.method() === 'GET' && new URL(req.url()).pathname.startsWith('/storage/')) {
        openedFileUrls.push(req.url());
      }
    });

    await loginAsUser(page, owner);
    await page.goto(`/estimate-requests/${estimateRequestId}`);
    const previewButton = page
      .getByTestId('received-quotation-item')
      .getByRole('button', { name: 'プレビュー', exact: true });
    await expect(previewButton).toBeVisible({ timeout: getTimeout(15000) });

    for (const round of [1, 2]) {
      const response = page.waitForResponse(
        (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === previewPath,
        { timeout: getTimeout(30000) }
      );
      const popupPromise = page.waitForEvent('popup', { timeout: getTimeout(30000) });
      await previewButton.click();
      const res = await response;
      expect(res.status(), `${round} 回目の署名付き URL の取得`).toBe(200);
      const { url } = (await res.json()) as { url: string };
      expect(url, `${round} 回目の署名付き URL`).toMatch(/^https?:\/\//);
      // 取り直した URL でプレビューを開く
      const popup = await popupPromise;
      await expect
        .poll(() => openedFileUrls.filter((opened) => opened === url).length, {
          timeout: getTimeout(15000),
          message: `${round} 回目の窓が取り直した URL のファイルを取りに行っていない`,
        })
        .toBe(round);
      await popup.close();
      expect(previewRequests, `${round} 回目に開くまでの署名付き URL の要求の数`).toHaveLength(
        round
      );
    }
  });

  // --------------------------------------------------------------------------
  // 管理者の停止・再開（全体の設定を書き換えるため直列。afterEach で有効へ戻す）
  // --------------------------------------------------------------------------

  test.describe.serial('管理者の停止と再開', () => {
    /**
     * @requirement estimate-request/REQ-49.4
     * @requirement estimate-request/REQ-49.5
     */
    test('管理者がシステム設定の画面で止めると、利用者の OCR は確認を出さず停止の文言を出して端末で読み、抽出の経路は 503 で拒む', async ({
      page,
      browser,
      request,
    }) => {
      const owner = await createSessionUser('REGULAR_USER');
      const estimateRequestId = await createEstimateRequestFor(owner, 'admin-stop');
      const knownLogIds = await settingChangeLogIds();

      // 管理者がシステム設定の画面で止める
      await loginAsUser(page, 'ADMIN_USER');
      await page.goto('/admin/settings');
      const state = page.getByTestId('external-ai-reading-state');
      await expect(state).toHaveText('有効', { timeout: getTimeout(15000) });
      const section = page.getByRole('region', { name: '外部のAIでの読み取り' });
      await section.getByRole('button', { name: '停止する', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: '外部のAIでの読み取りを停止' });
      await expect(confirm).toBeVisible();
      const put = page.waitForResponse(
        (r) =>
          r.request().method() === 'PUT' &&
          new URL(r.url()).pathname === EXTERNAL_AI_READING_SETTING_PATH,
        { timeout: getTimeout(30000) }
      );
      await confirm.getByRole('button', { name: '停止する', exact: true }).click();
      expect((await put).status()).toBe(200);
      await expect(state).toHaveText('停止中');

      // 変更は監査ログに残る（管理者・変更の前後）
      expect(await settingChangeLogsAfter(knownLogIds)).toEqual([
        { actorId: await adminUserId(), before: { enabled: true }, after: { enabled: false } },
      ]);

      // 利用者の OCR（状態は差し替えず本物の backend が答える）
      const userContext = await browser.newContext();
      try {
        const userPage = await userContext.newPage();
        const extractRequests = recordExtractRequests(userPage);
        await loginAsUser(userPage, owner);
        await openRegisterFormOnDetail(userPage, estimateRequestId);
        const statusResponse = waitForStatusResponse(userPage);
        await attachTextPdf(userPage);
        const status = await statusResponse;
        expect(await status.json()).toEqual({ available: false, reason: 'disabled_by_admin' });

        await expect(userPage.getByTestId('vision-reading-notice')).toHaveText(
          DISABLED_BY_ADMIN_NOTICE,
          { timeout: getTimeout(30000) }
        );
        await expectReadOnDevice(userPage);
        await expect(consentDialog(userPage)).toHaveCount(0);
        expect(extractRequests, '停止中なのに抽出の要求が出た').toHaveLength(0);
      } finally {
        await userContext.close();
      }

      // 送信の要求を受けた場合は受け付けない（専用の権限を持つ利用者の直接の要求）
      const { accessToken } = await loginViaApi(request, owner);
      const direct = await postExtractDirectly(request, accessToken);
      expect(direct.status()).toBe(503);
      const body = (await direct.json()) as { code?: string; errorType?: string };
      expect(body.code).toBe('CLAUDE_VISION_DISABLED_BY_ADMIN');
      expect(body.errorType).toBe('service_unavailable');
    });

    /**
     * @requirement estimate-request/REQ-49.5
     */
    test('管理者がシステム設定の画面で再開すると、利用者の状態から停止が外れ、変更が監査ログに残る', async ({
      page,
      request,
    }) => {
      const owner = await createSessionUser('REGULAR_USER');
      const { accessToken: adminToken } = await loginViaApi(request, 'ADMIN_USER');
      await writeSetting(request, adminToken, false);
      const { accessToken: ownerToken } = await loginViaApi(request, owner);
      expect(await readStatusViaApi(request, ownerToken)).toEqual({
        available: false,
        reason: 'disabled_by_admin',
      });
      const knownLogIds = await settingChangeLogIds();

      await loginAsUser(page, 'ADMIN_USER');
      await page.goto('/admin/settings');
      const state = page.getByTestId('external-ai-reading-state');
      await expect(state).toHaveText('停止中', { timeout: getTimeout(15000) });
      const section = page.getByRole('region', { name: '外部のAIでの読み取り' });
      await section.getByRole('button', { name: '再開する', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: '外部のAIでの読み取りを再開' });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: '再開する', exact: true }).click();
      await expect(state).toHaveText('有効', { timeout: getTimeout(15000) });

      // 停止が外れる（鍵の無い E2E の環境では、次の理由の未設定になる）
      expect(await readStatusViaApi(request, ownerToken)).toEqual({
        available: false,
        reason: 'not_configured',
      });
      expect((await readSetting(request, adminToken)).enabled).toBe(true);

      expect(await settingChangeLogsAfter(knownLogIds)).toEqual([
        { actorId: await adminUserId(), before: { enabled: false }, after: { enabled: true } },
      ]);
    });
  });
});
