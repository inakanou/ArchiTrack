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
 * ## Task 82.1 の是正: REQ-19.2 が注釈の有無を問うていなかった
 *
 * 従前の事前準備は写真をアップロードするだけで注釈を保存せず、REQ-19.2（注釈付き写真
 * 一覧の表示）の検証は「一覧に写真がシード枚数だけ並ぶ」を見ていた。注釈なし写真が
 * 並んでも通るため、当該受入基準に対しては何も確かめていなかった（Task 75.1 が一覧の
 * 取得経路を注釈付きのみを返す `GET /api/projects/:projectId/survey-images` へ
 * 置き換えたことで、候補0件として露出した）。
 *
 * 本ファイルは**注釈付きと注釈なしの両方**をシードし、選択候補が注釈を保存した写真と
 * 一致すること（注釈なし写真が現れないこと）を主張する。全件を注釈付きにすると
 * 「注釈なしは現れない」が空集合に対する恒真になるため、注釈なし写真を必ず残す。
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
import { assertPrepared } from '../../helpers/preconditions';
import {
  fetchSurveyImagesInDisplayOrder,
  saveSurveyImageAnnotation,
} from '../../helpers/survey-image-annotations';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 注釈を保存する写真の枚数（REQ-19.2/19.3 の選択候補として現れるべき写真）
 *
 * 一覧（`GET /api/projects/:projectId/survey-images`）は注釈レコードを持つ写真のみを
 * 返すため、ここが選択候補の枚数になる。
 */
const ANNOTATED_PHOTO_COUNT = 3;

/**
 * 注釈を保存しない写真の枚数（選択候補に現れてはならない写真）
 *
 * REQ-19.2 は「注釈付き写真一覧」を定めるため、注釈なし写真が選別されて落ちることまでを
 * 確かめる必要がある。注釈なし写真を置かないと「注釈なしは現れない」が空集合に対する
 * 恒真になる。
 */
const PLAIN_PHOTO_COUNT = 2;

/** 事前準備でアップロードする写真の総枚数 */
const SEED_PHOTO_COUNT = ANNOTATED_PHOTO_COUNT + PLAIN_PHOTO_COUNT;

/** 注釈を保存する写真のファイル名の接頭辞 */
const ANNOTATED_FILE_PREFIX = 'req19-annotated-';

/** 注釈を保存しない写真のファイル名の接頭辞 */
const PLAIN_FILE_PREFIX = 'req19-plain-';

let testProjectId: string | null = null;
let createdSurveyId: string | null = null;
let createdQuantityTableId: string | null = null;

/** 注釈を保存した写真のファイル名（選択候補に現れるべき写真。表示要素の `alt` と一致する） */
const annotatedFileNames: string[] = [];

/** 注釈を保存していない写真のファイル名（選択候補に現れてはならない写真） */
const plainFileNames: string[] = [];

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

/**
 * 開いているダイアログの写真一覧が「注釈を保存した写真だけ」で尽くされていることを主張する。
 *
 * 枚数の完全一致（`toHaveCount`）と、注釈付き各1件の存在、注釈なし各0件の不在を併せて
 * 主張する。注釈なし写真がシードされていることは呼び出し側が事前に確認する。
 *
 * @param page Playwright のページ（写真一覧のダイアログが開いていること）
 * @param context 失敗メッセージに付す文脈（どちらの入口から開いた一覧か）
 * @throws 一覧が表示されない・枚数が一致しない・並ぶ写真が注釈付きと一致しない場合
 */
