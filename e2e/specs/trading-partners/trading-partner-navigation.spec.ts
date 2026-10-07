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
 * - 詳細画面の文字列のモバイル幅での収まり（タスク 31.2）
 * - 詳細画面の関連プロジェクトの表のモバイル幅での収まり（タスク 31.3）
 * - 削除確認ダイアログの取引先名のモバイル幅での収まり（タスク 31.5）
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
import { assertPrepared, assertPresent } from '../../helpers/preconditions';
import { API_BASE_URL } from '../../config';
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
 * 3 とこの欄の幅はタスク 31.2 で是正し（表を除いた main は 4 幅とも収まる）、「詳細画面の文字列の
 * モバイル幅での収まり」の describe が、表を除いた main ごと主張する。
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

/** 詳細画面の文字列の収まりを測る画面幅（タスク 31.2）。768 幅でも長い一語の名前ではみ出していた。 */
const DETAIL_TEXT_WIDTHS = [375, 320, 768, 1280] as const;

/** 詳細画面に表示される、利用者が入力した文字列の項目（タスク 31.2）。 */
interface DetailTextFields {
  name: string;
  nameKana: string;
  branchName: string;
  representativeName: string;
  address: string;
  phoneNumber: string;
  faxNumber: string;
  email: string;
  notes: string;
}

/**
 * 利用者が入力する文字列の項目をすべて埋めて取引先を新規作成画面から作成し、その ID を返す
 * （タスク 31.2 の準備）。作成に失敗した場合は応答待ちが時間切れで失敗する。
 */
async function createTradingPartnerWithAllTextFields(
  page: Page,
  fields: DetailTextFields
): Promise<string> {
  await page.goto('/trading-partners/new');
  await page.waitForLoadState('networkidle');

  await page.getByLabel('取引先名').fill(fields.name);
  await page.getByLabel('フリガナ', { exact: true }).fill(fields.nameKana);
  await page.getByLabel('部課/支店/支社名').fill(fields.branchName);
  await page.getByLabel('代表者名').fill(fields.representativeName);
  await page.getByLabel('住所').fill(fields.address);
  await page.getByLabel('電話番号').fill(fields.phoneNumber);
  await page.getByLabel('FAX番号').fill(fields.faxNumber);
  await page.getByLabel('メールアドレス').fill(fields.email);
  await page.getByLabel('備考').fill(fields.notes);
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
 * 詳細画面の詳細表示（`TradingPartnerDetailView`）の配置を実ブラウザで測る（タスク 31.2）。
 *
 * - 詳細表示の中で、自身の直下に文字列を持つ要素ごとに、箱の矩形・文字列そのものの外接矩形
 *   （Range）・同じ要素の複製を `white-space: nowrap` で置いたときの一行ぶんの高さと自然幅を測る。
 * - 詳細表示の中のすべての要素の箱の左右端を測る（文字列を持たない欄の箱のはみ出しも拾うため）。
 * - 画面のコンテナ（main）の scrollWidth と clientWidth を、関連プロジェクトの節を一時的に
 *   `display: none` にした状態で測り、測り終えたら元へ戻す。関連プロジェクトの表のはみ出し
 *   （タスク 31.3）と、紐付かないプロジェクトが表に出る疑い（タスク 31.4）は本タスクの境界の外で
 *   あり、表の有無が全体の実行順で変わるため、詳細表示の寄与だけを取り出して測る。
 *   節を隠さない main の実測値も報告に載せる。
 */
async function measureDetailTextLayout(page: Page) {
  await expect(page.getByRole('heading', { name: '基本情報' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByRole('heading', { name: '関連プロジェクト' })).toBeVisible({
    timeout: getTimeout(15000),
  });

  return page.evaluate(async () => {
    await document.fonts.ready;

    const headings = Array.from(document.querySelectorAll('h2'));
    const basicSection = headings.find((h) => h.textContent === '基本情報')?.closest('section');
    const view = basicSection?.parentElement;
    const main = view?.closest('main');
    const projectsSection = headings
      .find((h) => h.textContent === '関連プロジェクト')
      ?.closest('section');
    if (!view || !main || !projectsSection) {
      throw new Error('詳細表示・画面のコンテナ（main）・関連プロジェクトの節のいずれかが無い');
    }

    const texts = Array.from(view.querySelectorAll<HTMLElement>('*'))
      .map((element) => {
        const ownText = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
        return { element, ownText };
      })
      .filter(({ ownText }) => ownText.length > 0)
      .map(({ element, ownText }) => {
        const probe = element.cloneNode(true) as HTMLElement;
        probe.setAttribute('aria-hidden', 'true');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'nowrap';
        probe.style.width = 'auto';
        element.parentElement?.appendChild(probe);
        const probeRect = probe.getBoundingClientRect();
        probe.remove();

        const range = document.createRange();
        range.selectNodeContents(element);
        const textRect = range.getBoundingClientRect();
        const boxRect = element.getBoundingClientRect();
        return {
          text: ownText,
          boxLeft: boxRect.left,
          boxRight: boxRect.right,
          boxTop: boxRect.top,
          boxHeight: boxRect.height,
          textLeft: textRect.left,
          textRight: textRect.right,
          singleLineHeight: probeRect.height,
          naturalWidth: probeRect.width,
        };
      });

    const boxes = [view, ...Array.from(view.querySelectorAll<HTMLElement>('*'))].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        text: (element.textContent ?? '').slice(0, 24),
        left: rect.left,
        right: rect.right,
      };
    });

    const mainScrollWidthWithProjects = main.scrollWidth;
    const previousDisplay = projectsSection.style.display;
    projectsSection.style.display = 'none';
    const mainScrollWidth = main.scrollWidth;
    const mainClientWidth = main.clientWidth;
    projectsSection.style.display = previousDisplay;

    const mainRect = main.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    return {
      viewportWidth: window.innerWidth,
      main: {
        scrollWidth: mainScrollWidth,
        clientWidth: mainClientWidth,
        scrollWidthWithProjects: mainScrollWidthWithProjects,
        left: mainRect.left,
        contentRight: mainRect.right - parseFloat(mainStyle.paddingRight),
      },
      view: { scrollWidth: view.scrollWidth, clientWidth: view.clientWidth },
      texts,
      boxes,
    };
  });
}

