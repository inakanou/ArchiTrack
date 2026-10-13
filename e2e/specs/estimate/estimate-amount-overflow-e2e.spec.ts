/**
 * @fileoverview 見積の金額の上限超過（オーバーフロー）の警告表示の E2E テスト
 *
 * Task 61.2: 見積書詳細画面で単価・数量を入力した結果、金額計算（葉の 数量×単価、
 * 親の子の合計、サマリーの合計）が金額の上限（保存スキーマの整数部13桁・小数部2桁、
 * 表示上 9,999,999,999,999 円）を超えたとき、画面にオーバーフロー警告が出ること、
 * 上限を超えた金額欄に印が付くこと、上限内へ戻すと警告が消えることを検証する。
 * 上限を超えたまま保存すると、従来どおりサーバーが 400 で拒む（警告の文言どおり保存できない）。
 *
 * 前提の明細は API で用意する: 親項目（子の合計）・子項目A（6兆円）・子項目B（1000円）。
 * 親の合計は 6,000,000,001,000 円で上限内。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-13.5: 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
 *
 * @module e2e/specs/estimate/estimate-amount-overflow-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { seedProject } from '../../helpers/project-list-preconditions';
import { buildNewEstimateItemNode, saveEstimateDraft } from '../../helpers/estimate-draft';

const PARENT_NAME = '上限超過_親項目';
const CHILD_A_NAME = '上限超過_子項目A';
const CHILD_B_NAME = '上限超過_子項目B';

/** 見積書を作り、親項目と子 2 件を保存して見積書 ID を返す */
const seedEstimate = async (page: Page, label: string): Promise<string> => {
  const project = await seedProject(page, label);
  const token = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
  expect(token, '前提: アクセストークンを取得できる').toBeTruthy();
  const estimateRes = await page.request.post(
    `${API_BASE_URL}/api/projects/${project.id}/estimates`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `${label}_${Date.now()}` },
    }
  );
  expect(estimateRes.status(), '前提: 見積書が作成される').toBe(201);
  const estimateId = ((await estimateRes.json()) as { id: string }).id;
  expect(estimateId).toBeTruthy();

  await saveEstimateDraft(page.request, token, estimateId, [
    buildNewEstimateItemNode({
      name: PARENT_NAME,
      children: [
        buildNewEstimateItemNode({
          name: CHILD_A_NAME,
          quantity: 1,
          estimateUnitPrice: 6000000000000,
          executionUnitPrice: 100,
        }),
        buildNewEstimateItemNode({
          name: CHILD_B_NAME,
          quantity: 1,
          estimateUnitPrice: 1000,
          executionUnitPrice: 100,
        }),
      ],
    }),
  ]);
  return estimateId;
};

const openEstimate = async (page: Page, estimateId: string): Promise<void> => {
  await page.goto(`/estimates/${estimateId}`);
  await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
};

/** 表示順の n 番目の見積項目の見積金額行（名称で取り違えていないことも確かめる） */
const estimateLineOf = async (page: Page, index: number, name: string): Promise<Locator> => {
  const line = page
    .locator('[aria-label="見積項目テーブル"] [data-testid="estimate-item-row"]')
    .nth(index)
    .locator('[data-testid="line-type-ESTIMATE"]');
  await expect(line.locator('input[aria-label="名称"]')).toHaveValue(name, {
    timeout: getTimeout(15000),
  });
  return line;
};

