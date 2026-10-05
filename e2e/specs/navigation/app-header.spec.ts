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
 * 管理者としてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'ADMIN_USER');
}

/**
 * 一般ユーザーとしてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsRegularUser(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'REGULAR_USER');
}

/**
 * モバイル幅の検証（Task 39.1）で測る画面幅
 *
 * 要件15.1 が定めるモバイル幅（320px-767px）の下限 320 と、
 * 機能レベル検証が水平のはみ出しを実測した 375 の二つ。
 */
const MOBILE_WIDTHS = [320, 375] as const;

/**
 * モバイル幅の検証で使うロール
 *
 * 管理者は「管理メニュー」が一つ多く、ヘッダーに並ぶ項目の数が違うため、双方を測る。
 */
const MOBILE_HEADER_ROLES = [
  { label: '管理者', userKey: 'ADMIN_USER', isAdmin: true },
  { label: '一般ユーザー', userKey: 'REGULAR_USER', isAdmin: false },
] as const;

/**
 * モバイル幅の検証で使う表示名と、測る保護画面
 *
 * displayName が null のものはテストユーザーの既定の表示名のまま、既存の検証と同じ /dashboard で測る。
 * 長い表示名は、区切りの無い英数字一語（折り返す位置が無い）と長い和文の二通りで、/profile で測る。
 *
 * 長い表示名を /dashboard で測らない理由: ダッシュボード画面の本文は見出しに表示名を出し
 * （frontend/src/pages/Dashboard.tsx の「ようこそ、…さん」）、区切りの無い英数字一語の長い表示名では
 * その見出しの文字が画面幅を超える（是正後のヘッダーで実測。375 幅で documentElement の
 * scrollWidth 983 / clientWidth 375。はみ出すのは <main> 側の h1 の文字で、ヘッダーは内側にある）。
 * 文書全体の幅は本文のはみ出しも拾うため、/dashboard で測るとヘッダーの検証にならない。
 * /profile の本文は表示名を入力欄の値としてしか出さず、長い表示名でも本文がはみ出さない。
 * ダッシュボードの見出しのはみ出しは共通ヘッダーの境界の外であり、本検証は判定しない。
 * （上の値は Task 39.1 の時点の実測。見出しのはみ出しは Task 40.3 で是正し、
 * e2e/specs/auth/dashboard-responsive.spec.ts が判定する）
 */
const MOBILE_DISPLAY_NAME_CASES = [
  { label: '既定の表示名', displayName: null, path: '/dashboard' },
  {
    label: '区切りの無い英数字一語の長い表示名',
    displayName: 'Abcdefghij0123456789'.repeat(3),
    path: '/profile',
  },
  {
    label: '長い和文の表示名',
    displayName: '共通ヘッダの表示を確かめるためのとても長い表示名を持つ利用者'.repeat(2),
    path: '/profile',
  },
] as const;

/** 水平方向の許容誤差（px）。小数のレイアウトの丸めを吸収する */
const HORIZONTAL_TOLERANCE_PX = 1;

/**
 * タブレット幅の検証（Task 40.1）で測る画面幅
 *
 * 769 はモバイル幅の表示（768px 以下）の直上、789 は是正前に管理者の長い表示名で
 * 文書がはみ出した幅（test 環境の実測で +15px）、900 と 1024 はその間の代表、
 * 1199 はリンクの文言を隠す範囲の上端、1200 は文言を出す範囲の下端である。
 */
const TABLET_WIDTHS = [769, 789, 900, 1024, 1199, 1200] as const;

/**
 * タブレット幅の検証で使う表示名と、測る保護画面
 *
 * 長い表示名は backend が許す上限（100 文字）の、区切りの無い英数字一語と和文の二通り。
 * 長い表示名を /profile で測る理由はモバイル幅の検証（MOBILE_DISPLAY_NAME_CASES）と同じである。
 */
const TABLET_DISPLAY_NAME_CASES = [
  { label: '既定の表示名', displayName: null, path: '/dashboard' },
  {
    label: '区切りの無い英数字 100 文字の表示名',
    displayName: 'Abcdefghij0123456789'.repeat(5),
    path: '/profile',
  },
  {
    label: '和文 100 文字の表示名',
    displayName: '共通ヘッダの表示を確かめるためのとても長い表示名を持つ利用者'
      .repeat(4)
      .slice(0, 100),
    path: '/profile',
  },
] as const;

/**
 * アクセシブルネームの検証（Task 40.2）で測る画面幅
 *
 * アイコンのみの表示（1199px 以下）の全範囲から、モバイル幅の下限 320、機能レベル検証の 375、
 * モバイル対応（ロゴの文字とユーザー名も隠す）の上端 768、タブレット幅の代表 1024、
 * アイコンのみの表示の上端 1199 を取り、文言を出すデスクトップ幅 1280 を対照として加える。
 */
const ACCESSIBLE_NAME_WIDTHS = [320, 375, 768, 1024, 1199, 1280] as const;

/**
 * リンクと管理メニューの文言を隠す幅の上限（AppHeader.css の @media (max-width: 1199px)。
 * frontend/src/utils/responsive.ts の APP_HEADER_ICON_ONLY_MAX_WIDTH と同値）
 */
const ICON_ONLY_MAX_WIDTH = 1199;

/** ロゴの文字とユーザー名も隠す幅の上限（AppHeader.css の @media (max-width: 768px)） */
const HEADER_MOBILE_MAX_WIDTH = 768;

/**
 * 共通ヘッダーのリンクの名前（デスクトップ幅で見えている文言）と行き先
 *
 * アクセシブルネームは画面幅によらずデスクトップ幅の名前と同じであること（見えている文言と
 * 名前の一致。WCAG 2.5.3 Label in Name）を求めるため、各リンクの文言をそのまま名前として指す。
 */
