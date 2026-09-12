/**
 * @fileoverview 範囲外の既存値を持つ数量項目の保存の出口 E2E
 *
 * Task 90.1: 範囲外の既存値を持つ項目を救済する
 * Task 90.3: REQ-11.2 の除外を取り下げ、下の3件へ被覆印を置く
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-10.3: 丸め設定が入力可能範囲（0.01〜99.99）の外である
 *   ときエラーメッセージを表示し、範囲内の値の入力を求める
 * - @requirement quantity-table-generation/REQ-11.2: データ保存時に整合性チェックでエラーが検出された
 *   とき保存を中断し、問題箇所の修正を求める
 *
 * 保存の中断と問題箇所の名指し（Requirement 11 の受入基準 2）は下の3件がいずれも固定している——
 * 告知がグループ・項目・欄・現在の値・範囲を名指すことと、保存要求がパス基準の観測器で0件である
 * ことを同じテストの中で主張し、直した後に同じ観測器が1件を数えることで非空証明を置く。
 * **タスク 90.1 の時点では、ここに被覆印を置けなかった**——同受入基準は
 * `e2e/requirement-exclusions.json` に「データ整合性チェックはバックエンド統合テストで検証」として
 * 在籍しており、E2E の被覆印と除外は同時に成り立たない（`npm run check:req-exclusions` が拒む）。
 * タスク 90.3 が除外を取り下げたので、印は上の一覧と下の各テストに置いてある。
 *
 * 検証する画面の振る舞い:
 * 1. 計算方法「標準」の項目（丸め設定の欄が描画されない。REQ-10.8）に範囲外の既存値があるとき、
 *    保存は中断され、告知が項目・欄・現在の値・範囲を名指す。告知の操作で既定値へ戻すと、
 *    名指した項目の欄だけが変わって保存できる。**操作の前に値を黙って書き換えて保存しない。**
 * 2. 欄が描画される計算方法の項目では、既定値へ戻す操作を出さず、範囲内の値の入力を求める。
 *    名指された欄は既存値のまま描画されており、欄から直して保存できる。
 * 3. 範囲外の数量の既存値は、保存経路の 400 に委ねず保存前に名指して中断する（改める前は一般の
 *    「再度お試しください」を出していた）。数量の欄から直して保存できる。
 *
 * 本ファイルは REQ-15.1 を名乗らない。3 が固定するのは保存の中断と問題箇所の名指し（REQ-11.2）であり、
 * 数量の欄への範囲外の入力の拒否（REQ-15.1）は `quantity-table-crud.spec.ts` の所管である。
 *
 * 前提の作り方:
 * - 範囲外の既存値は、タスク 85.1 以降は API から作れない（保存経路が正典の範囲で拒む）。
 *   そこで数量項目を保存経路で作った後、丸め設定だけを DB へ直接書く
 *   （タスク 85.1 より前の保存経路の上限 999.99 の内側で永続化された既存値を模す）。
 * - 保存要求の観測はパスを基準に行い、接続先の違いで判定が変わらないようにする
 *   （`new URL(request.url()).pathname` のみで選別する）。
 *
 * @module e2e/specs/quantity-tables/out-of-range-existing-value-rescue-e2e.spec
 */

import { test, expect, type Browser, type Page, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createTestProject,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

const RUN_ID = Date.now();

/** 保存経路（PUT /api/quantity-tables/:id/save）のパス */
const SAVE_PATH_PATTERN = /^\/api\/quantity-tables\/[^/]+\/save$/;

/** タスク 85.1 より前の保存経路（上限 999.99）なら永続化できた、正典の上限 99.99 を超える丸め設定 */
const LEGACY_ROUNDING_UNIT = 500;

const GROUP_NAME = '救済グループ';

// ============================================================================
// 前提の状態
// ============================================================================

let projectId: string | null = null;

// ============================================================================
// ヘルパー
// ============================================================================

/** ログイン済みページのアクセストークンを取り出す */
async function readAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  assertPrepared(token, 'アクセストークン');
  return token;
}

