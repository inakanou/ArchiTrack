/**
 * @fileoverview 数量グループカードの画像・コメント固定表示 E2E テスト (REQ-41)
 *
 * Task 58.3: 画像・コメント固定表示のテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-41.1: 数量項目テーブルの横幅がビューポートを
 *   超える場合、テーブル部分のみを水平スクロール対象とする
 * - @requirement quantity-table-generation/REQ-41.2: 水平スクロール時も画像・コメントは固定表示
 * - @requirement quantity-table-generation/REQ-41.3: 画像・コメントは水平スクロールラッパーの外に配置
 * - @requirement quantity-table-generation/REQ-41.4: テーブルのみが overflow コンテナ内
 * - @requirement quantity-table-generation/REQ-41.5: 折りたたみ時に画像・コメントも非表示
 * - @requirement quantity-table-generation/REQ-41.6: 再展開時に画像・コメントが固定表示で再表示
 *
 * 設計参照:
 * - QuantityGroupCard: 数量項目テーブルのみ data-testid="item-table-scroll-${group.id}"
 *   （overflowX:auto, overflowY:hidden）内。photoArea（画像サムネイル・PhotoCommentDisplay）は
 *   wrapper 外で固定。REQ-37 計算用フィールド（ピッチ=最多8フィールド）でテーブル幅が増大し
 *   水平スクロールが発生する。
 *
 * 検証戦略:
 *   現場調査に「コメント付き写真1枚」をアップロード → 数量表で「現場調査から一括追加」を実行し、
 *   写真+コメントが紐づいたグループを生成 → そのグループに数量項目を追加して計算方法を
 *   「ピッチ」に設定し、テーブル幅をビューポート超に拡大 → item-table-scroll-* ラッパーを
 *   右端まで水平スクロールしても、画像・コメントの bounding box が変化せず（固定）、
 *   右側のはみ出しフィールド（丸め設定）がラッパー内で閲覧可能になることを検証する。
 *
 * @module e2e/specs/quantity-tables/group-card-fixed-photo-scroll-e2e.spec
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testProjectId: string | null = null;
let surveyWithPhotoId: string | null = null;
let createdQuantityTableId: string | null = null;

const RUN_ID = Date.now();
/** 写真ありの現場調査名 */
const SURVEY_NAME = `固定表示E2E_写真あり_${RUN_ID}`;
/** 写真に設定するコメント（固定表示の検証対象） */
const PHOTO_COMMENT = `固定表示コメント_${RUN_ID}`;

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

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-41: 数量グループカードの画像・コメント固定表示（水平スクロール）', () => {
  // 同一プロジェクト・数量表を共有するため直列実行
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // ==========================================================================
  // 事前準備:
  //   - プロジェクト
  //   - コメント付き写真1枚を持つ現場調査
  //   - 数量表（現場調査から一括追加で写真+コメント紐づきグループを生成）
  // ==========================================================================
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      testProjectId = await createTestProject(page, `固定表示E2E_${RUN_ID}`);
      expect(testProjectId).toBeTruthy();
    });

    test('コメント付き写真1枚の現場調査を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。前段のテストが正しく実行されていません。');
      }

      surveyWithPhotoId = await createSiteSurvey(page, testProjectId, SURVEY_NAME);
      await uploadOnePhoto(page, surveyWithPhotoId, 'test-image.jpg');

      // 詳細画面で写真1枚が反映されていることを確認
      await page.goto(`/site-surveys/${surveyWithPhotoId}`);
      await page.waitForLoadState('networkidle');
      const photoPanel = page.locator('[aria-label="写真管理パネル"]');
      await expect(photoPanel).toBeVisible({ timeout: getTimeout(10000) });
      const photoItems = page.locator('[data-testid="photo-panel-item"]');
      await expect(photoItems).toHaveCount(1, { timeout: getTimeout(15000) });

      // 写真にコメントを設定して保存（固定表示の検証対象）
      const firstComment = photoItems.first().locator('textarea').first();
      await expect(firstComment).toBeVisible({ timeout: getTimeout(5000) });
      await firstComment.fill(PHOTO_COMMENT);

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
    });

    test('数量表を作成し、現場調査から写真+コメント紐づきグループを生成する', async ({ page }) => {
      if (!testProjectId || !surveyWithPhotoId) {
        throw new Error('事前準備の状態が未設定です。');
      }

      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill(`固定表示E2E_数量表_${RUN_ID}`);

      await page.getByRole('button', { name: /^作成$/i }).click();
      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // 現場調査から一括追加で写真+コメント紐づきグループを生成する
      const bulkButton = page.getByTestId('bulk-create-from-survey-button');
      await expect(bulkButton).toBeVisible({ timeout: getTimeout(10000) });
      await bulkButton.click();

      const dialog = page.getByTestId('survey-select-dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      await page.getByTestId(`survey-select-option-${surveyWithPhotoId}`).click();

      const fromSurveyPromise = page.waitForResponse(
        (response) =>
          /\/api\/quantity-tables\/[^/]+\/groups\/from-survey$/.test(response.url()) &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('survey-select-dialog-confirm').click();
      const fromSurveyResponse = await fromSurveyPromise;
      expect(fromSurveyResponse.status(), 'from-survey は成功（2xx）する').toBeLessThan(300);

      // 写真1枚分のグループが生成され、写真+コメントが紐づく
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      await expect(groupCards).toHaveCount(1, { timeout: getTimeout(15000) });
      await expect(groupCards.first().locator('img').first()).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(
        groupCards.first().locator('[data-testid="photo-comment-display"]').first()
      ).toHaveText(PHOTO_COMMENT, { timeout: getTimeout(10000) });
    });
  });

  // ==========================================================================
  // REQ-41.1〜41.4:
  //   テーブル幅をビューポート超に拡大し item-table-scroll-* を右端まで水平スクロールしても
  //   画像・コメントが表示・位置維持され（固定）、右側のはみ出しフィールドが閲覧可能になる。
  // ==========================================================================
  test('数量項目テーブルを右端まで水平スクロールしても画像・コメントが固定表示され、右側のはみ出しフィールドが閲覧可能 (REQ-41.1, 41.2, 41.3, 41.4)', async ({
    page,
  }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。事前準備が正しく実行されていません。');
    }

    // 狭めのビューポートに設定し、ピッチモード（最多フィールド）でテーブル幅が
    // ラッパー幅を超えて水平スクロールが発生する状態を作る。
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const editArea = page.getByTestId('quantity-table-edit-area');
    await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

    // グループに数量項目を1つ追加する
    const addItemButton = groupCard.getByRole('button', { name: /項目を追加/ }).first();
    await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });
    await addItemButton.click();

    const itemRow = groupCard.getByTestId('quantity-item-row').first();
    await expect(itemRow).toBeVisible({ timeout: getTimeout(10000) });

    // 計算方法を「ピッチ」に変更し、計算用フィールド群を行内に展開してテーブル幅を拡大する
    const calcMethodSelect = itemRow.getByLabel(/計算方法/);
    await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
    await calcMethodSelect.selectOption({ value: 'PITCH' });

    // 右端のはみ出しフィールド「丸め設定」が DOM に存在する（最初は不可視の可能性あり）
    const roundingField = itemRow.getByLabel(/丸め設定/);
    await expect(roundingField).toHaveCount(1, { timeout: getTimeout(5000) });

    // 水平スクロールラッパー（数量項目テーブルのみが入る overflow コンテナ）を取得
    const groupId = await groupCard.evaluate((el) => {
      const wrapper = el.querySelector('[data-testid^="item-table-scroll-"]');
      return wrapper?.getAttribute('data-testid')?.replace('item-table-scroll-', '') ?? null;
    });
    expect(groupId, 'グループ ID が取得できる').toBeTruthy();

    const tableWrapper = groupCard.locator(`[data-testid="item-table-scroll-${groupId}"]`);
    await expect(tableWrapper).toBeVisible({ timeout: getTimeout(5000) });

    // REQ-41.3 / 41.4: 画像・コメント（photoArea）は水平スクロールラッパーの外に配置され、
    // テーブル（数量項目行）のみがラッパー内にある。
    const thumbnail = groupCard.locator('img').first();
    const comment = groupCard.locator('[data-testid="photo-comment-display"]').first();
    await expect(thumbnail).toBeVisible({ timeout: getTimeout(5000) });
    await expect(comment).toBeVisible({ timeout: getTimeout(5000) });

    const structure = await tableWrapper.evaluate((wrapperEl) => {
      const card = wrapperEl.closest('[data-testid="quantity-group-card"]');
      const img = card?.querySelector('img') ?? null;
      const commentEl = card?.querySelector('[data-testid="photo-comment-display"]') ?? null;
      const itemRowEl = wrapperEl.querySelector('[data-testid="quantity-item-row"]');
      return {
        wrapperContainsImg: img ? wrapperEl.contains(img) : null,
        wrapperContainsComment: commentEl ? wrapperEl.contains(commentEl) : null,
        wrapperContainsItemRow: !!itemRowEl,
        scrollWidth: wrapperEl.scrollWidth,
        clientWidth: wrapperEl.clientWidth,
      };
    });
    expect(structure.wrapperContainsImg, '画像はラッパー外（固定）').toBe(false);
    expect(structure.wrapperContainsComment, 'コメントはラッパー外（固定）').toBe(false);
    expect(structure.wrapperContainsItemRow, '数量項目テーブルはラッパー内').toBe(true);

    // ピッチモードの計算用フィールド展開により、テーブルがラッパー幅を超えて
    // 水平スクロール可能な状態であることを確認（REQ-41.1）
    expect(
      structure.scrollWidth,
      'テーブル幅がラッパー幅を超え水平スクロールが発生する'
    ).toBeGreaterThan(structure.clientWidth);

    // スクロール前の画像・コメントの位置を記録（固定表示の基準）
    const thumbBoxBefore = await thumbnail.boundingBox();
    const commentBoxBefore = await comment.boundingBox();
    expect(thumbBoxBefore, 'スクロール前の画像 bounding box が取得できる').not.toBeNull();
    expect(commentBoxBefore, 'スクロール前のコメント bounding box が取得できる').not.toBeNull();

    // 右端のはみ出しフィールドはスクロール前にはビューポート/ラッパーからはみ出している
    const roundingBoxBefore = await roundingField.boundingBox();

    // REQ-41.1: 数量項目テーブルラッパーを右端まで水平スクロールする
    await tableWrapper.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect
      .poll(async () => tableWrapper.evaluate((el) => el.scrollLeft), {
        timeout: getTimeout(5000),
      })
      .toBeGreaterThan(0);

    // REQ-41.2 / 41.6: 水平スクロール後も画像・コメントは表示され続け、位置が維持される（固定）
    await expect(thumbnail).toBeVisible();
    await expect(comment).toBeVisible();
    await expect(comment).toHaveText(PHOTO_COMMENT);

    const thumbBoxAfter = await thumbnail.boundingBox();
    const commentBoxAfter = await comment.boundingBox();
    expect(thumbBoxAfter, 'スクロール後の画像 bounding box が取得できる').not.toBeNull();
    expect(commentBoxAfter, 'スクロール後のコメント bounding box が取得できる').not.toBeNull();

    if (thumbBoxBefore && thumbBoxAfter) {
      expect(
        Math.abs(thumbBoxAfter.x - thumbBoxBefore.x),
        '画像の水平位置はテーブル水平スクロールの影響を受けない（固定）'
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(thumbBoxAfter.y - thumbBoxBefore.y),
        '画像の垂直位置も維持される'
      ).toBeLessThanOrEqual(2);
    }
    if (commentBoxBefore && commentBoxAfter) {
      expect(
        Math.abs(commentBoxAfter.x - commentBoxBefore.x),
        'コメントの水平位置はテーブル水平スクロールの影響を受けない（固定）'
      ).toBeLessThanOrEqual(2);
    }

    // REQ-41.1: 右端のはみ出しフィールド（丸め設定）が水平スクロール後に閲覧可能になる
    await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });
    const roundingBoxAfter = await roundingField.boundingBox();
    expect(roundingBoxAfter, 'スクロール後の丸め設定 bounding box が取得できる').not.toBeNull();
    if (roundingBoxBefore && roundingBoxAfter) {
      // 右端フィールドはスクロールにより左方向へ移動し、ビュー内へ入る
      expect(
        roundingBoxAfter.x,
        'はみ出しフィールドは水平スクロールでビュー内へ移動する'
      ).toBeLessThanOrEqual(roundingBoxBefore.x);
    }
  });

  // ==========================================================================
  // REQ-41.5 / 41.6: 折りたたみ時に画像・コメントが非表示、再展開時に固定表示で再表示
  // ==========================================================================
  test('グループ折りたたみで画像・コメントが非表示になり、再展開で固定表示状態に戻る (REQ-41.5, 41.6)', async ({
    page,
  }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。事前準備が正しく実行されていません。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

    const thumbnail = groupCard.locator('img').first();
    const comment = groupCard.locator('[data-testid="photo-comment-display"]').first();

    // 初期（展開）状態では画像・コメントが表示されている（REQ-41.6）
    await expect(thumbnail).toBeVisible({ timeout: getTimeout(10000) });
    await expect(comment).toBeVisible({ timeout: getTimeout(5000) });

    // 画像・コメントが水平スクロールラッパー外に配置されている（固定表示の担保）
    const groupId = await groupCard.evaluate((el) => {
      const wrapper = el.querySelector('[data-testid^="item-table-scroll-"]');
      return wrapper?.getAttribute('data-testid')?.replace('item-table-scroll-', '') ?? null;
    });
    expect(groupId).toBeTruthy();
    const fixedOutsideWrapper = await groupCard.evaluate((card, gid) => {
      const wrapper = card.querySelector(`[data-testid="item-table-scroll-${gid}"]`);
      const img = card.querySelector('img');
      const commentEl = card.querySelector('[data-testid="photo-comment-display"]');
      if (!wrapper || !img || !commentEl) return null;
      return !wrapper.contains(img) && !wrapper.contains(commentEl);
    }, groupId);
    expect(fixedOutsideWrapper, '画像・コメントはスクロールラッパー外（固定）').toBe(true);

    // 折りたたむ（REQ-41.5）
    const collapseButton = groupCard.getByRole('button', { name: 'グループを折りたたむ' }).first();
    await expect(collapseButton).toBeVisible({ timeout: getTimeout(5000) });
    await collapseButton.click();

    // 画像・コメントも数量項目とともに非表示になる
    await expect(thumbnail).not.toBeVisible({ timeout: getTimeout(5000) });
    await expect(comment).not.toBeVisible({ timeout: getTimeout(5000) });

    // 再展開（REQ-41.6）
    const expandButton = groupCard.getByRole('button', { name: 'グループを展開' }).first();
    await expect(expandButton).toBeVisible({ timeout: getTimeout(5000) });
    await expandButton.click();

    // 画像・コメントが固定表示状態（ラッパー外）で再表示される
    await expect(thumbnail).toBeVisible({ timeout: getTimeout(5000) });
    await expect(comment).toBeVisible({ timeout: getTimeout(5000) });
    await expect(comment).toHaveText(PHOTO_COMMENT);

    const stillFixedOutsideWrapper = await groupCard.evaluate((card, gid) => {
      const wrapper = card.querySelector(`[data-testid="item-table-scroll-${gid}"]`);
      const img = card.querySelector('img');
      const commentEl = card.querySelector('[data-testid="photo-comment-display"]');
      if (!wrapper || !img || !commentEl) return null;
      return !wrapper.contains(img) && !wrapper.contains(commentEl);
    }, groupId);
    expect(stillFixedOutsideWrapper, '再展開後も画像・コメントはラッパー外（固定）').toBe(true);
  });
});
