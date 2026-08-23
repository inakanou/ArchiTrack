/**
 * @fileoverview 現場調査一覧・検索のE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-3.1: ページネーション付きで一覧表示
 * - REQ-3.2: 現場調査名・メモでの部分一致検索
 * - REQ-3.3: 調査日でフィルタリング
 * - REQ-3.4: 並び替え（調査日・作成日・更新日）
 * - REQ-3.5: サムネイル画像（代表画像）を表示
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査一覧・検索', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  const createdSurveyIds: string[] = [];
  const surveyNames: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('事前準備', () => {
    test('テスト用プロジェクトと複数の現場調査を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `一覧検索テスト用プロジェクト_${Date.now()}`;
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
      createdProjectId = projectMatch?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // 複数の現場調査を作成（検索・フィルタテスト用）
      const surveysToCreate = [
        { name: `検索テスト調査A_${Date.now()}`, memo: '東棟の調査メモ', date: '2024-01-15' },
        { name: `検索テスト調査B_${Date.now()}`, memo: '西棟の調査メモ', date: '2024-02-20' },
        { name: `特殊調査C_${Date.now()}`, memo: '屋上の点検メモ', date: '2024-03-10' },
      ];

      for (const survey of surveysToCreate) {
        await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
        await page.waitForLoadState('networkidle');

        await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

        await page.getByLabel(/調査名/i).fill(survey.name);
        await page.getByLabel(/調査日/i).fill(survey.date);
        await page.getByLabel(/メモ/i).fill(survey.memo);

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
        const surveyUrl = page.url();
        const surveyMatch = surveyUrl.match(/\/site-surveys\/([0-9a-f-]+)$/);
        const surveyId = surveyMatch?.[1] ?? null;

        if (surveyId) {
          createdSurveyIds.push(surveyId);
          surveyNames.push(survey.name);
        }
      }

      expect(createdSurveyIds.length).toBeGreaterThan(0);
    });
  });

  /**
   * @requirement site-survey/REQ-3.1
   */
  test.describe('一覧表示', () => {
    test('現場調査一覧がページネーション付きで表示される (site-survey/REQ-3.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されることを確認（h1の「現場調査一覧」見出しをマッチ）
      await expect(page.getByRole('heading', { name: '現場調査一覧', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 作成した現場調査が表示されることを確認
      for (const name of surveyNames) {
        await expect(page.getByText(name)).toBeVisible({ timeout: getTimeout(10000) });
      }

      // REQ-3.1: 一覧はページネーション付きで表示される。
      // 従来は「ページネーションが無ければ、作成した調査名の件数が 0 より大きいこと」を
      // 主張していた。これはテスト側の配列の長さを見ているだけで画面を検証しておらず、
      // ページネーションが無い状態を無条件に許していた。要件どおりの主張へ改める。
      const pagination = page.getByRole('navigation', { name: 'ページネーション' });
      await expect(pagination, 'REQ-3.1: 現場調査一覧にページネーションが表示されない').toBeVisible(
        { timeout: getTimeout(5000) }
      );

      // 総件数・現在ページ・総ページ数が画面に出る（件数の固定値ではなく取得結果に従う）
      await expect(
        pagination.getByTestId('total-count'),
        'REQ-3.1: 総件数が表示されない'
      ).toHaveText(String(surveyNames.length));
      await expect(pagination.getByTestId('current-page')).toHaveText('1');
      await expect(pagination.getByTestId('total-pages')).toHaveText('1');

      // ページを送る操作要素そのものが存在する
      await expect(pagination.getByRole('button', { name: '次のページ' })).toBeVisible();
      await expect(pagination.getByRole('button', { name: '前のページ' })).toBeVisible();
    });
  });

  /**
   * ページ送りの操作（REQ-3.1）
   *
   * 「ページネーション付きで表示する」は、操作要素が描かれるだけでは満たされない。
   * ページを送ったときに *別の* 現場調査が表示されて初めて要件を満たす。
   * そこで表示件数を超える件数の現場調査を専用のプロジェクトに用意し、
   *   (1) 総件数・総ページ数が取得結果に従って描かれること
   *   (2) 1 ページ目に表示件数ちょうどの現場調査が並ぶこと
   *   (3) 「次のページ」で 2 ページ目を要求し、1 ページ目と重ならない残りが出ること
   * を確かめる。要求そのものも `page` クエリで観測し、画面表示だけの見せかけを排する。
   * 既存の検索・日付フィルタ・並び替えの検証は件数の前提を持つため、
   * それらとはプロジェクトを分けて干渉させない。
   *
   * @requirement site-survey/REQ-3.1
   */
  test.describe('ページ送り', () => {
    /** 表示件数 10 件で 2 ページに割れる件数 */
    const PAGING_SURVEY_COUNT = 11;
    /** ページ送りの検証で選ぶ表示件数 */
    const PAGING_PAGE_SIZE = 10;

    let pagingProjectId: string | null = null;
    const pagingSurveyIds: string[] = [];

    /**
     * 一覧に並ぶ現場調査の ID を、描画されている行から取り出す。
     */
    async function readVisibleSurveyIds(page: import('@playwright/test').Page): Promise<string[]> {
      const rows = page.locator('[data-testid^="survey-row-"]');
      await expect(rows.first()).toBeVisible({ timeout: getTimeout(10000) });
      const testIds = await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-testid') ?? '')
      );
      return testIds.map((testId) => testId.replace('survey-row-', ''));
    }

    test('事前準備: 表示件数を超える件数の現場調査を用意する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `ページ送りテスト用プロジェクト_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createProjectPromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      pagingProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(pagingProjectId, 'ページ送り用プロジェクトが作成されていない').toBeTruthy();

      // 現場調査は API で直接作る（画面経由だと 11 件で著しく時間がかかる）。
      // 調査日を 1 日ずつずらし、既定の並び（調査日の新しい順）を一意に定める。
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      for (let i = 0; i < PAGING_SURVEY_COUNT; i++) {
        const surveyDate = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().split('T')[0]!;
        const response = await page.request.post(
          `${API_BASE_URL}/api/projects/${pagingProjectId}/site-surveys`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
              name: `ページ送りテスト調査${String(i + 1).padStart(2, '0')}_${Date.now()}`,
              surveyDate,
            },
          }
        );
        expect(
          response.status(),
          `ページ送り用の現場調査の作成に失敗した: ${await response.text()}`
        ).toBe(201);
        const body = (await response.json()) as { id?: string };
        expect(body.id, '現場調査の作成応答に id が含まれない').toBeTruthy();
        pagingSurveyIds.push(body.id!);
      }

      expect(pagingSurveyIds).toHaveLength(PAGING_SURVEY_COUNT);
    });

    test('表示件数を超える現場調査はページに分けて表示される (site-survey/REQ-3.1)', async ({
      page,
    }) => {
      expect(pagingProjectId, '事前準備が実行されていない').toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${pagingProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      const pagination = page.getByRole('navigation', { name: 'ページネーション' });
      await expect(pagination, 'ページ送りの操作要素が無い').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(pagination.getByTestId('total-count')).toHaveText(String(PAGING_SURVEY_COUNT));

      // 表示件数を 10 件へ変える。オリジンは環境で食い違うためパスとクエリで観測する。
      const limitRequest = page.waitForRequest(
        (request) => {
          const url = new URL(request.url());
          return (
            url.pathname.endsWith(`/api/projects/${pagingProjectId}/site-surveys`) &&
            url.searchParams.get('limit') === String(PAGING_PAGE_SIZE) &&
            url.searchParams.get('page') === '1'
          );
        },
        { timeout: getTimeout(30000) }
      );
      await pagination.getByLabel('表示件数').selectOption(String(PAGING_PAGE_SIZE));
      await limitRequest;

      await expect(pagination.getByTestId('total-pages')).toHaveText('2');
      await expect(pagination.getByTestId('current-page')).toHaveText('1');

      // 1 ページ目は表示件数ちょうど
      const firstPageIds = await readVisibleSurveyIds(page);
      expect(
        firstPageIds,
        `1 ページ目の件数が表示件数と一致しない: ${firstPageIds.length}`
      ).toHaveLength(PAGING_PAGE_SIZE);

      // 「次のページ」で 2 ページ目を要求する
      const nextPageRequest = page.waitForRequest(
        (request) => {
          const url = new URL(request.url());
          return (
            url.pathname.endsWith(`/api/projects/${pagingProjectId}/site-surveys`) &&
            url.searchParams.get('page') === '2'
          );
        },
        { timeout: getTimeout(30000) }
      );
      await pagination.getByRole('button', { name: '次のページ' }).click();
      await nextPageRequest;

      await expect(pagination.getByTestId('current-page')).toHaveText('2');

      // 2 ページ目は残りだけが並び、1 ページ目と 1 件も重ならない
      await expect
        .poll(async () => (await readVisibleSurveyIds(page)).length, {
          timeout: getTimeout(15000),
        })
        .toBe(PAGING_SURVEY_COUNT - PAGING_PAGE_SIZE);
      const secondPageIds = await readVisibleSurveyIds(page);
      for (const id of secondPageIds) {
        expect(firstPageIds, '2 ページ目に 1 ページ目と同じ現場調査が並んでいる').not.toContain(id);
      }
      expect(
        new Set([...firstPageIds, ...secondPageIds]).size,
        'ページを送っても全件に到達できない'
      ).toBe(PAGING_SURVEY_COUNT);

      // 「前のページ」で 1 ページ目へ戻れる
      await pagination.getByRole('button', { name: '前のページ' }).click();
      await expect(pagination.getByTestId('current-page')).toHaveText('1');
      await expect
        .poll(async () => (await readVisibleSurveyIds(page)).length, {
          timeout: getTimeout(15000),
        })
        .toBe(PAGING_PAGE_SIZE);

      // 2 ページ目を見ている最中に表示件数を変えたら、先頭ページから取り直す。
      // 先頭ページのまま表示件数だけを変えても「先頭へ戻す」挙動は観測できないため、
      // 戻す前と戻す先が実際に異なる状態を作ってから確かめる。
      await pagination.getByRole('button', { name: '次のページ' }).click();
      await expect(pagination.getByTestId('current-page')).toHaveText('2');

      const resetRequest = page.waitForRequest(
        (request) => {
          const url = new URL(request.url());
          return (
            url.pathname.endsWith(`/api/projects/${pagingProjectId}/site-surveys`) &&
            url.searchParams.get('limit') === String(PAGING_SURVEY_COUNT + 9) &&
            url.searchParams.get('page') === '1'
          );
        },
        { timeout: getTimeout(30000) }
      );
      await pagination.getByLabel('表示件数').selectOption(String(PAGING_SURVEY_COUNT + 9));
      await resetRequest;

      await expect(
        pagination.getByTestId('current-page'),
        '表示件数を変えても 2 ページ目のままになっている'
      ).toHaveText('1');
      await expect(pagination.getByTestId('total-pages')).toHaveText('1');
      await expect
        .poll(async () => (await readVisibleSurveyIds(page)).length, {
          timeout: getTimeout(15000),
        })
        .toBe(PAGING_SURVEY_COUNT);
    });
  });

  /**
   * @requirement site-survey/REQ-3.2
   */
  test.describe('検索機能', () => {
    test('現場調査名で部分一致検索ができる (site-survey/REQ-3.2)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 検索入力フィールドを探す
      const searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/検索/i)).first();

      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // 「検索テスト」で検索
      await searchInput.fill('検索テスト');
      await searchInput.press('Enter');

      // 検索結果を待機
      await page.waitForLoadState('networkidle');

      // 「検索テスト」を含む調査が表示されることを確認
      const matchingNames = surveyNames.filter((name) => name.includes('検索テスト'));
      for (const name of matchingNames) {
        await expect(page.getByText(name)).toBeVisible({ timeout: getTimeout(10000) });
      }

      // 「特殊調査」は検索結果に表示されないことを確認
      const nonMatchingNames = surveyNames.filter((name) => !name.includes('検索テスト'));
      for (const name of nonMatchingNames) {
        await expect(page.getByText(name)).not.toBeVisible({ timeout: getTimeout(5000) });
      }
    });

    test('メモで部分一致検索ができる (site-survey/REQ-3.2)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      const searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/検索/i)).first();

      await expect(searchInput).toBeVisible({ timeout: 5000 });

      // 「東棟」で検索
      await searchInput.fill('東棟');
      await searchInput.press('Enter');

      await page.waitForLoadState('networkidle');

      // 「東棟」を含むメモの調査が表示されることを確認
      // 検索結果が1件以上あることを確認
      const surveyItems = page.locator('[data-testid="survey-item"], .survey-item, tbody tr');
      const count = await surveyItems.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  /**
   * @requirement site-survey/REQ-3.3
   */
  test.describe('日付フィルタリング', () => {
    test('調査日でフィルタリングができる (site-survey/REQ-3.3)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 日付フィルターを探す（type="date"の入力フィールド）
      const dateFilterFrom = page.locator('input[type="date"]').first();

      await expect(dateFilterFrom).toBeVisible({ timeout: 5000 });

      // 2024年2月以降でフィルタリング
      await dateFilterFrom.fill('2024-02-01');

      // フィルター適用を待機
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500); // API呼び出し完了を待機

      // フィルター結果を確認
      const surveyItems = page.locator('[data-testid="survey-item"], .survey-item, tbody tr');
      const count = await surveyItems.count();
      // フィルター後は2件（2024-02-20と2024-03-10）のみ表示されるはず
      expect(count).toBeLessThanOrEqual(3); // 余裕を持たせる
    });
  });

  /**
   * @requirement site-survey/REQ-3.4
   */
  test.describe('並び替え', () => {
    test('調査日でソートができる (site-survey/REQ-3.4)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // REQ-3.4: 並び替えを変更すると調査日・作成日・更新日でソートした結果を表示する。
      // 並び替えの選択欄は一覧画面に常に描画される（SiteSurveyListPage）。表のヘッダは
      // 画面幅により現れたり消えたりするが、この欄は幅に依らない。
      // 以前は「ボタン または 列見出し または 選択欄」の論理和で判定し、そのうえで
      // どれを使うかで分岐していた。三つのうち一つでも残れば通るため、
      // 並び替えの手段が失われたことを検出できなかった。
      // 同ファイルの「作成日でソートができる」と同じく、選択欄そのものを主張する。
      const sortSelect = page.getByLabel(/ソート項目/i);
      await expect(sortSelect, '並び替えの選択欄が表示されない').toBeVisible({
        timeout: getTimeout(5000),
      });

      const options = await sortSelect.locator('option').allTextContents();
      const dateOption = options.find((opt) => opt.includes('調査日'));
      expect(
        dateOption,
        `ソート項目に調査日の候補が無い（候補: ${options.join(' / ')}）`
      ).toBeTruthy();
      await sortSelect.selectOption({ label: dateOption! });

      await page.waitForLoadState('networkidle');

      // ソート後の一覧が表示されることを確認
      const surveyItems = page.locator('[data-testid="survey-item"], .survey-item, tbody tr');
      const count = await surveyItems.count();
      expect(count).toBeGreaterThan(0);
    });

    test('作成日でソートができる (site-survey/REQ-3.4)', async ({ page }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // ソート項目選択ドロップダウンを探す
      const sortSelect = page.locator('select[aria-label="ソート項目"]');
      await expect(sortSelect).toBeVisible({ timeout: getTimeout(5000) });

      // 「作成日」オプションを選択
      await sortSelect.selectOption('createdAt');

      await page.waitForLoadState('networkidle');

      const surveyItems = page.locator('[data-testid="survey-item"], .survey-item, tbody tr');
      const count = await surveyItems.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  /**
   * @requirement site-survey/REQ-3.5
   */
  test.describe('サムネイル表示', () => {
    test('画像を登録していない現場調査の行にはプレースホルダーが表示される (site-survey/REQ-3.5)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }
      if (createdSurveyIds.length < 2) {
        throw new Error(
          '現場調査が2件以上作成されていません。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 2件目の現場調査には本ファイルのどのテストも画像を登録しない。
      // そのため代表画像は存在せず、サムネイル欄にはプレースホルダーが描画される
      // （SiteSurveyListTable: 代表画像が無い場合の thumbnail-placeholder）。
      // 以前は画面全体を対象に「サムネイル または プレースホルダー」の論理和で
      // 判定していたが、前者が現れる経路が無いため判定はプレースホルダーだけで
      // 常に成立していた。判定を当該行に限定し、代表画像が無いことも併せて主張する。
      const withoutImageRow = page.getByTestId(`survey-row-${createdSurveyIds[1]}`);
      await expect(withoutImageRow, '画像を登録していない現場調査の行が一覧に無い').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(
        withoutImageRow.getByTestId('thumbnail-placeholder'),
        '画像の無い現場調査にサムネイルのプレースホルダーが表示されない'
      ).toBeVisible({ timeout: getTimeout(5000) });
      await expect(
        withoutImageRow.locator('img'),
        '画像を登録していないのに代表画像が描画されている'
      ).toHaveCount(0);
    });

    test('画像を登録した現場調査の行に代表画像が表示される (site-survey/REQ-3.5)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }
      if (createdSurveyIds.length === 0) {
        throw new Error('現場調査が作成されていません。事前準備テストが正しく実行されていません。');
      }

      const targetSurveyId = createdSurveyIds[0];
      const targetSurveyName = surveyNames[0];

      await loginAsUser(page, 'REGULAR_USER');

      // REQ-3.5 の本体（代表画像の表示）を確かめるための前提を実際に作る。
      // 手順は site-survey-performance.spec.ts の画像アップロードと同じで、
      // 現場調査詳細画面のファイル入力へ画像を1枚渡し、登録APIの成功応答を待つ。
      await page.goto(`/site-surveys/${targetSurveyId}`);
      await page.waitForLoadState('networkidle');

      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
      expect(fs.existsSync(testImagePath), 'テスト用画像ファイルが存在しない').toBeTruthy();

      const fileInput = page.locator('input[type="file"]').first();
      await expect(fileInput, '現場調査詳細画面にファイル入力が無い').toBeAttached({
        timeout: getTimeout(15000),
      });

      // オリジンは環境（CI／ローカル）で食い違うためパスで判定する。
      const uploadResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.includes('/images') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );
      await fileInput.setInputFiles(testImagePath);
      const uploadResponse = await uploadResponsePromise;
      expect(uploadResponse.ok(), '画像の登録APIが成功応答を返さない').toBeTruthy();

      // 一覧画面に戻り、当該現場調査の行に代表画像が実際に描画されることを確かめる。
      // 代表画像は先頭画像から作られ（site-survey.service の thumbnailImageId /
      // thumbnailOriginalPath / thumbnailUrl）、SiteSurveyListTable は
      // alt="<調査名>のサムネイル" の img を描画する
      // （注釈が保存されている場合は同じ接頭辞に「（注釈付き）」が付く）。
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      const targetRow = page.getByTestId(`survey-row-${targetSurveyId}`);
      await expect(targetRow, '画像を登録した現場調査の行が一覧に無い').toBeVisible({
        timeout: getTimeout(15000),
      });

      const thumbnail = targetRow.locator(`img[alt^="${targetSurveyName}のサムネイル"]`);
      await expect(
        thumbnail,
        '画像を登録した現場調査の行に代表画像（サムネイル）が表示されない'
      ).toBeVisible({ timeout: getTimeout(20000) });
      await expect(
        targetRow.getByTestId('thumbnail-placeholder'),
        '代表画像があるのにプレースホルダーが描画されている'
      ).toHaveCount(0);
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      await context.clearCookies();
      // localStorageクリア前にアプリにナビゲートする必要がある
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 現場調査を削除
      for (const surveyId of createdSurveyIds) {
        await page.goto(`/site-surveys/${surveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: 5000 });
        await deleteButton.click();
        // 削除確認ダイアログが表示されるのを待機
        const confirmButton = page.getByRole('button', { name: '削除する' });
        await expect(confirmButton).toBeVisible({ timeout: 5000 });
        await confirmButton.click();
        await page.waitForURL(/\/site-surveys$|\/projects\//, { timeout: getTimeout(15000) });
      }

      // プロジェクトを削除
      assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const projectDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(projectDeleteButton).toBeVisible({ timeout: 5000 });
      await projectDeleteButton.click();
      const projectConfirmButton = page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i });
      await expect(projectConfirmButton).toBeVisible({ timeout: 5000 });
      await projectConfirmButton.click();
      await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
    });
  });
});
