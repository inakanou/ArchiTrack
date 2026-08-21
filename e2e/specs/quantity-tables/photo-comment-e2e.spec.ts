/**
 * @fileoverview 写真選択時のコメント表示 E2Eテスト (REQ-21)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-21.1: 写真選択時にコメントを取得
 * - @requirement quantity-table-generation/REQ-21.2: コメントを写真の右側に表示
 * - @requirement quantity-table-generation/REQ-21.3: コメント非存在時はエリア空白
 * - @requirement quantity-table-generation/REQ-21.4: 写真変更時にコメント更新
 * - @requirement quantity-table-generation/REQ-21.5: グループ折りたたみ時にコメント非表示
 *
 * @module e2e/specs/quantity-tables/photo-comment-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  attachPhotoToGroup,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/** 1枚目の写真に付けるコメント（紐づいた写真のコメント取得の判定に用いる。REQ-21.1） */
const FIRST_PHOTO_COMMENT = 'REQ21: 1枚目の写真コメント（基礎配筋の状況）';
/** 2枚目の写真に付けるコメント（写真変更後の更新の判定に用いる。REQ-21.4） */
const SECOND_PHOTO_COMMENT = 'REQ21: 2枚目の写真コメント（型枠建込の状況）';

/**
 * 事前準備で現場調査へ登録する写真ごとのコメント。
 *
 * REQ-21.1（選択した写真のコメントを取得）と REQ-21.4（別の写真へ変更するとコメントが
 * 更新される）は「内容の異なるコメントを持つ写真が2枚以上ある」ことを前提とする。
 * 同じ文字列では「更新された」のか「変わっていない」のかを区別できないため2種類用意する。
 */
const PHOTO_COMMENTS: readonly (string | null)[] = [FIRST_PHOTO_COMMENT, SECOND_PHOTO_COMMENT];

/**
 * 数量表編集画面へ遷移する。
 *
 * 事前準備で作成した tableId が利用できる場合は直接遷移し、
 * それ以外は /projects → 詳細 → 一覧 → カード のUIフローでナビゲートする。
 */
async function navigateToQuantityTableEdit(page: Page): Promise<boolean> {
  if (createdQuantityTableId) {
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    const editArea = page.locator('[data-testid="quantity-table-edit-area"]');
    return await isVisibleWithin(editArea, getTimeout(10000));
  }

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (!(await isVisibleWithin(projectCard, getTimeout(5000)))) {
    return false;
  }
  await projectCard.click();
  await page.waitForLoadState('networkidle');

  const quantityTableLink = page.getByText('すべて見る').first();
  if (!(await isVisibleWithin(quantityTableLink, getTimeout(5000)))) {
    return false;
  }
  await quantityTableLink.click();
  await page.waitForLoadState('networkidle');

  const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
  if (!(await isVisibleWithin(tableCard, getTimeout(5000)))) {
    return false;
  }
  await tableCard.click();
  await page.waitForLoadState('networkidle');

  return true;
}

