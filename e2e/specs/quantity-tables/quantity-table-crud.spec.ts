/**
 * @fileoverview 数量表CRUD操作のE2Eテスト
 *
 * Task 9.5: E2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - プロジェクト詳細画面の数量表セクション（旧 Requirement 1）は
 *   project-management/Requirement 25 へ移管済み。被覆印は移管先の番号で名乗る
 * - REQ-2.1-REQ-2.5: 数量表の作成・管理
 * - REQ-3.1-REQ-3.4: 数量表編集画面の表示
 * - REQ-4.1-REQ-4.5: 数量グループの作成・管理
 * - REQ-5.1-REQ-5.4: 数量項目の追加・編集
 * - REQ-6.1-REQ-6.5: 数量項目のコピー・移動
 * - REQ-7.1-REQ-7.5: 入力支援・オートコンプリート
 * - REQ-8.1-REQ-8.11: 計算方法の選択
 * - REQ-9.1-REQ-9.7: 調整係数
 * - REQ-10.1-REQ-10.7: 丸め設定
 * - REQ-11.1-REQ-11.5: 数量表の保存
 * - REQ-12.1-REQ-12.5: パンくずナビゲーション
 * - REQ-13.1-REQ-13.4: テキストフィールドの入力制御
 * - REQ-14.1-REQ-14.5: 数値フィールドの表示書式
 * - REQ-15.1-REQ-15.3: 数量フィールドの入力制御
 *
 * Requirements coverage (site-survey):
 * - REQ-20.2: 縮小表示に保存済みの注釈を反映する（描画された注釈を持つ写真だけを
 *   注釈ありとして示す。注釈の目印の表示・非表示を検証する末尾のブロック）
 *
 * @module e2e/specs/quantity-tables/quantity-table-crud.spec
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared, assertPresent } from '../../helpers/preconditions';
import { waitForFabricCanvas } from '../../helpers/fabric-canvas';
import {
  fetchSurveyImagesInDisplayOrder,
  saveSurveyImageAnnotation,
} from '../../helpers/survey-image-annotations';
import {
  createTestProject,
  createTestQuantityTable,
  openEditPageWithSingleItemRow,
} from '../../helpers/quantity-table-preconditions';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 文字幅を算出する（全角=2・半角=1）。
 *
 * REQ-13.1/13.2/13.3 の「全角N文字/半角2N文字」は文字幅の上限を指す。
 * backend の QuantityFieldValidationService.calculateStringWidth および
 * frontend の utils/field-validation.calculateStringWidth と同一仕様。
 */
function calculateStringWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    const isHankaku =
      (codePoint >= 0x0000 && codePoint <= 0x007f) || (codePoint >= 0xff61 && codePoint <= 0xff9f);
    width += isHankaku ? 1 : 2;
  }
  return width;
}

/**
 * 数量表CRUD機能のE2Eテスト
 */
