/**
 * @fileoverview 受領見積書ダイアログ横幅拡大 E2E テスト（REQ-32）
 *
 * Requirements coverage (estimate-request):
 * - REQ-32.1: 登録ダイアログの横幅を従来より広く表示する
 * - REQ-32.2: 編集ダイアログの横幅を従来より広く表示する
 * - REQ-32.3: 拡大後も PDF プレビューと明細行入力エリアが両方適切に配置される
 * - REQ-32.4: 拡大後もすべての既存機能が動作する（ファイル選択・キャンセル・保存）
 * - REQ-32.5: 画面端からの余白を確保し画面外にはみ出さない
 * - REQ-32.6: レスポンシブ：画面幅が狭い環境でも適切に表示される
 *
 * @module e2e/specs/estimate-requests/dialog-width-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

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

test.describe('受領見積書ダイアログ横幅拡大（REQ-32）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  // 編集ダイアログ向けに作成した受領見積書 ID（cleanup ではプロジェクト削除でカスケード）
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
        data: { name: `E2EダイアログW_${Date.now()}`, siteAddress: '東京都', salesPersonId },
      });
      createdProjectId = (await project.json()).id;

      const partner = await request.post(`${baseUrl}/api/trading-partners`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `ダイアログW業者_${Date.now()}`,
          // nameKana は全角カタカナのみ許可（trading-partner.schema.ts: NAME_KANA_KATAKANA_ONLY）
          nameKana: 'ダイアログダブリュー',
          address: '東京都',
          types: ['SUBCONTRACTOR'],
          email: `dialog-w-${Date.now()}@example.com`,
        },
      });
      createdTradingPartnerId = (await partner.json()).id;

      const qt = await request.post(`${baseUrl}/api/projects/${createdProjectId}/quantity-tables`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `DW_QT_${Date.now()}` },
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
          data: { name: `DW内訳書_${Date.now()}`, quantityTableId: qtId },
        }
      );
      createdItemizedStatementId = (await isRes.json()).id;

      const er = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `DW見積依頼_${Date.now()}`,
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
  // REQ-32.1, 32.5: 登録ダイアログ横幅
  // ==========================================================================

  test.describe('登録ダイアログの横幅と画面端余白', () => {
    /**
     * @requirement estimate-request/REQ-32.1
     * @requirement estimate-request/REQ-32.5
     */
    test('登録ダイアログが従来より広い横幅（>= 1000px）かつ viewport を超えない (REQ-32.1, 32.5)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      // 1920x1080 程度の十分な viewport を確保
      await page.setViewportSize({ width: 1600, height: 900 });

      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // ダイアログのコンテンツ領域を取得して幅を測定
      // ReceivedQuotationForm を内包する modalContent (width: 1400px, maxWidth: 95vw)
      const modalContent = page
        .locator('div')
        .filter({ has: page.getByText(/受領見積書の登録/i) })
        .filter({ hasText: 'ファイル' })
        .first();

      const box = await modalContent.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // REQ-32.1: 従来の典型ダイアログ幅(700-900)より広い 1000px 以上
        expect(box.width).toBeGreaterThanOrEqual(1000);
        // REQ-32.5: 画面端からはみ出さない（viewport に収まる）
        const viewport = page.viewportSize();
        if (viewport) {
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          expect(box.x).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  // ==========================================================================
  // REQ-32.3, 32.4: PDF プレビューと明細行 + 既存機能（保存・キャンセル）
  // ==========================================================================

  test.describe('PDF プレビュー・明細行・既存機能の動作', () => {
    /**
     * @requirement estimate-request/REQ-32.3
     */
    test('拡大ダイアログで PDF プレビューエリアと明細行入力エリアの両方が表示される (REQ-32.3)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await page.setViewportSize({ width: 1600, height: 900 });
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // PDF プレビュー対象を発生させる：PDF をアップロード
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      // PDF プレビュー（拡大ボタンの存在で代理確認）
      await expect(page.getByRole('button', { name: '拡大' })).toBeVisible({
        timeout: getTimeout(20000),
      });

      // 明細行入力エリア（行1 名称テキストボックスの存在）
      await expect(page.locator('input[aria-label="行1 名称"]')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-32.4
     */
    test('拡大ダイアログでキャンセル・保存ボタンなど既存機能が動作する (REQ-32.4)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await page.setViewportSize({ width: 1600, height: 900 });
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // ファイル選択フィールド（REQ-32.4: ファイルアップロード機能）
      await expect(page.locator('[data-testid="file-input"]')).toBeAttached();

      // 行追加ボタンは表示されている（明細行編集機能）
      await expect(page.getByRole('button', { name: '行を追加' })).toBeVisible();

      // キャンセル/保存ボタンが表示されている
      const cancelButton = page.getByRole('button', { name: /キャンセル/ }).first();
      const submitButton = page.getByRole('button', { name: /^登録$|^保存$/ }).last();
      await expect(cancelButton).toBeVisible();
      await expect(submitButton).toBeVisible();

      // キャンセルボタンでダイアログを閉じる（dirty=false なので確認なしで閉じる）
      await cancelButton.click();
      await expect(page.getByText(/受領見積書の登録/i)).toBeHidden({
        timeout: getTimeout(10000),
      });
    });
  });

  // ==========================================================================
  // REQ-32.6: レスポンシブ
  // ==========================================================================

  test.describe('レスポンシブ表示', () => {
    /**
     * @requirement estimate-request/REQ-32.6
     */
    test('画面幅が狭い環境（1024px）でもダイアログが画面に収まり機能が動作する (REQ-32.6)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      // 狭い viewport
      await page.setViewportSize({ width: 1024, height: 768 });
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      const modalContent = page
        .locator('div')
        .filter({ has: page.getByText(/受領見積書の登録/i) })
        .filter({ hasText: 'ファイル' })
        .first();
      const box = await modalContent.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // 画面幅以下に収まる（maxWidth: 95vw のレスポンシブ制御）
        expect(box.width).toBeLessThanOrEqual(1024);
        expect(box.x + box.width).toBeLessThanOrEqual(1024);
      }

      // キャンセル/保存ボタンが押下可能な位置に存在する
      await expect(page.getByRole('button', { name: /キャンセル/ }).first()).toBeVisible();
    });
  });

  // ==========================================================================
  // REQ-32.2: 編集ダイアログ横幅
  // ==========================================================================

  test.describe('編集ダイアログの横幅', () => {
    /**
     * @requirement estimate-request/REQ-32.2
     */
    test('編集ダイアログが従来より広い横幅（>= 1000px）で表示される (REQ-32.2)', async ({
      page,
      request,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const baseUrl = API_BASE_URL;

      // 編集対象として受領見積書を1件作成
      const create = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `編集W_${Date.now()}`,
            // createReceivedQuotationSchema は ISO 8601 datetime（z.string().datetime()）を要求するため
            // 日付のみ '2026-04-27' は datetime 形式不正として 400 になる
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
      // 形式が異なる場合に備え、201 系であることのみ確認
      expect([200, 201]).toContain(create.status());
      createdQuotationId = (await create.json()).id;

      await page.setViewportSize({ width: 1600, height: 900 });
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // ページ内には「ステータスを見積受領済に変更する」ボタンも存在し /編集|変更/ で
      // 先頭にマッチしてしまう。受領見積書一覧の「編集」ボタンを完全一致で取得する
      const editButton = page.getByRole('button', { name: '編集', exact: true }).first();
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      await expect(page.getByText(/受領見積書の編集/i)).toBeVisible({
        timeout: getTimeout(15000),
      });

      const modalContent = page
        .locator('div')
        .filter({ has: page.getByText(/受領見積書の編集/i) })
        .filter({ hasText: 'ファイル' })
        .first();
      const box = await modalContent.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(1000);
      }
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
      // ID は project 削除でカスケードクリーンアップされるためここで個別に消す必要はない
      // ただし TS の noUnusedLocals 対策として参照する
      void createdQuotationId;

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
      createdQuotationId = null;
    });
  });
});
