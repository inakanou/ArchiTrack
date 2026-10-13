/**
 * @fileoverview ログイン・2FA の確認・ユーザー登録・パスワードリセット・2FA の設定の画面のフォーカス表示のE2Eテスト
 *
 * Task 43.1: 本スペックの部品・ページのインラインの outline の打ち消しを外し、
 * フォーカス表示を steering（tech.md の「フォーカス表示方針」）の下限へ揃える。
 *
 * 対象の部品（RegisterForm・PasswordResetForm・TwoFactorSetupForm・TwoFactorVerificationForm）を
 * 描く画面を、状態ごとに Tab だけで巡り、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - ログイン画面（LoginForm）と、2FA の確認の画面（認証コードの入力済み・認証コードの誤りの
 *     エラーの表示後・バックアップコードの入力方式）
 *   - ユーザー登録の画面（招待が有効・入力のエラーの表示後・招待が無効・招待トークンなし）
 *   - パスワードリセットの要求の画面（初期・メールアドレスのエラーの表示後・送信の成功後）と、
 *     再設定の画面（パスワードの入力済み・不一致のエラーの表示後・リセットリンクが無効）
 *   - 2FA の設定の画面（QR コードの段階の初期（共通ヘッダーを含む）・認証コードの入力済み・
 *     バックアップコードの段階）
 * 状態はキーボードの操作だけで作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。一巡が対象の部品を実際に通ったことも
 * 併せて主張し、「一つも巡らずに違反 0 件」で緑になる形を塞ぐ。
 * 招待・リセットリンクの検証、ログインの 2FA の要求、2FA の設定と有効化の応答は page.route で与え、
 * 共有のテストユーザーの 2FA の状態やロックの回数を変えない。
 * 判定の作法は e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts に倣う。
 * ただし共通ヘッダーは背景をグラデーション（背景画像）で塗り、背景色が透明であるため、
 * 背景画像のグラデーションの色（止まりと止まりの間の標本）も背景の候補に入れ、比はその最小で測る。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (user-authentication):
 * 対象の部品の受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 43.1 は、要件 2・7・27・27A の画面の上で steering の方針の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

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
/** ログインしていない画面の文書で Tab を押す上限（一巡して余る回数） */
const PUBLIC_WALK_MAX_STEPS = 30;
/** ログイン後の画面の文書で Tab を押す上限（ヘッダーを含めて一巡して余る回数） */
const PROTECTED_WALK_MAX_STEPS = 80;
/** 文書の中のすべての要素（body 自身は含まない。文書の外へ出たら一巡の終わりとする） */
const DOCUMENT_SCOPE = 'body *';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FocusSnapshot {
  descriptor: string;
  /** 巡る範囲（呼び出し側が CSS セレクタで指す）の中の要素か */
  inScope: boolean;
  /** 要素を文書の中で一意に指す経路（一巡の終わりの判定に使う） */
  path: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  outlineColor: string;
  boxShadow: string;
  /** 要素自身から html までの背景色（内側から外側の順） */
  backgroundChain: string[];
  /** 要素自身から html までの背景画像（内側から外側の順。backgroundChain と同じ並び） */
  backgroundImageChain: string[];
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

/** グラデーションの色の止まりの間を等分して取る点の数（止まりの間の色も比の最小に含めるため） */
const GRADIENT_SAMPLES_PER_SEGMENT = 10;

/**
 * 背景画像がグラデーションなら、その色の止まりと止まりの間の色の標本を返す（それ以外は空）。
 * 共通ヘッダーのように背景をグラデーションで塗る面では、背景色が透明で、
 * 背景色だけを重ねると下の白へ落ちて比を誤るため、グラデーションの色も背景の候補に入れる。
 */
function gradientSamples(image: string): Rgba[] {
  if (!image.includes('gradient(')) return [];
  const stops = (image.match(/(rgba?|oklch|color)\([^)]*\)|transparent/gi) ?? [])
    .map((token) => parseCssColor(token))
    .filter((color): color is Rgba => color !== null);
  if (stops.length < 2) return [];
  const samples: Rgba[] = [];
  for (let i = 0; i + 1 < stops.length; i += 1) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    for (let step = 0; step <= GRADIENT_SAMPLES_PER_SEGMENT; step += 1) {
      const t = step / GRADIENT_SAMPLES_PER_SEGMENT;
      samples.push({
        r: from.r + (to.r - from.r) * t,
        g: from.g + (to.g - from.g) * t,
        b: from.b + (to.b - from.b) * t,
        a: from.a + (to.a - from.a) * t,
      });
    }
  }
  return samples;
}

