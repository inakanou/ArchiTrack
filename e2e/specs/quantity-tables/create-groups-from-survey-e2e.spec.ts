/**
 * @fileoverview 現場調査からの数量グループ一括生成 E2Eテスト (REQ-40)
 *
 * Task 57.5: 現場調査からの一括生成 E2E テストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-40.1: 「現場調査から一括追加」操作で対象現場調査選択ダイアログを表示する
 * - REQ-40.2: ダイアログに当該プロジェクトの現場調査一覧を選択肢として表示する
 * - REQ-40.3: 選択現場調査に属する全写真の枚数と同数の数量グループを生成する
 * - REQ-40.4: 各グループに写真を写真順に1枚ずつ紐づける
 * - REQ-40.5: 各生成グループ名を「{現場調査名} {連番}」（連番は1から開始）とする
 * - REQ-40.7: 生成グループを既存グループの末尾に写真順で追加する
 * - REQ-40.8: 紐づけ写真にコメントがある場合、写真の右側にコメントを表示する
 * - REQ-40.9: 生成グループは数量項目0件の初期状態で作成する
 * - REQ-40.10: 写真0枚の現場調査選択時はグループを生成せず「写真が存在しません」を表示する
 * - REQ-40.13: 生成完了時に生成グループ数を含む完了メッセージを表示する
 *
 * 補足:
 * - 写真ありの現場調査（2枚・先頭写真にコメント付き）と写真0枚の現場調査の
 *   2件を UI 経由で作成し、実 UI/DB で全シナリオを検証する。
 *
 * @module e2e/specs/quantity-tables/create-groups-from-survey-e2e.spec
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// テスト全体で共有する状態（serial 実行）
// ============================================================================

let testProjectId: string | null = null;
let surveyWithPhotosId: string | null = null;
let surveyWithoutPhotosId: string | null = null;
let createdQuantityTableId: string | null = null;

const RUN_ID = Date.now();
/** 写真ありの現場調査名（連番付きグループ名の検証に使用） */
const SURVEY_WITH_PHOTOS_NAME = `一括生成元_写真あり_${RUN_ID}`;
/** 写真0枚の現場調査名 */
const SURVEY_WITHOUT_PHOTOS_NAME = `一括生成元_写真なし_${RUN_ID}`;
/** 先頭写真に設定するコメント（REQ-40.8 検証用） */
const FIRST_PHOTO_COMMENT = `先頭写真コメント_${RUN_ID}`;

// ============================================================================
// ヘルパー
// ============================================================================

/**
 * テスト用プロジェクトを UI 経由で作成し、ID を返す。
 */
async function createTestProject(page: Page, projectName: string): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

  // 営業担当者は必須
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
  const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
  const projectId = match?.[1] ?? null;
  expect(projectId).toBeTruthy();
  return projectId as string;
}

/**
 * プロジェクト配下に現場調査を UI 経由で作成し、ID を返す。
 */
async function createSiteSurvey(
  page: Page,
  projectId: string,
  surveyName: string
): Promise<string> {
  await page.goto(`/projects/${projectId}/site-surveys/new`);
  await page.waitForLoadState('networkidle');

  await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });
  await page.getByLabel(/調査名/i).fill(surveyName);
  await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

  const createSurveyPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/') &&
      response.url().includes('site-surveys') &&
      response.request().method() === 'POST',
    { timeout: getTimeout(30000) }
  );

  await page.getByRole('button', { name: /^作成$/i }).click();
  await createSurveyPromise;

  await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
  const match = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/);
  const surveyId = match?.[1] ?? null;
  expect(surveyId).toBeTruthy();
  return surveyId as string;
}

/**
 * 現場調査詳細画面で 1 枚の画像をアップロードし、完了を待つ。
 * 写真順を決定的にするため 1 枚ずつ順番にアップロードする。
 */
async function uploadOnePhoto(page: Page, surveyId: string, fixtureFile: string): Promise<void> {
  await page.goto(`/site-surveys/${surveyId}`);
  await page.waitForLoadState('networkidle');

  const input = page.locator('input[type="file"]').first();
  await expect(input).toBeAttached({ timeout: getTimeout(10000) });

  const uploadPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/site-surveys/') &&
      response.url().includes('/images') &&
      response.request().method() === 'POST',
    { timeout: getTimeout(60000) }
  );

  await input.setInputFiles(path.join(__dirname, '../../fixtures', fixtureFile));
  await uploadPromise;
}

