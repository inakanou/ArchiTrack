/**
 * @fileoverview 項目名が空のまま保存を試みたときの整合性チェックの出口 E2E
 *
 * Task 90.4: REQ-11.2 の被覆が単一の入口に依存する状態を補強する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-11.2: データ保存時の整合性チェックでエラーが検出された
 *   とき、保存を中断し、問題箇所の修正を求める
 *
 * ## なぜこのファイルが在るか（単一の入口への依存）
 *
 * タスク 90.3 が REQ-11.2 の除外を取り下げた時点で、同受入基準を名乗る被覆印は
 * `e2e/specs/quantity-tables/out-of-range-existing-value-rescue-e2e.spec.ts` の3件だけであり、
 * **3件はいずれも「範囲外の既存値」という一つの入口から条文を固定していた**（同タスクの開示）。
 * その入口は前提の作り方が特殊で、範囲外の値をデータベースへ直接書いて作る。
 * 入口が一つしか無いと、その入口が将来変わったとき条文が無言で無被覆へ落ちる。
 *
 * 本ファイルは**通常の画面操作だけで到達する別の枝**——項目名が空の項目——を固定する。
 * 前提の作成にデータベースへの直接の書き込みを要さず、`handleSave` の整合性チェックの中で
 * 範囲判定（`describeOutOfRangeSetting`）とは独立した枝を通る。
 *
 * ## 固定する挙動（条文の二つの節）
 *
 * 条文は「保存を中断し」と「問題箇所の修正を求める」の二つを課す。本ファイルは両方を主張する。
 *
 * 1. **保存を中断する**: 保存要求（PUT /api/quantity-tables/:id/save）がパス基準の観測器で0件である。
 *    不在の主張が恒真へ退化しないよう、**同じ観測器が名称を入れた後の保存で1件を数える**ことを
 *    同じテストの中で示す（非空証明）。
 * 2. **問題箇所の修正を求める**: 告知が**どのグループが問題か**を名指し、無関係なグループを
 *    名指さない。名指しの観測が壊れていないことは、同じ告知の中の閉じる操作が見えることで示す。
 *
 * ## 前提の作り方
 *
 * - 数量表・グループ・項目はすべて画面の操作で作る（データベースへ直接書かない）。
 * - **問題のあるグループは2件目に置く**。この配置により、本 spec は「先頭のグループだけを走査する
 *   実装」を検出する。独立レビューが当該の変異を実行して実測した——
 *   `frontend/src/pages/QuantityTableEditPage.tsx` の `for (const group of draftToSave.groups) {` を
 *   `for (const group of draftToSave.groups.slice(0, 1)) {` へ置換すると、本 spec は 1 件中 1 件が
 *   失敗する（`npm --prefix frontend run type-check` は EXIT=0、`--force-recreate` の再ビルドで
 *   イメージIDが `1e56d9d7`→`46b3e68e` へ実際に動いたことを確認したうえでの実測。2026-09-12 に
 *   リポジトリルートで独立レビューが実施）。**2件目でない配置についてはこの実測が無いため、
 *   そちらが緑のままであるとは書かない。**
 * - 保存要求の観測はパスを基準に行い、接続先の違いで判定が変わらないようにする
 *   （`new URL(request.url()).pathname` のみで選別し、ホスト・ポート・スキームを条件に入れない）。
 *
 * @module e2e/specs/quantity-tables/save-integrity-empty-item-name-e2e.spec
 */

import { test, expect, type Browser, type Page, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  fillItemRequiredFields,
} from '../../helpers/quantity-table-preconditions';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

const RUN_ID = Date.now();

/** 保存経路（PUT /api/quantity-tables/:id/save）のパス */
const SAVE_PATH_PATTERN = /^\/api\/quantity-tables\/[^/]+\/save$/;

/** 問題の無いグループ（1件目）。告知が無関係なグループを名指さないことの対照に使う */
const BYSTANDER_GROUP_NAME = `対照グループ_${RUN_ID}`;

/** 項目名が空の項目を置くグループ（2件目）。告知はこちらを名指す */
const OFFENDING_GROUP_NAME = `検証グループ_${RUN_ID}`;

/** 対照グループの項目名（保存後の読み戻しで巻き添えが無いことを確かめる） */
const BYSTANDER_ITEM_NAME = '対照項目';

/** 告知を受けてから入れる項目名（これで保存が通ることを確かめる） */
const FIXED_ITEM_NAME = '是正項目';

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

/**
 * 数量グループを1件追加し、名前を付ける。
 *
 * 追加直後のグループは名前を持たない（reducer の `createEmptyDraftGroup` が `name: null`）。
 * 告知はグループ名で問題箇所を名指すため、名前を与えないと「グループ「」」となり、
 * 名指しが効いているのかどうかを判別できない。
 */