/**
 * 背景の連なり（内側→外側）を、白いキャンバスの上へ外側から重ねた実効の背景色の候補。
 * 各層は背景色の上に背景画像を重ねる。グラデーションの層は、その標本の色ごとに候補を分ける
 */
function effectiveBackgrounds(colors: string[], images: string[]): Rgba[] {
  let results: Rgba[] = [{ r: 1, g: 1, b: 1, a: 1 }];
  for (let index = colors.length - 1; index >= 0; index -= 1) {
    const parsed = parseCssColor(colors[index] ?? '');
    if (parsed && parsed.a > 0) results = results.map((bg) => compositeOver(parsed, bg));
    const samples = gradientSamples(images[index] ?? 'none').filter((sample) => sample.a > 0);
    if (samples.length > 0) {
      results = results.flatMap((bg) => samples.map((sample) => compositeOver(sample, bg)));
    }
  }
  return results;
}

/** 色の、背景の候補のすべてに対するコントラスト比の最小 */
function minContrastOver(color: Rgba, backgrounds: Rgba[]): number {
  return Math.min(
    ...backgrounds.map((background) => contrastRatio(compositeOver(color, background), background))
  );
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
  const outsideBackgrounds = effectiveBackgrounds(
    snapshot.backgroundChain.slice(1),
    snapshot.backgroundImageChain.slice(1)
  );
  const insideBackgrounds = effectiveBackgrounds(
    snapshot.backgroundChain,
    snapshot.backgroundImageChain
  );

  const outlineWidth = parseFloat(snapshot.outlineWidth);
  const outlineColor = parseCssColor(snapshot.outlineColor);
  if (
    !['none', 'hidden', 'auto'].includes(snapshot.outlineStyle) &&
    outlineWidth >= FOCUS_INDICATOR_MIN_WIDTH_PX &&
    outlineColor
  ) {
    const backgrounds =
      parseFloat(snapshot.outlineOffset) < 0 ? insideBackgrounds : outsideBackgrounds;
    const ratio = minContrastOver(outlineColor, backgrounds);
    if (ratio >= FOCUS_INDICATOR_MIN_CONTRAST) {
      return `outline ${snapshot.outlineStyle} ${snapshot.outlineWidth} (contrast ${ratio.toFixed(2)})`;
    }
  }

  const ring = parseShadowList(snapshot.boxShadow)
    .filter(isSolidRing)
    .map((shadow) => {
      return {
        shadow,
        ratio: minContrastOver(shadow.color, shadow.inset ? insideBackgrounds : outsideBackgrounds),
      };
    })
    .find((candidate) => candidate.ratio >= FOCUS_INDICATOR_MIN_CONTRAST);
  return ring
    ? `box-shadow ${ring.shadow.inset ? 'inset ' : ''}${ring.shadow.spread}px (contrast ${ring.ratio.toFixed(2)})`
    : null;
}

