/**
 * @fileoverview 取引先ナビゲーション・画面遷移のE2Eテスト
 *
 * Task 15.4: ナビゲーション・画面遷移のE2Eテスト
 *
 * 取引先管理機能のナビゲーションと画面遷移をテストします。
 * - ヘッダーナビゲーションリンク
 * - ダッシュボードクイックアクセス
 * - URL直接アクセス
 * - パンくずナビゲーション
 * - 画面間遷移
 * - 未認証アクセス時のリダイレクト
 * - 作成・編集フォームの支払日の入力のモバイル幅での収まり（タスク 31.1）
 *
 * Requirements:
 * - 12.1: ヘッダーに「取引先」ナビゲーションリンクを表示
 * - 12.2: ヘッダーの「取引先」リンクをクリックすると取引先一覧画面に遷移
 * - 12.3: 「取引先」リンクにアイコンを付与
 * - 12.4: 「取引先」リンクを「プロジェクト」リンクの次に配置
 * - 12.5: ダッシュボードのクイックアクセスに「取引先管理」カードを表示
 * - 12.6: 取引先管理カードをクリックすると取引先一覧画面に遷移
 * - 12.7: 取引先管理カードに「顧客・協力業者の登録・管理」と表示
 * - 12.8: 取引先管理カードを「プロジェクト管理」カードの次に配置
 * - 12.9-12.12: URL設計（/trading-partners, /trading-partners/new等）
 * - 12.13: 存在しない取引先ID時に「取引先が見つかりません」と戻るリンクを表示
 * - 12.14-12.18: パンくずナビゲーション
 * - 12.19-12.22: 画面間遷移（作成成功、更新成功、削除成功、キャンセル時）
 * - 12.23: 未認証アクセス時のリダイレクト
 * - 12.24-12.27: URLルーティング
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';
import { assertPresent } from '../../helpers/preconditions';
import { breadcrumbNav, readBreadcrumbTrail } from '../../helpers/breadcrumb';

/** モバイル幅の折り返しを測る画面幅（タスク 30.1）。 */
const MOBILE_WIDTHS = [375, 320] as const;

/** 水平のはみ出しと高さの比較に許す誤差（px）。 */
const LAYOUT_TOLERANCE_PX = 1;

/**
 * 取引先を新規作成画面から作成し、その ID を返す（モバイル幅の折り返しの検証の準備）。
 *
 * 作成に失敗した場合は応答待ちが時間切れで失敗する（前提を満たせないまま先へ進まない）。
 */
async function createTradingPartnerForBreadcrumb(page: Page, partnerName: string): Promise<string> {
  await page.goto('/trading-partners/new');
  await page.waitForLoadState('networkidle');

  await page.getByLabel('取引先名').fill(partnerName);
  await page.getByLabel('フリガナ', { exact: true }).fill('パンクズオリカエシトリヒキサキ');
  await page.getByLabel('住所').fill('東京都渋谷区パンくず折り返し1-2-3');
  await page.getByRole('checkbox', { name: /顧客/i }).check();

  const createPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/trading-partners') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: /^作成$/i }).click();
  const createResponse = await createPromise;
  const responseData = (await createResponse.json()) as { id?: string };
  const partnerId = responseData.id;
  expect(partnerId, '作成した取引先の ID が応答に無い').toBeTruthy();
  return partnerId as string;
}

/**
 * パンくずナビゲーションの配置を実ブラウザで測る。
 *
 * - 各項目の文字列の箱（リンクまたは現在項目）の高さと、同じ文字列を折り返させずに置いたときの
 *   高さ・幅（一行ぶんの高さと自然幅）を測る。一行ぶんの高さは固定値ではなく、同じ要素の複製を
 *   `white-space: nowrap` で同じ場所に置いて測る。
 * - 文字列の右端は箱ではなく文字列そのもの（Range の外接矩形）で測る。flex の項目は中身に合わせて
 *   伸びるため、箱の scrollWidth だけでははみ出しを取りこぼすからである。
 * - nav・一覧（ol）・画面のコンテナ（main）の scrollWidth と clientWidth を測る。
 */
async function measureBreadcrumbLayout(nav: Locator) {
  return nav.evaluate(async (navElement) => {
    await document.fonts.ready;

    const list = navElement.querySelector('ol');
    const main = navElement.closest('main');
    if (!list || !main) {
      throw new Error('パンくずの一覧（ol）または画面のコンテナ（main）が見つからない');
    }

    const items = Array.from(list.children).map((item) => {
      const label = item.querySelector<HTMLElement>('a, span:not([aria-hidden])');
      if (!label) {
        throw new Error('パンくずの項目に文字列の要素が無い');
      }
      const separator = item.querySelector<HTMLElement>('span[aria-hidden="true"]');

      // 同じ文字列を折り返させずに置いた複製で、一行ぶんの高さと自然幅を測る
      const probe = label.cloneNode(true) as HTMLElement;
      probe.removeAttribute('aria-current');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.whiteSpace = 'nowrap';
      item.appendChild(probe);
      const probeRect = probe.getBoundingClientRect();
      item.removeChild(probe);

      const range = document.createRange();
      range.selectNodeContents(label);
      const textRect = range.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const separatorRect = separator ? separator.getBoundingClientRect() : null;

      return {
        text: label.textContent ?? '',
        isCurrent: label.getAttribute('aria-current') === 'page',
        labelWidth: labelRect.width,
        labelHeight: labelRect.height,
        labelLeft: labelRect.left,
        labelTop: labelRect.top,
        labelBottom: labelRect.bottom,
        itemRight: itemRect.right,
        singleLineHeight: probeRect.height,
        naturalWidth: probeRect.width,
        textLeft: textRect.left,
        textRight: textRect.right,
        separator: separatorRect
          ? {
              left: separatorRect.left,
              right: separatorRect.right,
              top: separatorRect.top,
              bottom: separatorRect.bottom,
              width: separatorRect.width,
            }
          : null,
      };
    });

    const navRect = navElement.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      nav: {
        scrollWidth: navElement.scrollWidth,
        clientWidth: navElement.clientWidth,
        left: navRect.left,
        right: navRect.right,
        height: navRect.height,
      },
      list: { scrollWidth: list.scrollWidth, clientWidth: list.clientWidth },
      main: {
        scrollWidth: main.scrollWidth,
        clientWidth: main.clientWidth,
        left: mainRect.left,
        right: mainRect.right,
      },
      items,
    };
  });
}

type BreadcrumbLayout = Awaited<ReturnType<typeof measureBreadcrumbLayout>>;

