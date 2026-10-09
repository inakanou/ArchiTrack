/**
 * @fileoverview 内訳書の作成画面・一覧・詳細画面のフォーカス表示のE2Eテスト
 *
 * Task 25.1: 内訳書の作成フォーム（CreateItemizedStatementForm）と内訳書の詳細画面
 * （ItemizedStatementDetailPage）のインラインの outline の打ち消しを外し、フォーカス表示を
 * 共通の :focus-visible の輪に一本化する。併せて、本スペックの画面でフォーカスを受ける要素を
 * 状態ごとに網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 作成画面の初期の本文、入力の誤り（内訳書名を空にし数量表を選ばずに作成）を表示した本文、
 *     作成の要求が失敗した本文、数量表が無いプロジェクトの本文（数量表の選択と作成の釦は無効で
 *     止まらない）、初期の本文のモバイル幅（375px）
 *   - 詳細画面の初期の本文、並び替えて未保存の変更がある本文、並び順の保存の要求が失敗した本文、
 *     フィルタの結果が 0 件の本文、ページ送りのある内訳書の 1 ページ目と 2 ページ目の本文、
 *     削除の要求が失敗した本文、内訳書の取得に失敗した本文（再試行の釦）、初期の本文のモバイル幅
 *     （375px）、削除の確認のダイアログ、未保存の変更の確認のダイアログ
 *   - 内訳書一覧（ItemizedStatementListPage）の本文・削除の確認のダイアログ・一覧の取得に失敗した
 *     本文・内訳書が無い本文（数量表の有無の 2 通り）・モバイル幅（375px）の本文と、プロジェクト詳細の
 *     内訳書のセクション（ItemizedStatementSectionCard の region だけを巡り、他のスペックの
 *     セクションは範囲の外として読み飛ばす。内訳書の有無と数量表の有無の 3 通り）。
 *     いずれもタスク 25.1 の変更の前から満たしており、網羅のための見張りとして置く
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 詳細画面は、3 項目の固定の小さな内訳書で測る（並び替えの釦の有効・無効の並びは先頭・中間・末尾の
 * 3 項目で尽きるため）。ページ送りは、1 ページ（50 件）を 1 件だけ超える 51 項目の内訳書で測る。
 * 状態はキーボードの操作で作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。
 * 失敗は page.route でその要求だけをパスで判定して差し替え、テスト用の DB の内訳書を書き換えない。
 * いずれの失敗も API クライアントが再試行しない 4xx で作り、要求が 1 件だけ送られたことを確かめる。
 * 測るプロジェクト・数量表・内訳書は、テスト用の DB へ直接作る（作成画面の操作に詳細画面の測定を
 * 依らせないため）。作成日時は固定の日付にする。
 * 判定の作法は e2e/specs/estimate/estimate-creation-focus-visible.spec.ts に倣う
 * （背景画像のグラデーションの色も背景の候補に入れる）。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (itemized-statement-generation):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 25.1 は、内訳書の作成画面・一覧・詳細画面の上で steering の方針の下限へ揃える。
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
    // 名前は aria-label、無ければ結び付いた label の文言、無ければ要素の文言（必須の印「*」は除く）。
    // 文章の欄（textarea）も label で名付けた場合に備え、textarea も label の文言で呼ぶ
    const associatedLabel =
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
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
const MAIN_WALK_MAX_STEPS = 80;
/** ダイアログで Tab を押す上限。文書の先頭から本文を抜け、ダイアログを一巡して余る回数 */
const DIALOG_WALK_MAX_STEPS = 80;
/** プロジェクト詳細で Tab を押す上限。文書の先頭から他のスペックのセクションを抜け、内訳書のセクションを一巡して余る回数 */
const SECTION_WALK_MAX_STEPS = 200;
/** 開いたときにフォーカスを受けるダイアログの中で Tab を押す上限（一巡して余る回数） */
const SMALL_WALK_MAX_STEPS = 20;
/** 画面の本文 */
const MAIN_SCOPE = 'main';
/** ダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';
/** プロジェクト詳細の内訳書のセクション（ItemizedStatementSectionCard の region） */
const SECTION_SCOPE = '[data-testid="itemized-statement-section"]';