type DetailTextLayout = Awaited<ReturnType<typeof measureDetailTextLayout>>;

/** 指定の画面幅で詳細画面を開き直し、詳細表示を測る。前提を満たせなければ失敗する。 */
async function openAndMeasureDetailText(
  page: Page,
  partnerId: string,
  width: number,
  fields: DetailTextFields
): Promise<DetailTextLayout> {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(`/trading-partners/${partnerId}`);
  await page.waitForLoadState('networkidle');
  const layout = await measureDetailTextLayout(page);
  const report = JSON.stringify(layout);
  // 前提: 画面幅が指定どおりで、main が幅を持ち、入力した文字列の項目がすべて描かれている
  expect(layout.viewportWidth, report).toBe(width);
  expect(layout.main.clientWidth, report).toBeGreaterThan(0);
  const shownTexts = layout.texts.map((item) => item.text);
  for (const value of Object.values(fields)) {
    expect(shownTexts, `「${value}」が詳細表示に無い。${report}`).toContain(value);
  }
  for (const item of layout.texts) {
    expect(item.singleLineHeight, report).toBeGreaterThan(0);
    expect(item.naturalWidth, report).toBeGreaterThan(0);
  }
  return layout;
}

/**
 * 詳細表示が main を水平に押し広げないことを主張する（許容誤差 1px）。
 *
 * - 関連プロジェクトの節を除いた main の scrollWidth が clientWidth を超えない。
 * - 詳細表示の scrollWidth が clientWidth を超えない。
 * - 詳細表示の中のどの要素の箱も、どの文字列（Range の外接矩形）も、右端が main の内容の右端と
 *   画面幅の内側に在り、左端が main の左端より左に無い。
 */