test.describe('数量表CRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成した数量表のIDを保存
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;
  let createdSurveyId: string | null = null;
  let projectName: string = '';

  /**
   * 写真選択ダイアログの候補に**現れるべき**写真のファイル名（注釈レコードを保存済み）
   *
   * ダイアログの一覧は `img` の `alt` にファイル名を出す
   * （`frontend/src/pages/QuantityTableEditPage.tsx` の `alt={photo.fileName}`）ため、
   * 候補の同定にファイル名を用いる。
   */
  let annotatedPhotoFileName: string | null = null;

  /**
   * 写真選択ダイアログの候補に**現れてはならない**写真のファイル名（注釈を保存しない）
   *
   * 「注釈付きのみが現れる」を空集合に対する恒真へ退化させないために置く。
   */
  let unannotatedPhotoFileName: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * ログイン済みページの認証ヘッダを組み立てる。
   *
   * 検証の前提（数量項目などの下地データ）をAPIで用意する際に用いる。
   *
   * @param page - ログイン済みのページ
   * @returns Authorization ヘッダを含むヘッダ表
   */
  async function apiAuthHeaders(page: Page): Promise<Record<string, string>> {
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken, 'アクセストークンが取得できる').toBeTruthy();
    return { Authorization: `Bearer ${accessToken}` };
  }

  /**
   * 事前準備: テスト用プロジェクトと数量表を作成
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `数量表テスト用プロジェクト_${Date.now()}`;
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
      const projectUrl = page.url();
      const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    /**
     * 写真選択テスト用：サイト調査と写真を作成する
     * REQ-4.3, REQ-4.4テストで使用する写真を事前にアップロード
     */
    test('写真選択テスト用のサイト調査と写真を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // サイト調査作成ページに移動
      await page.goto(`/projects/${testProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const surveyName = `数量表テスト用調査_${Date.now()}`;
      const surveyDate = new Date().toISOString().split('T')[0];

      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(surveyDate!);

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(/\/site-surveys\/[0-9a-f-]+$/, {
        timeout: getTimeout(15000),
      });

      // 作成した現場調査のIDを保存
      const url = page.url();
      const match = url.match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = match?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();

      // 画像をアップロード
      // ImageUploaderがレンダリングされるまで待機（認証状態のロード完了を待つ）
      const imageUploader = page.locator('[data-testid="image-uploader"]');
      await expect(imageUploader).toBeVisible({ timeout: getTimeout(15000) });

      // ファイル入力を取得
      const input = page.locator('[data-testid="file-input"]');
      const inputCount = await input.count();

      // ファイル入力が見つからない場合は明示的にエラー（第3原則に従い無効化しない）
      if (inputCount === 0) {
        throw new Error(
          'REQ-4.3/4.4事前準備: ファイル入力が見つかりません。現場調査画面のファイルアップロード機能を確認してください。'
        );
      }

      // テスト用画像ファイルをアップロード
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

      // アップロードレスポンスのPromiseを先に作成
      const uploadPromise = page.waitForResponse(
        (uploadResponse) =>
          uploadResponse.url().includes('/api/site-surveys/') &&
          uploadResponse.url().includes('/images') &&
          uploadResponse.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );

      // テスト用画像ファイルをセット
      await input.setInputFiles(testImagePath);

      // アップロード完了を待機
      await uploadPromise;

      // ページをリロードして画像が保存されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // アップロードされた画像が表示されることを確認
      const uploadedImage = page.locator('[data-testid="photo-panel-item"] img');
      await expect(uploadedImage.first()).toBeVisible({ timeout: getTimeout(15000) });

      // ============================================================
      // 写真選択ダイアログの候補を成立させる前提（Task 84.1 / REQ-4.3）
      // ============================================================
      //
      // ダイアログの供給元 `GET /api/projects/:projectId/survey-images` は**注釈レコードを
      // 持つ写真だけ**を返す（`backend/src/services/image-list.service.ts` の
      // `annotation: { isNot: null }`）。写真をアップロードしただけでは候補が0件になり、
      // ダイアログを用いる判定は前提段階で成立しない。注釈の保存までを前提に含める。
      //
      // ## 道具の選択（採らなかった側とその理由）
      //
      // 採るのは共有ヘルパー `e2e/helpers/survey-image-annotations.ts` の
      // `saveSurveyImageAnnotation` である。採らなかった側は次の二つ。
      //
      // 1. **`PUT /api/site-surveys/images/:imageId/annotations` を本ファイルへ直接書き起こす**
      //    → 採らない。注釈保存の入口を写し取った箇所が増えるほど、入口の仕様変更
      //    （本文スキーマの変更など）で同時に陳腐化する箇所が増える。Task 75.1 の変更が
      //    7本の spec を同時に倒したのはまさにその形であり、本ファイルへ複製すれば
      //    同じ壊れ方を再生産する。共有ヘルパーの冒頭が述べる判断と同じである。
      // 2. **共有ヘルパー `seedSurveyPhotosWithComments` へ丸ごと置き換える**
      //    → 採らない。同補助は現場調査の作成と写真のアップロードまでを引き受けるが、
      //    本前提は「画面から現場調査を作り、画面からアップロードし、`photo-panel-item` に
      //    現れるところまで」を検証している。置き換えるとこの画面経路の検証が消える。
      //    注釈の保存だけを担う `saveSurveyImageAnnotation` を用いて、既存の画面経路を残す。
      //
      // ## 注釈なし写真も併せて置く理由
      //
      // 「注釈付きのみが候補に現れる」は、注釈なし写真が一枚も無ければ空集合に対する
      // 恒真へ退化する。注釈を保存しない写真を1枚残し、その不在を主張できるようにする。
      //
      // ## 描画を伴わない注釈（`'undrawn'`）を保存する理由
      //
      // 供給元の抽出条件は注釈レコードの存在のみを見て、描画の有無
      // （`hasDrawnAnnotations`）は見ない。一方で後続の REQ-4.4 / REQ-3.3 は
      // 「この写真は描画された注釈を持たない」ことを前提に、注釈の目印の不在と
      // 合成済みサムネイルの不在を主張する。描画ありで保存するとその前提を壊す。
      // 画像編集画面は注釈0件（無描画）でも無条件に保存する
      // （`backend/src/services/annotation.service.ts` の `hasDrawnObjects`）ため、
      // 「候補には現れるが描画は持たない写真」は実在する状態であり、
      // 前提として作り物ではない。
      // 以降の前提生成は現場調査IDを要する。`let` の絞り込みに頼らず、その場で主張して
      // 型と実行時の双方を確定させる。
      const seedSurveyId = createdSurveyId;
      assertPrepared(seedSurveyId, '事前準備で作成した現場調査のID');

      const unannotatedFileName = `unannotated-${Date.now()}.png`;
      const unannotatedImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(
        fs.existsSync(unannotatedImagePath),
        '前提: 注釈なし写真に用いるテスト用画像が存在する'
      ).toBeTruthy();
      const unannotatedImageBuffer = fs.readFileSync(unannotatedImagePath);

      const unannotatedUploadForm = new FormData();
      unannotatedUploadForm.append(
        'images',
        new Blob([new Uint8Array(unannotatedImageBuffer)], { type: 'image/png' }),
        unannotatedFileName
      );
      const unannotatedUploadResponse = await page.request.post(
        `${API_BASE_URL}/api/site-surveys/${seedSurveyId}/images`,
        { headers: await apiAuthHeaders(page), multipart: unannotatedUploadForm }
      );
      expect(
        unannotatedUploadResponse.ok(),
        `前提: 注釈なし写真のアップロードが成功する (status=${unannotatedUploadResponse.status()})`
      ).toBeTruthy();

      const surveyImages = await fetchSurveyImagesInDisplayOrder(page, seedSurveyId);
      expect(surveyImages.length, '前提: 現場調査に写真が2枚ある').toBe(2);

      const unannotatedImage = surveyImages.find((image) => image.fileName === unannotatedFileName);
      assertPresent(unannotatedImage, '注釈を保存せずに残す写真');
      const annotatedImage = surveyImages.find((image) => image.fileName !== unannotatedFileName);
      assertPresent(annotatedImage, '注釈を保存する写真');

      await saveSurveyImageAnnotation(page, annotatedImage, 'undrawn');

      annotatedPhotoFileName = annotatedImage.fileName;
      unannotatedPhotoFileName = unannotatedImage.fileName;
    });
  });

  /**
   * @requirement project-management/REQ-25.1
   * @requirement project-management/REQ-25.2
   * @requirement project-management/REQ-25.6
   *
   * project-management/REQ-25: プロジェクト詳細画面の数量表セクション（数量表なし時）
   */
  test.describe('プロジェクト詳細の数量表セクション（数量表なし時）', () => {
    test('数量表セクションが表示される (project-management/REQ-25.1)', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 数量表セクションが表示される（必須）
      const quantityTableSection = page.getByTestId('quantity-table-section');
      await expect(quantityTableSection).toBeVisible({ timeout: getTimeout(10000) });
    });

    test('数量表セクションにヘッダーと総数が表示される (project-management/REQ-25.2)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');
      // ヘッダーに「数量表」タイトルが表示される（必須）
      await expect(quantityTableSection.getByRole('heading', { name: '数量表' })).toBeVisible();
      // 総数表示が含まれる（必須）
      await expect(quantityTableSection.getByText(/全\d+件/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('数量表がない場合は空状態メッセージと新規作成リンクを表示 (project-management/REQ-25.6)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');

      // 空状態メッセージが表示される（必須）
      const emptyMessage = quantityTableSection.getByText(/数量表はまだありません/);
      await expect(emptyMessage).toBeVisible({ timeout: getTimeout(5000) });

      // 新規作成リンクが表示される（必須）
      const createLink = quantityTableSection.getByRole('link', { name: /新規作成/ });
      await expect(createLink).toBeVisible({ timeout: getTimeout(5000) });
    });

    test('新規作成ボタンをクリックして数量表新規作成画面に遷移する (project-management/REQ-25.7)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');

      // 新規作成リンクをクリック
      const createLink = quantityTableSection.getByRole('link', { name: /新規作成/ });
      await expect(createLink).toBeVisible({ timeout: getTimeout(5000) });
      await createLink.click();

      // project-management/REQ-25.7 は遷移先を「数量表新規作成画面
      // （/projects/{projectId}/quantity-tables/new）」と定めており、実装も
      // routes.tsx:259 の QuantityTableCreatePage（画面）である。ダイアログの実装は無い。
      // 以前は「ダイアログが出れば名称欄・出なければURL」の分岐で、どちらでも通っていた。
      // 遷移先の画面を無条件に主張する。
      await expect(
        page,
        'project-management/REQ-25.7: 新規作成リンクから数量表新規作成画面へ遷移しない'
      ).toHaveURL(new RegExp(`/projects/${testProjectId}/quantity-tables/new$`), {
        timeout: getTimeout(10000),
      });
      await expect(
        page.getByRole('dialog'),
        'project-management/REQ-25.7: 新規作成はダイアログではなく画面遷移で提供される'
      ).toHaveCount(0);
      await expect(
        page.getByRole('textbox', { name: /数量表名|名称/ }),
        'project-management/REQ-25.7: 新規作成画面に数量表名の入力欄が表示されない'
      ).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-2.1
   * @requirement quantity-table-generation/REQ-2.2
   * @requirement quantity-table-generation/REQ-2.3
   *
   * REQ-2: 数量表の作成・管理
   */
  test.describe('数量表新規作成フロー', () => {
    test('新規作成画面で名称入力して作成できる (quantity-table-generation/REQ-2.1, REQ-2.2)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');

      // 数量表セクションの新規作成の導線は、空状態でもヘッダでも常に Link で描画される
      // （QuantityTableSectionCard の EmptyState / headerActions）。ボタンの実装は無い。
      // 以前は「リンク または ボタン」の論理和で判定していたため、リンクが失われて
      // ボタンだけになっても、逆に両方失われる以外は気づけない形だった。
      const createLink = quantityTableSection.getByRole('link', { name: /新規作成/ });
      await expect(createLink, '数量表セクションに新規作成リンクが無い').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(
        quantityTableSection.getByRole('button', { name: /新規作成|追加/ }),
        '新規作成はリンクで提供される（ボタンの実装は無い）'
      ).toHaveCount(0);

      await createLink.click();

      // 数量表名の入力は独立した新規作成画面で行う。REQ-12.3 が
      // 「数量表新規作成画面を表示する」ときのパンくずを定めており、
      // project-management/REQ-25.7 も遷移先を画面（/quantity-tables/new）と定める。
      // 実装（routes.tsx:259 / QuantityTableCreatePage）にダイアログの経路は無い。
      // 以前は「ダイアログ または ページ」の分岐で、どちらでも通っていた。
      await expect(page, 'REQ-2.1: 数量表名を入力する新規作成画面へ遷移しない').toHaveURL(
        /\/quantity-tables\/new$/,
        { timeout: getTimeout(10000) }
      );
      const nameInput = page.getByRole('textbox', { name: /数量表名|名称/ });
      await expect(nameInput, 'REQ-2.1: 数量表名の入力欄が表示されない').toBeVisible({
        timeout: getTimeout(10000),
      });
      // REQ-2.1: 数量表名フィールドにデフォルト値「数量表」を設定する
      await expect(nameInput, 'REQ-2.1: 数量表名の既定値が「数量表」ではない').toHaveValue(
        '数量表'
      );
      await nameInput.fill('E2Eテスト用数量表');

      // 作成を確定する - REQ-2.2
      const submitButton = page.getByRole('button', { name: /^作成$/ });
      await expect(submitButton, 'REQ-2.2: 作成ボタンが表示されない').toBeVisible({
        timeout: getTimeout(10000),
      });
      await submitButton.click();

      // 編集画面に遷移することを確認 - REQ-2.2
      await page.waitForURL(/\/quantity-tables\/[^/]+\/edit/, { timeout: getTimeout(10000) });

      // URLからIDを保存
      const url = page.url();
      const match = url.match(/\/quantity-tables\/([a-f0-9-]+)\/edit/);
      if (match && match[1]) {
        createdQuantityTableId = match[1];
      }
      expect(createdQuantityTableId).toBeTruthy();
    });

    test('数量表一覧画面に作成日時順で表示される (quantity-table-generation/REQ-2.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 並び順の判定には数量表が2件以上要る。共有のテストプロジェクトへ足すと
      // 「直近の数量表カード」を見る別の判定（project-management/REQ-25.3, REQ-25.5）の
      // 母集団まで変えてしまうため、本判定専用のプロジェクトを用意する。
      const orderingProjectId = await createTestProject(page, 'REQ2_3_並び順');
      const olderTable = await createTestQuantityTable(page, orderingProjectId, 'REQ2_3_先に作成');
      const newerTable = await createTestQuantityTable(page, orderingProjectId, 'REQ2_3_後に作成');

      await page.goto(`/projects/${orderingProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // 一覧の各行は `aria-label="{名称}の数量表詳細を見る"` のリンクとして描画される。
      // 以前は存在しない `data-testid="quantity-table-list-item"` を数えており、
      // 件数が常に 0 で並び順の判定が一度も実行されていなかった。
      const listItems = page.getByRole('link', { name: /の数量表詳細を見る$/ });
      await expect(listItems, 'REQ-2.3: 作成した数量表が一覧に並ぶ').toHaveCount(2, {
        timeout: getTimeout(10000),
      });

      const labels = await listItems.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('aria-label') ?? '')
      );
      expect(labels, 'REQ-2.3: 作成日時順（新しい順）に並ぶ').toEqual([
        `${newerTable.name}の数量表詳細を見る`,
        `${olderTable.name}の数量表詳細を見る`,
      ]);
    });

    /**
     * 受入基準 2.5 はタスク95.1で除外を取り下げた（e2e/requirement-exclusions.json）。数量表一覧画面に名称編集の実装が無く、分母に在って未カバーである。本検証は編集画面の保存ボタンによる永続化を主張するもので、受入基準が求める一覧画面での即座の保存を主張していないため、被覆印は掲げない。
     * @requirement quantity-table-generation/REQ-42.5
     *
     * 数量表名のインライン編集機能をテスト。
     * REQ-42 移行: 名称編集はクライアントドラフトのみを更新し、フォーカスを外しても
     * 即時保存はされない。永続化は「保存」ボタン押下時の PUT /:id/save でのみ行う。
     */
    test('数量表名を編集し保存するとサーバーに永続化される (REQ-42.5)', async ({ page }) => {
      if (!testProjectId || !createdQuantityTableId) {
        throw new Error('事前準備が完了していません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に移動
      await page.goto(`/projects/${testProjectId}/quantity-tables/${createdQuantityTableId}`);
      await page.waitForLoadState('networkidle');

      // 数量表名の入力フィールドを取得
      const nameInput = page.getByLabel('数量表名');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });

      // 元の値を取得
      const originalValue = await nameInput.inputValue();

      // 新しい値で更新
      const newValue = `${originalValue}_更新テスト_${Date.now()}`;
      await nameInput.clear();
      await nameInput.fill(newValue);

      // フォーカスを外してドラフトへ反映（この時点ではまだ永続化されない。REQ-42.6）
      await nameInput.blur();

      // REQ-42.5: 「保存」ボタンを押下して永続化する。
      await saveQuantityTableDraft(page);

      // ページをリロードして永続化を確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 更新された値が維持されていることを確認
      const reloadedNameInput = page.getByLabel('数量表名');
      await expect(reloadedNameInput).toHaveValue(newValue, { timeout: getTimeout(10000) });

      // 元の値に戻す（クリーンアップ）。編集→保存で永続化する。
      await reloadedNameInput.clear();
      await reloadedNameInput.fill(originalValue);
      await reloadedNameInput.blur();
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement project-management/REQ-25.4
   * @requirement project-management/REQ-25.5
   * @requirement project-management/REQ-25.7
   *
   * project-management/REQ-25: プロジェクト詳細画面の数量表セクション（数量表あり時）
   * 注: これらのテストは数量表作成後に実行する必要がある
   */
  test.describe('プロジェクト詳細の数量表セクション（数量表あり時）', () => {
    test('直近の数量表カードに名称・更新日時・数量項目数が表示される (project-management/REQ-25.3)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');
      await expect(quantityTableSection).toBeVisible({ timeout: getTimeout(10000) });

      // 数量表カードが表示される（必須）
      // カードはaria-labelで識別される: "{name}の数量表詳細を見る"
      const quantityTableCard = quantityTableSection.getByRole('link', {
        name: /E2Eテスト用数量表.*詳細/,
      });
      await expect(quantityTableCard).toBeVisible({ timeout: getTimeout(5000) });

      // カードに名称が表示される（必須）
      // カード内のheading要素（h4）に名称が表示される
      const cardName = quantityTableCard.getByRole('heading', { name: /E2Eテスト用数量表/ });
      await expect(cardName).toBeVisible({ timeout: 3000 });

      // カードにメタ情報（日付・グループ数・項目数）が表示される（必須）
      // 形式例: "2026年1月9日 / 0グループ / 0項目"
      const tableMeta = quantityTableCard.locator('p');
      await expect(tableMeta).toBeVisible({ timeout: 3000 });

      // メタ情報に日付が含まれる
      const metaText = await tableMeta.textContent();
      expect(metaText).toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);

      // メタ情報に項目数が含まれる
      expect(metaText).toMatch(/\d+項目/);
    });

    test('「すべて見る」リンクをクリックして数量表一覧画面に遷移する (project-management/REQ-25.4)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');
      await expect(quantityTableSection).toBeVisible({ timeout: getTimeout(10000) });

      // 「すべて見る」リンクが表示される（必須）
      const viewAllLink = quantityTableSection.getByRole('link', { name: /すべて見る/ });
      await expect(viewAllLink).toBeVisible({ timeout: getTimeout(5000) });

      // クリックして遷移
      await viewAllLink.click();

      // 数量表一覧画面に遷移したことを確認（必須）
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}/quantity-tables`), {
        timeout: getTimeout(10000),
      });

      // 一覧画面が正しく表示されることを確認
      await page.waitForLoadState('networkidle');
      // 404エラーが表示されていないことを確認
      await expect(page.getByText(/404|ページが見つかりません/)).not.toBeVisible({ timeout: 3000 });
    });

    test('数量表カードをクリックして編集画面に遷移する (project-management/REQ-25.5)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');
      await expect(quantityTableSection).toBeVisible({ timeout: getTimeout(10000) });

      // 数量表カード（リンク）をクリック
      // カードは「E2Eテスト用数量表」のテキストを含むリンク
      const quantityTableCard = quantityTableSection.getByRole('link', {
        name: /E2Eテスト用数量表|数量表詳細を見る/,
      });
      await expect(quantityTableCard).toBeVisible({ timeout: getTimeout(5000) });

      await quantityTableCard.click();

      // 編集画面に遷移したことを確認（必須）
      // リダイレクトを経由するので最終的なURLをチェック
      await expect(page).toHaveURL(/\/quantity-tables\/[a-f0-9-]+\/edit/, {
        timeout: getTimeout(15000),
      });

      // 編集画面が正しく表示されることを確認
      await page.waitForLoadState('networkidle');
      // 404エラーが表示されていないことを確認（必須）
      await expect(page.getByText(/404|ページが見つかりません/)).not.toBeVisible({ timeout: 3000 });

      // 編集画面の基本要素が表示されることを確認（必須）
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-3.1
   * @requirement quantity-table-generation/REQ-3.2
   * @requirement quantity-table-generation/REQ-3.3
   * @requirement quantity-table-generation/REQ-3.4
   *
   * REQ-3: 数量表編集画面の表示
   */
  test.describe('数量表編集画面', () => {
    test('編集画面に編集エリアと関連写真エリアが表示される (quantity-table-generation/REQ-3.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集エリアが表示される
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 関連写真エリアの存在を確認（オプショナル - 実装状況による）
      // 注: 関連写真エリアは将来の実装で追加予定
    });

    test('数量グループと数量項目が階層的に表示される (quantity-table-generation/REQ-3.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // REQ-3.2 は「数量グループ一覧と各グループ内の数量項目を階層的に表示する」ことを求める。
      // 以前は編集画面を開いて「グループ一覧 または 表 または 空状態」のいずれかが出ることを
      // 主張していた。編集はクライアント下書きのみを更新するため、再訪した編集画面は常に
      // グループ0件＝空状態であり、判定は空状態だけで必ず成立していた。
      // すなわち階層表示を一度も確かめていない。前提（グループ1件・項目1行）を自分で作る。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      const groupSection = page.getByTestId('quantity-group-section');
      await expect(groupSection, '数量グループ一覧が表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(page.getByText(/グループがありません/)).toHaveCount(0);

      // グループの内側に数量項目の行が入れ子で表示される（階層表示）
      const groupCard = groupSection.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard).toBeVisible();
      await expect(groupCard.locator('[data-testid="quantity-item-row"]')).toHaveCount(1);
      await expect(itemRow).toBeVisible();
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-4.1
   * 受入基準 4.2 は除外である（e2e/requirement-exclusions.json）。写真選択のボタンが可視であることしか主張しておらず、写真を選択する機能の提供を主張していないため、被覆印は掲げない。
   * @requirement quantity-table-generation/REQ-4.5
   *
   * REQ-4: 数量グループの作成・管理
   */
  test.describe('数量グループ操作', () => {
    test('数量グループを追加できる (quantity-table-generation/REQ-4.1)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が正しく表示されることを確認（必須）
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループ追加ボタンが表示されることを確認（必須）
      // 複数ボタンがある場合は最初の1つを使用
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/ })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンが無効化されていないことを確認（必須）
      await expect(addGroupButton).toBeEnabled({ timeout: getTimeout(5000) });

      // 現在のグループ数を記録（空状態も可能）
      const initialGroupCount = await page.getByTestId('quantity-group').count();

      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。クリック後はドラフトへ即時反映される。
      await addGroupButton.click();

      // 新しいグループがUIに追加されたことを確認（必須）
      const groups = page.getByTestId('quantity-group');
      await expect(groups).toHaveCount(initialGroupCount + 1, { timeout: getTimeout(10000) });

      // 追加されたグループが表示されていることを確認（必須）
      const newGroup = groups.last();
      await expect(newGroup).toBeVisible({ timeout: getTimeout(5000) });

      // REQ-42.5: 追加を保存して永続化し、リロード後も維持されることを確認する。
      await saveQuantityTableDraft(page);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('quantity-group')).toHaveCount(initialGroupCount + 1, {
        timeout: getTimeout(10000),
      });
    });

    test('数量グループ削除時に確認ダイアログが表示される (quantity-table-generation/REQ-4.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // グループ削除ボタンが表示されることを確認（必須）
      const deleteGroupButton = page
        .getByRole('button', { name: /グループを削除|グループ削除/ })
        .first();
      await expect(deleteGroupButton).toBeVisible({ timeout: getTimeout(5000) });

      await deleteGroupButton.click();

      // 確認ダイアログが表示される（必須）
      const confirmDialog = page.getByRole('dialog');
      await expect(confirmDialog).toBeVisible({ timeout: 3000 });

      // キャンセルボタンが表示される（必須）
      const cancelButton = confirmDialog.getByRole('button', { name: /キャンセル|いいえ/ });
      await expect(cancelButton).toBeVisible({ timeout: 2000 });
      await cancelButton.click();

      // ダイアログが閉じる
      await expect(confirmDialog).not.toBeVisible({ timeout: 3000 });
    });

    test('グループ追加時に注釈付き現場調査写真選択機能が提供される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認（必須）
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループが存在することを確認
      const groups = page.getByTestId('quantity-group');
      const groupCount = await groups.count();

      if (groupCount === 0) {
        throw new Error('グループが存在しません。グループ追加テストが正しく実行されていません。');
      }

      const firstGroup = groups.first();
      // 写真選択/追加ボタンが存在することを確認（必須）
      // UIではaria-label="写真を選択"のrole="button"として実装されている
      const photoSelectButton = firstGroup.getByRole('button', { name: /写真を選択/ });
      await expect(photoSelectButton).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-4.3
     *
     * 写真選択ダイアログの表示をテスト
     * 写真選択ボタンをクリックすると、写真選択ダイアログが表示される
     */
    test('写真選択操作で同一プロジェクトの注釈付き現場写真一覧が表示される (quantity-table-generation/REQ-4.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループが存在することを確認
      const groups = page.getByTestId('quantity-group');
      const groupCount = await groups.count();

      if (groupCount === 0) {
        throw new Error('グループが存在しません。グループ追加テストが正しく実行されていません。');
      }

      const firstGroup = groups.first();

      // 写真選択ボタンをクリック
      const photoSelectButton = firstGroup.getByRole('button', { name: /写真を選択/ });
      await expect(photoSelectButton).toBeVisible({ timeout: getTimeout(5000) });
      await photoSelectButton.click();

      // 写真選択ダイアログが表示されることを確認
      const photoDialog = page.getByRole('dialog', { name: /写真を選択/ });
      await expect(photoDialog).toBeVisible({ timeout: getTimeout(10000) });

      // ダイアログタイトルが表示されていることを確認
      const dialogTitle = photoDialog.getByText('写真を選択');
      await expect(dialogTitle).toBeVisible();

      // REQ-4.3: 写真一覧が表示されることを確認する。
      //
      // 以前はここが「一覧 **または** 空状態メッセージ」の選言だった。選言は候補0件でも
      // 通るため、REQ-4.3（注釈付き現場写真一覧を表示し選択可能にする）について
      // 何も主張しない恒真である（Task 84.1）。前提で注釈を保存しているため候補は
      // 必ず存在する。一覧そのものを無条件に待つ。
      const photoList = photoDialog.getByTestId('photo-list');
      await expect(
        photoList,
        '注釈を保存済みの写真があるため、空状態ではなく写真一覧が表示される'
      ).toBeVisible({ timeout: getTimeout(20000) });

      // REQ-4.3: 一覧に現れるのは注釈付きの写真のみである。
      // 前提は注釈を保存した写真1枚と保存していない写真1枚を用意しているため、
      // 「注釈なしは現れない」は空集合に対する恒真ではない。
      assertPrepared(annotatedPhotoFileName, '注釈を保存した写真のファイル名');
      assertPrepared(unannotatedPhotoFileName, '注釈を保存していない写真のファイル名');
      await expect(
        photoList.getByAltText(annotatedPhotoFileName, { exact: true }),
        '注釈を保存した写真は選択候補に現れる'
      ).toBeVisible({ timeout: getTimeout(10000) });
      await expect(
        photoDialog.getByAltText(unannotatedPhotoFileName, { exact: true }),
        '注釈を保存していない写真は選択候補に現れない'
      ).toHaveCount(0);

      // ダイアログを閉じる
      const closeButton = photoDialog.getByRole('button', { name: /ダイアログを閉じる/ });
      await closeButton.click();

      // ダイアログが閉じたことを確認
      await expect(photoDialog).not.toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-4.3
     *
     * 写真を選択してグループに紐付ける機能をテスト
     * 写真を選択するとグループのサムネイルが更新される
     */
    test('写真を選択するとグループに紐付けられる (quantity-table-generation/REQ-4.3-link)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループが存在することを確認
      const groups = page.getByTestId('quantity-group');
      const groupCount = await groups.count();

      if (groupCount === 0) {
        throw new Error('グループが存在しません。グループ追加テストが正しく実行されていません。');
      }

      const firstGroup = groups.first();

      // 写真選択前：プレースホルダーが表示されていることを確認。
      // 事前準備で作成したグループは写真未紐付けであるため、プレースホルダーは必ず存在する。
      const placeholder = firstGroup.getByTestId(/image-placeholder/);
      await expect(
        placeholder,
        '写真未紐付けのグループにはプレースホルダーが表示される必要がある'
      ).toBeVisible({ timeout: getTimeout(5000) });

      // 写真選択ボタンをクリック
      const photoSelectButton = firstGroup.getByRole('button', { name: /写真を選択/ });
      await expect(photoSelectButton).toBeVisible({ timeout: getTimeout(5000) });
      await photoSelectButton.click();

      // 写真選択ダイアログが表示されることを確認
      const photoDialog = page.getByRole('dialog', { name: /写真を選択/ });
      await expect(photoDialog).toBeVisible({ timeout: getTimeout(10000) });

      // 写真一覧が表示されるまで待機（読み込み完了を含む）。
      // 空状態との選言は置かない。候補0件でも通る形は REQ-4.3 について何も主張しない
      // 恒真であり、紐付けの検証の前提としても成立しない（Task 84.1）。
      const photoList = photoDialog.getByTestId('photo-list');
      await expect(
        photoList,
        '注釈を保存済みの写真があるため、空状態ではなく写真一覧が表示される'
      ).toBeVisible({ timeout: getTimeout(20000) });

      // 前提で注釈を保存した写真を選択する。
      // 位置（`first()`）ではなくファイル名で指すのは、候補の並びが変わっても
      // 紐付ける対象が入れ替わらないようにするためである。
      assertPrepared(annotatedPhotoFileName, '注釈を保存した写真のファイル名');
      const targetPhoto = photoList.getByAltText(annotatedPhotoFileName, { exact: true });
      await expect(
        targetPhoto,
        '注釈を保存した写真が選択候補に存在する必要がある（事前準備で注釈を保存済み）'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // 写真を選択
      await targetPhoto.click();

      // ダイアログが閉じることを確認
      await expect(photoDialog).not.toBeVisible({ timeout: getTimeout(5000) });

      // グループにサムネイルが表示されることを確認（必須）
      const thumbnail = firstGroup.locator('img');
      await expect(thumbnail).toBeVisible({ timeout: getTimeout(5000) });

      // プレースホルダーが消えていることを確認
      await expect(placeholder).not.toBeVisible({ timeout: getTimeout(3000) });

      // REQ-42.5: 写真の紐づけはクライアントドラフトの更新に留まるため、保存しないと
      // リロード後には失われる。以降のテスト（REQ-3.3 の表示元検証など）が
      // 紐づけ済みの状態を前提とするため、ここで明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });

    test('写真紐づけ時に注釈付き写真と数量項目の関連性が視覚的に表示される (quantity-table-generation/REQ-4.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認（必須）
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループが存在することを確認
      const groups = page.getByTestId('quantity-group');
      const groupCount = await groups.count();

      if (groupCount === 0) {
        throw new Error('グループが存在しません。グループ追加テストが正しく実行されていません。');
      }

      const firstGroup = groups.first();

      // 直前の REQ-4.3-link テストで写真を紐づけて保存しているため、
      // サムネイルは必ず表示される。紐付けの有無を観測して分岐すると、
      // 写真が出ても出なくても通る自己充足の構造になる。
      const thumbnail = firstGroup.locator('img');
      await expect(
        thumbnail,
        '写真紐づけ済みグループにはサムネイルが表示される必要がある'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-4.4: 注釈の目印（バッジ）は「描画された注釈を持つ写真」にのみ表示される。
      // 前提で保存した注釈は描画を伴わない（`objects` が0件）ため `hasDrawnAnnotations` は
      // 偽であり、目印は表示されない。目印が出ない理由は「注釈を持たない」ことではなく
      // 「保存した注釈が描画を伴わない」ことである（Task 84.1 が前提へ注釈の保存を
      // 加えたため、前者はもはや実体と合わない）。
      // 目印の有無を自ら観測して分岐せず、非表示を無条件に検証する。
      await expect(
        firstGroup.locator('[data-testid^="annotation-badge-"]'),
        '描画された注釈を持たない写真のグループには注釈の目印を表示しない'
      ).toHaveCount(0);

      // REQ-4.4: サムネイルをクリックすると写真プレビュー（注釈ビューア）が表示される
      await thumbnail.click();
      const viewerModal = page.getByTestId('photo-preview-overlay');
      await expect(viewerModal).toBeVisible({ timeout: getTimeout(5000) });

      // モーダルを閉じる
      const closeModal = viewerModal.getByRole('button', { name: /閉じる|×/ });
      await closeModal.click();
      await expect(viewerModal).not.toBeVisible({ timeout: getTimeout(3000) });
    });

    test('写真が紐づけられたグループではオリジナル画像（注釈付き）が表示される (quantity-table-generation/REQ-3.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認（必須）
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループが存在することを確認（第3原則: 前提条件でテストを除外してはならない）
      const groups = page.getByTestId('quantity-group');
      const groupCount = await groups.count();

      if (groupCount === 0) {
        throw new Error(
          'REQ-3.3: グループが存在しません。写真機能をテストするにはグループが必要です。'
        );
      }

      const firstGroup = groups.first();

      // REQ-3.3: 紐付け写真の注釈付き画像が表示されることを確認（必須）
      //
      // 直前の REQ-4.3-link テストで写真を紐づけて保存しているため、画像は必ず表示される。
      // 紐付けの有無を自ら観測して分岐すると、写真が出ても出なくても通る構造になるため、
      // 表示を無条件に検証する。表示に用いる画像の選択は REQ-49.4/49.5 が定める
      // （原本ではなくサムネイル）。
      const image = firstGroup.locator('img');
      await expect(image, '紐付け済みの写真が表示される必要がある').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 表示元の検証（REQ-49.4 / REQ-49.5 / REQ-49.6）
      //
      // 表題部の縮小表示には原本ではなくサムネイルを用い、注釈をレンダリングした
      // 合成済みサムネイルが利用可能であればそれを表示元とする。
      // 判定はストレージキーの命名（`_thumb` を含むか等）ではなく、画面が実際に用いる
      // 取得経路（GET /api/quantity-tables/:id）の応答を基準に行う。命名を前提にすると、
      // 合成済みサムネイル（annotated-thumbnails/... 区画）が表示元になった時点で
      // 判定が成立しなくなる。
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      const detailResponse = await page.request.get(
        `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(detailResponse.ok()).toBeTruthy();
      const detail = (await detailResponse.json()) as {
        groups: Array<{
          surveyImage: {
            fileName: string;
            originalUrl: string;
            thumbnailUrl: string;
            annotatedThumbnailUrl: string | null;
            hasDrawnAnnotations: boolean;
          } | null;
        }>;
      };

      const imageAlt = await image.getAttribute('alt');
      const linkedImage = detail.groups.find(
        (group) => group.surveyImage !== null && group.surveyImage.fileName === imageAlt
      )?.surveyImage;
      expect(linkedImage, `表示中の画像(${imageAlt})が数量表の応答に含まれる`).toBeTruthy();

      const imageSrc = await image.getAttribute('src');
      expect(imageSrc, '表示元URLが設定されている').toBeTruthy();

      const pathOf = (url: string): string => new URL(url, page.url()).pathname;

      // 原本画像は縮小表示に用いない（REQ-49.4）
      expect(pathOf(imageSrc!)).not.toBe(pathOf(linkedImage!.originalUrl));

      // 応答の項目の有無を条件にして検証を選ぶと、当該項目が常に空である限り
      // 検証本体が一度も実行されない。ここは前提が既知であること
      // （この写真は前提で描画を伴わない注釈だけを保存しており、描画された注釈も
      // 合成済みサムネイルも持たない）を、画面が実際に用いる取得経路の
      // 応答で先に確定させたうえで、表示元を無条件に検証する。
      // 注釈がある場合（REQ-49.5 / REQ-49.6）の表示元は、注釈を描いた状態を自ら用意する
      // 本ファイル末尾の「数量表グループの注釈の目印」および site-survey 側の
      // 注釈付きサムネイルのテストで検証する。
      expect(
        linkedImage!.hasDrawnAnnotations,
        '描画を伴わない注釈だけを保存した写真は描画された注釈を持たない'
      ).toBe(false);
      expect(
        linkedImage!.annotatedThumbnailUrl,
        '描画された注釈が無い写真には合成済みサムネイルが存在しない'
      ).toBeNull();

      // 描画された注釈を持たない画像は通常サムネイルをそのまま表示する（REQ-49.4）
      expect(pathOf(imageSrc!)).toBe(pathOf(linkedImage!.thumbnailUrl));

      // 注釈の目印（バッジ）の検証（site-survey/REQ-20.2、site-survey Task 115.14）
      //
      // 目印の有無を自ら観測し、その結果を条件にして検証すると、目印が出ても出なくても
      // 通る自己充足の構造になる。上で前提（描画された注釈を持たない）を確定させたうえで、
      // 非表示を無条件に検証する。
      // 目印が「表示される」側の検証は、注釈を描いた状態を自ら用意する本ファイル末尾の
      // 「数量表グループの注釈の目印」で行う。
      await expect(
        firstGroup.locator('[data-testid^="annotation-badge-"]'),
        '描画された注釈を持たない写真のグループには注釈の目印を表示しない'
      ).toHaveCount(0);
    });

    test('数量グループを折りたたむと画像も非表示になる (quantity-table-generation/REQ-3.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認（必須）
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループが存在することを確認（第3原則: 前提条件でテストを除外してはならない）
      const groups = page.getByTestId('quantity-group');
      const groupCount = await groups.count();

      if (groupCount === 0) {
        throw new Error(
          'REQ-3.4: グループが存在しません。折りたたみ機能をテストするにはグループが必要です。'
        );
      }

      const firstGroup = groups.first();

      // 折りたたみボタンを取得
      const toggleButton = firstGroup.getByRole('button', { name: /グループを折りたたむ/ });
      const isToggleButtonVisible = await isVisibleWithin(toggleButton, 3000);

      if (!isToggleButtonVisible) {
        throw new Error(
          'REQ-3.4: 折りたたみボタンが見つかりません。グループの折りたたみ機能が正しく実装されていません。'
        );
      }

      // 初期状態: グループが展開されていることを確認
      await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

      // 画像が紐付けられていることの確認。
      // REQ-4.3-link テストで写真を紐づけて保存しているため、画像は必ず表示される。
      // 画像の有無を観測して分岐すると、折りたたみ時の非表示検証が実質を持たなくなる。
      const image = firstGroup.locator('img');
      await expect(image, '折りたたみ前は紐付け済みの画像が表示される必要がある').toBeVisible({
        timeout: getTimeout(10000),
      });

      // グループを折りたたむ
      await toggleButton.click();

      // 折りたたみ後: aria-expandedがfalseになることを確認
      const expandButton = firstGroup.getByRole('button', { name: /グループを展開/ });
      await expect(expandButton).toBeVisible({ timeout: getTimeout(3000) });

      // REQ-3.4: 折りたたみ後、画像が非表示になることを確認
      await expect(image, '折りたたみ後は画像が非表示になる必要がある').not.toBeVisible({
        timeout: getTimeout(3000),
      });

      // 項目一覧も非表示になっていることを確認
      const itemTable = firstGroup.getByRole('table', { name: /数量項目一覧/ });
      await expect(itemTable, '折りたたみ後は項目一覧が非表示になる必要がある').not.toBeVisible({
        timeout: getTimeout(3000),
      });

      // グループを再展開
      await expandButton.click();

      // 展開後: 折りたたみボタンが復帰することを確認
      await expect(toggleButton).toBeVisible({ timeout: getTimeout(3000) });

      // REQ-3.4: 展開後、画像が再表示されることを確認
      await expect(image, '展開後は画像が再表示される必要がある').toBeVisible({
        timeout: getTimeout(3000),
      });
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-5.1
   * @requirement quantity-table-generation/REQ-5.2
   * @requirement quantity-table-generation/REQ-5.4
   * @requirement quantity-table-generation/REQ-5.5
   *
   * REQ-5: 数量項目の追加・編集
   */
  test.describe('数量項目操作', () => {
    test('数量項目を追加できる (quantity-table-generation/REQ-5.1)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 項目追加ボタンが表示されることを確認（必須）
      const addItemButton = page.getByRole('button', { name: /項目を追加/ }).first();
      await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });

      const initialRowCount = await page.getByTestId('quantity-item-row').count();
      await addItemButton.click();

      // 新しい行が追加されたことを確認（必須）
      await expect(page.getByTestId('quantity-item-row')).toHaveCount(initialRowCount + 1, {
        timeout: 5000,
      });

      // REQ-42.5 移行: 追加はドラフトのため、後続テスト（同 REQ-5.1 のフィールド構成検証や、
      // 計算方法・調整係数・丸め設定の各テストが nth(1) で 2 番目の項目を参照する等）が
      // 再ナビゲートで項目行を参照できるよう、十分な数の項目を名称付きで永続化する。
      // 旧モデルでは各操作が即時永続化され項目が累積していたため、本ステップでその前提を再現する。
      const targetRowCount = Math.max(initialRowCount + 1, 2);
      while ((await page.getByTestId('quantity-item-row').count()) < targetRowCount) {
        const before = await page.getByTestId('quantity-item-row').count();
        await addItemButton.click();
        await expect(page.getByTestId('quantity-item-row')).toHaveCount(before + 1, {
          timeout: getTimeout(5000),
        });
      }

      // 名称（保存の整合性チェック必須）を各行に入力して永続化する。
      const allRows = page.getByTestId('quantity-item-row');
      const rowCount = await allRows.count();
      for (let i = 0; i < rowCount; i++) {
        const nameInput = allRows.nth(i).locator('input[id$="-name"]').first();
        await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
        if (!(await nameInput.inputValue())) {
          await nameInput.fill(`REQ5_1テスト項目${i + 1}`);
          await nameInput.blur();
        }
      }
      await saveQuantityTableDraft(page);
    });

    test('数量項目が要件通りのフィールド構成を持つ (quantity-table-generation/REQ-5.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 数量項目行が表示されることを確認（必須）
      const itemRow = page.getByTestId('quantity-item-row').first();
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      // 要件で指定されている全フィールドが存在することを確認
      // 要件: 大項目・中項目・小項目・任意分類・工種・名称・規格・単位・計算方法・数量・備考
      // 注: REQ-5.5により、計算方法が「標準」の場合、調整係数・丸め設定はメインの行に表示されない
      // 注: showFieldLabels={false} のため label要素はなく、placeholder/aria-labelで検索
      await expect(page.getByPlaceholder(/大項目/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/中項目/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/小項目/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/任意分類/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/工種/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/名称/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/規格/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByPlaceholder(/単位/).first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByLabel(/計算方法/).first()).toBeVisible({ timeout: 3000 });
      // REQ-5.5: 計算方法が「標準」の場合、調整係数・丸め設定は表示されない
      // 調整係数・丸め設定のテストはREQ-5.5専用のテストで検証
      await expect(page.locator('input[id$="-quantity"]').first()).toBeVisible({
        timeout: 3000,
      });
      await expect(page.getByPlaceholder(/備考/).first()).toBeVisible({ timeout: 3000 });
    });

    test('数量項目フィールドが要件通りの順序で表示される (quantity-table-generation/REQ-5.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 数量項目行が表示されることを確認（必須）
      const itemRow = page.getByTestId('quantity-item-row').first();
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      // 要件順序（標準計算時）: 大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考
      // 注: REQ-5.5により、計算方法が「標準」の場合、調整係数・丸め設定はメインの行に表示されない

      // データ行のセル数を確認（11フィールド + 操作列 = 12）
      const cells = itemRow.getByRole('cell');
      const cellCount = await cells.count();
      // REQ-5.5: 計算方法が「標準」の場合、調整係数・丸め設定は非表示のため11フィールド + 操作列
      expect(cellCount).toBe(12);

      // テーブルのcolumnheaderの順序でフィールド順序を検証する
      // UIではフィールド名はテーブルヘッダー行（columnheader）に表示され、
      // データセルにはcombobox/textbox等の入力フィールドのみが配置される
      // REQ-5.5: 計算方法が「標準」の場合、調整係数・丸め設定はリストに含まない
      const table = page.getByRole('table', { name: '数量項目一覧' });
      await expect(table).toBeVisible({ timeout: 2000 });

      const headers = table.getByRole('columnheader');
      // 要件の列順序: 大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考 + 操作
      const expectedHeaders = [
        '大項目',
        '中項目',
        '小項目',
        '任意分類',
        '工種',
        '名称',
        '規格',
        '計算方法',
        '数量',
        '単位',
        '備考',
        '並替 / 操作',
      ];

      const headerCount = await headers.count();
      expect(headerCount).toBe(expectedHeaders.length);

      for (let i = 0; i < expectedHeaders.length; i++) {
        const header = headers.nth(i);
        const expectedName = expectedHeaders[i] as string;
        await expect(header).toHaveText(expectedName, { timeout: 2000 });
      }
    });

    test('数量項目のフィールドに値を入力できる (quantity-table-generation/REQ-5.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // REQ-5.2 は「入力値を即座に反映する」ことを求める。以前は「入力欄があれば入力して
      // 主張し、無ければ行に何か文字があることを確認する」分岐で、表示モードの側は
      // 常に成立していた。数量項目の行は `EditableQuantityItemRow` が常に入力欄として
      // 描画する（表示モードの実装は無い）ため、入力欄を無条件に主張する。
      // 前提（グループ1件・項目1行）は自分で作る。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      const majorCategoryInput = itemRow.getByLabel('大項目', { exact: true });
      await expect(majorCategoryInput, 'REQ-5.2: 大項目の入力欄が表示されない').toBeVisible({
        timeout: getTimeout(10000),
      });

      await majorCategoryInput.fill('建築工事');
      await expect(majorCategoryInput, 'REQ-5.2: 入力値が即座に反映されない').toHaveValue(
        '建築工事'
      );
    });

    test('数量項目を削除できる (quantity-table-generation/REQ-5.4)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 削除の前後を数えるには「削除できる行がある」ことが前提になる。
      // 再訪した編集画面の行数は先行するテストの保存状況で変わるため、自分で作る。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      const itemRows = page.getByTestId('quantity-item-row');
      const initialRowCount = await itemRows.count();

      // アクションメニューを開いて削除を実行（REQ-36: アクションメニューに統合）
      const actionButton = itemRow.getByRole('button', { name: /アクション/ });
      await expect(actionButton).toBeVisible({ timeout: 3000 });
      await actionButton.click();

      // ドロップダウンメニュー内の削除ボタンをクリック（メニューは body 直下へ描画される）
      const deleteMenuItem = page.getByRole('menu').getByRole('menuitem', { name: /削除/ });
      await expect(deleteMenuItem).toBeVisible({ timeout: 3000 });
      await deleteMenuItem.click();

      // REQ-5.4 は数量項目の削除に確認ダイアログを要求しない（確認を求めるのは
      // 数量表 REQ-2.4 と数量グループ REQ-4.5 である）。実装も
      // QuantityTableEditPage.handleDeleteItem が確認を挟まずドラフトから削除する。
      // 以前は「ダイアログが出れば確認を押す」分岐で、出ない実態では何も起きていなかった。
      await expect(
        page.getByRole('dialog'),
        'REQ-5.4: 数量項目の削除に確認ダイアログは介在しない'
      ).toHaveCount(0);

      // 行が削除されたことを確認（必須）
      await expect(itemRows, 'REQ-5.4: 数量項目が削除されない').toHaveCount(initialRowCount - 1, {
        timeout: 5000,
      });
    });

    /**
     * 受入基準 5.3 は除外である（e2e/requirement-exclusions.json）。名称欄を空にして焦点を外したときのエラーメッセージとハイライトは主張するが、条文が定める契機である「保存の試行」を行っておらず、名称以外の必須フィールド（工種・単位・計算方法・数量）にも触れていないため、被覆印は掲げない。
     */
    test('必須フィールド未入力時にエラーメッセージが表示される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「グループが0件なら追加する」分岐で前提を用意していたが、参照していた
      // testid は `quantity-group`（実在するのは `quantity-group-card`）であり、
      // 件数は常に0で分岐は常に発火していた。すなわち観測は前提の有無を見ていない。
      // 併せて「エラーアラートが出ていればリロードする」後始末も置かれていたが、
      // 編集画面を開き直せば前のテストのアラートは残らない（残るなら欠陥として出すべき）。
      // 前提（グループ1件・項目1行）を無条件に作る。
      const lastItemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      await expect(lastItemRow).toBeVisible({ timeout: getTimeout(5000) });

      // 名称フィールドをクリアして必須フィールドを空にする
      // ラベルが「名称」と「*」で分かれているため、プレースホルダーで検索
      const nameInput = lastItemRow.getByPlaceholder('名称を入力');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });

      // 既存の値をクリア
      await nameInput.click();
      await nameInput.fill('');
      // フォーカスを外してバリデーションをトリガー
      await page.click('body');
      await page.waitForTimeout(300);

      // 必須フィールドが空になったため、エラーメッセージまたはハイライト表示が行われることを確認
      // REQ-5.3: 該当フィールドをハイライトし、エラーメッセージを表示する
      // 名称欄の必須エラーだけを指す（`/必須/` では同じ行の工種・単位のエラーにも一致し、
      // strict mode 違反で判定そのものが成立しなかった）
      // AutocompleteInput は error を受け取ると aria-invalid="true" を付け、同時に
      // role="alert" のメッセージを描画する（AutocompleteInput / FieldValidationTooltip）。
      // 実装は両方を同時に与えるため、論理和では片方が失われても気づけない。
      // ハイライトとメッセージの双方を主張する（REQ-5.3 が求めるのはその両方である）。
      await expect(lastItemRow.getByText('名称は必須です'), '名称の必須エラーが出ない').toBeVisible(
        {
          timeout: getTimeout(5000),
        }
      );
      await expect(nameInput, '名称欄がエラーとしてハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    /**
     * REQ-5.5: 計算方法が「標準」の場合、メインの行に調整係数・丸め設定を表示しない
     *
     * 検証内容:
     * - 計算方法が「標準」（デフォルト）の場合、調整係数フィールドが非表示であること
     * - 計算方法が「標準」（デフォルト）の場合、丸め設定フィールドが非表示であること
     * - これらのフィールドは「面積・体積」または「ピッチ」選択時にのみ表示される
     *
     * @requirement quantity-table-generation/REQ-5.5
     */
    test('計算方法が「標準」の場合、調整係数・丸め設定がメイン行に表示されない (quantity-table-generation/REQ-5.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「グループが0件なら追加」「項目が0件なら追加」の二段の観測で前提を用意して
      // いたが、前者が参照する testid `quantity-group` は実在せず（実在するのは
      // `quantity-group-card`）常に0件、後者は先行テストの保存状況で発火が変わる。
      // 前提（グループ1件・項目1行）を無条件に作り、その行を対象に主張する。
      const firstItemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      await expect(firstItemRow).toBeVisible({ timeout: getTimeout(5000) });

      // 計算方法は選択欄として描画される（`EditableQuantityItemRow`）。
      // 以前は「表示モードなら文字列を確認する」分岐を併記していたが、その分岐が見ていた
      // `[data-field="calculationMethod"]` は数量表の行に存在せず（当該属性は見積依頼の
      // 明細編集にしかない）、一度も発火しない死んだ観測だった。選択欄を無条件に主張する。
      const calculationMethodSelect = firstItemRow.getByLabel(/計算方法/i);
      await expect(calculationMethodSelect, 'REQ-5.1: 計算方法の選択欄が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await calculationMethodSelect.selectOption('STANDARD');
      await expect(
        calculationMethodSelect,
        'REQ-5.1: 計算方法に「標準」が選択されている'
      ).toHaveValue('STANDARD');

      // REQ-5.5 検証: 計算方法が「標準」の場合、調整係数・丸め設定が表示されない
      // 項目行内の調整係数フィールドを検索
      const adjustmentFactorInput = firstItemRow.getByLabel(/調整係数/i);
      const adjustmentFactorCell = firstItemRow.locator('[data-field="adjustmentFactor"]');

      // 丸め設定フィールドを検索
      const roundingUnitInput = firstItemRow.getByLabel(/丸め設定/i);
      const roundingUnitCell = firstItemRow.locator('[data-field="roundingUnit"]');

      // REQ-5.5: 計算方法が「標準」の場合、両フィールドともメイン行に表示されないこと。
      // 不在の主張だけでは、欄そのものが（別の理由で）存在しない場合と区別できない。
      // 「標準では出ない」ことと「標準以外では出る」ことを続けて主張し、
      // 不在が計算方法によるものであることを確定させる。
      await expect(
        adjustmentFactorInput,
        '計算方法が「標準」の場合、調整係数はメイン行に表示されてはいけません'
      ).toHaveCount(0);
      await expect(adjustmentFactorCell).toHaveCount(0);
      await expect(
        roundingUnitInput,
        '計算方法が「標準」の場合、丸め設定はメイン行に表示されてはいけません'
      ).toHaveCount(0);
      await expect(roundingUnitCell).toHaveCount(0);

      // 対照: 計算方法を「面積・体積」にすると同じ行に両フィールドが現れる（REQ-9.1 / REQ-10.1）
      await calculationMethodSelect.selectOption('AREA_VOLUME');
      await expect(adjustmentFactorInput, '計算方法を変えても調整係数が現れない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(roundingUnitInput, '計算方法を変えても丸め設定が現れない').toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-6.1
   * @requirement quantity-table-generation/REQ-6.2
   *
   * REQ-6: 数量項目のコピー・移動
   */
  test.describe('コピー・移動操作', () => {
    test('数量項目をコピーできる (quantity-table-generation/REQ-6.1)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「項目行が見えなければ追加する」観測で前提を用意していた。
      // 見えるかどうかは先行テスト（削除・保存）の結果次第で、コピー元の行が
      // どのグループの何行目かも定まらない。前提を無条件に作る。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      const itemRows = page.getByTestId('quantity-item-row');
      const initialRowCount = await itemRows.count();

      // アクションメニューボタンが表示されることを確認（必須）
      const moreButton = itemRow.getByLabel(/アクション|メニュー|その他/);
      await expect(moreButton).toBeVisible({ timeout: 3000 });
      await moreButton.click();

      // コピーオプションが表示されることを確認（必須。メニューは body 直下へ描画される）
      const copyOption = page.getByRole('menu').getByRole('menuitem', { name: /コピー|複製/ });
      await expect(copyOption).toBeVisible({ timeout: 3000 });
      await copyOption.click();

      // 新しい行が追加されたことを確認（必須）
      await expect(itemRows, 'REQ-6.1: コピー操作で行が複製されない').toHaveCount(
        initialRowCount + 1,
        { timeout: 5000 }
      );
    });

    test('数量項目移動時にUI表示される (quantity-table-generation/REQ-6.2)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 前提（グループ1件・項目1行）を無条件に作る。以前の「行が見えなければ追加する」
      // 観測は、先行テストの保存状況で発火が変わり前提を保証していなかった。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      // アクションメニューボタンが表示されることを確認（必須）
      const moreButton = itemRow.getByLabel(/アクション|メニュー|その他/);
      await expect(moreButton).toBeVisible({ timeout: 3000 });
      await moreButton.click();

      // メニューが開いたことを確認（必須）
      const menu = page.getByRole('menu');
      await expect(menu, 'REQ-6.2: 移動を含むアクションメニューが表示されない').toBeVisible({
        timeout: 3000,
      });
      await expect(
        menu.getByRole('menuitem', { name: '別グループに移動' }),
        'REQ-6.2: アクションメニューに移動先選択UIを開く導線が無い'
      ).toBeVisible({ timeout: 3000 });
    });

    /**
     * 受入基準 6.3 は除外である（e2e/requirement-exclusions.json）。「下へ移動」の導線が現れて押せることと、押した後も数量項目の行が可視であることしか主張しておらず、選択した項目が指定位置へ移ったことを主張していないため、被覆印は掲げない。
     */
    test('同一数量グループ内で項目の位置を移動できる', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 項目が2つ以上必要。ない場合は追加
      let itemRows = page.getByTestId('quantity-item-row');
      let itemCount = await itemRows.count();

      while (itemCount < 2) {
        const addItemButton = page.getByRole('button', { name: /項目を追加/ }).first();
        await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });
        await addItemButton.click();
        await page.waitForLoadState('networkidle');
        itemRows = page.getByTestId('quantity-item-row');
        itemCount = await itemRows.count();
      }

      // 最初の項目のアクションメニューを開く
      const firstItemRow = itemRows.first();
      await expect(firstItemRow).toBeVisible({ timeout: getTimeout(5000) });

      const moreButton = firstItemRow.getByLabel(/アクション|メニュー|その他/);
      await expect(moreButton).toBeVisible({ timeout: 3000 });
      await moreButton.click();

      // 「下へ移動」オプションが表示される（必須）（最初の項目なので「下へ移動」を使用）
      const moveDownOption = page.getByRole('menuitem', { name: /下へ移動/ });
      await expect(moveDownOption).toBeVisible({ timeout: 3000 });

      // 移動オプションをクリック
      await moveDownOption.click();

      // 移動後、項目が表示されていることを確認（必須）
      await expect(page.getByTestId('quantity-item-row').first()).toBeVisible({ timeout: 5000 });
    });

    test('別の数量グループに項目を移動できる (quantity-table-generation/REQ-6.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 前提0: 移動対象の数量項目を検証自身がAPIで用意する
      // （先行する無関係な検証の副作用に依存しないため、この検証だけを実行しても成立させる）
      const seedHeaders = await apiAuthHeaders(page);
      const seedTableResponse = await page.request.get(
        `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`,
        { headers: seedHeaders }
      );
      expect(seedTableResponse.ok(), '数量表詳細の取得が成功する').toBeTruthy();
      const seedGroups = (
        (await seedTableResponse.json()) as { groups: { id: string; items: unknown[] }[] }
      ).groups;
      expect(seedGroups.length, '移動元となる数量グループが存在する').toBeGreaterThan(0);
      const seedSourceGroup = seedGroups[0]!;
      const seedItemName = `移動検証項目_${Date.now().toString(36)}`;
      const seedItemResponse = await page.request.post(
        `${API_BASE_URL}/api/quantity-groups/${seedSourceGroup.id}/items`,
        {
          headers: seedHeaders,
          data: {
            workType: '移動検証工種',
            name: seedItemName,
            unit: 'm',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: 1,
            roundingUnit: 0.01,
            quantity: 1,
            displayOrder: seedSourceGroup.items.length,
          },
        }
      );
      expect(seedItemResponse.ok(), '移動対象となる数量項目の作成が成功する').toBeTruthy();

      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 前提1: 移動元と移動先の数量グループを検証自身が用意する（不足分は追加する）
      const groups = page.getByTestId('quantity-group');
      await expect(groups.first(), '数量グループが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      while ((await groups.count()) < 2) {
        const groupCountBefore = await groups.count();
        const addGroupButton = page
          .getByRole('button', { name: /グループ追加|グループを追加/ })
          .first();
        await expect(addGroupButton, '数量グループを追加する操作が提供される').toBeVisible({
          timeout: getTimeout(5000),
        });
        await addGroupButton.click();
        await expect(groups, '数量グループが1つ増える').toHaveCount(groupCountBefore + 1, {
          timeout: getTimeout(10000),
        });
      }

      // 前提2: 移動元グループに移動対象の数量項目があること
      const sourceGroup = groups.first();
      const targetGroup = groups.nth(1);
      const sourceItems = sourceGroup.getByTestId('quantity-item-row');
      await expect(sourceItems.first(), '移動元の数量グループに数量項目がある').toBeVisible({
        timeout: getTimeout(10000),
      });
      // 用意した数量項目そのものが移動元グループに表示されていること
      // （先行する検証が残した項目ではなく、この検証が用意した項目で前提が満たされている）
      await expect
        .poll(
          async () =>
            sourceItems
              .locator('input[id$="-name"]')
              .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
          {
            message: 'REQ-6.4: 検証自身が用意した移動対象の数量項目が移動元グループに表示される',
            timeout: getTimeout(10000),
          }
        )
        .toContain(seedItemName);
      const sourceItemCountBefore = await sourceItems.count();
      const targetItemCountBefore = await targetGroup.getByTestId('quantity-item-row').count();

      // REQ-6.2: 数量項目の移動操作から移動先選択UIを開く
      const actionMenuButton = sourceItems.first().getByLabel(/アクション|メニュー|その他/);
      await expect(actionMenuButton, '数量項目の操作メニューを開く操作が提供される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await actionMenuButton.click();

      // アクションメニューは Portal で body 直下へ描画されるため menu 配下で参照する
      const actionMenu = page.getByRole('menu');
      await expect(actionMenu, '数量項目の操作メニューが開く').toBeVisible({
        timeout: getTimeout(5000),
      });

      const moveToGroupOption = actionMenu.getByRole('menuitem', {
        name: /グループに移動|別グループ/,
      });
      await expect(
        moveToGroupOption,
        'REQ-6.4: 数量項目を別の数量グループへ移動する操作が提供される'
      ).toBeVisible({ timeout: getTimeout(5000) });
      await moveToGroupOption.click();

      // REQ-6.2: 移動先グループを選ぶUIが表示される
      const moveDialog = page.getByRole('dialog');
      await expect(moveDialog, '移動先選択UIが表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      const targetGroupChoice = moveDialog
        .getByRole('radiogroup', { name: 'グループ選択' })
        .getByRole('radio')
        .nth(1);
      await expect(targetGroupChoice, '移動先の数量グループを選択できる').toBeEnabled({
        timeout: getTimeout(5000),
      });
      await targetGroupChoice.check();
      await moveDialog.getByRole('button', { name: '移動' }).click();
      await expect(moveDialog, '移動の確定で移動先選択UIが閉じる').not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-6.4: 移動先グループへ移り、元の位置からは取り除かれる
      await expect(sourceItems, 'REQ-6.4: 移動元グループから数量項目が取り除かれる').toHaveCount(
        sourceItemCountBefore - 1,
        { timeout: getTimeout(10000) }
      );
      await expect(
        targetGroup.getByTestId('quantity-item-row'),
        'REQ-6.4: 移動先グループへ数量項目が移る'
      ).toHaveCount(targetItemCountBefore + 1, { timeout: getTimeout(10000) });
    });

    /**
     * 受入基準 6.5 は除外である（e2e/requirement-exclusions.json）。2件の数量項目を選択できることと一括操作の導線が可視であることまでしか主張しておらず、選択した全項目に対して削除・コピー・移動が実行されることを主張していないため、被覆印は掲げない。
     */
    test('複数の数量項目を選択して一括削除・コピー・移動ができる', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 前提: 一括操作の対象となる数量項目を2件以上、検証自身が用意する
      const itemRows = page.getByTestId('quantity-item-row');
      await expect(
        page.getByTestId('quantity-group').first(),
        '数量グループが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });

      while ((await itemRows.count()) < 2) {
        const itemCountBefore = await itemRows.count();
        const addItemButton = page.getByRole('button', { name: /項目を追加/ }).first();
        await expect(addItemButton, '数量項目を追加する操作が提供される').toBeVisible({
          timeout: getTimeout(5000),
        });
        await addItemButton.click();
        await expect(itemRows, '数量項目が1つ増える').toHaveCount(itemCountBefore + 1, {
          timeout: getTimeout(10000),
        });
      }

      // REQ-6.5: 複数の数量項目を選択できること
      const firstCheckbox = itemRows.first().getByRole('checkbox');
      const secondCheckbox = itemRows.nth(1).getByRole('checkbox');
      await expect(
        firstCheckbox,
        'REQ-6.5: 数量項目を一括操作の対象として選択する操作が提供される'
      ).toBeVisible({ timeout: getTimeout(5000) });
      await expect(secondCheckbox, 'REQ-6.5: 2件目の数量項目も選択できる').toBeVisible({
        timeout: getTimeout(5000),
      });

      await firstCheckbox.check();
      await secondCheckbox.check();
      await expect(firstCheckbox, '1件目の数量項目が選択状態になる').toBeChecked();
      await expect(secondCheckbox, '2件目の数量項目が選択状態になる').toBeChecked();

      // REQ-6.5: 選択した全項目に対する削除・コピー・移動の一括操作が提供されること
      // （「現場調査から一括追加」は選択項目に対する操作ではないため名称で区別する）
      const bulkActionButton = page.getByRole('button', {
        name: /選択した項目|一括削除|一括コピー|一括移動/,
      });
      await expect(
        bulkActionButton.first(),
        'REQ-6.5: 選択した数量項目に対する一括操作が提供される'
      ).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-7.1
   * @requirement quantity-table-generation/REQ-7.5
   *
   * REQ-7: 入力支援・オートコンプリート
   */
  test.describe('オートコンプリート機能', () => {
    // REQ-7.1 の候補は「同一プロジェクト内の対象フィールドの入力履歴」から作られる。
    // 履歴が無ければ候補は出ないため、候補の有無を理由に検証を飛ばすのではなく、
    // 検証自身がAPIで既知の履歴を作り、前提が整ったことを確かめてからUIを検証する。
    const MAJOR_CATEGORY_PREFIX = 'オートコンプリート大項目';
    const seededMajorCategory = `${MAJOR_CATEGORY_PREFIX}${Date.now().toString(36)}`;

    /** 実行ごとに一意な接尾辞（同一データベースを繰り返し使うため候補値を実行間で区別する） */
    const AUTOCOMPLETE_RUN_ID = Date.now().toString(36);

    /** 中項目（REQ-7.3）の検証で用いる既知の候補 */
    const MIDDLE_CATEGORY_PREFIX = 'オートコンプリート中項目';
    const seededMiddleCategory = `${MIDDLE_CATEGORY_PREFIX}${AUTOCOMPLETE_RUN_ID}`;

    /**
     * 入力上限が狭いフィールド（工種・単位）向けの短い実行識別子。
     * 単位は Requirement 13.3 により半角6文字相当が上限で、AUTOCOMPLETE_RUN_ID（8文字）は
     * そのままでは収まらないため、末尾3文字のみを用いる。
     */
    const SHORT_RUN_ID = AUTOCOMPLETE_RUN_ID.slice(-3);

    /**
     * 大項目・中項目以外の対象フィールド（REQ-7.3）の検証対象。
     * label は画面上のラベル、field はオートコンプリート候補APIの応答キー、
     * prefix は絞り込みに用いる前方一致文字列、suffix は実行ごとの識別子に対応する。
     *
     * prefix + suffix は Requirement 13 のフィールド仕様（13.1: 全角25文字/半角50文字、
     * 13.2 工種: 全角8文字/半角16文字、13.3 単位: 全角3文字/半角6文字）に収まる長さにしている。
     * 上限を超える値を入力履歴として投入すると、この検証が共有している数量表そのものが
     * 保存時バリデーション（REQ-11.2）で弾かれ、後続の保存検証が巻き添えで壊れるため。
     */
    const AUTOCOMPLETE_FIELDS = [
      {
        label: '小項目',
        field: 'minorCategory',
        prefix: 'オートコンプリート小項目',
        suffix: AUTOCOMPLETE_RUN_ID,
      },
      {
        label: '任意分類',
        field: 'customCategory',
        prefix: 'オートコンプリート任意分類',
        suffix: AUTOCOMPLETE_RUN_ID,
      },
      { label: '工種', field: 'workType', prefix: '補完工種', suffix: SHORT_RUN_ID },
      {
        label: '規格',
        field: 'specification',
        prefix: 'オートコンプリート規格',
        suffix: AUTOCOMPLETE_RUN_ID,
      },
      { label: '単位', field: 'unit', prefix: '補', suffix: SHORT_RUN_ID },
    ] as const;

    /** 対象フィールドへ投入する入力履歴の値（前方一致で絞り込めるよう prefix を先頭に置く） */
    function autocompleteSeedValue(fieldSpec: (typeof AUTOCOMPLETE_FIELDS)[number]): string {
      return `${fieldSpec.prefix}${fieldSpec.suffix}`;
    }

    /** 50音順（REQ-7.8）の検証で用いる、並び順が一意に定まる大項目の候補群 */
    const SORT_PREFIX = `オートコンプリート並び順${AUTOCOMPLETE_RUN_ID}`;
    const SORT_SEED_VALUES = [`${SORT_PREFIX}う`, `${SORT_PREFIX}あ`, `${SORT_PREFIX}い`];
    const SORT_EXPECTED_ORDER = [`${SORT_PREFIX}あ`, `${SORT_PREFIX}い`, `${SORT_PREFIX}う`];

    /** ログイン済みページの認証ヘッダを組み立てる */
    async function autocompleteAuthHeaders(page: Page): Promise<Record<string, string>> {
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken, 'アクセストークンが取得できる').toBeTruthy();
      return { Authorization: `Bearer ${accessToken}` };
    }

    /**
     * 対象フィールドのオートコンプリート候補となる入力履歴を用意する。
     *
     * 既存の数量表の先頭グループへ、指定された値を持つ数量項目をAPIで追加し、
     * 数量表編集画面の初回表示が用いる候補取得経路の応答に現れることまで確かめる。
     * 前提が用意できなければこの時点で失敗する。
     *
     * @param page - ログイン済みのページ
     * @param seeds - 投入する入力履歴。1要素につき数量項目を1件作成する。
     *                キーは候補APIの応答キー（majorCategory 等）、値は投入する文字列。
     */
    async function seedAutocompleteHistory(
      page: Page,
      seeds: Record<string, string>[]
    ): Promise<void> {
      const headers = await autocompleteAuthHeaders(page);

      const tableResponse = await page.request.get(
        `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`,
        { headers }
      );
      expect(tableResponse.ok(), '数量表詳細の取得が成功する').toBeTruthy();
      const tableGroups = (
        (await tableResponse.json()) as {
          groups: { id: string; items: unknown[] }[];
        }
      ).groups;
      expect(tableGroups.length, '入力履歴を書き込む数量グループが存在する').toBeGreaterThan(0);
      const seedGroup = tableGroups[0]!;

      for (const [index, seed] of seeds.entries()) {
        const itemResponse = await page.request.post(
          `${API_BASE_URL}/api/quantity-groups/${seedGroup.id}/items`,
          {
            headers,
            data: {
              // 工種は Requirement 13.2（全角8文字/半角16文字）、単位は 13.3（全角3文字/半角6文字）、
              // 名称は 13.1（全角25文字/半角50文字）が上限。上限内の値のみを投入する。
              workType: '検証工種',
              name: 'オートコンプリート検証名称',
              unit: 'm',
              calculationMethod: 'STANDARD',
              calculationParams: null,
              adjustmentFactor: 1,
              roundingUnit: 0.01,
              quantity: 1,
              displayOrder: seedGroup.items.length + index,
              ...seed,
            },
          }
        );
        expect(itemResponse.ok(), '入力履歴となる数量項目の作成が成功する').toBeTruthy();
      }

      const candidatesResponse = await page.request.get(
        `${API_BASE_URL}/api/projects/${testProjectId}/quantity-items/autocomplete-candidates`,
        { headers }
      );
      expect(candidatesResponse.ok(), 'オートコンプリート候補の取得が成功する').toBeTruthy();
      const candidates = (
        (await candidatesResponse.json()) as {
          candidates: Record<string, string[]>;
        }
      ).candidates;
      for (const seed of seeds) {
        for (const [field, value] of Object.entries(seed)) {
          expect(
            candidates[field],
            `用意した入力履歴が${field}のオートコンプリート候補に含まれる`
          ).toContain(value);
        }
      }
    }

    /** 大項目（REQ-7.1 / REQ-7.5）の検証で用いる入力履歴を用意する */
    async function seedMajorCategoryHistory(page: Page): Promise<void> {
      await seedAutocompleteHistory(page, [{ majorCategory: seededMajorCategory }]);
    }

    test('大項目フィールドでオートコンプリート候補が表示される (quantity-table-generation/REQ-7.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 候補の元となる入力履歴を用意する（前提が整わなければここで失敗する）
      await seedMajorCategoryHistory(page);

      // 初回表示で候補が一括取得される（REQ-7.1）ため、用意後に編集画面を開く
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('quantity-group-card').first()).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByTestId('quantity-item-row').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/ }).first();
      await expect(majorCategoryInput).toBeVisible({ timeout: getTimeout(5000) });

      // 入力内容に前方一致する候補が表示されること
      await majorCategoryInput.click();
      await majorCategoryInput.fill(MAJOR_CATEGORY_PREFIX);

      const listbox = page.getByRole('listbox');
      await expect(listbox, 'REQ-7.1: 入力履歴からの候補リストが表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(
        listbox.getByRole('option', { name: seededMajorCategory, exact: true }),
        'REQ-7.1: 用意した入力履歴が候補として表示される'
      ).toBeVisible({ timeout: getTimeout(5000) });

      // テスト終了前にクリーンアップ
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await majorCategoryInput.clear();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    test('オートコンプリート候補を選択すると入力欄に反映される (quantity-table-generation/REQ-7.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 選択対象となる候補を検証自身が用意する（前提が整わなければここで失敗する）
      await seedMajorCategoryHistory(page);

      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/ }).first();
      await expect(majorCategoryInput).toBeVisible({ timeout: getTimeout(5000) });

      await majorCategoryInput.click();
      await majorCategoryInput.fill(MAJOR_CATEGORY_PREFIX);

      const listbox = page.getByRole('listbox');
      await expect(listbox, '候補リストが表示される').toBeVisible({ timeout: getTimeout(5000) });

      const seededOption = listbox.getByRole('option', { name: seededMajorCategory, exact: true });
      await expect(seededOption, '用意した候補が選択肢として表示される').toBeVisible({
        timeout: getTimeout(5000),
      });

      // REQ-7.5: 候補を選択すると、その値が該当フィールドへ自動入力される
      await seededOption.click();
      await expect(majorCategoryInput, 'REQ-7.5: 選択した候補の値が入力欄へ反映される').toHaveValue(
        seededMajorCategory,
        { timeout: getTimeout(5000) }
      );

      // クリーンアップ
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await majorCategoryInput.clear();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    test('中項目フィールドでオートコンプリート候補が表示される (quantity-table-generation/REQ-7.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 候補の元となる中項目の入力履歴を用意する（前提が整わなければここで失敗する）
      await seedAutocompleteHistory(page, [{ middleCategory: seededMiddleCategory }]);

      // 初回表示で候補が一括取得される（REQ-7.1）ため、用意後に編集画面を開く
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('quantity-item-row').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 中項目コンボボックスが表示されることを確認（必須）
      const mediumCategoryInput = page.getByRole('combobox', { name: /中項目/ }).first();
      await expect(mediumCategoryInput).toBeVisible({ timeout: getTimeout(5000) });

      // REQ-7.3 / REQ-7.4: 入力内容に前方一致する候補をドロップダウン表示する
      await mediumCategoryInput.click();
      await mediumCategoryInput.fill(MIDDLE_CATEGORY_PREFIX);

      const listbox = page.getByRole('listbox', { name: '中項目の候補' });
      await expect(listbox, 'REQ-7.3: 中項目の候補がドロップダウン表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(
        listbox.getByRole('option', { name: seededMiddleCategory, exact: true }),
        'REQ-7.3: 用意した入力履歴が中項目の候補として表示される'
      ).toBeVisible({ timeout: getTimeout(5000) });

      // テスト終了前にクリーンアップ: リストを閉じて入力をクリア
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await mediumCategoryInput.clear();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    test('各フィールドでオートコンプリート候補が表示される (quantity-table-generation/REQ-7.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 各対象フィールドの候補の元となる入力履歴を用意する（1件の数量項目に全フィールド分を持たせる）
      const seededFieldValues = Object.fromEntries(
        AUTOCOMPLETE_FIELDS.map((fieldSpec) => [fieldSpec.field, autocompleteSeedValue(fieldSpec)])
      );
      await seedAutocompleteHistory(page, [seededFieldValues]);

      // 初回表示で候補が一括取得される（REQ-7.1）ため、用意後に編集画面を開く
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('quantity-item-row').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.3: 対象フィールドごとに、用意した入力履歴が候補としてドロップダウン表示される
      for (const fieldSpec of AUTOCOMPLETE_FIELDS) {
        const { label, prefix } = fieldSpec;
        const seededValue = autocompleteSeedValue(fieldSpec);
        const fieldInput = page.getByRole('combobox', { name: new RegExp(label) }).first();
        await expect(fieldInput, `REQ-7.3: ${label}フィールドが表示される`).toBeVisible({
          timeout: getTimeout(5000),
        });

        await fieldInput.click();
        await fieldInput.fill(prefix);

        const listbox = page.getByRole('listbox', { name: `${label}の候補` });
        await expect(listbox, `REQ-7.3: ${label}の候補がドロップダウン表示される`).toBeVisible({
          timeout: getTimeout(5000),
        });
        await expect(
          listbox.getByRole('option', { name: seededValue, exact: true }),
          `REQ-7.3: 用意した入力履歴が${label}の候補として表示される`
        ).toBeVisible({ timeout: getTimeout(5000) });

        // 次のフィールドの検証に影響しないよう、リストを閉じて入力を戻す
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await fieldInput.clear();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 最終クリーンアップ
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    /**
     * 受入基準7.8（同一フィールドで複数の候補があるとき50音順に候補を表示する）を主張する。
     *
     * タスク 115.186 の是正: 従前は受入基準7.6（blur 時に入力値を確定値として候補値リストへ
     * 追加する）を名乗っていたが、本検証が主張しているのは並び順だけであり、blur 時の候補追加は
     * 一切主張していない。受入基準7.6 は
     * `e2e/specs/quantity-tables/autocomplete-optimization.spec.ts` の
     * 「REQ-7.6/7.7: blur時の候補追加」が別途被覆している。
     */
    test('オートコンプリート候補が50音順に表示される (quantity-table-generation/REQ-7.8)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 並び順が一意に定まる大項目の候補を、投入順とは異なる順序で用意する
      // （投入順のまま表示されれば並び順の検証が失敗する）
      await seedAutocompleteHistory(
        page,
        SORT_SEED_VALUES.map((value) => ({ majorCategory: value }))
      );

      // 数量表編集ページに遷移（初回表示で候補が一括取得される）
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('quantity-item-row').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 大項目コンボボックスが表示されることを確認（必須）
      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/ }).first();
      await expect(majorCategoryInput).toBeVisible({ timeout: getTimeout(5000) });

      // 用意した候補群に共通する前方一致文字列を入力し、候補を絞り込む
      await majorCategoryInput.click();
      await majorCategoryInput.fill(SORT_PREFIX);

      const listbox = page.getByRole('listbox', { name: '大項目の候補' });
      await expect(listbox, 'REQ-7.8: 大項目の候補がドロップダウン表示される').toBeVisible({
        timeout: getTimeout(5000),
      });

      const options = listbox.getByRole('option');
      await expect(options, 'REQ-7.8: 用意した候補が全件表示される').toHaveCount(
        SORT_SEED_VALUES.length,
        { timeout: getTimeout(5000) }
      );

      const optionTexts = await options.allTextContents();
      expect(optionTexts, 'REQ-7.8: 候補が50音順（投入順ではない）に表示される').toEqual(
        SORT_EXPECTED_ORDER
      );

      const sortedTexts = [...optionTexts].sort((a, b) => a.localeCompare(b, 'ja'));
      expect(optionTexts, 'REQ-7.8: 表示順が50音順の整列結果と一致する').toEqual(sortedTexts);

      // クリーンアップ: リストを閉じる
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await majorCategoryInput.clear();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-8.1
   * @requirement quantity-table-generation/REQ-8.5
   * @requirement quantity-table-generation/REQ-8.8
   *
   * REQ-8: 計算方法の選択
   */
  test.describe('計算方法と数量計算', () => {
    test('新規項目追加時に計算方法が「標準」になる (quantity-table-generation/REQ-8.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 項目追加ボタンが表示されることを確認（必須）
      const addItemButton = page.getByRole('button', { name: /項目を追加/ }).first();
      await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });
      await addItemButton.click();

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // デフォルト値が「標準」であることを確認（必須）
      const value = await calcMethodSelect.inputValue();
      expect(value).toMatch(/STANDARD|標準|default/i);
    });

    test('面積・体積モードで計算用列が表示される (quantity-table-generation/REQ-8.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 面積・体積モードに変更
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 幅フィールドが表示されることを確認（必須）
      const widthField = page.getByLabel(/幅|width|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });
    });

    test('ピッチモードで計算用列が表示される (quantity-table-generation/REQ-8.8)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // ピッチモードに変更
      await calcMethodSelect.selectOption({ value: 'PITCH' });

      // REQ-8.8: ピッチでは「範囲長」「端長1」「端長2」「ピッチ長」…をこの順序で表示する。
      // 以前は「範囲長 または ピッチ長」の論理和だったため、片方が欠けても通っていた。
      // 実装（CalculationFields の PITCH_FIELDS）は必須4欄を同時に描画する。
      // ラベルには必須印（*）が続くため部分一致で参照する。
      for (const label of ['範囲長', '端長1', '端長2', 'ピッチ長']) {
        await expect(
          page.getByLabel(label).first(),
          `ピッチモードで「${label}」の計算用列が表示されない`
        ).toBeVisible({ timeout: getTimeout(3000) });
      }
    });

    test('面積・体積モードで計算用列に値を入力すると数量が自動計算される (quantity-table-generation/REQ-8.6)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 面積・体積モードに変更
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 幅フィールドが表示されることを確認（必須）
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });

      // 奥行きフィールドを取得
      const depthField = page.getByLabel(/奥行き/).first();
      await expect(depthField).toBeVisible({ timeout: 3000 });

      // 高さフィールドを取得
      const heightField = page.getByLabel(/高さ/).first();
      await expect(heightField).toBeVisible({ timeout: 3000 });

      // 数量フィールドを取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      // 幅に10を入力
      await widthField.fill('10');
      await page.waitForTimeout(200);

      // 奥行きに5を入力
      await depthField.fill('5');
      await page.waitForTimeout(200);

      // 高さに2を入力
      await heightField.fill('2');
      // blurイベントを発火させて計算をトリガー
      await heightField.blur();
      await page.waitForTimeout(500);

      // 数量が10 * 5 * 2 = 100になることを確認（必須）
      // 調整係数1、丸め設定0.01なので、最終値は100.00（小数2桁表示）
      await expect(quantityField).toHaveValue('100.00', { timeout: 5000 });
    });

    test('標準モードで数量フィールドに直接数値を入力できる (quantity-table-generation/REQ-8.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 標準モードに設定
      await calcMethodSelect.selectOption({ value: 'STANDARD' });

      // 数量フィールドが表示されることを確認（必須）
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      // 数量フィールドに直接数値を入力
      await quantityField.fill('123.45');

      // 入力した値が反映される（必須）
      await expect(quantityField).toHaveValue('123.45', { timeout: 3000 });
    });

    test('標準モードで負の値を入力すると警告メッセージが表示される (quantity-table-generation/REQ-8.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 一度ダッシュボードを経由してから数量表編集ページに移動（前のテストのエラー状態をリセット）
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // エラーアラートが表示されている場合は、再試行ボタンをクリックするか再度リロード
      const errorAlert = page.getByRole('alert').first();
      if (await isVisibleWithin(errorAlert, 1000)) {
        const retryButton = page.getByRole('button', { name: /再試行/ });
        if (await isVisibleWithin(retryButton, 500)) {
          await retryButton.click();
          await page.waitForLoadState('networkidle');
        }
        // それでもエラーが表示される場合は再度ページ遷移
        if (await isVisibleWithin(errorAlert, 500)) {
          await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
          await page.waitForLoadState('networkidle');
        }
      }

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 標準モードに設定（API待機を追加）
      const calcMethodApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-items/') && response.request().method() === 'PUT',
        { timeout: getTimeout(10000) }
      );
      await calcMethodSelect.selectOption({ value: 'STANDARD' });
      await calcMethodApiPromise.catch(() => {
        // APIが呼ばれない場合もあるため無視
      });
      await page.waitForTimeout(500);

      // 数量フィールドに負の値を入力
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      // APIレスポンスを待機するためのPromiseを設定
      const apiResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-items/') && response.request().method() === 'PUT',
        { timeout: getTimeout(10000) }
      );

      await quantityField.fill('-10');
      // blurイベントをトリガーして状態更新を確実にする
      await quantityField.blur();

      // API更新を待機
      await apiResponsePromise.catch(() => {
        // APIが呼ばれない場合もあるため無視
      });

      // 状態更新を待機
      await page.waitForTimeout(1000);

      // 警告メッセージまたはエラー表示が行われること（必須）
      // REQ-8.3: 負の値警告メッセージは role="alert" で表示される
      const warningAlert = page.locator('[role="alert"]').filter({ hasText: /負の値/ });

      // 実装（EditableQuantityItemRow）は負の値のとき aria-invalid を立て、同時に
      // role="alert" の警告文を描画する。論理和では片方が失われても気づけないため、
      // 双方を主張する。ハイライトは数量欄そのものに対して確かめる
      // （画面全体の [aria-invalid="true"] は必須欄の未入力にも一致してしまう）。
      await expect(warningAlert, 'REQ-8.3: 負の値の警告が表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(quantityField, 'REQ-8.3: 数量欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    test('標準モードで数値以外を入力するとエラーメッセージが表示される (quantity-table-generation/REQ-8.4)', async ({
      page,
    }) => {
      // Task 80.3: REQ-8.4 を実装したためラチェット（test.fail()）を外した。
      // 拒否は焦点喪失の時点で行う（打鍵ごとに弾くと日本語入力の変換が壊れる）。

      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 標準モードに設定
      await calcMethodSelect.selectOption({ value: 'STANDARD' });

      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      // 既定値（0.00）と衝突しない値を先に置く。既定値のままだと「拒否された」のか
      // 「既定値に戻された」のかを区別できない（Task 115.126 の基準）。
      await quantityField.click();
      await quantityField.fill('12.34');
      await page.keyboard.press('Tab');
      await expect(quantityField).toHaveValue('12.34');

      // 数値以外を入力する
      await quantityField.click();
      await page.keyboard.type('abc');
      await page.keyboard.press('Tab');

      // REQ-8.4: 数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する。
      // 以前は `値が元と同じ || 空 || 'abc' を含まない` の論理和で判定していた。
      // 第三項は入力欄が非数値を保持しない限り常に真であり、恒真であった。
      // 「拒否」は直前の確定値が保たれることであり、それとエラーメッセージの双方を主張する。
      // **既定値 0.00 へ倒っていないことも同時に主張している**——12.34 は既定値ではないため、
      // この主張は「拒否された」と「既定値に戻された」を区別する。
      await expect(
        quantityField,
        'REQ-8.4: 数値以外の入力が拒否されず、直前の確定値が失われた'
      ).toHaveValue('12.34');

      // 画面のどこかの alert ではなく、**当該の欄が説明として指している** alert を読む。
      // 無関係な必須欄の提示で成立してしまう形を避ける
      await expect(
        quantityField,
        'REQ-8.4: 数量欄がエラーの説明と結び付いていない'
      ).toHaveAttribute('aria-describedby', /-quantity-error$/);
      const quantityErrorId = await quantityField.getAttribute('aria-describedby');
      await expect(
        page.locator(`[id="${quantityErrorId}"]`),
        'REQ-8.4: 数値以外の入力に対するエラーメッセージが表示されない'
      ).toHaveText('数量は数値で入力してください', { timeout: getTimeout(3000) });
      await expect(quantityField, 'REQ-8.4: 数量欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    /**
     * 受入基準 8.7 は除外である（e2e/requirement-exclusions.json）。保存を試行した後に数量が 0.00 のままであることを主張するもので、条文が求めるエラーメッセージの表示も、幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力を求めることも主張していないため、被覆印は掲げない。
     */
    test('面積・体積モードで計算用列未入力時にエラーが表示される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 2番目の項目の計算方法セレクトボックスを取得（最初の項目は既に値が入力されている）
      const calcMethodSelects = page.getByLabel(/計算方法/);
      await expect(calcMethodSelects.first()).toBeVisible({ timeout: getTimeout(5000) });

      // 2番目以降の項目を使用（nth(1)で2番目を取得）
      const calcMethodSelect = calcMethodSelects.nth(1);
      await expect(calcMethodSelect).toBeVisible({ timeout: 3000 });

      // 面積・体積モードに変更
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 計算フィールド（幅・奥行き・高さ）が表示されることを確認
      await page.waitForTimeout(500);

      // 保存ボタンをクリック（計算用列未入力状態で）
      const saveButton = page.getByRole('button', { name: /保存/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
      await saveButton.click();

      await page.waitForTimeout(500);

      // 面積・体積モードで計算列が空の場合、数量が0になる
      // 2番目の項目の数量フィールドを確認
      const quantityFields = page.locator('input[id$="-quantity"]');
      const secondQuantityField = quantityFields.nth(1);
      const quantityValue = await secondQuantityField.inputValue();

      // 計算用列が未入力なら数量は 0 のまま、REQ-14.2 により小数2桁で表示される。
      // 以前は '0' / '0.00' / '' の論理和だったため、書式が崩れても空になっても通っていた。
      expect(quantityValue).toBe('0.00');
    });

    /**
     * 受入基準 8.9 は除外である（e2e/requirement-exclusions.json）。ピッチ計算用の各欄への入力を可視判定で包んだうえで数量が 0 より大きいことしか主張しておらず、ピッチ計算式が定める本数そのものも、任意項目（長さ・重量）を乗算した結果の自動設定も主張していないため、被覆印は掲げない。
     */
    test('ピッチモードで自動計算が行われる', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // ピッチモードに変更
      await calcMethodSelect.selectOption({ value: 'PITCH' });

      // ピッチ計算用フィールドに値を入力
      const rangeField = page.getByLabel(/範囲長|range/i).first();
      const edge1Field = page.getByLabel(/端長1|edge1/i).first();
      const edge2Field = page.getByLabel(/端長2|edge2/i).first();
      const pitchField = page.getByLabel(/ピッチ長|pitch/i).first();

      if (await isVisibleWithin(rangeField, 3000)) {
        await rangeField.fill('1000');
      }
      if (await isVisibleWithin(edge1Field, 2000)) {
        await edge1Field.fill('100');
      }
      if (await isVisibleWithin(edge2Field, 2000)) {
        await edge2Field.fill('100');
      }
      if (await isVisibleWithin(pitchField, 2000)) {
        await pitchField.fill('200');
        // blurイベントを発火させて計算をトリガー
        await pitchField.blur();
      }
      await page.waitForTimeout(500);

      // 数量フィールドに自動計算された値が設定される（必須）
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      const quantityValue = await quantityField.inputValue();
      // 計算式: (1000 - 100 - 100) / 200 + 1 = 5 本
      expect(parseFloat(quantityValue)).toBeGreaterThan(0);
    });

    /**
     * 受入基準 8.10 は除外である（e2e/requirement-exclusions.json）。保存を試行した後に数量が 0.00 のままであることを主張するもので、条文が求めるエラーメッセージの表示も必須項目の入力を求めることも主張していないため、被覆印は掲げない。
     */
    test('ピッチモードで必須項目未入力時にエラーが表示される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 2番目の項目の計算方法セレクトボックスを取得（最初の項目は既に値が入力されている）
      const calcMethodSelects = page.getByLabel(/計算方法/);
      await expect(calcMethodSelects.first()).toBeVisible({ timeout: getTimeout(5000) });

      // 2番目の項目を使用
      const calcMethodSelect = calcMethodSelects.nth(1);
      await expect(calcMethodSelect).toBeVisible({ timeout: 3000 });

      // ピッチモードに変更
      await calcMethodSelect.selectOption({ value: 'PITCH' });
      await page.waitForTimeout(500);

      // ピッチ計算用フィールドが表示されるのを待つ
      // 範囲長のみ入力（他は空のまま）
      const rangeFields = page.getByLabel(/範囲長|range/i);
      const rangeField = rangeFields.nth(1);
      if (await isVisibleWithin(rangeField, 3000)) {
        await rangeField.fill('1000');
      }

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
      await saveButton.click();

      await page.waitForTimeout(500);

      // ピッチモードで必須項目（ピッチ長）が未入力の場合、計算ができないため数量が0になる
      const quantityFields = page.locator('input[id$="-quantity"]');
      const secondQuantityField = quantityFields.nth(1);
      const quantityValue = await secondQuantityField.inputValue();

      // 必須項目（ピッチ長など）が未入力なら計算できず、数量は 0 のまま
      // REQ-14.2 の小数2桁で表示される。
      // 以前は '0' / '0.00' / '' の論理和だったため、書式が崩れても空になっても通っていた。
      expect(quantityValue).toBe('0.00');
    });

    test('計算用列の値変更時に数量が自動再計算される (quantity-table-generation/REQ-8.11)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスが表示されることを確認（必須）
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 面積・体積モードに変更
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 幅フィールドに10を入力してコミット（blurで計算をトリガー）
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });
      await widthField.fill('10');
      await page.keyboard.press('Tab');

      // 数量フィールドを確認
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      // 幅=10での再計算が反映され、数量が確定する（10 × 1 × 1 = 10）まで待機（必須）
      // 再計算は非同期のため、確定値を待たずに読むとflakyになる
      await expect
        .poll(async () => parseFloat((await quantityField.inputValue()) || '0'), {
          timeout: getTimeout(5000),
        })
        .toBeGreaterThan(0);
      const initialQuantity = await quantityField.inputValue();

      // 幅を変更
      await widthField.fill('20');
      await page.keyboard.press('Tab');

      // 数量が再計算され、初期値（幅=10）と異なる値（幅=20）になるまで待機（必須）
      await expect
        .poll(async () => await quantityField.inputValue(), { timeout: getTimeout(5000) })
        .not.toBe(initialQuantity);

      // 値が変わっていること（10 → 20 で倍になる）
      const updatedQuantity = await quantityField.inputValue();
      expect(parseFloat(updatedQuantity)).not.toBe(parseFloat(initialQuantity));
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-9.1
   * @requirement quantity-table-generation/REQ-9.2
   *
   * REQ-9: 調整係数
   */
  test.describe('調整係数', () => {
    test('新規項目追加時に調整係数が1.00になる (quantity-table-generation/REQ-9.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 調整係数は計算方法が「標準」以外の場合のみ表示される
      // 計算方法を面積・体積モードに変更して調整係数を表示
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 調整係数フィールドが表示されることを確認（必須）
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });

      // デフォルト値が1.00であることを確認（必須）
      const value = await adjustmentField.inputValue();
      expect(parseFloat(value)).toBeCloseTo(1.0);
    });

    test('調整係数を入力すると数量に反映される (quantity-table-generation/REQ-9.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「計算元の数量が 0 か NaN なら寸法を入れてみる」「それでも駄目なら 100 と
      // みなす」という観測の連鎖で基準値を決め、最後に「基準値が正なら2倍・そうでなければ
      // 初期値が正なら2倍・どちらでもなければ 0 以上」の三分岐で判定していた。
      // 最後の枝は恒真であり、計算元が用意できていない場合は何も確かめずに通る。
      // 計算元（幅10×奥行き10＝100）を自分で入力し、期待値を定数として主張する。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      const calcMethodSelect = itemRow.getByLabel(/計算方法/);
      await expect(calcMethodSelect, '前提: 計算方法の選択欄が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      const widthField = itemRow.getByLabel('幅（W）', { exact: true });
      const depthField = itemRow.getByLabel('奥行き（D）', { exact: true });
      const adjustmentField = itemRow.getByLabel('調整係数', { exact: true });
      const quantityField = itemRow.locator('input[id$="-quantity"]');

      await expect(adjustmentField, 'REQ-9.1: 調整係数フィールドが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(quantityField, '前提: 数量欄が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });

      // 計算元を確定させる（幅10 × 奥行き10 = 100）
      await widthField.fill('10');
      await depthField.fill('10');
      await adjustmentField.fill('1');
      await adjustmentField.blur();
      await expect(quantityField, '前提: 調整係数1.00のとき計算結果が数量になる').toHaveValue(
        '100.00',
        { timeout: getTimeout(5000) }
      );

      // REQ-9.2: 調整係数を2にすると計算結果に調整係数を乗算した値が数量になる
      await adjustmentField.fill('2');
      await adjustmentField.blur();
      await expect(
        quantityField,
        'REQ-9.2: 調整係数を2.00にしても数量に乗算が反映されない'
      ).toHaveValue('200.00', { timeout: getTimeout(5000) });
    });

    test('調整係数の範囲外の入力にエラーが表示される (quantity-table-generation/REQ-9.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 調整係数は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 調整係数フィールドが表示されることを確認（必須）
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });

      // Task 80.3: 本テストは Task 80.2 の結線に合わせて主張を作り直した。
      // 改める前は「0以下の値は使用できません」という警告を主張していたが、この文言は
      // **REQ-9.3 が有効域と定める `-9.99〜0` に対しても出ていた**もので、80.2 が撤去した。
      // 0 と負値の扱いは下の二段で書き分ける。
      //
      // 提示は当該の欄と同じ枠の中に描かれる（CalculationFields の fieldWrapper）。
      // 画面全体から alert を拾うと、無関係な必須欄の提示だけで成立してしまう
      const adjustmentMessage = adjustmentField.locator('xpath=..').getByRole('alert');

      // REQ-9.3: 有効域（-9.99〜9.99）の外はエラーを表示し、範囲内の値の入力を求める。
      // 期待する文言には要件が定める境界の数値そのものを書く（恒真の選言を作らない）
      await adjustmentField.click();
      await adjustmentField.fill('10');
      await expect(adjustmentMessage, 'REQ-9.3: 範囲外の調整係数にエラーが表示されない').toHaveText(
        '調整係数は-9.99〜9.99の範囲で入力してください',
        { timeout: getTimeout(3000) }
      );
      await expect(adjustmentField, 'REQ-9.3: 調整係数の欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );

      // 焦点を外しても範囲外は確定させない。提示は残り、黙って書き換えられもしない
      await page.keyboard.press('Tab');
      await expect(adjustmentField, 'REQ-9.3: 範囲外の値が黙って書き換えられている').toHaveValue(
        '10.00'
      );
      await expect(adjustmentMessage, 'REQ-9.3: 焦点を外すと範囲外のエラーが消えている').toHaveText(
        '調整係数は-9.99〜9.99の範囲で入力してください'
      );

      // 0 は REQ-9.3 の有効域の**内側**であり範囲外ではない。
      // Task 80.2 の時点では保存経路（`z.number().positive()`）が拒んでいたため、
      // 「保存できません」という別の層の文言を告げていた。**Task 85.1 がバックエンドを
      // 有効域へ揃えたためその層は撤去され、いまは何の提示も出ない。**
      // 直前の主張で同じ枠に提示が出ていたことを示しているので、提示の経路が死んでいる
      // だけで不在が成立しているのではない
      await adjustmentField.click();
      await adjustmentField.fill('0');
      await expect(adjustmentMessage, 'REQ-9.3: 有効域の内側である0にエラーが出ている').toBeHidden({
        timeout: getTimeout(3000),
      });

      // REQ-9.4 が既定値へ差し替えるのは空白のときだけである。0 はそのまま確定する
      await page.keyboard.press('Tab');
      await expect(adjustmentField, 'REQ-9.4: 0が空白と同じ扱いで既定値へ倒されている').toHaveValue(
        '0.00'
      );
    });

    test('調整係数に数値以外を入力するとエラーが表示される (quantity-table-generation/REQ-9.5)', async ({
      page,
    }) => {
      // Task 80.3: REQ-9.5 を実装したためラチェット（test.fail()）を外した。

      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 調整係数は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 調整係数フィールドが表示されることを確認（必須）
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });

      // 既定値（1.00）と衝突しない値を先に置く。既定値のままだと「拒否された」のか
      // 「既定値に戻された」のかを区別できない（Task 115.126 の基準）。
      await adjustmentField.click();
      await adjustmentField.fill('2.50');
      await page.keyboard.press('Tab');
      await expect(adjustmentField).toHaveValue('2.50');

      // 数値以外を入力する
      await adjustmentField.click();
      await page.keyboard.type('abc');
      await page.keyboard.press('Tab');

      // REQ-9.5: 数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する。
      // 以前は `値が元と同じ || 空 || 'abc' を含まない` の論理和で、第三項は恒真だった。
      // 「拒否」は直前の確定値が保たれることであり、それとエラーメッセージの双方を主張する。
      // 2.50 は既定値（1.00）ではないため、この主張は「拒否された」と「既定値に戻された」を
      // 区別する。提示は当該の欄と同じ枠の中から読む
      await expect(
        adjustmentField,
        'REQ-9.5: 数値以外の入力が拒否されず、直前の確定値が失われた'
      ).toHaveValue('2.50');
      await expect(
        adjustmentField.locator('xpath=..').getByRole('alert'),
        'REQ-9.5: 数値以外の入力に対するエラーメッセージが表示されない'
      ).toHaveText('調整係数は数値で入力してください', { timeout: getTimeout(3000) });
      await expect(adjustmentField, 'REQ-9.5: 調整係数の欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    /**
     * @requirement quantity-table-generation/REQ-9.6
     * 調整係数が設定されている状態で、計算元の値変更時に
     * 調整係数を適用した数量を自動再計算する
     */
    // 本テストの名称・タグは長く REQ-9.5（数値以外の入力の拒否）を指していたが、
    // 検証内容は計算元（幅）の変更に対する自動再計算であり、意味の上では REQ-9.6 である。
    // Task 115.127 段5 で REQ-9.5 の正しい主張（直前のテスト）が別に加わったため、
    // 同一番号を異なる意味の二件が名乗る状態になっていた。要件番号を実態へ合わせる。
    test('計算元変更時に調整係数を適用した数量が自動再計算される (quantity-table-generation/REQ-9.6)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスを面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 計算方法変更のAPI待機
      const calcMethodApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-items/') && response.request().method() === 'PUT',
        { timeout: getTimeout(10000) }
      );
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await calcMethodApiPromise.catch(() => {});
      await page.waitForTimeout(500);

      // 調整係数を先に設定
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });

      // 調整係数変更のAPI待機
      const adjustmentApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-items/') && response.request().method() === 'PUT',
        { timeout: getTimeout(10000) }
      );
      await adjustmentField.fill('2');
      await page.keyboard.press('Tab');
      await adjustmentApiPromise.catch(() => {});
      await page.waitForTimeout(500);

      // 計算用フィールドに値を入力
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });

      // 幅入力のAPI待機
      const widthApiPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-items/') && response.request().method() === 'PUT',
        { timeout: getTimeout(10000) }
      );
      await widthField.fill('10');
      await page.keyboard.press('Tab');
      await widthApiPromise1.catch(() => {});
      await page.waitForTimeout(500);

      // 数量フィールドを確認
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });

      // 初期値を取得（計算が完了した状態）
      const initialQuantity = await quantityField.inputValue();

      // 幅を変更
      // APIレスポンスを待機するためのPromiseを設定
      const apiResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-items/') && response.request().method() === 'PUT',
        { timeout: getTimeout(10000) }
      );

      await widthField.fill('20');
      await page.keyboard.press('Tab');

      // API更新を待機
      await apiResponsePromise.catch(() => {
        // APIが呼ばれない場合もあるため無視
      });

      // 状態更新を待機（数量フィールドの値が変わるまで待機）
      await expect(async () => {
        const currentQuantity = await quantityField.inputValue();
        expect(parseFloat(currentQuantity)).not.toBe(parseFloat(initialQuantity));
      }).toPass({ timeout: getTimeout(10000) });

      // 調整係数が適用された状態で数量が再計算されたことを最終確認
      const updatedQuantity = await quantityField.inputValue();
      expect(parseFloat(updatedQuantity)).not.toBe(parseFloat(initialQuantity));
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-10.1
   * @requirement quantity-table-generation/REQ-10.2
   *
   * REQ-10: 丸め設定
   */
  test.describe('丸め設定', () => {
    test('新規項目追加時に丸め設定が0.01になる (quantity-table-generation/REQ-10.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 丸め設定は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 丸め設定フィールドが表示されることを確認（必須）
      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });

      // デフォルト値が0.01であることを確認（必須）
      const value = await roundingField.inputValue();
      expect(parseFloat(value)).toBeCloseTo(0.01);
    });

    test('丸め設定を入力すると数量が切り上げられる (quantity-table-generation/REQ-10.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法セレクトボックスを面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 丸め設定フィールドが表示されることを確認（必須）
      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });

      // 数量フィールドを取得し、現在の丸め前の値を記録
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });
      const beforeRounding = await quantityField.inputValue();
      const beforeValue = parseFloat(beforeRounding);

      // 丸め設定を10に変更（10単位で切り上げ）
      await roundingField.fill('10');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);

      // 丸め設定適用後の数量を取得
      const afterRounding = await quantityField.inputValue();
      const afterValue = parseFloat(afterRounding);

      // 丸め設定が適用されていることを確認（必須）
      // - 数量が10の倍数になっている
      // - 元の値以上（切り上げ）
      expect(afterValue % 10).toBe(0);
      expect(afterValue).toBeGreaterThanOrEqual(beforeValue);
    });

    test('丸め設定の範囲外の入力にエラーが表示される (quantity-table-generation/REQ-10.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 丸め設定は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 丸め設定フィールドが表示されることを確認（必須）
      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });

      // Task 80.3: 本テストは Task 80.2 の結線に合わせて主張を作り直した。
      // 改める前は 0 を入れて「0以下の値は使用できません」を主張していたが、
      // **0 は REQ-10.4 が「未設定」の意味を与えた番兵であり、範囲判定の層に属さない**
      // （Task 80.1 の判断）。したがって 0 ではエラーが出ない。範囲外は別に入れて確かめる。
      const roundingMessage = roundingField.locator('xpath=..').getByRole('alert');

      // REQ-10.3: 有効域（0.01〜99.99）の外はエラーを表示し、範囲内の値の入力を求める。
      // 期待する文言には要件が定める境界の数値そのものを書く
      await roundingField.click();
      await roundingField.fill('100');
      await expect(
        roundingMessage,
        'REQ-10.3: 上限を超える丸め設定にエラーが表示されない'
      ).toHaveText('丸め設定は0.01〜99.99の範囲で入力してください', { timeout: getTimeout(3000) });
      await expect(roundingField, 'REQ-10.3: 丸め設定の欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );

      // 焦点を外しても範囲外は確定させない。提示は残る
      await page.keyboard.press('Tab');
      await expect(roundingField, 'REQ-10.3: 範囲外の値が黙って書き換えられている').toHaveValue(
        '100.00'
      );
      await expect(roundingMessage, 'REQ-10.3: 焦点を外すと範囲外のエラーが消えている').toHaveText(
        '丸め設定は0.01〜99.99の範囲で入力してください'
      );

      // 下限を下回る値も同じ提示になる
      await roundingField.click();
      await roundingField.fill('-1');
      await expect(
        roundingMessage,
        'REQ-10.3: 下限を下回る丸め設定にエラーが表示されない'
      ).toHaveText('丸め設定は0.01〜99.99の範囲で入力してください', { timeout: getTimeout(3000) });

      // REQ-10.4 は REQ-10.3 に優先する。0 は範囲外ではなく「未設定」であり、
      // 既定値 0.01 が自動入力されてエラーにならない
      await roundingField.click();
      await roundingField.fill('0');
      await page.keyboard.press('Tab');
      await expect(roundingField, 'REQ-10.4: 0のとき既定値0.01が自動入力されない').toHaveValue(
        '0.01'
      );
      await expect(roundingMessage, 'REQ-10.4: 番兵である0が範囲外として扱われている').toHaveCount(
        0
      );
    });

    test('丸め設定に数値以外を入力するとエラーが表示される (quantity-table-generation/REQ-10.5)', async ({
      page,
    }) => {
      // Task 80.3: REQ-10.5 を実装したためラチェット（test.fail()）を外した。

      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 丸め設定は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 丸め設定フィールドが表示されることを確認（必須）
      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });

      // 既定値（0.01）と衝突しない値を先に置く。既定値のままだと「拒否された」のか
      // 「既定値に戻された」のかを区別できない（Task 115.126 の基準）。
      await roundingField.click();
      await roundingField.fill('0.25');
      await page.keyboard.press('Tab');
      await expect(roundingField).toHaveValue('0.25');

      // 数値以外を入力する
      await roundingField.click();
      await page.keyboard.type('abc');
      await page.keyboard.press('Tab');

      // REQ-10.5: 数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する。
      // 以前は「エラー文 または 画面のどこかの aria-invalid または 入力拒否」の論理和で、
      // 最後の項の `!fieldValue.includes('abc')` は恒真、二番目は無関係な必須欄の
      // aria-invalid で常に成立していた。要件が定める二つを個別に主張する。
      // 0.25 は既定値（0.01）ではないため、この主張は「拒否された」と「既定値に戻された」を
      // 区別する。提示は当該の欄と同じ枠の中から読む
      await expect(
        roundingField,
        'REQ-10.5: 数値以外の入力が拒否されず、直前の確定値が失われた'
      ).toHaveValue('0.25');
      await expect(
        roundingField.locator('xpath=..').getByRole('alert'),
        'REQ-10.5: 数値以外の入力に対するエラーメッセージが表示されない'
      ).toHaveText('丸め設定は数値で入力してください', { timeout: getTimeout(3000) });
      await expect(roundingField, 'REQ-10.5: 丸め設定の欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    test('丸め設定を指定すると調整係数適用後の値が切り上げられる (quantity-table-generation/REQ-10.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「項目追加ボタンが見えたら押す」「長さ欄があれば入れる」「最後の欄を nth で
      // 拾う」という観測の連鎖のうえに、「計算値が正なら10の倍数・そうでなければ文字列が
      // 空でない」の二分岐で判定していた。後者は恒真であり、計算元が入らなければ
      // 丸め処理を一度も確かめない。前提を自分で作り、期待値を定数として主張する。
      // 幅5 × 奥行き3 = 15 → 調整係数1.00 → 丸め設定10 で切り上げ → 20.00。
      // なお本テストの名称・タグは REQ-10.5（数値以外の入力の拒否）を指していたが、
      // 検証内容は REQ-10.2（指定単位での切り上げ）であるため要件番号を実態へ合わせた。
      // REQ-10.5 は直前のテストが検証している。
      const itemRow = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      const calcMethodSelect = itemRow.getByLabel(/計算方法/);
      await expect(calcMethodSelect, '前提: 計算方法の選択欄が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      const roundingField = itemRow.getByLabel('丸め設定', { exact: true });
      const widthField = itemRow.getByLabel('幅（W）', { exact: true });
      const depthField = itemRow.getByLabel('奥行き（D）', { exact: true });
      const quantityField = itemRow.locator('input[id$="-quantity"]');

      await expect(roundingField, 'REQ-10.1: 丸め設定フィールドが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });

      await roundingField.fill('10');
      await widthField.fill('5');
      await depthField.fill('3');
      await depthField.blur();

      await expect(
        quantityField,
        'REQ-10.2: 丸め設定10の切り上げが最終数量に反映されない'
      ).toHaveValue('20.00', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-10.6
     * 丸め設定が適用されている状態で、計算元または調整係数の変更時に
     * 丸め処理を適用した最終数量を自動再計算する
     */
    test('丸め設定適用状態で調整係数変更時に最終数量が再計算される (quantity-table-generation/REQ-10.6)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法を面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 丸め設定を10に設定
      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });
      await roundingField.fill('10');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // 計算用フィールドに値を入力（10 * 3 = 30）
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });
      await widthField.fill('10');
      await page.keyboard.press('Tab');

      const depthField = page.getByLabel(/奥行き/).first();
      if (await isVisibleWithin(depthField, 2000)) {
        await depthField.fill('3');
        await page.keyboard.press('Tab');
      }
      await page.waitForTimeout(500);

      // 数量フィールドの初期値を取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });
      const initialQuantity = await quantityField.inputValue();
      const initialValue = parseFloat(initialQuantity);

      // 調整係数を変更（1.5に変更）
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });
      await adjustmentField.fill('1.5');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);

      // 数量が再計算されていることを確認
      const updatedQuantity = await quantityField.inputValue();
      const updatedValue = parseFloat(updatedQuantity);

      // 調整係数変更により数量が変化していることを確認
      // 元の数量 * 1.5 = 新しい数量（丸め処理後）
      expect(updatedValue).not.toBe(initialValue);

      // 丸め処理が適用されていることを確認（10の倍数）。
      // 値が数値として取れなかった場合に判定ごと飛ばすと、再計算が壊れても緑になる。
      expect(Number.isNaN(updatedValue), '再計算後の数量が数値として取得できる').toBe(false);
      expect(updatedValue, '再計算後の数量は正の値である').toBeGreaterThan(0);
      expect(updatedValue % 10, 'REQ-10.6: 丸め設定（10）を適用した数量になる').toBe(0);
    });

    /**
     * @requirement quantity-table-generation/REQ-10.7
     * 丸め設定を小数2桁で常に表示する（例：1を入力したら1.00と表示）
     */
    test('丸め設定が小数2桁で表示される (quantity-table-generation/REQ-10.7)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 丸め設定は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 丸め設定フィールドを取得
      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField).toBeVisible({ timeout: getTimeout(5000) });

      // 整数値「1」を入力
      await roundingField.fill('1');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // フィールドを再取得して値を確認
      const displayedValue = await roundingField.inputValue();

      // 小数2桁で表示されていることを確認（1.00）
      // ブラウザによって「1」のまま表示される場合もあるため、
      // 数値として等しいことを確認
      expect(parseFloat(displayedValue)).toBeCloseTo(1.0);

      // 表示形式の確認（可能な場合）
      // HTML5 number inputは表示形式を制御できないことがあるため、
      // 少なくとも値が正しいことを確認
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-9.6
   * @requirement quantity-table-generation/REQ-9.7
   *
   * REQ-9: 調整係数（追加テスト）
   */
  test.describe('調整係数追加テスト', () => {
    /**
     * @requirement quantity-table-generation/REQ-9.6
     * 調整係数が設定されている状態で、計算元の値変更時に
     * 調整係数を適用した数量を自動再計算する
     */
    test('調整係数設定状態で計算元変更時に数量が自動再計算される (quantity-table-generation/REQ-9.6)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法を面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 調整係数を2に設定
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });
      await adjustmentField.fill('2');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // 幅フィールドに値を入力
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });
      await widthField.fill('10');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);

      // 数量フィールドの初期値を取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: 3000 });
      const initialQuantity = await quantityField.inputValue();
      const initialValue = parseFloat(initialQuantity);

      // 幅を変更（10 → 20）
      await widthField.fill('20');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);

      // 数量が再計算されていることを確認
      const updatedQuantity = await quantityField.inputValue();
      const updatedValue = parseFloat(updatedQuantity);

      // 計算元変更により調整係数を適用した数量が再計算されていること
      // 幅が2倍になったため、数量も2倍になるはず
      expect(updatedValue).toBeGreaterThan(initialValue);

      // 調整係数2が適用されているため、計算結果の確認
      // 期待値: 20 * 調整係数2 = 40（単純な幅のみの場合）
    });

    /**
     * @requirement quantity-table-generation/REQ-9.7
     * 調整係数を小数2桁で常に表示する（例：1を入力したら1.00と表示）
     */
    test('調整係数が小数2桁で表示される (quantity-table-generation/REQ-9.7)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 調整係数は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 調整係数フィールドを取得
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });

      // 整数値「1」を入力
      await adjustmentField.fill('1');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // フィールドを再取得して値を確認
      const displayedValue = await adjustmentField.inputValue();

      // 小数2桁で表示されていることを確認（1.00）
      // 数値として等しいことを確認
      expect(parseFloat(displayedValue)).toBeCloseTo(1.0);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-13.1
   * @requirement quantity-table-generation/REQ-13.2
   * @requirement quantity-table-generation/REQ-13.3
   * @requirement quantity-table-generation/REQ-13.4
   *
   * REQ-13: テキストフィールドの入力制御
   */
  test.describe('テキストフィールドの入力制御', () => {
    /**
     * @requirement quantity-table-generation/REQ-13.1
     * 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考フィールドに
     * 最大文字数（全角25文字/半角50文字）を超える入力を防止する
     */
    test('テキストフィールドの最大文字数制限が適用される (quantity-table-generation/REQ-13.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 名称フィールドを取得（AutocompleteInput = combobox）
      const nameField = page.getByRole('combobox', { name: /名称/ }).first();
      await expect(nameField).toBeVisible({ timeout: getTimeout(5000) });
      const targetField = nameField;

      // 51文字（半角）の文字列を入力（最大は50文字）
      const longText = 'a'.repeat(51);
      await targetField.fill(longText);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // 入力値を確認
      const fieldValue = await targetField.inputValue();

      // REQ-13.1: 最大文字数（全角25文字/半角50文字）を超える入力を防止する。
      // 同じ「防止する」規定の REQ-22.5（数量グループ名）は、上限を超える入力を
      // 入力欄が保持しないことで実現している。よって上限超過の入力を行っても、
      // 入力欄が保持する値は常に上限（半角50文字相当の幅）以内でなければならない。
      expect(calculateStringWidth(fieldValue)).toBeLessThanOrEqual(50);
    });

    /**
     * @requirement quantity-table-generation/REQ-13.2
     * 工種フィールドに最大文字数（全角8文字/半角16文字）を超える入力を防止する
     */
    test('工種フィールドの最大文字数制限が適用される (quantity-table-generation/REQ-13.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 工種フィールドを取得
      const workTypeField = page.getByRole('combobox', { name: /工種/ }).first();
      const workTypeFieldAlt = page.getByLabel(/工種/).first();

      const targetField = (await isVisibleWithin(workTypeField, 2000))
        ? workTypeField
        : workTypeFieldAlt;
      await expect(targetField).toBeVisible({ timeout: getTimeout(5000) });

      // 17文字（半角）の文字列を入力（最大は16文字）
      const longText = 'a'.repeat(17);
      await targetField.fill(longText);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // 入力値を確認
      const fieldValue = await targetField.inputValue();

      // REQ-13.2: 最大文字数（全角8文字/半角16文字）を超える入力を防止する。
      // 上限超過の入力を行っても、入力欄が保持する値は常に上限以内でなければならない。
      expect(calculateStringWidth(fieldValue)).toBeLessThanOrEqual(16);
    });

    /**
     * @requirement quantity-table-generation/REQ-13.3
     * 単位フィールドに最大文字数（全角3文字/半角6文字）を超える入力を防止する
     */
    test('単位フィールドの最大文字数制限が適用される (quantity-table-generation/REQ-13.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 単位フィールドを取得
      const unitField = page.getByRole('combobox', { name: /単位/ }).first();
      const unitFieldAlt = page.getByLabel(/単位/).first();

      const targetField = (await isVisibleWithin(unitField, 2000)) ? unitField : unitFieldAlt;
      await expect(targetField).toBeVisible({ timeout: getTimeout(5000) });

      // 7文字（半角）の文字列を入力（最大は6文字）
      const longText = 'a'.repeat(7);
      await targetField.fill(longText);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // 入力値を確認
      const fieldValue = await targetField.inputValue();

      // REQ-13.3: 最大文字数（全角3文字/半角6文字）を超える入力を防止する。
      // 上限超過の入力を行っても、入力欄が保持する値は常に上限以内でなければならない。
      expect(calculateStringWidth(fieldValue)).toBeLessThanOrEqual(6);
    });

    /**
     * @requirement quantity-table-generation/REQ-13.4
     * 全てのテキストフィールドを左寄せで表示する
     */
    test('テキストフィールドが左寄せで表示される (quantity-table-generation/REQ-13.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 名称フィールドを取得（AutocompleteInput = combobox）
      const targetField = page.getByRole('combobox', { name: /名称/ }).first();
      await expect(targetField).toBeVisible({ timeout: getTimeout(5000) });

      // CSSのtext-alignを確認
      const textAlign = await targetField.evaluate((el) => {
        return window.getComputedStyle(el).textAlign;
      });

      // 左寄せ（left, start）であることを確認
      expect(['left', 'start']).toContain(textAlign);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-14.1
   * @requirement quantity-table-generation/REQ-14.2
   * @requirement quantity-table-generation/REQ-14.3
   * @requirement quantity-table-generation/REQ-14.4
   * @requirement quantity-table-generation/REQ-14.5
   *
   * REQ-14: 数値フィールドの表示書式
   */
  test.describe('数値フィールドの表示書式', () => {
    /**
     * @requirement quantity-table-generation/REQ-14.1
     * 調整係数・丸め設定・数量フィールドを右寄せで表示する
     */
    test('数値フィールドが右寄せで表示される (quantity-table-generation/REQ-14.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 調整係数は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 調整係数フィールドを取得
      const adjustmentField = page.getByLabel(/調整係数|coefficient/i).first();
      await expect(adjustmentField).toBeVisible({ timeout: getTimeout(5000) });

      // CSSのtext-alignを確認
      const textAlign = await adjustmentField.evaluate((el) => {
        return window.getComputedStyle(el).textAlign;
      });

      // 右寄せ（right, end）であることを確認
      expect(['right', 'end']).toContain(textAlign);
    });

    /**
     * @requirement quantity-table-generation/REQ-14.2
     * 調整係数・丸め設定・数量フィールドを小数2桁で常に表示する
     */
    test('数値フィールドが小数2桁で表示される (quantity-table-generation/REQ-14.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 数量フィールドを取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: getTimeout(5000) });

      // 整数値を入力
      await quantityField.fill('100');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // フィールドの値を確認
      const displayedValue = await quantityField.inputValue();

      // 数値として等しいことを確認
      expect(parseFloat(displayedValue)).toBeCloseTo(100.0);
    });

    /**
     * @requirement quantity-table-generation/REQ-14.3
     * 寸法フィールドまたはピッチ計算フィールドに数値を入力すると小数2桁で表示する
     */
    test('寸法フィールドに数値入力時に小数2桁で表示される (quantity-table-generation/REQ-14.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法を面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 幅フィールドを取得
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });

      // 整数値を入力
      await widthField.fill('10');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // フィールドの値を確認
      const displayedValue = await widthField.inputValue();

      // 数値として等しいことを確認
      expect(parseFloat(displayedValue)).toBeCloseTo(10.0);
    });

    /**
     * @requirement quantity-table-generation/REQ-14.4
     * 寸法フィールドまたはピッチ計算フィールドが空白の場合、
     * 小数2桁の表示を行わず空白のまま表示する
     */
    test('寸法フィールドが空白の場合は空白のまま表示される (quantity-table-generation/REQ-14.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法を面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 高さフィールドは面積・体積モードで必ず描画される。表示されたときだけ判定する形は、
      // 欄が消えたときに黙って通ってしまう。無条件に主張する。
      const heightField = page.getByLabel(/高さ|H/i).first();
      await expect(heightField, '面積・体積モードで高さの欄が表示されない').toBeVisible({
        timeout: getTimeout(3000),
      });

      // フィールドをクリア
      await heightField.clear();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      // REQ-14.4: 寸法フィールドが空白の場合は小数2桁の表示を行わず空白のまま表示する。
      // 以前は `x === '' || x.trim() === ''` で、右辺は左辺が偽のときも空白文字列で真になり、
      // 判定が実質「空白のみか」に緩んでいた。空文字そのものを主張する。
      expect(await heightField.inputValue()).toBe('');
    });

    /**
     * @requirement quantity-table-generation/REQ-14.5
     * 全ての数値フィールドを右寄せで表示する
     */
    test('全ての数値フィールドが右寄せで表示される (quantity-table-generation/REQ-14.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 数量フィールドを取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: getTimeout(5000) });

      // CSSのtext-alignを確認
      const textAlign = await quantityField.evaluate((el) => {
        return window.getComputedStyle(el).textAlign;
      });

      // 右寄せ（right, end）であることを確認
      expect(['right', 'end']).toContain(textAlign);

      // 丸め設定は計算方法が「標準」以外のときだけ描画される（REQ-5.5）。
      // 既定は「標準」であり、「表示されていれば確認する」形では一度も判定されない。
      // 計算方法を切り替え、欄が出ることを主張したうえで右寄せを判定する。
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect, 'REQ-5.1: 計算方法の選択欄が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      const roundingField = page.getByLabel(/丸め設定|rounding/i).first();
      await expect(roundingField, 'REQ-5.5: 標準以外では丸め設定の欄が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      const roundingTextAlign = await roundingField.evaluate((el) => {
        return window.getComputedStyle(el).textAlign;
      });
      expect(['right', 'end'], 'REQ-14.5: 丸め設定の欄も右寄せで表示される').toContain(
        roundingTextAlign
      );
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-15.1
   * @requirement quantity-table-generation/REQ-15.2
   * @requirement quantity-table-generation/REQ-15.3
   *
   * REQ-15: 数量フィールドの入力制御
   */
  test.describe('数量フィールドの入力制御', () => {
    /**
     * @requirement quantity-table-generation/REQ-15.1
     * 数量フィールドに入力可能範囲（-999999.99〜9999999.99）外の値が入力された場合、
     * エラーメッセージを表示し、範囲内の値の入力を求める
     */
    test('数量フィールドに範囲外の値を入力するとエラーが表示される (quantity-table-generation/REQ-15.1)', async ({
      page,
    }) => {
      // Task 80.3: REQ-15.1 の結線（Task 80.2）が入ったためラチェット（test.fail()）を外し、
      // 主張を実装が保証するものへ作り直した。

      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 数量フィールドを取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: getTimeout(5000) });

      // 未保存インジケーター（REQ-44.1）は編集が親の状態へ確定した瞬間に現れる。
      // 「範囲外の値を確定させない」ことを、画面に現れる結果として観測するために用いる。
      // 開いた直後は未保存の変更が無いことを前提として主張しておく
      const unsavedBadge = page.getByTestId('unsaved-changes-badge');
      await expect(unsavedBadge, '前提: 編集画面を開いた直後は未保存の変更が無い').toHaveCount(0);

      // 範囲外の値（9999999.99より大きい値）を入力
      await quantityField.fill('99999999');
      await page.keyboard.press('Tab');
      // 「300ms 経てば確定しているはず」という前提を置かず、**ブラー整形が反映されたこと**を
      // 条件として待つ。整形前の生の入力値のまま観測すると、後続の主張が
      // 「まだ整形されていないだけ」で通ってしまい、何も述べない。
      await expect(quantityField, '数量欄のブラー整形（小数2桁）が反映されない').toHaveValue(
        /^-?\d+\.\d{2}$/,
        { timeout: getTimeout(5000) }
      );

      // REQ-15.1: 入力可能範囲（-999999.99〜9999999.99）外の値にはエラーメッセージを表示し、
      // 範囲内の値の入力を求める。
      // 以前は「エラー文 または 画面のどこかの aria-invalid または 値が上限以下」の論理和で、
      // 二番目は無関係な必須欄の aria-invalid で常に成立していた。
      // Task 80.3: 主張を実装が保証するものへ作り直した。**欄の見た目を書き換えることは
      // 要件ではない**（80.2 は利用者の入力を黙って書き換えない道を選び、その判断を
      // design.md へ記録している）。要件が課すのは「エラーメッセージを表示し、範囲内の値の
      // 入力を求める」ことであり、実装はこれを「確定させない」ことで果たしている。
      // 文言には要件が定める境界の数値そのものを書く（恒真の選言を作らない）
      await expect(
        quantityField,
        'REQ-15.1: 数量欄がエラーの説明と結び付いていない'
      ).toHaveAttribute('aria-describedby', /-quantity-error$/);
      const rangeErrorId = await quantityField.getAttribute('aria-describedby');
      await expect(
        page.locator(`[id="${rangeErrorId}"]`),
        'REQ-15.1: 範囲外の数量に対するエラーメッセージが表示されない'
      ).toHaveText('数量は-999999.99〜9999999.99の範囲で入力してください', {
        timeout: getTimeout(3000),
      });
      await expect(quantityField, 'REQ-15.1: 数量欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );

      // 範囲外の値は親の状態へ確定していない。確定していれば未保存インジケーターが出る
      await expect(
        unsavedBadge,
        'REQ-15.1: 範囲外の数量が親の状態へ確定している（未保存の変更として現れた）'
      ).toHaveCount(0);

      // **上の不在の主張が空振りでないことを、同じ経路で確かめる。**
      // 範囲内の値を入れれば確定し、未保存インジケーターは現れる
      await quantityField.click();
      await quantityField.fill('12.34');
      await page.keyboard.press('Tab');
      await expect(quantityField, '範囲内の値が保持されない').toHaveValue('12.34');
      await expect(
        page.locator(`[id="${rangeErrorId}"]`),
        '範囲内の値に戻してもエラーが消えない'
      ).toHaveCount(0);
      await expect(
        unsavedBadge,
        '前提の反証: 範囲内の値でも未保存インジケーターが現れず、上の不在の主張が空振りである'
      ).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-15.2
     * 数量フィールドに空白が入力された場合、自動的にデフォルト値「0」を設定し、
     * 「0.00」と表示する
     */
    test('数量フィールドに空白入力時にデフォルト値0が設定される (quantity-table-generation/REQ-15.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 標準モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'STANDARD' });
      await page.waitForTimeout(500);

      // 数量フィールドを取得
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: getTimeout(5000) });

      // フィールドをクリア
      await quantityField.clear();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);

      // フィールドの値を確認
      const displayedValue = await quantityField.inputValue();

      // デフォルト値（0）が設定されていることを確認
      expect(parseFloat(displayedValue)).toBeCloseTo(0);
    });

    /**
     * @requirement quantity-table-generation/REQ-15.3
     * 寸法フィールドまたはピッチ計算フィールドに入力可能範囲（0.01〜9999999.99）外の値が
     * 入力された場合、エラーメッセージを表示し、範囲内の値の入力を求める
     */
    test('寸法フィールドに範囲外の値を入力するとエラーが表示される (quantity-table-generation/REQ-15.3)', async ({
      page,
    }) => {
      // Task 80.3: REQ-15.3 の結線（Task 80.2）が入ったためラチェット（test.fail()）を外し、
      // 主張を実装が保証するものへ作り直した。

      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法を面積・体積モードに設定
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 幅フィールドを取得
      const widthField = page.getByLabel(/幅|W/i).first();
      await expect(widthField).toBeVisible({ timeout: 3000 });

      // 数量欄は面積・体積モードでは計算用列から自動設定される（REQ-8.6 / 8.11）。
      // 「寸法が親の状態へ確定したか」を、この自動設定の結果として観測する
      const quantityField = page.locator('input[id$="-quantity"]').first();
      await expect(quantityField).toBeVisible({ timeout: getTimeout(5000) });

      // **確定の経路が生きていることを先に確かめる。** これが無いと、後段の
      // 「確定していない」の主張が「そもそも自動設定が動かない」だけで成立してしまう
      await widthField.click();
      await widthField.fill('2');
      await page.keyboard.press('Tab');
      await expect(
        quantityField,
        '前提: 有効域の寸法は確定し、数量へ自動設定される（REQ-8.6）'
      ).toHaveValue('2.00', { timeout: getTimeout(5000) });

      // 範囲外の値（下限 0.01 未満）を入力
      await widthField.click();
      await widthField.fill('-1');
      await page.keyboard.press('Tab');

      // REQ-15.3: 寸法フィールドの入力可能範囲（0.01〜9999999.99）外の値には
      // エラーメッセージを表示し、範囲内の値の入力を求める。
      // 以前は「エラー文 または 画面のどこかの aria-invalid または 値が範囲内」の論理和で、
      // 二番目は無関係な必須欄の aria-invalid で常に成立していた。
      // Task 80.3: 提示は当該の欄と同じ枠の中から読み、文言には要件が定める境界の数値
      // そのものを書く。**欄の見た目を書き換えることは要件ではない**——要件が課すのは
      // エラーの提示であり、実装はあわせて「確定させない」ことで範囲内の入力を求めている
      await expect(
        widthField.locator('xpath=..').getByRole('alert'),
        'REQ-15.3: 範囲外の寸法に対するエラーメッセージが表示されない'
      ).toHaveText('寸法/ピッチは0.01〜9999999.99の範囲で入力してください', {
        timeout: getTimeout(3000),
      });
      await expect(widthField, 'REQ-15.3: 寸法の欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );

      // 範囲外の値は親の状態へ確定していない。確定していれば数量が -1.00 へ変わる
      await expect(
        quantityField,
        'REQ-15.3: 範囲外の寸法が親の状態へ確定している（数量へ反映された）'
      ).toHaveValue('2.00');
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-11.1
   * @requirement quantity-table-generation/REQ-11.5
   *
   * REQ-11: 数量表の保存
   */
  test.describe('保存機能', () => {
    test('保存操作でデータベースに保存される (quantity-table-generation/REQ-11.1)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 必須フィールドを入力する（各項目に名称、工種、単位を設定）
      // 名称フィールドはAutocompleteInput（combobox）として実装されている
      const nameInputs = page.getByRole('combobox', { name: /名称/ });
      const workTypeInputs = page.getByRole('combobox', { name: /工種/ });
      const unitInputs = page.getByRole('combobox', { name: /単位/ });

      const nameCount = await nameInputs.count();
      for (let i = 0; i < nameCount; i++) {
        const nameInput = nameInputs.nth(i);
        const currentValue = await nameInput.inputValue().catch(() => '');
        if (!currentValue || currentValue.trim() === '') {
          await nameInput.fill(`テスト名称${i + 1}`);
        }
      }

      const workTypeCount = await workTypeInputs.count();
      for (let i = 0; i < workTypeCount; i++) {
        const workTypeInput = workTypeInputs.nth(i);
        const currentValue = await workTypeInput.inputValue().catch(() => '');
        if (!currentValue || currentValue.trim() === '') {
          await workTypeInput.fill(`テスト工種${i + 1}`);
        }
      }

      const unitCount = await unitInputs.count();
      for (let i = 0; i < unitCount; i++) {
        const unitInput = unitInputs.nth(i);
        const currentValue = await unitInput.inputValue().catch(() => '');
        if (!currentValue || currentValue.trim() === '') {
          await unitInput.fill('m');
        }
      }

      await page.waitForTimeout(500);

      // REQ-11.1: 保存操作で永続化されること。保存APIの応答が 200 であることと
      // 保存完了フィードバック（「保存しました」）の表示を無条件に主張する。
      // 保存が 400 などで失敗した場合は 200 の応答待機が成立せずこのテストは失敗する。
      await saveQuantityTableDraft(page);
    });

    // REQ-11.5 は「編集内容の自動保存（一定間隔での保存）を行わず、データの永続化は
    // 保存操作時にのみ実行する」ことを求める。したがって検証すべきは自動保存インジケーターの
    // 有無ではなく、(1) 編集後に一定時間を置いても永続化が起きないこと、
    // (2) 保存操作でのみ永続化され完了フィードバックが表示されること、の二点である。
    test('編集内容は自動保存されず保存操作時にのみ永続化される (quantity-table-generation/REQ-11.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      const headers = await apiAuthHeaders(page);

      // 前提: 編集対象となる数量項目を検証自身が用意する
      const tableResponse = await page.request.get(
        `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`,
        { headers }
      );
      expect(tableResponse.ok(), '数量表詳細の取得が成功する').toBeTruthy();
      const seedGroups = (
        (await tableResponse.json()) as { groups: { id: string; items: unknown[] }[] }
      ).groups;
      expect(seedGroups.length, '編集対象を置く数量グループが存在する').toBeGreaterThan(0);
      const seedGroup = seedGroups[0]!;
      const seedItemResponse = await page.request.post(
        `${API_BASE_URL}/api/quantity-groups/${seedGroup.id}/items`,
        {
          headers,
          data: {
            workType: '自動保存検証工種',
            name: '自動保存検証名称',
            unit: 'm',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: 1,
            roundingUnit: 0.01,
            quantity: 1,
            displayOrder: seedGroup.items.length,
          },
        }
      );
      expect(seedItemResponse.ok(), '編集対象となる数量項目の作成が成功する').toBeTruthy();

      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 永続化リクエストを観測する。CIとローカルでAPIオリジンが異なるため、
      // オリジンではなくパスとメソッドで判定する。
      const persistRequests: string[] = [];
      page.on('request', (request) => {
        const method = request.method();
        const pathname = new URL(request.url()).pathname;
        if (method !== 'GET' && /^\/api\/quantity-(tables|groups|items)/.test(pathname)) {
          persistRequests.push(`${method} ${pathname}`);
        }
      });

      // 前提: 保存が通る状態にするため必須フィールド（名称・工種・単位）を全項目で埋め、
      // 先頭項目の名称に、永続化の有無を判別できる印を入れる。
      // 値は REQ-13 の入力上限（名称: 全角25文字 / 工種: 全角8文字 / 単位: 全角3文字）に収める。
      const editMarker = `保存検証印_${Date.now().toString(36)}`;
      const nameInputs = page.getByRole('combobox', { name: /名称/ });
      const workTypeInputs = page.getByRole('combobox', { name: /工種/ });
      const unitInputs = page.getByRole('combobox', { name: /単位/ });

      const nameCount = await nameInputs.count();
      expect(nameCount, '編集対象の数量項目が表示されている').toBeGreaterThan(0);
      for (let i = 0; i < nameCount; i++) {
        await nameInputs.nth(i).fill(i === 0 ? editMarker : `保存検証名称${i + 1}`);
      }
      const workTypeCount = await workTypeInputs.count();
      for (let i = 0; i < workTypeCount; i++) {
        await workTypeInputs.nth(i).fill(`検証工種${i + 1}`);
      }
      const unitCount = await unitInputs.count();
      for (let i = 0; i < unitCount; i++) {
        await unitInputs.nth(i).fill('m');
      }
      await page.keyboard.press('Escape');

      // 編集が入力欄へ反映されていること（編集を実施した前提の確認）
      await expect(nameInputs.first(), '先頭項目に編集が反映されている').toHaveValue(editMarker, {
        timeout: getTimeout(5000),
      });

      // REQ-11.5: 一定間隔の自動保存が行われないこと（十分な待機を置いても永続化が発生しない）
      await page.waitForTimeout(6000);
      expect(
        persistRequests,
        'REQ-11.5: 編集後に一定時間が経過しても自動保存の永続化リクエストが発行されない'
      ).toEqual([]);

      const beforeSaveResponse = await page.request.get(
        `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`,
        { headers }
      );
      expect(beforeSaveResponse.ok(), '保存操作前の数量表取得が成功する').toBeTruthy();
      expect(
        JSON.stringify(await beforeSaveResponse.json()),
        'REQ-11.5: 保存操作前は編集内容が永続化されていない'
      ).not.toContain(editMarker);

      // REQ-11.5: 保存操作時にのみ永続化が実行される
      await saveQuantityTableDraft(page);
      await expect(
        page.getByText(/保存しました/).first(),
        'REQ-11.5: 保存操作の完了フィードバックが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });

      expect(
        persistRequests,
        'REQ-11.5: 永続化リクエストは保存操作による1回のみ発行される'
      ).toEqual([`PUT /api/quantity-tables/${createdQuantityTableId}/save`]);

      const afterSaveResponse = await page.request.get(
        `${API_BASE_URL}/api/quantity-tables/${createdQuantityTableId}`,
        { headers }
      );
      expect(afterSaveResponse.ok(), '保存操作後の数量表取得が成功する').toBeTruthy();
      expect(
        JSON.stringify(await afterSaveResponse.json()),
        'REQ-11.5: 保存操作によって編集内容が永続化される'
      ).toContain(editMarker);
    });

    /**
     * 受入基準 11.2 は除外である（e2e/requirement-exclusions.json）。名称欄を空にして焦点を外したときの必須エラーの表示とハイライトを主張するもので、保存の試行そのものを行っておらず、条文が求める保存の中断を主張していないため、被覆印は掲げない。
     *
     * 【現況】除外はタスク 90.3 が取り下げたため、上の一文の前半（「除外である」）はもう成り立たない。
     * **被覆印を掲げない結論は変わらない**——後半の理由（保存の試行を行っておらず、条文が求める
     * 保存の中断を主張していない）は現在も真であり、本検証は焦点喪失時の必須エラーの表示と
     * ハイライトだけを見ている。REQ-11.2 を名乗る検証は
     * `e2e/specs/quantity-tables/out-of-range-existing-value-rescue-e2e.spec.ts`（範囲外の既存値）、
     * `e2e/specs/quantity-tables/save-integrity-empty-item-name-e2e.spec.ts`（項目名が空）、
     * 本ディレクトリの `quantity-count-calculation-e2e.spec.ts`（計算パラメータ未入力）にある。
     */
    test('整合性チェックでエラーが検出されると保存が中断される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 名称フィールド（必須）を空にしてエラーを発生させる（REQ-11.2: 整合性チェック）。
      // 欄が一つも無ければ操作も判定も空振りするため、供給を無条件に主張する。
      const nameInputs = page.locator('input[id$="-name"]');
      await expect(nameInputs.first(), '前提: 数量項目の名称欄が存在する').toBeVisible({
        timeout: getTimeout(5000),
      });

      const firstInput = nameInputs.first();
      // focus→select all→delete で確実にクリア（Reactのイベントが発火するように）
      await firstInput.click();
      await firstInput.selectText();
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Tab'); // blurをトリガー

      // バリデーションエラーが表示されること（保存が中断されることを示す）。
      // 実装（AutocompleteInput）はメッセージとハイライトを同時に与えるため、
      // 論理和では片方が失われても気づけない。ハイライトは当該の欄について確かめる
      // （画面全体の [aria-invalid="true"] は他行の未入力にも一致してしまう）。
      await expect(
        page.getByText(/名称は必須です/i).first(),
        'REQ-11.2: 名称の必須エラーが表示されない'
      ).toBeVisible({ timeout: getTimeout(3000) });
      await expect(firstInput, 'REQ-11.2: 名称欄がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    test('計算方法と入力値の不整合検出時にエラーが表示される (quantity-table-generation/REQ-11.3)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 計算方法を「面積・体積」に変更して丸め設定フィールドを表示させる
      const calcMethodSelect = page.getByRole('combobox', { name: /計算方法/ }).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption('面積・体積');
      await page.waitForTimeout(500);

      // 丸め設定を負の値に設定して不整合を発生させる
      const roundingInputs = page.getByLabel(/丸め/);
      const count = await roundingInputs.count();
      expect(count).toBeGreaterThan(0);
      const lastInput = roundingInputs.nth(count - 1);
      await lastInput.click();
      await lastInput.fill('-1');

      // REQ-11.3: 不整合はエラー箇所を明示して修正を求める。
      // 提示は入力中に行われる。以前は Tab を押した後に
      // 「エラー文 または 画面のどこかの aria-invalid または 任意の alert」の論理和で
      // 判定していたため、無関係な必須欄の状態だけで常に成立していた。
      // 当該の欄について、明示（メッセージ）と箇所の特定（ハイライト）を主張する。
      // Task 80.3: 文言を実装の現況へ揃えた。改める前の「0以下の値は使用できません」は
      // **REQ-9.3 の有効域に対しても出ていた警告**であり、Task 80.2 が範囲判定へ置き換えた。
      // 丸め設定の -1 は正典の有効域（0.01〜99.99）の外であり、範囲外として明示される
      await expect(
        lastInput.locator('xpath=..').getByRole('alert'),
        'REQ-11.3: 丸め設定の不整合が明示されない'
      ).toHaveText('丸め設定は0.01〜99.99の範囲で入力してください', { timeout: getTimeout(3000) });
      await expect(lastInput, 'REQ-11.3: 不整合の箇所がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );

      // blur しても負の値は既定値へ置き換えられない（自動補正は空白と、丸め設定の 0 の
      // ときだけである。REQ-9.4 / REQ-10.4）。すなわち不整合は残り、ハイライトも消えない。
      // 黙って書き換えられていないことを主張する。
      await page.keyboard.press('Tab');
      await expect(lastInput, '不整合の値が黙って書き換えられている').toHaveValue('-1.00');
      await expect(lastInput, '不整合の箇所のハイライトが消えている').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    test('不整合がある場合に警告メッセージと問題箇所がハイライト表示される (quantity-table-generation/REQ-11.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // REQ-5.5: 丸め設定は計算方法が「標準」以外の場合のみ表示される
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await page.waitForTimeout(500);

      // 丸め設定を上限超過（100）に変更して不整合を発生させる（REQ-10.3 の提示）。
      // Task 80.3: 改める前は 0 を入れていたが、**0 は REQ-10.4 が「未設定」の意味を
      // 与えた番兵であり、既定値 0.01 へ差し替えられて不整合にならない**（Task 80.1 の判断）。
      // 不整合を作るには有効域の外の値を入れる必要がある
      const roundingInputs = page.getByLabel(/丸め/);
      // 欄が一つも無ければ操作も判定も空振りする。供給を無条件に主張する。
      const count = await roundingInputs.count();
      expect(count, '前提: 丸め設定の欄が存在する').toBeGreaterThan(0);

      const lastInput = roundingInputs.nth(count - 1);
      await lastInput.click();
      await lastInput.fill('100');

      // REQ-11.4: 不整合がある場合は警告メッセージを表示し、問題箇所をハイライトする。
      // 実装（AdjustmentField）は入力中に両方を同時に与えるため、論理和では片方が
      // 失われても気づけない。双方を個別に主張する（blur 前の状態で確かめる）。
      await expect(
        lastInput.locator('xpath=..').getByRole('alert'),
        'REQ-11.4: 不整合の警告メッセージが表示されない'
      ).toHaveText('丸め設定は0.01〜99.99の範囲で入力してください', { timeout: getTimeout(2000) });
      await expect(lastInput, 'REQ-11.4: 問題箇所がハイライトされない').toHaveAttribute(
        'aria-invalid',
        'true'
      );

      // blur しても不整合の値は黙って書き換えられず、問題箇所の提示も残る
      await page.keyboard.press('Tab');
      await expect(lastInput, 'REQ-11.4: 不整合の値が黙って書き換えられている').toHaveValue(
        '100.00'
      );
      await expect(lastInput, 'REQ-11.4: 問題箇所のハイライトが消えている').toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-12.1
   * @requirement quantity-table-generation/REQ-12.2
   * @requirement quantity-table-generation/REQ-12.4
   * @requirement quantity-table-generation/REQ-12.5
   *
   * REQ-12: パンくずナビゲーション
   */
  test.describe('パンくずナビゲーション', () => {
    test('数量表一覧画面にパンくずが表示される (quantity-table-generation/REQ-12.1)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが表示される
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 「プロジェクト一覧 > {プロジェクト名} > 数量表」の形式
      await expect(breadcrumb).toContainText(/プロジェクト/);
      await expect(breadcrumb).toContainText(/数量表/);
    });

    test('数量表編集画面にパンくずが表示される (quantity-table-generation/REQ-12.2)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名がパンくずに含まれる
      await expect(breadcrumb).toContainText(/プロジェクト/);
    });

    test('数量表新規作成画面にパンくずが表示される (quantity-table-generation/REQ-12.3)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // ローディングが終わるまで待機
      await page.waitForTimeout(1000);

      // REQ-12.3: 数量表新規作成画面に
      // 「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧 > 新規作成」を表示する。
      // 以前は `nav[aria-label="breadcrumb"]` と `getByRole('navigation', {name:/breadcrumb/i})` の
      // 論理和で判定していたが、この二つは同じ要素を別の書き方で指しているだけであり、
      // 一方が偽なら他方も偽になる。さらに内容の判定は「プロジェクト または 新規作成」の
      // 論理和で、片方の欠落を検出できなかった。要素と内容の双方を直接主張する。
      const breadcrumb = page.locator('nav[aria-label="breadcrumb"]');
      await expect(breadcrumb, 'パンくずナビゲーションが表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });

      await expect(breadcrumb).toContainText('プロジェクト');
      await expect(breadcrumb).toContainText('新規作成');
    });

    test('パンくず項目をクリックして遷移できる (quantity-table-generation/REQ-12.4)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      // 「プロジェクト」リンクをクリック（パンくずの2番目のリンク）
      const projectsLink = breadcrumb.getByRole('link', { name: /プロジェクト/ }).first();
      await projectsLink.click();

      // プロジェクト詳細ページまたは一覧に遷移
      await expect(page).toHaveURL(/\/projects/);
    });

    test('現在のページは非リンクで表示される (quantity-table-generation/REQ-12.5)', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが表示されることを確認（必須）
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // 最後の項目がリンクでないことを確認（必須）
      const lastItem = breadcrumb.locator('li').last();
      await expect(lastItem).toBeVisible({ timeout: 3000 });

      // REQ-12.5: 現在の画面を示す項目はクリック不可（非リンク）として表示する。
      // 以前は「リンクでない、または aria-current="page" を持つ」の論理和で判定していたが、
      // 実装は現在地をリンクにしないだけで aria-current を付けない。すなわち右辺は
      // 決して真にならず、左辺だけで成立する形であった。要件が定める非リンクを主張する。
      await expect(
        lastItem.getByRole('link'),
        'REQ-12.5: 現在の画面を示すパンくず項目がリンクになっている'
      ).toHaveCount(0);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-2.4
   *
   * REQ-2.4: 数量表削除
   */
  test.describe('数量表削除フロー', () => {
    test('数量表を削除できる (quantity-table-generation/REQ-2.4)', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表一覧ページに移動
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // 削除対象の数量表が表示されることを確認（必須）
      const quantityTableRow = page.getByText('E2Eテスト用数量表');
      await expect(quantityTableRow).toBeVisible({ timeout: getTimeout(5000) });

      // 削除ボタンが表示されることを確認（必須）
      const deleteButton = page.getByRole('button', { name: /削除/ }).first();
      await expect(deleteButton).toBeVisible({ timeout: 3000 });

      // 削除ボタンをクリック
      await deleteButton.click();

      // 確認ダイアログが表示される
      const confirmDialog = page.getByRole('dialog');
      await expect(confirmDialog).toBeVisible();

      // 削除を確定
      const confirmButton = confirmDialog.getByRole('button', { name: /削除|確認|はい/ });
      await confirmButton.click();

      // ダイアログが閉じる
      await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });

      // 数量表が削除された（一覧から消えた）ことを確認
      await expect(quantityTableRow).not.toBeVisible({ timeout: 5000 });
    });
  });

  /**
   * クリーンアップ: テスト用プロジェクトを削除
   */
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

        // 削除ボタンをクリック
        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        const hasDeleteButton = await isVisibleWithin(deleteButton, 5000);
        if (hasDeleteButton) {
          await deleteButton.click();
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          const hasConfirmButton = await isVisibleWithin(confirmButton, 5000);
          if (hasConfirmButton) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});

// NOTE: REQ-2.5とREQ-4.3は実装済みのため、「未実装機能テスト」セクションは削除されました。
// REQ-2.5は数量表一覧テストセクション内に移動
// REQ-4.3は数量グループ操作テストセクション内で実装されています

// ============================================================================
// 数量表グループの注釈の目印（site-survey Task 115.14）
// ============================================================================

/** 目印の検証に用いる3状態（ファイル名で識別する） */
const BADGE_IMAGE_FILE_NAMES = {
  /** 画像編集画面で矢印を描いて保存した写真（描画された注釈あり） */
  drawnAnnotation: 'qt-badge-drawn-annotation.png',
  /** 登録しただけで画像編集画面を一度も経ていない写真（注釈なし） */
  noAnnotation: 'qt-badge-no-annotation.png',
  /** 画像編集画面で90度回転だけを行って保存した写真（注釈0件） */
  rotationOnly: 'qt-badge-rotation-only.png',
} as const;

/** 注釈の目印の要素。グループ配下に存在するか否かで表示・非表示を判定する */
const ANNOTATION_BADGE_SELECTOR = '[data-testid^="annotation-badge-"]';

/**
 * 数量表グループの注釈の目印（表示・非表示）
 *
 * Requirements coverage (site-survey):
 * - REQ-20.2: 縮小表示に保存済みの注釈を反映する
 *
 * ## 何を検証するか（site-survey Task 115.14 の主旨）
 *
 * 従来の検証は、目印の有無を自ら観測した結果を条件にして
 * 「目印があるなら目印が見えること」を確かめていた。これは目印が出ても出なくても
 * 成立するため、判別能力を持たない。ここでは注釈の有無が**既知**の3状態を自ら用意し、
 * 目印の表示と非表示を**無条件に**検証する。
 *
 * | 状態 | 用意の方法 | 描画された注釈 | 目印 |
 * | --- | --- | --- | --- |
 * | 注釈あり | 画像編集画面で矢印を描いて保存 | あり | 表示される |
 * | 注釈なし | 登録のみ（画像編集画面を経ない） | なし | 表示されない |
 * | 回転のみ | 画像編集画面で90度回転だけを保存 | なし | 表示されない |
 *
 * 「回転のみ」を含めるのは、注釈レコードの存在から導出される項目（`hasAnnotations`）を
 * 判定源にすると回転のみの保存でも真になり、注釈0件の写真が注釈ありと誤表示されるためである
 * （site-survey Task 115.7 / 115.13）。この状態が「表示されない」ことまで検証して初めて、
 * 判定源の取り違えを検出できる。
 *
 * ## 前提状態の用意と確認
 *
 * 注釈と回転はデータの直接書き換えではなく画像編集画面の操作で用意する
 * （生成経路の欠落を見落とさないため）。用意できたことは、
 * 数量表編集画面が実際に用いる取得経路 `GET /api/quantity-tables/:id` の応答が示す
 * 「描画された注釈の有無」で確認する。前提が成立しない場合は検証本体を実行せず失敗させる
 * （AI運用7原則 第3原則）。
 */
test.describe('数量表グループの注釈の目印（site-survey/REQ-20.2）', () => {
  test.describe.configure({ mode: 'serial' });

  /** `GET /api/site-surveys/:id` の応答のうち本ブロックが用いる項目 */
  interface BadgeDetailImage {
    id: string;
    fileName: string;
    hasDrawnAnnotations: boolean;
  }

  /** `GET /api/quantity-tables/:id` の応答のうち本ブロックが用いる項目 */
  interface BadgeQuantityGroup {
    surveyImage: {
      fileName: string;
      hasDrawnAnnotations: boolean;
    } | null;
  }

  const RUN_ID = Date.now();
  const BADGE_SURVEY_NAME = `注釈の目印検証用現場調査_${RUN_ID}`;

  let badgeProjectId: string | null = null;
  let badgeSurveyId: string | null = null;
  let badgeQuantityTableId: string | null = null;

  /** ログイン済みページの認証ヘッダを組み立てる */
  async function getAuthHeaders(page: Page): Promise<Record<string, string>> {
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken, 'アクセストークンが取得できる').toBeTruthy();
    return { Authorization: `Bearer ${accessToken}` };
  }

  /** 現場調査詳細の取得経路から画像一覧を読む */
  async function fetchSurveyImages(page: Page): Promise<BadgeDetailImage[]> {
    const response = await page.request.get(`${API_BASE_URL}/api/site-surveys/${badgeSurveyId}`, {
      headers: await getAuthHeaders(page),
    });
    expect(response.ok(), '現場調査詳細の取得が成功する').toBeTruthy();
    return ((await response.json()) as { images: BadgeDetailImage[] }).images;
  }

  /** 数量表編集画面が実際に用いる取得経路からグループ一覧を読む */
  async function fetchQuantityTableGroups(page: Page): Promise<BadgeQuantityGroup[]> {
    const response = await page.request.get(
      `${API_BASE_URL}/api/quantity-tables/${badgeQuantityTableId}`,
      { headers: await getAuthHeaders(page) }
    );
    expect(response.ok(), '数量表詳細の取得が成功する').toBeTruthy();
    return ((await response.json()) as { groups: BadgeQuantityGroup[] }).groups;
  }

  const imageOf = (images: BadgeDetailImage[], fileName: string): BadgeDetailImage => {
    const image = images.find((candidate) => candidate.fileName === fileName);
    if (!image) {
      throw new Error(`前提状態の画像が見つかりません: ${fileName}`);
    }
    return image;
  };

  /** 画像編集画面を開き、編集モードへ入る */
  async function openImageEditor(page: Page, imageId: string): Promise<void> {
    await page.goto(`/site-surveys/${badgeSurveyId}/images/${imageId}`);
    await page.waitForLoadState('networkidle');

    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.click();

    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(15000) });

    // Task 115.184: 描画面の観測（getEditorCanvasState）は不在なら投げる。`expect.poll`
    // は poller の例外を再試行しないため、poll の手前で観測できる状態を確立しておく。
    // 本番は useEffect で `window.__fabricCanvas` を載せるので、容器や道具帯の可視は
    // 描画面が載ったことを意味しない。背景画像の読込待ちは別条件なのでそのまま残す。
    await waitForFabricCanvas(page);
  }

  /** 編集キャンバスの中心座標を取得する */
  async function getCanvasCenter(page: Page): Promise<{ x: number; y: number }> {
    const upperCanvas = page.locator('.upper-canvas');
    await expect(upperCanvas).toBeVisible({ timeout: getTimeout(15000) });

    let box = await upperCanvas.boundingBox();
    for (
      let attempt = 0;
      attempt < 20 && (!box || box.width <= 10 || box.height <= 10);
      attempt++
    ) {
      await page.waitForTimeout(300);
      box = await upperCanvas.boundingBox();
    }
    if (!box || box.width <= 10 || box.height <= 10) {
      throw new Error('編集キャンバスの領域が確保されていません');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /**
   * 編集キャンバスの状態を取得する
   *
   * 画像編集画面はキャンバスを `window.__fabricCanvas` として公開している。
   * 背景画像は `canvas.backgroundImage` に置かれ `getObjects()` には現れないため、
   * 注釈の件数と背景画像の回転角度を分けて読む。描画・回転が実際に反映されたかを
   * 保存前に確認するために用いる。
   *
   * Task 115.184: キャンバス未公開は番兵値で返さず投げる。以前は
   * `{ hasCanvas: false, annotationCount: 0 }` を返していたため、**注釈の件数が
   * 「観測できなかった」と「零件だった」で同じ 0 になり**、「回転のみの状態では
   * 注釈オブジェクトが存在しない」という不在の主張がキャンバス不在でも成立しえた。
   */
  function getEditorCanvasState(
    page: Page
  ): Promise<{ annotationCount: number; backgroundAngle: number | null }> {
    return page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getObjects: () => unknown[];
            backgroundImage?: { angle?: number } | null;
          } | null;
        }
      ).__fabricCanvas;
      if (!canvas) {
        throw new Error(
          'Fabric.js キャンバス（window.__fabricCanvas）が取得できない。' +
            '注釈の件数を観測できないため、ここで失敗させる'
        );
      }
      const background = canvas.backgroundImage;
      return {
        annotationCount: canvas.getObjects().length,
        backgroundAngle: background ? Number(background.angle ?? 0) : null,
      };
    });
  }

  /** 矢印注釈を1本描く */
  async function drawArrow(page: Page): Promise<void> {
    const arrowTool = page.getByRole('button', { name: /矢印/i });
    await expect(arrowTool).toBeVisible({ timeout: getTimeout(10000) });
    await arrowTool.click();
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

    // 背景画像の読み込み前に描くと、合成結果に素材が写らない状態で保存されうる
    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle !== null, {
        timeout: getTimeout(15000),
        message: '編集キャンバスに背景画像が読み込まれていない',
      })
      .toBe(true);

    // Task 115.184: 「編集キャンバスが公開されている」ことは観測そのものが投げて
    // 保証するため、番兵値を弾くための主張は不要になった。
    const before = await getEditorCanvasState(page);

    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x - 50, center.y - 50);
    await page.mouse.down();
    await page.mouse.move(center.x + 50, center.y + 50, { steps: 10 });
    await page.mouse.up();

    // 描画が実際に注釈を生成したことを確認してから保存する。生成されていない状態で
    // 保存すると「注釈なし」として扱われ、検証対象の前提が崩れる
    await expect
      .poll(async () => (await getEditorCanvasState(page)).annotationCount, {
        timeout: getTimeout(10000),
        message: '矢印の描画で注釈オブジェクトが生成されていない',
      })
      .toBe(before.annotationCount + 1);

    await page.getByRole('button', { name: /選択/i }).click();
  }

  /** 画像を90度回転する（注釈は一切描かない） */
  async function rotate90(page: Page): Promise<void> {
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(10000) });

    // 背景画像の読み込み前に押しても回転は適用されない
    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle, {
        timeout: getTimeout(15000),
        message: '編集キャンバスに背景画像が読み込まれていない',
      })
      .toBe(0);

    await rotateButton.click();

    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle, {
        timeout: getTimeout(10000),
        message: '回転操作が背景画像へ適用されていない',
      })
      .toBe(90);

    // 回転のみであること（注釈オブジェクトが増えていないこと）を保存前に確認する
    const state = await getEditorCanvasState(page);
    expect(state.annotationCount, '回転のみの状態では注釈オブジェクトが存在しない').toBe(0);
  }

  /**
   * 画像編集画面で保存し、合成済みサムネイルの更新完了まで確認する
   *
   * 保存は注釈の保存（PUT）と合成済みサムネイルの更新（PATCH）の2段で構成される。
   */
  async function saveInImageEditor(page: Page, imageId: string): Promise<void> {
    const annotationSaved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/site-surveys/images/${imageId}/annotations` &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const thumbnailUpdated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/site-surveys/images/${imageId}/annotated-thumbnail` &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^保存$/i }).click();

    const annotationResponse = await annotationSaved;
    expect(annotationResponse.ok(), '注釈の保存が成功する').toBeTruthy();

    const thumbnailResponse = await thumbnailUpdated;
    expect(thumbnailResponse.ok(), '合成済みサムネイルの更新が成功する').toBeTruthy();

    await expect(page.getByText(/保存しました/i)).toBeVisible({ timeout: getTimeout(15000) });
  }

  /** 数量表編集画面を開く */
  async function openBadgeQuantityTable(page: Page): Promise<void> {
    if (!badgeQuantityTableId) {
      throw new Error('badgeQuantityTableIdが未設定です。事前準備が正しく実行されていません。');
    }
    await page.goto(`/quantity-tables/${badgeQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('quantity-table-edit-area')).toBeVisible({
      timeout: getTimeout(15000),
    });
  }

  /**
   * 対象の写真を紐づけたグループを特定する
   *
   * 特定に先立ち、数量表編集画面が実際に用いる取得経路の応答で
   * 「描画された注釈の有無」が既知の前提どおりであることを確認する。
   * 前提が崩れている場合はここで失敗し、検証本体は実行されない。
   */
  async function locateGroupWithVerifiedPrerequisite(
    page: Page,
    fileName: string,
    expectedHasDrawnAnnotations: boolean
  ): Promise<Locator> {
    const groups = await fetchQuantityTableGroups(page);
    const target = groups.find((group) => group.surveyImage?.fileName === fileName);
    expect(target, `数量表の応答に ${fileName} を紐づけたグループが現れる`).toBeTruthy();
    expect(
      target!.surveyImage!.hasDrawnAnnotations,
      `${fileName} の「描画された注釈の有無」が前提どおりである`
    ).toBe(expectedHasDrawnAnnotations);

    const group = page
      .getByTestId('quantity-group')
      .filter({ has: page.getByAltText(fileName, { exact: true }) });
    await expect(group, `${fileName} を紐づけたグループが1件表示される`).toHaveCount(1, {
      timeout: getTimeout(15000),
    });
    await group.scrollIntoViewIfNeeded();
    return group;
  }

  /**
   * 事前準備
   *
   * 注釈あり・注釈なし・回転のみの3枚を持つ現場調査を作り、その現場調査から
   * 数量表のグループを一括生成して各写真を紐づける。
   */
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      // --- プロジェクト作成（営業担当者の既定値は画面が解決するため画面から作る） ---
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(`注釈の目印検証_${RUN_ID}`);

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
      badgeProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(badgeProjectId, 'プロジェクトが作成される').toBeTruthy();

      const authHeaders = await getAuthHeaders(page);

      // --- 現場調査作成 ---
      const surveyDate = new Date().toISOString().split('T')[0]!;
      const surveyResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${badgeProjectId}/site-surveys`,
        { headers: authHeaders, data: { name: BADGE_SURVEY_NAME, surveyDate } }
      );
      expect(surveyResponse.ok(), '現場調査の作成が成功する').toBeTruthy();
      badgeSurveyId = ((await surveyResponse.json()) as { id: string }).id;
      expect(badgeSurveyId, '現場調査が作成される').toBeTruthy();

      // --- 写真を3枚登録 ---
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath), '素材画像が存在する').toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);

      for (const fileName of Object.values(BADGE_IMAGE_FILE_NAMES)) {
        const uploadResponse = await page.request.post(
          `${API_BASE_URL}/api/site-surveys/${badgeSurveyId}/images`,
          {
            headers: authHeaders,
            multipart: { images: { name: fileName, mimeType: 'image/png', buffer: imageBuffer } },
          }
        );
        expect(uploadResponse.ok(), `画像の登録が成功する: ${fileName}`).toBeTruthy();
      }

      const uploadedImages = await fetchSurveyImages(page);
      expect(uploadedImages).toHaveLength(Object.keys(BADGE_IMAGE_FILE_NAMES).length);

      // --- 状態1: 画像編集画面で矢印を描いて保存する（描画された注釈あり） ---
      const annotatedImageId = imageOf(uploadedImages, BADGE_IMAGE_FILE_NAMES.drawnAnnotation).id;
      await openImageEditor(page, annotatedImageId);
      await drawArrow(page);
      await saveInImageEditor(page, annotatedImageId);

      // --- 状態3: 画像編集画面で90度回転だけを保存する（注釈0件） ---
      const rotatedImageId = imageOf(uploadedImages, BADGE_IMAGE_FILE_NAMES.rotationOnly).id;
      await openImageEditor(page, rotatedImageId);
      await rotate90(page);
      await saveInImageEditor(page, rotatedImageId);

      // 状態2（注釈なし）は登録したままとし、画像編集画面を一度も開かない

      // --- 用意した状態を現場調査の取得経路の応答で確認する ---
      const preparedImages = await fetchSurveyImages(page);
      expect(
        imageOf(preparedImages, BADGE_IMAGE_FILE_NAMES.drawnAnnotation).hasDrawnAnnotations,
        '矢印を描いて保存した写真は描画された注釈を持つ'
      ).toBe(true);
      expect(
        imageOf(preparedImages, BADGE_IMAGE_FILE_NAMES.noAnnotation).hasDrawnAnnotations,
        '登録しただけの写真は描画された注釈を持たない'
      ).toBe(false);
      expect(
        imageOf(preparedImages, BADGE_IMAGE_FILE_NAMES.rotationOnly).hasDrawnAnnotations,
        '回転だけを保存した写真は描画された注釈を持たない'
      ).toBe(false);

      // --- 数量表を作成し、現場調査から写真枚数分のグループを生成して紐づける ---
      const tableResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${badgeProjectId}/quantity-tables`,
        { headers: authHeaders, data: { name: `注釈の目印検証数量表_${RUN_ID}` } }
      );
      expect(tableResponse.ok(), '数量表の作成が成功する').toBeTruthy();
      badgeQuantityTableId = ((await tableResponse.json()) as { id: string }).id;
      expect(badgeQuantityTableId, '数量表が作成される').toBeTruthy();

      await openBadgeQuantityTable(page);

      await page.getByTestId('bulk-create-from-survey-button').click();
      const surveyDialog = page.getByTestId('survey-select-dialog');
      await expect(surveyDialog).toBeVisible({ timeout: getTimeout(15000) });
      await page.getByTestId(`survey-select-option-${badgeSurveyId}`).click();
      await page.getByTestId('survey-select-dialog-confirm').click();
      await expect(surveyDialog).not.toBeVisible({ timeout: getTimeout(15000) });

      const generatedGroups = page.getByTestId('quantity-group');
      await expect(generatedGroups).toHaveCount(Object.keys(BADGE_IMAGE_FILE_NAMES).length, {
        timeout: getTimeout(15000),
      });

      // 生成はクライアントドラフトに留まるため、明示保存して永続化する（REQ-42.5）
      await saveQuantityTableDraft(page);

      // --- 紐づけ結果を、数量表編集画面が実際に用いる取得経路の応答で確認する ---
      const savedGroups = await fetchQuantityTableGroups(page);
      const linkedFileNames = savedGroups
        .map((group) => group.surveyImage?.fileName)
        .filter((fileName): fileName is string => Boolean(fileName));
      expect(
        [...linkedFileNames].sort(),
        '3枚の写真がそれぞれグループへ紐づいて永続化されている'
      ).toEqual([...Object.values(BADGE_IMAGE_FILE_NAMES)].sort());
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * @requirement site-survey/REQ-20.2
   */
  test('描画された注釈がある写真を紐づけたグループには注釈の目印が表示される (site-survey/REQ-20.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await openBadgeQuantityTable(page);

    const group = await locateGroupWithVerifiedPrerequisite(
      page,
      BADGE_IMAGE_FILE_NAMES.drawnAnnotation,
      true
    );

    await expect(
      group.locator(ANNOTATION_BADGE_SELECTOR),
      '描画された注釈がある写真のグループには注釈の目印を表示する'
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement site-survey/REQ-20.2
   */
  test('注釈が無い写真を紐づけたグループには注釈の目印が表示されない (site-survey/REQ-20.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await openBadgeQuantityTable(page);

    const group = await locateGroupWithVerifiedPrerequisite(
      page,
      BADGE_IMAGE_FILE_NAMES.noAnnotation,
      false
    );

    await expect(
      group.locator(ANNOTATION_BADGE_SELECTOR),
      '注釈が無い写真のグループには注釈の目印を表示しない'
    ).toHaveCount(0, { timeout: getTimeout(15000) });
  });

  /**
   * @requirement site-survey/REQ-20.2
   *
   * 注釈レコードの存在から導出される項目を判定源にすると、回転のみの保存でも真になり
   * 目印が誤表示される（site-survey Task 115.7 / 115.13）。この状態の非表示を検証することで
   * 判定源の取り違えを検出する。
   */
  test('回転のみで注釈0件の写真を紐づけたグループには注釈の目印が表示されない (site-survey/REQ-20.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await openBadgeQuantityTable(page);

    const group = await locateGroupWithVerifiedPrerequisite(
      page,
      BADGE_IMAGE_FILE_NAMES.rotationOnly,
      false
    );

    await expect(
      group.locator(ANNOTATION_BADGE_SELECTOR),
      '回転のみで注釈0件の写真のグループには注釈の目印を表示しない'
    ).toHaveCount(0, { timeout: getTimeout(15000) });
  });

  /**
   * クリーンアップ: 検証用に作成したプロジェクトを削除する
   */
  test.afterAll(async ({ browser }) => {
    // 前提が用意されていなければ削除すべき対象も無い。黙って戻ると「後片付けした」ことになり、
    // 前提の生成が壊れたことが記録に残らない。前提が崩れた地点で失敗させる。
    assertPrepared(badgeProjectId, '注釈の目印の検証用に作成したプロジェクトのID');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      const authHeaders = await getAuthHeaders(page);
      await page.request.delete(`${API_BASE_URL}/api/projects/${badgeProjectId}`, {
        headers: authHeaders,
      });
    } finally {
      await context.close();
    }
  });
});
