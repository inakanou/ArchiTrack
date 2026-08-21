/**
 * @fileoverview 写真選択・変更ダイアログ 写真一覧の重なり検証 E2Eテスト (REQ-39)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-39.1: 写真選択ダイアログで各写真を重ならないレイアウトで一覧表示
 * - @requirement quantity-table-generation/REQ-39.2: 写真変更ダイアログでも各写真を重ならないレイアウトで一覧表示
 * - @requirement quantity-table-generation/REQ-39.3: 各写真を一定間隔で配置し隣接写真と表示領域が重複しない
 * - @requirement quantity-table-generation/REQ-39.4: 写真枚数にかかわらずサムネイル全体を視認可能に表示
 * - @requirement quantity-table-generation/REQ-39.5: 収まらない場合は折り返し＋スクロールバーで閲覧可能
 * - @requirement quantity-table-generation/REQ-39.6: 写真枚数の多寡にかかわらず重なりによる視認性低下を発生させない
 *
 * 設計方針（design.md REQ-39 / 1801行・2167行）:
 *   写真同士の「重なりゼロ」は実レイアウトを要し jsdom では検証不可のため、
 *   getBoundingClientRect による矩形重複判定は本 E2E（Playwright）で実施する。
 *   多数枚（30枚以上）を API シードで用意し、通常幅・写真変更後・狭幅ビューポートの
 *   いずれでも隣接サムネイルが重ならないことを自動検証して回帰防止する。
 *
 * @module e2e/specs/quantity-tables/photo-select-overlap-e2e.spec
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPresent } from '../../helpers/preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 30枚以上を要件とするため十分な枚数をシードする（折り返し＋スクロールを確実に発生させる）
const SEED_PHOTO_COUNT = 32;

let testProjectId: string | null = null;
let createdSurveyId: string | null = null;
let createdQuantityTableId: string | null = null;
let seededPhotoCount = 0;

/**
 * 2つの矩形が重なっているか判定する。
 * 接して（辺が一致して）いるだけの場合は重なりとみなさない（許容誤差で吸収）。
 */
function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  tolerance = 0.5
): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;

  const overlapX = Math.min(aRight, bRight) - Math.max(a.x, b.x);
  const overlapY = Math.min(aBottom, bBottom) - Math.max(a.y, b.y);

  // 両軸で許容誤差を超える正の重なりがある場合のみ「重なり」と判定する
  return overlapX > tolerance && overlapY > tolerance;
}

/**
 * 写真一覧（photo-list）内の全サムネイルの矩形を取得し、
 * いずれのペアも重なっていないことをアサートする。
 */
async function expectNoThumbnailOverlap(photoList: Locator, context: string): Promise<void> {
  const items = photoList.locator('[data-testid^="photo-item-"]');
  const count = await items.count();

  // 重なり検証には複数枚が必要（30枚以上シードしているので満たすはず）
  expect(count, `${context}: 写真サムネイルが複数枚表示される必要がある`).toBeGreaterThan(1);

  const rects: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < count; i++) {
    const box = await items.nth(i).boundingBox();
    assertPresent(box, `${context}: 写真サムネイル[${i}]の矩形`);
    // サムネイルが潰れていない（幅・高さがゼロでない）こと（REQ-39.4 視認可能）
    expect(box.width, `${context}: サムネイル[${i}]の幅がゼロより大きい`).toBeGreaterThan(0);
    expect(box.height, `${context}: サムネイル[${i}]の高さがゼロより大きい`).toBeGreaterThan(0);
    rects.push(box);
  }

  // 全ペアの矩形重複を検証（REQ-39.1/39.2/39.3/39.6: 重なりゼロ）
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const overlap = rectsOverlap(rects[i]!, rects[j]!);
      expect(
        overlap,
        `${context}: 写真サムネイル[${i}]と[${j}]が重なってはならない ` +
          `(rect[${i}]=${JSON.stringify(rects[i])}, rect[${j}]=${JSON.stringify(rects[j])})`
      ).toBe(false);
    }
  }
}