/** 数量表と内訳書を持つプロジェクトの名称 */
const PROJECT_NAME = 'E2E内訳書フォーカス表示用プロジェクト';
/** 数量表だけを持ち、内訳書の無いプロジェクトの名称 */
const QT_ONLY_PROJECT_NAME = 'E2E内訳書フォーカス表示用数量表のみのプロジェクト';
/** 数量表も内訳書も無いプロジェクトの名称 */
const EMPTY_PROJECT_NAME = 'E2E内訳書フォーカス表示用空のプロジェクト';
/** 数量表の名称 */
const QUANTITY_TABLE_NAME = 'フォーカス測定数量表';
/** 3 項目の内訳書の名称 */
const STATEMENT_NAME = 'フォーカス測定内訳書';
/** 51 項目（ページ送りあり）の内訳書の名称 */
const PAGED_STATEMENT_NAME = 'フォーカス測定ページ送り内訳書';
/** ページ送りのある内訳書の項目数（1 ページ 50 件を 1 件だけ超える） */
const PAGED_ITEM_COUNT = 51;

/** 失敗の応答の本文（RFC 7807）。detail は作成の失敗の文言になる */
const FAILURE_DETAIL = 'E2E のフォーカス表示の測定のための失敗';

/** パンくずの、ダッシュボードから内訳書一覧までの 4 つの導線 */
function breadcrumbToList(projectName: string): string[] {
  return ['a "ダッシュボード"', 'a "プロジェクト一覧"', `a "${projectName}"`, 'a "内訳書一覧"'];
}

/** 作成画面の本文が Tab で止まる要素 */
const CREATE_FORM_DESCRIPTORS = [
  ...breadcrumbToList(PROJECT_NAME),
  'a "プロジェクト詳細に戻る"',
  'input "内訳書名"',
  'select "数量表"',
  'button "キャンセル"',
  'button "作成"',
];

/** 詳細画面の、パンくずから戻る導線までの要素 */
const DETAIL_NAV_DESCRIPTORS = [...breadcrumbToList(PROJECT_NAME), 'a "← プロジェクトに戻る"'];
/** 詳細画面の、コピー・Excel 出力・削除の釦 */
const DETAIL_ACTION_DESCRIPTORS = [
  'button "クリップボードにコピー"',
  'button "Excelダウンロード"',
  'button "削除"',
];
/** フィルタのクリアの釦と 5 つの欄 */
const FILTER_DESCRIPTORS = [
  'button "フィルタをクリア"',
  'input "任意分類"',
  'input "工種"',
  'input "名称"',
  'input "規格"',
  'input "単位"',
];
/** 3 項目の並び替えの釦（先頭の上へと末尾の下へは無効で止まらない） */
const REORDER_DESCRIPTORS = [
  'button "下へ移動"',
  'button "上へ移動"',
  'button "下へ移動"',
  'button "上へ移動"',
];
/** 詳細画面の初期の本文が Tab で止まる要素 */
const DETAIL_INITIAL_DESCRIPTORS = [
  ...DETAIL_NAV_DESCRIPTORS,
  ...DETAIL_ACTION_DESCRIPTORS,
  ...FILTER_DESCRIPTORS,
  ...REORDER_DESCRIPTORS,
];
/** 並び替えて未保存の変更がある本文が Tab で止まる要素（並び順の保存の釦が出る） */
const DETAIL_DIRTY_DESCRIPTORS = [
  ...DETAIL_NAV_DESCRIPTORS,
  'button "並び順を保存"',
  ...DETAIL_ACTION_DESCRIPTORS,
  ...FILTER_DESCRIPTORS,
  ...REORDER_DESCRIPTORS,
];

