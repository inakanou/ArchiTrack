/**
 * @fileoverview 工程表の画面のフォーカス表示のE2Eテスト
 *
 * Task 19.1: 工程表の作成フォーム（ScheduleForm）の入力欄と選択のインラインの outline の打ち消しを外し、
 * フォーカス表示を共通の :focus-visible の輪に一本化する。併せて、工程表の作成画面と、同じスペックの
 * 一覧・詳細の画面とダイアログでフォーカスを受ける要素を状態ごとに網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 作成画面の初期の本文（main）
 *   - 名称を空のまま送信して検証エラーを出した本文
 *   - 作成の要求が失敗してエラーの文言を出した本文
 *   - 作成画面のモバイル幅（375px）の本文
 *   - 一覧画面の工程表が無い本文と、工程表が 1 件ある本文、削除の確認のダイアログ、
 *     一覧の取得に失敗した本文（再試行の釦）
 *   - 詳細画面の項目が 1 件ある本文（項目の入力欄とガントチャート）と、出力のダイアログ、
 *     出力に失敗した後の出力のダイアログ（再試行の釦）
 *   - 詳細画面のモバイル幅（375px）の本文（横にはみ出してキーボードでスクロールできるガントチャートの領域を含む）
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 状態はキーボードの操作だけで作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。
 * 作成・一覧の取得・出力の失敗は page.route でその要求だけを 400 に差し替えて作り、テスト用の DB に工程表を作らない。
 * 一覧と詳細で測る工程表は、テスト用の DB へ直接作る（作成画面の操作に一覧と詳細の測定を依らせないため）。
 * 判定の作法は e2e/specs/company-info/company-info-focus-visible.spec.ts に倣う
 * （背景画像のグラデーションの色も背景の候補に入れる）。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (construction-schedule):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 19.1 は、要件 1〜11 の工程表の画面の上で steering の方針の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page, type Route } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

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
/** 確認のダイアログや出力のダイアログの中で Tab を押す上限（一巡して余る回数） */
const SMALL_WALK_MAX_STEPS = 20;
/** 工程表の画面の本文 */
const MAIN_SCOPE = 'main';
/** 削除の確認のダイアログと出力のダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';

/** 作成画面と、工程表が無い一覧画面を測るプロジェクトの名称 */
const EMPTY_PROJECT_NAME = 'E2E工程表フォーカス表示用プロジェクト（空）';
/** 工程表が 1 件ある一覧画面と、その詳細画面を測るプロジェクトの名称 */
const POPULATED_PROJECT_NAME = 'E2E工程表フォーカス表示用プロジェクト（工程表あり）';
/** 一覧と詳細で測る工程表の名称 */
const SEEDED_SCHEDULE_NAME = 'フォーカス測定工程表';

/** 作成画面の本文が Tab で止まる要素の名前（ブレッドクラムの導線 4 つ・名称の欄・数量表の選択・操作の釦 2 つ） */
const CREATE_FORM_DESCRIPTORS = [
  'a "ダッシュボード"',
  'a "プロジェクト一覧"',
  'a "プロジェクト"',
  'a "工程表一覧"',
  'input "工程表名称"',
  'select "数量表"',
  'button "キャンセル"',
  'button "作成"',
];

/** 一覧画面の本文の、ブレッドクラムの導線 3 つと新規作成の導線 */
const LIST_HEADER_DESCRIPTORS = [
  'a "ダッシュボード"',
  'a "プロジェクト一覧"',
  'a "プロジェクト"',
  'a "工程表を新規作成"',
];

let emptyProjectId: string;
let populatedProjectId: string;
let seededScheduleId: string;

