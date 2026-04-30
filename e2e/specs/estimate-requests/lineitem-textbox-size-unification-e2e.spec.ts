/**
 * @fileoverview 受領見積書 明細行テキストボックスサイズ統一 E2E テスト（REQ-33）
 *
 * Requirements coverage (estimate-request):
 * - REQ-33.1: 「任意分類」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.2: 「工種」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.3: 「名称」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.4: 「規格」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.5: 「単位」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.6: 「数量」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.7: 「単価」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.8: 「備考」テキストボックスのサイズが数量表画面と同じ
 * - REQ-33.9: すべてのテキストボックスの文字サイズが同じ（fontSize 12px）
 * - REQ-33.10: すべてのテキストボックスのパディングが同じ（padding 2px 4px）
 * - REQ-33.11: 編集画面でも同じサイズ・文字サイズ・パディングが適用される
 * - REQ-33.12: テキストボックスサイズ統一後も Tab キーによるフィールド移動が動作する
 * - REQ-33.13: テキストボックスサイズ統一後も明細行の追加・削除が動作する
 *
 * @module e2e/specs/estimate-requests/lineitem-textbox-size-unification-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

/**
 * 数量表画面の対応するテキストボックスサイズ仕様（QuantityInput / TextFieldInput / CalculationFields）
 *
 * 統一仕様:
 * - height: 22px
 * - padding: 2px 4px
 * - fontSize: 12px
 *
 * これらは LineItemEditor.tsx と数量表系コンポーネントの両方で同じ値を採用している。
 */
const EXPECTED_INPUT_FONT_SIZE = '12px';
const EXPECTED_INPUT_PADDING_TOP = '2px';
const EXPECTED_INPUT_PADDING_RIGHT = '4px';
const EXPECTED_INPUT_PADDING_BOTTOM = '2px';
const EXPECTED_INPUT_PADDING_LEFT = '4px';
const EXPECTED_INPUT_HEIGHT = '22px';

/**
 * computed style から padding/fontSize/height を取得する Locator ヘルパー
 */
async function getComputedSizes(page: Page, label: string) {
  const input = page.locator(`input[aria-label="${label}"]`);
  await expect(input).toBeVisible();
  return await input.evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      fontSize: styles.fontSize,
      paddingTop: styles.paddingTop,
      paddingRight: styles.paddingRight,
      paddingBottom: styles.paddingBottom,
      paddingLeft: styles.paddingLeft,
      height: styles.height,
    };
  });
}

async function openCreateDialog(page: Page, estimateRequestId: string) {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  await page.getByRole('button', { name: '受領見積書登録' }).click();
  await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
    timeout: getTimeout(10000),
  });
}