/** 内訳書一覧の、パンくずから戻る導線までの要素 */
function listNavDescriptors(projectName: string): string[] {
  return [
    'a "ダッシュボード"',
    'a "プロジェクト一覧"',
    `a "${projectName}"`,
    'a "プロジェクト詳細に戻る"',
  ];
}
/** 内訳書一覧の本文が Tab で止まる要素（作成日の新しい順に、カードの導線と削除の釦） */
const LIST_DESCRIPTORS = [
  ...listNavDescriptors(PROJECT_NAME),
  'a "内訳書を新規作成"',
  `a "${STATEMENT_NAME}の内訳書詳細を見る"`,
  'button "削除"',
  `a "${PAGED_STATEMENT_NAME}の内訳書詳細を見る"`,
  'button "削除"',
];

let projectId: string;
let qtOnlyProjectId: string;
let emptyProjectId: string;
let statementId: string;
let pagedStatementId: string;

/** 内訳書の項目（任意分類・工種・単位は共通。名称だけを変える） */
function statementItems(names: string[]) {
  return names.map((name, index) => ({
    customCategory: 'フォーカス分類',
    workType: 'フォーカス工種',
    name,
    unit: '式',
    quantity: 1,
    displayOrder: index,
  }));
}

/** 数量表に 1 項目を持たせる（作成画面の選択肢が項目 0 件の扱いにならないため） */
async function createQuantityTable(targetProjectId: string): Promise<string> {
  const prisma = getPrismaClient();
  return (
    await prisma.quantityTable.create({
      data: {
        projectId: targetProjectId,
        name: QUANTITY_TABLE_NAME,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        groups: {
          create: [
            {
              name: 'フォーカス測定グループ',
              displayOrder: 0,
              items: {
                create: [
                  {
                    workType: 'フォーカス工種',
                    name: 'フォーカス測定項目',
                    unit: '式',
                    quantity: 1,
                    displayOrder: 0,
                  },
                ],
              },
            },
          ],
        },
      },
    })
  ).id;
}

/**
 * 測定用の 3 つのプロジェクトを作る。数量表と内訳書 2 件（3 項目と 51 項目）を持つもの、
 * 数量表だけを持つもの、どちらも持たないもの
 */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  const createProject = async (name: string): Promise<string> =>
    (
      await prisma.project.create({
        data: {
          name,
          status: 'PREPARING',
          salesPersonId: testUser.id,
          createdById: testUser.id,
        },
      })
    ).id;
  projectId = await createProject(PROJECT_NAME);
  qtOnlyProjectId = await createProject(QT_ONLY_PROJECT_NAME);
  emptyProjectId = await createProject(EMPTY_PROJECT_NAME);

  const quantityTableId = await createQuantityTable(projectId);
  await createQuantityTable(qtOnlyProjectId);

  statementId = (
    await prisma.itemizedStatement.create({
      data: {
        projectId,
        name: STATEMENT_NAME,
        sourceQuantityTableId: quantityTableId,
        sourceQuantityTableName: QUANTITY_TABLE_NAME,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        items: { create: statementItems(['項目A', '項目B', '項目C']) },
      },
    })
  ).id;
  pagedStatementId = (
    await prisma.itemizedStatement.create({
      data: {
        projectId,
        name: PAGED_STATEMENT_NAME,
        sourceQuantityTableId: quantityTableId,
        sourceQuantityTableName: QUANTITY_TABLE_NAME,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        items: {
          create: statementItems(
            Array.from({ length: PAGED_ITEM_COUNT }, (_, index) => `ページ項目${index + 1}`)
          ),
        },
      },
    })
  ).id;
}

/** 測定用のプロジェクトと、その下の内訳書・数量表（項目はそれぞれとともに消える）を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった分は undefined のため除く（空の in は何も消さない）
  const projectIds = [projectId, qtOnlyProjectId, emptyProjectId].filter(
    (id): id is string => !!id
  );
  const prisma = getPrismaClient();
  await prisma.itemizedStatement.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.quantityTable.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

/** 要求をパスとメソッドで判定し、失敗の応答へ差し替える。差し替えた件数を返す関数を返す */
async function routeFailure(
  page: Page,
  path: string,
  method: string,
  status: number
): Promise<() => number> {
  let hits = 0;
  // 判定はオリジンではなくパスで行う（CI とローカルでオリジンが異なるため）
  await page.route(
    (url) => url.pathname === path,
    async (route: Route) => {
      if (route.request().method() !== method) {
        await route.continue();
        return;
      }
      hits += 1;
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/focus-visible-measurement',
          title: 'Bad Request',
          status,
          detail: FAILURE_DETAIL,
        }),
      });
    }
  );
  return () => hits;
}

