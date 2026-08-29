/**
 * @fileoverview 写真変更ダイアログ E2Eテスト (REQ-19)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-19.1: 写真変更ダイアログ表示
 * - @requirement quantity-table-generation/REQ-19.2: 注釈付き写真一覧の表示
 * - @requirement quantity-table-generation/REQ-19.3: 写真選択で紐づけ変更
 * - @requirement quantity-table-generation/REQ-19.4: 確定後に関連写真表示エリアを更新
 *
 * タスク 115.19 相当の是正: 検証を条件分岐で包まず、前提が満たせない場合は失敗させる。
 * 本ファイルは事前準備で現場調査と写真をシードし、写真の存在を前提として
 * quantity-table-generation の受入基準 19.1〜19.4 を無条件に検証する。
 *
 * タスク 115.188 の是正: 従前はこの記述を `Requirements coverage (site-survey):` の
 * 見出しの下に置き `REQ-115.19` と書いていたため、被覆印の読み取り規則が
 * site-survey の受入基準 115.19（実在しない）を名乗る印として拾っていた。
 * 115.19 はタスク番号であり受入基準番号ではない。
 *
 * @module e2e/specs/quantity-tables/photo-change-dialog-e2e.spec
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 事前準備でシードする現場調査写真の枚数（REQ-19.2/19.3 の候補として必須） */
const SEED_PHOTO_COUNT = 3;

let testProjectId: string | null = null;
let createdSurveyId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 数量表編集画面へ遷移する。
 *
 * 事前準備で作成した数量表を直接開く。前提（事前準備の成功）が満たせない場合は
 * 黙って抜けずに失敗させる。
 */
async function navigateToQuantityTableEdit(page: Page): Promise<void> {
  if (!createdQuantityTableId) {
    throw new Error(
      'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
    );
  }
  await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(
    page.locator('[data-testid="quantity-table-edit-area"]'),
    '数量表編集画面が表示される必要がある'
  ).toBeVisible({ timeout: getTimeout(15000) });
}

/**
 * 数量グループの写真選択ダイアログを開く。
 *
 * 未紐付けのグループではプレースホルダー、紐付け済みのグループでは
 * 「写真を変更」ボタンが表示される。呼び出し側が期待する入口を明示して渡すことで、
 * 「どちらか出た方を使う」という観測結果依存の分岐を排除する。
 */
async function openPhotoDialog(page: Page, entry: 'placeholder' | 'change-button'): Promise<void> {
  const trigger =
    entry === 'placeholder'
      ? page.locator('[data-testid^="image-placeholder-"]').first()
      : page.getByRole('button', { name: '写真を変更' }).first();

  await expect(trigger, `写真選択ダイアログの入口(${entry})が表示される必要がある`).toBeVisible({
    timeout: getTimeout(10000),
  });
  await trigger.click();

  await expect(
    page.getByRole('dialog', { name: '写真を選択' }),
    '写真選択ダイアログが開く必要がある'
  ).toBeVisible({ timeout: getTimeout(10000) });
}

