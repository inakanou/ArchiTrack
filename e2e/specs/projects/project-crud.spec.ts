/**
 * @fileoverview プロジェクトCRUD操作のE2Eテスト
 *
 * Task 16.1: プロジェクトCRUD E2Eテスト
 *
 * Requirements (project-management):
 * - 1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
 * - 1.7: 「作成」ボタンをクリックした場合、プロジェクトが作成され、詳細画面に遷移
 * - 1.8: 作成成功時に成功メッセージを表示
 * - 8.1: プロジェクト詳細画面で「編集」ボタンをクリックすると編集フォームを表示
 * - 8.2: 編集フォームには現在のプロジェクト情報がプリセット表示される
 * - 8.3: 編集を保存すると成功メッセージを表示し、詳細画面に戻る
 * - 8.9: キャンセルボタンクリック時の動作
 * - 8.10: 編集中に他のユーザーがプロジェクトを更新した場合の楽観的排他制御
 * - 9.1: 「削除」ボタンをクリックすると削除確認ダイアログを表示
 * - 9.2: 削除確認ダイアログで「削除」を選択すると削除される
 * - 9.3: 削除後、一覧画面に遷移する
 * - 9.5: 関連データ（現場調査・内訳書・見積依頼・受領見積書など）があるとき、警告の文と種類ごとの件数を出し、
 *   「削除する」「キャンセル」を出す（2026-11-09 改訂）
 * - 9.6: 関連データ警告ダイアログで「削除する」を選ぶと論理削除され、関連データも表示・取得の対象から外れる
 *   （2026-11-09 改訂）
 * - 46.2: 論理削除したプロジェクトの関連データの詳細の URL は、存在しないものと同じ不在の表示になる
 * - 46.4: 削除確認ダイアログに、関連データと共に90日後に完全に削除され元に戻せない旨を出す
 *
 * 被覆する受入基準は各テストの `@requirement` の印が名乗る。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { TEST_USERS } from '../../helpers/test-users';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import { seedProject } from '../../helpers/project-list-preconditions';

// ============================================================================
// 関連データを持つプロジェクトの前提（9.5・9.6・46.2・46.4）
// ============================================================================

/** 関連データの検証でテストの中で作る案件・取引先・関連データの名前の接頭辞（後始末で消す） */
const RELATED_NAME_PREFIX = 'e2e-pm-crud-related-';

/** 削除確認ダイアログの関連データの警告の文（9.5 の逐語） */
const RELATED_DATA_WARNING = '関連データがあります。本当に削除しますか？';

/** 削除確認ダイアログの保持期間の文（46.4） */
const RETENTION_NOTICE =
  '削除したプロジェクトは、関連データと共に90日後に完全に削除され、元に戻せません。';

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 関連データを持つプロジェクトの前提 */
interface ProjectWithRelatedData {
  projectId: string;
  projectName: string;
  siteSurveyId: string;
  itemizedStatementId: string;
  estimateRequestId: string;
}

/**
 * 関連データを持つプロジェクトを DB に作る。
 *
 * 一般ユーザーを営業担当者・作成者とする。関連データは次のとおりで、
 * 期待する件数はこの入力から定まる（論理削除したものは数えない）。
 *
 * - 現場調査 2件（ほかに論理削除したもの 1件）
 * - 内訳書 1件（見積依頼が参照する）
 * - 見積依頼 1件
 * - 受領見積書 2件（見積依頼に紐づくもの 1件・紐づかないもの 1件。ほかに論理削除したもの 1件）
 */