/** 作成画面を開き、数量表の選択の表示を待つ */
async function openCreatePage(page: Page, targetProjectId: string = projectId): Promise<void> {
  await page.goto(`/projects/${targetProjectId}/itemized-statements/new`);
  await expect(page.getByRole('heading', { name: '内訳書を新規作成', level: 1 })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByRole('combobox', { name: '数量表' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 内訳書一覧を開き、見出しの表示を待つ */
async function openListPage(page: Page, targetProjectId: string = projectId): Promise<void> {
  await page.goto(`/projects/${targetProjectId}/itemized-statements`);
  await expect(page.getByRole('heading', { name: '内訳書一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 詳細画面を開き、項目の表（またはフィルタの欄）の表示を待つ */
async function openDetailPage(page: Page, targetStatementId: string = statementId): Promise<void> {
  await page.goto(`/itemized-statements/${targetStatementId}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });
}

/** 本文の釦をキーボードで押す（同じ名前の釦が複数あるときは文書の先の方） */
async function pressByKeyboard(page: Page, name: string): Promise<void> {
  await page.getByRole('main').getByRole('button', { name, exact: true }).first().focus();
  await page.keyboard.press('Enter');
}

/** 先頭の項目をキーボードで一つ下へ移し、並び順の保存の釦を出す */
async function reorderByKeyboard(page: Page): Promise<void> {
  await pressByKeyboard(page, '下へ移動');
  await expect(page.getByRole('button', { name: '並び順を保存' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

test.describe('内訳書の画面のフォーカス表示', () => {
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
    await loginAsUser(page, 'ADMIN_USER');
  });

  // ==========================================================================
  // 作成画面
  // ==========================================================================

  test('作成画面の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で入力の誤りを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    await page.getByLabel('内訳書名').fill('');
    await pressByKeyboard(page, '作成');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText([
      '内訳書名を入力してください',
      '数量表を選択してください',
    ]);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で作成の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 作成の要求（POST /api/projects/:projectId/itemized-statements）だけを 400 に差し替える
    const createHits = await routeFailure(
      page,
      `/api/projects/${projectId}/itemized-statements`,
      'POST',
      400
    );
    await openCreatePage(page);
    await page
      .getByRole('combobox', { name: '数量表' })
      .selectOption({ label: QUANTITY_TABLE_NAME });
    await pressByKeyboard(page, '作成');

    await expect(page.getByRole('main').getByText(FAILURE_DETAIL)).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(createHits(), '前提: 作成の要求が 1 件送られる').toBe(1);
    // 失敗の後も入力は保持され、部品は再び操作できる
    await expect(page.getByLabel('内訳書名')).toHaveValue('内訳書');
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で数量表が無いプロジェクトの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page, emptyProjectId);
    // 数量表が無い間は数量表の選択と作成の釦が無効になり、Tab で止まらない
    await expect(page.getByRole('combobox', { name: '数量表' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeDisabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...breadcrumbToList(EMPTY_PROJECT_NAME),
      'a "プロジェクト詳細に戻る"',
      'input "内訳書名"',
      'button "キャンセル"',
    ]);
  });

  test('作成画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  // ==========================================================================
  // 詳細画面の本文
  // ==========================================================================

  test('詳細画面の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, DETAIL_INITIAL_DESCRIPTORS);
  });

  test('詳細画面で並び替えて未保存の変更がある本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await reorderByKeyboard(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, DETAIL_DIRTY_DESCRIPTORS);
  });

  test('詳細画面で並び順の保存の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 並び順の保存の要求（PATCH /api/itemized-statements/:id/items/order）だけを 400 に差し替える
    const saveHits = await routeFailure(
      page,
      `/api/itemized-statements/${statementId}/items/order`,
      'PATCH',
      400
    );
    await openDetailPage(page);
    await reorderByKeyboard(page);
    await pressByKeyboard(page, '並び順を保存');

    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(saveHits(), '前提: 並び順の保存の要求が 1 件送られる').toBe(1);
    // 失敗の後も未保存の変更は残り、保存の釦は再び押せる
    await expect(page.getByRole('button', { name: '並び順を保存' })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, DETAIL_DIRTY_DESCRIPTORS);
  });

  test('詳細画面でフィルタの結果が0件の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await page.getByRole('textbox', { name: '名称' }).fill('該当しない名称');
    await expect(page.getByText('該当する項目はありません')).toBeVisible();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...DETAIL_NAV_DESCRIPTORS,
      ...DETAIL_ACTION_DESCRIPTORS,
      ...FILTER_DESCRIPTORS,
    ]);
  });

  test('詳細画面でページ送りのある内訳書の1ページ目と2ページ目の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page, pagedStatementId);
    // 全項目に当たるフィルタを掛け、並び替えの釦を隠して、ページ送りの釦までの並びを短くする
    await page.getByRole('textbox', { name: '単位' }).fill('式');
    await expect(page.getByRole('navigation', { name: 'ページネーション' })).toContainText('1 / 2');
    await resetFocusToDocumentStart(page);

    const firstPage = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    const pagedNav = [
      ...breadcrumbToList(PROJECT_NAME),
      'a "← プロジェクトに戻る"',
      ...DETAIL_ACTION_DESCRIPTORS,
      ...FILTER_DESCRIPTORS,
    ];
    // 1 ページ目は「前へ」が無効で止まらない
    expectClearFocusWalk(firstPage, [...pagedNav, 'button "次へ"']);

    await pressByKeyboard(page, '次へ');
    await expect(page.getByRole('navigation', { name: 'ページネーション' })).toContainText('2 / 2');
    await resetFocusToDocumentStart(page);

    const secondPage = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    // 2 ページ目は「次へ」が無効で止まらない
    expectClearFocusWalk(secondPage, [...pagedNav, 'button "前へ"']);
  });

  test('詳細画面で削除の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 削除の要求（DELETE /api/itemized-statements/:id）だけを 400 に差し替える
    const deleteHits = await routeFailure(
      page,
      `/api/itemized-statements/${statementId}`,
      'DELETE',
      400
    );
    await openDetailPage(page);
    await pressByKeyboard(page, '削除');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: '削除', exact: true }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(deleteHits(), '前提: 削除の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, DETAIL_INITIAL_DESCRIPTORS);
  });

  test('詳細画面で内訳書の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 内訳書の取得（GET /api/itemized-statements/:id）だけを 400 に差し替える
    const detailHits = await routeFailure(
      page,
      `/api/itemized-statements/${statementId}`,
      'GET',
      400
    );
    await page.goto(`/itemized-statements/${statementId}`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(detailHits(), '前提: 内訳書の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('詳細画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openDetailPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, DETAIL_INITIAL_DESCRIPTORS);
  });

  // ==========================================================================
  // 詳細画面のダイアログ
  // ==========================================================================

  test('詳細画面の削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await pressByKeyboard(page, '削除');
    const dialog = page.getByRole('dialog', { name: '内訳書の削除' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    // 開いたときはキャンセルの釦がフォーカスを受ける
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeFocused();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "キャンセル"', 'button "削除"']);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
  });

  test('詳細画面の未保存の変更の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await reorderByKeyboard(page);

    // 本文のパンくずの内訳書一覧への導線をキーボードで押し、離脱の確認を出す
    await page.getByRole('main').getByRole('link', { name: '内訳書一覧' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '変更が保存されていません' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByRole('button', { name: 'このページにとどまる' })).toBeFocused();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "このページにとどまる"', 'button "ページを離れる"']);

    // とどまる（Escape）と、画面と未保存の変更はそのまま残る
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/itemized-statements/${statementId}$`));
    await expect(page.getByRole('button', { name: '並び順を保存' })).toBeVisible();
  });

  // ==========================================================================
  // 内訳書一覧と、プロジェクト詳細の内訳書のセクション（網羅のための見張り）
  // ==========================================================================

  test('内訳書一覧の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page);
    await expect(page.getByTestId('statement-list')).toBeVisible({ timeout: getTimeout(10000) });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, LIST_DESCRIPTORS);
  });

  test('内訳書一覧のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openListPage(page);
    await expect(page.getByTestId('statement-list')).toBeVisible({ timeout: getTimeout(10000) });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, LIST_DESCRIPTORS);
  });

  test('内訳書一覧の削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page);
    await expect(page.getByTestId('statement-list')).toBeVisible({ timeout: getTimeout(10000) });
    await pressByKeyboard(page, '削除');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '内訳書を削除' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, DIALOG_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "キャンセル"', 'button "削除"']);
  });

  test('内訳書一覧の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 一覧の取得（GET /api/projects/:projectId/itemized-statements）だけを 400 に差し替える
    const listHits = await routeFailure(
      page,
      `/api/projects/${projectId}/itemized-statements`,
      'GET',
      400
    );
    await page.goto(`/projects/${projectId}/itemized-statements`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(listHits(), '前提: 一覧の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('内訳書一覧で内訳書が無く数量表のある本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page, qtOnlyProjectId);
    await expect(page.getByText('内訳書はまだありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...listNavDescriptors(QT_ONLY_PROJECT_NAME),
      'a "内訳書を新規作成"',
      'a "新規作成"',
    ]);
  });

  test('内訳書一覧で数量表も無い本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page, emptyProjectId);
    await expect(page.getByText('まず数量表を作成してください')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [...listNavDescriptors(EMPTY_PROJECT_NAME), 'a "数量表を作成"']);
  });

  /** プロジェクト詳細の内訳書のセクションの 3 通りと、その中で Tab が止まる要素 */
  const SECTION_CASES: ReadonlyArray<{
    title: string;
    targetProjectId: () => string;
    descriptors: string[];
  }> = [
    {
      title: '内訳書のある',
      targetProjectId: () => projectId,
      descriptors: [
        'a "内訳書を新規作成"',
        'a "すべて見る"',
        `a "${STATEMENT_NAME}の内訳書詳細を見る"`,
        `a "${PAGED_STATEMENT_NAME}の内訳書詳細を見る"`,
      ],
    },
    {
      title: '内訳書が無く数量表のある',
      targetProjectId: () => qtOnlyProjectId,
      descriptors: ['a "新規作成"'],
    },
    {
      title: '数量表も無い',
      targetProjectId: () => emptyProjectId,
      descriptors: ['a "数量表を作成"'],
    },
  ];

  for (const sectionCase of SECTION_CASES) {
    test(`プロジェクト詳細の${sectionCase.title}内訳書のセクションの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ`, async ({
      page,
    }) => {
      await page.goto(`/projects/${sectionCase.targetProjectId()}`);
      const section = page.getByTestId('itemized-statement-section');
      // 内訳書のセクションの読み込みが終わり、件数の表示が出るのを待つ
      await expect(section.getByTestId('itemized-statement-section-skeleton')).toHaveCount(0, {
        timeout: getTimeout(15000),
      });
      await expect(section.getByText(/^全\d+件$/)).toBeVisible({ timeout: getTimeout(15000) });
      await resetFocusToDocumentStart(page);

      // 他のスペックのセクションの要素は範囲の外として読み飛ばし、内訳書のセクションだけを巡る
      const visits = await walkFocusWithin(page, SECTION_SCOPE, SECTION_WALK_MAX_STEPS);

      expectClearFocusWalk(visits, sectionCase.descriptors);
    });
  }
});