test.describe('REQ-19: 写真変更ダイアログでの注釈付き写真表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・現場調査写真・数量表・グループを作成
   *
   * REQ-19 のテストはグループと選択候補の写真の存在を前提とするため、
   * 事前にプロジェクト、写真を持つ現場調査、数量表、グループ1件を作成する。
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `REQ19_PJ_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    test('テスト用の現場調査写真を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await page.goto(`/projects/${testProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      const nameField = page.getByLabel(/調査名/i);
      await expect(nameField).toBeVisible({ timeout: getTimeout(10000) });
      await nameField.fill(`REQ19_現場調査_${Date.now()}`);

      const createSurveyPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^作成$/i }).click();
      await createSurveyPromise;

      await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
      createdSurveyId = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(createdSurveyId, '現場調査IDが取得できる必要がある').toBeTruthy();

      // 選択候補となる写真を API 経由でアップロードする
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath), 'テスト用画像が存在する必要がある').toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken, 'アクセストークンが取得できる必要がある').toBeTruthy();

      const form = new FormData();
      for (let i = 0; i < SEED_PHOTO_COUNT; i += 1) {
        form.append(
          'images',
          new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }),
          `req19-${i + 1}.png`
        );
      }
      const uploadResponse = await page.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        { headers: { Authorization: `Bearer ${accessToken}` }, multipart: form }
      );
      expect(
        uploadResponse.ok(),
        `写真アップロードが成功する必要がある (status=${uploadResponse.status()})`
      ).toBeTruthy();

      const detailResponse = await page.request.get(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(detailResponse.ok()).toBeTruthy();
      const detail = (await detailResponse.json()) as { images?: unknown[] };
      expect(
        detail.images?.length ?? 0,
        'REQ-19 の選択候補として写真がシードされている必要がある'
      ).toBeGreaterThanOrEqual(SEED_PHOTO_COUNT);
    });

    test('テスト用数量表とグループを作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill(`REQ19_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループを1つ追加（REQ-19 のテストはグループの存在を前提）。
      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。後続テストは編集画面へ再ナビゲートして
      // グループの存在を前提とするため、追加後に明示保存して永続化する。
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-4.3: 写真変更ボタンと写真変更ダイアログ
   *
   * タスク 115.188 の是正: 従前は REQ-19.1 を名乗っていたが、受入基準19.1 の原文は「When 数量グループの写真変更操作を行う,
   * the 数量表管理システム shall 写真変更ダイアログを表示する」である。本区間の表題・本文が述べる内容に対応するのは受入基準4.3（「When
   * 数量グループ内で写真選択操作を行う, the 数量表管理システム shall 同一プロジェクトの注釈付き現場写真一覧を表示し選択可能にする」
   * ）である。
   *
   * 写真未紐付けのグループではプレースホルダーから写真選択ダイアログを開ける。
   * 事前準備で作成したグループは写真未紐付けであるため、この経路は必ず成立する。
   */
  test('写真未紐付けのグループでプレースホルダーから写真選択ダイアログが開く (REQ-4.3)', async ({
    page,
  }) => {
    await navigateToQuantityTableEdit(page);
    await openPhotoDialog(page, 'placeholder');
  });

  /**
   * @requirement quantity-table-generation/REQ-19.2: ダイアログに注釈付き写真一覧を表示
   *
   * 写真選択ダイアログ内で、選択可能な写真がグリッド表示される。
   * 事前準備で写真をシードしているため、空状態ではなく写真一覧が表示される。
   */
  test('写真選択ダイアログに写真一覧が表示される (REQ-19.2)', async ({ page }) => {
    await navigateToQuantityTableEdit(page);
    await openPhotoDialog(page, 'placeholder');

    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    const photoList = dialog.locator('[data-testid="photo-list"]');
    await expect(photoList, '写真一覧が表示される必要がある').toBeVisible({
      timeout: getTimeout(20000),
    });

    const photoItems = dialog.locator('[data-testid^="photo-item-"]');
    await expect(photoItems, 'シードした写真が選択候補として表示される必要がある').toHaveCount(
      SEED_PHOTO_COUNT,
      { timeout: getTimeout(20000) }
    );
    await expect(photoItems.first()).toBeVisible();
  });

  /**
   * @requirement quantity-table-generation/REQ-19.1: 写真変更ボタンと写真変更ダイアログ
   * @requirement quantity-table-generation/REQ-19.3: 写真選択で紐づけ変更
   * @requirement quantity-table-generation/REQ-19.4: 関連写真表示エリアを更新
   *
   * 写真一覧から写真を選択すると数量グループに紐づく写真が変更され、
   * 確定後に関連写真表示エリアが更新される（ダイアログが閉じ、サムネイルが表示される）。
   * 紐付け後は「写真を変更」ボタンが現れ、同じダイアログを再度開ける（REQ-19.1）。
   */
  test('写真を選択するとダイアログが閉じ関連写真表示エリアが更新される (REQ-19.3, REQ-19.4, REQ-19.1)', async ({
    page,
  }) => {
    await navigateToQuantityTableEdit(page);
    await openPhotoDialog(page, 'placeholder');

    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    const photoItem = dialog.locator('[data-testid^="photo-item-"]').first();
    await expect(photoItem, '選択できる写真が存在する必要がある').toBeVisible({
      timeout: getTimeout(20000),
    });
    const selectedFileName = await photoItem.getAttribute('alt');
    expect(selectedFileName, '選択した写真のファイル名が取得できる必要がある').toBeTruthy();

    await photoItem.click();

    // REQ-19.3/19.4: ダイアログが閉じ、関連写真表示エリアに選択した写真が現れる
    await expect(dialog).not.toBeVisible({ timeout: getTimeout(10000) });

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    const groupThumbnail = groupCard.locator(`img[alt="${selectedFileName}"]`).first();
    await expect(
      groupThumbnail,
      '選択した写真が関連写真表示エリアに表示される必要がある'
    ).toBeVisible({ timeout: getTimeout(10000) });

    // REQ-42.5: 紐づけはクライアントドラフトの更新に留まるため明示保存して永続化する
    await saveQuantityTableDraft(page);

    // REQ-19.1: 紐付け済みグループでは「写真を変更」ボタンから同じダイアログを開ける
    await openPhotoDialog(page, 'change-button');

    const closeButton = page
      .getByRole('dialog', { name: '写真を選択' })
      .getByRole('button', { name: 'ダイアログを閉じる' });
    await closeButton.click();
    await expect(page.getByRole('dialog', { name: '写真を選択' })).not.toBeVisible({
      timeout: getTimeout(10000),
    });
  });
});
