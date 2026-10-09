/**
 * @fileoverview 現場調査の一覧・作成・編集・詳細・画像の閲覧と注釈編集の画面のフォーカス表示のE2Eテスト
 *
 * Task 116.1: 現場調査の部品・ページ（SiteSurveyForm・AnnotationToolbar・ImageUploader・ZoomControls・
 * SiteSurveyListPage）のインラインの outline の打ち消しと、フォームの欄の 3:1 に届かない淡い影の輪を
 * 外し、フォーカス表示を共通の :focus-visible の輪に一本化する。輪が祖先の縁で欠ける箇所（詳細画面と
 * 画像の画面のパンくずの箱、注釈エディタの領域、モバイル幅の単段のツールバー、画像のエクスポートの
 * ダイアログのスクロールの寄せ）も同じ変更で直す。併せて、本スペックの画面でフォーカスを受ける要素を
 * 状態ごとに網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカス中の要素の縁が、中身を切り取る祖先（overflow が visible 以外）の内側に見えている辺
 *       では、その縁の外側へ描く輪（outline-offset と outline-width の分）も祖先の縁で欠けない。
 *       要素の縁そのものが祖先の外にある辺は、輪の描き方の問題ではないため数えない
 *   (3) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 一覧: 表の表示・グリッドの表示・リストの表示・モバイル幅（375px）のカード・現場調査が無い
 *     プロジェクト・一覧の取得の失敗（再試行の釦）
 *   - 作成画面: 初期の表示・入力の誤り（調査名と調査日を空に、メモを上限超えに）・作成の失敗・
 *     モバイル幅（375px）
 *   - 編集画面: 初期の表示・保存の失敗
 *   - 詳細画面: 画像 2 枚の本文・モバイル幅（375px）・画像の選択とメタデータの変更で保存と選択画像の
 *     エクスポートの釦が出た本文・アップロードの失敗で未送信の画像が残った本文・取得の失敗、
 *     現場調査の削除の確認・一括エクスポートの設定・一括エクスポートの処理中・一部失敗の案内の
 *     各ダイアログ
 *   - 画像の画面: 閲覧モード・編集モード（選択・テキスト・円の道具）・モバイル幅（375px）の編集モード
 *     （テキストの道具）・注釈の保存の失敗・取得の失敗、画像のエクスポート・未保存の注釈の復元の確認・
 *     寸法値の入力の各ダイアログ
 *   詳細画面の写真の追加の枠（ImageUploader）は、工事写真の詳細画面にも描かれる共有の部品であり、
 *   工事写真の側は e2e/specs/construction-photos/construction-photo-focus-visible.spec.ts が測る。
 *   本スペックの部品のうち、Task 116.1 の変更の前から満たしていたもの（一覧の表と
 *   カード・詳細画面の写真管理パネル・各ダイアログ等）は、網羅のための見張りとして置く
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 状態はキーボードの操作で作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。寸法値の入力のダイアログだけは
 * キャンバス上のドラッグでしか開かないため、ドラッグの後に Tab でダイアログを一巡する。
 * 失敗は page.route でその要求だけをパスで判定して差し替え、テスト用の DB の現場調査を書き換えない。
 * 失敗は API クライアントが再試行しない 4xx で作り、要求が 1 件だけ送られたことを確かめる
 * （アップロードの失敗だけは、再送の釦も測るため再送可能に分類される 503 で作り、送られた件数を確かめる）。
 * 測る現場調査の名前と調査日は固定の値にし、表の行は更新日（作成の当日）に依らない先頭の文言で照合する。
 * 判定の作法は e2e/specs/quantity-tables/quantity-table-focus-visible.spec.ts に倣う。
 * 画面からは計算済みスタイルと矩形の生の値だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (site-survey):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 116.1 は、現場調査の一覧・作成・編集・詳細・画像の閲覧と注釈編集の画面の上で
 * steering の方針の下限へ揃える。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  test,
  expect,
  type Browser,
  type ElementHandle,
  type Page,
  type Route,
} from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import { seedProject, type SeededProject } from '../../helpers/project-list-preconditions';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

// ============================================================================
// フォーカス表示の判定（quantity-table-focus-visible.spec.ts と同じ基準。輪の切り取りも測る）
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
        name: testId ?? node.tagName.toLowerCase(),
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

/** 本文（main）とダイアログで Tab を押す上限。文書の先頭から画像の画面の本文（約 40 要素）を抜けて余る回数 */
const WALK_MAX_STEPS = 200;
/** 画面の本文 */
const MAIN_SCOPE = 'main';
/** ダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';
/** 一括エクスポートの一部失敗の案内 */
const ALERT_DIALOG_SCOPE = '[role="alertdialog"]';
/** モバイル幅 */
const MOBILE_VIEWPORT = { width: 375, height: 812 };

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');
/**
 * 1 枚目の画像（画像の画面で開く）は 1920x1080 の写真にする。1x1 の画像ではキャンバスが 1px に
 * なり、注釈エディタの領域の輪がキャンバスに重なる状態も、寸法線の描画も作れないため
 */