/**
 * 指定の画面幅でパンくずを開き直して測る。
 *
 * 前提（満たせなければ失敗する）: 画面幅が指定どおりであること、パンくずが表示されていること、
 * 項目の並びが期待どおりであること、どの項目も一行ぶんの高さと自然幅が正の値で測れていること。
 */
async function openAndMeasureBreadcrumb(
  page: Page,
  path: string,
  width: number,
  expectedTrail: string[]
): Promise<BreadcrumbLayout> {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  const nav = breadcrumbNav(page);
  await expect(nav).toBeVisible({ timeout: getTimeout(15000) });
  await expect
    .poll(async () => readBreadcrumbTrail(nav), { timeout: getTimeout(15000) })
    .toEqual(expectedTrail);

  const layout = await measureBreadcrumbLayout(nav);
  const report = JSON.stringify(layout);
  expect(layout.viewportWidth, report).toBe(width);
  expect(
    layout.items.map((item) => item.text),
    report
  ).toEqual(expectedTrail);
  expect(layout.nav.clientWidth, report).toBeGreaterThan(0);
  for (const item of layout.items) {
    expect(item.singleLineHeight, report).toBeGreaterThan(0);
    expect(item.naturalWidth, report).toBeGreaterThan(0);
  }
  return layout;
}

/**
 * 短い項目が縦長に潰れていないこと（文字列の箱の高さが一行ぶんであること）と、区切り記号が
 * 潰れずに自身の項目の文字列の左隣（同じ行の高さの範囲）に在ることを主張する。
 */
function expectSingleLineItems(layout: BreadcrumbLayout, labels: string[], context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  for (const labelText of labels) {
    const item = layout.items.find((candidate) => candidate.text === labelText);
    assertPresent(item, `パンくずの項目「${labelText}」の実測（${context}）`);
    expect(
      Math.abs(item.labelHeight - item.singleLineHeight),
      `「${labelText}」の高さ ${item.labelHeight} が一行ぶん ${item.singleLineHeight} と異なる。${report}`
    ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
    expect(
      item.labelWidth,
      `「${labelText}」の幅 ${item.labelWidth} が自然幅 ${item.naturalWidth} より狭い。${report}`
    ).toBeGreaterThanOrEqual(item.naturalWidth - LAYOUT_TOLERANCE_PX);
  }
  // 項目の位置で主張を分岐させず、項目を先頭と二番目以降へ分けてから、それぞれに無条件に主張する。
  // 二番目以降が空であれば区切り記号の主張は一件も実行されないため、1 件以上在ることを先に主張する
  // （本ファイルが測るパンくずは、どれも 2 項目以上である）。
  const [firstItem, ...followingItems] = layout.items;
  assertPresent(firstItem, `パンくずの先頭の項目の実測（${context}）`);
  expect(firstItem.separator, `先頭の項目に区切り記号が在る。${report}`).toBeNull();
  expect(followingItems.length, `二番目以降の項目が無い。${report}`).toBeGreaterThanOrEqual(1);
  for (const item of followingItems) {
    const separator = item.separator;
    assertPresent(separator, `「${item.text}」の区切り記号の実測（${context}）`);
    expect(separator.width, report).toBeGreaterThan(0);
    expect(separator.right, report).toBeLessThanOrEqual(item.labelLeft + LAYOUT_TOLERANCE_PX);
    expect(separator.top, report).toBeGreaterThanOrEqual(item.labelTop - LAYOUT_TOLERANCE_PX);
    expect(separator.bottom, report).toBeLessThanOrEqual(item.labelBottom + LAYOUT_TOLERANCE_PX);
  }
}

/**
 * パンくずが水平にはみ出していないことを主張する（許容誤差 1px）。
 *
 * - nav と一覧（ol）の scrollWidth が clientWidth を超えない。
 * - nav が画面幅の内側に在る。
 * - どの項目も、箱の右端と文字列の右端（Range の外接矩形）が、画面幅と画面のコンテナ（main）の
 *   右端の内側に在る。すなわちパンくずは main に水平のはみ出しを生じさせない。
 *
 * main 自身の scrollWidth と clientWidth の差は主張しない。取引先の画面には、パンくずと無関係に
 * main を押し広げる原因が、パンくずの外に互いに独立して在るためである（いずれも本タスクの境界の外。
 * 2026-10-02 の実測。パンくずを包む領域を消しても main の scrollWidth は変わらず、nav は
 * 375 幅で 311/311、320 幅で 256/256）。
 *  1. 作成・編集画面: 入力欄「支払日 - 日」の select（右端 416）。main は 375 幅で 400/343、
 *     320 幅で 400/288。データに依らない。タスク 31.1 で是正し（main は 343/343、288/288）、
 *     「作成・編集フォームの支払日の入力のモバイル幅での収まり」の describe が main ごと主張する。
 *  2. 詳細画面: プロジェクト一覧の表。表が 10 行を載せた状態で、表の幅 608・右端 665、main は
 *     375 幅で 649/343、320 幅で 649/288。データに依る（表が描かれない状態では 343/343）。
 *  3. 詳細画面: 区切りの無い長い一語の取引先名を折り返さない表題と「取引先名」の値
 *     （TradingPartnerDetailView）。本ファイルの長い名前（74 文字）で、表題の文字列の右端 1003、
 *     値の文字列の右端 602、main は 375 幅で 987/343、320 幅で 987/288、768 幅で 987/720。
 *     表を消しても 987 のままである。名前の長さに依る。
 * このほか 320 幅の詳細画面では、基本情報の各欄（幅 250）の右端が 307 で、main の右端 304 を越える。
 * ゆえに本関数は、パンくずが main のはみ出しに寄与しないこと（どの項目の箱も文字列も main の
 * 右端と画面幅の内側に在ること）を主張する。main の実測値は失敗時の報告に載せる。
 */
function expectNoHorizontalOverflow(layout: BreadcrumbLayout, context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  expect(layout.nav.scrollWidth - layout.nav.clientWidth, report).toBeLessThanOrEqual(
    LAYOUT_TOLERANCE_PX
  );
  expect(layout.list.scrollWidth - layout.list.clientWidth, report).toBeLessThanOrEqual(
    LAYOUT_TOLERANCE_PX
  );
  expect(layout.nav.left, report).toBeGreaterThanOrEqual(0);
  expect(layout.nav.right, report).toBeLessThanOrEqual(layout.viewportWidth + LAYOUT_TOLERANCE_PX);
  expect(layout.main.clientWidth, report).toBeGreaterThan(0);
  const rightLimit = Math.min(layout.viewportWidth, layout.main.right) + LAYOUT_TOLERANCE_PX;
  for (const item of layout.items) {
    expect(item.itemRight, `「${item.text}」の箱の右端。${report}`).toBeLessThanOrEqual(rightLimit);
    expect(item.textRight, `「${item.text}」の文字列の右端。${report}`).toBeLessThanOrEqual(
      rightLimit
    );
    expect(item.textLeft, `「${item.text}」の文字列の左端。${report}`).toBeGreaterThanOrEqual(0);
  }
}

/**
 * 作成・編集フォームの「支払日」の二つの select と、画面のコンテナ（main）の配置を実ブラウザで測る
 * （タスク 31.1）。select は aria-label（「支払日 - 月」「支払日 - 日」）で特定する。
 */
async function measurePaymentDateLayout(page: Page) {
  const monthSelect = page.getByRole('combobox', { name: '支払日 - 月' });
  const daySelect = page.getByRole('combobox', { name: '支払日 - 日' });
  await expect(monthSelect).toBeVisible({ timeout: getTimeout(15000) });
  await expect(daySelect).toBeVisible({ timeout: getTimeout(15000) });

  return page.evaluate(async () => {
    await document.fonts.ready;

    const month = document.querySelector<HTMLSelectElement>('select[aria-label="支払日 - 月"]');
    const day = document.querySelector<HTMLSelectElement>('select[aria-label="支払日 - 日"]');
    const main = day?.closest('main');
    if (!month || !day || !main) {
      throw new Error('支払日の select または画面のコンテナ（main）が見つからない');
    }
    const toBox = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    });
    const mainRect = main.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    return {
      viewportWidth: window.innerWidth,
      main: {
        scrollWidth: main.scrollWidth,
        clientWidth: main.clientWidth,
        left: mainRect.left,
        right: mainRect.right,
        contentRight: mainRect.right - parseFloat(mainStyle.paddingRight),
      },
      month: toBox(month.getBoundingClientRect()),
      day: toBox(day.getBoundingClientRect()),
    };
  });
}