async function seedProjectWithRelatedData(): Promise<ProjectWithRelatedData> {
  const prisma = getPrismaClient();
  const owner = await prisma.user.findUnique({
    where: { email: TEST_USERS.REGULAR_USER.email },
    select: { id: true },
  });
  const ownerId = owner?.id;
  assertPrepared(ownerId, '営業担当者とする一般ユーザーのID');

  const suffix = uniqueSuffix();
  const project = await prisma.project.create({
    data: {
      name: `${RELATED_NAME_PREFIX}案件-${suffix}`,
      salesPersonId: ownerId,
      createdById: ownerId,
    },
    select: { id: true, name: true },
  });

  const surveys = [];
  for (const [label, deletedAt] of [
    ['一回目', null],
    ['二回目', null],
    ['論理削除済み', new Date()],
  ] as const) {
    surveys.push(
      await prisma.siteSurvey.create({
        data: {
          projectId: project.id,
          name: `${RELATED_NAME_PREFIX}現場調査-${label}-${suffix}`,
          surveyDate: new Date('2026-10-27'),
          deletedAt,
        },
        select: { id: true },
      })
    );
  }

  const partner = await prisma.tradingPartner.create({
    data: {
      name: `${RELATED_NAME_PREFIX}業者-${suffix}`,
      nameKana: 'イーツーイークラッドギョウシャ',
      address: '東京都千代田区1-1-1',
      email: 'e2e-pm-crud-related-partner@example.com',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true, name: true },
  });

  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId: project.id,
      name: `${RELATED_NAME_PREFIX}内訳書-${suffix}`,
      sourceQuantityTableId: `${RELATED_NAME_PREFIX}qt-${suffix}`,
      sourceQuantityTableName: '関連データの検証の数量表',
      items: {
        create: [
          { workType: '内装工事', name: '床の張替え', unit: 'm2', quantity: 12, displayOrder: 1 },
        ],
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });

  const estimateRequest = await prisma.estimateRequest.create({
    data: {
      projectId: project.id,
      tradingPartnerId: partner.id,
      itemizedStatementId: statement.id,
      name: `${RELATED_NAME_PREFIX}見積依頼-${suffix}`,
      selectedItems: {
        create: statement.items.map((item) => ({
          itemizedStatementItemId: item.id,
          selected: true,
        })),
      },
    },
    select: { id: true },
  });

  for (const input of [
    { label: '見積依頼に紐づく', estimateRequestId: estimateRequest.id, deletedAt: null },
    { label: '見積依頼に紐づかない', estimateRequestId: null, deletedAt: null },
    { label: '論理削除済み', estimateRequestId: null, deletedAt: new Date() },
  ]) {
    await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        estimateRequestId: input.estimateRequestId,
        tradingPartnerId: input.estimateRequestId ? partner.id : null,
        vendorName: input.estimateRequestId ? partner.name : '関連データの検証の業者',
        name: `${RELATED_NAME_PREFIX}受領見積書-${input.label}-${suffix}`,
        submittedAt: new Date('2026-10-20'),
        netAmount: 100000,
        deletedAt: input.deletedAt,
      },
    });
  }

  const siteSurveyId = surveys[0]?.id;
  assertPrepared(siteSurveyId, '論理削除していない現場調査のID');
  return {
    projectId: project.id,
    projectName: project.name,
    siteSurveyId,
    itemizedStatementId: statement.id,
    estimateRequestId: estimateRequest.id,
  };
}

/** 関連データの検証で作ったものを消す（受領見積書・見積依頼は案件・内訳書を Restrict で指すため先に消す） */
async function cleanupProjectsWithRelatedData(): Promise<void> {
  const prisma = getPrismaClient();
  const projectWhere = { project: { name: { startsWith: RELATED_NAME_PREFIX } } };
  await prisma.receivedQuotation.deleteMany({ where: projectWhere });
  await prisma.estimateRequest.deleteMany({ where: projectWhere });
  await prisma.project.deleteMany({ where: { name: { startsWith: RELATED_NAME_PREFIX } } });
  await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: RELATED_NAME_PREFIX } } });
}

