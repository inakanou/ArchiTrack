/**
 * @fileoverview 数量表 Phase 9 E2Eテスト
 *
 * Task 34.5: Phase 9のE2Eテストを実装する
 *
 * ## 被覆の主張について（Task 115.177）
 *
 * 従前のヘッダは `Requirements coverage:` として19件の受入基準を範囲記法で掲げていたが、
 * 機能名が付いていないため被覆の検査（`scripts/check-requirement-coverage.ts`）は
 * このファイルから受入基準を一件も抽出できていなかった。実際に判定しているのに
 * 被覆へ数えられない状態である。掲げた19件を一件ずつ確かめ、判定しているものだけを
 * 各検証の直上に `@requirement` として置き直した（判定は下記の7件）。
 *
 * 判定していないため落とした記載（この画面で問うていない、または別ファイルが問う）:
 * - REQ-12.3（新規作成画面のパンくず）・REQ-12.4（パンくず項目の遷移）: 本ファイルに操作が無い
 * - REQ-3.3・REQ-3.4（注釈付き画像の表示と折りたたみ）: 画像そのものへの主張が無い
 * - REQ-19.1〜19.4（写真変更ダイアログ）: 変更ボタンの可視までで、ダイアログを開いていない
 * - REQ-20.2・REQ-20.3（拡大表示が注釈付き写真であること）: 画像の中身を問うていない
 * - REQ-21.3（コメント無しは空白）・REQ-21.4（写真変更で更新）: 該当の状況を作っていない
 *
 * @module e2e/specs/quantity-tables/quantity-table-phase9.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  attachPhotoToGroup,
  createTestProjectWithName,
  createTestQuantityTable,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';
import { breadcrumbNav, readBreadcrumbTrail } from '../../helpers/breadcrumb';

/** 事前準備で現場調査写真に付けるコメント（REQ-21.2 の表示内容の判定に用いる） */
const PHASE9_PHOTO_COMMENT = 'Phase9: 写真コメント表示エリアの検証用コメント';

/** 事前準備で作成した数量表のID（写真を紐づけたグループを1件持つ） */
let preparedQuantityTableId: string | null = null;

/** 事前準備で作成したプロジェクトのID（REQ-12.1 のパンくず検証の起点） */
let preparedProjectId: string | null = null;

/**
 * 事前準備で作成したプロジェクトの名称（実行ごとに変わる）
 *
 * REQ-12.1 / 12.2 の条文は `{プロジェクト名}` を階層の一つとして名指す。
 * 固定文字列で照合すると、パンくずが名称を描かなくなる変異を検出できない。
 */
let preparedProjectName: string | null = null;

/**
 * 事前準備で作成した数量表の名称（実行ごとに変わる）
 *
 * REQ-12.2 の条文の末尾 `{数量表名}` の照合に用いる。
 */
let preparedQuantityTableName: string | null = null;

