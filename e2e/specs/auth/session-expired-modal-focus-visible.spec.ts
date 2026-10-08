/**
 * @fileoverview セッション切れのモーダルのフォーカス表示のE2Eテスト
 *
 * Task 42.1: セッション切れのモーダルの各ボタンと入力欄のフォーカスの輪を 3:1 以上にする。
 *
 * モーダルの中を Tab だけで一巡し（モーダルはフォーカストラップで巡回する）、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 状態によって出る要素を測るため、3 回連続の失敗（「ログイン画面へ移動」）、ネットワークエラー
 * （「リトライ」）、2FA の要求（「認証コード」）の各状態を作ってから巡る。
 * 判定の作法は e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts に倣う。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (user-authentication):
 * 要件30 の受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 42.1 は、要件30 のモーダルの上で steering（tech.md の「フォーカス表示方針」）の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

// ============================================================================
// フォーカス表示の判定（trading-partner-focus-visible.spec.ts と同じ基準）
//
// 「明確」の基準は WCAG の非テキストのコントラスト（1.4.11）とフォーカスの見え方
// （2.4.11 / 2.4.13 の 2 CSS px・3:1）に倣い、次のいずれかを満たすこととする。
//   - outline: 線種が none / hidden / auto 以外、幅 2px 以上、隣接する背景との
//     コントラスト比 3:1 以上。auto はブラウザ任せで太さも色も定まらないため数えない
//   - box-shadow: ぼかし 0・ずれ 0・広がり 2px 以上の輪で、背景とのコントラスト比 3:1 以上
// ============================================================================

/** フォーカスの表示を判定する閾値 */
const FOCUS_INDICATOR_MIN_WIDTH_PX = 2;
const FOCUS_INDICATOR_MIN_CONTRAST = 3;
/** モーダルの中で Tab を押す上限（無限に巡回しないための打ち切り） */
const MODAL_WALK_MAX_STEPS = 10;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FocusSnapshot {
  descriptor: string;
  /** セッション切れのモーダル（dialog）の中の要素か */
  inDialog: boolean;
  /** 要素を文書の中で一意に指す経路（一巡の終わりの判定に使う） */
  path: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  outlineColor: string;
  boxShadow: string;
  /** 要素自身から html までの背景色（内側から外側の順） */
  backgroundChain: string[];
}

interface FocusVisit {
  focused: FocusSnapshot;
  blurred: FocusSnapshot;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearToSrgb(value: number): number {
  const v = clamp01(value);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  return token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token);
}

/** 計算済みスタイルの色を sRGB（0〜1）へ直す。解釈できない書式は null */
function parseCssColor(input: string): Rgba | null {
  const text = input.trim();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const fn = /^([a-z]+)\((.*)\)$/i.exec(text);
  if (!fn) return null;
  const name = (fn[1] ?? '').toLowerCase();
  const [main, alphaPart] = (fn[2] ?? '').split('/').map((part) => part.trim());
  const parts = (main ?? '').split(/[\s,]+/).filter((part) => part.length > 0);
  if (name === 'rgb' || name === 'rgba') {
    return {
      r: parseFloat(parts[0] ?? 'NaN') / 255,
      g: parseFloat(parts[1] ?? 'NaN') / 255,
      b: parseFloat(parts[2] ?? 'NaN') / 255,
      a: parseAlpha(alphaPart ?? parts[3]),
    };
  }
  if (name === 'oklch') {
    const lightnessToken = parts[0] ?? 'NaN';
    const l = lightnessToken.endsWith('%')
      ? parseFloat(lightnessToken) / 100
      : parseFloat(lightnessToken);
    const c = parseFloat(parts[1] ?? 'NaN');
    const h = ((parseFloat(parts[2] ?? '0') || 0) * Math.PI) / 180;
    const okA = c * Math.cos(h);
    const okB = c * Math.sin(h);
    const l3 = Math.pow(l + 0.3963377774 * okA + 0.2158037573 * okB, 3);
    const m3 = Math.pow(l - 0.1055613458 * okA - 0.0638541728 * okB, 3);
    const s3 = Math.pow(l - 0.0894841775 * okA - 1.291485548 * okB, 3);
    return {
      r: linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
      g: linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
      b: linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
      a: parseAlpha(alphaPart),
    };
  }
  if (name === 'color' && parts[0] === 'srgb') {
    return {
      r: parseFloat(parts[1] ?? 'NaN'),
      g: parseFloat(parts[2] ?? 'NaN'),
      b: parseFloat(parts[3] ?? 'NaN'),
      a: parseAlpha(alphaPart),
    };
  }
  return null;
}