test.describe('見積の金額の上限超過の警告', () => {
  /**
   * @requirement estimate-creation/REQ-13.5
   */
  test('金額計算結果が上限を超えるとオーバーフロー警告を表示し、上限内へ戻すと消える (estimate-creation/REQ-13.5)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(120000));

    await loginAsUser(page, 'REGULAR_USER');
    const estimateId = await seedEstimate(page, 'E2E金額上限超過');
    await openEstimate(page, estimateId);

    const warning = page.getByTestId('estimate-amount-overflow-warning');
    const parentLine = await estimateLineOf(page, 0, PARENT_NAME);
    const childALine = await estimateLineOf(page, 1, CHILD_A_NAME);
    const childBLine = await estimateLineOf(page, 2, CHILD_B_NAME);
    const parentAmount = parentLine.getByTestId('amount-field');
    const childAAmount = childALine.getByTestId('amount-field');
    const childBAmount = childBLine.getByTestId('amount-field');
    const summary = page.getByTestId('summary-panel');

    // ---- 上限内の間は警告が出ない ----
    await expect(parentAmount).toHaveText('6,000,000,001,000');
    await expect(warning).toHaveCount(0);
    await expect(page.locator('[data-amount-overflow="true"]')).toHaveCount(0);

    // ---- 子項目B の単価を 6兆円にすると、親の合計（12兆円）とサマリーが上限を超える ----
    const unitPriceB = childBLine.locator('input[aria-label="単価"]');
    await unitPriceB.fill('6000000000000');
    await unitPriceB.blur();

    await expect(warning).toBeVisible({ timeout: getTimeout(10000) });
    await expect(warning).toHaveAttribute('role', 'alert');
    await expect(warning).toContainText('金額が上限（9,999,999,999,999円）を超えています');
    await expect(warning).toContainText('上限を超えた金額は保存できません');
    await expect(warning).toContainText('明細 1 件、サマリー 2 件');

    await expect(parentAmount).toContainText('12,000,000,000,000');
    await expect(parentAmount).toHaveAttribute('data-amount-overflow', 'true');
    await expect(parentAmount).toHaveAttribute('aria-invalid', 'true');
    await expect(parentAmount).toContainText('⚠');
    await expect(parentAmount).toHaveAccessibleDescription(
      '金額が上限（9,999,999,999,999円）を超えています'
    );
    // 子B 自身（6兆円）は上限内なので印は付かない
    await expect(childBAmount).toHaveText('6,000,000,000,000');
    await expect(childBAmount).not.toHaveAttribute('data-amount-overflow', 'true');

    // サマリーの見積金額合計と利益額に印が付き、警告文が説明として結び付く
    const overflowingSummary = summary.locator('[data-amount-overflow="true"]');
    await expect(overflowingSummary).toHaveCount(2);
    for (const value of await overflowingSummary.all()) {
      await expect(value).toHaveAttribute('aria-invalid', 'true');
      await expect(value).toHaveAccessibleDescription(
        /金額が上限（9,999,999,999,999円）を超えています/
      );
    }

    // ---- 子項目A の数量を 2 にすると、数量×単価の結果そのもの（12兆円）も上限を超える ----
    const quantityA = childALine.locator('input[aria-label="数量"]');
    await quantityA.fill('2');
    await quantityA.blur();
    await expect(childAAmount).toHaveAttribute('data-amount-overflow', 'true');
    await expect(warning).toContainText('明細 2 件');

    // ---- 上限を超えたまま保存すると、サーバーが 400 で拒み、保存失敗を表示する ----
    const saveResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/estimates/${estimateId}/save` &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(15000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saveResponse).status()).toBe(400);
    await expect(page.getByTestId('estimate-save-error')).toBeVisible({
      timeout: getTimeout(10000),
    });
    // 編集中の内容は保持され、警告も出たまま
    await expect(warning).toBeVisible();

    // ---- 上限内へ戻すと警告と印が消える ----
    await quantityA.fill('1');
    await quantityA.blur();
    await unitPriceB.fill('1000');
    await unitPriceB.blur();
    await expect(warning).toHaveCount(0, { timeout: getTimeout(10000) });
    await expect(page.locator('[data-amount-overflow="true"]')).toHaveCount(0);
    await expect(parentAmount).toHaveText('6,000,000,001,000');
  });

  /**
   * @requirement estimate-creation/REQ-13.5
   */
  test('スマートフォン幅（375px）でもオーバーフロー警告が画面の横幅に収まる (estimate-creation/REQ-13.5)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(120000));

    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsUser(page, 'REGULAR_USER');
    const estimateId = await seedEstimate(page, 'E2E金額上限超過375');
    await openEstimate(page, estimateId);

    const childBLine = await estimateLineOf(page, 2, CHILD_B_NAME);
    const unitPriceB = childBLine.locator('input[aria-label="単価"]');
    await unitPriceB.fill('6000000000000');
    await unitPriceB.blur();

    const warning = page.getByTestId('estimate-amount-overflow-warning');
    await expect(warning).toBeVisible({ timeout: getTimeout(10000) });

    // 警告の左右端がビューポートの内側にあり、警告の中身が横にはみ出していない
    const box = await warning.boundingBox();
    expect(box, '警告の矩形を取得できる').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    const overflow = await warning.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
