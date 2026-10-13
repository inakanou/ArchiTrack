/**
 * @fileoverview 現調画像の紐付けの失敗を利用者へ伝える E2E
 *
 * Task 86.5: 現調画像の紐付けの失敗が利用者に伝わらない状態を解消する
 *
 * 本ファイルは受入基準番号を名乗らない。Task 86 が守るのはテナント境界とエラー応答の妥当性
 * であり、本スペックの受入基準として条文化されていない（tasks.md の Task 86 節末尾に明記）。
 *
 * 検証する画面の振る舞い（いずれも実バックエンドの応答に対する編集画面の提示）:
 * 1. 取得時に落とした紐付け（Task 86.3）: 編集画面を開くと、落とした紐付けを持つグループを
 *    名指して告げる。保存で紐付けが解除されると告知は消える。
 * 2. 保存の 400（他プロジェクトの写真。Task 86.1 / 86.4）: 原因のグループを名指し、再試行を促さない。
 * 3. 保存の 404（写真の物理削除。Task 86.2）: 原因のグループを名指し、再試行を促さない。
 * 4. 保存の 410（親の現場調査の論理削除。Task 81.1 / 名指しと解除は Task 90.2）: 原因のグループを
 *    名指し、再試行を促さない。続けて紐付けを解除すると保存が通る（袋小路の出口）。
 *    論理削除された現場調査の写真は選択候補に現れないため、「写真を変更」では復旧できない。
 *
 * 前提の作り方:
 * - (1) の所属違反の紐付けは、Task 86.1 以降 API からは作れないため DB へ直接書く
 *   （86.1 より前に永続化された既存の紐付けを模す）。
 * - (2) は、画面が他プロジェクトの画像IDを保存へ送る経路を持たない（取得が識別子ごと落とし、
 *   写真の選択候補は当該プロジェクトに限られる）。そこで保存要求の本文だけを書き換えて
 *   実バックエンドへ送る。**応答は書き換えない**——画面が受け取るのはバックエンドの実応答である。
 * - (3)(4) は、編集画面を開いた後に管理者が API で写真・現場調査を削除する。一般ユーザーは
 *   削除の権限を持たないため、本番で起きる「編集中に他の利用者が消した」状況そのものになる。
 *   削除する写真・現場調査は各テストの中で用意する（再試行で前提が消費済みにならないように）。
 *
 * @module e2e/specs/quantity-tables/survey-image-link-failure-e2e.spec
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createTestProject,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

const RUN_ID = Date.now();

/** 保存経路（PUT /api/quantity-tables/:id/save）の URL */
const SAVE_URL_PATTERN = /\/api\/quantity-tables\/[^/]+\/save$/;

/** 恒久的な失敗に対して出してはならない案内（再試行しても成功しない） */
const RETRY_WORDING = '再度お試しください';

// ============================================================================
// 前提の状態
// ============================================================================

interface PreparedState {
  /** 数量表を置くプロジェクト */
  ownerProjectId: string;
  /** 所属違反の供給元となる別プロジェクト */
  foreignProjectId: string;
  /** 数量表側プロジェクトの写真（本ファイルでは削除しない） */
  ownImageIds: string[];
  /** 別プロジェクトの写真 */
  foreignImageId: string;
}

let prepared: PreparedState | null = null;

function requirePrepared(): PreparedState {
  assertPrepared(prepared, '事前準備の状態');
  return prepared;
}

// ============================================================================
// ヘルパー
// ============================================================================

/** ログイン済みページのアクセストークンを取り出す */
async function readAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  assertPrepared(token, 'アクセストークン');
  return token;
}

/**
 * 数量表を作り、写真を紐付けたグループを保存経路で用意する。
 *
 * 画面操作でグループを作り写真を選ぶ手順は本ファイルの関心（失敗の提示）と無関係であるため、
 * 前提の生成は編集画面と同じ保存経路（PUT /api/quantity-tables/:id/save）で行い、
 * 成立は応答で主張する。
 */