interface SeedItem {
  name: string;
  calculationMethod: 'STANDARD' | 'AREA_VOLUME';
  calculationParams: Record<string, number> | null;
  roundingUnit: number;
  quantity: number;
}

/**
 * 数量表を作り、1グループに数量項目を保存経路で用意する。成立は応答で主張する。
 *
 * @returns 数量表のIDと、項目名から項目IDへの対応
 */
async function createTableWithItems(
  page: Page,
  name: string,
  items: ReadonlyArray<SeedItem>
): Promise<{ tableId: string; itemIdByName: Map<string, string> }> {
  assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
  const headers = { Authorization: `Bearer ${await readAccessToken(page)}` };

  const created = await page.request.post(
    `${API_BASE_URL}/api/projects/${projectId}/quantity-tables`,
    { headers, data: { name } }
  );
  expect(created.status(), '前提: 数量表を作成できる').toBe(201);
  const { id: tableId } = (await created.json()) as { id: string };

  const detail = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
    headers,
  });
  expect(detail.status(), '前提: 作成した数量表を取得できる').toBe(200);
  const { updatedAt } = (await detail.json()) as { updatedAt: string };

  const saved = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
    headers,
    data: {
      expectedUpdatedAt: updatedAt,
      name,
      groups: [
        {
          id: null,
          name: GROUP_NAME,
          surveyImageId: null,
          displayOrder: 0,
          items: items.map((item, index) => ({
            id: null,
            majorCategory: null,
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            workType: '土工',
            name: item.name,
            specification: null,
            unit: 'm3',
            calculationMethod: item.calculationMethod,
            calculationParams: item.calculationParams,
            adjustmentFactor: 1,
            roundingUnit: item.roundingUnit,
            quantity: item.quantity,
            remarks: null,
            displayOrder: index,
          })),
        },
      ],
    },
  });
  expect(saved.status(), `前提: 数量項目を保存できる (status=${saved.status()})`).toBe(200);
  const savedBody = (await saved.json()) as {
    groups: Array<{ items: Array<{ id: string; name: string }> }>;
  };
  const savedItems = savedBody.groups[0]?.items ?? [];
  expect(
    savedItems.map((item) => item.name),
    '前提: 数量項目が保存される'
  ).toEqual(items.map((item) => item.name));

  return {
    tableId,
    itemIdByName: new Map(savedItems.map((item) => [item.name, item.id])),
  };
}

/** 範囲外の既存値を DB へ直接書く（API は正典の範囲で拒むため） */
async function writeLegacyRoundingUnit(itemId: string | undefined): Promise<void> {
  assertPrepared(itemId, '範囲外の既存値を持たせる数量項目のID');
  await getPrismaClient().quantityItem.update({
    where: { id: itemId },
    data: { roundingUnit: LEGACY_ROUNDING_UNIT },
  });
}

/** 範囲外の数量の既存値を DB へ直接書く（API は正典の範囲で拒むため） */
async function writeLegacyQuantity(itemId: string | undefined, quantity: number): Promise<void> {
  assertPrepared(itemId, '範囲外の数量を持たせる数量項目のID');
  await getPrismaClient().quantityItem.update({
    where: { id: itemId },
    data: { quantity },
  });
}

/** 永続化された丸め設定・数量を読む */
async function readPersisted(
  itemId: string | undefined
): Promise<{ roundingUnit: number; quantity: number }> {
  assertPrepared(itemId, '読み出す数量項目のID');
  const row = await getPrismaClient().quantityItem.findUnique({
    where: { id: itemId },
    select: { roundingUnit: true, quantity: true },
  });
  assertPrepared(row, '永続化された数量項目');
  return { roundingUnit: Number(row.roundingUnit), quantity: Number(row.quantity) };
}

/** 保存経路への PUT をパス基準で数える観測器を付ける */
function observeSaveRequests(page: Page): () => number {
  let count = 0;
  page.on('request', (request: Request) => {
    if (request.method() === 'PUT' && SAVE_PATH_PATTERN.test(new URL(request.url()).pathname)) {
      count += 1;
    }
  });
  return () => count;
}