function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 背景色の連なり（内側→外側）を、白いキャンバスの上へ外側から重ねた実効の背景色 */
function effectiveBackground(chain: string[]): Rgba {
  let result: Rgba = { r: 1, g: 1, b: 1, a: 1 };
  for (const layer of [...chain].reverse()) {
    const parsed = parseCssColor(layer);
    if (parsed && parsed.a > 0) result = compositeOver(parsed, result);
  }
  return result;
}

/** box-shadow の一覧を最上位のカンマで区切る */
function splitShadowList(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) result.push(current.trim());
  return result;
}

interface ParsedShadow {
  color: Rgba;
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

/** 計算済みの box-shadow を一つずつ解釈する（none や色を解釈できないものは結果に含めない） */
function parseShadowList(value: string): ParsedShadow[] {
  return splitShadowList(value === 'none' ? '' : value).flatMap((shadow): ParsedShadow[] => {
    const colorMatch = /(rgba?|oklch|color)\([^)]*\)|transparent/i.exec(shadow);
    const color = colorMatch ? parseCssColor(colorMatch[0]) : null;
    const rest = colorMatch ? shadow.replace(colorMatch[0], ' ') : shadow;
    const lengths = (rest.match(/-?[\d.]+px|\b0\b/g) ?? []).map((token) => parseFloat(token));
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths;
    return color ? [{ color, inset: /\binset\b/.test(rest), offsetX, offsetY, blur, spread }] : [];
  });
}

/** ぼかし 0・ずれ 0・広がり 2px 以上の、透明でない輪か */
function isSolidRing(shadow: ParsedShadow): boolean {
  return (
    shadow.color.a > 0 &&
    shadow.offsetX === 0 &&
    shadow.offsetY === 0 &&
    shadow.blur === 0 &&
    shadow.spread >= FOCUS_INDICATOR_MIN_WIDTH_PX
  );
}

/** 明確なフォーカス表示を一つでも持てばその説明を、無ければ null を返す */
function findClearFocusIndicator(snapshot: FocusSnapshot): string | null {
  const outsideBackground = effectiveBackground(snapshot.backgroundChain.slice(1));
  const insideBackground = effectiveBackground(snapshot.backgroundChain);

  const outlineWidth = parseFloat(snapshot.outlineWidth);
  const outlineColor = parseCssColor(snapshot.outlineColor);
  if (
    !['none', 'hidden', 'auto'].includes(snapshot.outlineStyle) &&
    outlineWidth >= FOCUS_INDICATOR_MIN_WIDTH_PX &&
    outlineColor
  ) {
    const background =
      parseFloat(snapshot.outlineOffset) < 0 ? insideBackground : outsideBackground;
    const ratio = contrastRatio(compositeOver(outlineColor, background), background);
    if (ratio >= FOCUS_INDICATOR_MIN_CONTRAST) {
      return `outline ${snapshot.outlineStyle} ${snapshot.outlineWidth} (contrast ${ratio.toFixed(2)})`;
    }
  }

  const ring = parseShadowList(snapshot.boxShadow)
    .filter(isSolidRing)
    .map((shadow) => {
      const background = shadow.inset ? insideBackground : outsideBackground;
      return {
        shadow,
        ratio: contrastRatio(compositeOver(shadow.color, background), background),
      };
    })
    .find((candidate) => candidate.ratio >= FOCUS_INDICATOR_MIN_CONTRAST);
  return ring
    ? `box-shadow ${ring.shadow.inset ? 'inset ' : ''}${ring.shadow.spread}px (contrast ${ring.ratio.toFixed(2)})`
    : null;
}

