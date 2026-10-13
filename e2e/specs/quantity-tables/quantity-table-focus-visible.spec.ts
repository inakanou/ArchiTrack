/**
 * @fileoverview 数量表の一覧・作成画面・編集画面のフォーカス表示のE2Eテスト
 *
 * Task 102.1: 数量表の部品・ページ（AutocompleteInput・CalculationFields・CalculationMethodSelect・
 * CopyQuantityTableDialog・EditableQuantityItemRow・QuantityGroupCard・QuantityTableCreatePage・
 * QuantityTableListPage）のインラインの outline の打ち消しを外し、フォーカス表示を共通の
 * :focus-visible の輪に一本化する。併せて、本スペックの画面でフォーカスを受ける要素を状態ごとに
 * 網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカス中の要素の縁が、中身を切り取る祖先（overflow が visible 以外。数量項目の表の
 *       水平スクロールのラッパー `item-table-scroll-*` など）の内側に見えている辺では、その縁の外側へ
 *       描く輪（outline-offset と outline-width の分）も祖先の縁で欠けない。要素の縁そのものが祖先の
 *       外にある辺（スクロールや配置で要素が部分的に表示域の外にある状態）は、輪の描き方の問題では
 *       ないため数えない
 *   (3) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 数量表一覧の本文（3 件）・モバイル幅（375px）の本文・一覧の取得に失敗した本文（再試行の釦）・
 *     数量表が無いプロジェクトの本文・名前の編集で空の名前を確定して誤りを表示した本文、
 *     削除の確認のダイアログ・コピーのダイアログ・コピーの要求が失敗したダイアログ
 *   - 作成画面の初期の本文・数量表名を空にした本文（作成の釦は無効で止まらない）・作成の要求が
 *     失敗した本文・モバイル幅（375px）の本文
 *   - 編集画面の初期の本文（1 グループに計算方法の 4 通りの項目を 1 件ずつ）・モバイル幅（375px）の
 *     本文・グループの無い数量表の本文・数量表の取得に失敗した本文（再試行の釦）・入力の誤りと
 *     範囲外の警告を表示した本文・保存の要求が失敗した本文・項目を選択して一括操作の釦が出た本文
 *     （2 グループの数量表）、オートコンプリートの候補を開いた欄、グループ名の編集中の欄（フォーカスを
 *     失うと確定して見出しへ戻るため、一巡せず欄そのものを測る）、項目のアクションメニュー（body 直下の Portal。範囲は role="menu"）、
 *     グループの削除の確認・項目の移動先の選択・インポート・現場調査の選択・写真の選択の
 *     各ダイアログ
 *   本スペックの画面の部品のうち、Task 102.1 の変更の前から満たしていたもの（一覧の本文、
 *   ダイアログの釦、アクションメニュー等）は、網羅のための見張りとして置く
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 状態はキーボードの操作で作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。
 * 失敗は page.route でその要求だけをパスで判定して差し替え、テスト用の DB の数量表を書き換えない。
 * いずれの失敗も API クライアントが再試行しない 4xx で作り、要求が 1 件だけ送られたことを確かめる。
 * 測るプロジェクト・数量表は、テスト用の DB へ直接作る。作成日時は固定の日付にする。
 * 判定の作法は e2e/specs/itemized-statements/itemized-statement-focus-visible.spec.ts に倣い、
 * (2) の輪の切り取りの測定をこの側で足す。
 * 画面からは計算済みスタイルと矩形の生の値だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (quantity-table-generation):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 102.1 は、数量表の一覧・作成画面・編集画面の上で steering の方針の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page, type Route } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

// ============================================================================
// フォーカス表示の判定（itemized-statement-focus-visible.spec.ts と同じ基準に、輪の切り取りを足す）
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
  /** 要素の枠の矩形（ビューポートの座標） */
  rect: Box;
  /** 中身を切り取る祖先（overflow が visible 以外）の、枠とスクロールバーを除いた内側の矩形（内側から外側の順） */
  clipAncestors: Array<Box & { name: string }>;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
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
    const box = el.getBoundingClientRect();
    const clipAncestors: Array<Box & { name: string }> = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const nodeStyle = view.getComputedStyle(node);
      if (nodeStyle.overflowX === 'visible' && nodeStyle.overflowY === 'visible') continue;
      const nodeBox = node.getBoundingClientRect();
      const testId = node.getAttribute('data-testid');
      clipAncestors.push({
        // 数量項目の表のラッパーの名前はグループの ID を含むため、接頭辞だけを名前にする
        name: testId
          ? testId.replace(/^(item-table-scroll)-.*$/, '$1')
          : node.tagName.toLowerCase(),
        left: nodeBox.left + node.clientLeft,
        top: nodeBox.top + node.clientTop,
        right: nodeBox.left + node.clientLeft + node.clientWidth,
        bottom: nodeBox.top + node.clientTop + node.clientHeight,
      });
    }
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
      rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      clipAncestors,
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