async function expectAnnotatedOnlyPhotoList(page: Page, context: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: '写真を選択' });
  const photoList = dialog.locator('[data-testid="photo-list"]');
  await expect(photoList, `${context}: 写真一覧が表示される必要がある`).toBeVisible({
    timeout: getTimeout(20000),
  });

  const photoItems = dialog.locator('[data-testid^="photo-item-"]');
  await expect(
    photoItems,
    `${context}: 一覧に並ぶのは注釈付きの${ANNOTATED_PHOTO_COUNT}枚だけである` +
      `（アップロードした総枚数は${SEED_PHOTO_COUNT}枚）`
  ).toHaveCount(ANNOTATED_PHOTO_COUNT, { timeout: getTimeout(20000) });
  await expect(photoItems.first(), `${context}: 一覧の写真が視認できる`).toBeVisible();

  for (const fileName of annotatedFileNames) {
    await expect(
      dialog.locator(`[data-testid^="photo-item-"][alt="${fileName}"]`),
      `${context}: 注釈を保存した ${fileName} が一覧に並ぶ`
    ).toHaveCount(1, { timeout: getTimeout(10000) });
  }

  for (const fileName of plainFileNames) {
    await expect(
      dialog.locator(`[data-testid^="photo-item-"][alt="${fileName}"]`),
      `${context}: 注釈を保存していない ${fileName} は一覧に並ばない`
    ).toHaveCount(0, { timeout: getTimeout(10000) });
  }
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

      // 注釈を付ける写真と付けない写真をファイル名で区別してアップロードする
      const form = new FormData();
      for (let i = 0; i < ANNOTATED_PHOTO_COUNT; i += 1) {
        form.append(
          'images',
          new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }),
          `${ANNOTATED_FILE_PREFIX}${i + 1}.png`
        );
      }
      for (let i = 0; i < PLAIN_PHOTO_COUNT; i += 1) {
        form.append(
          'images',
          new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }),
          `${PLAIN_FILE_PREFIX}${i + 1}.png`
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

      assertPrepared(createdSurveyId, '作成した現場調査のID');
      const seededImages = await fetchSurveyImagesInDisplayOrder(page, createdSurveyId);
      expect(seededImages.length, 'REQ-19 の選択候補として写真がシードされている必要がある').toBe(
        SEED_PHOTO_COUNT
      );

      // --- 注釈付き／注釈なしに分けて、注釈付きにだけ注釈を保存する（Task 82.1）---
      const toBeAnnotated = seededImages.filter((image) =>
        image.fileName.startsWith(ANNOTATED_FILE_PREFIX)
      );
      const toStayPlain = seededImages.filter((image) =>
        image.fileName.startsWith(PLAIN_FILE_PREFIX)
      );
      expect(
        toBeAnnotated.length,
        `注釈を保存する写真が${ANNOTATED_PHOTO_COUNT}枚ある必要がある`
      ).toBe(ANNOTATED_PHOTO_COUNT);
      expect(toStayPlain.length, `注釈を保存しない写真が${PLAIN_PHOTO_COUNT}枚ある必要がある`).toBe(
        PLAIN_PHOTO_COUNT
      );

      for (const image of toBeAnnotated) {
        await saveSurveyImageAnnotation(page, image);
      }

      annotatedFileNames.length = 0;
      annotatedFileNames.push(...toBeAnnotated.map((image) => image.fileName));
      plainFileNames.length = 0;
      plainFileNames.push(...toStayPlain.map((image) => image.fileName));
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
   * @requirement quantity-table-generation/REQ-4.3: 写真選択ダイアログに注釈付き写真一覧を表示
   * @requirement quantity-table-generation/REQ-19.2: 写真変更ダイアログに注釈付き写真一覧を表示
   *
   * 受入基準19.2 の原文は「While **写真変更ダイアログ**が表示されている状態で……同一
   * プロジェクトの注釈付き現場調査写真一覧（注釈エディタで編集済みの画像）を表示する」
   * である。したがって本区間は写真を紐づけてから「写真を変更」で開き直した一覧に対して
   * 主張する（写真未紐付けから開く一覧は受入基準4.3 の所管であり、併せて主張する）。
   *
   * 「注釈付き写真一覧」であることを確かめるため、枚数だけでなく**どの写真が並ぶか**を
   * 主張する（Task 82.1）。事前準備は注釈付き3枚・注釈なし2枚をシードしており、
   * 次の3つを併せて主張することで「注釈なし写真は並ばない」が言える。
   *
   * 1. 注釈なし写真が現にシードされている（母集団が空でないこと）
   * 2. 並ぶ枚数が注釈付きの枚数と**完全一致**する（`toHaveCount`）
   * 3. 注釈を保存した各写真が、それぞれ1件ずつ並ぶ
   *
   * 2と3から、並んでいる要素は注釈付き写真で尽くされる。したがって注釈なし写真は
   * 1件も並んでいない。念のため注釈なし写真のファイル名が1件も現れないことも直接主張する。
   */
  test('写真選択・写真変更ダイアログに注釈付き写真のみが一覧表示される (REQ-4.3, REQ-19.2)', async ({
    page,
  }) => {
    // 母集団の確認: 注釈なし写真が現に存在する（存在しなければ「現れない」は恒真になる）
    expect(
      plainFileNames,
      `前提: 注釈なし写真が${PLAIN_PHOTO_COUNT}枚シードされている`
    ).toHaveLength(PLAIN_PHOTO_COUNT);
    expect(
      annotatedFileNames,
      `前提: 注釈付き写真が${ANNOTATED_PHOTO_COUNT}枚シードされている`
    ).toHaveLength(ANNOTATED_PHOTO_COUNT);

    await navigateToQuantityTableEdit(page);

    // --- 写真未紐付けから開く一覧（REQ-4.3）---
    await openPhotoDialog(page, 'placeholder');
    await expectAnnotatedOnlyPhotoList(page, 'REQ-4.3: 写真選択ダイアログ');

    // --- 写真を紐づけてから「写真を変更」で開き直した一覧（REQ-19.2）---
    // 紐づけはクライアントドラフトの更新に留まる（REQ-42.3）。本区間は一覧の内容のみを
    // 問うため保存はしない（後続テストは未紐付けのグループを前提に開き直す）。
    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    const firstAnnotated = annotatedFileNames[0];
    assertPrepared(firstAnnotated, '注釈を保存した写真のファイル名');
    await dialog.locator(`[data-testid^="photo-item-"][alt="${firstAnnotated}"]`).click();
    await expect(dialog, '写真の選択でダイアログが閉じる必要がある').not.toBeVisible({
      timeout: getTimeout(10000),
    });

    await openPhotoDialog(page, 'change-button');
    await expectAnnotatedOnlyPhotoList(page, 'REQ-19.2: 写真変更ダイアログ');
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
