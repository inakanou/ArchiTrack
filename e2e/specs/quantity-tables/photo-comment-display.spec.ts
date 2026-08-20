/**
 * @fileoverview 写真コメント表示 E2Eテスト
 *
 * ## 前提の用意（Task 115.127 段0）
 *
 * 以前は「一覧の先頭のプロジェクトの先頭の数量表」を開き、写真の紐づいたグループを
 * 探し、見つからなければ引数なしの `test.skip` で検証を丸ごと消していた。
 * 実際には参照していた `[data-testid="project-card"]` が存在せず（実装は
 * `project-card-{id}`）、本ファイルの全テストが常に飛んでいた。
 * AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に抵触する。
 *
 * 本ファイルは前提（プロジェクト・コメント付き現場調査写真・数量表・写真を紐づけた
 * 数量グループ）を事前準備で**自ら作り**、作れなければその場で失敗する。
 * 共通の補助は `e2e/helpers/quantity-table-preconditions.ts` に置く。
 *
 * 写真は3枚用意する。コメントの有無と内容の違いを観測するためである。
 * - 1枚目: コメントあり（初回表示の判定に用いる）
 * - 2枚目: 別のコメントあり（写真変更でコメントが更新されることの判定に用いる）
 * - 3枚目: コメントなし（コメント非存在時の空白表示の判定に用いる）
 *
 * Requirements coverage:
 * - REQ-35.1: 写真選択時にコメントを取得して表示
 * - REQ-35.2: 初回表示時に既存写真のコメントを表示
 * - REQ-35.3: 写真変更時にコメントを更新
 * - REQ-35.4: コメント存在時に写真右側に表示
 * - REQ-35.5: コメント非存在時にエリアを空白表示
 * - REQ-35.6: グループ折りたたみ時にコメント非表示
 * - REQ-35.7: グループ再展開時にコメント再表示
 *
 * @module e2e/specs/quantity-tables/photo-comment-display.spec
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  attachPhotoToGroup,
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

/** 1枚目の写真に付けるコメント（初回表示の判定に用いる） */
const FIRST_PHOTO_COMMENT = 'REQ35: 1枚目の写真コメント（外壁の劣化状況）';
/** 2枚目の写真に付けるコメント（写真変更後の更新の判定に用いる） */
const SECOND_PHOTO_COMMENT = 'REQ35: 2枚目の写真コメント（屋根の防水状況）';

/** 写真ごとのコメント。null はコメント無しの写真（REQ-35.5 の判定に用いる） */
const PHOTO_COMMENTS: readonly (string | null)[] = [
  FIRST_PHOTO_COMMENT,
  SECOND_PHOTO_COMMENT,
  null,
];