/** 切り取りの判定でサブピクセルの丸めを吸収する許容（px） */
const CLIP_TOLERANCE_PX = 0.5;

/**
 * 要素の縁が中身を切り取る祖先の内側に見えているのに、その縁の外側へ描く輪（outline-offset と
 * outline-width の分）が祖先の縁で欠ける辺と量を説明する（欠けなければ null）。輪の無い要素
 * （none / hidden）は測らない。
 * 要素の縁そのものが祖先の外にある辺（要素が表示域から部分的にはみ出す状態）は数えない。
 * その辺は輪の描き方では見せられず、スクロールや配置の側の問題であり、フォーカス表示の判定の外に置く
 */
function findOutlineClip(snapshot: FocusSnapshot): string | null {
  if (['none', 'hidden'].includes(snapshot.outlineStyle)) return null;
  const extent = parseFloat(snapshot.outlineOffset) + parseFloat(snapshot.outlineWidth);
  for (const ancestor of snapshot.clipAncestors) {
    // 辺ごとに、要素の縁と輪の外周が祖先の縁を越える量（正なら越える）
    const sides: Array<[string, number]> = [
      ['左', ancestor.left - snapshot.rect.left],
      ['上', ancestor.top - snapshot.rect.top],
      ['右', snapshot.rect.right - ancestor.right],
      ['下', snapshot.rect.bottom - ancestor.bottom],
    ];
    const clipped = sides
      .filter(([, edgeOver]) => edgeOver <= CLIP_TOLERANCE_PX)
      .map(([side, edgeOver]): [string, number] => [side, edgeOver + extent])
      .filter(([, ringOver]) => ringOver > CLIP_TOLERANCE_PX);
    if (clipped.length > 0) {
      return `${ancestor.name} が ${clipped
        .map(([side, amount]) => `${side} ${amount.toFixed(1)}px`)
        .join('・')} を切り取る`;
    }
  }
  return null;
}

