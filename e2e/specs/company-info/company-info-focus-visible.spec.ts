/**
 * @fileoverview 自社情報の画面のフォーカス表示のE2Eテスト
 *
 * Task 9.1: 自社情報のフォームの入力欄のインラインの outline の打ち消しと、背景に対して 3:1 に
 * 届かない自前の影の輪を外し、フォーカス表示を共通の :focus-visible の輪に一本化する。
 * 併せて、自社情報の画面でフォーカスを受ける要素を状態ごとに網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 登録済みのプリセットの本文（main）と、未登録の空のフォームで全欄の検証エラーを出した本文
 *   - 保存の成功の後の本文と、成功のトーストの閉じる釦
 *   - 保存の競合（409）の確認のダイアログと、未保存の変更の確認のダイアログ
 *   - 自社情報の取得に失敗した本文（再試行の釦）
 *   - モバイル幅（375px）の本文
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 状態はキーボードの操作だけで作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。
 * 自社情報は 1 件だけの共有のデータで、他のテストが内容を前提にするため、取得と保存の応答は
 * page.route で差し替え、テスト用の DB の自社情報を書き換えない。
 * 判定の作法は e2e/specs/construction-photos/construction-photo-focus-visible.spec.ts に倣う
 * （背景画像のグラデーションの色も背景の候補に入れる）。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (company-info):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 9.1 は、要件 1〜3 の自社情報の画面の上で steering の方針の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page, type Route } from '@playwright/test';
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

/** 一巡が明確な表示の欠けと離れても残る表示を持たず、期待する要素をその順に、その件数だけ通ったことを主張する */
function expectClearFocusWalk(visits: FocusVisit[], expectedDescriptors: unknown[]): void {
  expect(collectFocusIndicatorViolations(visits)).toEqual([]);
  expect(
    visits.map((visit) => visit.focused.descriptor),
    '一巡が通る要素（順序と件数）'
  ).toEqual(expectedDescriptors);
}

/** 文書の先頭へ置く、Tab の起点の目印（tabindex=-1 のため Tab では止まらない） */
const DOCUMENT_START_MARKER_ID = 'focus-walk-document-start';

/**
 * Tab の起点を文書の先頭へ戻す。フォーカスを外すだけでは、ブラウザは直前にフォーカスを持っていた
 * 要素の位置から Tab を続けるため、本文の手前の要素を読み飛ばす。body の先頭へ置いた
 * Tab では止まらない目印へフォーカスを移し、次の Tab が文書の最初のフォーカスを受ける要素へ進むようにする
 */
async function resetFocusToDocumentStart(page: Page): Promise<void> {
  await page.evaluate((markerId) => {
    let marker = document.getElementById(markerId);
    if (!marker) {
      marker = document.createElement('span');
      marker.id = markerId;
      marker.tabIndex = -1;
      document.body.prepend(marker);
    }
    marker.focus();
  }, DOCUMENT_START_MARKER_ID);
  await expect
    .poll(() =>
      page.evaluate((markerId) => document.activeElement?.id === markerId, DOCUMENT_START_MARKER_ID)
    )
    .toBe(true);
}

/** 本文（main）で Tab を押す上限。文書の先頭から共通ヘッダーを抜けて本文を一巡して余る回数 */
const MAIN_WALK_MAX_STEPS = 60;
/** 確認のダイアログやトーストの中で Tab を押す上限（一巡して余る回数） */
const SMALL_WALK_MAX_STEPS = 20;
/** 自社情報の画面の本文 */
const MAIN_SCOPE = 'main';
/** 競合と未保存の変更の確認のダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';
/** トースト（閉じる釦を直下に持つ通知。フォームの検証エラーの文言は釦を持たない） */
const TOAST_SCOPE = '[role="alert"]:has(> button)';

/** 自社情報の取得と保存の経路（判定はオリジンではなくパスで行う。CI とローカルでオリジンが異なるため） */
const COMPANY_INFO_PATH = '/api/company-info';