const HEADER_LINKS = [
  {
    name: 'ArchiTrack',
    href: '/',
    textSelector: '.app-header-logo-text',
    hideMaxWidth: HEADER_MOBILE_MAX_WIDTH,
  },
  { name: 'ダッシュボード', href: '/', textSelector: 'span', hideMaxWidth: ICON_ONLY_MAX_WIDTH },
  {
    name: 'プロジェクト',
    href: '/projects',
    textSelector: 'span',
    hideMaxWidth: ICON_ONLY_MAX_WIDTH,
  },
  {
    name: '取引先',
    href: '/trading-partners',
    textSelector: 'span',
    hideMaxWidth: ICON_ONLY_MAX_WIDTH,
  },
  {
    name: '自社情報',
    href: '/company-info',
    textSelector: 'span',
    hideMaxWidth: ICON_ONLY_MAX_WIDTH,
  },
] as const;

/**
 * 要素が見た目の上で隠れている（描かれる箱が 1px 以下）かを測る
 *
 * display: none（箱が 0×0）と、支援技術に名前を残して見た目だけ隠す指定（1px の箱に切り取る）の
 * どちらも「隠れている」と読む。文言が読める大きさで描かれていれば幅と高さは 1px を超える。
 */
async function isVisuallyHidden(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1;
  });
}

/** 一行のヘッダーの高さを測る基準のデスクトップ幅 */
const DESKTOP_REFERENCE_WIDTH = 1280;

/** 垂直方向の許容誤差（px）。小数のレイアウトの丸めを吸収する */
const VERTICAL_TOLERANCE_PX = 1;

/** 共通ヘッダーの行の寸法（ヘッダー自身と、ロゴ・nav・各リンク・各メニューのボタンの縦の位置と高さ） */
interface HeaderRowMeasurement {
  headerTop: number;
  headerBottom: number;
  headerHeight: number;
  items: { what: string; top: number; bottom: number; height: number }[];
}

/**
 * 共通ヘッダーの行の寸法を測る
 */
async function measureHeaderRow(header: Locator): Promise<HeaderRowMeasurement> {
  return header.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const targets = [
      ...Array.from(el.querySelectorAll('a')),
      ...Array.from(el.querySelectorAll('nav')),
      ...Array.from(el.querySelectorAll('button[aria-haspopup="menu"]')),
    ];
    return {
      headerTop: box.top,
      headerBottom: box.bottom,
      headerHeight: box.height,
      items: targets.map((t) => {
        const r = t.getBoundingClientRect();
        const href = t.getAttribute('href');
        return {
          what: `${t.tagName.toLowerCase()}${href ? `[href="${href}"]` : ''}`,
          top: r.top,
          bottom: r.bottom,
          height: r.height,
        };
      }),
    };
  });
}

/**
 * 共通ヘッダーが一行のまま崩れていないことを主張する
 *
 * 高さの固定値はフォントに依存しうるため、同じ画面のデスクトップ幅（文言が一行に収まる幅）で
 * 測った寸法と比べる。
 * - ヘッダーの高さが、デスクトップ幅のヘッダーの高さを超えない
 * - ロゴ・nav・各リンク・各メニューのボタンの高さが、デスクトップ幅での同じ要素の高さを超えない
 *   （文言が縦に折り返すと要素が高くなる。二行の折り返しはヘッダーの内側に収まることがあるため、
 *   ヘッダーの上端と下端だけでは捉えられない）
 * - それらがヘッダーの上端と下端の内側に収まる
 */
async function expectHeaderSingleRow(
  header: Locator,
  desktop: HeaderRowMeasurement,
  situation: string
): Promise<void> {
  const m = await measureHeaderRow(header);
  const report = `${situation}: ${JSON.stringify(m)}（デスクトップ幅: ${JSON.stringify(desktop)}）`;
  // 前提: 測る対象（ロゴ・四つのリンク・nav・メニューのボタン）が集まり、デスクトップ幅と同じ並びである
  expect(m.items.length, report).toBeGreaterThanOrEqual(7);
  expect(
    m.items.map((item) => item.what),
    report
  ).toEqual(desktop.items.map((item) => item.what));
  expect(m.headerHeight, report).toBeLessThanOrEqual(desktop.headerHeight + VERTICAL_TOLERANCE_PX);
  for (const [index, item] of m.items.entries()) {
    const itemReport = `${report} / ${index}: ${item.what}`;
    expect(item.height, itemReport).toBeGreaterThan(0);
    expect(item.height, itemReport).toBeLessThanOrEqual(
      (desktop.items[index]?.height ?? 0) + VERTICAL_TOLERANCE_PX
    );
    expect(item.top, itemReport).toBeGreaterThanOrEqual(m.headerTop - VERTICAL_TOLERANCE_PX);
    expect(item.bottom, itemReport).toBeLessThanOrEqual(m.headerBottom + VERTICAL_TOLERANCE_PX);
  }
}

/**
 * 文書全体（documentElement）の水平方向の寸法を測る
 */
