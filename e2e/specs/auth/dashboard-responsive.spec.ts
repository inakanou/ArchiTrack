import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { TEST_USERS } from '../../helpers/test-users';
import {
  cleanDatabase,
  cleanDatabaseAndRestoreTestData,
  getPrismaClient,
} from '../../fixtures/database';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';

/**
 * ダッシュボードの見出しのモバイル幅の表示（Task 40.3）
 *
 * 経緯: ダッシュボードの見出し「ようこそ、{表示名}さん」（frontend/src/pages/Dashboard.tsx の h1）は
 * 折り返しの指定を持たず、区切りの無い英数字一語の長い表示名では、その一語が画面幅を超えて
 * 文書全体を水平にはみ出させていた（test 環境の実ブラウザで実測。英数字 60 文字の表示名で、
 * 320・375・768 幅の documentElement の scrollWidth が 983〜991 になる。管理者・一般ユーザーとも）。
 * 長い和文は文字ごとに折り返せるため、はみ出さない。
 * 表示名は backend が最大 100 文字まで許すため（auth-update.schema.ts の max(100)）、上限の 100 文字で測る。
 */

/**
 * 測る画面幅
 *
 * 要件15.1 が定めるモバイル幅（320px-767px）の下限 320 と、実測でのはみ出しを確かめた 375・768 の三つ。
 * 768 は要件15.1 の区分ではタブレット（768px-1023px）の下端に当たる（共通ヘッダーは 768px 以下をモバイルの表示にする）。
 */
const DASHBOARD_WIDTHS = [320, 375, 768] as const;

/** 測るロール。管理者は管理機能のセクションが一つ多い */
const DASHBOARD_ROLES = [
  { label: '管理者', userKey: 'ADMIN_USER' },
  { label: '一般ユーザー', userKey: 'REGULAR_USER' },
] as const;

/** backend が許す表示名の最大の文字数 */
const DISPLAY_NAME_MAX_LENGTH = 100;

/**
 * 測る表示名
 *
 * displayName が null のものはテストユーザーの既定の表示名（現実的な長さ）のまま測る。
 * 長い表示名は、区切りの無い英数字一語（折り返す位置が無い）と長い和文の二通りで、ともに上限の 100 文字とする。
 */
const DISPLAY_NAME_CASES = [
  { label: '既定の表示名', displayName: null },
  {
    label: '区切りの無い英数字一語の長い表示名',
    displayName: 'Abcdefghij0123456789'.repeat(5),
  },
  {
    label: '長い和文の表示名',
    displayName: 'ダッシュボードの見出しの表示を確かめるためのとても長い表示名を持つ利用者'
      .repeat(3)
      .slice(0, DISPLAY_NAME_MAX_LENGTH),
  },
] as const;

/** 水平方向の許容誤差（px）。小数のレイアウトの丸めを吸収する */
const HORIZONTAL_TOLERANCE_PX = 1;

/**
 * 文書全体（documentElement）が水平にはみ出していないことを主張する
 *
 * clientWidth が設定した画面幅と一致することを先に主張する。
 * 画面幅の設定が効いていなければ、はみ出しの主張は別の幅を測ったことになるためである。
 */
async function expectNoDocumentHorizontalOverflow(page: Page, width: number): Promise<void> {
  const m = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const report = `documentElement の scrollWidth=${m.scrollWidth} / clientWidth=${m.clientWidth}（画面幅 ${m.viewportWidth}）`;
  expect(m.viewportWidth, report).toBe(width);
  expect(m.clientWidth, report).toBe(width);
  expect(m.scrollWidth - m.clientWidth, report).toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
}

/**
 * 要素の箱と中身（文字）が画面幅の内側にあることを主張する
 *
 * 位置は文書の座標（表示領域の座標 + 水平スクロール量）で測る。
 * 要素の箱だけでなく中身の文字の右端も DOM Range で測る。
 * ブロック要素の箱は親の幅に収まったまま、折り返せない文字だけが箱の外へはみ出しうるためである。
 */