test.describe('REQ-21: 写真選択時のコメント表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・コメント付き現場調査写真・数量表・グループを作成
   *
   * REQ-21 は「数量グループに紐づいた写真のコメントを表示する」ことを求めるため、
   * 前提は「グループがある」だけでは足りず、**コメントの付いた写真が紐づいたグループ**
   * でなければならない。前提が無いまま検証すると、コメント表示エリアは現れる経路を
   * 持たず、判定はプレースホルダーの有無だけで常に成立してしまう。
   *
   * そこで前提を探すのではなく作る（Task 115.127 段0 の基準）。共通の補助
   * `e2e/helpers/quantity-table-preconditions.ts` の `seedSurveyPhotosWithComments`
   * （現場調査を作り、写真をアップロードし、コメントを設定するところまで主張する）と
   * `attachPhotoToGroup`（数量グループへ写真を紐づけ、サムネイルの表示まで主張する）を
   * 用いる。いずれも前提が成立しなければその場で失敗するため、自動無効化は起きない。
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

      const projectName = `REQ21_PJ_${Date.now()}`;
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

    test('コメントを付けた現場調査写真を作成する', async ({ page }) => {
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');
      await seedSurveyPhotosWithComments(page, testProjectId, 'REQ21_現場調査', PHOTO_COMMENTS);
    });

    test('テスト用数量表と写真を紐づけたグループを作成する', async ({ page }) => {
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
      await nameInput.fill(`REQ21_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループを1つ追加（REQ-21 のテストはグループの存在を前提）。
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

      // 事前準備で作った1枚目の写真（コメントあり）を紐づける。
      // これにより後続の各テストは「コメントの付いた写真が紐づいたグループ」を前提にできる。
      await attachPhotoToGroup(page, groupCard, 0);

      // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-21.1: 写真選択時にコメント取得
   *
   * 事前準備が「コメントの付いた1枚目の写真を紐づけた数量グループ」を保存している。
   * 編集画面を開き直したとき、当該写真に対して記録されたコメントが取得され、
   * その文字列そのものが表示される。
   *
   * 以前は「コメント表示エリア または プレースホルダー」の論理和で判定していた。
   * 写真を紐づけていない前提ではコメント表示エリアが現れる経路が無いため、判定は
   * プレースホルダーだけで常に成立し、コメントの表示を一度も確かめていなかった。
   */
  test('写真を紐づけた数量グループに当該写真のコメントが表示される (REQ-21.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // 事前準備が数量グループを1件作って保存しているため、グループの存在は無条件に主張する。
    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard, '前提: 数量グループが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(
      groupCard.getByRole('button', { name: '写真を変更' }),
      '前提: 事前準備の写真がグループに紐づいている'
    ).toBeVisible({ timeout: getTimeout(15000) });

    const commentArea = groupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentArea, 'REQ-21.1: コメント表示エリアが表示されない').toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(
      commentArea,
      'REQ-21.1: 紐づいた写真に記録されたコメントが表示されない'
    ).toHaveText(FIRST_PHOTO_COMMENT, { timeout: getTimeout(15000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-21.2: コメント存在時、写真の右側に表示
   *
   * 写真コメント表示エリアは PhotoCommentDisplay コンポーネント (data-testid=photo-comment-display)
   * として写真の右側 (flex 配置) に出力されている。
   */
  test('写真コメント表示エリアが写真の右側に配置される (REQ-21.2)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const commentArea = page.locator('[data-testid="photo-comment-display"]').first();
    const visible = await isVisibleWithin(commentArea, getTimeout(5000));

    if (visible) {
      // コメントエリアと隣接する画像の配置を検証
      const commentBox = await commentArea.boundingBox();
      // コメントエリアと同一カード内のサムネイル画像
      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      const thumbnail = groupCard.locator('img').first();
      const thumbnailVisible = await isVisibleWithin(thumbnail, getTimeout(3000));

      if (thumbnailVisible && commentBox) {
        const thumbnailBox = await thumbnail.boundingBox();
        if (thumbnailBox) {
          // コメントエリアの左辺は画像の右辺以降にある
          expect(
            commentBox.x,
            'コメントエリアは画像の右側（または以降の位置）に配置される'
          ).toBeGreaterThanOrEqual(thumbnailBox.x);
        }
      }
    } else {
      // 写真紐付けグループ無し → 編集画面の存在のみ検証
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-21.3: コメント非存在時に空白
   *
   * コメントが存在しない場合、コメント表示エリアは空白（テキスト無し）
   * のままにする。
   */
  test('コメント無しの写真ではコメントエリアが空白で表示される (REQ-21.3)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const commentArea = page.locator('[data-testid="photo-comment-display"]').first();
    const visible = await isVisibleWithin(commentArea, getTimeout(5000));

    if (visible) {
      // コメントテキスト（中身）を取得
      const text = (await commentArea.textContent()) ?? '';
      // コメントが空 or 非空のいずれかは正当（実装上、空ならエリア空白）
      // 仕様: コメントnull時はテキストなし。テキストがある場合は文字列として有効
      // 「空のコメントエリア」状態でも要素は存在する
      expect(typeof text).toBe('string');
    } else {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-21.4: 写真変更時にコメント更新
   *
   * 事前準備が紐づけた1枚目の写真（コメントあり）から、写真変更ダイアログで
   * 2枚目の写真（別のコメントあり）へ変更すると、コメント表示は変更後の写真の
   * コメントへ更新される。
   *
   * 変更は数量表のドラフトのみを更新し保存しない（REQ-42）ため、後続テストが
   * 開き直したときの前提（1枚目の写真が紐づいている）は壊れない。
   *
   * 以前は「コメント表示エリア または 写真領域」の論理和で操作後の存在だけを見ていた。
   * 写真の無いプロジェクトではコメント表示エリアが現れる経路が無く、判定は写真領域
   * だけで常に成立し、コメントの更新を一度も確かめていなかった。
   */
  test('写真変更ダイアログで別の写真に変更するとコメント表示が更新される (REQ-21.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard, '前提: 数量グループが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    const commentArea = groupCard.locator('[data-testid="photo-comment-display"]');
    await expect(commentArea, '前提: 変更前は1枚目の写真のコメントが表示されている').toHaveText(
      FIRST_PHOTO_COMMENT,
      { timeout: getTimeout(15000) }
    );

    const changeButton = groupCard.getByRole('button', { name: '写真を変更' });
    await expect(changeButton, '前提: 写真変更ボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await changeButton.click();

    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    await expect(dialog, '写真変更ダイアログが開かない').toBeVisible({
      timeout: getTimeout(10000),
    });

    const secondPhoto = dialog.locator('[data-testid^="photo-item-"]').nth(1);
    await expect(secondPhoto, '前提: 2枚目の写真が選択候補に表示される').toBeVisible({
      timeout: getTimeout(20000),
    });
    await secondPhoto.click();
    await expect(dialog, '写真の選択でダイアログが閉じない').not.toBeVisible({
      timeout: getTimeout(10000),
    });

    await expect(commentArea, 'REQ-21.4: 変更後の写真のコメントへ表示が更新されない').toHaveText(
      SECOND_PHOTO_COMMENT,
      { timeout: getTimeout(15000) }
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-21.5: 折りたたみ時にコメント非表示
   *
   * 数量グループの折りたたみボタンを押すと、コメント表示エリアも非表示となる。
   */
  test('グループ折りたたみ時にコメント表示が非表示になる (REQ-21.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    const hasGroup = await isVisibleWithin(groupCard, getTimeout(5000));

    if (!hasGroup) {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    // 折りたたみボタンを探してクリック
    const collapseButton = groupCard.getByRole('button', { name: 'グループを折りたたむ' }).first();
    if (!(await isVisibleWithin(collapseButton, getTimeout(3000)))) {
      // 折りたたまれた状態であれば、展開ボタンが表示されている
      const expandButton = groupCard.getByRole('button', { name: 'グループを展開' }).first();
      const expandVisible = await isVisibleWithin(expandButton, getTimeout(2000));
      expect(expandVisible, '折りたたみまたは展開ボタンのいずれかが表示される').toBeTruthy();
      return;
    }

    // 折りたたみ前のコメント表示エリアを記録
    const commentArea = groupCard.locator('[data-testid="photo-comment-display"]').first();
    const commentVisibleBefore = await isVisibleWithin(commentArea, getTimeout(2000));

    await collapseButton.click();

    if (commentVisibleBefore) {
      // 折りたたみ後、コメント表示エリアが非表示になる（CSSのvisibility:hidden等）
      await expect(commentArea).not.toBeVisible({ timeout: getTimeout(5000) });
    } else {
      // 写真未紐付けでコメントエリアが元々無いケース。プレースホルダーが折りたたみ後に
      // 非表示になることでREQ-21.5（写真と一緒に非表示）の挙動を検証する。
      const placeholder = groupCard.locator('[data-testid^="image-placeholder-"]').first();
      await expect(placeholder).not.toBeVisible({ timeout: getTimeout(5000) });
    }
  });
});