async function measureDocumentWidth(page: Page): Promise<{
  viewportWidth: number;
  scrollWidth: number;
  clientWidth: number;
}> {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/**
 * 文書全体が水平にはみ出していないことを主張する
 *
 * clientWidth が設定した画面幅と一致することを先に主張する。
 * 画面幅の設定が効いていなければ、はみ出しの主張は別の幅を測ったことになるためである。
 */
async function expectNoDocumentHorizontalOverflow(
  page: Page,
  width: number,
  situation: string
): Promise<void> {
  const m = await measureDocumentWidth(page);
  const report = `${situation}: documentElement の scrollWidth=${m.scrollWidth} / clientWidth=${m.clientWidth}（画面幅 ${m.viewportWidth}）`;
  expect(m.viewportWidth, report).toBe(width);
  expect(m.clientWidth, report).toBe(width);
  expect(m.scrollWidth - m.clientWidth, report).toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
}

/**
 * 要素が画面幅の内側にあり、その中心を指して届くことを主張する
 *
 * 位置は文書の座標（表示領域の座標 + 水平スクロール量）で測る。
 * Playwright の click は対象が表示領域の外にあると水平にスクロールして届かせるため、
 * 表示領域の座標のままでは「はみ出していたのでスクロールして届いた」状態を内側と読み違える。
 * 要素の箱だけでなく中身（文字とアイコン）の右端も DOM Range と子孫の箱で測る
 * （overflow で切り取られて描かれない部分は除く。タブレット幅の省略表示のユーザー名のため）。
 * flex の項目は中身に合わせて伸びるので、要素自身の scrollWidth では中身のはみ出しを捉えられない。
 * 中心の点で elementFromPoint が当の要素（またはその子孫）を返すことも主張する。
 * 他の要素の下に隠れている、または表示領域の外にある要素は、位置が内側でも届かないためである。
 */
async function expectReachableWithinViewport(target: Locator, description: string): Promise<void> {
  const m = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    // 中身の右端: 子孫の要素と文字の箱の右端の最大。ただし overflow で切り取る祖先（el を含む）の
    // 右端で切る。省略表示（text-overflow: ellipsis）の文字は箱の外の部分が描かれないため、
    // 切り取りを無視すると、見えていない文字の幅をはみ出しと読み違える
    const clipRight = (node: Node, right: number): number => {
      let clipped = right;
      for (let a = node.parentElement; a !== null; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') {
          clipped = Math.min(clipped, a.getBoundingClientRect().right);
        }
        if (a === el) break;
      }
      return clipped;
    };
    let contentRightInViewport = -Infinity;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      let box: DOMRect;
      if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(node);
        box = range.getBoundingClientRect();
      } else {
        box = (node as Element).getBoundingClientRect();
      }
      if (box.width === 0 && box.height === 0) continue;
      contentRightInViewport = Math.max(contentRightInViewport, clipRight(node, box.right));
    }
    const content = {
      right: Number.isFinite(contentRightInViewport) ? contentRightInViewport : rect.right,
    };
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      viewportWidth: document.documentElement.clientWidth,
      left: rect.left + window.scrollX,
      right: rect.right + window.scrollX,
      width: rect.width,
      height: rect.height,
      contentRight: content.right + window.scrollX,
      hitsItself: hit !== null && (hit === el || el.contains(hit)),
    };
  });
  const report = `${description}: ${JSON.stringify(m)}`;
  expect(m.width, report).toBeGreaterThan(0);
  expect(m.height, report).toBeGreaterThan(0);
  expect(m.left, report).toBeGreaterThanOrEqual(-HORIZONTAL_TOLERANCE_PX);
  expect(m.right, report).toBeLessThanOrEqual(m.viewportWidth + HORIZONTAL_TOLERANCE_PX);
  expect(m.contentRight, report).toBeLessThanOrEqual(m.viewportWidth + HORIZONTAL_TOLERANCE_PX);
  expect(m.hitsItself, report).toBe(true);
}

/**
 * 共通ヘッダーのリンクと二つのメニューの項目が、画面幅の内側にあって届き、
 * メニューを開いた状態と閉じた状態のどちらでも文書全体が水平にはみ出さないことを主張する
 *
 * モバイル幅（Task 39.1）とタブレット幅（Task 40.1）の検証が共有する。
 * 呼び出し側は、ヘッダーとナビゲーションが表示されていることを先に主張しておくこと。
 *
 * ヘッダーのリンクと管理メニューのボタンは、名前でなく href と構造で指す。
 * 本検証の導入時（Task 39.1）は、文言が display: none の幅でリンクと管理メニューのボタンが
 * アクセシブルネームを持たなかったためである。名前は Task 40.2 の是正で全幅に戻り、その判定は
 * 「アイコンのみの表示のアクセシブルネーム」が受け持つ。本関数は配置と到達性だけを判定する。
 * 開いたメニューの項目は文言が表示されるので名前で指す。
 */