async function snapshotFocusStyle(
  handle: ElementHandle<Element>,
  scopeSelector: string
): Promise<FocusSnapshot> {
  // transition の途中を読まないよう、要素の遷移が終わるのを待ってから読む
  await handle.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
  return handle.evaluate((el, scope): FocusSnapshot => {
    const view = el.ownerDocument.defaultView!;
    const style = view.getComputedStyle(el);
    const backgroundChain: string[] = [];
    const backgroundImageChain: string[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const nodeStyle = view.getComputedStyle(node);
      backgroundChain.push(nodeStyle.backgroundColor);
      backgroundImageChain.push(nodeStyle.backgroundImage);
    }
    // 名前は aria-label、無ければ結び付いた label の文言、無ければ要素の文言（必須の印「*」は除く）
    const associatedLabel =
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement
        ? (el.labels?.[0]?.textContent ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
        : '';
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const label = el.getAttribute('aria-label') ?? (associatedLabel || text);
    const pathSegments: string[] = [];
    for (let node: Element | null = el; node?.parentElement; node = node.parentElement) {
      pathSegments.unshift(String(Array.prototype.indexOf.call(node.parentElement.children, node)));
    }
    return {
      descriptor: `${el.tagName.toLowerCase()} "${label}"`,
      inScope: el.closest(scope) !== null,
      path: pathSegments.join('>'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      backgroundChain,
      backgroundImageChain,
    };
  }, scopeSelector);
}

async function activeElementHandle(page: Page): Promise<ElementHandle<Element>> {
  const handle = (
    await page.evaluateHandle(() => document.activeElement ?? document.body)
  ).asElement();
  expect(handle, 'フォーカスを持つ要素を取得できる').not.toBeNull();
  return handle as ElementHandle<Element>;
}

/**
 * 今フォーカスを持つ要素から Tab キーだけで進み、範囲（scopeSelector）の中を一巡する。
 * 範囲に入った後、範囲の外へ出たか、範囲で最初に止まった要素へ戻ったら止める。
 * 日付の入力欄のように Tab が同じ要素の中の区画を移るだけの間は、一つの要素として数える。
 * 各要素のフォーカス中と、Tab で離れた直後の計算済みスタイルを組にして返す。
 */
/** 一巡が終わったか。範囲で一つ以上を巡った後、範囲の外へ出たか、範囲で最初に止まった要素へ戻ったら終わり */
function isWalkFinished(
  start: string | null,
  visits: FocusVisit[],
  focused: FocusSnapshot
): boolean {
  return start !== null && visits.length > 0 && (!focused.inScope || focused.path === start);
}

async function walkFocusWithin(
  page: Page,
  scopeSelector: string,
  maxSteps: number
): Promise<FocusVisit[]> {
  const visits: FocusVisit[] = [];
  let current = await activeElementHandle(page);
  let focused = await snapshotFocusStyle(current, scopeSelector);
  let start: string | null = focused.inScope ? focused.path : null;
  for (let step = 0; step < maxSteps && !isWalkFinished(start, visits, focused); step += 1) {
    await page.keyboard.press('Tab');
    const next = await activeElementHandle(page);
    const nextFocused = await snapshotFocusStyle(next, scopeSelector);
    if (nextFocused.path === focused.path) continue;
    if (start !== null) {
      visits.push({ focused, blurred: await snapshotFocusStyle(current, scopeSelector) });
    } else if (nextFocused.inScope) {
      start = nextFocused.path;
    }
    current = next;
    focused = nextFocused;
  }
  expect(
    isWalkFinished(start, visits, focused),
    `Tab を ${maxSteps} 回押しても ${scopeSelector} の一巡が終わらない`
  ).toBe(true);
  return visits;
}

/** 一巡の結果から、明確なフォーカス表示を欠く要素と、離れても表示が残る要素の一覧を作る（空なら満たす） */
function collectFocusIndicatorViolations(visits: FocusVisit[]): string[] {
  return visits.flatMap((visit) => {
    const violations: string[] = [];
    if (!findClearFocusIndicator(visit.focused)) {
      violations.push(
        `フォーカス中に明確な表示が無い: ${visit.focused.descriptor} ` +
          `(outline=${visit.focused.outlineStyle} ${visit.focused.outlineWidth} ${visit.focused.outlineColor}, ` +
          `box-shadow=${visit.focused.boxShadow})`
      );
    }
    const blurredIndicator = findClearFocusIndicator(visit.blurred);
    if (blurredIndicator) {
      violations.push(
        `フォーカスが離れても同じ表示が残る（フォーカスの有無を区別できない）: ` +
          `${visit.focused.descriptor} (${blurredIndicator})`
      );
    }
    return violations;
  });
}

/** 一巡が、明確な表示の欠けと離れても残る表示を持たず、対象の部品を通ったことを主張する */
function expectClearFocusWalk(visits: FocusVisit[], expectedDescriptors: unknown[]): void {
  expect(collectFocusIndicatorViolations(visits)).toEqual([]);
  expect(
    visits.map((visit) => visit.focused.descriptor),
    '一巡が通る部品'
  ).toEqual(expect.arrayContaining(expectedDescriptors));
}

/** 2FA の認証コードの 6 桁の入力欄の名前 */
const TOTP_DIGIT_DESCRIPTORS = [1, 2, 3, 4, 5, 6].map((digit) => `input "認証コード ${digit}桁目"`);

/** 2FA の設定の応答に載せる QR コード（1px の透明な PNG） */
const QR_CODE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** API のパス（オリジンと問い合わせを除く）が一致する要求へ、JSON の応答を返す */
async function fulfillJson(
  page: Page,
  pathname: string,
  status: number,
  body: unknown
): Promise<void> {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
  );
}

/** ログインの応答を 2FA の要求にして、ログイン画面から 2FA の確認の画面へキーボードで進む */
async function openTwoFactorVerificationByKeyboard(page: Page): Promise<void> {
  await fulfillJson(page, '/api/v1/auth/login', 200, { requires2FA: true });
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill('focus-visible@example.com');
  const passwordInput = page.getByLabel('パスワード', { exact: true });
  await passwordInput.fill('Password123!');
  await passwordInput.press('Enter');
  await expect(page.getByLabel('認証コード 1桁目')).toBeFocused({ timeout: getTimeout(10000) });
}

/** 招待トークンの検証の応答を与えて、ユーザー登録の画面を開く */
async function openRegisterPage(page: Page, invitationValid: boolean): Promise<void> {
  if (invitationValid) {
    await fulfillJson(page, '/api/v1/invitations/verify', 200, {
      email: 'invited-focus-visible@example.com',
    });
  } else {
    await fulfillJson(page, '/api/v1/invitations/verify', 400, {
      error: 'Invalid invitation token',
      code: 'INVALID_TOKEN',
    });
  }
  await page.goto('/register?token=focus-visible-invitation');
}

/** リセットリンクの検証の応答を与えて、パスワードの再設定の画面を開く */
async function openPasswordResetPage(page: Page, tokenValid: boolean): Promise<void> {
  if (tokenValid) {
    await fulfillJson(page, '/api/v1/auth/password/verify-reset', 200, { valid: true });
  } else {
    await fulfillJson(page, '/api/v1/auth/password/verify-reset', 400, {
      error: 'Invalid reset token',
      code: 'INVALID_RESET_TOKEN',
    });
  }
  await page.goto('/password-reset?token=focus-visible-reset');
}

/** 2FA の設定の開始の応答を与えて、ログイン後に 2FA の設定の画面を開く */
async function openTwoFactorSetupPage(
  page: Page,
  userKey: 'REGULAR_USER' | 'ADMIN_USER' = 'REGULAR_USER'
): Promise<void> {
  await fulfillJson(page, '/api/v1/auth/2fa/setup', 200, {
    secret: 'JBSWY3DPEHPK3PXP',
    qrCodeDataUrl: QR_CODE_DATA_URL,
  });
  await loginAsUser(page, userKey);
  await page.goto('/profile/2fa-setup');
  await expect(page.getByLabel('認証コード 1桁目')).toBeVisible({ timeout: getTimeout(15000) });
}

/** 2FA の設定の画面で、6 桁の認証コードをキーボードで打つ（入力欄は 1 桁ごとに次へ進む） */
async function typeTotpCode(page: Page): Promise<void> {
  await page.getByLabel('認証コード 1桁目').focus();
  await page.keyboard.type('123456');
  await expect(page.getByLabel('認証コード 6桁目')).toHaveValue('6');
}

test.describe('認証の画面のフォーカス表示', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('ログイン画面の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto('/login');
    const emailInput = page.getByLabel('メールアドレス');
    await expect(emailInput).toBeVisible({ timeout: getTimeout(10000) });
    await emailInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "メールアドレス"',
      'input "パスワード"',
      'button "パスワードを表示"',
      'button "ログイン"',
    ]);
  });

  test('2FAの確認の画面（認証コードの入力済み）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openTwoFactorVerificationByKeyboard(page);
    await page.keyboard.type('123456');
    await expect(page.getByLabel('認証コード 6桁目')).toHaveValue('6');
    await page.getByLabel('認証コード 1桁目').focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...TOTP_DIGIT_DESCRIPTORS,
      'button "バックアップコードを使用する"',
      'button "キャンセル"',
      'button "検証"',
    ]);
  });

  test('2FAの確認の画面（認証コードの誤りのエラーの表示後）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await fulfillJson(page, '/api/v1/auth/verify-2fa', 400, {
      error: '認証コードが正しくありません',
    });
    await openTwoFactorVerificationByKeyboard(page);
    await page.keyboard.type('123456');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: getTimeout(10000) });
    await page.getByLabel('認証コード 1桁目').focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...TOTP_DIGIT_DESCRIPTORS,
      'button "バックアップコードを使用する"',
      'button "キャンセル"',
    ]);
  });

  test('2FAの確認の画面（バックアップコードの入力方式）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openTwoFactorVerificationByKeyboard(page);
    await page.getByRole('button', { name: 'バックアップコードを使用する' }).focus();
    await page.keyboard.press('Enter');
    const backupCodeInput = page.getByLabel('バックアップコード', { exact: true });
    await expect(backupCodeInput).toBeFocused({ timeout: getTimeout(5000) });
    await page.keyboard.type('ABCD1234');
    await expect(backupCodeInput).toHaveValue('ABCD1234');
    await backupCodeInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "バックアップコード"',
      'button "認証コードを使用する"',
      'button "キャンセル"',
      'button "検証"',
    ]);
  });

  test('ユーザー登録の画面（招待が有効）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openRegisterPage(page, true);
    const displayNameInput = page.getByLabel('表示名');
    await expect(displayNameInput).toBeVisible({ timeout: getTimeout(10000) });
    await displayNameInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "表示名"',
      'input "パスワード"',
      'input "パスワード (確認)"',
      'input "利用規約とプライバシーポリシーに同意します"',
      'button "登録"',
      'a "ログイン"',
    ]);
  });

  test('ユーザー登録の画面（入力のエラーの表示後）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openRegisterPage(page, true);
    const displayNameInput = page.getByLabel('表示名');
    await expect(displayNameInput).toBeVisible({ timeout: getTimeout(10000) });
    await displayNameInput.press('Enter');
    await expect(page.getByText('表示名は必須です')).toBeVisible({ timeout: getTimeout(5000) });
    await displayNameInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "表示名"',
      'input "パスワード"',
      'input "パスワード (確認)"',
      'input "利用規約とプライバシーポリシーに同意します"',
      'button "登録"',
      'a "ログイン"',
    ]);
  });

  test('ユーザー登録の画面（招待が無効）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openRegisterPage(page, false);
    await expect(page.getByText('招待トークンの検証に失敗しました')).toBeVisible({
      timeout: getTimeout(10000),
    });

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['a "ログイン"']);
  });

  test('ユーザー登録の画面（招待トークンなし）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: '招待トークンが必要です' })).toBeVisible({
      timeout: getTimeout(10000),
    });

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "ログインページへ戻る"']);
  });

  test('パスワードリセットの要求の画面の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto('/password-reset');
    const emailInput = page.getByLabel('メールアドレス');
    await expect(emailInput).toBeVisible({ timeout: getTimeout(10000) });
    await emailInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "メールアドレス"',
      'button "リセットリンクを送信"',
      'a "ログインページに戻る"',
    ]);
  });

  test('パスワードリセットの要求の画面（メールアドレスのエラーの表示後）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto('/password-reset');
    const emailInput = page.getByLabel('メールアドレス');
    await expect(emailInput).toBeVisible({ timeout: getTimeout(10000) });
    await emailInput.fill('not-an-email');
    await emailInput.press('Tab');
    await expect(page.getByText('有効なメールアドレスを入力してください')).toBeVisible({
      timeout: getTimeout(5000),
    });
    await emailInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "メールアドレス"',
      'button "リセットリンクを送信"',
      'a "ログインページに戻る"',
    ]);
  });

  test('パスワードリセットの要求の画面（送信の成功後）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await fulfillJson(page, '/api/v1/auth/password/reset-request', 200, {
      message: 'Password reset email sent',
    });
    await page.goto('/password-reset');
    const emailInput = page.getByLabel('メールアドレス');
    await expect(emailInput).toBeVisible({ timeout: getTimeout(10000) });
    await emailInput.fill('focus-visible@example.com');
    await emailInput.press('Enter');
    await expect(
      page.getByText('パスワードリセットリンクを送信しました。メールをご確認ください。')
    ).toBeVisible({ timeout: getTimeout(10000) });
    await emailInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "メールアドレス"',
      'button "リセットリンクを送信"',
      'a "ログインページに戻る"',
    ]);
  });

  test('パスワードの再設定の画面（パスワードの入力済み）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openPasswordResetPage(page, true);
    const passwordInput = page.getByLabel('新しいパスワード');
    await expect(passwordInput).toBeVisible({ timeout: getTimeout(10000) });
    await passwordInput.fill('FocusVisible123!');
    await page.getByLabel('パスワード (確認)').fill('FocusVisible123!');
    await passwordInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "新しいパスワード"',
      'input "パスワード (確認)"',
      'button "パスワードをリセット"',
      'a "ログインページに戻る"',
    ]);
  });

  test('パスワードの再設定の画面（不一致のエラーの表示後）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openPasswordResetPage(page, true);
    const passwordInput = page.getByLabel('新しいパスワード');
    await expect(passwordInput).toBeVisible({ timeout: getTimeout(10000) });
    await passwordInput.fill('FocusVisible123!');
    const confirmInput = page.getByLabel('パスワード (確認)');
    await confirmInput.fill('Mismatch123!');
    await confirmInput.press('Enter');
    await expect(page.getByText('パスワードが一致しません')).toBeVisible({
      timeout: getTimeout(5000),
    });
    await passwordInput.focus();

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "新しいパスワード"',
      'input "パスワード (確認)"',
      'button "パスワードをリセット"',
      'a "ログインページに戻る"',
    ]);
  });

  test('パスワードの再設定の画面（リセットリンクが無効）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openPasswordResetPage(page, false);
    await expect(
      page.getByText('無効なリセットリンクです。再度リセットを要求してください。')
    ).toBeVisible({ timeout: getTimeout(10000) });

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PUBLIC_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['a "ログインページに戻る"']);
  });

  test('2FAの設定の画面（QRコードの段階の初期、ヘッダーを含む）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openTwoFactorSetupPage(page);

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PROTECTED_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'a "ArchiTrack"',
      'a "ダッシュボード"',
      'a "プロジェクト"',
      'a "取引先"',
      'a "自社情報"',
      // 共通ヘッダーのユーザーメニューの釦（アバターの頭文字と表示名を名乗る）
      expect.stringMatching(/^button ".+Test User"$/),
      ...TOTP_DIGIT_DESCRIPTORS,
      'button "キャンセル"',
    ]);
  });

  test('2FAの設定の画面（管理者の共通ヘッダー）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openTwoFactorSetupPage(page, 'ADMIN_USER');

    const visits = await walkFocusWithin(page, DOCUMENT_SCOPE, PROTECTED_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'a "ArchiTrack"',
      'a "ダッシュボード"',
      'button "管理メニュー"',
      // 共通ヘッダーのユーザーメニューの釦（アバターの頭文字と表示名を名乗る）
      expect.stringMatching(/^button ".+"$/),
      ...TOTP_DIGIT_DESCRIPTORS,
      'button "キャンセル"',
    ]);
  });

  test('2FAの設定の画面（認証コードの入力済み）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openTwoFactorSetupPage(page);
    await typeTotpCode(page);
    await page.getByLabel('認証コード 1桁目').focus();

    const visits = await walkFocusWithin(page, 'main', PROTECTED_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...TOTP_DIGIT_DESCRIPTORS,
      'button "キャンセル"',
      'button "検証"',
    ]);
  });

  test('2FAの設定の画面（バックアップコードの段階）の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await fulfillJson(page, '/api/v1/auth/2fa/enable', 200, {
      backupCodes: ['AAAA1111', 'BBBB2222', 'CCCC3333', 'DDDD4444'],
    });
    await openTwoFactorSetupPage(page);
    await typeTotpCode(page);
    await page.keyboard.press('Enter');
    const downloadButton = page.getByRole('button', { name: 'ダウンロード' });
    await expect(downloadButton).toBeVisible({ timeout: getTimeout(10000) });
    const savedCheckbox = page.getByRole('checkbox', {
      name: 'バックアップコードを安全な場所に保存しました',
    });
    await savedCheckbox.focus();
    await page.keyboard.press('Space');
    await expect(savedCheckbox).toBeChecked();
    await downloadButton.focus();

    const visits = await walkFocusWithin(page, 'main', PROTECTED_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'button "ダウンロード"',
      'button "印刷"',
      'button "コピー"',
      'input "バックアップコードを安全な場所に保存しました"',
      'button "完了"',
    ]);
  });
});