/** 工程表の権限を一般ユーザーへ与え、測定用のプロジェクト 2 件と、片方に項目 1 件の工程表を作る */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.permission.createMany({
    data: [
      { resource: 'schedule', action: 'create', description: '工程表の作成' },
      { resource: 'schedule', action: 'read', description: '工程表の閲覧' },
      { resource: 'schedule', action: 'update', description: '工程表の更新' },
      { resource: 'schedule', action: 'delete', description: '工程表の削除' },
    ],
    skipDuplicates: true,
  });
  const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
  const permissions = await prisma.permission.findMany({
    where: { resource: 'schedule', action: { in: ['create', 'read', 'update', 'delete'] } },
  });
  if (!userRole || permissions.length !== 4) {
    throw new Error('前提: user ロールと工程表の権限 4 件が存在する');
  }
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: userRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  const testUser = await prisma.user.findUnique({ where: { email: 'user@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  const projectData = {
    status: 'PREPARING' as const,
    salesPersonId: testUser.id,
    createdById: testUser.id,
  };
  emptyProjectId = (
    await prisma.project.create({ data: { ...projectData, name: EMPTY_PROJECT_NAME } })
  ).id;
  populatedProjectId = (
    await prisma.project.create({ data: { ...projectData, name: POPULATED_PROJECT_NAME } })
  ).id;
  const schedule = await prisma.constructionSchedule.create({
    data: {
      projectId: populatedProjectId,
      name: SEEDED_SCHEDULE_NAME,
      items: {
        create: [
          {
            itemName: '基礎工事',
            labelText: '基礎',
            detailText: '根切り・配筋',
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            duration: 5,
            displayOrder: 0,
          },
        ],
      },
    },
  });
  seededScheduleId = schedule.id;
}

/** 測定用のプロジェクトと、その下の工程表を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった分は undefined のため除く（空の in は何も消さない）
  const projectIds = [emptyProjectId, populatedProjectId].filter((id): id is string => !!id);
  const prisma = getPrismaClient();
  await prisma.constructionSchedule.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

/** 工程表の作成画面を開き、フォームの表示を待つ */
async function openScheduleCreatePage(page: Page): Promise<void> {
  await page.goto(`/projects/${emptyProjectId}/schedules/new`);
  await expect(page.getByRole('heading', { name: '工程表作成', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('combobox', { name: '数量表' })).toHaveValue('');
}

/** 作成の釦をキーボードで押す */
async function pressCreateByKeyboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: '作成' }).focus();
  await page.keyboard.press('Enter');
}