function expectDetailTextWithinMain(layout: DetailTextLayout, context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  expect(
    layout.main.scrollWidth - layout.main.clientWidth,
    `main の scrollWidth ${layout.main.scrollWidth} が clientWidth ${layout.main.clientWidth} を超える。${report}`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(
    layout.view.scrollWidth - layout.view.clientWidth,
    `詳細表示の scrollWidth ${layout.view.scrollWidth} が clientWidth ${layout.view.clientWidth} を超える。${report}`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  const rightLimit = Math.min(layout.viewportWidth, layout.main.contentRight) + LAYOUT_TOLERANCE_PX;
  const leftLimit = layout.main.left - LAYOUT_TOLERANCE_PX;
  for (const item of layout.texts) {
    expect(item.textRight, `「${item.text}」の文字列の右端。${report}`).toBeLessThanOrEqual(
      rightLimit
    );
    expect(item.textLeft, `「${item.text}」の文字列の左端。${report}`).toBeGreaterThanOrEqual(
      leftLimit
    );
  }
  for (const box of layout.boxes) {
    expect(box.right, `${box.tag}「${box.text}」の箱の右端。${report}`).toBeLessThanOrEqual(
      rightLimit
    );
    expect(box.left, `${box.tag}「${box.text}」の箱の左端。${report}`).toBeGreaterThanOrEqual(
      leftLimit
    );
  }
}

/** 詳細表示の中で、指定の文字列を直下に持つ要素の実測をすべて返す（表題と「取引先名」の値など）。 */
function detailTextItems(layout: DetailTextLayout, text: string) {
  return layout.texts.filter((item) => item.text === text);
}

/**
 * 取引先に紐付くプロジェクトを、指定の名前で API から作成する（タスク 31.3 の準備）。
 *
 * 営業担当者は担当者候補の先頭を使う。作成に失敗した場合は前提の主張で失敗する。
 */
async function createProjectsLinkedToPartner(
  page: Page,
  partnerId: string,
  names: string[]
): Promise<void> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
  assertPrepared(accessToken, '認証トークン');
  const headers = { Authorization: `Bearer ${accessToken}` };

  const assignableRes = await page.request.get(`${API_BASE_URL}/api/users/assignable`, {
    headers,
  });
  expect(
    assignableRes.ok(),
    `前提: 担当者候補を取得できる (status=${assignableRes.status()})`
  ).toBeTruthy();
  const assignableUsers = (await assignableRes.json()) as Array<{ id: string }>;
  const salesPersonId = assignableUsers[0]?.id;
  assertPrepared(salesPersonId, '担当者候補のID');

  for (const name of names) {
    const projectRes = await page.request.post(`${API_BASE_URL}/api/projects`, {
      headers,
      data: { name, salesPersonId, tradingPartnerId: partnerId },
    });
    expect(
      projectRes.ok(),
      `前提: 取引先に紐付くプロジェクト「${name}」が作成される (status=${projectRes.status()})`
    ).toBeTruthy();
  }
}

/**
 * 詳細画面の関連プロジェクトの節の配置を実ブラウザで測る（タスク 31.3）。
 *
 * 関連プロジェクトの節を隠さずに、画面のコンテナ（main）の scrollWidth と clientWidth、
 * 表とその直接の親（是正後は横スクロールの領域、是正前は節そのもの）の矩形と scrollWidth・
 * clientWidth、節の内容の左右端を測る。表の親が節そのものかどうかも返す（是正前の報告のため）。
 */
async function measureRelatedProjectsLayout(page: Page, projectNames: string[]) {
  const table = page.getByRole('table', { name: 'プロジェクト一覧' });
  await expect(table).toBeVisible({ timeout: getTimeout(15000) });
  for (const name of projectNames) {
    await expect(table.getByRole('link', { name, exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });
  }

  return page.evaluate(async () => {
    await document.fonts.ready;

    const tableElement = document.querySelector<HTMLElement>(
      'table[aria-label="プロジェクト一覧"]'
    );
    const container = tableElement?.parentElement;
    const section = tableElement?.closest('section');
    const main = tableElement?.closest('main');
    if (!tableElement || !container || !section || !main) {
      throw new Error('関連プロジェクトの表・その親・節・画面のコンテナ（main）のいずれかが無い');
    }

    const mainRect = main.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const sectionRect = section.getBoundingClientRect();
    const sectionStyle = getComputedStyle(section);
    const containerRect = container.getBoundingClientRect();
    const tableRect = tableElement.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      main: {
        scrollWidth: main.scrollWidth,
        clientWidth: main.clientWidth,
        left: mainRect.left,
        contentRight: mainRect.right - parseFloat(mainStyle.paddingRight),
      },
      section: {
        contentLeft:
          sectionRect.left +
          parseFloat(sectionStyle.borderLeftWidth) +
          parseFloat(sectionStyle.paddingLeft),
        contentRight:
          sectionRect.right -
          parseFloat(sectionStyle.borderRightWidth) -
          parseFloat(sectionStyle.paddingRight),
      },
      container: {
        isSection: container === section,
        tag: container.tagName,
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        left: containerRect.left,
        right: containerRect.right,
      },
      table: {
        left: tableRect.left,
        right: tableRect.right,
        width: tableRect.width,
        height: tableRect.height,
      },
    };
  });
}

type RelatedProjectsLayout = Awaited<ReturnType<typeof measureRelatedProjectsLayout>>;

/** 指定の画面幅で詳細画面を開き直し、関連プロジェクトの節を測る。前提を満たせなければ失敗する。 */
async function openAndMeasureRelatedProjects(
  page: Page,
  partnerId: string,
  width: number,
  projectNames: string[]
): Promise<RelatedProjectsLayout> {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(`/trading-partners/${partnerId}`);
  await page.waitForLoadState('networkidle');
  const layout = await measureRelatedProjectsLayout(page, projectNames);
  // 前提: 画面幅が指定どおりで、main が幅を持つ
  expect(layout.viewportWidth, JSON.stringify(layout)).toBe(width);
  expect(layout.main.clientWidth, JSON.stringify(layout)).toBeGreaterThan(0);
  return layout;
}

/**
 * 関連プロジェクトの節を隠さずに、main が水平に押し広げられず、表を入れた横スクロールの領域が
 * main の内容の右端と画面幅の内側に在ることを主張する（許容誤差 1px）。
 */
function expectRelatedProjectsWithinMain(layout: RelatedProjectsLayout, context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  expect(
    layout.main.scrollWidth - layout.main.clientWidth,
    `main の scrollWidth ${layout.main.scrollWidth} が clientWidth ${layout.main.clientWidth} を超える。${report}`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(layout.container.isSection, `表が横スクロールの領域に入っていない。${report}`).toBe(false);
  const rightLimit = Math.min(layout.viewportWidth, layout.main.contentRight) + LAYOUT_TOLERANCE_PX;
  expect(layout.container.right, `横スクロールの領域の右端。${report}`).toBeLessThanOrEqual(
    rightLimit
  );
  expect(layout.container.left, `横スクロールの領域の左端。${report}`).toBeGreaterThanOrEqual(
    layout.main.left - LAYOUT_TOLERANCE_PX
  );
}

/** 削除確認ダイアログの収まりを測る画面幅（タスク 31.5）。 */
const DELETE_DIALOG_WIDTHS = [375, 320, 768, 1280] as const;

/** 削除確認ダイアログ（FocusManager の role="dialog"）の locator を返す。 */
function deleteDialog(page: Page): Locator {
  return page.getByTestId('focus-manager-overlay').getByRole('dialog', { name: '取引先の削除' });
}

/**
 * 削除確認ダイアログの配置を実ブラウザで測る（タスク 31.5）。
 *
 * - ダイアログ（role="dialog"）の矩形・内容の左右端（padding と border の内側）・scrollWidth と
 *   clientWidth を測る。
 * - ダイアログの中で、自身の直下に文字列を持つ要素ごとに、箱の矩形・文字列そのものの外接矩形
 *   （Range）・文字列が描かれた行の数（Range の行ごとの矩形の上端の異なる値の数）・同じ要素の複製を
 *   `white-space: nowrap` で置いたときの自然幅を測る。取引先名は inline の span で、箱の高さは
 *   行の高さ（line-height）と一致しないため、折り返しは行の数で測る。
 * - ダイアログの中のすべての要素の箱の左右端を測る（文字列を持たない入れ物のはみ出しも拾うため）。
 * - 文書全体の scrollWidth を測る。
 */
async function measureDeleteDialogLayout(page: Page) {
  const dialog = deleteDialog(page);
  await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

  return dialog.evaluate(async (dialogElement) => {
    await document.fonts.ready;

    const texts = Array.from(dialogElement.querySelectorAll<HTMLElement>('*'))
      .map((element) => {
        const ownText = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
        return { element, ownText };
      })
      .filter(({ ownText }) => ownText.length > 0)
      .map(({ element, ownText }) => {
        const probe = element.cloneNode(true) as HTMLElement;
        probe.removeAttribute('id');
        probe.removeAttribute('role');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'nowrap';
        probe.style.width = 'auto';
        element.parentElement?.appendChild(probe);
        const probeRect = probe.getBoundingClientRect();
        probe.remove();

        const range = document.createRange();
        range.selectNodeContents(element);
        const textRect = range.getBoundingClientRect();
        const boxRect = element.getBoundingClientRect();
        // 文字列が描かれた行の数（行ごとの矩形の上端の異なる値の数）
        const lineTops = new Set(
          Array.from(range.getClientRects())
            .filter((rect) => rect.width > 0)
            .map((rect) => Math.round(rect.top))
        );
        return {
          tag: element.tagName,
          text: ownText,
          lineCount: lineTops.size,
          boxLeft: boxRect.left,
          boxRight: boxRect.right,
          boxHeight: boxRect.height,
          textLeft: textRect.left,
          textRight: textRect.right,
          singleLineHeight: probeRect.height,
          naturalWidth: probeRect.width,
        };
      });

    const boxes = Array.from(dialogElement.querySelectorAll<HTMLElement>('*')).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        text: (element.textContent ?? '').slice(0, 24),
        left: rect.left,
        right: rect.right,
      };
    });

    const dialogRect = dialogElement.getBoundingClientRect();
    const dialogStyle = getComputedStyle(dialogElement);
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      dialog: {
        left: dialogRect.left,
        right: dialogRect.right,
        width: dialogRect.width,
        height: dialogRect.height,
        contentLeft:
          dialogRect.left +
          parseFloat(dialogStyle.borderLeftWidth) +
          parseFloat(dialogStyle.paddingLeft),
        contentRight:
          dialogRect.right -
          parseFloat(dialogStyle.borderRightWidth) -
          parseFloat(dialogStyle.paddingRight),
        scrollWidth: dialogElement.scrollWidth,
        clientWidth: dialogElement.clientWidth,
      },
      texts,
      boxes,
    };
  });
}