async function addNamedQuantityGroup(page: Page, name: string) {
  const groupCard = await addQuantityGroup(page);

  const heading = groupCard.locator('h3').first();
  await expect(heading, '前提: グループ名の見出しが表示される').toBeVisible({
    timeout: getTimeout(10000),
  });
  await heading.click();

  const nameInput = groupCard.getByLabel('グループ名を編集');
  await expect(nameInput, '前提: グループ名の編集欄が開く').toBeVisible({
    timeout: getTimeout(10000),
  });
  await nameInput.fill(name);
  await nameInput.press('Enter');

  await expect(
    groupCard.locator('h3').filter({ hasText: name }).first(),
    '前提: グループ名が反映される'
  ).toBeVisible({ timeout: getTimeout(10000) });

  return groupCard;
}

/** 永続化された数量項目の名称を、グループ名ごとに読み出す */
async function readPersistedItemNames(page: Page, tableId: string): Promise<Map<string, string[]>> {
  const response = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
    headers: { Authorization: `Bearer ${await readAccessToken(page)}` },
  });
  expect(response.status(), '永続化された数量表を取得できる').toBe(200);
  const body = (await response.json()) as {
    groups: Array<{ name: string; items: Array<{ name: string }> }>;
  };
  return new Map(body.groups.map((group) => [group.name, group.items.map((item) => item.name)]));
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

test.describe('項目名が空の項目を持つ数量表の保存の出口（Task 90.4）', () => {
  // `mode: 'serial'` は用いない。テストは自前の数量表を作り、他のテストに依存しない。

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'REGULAR_USER');
      projectId = await createTestProject(page, `T90_4_項目名が空_${RUN_ID}`);
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
   * @requirement quantity-table-generation/REQ-11.2
   */
  test('項目名が空の項目があると保存は中断され、告知が当該グループを名指し、名称を入れると保存できる', async ({
    page,
  }) => {
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
    const { id: tableId } = await createTestQuantityTable(page, projectId, `T90_4_${RUN_ID}`);

    const countSaveRequests = observeSaveRequests(page);

    // 1件目: 必須項目を埋めた問題の無いグループ（告知が名指してはならない対照）
    const bystanderCard = await addNamedQuantityGroup(page, BYSTANDER_GROUP_NAME);
    const bystanderRows = await addQuantityItemRows(bystanderCard, 1);
    await fillItemRequiredFields(bystanderRows.first(), { name: BYSTANDER_ITEM_NAME });

    // 2件目: 項目名が空のままの項目を持つグループ。
    // 先頭ではなく2件目に置くのは、走査が全グループに及ぶことを主張するためである。この配置が
    // その識別力を持つことは実測されている——独立レビューが `draftToSave.groups` を
    // `draftToSave.groups.slice(0, 1)` へ置換する変異（先頭のグループだけを走査する実装）を実行し、
    // 本検証が 1 件中 1 件失敗することを確かめた（type-check EXIT=0、イメージID
    // `1e56d9d7`→`46b3e68e`。2026-09-12 にリポジトリルートで実施）。
    const offendingCard = await addNamedQuantityGroup(page, OFFENDING_GROUP_NAME);
    const offendingRows = await addQuantityItemRows(offendingCard, 1);
    const offendingNameInput = offendingRows.first().getByLabel('名称', { exact: true });
    await expect(
      offendingNameInput,
      '前提: 追加した項目の名称欄が空である（整合性チェックが働く前提）'
    ).toHaveValue('');

    // ここまでの編集はクライアントドラフトのみを更新する（REQ-42）。保存はまだ一度も起きていない
    expect(countSaveRequests(), '前提: 編集操作では保存要求が発生しない').toBe(0);

    await page.getByRole('button', { name: '保存', exact: true }).click();

    // 条文の後段: 問題箇所を名指して修正を求める
    const alert = saveBlockedAlert(page);
    await expect(alert).toContainText(
      `保存できません: グループ「${OFFENDING_GROUP_NAME}」に項目名が空の項目があります`
    );
    await expect(alert, '告知は問題の無いグループを名指してはならない').not.toContainText(
      BYSTANDER_GROUP_NAME
    );

    // 告知の中の操作を観測できていることを先に示したうえで、この枝が既定値へ戻す操作を
    // 持たないことを主張する（項目名は既定値へ寄せられる値ではなく、利用者が入力するものである）
    await expect(alert.getByRole('button', { name: 'エラーを閉じる' })).toBeVisible();
    await expect(alert.getByRole('button', { name: /既定値.*に戻す/ })).toHaveCount(0);

    // 条文の前段: 保存は中断され、サーバーへ送信されない
    expect(countSaveRequests(), '保存は中断され、保存要求は送られない').toBe(0);

    // 名指された箇所を直すと保存できる（告知が求めた修正が実際に出口になっている）
    await fillItemRequiredFields(offendingRows.first(), { name: FIXED_ITEM_NAME });
    await saveQuantityTableDraft(page);
    expect(countSaveRequests(), '保存操作で保存要求が1回送られる（観測器の非空証明）').toBe(1);

    // 中断されていた保存が通り、対照グループの項目も巻き添えになっていない
    const persisted = await readPersistedItemNames(page, tableId);
    expect(persisted.get(OFFENDING_GROUP_NAME)).toEqual([FIXED_ITEM_NAME]);
    expect(persisted.get(BYSTANDER_GROUP_NAME)).toEqual([BYSTANDER_ITEM_NAME]);
  });
});