/** 工程表が 1 件ある一覧画面を開き、行の表示を待つ */
async function openPopulatedListPage(page: Page): Promise<void> {
  await page.goto(`/projects/${populatedProjectId}/schedules`);
  await expect(page.getByRole('heading', { name: '工程表一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByTestId(`schedule-row-${seededScheduleId}`)).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 項目 1 件の工程表の詳細画面を開き、項目の行の表示を待つ */
async function openSeededDetailPage(page: Page): Promise<void> {
  await page.goto(`/schedules/${seededScheduleId}`);
  await expect(page.getByRole('heading', { name: SEEDED_SCHEDULE_NAME, level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('textbox', { name: '項目名' })).toHaveValue('基礎工事', {
    timeout: getTimeout(10000),
  });
}

test.describe('工程表の画面のフォーカス表示', () => {
  test.beforeAll(async () => {
    await setupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await disconnectDatabase();
  });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAsUser(page, 'REGULAR_USER');
  });

  test('作成画面の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openScheduleCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で名称の検証エラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openScheduleCreatePage(page);

    // 名称を空のまま作成の釦をキーボードで押すと、名称の欄に検証エラーが出る
    await pressCreateByKeyboard(page);
    await expect(page.getByText('工程表名称を入力してください')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page, '前提: 検証エラーで画面に留まる').toHaveURL(/\/schedules\/new$/);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で作成の失敗のエラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 作成の要求（POST /api/projects/:projectId/schedules）だけを 400 に差し替える。API クライアントは
    // 5xx を再試行するため、再試行しない 4xx で失敗を 1 件に揃える
    // （判定はオリジンではなくパスで行う。CI とローカルでオリジンが異なるため）
    const createPath = `/api/projects/${emptyProjectId}/schedules`;
    let createHits = 0;
    await page.route(
      (url) => url.pathname === createPath,
      async (route: Route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        createHits += 1;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'https://architrack.example.com/problems/validation-error',
            title: 'Bad Request',
            status: 400,
            detail: 'E2E のフォーカス表示の測定のための失敗',
          }),
        });
      }
    );
    await openScheduleCreatePage(page);
    await page.getByRole('textbox', { name: '工程表名称' }).focus();
    await page.keyboard.type('フォーカス測定の作成');
    await pressCreateByKeyboard(page);

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      '工程表の作成に失敗しました',
      { timeout: getTimeout(10000) }
    );
    expect(createHits, '前提: 作成の要求が 1 件送られる').toBe(1);
    // 失敗の後も入力は保持され、部品は再び操作できる
    await expect(page.getByRole('textbox', { name: '工程表名称' })).toHaveValue(
      'フォーカス測定の作成'
    );
    await expect(page.getByRole('button', { name: '作成' })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openScheduleCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('工程表が無い一覧画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto(`/projects/${emptyProjectId}/schedules`);
    await expect(page.getByText('工程表はまだありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [...LIST_HEADER_DESCRIPTORS, 'a "新規作成"']);
  });

  test('工程表が1件ある一覧画面の本文と削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openPopulatedListPage(page);
    await resetFocusToDocumentStart(page);

    const mainVisits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);
    // 行は名称・数量表・項目数・作成日時の 4 つの導線と削除の釦（作成日時の文言は時差で変わるため形で照合する）
    expectClearFocusWalk(mainVisits, [
      ...LIST_HEADER_DESCRIPTORS,
      `a "${SEEDED_SCHEDULE_NAME}"`,
      'a "-"',
      'a "1"',
      expect.stringMatching(/^a "\d{4}年\d{1,2}月\d{1,2}日/),
      `button "${SEEDED_SCHEDULE_NAME}を削除"`,
    ]);

    // 削除の釦をキーボードで押し、確認のダイアログを出す（確認は押さず、DB の工程表を残す）
    await page.getByRole('button', { name: `${SEEDED_SCHEDULE_NAME}を削除` }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: 'キャンセル' }).focus();

    const dialogVisits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(dialogVisits, ['button "キャンセル"', 'button "確認"']);

    // キャンセルで閉じ、工程表は残る
    await dialog.getByRole('button', { name: 'キャンセル' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page.getByTestId(`schedule-row-${seededScheduleId}`)).toBeVisible();
  });

  test('項目が1件ある詳細画面の本文と出力のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openSeededDetailPage(page);
    await resetFocusToDocumentStart(page);

    const mainVisits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);
    // 着工日の欄は Tab が年・月・日の区画を移る間を一つの要素として数える
    expectClearFocusWalk(mainVisits, [
      'a "プロジェクト一覧"',
      'a "プロジェクト詳細"',
      'a "工程表一覧"',
      'button "出力"',
      'button "+ 項目追加"',
      'button "保存"',
      'input "項目名"',
      'input "ラベル"',
      'input "詳細"',
      'input "着工日"',
      'input "日数"',
      'input "出力"',
      'button "基礎工事を削除"',
    ]);

    // 出力の釦をキーボードで押し、出力のダイアログを出す
    await page.getByTestId('export-button').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    const dialogVisits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    // 形式の選択は一つの radio の組で、Tab は選ばれた方にだけ止まる
    expectClearFocusWalk(dialogVisits, [
      'input "Excel形式編集可能なExcelファイル（.xlsx）で出力します"',
      'button "キャンセル"',
      'button "出力"',
    ]);
  });
  test('一覧画面で工程表の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 一覧の取得（GET /api/projects/:projectId/schedules）だけを 400 に差し替える。API クライアントは
    // 5xx を再試行するため、再試行しない 4xx で失敗を 1 件に揃える（判定はパスで行う）
    const listPath = `/api/projects/${populatedProjectId}/schedules`;
    let listHits = 0;
    await page.route(
      (url) => url.pathname === listPath,
      async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        listHits += 1;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'https://architrack.example.com/problems/validation-error',
            title: 'Bad Request',
            status: 400,
            detail: 'E2E のフォーカス表示の測定のための失敗',
          }),
        });
      }
    );
    await page.goto(`/projects/${populatedProjectId}/schedules`);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert.getByRole('button', { name: '再試行' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(listHits, '前提: 一覧の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('出力のダイアログで出力に失敗した状態の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 出力の要求（パスが /export で終わる要求）だけを 400 に差し替える（判定はパスで行う）
    let exportHits = 0;
    await page.route(
      (url) => url.pathname.endsWith('/export'),
      async (route: Route) => {
        exportHits += 1;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'E2E のフォーカス表示の測定のための失敗' }),
        });
      }
    );
    await openSeededDetailPage(page);

    // 出力の釦をキーボードで押してダイアログを出し、既定の Excel のまま出力をキーボードで押す
    await page.getByTestId('export-button').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: '出力', exact: true }).focus();
    await page.keyboard.press('Enter');

    const retry = dialog.getByRole('alert').getByRole('button', { name: '再試行' });
    await expect(retry).toBeVisible({ timeout: getTimeout(10000) });
    expect(exportHits, '前提: 出力の要求が 1 件送られる').toBe(1);
    await expect(retry).toBeEnabled();
    // 一巡の起点をダイアログの先頭の「再試行」へ置く
    await retry.focus();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'button "再試行"',
      'input "Excel形式編集可能なExcelファイル（.xlsx）で出力します"',
      'button "キャンセル"',
      'button "出力"',
    ]);
  });

  test('項目が1件ある詳細画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openSeededDetailPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    // 375 幅ではガントチャートの領域（gantt-chart-panel の div）が横にはみ出し、キーボードでスクロール
    // できる領域として Tab が止まる。名前はその文言の先頭 30 字（凡例・投入した着工日の月と日・ラベル・詳細）
    expectClearFocusWalk(visits, [
      'a "プロジェクト一覧"',
      'a "プロジェクト詳細"',
      'a "工程表一覧"',
      'button "出力"',
      'button "+ 項目追加"',
      'button "保存"',
      'input "項目名"',
      'input "ラベル"',
      'input "詳細"',
      'input "着工日"',
      'input "日数"',
      'input "出力"',
      'button "基礎工事を削除"',
      'div "ラベル2026年10月12345基礎根切り・配筋"',
    ]);
  });
});