/**
 * 写真ダイアログを開く導線。REQ-39.1（写真選択）と REQ-39.2（写真変更）で入口が異なる。
 *
 * `QuantityGroupCard` は `group.surveyImage` の有無で排他的に描き分ける
 * （写真なし: `image-placeholder-*` / 写真あり: 「写真を変更」ボタン）。
 * どちらが出ているかを観測して分岐すると、期待した入口が消えた場合に
 * もう一方の入口へ黙って流れ、REQ-39.1 と REQ-39.2 の区別が失われる。
 * 呼び出し側がどちらの入口を検証しているかを渡し、その入口の存在を無条件に主張する。
 */
const PHOTO_DIALOG_ENTRIES = {
  /** 写真未紐付けの数量グループから開く（REQ-39.1 写真選択ダイアログ） */
  select: {
    label: 'REQ-39.1: 写真未紐付けの数量グループに写真選択のプレースホルダーが表示される',
    locate: (page: Page): Locator => page.locator('[data-testid^="image-placeholder-"]').first(),
  },
  /** 写真紐付け済みの数量グループから開く（REQ-39.2 写真変更ダイアログ） */
  change: {
    label: 'REQ-39.2: 写真紐付け済みの数量グループに「写真を変更」ボタンが表示される',
    locate: (page: Page): Locator => page.getByRole('button', { name: '写真を変更' }).first(),
  },
} as const;

/**
 * 指定した入口から写真ダイアログを開き、photo-list を返す。
 *
 * @param page Playwright のページ（数量表の編集画面に居ること）
 * @param entry どちらの入口から開くか（`'select'` = 写真未紐付け / `'change'` = 紐付け済み）
 * @throws 指定した入口が表示されない・ダイアログが開かない・写真が揃わない場合
 */
async function openPhotoDialog(
  page: Page,
  entry: keyof typeof PHOTO_DIALOG_ENTRIES
): Promise<Locator> {
  const { label, locate } = PHOTO_DIALOG_ENTRIES[entry];
  const trigger = locate(page);
  await expect(trigger, label).toBeVisible({ timeout: getTimeout(8000) });
  await trigger.click();

  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

  const photoList = dialog.locator('[data-testid="photo-list"]');
  // シードした写真が全件読み込まれるまで待つ
  await expect(photoList).toBeVisible({ timeout: getTimeout(15000) });
  await expect
    .poll(async () => photoList.locator('[data-testid^="photo-item-"]').count(), {
      timeout: getTimeout(15000),
    })
    .toBeGreaterThanOrEqual(SEED_PHOTO_COUNT);

  return photoList;
}