/** 差し替える登録済みの自社情報 */
const PRESET_COMPANY_INFO = {
  id: '00000000-0000-4000-8000-000000000901',
  companyName: '焦点測定株式会社',
  address: '東京都千代田区焦点1-2-3',
  representative: '焦点 太郎',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'focus@example.com',
  invoiceRegistrationNumber: 'T1234567890123',
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

/** 入力欄の名前（画面の並び順） */
const FIELD_NAMES = [
  '会社名',
  '住所',
  '代表者',
  '電話番号',
  'FAX番号',
  'メールアドレス',
  '適格請求書発行事業者登録番号',
];

/** 本文のフォームが Tab で止まる要素の名前（ブレッドクラム・入力欄 7 つ・操作の釦 2 つ） */
const FORM_DESCRIPTORS = [
  'a "ダッシュボード"',
  ...FIELD_NAMES.map((name) => `input "${name}"`),
  'button "リセット"',
  'button "保存"',
];

type GetResponse = 'preset' | 'unregistered' | 'network-failure';
type PutResponse = 'success' | 'conflict';

interface CompanyInfoRoutes {
  /** 差し替えた保存の要求の件数 */
  putHits: number;
}

/**
 * 自社情報の取得と保存の応答を差し替える。取得はプリセット・未登録（空のオブジェクト）・
 * 通信の失敗のいずれか、保存は成功（version を一つ進めた値）か競合（409）を返す
 */
async function routeCompanyInfo(
  page: Page,
  get: GetResponse,
  put: PutResponse = 'success'
): Promise<CompanyInfoRoutes> {
  const state: CompanyInfoRoutes = { putHits: 0 };
  await page.route(
    (url) => url.pathname === COMPANY_INFO_PATH,
    async (route: Route) => {
      const method = route.request().method();
      if (method === 'GET') {
        if (get === 'network-failure') {
          await route.abort('failed');
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(get === 'preset' ? PRESET_COMPANY_INFO : {}),
        });
        return;
      }
      if (method === 'PUT') {
        state.putHits += 1;
        if (put === 'conflict') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              type: 'https://architrack.example.com/problems/conflict',
              title: 'Conflict',
              status: 409,
              detail: '自社情報は他のユーザーによって更新されました',
              code: 'CONFLICT',
            }),
          });
          return;
        }
        const sent = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...PRESET_COMPANY_INFO,
            ...sent,
            version: PRESET_COMPANY_INFO.version + 1,
          }),
        });
        return;
      }
      await route.continue();
    }
  );
  return state;
}

/** 自社情報の画面を開き、フォームの読み込みが終わるのを待つ */
async function openCompanyInfoPage(page: Page, expectedCompanyName: string): Promise<void> {
  await page.goto('/company-info');
  await expect(page.getByRole('heading', { name: '自社情報', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('textbox', { name: '会社名' })).toHaveValue(expectedCompanyName, {
    timeout: getTimeout(10000),
  });
}

/** 会社名の欄の末尾へキーボードで文字を足し、フォームを未保存の変更ありにする */
async function editCompanyNameByKeyboard(page: Page): Promise<void> {
  const companyName = page.getByRole('textbox', { name: '会社名' });
  await companyName.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(companyName).toHaveValue(`${PRESET_COMPANY_INFO.companyName}X`);
}

/** 保存の釦をキーボードで押す */
async function pressSaveByKeyboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: '保存' }).focus();
  await page.keyboard.press('Enter');
}

