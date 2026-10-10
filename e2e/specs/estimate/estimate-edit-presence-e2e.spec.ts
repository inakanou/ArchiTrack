/**
 * @fileoverview 他のユーザーが見積書を編集中であることの警告表示の E2E テスト
 *
 * Task 61.1: 2 人の利用者が別々のブラウザコンテキスト（別セッション）で同じ見積書を開き、
 * 互いの画面に相手が編集中である警告が出ること、片方が画面を離れると相手の画面から
 * 警告が消えることを検証する。
 *
 * 仕組み: 見積書詳細画面（常時編集、REQ-27.1）は開いている間、在席を
 * `PUT /api/estimates/:id/edit-session` で 20 秒ごとに通知し、応答に含まれる
 * 編集中の他の利用者を警告として表示する。画面を離れると `DELETE` で退出を通知する。
 * 先に開いた側が相手を知るのは次の在席通知の時点であるため、待ちは通知間隔を上回る
 * 上限で取る（固定の待機は置かず、表示の変化そのものを待つ）。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module e2e/specs/estimate/estimate-edit-presence-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { seedProject } from '../../helpers/project-list-preconditions';
import { TEST_USERS } from '../../helpers/test-users';

/** 在席通知の間隔（`frontend/src/hooks/useEstimateEditPresence.ts` と同じ 20 秒）に余裕を足した上限 */
const PRESENCE_UPDATE_TIMEOUT_MS = 45000;

const editSessionPath = (estimateId: string): string => `/api/estimates/${estimateId}/edit-session`;

/** 指定の見積書の在席通知（PUT）の応答を待つ */
const waitForHeartbeat = (page: Page, estimateId: string): Promise<Response> =>
  page.waitForResponse(
    (response) =>
      response.url().includes(editSessionPath(estimateId)) && response.request().method() === 'PUT',
    { timeout: getTimeout(PRESENCE_UPDATE_TIMEOUT_MS) }
  );

/** 見積書詳細画面を開き、最初の在席通知が成功するまで待つ */
const openEstimate = async (page: Page, estimateId: string): Promise<void> => {
  const heartbeat = waitForHeartbeat(page, estimateId);
  await page.goto(`/estimates/${estimateId}`);
  await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  expect((await heartbeat).status()).toBe(200);
};

/**
 * 警告文の中で、表示名が「さん」を伴って挙げられていることを表す正規表現を作る
 *
 * 「Test User」は「Test User 2」の前方と一致するため、名前の前後の区切り（文頭か読点、
 * 直後の「さん」と読点か「が」）まで含めて照合し、取り違えを防ぐ。
 */
const editingMessage = (displayName: string): RegExp =>
  new RegExp(`(^|、)${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}さん(、|が)`);