async function snapshotFocusStyle(handle: ElementHandle<Element>): Promise<FocusSnapshot> {
  // transition の途中を読まないよう、要素の遷移が終わるのを待ってから読む
  await handle.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
  return handle.evaluate((el): FocusSnapshot => {
    const view = el.ownerDocument.defaultView!;
    const style = view.getComputedStyle(el);
    const backgroundChain: string[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      backgroundChain.push(view.getComputedStyle(node).backgroundColor);
    }
    // 名前は aria-label、無ければ文言、入力欄は結び付いた label の文言で名乗る
    const associatedLabel =
      el instanceof HTMLInputElement
        ? (el.labels?.[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()
        : '';
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const label = el.getAttribute('aria-label') ?? (text || associatedLabel);
    const pathSegments: string[] = [];
    for (let node: Element | null = el; node?.parentElement; node = node.parentElement) {
      pathSegments.unshift(String(Array.prototype.indexOf.call(node.parentElement.children, node)));
    }
    return {
      descriptor: `${el.tagName.toLowerCase()} "${label}"`,
      inDialog: el.closest('[role="dialog"]') !== null,
      path: pathSegments.join('>'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      backgroundChain,
    };
  });
}

async function activeElementHandle(page: Page): Promise<ElementHandle<Element>> {
  const handle = (
    await page.evaluateHandle(() => document.activeElement ?? document.body)
  ).asElement();
  expect(handle, 'フォーカスを持つ要素を取得できる').not.toBeNull();
  return handle as ElementHandle<Element>;
}

/**
 * 先頭の入力欄から Tab キーだけでモーダルの中を一巡し（フォーカストラップで先頭へ戻ったら止める）、
 * 各要素のフォーカス中と、Tab で離れた直後の計算済みスタイルを組にして返す
 */
async function walkModal(page: Page, firstFieldLabel: string): Promise<FocusVisit[]> {
  const firstField = page.getByRole('dialog').getByLabel(firstFieldLabel, { exact: true });
  await firstField.focus();
  await expect(firstField).toBeFocused();

  const visits: FocusVisit[] = [];
  let current = await activeElementHandle(page);
  let focused = await snapshotFocusStyle(current);
  const start = focused.path;
  for (let step = 0; step < MODAL_WALK_MAX_STEPS; step += 1) {
    await page.keyboard.press('Tab');
    const next = await activeElementHandle(page);
    visits.push({ focused, blurred: await snapshotFocusStyle(current) });
    current = next;
    focused = await snapshotFocusStyle(next);
    expect(focused.inDialog, `Tab でモーダルの外へ出た: ${focused.descriptor}`).toBe(true);
    if (focused.path === start) break;
  }
  expect(focused.path, `Tab を ${MODAL_WALK_MAX_STEPS} 回押しても先頭の入力欄へ戻らない`).toBe(
    start
  );
  return visits;
}

/** 巡った要素ごとに、フォーカス中・離れた直後の表示を判定の結果へまとめる */
function summarizeVisits(
  visits: FocusVisit[]
): { descriptor: string; indicator: string; indicatorAfterBlur: string }[] {
  return visits.map((visit) => ({
    descriptor: visit.focused.descriptor,
    indicator:
      findClearFocusIndicator(visit.focused) ??
      `なし (outline=${visit.focused.outlineStyle} ${visit.focused.outlineWidth} ` +
        `${visit.focused.outlineColor}, box-shadow=${visit.focused.boxShadow})`,
    indicatorAfterBlur: findClearFocusIndicator(visit.blurred) ?? 'なし',
  }));
}

/** 巡った要素の全てが、フォーカス中に明確な表示を持ち、離れると消えることの期待値 */
function expectedSummary(
  descriptors: string[]
): { descriptor: string; indicator: unknown; indicatorAfterBlur: string }[] {
  return descriptors.map((descriptor) => ({
    descriptor,
    // 太さ 2px 以上・コントラスト比 3:1 以上の表示（判定は findClearFocusIndicator が行う）
    indicator: expect.stringMatching(/^(outline|box-shadow) .*\(contrast \d+\.\d+\)$/),
    // フォーカスが離れると表示が消える
    indicatorAfterBlur: 'なし',
  }));
}

/** ログイン→プロフィール画面→認証の確立 */
async function setupAuthenticatedProfilePage(page: Page): Promise<void> {
  await loginAsUser(page, 'REGULAR_USER');
  await page.goto('/profile');
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
  await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
  await page.waitForFunction(
    () =>
      localStorage.getItem('refreshToken') !== null && localStorage.getItem('accessToken') !== null,
    { timeout: getTimeout(15000), polling: 500 }
  );
}

/**
 * セッション切れのモーダルを出す（session-expired-modal.spec.ts と同じ手順）。
 * リフレッシュを 401 で失敗させ、apiClient 経由の要求を 401 にして正規のコールバックの経路を通す。
 */
async function triggerSessionExpiredModal(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Refresh token expired', code: 'INVALID_REFRESH_TOKEN' }),
    });
  });
  let meRequestCount = 0;
  await page.route('**/api/v1/auth/me', async (route) => {
    meRequestCount++;
    if (meRequestCount === 1) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Token expired', code: 'INVALID_ACCESS_TOKEN' }),
      });
    } else {
      await route.continue();
    }
  });

  const hasApiClient = await page.evaluate(async () => {
    const apiClient = (window as unknown as Record<string, unknown>).__apiClient as
      { get: (path: string) => Promise<unknown> } | undefined;
    if (!apiClient) return false;
    try {
      await apiClient.get('/api/v1/auth/me');
    } catch {
      // エラーは想定内（セッション切れのコールバックが呼ばれる）
    }
    return true;
  });
  expect(hasApiClient, 'window.__apiClient が公開されている').toBe(true);

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(15000) });
}