test.describe('自社情報の画面のフォーカス表示', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAsUser(page, 'ADMIN_USER');
  });

  test('登録済みのプリセットの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await routeCompanyInfo(page, 'preset');
    await openCompanyInfoPage(page, PRESET_COMPANY_INFO.companyName);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, FORM_DESCRIPTORS);
  });

  test('未登録の空のフォームで全欄の検証エラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await routeCompanyInfo(page, 'unregistered');
    await openCompanyInfoPage(page, '');

    // 必須の 3 欄は空のまま Tab で離れ、任意の 4 欄は形式に合わない値を打って Tab で離れる
    await page.getByRole('textbox', { name: '会社名' }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    for (const invalid of ['abc', 'abc', 'not-an-email', 'X1']) {
      await page.keyboard.type(invalid);
      await page.keyboard.press('Tab');
    }
    const form = page.getByRole('form');
    await expect(form.getByRole('alert')).toHaveCount(FIELD_NAMES.length);
    await expect(
      form.locator('input[aria-invalid="true"]'),
      '前提: 7 欄すべてが検証エラーの表示中'
    ).toHaveCount(FIELD_NAMES.length);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, FORM_DESCRIPTORS);
  });

  test('保存の成功の後の本文と成功のトーストの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const routes = await routeCompanyInfo(page, 'preset', 'success');
    await openCompanyInfoPage(page, PRESET_COMPANY_INFO.companyName);
    await editCompanyNameByKeyboard(page);
    await pressSaveByKeyboard(page);

    const toast = page.locator(TOAST_SCOPE).filter({ hasText: '自社情報を保存しました' });
    await expect(toast).toBeVisible({ timeout: getTimeout(10000) });
    expect(routes.putHits, '前提: 保存の要求が 1 件送られる').toBe(1);

    // トーストは文書の中で本文より前に置かれ、文書の先頭からの最初の Tab で閉じる釦へ入る
    // （トーストは 5 秒で消えるため、本文より先に測る）
    await resetFocusToDocumentStart(page);
    const toastVisits = await walkFocusWithin(page, TOAST_SCOPE, SMALL_WALK_MAX_STEPS);
    expectClearFocusWalk(toastVisits, ['button "自社情報を保存しましたを閉じる"']);

    await resetFocusToDocumentStart(page);
    const mainVisits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);
    expectClearFocusWalk(mainVisits, FORM_DESCRIPTORS);
  });

  test('保存の競合（409）の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const routes = await routeCompanyInfo(page, 'preset', 'conflict');
    await openCompanyInfoPage(page, PRESET_COMPANY_INFO.companyName);
    await editCompanyNameByKeyboard(page);
    await pressSaveByKeyboard(page);

    // 開くと、初期のフォーカスは再読み込みの釦
    const dialog = page.getByRole('dialog', { name: '編集の競合' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    expect(routes.putHits, '前提: 保存の要求が 1 件送られる').toBe(1);
    await expect(dialog.getByRole('button', { name: '再読み込み' })).toBeFocused();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再読み込み"', 'button "閉じる"']);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
  });

  test('未保存の変更の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await routeCompanyInfo(page, 'preset');
    await openCompanyInfoPage(page, PRESET_COMPANY_INFO.companyName);
    await editCompanyNameByKeyboard(page);

    // 本文のブレッドクラムのダッシュボードへの導線をキーボードで押し、離脱の確認を出す
    await page.getByRole('main').getByRole('link', { name: 'ダッシュボード' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '変更が保存されていません' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByRole('button', { name: 'このページにとどまる' })).toBeFocused();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "このページにとどまる"', 'button "ページを離れる"']);

    // とどまる（Escape）と、画面と未保存の変更はそのまま残る
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(/\/company-info$/);
  });

  test('自社情報の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await routeCompanyInfo(page, 'network-failure');
    await page.goto('/company-info');
    await expect(page.getByText('通信エラーが発生しました。再試行してください。')).toBeVisible({
      timeout: getTimeout(30000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['a "ダッシュボード"', 'button "再試行"']);
  });

  test('モバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await routeCompanyInfo(page, 'preset');
    await openCompanyInfoPage(page, PRESET_COMPANY_INFO.companyName);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, FORM_DESCRIPTORS);
  });
});