const FIRST_IMAGE_FIXTURE = path.join(FIXTURES_DIR, 'test-image-large.jpg');
/** 2 枚目の画像とアップロードの失敗に使う画像（小さい画像で足りる） */
const FIXTURE_JPG = path.join(FIXTURES_DIR, 'test-image.jpg');

/** 測る現場調査の名前と調査日（一覧は調査日の新しい順に並ぶ） */
const SURVEY_NAME = '焦点調査一';
const SURVEY_DATE = '2026-04-02';
const OTHER_SURVEY_NAME = '焦点調査二';
const OTHER_SURVEY_DATE = '2026-04-01';
/** 画像の名前（追加の順に表示順が付く） */
const IMAGE_FILE_NAMES = ['focus_first.jpg', 'focus_second.jpg'] as const;
/** 未保存の注釈の下書きを置く localStorage の鍵の接頭辞（AutoSaveManager の STORAGE_KEY_PREFIX） */
const ANNOTATION_DRAFT_KEY_PREFIX = 'architrack_annotation_';

/** 失敗の応答の本文（RFC 7807） */
const FAILURE_DETAIL = 'E2E のフォーカス表示の測定のための失敗';

let project: SeededProject;
let emptyProject: SeededProject;
let surveyId: string;
let imageIds: string[] = [];

async function authHeaders(page: Page): Promise<{ Authorization: string }> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
  assertPrepared(accessToken, '認証トークン');
  return { Authorization: `Bearer ${accessToken}` };
}

/** 現場調査を API で作り、その ID を返す */
async function createSurvey(
  page: Page,
  projectId: string,
  name: string,
  surveyDate: string
): Promise<string> {
  const response = await page.request.post(
    `${API_BASE_URL}/api/projects/${projectId}/site-surveys`,
    { headers: await authHeaders(page), data: { name, surveyDate, memo: null } }
  );
  expect(response.ok(), `前提: 現場調査「${name}」が作成される (status=${response.status()})`).toBe(
    true
  );
  const body = (await response.json()) as { id: string };
  assertPrepared(body.id, `現場調査「${name}」の ID`);
  return body.id;
}

/**
 * 測定用の 2 つのプロジェクト（現場調査 2 件・現場調査の無いもの）を作り、1 件目の現場調査へ
 * 画像を 2 枚追加する
 */
async function setupTestData(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsUser(page, 'ADMIN_USER');
  project = await seedProject(page, '現場調査フォーカス表示');
  emptyProject = await seedProject(page, '現場調査フォーカス表示空');
  surveyId = await createSurvey(page, project.id, SURVEY_NAME, SURVEY_DATE);
  await createSurvey(page, project.id, OTHER_SURVEY_NAME, OTHER_SURVEY_DATE);
  imageIds = [];
  for (const [index, fileName] of IMAGE_FILE_NAMES.entries()) {
    const fixture = index === 0 ? FIRST_IMAGE_FIXTURE : FIXTURE_JPG;
    const response = await page.request.post(
      `${API_BASE_URL}/api/site-surveys/${surveyId}/images`,
      {
        headers: await authHeaders(page),
        multipart: {
          images: { name: fileName, mimeType: 'image/jpeg', buffer: fs.readFileSync(fixture) },
        },
      }
    );
    expect(
      response.ok(),
      `前提: 画像「${fileName}」を追加できる (status=${response.status()})`
    ).toBe(true);
    const body = (await response.json()) as { successful?: Array<{ id?: string }> };
    const imageId = body.successful?.[0]?.id;
    assertPrepared(imageId, `画像「${fileName}」の ID`);
    imageIds.push(imageId);
  }
  await context.close();
}

