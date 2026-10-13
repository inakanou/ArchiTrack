/**
 * @fileoverview 現場調査からの一括生成の実行中表示と重複実行防止のE2Eテスト (REQ-40.11)
 *
 * Task 89.2: REQ-40.11 の除外の取り下げ条件を満たす
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-40.11: 一括生成処理（写真一覧取得およびグループ生成）の実行中は処理中であることを示すインジケーターを表示し、重複実行を防止する
 *
 * ## 実行中の窓をどう作るか
 *
 * REQ-42 以降、一括生成のうちグループの生成はクライアントのドラフト操作（reducer）であり
 * 同期的に終わる。非同期の窓として残るのは、確定操作の直後に発行される対象現場調査の
 * 写真一覧の取得（`GET /api/site-surveys/:id`）だけである。この取得は条文が「写真一覧取得
 * およびグループ生成」と名指す実行中の一部であり、本番でも応答を待つ間は同じ状態が続く。
 *
 * 固定時間の遅延では窓の長さが環境の速度に依存するため、本検証は当該の取得を
 * **ゲートで保留し、検証が解放するまで応答を返さない**。画面の状態は偽装せず、
 * 本番の実装が取得待ちの間に取る状態をそのまま観測する。
 *
 * ## 何を観測するか
 *
 * 1. インジケーター: 確定前は確定ボタンが「実行」でスピナー（`role="status"`・名前「生成中」）が
 *    無く、確定後の保留中はスピナーが現れ確定ボタンが「生成中...」になる。完了後は画面の
 *    「現場調査から一括追加」ボタンの `aria-busy` が偽へ戻る。確定前の不在は、同じ
 *    ロケーターが保留中に現に一致することで観測器が壊れていないことを示す
 * 2. 重複実行防止: 保留中に確定ボタンを重ねて押し（`force: true` で実際にマウスで押す）、
 *    Escape でダイアログを閉じようとしても、写真一覧の取得は1回しか発行されず、生成される
 *    グループも写真枚数ぶんに留まる。**最初の実行も同じ `force: true` の押下で起こす**ため、
 *    この押し方が実行を起こしうることは同じテストの中で示される。Escape についても、
 *    確定前にダイアログを閉じられることを先に示す
 *
 * リクエストの選別はオリジンではなくパス（`URL.pathname`）で行う。ブラウザのAPIオリジンと
 * E2E側の `API_BASE_URL` は環境によって異なり、オリジンを条件に含めると観測が全件外れる。
 *
 * @module e2e/specs/quantity-tables/create-groups-from-survey-in-progress-e2e.spec
 */

import { test, expect, type Route } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

/** 一括生成元の現場調査に置く写真の枚数（＝生成されるべきグループ数） */
const PHOTO_COUNT = 2;

