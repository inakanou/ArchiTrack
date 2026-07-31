/**
 * @fileoverview 値引きプリセット行のE2Eテスト
 *
 * Task 51.10: 統合・E2Eテスト 値引きプリセット行の受入確認
 *
 * Requirements coverage (estimate-creation):
 * - REQ-41.1: 見積項目操作ツールバーに「値引き行追加」ボタンを提供する
 * - REQ-41.2: 名称=値引き・規格=空白・単位=式・数量=1をプリセット値とする値引き行をルートレベルに追加する
 * - REQ-41.3: 値引き行を見積金額行（ESTIMATE）のみで構成し、実行金額行・業者金額行を持たない
 * - REQ-41.4: 値引き行の単価を手入力で設定可能とする
 * - REQ-41.5: 値引き行の単価にマイナス値（負数）の入力を許容する
 * - REQ-41.6: 金額を単価×数量として自動計算し、負数の場合も負数のまま表示する
 * - REQ-41.8: 合計・見積金額合計に値引き行の金額（負数を含む）を加算（減算）して集計する
 * - REQ-41.9: 値引き行をNET金額案分（REQ-18）・利益率適用（REQ-19）の対象外とする
 * - REQ-41.10: 値引き行の名称等を手入力で変更可能とし、保存後の再読込で維持される（REQ-34整合）
 * - REQ-41.11: 値引き行の追加を未保存の変更として扱い、保存操作で確定する
 * - REQ-42.1: 追加・更新を1回の保存操作（PUT /:id/save）でまとめて確定する
 *
 * Task 53.13: 旧経路（`PUT /:id/items/batch` および保存時の `POST /discount-items`）への
 * 依存を一括保存（`PUT /:id/save`）の検証へ移行した。
 *
 * @module e2e/specs/estimate/estimate-discount-preset-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

test.describe('値引きプリセット行', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E値引き行テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト1-1-1');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2: テスト用見積書を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(accessToken).toBeTruthy();

      const response = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '値引き行テスト用見積書' },
        }
      );
      expect(response.status()).toBe(201);

      const data = await response.json();
      createdEstimateId = data.id;
      expect(createdEstimateId).toBeTruthy();
    });
  });

  // ============================================================================
  // 値引き行追加（プリセット値・見積行のみ）(REQ-41.1, 41.2, 41.3)
  // ============================================================================

  test.describe('値引き行追加', () => {
    test('「値引き行追加」ボタン押下で名称=値引き・単位=式・数量=1の見積行のみの値引き行が追加される (REQ-41.1, 41.2, 41.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「値引き行追加」ボタン（常時有効）を押下 (REQ-41.1)
      const addDiscountButton = page.getByTestId('add-discount-button');
      await expect(addDiscountButton).toBeEnabled();
      await addDiscountButton.click();

      // セットアップ直後の見積書は項目0件のため、追加後の値引き行は唯一の項目行となる
      const discountRow = page.locator('[data-testid="estimate-item-row"]');
      await expect(discountRow).toHaveCount(1, { timeout: getTimeout(5000) });

      // 値引き行は見積行（ESTIMATE）のみで構成され、実行・業者行を持たない (REQ-41.3)
      const discountEstimateLine = discountRow.locator('[data-testid="line-type-ESTIMATE"]');
      await expect(discountEstimateLine).toHaveCount(1);
      await expect(discountRow.locator('[data-testid="line-type-EXECUTION"]')).toHaveCount(0);
      await expect(discountRow.locator('[data-testid="line-type-VENDOR"]')).toHaveCount(0);

      // プリセット値: 名称=値引き、単位=式、数量=1 (REQ-41.2)
      await expect(discountEstimateLine.locator('input[aria-label="名称"]')).toHaveValue('値引き');
      await expect(discountEstimateLine.locator('input[aria-label="単位"]')).toHaveValue('式');
      await expect(discountEstimateLine.locator('input[aria-label="数量"]')).toHaveValue('1');
    });
  });

  // ============================================================================
  // 単価手入力・マイナス単価入力・負数表示・合計減算 (REQ-41.4, 41.5, 41.6, 41.8)
  // ============================================================================

  test.describe('マイナス単価入力と合計減算', () => {
    test('単価を手入力できマイナス単価入力で金額が負数表示され、保存後の見積金額合計が減算される (estimate-creation/REQ-41.4, REQ-41.5, REQ-41.6, REQ-41.8)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 値引き行を追加（セットアップ直後は項目0件のため唯一の項目行になる）
      await page.getByTestId('add-discount-button').click();

      const discountRow = page.locator('[data-testid="estimate-item-row"]');
      await expect(discountRow).toHaveCount(1, { timeout: getTimeout(5000) });

      const discountEstimateLine = discountRow.locator('[data-testid="line-type-ESTIMATE"]');

      // 単価入力欄に値を手入力できる（-3000 を入力）(REQ-41.4, REQ-41.5)
      const unitPriceInput = discountEstimateLine.locator('input[aria-label="単価"]');
      await unitPriceInput.fill('-3000');
      await unitPriceInput.blur();

      // 金額が負数表示（-3,000）になることを確認 (REQ-41.6)
      await expect(discountEstimateLine.locator('[data-testid="amount-field"]')).toHaveText(
        '-3,000'
      );

      // サマリーの見積金額合計が減算されている（値引き行のみのため -3,000）(REQ-41.8)
      const summaryPanel = page.getByTestId('summary-panel');
      const estimateTotalValue = summaryPanel
        .locator('span', { hasText: '見積金額合計' })
        .locator('xpath=following-sibling::span[1]');
      await expect(estimateTotalValue).toHaveText('-3,000円');

      // 保存（値引き行の追加は未保存の変更として扱われ、一括保存で確定する）
      // (REQ-41.8, REQ-41.11, REQ-34, REQ-42.1)
      // Task 53.6 で画面からの即時リクエストを撤去したため、追加時点では
      // `POST /discount-items` を呼ばず、保存の `PUT /:id/save` 1回で確定する
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/ }).click();
      const saveResponse = await savePromise;
      expect(saveResponse.status()).toBe(200);

      // 再読込後も値引き行が種別DISCOUNT（見積金額行1件のみ）で保持される (REQ-41.3, REQ-34)
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });
      const reloadedRow = page.locator('[data-testid="estimate-item-row"]');
      await expect(reloadedRow).toHaveCount(1, { timeout: getTimeout(5000) });
      await expect(reloadedRow.locator('[data-testid="line-type-EXECUTION"]')).toHaveCount(0);
      await expect(reloadedRow.locator('[data-testid="line-type-VENDOR"]')).toHaveCount(0);
      await expect(
        reloadedRow.locator('[data-testid="line-type-ESTIMATE"] input[aria-label="単価"]')
      ).toHaveValue('-3000');
    });
  });

  // ============================================================================
  // NET案分・利益率適用ダイアログの対象外 (REQ-41.9)
  // ============================================================================

  test.describe('NET案分・利益率適用の対象外', () => {
    test('値引き行がNET案分ダイアログ・利益率適用ダイアログの対象リストに現れない (REQ-41.9)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 直前のテストで保存済みの値引き行（唯一の項目行）が表示されていることを前提に確認
      const discountRow = page.locator('[data-testid="estimate-item-row"]');
      await expect(discountRow).toHaveCount(1, { timeout: getTimeout(5000) });
      await expect(
        discountRow.locator('[data-testid="line-type-ESTIMATE"] input[aria-label="名称"]')
      ).toHaveValue('値引き');

      // NET案分ダイアログ（「業者金額を実行金額に転記」）を開く (REQ-18)
      await page.getByRole('button', { name: '業者金額を実行金額に転記' }).click();
      const netDialog = page.getByRole('dialog');
      await expect(netDialog).toBeVisible({ timeout: getTimeout(5000) });
      // 値引き行は業者金額行を持たないため、対象リストに「値引き」が現れない (REQ-41.9)
      await expect(netDialog.getByText('値引き', { exact: true })).toHaveCount(0);
      // ダイアログを閉じる
      await netDialog
        .getByRole('button', { name: /閉じる|キャンセル|×/ })
        .first()
        .click();
      await expect(netDialog).not.toBeVisible({ timeout: getTimeout(5000) });

      // 利益率適用ダイアログ（「実行金額を見積金額に転記」）を開く (REQ-19)
      await page.getByRole('button', { name: '実行金額を見積金額に転記' }).click();
      const profitDialog = page.getByRole('dialog');
      await expect(profitDialog).toBeVisible({ timeout: getTimeout(5000) });
      // 値引き行は実行金額行を持たないため、対象リストに「値引き」が現れない (REQ-41.9)
      await expect(profitDialog.getByText('値引き', { exact: true })).toHaveCount(0);
    });
  });

  // ============================================================================
  // インライン編集の保存後再読込整合 (REQ-41.10, REQ-34)
  // ============================================================================

  test.describe('インライン編集の再読込整合', () => {
    test('値引き行の名称編集が保存後の再読込で維持される (REQ-41.10, REQ-34)', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 既存の値引き行（唯一の項目行）を特定
      const discountRow = page.locator('[data-testid="estimate-item-row"]');
      await expect(discountRow).toHaveCount(1, { timeout: getTimeout(5000) });

      // 名称を「出精値引き」に編集 (REQ-41.10)
      const nameInput = discountRow.locator(
        '[data-testid="line-type-ESTIMATE"] input[aria-label="名称"]'
      );
      await nameInput.fill('出精値引き');
      await nameInput.blur();

      // 保存（一括保存APIレスポンスを待つ）(REQ-34, REQ-42.1)
      // 旧 `PUT /:id/items/batch` は Task 53.12 で撤去され `PUT /:id/save` へ統合された
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/ }).click();
      const saveResponse = await savePromise;
      expect(saveResponse.status()).toBe(200);

      // ページを再読込して編集が維持されていることを確認 (REQ-41.10, REQ-34)
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      const editedRow = page.locator('[data-testid="estimate-item-row"]');
      await expect(editedRow).toHaveCount(1, { timeout: getTimeout(5000) });
      // 編集した名称が再読込後も維持される (REQ-41.10, REQ-34)
      await expect(
        editedRow.locator('[data-testid="line-type-ESTIMATE"] input[aria-label="名称"]')
      ).toHaveValue('出精値引き');
      // 見積行のみ構成が再読込後も維持される (REQ-41.3)
      await expect(editedRow.locator('[data-testid="line-type-EXECUTION"]')).toHaveCount(0);
      await expect(editedRow.locator('[data-testid="line-type-VENDOR"]')).toHaveCount(0);
    });
  });
});