/** 測定用のプロジェクト（現場調査と画像はプロジェクトとともに消える）を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった分は undefined のため除く（空の in は何も消さない）
  const projectIds = [project?.id, emptyProject?.id].filter((id): id is string => !!id);
  await getPrismaClient().project.deleteMany({ where: { id: { in: projectIds } } });
}

/** 要求をパスとメソッドで判定し、失敗の応答へ差し替える。差し替えた件数を返す関数を返す */
async function routeFailure(
  page: Page,
  pathname: string,
  method: string,
  status: number
): Promise<() => number> {
  let hits = 0;
  // 判定はオリジンではなくパスで行う（CI とローカルでオリジンが異なるため）
  await page.route(
    (url) => url.pathname === pathname,
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

/** 現場調査の画像の原本の、表示順の経路（一括エクスポートが取得する経路） */
async function originalImagePaths(page: Page): Promise<string[]> {
  const response = await page.request.get(`${API_BASE_URL}/api/site-surveys/${surveyId}/images`, {
    headers: await authHeaders(page),
  });
  expect(response.status(), '前提: 画像の一覧を取得できる').toBe(200);
  const body = (await response.json()) as
    | Array<{ id: string; originalUrl?: string | null }>
    | { images: Array<{ id: string; originalUrl?: string | null }> };
  const images = Array.isArray(body) ? body : body.images;
  return imageIds.map((imageId) => {
    const originalUrl = images.find((image) => image.id === imageId)?.originalUrl;
    assertPrepared(originalUrl, '画像の原本の URL');
    return new URL(originalUrl).pathname;
  });
}

// ----------------------------------------------------------------------------
// 期待する一巡の並び
// ----------------------------------------------------------------------------

/** パンくずの、ダッシュボードからプロジェクトまでの 3 つの導線 */
function breadcrumbToProject(): string[] {
  return ['a "ダッシュボード"', 'a "プロジェクト一覧"', `a "${project.name}"`];
}

/** 一覧の、パンくずからクリアの釦までの要素 */
function listHeadDescriptors(projectName: string): string[] {
  return [
    'a "ダッシュボード"',
    'a "プロジェクト一覧"',
    `a "${projectName}"`,
    'a "+ 新規作成"',
    'input "検索"',
    'button "検索"',
    'input "調査日開始"',
    'input "調査日終了"',
    'select "ソート項目"',
    'select "ソート順序"',
    'button "クリア"',
  ];
}

/** 一覧の表示の切り替えの釦（デスクトップ幅だけに出る） */
const VIEW_TOGGLE_DESCRIPTORS = [
  'button "テーブル表示"',
  'button "グリッド表示"',
  'button "リスト表示"',
];

/** 正規表現の特殊文字を逃がす */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 表の行は名前を持たないため、行の文言の先頭（調査名と調査日）で名乗る（更新日は作成の当日のため照合しない） */
function rowDescriptor(name: string, surveyDate: string): unknown {
  const shownDate = surveyDate.replace(/-/g, '/');
  return expect.stringMatching(new RegExp(`^tr "${escapeRegExp(name + shownDate)}`));
}

/** グリッド・リスト・カードの表示の 1 件 */
function cardDescriptor(name: string): string {
  return `div "${name}の詳細を表示"`;
}

/** 作成・編集のフォームの欄と釦 */
function formDescriptors(submitLabel: string): string[] {
  return [
    'input "調査名"',
    'input "調査日"',
    'textarea "メモ"',
    'button "キャンセル"',
    `button "${submitLabel}"`,
  ];
}

/** 作成画面の本文が Tab で止まる要素 */
function createDescriptors(): string[] {
  return [
    ...breadcrumbToProject(),
    'a "現場調査一覧"',
    'a "← 一覧に戻る"',
    ...formDescriptors('作成'),
  ];
}

/** 編集画面の本文が Tab で止まる要素 */
function editDescriptors(): string[] {
  return [
    ...breadcrumbToProject(),
    'a "現場調査一覧"',
    `a "${SURVEY_NAME}"`,
    ...formDescriptors('保存'),
  ];
}

/** 写真の追加の枠（ImageUploader のドロップゾーン）の名乗り */
const UPLOAD_AREA_DESCRIPTOR = 'div "画像をアップロードファイルを選択またはドラッグ＆ドロップ対応"';

/** 写真の追加の枠と、カメラの釦・隠れたファイルの入力 */
const UPLOADER_DESCRIPTORS = [
  UPLOAD_AREA_DESCRIPTOR,
  'button "カメラで撮影"',
  'input "画像ファイルを選択"',
  'input "カメラで撮影"',
];

/** 写真管理パネルの画像 1 枚が Tab で止まる要素（並べ替えは先頭なら下へ、末尾なら上へだけ） */
function photoDescriptors(fileName: string, moveLabel: string): string[] {
  return [
    'div "ドラッグして順序を変更"',
    `button "${moveLabel}"`,
    `button "画像を拡大表示: ${fileName}"`,
    `input "画像を選択: ${fileName}"`,
    'input "報告書に含める"',
    'textarea "コメント"',
    `button "画像を削除: ${fileName}"`,
  ];
}

/** 詳細画面の、パンくずから一括エクスポートの起動までの要素（選択画像のエクスポートは選択が 0 件の間は押せない） */
function detailHeadDescriptors(selectedCount = 0): string[] {
  return [
    ...breadcrumbToProject(),
    'a "現場調査一覧"',
    'button "調査報告書出力"',
    'button "編集"',
    'button "削除"',
    'button "全件一括エクスポート"',
    ...(selectedCount > 0 ? [`button "選択画像エクスポート（${selectedCount} 件）"`] : []),
  ];
}

/** 写真管理パネルの 2 枚の画像 */
function photoPanelDescriptors(): string[] {
  const [first, second] = IMAGE_FILE_NAMES;
  return [...photoDescriptors(first, '下へ移動'), ...photoDescriptors(second, '上へ移動')];
}

/** 画像の画面の、パンくずの導線 */
function viewerBreadcrumbDescriptors(): string[] {
  return [...breadcrumbToProject(), 'a "現場調査一覧"', `a "${SURVEY_NAME}"`];
}

/** ズーム操作の釦 */
const ZOOM_DESCRIPTORS = ['button "ズームアウト"', 'button "ズームイン"', 'button "全体表示"'];

/** 注釈編集のツールバーの道具の釦 */
const TOOL_DESCRIPTORS = [
  'button "選択"',
  'button "寸法線"',
  'button "矢印"',
  'button "円"',
  'button "四角形"',
  'button "多角形"',
  'button "折れ線"',
  'button "フリーハンド"',
  'button "テキスト"',
];

/** 道具ごとの属性パネルの部品（選択の道具はパネルを持たない） */
const STYLE_PANEL_DESCRIPTORS = {
  select: [],
  text: [
    'input "白アウトライン"',
    'input "文字色"',
    'input "フォントサイズ"',
    'input "文字の背景色を付ける"',
    'input "文字の背景色"',
    'select "吹き出し形式"',
  ],
  circle: ['input "白縁取り"', 'input "線の色"', 'input "線の太さ"', 'input "塗りつぶしの色"'],
} as const;

/**
 * 編集モードの本文が Tab で止まる要素（元に戻す・やり直しは履歴が無い間は押せない）。
 * 注釈の保存に失敗すると、エディタの領域の誤りの表示に再試行の釦が出る
 */
function editorDescriptors(
  tool: keyof typeof STYLE_PANEL_DESCRIPTORS,
  options: { saveFailed?: boolean } = {}
): string[] {
  return [
    ...viewerBreadcrumbDescriptors(),
    'button "編集終了"',
    ...TOOL_DESCRIPTORS,
    ...STYLE_PANEL_DESCRIPTORS[tool],
    'button "画像を90度回転"',
    'button "保存"',
    'button "エクスポート"',
    'div "注釈エディタ"',
    ...(options.saveFailed ? ['button "再試行"'] : []),
    ...ZOOM_DESCRIPTORS,
  ];
}

// ----------------------------------------------------------------------------
// 画面を開く・状態を作る
// ----------------------------------------------------------------------------

/** 一覧を開き、現場調査の表示を待つ */
async function openListPage(page: Page): Promise<void> {
  await page.goto(`/projects/${project.id}/site-surveys`);
  await expect(page.getByRole('heading', { name: '現場調査一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByRole('main').getByText(SURVEY_NAME).first()).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 作成画面を開き、調査名の欄の表示を待つ */
async function openCreatePage(page: Page): Promise<void> {
  await page.goto(`/projects/${project.id}/site-surveys/new`);
  await expect(page.getByRole('textbox', { name: '調査名' })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 編集画面を開き、調査名の欄に現在の値が入るのを待つ */
async function openEditPage(page: Page): Promise<void> {
  await page.goto(`/site-surveys/${surveyId}/edit`);
  await expect(page.getByRole('textbox', { name: '調査名' })).toHaveValue(SURVEY_NAME, {
    timeout: getTimeout(15000),
  });
}

/** 詳細画面を開き、写真管理パネルの 2 枚の画像の表示を待つ */
async function openDetailPage(page: Page): Promise<void> {
  await page.goto(`/site-surveys/${surveyId}`);
  for (const fileName of IMAGE_FILE_NAMES) {
    await expect(page.getByRole('button', { name: `画像を拡大表示: ${fileName}` })).toBeVisible({
      timeout: getTimeout(20000),
    });
  }
  await expect(page.locator('main[aria-busy]')).toHaveAttribute('aria-busy', 'false');
}

/** 1 枚目の画像の画面を開き、閲覧モードのズーム操作の表示を待つ */
async function openViewerPage(page: Page): Promise<void> {
  await page.goto(`/site-surveys/${surveyId}/images/${imageIds[0]}`);
  await expect(page.getByRole('button', { name: '編集モード' })).toBeVisible({
    timeout: getTimeout(20000),
  });
  await expect(page.getByRole('button', { name: '全体表示' })).toBeEnabled({
    timeout: getTimeout(20000),
  });
}

/** 画像の画面を編集モードへ切り替え、注釈エディタの領域とズーム操作が操作できるのを待つ */
async function enterEditMode(page: Page): Promise<void> {
  await pressByKeyboard(page, '編集モード');
  await expect(page.getByRole('button', { name: '編集終了' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByRole('application', { name: '注釈エディタ' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByRole('button', { name: '全体表示' })).toBeEnabled({
    timeout: getTimeout(20000),
  });
}

/** 編集モードの道具をキーボードで選び、選択状態になるのを待つ */
async function selectToolByKeyboard(page: Page, toolName: string): Promise<void> {
  const tool = page.getByRole('button', { name: toolName, exact: true });
  await tool.focus();
  await page.keyboard.press('Enter');
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
}

/** 本文の釦をキーボードで押す（同じ名前の釦が複数あるときは文書の先の方） */
async function pressByKeyboard(page: Page, name: string): Promise<void> {
  await page.getByRole('main').getByRole('button', { name, exact: true }).first().focus();
  await page.keyboard.press('Enter');
}

/** 詳細画面の「全件一括エクスポート」をキーボードで押し、設定のダイアログの表示を待つ */
async function openBulkExportSettings(page: Page) {
  await pressByKeyboard(page, '全件一括エクスポート');
  const settings = page.getByRole('dialog', { name: '全件一括エクスポート' });
  await expect(settings).toBeVisible({ timeout: getTimeout(10000) });
  return settings;
}

test.describe('現場調査の画面のフォーカス表示', () => {
  test.beforeAll(async ({ browser }) => {
    await setupTestData(browser);
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
  // 一覧
  // ==========================================================================

  test('一覧の表・グリッド・リストの表示の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page);
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();
    await resetFocusToDocumentStart(page);

    const tableVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(tableVisits, [
      ...listHeadDescriptors(project.name),
      ...VIEW_TOGGLE_DESCRIPTORS,
      'button "調査日でソート"',
      'button "更新日でソート"',
      rowDescriptor(SURVEY_NAME, SURVEY_DATE),
      rowDescriptor(OTHER_SURVEY_NAME, OTHER_SURVEY_DATE),
      'select "表示件数"',
    ]);

    for (const view of ['グリッド表示', 'リスト表示']) {
      await pressByKeyboard(page, view);
      await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.getByRole('main').getByRole('table')).toHaveCount(0);
      await resetFocusToDocumentStart(page);

      const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

      expectClearFocusWalk(visits, [
        ...listHeadDescriptors(project.name),
        ...VIEW_TOGGLE_DESCRIPTORS,
        cardDescriptor(SURVEY_NAME),
        cardDescriptor(OTHER_SURVEY_NAME),
        'select "表示件数"',
      ]);
    }
  });

  test('一覧のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openListPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...listHeadDescriptors(project.name),
      cardDescriptor(SURVEY_NAME),
      cardDescriptor(OTHER_SURVEY_NAME),
      'select "表示件数"',
    ]);
  });

  test('一覧で現場調査が無い本文と取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto(`/projects/${emptyProject.id}/site-surveys`);
    await expect(page.getByRole('main').getByText('現場調査がありません')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await resetFocusToDocumentStart(page);

    const emptyVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    // 空の表示の中の新規作成の導線が末尾に止まる
    expectClearFocusWalk(emptyVisits, [
      ...listHeadDescriptors(emptyProject.name),
      'a "+ 新規作成"',
    ]);

    // 一覧の取得（GET /api/projects/:projectId/site-surveys）だけを 400 に差し替える
    const listHits = await routeFailure(
      page,
      `/api/projects/${project.id}/site-surveys`,
      'GET',
      400
    );
    await page.goto(`/projects/${project.id}/site-surveys`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(listHits(), '前提: 一覧の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const errorVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(errorVisits, ['button "再試行"']);
  });

  // ==========================================================================
  // 作成画面・編集画面
  // ==========================================================================

  test('作成画面の初期の本文とモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, createDescriptors());

    await page.setViewportSize(MOBILE_VIEWPORT);
    await openCreatePage(page);
    await resetFocusToDocumentStart(page);

    const mobileVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(mobileVisits, createDescriptors());
  });

  test('作成画面で入力の誤りを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    // 調査名を空にする
    await page.getByRole('textbox', { name: '調査名' }).focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    // 調査日の区画を一つ消すと、日付は不完全になり値が空になる
    const surveyDateInput = page.getByLabel('調査日');
    await surveyDateInput.focus();
    await page.keyboard.press('Backspace');
    await expect(surveyDateInput).toHaveValue('');
    // メモを上限（2000 文字）を超える長さにする
    await page.getByRole('textbox', { name: 'メモ' }).focus();
    await page.keyboard.insertText('焦'.repeat(2001));
    await pressByKeyboard(page, '作成');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText([
      '調査名は必須です',
      '調査日は必須です',
      'メモは2000文字以内で入力してください',
    ]);
    for (const field of [
      page.getByRole('textbox', { name: '調査名' }),
      surveyDateInput,
      page.getByRole('textbox', { name: 'メモ' }),
    ]) {
      await expect(field).toHaveAttribute('aria-invalid', 'true');
    }
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, createDescriptors());
  });

  test('作成画面で作成の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 作成の要求（POST /api/projects/:projectId/site-surveys）だけを 400 に差し替える
    const createHits = await routeFailure(
      page,
      `/api/projects/${project.id}/site-surveys`,
      'POST',
      400
    );
    await openCreatePage(page);
    await pressByKeyboard(page, '作成');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(createHits(), '前提: 作成の要求が 1 件送られる').toBe(1);
    await expect(page.getByRole('main').getByRole('button', { name: '作成' })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, createDescriptors());
  });

  test('編集画面の初期の本文と保存の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, editDescriptors());

    // 保存の要求（PUT /api/site-surveys/:id）だけを 400 に差し替える
    const saveHits = await routeFailure(page, `/api/site-surveys/${surveyId}`, 'PUT', 400);
    await pressByKeyboard(page, '保存');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(saveHits(), '前提: 保存の要求が 1 件送られる').toBe(1);
    await expect(page.getByRole('main').getByRole('button', { name: '保存' })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const failedVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(failedVisits, editDescriptors());
  });

  // ==========================================================================
  // 詳細画面
  // ==========================================================================

  test('詳細画面の本文とモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...detailHeadDescriptors(),
      ...UPLOADER_DESCRIPTORS,
      ...photoPanelDescriptors(),
    ]);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await openDetailPage(page);
    await resetFocusToDocumentStart(page);

    const mobileVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(mobileVisits, [
      ...detailHeadDescriptors(),
      ...UPLOADER_DESCRIPTORS,
      ...photoPanelDescriptors(),
    ]);
  });

  test('詳細画面で画像を選択しメタデータを変えた本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    const [firstFile] = IMAGE_FILE_NAMES;
    // 1 枚目を選び、1 枚目の報告書に含めるの切り替えで未保存の変更を作る
    await page.getByRole('checkbox', { name: `画像を選択: ${firstFile}` }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('checkbox', { name: '報告書に含める' }).first().focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('main').getByRole('button', { name: '保存' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...detailHeadDescriptors(1),
      ...UPLOADER_DESCRIPTORS,
      'button "保存"',
      ...photoPanelDescriptors(),
    ]);
  });

  test('詳細画面でアップロードの失敗の後に未送信の画像が残った本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    // 画像の追加（POST /api/site-surveys/:id/images）だけを 503 に差し替える（再送可能に分類される）
    const uploadHits = await routeFailure(
      page,
      `/api/site-surveys/${surveyId}/images`,
      'POST',
      503
    );
    await page.getByTestId('file-input').setInputFiles({
      name: 'focus_failed.jpg',
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    await expect(page.getByTestId('pending-upload-panel')).toBeVisible({
      timeout: getTimeout(30000),
    });
    expect(uploadHits(), '前提: 画像の追加の要求が送られる').toBeGreaterThan(0);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...detailHeadDescriptors(),
      ...UPLOADER_DESCRIPTORS,
      'button "再送する"',
      'button "破棄する"',
      ...photoPanelDescriptors(),
    ]);
  });

  test('詳細画面の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 詳細の取得（GET /api/site-surveys/:id）だけを 400 に差し替える
    const detailHits = await routeFailure(page, `/api/site-surveys/${surveyId}`, 'GET', 400);
    await page.goto(`/site-surveys/${surveyId}`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(detailHits(), '前提: 詳細の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('詳細画面の削除の確認と一括エクスポートの設定のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await pressByKeyboard(page, '削除');
    const deleteDialog = page.getByRole('dialog', { name: '現場調査を削除しますか？' });
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    await resetFocusToDocumentStart(page);

    const deleteVisits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(deleteVisits, ['button "キャンセル"', 'button "削除する"']);

    await deleteDialog.getByRole('button', { name: 'キャンセル' }).focus();
    await page.keyboard.press('Enter');
    await expect(deleteDialog).toBeHidden();

    const settings = await openBulkExportSettings(page);
    await resetFocusToDocumentStart(page);

    const settingsVisits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    // 形式と画質の選択は、選ばれている一つだけで止まる
    expectClearFocusWalk(settingsVisits, [
      'input "JPEG"',
      'input "中"',
      'input "注釈を含める"',
      'button "キャンセル"',
      'button "開始"',
    ]);
    await expect(settings).toBeVisible();
  });

  test('詳細画面の一括エクスポートの処理中と一部失敗の案内の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const [firstPath, secondPath] = await originalImagePaths(page);
    assertPrepared(firstPath, '1 枚目の原本の経路');
    assertPrepared(secondPath, '2 枚目の原本の経路');
    await openDetailPage(page);

    // 処理中: 原本の取得を待たせて、処理中の段に留める
    const holdHits: string[] = [];
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holdMatcher = (url: URL): boolean => [firstPath, secondPath].includes(url.pathname);
    const holdHandler = async (route: Route): Promise<void> => {
      holdHits.push(new URL(route.request().url()).pathname);
      await released;
      await route.continue();
    };
    await page.route(holdMatcher, holdHandler);
    const settings = await openBulkExportSettings(page);
    await settings.getByRole('button', { name: '開始' }).focus();
    await page.keyboard.press('Enter');
    const progress = page.getByRole('dialog', { name: '一括エクスポート処理中' });
    await expect(progress).toBeVisible({ timeout: getTimeout(10000) });
    await expect.poll(() => holdHits.length, { timeout: getTimeout(10000) }).toBeGreaterThan(0);
    await resetFocusToDocumentStart(page);

    const runningVisits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(runningVisits, ['button "キャンセル"']);

    // 処理中の段を中断して閉じ、待たせた取得を解き放ってから取り外す
    await progress.getByRole('button', { name: 'キャンセル' }).focus();
    await page.keyboard.press('Enter');
    release();
    await expect(progress).toBeHidden({ timeout: getTimeout(10000) });
    await page.unrouteAll({ behavior: 'wait' });

    // 一部失敗: 2 枚目の原本の取得だけを 404 へ差し替える
    let failureHits = 0;
    await page.route(
      (url) => url.pathname === secondPath,
      async (route: Route) => {
        failureHits += 1;
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      }
    );
    const retrySettings = await openBulkExportSettings(page);
    await retrySettings.getByRole('button', { name: '開始' }).focus();
    await page.keyboard.press('Enter');
    const partial = page.getByRole('alertdialog', { name: '一部の画像が失敗しました' });
    await expect(partial).toBeVisible({ timeout: getTimeout(60000) });
    expect(failureHits, '前提: 2 枚目の原本の取得が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const partialVisits = await walkFocusWithin(page, ALERT_DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(partialVisits, ['button "中止"', 'button "ダウンロード"']);
  });

  // ==========================================================================
  // 画像の画面（閲覧と注釈編集）
  // ==========================================================================

  test('画像の画面の閲覧モードの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openViewerPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    // 閲覧モードではエディタの領域は Tab で止まらず、回転の釦はズーム操作に載る
    expectClearFocusWalk(visits, [
      ...viewerBreadcrumbDescriptors(),
      'button "編集モード"',
      ...ZOOM_DESCRIPTORS,
      'button "画像を90度回転"',
    ]);
  });

  test('画像の画面の編集モードで道具ごとの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openViewerPage(page);
    await enterEditMode(page);
    await resetFocusToDocumentStart(page);

    const selectVisits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(selectVisits, editorDescriptors('select'));

    for (const [tool, toolName] of [
      ['text', 'テキスト'],
      ['circle', '円'],
    ] as const) {
      await selectToolByKeyboard(page, toolName);
      await resetFocusToDocumentStart(page);

      const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

      expectClearFocusWalk(visits, editorDescriptors(tool));
    }
  });

  test('画像の画面のモバイル幅の編集モードの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openViewerPage(page);
    await enterEditMode(page);
    // 属性パネルの部品が最も多いテキストの道具で、単段のツールバーを横スクロールさせる
    await selectToolByKeyboard(page, 'テキスト');
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, editorDescriptors('text'));
  });

  test('画像の画面で注釈の保存の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openViewerPage(page);
    await enterEditMode(page);
    // 注釈の保存（PUT /api/site-surveys/images/:imageId/annotations）だけを 400 に差し替える
    const saveHits = await routeFailure(
      page,
      `/api/site-surveys/images/${imageIds[0]}/annotations`,
      'PUT',
      400
    );
    await pressByKeyboard(page, '保存');
    await expect(page.getByTestId('save-retry-button')).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(saveHits(), '前提: 注釈の保存の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, editorDescriptors('select', { saveFailed: true }));
  });

  test('画像の画面の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 現場調査の取得（GET /api/site-surveys/:id）だけを 400 に差し替える
    const surveyHits = await routeFailure(page, `/api/site-surveys/${surveyId}`, 'GET', 400);
    await page.goto(`/site-surveys/${surveyId}/images/${imageIds[0]}`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(surveyHits(), '前提: 現場調査の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('画像の画面の画像のエクスポートのダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openViewerPage(page);
    await enterEditMode(page);
    await pressByKeyboard(page, 'エクスポート');
    await expect(page.getByRole('dialog', { name: '画像エクスポート' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'input "JPEG"',
      'input "中"',
      'input "注釈を含める"',
      'button "元画像をダウンロード"',
      'button "注釈データ(JSON)をダウンロード"',
      'button "キャンセル"',
      'button "エクスポート"',
    ]);
  });

  test('画像の画面の未保存の注釈の復元の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 未保存の注釈の下書き（AutoSaveManager が localStorage に置く形）を置いてから開く
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
      key: `${ANNOTATION_DRAFT_KEY_PREFIX}${imageIds[0]}`,
      data: {
        imageId: imageIds[0],
        surveyId,
        annotationData: { version: '1.0', objects: [] },
        savedAt: '2026-04-02T00:00:00.000Z',
        serverUpdatedAt: null,
      },
    });
    await openViewerPage(page);
    await enterEditMode(page);
    const restore = page.getByRole('dialog', { name: '未保存のデータがあります' });
    await expect(restore).toBeVisible({ timeout: getTimeout(10000) });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "復元する"', 'button "破棄する"', 'button "後で決める"']);
  });

  test('画像の画面の寸法値の入力のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openViewerPage(page);
    await enterEditMode(page);
    await selectToolByKeyboard(page, '寸法線');
    // 寸法値の入力はキャンバス上で寸法線を描いた直後にだけ開く（描画面の内側に収まる相対座標で描く）
    const upperCanvas = page.getByTestId('annotation-canvas-wrapper').locator('.upper-canvas');
    await expect
      .poll(async () => (await upperCanvas.boundingBox())?.width ?? 0, {
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(10);
    const box = await upperCanvas.boundingBox();
    assertPrepared(box, '描画面の矩形');
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.3, { steps: 10 });
    await page.mouse.up();
    const dimensionDialog = page.getByRole('dialog', { name: '寸法値入力' });
    await expect(dimensionDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dimensionDialog.getByRole('spinbutton', { name: '寸法値' })).toBeFocused();
    const valueHandle = await activeElementHandle(page);

    // 入力欄はプログラムからフォーカスを受ける（Tab では先頭に止まらない）ため、そのまま測ってから一巡する
    const valueFocused = await snapshotFocusStyle(valueHandle, DIALOG_SCOPE);
    const visits = await walkFocusWithin(page, DIALOG_SCOPE, WALK_MAX_STEPS);

    expect(collectFocusedViolations(valueFocused)).toEqual([]);
    expectClearFocusWalk(visits, [
      'input "寸法値"',
      'select "単位"',
      'button "キャンセル"',
      'button "確定"',
    ]);
  });
});