async function expectContentWithinViewport(target: Locator, description: string): Promise<void> {
  const m = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const content = range.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      left: rect.left + window.scrollX,
      right: rect.right + window.scrollX,
      width: rect.width,
      contentLeft: content.left + window.scrollX,
      contentRight: content.right + window.scrollX,
    };
  });
  const report = `${description}: ${JSON.stringify(m)}`;
  expect(m.width, report).toBeGreaterThan(0);
  expect(m.left, report).toBeGreaterThanOrEqual(-HORIZONTAL_TOLERANCE_PX);
  expect(m.right, report).toBeLessThanOrEqual(m.viewportWidth + HORIZONTAL_TOLERANCE_PX);
  expect(m.contentLeft, report).toBeGreaterThanOrEqual(-HORIZONTAL_TOLERANCE_PX);
  expect(m.contentRight, report).toBeLessThanOrEqual(m.viewportWidth + HORIZONTAL_TOLERANCE_PX);
}

test.describe('ダッシュボードの見出しのモバイル幅の表示', () => {
  /**
   * テスト開始前にデータベースをクリーンアップし、テストユーザーを再作成
   * 前のテストによるパスワード変更・表示名の変更の影響を防止
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await createAllTestUsers(prisma);
  });

  /**
   * 表示名を書き換えたテストの後に、テストユーザーの表示名を既定へ戻す
   * 後続のテスト（表示名を突き合わせる検証）への影響を防ぐため、無条件に戻す
   */
  test.afterEach(async () => {
    const prisma = getPrismaClient();
    for (const role of DASHBOARD_ROLES) {
      const user = TEST_USERS[role.userKey];
      await prisma.user.update({
        where: { email: user.email },
        data: { displayName: user.displayName },
      });
    }
  });

  for (const role of DASHBOARD_ROLES) {
    for (const nameCase of DISPLAY_NAME_CASES) {
      for (const width of DASHBOARD_WIDTHS) {
        /**
         * @requirement user-authentication/REQ-15.1: 全ての画面はレスポンシブデザイン（モバイル: 320px-767px、タブレットの下端 768px）を実装する
         *
         * 判定根拠: ダッシュボード画面で、見出しに測る対象の表示名が届いていることを前提として主張したうえで、
         * 文書全体（documentElement）の scrollWidth と clientWidth の差が許容誤差 1px 以内であることと、
         * 見出しの箱と文字が画面幅の内側にあることを主張している。
         * 見出しが長い表示名を折り返さなければ、文書全体が水平にスクロールして赤になる（上の経緯の実測値）。
         */
        test(`${width}px・${role.label}・${nameCase.label}: ダッシュボードの見出しが文書全体を水平にはみ出させず、画面幅の内側に収まる`, async ({
          page,
        }) => {
          const testUser = TEST_USERS[role.userKey];
          const displayName = nameCase.displayName ?? testUser.displayName;
          await getPrismaClient().user.update({
            where: { email: testUser.email },
            data: { displayName },
          });

          await loginAsUser(page, role.userKey);
          await page.setViewportSize({ width, height: 812 });
          await page.goto('/dashboard');
          await expect(page).toHaveURL(/\/dashboard$/);

          // 前提: ダッシュボードの見出しが表示され、測る対象の表示名を含んでいる
          const dashboard = page.getByTestId('dashboard');
          await expect(dashboard).toBeVisible();
          const heading = dashboard.getByRole('heading', { level: 1 });
          await expect(heading).toBeVisible();
          await expect(heading).toHaveText(`ようこそ、${displayName}さん`);

          // 文書全体が水平にはみ出さず、見出しの箱と文字が画面幅の内側にある
          await expectNoDocumentHorizontalOverflow(page, width);
          await expectContentWithinViewport(heading, 'ダッシュボードの見出し');
        });
      }
    }
  }

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    await cleanDatabaseAndRestoreTestData();
  });
});