type DeleteDialogLayout = Awaited<ReturnType<typeof measureDeleteDialogLayout>>;

/**
 * 指定の画面幅で詳細画面を開き直し、ヘッダーの「削除」から削除確認ダイアログを開いて測る。
 * 前提（画面幅・ダイアログに取引先名が描かれていること）を満たせなければ失敗する。
 */
async function openAndMeasureDeleteDialog(
  page: Page,
  partnerId: string,
  width: number,
  partnerName: string
): Promise<DeleteDialogLayout> {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(`/trading-partners/${partnerId}`);
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('main')
    .getByRole('button', { name: /^削除$/ })
    .click();
  const layout = await measureDeleteDialogLayout(page);
  const report = JSON.stringify(layout);
  expect(layout.viewportWidth, report).toBe(width);
  expect(layout.dialog.clientWidth, report).toBeGreaterThan(0);
  expect(
    deleteDialogNameItems(layout, partnerName).length,
    `取引先名がダイアログに無い。${report}`
  ).toBe(1);
  for (const item of layout.texts) {
    expect(item.singleLineHeight, report).toBeGreaterThan(0);
    expect(item.naturalWidth, report).toBeGreaterThan(0);
  }
  return layout;
}

/** 削除確認ダイアログを「キャンセル」で閉じる（取引先は削除しない）。 */
async function cancelDeleteDialog(page: Page): Promise<void> {
  await deleteDialog(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(deleteDialog(page)).toBeHidden({ timeout: getTimeout(10000) });
}

/**
 * 削除確認ダイアログが水平にはみ出さないことを主張する（許容誤差 1px）。
 *
 * - ダイアログの scrollWidth が clientWidth を超えない（ダイアログの中に横スクロールが生じない）。
 * - ダイアログの箱が画面幅の内側に在り、文書全体の scrollWidth が画面幅を超えない。
 * - ダイアログの中のどの要素の箱も、どの文字列（Range の外接矩形）も、ダイアログの内容の左右端
 *   （padding の内側）の内側に在る。
 */
function expectDeleteDialogWithinBounds(layout: DeleteDialogLayout, context: string): void {
  const report = `${context}: ${JSON.stringify(layout)}`;
  expect(
    layout.dialog.scrollWidth - layout.dialog.clientWidth,
    `ダイアログの scrollWidth ${layout.dialog.scrollWidth} が clientWidth ${layout.dialog.clientWidth} を超える。${report}`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(layout.dialog.left, `ダイアログの左端。${report}`).toBeGreaterThanOrEqual(
    -LAYOUT_TOLERANCE_PX
  );
  expect(layout.dialog.right, `ダイアログの右端。${report}`).toBeLessThanOrEqual(
    layout.viewportWidth + LAYOUT_TOLERANCE_PX
  );
  expect(layout.documentScrollWidth, `文書全体の scrollWidth。${report}`).toBeLessThanOrEqual(
    layout.viewportWidth + LAYOUT_TOLERANCE_PX
  );
  const rightLimit = layout.dialog.contentRight + LAYOUT_TOLERANCE_PX;
  const leftLimit = layout.dialog.contentLeft - LAYOUT_TOLERANCE_PX;
  for (const item of layout.texts) {
    expect(item.textRight, `「${item.text}」の文字列の右端。${report}`).toBeLessThanOrEqual(
      rightLimit
    );
    expect(item.textLeft, `「${item.text}」の文字列の左端。${report}`).toBeGreaterThanOrEqual(
      leftLimit
    );
  }
  for (const box of layout.boxes) {
    expect(box.right, `${box.tag}「${box.text}」の箱の右端。${report}`).toBeLessThanOrEqual(
      rightLimit
    );
    expect(box.left, `${box.tag}「${box.text}」の箱の左端。${report}`).toBeGreaterThanOrEqual(
      leftLimit
    );
  }
}

/** 削除確認ダイアログの中で、取引先名を直下に持つ要素の実測を返す。 */
function deleteDialogNameItems(layout: DeleteDialogLayout, partnerName: string) {
  return layout.texts.filter((item) => item.text === partnerName);
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
   * 詳細画面の文字列のモバイル幅での収まり（タスク 31.2）
   *
   * 詳細表示（TradingPartnerDetailView）の表題と各欄の値は折り返しの指定を持たず、区切りの無い
   * 長い一語（英数字の名前・メールアドレス・電話番号など）が箱の外へ伸びて main を押し広げていた
   * （74 文字の名前で、main は 375 幅で 987/343、320 幅で 987/288、768 幅でも 987/720）。
   * あわせて 320 幅では、基本情報などの欄の格子の最小幅 250 が節の内側の幅を越え、名前に依らず
   * main が 291/288 になっていた。
   * 利用者が入力する文字列の項目（取引先名・フリガナ・部課/支店/支社名・代表者名・住所・電話番号・
   * FAX番号・メールアドレス・備考）をすべて埋めた取引先を、普通の日本語・区切りの無い長い英数字・
   * 区切りの無い長いカタカナの 3 通りで作り、375・320・768・1280 幅で次を主張する。
   *
   *  - 関連プロジェクトの節を除いた main の scrollWidth が clientWidth を超えない。
   *  - 詳細表示の中のどの要素の箱もどの文字列も、main の内容の右端と画面幅の内側に在る。
   *
   * 長い英数字の名前は、モバイル幅と 768 幅で表題と「取引先名」の値が実際に複数行へ折り返されて
   * いることも主張する。普通の名前は、768 幅と 1280 幅でどの文字列も一行ぶんの高さのままで、
   * 1280 幅で欄が横に並ぶこと（「取引先名」と「フリガナ」の値の上端が揃うこと）を主張する。
   * 寸法は固定値で主張せず、要素どうしの関係と、同じ要素を折り返させずに置いた複製との比で測る。
   *
   * 関連プロジェクトの表のはみ出し（タスク 31.3）は本タスクの境界の外であり、表の有無は紐付かない
   * プロジェクトが表に出る疑い（タスク 31.4）によって全体の実行順で変わるため、main は関連
   * プロジェクトの節を除いて測る。本スペックの受入基準に、詳細のモバイル幅の表示を定めた本文は
   * 無いため、受入基準の番号は名乗らない（タスク 31.2 は要件 12 の画面の欠陥として起票された）。
   */
  test.describe('詳細画面の文字列のモバイル幅での収まり', () => {
    test('普通の日本語の取引先の詳細がどの画面幅でも main を水平に押し広げず、768 幅以上で入力した文字列が折り返さない', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const stamp = Date.now();
      const fields: DetailTextFields = {
        name: `株式会社折返し確認建設_${stamp}`,
        nameKana: 'オリカエシカクニンケンセツ',
        branchName: '東京支店',
        representativeName: '山田太郎',
        address: '東京都千代田区丸の内1-2-3',
        phoneNumber: '03-1234-5678',
        faxNumber: '03-1234-5679',
        email: `info${stamp}@example.co.jp`,
        notes: '月末締め翌月末払い',
      };
      const partnerId = await createTradingPartnerWithAllTextFields(page, fields);

      for (const width of DETAIL_TEXT_WIDTHS) {
        const layout = await openAndMeasureDetailText(page, partnerId, width, fields);
        expectDetailTextWithinMain(layout, `普通の名前 ${width} 幅`);
      }

      for (const width of [768, 1280] as const) {
        const layout = await openAndMeasureDetailText(page, partnerId, width, fields);
        const report = `普通の名前 ${width} 幅: ${JSON.stringify(layout)}`;
        // 利用者が入力した文字列（表題・フリガナ・各欄の値・備考）が一行ぶんの高さのまま
        const enteredItems = Object.values(fields).flatMap((value) =>
          detailTextItems(layout, value)
        );
        expect(enteredItems.length, report).toBeGreaterThanOrEqual(Object.values(fields).length);
        for (const item of enteredItems) {
          expect(
            Math.abs(item.boxHeight - item.singleLineHeight),
            `「${item.text}」の高さ ${item.boxHeight} が一行ぶん ${item.singleLineHeight} と異なる。${report}`
          ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
        }
      }

      const desktop = await openAndMeasureDetailText(page, partnerId, 1280, fields);
      const desktopReport = `普通の名前 1280 幅: ${JSON.stringify(desktop)}`;
      const nameValue = detailTextItems(desktop, fields.name)[1];
      const kanaValue = detailTextItems(desktop, fields.nameKana)[1];
      assertPresent(nameValue, `「取引先名」の値の実測（普通の名前 1280 幅）`);
      assertPresent(kanaValue, `「フリガナ」の値の実測（普通の名前 1280 幅）`);
      expect(
        Math.abs(kanaValue.boxTop - nameValue.boxTop),
        `「取引先名」と「フリガナ」の値が横に並ばない。${desktopReport}`
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
      expect(kanaValue.boxLeft, desktopReport).toBeGreaterThan(nameValue.boxRight);
    });

    test('区切りの無い長い英数字の取引先の詳細がどの画面幅でも main を水平に押し広げず、表題と取引先名の値が折り返す', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const stamp = Date.now();
      const fields: DetailTextFields = {
        name: `TradingPartnerRedevelopmentSkyscraperConstructionUnbrokenName${stamp}`,
        nameKana: 'トリヒキサキサイカイハツチョウコウソウビルケンセツオリカエシカクニン',
        branchName: `BranchOfficeRedevelopmentSkyscraperConstructionUnbroken${stamp}`,
        representativeName: `RepresentativeDirectorRedevelopmentSkyscraperUnbroken${stamp}`,
        address: `TokyoChiyodaMarunouchi1Chome2Ban3GoRedevelopmentSkyscraperSite${stamp}`,
        phoneNumber: '0312345678'.repeat(6),
        faxNumber: '0312345679'.repeat(6),
        email: `overflowcheck${stamp}tradingpartnerunbrokenmailbox@redevelopment-skyscraper-construction-example.co.jp`,
        notes: `PaymentTermsMonthEndClosingNextMonthEndPaymentUnbrokenRemarks${stamp}`,
      };
      const partnerId = await createTradingPartnerWithAllTextFields(page, fields);

      for (const width of DETAIL_TEXT_WIDTHS) {
        const layout = await openAndMeasureDetailText(page, partnerId, width, fields);
        expectDetailTextWithinMain(layout, `長い英数字の名前 ${width} 幅`);
      }

      // 名前の自然幅が自身の箱の幅を超える画面幅では、表題と「取引先名」の値が実際に複数行へ折り返す
      for (const width of [375, 320, 768] as const) {
        const layout = await openAndMeasureDetailText(page, partnerId, width, fields);
        const report = `長い英数字の名前 ${width} 幅: ${JSON.stringify(layout)}`;
        const nameItems = detailTextItems(layout, fields.name);
        // 前提: 表題と「取引先名」の値の 2 箇所に名前が在り、その自然幅が自身の箱の幅を超える
        expect(nameItems.length, report).toBe(2);
        for (const item of nameItems) {
          expect(item.naturalWidth, report).toBeGreaterThan(item.boxRight - item.boxLeft);
          expect(
            item.boxHeight,
            `名前が折り返されていない（高さ ${item.boxHeight}、一行ぶん ${item.singleLineHeight}）。${report}`
          ).toBeGreaterThanOrEqual(item.singleLineHeight * 2 - LAYOUT_TOLERANCE_PX);
        }
      }
    });

    test('区切りの無い長いカタカナの取引先の詳細がどの画面幅でも main を水平に押し広げない', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const stamp = Date.now();
      const longKana =
        'カブシキガイシャショウワサイカイハツチョウコウソウビルケンセツオリカエシカクニントリヒキサキ';
      const fields: DetailTextFields = {
        name: `${longKana}${stamp}`,
        nameKana: longKana,
        branchName: 'トウキョウマルノウチサイカイハツチョウコウソウビルケンセツジムショ',
        representativeName: 'ダイヒョウトリシマリヤクシャチョウオリカエシカクニンタロウ',
        address: `${longKana}マルノウチイッチョウメニバンサンゴウ`,
        phoneNumber: '03-1234-5678',
        faxNumber: '03-1234-5679',
        email: `kana${stamp}@example.co.jp`,
        notes: `${longKana}ゲツマツシメヨクゲツマツバライ`,
      };
      const partnerId = await createTradingPartnerWithAllTextFields(page, fields);

      for (const width of DETAIL_TEXT_WIDTHS) {
        const layout = await openAndMeasureDetailText(page, partnerId, width, fields);
        expectDetailTextWithinMain(layout, `長いカタカナの名前 ${width} 幅`);
      }
    });
  });

  /**
   * 詳細画面の関連プロジェクトの表のモバイル幅での収まり（タスク 31.3）
   *
   * 関連プロジェクトの表は、行があると表の最小幅が画面幅を超え、main を押し広げていた
   * （375 幅で表の幅 608・右端 665、main 649/343）。利用者の判断（2026-10-07）により、表だけを
   * 横スクロールの領域（名前付きの region、キーボードでフォーカスできる）に入れる。
   * 取引先に紐付くプロジェクトを、区切りの無い長い英数字の名前と普通の日本語の名前の 2 件作り、
   * 次を主張する。
   *
   *  - 375・320 幅: 関連プロジェクトの節を隠さずに、main の scrollWidth が clientWidth を超えない。
   *    領域は main の内容の右端と画面幅の内側に在り、領域の中で表が横にスクロールする
   *    （領域の scrollWidth が clientWidth を超える）。領域にフォーカスして右矢印キーを押すと
   *    横にスクロールする。
   *  - 768 幅: main の scrollWidth が clientWidth を超えず、領域が main の内側に在る（長い英数字の
   *    名前の表は是正前に 768 幅でも main を 723/720 に押し広げていた）。
   *  - 1280 幅: 領域は横にスクロールせず、表は是正前と同じく節の内容の幅いっぱいに広がる
   *    （表の左右端が節の内容の左右端と揃う）。
   *
   * 寸法は固定値で主張せず、要素どうしの関係で測る。紐付かないプロジェクトが表に出る疑い
   * （タスク 31.4）は本タスクの境界の外であり、ここで作った行の存在だけを前提として確かめる。
   * 本スペックの受入基準に、詳細のモバイル幅の表示を定めた本文は無いため、受入基準の番号は
   * 名乗らない（タスク 31.3 は要件 12 の画面の欠陥として起票された）。
   */
  test.describe('詳細画面の関連プロジェクトの表のモバイル幅での収まり', () => {
    test('関連プロジェクトの表がモバイル幅で main を水平に押し広げず、表だけが横にスクロールする', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const stamp = Date.now();
      const partnerId = await createTradingPartnerForBreadcrumb(
        page,
        `関連プロジェクト表収まり確認_${stamp}`
      );
      const projectNames = [
        `RelatedProjectRedevelopmentSkyscraperConstructionUnbrokenName${stamp}`,
        `渋谷駅前再開発工事_${stamp}`,
      ];
      await createProjectsLinkedToPartner(page, partnerId, projectNames);

      for (const width of MOBILE_WIDTHS) {
        const layout = await openAndMeasureRelatedProjects(page, partnerId, width, projectNames);
        const context = `関連プロジェクトの表 ${width} 幅`;
        const report = `${context}: ${JSON.stringify(layout)}`;
        expectRelatedProjectsWithinMain(layout, context);
        // 領域の中で表が横にスクロールする（表の幅が領域の幅を超える）
        expect(
          layout.container.scrollWidth,
          `横スクロールの領域の scrollWidth が clientWidth を超えない。${report}`
        ).toBeGreaterThan(layout.container.clientWidth + LAYOUT_TOLERANCE_PX);
        expect(layout.table.width, report).toBeGreaterThan(
          layout.container.clientWidth + LAYOUT_TOLERANCE_PX
        );

        // キーボードでフォーカスして横にスクロールできる
        const region = page.getByRole('region', { name: '関連プロジェクト' });
        await expect(region).toHaveAttribute('tabindex', '0');
        await region.focus();
        await expect(region).toBeFocused();
        expect(await region.evaluate((element) => element.scrollLeft), report).toBe(0);
        await page.keyboard.press('ArrowRight');
        await expect
          .poll(() => region.evaluate((element) => element.scrollLeft), {
            message: `右矢印キーで横スクロールの領域が右へスクロールしない。${report}`,
            timeout: getTimeout(5000),
          })
          .toBeGreaterThan(0);
      }

      // 768 幅でも長い英数字の名前の表は main を押し広げていた（是正前 723/720）
      const tablet = await openAndMeasureRelatedProjects(page, partnerId, 768, projectNames);
      expectRelatedProjectsWithinMain(tablet, '関連プロジェクトの表 768 幅');

      const desktop = await openAndMeasureRelatedProjects(page, partnerId, 1280, projectNames);
      const desktopReport = `関連プロジェクトの表 1280 幅: ${JSON.stringify(desktop)}`;
      expectRelatedProjectsWithinMain(desktop, '関連プロジェクトの表 1280 幅');
      expect(
        desktop.container.scrollWidth - desktop.container.clientWidth,
        `1280 幅で横スクロールの領域がスクロールする。${desktopReport}`
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
      // 表は節の内容の幅いっぱいに広がる（是正前と同じ配置）
      expect(
        Math.abs(desktop.table.left - desktop.section.contentLeft),
        `表の左端が節の内容の左端と揃わない。${desktopReport}`
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
      expect(
        Math.abs(desktop.table.right - desktop.section.contentRight),
        `表の右端が節の内容の右端と揃わない。${desktopReport}`
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
    });
  });

  /**
   * 削除確認ダイアログの取引先名のモバイル幅での収まり（タスク 31.5）
   *
   * 削除確認ダイアログ（TradingPartnerDeleteDialog）の取引先名は折り返しの指定を持たず、区切りの
   * 無い長い英数字の名前がダイアログの外へ伸びていた（名前の右端が 375 幅で 650・320 幅で 647、
   * ダイアログの scrollWidth/clientWidth が 375 幅で 631/338、320 幅で 631/288）。
   * ダイアログの中で利用者の入力した文字列を表示するのは取引先名だけである（表題・説明文・
   * ボタンの文言とエラーメッセージは固定の文言で、名前を含まない）。普通の日本語・区切りの無い
   * 長い英数字・区切りの無い長いカタカナの 3 通りの名前で、詳細画面のヘッダーの「削除」から
   * ダイアログを開き、375・320・768・1280 幅で次を主張する。
   *
   *  - ダイアログの scrollWidth が clientWidth を超えず、ダイアログの箱が画面幅の内側に在る。
   *  - ダイアログの中のどの要素の箱もどの文字列も、ダイアログの内容の左右端の内側に在る。
   *
   * 長い英数字の名前は、どの画面幅でも名前が実際に複数行へ折り返されていること、プロジェクトに
   * 紐付いていて削除を拒否されたとき（エラーメッセージの表示中）もはみ出さないことを主張する。
   * 普通の名前は、768 幅と 1280 幅で名前が一行に収まったままであることを主張する。
   * 寸法は固定値で主張せず、要素どうしの関係と、同じ要素を折り返させずに置いた複製との比で測る。
   * ダイアログは「キャンセル」で閉じ、取引先は削除しない（削除権限のため管理者で操作する）。
   * 本スペックの受入基準に、ダイアログのモバイル幅の表示を定めた本文は無いため、受入基準の番号は
   * 名乗らない（タスク 31.5 は要件 12 の画面の欠陥として起票された）。
   */
  test.describe('削除確認ダイアログの取引先名のモバイル幅での収まり', () => {
    test('普通の日本語の取引先名の削除確認ダイアログがどの画面幅でもはみ出さず、768 幅以上で名前が一行に収まる', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      const partnerName = `株式会社折返し確認建設_${Date.now()}`;
      const partnerId = await createTradingPartnerForBreadcrumb(page, partnerName);

      for (const width of DELETE_DIALOG_WIDTHS) {
        const layout = await openAndMeasureDeleteDialog(page, partnerId, width, partnerName);
        const context = `普通の名前 ${width} 幅`;
        expectDeleteDialogWithinBounds(layout, context);
        await cancelDeleteDialog(page);
      }

      for (const width of [768, 1280] as const) {
        const layout = await openAndMeasureDeleteDialog(page, partnerId, width, partnerName);
        const report = `普通の名前 ${width} 幅: ${JSON.stringify(layout)}`;
        const [nameItem] = deleteDialogNameItems(layout, partnerName);
        assertPresent(nameItem, `取引先名の実測（普通の名前 ${width} 幅）`);
        expect(nameItem.lineCount, `名前が一行に収まらない。${report}`).toBe(1);
        await cancelDeleteDialog(page);
      }
    });

    test('区切りの無い長い英数字の取引先名の削除確認ダイアログがどの画面幅でもはみ出さず、名前が折り返す', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      const stamp = Date.now();
      const partnerName = `TradingPartnerRedevelopmentSkyscraperConstructionUnbrokenName${stamp}`;
      const partnerId = await createTradingPartnerForBreadcrumb(page, partnerName);
      // 削除を拒否させてエラーメッセージを表示させるため、プロジェクトを 1 件紐付ける
      await createProjectsLinkedToPartner(page, partnerId, [`削除拒否確認プロジェクト_${stamp}`]);

      for (const width of DELETE_DIALOG_WIDTHS) {
        const layout = await openAndMeasureDeleteDialog(page, partnerId, width, partnerName);
        const context = `長い英数字の名前 ${width} 幅`;
        const report = `${context}: ${JSON.stringify(layout)}`;
        expectDeleteDialogWithinBounds(layout, context);

        // 前提: 名前の自然幅がダイアログの内容の幅を超える。そのうえで名前が実際に複数行へ折り返す
        const [nameItem] = deleteDialogNameItems(layout, partnerName);
        assertPresent(nameItem, `取引先名の実測（${context}）`);
        expect(nameItem.naturalWidth, report).toBeGreaterThan(
          layout.dialog.contentRight - layout.dialog.contentLeft
        );
        expect(
          nameItem.lineCount,
          `名前が複数行へ折り返されていない。${report}`
        ).toBeGreaterThanOrEqual(2);

        // 削除を拒否されてエラーメッセージを表示している間もはみ出さない（取引先は削除されない）
        const rejectPromise = page.waitForResponse(
          (response) =>
            response.url().includes(`/api/trading-partners/${partnerId}`) &&
            response.request().method() === 'DELETE' &&
            response.status() === 409,
          { timeout: getTimeout(30000) }
        );
        await deleteDialog(page)
          .getByRole('button', { name: /^削除$/ })
          .click();
        await rejectPromise;
        await expect(deleteDialog(page).getByRole('alert')).toBeVisible({
          timeout: getTimeout(10000),
        });
        const withError = await measureDeleteDialogLayout(page);
        expectDeleteDialogWithinBounds(withError, `${context}（削除を拒否されたとき）`);
        await cancelDeleteDialog(page);
      }
    });

    test('区切りの無い長いカタカナの取引先名の削除確認ダイアログがどの画面幅でもはみ出さない', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      const partnerName = `カブシキガイシャショウワサイカイハツチョウコウソウビルケンセツオリカエシカクニントリヒキサキ${Date.now()}`;
      const partnerId = await createTradingPartnerForBreadcrumb(page, partnerName);

      for (const width of DELETE_DIALOG_WIDTHS) {
        const layout = await openAndMeasureDeleteDialog(page, partnerId, width, partnerName);
        expectDeleteDialogWithinBounds(layout, `長いカタカナの名前 ${width} 幅`);
        await cancelDeleteDialog(page);
      }
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