async function createTableWithGroups(
  page: Page,
  projectId: string,
  name: string,
  groups: ReadonlyArray<{ name: string; surveyImageId: string | null }>
): Promise<{ tableId: string; groupIds: string[] }> {
  const headers = { Authorization: `Bearer ${await readAccessToken(page)}` };

  const created = await page.request.post(
    `${API_BASE_URL}/api/projects/${projectId}/quantity-tables`,
    {
      headers,
      data: { name },
    }
  );
  expect(created.status(), '前提: 数量表を作成できる').toBe(201);
  const { id: tableId } = (await created.json()) as { id: string };

  const detail = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
    headers,
  });
  expect(detail.status(), '前提: 作成した数量表を取得できる').toBe(200);
  const { updatedAt } = (await detail.json()) as { updatedAt: string };

  const saved = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
    headers,
    data: {
      expectedUpdatedAt: updatedAt,
      name,
      groups: groups.map((group, index) => ({
        id: null,
        name: group.name,
        surveyImageId: group.surveyImageId,
        displayOrder: index,
        items: [],
      })),
    },
  });
  expect(
    saved.status(),
    `前提: 写真を紐付けたグループを保存できる (status=${saved.status()})`
  ).toBe(200);
  const savedBody = (await saved.json()) as {
    groups: Array<{ id: string; name: string; surveyImageId: string | null }>;
  };
  expect(
    savedBody.groups.map((group) => [group.name, group.surveyImageId]),
    '前提: グループと写真の紐付けが保存される'
  ).toEqual(groups.map((group) => [group.name, group.surveyImageId]));

  return { tableId, groupIds: savedBody.groups.map((group) => group.id) };
}

/**
 * 管理者として削除の API を呼び、状態コードを返す。
 *
 * 一般ユーザーは現場調査・写真の削除の権限を持たないため、「編集中に他の利用者が消した」
 * 状況は管理者の別コンテキストから作る。
 */