async function expectHeaderItemsReachable(
  page: Page,
  header: Locator,
  nav: Locator,
  width: number,
  role: { label: string; isAdmin: boolean }
): Promise<void> {
  // 前提: ヘッダーのリンク（ロゴ・ダッシュボード・プロジェクト・取引先・自社情報）が揃っている
  const logoLink = header.locator('a.app-header-logo[href="/"]');
  const headerLinks = [
    { name: 'ロゴ', locator: logoLink },
    { name: 'ダッシュボード', locator: nav.locator('a[href="/"]') },
    { name: 'プロジェクト', locator: nav.locator('a[href="/projects"]') },
    { name: '取引先', locator: nav.locator('a[href="/trading-partners"]') },
    { name: '自社情報', locator: nav.locator('a[href="/company-info"]') },
  ];
  for (const link of headerLinks) {
    await expect(link.locator, `${link.name}のリンク`).toBeVisible();
  }

  // 前提: ユーザーメニューを開ける
  const menuTriggers = nav.locator('button[aria-haspopup="menu"]');
  await expect(menuTriggers).toHaveCount(role.isAdmin ? 2 : 1);
  const userMenuButton = menuTriggers.last();
  await expect(userMenuButton).toBeVisible();
  await userMenuButton.click();
  const userMenu = header.getByRole('menu');
  await expect(userMenu).toBeVisible();
  const profileItem = userMenu.getByRole('menuitem', { name: 'プロフィール' });
  const logoutItem = userMenu.getByRole('menuitem', { name: 'ログアウト' });
  await expect(profileItem).toBeVisible();
  await expect(logoutItem).toBeVisible();

  // ユーザーメニューを開いた状態で、文書全体が水平にはみ出さず、各項目が画面幅の内側にある
  await expectNoDocumentHorizontalOverflow(page, width, 'ユーザーメニューを開いた状態');
  await expectReachableWithinViewport(userMenu, 'ユーザーメニューのパネル');
  await expectReachableWithinViewport(profileItem, 'ユーザーメニューの「プロフィール」');
  await expectReachableWithinViewport(logoutItem, 'ユーザーメニューの「ログアウト」');

  // メニューを閉じた状態で、文書全体が水平にはみ出さず、リンクとメニューのボタンが画面幅の内側にある
  await page.keyboard.press('Escape');
  await expect(userMenu).toBeHidden();
  await expectNoDocumentHorizontalOverflow(page, width, 'メニューを閉じた状態');
  await expectReachableWithinViewport(header, '共通ヘッダー');
  for (const link of headerLinks) {
    await expectReachableWithinViewport(link.locator, `${link.name}のリンク`);
  }
  await expectReachableWithinViewport(userMenuButton, 'ユーザーメニューのボタン');

  // 管理メニュー: ロールで主張を分岐させず、ユーザーメニューより前に並ぶトリガー（管理メニューの
  // ボタン）を実際の画面から集め、その件数をロールごとの期待値（管理者 1・一般ユーザー 0）で
  // 無条件に主張してから、集めたボタンのそれぞれに無条件に主張する。件数の主張があるため、
  // 管理者でボタンが 1 件も集まらずに以下の主張が空振りすることは無い。
  const adminMenuButtons = (await menuTriggers.all()).slice(0, -1);
  expect(adminMenuButtons, `${role.label}の管理メニューのボタンの数`).toHaveLength(
    role.isAdmin ? 1 : 0
  );
  for (const adminMenuButton of adminMenuButtons) {
    // 管理者: 管理メニューのボタンが画面幅の内側にあり、開いた各項目も内側にある
    await expect(adminMenuButton).toBeVisible();
    await expectReachableWithinViewport(adminMenuButton, '管理メニューのボタン');
    await adminMenuButton.click();
    const adminMenu = header.getByRole('menu');
    await expect(adminMenu).toBeVisible();
    const adminItems = [
      {
        name: 'ユーザー管理',
        locator: adminMenu.getByRole('menuitem', { name: 'ユーザー管理' }),
      },
      {
        name: '招待管理',
        locator: adminMenu.getByRole('menuitem', { name: '招待管理' }),
      },
      {
        name: 'ロール管理',
        locator: adminMenu.getByRole('menuitem', { name: 'ロール管理' }),
      },
      {
        name: '権限管理',
        locator: adminMenu.getByRole('menuitem', { name: '権限管理' }),
      },
      {
        name: '監査ログ',
        locator: adminMenu.getByRole('menuitem', { name: '監査ログ' }),
      },
    ];
    for (const item of adminItems) {
      await expect(item.locator, `管理メニューの「${item.name}」`).toBeVisible();
    }
    await expectNoDocumentHorizontalOverflow(page, width, '管理メニューを開いた状態');
    await expectReachableWithinViewport(adminMenu, '管理メニューのパネル');
    for (const item of adminItems) {
      await expectReachableWithinViewport(item.locator, `管理メニューの「${item.name}」`);
    }
    await page.keyboard.press('Escape');
    await expect(adminMenu).toBeHidden();
  }
}

/**
 * AppHeader ナビゲーションのE2Eテスト
 *
 * 共通ヘッダーナビゲーション（AppHeader）の機能を検証します。
 * 対象は user-authentication の要件28「画面遷移とナビゲーション」のうち、
 * 共通ヘッダーと管理メニューに関わる受入基準である。
 *
 * ヘッダーでの被覆主張は行わない（Task 115.177）。
 * 従来このヘッダーは REQ-28 および REQ-28.21〜28.25 を機能名なしの記法で列挙していたが、
 * 機能名を欠く記法は被覆検査（scripts/check-requirement-coverage.ts）のいずれのパターンにも合致せず、
 * 本ファイルからの抽出件数は零だった。すなわち「掲げているが数えられていない」状態にあった。
 * 被覆の主張は実際に判定している検証の直上にのみ `@requirement 機能名/REQ-N.M` 形式で置き、
 * 判定していない基準は主張せずその理由をその場に記す。
 */