/** 名前で検索したプロジェクト一覧の画面を開き、画面が受け取った一覧の応答のプロジェクトIDを返す */
async function openProjectListSearch(page: Page, name: string): Promise<{ ids: string[] }> {
  const listResponse = page.waitForResponse(
    (r) => {
      const url = new URL(r.url());
      return (
        r.request().method() === 'GET' &&
        url.pathname === '/api/projects' &&
        url.searchParams.get('search') === name
      );
    },
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/projects?search=${encodeURIComponent(name)}`);
  const response = await listResponse;
  expect(response.status(), '前提: 一覧の取得が成功する').toBe(200);
  const body = (await response.json()) as { data: Array<{ id: string }> };
  return { ids: body.data.map((p) => p.id) };
}

/** プロジェクト一覧の表の中の、指定の名前のプロジェクトの行 */
function projectRows(page: Page, name: string) {
  return page
    .getByRole('table', { name: 'プロジェクト一覧' })
    .getByRole('row')
    .filter({ hasText: name });
}

/** 関連データの詳細の URL を開き、不在の表示（ResourceNotFound）が出ることを確かめる */
async function expectNotFoundDisplay(page: Page, url: string, resourceType: string): Promise<void> {
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: `${resourceType}が見つかりません`, exact: true }),
    `${url} が不在の表示になる`
  ).toBeVisible({ timeout: getTimeout(15000) });
  await expect(
    page.getByText(`指定された${resourceType}は存在しないか、削除されています。`, { exact: true })
  ).toBeVisible();
}

/**
 * プロジェクトCRUD機能のE2Eテスト
 */
test.describe('プロジェクトCRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * プロジェクト作成フローのテスト
   *
   * REQ-1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
   * REQ-1.7: プロジェクトが作成され、詳細画面に遷移
   * REQ-1.8: 作成成功時に成功メッセージを表示
   */
  test.describe('プロジェクト作成フロー', () => {
    /**
     * @requirement project-management/REQ-1.1
     */
    test('新規作成ボタンから作成フォームへ遷移できる (project-management/REQ-1.1)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧ページに移動
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 「新規作成」ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /新規プロジェクト/i })).toBeVisible();
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible();
      await expect(page.getByLabel(/顧客名/i)).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-1.10
     * @requirement project-management/REQ-1.11
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.10 は必須項目を入力しての保存、1.11 は保存成功時の詳細画面遷移。旧 1.7・1.8 は現行では顧客選択時の住所保持と営業担当者の既定値）。
     */
    test('フォーム入力→送信→詳細画面遷移が正常に行われる (project-management/REQ-1.10, REQ-1.11)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン（管理者は営業担当者として選択できないため）
      await loginAsUser(page, 'REGULAR_USER');

      // ログイン成功後、一覧ページに移動してからフォームに遷移する
      // （認証状態が完全に確立されてからのナビゲーション）
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 一覧ページで新規作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 営業担当者のセレクトボックスが読み込み完了になるまで待機
      // 「読み込み中...」または「ユーザー一覧の取得に失敗しました」が表示されなくなるまで待機
      // Note: 2つのUserSelectコンポーネントがあるため.first()を使用
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // エラーがないことを確認（countで0件であることを確認）
      await expect(page.getByText(/ユーザー一覧の取得に失敗しました/i)).toHaveCount(0, {
        timeout: getTimeout(5000),
      });

      // 営業担当者セレクトボックスにユーザーが表示されていることを確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const projectName = `E2Eテストプロジェクト_${Date.now()}`;
      const siteAddress = '東京都渋谷区テスト1-2-3';
      const description = 'E2Eテスト用のプロジェクト説明文です。';

      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      // 取引先は任意フィールドなのでスキップ（選択しない）
      await page.getByLabel(/現場住所/i).fill(siteAddress);
      await page.getByLabel(/概要/i).fill(description);

      // 営業担当者は必須項目である。既定値の解決に依存せず候補から選び直し、
      // 前提が崩れた場合はこの場で失敗させる（Task 115.92）
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機
      const response = await createPromise;

      // APIレスポンスが成功であることを確認
      expect(response.status()).toBe(201);

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面にプロジェクト情報が表示されることを確認
      // プロジェクト名は複数箇所に表示されるのでheadingを指定
      await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
      // 取引先は選択していないので"-"が表示される
      await expect(page.getByText(/-/).first()).toBeVisible();

      // 作成したプロジェクトのIDを保存（後続テストで使用）
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
    });

    /**
     * @requirement project-management/REQ-1.2
     */
    test('作成フォームに必須フィールド・任意フィールドが表示される (project-management/REQ-1.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 必須フィールドの確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(
        page.locator('input[aria-label="プロジェクト名"][aria-required="true"]')
      ).toBeVisible();

      await expect(page.locator('select[aria-label="営業担当者"]')).toBeVisible();
      await expect(
        page.locator('select[aria-label="営業担当者"][aria-required="true"]')
      ).toBeVisible();

      // 任意フィールドの確認
      await expect(page.locator('[role="combobox"][aria-label="顧客名"]')).toBeVisible();
      await expect(page.locator('select[aria-label="工事担当者"]')).toBeVisible();
      await expect(page.getByLabel(/現場住所/i)).toBeVisible();
      await expect(page.getByLabel(/概要/i)).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-1.8
     * @requirement project-management/REQ-1.9
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.8 が営業担当者、1.9 が工事担当者の既定値。旧 1.5・1.6 は現行では取引先IDの設定と現場住所の自動入力）。
     */
    test('営業担当者・工事担当者フィールドにログインユーザーがデフォルト設定される (project-management/REQ-1.8, REQ-1.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者のデフォルト値を確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      expect(salesPersonValue).toBeTruthy(); // 何らかの値が設定されている

      // 工事担当者のデフォルト値を確認
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      const constructionPersonValue = await constructionPersonSelect.inputValue();
      expect(constructionPersonValue).toBeTruthy(); // 何らかの値が設定されている
    });

    /**
     * @requirement project-management/REQ-1.12
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.12 が必須項目未入力時の該当フィールドへのエラー表示。旧 1.9 は現行では工事担当者の既定値）。
     */
    test('必須項目未入力時にバリデーションエラーが表示される (project-management/REQ-1.12)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-1.13
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.13 が「プロジェクト名は必須です」の表示。旧 1.10 は現行では必須項目を入力しての保存）。
     */
    test('プロジェクト名未入力時にバリデーションエラーが表示される (project-management/REQ-1.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先は任意なので何も入力しない
      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // プロジェクト名のバリデーションエラーを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-1.14
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.14 が255文字超過時のエラー。旧 1.11 は現行では保存成功時の詳細画面遷移）。
     */
    test('プロジェクト名が255文字を超える場合にバリデーションエラーが表示される (project-management/REQ-1.14)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 256文字のプロジェクト名を入力
      const longName = 'あ'.repeat(256);
      await page.getByLabel(/プロジェクト名/i).fill(longName);

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // 文字数超過のバリデーションエラーを確認
      await expect(page.getByText(/プロジェクト名は255文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    // Note: 「営業担当者未選択時のバリデーション」を述べるのは受入基準1.15 であり、
    // 直後のテストで実施済み（従前この註釈は 1.12 と書いていたが、原文1.12 は
    // 「必須項目を入力せずに『作成』ボタンをクリックしたとき入力エラーメッセージを
    // 該当フィールドに表示する」であり、タスク 115.188 で現況へ改めた）。
    // 取引先（顧客名）は任意フィールドのため、バリデーションテスト不要。

    /**
     * @requirement project-management/REQ-1.15
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.15 が「営業担当者は必須です」の表示。旧 1.12 は現行では必須項目未入力時の該当フィールドへのエラー表示）。
     */
    test('営業担当者未選択時にバリデーションエラーが表示される (project-management/REQ-1.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力（取引先は任意のためスキップ）
      await page.getByLabel(/プロジェクト名/i).fill('テストプロジェクト');

      // 営業担当者を空にする（required属性でdisabledになっている空オプションを選択するため、JavaScriptで直接操作）
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await salesPersonSelect.evaluate((select) => {
        (select as unknown as { value: string }).value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // 営業担当者のバリデーションエラーを確認
      await expect(page.getByText(/営業担当者は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-1.16
     * @requirement project-management/REQ-1.17
     *
     * タスク 115.188 の是正: project-management 要件1 は受入基準が19件へ増えており、
     * 本ファイルの被覆印は増える前の番号のままで一律にずれていた。表題・本文が述べる
     * 内容と原文を一件ずつ突き合わせて名乗り直している（受入基準1.16 が作成日時と作成者の自動記録、1.17 が一意IDの自動付与。旧 1.13・1.14 は現行ではプロジェクト名の必須・文字数のエラー）。
     */
    test('プロジェクト作成時に作成日時・作成者・IDが自動記録される (project-management/REQ-1.16, REQ-1.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `自動記録テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // プロジェクト作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを確認
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseData = await response.json();

      // 一意のIDが付与されていることを確認
      expect(responseData.id).toBeTruthy();
      expect(typeof responseData.id).toBe('string');

      // 作成日時が記録されていることを確認
      expect(responseData.createdAt).toBeTruthy();
      const createdAt = new Date(responseData.createdAt);
      expect(createdAt.getTime()).toBeGreaterThan(0);

      // 作成者が記録されていることを確認
      expect(responseData.createdById).toBeTruthy();
    });
  });

  /**
   * プロジェクト編集フローのテスト
   *
   * REQ-8.1: 「編集」ボタンをクリックすると編集フォームを表示
   * REQ-8.2: 編集フォームには現在のプロジェクト情報がプリセット表示される
   * REQ-8.3: 編集を保存すると成功メッセージを表示し、詳細画面に戻る
   */
  test.describe('プロジェクト編集フロー', () => {
    /**
     * @requirement project-management/REQ-8.1
     * @requirement project-management/REQ-8.2
     * @requirement project-management/REQ-8.7
     *
     * タスク 115.188 の是正: 従前は REQ-8.3 を名乗っていたが、受入基準8.3 の原文は「When ユーザーが顧客名フィールドで検索テキストを入力する,
     * the ArchiTrackシステム shall 取引先管理機能で登録された取引先を検索フィルタリングして表示する」
     * である。本区間の表題・本文が述べる内容に対応するのは受入基準8.7（「When プロジェクトが正常に更新される, the ArchiTrackシステム
     * shall 更新日時を自動的に記録し、成功メッセージを表示する」）である。
     */
    test('編集ボタン→フォーム表示→保存→成功メッセージが正常に行われる (project-management/REQ-8.1, REQ-8.2, REQ-8.7)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン（編集は一般ユーザーでも可能）
      await loginAsUser(page, 'REGULAR_USER');

      // 編集対象のプロジェクトを前提として無条件に用意する。
      // 「先行テストが ID を残していれば使い、無ければ画面から作る」という復旧分岐は、
      // 先行テストが壊れたときに何を編集しているのかが定まらず、
      // 前提の崩れが REQ-8.x の失敗として現れないため置かない。
      const editTargetProjectId = (
        await seedProject(page, 'REGULAR_USER', '編集テスト用プロジェクト')
      ).id;

      // 詳細ページに移動
      await page.goto(`/projects/${editTargetProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 現在の値がプリセットされていることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toHaveValue(/.+/);

      // 値を変更
      const updatedDescription = `E2E編集テスト_更新済み_${Date.now()}`;
      await page.getByLabel(/概要/i).fill(updatedDescription);

      // APIレスポンスを待機しながら保存ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${editTargetProjectId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      // APIレスポンスを待機
      await updatePromise;

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/プロジェクトを更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細表示に戻ることを確認（編集ヘッダーが消える）
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // 更新した内容が反映されていることを確認
      await expect(page.getByText(updatedDescription)).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-8.5
     * @requirement project-management/REQ-8.9
     */
    test('編集キャンセル時は変更が破棄される (project-management/REQ-8.5, REQ-8.9)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      await page.getByRole('button', { name: /編集/i }).click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 値を変更（保存しない）
      await page.getByLabel(/概要/i).fill('キャンセルされる変更内容');

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // 詳細表示に戻ることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // 変更が破棄され、元の値が表示されていることを確認
      // キャンセルしたので「キャンセルされる変更内容」は表示されない
      await expect(page.getByText('キャンセルされる変更内容')).not.toBeVisible();

      // 詳細画面が表示されていることを確認
      await expect(page.getByText(/概要/i)).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-8.8
     *
     * タスク 115.188 の是正: 従前は REQ-8.4 を名乗っていたが、受入基準8.4 は「顧客名フィールドでフリガナを検索
     * する…ひらがな・カタカナどちらの入力でも取引先候補を検索する」であり、本検証が主張するバリデーションエラーの表示を述べるのは受入
     * 基準8.8（バリデーションエラーが発生した場合、エラーメッセージを該当フィールドに表示する）
     * である。
     */
    test('編集時にバリデーションエラーが発生するとエラーメッセージが表示される (project-management/REQ-8.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /編集/i }).click();
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクト名を空にしてバリデーションエラーを発生させる
      await page.getByLabel(/プロジェクト名/i).fill('');
      await page.getByRole('button', { name: /保存/i }).click();

      // バリデーションエラーメッセージが表示されることを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-8.6
     * @requirement project-management/REQ-8.10
     */
    test('編集中に他のユーザーがプロジェクトを更新した場合、競合エラーが表示される (project-management/REQ-8.6, REQ-8.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // Note: 楽観的ロックの競合をE2Eテストで再現するのは困難なため、
      // ここでは編集フォームが正常に表示されることを確認
      // 実際の競合処理は統合テストで検証する

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /編集/i }).click();
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 編集フォームが表示されることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible();
    });
  });

  /**
   * プロジェクト削除フローのテスト
   *
   * REQ-9.1: 「削除」ボタンをクリックすると削除確認ダイアログを表示
   * REQ-9.2: 削除確認ダイアログで「削除」を選択すると削除される
   * REQ-9.3: 削除後、一覧画面に遷移する
   */
  test.describe('プロジェクト削除フロー', () => {
    test.afterAll(async () => {
      await cleanupProjectsWithRelatedData();
    });

    /**
     * @requirement project-management/REQ-9.1
     * @requirement project-management/REQ-9.2
     * @requirement project-management/REQ-9.3
     * @requirement project-management/REQ-46.4
     */
    test('削除ボタン→確認ダイアログ→削除→一覧遷移が正常に行われる (project-management/REQ-9.1, REQ-9.2, REQ-9.3, REQ-46.4)', async ({
      page,
      context,
    }) => {
      // Step 1: 一般ユーザーでプロジェクトを作成（管理者は営業担当者として選択できないため）
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧ページに移動してから作成画面へ
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ユーザーAPI応答待機を開始してからボタンをクリック
      const usersApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/users/assignable') &&
          response.request().method() === 'GET' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // ユーザー一覧APIの応答を待機（ローディング状態のチェックより信頼性が高い）
      await usersApiPromise;
      // フォームがインタラクティブになるまで少し待機
      await page.waitForTimeout(500);

      const projectNameToDelete = `削除テスト用プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectNameToDelete);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移したことを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // プロジェクトIDを取得
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      const projectIdToDelete = match ? match[1] : null;

      // Step 2: 管理者ユーザーに切り替えて削除（削除権限が必要）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${projectIdToDelete}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      // ダイアログ内のプロジェクト名（テストオーバーレイ内に表示される）
      await expect(
        page.getByTestId('focus-manager-overlay').getByText(projectNameToDelete)
      ).toBeVisible();
      await expect(page.getByText(/この操作は取り消せません/i)).toBeVisible();
      // 46.4: 関連データの無いときも保持期間の文を出し、関連データの警告は出さない
      await expect(
        page.getByTestId('focus-manager-overlay').getByText(RETENTION_NOTICE, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByTestId('focus-manager-overlay').getByText(RELATED_DATA_WARNING)
      ).toHaveCount(0);

      // APIレスポンスを待機しながら削除ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${projectIdToDelete}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック（オーバーレイ内のボタンを指定）
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      // APIレスポンスを待機
      await deletePromise;

      // 確認ダイアログが閉じることを待機
      await expect(page.getByTestId('focus-manager-overlay')).not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/プロジェクトを削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });

      // 一覧ページの読み込み完了を待機
      await page.waitForLoadState('networkidle');

      // 一覧テーブル内に削除したプロジェクトが表示されないことを確認
      // テーブル本体（role="table" または一覧コンテンツ部分）で確認
      const projectListArea = page.locator('main');
      await expect(
        projectListArea.getByRole('link', { name: projectNameToDelete })
      ).not.toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-9.4
     */
    test('削除確認ダイアログでキャンセルすると詳細画面に留まる (project-management/REQ-9.4)', async ({
      page,
      context,
    }) => {
      // 削除対象のプロジェクトを前提として無条件に用意する。
      // 先行テストが残した ID を再利用する復旧分岐は、先行テストが壊れたときに
      // 「どのプロジェクトの削除をキャンセルしたのか」が定まらないため置かない。
      await loginAsUser(page, 'REGULAR_USER');
      const testProjectId = (await seedProject(page, 'REGULAR_USER', 'キャンセルテスト')).id;

      // 管理者ユーザーに切り替え（削除ボタンを表示するため）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 「キャンセル」ボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // ダイアログが閉じることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`));
    });

    /**
     * @requirement project-management/REQ-9.5
     * @requirement project-management/REQ-9.6
     * @requirement project-management/REQ-46.2
     * @requirement project-management/REQ-46.4
     */
    test('関連データのあるプロジェクトは警告と種類ごとの件数・保持期間の文を出し、削除すると一覧から消え関連データの詳細も不在の表示になる (project-management/REQ-9.5, REQ-9.6, REQ-46.2, REQ-46.4)', async ({
      page,
    }) => {
      const seeded = await seedProjectWithRelatedData();

      // 管理者で削除する（削除の権限が必要）
      await loginAsUser(page, 'ADMIN_USER');

      // 削除の前は関連データの詳細が見える（不在の表示が削除によることを確かめる対照）
      await page.goto(`/site-surveys/${seeded.siteSurveyId}`);
      await expect(page.getByText(`${RELATED_NAME_PREFIX}現場調査-一回目`).first()).toBeVisible({
        timeout: getTimeout(15000),
      });

      const listBeforeDelete = await openProjectListSearch(page, seeded.projectName);
      expect(listBeforeDelete.ids, '前提: 削除の前は一覧の応答に含まれる').toContain(
        seeded.projectId
      );
      await expect(projectRows(page, seeded.projectName)).toHaveCount(1, {
        timeout: getTimeout(15000),
      });

      await page.goto(`/projects/${seeded.projectId}`);
      await expect(page.getByRole('heading', { name: seeded.projectName })).toBeVisible({
        timeout: getTimeout(15000),
      });

      const countsPromise = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname === `/api/projects/${seeded.projectId}/related-counts`,
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: '削除', exact: true }).click();
      const countsResponse = await countsPromise;
      expect(countsResponse.status(), '前提: 関連データの件数の取得が成功する').toBe(200);
      // 論理削除したものを数えない
      expect(await countsResponse.json()).toEqual({
        siteSurveys: 2,
        quantityTables: 0,
        itemizedStatements: 1,
        estimateRequests: 1,
        receivedQuotations: 2,
        estimates: 0,
        contracts: 0,
        schedules: 0,
        executionBudgets: 0,
        constructionPhotos: 0,
      });

      const dialog = page.getByTestId('focus-manager-overlay');
      await expect(dialog.getByRole('heading', { name: 'プロジェクトの削除' })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(dialog.getByText(seeded.projectName, { exact: true })).toBeVisible();
      await expect(dialog.getByText('を削除しますか？この操作は取り消せません。')).toBeVisible();

      // 9.5: 警告の文（逐語）と、件数が1以上の種類だけを定めた順に件数つきで並べる
      const warning = dialog.getByRole('alert');
      await expect(warning.getByText(RELATED_DATA_WARNING, { exact: true })).toBeVisible();
      await expect(warning.getByRole('listitem')).toHaveText([
        '現場調査: 2件',
        '内訳書: 1件',
        '見積依頼: 1件',
        '受領見積書: 2件',
      ]);

      // 46.4: 保持期間の文（逐語）
      await expect(dialog.getByText(RETENTION_NOTICE, { exact: true })).toBeVisible();

      // 9.5: 「削除する」「キャンセル」の選択肢（関連データの無いときの「削除」ではない）
      await expect(dialog.getByRole('button', { name: 'キャンセル', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
      const confirmButton = dialog.getByRole('button', { name: '削除する', exact: true });
      await expect(confirmButton).toBeVisible();

      // 9.6: 「削除する」で論理削除され、一覧へ移る
      const deletePromise = page.waitForResponse(
        (r) =>
          r.request().method() === 'DELETE' &&
          new URL(r.url()).pathname === `/api/projects/${seeded.projectId}`,
        { timeout: getTimeout(30000) }
      );
      await confirmButton.click();
      expect((await deletePromise).status(), '削除の要求が成功する').toBe(204);

      await expect(dialog).toHaveCount(0, { timeout: getTimeout(10000) });
      await expect(page.getByText('プロジェクトを削除しました')).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });

      // 一覧から消える（削除の前に同じ名前の検索で出ていたものが、削除の後は出ない）
      const listAfterDelete = await openProjectListSearch(page, seeded.projectName);
      expect(listAfterDelete.ids, '一覧の応答に削除したプロジェクトが含まれない').not.toContain(
        seeded.projectId
      );
      // 一覧の表示が応答を描き終えたこと（空の表示）を待ってから、行が無いことを確かめる。
      // URL の検索の条件で開いたときの空の表示は「プロジェクトがありません」になる
      // （「検索結果がありません」は画面で検索を実行したときの表示）ため、どちらも空の表示として受ける
      await expect(
        page.getByRole('heading', { name: /^(検索結果|プロジェクト)がありません$/ })
      ).toBeVisible({ timeout: getTimeout(15000) });
      await expect(projectRows(page, seeded.projectName)).toHaveCount(0);

      // 9.6・46.2: 関連データの詳細の URL は存在しないものと同じ不在の表示になる
      await expectNotFoundDisplay(page, `/site-surveys/${seeded.siteSurveyId}`, '現場調査');
      await expectNotFoundDisplay(
        page,
        `/itemized-statements/${seeded.itemizedStatementId}`,
        '内訳書'
      );
      await expectNotFoundDisplay(
        page,
        `/estimate-requests/${seeded.estimateRequestId}`,
        '見積依頼'
      );
      // 受領見積書は案件の受領見積書の一覧の画面で見る。案件ごと不在の表示になる
      await expectNotFoundDisplay(page, `/projects/${seeded.projectId}/quotations`, 'プロジェクト');
      // プロジェクトの詳細も不在の表示になる
      await expectNotFoundDisplay(page, `/projects/${seeded.projectId}`, 'プロジェクト');
    });
  });
});
