/**
 * @fileoverview 数量項目の一括操作（削除・コピー・移動）の E2Eテスト
 *
 * 受入基準 6.5 は「複数の数量項目を選択して一括操作を行うとき、**選択された全ての項目に対して**
 * 削除・コピー・移動操作を実行する」と述べる。主題は三つの操作それぞれが
 * **選択の全体へ**及ぶことであり、選択の操作や一括操作の導線が画面に在ることではない。
 *
 * ## 空洞を塞ぐ形
 *
 * - **選択は真部分集合にする**。3行のうち1行目と3行目だけを選び、2行目は選ばない。
 *   「全行に対して実行する」実装と「選択した全てに対して実行する」実装を弁別するためであり、
 *   同時に、選ばなかった行が残る（コピーで増えない／移動で動かない）ことが
 *   操作が空振りしていないことの肯定側の主張になる。
 * - **1件目だけを処理する実装で通らない形にする**。選んだ2行の両方について結果を主張する。
 * - 行の同定は名称欄の値で行う。値の読み出しは画面から素の文字列を取り出すだけで、
 *   合否の判定は Node 側の `expect` が行う。
 *
 * ## 前提の置き方
 *
 * 前提（プロジェクト・数量表）は `e2e/helpers/quantity-table-preconditions.ts` で**自ら作り**、
 * 作れなければその場で失敗する。数量グループと数量項目は各テストが画面から用意する。
 * 編集はクライアントドラフトのみを更新し保存しない（REQ-42）ため、各テストは
 * 「グループ0件」の編集画面から始まり、先行テストの残留に依存しない。
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-6.5: 選択した全ての数量項目に対する一括の削除・コピー・移動
 * - REQ-42.14: 一括コピーの API の `itemIds` が件数の上限を超えると本文の検証の400になり数量項目が増えない
 *   （画面は一括の操作をクライアントの編集状態にだけ反映し〔42.1〕この経路を呼ばないため、API の要求で検証。
 *   印は当該テストの doc コメントに置く）
 *
 * @module e2e/specs/quantity-tables/bulk-item-operations-e2e.spec
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import { API_BASE_URL } from '../../config';
import { getAccessToken } from '../../helpers/auth-api';
import { getPrismaClient } from '../../fixtures/database';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/** 実行ごとに一意な接頭辞（項目名が行の識別子になるため） */
const RUN_ID = Date.now().toString(36);

/** 用意する3行の名称。1行目と3行目だけを選択の対象にする。 */
const ITEM_NAMES = [`一括A_${RUN_ID}`, `一括B_${RUN_ID}`, `一括C_${RUN_ID}`] as const;

/**
 * 数量項目行の名称欄へ値を入れ、保持されたことまで主張する。
 *
 * 名称欄は補完付きの入力欄で、候補一覧は body 直下へ描画される。開いたままだと
 * 後続のクリックを覆うため Escape で閉じる。
 *
 * @param row 対象の数量項目行
 * @param name 入れる名称
 */
async function fillItemName(row: Locator, name: string): Promise<void> {
  const input = row.getByLabel('名称', { exact: true });
  await expect(input, '前提: 名称の入力欄が表示される').toBeVisible({ timeout: getTimeout(10000) });
  await input.fill(name);
  await input.press('Escape');
  await expect(input, '前提: 名称の入力が保持される').toHaveValue(name);
}

/**
 * 数量グループに並ぶ数量項目の名称を、画面の並び順のまま読み出す。
 *
 * 読み出すのは入力欄の値という素の文字列だけで、判定は行わない。
 *
 * @param groupCard 対象の数量グループのカード
 * @returns 並び順の名称の配列
 */