test.describe('受領見積書 明細行テキストボックスサイズ統一（REQ-33）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdQuotationId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('テストデータ準備', () => {
    test('プロジェクト・取引先・内訳書・見積依頼を作成する', async ({ request }) => {
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: TEST_USERS.REGULAR_USER.email,
          password: TEST_USERS.REGULAR_USER.password,
        },
      });
      accessToken = (await loginResponse.json()).accessToken;

      // 営業担当者 ID を取得（プロジェクト作成スキーマで salesPersonId が必須）
      const usersResponse = await request.get(`${baseUrl}/api/users/assignable`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const salesPersonId = (await usersResponse.json())[0]?.id;
      expect(salesPersonId).toBeTruthy();

      const project = await request.post(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `E2E_TextSize_${Date.now()}`, siteAddress: '東京都', salesPersonId },
      });
      createdProjectId = (await project.json()).id;

      const partner = await request.post(`${baseUrl}/api/trading-partners`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `TextSize業者_${Date.now()}`,
          nameKana: 'テキストサイズ',
          address: '東京都',
          types: ['SUBCONTRACTOR'],
          email: `textsize-${Date.now()}@example.com`,
        },
      });
      createdTradingPartnerId = (await partner.json()).id;

      const qt = await request.post(`${baseUrl}/api/projects/${createdProjectId}/quantity-tables`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `TS_QT_${Date.now()}` },
      });
      const qtId = (await qt.json()).id;
      const group = await request.post(`${baseUrl}/api/quantity-tables/${qtId}/groups`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: 'G', displayOrder: 0 },
      });
      const groupId = (await group.json()).id;
      await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: '項目',
          workType: '工',
          specification: '規',
          unit: '式',
          quantity: 1,
          displayOrder: 0,
        },
      });

      const isRes = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `TS内訳書_${Date.now()}`, quantityTableId: qtId },
        }
      );
      createdItemizedStatementId = (await isRes.json()).id;

      const er = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `TS見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      createdEstimateRequestId = (await er.json()).id;
      expect(createdEstimateRequestId).toBeTruthy();
    });
  });

  // ==========================================================================
  // REQ-33.1 〜 33.10: 各列のサイズ・文字サイズ・パディング検証（登録画面）
  // ==========================================================================

  test.describe('登録画面の明細行テキストボックスサイズ', () => {
    /**
     * @requirement estimate-request/REQ-33.1
     * @requirement estimate-request/REQ-33.2
     * @requirement estimate-request/REQ-33.3
     * @requirement estimate-request/REQ-33.4
     * @requirement estimate-request/REQ-33.5
     * @requirement estimate-request/REQ-33.6
     * @requirement estimate-request/REQ-33.7
     * @requirement estimate-request/REQ-33.8
     * @requirement estimate-request/REQ-33.9
     * @requirement estimate-request/REQ-33.10
     */
    test('登録画面の明細行各テキストボックスが数量表と同じサイズ（fontSize=12px, padding=2px 4px, height=22px）になる (REQ-33.1〜33.10)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // 任意分類, 工種, 名称, 規格, 単位, 数量, 単価, 備考 の8列をループ検証
      const labels = [
        '行1 任意分類', // REQ-33.1
        '行1 工種', // REQ-33.2
        '行1 名称', // REQ-33.3
        '行1 規格', // REQ-33.4
        '行1 単位', // REQ-33.5
        '行1 数量', // REQ-33.6
        '行1 単価', // REQ-33.7
        '行1 備考', // REQ-33.8
      ];

      for (const label of labels) {
        const sizes = await getComputedSizes(page, label);
        // REQ-33.9: fontSize は 12px
        expect(sizes.fontSize).toBe(EXPECTED_INPUT_FONT_SIZE);
        // REQ-33.10: padding は 2px 4px 2px 4px
        expect(sizes.paddingTop).toBe(EXPECTED_INPUT_PADDING_TOP);
        expect(sizes.paddingRight).toBe(EXPECTED_INPUT_PADDING_RIGHT);
        expect(sizes.paddingBottom).toBe(EXPECTED_INPUT_PADDING_BOTTOM);
        expect(sizes.paddingLeft).toBe(EXPECTED_INPUT_PADDING_LEFT);
        // REQ-33.1〜33.8 サイズ: height=22px
        expect(sizes.height).toBe(EXPECTED_INPUT_HEIGHT);
      }
    });
  });

  // ==========================================================================
  // REQ-33.11: 編集画面でも同じサイズ
  // ==========================================================================

  test.describe('編集画面の明細行テキストボックスサイズ', () => {
    /**
     * @requirement estimate-request/REQ-33.11
     */
    test('編集画面の明細行テキストボックスも登録画面と同じサイズが適用される (REQ-33.11)', async ({
      page,
      request,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const baseUrl = API_BASE_URL;

      // 1件の受領見積書を作成しておく
      const create = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `編集サイズ_${Date.now()}`,
            // createReceivedQuotationSchema は ISO 8601 datetime（z.string().datetime()）を要求
            submittedAt: '2026-04-27T00:00:00.000Z',
            lineItems: JSON.stringify([
              {
                customCategory: '',
                workType: '',
                name: 'X',
                specification: '',
                unit: '式',
                quantity: 1,
                unitPrice: 100,
                amount: 100,
                remarks: '',
                sortOrder: 0,
              },
            ]),
          },
        }
      );
      expect([200, 201]).toContain(create.status());
      createdQuotationId = (await create.json()).id;

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');
      // ページ内には「ステータスを依頼済に変更する」ボタンも存在し /編集|変更/ で
      // 先頭にマッチしてしまう。受領見積書一覧の「編集」ボタンを完全一致で取得する
      const editButton = page.getByRole('button', { name: '編集', exact: true }).first();
      await editButton.click();
      await expect(page.getByText(/受領見積書の編集/i)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 名称テキストボックスでサイズ検証（編集画面でも同じ）
      const sizes = await getComputedSizes(page, '行1 名称');
      expect(sizes.fontSize).toBe(EXPECTED_INPUT_FONT_SIZE);
      expect(sizes.paddingTop).toBe(EXPECTED_INPUT_PADDING_TOP);
      expect(sizes.paddingRight).toBe(EXPECTED_INPUT_PADDING_RIGHT);
      expect(sizes.height).toBe(EXPECTED_INPUT_HEIGHT);
    });
  });

  // ==========================================================================
  // REQ-33.12: Tab キー移動
  // ==========================================================================

  test.describe('Tabキーによるフィールド移動', () => {
    /**
     * @requirement estimate-request/REQ-33.12
     */
    test('Tab キーで「任意分類 → 工種 → 名称 → 規格 → 単位 → 数量 → 単価 → 備考」へ順次フォーカス移動する (REQ-33.12)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // 任意分類にフォーカス
      const customCategory = page.locator('input[aria-label="行1 任意分類"]');
      await customCategory.focus();

      // Tab キー連打で順次移動できることを確認
      const expectedOrder = [
        '行1 工種',
        '行1 名称',
        '行1 規格',
        '行1 単位',
        '行1 数量',
        '行1 単価',
        '行1 備考',
      ];

      for (const expectedLabel of expectedOrder) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          return active?.getAttribute('aria-label') ?? null;
        });
        expect(focused).toBe(expectedLabel);
      }
    });
  });

  // ==========================================================================
  // REQ-33.13: 行の追加・削除
  // ==========================================================================

  test.describe('明細行の追加・削除', () => {
    /**
     * @requirement estimate-request/REQ-33.13
     */
    test('行追加・削除ボタンが正常動作し、サイズ統一後も明細行操作が機能する (REQ-33.13)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // 初期: 1行
      await expect(page.locator('input[aria-label="行1 名称"]')).toBeVisible();
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveCount(0);

      // 行追加 → 2行
      await page.getByRole('button', { name: '行を追加' }).click();
      await expect(page.locator('input[aria-label="行2 名称"]')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // さらに行追加 → 3行
      await page.getByRole('button', { name: '行を追加' }).click();
      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 行2 を削除（アクションメニュー → 削除）
      await page.getByRole('button', { name: '行2の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '削除' }).click();

      // 残った行（旧 行3 が新 行2 になる）
      await expect(page.locator('input[aria-label="行2 名称"]')).toBeVisible();
      // 行3 は削除後消える
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveCount(0);
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;
      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: TEST_USERS.REGULAR_USER.email,
            password: TEST_USERS.REGULAR_USER.password,
          },
        });
        accessToken = (await loginResponse.json()).accessToken;
      }

      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (createdTradingPartnerId) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      void createdQuotationId;

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
      createdQuotationId = null;
    });
  });
});