test.describe('Phase 9: パンくずナビゲーション改善・注釈付き写真・コメント表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: コメント付き写真を紐づけた数量グループを持つ数量表を作成する。
   *
   * REQ-19.1（写真変更ボタン）と REQ-21.2（写真コメント表示エリア）は、いずれも
   * 「写真の紐づいた数量グループ」がなければ検証対象そのものが描画されない。
   * 前提を探す形（プロジェクト一覧の先頭カードを辿る）は、当該のプロジェクトに
   * 写真も数量表も無い場合に検証が丸ごと飛ぶ。前提は探さずに作る。
   *
   * この準備は受入基準の判定ではなく後続の前提を作るだけなので、意図して
   * `@requirement` を持たない（Task 115.177）。
   */
  test.describe('事前準備', () => {
    test('コメント付き写真を紐づけた数量グループを作成する', async ({ page }) => {
      const project = await createTestProjectWithName(page, 'Phase9_PJ');
      const projectId = project.id;
      preparedProjectId = projectId;
      preparedProjectName = project.name;
      // Phase 9 の関心はパンくず・写真コメント表示であり注釈なし写真との選別ではない。
      // 写真選択ダイアログの候補として現れる必要があるため全件へ注釈を保存する（Task 82.1）。
      await seedSurveyPhotosWithComments(
        page,
        projectId,
        'Phase9_現場調査',
        [PHASE9_PHOTO_COMMENT],
        'all'
      );

      const quantityTable = await createTestQuantityTable(page, projectId, 'Phase9_数量表');
      preparedQuantityTableId = quantityTable.id;
      preparedQuantityTableName = quantityTable.name;

      const groupCard = await addQuantityGroup(page);
      await attachPhotoToGroup(page, groupCard, 0);

      // REQ-42.5: グループ追加・写真紐づけはドラフトのみを更新するため、
      // 後続テストが開き直したときの前提として明示保存する。
      await saveQuantityTableDraft(page);
    });
  });

  test.describe('REQ-12.1-12.5: パンくずナビゲーション改善', () => {
    /**
     * @requirement quantity-table-generation/REQ-12.1: 数量表一覧画面のパンくずナビゲーション
     * @requirement quantity-table-generation/REQ-12.5: 現在の画面は非リンクで表示する
     */
    test('数量表一覧画面のパンくずが正しい形式で表示されること', async ({ page }) => {
      // 「プロジェクト一覧の先頭カード」を探す形は、そのプロジェクトに数量表が無ければ
      // 「すべて見る」が描画されず（QuantityTableSectionCard は totalCount > 0 のときだけ出す）、
      // 検証が丸ごと飛ぶ。前提は事前準備で作ったプロジェクトを用いて確定させる。
      assertPrepared(preparedProjectId, '事前準備で作成したプロジェクトのID');
      await page.goto(`/projects/${preparedProjectId}`);
      await page.waitForLoadState('networkidle');

      // 数量表セクションの「すべて見る」から数量表一覧へ移動する。
      // 画面には他セクションの「すべて見る」も並ぶため、セクションで絞り込む。
      const quantityTableLink = page
        .locator('[data-testid="quantity-table-section"]')
        .getByRole('link', { name: 'すべて見る' });
      await expect(
        quantityTableLink,
        '前提: 数量表セクションに「すべて見る」リンクが表示される'
      ).toBeVisible({ timeout: getTimeout(15000) });
      await quantityTableLink.click();
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/quantity-tables$/, {
        timeout: getTimeout(15000),
      });
      await page.waitForLoadState('networkidle');

      // パンくずの検証
      const breadcrumb = breadcrumbNav(page);
      await expect(breadcrumb, 'REQ-12.1: 数量表一覧画面にパンくずが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-12.1: 条文は「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧」と
      // **階層・順序・プロジェクト名まで**規定する。個々の語の部分一致では項目の欠落も
      // 順序の入れ替えも検出できないため、読み取った並びを条文どおりの配列と完全一致で照合する。
      // `{プロジェクト名}` は事前準備が実行ごとに変わる名称で作ったものを用いる。
      assertPrepared(preparedProjectName, '事前準備で作成したプロジェクトの名称');
      await expect
        .poll(async () => readBreadcrumbTrail(breadcrumb), {
          message:
            'REQ-12.1: パンくずが「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧」の階層と順序で表示されない',
          timeout: getTimeout(15000),
        })
        .toEqual(['ダッシュボード', 'プロジェクト一覧', preparedProjectName, '数量表一覧']);

      // 「数量表一覧」が非リンクで表示されていること。
      // 末尾の li は区切り記号の span（aria-hidden）と現在地の span の二つを持つため、
      // `locator('span')` では strict mode に触れる。現在地は aria-current="page" で一意に指す。
      const currentItem = breadcrumb.locator('li').last().locator('span[aria-current="page"]');
      await expect(
        currentItem,
        'REQ-12.5: 現在の画面「数量表一覧」は非リンクで表示される'
      ).toContainText('数量表一覧');
      await expect(
        breadcrumb.locator('li').last().getByRole('link'),
        'REQ-12.5: 現在の画面はリンクとして描かれない'
      ).toHaveCount(0);
    });

    /**
     * @requirement quantity-table-generation/REQ-12.2: 数量表編集画面のパンくずナビゲーション
     */
    test('数量表編集画面のパンくずが正しい形式で表示されること', async ({ page }) => {
      // 一覧から「先頭の数量表カード」を辿る形は、[data-testid="quantity-table-card"] が
      // production に存在しないため常に偽となり、以下の検証が一度も実行されていなかった。
      // 事前準備で作成した数量表の編集画面を直接開いて前提を確定させる。
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const breadcrumb = breadcrumbNav(page);
      await expect(breadcrumb, 'REQ-12.2: 数量表編集画面にパンくずが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-12.2: 条文は
      // 「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧 > {数量表名}」。
      // 末尾の `{数量表名}` も含めて、事前準備が付けた実行ごとに変わる名称で照合する。
      assertPrepared(preparedProjectName, '事前準備で作成したプロジェクトの名称');
      assertPrepared(preparedQuantityTableName, '事前準備で作成した数量表の名称');
      await expect
        .poll(async () => readBreadcrumbTrail(breadcrumb), {
          message:
            'REQ-12.2: パンくずが「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧 > {数量表名}」の階層と順序で表示されない',
          timeout: getTimeout(15000),
        })
        .toEqual([
          'ダッシュボード',
          'プロジェクト一覧',
          preparedProjectName,
          '数量表一覧',
          preparedQuantityTableName,
        ]);
    });
  });

  test.describe('REQ-20.1-20.3: 写真プレビューダイアログ', () => {
    /**
     * @requirement quantity-table-generation/REQ-20.1: 写真プレビュー操作でダイアログを表示する
     */
    test('写真クリックでプレビューダイアログが開くこと', async ({ page }) => {
      // 写真が紐づいたグループを持つ数量表は事前準備で作成済み。
      // 「先頭のプロジェクト → 先頭の数量表」を探す形は前提を保証しないため用いない。
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 写真を紐づけた数量グループが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });

      // 紐付け画像を表示ボタンをクリック
      const imageButton = groupCard.getByRole('button', { name: '紐付け画像を表示' });
      await expect(imageButton, '前提: 紐付け画像の表示操作が提供される').toBeVisible({
        timeout: getTimeout(15000),
      });
      await imageButton.click();

      // プレビューダイアログが表示されること
      const dialog = page.getByRole('dialog', { name: '写真プレビュー' });
      await expect(
        dialog,
        'REQ-20.1: 写真プレビュー操作でプレビューダイアログが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // Escキーで閉じること
      await page.keyboard.press('Escape');
      await expect(dialog, 'REQ-20.1: Escキーでプレビューダイアログが閉じる').not.toBeVisible();
    });
  });

  test.describe('REQ-21.2-21.5: 写真コメント表示', () => {
    /**
     * @requirement quantity-table-generation/REQ-21.1: 紐づいた写真のコメントを取得する
     * @requirement quantity-table-generation/REQ-21.2: コメントが存在する場合は表示する
     */
    test('写真が紐付けられたグループでコメント表示エリアが存在すること', async ({ page }) => {
      assertPrepared(preparedQuantityTableId, '事前準備で作成した数量表のID');
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 写真を紐づけた数量グループが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });

      const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]').first();
      await expect(commentDisplay, 'REQ-21.2: 写真コメント表示エリアが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(commentDisplay, 'REQ-21.1: 紐づいた写真のコメントが表示される').toHaveText(
        PHASE9_PHOTO_COMMENT,
        { timeout: getTimeout(15000) }
      );
    });

    /**
     * @requirement quantity-table-generation/REQ-21.5: 折りたたみ時はコメントも非表示にする
     */
    test('グループ折りたたみ時にコメント表示が非表示になること', async ({ page }) => {
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 写真を紐づけた数量グループが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });

      // 折りたたむ前はコメントが見えていることを確定させる（消えたことを言うための起点）
      const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]').first();
      await expect(
        commentDisplay,
        '前提: 折りたたむ前はコメント表示エリアが見えている'
      ).toBeVisible({ timeout: getTimeout(15000) });

      // 折りたたみボタンをクリック
      const collapseButton = groupCard.getByRole('button', { name: 'グループを折りたたむ' });
      await expect(collapseButton, '前提: グループの折りたたみボタンが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });
      await collapseButton.click();

      // コメント表示エリアが非表示になること
      await expect(
        commentDisplay,
        'REQ-21.5: グループ折りたたみ時はコメント表示も写真と一緒に非表示になる'
      ).not.toBeVisible();
    });
  });

  test.describe('REQ-19.1: 写真変更ボタン', () => {
    /**
     * 写真変更ボタンの可視だけを問う検証。REQ-19.1 の規範は「写真変更操作を行うと
     * 写真変更ダイアログを表示する」であり、ここではダイアログを開いていないため、
     * 意図して `@requirement` を持たない（Task 115.177）。
     * ダイアログの判定は photo-change-dialog-e2e.spec.ts が持つ。
     */
    test('写真変更ボタンが表示されること', async ({ page }) => {
      assertPrepared(preparedQuantityTableId, '事前準備で作成した数量表のID');
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 写真を紐づけた数量グループが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });

      await expect(
        groupCard.getByRole('button', { name: '写真を変更' }),
        'REQ-19.1: 写真が紐づいたグループに写真変更ボタンが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });
    });
  });
});