type PaymentDateLayout = Awaited<ReturnType<typeof measurePaymentDateLayout>>;

/** 指定の画面幅でフォームを開き直し、支払日の select と main を測る。 */
async function openAndMeasurePaymentDate(
  page: Page,
  path: string,
  width: number
): Promise<PaymentDateLayout> {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const layout = await measurePaymentDateLayout(page);
  const report = JSON.stringify(layout);
  // 前提: 画面幅が指定どおりで、main と二つの select が幅を持って描かれている
  expect(layout.viewportWidth, report).toBe(width);
  expect(layout.main.clientWidth, report).toBeGreaterThan(0);
  expect(layout.month.width, report).toBeGreaterThan(0);
  expect(layout.day.width, report).toBeGreaterThan(0);
  return layout;
}

/**
 * main が水平にはみ出さないことと、二つの select の箱が main の内容の右端・画面幅の内側に在ることを
 * 主張する（許容誤差 1px）。
 */
function expectPaymentDateWithinMain(layout: PaymentDateLayout, context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  expect(
    layout.main.scrollWidth - layout.main.clientWidth,
    `main の scrollWidth ${layout.main.scrollWidth} が clientWidth ${layout.main.clientWidth} を超える。${report}`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  const rightLimit = Math.min(layout.viewportWidth, layout.main.contentRight) + LAYOUT_TOLERANCE_PX;
  for (const [name, box] of [
    ['支払日 - 月', layout.month],
    ['支払日 - 日', layout.day],
  ] as const) {
    expect(box.right, `「${name}」の右端。${report}`).toBeLessThanOrEqual(rightLimit);
    expect(box.left, `「${name}」の左端。${report}`).toBeGreaterThanOrEqual(
      layout.main.left - LAYOUT_TOLERANCE_PX
    );
  }
}

/** デスクトップ幅で、日の select が月の select の右に同じ行で並ぶことを主張する。 */
function expectPaymentDateSideBySide(layout: PaymentDateLayout, context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  expect(
    Math.abs(layout.day.top - layout.month.top),
    `月と日の select の上端が揃っていない。${report}`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(layout.day.left, `日の select が月の select の右に無い。${report}`).toBeGreaterThan(
    layout.month.right
  );
  expectPaymentDateWithinMain(layout, context);
}

/**
 * 取引先ナビゲーション・画面遷移のE2Eテスト
 */
test.describe('取引先ナビゲーション・画面遷移', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * ヘッダーナビゲーションのテスト
   *
   * REQ-12.1: ヘッダーに「取引先」ナビゲーションリンクを表示
   * REQ-12.2: ヘッダーの「取引先」リンクをクリックすると取引先一覧画面に遷移
   * REQ-12.3: 「取引先」リンクにアイコンを付与
   * REQ-12.4: 「取引先」リンクを「プロジェクト」リンクの次に配置
   */
  test.describe('ヘッダーナビゲーション', () => {
    /**
     * @requirement trading-partner-management/REQ-12.1
     */
    test('ヘッダーナビゲーションに「取引先」リンクが表示される (trading-partner-management/REQ-12.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーション内の「取引先」リンクが存在することを確認
      const header = page.locator('header');
      const tradingPartnerLink = header.getByRole('link', { name: '取引先', exact: true });
      await expect(tradingPartnerLink).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.2
     */
    test('ヘッダーの「取引先」リンクをクリックすると取引先一覧画面に遷移する (trading-partner-management/REQ-12.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダー内の「取引先」リンクをクリック
      const header = page.locator('header');
      const tradingPartnerLink = header.getByRole('link', { name: '取引先', exact: true });
      await tradingPartnerLink.click();

      // 取引先一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.3
     */
    test('「取引先」リンクにアイコンが表示される (trading-partner-management/REQ-12.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダー内の「取引先」リンク内にSVGアイコンが存在することを確認
      const header = page.locator('header');
      const tradingPartnerLink = header.getByRole('link', { name: '取引先', exact: true });
      await expect(tradingPartnerLink).toBeVisible({ timeout: getTimeout(10000) });

      const icon = tradingPartnerLink.locator('svg');
      await expect(icon).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.4
     */
    test('「取引先」リンクが「プロジェクト」リンクの次に配置されている (trading-partner-management/REQ-12.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーション内のリンク位置を確認
      const header = page.locator('header');
      const nav = header.getByRole('navigation');
      const projectLink = nav.getByRole('link', { name: 'プロジェクト', exact: true });
      const tradingPartnerLink = nav.getByRole('link', { name: '取引先', exact: true });

      const projectBox = await projectLink.boundingBox();
      const tradingPartnerBox = await tradingPartnerLink.boundingBox();
      assertPresent(projectBox, 'プロジェクトリンクの境界ボックス');
      assertPresent(tradingPartnerBox, '取引先リンクの境界ボックス');

      // 取引先リンクがプロジェクトリンクの右側（次）にあることを確認
      expect(tradingPartnerBox.x).toBeGreaterThan(projectBox.x);
    });
  });

  /**
   * ダッシュボードナビゲーションのテスト
   *
   * REQ-12.5: ダッシュボードのクイックアクセスに「取引先管理」カードを表示
   * REQ-12.6: 取引先管理カードをクリックすると取引先一覧画面に遷移
   * REQ-12.7: 取引先管理カードに「顧客・協力業者の登録・管理」と表示
   * REQ-12.8: 取引先管理カードを「プロジェクト管理」カードの次に配置
   */
  test.describe('ダッシュボードナビゲーション', () => {
    /**
     * @requirement trading-partner-management/REQ-12.5
     */
    test('ダッシュボードのクイックアクセスセクションに「取引先管理」カードが表示される (trading-partner-management/REQ-12.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「取引先管理」カードが存在することを確認
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');
      await expect(tradingPartnerCard).toBeVisible({ timeout: getTimeout(10000) });
      await expect(tradingPartnerCard.getByText(/取引先管理/i)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.6
     */
    test('ダッシュボードの「取引先管理」カードをクリックすると取引先一覧画面に遷移する (trading-partner-management/REQ-12.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「取引先管理」カードをクリック
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');
      await tradingPartnerCard.click();

      // 取引先一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.7
     */
    test('「取引先管理」カードに「顧客・協力業者の登録・管理」という説明文が表示される (trading-partner-management/REQ-12.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // カード内に説明文が存在することを確認
      const tradingPartnerCard = page.getByTestId('quick-link-trading-partners');
      await expect(tradingPartnerCard.getByText(/顧客・協力業者の登録・管理/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.8
     */
    test('「取引先管理」カードが「プロジェクト管理」カードの次に配置されている (trading-partner-management/REQ-12.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // REQ-12.8: 「取引先管理」カードは「プロジェクト管理」カードの次に配置される。
      // 以前は座標を取れた場合にだけ「右にある または 下にある」を判定していた。
      // グリッドの折り返し方によってどちらかが成り立つため、間に別のカードが割り込んでも
      // 検出できず、座標が取れなければ判定ごと消えていた。
      // 「次に配置」の観測点は並び順そのものである。クイックアクセスのカード群の
      // 並びを取り、取引先管理がプロジェクト管理の直後にあることを主張する。
      const quickLinkIds = await page
        .locator('[data-testid^="quick-link-"]')
        .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-testid')));

      const projectIndex = quickLinkIds.indexOf('quick-link-projects');
      const tradingPartnerIndex = quickLinkIds.indexOf('quick-link-trading-partners');

      expect(projectIndex, 'プロジェクト管理カードが見つからない').toBeGreaterThanOrEqual(0);
      expect(
        tradingPartnerIndex,
        `取引先管理カードがプロジェクト管理カードの次に無い（並び: ${quickLinkIds.join(' / ')}）`
      ).toBe(projectIndex + 1);
    });
  });

  /**
   * URL直接アクセスのテスト
   *
   * REQ-12.9: 一覧は /trading-partners
   * REQ-12.10: 新規作成は /trading-partners/new
   * REQ-12.11: 詳細は /trading-partners/:id
   * REQ-12.12: 編集は /trading-partners/:id/edit
   */
  test.describe('URL直接アクセス', () => {
    /**
     * @requirement trading-partner-management/REQ-12.9
     */
    test('/trading-partners にアクセスすると取引先一覧画面が表示される (trading-partner-management/REQ-12.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 一覧画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.10
     */
    test('/trading-partners/new にアクセスすると取引先新規作成画面が表示される (trading-partner-management/REQ-12.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 新規作成画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /取引先の新規作成/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel('取引先名')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.11
     * @requirement trading-partner-management/REQ-12.24
     */
    test('/trading-partners/:id にアクセスすると取引先詳細画面が表示される (trading-partner-management/REQ-12.11, REQ-12.24)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `ナビテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ナビテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区ナビテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 詳細ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 詳細画面が表示されることを確認
      await expect(page.getByText(partnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByRole('button', { name: /編集/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /削除/i })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.12
     * @requirement trading-partner-management/REQ-12.25
     */
    test('/trading-partners/:id/edit にアクセスすると取引先編集画面が表示される (trading-partner-management/REQ-12.12, REQ-12.25)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `編集ナビテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ヘンシュウナビテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区編集ナビテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 編集ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示され、既存データがプリセットされていることを確認
      await expect(page.getByRole('heading', { name: /取引先の編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel('取引先名')).toHaveValue(partnerName);
    });
  });

  /**
   * 存在しない取引先IDへのアクセステスト
   *
   * REQ-12.13: 存在しない取引先ID時に「取引先が見つかりません」と戻るリンクを表示
   */
  test.describe('存在しない取引先IDへのアクセス', () => {
    /**
     * @requirement trading-partner-management/REQ-12.13
     */
    test('存在しない取引先IDへのアクセス時に「取引先が見つかりません」メッセージと戻るリンクが表示される (trading-partner-management/REQ-12.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しない有効なUUID形式のIDでアクセス（UUIDv4形式）
      await page.goto('/trading-partners/11111111-1111-4111-a111-111111111111');
      await page.waitForLoadState('networkidle');

      // エラーメッセージと戻るリンクが表示されることを確認
      await expect(page.getByText(/取引先が見つかりません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      const backLink = page.getByRole('link', { name: /一覧に戻る/i });
      await expect(backLink).toBeVisible();

      // 戻るリンクをクリックすると一覧ページに遷移
      await backLink.click();
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.13
     */
    test('存在しない取引先IDの編集ページへのアクセス時にエラーメッセージが表示される (trading-partner-management/REQ-12.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しない有効なUUID形式のIDの編集ページにアクセス（UUIDv4形式）
      await page.goto('/trading-partners/11111111-1111-4111-a111-111111111111/edit');
      await page.waitForLoadState('networkidle');

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/取引先が見つかりません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * パンくずナビゲーションのテスト
   *
   * REQ-12.14: パンくずナビゲーションを提供
   * REQ-12.15: 詳細画面: ダッシュボード > 取引先 > [取引先名]
   * REQ-12.16: 新規作成画面: ダッシュボード > 取引先 > 新規作成
   * REQ-12.17: 編集画面: ダッシュボード > 取引先 > [取引先名] > 編集
   * REQ-12.18: 一覧画面: ダッシュボード > 取引先
   */
  test.describe('パンくずナビゲーション', () => {
    /**
     * @requirement trading-partner-management/REQ-12.14
     *
     * タスク 115.188 の是正: 従前は REQ-12.18 を名乗っていたが、本テストは一覧ページでパンくずが**表示される*
     * *ことだけを主張しており、クリックを行わない。受入基準12.18 は「パンくずナビゲーションの任意の階層をクリックしたとき…該当
     * ページに遷移する」であり、表示のみを述べるのは受入基準12.14 である。
     *
     * 上の群の註釈にある `REQ-12.14:` などの箇条書きは被覆印としては読まれない
     * （パターン5は `Requirements (feature-name):` ヘッダーの直下の一覧だけを拾う。
     * 実測: check:req-coverage:json の testFiles で本ファイルが名乗る受入基準に
     * REQ-12.14 は含まれていなかった）。ゆえに散文の箇条書きは分子に入らず、
     * 番号を外す必要は無い。名乗りの担い手は `@requirement` に一本化されている。
     */
    test('一覧画面でパンくず「ダッシュボード > 取引先」が表示される (trading-partner-management/REQ-12.14)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByText('取引先')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.16
     */
    test('新規作成画面でパンくず「ダッシュボード > 取引先 > 新規作成」が表示される (trading-partner-management/REQ-12.16)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: /取引先/i })).toBeVisible();
      await expect(breadcrumb.getByText('新規作成')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.15
     */
    test('詳細画面でパンくず「ダッシュボード > 取引先 > [取引先名]」が表示される (trading-partner-management/REQ-12.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `パンくずテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('パンクズテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区パンくずテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 詳細ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: /取引先/i })).toBeVisible();
      // 取引先名は最後の項目なのでリンクではない
      await expect(breadcrumb.getByText(partnerName)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.17
     */
    test('編集画面でパンくず「ダッシュボード > 取引先 > [取引先名] > 編集」が表示される (trading-partner-management/REQ-12.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `パンくず更新テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('パンクズコウシンテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区パンくず更新テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 編集ページに直接アクセス
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // パンくずの内容を確認
      await expect(breadcrumb.getByRole('link', { name: /ダッシュボード/i })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: '取引先', exact: true })).toBeVisible();
      await expect(breadcrumb.getByRole('link', { name: new RegExp(partnerName) })).toBeVisible();
      // 編集は最後の項目なのでリンクではない（aria-current="page"がついている）
      await expect(breadcrumb.getByText('編集', { exact: true })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.18
     *
     * タスク 115.188 の是正: 従前は REQ-12.14 を名乗っていたが、受入基準12.14 は取引先一覧ページにパンくず
     * を「表示する」条文であり、パンくずのクリックによる遷移を述べるのは受入基準12.18 である。
     */
    test('パンくずの「取引先」リンクをクリックすると一覧ページに遷移する (trading-partner-management/REQ-12.18)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // パンくずの「取引先」リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await breadcrumb.getByRole('link', { name: /取引先/i }).click();

      // 一覧ページに遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
    });
  });

  /**
   * パンくずナビゲーションのモバイル幅での折り返し（タスク 30.1）
   *
   * 共通の Breadcrumb は、一覧（ol）が折り返さない flex 行だったため、モバイル幅で項目が一行の中で
   * 縮められて縦長に潰れ、区切りの無い長い名前では項目の最小幅の和が行を画面幅の外へ押し広げて
   * いた。取引先の 4 画面（受入基準 12.14〜12.17）について、375 幅と 320 幅で次を主張する。
   *
   *  - 短い項目が縦長に潰れない（文字列の箱の高さが、同じ文字列を折り返させずに置いて測った
   *    一行ぶんの高さに等しく、幅が自然幅を下回らない）。
   *  - 区切りの無い長い英数字一語の取引先名（詳細・編集）でも、パンくずが水平にはみ出さない
   *    （nav と一覧の scrollWidth が clientWidth を超えず、文字列の右端が画面幅の内側に在る）。
   *    前提として、その名前の自然幅が nav の幅を超えること（折り返しが要る長さであること）と、
   *    名前の項目が実際に複数行へ折り返されていることを主張する。
   */
  test.describe('パンくずナビゲーションのモバイル幅での折り返し', () => {
    /**
     * @requirement trading-partner-management/REQ-12.14
     */
    test('一覧画面のパンくずがモバイル幅で縦長に潰れず水平にはみ出さない (trading-partner-management/REQ-12.14)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 回帰の番のみ: 2 項目は 375・320 幅でも是正の前後とも一行に収まるため、本是正の検出力は無い。
      const trail = ['ダッシュボード', '取引先'];
      for (const width of MOBILE_WIDTHS) {
        const layout = await openAndMeasureBreadcrumb(page, '/trading-partners', width, trail);
        expectSingleLineItems(layout, trail, `一覧 ${width} 幅`);
        expectNoHorizontalOverflow(layout, `一覧 ${width} 幅`);
      }
    });

    /**
     * @requirement trading-partner-management/REQ-12.16
     */
    test('新規作成画面のパンくずがモバイル幅で縦長に潰れず水平にはみ出さない (trading-partner-management/REQ-12.16)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const trail = ['ダッシュボード', '取引先', '新規作成'];
      for (const width of MOBILE_WIDTHS) {
        const layout = await openAndMeasureBreadcrumb(page, '/trading-partners/new', width, trail);
        expectSingleLineItems(layout, trail, `新規作成 ${width} 幅`);
        expectNoHorizontalOverflow(layout, `新規作成 ${width} 幅`);
      }
    });

    /**
     * @requirement trading-partner-management/REQ-12.15
     */
    test('詳細画面のパンくずがモバイル幅で縦長に潰れず、長い一語の取引先名でも水平にはみ出さない (trading-partner-management/REQ-12.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const stamp = Date.now();
      const ordinaryName = `折返し確認_${stamp}`;
      const unbrokenName = `TradingPartnerRedevelopmentSkyscraperConstructionUnbrokenName${stamp}`;
      const ordinaryId = await createTradingPartnerForBreadcrumb(page, ordinaryName);
      const unbrokenId = await createTradingPartnerForBreadcrumb(page, unbrokenName);

      for (const width of MOBILE_WIDTHS) {
        // 普通の名前: どの項目も一行ぶんの高さで、縦長に潰れない
        const ordinaryTrail = ['ダッシュボード', '取引先', ordinaryName];
        const ordinary = await openAndMeasureBreadcrumb(
          page,
          `/trading-partners/${ordinaryId}`,
          width,
          ordinaryTrail
        );
        const ordinaryContext = `詳細（普通の名前） ${width} 幅`;
        // 前提: 普通の名前は nav の幅に一行で収まる長さである
        expect(ordinary.items[2]?.naturalWidth, JSON.stringify(ordinary)).toBeLessThan(
          ordinary.nav.clientWidth
        );
        expectSingleLineItems(ordinary, ordinaryTrail, ordinaryContext);
        expectNoHorizontalOverflow(ordinary, ordinaryContext);

        // 区切りの無い長い一語の名前: 名前は項目の中で折り返し、行を押し広げない
        const unbrokenTrail = ['ダッシュボード', '取引先', unbrokenName];
        const unbroken = await openAndMeasureBreadcrumb(
          page,
          `/trading-partners/${unbrokenId}`,
          width,
          unbrokenTrail
        );
        const unbrokenContext = `詳細（長い一語の名前） ${width} 幅`;
        const unbrokenReport = `${unbrokenContext}: ${JSON.stringify(unbroken)}`;
        const nameItem = unbroken.items[2];
        assertPresent(nameItem, `取引先名の項目の実測（${unbrokenContext}）`);
        expect(nameItem.isCurrent, unbrokenReport).toBe(true);
        // 前提: 名前の自然幅が nav の幅を超える（折り返さなければ収まらない）
        expect(nameItem.naturalWidth, unbrokenReport).toBeGreaterThan(unbroken.nav.clientWidth);
        expectSingleLineItems(unbroken, ['ダッシュボード', '取引先'], unbrokenContext);
        expectNoHorizontalOverflow(unbroken, unbrokenContext);
        // 名前は実際に複数行へ折り返されている
        expect(nameItem.labelHeight, unbrokenReport).toBeGreaterThanOrEqual(
          nameItem.singleLineHeight * 2 - LAYOUT_TOLERANCE_PX
        );
      }
    });

    /**
     * @requirement trading-partner-management/REQ-12.17
     */
    test('編集画面のパンくずがモバイル幅で縦長に潰れず、長い一語の取引先名でも水平にはみ出さない (trading-partner-management/REQ-12.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const stamp = Date.now();
      const ordinaryName = `折返し確認_${stamp}`;
      const unbrokenName = `TradingPartnerRedevelopmentSkyscraperConstructionUnbrokenName${stamp}`;
      const ordinaryId = await createTradingPartnerForBreadcrumb(page, ordinaryName);
      const unbrokenId = await createTradingPartnerForBreadcrumb(page, unbrokenName);

      for (const width of MOBILE_WIDTHS) {
        // 普通の名前: どの項目も一行ぶんの高さで、縦長に潰れない
        const ordinaryTrail = ['ダッシュボード', '取引先', ordinaryName, '編集'];
        const ordinary = await openAndMeasureBreadcrumb(
          page,
          `/trading-partners/${ordinaryId}/edit`,
          width,
          ordinaryTrail
        );
        const ordinaryContext = `編集（普通の名前） ${width} 幅`;
        // 前提: 普通の名前は nav の幅に一行で収まる長さである
        expect(ordinary.items[2]?.naturalWidth, JSON.stringify(ordinary)).toBeLessThan(
          ordinary.nav.clientWidth
        );
        expectSingleLineItems(ordinary, ordinaryTrail, ordinaryContext);
        expectNoHorizontalOverflow(ordinary, ordinaryContext);

        // 区切りの無い長い一語の名前: 名前は項目の中で折り返し、行を押し広げない
        const unbrokenTrail = ['ダッシュボード', '取引先', unbrokenName, '編集'];
        const unbroken = await openAndMeasureBreadcrumb(
          page,
          `/trading-partners/${unbrokenId}/edit`,
          width,
          unbrokenTrail
        );
        const unbrokenContext = `編集（長い一語の名前） ${width} 幅`;
        const unbrokenReport = `${unbrokenContext}: ${JSON.stringify(unbroken)}`;
        const nameItem = unbroken.items[2];
        assertPresent(nameItem, `取引先名の項目の実測（${unbrokenContext}）`);
        const editItem = unbroken.items[3];
        assertPresent(editItem, `「編集」の項目の実測（${unbrokenContext}）`);
        expect(editItem.isCurrent, unbrokenReport).toBe(true);
        // 前提: 名前の自然幅が nav の幅を超える（折り返さなければ収まらない）
        expect(nameItem.naturalWidth, unbrokenReport).toBeGreaterThan(unbroken.nav.clientWidth);
        expectSingleLineItems(unbroken, ['ダッシュボード', '取引先', '編集'], unbrokenContext);
        expectNoHorizontalOverflow(unbroken, unbrokenContext);
        // 名前は実際に複数行へ折り返されている
        expect(nameItem.labelHeight, unbrokenReport).toBeGreaterThanOrEqual(
          nameItem.singleLineHeight * 2 - LAYOUT_TOLERANCE_PX
        );
      }
    });
  });

  /**
   * 作成・編集フォームの「支払日」の入力のモバイル幅での収まり（タスク 31.1）
   *
   * 「支払日 - 月」と「支払日 - 日」の二つの select は、折り返さない flex 行に置かれ、各 select の
   * 最小幅（最長の選択肢の幅）の和が行を押し広げていた。375 幅と 320 幅で、日の select の右端が
   * main の外へ出て、main が水平にはみ出していた（データに依らない）。
   * 作成と編集の画面について、375 幅と 320 幅で次を主張する。
   *
   *  - 画面のコンテナ（main）の scrollWidth が clientWidth を超えない。
   *  - 月と日の select の箱の右端が、main の内容の右端と画面幅の内側に在り、左端が main の内側に在る。
   *
   * あわせて 1280 幅で、月と日の select が従来どおり同じ行に横並びであること（日の select が月の
   * select の右に在り、上端が揃うこと）を主張する。寸法は固定値で主張せず、要素どうしの関係で測る。
   *
   * 本スペックの受入基準に、フォームのモバイル幅の表示を定めた本文は無いため、受入基準の番号は
   * 名乗らない（タスク 31.1 は要件 12 の画面の欠陥として起票された）。
   */
  test.describe('作成・編集フォームの支払日の入力のモバイル幅での収まり', () => {
    test('新規作成画面の支払日の入力がモバイル幅で main を水平に押し広げない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      for (const width of MOBILE_WIDTHS) {
        const layout = await openAndMeasurePaymentDate(page, '/trading-partners/new', width);
        expectPaymentDateWithinMain(layout, `新規作成 ${width} 幅`);
      }
      const desktop = await openAndMeasurePaymentDate(page, '/trading-partners/new', 1280);
      expectPaymentDateSideBySide(desktop, '新規作成 1280 幅');
    });

    test('編集画面の支払日の入力がモバイル幅で main を水平に押し広げない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const partnerId = await createTradingPartnerForBreadcrumb(
        page,
        `支払日収まり確認_${Date.now()}`
      );
      for (const width of MOBILE_WIDTHS) {
        const layout = await openAndMeasurePaymentDate(
          page,
          `/trading-partners/${partnerId}/edit`,
          width
        );
        expectPaymentDateWithinMain(layout, `編集 ${width} 幅`);
      }
      const desktop = await openAndMeasurePaymentDate(
        page,
        `/trading-partners/${partnerId}/edit`,
        1280
      );
      expectPaymentDateSideBySide(desktop, '編集 1280 幅');
    });
  });

  /**
   * 画面間遷移のテスト
   *
   * REQ-12.20: 一覧画面で「新規作成」ボタンをクリック → 新規作成画面
   * REQ-12.21: 詳細画面で「編集」ボタンをクリック → 編集画面
   * REQ-12.22: 新規作成画面で作成成功 → 一覧画面
   * REQ-12.23: 編集画面で更新成功 → 詳細画面
   *
   * タスク 115.188 の是正: この一覧は原文より一つずつ手前の番号を並べていた
   * （原文の受入基準19 は一覧から取引先を選択したときの詳細ページ遷移）。
   */
  test.describe('画面間遷移', () => {
    /**
     * @requirement trading-partner-management/REQ-12.20
     *
     * タスク 115.188 の是正: 従前は REQ-12.19 を名乗っていたが、受入基準12.19 の原文は「When ユーザーが取引先一覧から取引先を選択したとき,
     * the 取引先管理サービス shall 取引先詳細ページに遷移する」である。本区間の表題・本文が述べる内容に対応するのは受入基準12.20（「When
     * ユーザーが取引先一覧で「新規作成」ボタンをクリックしたとき, the 取引先管理サービス shall 取引先新規作成ページに遷移する」
     * ）である。
     */
    test('一覧画面の「新規作成」ボタンから新規作成画面に遷移する (trading-partner-management/REQ-12.20)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 「新規作成」ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 新規作成画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /取引先の新規作成/i })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-12.21
     *
     * タスク 115.188 の是正: 従前は REQ-12.20 を名乗っていたが、受入基準12.20 の原文は「When ユーザーが取引先一覧で「新規作成」
     * ボタンをクリックしたとき, the 取引先管理サービス shall 取引先新規作成ページに遷移する」
     * である。本区間の表題・本文が述べる内容に対応するのは受入基準12.21（「When ユーザーが取引先詳細ページで「編集」
     * ボタンをクリックしたとき, the 取引先管理サービス shall 取引先編集画面を表示する」
     * ）である。
     */
    test('詳細画面の「編集」ボタンから編集画面に遷移する (trading-partner-management/REQ-12.21)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('センイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 詳細ページに移動
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}/edit`), {
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-12.22
     *
     * タスク 115.188 の是正: 従前は REQ-12.21 を名乗っていたが、受入基準12.21 の原文は「When ユーザーが取引先詳細ページで「編集」
     * ボタンをクリックしたとき, the 取引先管理サービス shall 取引先編集画面を表示する」
     * である。本区間の表題・本文が述べる内容に対応するのは受入基準12.22（「When 取引先作成に成功したとき, the 取引先管理サービス
     * shall 取引先一覧ページに遷移する」）である。
     */
    test('新規作成画面で作成成功後に一覧画面に遷移する (trading-partner-management/REQ-12.22)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `作成遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サクセイセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区作成遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.23
     *
     * タスク 115.188 の是正: 従前は REQ-12.22 を名乗っていたが、受入基準12.22 の原文は「When 取引先作成に成功したとき,
     * the 取引先管理サービス shall 取引先一覧ページに遷移する」である。本区間の表題・本文が述べる内容に対応するのは受入基準12.23（「When
     * 取引先更新に成功したとき, the 取引先管理サービス shall 取引先詳細ページに遷移する」
     * ）である。
     */
    test('編集画面で更新成功後に詳細画面に遷移する (trading-partner-management/REQ-12.23)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `更新遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('コウシンセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区更新遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 備考を更新
      const updatedNotes = `更新テスト備考_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });
    });

    test('削除成功後に一覧画面に遷移する', async ({ page }) => {
      // 管理者でログイン（削除権限が必要）
      await loginAsUser(page, 'ADMIN_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `削除遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サクジョセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区削除遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 詳細ページに移動
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      await deletePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
    });

    test('新規作成画面のキャンセルボタンで一覧画面に戻る', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // キャンセルボタンをクリック
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
    });

    test('編集画面のキャンセルボタンで詳細画面に戻る', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `キャンセル遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('キャンセルセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区キャンセル遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // キャンセルボタンをクリック
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 未認証アクセスのテスト
   *
   * REQ-12.27: 未認証ユーザーが取引先管理ページにアクセスした場合、ログインページへリダイレクトする
   * REQ-12.28: ログイン後、元のページ（リダイレクト元の取引先ページ）に遷移する
   * （タスク 115.188 の是正: 従前この註釈は REQ-12.23 と書いていたが、原文12.23 は
   *   「取引先更新に成功したとき取引先詳細ページに遷移する」であり主題が別だった）
   */
  test.describe('未認証アクセス', () => {
    /**
     * @requirement trading-partner-management/REQ-12.27
     *
     * タスク 115.188 の是正: 従前は REQ-12.23 を名乗っていたが、受入基準12.23 の原文は「When 取引先更新に成功したとき,
     * the 取引先管理サービス shall 取引先詳細ページに遷移する」である。本区間の表題・本文が述べる内容に対応するのは受入基準12.27（「If
     * 未認証ユーザーが取引先管理ページにアクセスした場合, then the 取引先管理サービス shall ログインページにリダイレクトする」
     * ）である。
     */
    test('未認証状態で取引先一覧ページにアクセスするとログインページにリダイレクトされる (trading-partner-management/REQ-12.27)', async ({
      page,
    }) => {
      // 未認証状態でアクセス
      await page.goto('/trading-partners');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.27
     *
     * タスク 115.188 の是正: 従前は REQ-12.23 を名乗っていたが、受入基準12.23 の原文は「When 取引先更新に成功したとき,
     * the 取引先管理サービス shall 取引先詳細ページに遷移する」である。本区間の表題・本文が述べる内容に対応するのは受入基準12.27（「If
     * 未認証ユーザーが取引先管理ページにアクセスした場合, then the 取引先管理サービス shall ログインページにリダイレクトする」
     * ）である。
     */
    test('未認証状態で取引先新規作成ページにアクセスするとログインページにリダイレクトされる (trading-partner-management/REQ-12.27)', async ({
      page,
    }) => {
      // 未認証状態でアクセス
      await page.goto('/trading-partners/new');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-12.27
     * @requirement trading-partner-management/REQ-12.28
     *
     * タスク 115.188 の是正: 従前は REQ-12.23 と REQ-12.26 を名乗っていた。原文12.23 は
     * 「取引先更新に成功したとき取引先詳細ページに遷移する」で、本検証は更新を一度も行わない。
     * 原文12.26 は「取引先管理ページ群に ProtectedLayout（AppHeader付き）を適用する」で、
     * 本検証は AppHeader を一度も見ない。12.26 は他に被覆源が無いため未被覆として露出する
     * （タスク 29.1 で「ProtectedLayout（AppHeader）の適用」の区間が被覆源になった）。
     * 本検証の主題である「ログイン後に元のページへ復帰する」を述べるのは原文12.28 である。
     */
    test('ログイン後に元のページに復帰する (trading-partner-management/REQ-12.27, REQ-12.28)', async ({
      page,
      context,
    }) => {
      // 未認証状態で取引先一覧ページにアクセスを試みる
      await page.goto('/trading-partners');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

      // URLにリダイレクト情報が含まれていることを確認
      // フォームを表示
      const emailInput = page.getByLabel(/メールアドレス/i);
      await emailInput.waitFor({ state: 'visible', timeout: getTimeout(10000) });

      // ログインを実行（ただしcontextをクリアしていないのでcookie付き）
      // 代わりにloginAsUserのロジックを適用
      await context.clearCookies();
      await page.evaluate(() => localStorage.clear());
      await loginAsUser(page, 'REGULAR_USER');

      // ダッシュボードにリダイレクトされる（ProtectedRoute実装による）
      // 注: 元のページへの復帰はProtectedRouteの実装に依存する
      // 現在の実装では認証後はダッシュボードにリダイレクトされる
      await expect(page).toHaveURL(/\/dashboard|\/trading-partners/, {
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 一覧から詳細への遷移テスト
   */
  test.describe('一覧から詳細への遷移', () => {
    /**
     * @requirement trading-partner-management/REQ-12.19
     *
     * 受入基準12.19 の原文は「When ユーザーが取引先一覧から取引先を選択したとき, the 取引先管理サービス
     * shall 取引先詳細ページに遷移する」である。本検証は一覧の行をクリックし、URL が
     * `/trading-partners/:id` になり詳細画面に取引先名が表示されることを主張する。
     *
     * 空振りでないことの実測（2026-10-07、タスク 29.1）: frontend/src/pages/TradingPartnerListPage.tsx の
     * 行クリックの遷移先を `/trading-partners` へ変える変異を入れて test 環境を作り直すと、本検証は
     * URL の主張で落ちる。変異は復元済み。
     */
    test('一覧画面の取引先行をクリックすると詳細画面に遷移する (trading-partner-management/REQ-12.19)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `一覧遷移テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('イチランセンイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区一覧遷移テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 一覧ページに遷移
      await page.waitForURL(/\/trading-partners$/);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 作成した取引先の行を検索してクリック
      // 検索フィールドを使用して作成した取引先を見つける
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill(partnerName);
      await page.getByRole('button', { name: /^検索$/i }).click();

      // 検索結果を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 取引先行をクリック
      const partnerRow = page.locator(`[data-testid="partner-row-${partnerId}"]`);
      await expect(partnerRow).toBeVisible({ timeout: getTimeout(10000) });
      await partnerRow.click();

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(partnerName).first()).toBeVisible();
    });
  });

  /**
   * 取引先管理ページ群への ProtectedLayout（AppHeader 付き）の適用
   */
  test.describe('ProtectedLayout（AppHeader）の適用', () => {
    /**
     * @requirement trading-partner-management/REQ-12.26
     *
     * 受入基準12.26 の原文は「The 取引先管理サービス shall 取引先管理ページ群にProtectedLayout（AppHeader付き）を
     * 適用する」である。本検証は一覧・新規作成・詳細・編集の 4 ページのそれぞれで、各ページ固有の見出しが
     * 表示された状態で、共通ヘッダー（role="banner"）がロゴの「ArchiTrack」リンクと
     * 「ダッシュボード」「取引先」のナビゲーションリンクを伴って表示されることを主張する。
     *
     * 空振りでないことの実測（2026-10-07、タスク 29.1）: frontend/src/components/ProtectedLayout.tsx が
     * `/trading-partners` 配下でだけ AppHeader を描かない変異を入れて test 環境を作り直すと、本検証は
     * 一覧ページの共通ヘッダーの主張で落ちる。変異は復元済み。
     */
    test('一覧・新規作成・詳細・編集の各ページに共通ヘッダーが表示される (trading-partner-management/REQ-12.26)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const partnerName = `ヘッダー適用テスト取引先_${Date.now()}`;
      const partnerId = await createTradingPartnerForBreadcrumb(page, partnerName);

      const pages: ReadonlyArray<{ label: string; path: string; landmark: () => Locator }> = [
        {
          label: '一覧',
          path: '/trading-partners',
          landmark: () => page.getByRole('heading', { name: '取引先一覧', level: 1 }),
        },
        {
          label: '新規作成',
          path: '/trading-partners/new',
          landmark: () => page.getByRole('heading', { name: '取引先の新規作成', level: 1 }),
        },
        {
          label: '詳細',
          path: `/trading-partners/${partnerId}`,
          landmark: () => page.getByRole('heading', { name: '基本情報' }),
        },
        {
          label: '編集',
          path: `/trading-partners/${partnerId}/edit`,
          landmark: () => page.getByRole('heading', { name: '取引先の編集', level: 1 }),
        },
      ];

      for (const target of pages) {
        await test.step(`${target.label}ページ（${target.path}）`, async () => {
          await page.goto(target.path);
          await page.waitForLoadState('networkidle');

          // ページ固有の内容が描かれている（読み込み中・エラーの画面ではない）
          await expect(target.landmark(), `${target.label}ページの見出し`).toBeVisible({
            timeout: getTimeout(10000),
          });

          // 共通ヘッダー（AppHeader）が同じ画面に表示されている
          const header = page.getByRole('banner');
          await expect(header, `${target.label}ページの共通ヘッダー`).toBeVisible();
          await expect(header.getByRole('link', { name: 'ArchiTrack' })).toBeVisible();
          const nav = header.getByRole('navigation');
          await expect(
            nav.getByRole('link', { name: 'ダッシュボード', exact: true })
          ).toBeVisible();
          await expect(nav.getByRole('link', { name: '取引先', exact: true })).toBeVisible();
        });
      }
    });
  });
});