test.describe('REQ-40.11: 現場調査からの一括生成の実行中表示と重複実行防止', () => {
  /**
   * @requirement quantity-table-generation/REQ-40.11
   */
  test('一括生成の実行中は処理中インジケーターを表示し、確定の重ね押しでも写真一覧の取得とグループ生成が重複しない (quantity-table-generation/REQ-40.11)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));

    await loginAsUser(page, 'REGULAR_USER');

    // ---- 前提: 写真2枚の現場調査と、グループ0件の数量表 ----
    const projectId = await createTestProject(page, 'REQ40-11一括生成中');
    const { surveyId, imageIds } = await seedSurveyPhotosWithComments(
      page,
      projectId,
      'REQ40-11一括生成元',
      Array.from({ length: PHOTO_COUNT }, () => null),
      // 一括生成は注釈の有無を問わず全写真を対象とする（REQ-40.3）。注釈は前提に要らない
      'none'
    );
    expect(imageIds, '前提: 現場調査に写真が置かれている').toHaveLength(PHOTO_COUNT);

    const { id: quantityTableId } = await createTestQuantityTable(
      page,
      projectId,
      'REQ40-11数量表'
    );
    await openQuantityTableEdit(page, quantityTableId);

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards, '前提: 数量表はグループ0件から始まる').toHaveCount(0);

    // ---- 写真一覧の取得をゲートで保留する（編集画面の読み込みが済んでから張る） ----
    const surveyDetailPath = `/api/site-surveys/${surveyId}`;
    const heldRequests: string[] = [];
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let notifyFirstHeld: () => void = () => {};
    const firstHeld = new Promise<void>((resolve) => {
      notifyFirstHeld = resolve;
    });

    await page.route(
      (url) => url.pathname === surveyDetailPath,
      async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        heldRequests.push(`GET ${new URL(route.request().url()).pathname}`);
        notifyFirstHeld();
        await gate;
        await route.continue();
      }
    );

    try {
      const bulkButton = page.getByTestId('bulk-create-from-survey-button');
      const dialog = page.getByTestId('survey-select-dialog');
      const surveyOption = page.getByTestId(`survey-select-option-${surveyId}`);
      const confirmButton = page.getByTestId('survey-select-dialog-confirm');
      const cancelButton = dialog.getByRole('button', { name: 'キャンセル', exact: true });
      const closeButton = page.getByTestId('survey-select-dialog-close');
      const spinner = dialog.getByRole('status', { name: '生成中' });

      // ---- 確定前: Escape で閉じられること（保留中の「閉じない」の対照） ----
      await expect(bulkButton).toBeEnabled({ timeout: getTimeout(10000) });
      await bulkButton.click();
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      await expect(surveyOption).toBeVisible({ timeout: getTimeout(10000) });
      await page.keyboard.press('Escape');
      await expect(dialog, '確定前は Escape でダイアログが閉じる').toBeHidden({
        timeout: getTimeout(5000),
      });

      // ---- 確定前: インジケーターは出ていない ----
      await bulkButton.click();
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      await surveyOption.click();
      await expect(surveyOption).toHaveAttribute('aria-checked', 'true');
      await expect(confirmButton).toBeEnabled();
      await expect(confirmButton).toHaveText('実行');
      await expect(spinner, '確定前は処理中インジケーターが無い').toHaveCount(0);
      await expect(bulkButton).toHaveAttribute('aria-busy', 'false');
      expect(heldRequests, '確定前は写真一覧の取得が発行されていない').toEqual([]);

      // ---- 確定: 最初の実行（重ね押しと同じ押し方で起こす） ----
      await confirmButton.click({ force: true });
      await firstHeld;

      // ---- 実行中: 処理中インジケーター ----
      await expect(spinner, '実行中は処理中インジケーターが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(confirmButton).toHaveText('生成中...');
      await expect(bulkButton).toHaveAttribute('aria-busy', 'true');

      // ---- 実行中: 操作の封鎖（状態）。失敗しても下の挙動の観測まで進める ----
      await expect.soft(confirmButton, '実行中は確定ボタンが押せない').toBeDisabled();
      await expect.soft(cancelButton, '実行中はキャンセルできない').toBeDisabled();
      await expect.soft(closeButton, '実行中はダイアログを閉じられない').toBeDisabled();
      await expect.soft(bulkButton, '実行中は一括追加を開き直せない').toBeDisabled();

      // ---- 実行中: 重ね押しと、閉じる操作を試みる ----
      await confirmButton.click({ force: true });
      await confirmButton.click({ force: true });
      await page.keyboard.press('Escape');
      await expect(dialog, '実行中は Escape でもダイアログが閉じない').toBeVisible();
      await expect(spinner, '重ね押しの後も実行中の表示が続く').toBeVisible();

      // ---- 取得を解放し、完了を待つ ----
      releaseGate();
      await expect(page.getByText(`${PHOTO_COUNT}件のグループを生成しました`)).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
      await expect(bulkButton, '完了後は実行中の表示が解除される').toHaveAttribute(
        'aria-busy',
        'false'
      );
      await expect(bulkButton).toBeEnabled();

      // ---- 重複実行が起きていないこと ----
      expect(heldRequests, '写真一覧の取得は確定1回ぶんだけ発行される').toEqual([
        `GET ${surveyDetailPath}`,
      ]);
      await expect(groupCards, '生成されるグループは写真枚数ぶんに留まる').toHaveCount(PHOTO_COUNT);
    } finally {
      releaseGate();
    }
  });
});