async function itemNamesIn(groupCard: Locator): Promise<string[]> {
  return groupCard
    .locator('[data-testid="quantity-item-row"] input[id$="-name"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

/**
 * 前提を用意する: 2つの数量グループを作り、1つ目へ3行の数量項目を名称つきで並べる。
 *
 * @param page Playwright のページ（数量表の編集画面に居ること）
 * @returns 1つ目（操作の対象）と2つ目（移動先）の数量グループのカード
 */
async function seedTwoGroupsWithThreeItems(
  page: Page
): Promise<{ sourceGroup: Locator; targetGroup: Locator }> {
  await expect(
    page.locator('[data-testid="quantity-group-card"]'),
    '前提: 各テストはグループ0件の編集画面から始まる'
  ).toHaveCount(0);

  const sourceGroup = await addQuantityGroup(page);
  const targetGroup = await addQuantityGroup(page);

  const rows = await addQuantityItemRows(sourceGroup, ITEM_NAMES.length);
  for (let i = 0; i < ITEM_NAMES.length; i += 1) {
    await fillItemName(rows.nth(i), ITEM_NAMES[i]!);
  }
  await expect
    .poll(() => itemNamesIn(sourceGroup), {
      message: '前提: 3行の数量項目が名称つきで並ぶ',
      timeout: getTimeout(10000),
    })
    .toEqual([...ITEM_NAMES]);

  await expect(
    targetGroup.locator('[data-testid="quantity-item-row"]'),
    '前提: 移動先の数量グループは空である'
  ).toHaveCount(0);

  return { sourceGroup, targetGroup };
}

/**
 * 1行目と3行目だけを一括操作の対象として選択する（2行目は選ばない）。
 *
 * @param sourceGroup 対象の数量グループのカード
 */
async function selectFirstAndThirdItems(sourceGroup: Locator): Promise<void> {
  const rows = sourceGroup.locator('[data-testid="quantity-item-row"]');
  const first = rows.nth(0).getByRole('checkbox', { name: '項目を選択' });
  const second = rows.nth(1).getByRole('checkbox', { name: '項目を選択' });
  const third = rows.nth(2).getByRole('checkbox', { name: '項目を選択' });

  await first.check();
  await third.check();

  await expect(first, '前提: 1行目が選択状態になる').toBeChecked();
  await expect(third, '前提: 3行目が選択状態になる').toBeChecked();
  await expect(second, '前提: 2行目は選択していない（真部分集合であること）').not.toBeChecked();
}

test.describe('数量項目の一括操作 (quantity-table-generation/REQ-6.5)', () => {
  test.describe.configure({ mode: 'serial' });

  let quantityTableId: string | null = null;
  let testProjectId: string | null = null;
  /**
   * 件数の上限の検証（タスク110.2・111.1）が作った数量表の ID。数量項目を 501 件以上持つため、
   * テストが途中で落ちても afterEach で DB から消す。
   */
  const limitTableIdsToRemove: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    for (const tableId of limitTableIdsToRemove.splice(0)) {
      await prisma.quantityTable.delete({ where: { id: tableId } });
      expect(
        await prisma.quantityTable.count({ where: { id: tableId } }),
        `後始末: 上限の検証の数量表 ${tableId} が DB から消える`
      ).toBe(0);
    }
  });

  test('事前準備: プロジェクトと数量表を作成する', async ({ page }) => {
    const projectId = await createTestProject(page, 'REQ6_5_PJ');
    testProjectId = projectId;
    quantityTableId = (await createTestQuantityTable(page, projectId, 'REQ6_5_数量表')).id;
  });

  test('選択した全ての数量項目が一括で削除される', async ({ page }) => {
    assertPrepared(quantityTableId, '事前準備で作成した数量表のID');
    await openQuantityTableEdit(page, quantityTableId);

    const { sourceGroup } = await seedTwoGroupsWithThreeItems(page);
    await selectFirstAndThirdItems(sourceGroup);

    const bulkBar = page.getByTestId('quantity-item-bulk-action-bar');
    await expect(bulkBar, '前提: 一括操作の操作列が表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await bulkBar.getByRole('button', { name: '選択した項目を削除' }).click();

    // REQ-6.5: 選択した2件は**両方とも**消え、選ばなかった1件は残る
    await expect
      .poll(() => itemNamesIn(sourceGroup), {
        message:
          'REQ-6.5: 一括削除が選択した全ての数量項目に及んでいない（選択外の項目まで消えている、または一部しか消えていない）',
        timeout: getTimeout(10000),
      })
      .toEqual([ITEM_NAMES[1]]);
  });

  test('選択した全ての数量項目が一括でコピーされる', async ({ page }) => {
    assertPrepared(quantityTableId, '事前準備で作成した数量表のID');
    await openQuantityTableEdit(page, quantityTableId);

    const { sourceGroup } = await seedTwoGroupsWithThreeItems(page);
    await selectFirstAndThirdItems(sourceGroup);

    const bulkBar = page.getByTestId('quantity-item-bulk-action-bar');
    await expect(bulkBar, '前提: 一括操作の操作列が表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await bulkBar.getByRole('button', { name: '選択した項目をコピー' }).click();

    // REQ-6.5: 選択した2件が**両方とも**各自の直下へ複製され、選ばなかった1件は増えない
    await expect
      .poll(() => itemNamesIn(sourceGroup), {
        message:
          'REQ-6.5: 一括コピーが選択した全ての数量項目に及んでいない（選択外の項目まで複製されている、または一部しか複製されていない）',
        timeout: getTimeout(10000),
      })
      .toEqual([ITEM_NAMES[0], ITEM_NAMES[0], ITEM_NAMES[1], ITEM_NAMES[2], ITEM_NAMES[2]]);
  });

  test('選択した全ての数量項目が一括で別の数量グループへ移動する', async ({ page }) => {
    assertPrepared(quantityTableId, '事前準備で作成した数量表のID');
    await openQuantityTableEdit(page, quantityTableId);

    const { sourceGroup, targetGroup } = await seedTwoGroupsWithThreeItems(page);
    await selectFirstAndThirdItems(sourceGroup);

    const bulkBar = page.getByTestId('quantity-item-bulk-action-bar');
    await expect(bulkBar, '前提: 一括操作の操作列が表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await bulkBar.getByRole('button', { name: '選択した項目を移動' }).click();

    const moveDialog = page.getByRole('dialog');
    await expect(moveDialog, '前提: 移動先選択UIが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    const targetGroupChoice = moveDialog
      .getByRole('radiogroup', { name: 'グループ選択' })
      .getByRole('radio')
      .nth(1);
    await expect(targetGroupChoice, '前提: 移動先の数量グループを選択できる').toBeEnabled({
      timeout: getTimeout(10000),
    });
    await targetGroupChoice.check();
    await moveDialog.getByRole('button', { name: '移動' }).click();
    await expect(moveDialog, '前提: 移動の確定で移動先選択UIが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });

    // REQ-6.5: 選択した2件が**両方とも**移動先へ移り、選ばなかった1件は移動元に残る
    await expect
      .poll(() => itemNamesIn(targetGroup), {
        message:
          'REQ-6.5: 一括移動が選択した全ての数量項目に及んでいない（移動先へ移った項目が選択と一致しない）',
        timeout: getTimeout(10000),
      })
      .toEqual([ITEM_NAMES[0], ITEM_NAMES[2]]);
    await expect
      .poll(() => itemNamesIn(sourceGroup), {
        message: 'REQ-6.5: 一括移動の後、移動元に残るのが選択しなかった項目だけになっていない',
        timeout: getTimeout(10000),
      })
      .toEqual([ITEM_NAMES[1]]);
  });
  /**
   * 一括コピーの経路（POST /api/quantity-items/bulk-copy）の `itemIds` の件数の上限（500。タスク111.1 で
   * 1000 から下げた）。画面は一括の操作をクライアントの編集状態にだけ反映してこの経路を呼ばないため、
   * API の要求で確かめる。数量項目を 501 件持つ数量表を保存の経路で用意し、その全件の ID を送る
   * （上限が無ければ全件が複製される要求）。続けて上限の内側の 10 件を送り、複製されることを確かめる。
   *
   * @requirement quantity-table-generation/REQ-42.14
   */
  test('一括コピーの itemIds が上限を超えると400になり数量項目は増えず、上限の内側は複製される', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(120000));
    assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');
    const token = await getAccessToken(page, 'REGULAR_USER');
    assertPrepared(token, 'アクセストークン');
    const headers = { Authorization: `Bearer ${token}` };
    const count = 501;

    const created = await page.request.post(
      `${API_BASE_URL}/api/projects/${testProjectId}/quantity-tables`,
      { headers, data: { name: `一括コピー上限検証数量表_${RUN_ID}` } }
    );
    expect(created.status(), '前提: 数量表を作成できる').toBe(201);
    const { id: tableId } = (await created.json()) as { id: string };
    limitTableIdsToRemove.push(tableId);

    type TableDetail = {
      updatedAt: string;
      groups: Array<{ id: string; items: Array<{ id: string; name: string }> }>;
    };
    const readTable = async (): Promise<TableDetail> => {
      const detail = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
        headers,
      });
      expect(detail.status(), '数量表を取得できる').toBe(200);
      return (await detail.json()) as TableDetail;
    };
    const itemNames = (table: TableDetail) =>
      table.groups.flatMap((group) => group.items.map((item) => item.name)).sort();

    // 前提: 数量項目を 501 件持つ数量表（保存の経路の上限〔42.11〕の内側）
    const initial = await readTable();
    const prepared = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: {
        expectedUpdatedAt: initial.updatedAt,
        name: `一括コピー上限検証数量表_${RUN_ID}`,
        groups: [
          {
            id: null,
            tempId: 'temp-group-0',
            name: `一括コピー上限検証のグループ_${RUN_ID}`,
            surveyImageId: null,
            displayOrder: 0,
            items: Array.from({ length: count }, (_, index) => ({
              id: null,
              tempId: `temp-item-${index}`,
              majorCategory: null,
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '工種',
              name: `上限${index}`,
              specification: null,
              unit: 'm',
              calculationMethod: 'STANDARD',
              calculationParams: null,
              adjustmentFactor: 1,
              roundingUnit: 0.01,
              quantity: 1,
              remarks: null,
              displayOrder: index,
            })),
          },
        ],
      },
    });
    expect(prepared.status(), '前提: 501 件の数量項目を保存できる').toBe(200);
    const before = await readTable();
    const itemIds = before.groups.flatMap((group) => group.items.map((item) => item.id));
    expect(itemIds, '前提: 数量項目が 501 件ある').toHaveLength(count);

    // 上限（500）を 1 件超えた itemIds
    const rejected = await page.request.post(`${API_BASE_URL}/api/quantity-items/bulk-copy`, {
      headers,
      data: { itemIds },
    });
    expect(rejected.status()).toBe(400);
    const rejectedBody = (await rejected.json()) as {
      code: string;
      message: string;
      details: Array<{ path: string; message: string }>;
    };
    expect(rejectedBody.code).toBe('VALIDATION_ERROR');
    expect(rejectedBody.message).toBe('数量項目は500件以内で選択してください');
    expect(rejectedBody.details).toEqual([
      expect.objectContaining({
        path: 'itemIds',
        message: '数量項目は500件以内で選択してください',
      }),
    ]);

    // 数量項目は増えない（通っていれば 501 件が複製されて 1002 件になる）
    const afterRejected = await readTable();
    expect(itemNames(afterRejected)).toEqual(itemNames(before));

    // 非空証明: 同じ項目の一部（10 件）なら複製される。400 は件数による。
    // 上限ちょうど（500 件）の一括コピーは所要が制限時間（5 秒）に迫りうるため E2E では送らない
    // （タスク111.1 の実測で平常は最悪 2801 ms、テストの backend の再起動の直後は 5618 ms で超過した。
    // design の 42.14 の所要）。上限ちょうどで通ることは経路の単体が主張する
    const acceptedCount = 10;
    const accepted = await page.request.post(`${API_BASE_URL}/api/quantity-items/bulk-copy`, {
      headers,
      data: { itemIds: itemIds.slice(0, acceptedCount) },
    });
    expect(accepted.status(), `上限の内側は複製される (status=${accepted.status()})`).toBe(201);
    const copied = (await accepted.json()) as Array<{ name: string }>;
    expect(copied).toHaveLength(acceptedCount);
    const afterAccepted = await readTable();
    expect(afterAccepted.groups.flatMap((group) => group.items)).toHaveLength(
      count + acceptedCount
    );
  });
});