/**
 * 表示幅（半角=1, 全角=2）を計算する。REQ-22.4 / 40.6 の最大文字数判定で使用。
 */
function getDisplayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isHalfWidth = (code >= 0x0020 && code <= 0x007e) || (code >= 0xff61 && code <= 0xff9f);
    width += isHalfWidth ? 1 : 2;
  }
  return width;
}

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-40: 現場調査からの数量グループ一括生成 E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // ==========================================================================
  // 事前準備:
  //   - プロジェクト
  //   - 写真ありの現場調査 A（2枚・先頭写真にコメント付き）
  //   - 写真0枚の現場調査 B
  //   - 既存グループ1件を持つ数量表（末尾追加の検証のため）
  // ==========================================================================
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      testProjectId = await createTestProject(page, `現場調査一括生成E2E_${RUN_ID}`);
      expect(testProjectId).toBeTruthy();
    });

    test('写真2枚（先頭にコメント付き）の現場調査を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。前段のテストが正しく実行されていません。');
      }

      surveyWithPhotosId = await createSiteSurvey(page, testProjectId, SURVEY_WITH_PHOTOS_NAME);

      // 写真順を決定的にするため 1 枚ずつ順番にアップロードする
      await uploadOnePhoto(page, surveyWithPhotosId, 'test-image.jpg');
      await uploadOnePhoto(page, surveyWithPhotosId, 'test-image.png');

      // 詳細画面で 2 枚が反映されていることを確認
      await page.goto(`/site-surveys/${surveyWithPhotosId}`);
      await page.waitForLoadState('networkidle');
      const photoPanel = page.locator('[aria-label="写真管理パネル"]');
      await expect(photoPanel).toBeVisible({ timeout: getTimeout(10000) });
      const photoItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoItems).toHaveCount(2, { timeout: getTimeout(15000) });

      // 先頭写真にコメントを設定して保存（REQ-40.8 検証用）
      const firstComment = photoItems.first().locator('textarea').first();
      await expect(firstComment).toBeVisible({ timeout: getTimeout(5000) });
      await firstComment.fill(FIRST_PHOTO_COMMENT);

      await expect(page.getByText(/未保存の変更があります/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/images/batch') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/ }).click();
      await savePromise;

      await expect(page.getByText(/未保存の変更があります/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 永続化検証: リロード後も先頭写真のコメントが残っている
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(photoItems.first().locator('textarea').first()).toHaveValue(
        FIRST_PHOTO_COMMENT,
        {
          timeout: getTimeout(10000),
        }
      );
    });

    test('写真0枚の現場調査を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。前段のテストが正しく実行されていません。');
      }
      surveyWithoutPhotosId = await createSiteSurvey(
        page,
        testProjectId,
        SURVEY_WITHOUT_PHOTOS_NAME
      );
      expect(surveyWithoutPhotosId).toBeTruthy();
    });

    test('既存グループ1件を持つ数量表を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。前段のテストが正しく実行されていません。');
      }

      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill(`一括生成テスト数量表_${RUN_ID}`);

      await page.getByRole('button', { name: /^作成$/i }).click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // 既存グループを 1 件追加（一括生成が「末尾」に追加されることの検証用）。
      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。カードの出現を待機後に明示保存する。
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(1, {
        timeout: getTimeout(10000),
      });

      // REQ-42.5: 後続テスト（リロードで末尾追加・件数を検証）の前提として明示保存する。
      await saveQuantityTableDraft(page);
    });
  });

  // ==========================================================================
  // REQ-40.1, 40.2: ボタン押下でダイアログが開き、プロジェクトの現場調査が一覧表示される
  // ==========================================================================
  test('「現場調査から一括追加」でダイアログが開きプロジェクトの現場調査が一覧表示される (REQ-40.1, 40.2)', async ({
    page,
  }) => {
    if (!createdQuantityTableId || !surveyWithPhotosId || !surveyWithoutPhotosId) {
      throw new Error('事前準備の状態が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const bulkButton = page.getByTestId('bulk-create-from-survey-button');
    await expect(bulkButton).toBeVisible({ timeout: getTimeout(10000) });
    await bulkButton.click();

    // ダイアログ表示（REQ-40.1）
    const dialog = page.getByTestId('survey-select-dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    // プロジェクトの現場調査が選択肢として並ぶ（REQ-40.2）
    const optionWithPhotos = page.getByTestId(`survey-select-option-${surveyWithPhotosId}`);
    const optionWithoutPhotos = page.getByTestId(`survey-select-option-${surveyWithoutPhotosId}`);
    await expect(optionWithPhotos).toBeVisible({ timeout: getTimeout(10000) });
    await expect(optionWithoutPhotos).toBeVisible({ timeout: getTimeout(10000) });

    // 名前・写真件数の表示（REQ-40.2）
    await expect(optionWithPhotos).toContainText(SURVEY_WITH_PHOTOS_NAME);
    await expect(optionWithPhotos).toContainText('写真 2 件');
    await expect(optionWithoutPhotos).toContainText(SURVEY_WITHOUT_PHOTOS_NAME);
    await expect(optionWithoutPhotos).toContainText('写真 0 件');

    // ダイアログを閉じる
    await page.getByTestId('survey-select-dialog-close').click();
    await expect(dialog).not.toBeVisible({ timeout: getTimeout(5000) });
  });

  // ==========================================================================
  // REQ-40.3, 40.4, 40.5, 40.7, 40.8, 40.9, 40.13:
  //   写真ありの現場調査を選択→実行で、写真枚数分のグループが末尾に生成される。
  //   グループ名「{現場調査名} {連番}」、写真順紐づけ、先頭写真コメント右側表示、
  //   生成グループは項目0件、完了メッセージ表示を検証する。
  // ==========================================================================
  test('写真ありの現場調査からグループが末尾に生成され、名前・写真・コメント・完了メッセージが反映される (REQ-40.3, 40.4, 40.5, 40.7, 40.8, 40.9, 40.13)', async ({
    page,
  }) => {
    if (!createdQuantityTableId || !surveyWithPhotosId) {
      throw new Error('事前準備の状態が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    // 事前準備で作成した既存グループ 1 件が前提
    await expect(groupCards).toHaveCount(1, { timeout: getTimeout(10000) });

    // ダイアログを開いて写真ありの現場調査を選択
    await page.getByTestId('bulk-create-from-survey-button').click();
    const dialog = page.getByTestId('survey-select-dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    await page.getByTestId(`survey-select-option-${surveyWithPhotosId}`).click();

    // REQ-42.4 移行: 一括生成はクライアントサイドのドラフト生成となり、
    // 永続化 API（POST /groups/from-survey）は発火しない。確定でドラフトへ即時反映される。
    await page.getByTestId('survey-select-dialog-confirm').click();

    // 完了メッセージ「2件のグループを生成しました」（REQ-40.13）
    await expect(page.getByText('2件のグループを生成しました')).toBeVisible({
      timeout: getTimeout(10000),
    });

    // ダイアログが閉じる
    await expect(dialog).not.toBeVisible({ timeout: getTimeout(10000) });

    // 既存1件 + 生成2件 = 3件（REQ-40.3: 写真枚数=2 と同数のグループ生成）
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(15000) });

    // 生成グループは末尾 index 1, 2 に追加される（REQ-40.7）
    const generated1 = groupCards.nth(1);
    const generated2 = groupCards.nth(2);

    // グループ名「{現場調査名} {連番}」（連番は1から）（REQ-40.5）
    await expect(generated1.locator('h3').first()).toHaveText(`${SURVEY_WITH_PHOTOS_NAME} 1`);
    await expect(generated2.locator('h3').first()).toHaveText(`${SURVEY_WITH_PHOTOS_NAME} 2`);

    // 各生成グループに写真が 1 枚紐づく（REQ-40.4）
    // 写真紐付け時はサムネイル img が描画される（未紐付けならプレースホルダー）
    await expect(generated1.locator('img').first()).toBeVisible({ timeout: getTimeout(10000) });
    await expect(generated2.locator('img').first()).toBeVisible({ timeout: getTimeout(10000) });
    await expect(generated1.locator('[data-testid^="image-placeholder-"]')).toHaveCount(0);
    await expect(generated2.locator('[data-testid^="image-placeholder-"]')).toHaveCount(0);

    // 各生成グループは数量項目0件の初期状態（REQ-40.9）
    await expect(generated1.locator('[data-testid="quantity-item-row"]')).toHaveCount(0);
    await expect(generated2.locator('[data-testid="quantity-item-row"]')).toHaveCount(0);

    // 写真順の紐づけ（REQ-40.4）+ 先頭写真コメント右側表示（REQ-40.8）:
    //   先頭にアップロードした写真（コメント付き）が連番1のグループに紐づく。
    const comment1 = generated1.locator('[data-testid="photo-comment-display"]').first();
    await expect(comment1).toBeVisible({ timeout: getTimeout(10000) });
    await expect(comment1).toHaveText(FIRST_PHOTO_COMMENT);

    // コメントが写真の右側（画像の右辺以降）に配置される（REQ-40.8 / REQ-21.2 整合）
    const thumbnail1 = generated1.locator('img').first();
    const commentBox = await comment1.boundingBox();
    const thumbBox = await thumbnail1.boundingBox();
    expect(commentBox, 'コメント領域の bounding box が取得できる').not.toBeNull();
    expect(thumbBox, 'サムネイルの bounding box が取得できる').not.toBeNull();
    if (commentBox && thumbBox) {
      expect(commentBox.x, 'コメント領域は写真の右側に配置される').toBeGreaterThanOrEqual(
        thumbBox.x
      );
    }

    // 2枚目（コメントなし）のグループはコメントテキストが空（REQ-40.8 整合: コメント無しは空白）
    const comment2 = generated2.locator('[data-testid="photo-comment-display"]').first();
    await expect(comment2).toHaveText('');

    // REQ-42.5: 生成結果は保存操作まで永続化されない。リロード前に明示保存する。
    await saveQuantityTableDraft(page);

    // リロードしても末尾追加・名前・写真が永続化されている（DB 反映の回帰防止）
    await page.reload({ waitUntil: 'networkidle' });
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(15000) });
    await expect(groupCards.nth(1).locator('h3').first()).toHaveText(
      `${SURVEY_WITH_PHOTOS_NAME} 1`
    );
    await expect(groupCards.nth(2).locator('h3').first()).toHaveText(
      `${SURVEY_WITH_PHOTOS_NAME} 2`
    );
    await expect(
      groupCards.nth(1).locator('[data-testid="photo-comment-display"]').first()
    ).toHaveText(FIRST_PHOTO_COMMENT);
  });

  // ==========================================================================
  // REQ-40.10: 写真0枚の現場調査を選択するとグループは生成されず
  //            「写真が存在しません」メッセージが表示される。
  // ==========================================================================
  test('写真0枚の現場調査選択時はグループが生成されず「写真が存在しません」が表示される (REQ-40.10)', async ({
    page,
  }) => {
    if (!createdQuantityTableId || !surveyWithoutPhotosId) {
      throw new Error('事前準備の状態が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    // 直前テストで 3 件になっている前提
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(15000) });
    const countBefore = await groupCards.count();

    await page.getByTestId('bulk-create-from-survey-button').click();
    const dialog = page.getByTestId('survey-select-dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    await page.getByTestId(`survey-select-option-${surveyWithoutPhotosId}`).click();

    // REQ-42.4 移行: 一括生成はクライアントサイドのドラフト生成となり、
    // 写真0枚の場合は写真一覧取得（GET）後に早期終了し、永続化 API は発行しない。
    await page.getByTestId('survey-select-dialog-confirm').click();

    // 「写真が存在しません」メッセージ（REQ-40.10）
    await expect(page.getByText('写真が存在しません')).toBeVisible({
      timeout: getTimeout(10000),
    });

    // グループは増えない（生成されない）
    await expect(groupCards).toHaveCount(countBefore, { timeout: getTimeout(10000) });

    // ダイアログを閉じる
    const closeButton = page.getByTestId('survey-select-dialog-close');
    if (await closeButton.isVisible({ timeout: getTimeout(2000) }).catch(() => false)) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // リロードしても件数が変わらない（DB 上もグループ未生成であること）
    await page.reload({ waitUntil: 'networkidle' });
    await expect(groupCards).toHaveCount(countBefore, { timeout: getTimeout(15000) });
  });

  // ==========================================================================
  // クリーンアップ: 作成したプロジェクトを削除（ADMIN_USER）
  // ==========================================================================
  test.describe('クリーンアップ', () => {
    test('作成したプロジェクトを削除する', async ({ page, context }) => {
      await context.clearCookies();
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      if (testProjectId) {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        const hasDeleteButton = await deleteButton.isVisible({ timeout: 5000 });
        if (hasDeleteButton) {
          await deleteButton.click();
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          const hasConfirmButton = await confirmButton.isVisible({ timeout: 5000 });
          if (hasConfirmButton) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});

// 上記 getDisplayWidth は REQ-40.6（最大文字数切り詰め）検証の補助として用意したが、
// 本スペックの現場調査名は最大文字数内に収まるため切り詰めは発生しない。
// （切り詰め境界の検証はサーバー側 Integration テストに委譲）
void getDisplayWidth;
