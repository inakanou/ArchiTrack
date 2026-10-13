/**
 * @fileoverview 数量グループ名前変更 E2Eテスト (REQ-22)
 *
 * ## 前提の用意（Task 115.132）
 *
 * 以前の遷移補助は、事前準備で得たIDが使えない場合に「プロジェクト一覧の先頭カード →
 * 詳細 → 数量表一覧 → 先頭の数量表カード」を辿るUIフローを持っていた。
 * この経路が参照していたプロジェクトカードの目印は、テスト側が識別子を持たない固定値を
 * 指す一方で実装はカードごとに識別子を付した値を出しており、**一度も一致しない**。
 * 一致しない観測は失敗ではなく沈黙として現れるため、辿り着けないことを偽で返し、
 * 呼び出し側がその偽を見て検証を諦める形は AI運用7原則 第3原則に抵触する。
 *
 * さらにこのUIフローは他の数量表E2E（`quantity-table-phase10.spec.ts` /
 * `photo-comment-display.spec.ts`）にも複製されており、目印だけを直す是正は
 * 複製の温存になる。本ファイルは前提（プロジェクト・数量表・数量グループ1件）を
 * 共通の補助 `e2e/helpers/quantity-table-preconditions.ts` で**自ら作り**、
 * 作れなければその場で失敗する。探す経路は持たない。
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-22.1: グループ名クリックで編集モード
 * - @requirement quantity-table-generation/REQ-22.2: 編集確定で即座に反映
 * - @requirement quantity-table-generation/REQ-22.3: 空白名でエラー表示
 * - @requirement quantity-table-generation/REQ-22.4: 最大文字数（全角25/半角50）
 * - @requirement quantity-table-generation/REQ-22.5: 最大文字数超過の入力防止
 *
 * @module e2e/specs/quantity-tables/group-rename-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import {
  addQuantityGroup,
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/** 事前準備で作成した数量表のID（数量グループ1件を持つ） */
let preparedQuantityTableId: string | null = null;

/**
 * 最初の数量グループカードを返す。
 *
 * REQ-22 の各検証はグループが 1 件存在することを前提とし、その 1 件は本ファイルの
 * 事前準備が作成している。表示されない場合は前提の生成が壊れているということであり、
 * 「無ければ null」を返すと呼び出し側は黙って検証を諦めるほかない。
 * 前提が崩れた地点で失敗させる。
 */
async function requireFirstGroupCard(page: Page) {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
  await expect(groupCard, '前提: 事前準備で作成した数量グループのカード').toBeVisible({
    timeout: getTimeout(5000),
  });
  return groupCard;
}

test.describe('REQ-22: 数量グループの名前変更', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表・グループを作成する。
   *
   * REQ-22 のテストはグループの存在を前提とするため、独立して実行できるよう
   * 事前にプロジェクト・数量表・グループ1件を作成する。生成の各段は補助の内側で
   * 主張されており、いずれかが崩れればこの事前準備が失敗する。
   */
  test.describe('事前準備', () => {
    test('数量グループを1件持つ数量表を作成する', async ({ page }) => {
      const projectId = await createTestProject(page, 'REQ22_PJ');
      const quantityTable = await createTestQuantityTable(page, projectId, 'REQ22_数量表');
      preparedQuantityTableId = quantityTable.id;

      // グループを1つ追加（REQ-22 のテストはグループの存在を前提）。
      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。カードの出現は補助が主張する。
      await addQuantityGroup(page);

      // REQ-42.5: 後続テストが別ナビゲーションでグループを参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-22.1: グループ名クリックで編集モード
   */
  test('グループ名クリックで編集用inputが表示される (REQ-22.1)', async ({ page }) => {
    await openQuantityTableEdit(page, preparedQuantityTableId);

    const groupCard = await requireFirstGroupCard(page);

    // グループ名（h3）をクリック
    const groupName = groupCard.locator('h3').first();
    await expect(groupName).toBeVisible({ timeout: getTimeout(3000) });
    await groupName.click();

    // 編集用inputが表示される
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-22.2: 編集確定で即座に反映
   */
  test('編集後Enterで新しい名前が即座に反映される (REQ-22.2)', async ({ page }) => {
    await openQuantityTableEdit(page, preparedQuantityTableId);

    const groupCard = await requireFirstGroupCard(page);

    const groupName = groupCard.locator('h3').first();

    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    const newName = `E2E_REQ22_${Date.now()}`;
    await editInput.fill(newName);
    await editInput.press('Enter');

    // 名前が変更された状態のh3が表示される
    // h3 は role="button" にオーバーライドされるため、タグセレクタで filter する
    const updatedHeading = groupCard.locator('h3').filter({ hasText: newName }).first();
    await expect(updatedHeading).toBeVisible({
      timeout: getTimeout(8000),
    });

    // 名前の変更はクライアントドラフトのみを更新し、本テストは保存しない（REQ-22.2 注記 / REQ-42）。
    // 後続テストは編集画面を開き直すため、永続化された元の名前から始まる。元へ戻す操作は不要である。
  });

  /**
   * @requirement quantity-table-generation/REQ-22.3: 空白名でエラー表示
   */
  test('空白のグループ名で確定時にエラーメッセージが表示される (REQ-22.3)', async ({ page }) => {
    await openQuantityTableEdit(page, preparedQuantityTableId);

    const groupCard = await requireFirstGroupCard(page);

    const groupName = groupCard.locator('h3').first();
    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    // 空白のみ入力してEnter
    await editInput.fill('   ');
    await editInput.press('Enter');

    // エラーメッセージ「グループ名を入力してください」が表示される
    const errorMessage = groupCard.getByText('グループ名を入力してください');
    await expect(errorMessage).toBeVisible({ timeout: getTimeout(5000) });

    // Escでキャンセル
    await editInput.press('Escape');
  });

  /**
   * @requirement quantity-table-generation/REQ-22.4: 最大文字数（全角25/半角50）
   */
  test('最大50半角文字までは入力できる (REQ-22.4)', async ({ page }) => {
    await openQuantityTableEdit(page, preparedQuantityTableId);

    const groupCard = await requireFirstGroupCard(page);

    const groupName = groupCard.locator('h3').first();
    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    // 半角50文字（'a' x 50）を入力
    const fiftyChars = 'a'.repeat(50);
    await editInput.fill(fiftyChars);
    const valueAt50 = await editInput.inputValue();
    expect(valueAt50.length, '半角50文字までは入力可能').toBe(50);

    // Esc でキャンセル
    await editInput.press('Escape');
  });

  /**
   * @requirement quantity-table-generation/REQ-22.5: 最大文字数超過の入力防止
   */
  test('最大文字数を超える入力は防止される (REQ-22.5)', async ({ page }) => {
    await openQuantityTableEdit(page, preparedQuantityTableId);

    const groupCard = await requireFirstGroupCard(page);

    const groupName = groupCard.locator('h3').first();
    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    // 半角51文字を入力試行（onChangeで最大幅50を超える更新は破棄される）
    const overSizedChars = 'a'.repeat(51);
    await editInput.fill(overSizedChars);
    const value = await editInput.inputValue();

    // 入力値は最大50文字以下に制限される
    expect(value.length, '最大50半角文字を超える入力は防止される').toBeLessThanOrEqual(50);

    await editInput.press('Escape');
  });
});
