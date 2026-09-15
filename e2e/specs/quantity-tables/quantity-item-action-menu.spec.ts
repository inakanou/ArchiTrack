/**
 * @fileoverview 数量項目アクションメニュー統合 E2Eテスト
 *
 * ## 前提の用意（Task 115.127 段0）
 *
 * 以前は「一覧の先頭のプロジェクトの先頭の数量表」を開き、開けなければ引数なしの
 * `test.skip` で検証を丸ごと消していた。項目のあるグループが見つからない場合も同様である。
 * 前提が崩れると緑でも赤でもなくなるため、AI運用7原則 第3原則に抵触する。
 *
 * 本ファイルは前提（プロジェクト・数量表・数量グループ・数量項目2行）を事前準備で
 * **自ら作り**、作れなければその場で失敗する。共通の補助は
 * `e2e/helpers/quantity-table-preconditions.ts` に置く。
 *
 * 数量項目は2行用意する。REQ-36.6（最上位の「上へ移動」無効化）と
 * REQ-36.7（最下位の「下へ移動」無効化）は、1行しかないと両方が無効化される
 * （SortOrderButtons の `totalCount <= 1`）ため区別が付かないからである。
 * 並び替えの結果を観測できるよう、各行の名称には異なる値を入れる。名称は保存時の
 * 整合性チェック（REQ-11.2）で必須であり、空のままでは前提を永続化できない。
 *
 * Requirements coverage:
 * - REQ-36.1: ボタン統合（個別表示からアクションメニューへ）
 * - REQ-36.2: アクションメニューのドロップダウン表示
 * - REQ-36.3: 「上へ移動」操作
 * - REQ-36.4: 「下へ移動」操作
 * - REQ-36.5: 「削除」操作
 * - REQ-36.6: 最上位項目の「上へ移動」無効化
 * - REQ-36.7: 最下位項目の「下へ移動」無効化
 * - REQ-36.8: 既存操作項目との統合表示
 * - REQ-36.9: メニュー外クリックでドロップダウン閉じる
 *
 * @module e2e/specs/quantity-tables/quantity-item-action-menu.spec
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  fillItemRequiredFields,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/** 1行目の名称（並び替えの結果を観測するための識別子） */
const FIRST_ITEM_NAME = 'REQ36先頭行';
/** 2行目の名称 */
const SECOND_ITEM_NAME = 'REQ36末尾行';

