/**
 * @fileoverview 数量表一覧画面での数量表名の編集と即時保存 E2Eテスト
 *
 * 一覧画面で数量表名を確定した時点で PUT /api/quantity-tables/:id が発行され、
 * 保存操作を経ずに永続化されることを、再読み込み後の表示で確かめる。
 * 編集画面の明示保存（Requirement 42 / 受入基準 2.6）は編集画面の規定であり、
 * 本ファイルの対象ではない。
 *
 * 前提（プロジェクト・数量表）は `e2e/helpers/quantity-table-preconditions.ts` で
 * テストごとに自ら作り、作れなければその場で失敗する。各テストは自前の
 * プロジェクトを持つため、互いの成否に依存しない。
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-2.5: 一覧画面で数量表名を編集すると即座に保存する
 *
 * @module e2e/specs/quantity-tables/quantity-table-list-rename-e2e.spec
 */

import { test, expect, type Page, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createTestProject,
  createTestQuantityTable,
} from '../../helpers/quantity-table-preconditions';

/**
 * 数量表の更新リクエスト（PUT /api/quantity-tables/:id）かを判定する。
 *
 * オリジンは環境で食い違う（CI とローカルで API のホスト表記が異なる）ため、
 * パスとメソッドだけで判定する。
 */
function isQuantityTableUpdateRequest(request: Request, quantityTableId: string): boolean {
  return (
    request.method() === 'PUT' &&
    new URL(request.url()).pathname === `/api/quantity-tables/${quantityTableId}`
  );
}

/**
 * 数量表一覧画面を開き、対象の数量表カードが表示されるまで待つ。
 */
async function openListPage(page: Page, projectId: string, tableName: string): Promise<void> {
  await page.goto(`/projects/${projectId}/quantity-tables`);
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('link', { name: `${tableName}の数量表詳細を見る` }),
    '前提: 作成した数量表が一覧に表示される'
  ).toBeVisible({ timeout: getTimeout(15000) });
}

/**
 * 一覧画面で唯一の数量表カードの名前の編集を始め、入力欄を返す。
 */
async function startRename(page: Page, currentName: string) {
  const editButton = page.getByRole('button', { name: '名前を編集' });
  await expect(editButton, 'REQ-2.5: 一覧画面に数量表名の編集操作が無い').toHaveCount(1, {
    timeout: getTimeout(10000),
  });
  await editButton.click();

  const nameInput = page.getByRole('textbox', { name: '数量表名を編集' });
  await expect(nameInput, 'REQ-2.5: 数量表名の入力欄が表示されない').toBeVisible({
    timeout: getTimeout(5000),
  });
  await expect(nameInput, 'REQ-2.5: 入力欄が現在の数量表名を持たない').toHaveValue(currentName);
  return nameInput;
}

test.describe('数量表一覧画面での数量表名の編集 (quantity-table-generation/REQ-2.5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test('Enterで確定すると即座に保存され、再読み込み後も新しい名前が表示される', async ({
    page,
  }) => {
    const projectId = await createTestProject(page, 'REQ2_5_Enter');
    const table = await createTestQuantityTable(page, projectId, 'REQ2_5_改名前');
    await openListPage(page, projectId, table.name);

    const nameInput = await startRename(page, table.name);
    const newName = `REQ2_5_改名後_${Date.now()}`;
    await nameInput.fill(newName);

    const updateResponsePromise = page.waitForResponse(
      (response) => isQuantityTableUpdateRequest(response.request(), table.id),
      { timeout: getTimeout(15000) }
    );
    await nameInput.press('Enter');
    const updateResponse = await updateResponsePromise;

    expect(updateResponse.status(), 'REQ-2.5: 数量表名の更新が成功しない').toBe(200);
    expect(
      updateResponse.request().postDataJSON(),
      'REQ-2.5: 確定した名前が更新リクエストに載らない'
    ).toMatchObject({ name: newName });

    await expect(
      page.getByRole('link', { name: `${newName}の数量表詳細を見る` }),
      'REQ-2.5: 確定後の一覧に新しい名前が表示されない'
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(
      page.getByRole('button', { name: /^保存$/ }),
      'REQ-2.5: 一覧画面の名称変更が保存操作を要求している'
    ).toHaveCount(0);

    // 画面の状態ではなく永続化された値を見る
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('link', { name: `${newName}の数量表詳細を見る` }),
      'REQ-2.5: 再読み込み後に新しい名前が表示されない（永続化されていない）'
    ).toBeVisible({ timeout: getTimeout(15000) });
    await expect(
      page.getByRole('link', { name: `${table.name}の数量表詳細を見る` }),
      'REQ-2.5: 再読み込み後も元の名前が残っている'
    ).toHaveCount(0);
  });

  test('入力欄からフォーカスを外すと即座に保存され、再読み込み後も新しい名前が表示される', async ({
    page,
  }) => {
    const projectId = await createTestProject(page, 'REQ2_5_Blur');
    const table = await createTestQuantityTable(page, projectId, 'REQ2_5_改名前');
    await openListPage(page, projectId, table.name);

    const nameInput = await startRename(page, table.name);
    const newName = `REQ2_5_フォーカス外し_${Date.now()}`;
    await nameInput.fill(newName);

    const updateResponsePromise = page.waitForResponse(
      (response) => isQuantityTableUpdateRequest(response.request(), table.id),
      { timeout: getTimeout(15000) }
    );
    await page.getByRole('heading', { level: 1, name: '数量表一覧' }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status(), 'REQ-2.5: 数量表名の更新が成功しない').toBe(200);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('link', { name: `${newName}の数量表詳細を見る` }),
      'REQ-2.5: 再読み込み後に新しい名前が表示されない（永続化されていない）'
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  test('Escapeで取り消すと更新リクエストを発行せず、元の名前のまま保たれる', async ({ page }) => {
    const projectId = await createTestProject(page, 'REQ2_5_Escape');
    const table = await createTestQuantityTable(page, projectId, 'REQ2_5_取消');
    await openListPage(page, projectId, table.name);

    const updateRequests: string[] = [];
    page.on('request', (request) => {
      if (isQuantityTableUpdateRequest(request, table.id)) {
        updateRequests.push(request.url());
      }
    });

    const nameInput = await startRename(page, table.name);
    await nameInput.fill(`REQ2_5_取り消す名前_${Date.now()}`);
    await nameInput.press('Escape');

    await expect(nameInput, 'REQ-2.5: 取り消し後も入力欄が残っている').toHaveCount(0);
    await expect(
      page.getByRole('link', { name: `${table.name}の数量表詳細を見る` }),
      'REQ-2.5: 取り消し後に元の名前が表示されない'
    ).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('link', { name: `${table.name}の数量表詳細を見る` }),
      'REQ-2.5: 取り消したのに名前が変わっている'
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(updateRequests, 'REQ-2.5: 取り消したのに更新リクエストが発行された').toEqual([]);
  });
});