test.describe('REQ-35: 写真コメント表示の不具合修正', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備で作った「写真の紐づいた数量グループ」を開いて返す。
   */
  async function openGroupWithPhoto(page: Page): Promise<Locator> {
    await openQuantityTableEdit(page, createdQuantityTableId);

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard, '前提: 事前準備の数量グループが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(
      groupCard.getByRole('button', { name: '写真を変更' }),
      '前提: 事前準備の数量グループに写真が紐づいている'
    ).toBeVisible({ timeout: getTimeout(15000) });

    return groupCard;
  }

  /**
   * 「写真を変更」から別の写真へ紐づけ直す。保存はしない（後続テストの前提を壊さないため）。
   *
   * @param page Playwright のページ
   * @param groupCard 対象の数量グループのカード
   * @param photoIndex 選択する写真の位置（0起点、アップロード順）
   */
  async function changePhoto(page: Page, groupCard: Locator, photoIndex: number): Promise<void> {
    const changeButton = groupCard.getByRole('button', { name: '写真を変更' });
    await expect(changeButton, '写真変更ボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await changeButton.click();

    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    await expect(dialog, '写真変更ダイアログが開く').toBeVisible({ timeout: getTimeout(10000) });

    const photoItem = dialog.locator('[data-testid^="photo-item-"]').nth(photoIndex);
    await expect(photoItem, `${photoIndex + 1}番目の写真が選択候補に表示される`).toBeVisible({
      timeout: getTimeout(20000),
    });
    await photoItem.click();

    await expect(dialog, '写真の選択でダイアログが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });
  }

  // 前提の生成は1テストあたりのタイムアウト（60秒）に収まるよう段階に分ける。
  // 直列（serial）であるため、前段が失敗した場合に後段が成功して見えることはない。
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      testProjectId = await createTestProject(page, 'REQ35_PJ');
    });

    test('コメントを付けた現場調査写真を作成する', async ({ page }) => {
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');
      await seedSurveyPhotosWithComments(page, testProjectId, 'REQ35_現場調査', PHOTO_COMMENTS);
    });

    test('数量表と写真を紐づけた数量グループを作成する', async ({ page }) => {
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');
      createdQuantityTableId = (await createTestQuantityTable(page, testProjectId, 'REQ35_数量表'))
        .id;

      const groupCard = await addQuantityGroup(page);
      await attachPhotoToGroup(page, groupCard, 0);

      // REQ-42.5: 紐づけはクライアントドラフトの更新に留まるため明示保存して永続化する。
      // 後続の各テストは編集画面を開き直して「写真が紐づいたグループ」を前提とする。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-35.2
   * @requirement quantity-table-generation/REQ-35.4
   * 初回表示時に既に写真が紐づけられているグループにコメントが表示される
   */
  test('初回表示時に写真が紐づいたグループのコメントが写真の右側に表示される (REQ-35.2, REQ-35.4)', async ({
    page,
  }) => {
    const groupCard = await openGroupWithPhoto(page);

    // REQ-35.2: 編集画面の初回表示でコメントが取得され表示される
    const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay, 'REQ-35.2: コメント表示エリアが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(commentDisplay, 'REQ-35.2: 紐づく写真のコメントが表示される').toHaveText(
      FIRST_PHOTO_COMMENT
    );

    // REQ-35.4: コメントは写真の右側に配置される
    const thumbnail = groupCard.locator('img').first();
    await expect(thumbnail, 'REQ-35.4: 写真のサムネイルが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    const thumbnailBox = await thumbnail.boundingBox();
    const commentBox = await commentDisplay.boundingBox();
    expect(thumbnailBox, 'REQ-35.4: 写真の位置が取得できる').not.toBeNull();
    expect(commentBox, 'REQ-35.4: コメント表示エリアの位置が取得できる').not.toBeNull();
    expect(
      commentBox!.x,
      'REQ-35.4: コメント表示エリアは写真の右辺より右側にある'
    ).toBeGreaterThanOrEqual(thumbnailBox!.x + thumbnailBox!.width);

    // REQ-35.5: エラーや未定義状態は表示しない
    await expect(
      groupCard.locator('[role="alert"]'),
      'REQ-35.5: コメント表示にエラーが出ていない'
    ).toHaveCount(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-35.1
   * 写真未紐付けのグループに写真を選択すると、その写真のコメントが表示される
   */
  test('写真を選択したグループに当該写真のコメントが表示される (REQ-35.1)', async ({ page }) => {
    await openQuantityTableEdit(page, createdQuantityTableId);

    // 写真未紐付けのグループを追加して、そこへ2枚目の写真を選択する。
    // 追加も紐づけもドラフトの更新に留まる（REQ-42）ため保存はしない。
    const newGroupCard = await addQuantityGroup(page);
    await attachPhotoToGroup(page, newGroupCard, 1);

    const commentDisplay = newGroupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay, 'REQ-35.1: コメント表示エリアが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(commentDisplay, 'REQ-35.1: 選択した写真のコメントが表示される').toHaveText(
      SECOND_PHOTO_COMMENT
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-35.3
   * 写真変更ダイアログで別の写真に変更した際にコメントが更新される
   */
  test('写真を変更するとコメント表示が変更後の写真のものへ更新される (REQ-35.3)', async ({
    page,
  }) => {
    const groupCard = await openGroupWithPhoto(page);

    const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay, '変更前は1枚目のコメントが表示されている').toHaveText(
      FIRST_PHOTO_COMMENT
    );

    await changePhoto(page, groupCard, 1);

    await expect(commentDisplay, 'REQ-35.3: 変更後の写真のコメントへ更新される').toHaveText(
      SECOND_PHOTO_COMMENT,
      { timeout: getTimeout(15000) }
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-35.5
   * コメントが存在しない写真ではコメント表示エリアを空白にする
   */
  test('コメントが無い写真に変更するとコメント表示エリアが空白になる (REQ-35.5)', async ({
    page,
  }) => {
    const groupCard = await openGroupWithPhoto(page);

    const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay, '変更前は1枚目のコメントが表示されている').toHaveText(
      FIRST_PHOTO_COMMENT
    );

    // 3枚目の写真はコメントを持たない
    await changePhoto(page, groupCard, 2);

    await expect(commentDisplay, 'REQ-35.5: コメント表示エリアが空白になる').toHaveText('', {
      timeout: getTimeout(15000),
    });
    await expect(
      groupCard.locator('[role="alert"]'),
      'REQ-35.5: エラーや未定義状態は表示しない'
    ).toHaveCount(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-35.6
   * @requirement quantity-table-generation/REQ-35.7
   * グループ折りたたみ/展開時のコメント表示制御
   */
  test('グループ折りたたみ時にコメントが非表示になり、再展開時に再表示される (REQ-35.6, REQ-35.7)', async ({
    page,
  }) => {
    const groupCard = await openGroupWithPhoto(page);

    const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay, '折りたたむ前はコメントが表示されている').toBeVisible({
      timeout: getTimeout(15000),
    });

    const collapseButton = groupCard.getByRole('button', { name: 'グループを折りたたむ' });
    await expect(collapseButton, '折りたたみボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await collapseButton.click();

    // REQ-35.6: 折りたたむとコメント表示も写真と一緒に非表示になる
    await expect(commentDisplay, 'REQ-35.6: 折りたたみでコメントが非表示になる').not.toBeVisible({
      timeout: getTimeout(10000),
    });

    // REQ-35.7: 再展開するとコメント表示が再表示される
    const expandButton = groupCard.getByRole('button', { name: 'グループを展開' });
    await expect(expandButton, '展開ボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await expandButton.click();

    await expect(commentDisplay, 'REQ-35.7: 再展開でコメントが再表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(commentDisplay, 'REQ-35.7: 再表示されるのは同じ写真のコメントである').toHaveText(
      FIRST_PHOTO_COMMENT
    );
  });
});