/** 保存の中断を示す操作エラー（role="alert"） */
function saveBlockedAlert(page: Page) {
  return page.getByRole('alert').filter({ hasText: '保存できません' });
}

/** 管理者として削除の API を呼び、状態コードを返す */
async function deleteAsAdmin(browser: Browser, path: string): Promise<number> {
  const context = await browser.newContext();
  const adminPage = await context.newPage();
  try {
    await loginAsUser(adminPage, 'ADMIN_USER');
    const response = await adminPage.request.delete(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${await readAccessToken(adminPage)}` },
    });
    return response.status();
  } finally {
    await context.close();
  }
}

// ============================================================================
// テスト
// ============================================================================

test.describe('範囲外の既存値を持つ数量項目の保存の出口（Task 90.1）', () => {
  // `mode: 'serial'` は用いない。各テストは自前の数量表を作り互いに依存しない。

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'REGULAR_USER');
      projectId = await createTestProject(page, `T90_1_範囲外の既存値_${RUN_ID}`);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
    const status = await deleteAsAdmin(browser, `/api/projects/${projectId}`);
    expect([200, 204, 404]).toContain(status);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-10.3
   * @requirement quantity-table-generation/REQ-11.2
   */
  test('「標準」の項目の範囲外の丸め設定は、名指して保存を中断し、告知の操作で既定値へ戻すと保存できる', async ({
    page,
  }) => {
    const { tableId, itemIdByName } = await createTableWithItems(page, `T90_1_標準_${RUN_ID}`, [
      {
        name: '掘削',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        roundingUnit: 0.01,
        quantity: 12.5,
      },
      {
        name: '埋戻し',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        roundingUnit: 0.5,
        quantity: 3,
      },
    ]);
    const targetId = itemIdByName.get('掘削');
    const bystanderId = itemIdByName.get('埋戻し');
    await writeLegacyRoundingUnit(targetId);

    const countSaveRequests = observeSaveRequests(page);
    await openQuantityTableEdit(page, tableId);

    // 袋小路の前提: 「標準」の項目では丸め設定の欄が描画されない（REQ-10.8）。
    // 同じ画面で数量の欄が描画されていることを先に示し、欄を観測できていることを確かめる。
    // 名前は完全一致で引く（部分一致だと表題の「数量表名」の欄にも当たる）
    await expect(page.getByRole('textbox', { name: '数量', exact: true }).first()).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByLabel('丸め設定', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: '保存', exact: true }).click();

    const alert = saveBlockedAlert(page);
    await expect(alert).toContainText(
      `保存できません: グループ「${GROUP_NAME}」の項目「掘削」の丸め設定が無効です（現在の値: 500.00）。0.01〜99.99の範囲外ですが、計算方法「標準」ではこの欄は表示されません。既定値に戻してから保存してください`
    );
    await expect(alert).not.toContainText('埋戻し');
    expect(countSaveRequests(), '保存は中断され、保存要求は送られない').toBe(0);
    // 操作の前に値を黙って書き換えない
    expect((await readPersisted(targetId)).roundingUnit).toBe(LEGACY_ROUNDING_UNIT);

    await alert.getByRole('button', { name: '丸め設定を既定値（0.01）に戻す' }).click();
    await expect(alert).toHaveCount(0);
    // 戻す操作そのものは保存しない（永続化は保存操作時のみ）
    expect(countSaveRequests()).toBe(0);

    await saveQuantityTableDraft(page);
    expect(countSaveRequests(), '保存操作で保存要求が1回送られる（観測器の非空証明）').toBe(1);

    // 名指した項目の丸め設定だけが既定値へ戻り、数量も他の項目も変わらない
    expect(await readPersisted(targetId)).toEqual({ roundingUnit: 0.01, quantity: 12.5 });
    expect(await readPersisted(bystanderId)).toEqual({ roundingUnit: 0.5, quantity: 3 });
  });

  /**
   * @requirement quantity-table-generation/REQ-10.3
   * @requirement quantity-table-generation/REQ-11.2
   */
  test('欄が描画される計算方法の項目の範囲外の丸め設定は、範囲内の値の入力を求め、欄から直すと保存できる', async ({
    page,
  }) => {
    const { tableId, itemIdByName } = await createTableWithItems(page, `T90_1_面積_${RUN_ID}`, [
      {
        name: '型枠',
        calculationMethod: 'AREA_VOLUME',
        calculationParams: { width: 10 },
        roundingUnit: 0.01,
        quantity: 10,
      },
    ]);
    const targetId = itemIdByName.get('型枠');
    await writeLegacyRoundingUnit(targetId);

    const countSaveRequests = observeSaveRequests(page);
    await openQuantityTableEdit(page, tableId);

    // 名指される欄は既存値のまま描画されている（直す手段がある）
    const roundingInput = page.getByLabel('丸め設定', { exact: true });
    await expect(roundingInput).toHaveValue('500.00', { timeout: getTimeout(10000) });

    await page.getByRole('button', { name: '保存', exact: true }).click();

    const alert = saveBlockedAlert(page);
    await expect(alert).toContainText(
      `保存できません: グループ「${GROUP_NAME}」の項目「型枠」の丸め設定が無効です（現在の値: 500.00）。0.01〜99.99の範囲で入力してください`
    );
    // 欄から直せるので、既定値へ戻す操作は出さない。
    // 同じ告知の中の閉じる操作が見えることを先に示し、告知の中の操作を観測できていることを確かめる。
    await expect(alert.getByRole('button', { name: 'エラーを閉じる' })).toBeVisible();
    await expect(alert.getByRole('button', { name: /既定値.*に戻す/ })).toHaveCount(0);
    expect(countSaveRequests(), '保存は中断され、保存要求は送られない').toBe(0);

    await roundingInput.fill('1');
    await roundingInput.press('Tab');
    await expect(roundingInput).toHaveValue('1.00');

    await saveQuantityTableDraft(page);
    expect(countSaveRequests(), '保存操作で保存要求が1回送られる（観測器の非空証明）').toBe(1);
    expect((await readPersisted(targetId)).roundingUnit).toBe(1);
  });

  /**
   * @requirement quantity-table-generation/REQ-11.2
   */
  test('範囲外の数量の既存値は、保存経路に委ねず名指して保存を中断し、数量の欄から直すと保存できる', async ({
    page,
  }) => {
    const { tableId, itemIdByName } = await createTableWithItems(page, `T90_1_数量_${RUN_ID}`, [
      {
        name: '砕石',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        roundingUnit: 0.01,
        quantity: 1,
      },
    ]);
    const targetId = itemIdByName.get('砕石');
    // 正典の上限 9999999.99 を超える。タスク 85.1 より前の作成経路は数量に上限を課さなかった
    await writeLegacyQuantity(targetId, 100000000);

    const countSaveRequests = observeSaveRequests(page);
    await openQuantityTableEdit(page, tableId);

    await page.getByRole('button', { name: '保存', exact: true }).click();

    const alert = saveBlockedAlert(page);
    await expect(alert).toContainText(
      `保存できません: グループ「${GROUP_NAME}」の項目「砕石」の数量が無効です（現在の値: 100000000.00）。-999999.99〜9999999.99の範囲で入力してください`
    );
    await expect(alert).not.toContainText('再度お試しください');
    await expect(alert.getByRole('button', { name: 'エラーを閉じる' })).toBeVisible();
    await expect(alert.getByRole('button', { name: /既定値.*に戻す/ })).toHaveCount(0);
    expect(countSaveRequests(), '保存は中断され、保存要求は送られない').toBe(0);

    // 名前は完全一致で引く（部分一致だと表題の「数量表名」の欄にも当たる）
    const quantityInput = page.getByRole('textbox', { name: '数量', exact: true });
    await quantityInput.fill('5');
    await quantityInput.press('Tab');
    await expect(quantityInput).toHaveValue('5.00');

    await saveQuantityTableDraft(page);
    expect(countSaveRequests(), '保存操作で保存要求が1回送られる（観測器の非空証明）').toBe(1);
    expect((await readPersisted(targetId)).quantity).toBe(5);
  });
});