test.describe('他のユーザーが編集中の警告表示', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * @requirement estimate-creation/REQ-11.7
   */
  test('別の利用者が同じ見積書を開くと互いに編集中の警告が出て、離れると消える (estimate-creation/REQ-11.7)', async ({
    browser,
  }) => {
    test.setTimeout(getTimeout(180000));

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // ---- 前提: 利用者 A がプロジェクトと見積書を作る ----
      await loginAsUser(pageA, 'REGULAR_USER');
      const project = await seedProject(pageA, 'E2E編集中警告');
      const tokenA = await pageA.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(tokenA, '前提: 利用者 A のアクセストークンを取得できる').toBeTruthy();
      const estimateRes = await pageA.request.post(
        `${API_BASE_URL}/api/projects/${project.id}/estimates`,
        {
          headers: { Authorization: `Bearer ${tokenA}` },
          data: { name: `編集中警告テスト_${Date.now()}` },
        }
      );
      expect(estimateRes.status(), '前提: 見積書が作成される').toBe(201);
      const estimateId = ((await estimateRes.json()) as { id: string }).id;
      expect(estimateId).toBeTruthy();

      const nameA = TEST_USERS.REGULAR_USER.displayName;
      const nameB = TEST_USERS.REGULAR_USER_2.displayName;
      const warningA = pageA.getByTestId('estimate-edit-presence-warning');
      const warningB = pageB.getByTestId('estimate-edit-presence-warning');

      // ---- A だけが開いている間は警告が出ない ----
      await openEstimate(pageA, estimateId);
      await expect(warningA).toHaveCount(0);

      // ---- B が同じ見積書を開くと、B の画面に A が編集中である警告が出る ----
      await loginAsUser(pageB, 'REGULAR_USER_2');
      await openEstimate(pageB, estimateId);
      await expect(warningB).toBeVisible({ timeout: getTimeout(10000) });
      await expect(warningB).toHaveAttribute('role', 'status');
      await expect(warningB).toContainText('がこの見積書を編集中です');
      await expect(warningB.locator('p')).toHaveText(editingMessage(nameA));
      await expect(warningB.locator('p')).not.toHaveText(editingMessage(nameB));

      // ---- A の画面にも、次の在席通知で B が編集中である警告が出る ----
      await expect(warningA).toBeVisible({ timeout: getTimeout(PRESENCE_UPDATE_TIMEOUT_MS) });
      await expect(warningA).toHaveAttribute('role', 'status');
      await expect(warningA.locator('p')).toHaveText(editingMessage(nameB));
      await expect(warningA.locator('p')).not.toHaveText(editingMessage(nameA));

      // ---- B がアプリ内の画面遷移で離れると退出が通知され、A の画面から警告が消える ----
      const leave = pageB.waitForResponse(
        (response) =>
          response.url().includes(editSessionPath(estimateId)) &&
          response.request().method() === 'DELETE',
        { timeout: getTimeout(15000) }
      );
      await pageB.getByRole('link', { name: '見積書一覧' }).click();
      await pageB.waitForURL(/\/projects\/[0-9a-f-]+\/estimates$/);
      expect((await leave).status()).toBe(204);

      await expect(warningA).toHaveCount(0, {
        timeout: getTimeout(PRESENCE_UPDATE_TIMEOUT_MS),
      });

      // ---- B が開き直すと A の画面に再び警告が出る ----
      await openEstimate(pageB, estimateId);
      await expect(warningA).toBeVisible({ timeout: getTimeout(PRESENCE_UPDATE_TIMEOUT_MS) });
      await expect(warningA.locator('p')).toHaveText(editingMessage(nameB));

      // ---- B がタブを閉じても（画面遷移を経ずに）A の画面から警告が消える ----
      // 待ちの上限は通知間隔に余裕を足した値で、サーバーの TTL（90 秒）より短い。
      // TTL の失効を待たずに消えることで、タブを閉じたときの退出の通知が届いたことを確かめる。
      const closedAt = performance.now();
      await pageB.close({ runBeforeUnload: true });
      await expect(warningA).toHaveCount(0, {
        timeout: getTimeout(PRESENCE_UPDATE_TIMEOUT_MS),
      });
      expect(performance.now() - closedAt).toBeLessThan(90000);

      // 見積書の画面そのものは A の手元で編集可能なまま残っている
      await expect(pageA.getByTestId('estimate-detail-page')).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  /**
   * @requirement estimate-creation/REQ-11.7
   */
  test('スマートフォン幅（375px）でも警告が画面の横幅に収まる (estimate-creation/REQ-11.7)', async ({
    browser,
  }) => {
    test.setTimeout(getTimeout(120000));

    const contextA = await browser.newContext();
    const contextB = await browser.newContext({ viewport: { width: 375, height: 812 } });
    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await loginAsUser(pageA, 'REGULAR_USER');
      const project = await seedProject(pageA, 'E2E編集中警告375');
      const tokenA = await pageA.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(tokenA, '前提: 利用者 A のアクセストークンを取得できる').toBeTruthy();
      const estimateRes = await pageA.request.post(
        `${API_BASE_URL}/api/projects/${project.id}/estimates`,
        {
          headers: { Authorization: `Bearer ${tokenA}` },
          data: { name: `編集中警告375_${Date.now()}` },
        }
      );
      expect(estimateRes.status(), '前提: 見積書が作成される').toBe(201);
      const estimateId = ((await estimateRes.json()) as { id: string }).id;

      await openEstimate(pageA, estimateId);

      await loginAsUser(pageB, 'REGULAR_USER_2');
      await openEstimate(pageB, estimateId);
      const warningB = pageB.getByTestId('estimate-edit-presence-warning');
      await expect(warningB).toBeVisible({ timeout: getTimeout(10000) });

      // 警告の右端がビューポートの内側にあり、警告の中身が横にはみ出していない
      const box = await warningB.boundingBox();
      expect(box, '警告の矩形を取得できる').not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      const overflow = await warningB.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