test.describe('REQ-36: 数量項目のアクションボタン統合', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /** 数量項目行の名称欄（並び順の観測に用いる） */
  const itemNameOf = (row: Locator): Locator => row.getByLabel('名称', { exact: true });

  /**
   * 事前準備で用意した数量表を開き、数量項目の行（2行）を返す。
   */
  async function openPreparedItemRows(page: Page): Promise<Locator> {
    await openQuantityTableEdit(page, createdQuantityTableId);

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard, '前提: 事前準備の数量グループが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    const itemRows = groupCard.locator('[data-testid="quantity-item-row"]');
    await expect(itemRows, '前提: 事前準備の数量項目が2行存在する').toHaveCount(2, {
      timeout: getTimeout(15000),
    });
    return itemRows;
  }

  /**
   * 対象行のアクションメニューを開き、メニューを返す。
   *
   * ドロップダウンは body 直下へ Portal 描画されるため、行スコープでは参照できない。
   */
  async function openActionMenu(page: Page, row: Locator): Promise<Locator> {
    const actionButton = row.getByRole('button', { name: 'アクション' });
    await expect(actionButton, 'アクションメニューボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu, 'アクションメニューのドロップダウンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    return menu;
  }

  // 前提の生成は1テストあたりのタイムアウト（60秒）に収まるよう段階に分ける。
  // 直列（serial）であるため、前段が失敗した場合に後段が成功して見えることはない。
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      testProjectId = await createTestProject(page, 'REQ36_PJ');
      createdQuantityTableId = (await createTestQuantityTable(page, testProjectId, 'REQ36_数量表'))
        .id;
    });

    test('数量グループと数量項目2行を作成する', async ({ page }) => {
      await openQuantityTableEdit(page, createdQuantityTableId);

      const groupCard = await addQuantityGroup(page);
      const itemRows = await addQuantityItemRows(groupCard, 2);

      await fillItemRequiredFields(itemRows.nth(0), { name: FIRST_ITEM_NAME });
      await fillItemRequiredFields(itemRows.nth(1), { name: SECOND_ITEM_NAME });

      // REQ-42.5: 追加はクライアントドラフトの更新に留まるため明示保存して永続化する。
      // 後続の各テストは編集画面を開き直して前提を参照する。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-36.1
   * @requirement quantity-table-generation/REQ-36.2
   * 個別ボタンが非表示でアクションメニューボタンが表示される
   */
  test('数量項目行にアクションメニューボタンが表示され、個別の並び替え・削除ボタンが非表示である (REQ-36.1, REQ-36.2)', async ({
    page,
  }) => {
    const itemRows = await openPreparedItemRows(page);
    const firstItemRow = itemRows.first();

    // REQ-36.1: 個別の並び替え・削除ボタンは行に存在しない
    await expect(
      firstItemRow.getByRole('button', { name: '上へ移動' }),
      'REQ-36.1: 行に個別の「上へ移動」ボタンが存在しない'
    ).toHaveCount(0);
    await expect(
      firstItemRow.getByRole('button', { name: '下へ移動' }),
      'REQ-36.1: 行に個別の「下へ移動」ボタンが存在しない'
    ).toHaveCount(0);
    await expect(
      firstItemRow.getByRole('button', { name: '削除' }),
      'REQ-36.1: 行に個別の「削除」ボタンが存在しない'
    ).toHaveCount(0);

    // REQ-36.2: アクションメニューに「上へ移動」「下へ移動」「削除」が含まれる
    const menu = await openActionMenu(page, firstItemRow);
    await expect(menu.getByRole('menuitem', { name: /上へ移動/ })).toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(menu.getByRole('menuitem', { name: /下へ移動/ })).toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(menu.getByRole('menuitem', { name: /削除/ })).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-36.6
   * 最上位項目の「上へ移動」が無効化されている
   */
  test('最上位の数量項目でアクションメニューの「上へ移動」が無効化されている (REQ-36.6)', async ({
    page,
  }) => {
    const itemRows = await openPreparedItemRows(page);

    const menu = await openActionMenu(page, itemRows.first());
    await expect(
      menu.getByRole('menuitem', { name: /上へ移動/ }),
      'REQ-36.6: 最上位項目の「上へ移動」は無効化される'
    ).toBeDisabled();
    // 最上位でも「下へ移動」は有効であること（無効化が位置に依存することの確認）
    await expect(
      menu.getByRole('menuitem', { name: /下へ移動/ }),
      'REQ-36.6: 最上位項目の「下へ移動」は有効のままである'
    ).toBeEnabled();
  });

  /**
   * @requirement quantity-table-generation/REQ-36.7
   * 最下位項目の「下へ移動」が無効化されている
   */
  test('最下位の数量項目でアクションメニューの「下へ移動」が無効化されている (REQ-36.7)', async ({
    page,
  }) => {
    const itemRows = await openPreparedItemRows(page);

    const menu = await openActionMenu(page, itemRows.last());
    await expect(
      menu.getByRole('menuitem', { name: /下へ移動/ }),
      'REQ-36.7: 最下位項目の「下へ移動」は無効化される'
    ).toBeDisabled();
    await expect(
      menu.getByRole('menuitem', { name: /上へ移動/ }),
      'REQ-36.7: 最下位項目の「上へ移動」は有効のままである'
    ).toBeEnabled();
  });

  /**
   * @requirement quantity-table-generation/REQ-36.3
   * @requirement quantity-table-generation/REQ-36.4
   * @requirement quantity-table-generation/REQ-6.3
   * 「上へ移動」「下へ移動」操作で項目が移動する
   *
   * 受入基準 6.3（移動先として同一数量グループ内の位置が選択されたとき、選択数量項目を指定位置へ移す）は、
   * 本画面ではアクションメニューの「上へ移動」「下へ移動」で隣接する位置を選ぶ形で実現している
   * （`QuantityTableEditPage.tsx` の `handleMoveItem` → reducer の `reorderItem`）。
   * 名称で識別した2行の並びが入れ替わることを主張するため、移動しなかった場合はこの検証が落ちる。
   */
  test('アクションメニューから「下へ移動」「上へ移動」で項目位置が入れ替わる (REQ-36.3, REQ-36.4)', async ({
    page,
  }) => {
    const itemRows = await openPreparedItemRows(page);

    await expect(itemNameOf(itemRows.nth(0)), '移動前は先頭行が1件目である').toHaveValue(
      FIRST_ITEM_NAME
    );

    // REQ-36.4: 先頭行を「下へ移動」すると2行目と入れ替わる
    const menu = await openActionMenu(page, itemRows.nth(0));
    await menu.getByRole('menuitem', { name: /下へ移動/ }).click();

    await expect(
      itemNameOf(itemRows.nth(0)),
      'REQ-36.4: 「下へ移動」で先頭行が入れ替わる'
    ).toHaveValue(SECOND_ITEM_NAME);
    await expect(
      itemNameOf(itemRows.nth(1)),
      'REQ-36.4: 「下へ移動」した項目が2行目に来る'
    ).toHaveValue(FIRST_ITEM_NAME);

    // REQ-36.3: 2行目に来た項目を「上へ移動」すると元の並びに戻る
    const restoreMenu = await openActionMenu(page, itemRows.nth(1));
    await restoreMenu.getByRole('menuitem', { name: /上へ移動/ }).click();

    await expect(itemNameOf(itemRows.nth(0)), 'REQ-36.3: 「上へ移動」で元の並びに戻る').toHaveValue(
      FIRST_ITEM_NAME
    );
    await expect(
      itemNameOf(itemRows.nth(1)),
      'REQ-36.3: 「上へ移動」で2行目が元に戻る'
    ).toHaveValue(SECOND_ITEM_NAME);
  });

  /**
   * @requirement quantity-table-generation/REQ-36.5
   * 「削除」操作で項目が削除される
   *
   * 並び順の変更と同じくドラフトのみを更新する（REQ-42.1）。保存しないため、
   * 次のテストが編集画面を開き直した時点で2行の前提は復元される。
   */
  test('アクションメニューから「削除」で当該項目が削除される (REQ-36.5)', async ({ page }) => {
    const itemRows = await openPreparedItemRows(page);

    const menu = await openActionMenu(page, itemRows.last());
    await menu.getByRole('menuitem', { name: /削除/ }).click();

    await expect(itemRows, 'REQ-36.5: 「削除」で行が1件減る').toHaveCount(1, {
      timeout: getTimeout(10000),
    });
    await expect(
      itemNameOf(itemRows.first()),
      'REQ-36.5: 削除されたのは最下位の項目である'
    ).toHaveValue(FIRST_ITEM_NAME);
  });

  /**
   * @requirement quantity-table-generation/REQ-36.8
   * 既存のアクション項目（コピー等）が統合されて表示される
   */
  test('アクションメニューにコピー操作も統合されている (REQ-36.8)', async ({ page }) => {
    const itemRows = await openPreparedItemRows(page);

    const menu = await openActionMenu(page, itemRows.first());
    await expect(
      menu.getByRole('menuitem', { name: /コピー/ }),
      'REQ-36.8: コピーが同じメニューに統合されている'
    ).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-36.9
   * メニュー外クリックでドロップダウンが閉じる
   */
  test('アクションメニュー外をクリックするとドロップダウンが閉じる (REQ-36.9)', async ({
    page,
  }) => {
    const itemRows = await openPreparedItemRows(page);

    const menu = await openActionMenu(page, itemRows.first());

    // メニュー外（ページ左上）をクリックする
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    await expect(menu, 'REQ-36.9: メニュー外クリックでドロップダウンが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });
  });
});