test.describe('REQ-39: 写真選択・変更ダイアログの写真一覧が重ならない', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test.describe('事前準備', () => {
    test('プロジェクト・現場調査・多数枚の写真・数量表グループを作成する', async ({ page }) => {
      // --- プロジェクト作成 ---
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `REQ39_PJ_${Date.now()}`;
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
      testProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(testProjectId).toBeTruthy();

      // --- 現場調査作成 ---
      await page.goto(`/projects/${testProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await page.getByLabel(/調査名/i).fill(`REQ39_現場調査_${Date.now()}`);
      const dateInput = page.getByLabel(/調査日/i);
      if (await isVisibleWithin(dateInput, getTimeout(2000))) {
        await dateInput.fill(new Date().toISOString().split('T')[0]!);
      }

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
      createdSurveyId = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();

      // --- 多数枚の写真を API で直接アップロード（重なり検証には30枚以上が必要）---
      // 画像アップロードは upload.array('images', 10) で1リクエスト最大10枚のため複数回に分割する。
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath)).toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken, 'アクセストークンが取得できる必要がある').toBeTruthy();

      const BATCH = 8; // 10枚上限に対する安全側のバッチサイズ
      let uploaded = 0;
      while (uploaded < SEED_PHOTO_COUNT) {
        const n = Math.min(BATCH, SEED_PHOTO_COUNT - uploaded);
        // Playwright の multipart は同名キー重複を表現できないため、
        // FormData で 'images' フィールドを n 件付与する。
        const form = new FormData();
        for (let i = 0; i < n; i++) {
          const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
          form.append('images', blob, `req39-${uploaded + i + 1}.png`);
        }
        const uploadResponse = await page.request.post(
          `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            multipart: form,
          }
        );
        expect(
          uploadResponse.ok(),
          `写真アップロードが成功する必要がある (status=${uploadResponse.status()})`
        ).toBeTruthy();
        uploaded += n;
      }

      // 実際にシードされた枚数を確認（現場調査詳細の画像件数）
      const detailResponse = await page.request.get(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(detailResponse.ok()).toBeTruthy();
      const detail = await detailResponse.json();
      seededPhotoCount = Array.isArray(detail.images) ? detail.images.length : 0;
      expect(
        seededPhotoCount,
        '重なり検証のため30枚以上の写真がシードされている必要がある'
      ).toBeGreaterThanOrEqual(30);

      // --- 数量表作成 ---
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');
      const createLink = page.getByRole('link', { name: /新規作成/i }).first();
      await expect(createLink).toBeVisible({ timeout: getTimeout(10000) });
      await createLink.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名|名称/i }).first();
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.fill(`REQ39_数量表_${Date.now()}`);
      await page.getByRole('button', { name: /^作成$/i }).click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      createdQuantityTableId =
        page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/)?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // --- グループを1件追加（写真選択ダイアログを開く起点）---
      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。後続テストは編集画面へ再ナビゲートして
      // グループの存在を前提とするため、追加後に明示保存して永続化する。
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      await expect(page.locator('[data-testid="quantity-group-card"]').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-39.1
   * @requirement quantity-table-generation/REQ-39.3
   * @requirement quantity-table-generation/REQ-39.4
   * @requirement quantity-table-generation/REQ-39.5
   * @requirement quantity-table-generation/REQ-39.6
   *
   * 写真選択ダイアログを開いた際、隣接サムネイルの矩形が重複しないこと。
   */
  test('写真選択ダイアログで多数枚のサムネイルが重ならない (REQ-39.1, 39.3, 39.4, 39.6)', async ({
    page,
  }) => {
    expect(createdQuantityTableId, '事前準備が完了している必要がある').toBeTruthy();
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const photoList = await openPhotoDialog(page, 'select');
    await expectNoThumbnailOverlap(photoList, '写真選択ダイアログ（通常幅）');
  });

  /**
   * @requirement quantity-table-generation/REQ-39.2
   * @requirement quantity-table-generation/REQ-39.6
   *
   * 写真を選択して紐づけたのち、写真変更（再度ダイアログを開く）経路でも
   * 重なりのない一覧が表示されること。
   */
  test('写真選択→写真変更の経路でもサムネイルが重ならない (REQ-39.2, 39.6)', async ({ page }) => {
    expect(createdQuantityTableId).toBeTruthy();
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    // 1回目: 写真選択ダイアログを開いて1枚選択（紐づけ）
    const firstPhotoList = await openPhotoDialog(page, 'select');
    const firstItem = firstPhotoList.locator('[data-testid^="photo-item-"]').first();
    await expect(firstItem).toBeVisible({ timeout: getTimeout(8000) });
    await firstItem.click();
    // ダイアログが閉じて紐づけが確定する
    await expect(page.getByRole('dialog').first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    // 2回目: 写真変更ダイアログ（別の写真を選択する経路）を開いて重なりを再検証
    const changedPhotoList = await openPhotoDialog(page, 'change');
    await expectNoThumbnailOverlap(changedPhotoList, '写真変更ダイアログ');
  });

  /**
   * @requirement quantity-table-generation/REQ-39.4
   * @requirement quantity-table-generation/REQ-39.5
   * @requirement quantity-table-generation/REQ-39.6
   *
   * 狭幅ビューポートでも写真が潰れず（幅・高さがゼロにならず）重ならないこと。
   * 折り返しが強制されるため重なり回帰の検出に有効。
   */
  test('狭幅ビューポートでもサムネイルが潰れず重ならない (REQ-39.4, 39.5, 39.6)', async ({
    page,
  }) => {
    expect(createdQuantityTableId).toBeTruthy();
    // 狭幅（モバイル相当）に設定して折り返しを強制する
    await page.setViewportSize({ width: 375, height: 720 });

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const photoList = await openPhotoDialog(page, 'select');
    await expectNoThumbnailOverlap(photoList, '写真選択ダイアログ（狭幅 375px）');
  });
});