async function deleteAsAdmin(browser: Browser, path: string): Promise<number> {
  const context = await browser.newContext();
  const adminPage = await context.newPage();
  try {
    await loginAsUser(adminPage, 'ADMIN_USER');
    const response = await adminPage.request.delete(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${await readAccessToken(adminPage)}` },
    });
    return response.status();
  } finally {
    await context.close();
  }
}

/** 保存ボタンを押し、保存経路の実応答の状態コードと code を返す */
async function clickSaveAndCaptureResponse(
  page: Page
): Promise<{ status: number; code: string | undefined }> {
  const responsePromise = page.waitForResponse(
    (response) =>
      SAVE_URL_PATTERN.test(new URL(response.url()).pathname) &&
      response.request().method() === 'PUT',
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const response = await responsePromise;
  const body = (await response.json()) as { code?: string };
  return { status: response.status(), code: body.code };
}

/** 保存の失敗を示す操作エラー（role="alert"） */
function saveFailureAlert(page: Page) {
  return page.getByRole('alert').filter({ hasText: '保存できません' });
}

// ============================================================================
// テスト
// ============================================================================

test.describe('現調画像の紐付けの失敗の提示（Task 86.5）', () => {
  // `mode: 'serial'` は用いない。各テストは自前の数量表を作り互いに依存しないため、
  // 先頭が落ちても後続の提示を個別に確かめられるようにする。

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'REGULAR_USER');

      const ownerProjectId = await createTestProject(page, `T86_5_数量表側_${RUN_ID}`);
      const foreignProjectId = await createTestProject(page, `T86_5_画像側_${RUN_ID}`);

      const ownSurvey = await seedSurveyPhotosWithComments(
        page,
        ownerProjectId,
        'T86_5_自プロジェクト',
        [null, null],
        'none'
      );
      const foreignSurvey = await seedSurveyPhotosWithComments(
        page,
        foreignProjectId,
        'T86_5_別プロジェクト',
        [null],
        'none'
      );
      const foreignImageId = foreignSurvey.imageIds[0];
      assertPrepared(foreignImageId, '別プロジェクトの写真のID');

      prepared = {
        ownerProjectId,
        foreignProjectId,
        ownImageIds: ownSurvey.imageIds,
        foreignImageId,
      };
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const state = requirePrepared();
    for (const projectId of [state.ownerProjectId, state.foreignProjectId]) {
      const status = await deleteAsAdmin(browser, `/api/projects/${projectId}`);
      expect([200, 204, 404]).toContain(status);
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test('取得時に落とした紐付けを持つグループを名指して告げ、保存で紐付けが解除されると告知が消える', async ({
    page,
  }) => {
    const state = requirePrepared();
    const { tableId, groupIds } = await createTableWithGroups(
      page,
      state.ownerProjectId,
      `T86_5_取得_${RUN_ID}`,
      [
        { name: '自プロジェクトの写真', surveyImageId: state.ownImageIds[0]! },
        { name: '他プロジェクトの写真', surveyImageId: null },
      ]
    );
    const foreignGroupId = groupIds[1];
    assertPrepared(foreignGroupId, '所属違反を持たせるグループのID');

    // 所属違反の紐付けは API から作れない（Task 86.1）ため DB へ直接書く
    const prisma = getPrismaClient();
    await prisma.quantityGroup.update({
      where: { id: foreignGroupId },
      data: { surveyImageId: state.foreignImageId },
    });

    await openQuantityTableEdit(page, tableId);

    const notice = page.getByTestId('survey-image-link-dropped-notice');
    await expect(notice).toBeVisible({ timeout: getTimeout(10000) });
    await expect(notice).toHaveText(
      '参照できない写真の紐付けがあったため、次のグループの写真を表示していません: グループ「他プロジェクトの写真」。保存するとこの紐付けは解除されます。'
    );
    await expect(notice).not.toContainText('自プロジェクトの写真');

    // 落としたのは当該の紐付けだけで、同一プロジェクトの写真は表示される
    // （写真の表示を観測できていることの非空証明）
    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards).toHaveCount(2);
    await expect(groupCards.nth(0).locator('[data-testid^="image-placeholder-"]')).toHaveCount(0);
    await expect(groupCards.nth(1).locator('[data-testid^="image-placeholder-"]')).toBeVisible();

    // 画面に他プロジェクトの画像IDは現れない（Task 86.3 の不変条件）。
    // 同じ観測（描画された HTML の文字列）の中に、同じ形の識別子が現れることを先に主張する。
    // 所属違反を落としたグループそのものの ID は、写真枠のプレースホルダの data-testid
    // （`image-placeholder-<グループID>`）として描画される。これが見えることで、観測器が
    // この画面の UUID を捉えられること（＝下の不在が恒真でないこと）を示す。
    // 同一プロジェクトの画像IDは非空証明に使えない。編集画面が画像IDを描画するのは写真選択
    // ダイアログの候補（`photo-item-<画像ID>`）だけであり、候補は注釈付きの写真に限られるが、
    // 本ファイルの前提の写真は注釈を持たないためである。
    const renderedHtml = await page.content();
    expect(renderedHtml).toContain(`image-placeholder-${foreignGroupId}`);
    expect(renderedHtml).not.toContain(state.foreignImageId);

    // 取得した内容をそのまま保存すると紐付けが解除され、告知は消える
    await saveQuantityTableDraft(page);
    await expect(notice).toHaveCount(0);
    const persisted = await prisma.quantityGroup.findUnique({
      where: { id: foreignGroupId },
      select: { surveyImageId: true },
    });
    expect(persisted?.surveyImageId).toBeNull();
  });

  test('保存が他プロジェクトの写真で拒まれたとき、原因のグループを名指し再試行を促さない（400）', async ({
    page,
  }) => {
    const state = requirePrepared();
    const originalImageId = state.ownImageIds[1]!;
    const { tableId, groupIds } = await createTableWithGroups(
      page,
      state.ownerProjectId,
      `T86_5_所属違反_${RUN_ID}`,
      [
        { name: '残る写真', surveyImageId: state.ownImageIds[0]! },
        { name: '差し替えられる写真', surveyImageId: originalImageId },
      ]
    );

    await openQuantityTableEdit(page, tableId);

    // 保存要求の本文の2番目のグループだけを他プロジェクトの写真へ書き換えて送る。応答は書き換えない
    await page.route(SAVE_URL_PATTERN, async (route) => {
      const body = route.request().postDataJSON() as {
        groups: Array<{ surveyImageId: string | null }>;
      };
      body.groups[1]!.surveyImageId = state.foreignImageId;
      await route.continue({ postData: JSON.stringify(body) });
    });

    const response = await clickSaveAndCaptureResponse(page);
    expect(response.status).toBe(400);
    expect(response.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');

    const alert = saveFailureAlert(page);
    await expect(alert).toContainText(
      '次のグループの写真はこの数量表のプロジェクトに属していないため保存できません: グループ「差し替えられる写真」。写真を変更するか紐付けを解除してから保存してください。'
    );
    await expect(alert).not.toContainText('残る写真');
    await expect(alert).not.toContainText(RETRY_WORDING);

    // 保存は中断され、紐付けは変わらない
    const persisted = await getPrismaClient().quantityGroup.findUnique({
      where: { id: groupIds[1]! },
      select: { surveyImageId: true },
    });
    expect(persisted?.surveyImageId).toBe(originalImageId);
  });

  test('編集中に写真が削除されたとき、原因のグループを名指し再試行を促さない（404）', async ({
    page,
    browser,
  }) => {
    const state = requirePrepared();
    const doomedSurvey = await seedSurveyPhotosWithComments(
      page,
      state.ownerProjectId,
      'T86_5_写真を削除',
      [null],
      'none'
    );
    const doomedImageId = doomedSurvey.imageIds[0];
    assertPrepared(doomedImageId, '削除する写真のID');

    const { tableId } = await createTableWithGroups(
      page,
      state.ownerProjectId,
      `T86_5_写真の削除_${RUN_ID}`,
      [
        { name: '残る写真', surveyImageId: state.ownImageIds[0]! },
        { name: '削除される写真', surveyImageId: doomedImageId },
      ]
    );

    await openQuantityTableEdit(page, tableId);

    // 編集画面を開いた後で、管理者が写真を削除する（物理削除）
    expect(await deleteAsAdmin(browser, `/api/site-surveys/images/${doomedImageId}`)).toBe(204);

    const response = await clickSaveAndCaptureResponse(page);
    expect(response.status).toBe(404);
    expect(response.code).toBe('SURVEY_IMAGE_NOT_FOUND');

    const alert = saveFailureAlert(page);
    await expect(alert).toContainText(
      '次のグループの写真は削除されているため保存できません: グループ「削除される写真」。写真を変更するか紐付けを解除してから保存してください。'
    );
    await expect(alert).not.toContainText('残る写真');
    await expect(alert).not.toContainText(RETRY_WORDING);
  });

  test('編集中に写真の現場調査が削除されたとき、原因のグループを名指し、紐付けを解除すると保存できる（410。Task 90.2）', async ({
    page,
    browser,
  }) => {
    const state = requirePrepared();
    const doomedSurvey = await seedSurveyPhotosWithComments(
      page,
      state.ownerProjectId,
      'T90_2_現場調査を削除',
      [null],
      'none'
    );
    const imageId = doomedSurvey.imageIds[0];
    assertPrepared(imageId, '論理削除する現場調査の写真のID');

    const { tableId, groupIds } = await createTableWithGroups(
      page,
      state.ownerProjectId,
      `T90_2_現場調査の削除_${RUN_ID}`,
      [
        { name: '残る写真', surveyImageId: state.ownImageIds[0]! },
        { name: '現場調査ごと削除', surveyImageId: imageId },
      ]
    );
    const doomedGroupId = groupIds[1];
    assertPrepared(doomedGroupId, '現場調査ごと削除されるグループのID');

    await openQuantityTableEdit(page, tableId);

    // 編集画面を開いた後で、管理者が現場調査を削除する（論理削除）
    expect(await deleteAsAdmin(browser, `/api/site-surveys/${doomedSurvey.surveyId}`)).toBe(204);

    const response = await clickSaveAndCaptureResponse(page);
    expect(response.status).toBe(410);
    expect(response.code).toBe('SURVEY_DELETED');

    // 原因のグループを名指す（Task 90.2）。該当しないグループは名指さない
    const alert = saveFailureAlert(page);
    await expect(alert).toContainText(
      '次のグループの写真は現場調査ごと削除されているため保存できません: グループ「現場調査ごと削除」。写真を変更するか紐付けを解除してから保存してください。'
    );
    await expect(alert).not.toContainText('残る写真');
    await expect(alert).not.toContainText(RETRY_WORDING);

    // 袋小路の出口: 画面から紐付けを解除すると保存が通る（Task 90.2）。
    // 論理削除された現場調査の写真は選択候補に現れないため、「変更」では復旧できない。
    const doomedCard = page
      .locator('[data-testid="quantity-group-card"]')
      .filter({ hasText: '現場調査ごと削除' });
    await doomedCard.getByRole('button', { name: '写真の紐付けを解除' }).click();

    // 解除はドラフトにのみ反映される（REQ-42.3）。写真枠がプレースホルダへ変わる
    await expect(doomedCard.getByTestId(`image-placeholder-${doomedGroupId}`)).toBeVisible();

    await saveQuantityTableDraft(page);

    // 紐付けが解除された状態で永続化され、もう一方のグループの写真は保たれる
    const prisma = getPrismaClient();
    const persisted = await prisma.quantityGroup.findUnique({
      where: { id: doomedGroupId },
      select: { surveyImageId: true },
    });
    expect(persisted?.surveyImageId).toBeNull();
    const kept = await prisma.quantityGroup.findUnique({
      where: { id: groupIds[0]! },
      select: { surveyImageId: true },
    });
    expect(kept?.surveyImageId).toBe(state.ownImageIds[0]!);
  });
});