/** 一巡の結果から、明確なフォーカス表示を欠く要素と、離れても表示が残る要素の一覧を作る（空なら満たす） */
function collectFocusIndicatorViolations(visits: FocusVisit[]): string[] {
  return visits.flatMap((visit) => {
    const violations = collectFocusedViolations(visit.focused);
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

/** フォーカス中の要素が明確な表示を欠くか、輪が祖先に切り取られるときの説明の一覧（空なら満たす） */
function collectFocusedViolations(focused: FocusSnapshot): string[] {
  const violations: string[] = [];
  if (!findClearFocusIndicator(focused)) {
    violations.push(
      `フォーカス中に明確な表示が無い: ${focused.descriptor} ` +
        `(outline=${focused.outlineStyle} ${focused.outlineWidth} ${focused.outlineColor}, ` +
        `box-shadow=${focused.boxShadow})`
    );
  }
  const clip = findOutlineClip(focused);
  if (clip) {
    violations.push(`フォーカス中の輪が祖先に切り取られる: ${focused.descriptor} (${clip})`);
  }
  return violations;
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

/** 本文（main）とダイアログ・メニューで Tab を押す上限。文書の先頭から編集画面の本文（約 90 要素）を抜けて余る回数 */
const WALK_MAX_STEPS = 200;
/** 画面の本文 */
const MAIN_SCOPE = 'main';
/** ダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';
/** 項目のアクションメニュー（body 直下の Portal） */
const MENU_SCOPE = '[role="menu"]';

/** 数量表を持つプロジェクトの名称 */
const PROJECT_NAME = 'E2E数量表フォーカス表示用プロジェクト';
/** 数量表の無いプロジェクトの名称 */
const EMPTY_PROJECT_NAME = 'E2E数量表フォーカス表示用空のプロジェクト';
/** 計算方法の 4 通りの項目を持つ数量表の名称 */
const TABLE_NAME = 'フォーカス測定数量表';
/** グループの無い数量表の名称 */
const EMPTY_TABLE_NAME = 'フォーカス測定空の数量表';
/** 2 グループ（各 1 項目）の数量表の名称（グループの並び替えの釦と項目の移動先の選択を測る） */
const MOVE_TABLE_NAME = 'フォーカス測定移動用数量表';
/** 計算方法の 4 通りの項目を持つグループの名称 */
const GROUP_NAME = 'フォーカス測定グループ';
/** 移動用の数量表の 2 グループの名称 */
const MOVE_SOURCE_GROUP_NAME = '移動元グループ';
const MOVE_TARGET_GROUP_NAME = '移動先グループ';

/** 失敗の応答の本文（RFC 7807） */
const FAILURE_DETAIL = 'E2E のフォーカス表示の測定のための失敗';

let projectId: string;
let emptyProjectId: string;
let tableId: string;
let emptyTableId: string;
let moveTableId: string;

/**
 * 計算方法の 4 通りの項目（数量は各計算方法の式で求まる値に合わせる）。
 * 面積・体積は 幅 2 × 奥行き 3 = 6、ピッチは (範囲長 10 − 端長 1 − 端長 1) ÷ ピッチ長 2 + 1 = 5、
 * 箇所数は 3
 */
const ITEMS = [
  { name: '標準項目', calculationMethod: 'STANDARD', calculationParams: undefined, quantity: 1 },
  {
    name: '面積体積項目',
    calculationMethod: 'AREA_VOLUME',
    calculationParams: { width: 2, depth: 3 },
    quantity: 6,
  },
  {
    name: 'ピッチ項目',
    calculationMethod: 'PITCH',
    calculationParams: { rangeLength: 10, endLength1: 1, endLength2: 1, pitchLength: 2 },
    quantity: 5,
  },
  { name: '箇所数項目', calculationMethod: 'COUNT', calculationParams: { count: 3 }, quantity: 3 },
] as const;

/** 測定用の 2 つのプロジェクトと、数量表 3 件（4 項目・グループ無し・2 グループ）を作る */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  const createProject = async (name: string): Promise<string> =>
    (
      await prisma.project.create({
        data: { name, status: 'PREPARING', salesPersonId: testUser.id, createdById: testUser.id },
      })
    ).id;
  projectId = await createProject(PROJECT_NAME);
  emptyProjectId = await createProject(EMPTY_PROJECT_NAME);

  tableId = (
    await prisma.quantityTable.create({
      data: {
        projectId,
        name: TABLE_NAME,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        groups: {
          create: [
            {
              name: GROUP_NAME,
              displayOrder: 0,
              items: {
                create: ITEMS.map((item, index) => ({
                  workType: 'フォーカス工種',
                  name: item.name,
                  unit: '式',
                  calculationMethod: item.calculationMethod,
                  calculationParams: item.calculationParams,
                  quantity: item.quantity,
                  displayOrder: index,
                })),
              },
            },
          ],
        },
      },
    })
  ).id;
  emptyTableId = (
    await prisma.quantityTable.create({
      data: {
        projectId,
        name: EMPTY_TABLE_NAME,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    })
  ).id;
  moveTableId = (
    await prisma.quantityTable.create({
      data: {
        projectId,
        name: MOVE_TABLE_NAME,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        groups: {
          create: [MOVE_SOURCE_GROUP_NAME, MOVE_TARGET_GROUP_NAME].map((groupName, index) => ({
            name: groupName,
            displayOrder: index,
            items: {
              create: [
                {
                  workType: 'フォーカス工種',
                  name: `${groupName}の項目`,
                  unit: '式',
                  quantity: 1,
                  displayOrder: 0,
                },
              ],
            },
          })),
        },
      },
    })
  ).id;
}

/** 測定用のプロジェクトと、その下の数量表（グループと項目は数量表とともに消える）を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった分は undefined のため除く（空の in は何も消さない）
  const projectIds = [projectId, emptyProjectId].filter((id): id is string => !!id);
  const prisma = getPrismaClient();
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

/** パンくずの、ダッシュボードからプロジェクトまでの 3 つの導線 */
function breadcrumbToProject(projectName: string): string[] {
  return ['a "ダッシュボード"', 'a "プロジェクト一覧"', `a "${projectName}"`];
}

/** 数量表一覧の、パンくずから新規作成の導線までの要素（数量表が無いときは空の表示の導線） */
function listNavDescriptors(projectName: string): string[] {
  return [...breadcrumbToProject(projectName), 'a "プロジェクト詳細に戻る"', 'a "新規作成"'];
}

/** 数量表一覧のカードの導線と、名前の編集・コピー・削除の釦 */
function listCardDescriptors(tableName: string): string[] {
  return [
    `a "${tableName}の数量表詳細を見る"`,
    'button "名前を編集"',
    'button "コピー"',
    'button "削除"',
  ];
}

/** 数量表一覧の本文が Tab で止まる要素（作成日の新しい順） */
const LIST_DESCRIPTORS = [
  ...listNavDescriptors(PROJECT_NAME),
  ...listCardDescriptors(TABLE_NAME),
  ...listCardDescriptors(EMPTY_TABLE_NAME),
  ...listCardDescriptors(MOVE_TABLE_NAME),
];

/** 作成画面の、パンくずから数量表名の欄までの要素 */
const CREATE_FORM_HEAD_DESCRIPTORS = [
  ...breadcrumbToProject(PROJECT_NAME),
  'a "数量表一覧"',
  'a "数量表一覧に戻る"',
  'input "数量表名"',
  'a "キャンセル"',
];
/** 作成画面の本文が Tab で止まる要素 */
const CREATE_FORM_DESCRIPTORS = [...CREATE_FORM_HEAD_DESCRIPTORS, 'button "作成"'];

/** 編集画面の、パンくずから見出しの操作の釦までの要素 */
const EDIT_HEADER_DESCRIPTORS = [
  ...breadcrumbToProject(PROJECT_NAME),
  'a "数量表一覧"',
  'a "数量表一覧に戻る"',
  'input "数量表名"',
  'button "インポート"',
  'button "PDF出力"',
  'button "保存"',
  'button "グループを追加"',
  'button "現場調査から一括追加"',
];

/** グループのカードの見出しから写真の選択までの要素（並び替えの釦は有効なものだけが止まる） */
function groupHeadDescriptors(groupName: string, sortButtons: string[] = []): string[] {
  return [
    'button "グループを折りたたむ"',
    `h3 "${groupName}"`,
    ...sortButtons,
    'button "グループをコピー"',
    'button "グループを削除"',
    'div "写真を選択"',
  ];
}

/** 項目の行の 1 段目の欄・計算方法・数量・単位・備考と、選択とアクションの釦 */
const ITEM_ROW_DESCRIPTORS = [
  'input "大項目"',
  'input "中項目"',
  'input "小項目"',
  'input "任意分類"',
  'input "工種"',
  'input "名称"',
  'input "規格"',
  'select "計算方法"',
  'input "数量"',
  'input "単位"',
  'input "備考"',
  'input "項目を選択"',
  'button "アクション"',
];

/** 計算方法ごとの、項目の行の 2 段目の計算の欄（標準は 2 段目を持たない） */
const CALCULATION_FIELD_DESCRIPTORS: Record<(typeof ITEMS)[number]['calculationMethod'], string[]> =
  {
    STANDARD: [],
    AREA_VOLUME: [
      'input "幅（W）"',
      'input "奥行き（D）"',
      'input "高さ（H）"',
      'input "重量"',
      'input "調整係数"',
      'input "丸め設定"',
    ],
    PITCH: [
      'input "範囲長"',
      'input "端長1"',
      'input "端長2"',
      'input "ピッチ長"',
      'input "長さ"',
      'input "重量"',
      'input "調整係数"',
      'input "丸め設定"',
    ],
    COUNT: [
      'input "箇所数"',
      'input "長さ"',
      'input "重量"',
      'input "調整係数"',
      'input "丸め設定"',
    ],
  };

/** 計算方法の 4 通りの項目を持つグループの、見出しから項目の追加の釦までの要素 */
const GROUP_DESCRIPTORS = [
  ...groupHeadDescriptors(GROUP_NAME),
  ...ITEMS.flatMap((item) => [
    ...ITEM_ROW_DESCRIPTORS,
    ...CALCULATION_FIELD_DESCRIPTORS[item.calculationMethod],
  ]),
  'button "項目を追加"',
];

/** 編集画面の初期の本文が Tab で止まる要素 */
const EDIT_INITIAL_DESCRIPTORS = [...EDIT_HEADER_DESCRIPTORS, ...GROUP_DESCRIPTORS];

/** 数量表一覧を開き、見出しの表示を待つ */
async function openListPage(page: Page, targetProjectId: string = projectId): Promise<void> {
  await page.goto(`/projects/${targetProjectId}/quantity-tables`);
  await expect(page.getByRole('heading', { name: '数量表一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 数量表一覧を開き、数量表のカードの表示を待つ */
async function openListPageWithTables(page: Page): Promise<void> {
  await openListPage(page);
  await expect(page.getByRole('link', { name: `${TABLE_NAME}の数量表詳細を見る` })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 作成画面を開き、見出しの表示を待つ */
async function openCreatePage(page: Page): Promise<void> {
  await page.goto(`/projects/${projectId}/quantity-tables/new`);
  await expect(page.getByRole('heading', { name: '数量表を新規作成', level: 1 })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 編集画面を開き、数量表名の欄の表示を待つ */
async function openEditPage(page: Page, targetTableId: string = tableId): Promise<void> {
  await page.goto(`/quantity-tables/${targetTableId}/edit`);
  await expect(page.getByRole('textbox', { name: '数量表名' })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 本文の釦をキーボードで押す（同じ名前の釦が複数あるときは文書の先の方） */
async function pressByKeyboard(page: Page, name: string): Promise<void> {
  await page.getByRole('main').getByRole('button', { name, exact: true }).first().focus();
  await page.keyboard.press('Enter');
}

/** 編集画面の項目の行（文書の並び順） */
function itemRows(page: Page) {
  return page.getByTestId('quantity-item-row');
}

test.describe('数量表の画面のフォーカス表示', () => {
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
  // 数量表一覧
  // ==========================================================================

  test('数量表一覧の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPageWithTables(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, LIST_DESCRIPTORS);
  });

  test('数量表一覧のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openListPageWithTables(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, LIST_DESCRIPTORS);
  });

  test('数量表一覧の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 一覧の取得（GET /api/projects/:projectId/quantity-tables）だけを 400 に差し替える
    const listHits = await routeFailure(
      page,
      `/api/projects/${projectId}/quantity-tables`,
      'GET',
      400
    );
    await page.goto(`/projects/${projectId}/quantity-tables`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(listHits(), '前提: 一覧の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('数量表一覧で数量表が無い本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page, emptyProjectId);
    await expect(page.getByRole('main').getByText('全0件')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, listNavDescriptors(EMPTY_PROJECT_NAME));
  });

  test('数量表一覧で名前の編集の誤りを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPageWithTables(page);
    await pressByKeyboard(page, '名前を編集');
    const nameInput = page.getByRole('textbox', { name: '数量表名を編集' });
    await expect(nameInput).toBeFocused();
    // 名前を空にして Enter で確定し、誤りを表示する（入力欄は編集中のまま残る）
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    // 編集中のカードは導線と名前の編集の釦に代わり、名前の欄が止まる
    expectClearFocusWalk(visits, [
      ...listNavDescriptors(PROJECT_NAME),
      'input "数量表名を編集"',
      'button "コピー"',
      'button "削除"',
      ...listCardDescriptors(EMPTY_TABLE_NAME),
      ...listCardDescriptors(MOVE_TABLE_NAME),
    ]);
  });

  test('数量表一覧の削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPageWithTables(page);
    await pressByKeyboard(page, '削除');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '数量表を削除' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "キャンセル"', 'button "削除"']);
  });

  test('数量表一覧のコピーのダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPageWithTables(page);
    await pressByKeyboard(page, 'コピー');
    await expect(page.getByRole('dialog', { name: '数量表をコピー' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "数量表名"',
      'button "キャンセル"',
      'button "コピーを作成"',
    ]);
  });

  test('数量表一覧でコピーの失敗を表示したダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // コピーの要求（POST /api/quantity-tables/:id/copy）だけを 400 に差し替える
    const copyHits = await routeFailure(page, `/api/quantity-tables/${tableId}/copy`, 'POST', 400);
    await openListPageWithTables(page);
    await pressByKeyboard(page, 'コピー');
    const dialog = page.getByRole('dialog', { name: '数量表をコピー' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: 'コピーを作成' }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog.getByRole('alert')).toBeVisible({ timeout: getTimeout(10000) });
    expect(copyHits(), '前提: コピーの要求が 1 件送られる').toBe(1);
    // 失敗の後も名前は保持され、部品は再び操作できる
    await expect(dialog.getByRole('textbox', { name: '数量表名' })).toHaveValue(
      `${TABLE_NAME}のコピー`
    );
    await expect(dialog.getByRole('button', { name: 'コピーを作成' })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "数量表名"',
      'button "キャンセル"',
      'button "コピーを作成"',
    ]);
  });

  // ==========================================================================
  // 作成画面
  // ==========================================================================

  test('作成画面の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で数量表名を空にした本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    await page.getByRole('textbox', { name: '数量表名' }).fill('');
    // 名前が空の間は作成の釦が無効になり、Tab で止まらない
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeDisabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_HEAD_DESCRIPTORS);
  });

  test('作成画面で作成の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 作成の要求（POST /api/projects/:projectId/quantity-tables）だけを 400 に差し替える
    const createHits = await routeFailure(
      page,
      `/api/projects/${projectId}/quantity-tables`,
      'POST',
      400
    );
    await openCreatePage(page);
    await pressByKeyboard(page, '作成');

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      '数量表の作成に失敗しました',
      { timeout: getTimeout(10000) }
    );
    expect(createHits(), '前提: 作成の要求が 1 件送られる').toBe(1);
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  // ==========================================================================
  // 編集画面の本文
  // ==========================================================================

  test('編集画面の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await expect(itemRows(page)).toHaveCount(ITEMS.length);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_INITIAL_DESCRIPTORS);
  });

  test('編集画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openEditPage(page);
    await expect(itemRows(page)).toHaveCount(ITEMS.length);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_INITIAL_DESCRIPTORS);
  });

  test('編集画面でグループの無い数量表の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page, emptyTableId);
    await expect(page.getByTestId('quantity-group-card')).toHaveCount(0);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    // 空の表示のグループの追加の釦が、見出しの釦の後に止まる
    expectClearFocusWalk(visits, [...EDIT_HEADER_DESCRIPTORS, 'button "グループを追加"']);
  });

  test('編集画面で数量表の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 数量表の取得（GET /api/quantity-tables/:id）だけを 400 に差し替える
    const detailHits = await routeFailure(page, `/api/quantity-tables/${tableId}`, 'GET', 400);
    await page.goto(`/quantity-tables/${tableId}/edit`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(detailHits(), '前提: 数量表の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('編集画面で入力の誤りと範囲外の警告を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    // 1 行目の名称（必須）を空にして離れ、誤りを表示する
    const nameInput = itemRows(page).nth(0).locator('input[id$="-name"]');
    await nameInput.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Tab');
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    // 2 行目（面積・体積）の幅へ範囲外の値（上限 9999999.99 を超える）を入れて離れ、警告を表示する
    const widthInput = itemRows(page).nth(1).getByLabel('幅（W）', { exact: true });
    await widthInput.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('99999999');
    await page.keyboard.press('Tab');
    await expect(itemRows(page).nth(1).getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_INITIAL_DESCRIPTORS);
  });

  test('編集画面で保存の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 保存の要求（PUT /api/quantity-tables/:id/save）だけを 400 に差し替える
    const saveHits = await routeFailure(page, `/api/quantity-tables/${tableId}/save`, 'PUT', 400);
    await openEditPage(page);
    await itemRows(page).nth(0).locator('input[id$="-remarks"]').focus();
    await page.keyboard.type('備考');
    await pressByKeyboard(page, '保存');

    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(saveHits(), '前提: 保存の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    // 失敗の表示を閉じる釦が、見出しの釦とグループの間に止まる
    expectClearFocusWalk(visits, [
      ...EDIT_HEADER_DESCRIPTORS,
      'button "エラーを閉じる"',
      ...GROUP_DESCRIPTORS,
    ]);
  });

  test('編集画面でグループ名の編集中の欄が明確なフォーカス表示を持ち、輪が切り取られない', async ({
    page,
  }) => {
    await openEditPage(page);
    // グループ名の見出しをキーボードで押すと、編集の欄へ置き換わってフォーカスを受ける。
    // 欄はフォーカスを失うと確定して見出しへ戻るため、一巡ではなく、フォーカスを受けた欄そのものを測る
    await page.getByRole('main').getByRole('button', { name: GROUP_NAME }).focus();
    await page.keyboard.press('Enter');
    const nameInput = page.getByRole('textbox', { name: 'グループ名を編集' });
    await expect(nameInput).toBeFocused();

    const focused = await snapshotFocusStyle(await activeElementHandle(page), MAIN_SCOPE);

    expect(focused.descriptor).toBe('input "グループ名を編集"');
    // 共通の :focus-visible の実線の輪（2px）で示され、祖先の縁でも欠けない
    expect(findClearFocusIndicator(focused)).toMatch(/^outline solid 2px \(contrast /);
    expect(collectFocusedViolations(focused)).toEqual([]);

    // Tab で離れると確定して見出しへ戻る（名前は変えていない）
    await page.keyboard.press('Tab');
    await expect(page.getByRole('main').getByRole('button', { name: GROUP_NAME })).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  test('編集画面で項目を選択して一括操作の釦が出た本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page, moveTableId);
    await itemRows(page).nth(0).getByRole('checkbox', { name: '項目を選択' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('quantity-item-bulk-action-bar')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    // 先頭のグループは下へ、末尾のグループは上へだけ移せる（無効の釦は止まらない）
    expectClearFocusWalk(visits, [
      ...EDIT_HEADER_DESCRIPTORS,
      ...groupHeadDescriptors(MOVE_SOURCE_GROUP_NAME, ['button "下へ移動"']),
      ...ITEM_ROW_DESCRIPTORS,
      'button "項目を追加"',
      ...groupHeadDescriptors(MOVE_TARGET_GROUP_NAME, ['button "上へ移動"']),
      ...ITEM_ROW_DESCRIPTORS,
      'button "項目を追加"',
      'button "選択した項目をコピー"',
      'button "選択した項目を移動"',
      'button "選択した項目を削除"',
      'button "選択を解除"',
    ]);
  });

  test('編集画面でオートコンプリートの候補を開いた欄が明確なフォーカス表示を持ち、輪が切り取られない', async ({
    page,
  }) => {
    await openEditPage(page);
    const workTypeInput = itemRows(page).nth(0).locator('input[id$="-workType"]');
    await workTypeInput.focus();
    // 候補は他の行の工種（フォーカス工種）から出る。入力は変換を経ない文字の打鍵で行う
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('フォ');
    await expect(page.getByRole('listbox', { name: '工種の候補' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(workTypeInput).toBeFocused();

    const focused = await snapshotFocusStyle(await activeElementHandle(page), MAIN_SCOPE);

    expect(focused.descriptor).toBe('input "工種"');
    // 共通の :focus-visible の実線の輪（2px）で示され、祖先の縁でも欠けない
    expect(findClearFocusIndicator(focused)).toMatch(/^outline solid 2px \(contrast /);
    expect(collectFocusedViolations(focused)).toEqual([]);
  });

  // ==========================================================================
  // 編集画面のメニューとダイアログ
  // ==========================================================================

  test('編集画面の項目のアクションメニューの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    // 中ほどの行（上へも下へも移せる）のメニューをキーボードで開く
    await itemRows(page).nth(1).getByRole('button', { name: 'アクション' }).focus();
    await page.keyboard.press('Enter');
    // メニューは body 直下の Portal に描かれるため、行の中ではなく画面から引く
    await expect(page.getByRole('menu')).toBeVisible({ timeout: getTimeout(10000) });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MENU_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'button "↑上へ移動"',
      'button "↓下へ移動"',
      'button "📋コピー"',
      'button "➡別グループに移動"',
      'button "🗑削除"',
    ]);
  });

  test('編集画面のグループの削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await pressByKeyboard(page, 'グループを削除');
    await expect(page.getByRole('dialog', { name: 'グループを削除しますか？' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "キャンセル"', 'button "削除する"']);
  });

  test('編集画面の項目の移動先の選択のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page, moveTableId);
    await itemRows(page).nth(0).getByRole('checkbox', { name: '項目を選択' }).focus();
    await page.keyboard.press('Space');
    await pressByKeyboard(page, '選択した項目を移動');
    await expect(page.getByRole('dialog', { name: '1件の項目を移動' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    // 現在のグループの選択肢と、移動先を選ぶまでの移動の釦は無効で止まらない
    expectClearFocusWalk(visits, [
      'button "閉じる"',
      `input "${MOVE_TARGET_GROUP_NAME}"`,
      'button "キャンセル"',
    ]);
  });

  test('編集画面のインポートのダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await pressByKeyboard(page, 'インポート');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "閉じる"', 'input "ファイルを選択"']);
  });

  test('編集画面の現場調査の選択のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await page.getByTestId('bulk-create-from-survey-button').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    // 現場調査の無いプロジェクトのため、一覧の読み込みが終わると空の表示になる
    await expect(dialog.getByText('選択可能な現場調査がありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "ダイアログを閉じる"', 'button "キャンセル"']);
  });

  test('編集画面の写真の選択のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await page.getByRole('main').getByRole('button', { name: '写真を選択' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    // 注釈付きの写真の無いプロジェクトのため、読み込みが終わると空の表示になる
    await expect(dialog.getByTestId('photo-list-empty')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "ダイアログを閉じる"']);
  });
});