test.describe('AppHeader ナビゲーション', () => {
  /**
   * テスト開始前にデータベースをクリーンアップし、テストユーザーを再作成
   * 前のテスト（例: profile.spec.tsのパスワード変更テスト）による
   * パスワード変更の影響を防止
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await createAllTestUsers(prisma);
  });

  /**
   * @requirement user-authentication/REQ-28.21: 認証済みユーザーが保護された画面にアクセスしたとき共通ヘッダーナビゲーションを表示する
   * WHEN 認証済みユーザーが保護された画面にアクセスする
   * THEN Frontend UIは共通ヘッダーナビゲーションを表示する
   *
   * 判定根拠: 保護画面 /dashboard で header[role="banner"] と nav[role="navigation"] の
   * 可視を主張しており、共通ヘッダーが表示されなくなれば赤になる。
   */
  test('認証済みユーザーにはヘッダーナビゲーションが表示される', async ({ page }) => {
    await loginAsRegularUser(page);

    // ダッシュボードに移動
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ヘッダーが表示されていることを確認
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeVisible();

    // ナビゲーションが表示されていることを確認
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.22: 共通ヘッダーナビゲーションはダッシュボード・プロフィール・ログアウトを含む
   * WHEN 共通ヘッダーナビゲーションが表示される
   * THEN Frontend UIはダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含む
   *
   * 判定根拠: ダッシュボードリンクと、ユーザーメニュー展開後の user-menu-profile /
   * user-menu-logout の可視をそれぞれ主張しており、いずれかが欠ければ赤になる。
   */
  test('ヘッダーにダッシュボード/プロフィール/ログアウトリンクが表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ダッシュボードリンクが表示されていることを確認
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();

    // ユーザーメニューを開く
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();

    // プロフィールリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-profile')).toBeVisible();

    // ログアウトリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.23（ログイン中のユーザー表示名を表示する）を
   * 掲げていたが、この検証はその規範を判定できない。
   * 実測根拠: ユーザーメニューボタンの中身は
   * frontend/src/components/Navigation/AppHeader.tsx:436-437 で
   * イニシャル用アバター（displayName未設定時は 'U' を返す getInitials）と
   * `{user?.displayName || 'ユーザー'}` の二要素から成る。
   * したがって表示名の取得が壊れてもボタンのテキストは 'Uユーザー' となり空にならず、
   * 下の not.toHaveText('') は緑のままである。「壊れたら赤になるか」を満たさないため主張しない。
   * なお本基準はログインユーザー名を実際に突き合わせる e2e/specs/auth/navigation.spec.ts 側で判定している。
   */
  test('ヘッダーにユーザー表示名が表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューボタンにユーザー名が表示されていることを確認
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await expect(userMenuButton).toBeVisible();
    // ボタンにユーザー名が含まれていることを確認（空でないこと）
    await expect(userMenuButton).not.toHaveText('');
  });

  /**
   * @requirement user-authentication/REQ-28.24: 管理者ユーザーのナビゲーションに「管理メニュー」ドロップダウンを追加表示する
   * WHEN 管理者ユーザーがナビゲーションを表示する
   * THEN Frontend UIは「管理メニュー」ドロップダウンを追加表示する
   *
   * 判定根拠: 管理者でログインした状態で「管理メニュー」ボタンの可視を主張しており、
   * 管理者に追加表示されなくなれば赤になる。
   */
  test('管理者には管理メニューが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていることを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).toBeVisible();
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.24 を掲げていたが、
   * REQ-28.24 の規範は「管理者ユーザーがナビゲーションを表示したとき管理メニューを追加する」であり、
   * 非管理者に表示しないことは規範が述べていない。
   * よって管理メニューが全ユーザーに出るようになってもREQ-28.24自体は破れず、
   * 逆にこの検証が赤になってもREQ-28.24違反を意味しない。規範との対応が成立しないため主張しない。
   * この検証は管理機能の可視性が権限で分岐することを守る回帰検証として残す。
   */
  test('一般ユーザーには管理メニューが表示されない', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていないことを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).not.toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.25: 管理メニュー展開時にユーザー管理・招待管理・ロール管理・権限管理・監査ログへのリンクを表示する
   * WHEN 管理メニューが展開される
   * THEN Frontend UIはユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンクを表示する
   *
   * 判定根拠: 展開後に五つの項目すべての可視を個別に主張しており、
   * いずれか一つでも欠ければ赤になる。
   */
  test('管理メニューにはユーザー管理/招待管理/ロール管理/権限管理/監査ログリンクが表示される', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開く
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await adminMenuButton.click();

    // 各リンクが表示されていることを確認
    await expect(page.getByTestId('admin-menu-users')).toBeVisible();
    await expect(page.getByTestId('admin-menu-invitations')).toBeVisible();
    await expect(page.getByTestId('admin-menu-roles')).toBeVisible();
    await expect(page.getByTestId('admin-menu-permissions')).toBeVisible();
    await expect(page.getByTestId('admin-menu-audit-logs')).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.36: 招待管理リンククリックで招待管理画面へ遷移する
   *
   * 判定根拠: 管理メニューの admin-menu-invitations を実際にクリックし、
   * 遷移後URLが /admin/invitations であることを主張しており、遷移が壊れれば赤になる。
   */
  test('管理メニューから招待管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて招待管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-invitations').click();

    // 招待管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/invitations/);
  });

  /**
   * @requirement user-authentication/REQ-28.37: ユーザー管理リンククリックでユーザー管理画面へ遷移する
   *
   * 判定根拠: admin-menu-users を実際にクリックし、遷移後URLが /admin/users であることを主張している。
   */
  test('管理メニューからユーザー管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてユーザー管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-users').click();

    // ユーザー管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  /**
   * @requirement user-authentication/REQ-28.38: ロール管理リンククリックでロール管理画面へ遷移する
   *
   * 判定根拠: admin-menu-roles を実際にクリックし、遷移後URLが /admin/roles であることを主張している。
   */
  test('管理メニューからロール管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてロール管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-roles').click();

    // ロール管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/roles/);
  });

  /**
   * @requirement user-authentication/REQ-28.39: 権限管理リンククリックで権限管理画面へ遷移する
   *
   * 判定根拠: admin-menu-permissions を実際にクリックし、遷移後URLが /admin/permissions であることを主張している。
   */
  test('管理メニューから権限管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて権限管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-permissions').click();

    // 権限管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/permissions/);
  });

  /**
   * @requirement user-authentication/REQ-28.40: 監査ログリンククリックで監査ログ画面へ遷移する
   *
   * 判定根拠: admin-menu-audit-logs を実際にクリックし、遷移後URLが /admin/audit-logs であることを主張している。
   */
  test('管理メニューから監査ログ画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて監査ログをクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-audit-logs').click();

    // 監査ログ画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
  });

  /**
   * @requirement user-authentication/REQ-28.41: ログアウトボタンクリックでログアウトしログイン画面へ遷移する
   *
   * 判定根拠: ユーザーメニューの user-menu-logout を実際にクリックし、
   * 遷移後URLが /login であることを主張している。ログイン画面へ戻らなくなれば赤になる。
   */
  test('ユーザーメニューからログアウトできる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてログアウトをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-logout').click();

    // ログイン画面に遷移することを確認
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.27 を掲げていたが、
   * REQ-28.27 の契機は「ダッシュボードのプロフィールリンクがクリックされる」であり、
   * 見出し「ダッシュボードからの遷移」の下でREQ-28.26のクイックアクセスリンクと対を成す。
   * 一方この検証が押すのは共通ヘッダーのユーザーメニュー項目 user-menu-profile であり、
   * ダッシュボード本体のクイックアクセスリンク quick-link-profile を一度も通らない。
   * quick-link-profile の遷移が壊れてもこの検証は緑のままであるため主張しない。
   * 本基準はダッシュボードのリンクを押す e2e/specs/auth/navigation.spec.ts 側で判定している。
   * なおヘッダーのユーザーメニューにプロフィール項目が含まれること自体はREQ-28.22で判定済みである。
   */
  test('ユーザーメニューからプロフィール画面に遷移できる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてプロフィールをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-profile').click();

    // プロフィール画面に遷移することを確認
    await expect(page).toHaveURL(/\/profile/);
  });

  /**
   * @requirement user-authentication/REQ-28.26: ダッシュボード画面に主要機能へのクイックアクセスリンクを提供する
   *
   * 判定根拠: ダッシュボード上で quick-link-profile / quick-link-sessions / quick-link-2fa と
   * 管理者向けリンクの可視を個別に主張しており、クイックアクセスが失われれば赤になる。
   */
  test('ダッシュボード画面にクイックアクセスリンクが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // クイックアクセスリンクが表示されていることを確認
    await expect(page.getByTestId('quick-link-profile')).toBeVisible();
    await expect(page.getByTestId('quick-link-sessions')).toBeVisible();
    await expect(page.getByTestId('quick-link-2fa')).toBeVisible();

    // 管理者には管理機能リンクも表示される
    await expect(page.getByTestId('quick-link-admin-users')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-invitations')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-audit')).toBeVisible();
  });

  /**
   * 共通ヘッダーのモバイル幅の表示（Task 39.1）
   *
   * 経緯: 是正前は、ヘッダーに並ぶ項目（ロゴ・四つのリンク・管理メニュー・ユーザーメニュー）の
   * 幅の合計が画面幅を超え、文書全体が水平にスクロールしていた（test 環境の実ブラウザで実測。
   * 管理者は 320 幅で documentElement の scrollWidth 400 / clientWidth 320、375 幅で 400 / 375、
   * 一般ユーザーは 320 幅で 350 / 320）。右へはみ出していたのはユーザーメニューである。
   *
   * ヘッダーのリンクと管理メニューのボタンは、名前でなく href と構造で指す。
   * 本検証の導入時（Task 39.1）は、モバイル幅（768px 以下）でリンクと管理メニューの文言が
   * display: none になり、アクセシブルネームを持たなかった（375 幅の実測で
   * getByRole('link', { name: 'ダッシュボード' }) と getByRole('button', { name: '管理メニュー' }) は
   * ともに 0 件）ためである。名前の欠落は Task 40.2 で是正し、下の「アイコンのみの表示の
   * アクセシブルネーム」が判定する。
   * 開いたメニューの項目は文言が表示されるので名前で指す。
   */
  test.describe('モバイル幅の表示', () => {
    /**
     * 表示名を書き換えたテストの後に、テストユーザーの表示名を既定へ戻す
     * 後続のテスト（表示名を突き合わせる検証）への影響を防ぐため、無条件に戻す
     */
    test.afterEach(async () => {
      const prisma = getPrismaClient();
      for (const role of MOBILE_HEADER_ROLES) {
        const user = TEST_USERS[role.userKey];
        await prisma.user.update({
          where: { email: user.email },
          data: { displayName: user.displayName },
        });
      }
    });

    for (const role of MOBILE_HEADER_ROLES) {
      for (const nameCase of MOBILE_DISPLAY_NAME_CASES) {
        for (const width of MOBILE_WIDTHS) {
          /**
           * @requirement user-authentication/REQ-15.1: 全ての画面はレスポンシブデザイン（モバイル: 320px-767px）を実装する
           * @requirement user-authentication/REQ-28.21: 認証済みユーザーが保護された画面にアクセスしたとき共通ヘッダーナビゲーションを表示する
           * @requirement user-authentication/REQ-28.22: 共通ヘッダーナビゲーションはダッシュボード・プロフィール・ログアウトを含む
           *
           * 判定根拠:
           * - REQ-15.1: モバイル幅で、文書全体（documentElement）の scrollWidth と clientWidth の差が
           *   許容誤差 1px 以内であることを、メニューを開いた状態と閉じた状態の双方で主張している。
           *   共通ヘッダーは保護された全画面に出るため、ヘッダーがはみ出せば全画面が水平にスクロールする。
           *   是正前は赤になる（上の経緯の実測値）。本検証が測るのは /dashboard と /profile の文書全体であり、
           *   他の画面の本文のはみ出しは各機能の検証が判定する。
           * - REQ-28.21: 保護画面（/dashboard・/profile）で header[role="banner"] の可視をモバイル幅で主張している。
           * - REQ-28.22: ダッシュボードへのリンクと、ユーザーメニュー展開後の「プロフィール」「ログアウト」が
           *   可視で、画面幅の内側にあり、中心を指して届くことをモバイル幅で主張している。
           *   項目が画面の外へ押し出されるか他の要素に隠れれば赤になる。
           */
          test(`モバイル幅 ${width}px・${role.label}・${nameCase.label}: 共通ヘッダーが文書全体を水平にはみ出させず、リンクとメニューの項目が画面幅の内側にある`, async ({
            page,
          }) => {
            const testUser = TEST_USERS[role.userKey];
            const displayName = nameCase.displayName ?? testUser.displayName;
            if (nameCase.displayName !== null) {
              await getPrismaClient().user.update({
                where: { email: testUser.email },
                data: { displayName: nameCase.displayName },
              });
            }

            await loginAsUser(page, role.userKey);
            await page.setViewportSize({ width, height: 812 });
            await page.goto(nameCase.path);
            await expect(page).toHaveURL(new RegExp(`${nameCase.path}$`));

            // 前提: 共通ヘッダーが表示されている
            const header = page.locator('header[role="banner"]');
            await expect(header).toBeVisible();
            const nav = header.locator('nav[role="navigation"]');
            await expect(nav).toBeVisible();

            // 前提: 測る対象の表示名がヘッダーへ届いている（モバイル幅では非表示だが DOM に在る）
            await expect(header.locator('.app-header-user-name')).toHaveText(displayName);

            await expectHeaderItemsReachable(page, header, nav, width, role);
          });
        }
      }
    }
  });

  /**
   * 共通ヘッダーのタブレット幅の表示（Task 40.1）
   *
   * 経緯: 是正前は、769〜1147px（test 環境の実測）で管理者のリンクの文言が縦に折り返し、
   * ナビゲーションがヘッダー（64px）の下へ伸びていた（769 幅でリンクの高さ最大 177.5px、
   * 管理メニューのボタン 144px）。あわせて管理者の長い表示名では 769〜約 800px で文書全体が
   * 水平にはみ出していた（/profile の 789 幅で +14px）。一般ユーザーも 960px 以下で折り返していた。
   *
   * 是正は利用者の判断（2026-10-05）による。モバイル幅と同じアイコンのみのリンクを
   * 1199px 以下まで広げ、ユーザー名は省略表示にする（1200px 以上は是正前のデスクトップの表示）。
   */
  test.describe('タブレット幅の表示', () => {
    /**
     * 表示名を書き換えたテストの後に、テストユーザーの表示名を既定へ戻す
     * 後続のテスト（表示名を突き合わせる検証）への影響を防ぐため、無条件に戻す
     */
    test.afterEach(async () => {
      const prisma = getPrismaClient();
      for (const role of MOBILE_HEADER_ROLES) {
        const user = TEST_USERS[role.userKey];
        await prisma.user.update({
          where: { email: user.email },
          data: { displayName: user.displayName },
        });
      }
    });

    for (const role of MOBILE_HEADER_ROLES) {
      for (const nameCase of TABLET_DISPLAY_NAME_CASES) {
        for (const width of TABLET_WIDTHS) {
          /**
           * @requirement user-authentication/REQ-15.1: 全ての画面はレスポンシブデザイン（タブレット: 768px-1023px）を実装する
           * @requirement user-authentication/REQ-28.21: 認証済みユーザーが保護された画面にアクセスしたとき共通ヘッダーナビゲーションを表示する
           * @requirement user-authentication/REQ-28.22: 共通ヘッダーナビゲーションはダッシュボード・プロフィール・ログアウトを含む
           *
           * 判定根拠:
           * - REQ-15.1: タブレット幅とその上の幅で、ヘッダーの高さが同じ画面のデスクトップ幅（1280）の
           *   高さを超えず、リンク・ナビゲーション・メニューのボタンがヘッダーの上端と下端の内側に収まる
           *   こと（文言が縦に折り返さない）と、文書全体の水平のはみ出しが許容誤差 1px 以内であることを、
           *   メニューを開いた状態と閉じた状態の双方で主張している。是正前は赤になる（上の経緯の実測値）。
           * - REQ-28.21: 保護画面（/dashboard・/profile）で header[role="banner"] の可視を主張している。
           * - REQ-28.22: ダッシュボードへのリンクと、ユーザーメニュー展開後の「プロフィール」「ログアウト」が
           *   可視で、画面幅の内側にあり、中心を指して届くことを主張している。
           */
          test(`タブレット幅 ${width}px・${role.label}・${nameCase.label}: 共通ヘッダーが一行に収まり、文書全体を水平にはみ出させず、リンクとメニューの項目が画面幅の内側にある`, async ({
            page,
          }) => {
            const testUser = TEST_USERS[role.userKey];
            const displayName = nameCase.displayName ?? testUser.displayName;
            if (nameCase.displayName !== null) {
              await getPrismaClient().user.update({
                where: { email: testUser.email },
                data: { displayName: nameCase.displayName },
              });
            }

            await loginAsUser(page, role.userKey);
            await page.goto(nameCase.path);
            await expect(page).toHaveURL(new RegExp(`${nameCase.path}$`));

            // 前提: 共通ヘッダーが表示されている
            const header = page.locator('header[role="banner"]');
            await expect(header).toBeVisible();
            const nav = header.locator('nav[role="navigation"]');
            await expect(nav).toBeVisible();

            // 基準: 同じ画面のデスクトップ幅で、一行のヘッダーの寸法を測る
            await page.setViewportSize({ width: DESKTOP_REFERENCE_WIDTH, height: 812 });
            await expectNoDocumentHorizontalOverflow(
              page,
              DESKTOP_REFERENCE_WIDTH,
              'デスクトップ幅'
            );
            const desktopRow = await measureHeaderRow(header);
            expect(desktopRow.headerHeight, 'デスクトップ幅のヘッダーの高さ').toBeGreaterThan(0);

            await page.setViewportSize({ width, height: 812 });

            // 前提: 測る対象の表示名がヘッダーへ届き、表示されている（省略表示でも要素は可視）
            const userName = header.locator('.app-header-user-name');
            await expect(userName).toHaveText(displayName);
            await expect(userName).toBeVisible();

            // ヘッダーが一行に収まっている
            await expectHeaderSingleRow(header, desktopRow, `画面幅 ${width}`);

            // 文書全体が水平にはみ出さず、リンクと二つのメニューの項目が画面幅の内側にあって届く
            await expectHeaderItemsReachable(page, header, nav, width, role);

            // メニューを閉じた後もヘッダーが一行に収まっている
            await expectHeaderSingleRow(header, desktopRow, `画面幅 ${width}・メニューを閉じた後`);
          });
        }
      }
    }
  });

  /**
   * 共通ヘッダーのアイコンのみの表示のアクセシブルネーム（Task 40.2）
   *
   * 経緯: 是正前は、アイコンのみの表示（1199px 以下）でリンクと管理メニューのボタンの文言が
   * display: none になり、アイコンの SVG は aria-hidden のため、アクセシブルネームを持たなかった
   * （375 幅と 1024 幅の実測で getByRole('link', { name: 'ダッシュボード' }) と
   * getByRole('button', { name: '管理メニュー' }) はともに 0 件、1280 幅では各 1 件）。
   * 768px 以下ではロゴの文字とユーザー名も display: none で、ロゴのリンクは名前を持たず、
   * ユーザーメニューのボタンの名前はイニシャルだけになっていた。
   */
  test.describe('アイコンのみの表示のアクセシブルネーム', () => {
    for (const role of MOBILE_HEADER_ROLES) {
      for (const width of ACCESSIBLE_NAME_WIDTHS) {
        /**
         * @requirement user-authentication/REQ-15.4: ページ読み込み時に適切な aria-label・aria-describedby・role 属性を提供する
         *
         * 判定根拠: 共通ヘッダーのロゴ・四つのリンク・管理メニューのボタン・ユーザーメニューのボタンを、
         * デスクトップ幅で見えている文言と同じ名前の getByRole でヘッダーの中から 1 件ずつ指せることを、
         * アイコンのみの表示の各幅と対照のデスクトップ幅で主張している。名前で指したリンクの行き先も主張する。
         * 前提として、各幅で文言が実際に見た目の上で隠れている（アイコンのみである）か出ているかを
         * 幅から決まる期待値で主張しており、文言を出したまま名前を得る形で緑になることは無い。
         * 是正前は 1199px 以下で赤になる（上の経緯の実測値）。
         */
        test(`画面幅 ${width}px・${role.label}: 共通ヘッダーのリンクとメニューのボタンが文言と同じアクセシブルネームを持つ`, async ({
          page,
        }) => {
          const testUser = TEST_USERS[role.userKey];
          await loginAsUser(page, role.userKey);
          await page.setViewportSize({ width, height: 812 });
          await page.goto('/dashboard');
          await expect(page).toHaveURL(/\/dashboard$/);

          // 前提: 共通ヘッダーが表示され、画面幅の設定が効いている
          const header = page.locator('header[role="banner"]');
          await expect(header).toBeVisible();
          const nav = header.locator('nav[role="navigation"]');
          await expect(nav).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(width);

          // 前提: 各リンクの文言が、幅から決まる通りに隠れている（アイコンのみ）か出ている
          for (const link of HEADER_LINKS) {
            const structural =
              link.name === 'ArchiTrack'
                ? header.locator('a.app-header-logo')
                : nav.locator(`a.app-header-nav-link[href="${link.href}"]`);
            await expect(structural, `${link.name}のリンク`).toBeVisible();
            const text = structural.locator(link.textSelector);
            await expect(text, `${link.name}のリンクの文言`).toHaveText(link.name);
            expect(
              await isVisuallyHidden(text),
              `画面幅 ${width} で${link.name}の文言が隠れているか`
            ).toBe(width <= link.hideMaxWidth);
          }

          // 各リンクを、見えている文言と同じ名前でヘッダーの中から 1 件ずつ指せて、行き先が正しい
          for (const link of HEADER_LINKS) {
            const byName = header.getByRole('link', { name: link.name, exact: true });
            await expect(byName, `名前「${link.name}」のリンク`).toHaveCount(1);
            await expect(byName).toHaveAttribute('href', link.href);
          }

          // 管理メニュー: ロールで主張を分岐させず、ユーザーメニューより前に並ぶトリガー（管理メニューの
          // ボタン）を構造で集め、件数をロールごとの期待値（管理者 1・一般ユーザー 0）で主張してから、
          // 名前で指せる件数を同じ期待値で主張し、集めたボタンのそれぞれの文言の見え方と名前を主張する
          const menuTriggers = nav.locator('button[aria-haspopup="menu"]');
          await expect(menuTriggers).toHaveCount(role.isAdmin ? 2 : 1);
          const adminMenuButtons = (await menuTriggers.all()).slice(0, -1);
          expect(adminMenuButtons, `${role.label}の管理メニューのボタンの数`).toHaveLength(
            role.isAdmin ? 1 : 0
          );
          await expect(
            header.getByRole('button', { name: '管理メニュー', exact: true }),
            '名前「管理メニュー」のボタン'
          ).toHaveCount(role.isAdmin ? 1 : 0);
          for (const adminMenuButton of adminMenuButtons) {
            const text = adminMenuButton.locator('span');
            await expect(text).toHaveText('管理メニュー');
            expect(
              await isVisuallyHidden(text),
              `画面幅 ${width} で管理メニューの文言が隠れているか`
            ).toBe(width <= ICON_ONLY_MAX_WIDTH);
            await expect(adminMenuButton).toHaveAccessibleName('管理メニュー');
          }

          // ユーザーメニュー: 768px 以下で表示名が隠れても、ボタンの名前に表示名が残る
          const userMenuButton = menuTriggers.last();
          const userName = userMenuButton.locator('.app-header-user-name');
          await expect(userName).toHaveText(testUser.displayName);
          expect(
            await isVisuallyHidden(userName),
            `画面幅 ${width} でユーザー名が隠れているか`
          ).toBe(width <= HEADER_MOBILE_MAX_WIDTH);
          await expect(
            header.getByRole('button', { name: testUser.displayName }),
            `名前に表示名「${testUser.displayName}」を含むボタン`
          ).toHaveCount(1);
        });
      }
    }
  });

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after app-header tests...');
    await cleanDatabaseAndRestoreTestData();
    console.log('  ✓ Test data restored successfully');
  });
});
