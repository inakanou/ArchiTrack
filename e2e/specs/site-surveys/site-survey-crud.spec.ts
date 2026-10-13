/**
 * @fileoverview 現場調査CRUD操作のE2Eテスト
 *
 * Task 26.2: 現場調査のE2Eテストを実装する
 *
 * Requirements（要件1の現行の原文に合わせた番号。タスク 115.188 で更新）:
 * - 1.1: 現場調査作成フォームの調査名欄にデフォルト値「現場調査」を設定する
 * - 1.2: 現場調査作成フォームの送信でプロジェクトに紐付く新規レコードを作成する
 * - 1.3: 現場調査詳細画面に基本情報と関連する画像一覧を表示する
 * - 1.4: 現場調査情報の編集保存を楽観的排他制御で更新する
 * - 1.5: 現場調査の削除で現場調査と関連する画像データを論理削除する
 * - 1.6: 同時編集の競合を検出したとき競合エラーを表示して再読み込みを促す
 *
 * これらは散文であり被覆印としては読まれない（パターン5は
 * `Requirements (feature-name):` ヘッダー直下の一覧だけを拾う）。名乗りの担い手は
 * 各区間の `@requirement` である。
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

/**
 * 現場調査CRUD機能のE2Eテスト
 */
test.describe('現場調査CRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;
  // テストで作成した現場調査のIDを保存
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成する
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 新規作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクトを作成
      const projectName = `現場調査テスト用プロジェクト_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // URLからプロジェクトIDを取得
      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      expect(createdProjectId).toBeTruthy();
    });
  });

  /**
   * 現場調査作成フローのテスト
   *
   * 受入基準1.1: 現場調査作成フォームを表示すると調査名欄にデフォルト値を設定する
   * 受入基準1.2: 現場調査作成フォームを送信するとプロジェクトに紐づけて保存する
   */
  test.describe('現場調査作成フロー', () => {
    /**
     * タスク 115.188 の是正: site-survey の受入基準1.1 を名乗る被覆印を取り下げた。原文1.1 は
     * 「現場調査作成フォームを表示したとき、調査名欄にデフォルト値『現場調査』を設定する」
     * であり、本検証は作成フォームを開かず一覧への画面遷移だけを主張する。主題が別である。
     * 要件1 に画面遷移を述べる条文は無い（遷移は要件2 の所管）ため付け替え先も無い。
     */
    test('プロジェクト詳細から現場調査一覧へ遷移できる', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査セクションが表示されていることを確認
      // SiteSurveySectionCardコンポーネントのh3見出しをチェック
      const surveySectionHeading = page.getByRole('heading', { name: '現場調査' }).first();
      await expect(surveySectionHeading).toBeVisible({ timeout: getTimeout(10000) });

      // 現場調査がある場合は「すべて見る」リンク、ない場合は直接URLに遷移
      // 現場調査セクション内の「すべて見る」リンクを取得
      const siteSurveySection = page.getByLabel('現場調査', { exact: true });
      const viewAllLink = siteSurveySection.getByRole('link', { name: /すべて見る/i });
      const viewAllLinkVisible = await isVisibleWithin(viewAllLink, 3000);
      if (viewAllLinkVisible) {
        await viewAllLink.click();
      } else {
        // 現場調査が0件の場合は直接URLに遷移
        await page.goto(`/projects/${createdProjectId}/site-surveys`);
      }

      // 現場調査一覧ページに遷移
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys`), {
        timeout: getTimeout(10000),
      });

      // 一覧ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /現場調査/i }).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * タスク 115.188 の是正: site-survey の受入基準1.1 を名乗る被覆印を取り下げた。原文1.1 が述べる
     * のは調査名欄のデフォルト値「現場調査」だが、本検証は作成フォームへ遷移したことだけを
     * 主張し、調査名欄の値を一度も見ない。要件1 に画面遷移を述べる条文は無い。
     */
    test('新規作成ボタンから作成フォームへ遷移できる', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査一覧ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 「新規作成」ボタンまたはリンクをクリック（ヘッダーの最初のリンクを使用）
      const createButton = page.getByRole('link', { name: /新規作成/i }).first();
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys/new`), {
        timeout: getTimeout(10000),
      });

      // フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /新規現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel(/調査名/i)).toBeVisible();
      await expect(page.getByLabel(/調査日/i)).toBeVisible();
    });

    /**
     * @requirement site-survey/REQ-1.2
     * 現場調査作成フォームを送信すると、プロジェクトに紐づけて現場調査を保存する
     *
     * タスク 115.188 の是正: 本ファイルの被覆印は要件1 に受入基準が追加される前の番号
     * （旧 REQ-1.N）のままで、以降が一つずつずれていた。表題・本文が述べる内容と
     * 原文を突き合わせて名乗り直している。
     */
    test('現場調査を作成できる (site-survey/REQ-1.2)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const surveyName = `E2Eテスト現場調査_${Date.now()}`;
      const surveyDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式
      const memo = 'E2Eテスト用のメモです。';

      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(surveyDate!);
      await page.getByLabel(/メモ/i).fill(memo);

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

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/現場調査を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面に作成した情報が表示されることを確認（見出しを使用）
      await expect(page.getByRole('heading', { name: surveyName })).toBeVisible();

      // 作成した現場調査のIDを保存
      const url = page.url();
      const match = url.match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = match?.[1] ?? null;
    });

    /**
     * タスク 115.188 の是正: site-survey の受入基準1.1 を名乗る被覆印を取り下げた。本検証は調査名欄を
     * `clear()` してから必須バリデーションの表示を主張するもので、原文1.1 が述べる
     * デフォルト値「現場調査」そのものは一度も検査していない（デフォルト値は前提として
     * 消しているだけである）。要件1 に必須バリデーションを述べる条文は無いため付け替え先も無い。
     * この取り下げにより 1.1 は未被覆として露出する。
     */
    test('必須項目未入力時にバリデーションエラーが表示される', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // 調査名フィールドをクリアする（デフォルト値「現場調査」が設定されているため）
      await page.getByLabel(/調査名/i).clear();

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/調査名は必須です|名前は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement site-survey/REQ-1.7
     * プロジェクトが存在しない場合、現場調査の作成を許可しない
     */
    test('存在しないプロジェクトでは現場調査を作成できない (site-survey/REQ-1.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないプロジェクトIDで現場調査作成画面にアクセスする。
      // backend の `projectIdParamSchema` は版・変種まで見る UUID の正規表現
      // （`[1-5]` / `[89ab]`）で検査するため、nil UUID（すべて 0）は
      // 「存在しない」ではなく「形式が不正」として 400 で弾かれ、REQ-1.7 の
      // 「プロジェクトが存在しない場合」を通らない。版 4・変種 8 の整った UUID を用いる。
      const nonExistentProjectId = '00000000-0000-4000-8000-000000000000';
      await page.goto(`/projects/${nonExistentProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // REQ-1.7 は「プロジェクトが存在しない間は現場調査の作成を許可しない」と定めている。
      // SiteSurveyCreatePage はプロジェクト取得に失敗すると role="alert" だけを描画し、
      // 作成フォームを一切描画しない（frontend/src/pages/SiteSurveyCreatePage.tsx の
      // `if (!project || !projectId)` 分岐）。バックエンドは 404 の detail に
      // `Project not found: <id>` を返す（backend/src/errors/projectError.ts）。
      // 「エラーが出ていなければフォームの有無を見る」観測による分岐は、
      // 作成できてしまう欠陥をそのまま緑にするため置かない。
      const errorAlert = page.getByRole('alert').first();
      await expect(errorAlert).toBeVisible({ timeout: getTimeout(10000) });
      await expect(errorAlert).toContainText(
        /プロジェクトが見つかりません|プロジェクトの取得に失敗しました|Project not found/i
      );

      // 作成の手段が無いこと（作成フォームが描画されていないこと）を主張する
      await expect(page.getByRole('button', { name: /^作成$/i })).toHaveCount(0);
      await expect(page.getByLabel(/調査名/i)).toHaveCount(0);
    });
  });

  /**
   * 現場調査詳細表示のテスト
   *
   * 受入基準1.3: 現場調査詳細画面で基本情報と関連する画像一覧を表示する
   */
  test.describe('現場調査詳細表示', () => {
    /**
     * @requirement site-survey/REQ-1.3
     *
     * タスク 115.188 の是正: 本検証の表題・本文が述べる内容は名乗っていた番号の条文と
     * 対応していなかった。走査で候補を挙げ、原文と突き合わせて名乗り直している。
     */
    test('現場調査詳細を表示できる (site-survey/REQ-1.3)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 詳細情報が表示されることを確認（見出しを使用）
      await expect(page.getByRole('heading', { name: /E2Eテスト現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ブレッドクラムナビゲーションが表示されることを確認
      await expect(page.getByRole('navigation', { name: /パンくず|breadcrumb/i })).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 編集ボタンと削除ボタンが表示されることを確認
      await expect(page.getByRole('button', { name: /編集/i })).toBeVisible();
    });
  });

  /**
   * 現場調査編集フローのテスト
   *
   * 受入基準1.4: 現場調査情報を編集して保存すると、楽観的排他制御でバージョンを確認して更新する
   */
  test.describe('現場調査編集フロー', () => {
    /**
     * @requirement site-survey/REQ-1.4
     *
     * タスク 115.188 の是正: 本ファイルの被覆印は要件1 に受入基準が追加される前の番号
     * （旧 REQ-1.N）のままで、以降が一つずつずれていた。表題・本文が述べる内容と
     * 原文を突き合わせて名乗り直している。
     */
    test('編集ボタン→フォーム表示→保存が正常に行われる (site-survey/REQ-1.4)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集ページに遷移
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}/edit`), {
        timeout: getTimeout(10000),
      });

      // フォームデータのロード完了を待機
      await page.waitForLoadState('networkidle');

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /現場調査を編集|編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 現在の値がプリセットされていることを確認
      await expect(page.getByLabel(/調査名/i)).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 値を変更
      const updatedMemo = `E2E編集テスト_更新済み_${Date.now()}`;
      await page.getByLabel(/メモ/i).fill(updatedMemo);

      // APIレスポンスを待機しながら保存ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${createdSurveyId}`) &&
          response.request().method() === 'PUT' &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: getTimeout(30000) }
      );

      const saveButton = page.getByRole('button', { name: /^保存$/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
      await expect(saveButton).toBeEnabled({ timeout: getTimeout(5000) });
      await saveButton.click();

      // APIレスポンスを待機（成功レスポンスのみ）
      await updatePromise;

      // 詳細画面に戻ることを確認（成功の主要な検証）
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`), {
        timeout: getTimeout(10000),
      });

      // 更新した内容が反映されていることを確認
      await expect(page.getByText(updatedMemo)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * タスク 115.188 の是正: 従前は REQ-1.3 を名乗っていたが、受入基準1.3 は詳細画面の表示についての条文であり
     * 、編集の取り消しを述べる受入基準は要件1 に存在しない。被覆印を取り下げた（受入基準1.4 は保存時の楽観的排他制御であり、
     * 破棄は主張していない）。
     */
    test('編集キャンセル時は変更が破棄される', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 編集ページに直接移動
      await page.goto(`/site-surveys/${createdSurveyId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集フォームが表示されるまで待機
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 値を変更（保存しない）
      await page.getByLabel(/メモ/i).fill('キャンセルされる変更内容');

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // 詳細表示に戻ることを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`), {
        timeout: getTimeout(10000),
      });

      // 変更が破棄されていることを確認（キャンセルした変更内容が表示されない）
      await expect(page.getByText('キャンセルされる変更内容')).not.toBeVisible();
    });
  });

  /**
   * 楽観的排他制御・競合エラー検出のテスト
   *
   * 受入基準1.6: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
   */
  test.describe('楽観的排他制御', () => {
    /**
     * @requirement site-survey/REQ-1.6
     *
     * タスク 115.188 の是正: 本検証の表題・本文が述べる内容は名乗っていた番号の条文と
     * 対応していなかった。走査で候補を挙げ、原文と突き合わせて名乗り直している。
     */
    test('同時編集による競合時にエラーが表示される (site-survey/REQ-1.6)', async ({
      page,
      context,
    }) => {
      // 本ファイルは直列実行であり、事前準備がプロジェクトを、
      // 「現場調査を作成できる」が現場調査を作っている。前提が崩れたときに
      // このテスト内でデータを作り直すと、前提の生成が壊れたことが記録に残らないまま
      // 別のデータで緑になる。前提はここで無条件に主張する。
      assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
      assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
      const testSurveyId = createdSurveyId;

      await loginAsUser(page, 'REGULAR_USER');

      // 1つ目のブラウザコンテキストで編集ページを開く
      await page.goto(`/site-surveys/${testSurveyId}/edit`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel(/調査名/i)).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 2つ目のブラウザコンテキストを作成して同じ現場調査を編集
      const page2 = await context.newPage();
      await loginAsUser(page2, 'REGULAR_USER');
      await page2.goto(`/site-surveys/${testSurveyId}/edit`);
      await page2.waitForLoadState('networkidle');
      await expect(page2.getByLabel(/調査名/i)).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 2つ目のコンテキストで変更を保存
      const updatedMemo2 = `2つ目のコンテキスト変更_${Date.now()}`;
      await page2.getByLabel(/メモ/i).fill(updatedMemo2);

      const updatePromise2 = page2.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${testSurveyId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page2.getByRole('button', { name: /^保存$/ }).click();
      await updatePromise2;

      // 2つ目のコンテキストは成功するはず
      await expect(page2.getByText(/現場調査を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      await page2.close();

      // 1つ目のコンテキストで変更を保存しようとする（競合が発生するはず）
      const updatedMemo1 = `1つ目のコンテキスト変更_${Date.now()}`;
      await page.getByLabel(/メモ/i).fill(updatedMemo1);

      const updatePromise1 = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${testSurveyId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^保存$/ }).click();

      const response = await updatePromise1;

      // 409 Conflict が返されることを確認
      expect(response.status()).toBe(409);

      // 競合エラーが表示されることを確認（アラート内のメッセージを検証）
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: /他のユーザーによって更新されました/i })
          .first()
      ).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * プロジェクト不存在時の動作テスト
   *
   * REQ-1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
   */
  test.describe('プロジェクト不存在時の動作', () => {
    /**
     * 受入基準 1.6 は除外である（e2e/requirement-exclusions.json）。同居していた検証は存在しないプロジェクトを扱うもので、同時編集の競合検出を主張していないため、被覆印は掲げない。
     */
    test('存在しないプロジェクトに対する現場調査作成がエラーになる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないプロジェクトIDで現場調査作成ページにアクセス
      const nonExistentProjectId = '00000000-0000-0000-0000-000000000000';
      await page.goto(`/projects/${nonExistentProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // REQ-1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない。
      // 実装（SiteSurveyCreatePage）はプロジェクトを取得できないとき作成フォームを描画せず、
      // role="alert" でエラーを提示する。
      // 以前は「エラー文が出た、または リダイレクトされた」の論理和で判定していたが、
      // リダイレクト判定に含まれる `page.url().includes('/projects')` は、対象URLが
      // `/projects/{id}/site-surveys/new` である以上つねに真であり恒真だった。
      // 加えてエラー文の正規表現は実装の文言（「プロジェクトの取得に失敗しました」）に
      // 一致せず、左辺は一度も成立していない。
      // 「作成させない」ことの観測点は、エラーの提示と作成フォームの不在である。
      await expect(
        page.getByRole('alert').first(),
        'REQ-1.6: 存在しないプロジェクトでエラーが提示されない'
      ).toBeVisible({ timeout: getTimeout(5000) });
      await expect(
        page.getByLabel(/調査名/i),
        'REQ-1.6: 存在しないプロジェクトなのに現場調査の作成フォームが描画されている'
      ).toHaveCount(0);
    });

    /**
     * 受入基準 1.6 は除外である（e2e/requirement-exclusions.json）。同居していた検証は存在しないプロジェクトを扱うもので、同時編集の競合検出を主張していないため、被覆印は掲げない。
     */
    test('存在しないプロジェクトへの現場調査作成APIがエラーを返す', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないプロジェクトIDで現場調査作成APIを呼び出し
      const nonExistentProjectId = '00000000-0000-0000-0000-000000000000';
      const response = await page.evaluate(async (projectId) => {
        const accessToken = localStorage.getItem('accessToken');
        const res = await fetch(`/api/projects/${projectId}/site-surveys`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'テスト現場調査',
            surveyDate: new Date().toISOString().split('T')[0],
          }),
        });
        return { status: res.status };
      }, nonExistentProjectId);

      // 400, 404, または405エラーが返されることを確認
      // 405はルーティング層でメソッドが拒否された場合に返される
      expect([400, 404, 405]).toContain(response.status);
    });
  });

  /**
   * 現場調査削除フローのテスト
   *
   * 受入基準1.5: 現場調査を削除すると、現場調査と関連する画像データを論理削除する
   */
  test.describe('現場調査削除フロー', () => {
    /**
     * @requirement site-survey/REQ-1.5
     *
     * タスク 115.188 の是正: 本ファイルの被覆印は要件1 に受入基準が追加される前の番号
     * （旧 REQ-1.N）のままで、以降が一つずつずれていた。表題・本文が述べる内容と
     * 原文を突き合わせて名乗り直している。
     */
    test('削除ボタン→確認ダイアログ→削除→一覧遷移が正常に行われる (site-survey/REQ-1.5)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 削除権限はadminロールのみが持つ
      await loginAsUser(page, 'ADMIN_USER');

      // まず新しい現場調査を作成（削除テスト用）
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const deleteSurveyName = `削除テスト用現場調査_${Date.now()}`;
      await page.getByLabel(/調査名/i).fill(deleteSurveyName);
      await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/site-surveys\/[0-9a-f-]+$/, {
        timeout: getTimeout(15000),
      });

      // URLから現場調査IDを取得
      const url = page.url();
      const match = url.match(/\/site-surveys\/([0-9a-f-]+)$/);
      const surveyIdToDelete = match?.[1];

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /^削除$/ });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認（見出しを使用）
      await expect(page.getByRole('heading', { name: /現場調査を削除しますか/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // APIレスポンスを待機しながら削除確認ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${surveyIdToDelete}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除する」ボタンをクリック（詳細ページの「削除」ボタンと区別）
      const confirmDeleteButton = page.getByRole('button', { name: '削除する' });
      await confirmDeleteButton.click();

      // APIレスポンスを待機
      await deletePromise;

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys$`), {
        timeout: getTimeout(15000),
      });

      // 削除した現場調査が一覧に表示されないことを確認
      await page.waitForLoadState('networkidle');

      // トースト通知が消えるのを待つ（削除成功メッセージが表示される場合がある）
      await page.waitForTimeout(1000);

      // 一覧テーブル/リスト/グリッド内に限定して確認
      // survey-card-list, survey-grid, table のいずれかを使用
      const cardList = page.locator('[data-testid="survey-card-list"]');
      const gridList = page.locator('[data-testid="survey-grid"]');
      const tableBody = page.locator('tbody');

      // どのビューが表示されているか確認
      const isCardView = await cardList.isVisible().catch(() => false);
      const isGridView = await gridList.isVisible().catch(() => false);
      const isTableView = await tableBody.isVisible().catch(() => false);

      let deletedItemCount = 0;

      if (isCardView) {
        deletedItemCount = await cardList.getByText(deleteSurveyName, { exact: false }).count();
      } else if (isGridView) {
        deletedItemCount = await gridList.getByText(deleteSurveyName, { exact: false }).count();
      } else if (isTableView) {
        deletedItemCount = await tableBody.getByText(deleteSurveyName, { exact: false }).count();
      }

      expect(deletedItemCount).toBe(0);
    });

    /**
     * タスク 115.188 の是正: 従前は REQ-1.4 を名乗り、一律の一つずらしで REQ-1.5 に改めていたが、
     * 受入基準1.5 は「現場調査を削除する…論理削除する」であり、本検証は削除を**行わない**（確認ダイアログでキャンセルし、
     * 詳細画面に留まることだけを主張する）。削除のキャンセルを述べる受入基準は要件1 に存在しない（受入基準は7件まで）
     * 。ゆえに被覆印を**取り下げる**。上の「削除ボタン→確認ダイアログ→削除→一覧遷移」が受入基準1.5 を正しく名乗っているため
     * 、指標に穴は生じない。
     */
    test('削除確認ダイアログでキャンセルすると詳細画面に留まる', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 削除権限はadminロールのみが持つ
      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック（「削除」を正確にマッチ）
      const deleteButton = page.getByRole('button', { name: /^削除$/ });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認（見出しを使用）
      await expect(page.getByRole('heading', { name: /現場調査を削除しますか/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // ダイアログが閉じることを確認
      await expect(page.getByRole('heading', { name: /現場調査を削除しますか/i })).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`));
    });
  });

  /**
   * テスト後のクリーンアップ
   */
  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      // 管理者ユーザーに切り替えて削除
      // localStorageにアクセスする前にアプリケーションのページに移動
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 残っている現場調査があれば削除
      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /^削除$/ });
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          const confirmButton = page.getByRole('button', { name: '削除する' });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
          }
        }
      }

      // プロジェクトを削除
      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          // ダイアログ内の削除ボタンをクリック
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});