/** モーダルのパスワード欄へ入力して再ログインを押す（結果の待ちは呼び出し側が状態ごとに行う） */
async function submitPassword(page: Page, password: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  const passwordInput = dialog.getByLabel('パスワード', { exact: true });
  await passwordInput.clear();
  await passwordInput.fill(password);
  await dialog.getByRole('button', { name: '再ログイン' }).click();
}

test.describe('セッション切れのモーダルのフォーカス表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await setupAuthenticatedProfilePage(page);
    await triggerSessionExpiredModal(page);
  });

  test('3回連続の失敗後のモーダルの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }),
      });
    });
    const dialog = page.getByRole('dialog');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await submitPassword(page, `wrong-password-${attempt}`);
      await expect(dialog.getByRole('alert')).toHaveText(
        'メールアドレスまたはパスワードが正しくありません',
        { timeout: getTimeout(5000) }
      );
      await expect(dialog.getByRole('button', { name: '再ログイン' })).toBeEnabled();
    }
    await expect(dialog.getByRole('button', { name: 'ログイン画面へ移動' })).toBeVisible({
      timeout: getTimeout(5000),
    });

    const visits = await walkModal(page, 'パスワード');

    expect(summarizeVisits(visits)).toEqual(
      expectedSummary(['input "パスワード"', 'button "再ログイン"', 'button "ログイン画面へ移動"'])
    );
  });

  test('ネットワークエラー時のモーダルの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.abort('connectionfailed');
    });
    const dialog = page.getByRole('dialog');
    await submitPassword(page, 'Password123!');
    await expect(dialog.getByText('ネットワーク接続を確認してください')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(dialog.getByRole('button', { name: 'リトライ' })).toBeVisible();

    const visits = await walkModal(page, 'パスワード');

    expect(summarizeVisits(visits)).toEqual(
      expectedSummary(['input "パスワード"', 'button "再ログイン"', 'button "リトライ"'])
    );
  });

  test('2FAの要求後のモーダルの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ requires2FA: true }),
      });
    });
    const dialog = page.getByRole('dialog');
    await submitPassword(page, 'Password123!');
    await expect(dialog.getByLabel('認証コード', { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });

    const visits = await walkModal(page, '認証コード');

    expect(summarizeVisits(visits)).toEqual(
      expectedSummary(['input "認証コード"', 'button "再ログイン"'])
    );
  });
});
