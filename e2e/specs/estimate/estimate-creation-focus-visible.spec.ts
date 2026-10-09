/**
 * @fileoverview 見積書の作成画面と明細の編集画面のフォーカス表示のE2Eテスト
 *
 * Task 60.1: 見積明細の行（EstimateItemRow）の欄・キー割当の一覧（EstimateKeymapHelp）・
 * 見積書の作成画面（EstimateCreatePage）のインラインの outline の打ち消しを外し、フォーカス表示を
 * 共通の :focus-visible の輪に一本化する。併せて、見積書の作成画面と明細の編集画面（見積書の画面）
 * とそのダイアログでフォーカスを受ける要素を状態ごとに網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 作成画面の初期の本文、見積書名を空にした本文（作成の釦は無効で止まらない）、作成の要求が
 *     失敗した本文、初期の本文のモバイル幅（375px）
 *   - 見積書の画面のツリー表示の初期の本文、階層パネルで項目を選んだ本文、明細を編集して未保存の
 *     変更がある本文、保存の要求が失敗した本文（保存エラーを閉じる釦）、階層の操作のエラーを出した
 *     本文（操作エラーを閉じる釦）、階層パネルを隠した本文、ドリルダウン表示のルートの本文、
 *     ドリルダウン表示で子階層へ下げた本文、見積書の取得に失敗した本文（再試行の釦）、初期の本文の
 *     モバイル幅（375px）
 *   - キー割当の一覧（開いたときにフォーカスを受ける一覧そのものから）、見積書の削除の確認・
 *     受領見積書の転記・業者金額の転記（NET の案分）・実行金額の転記（利益率）・諸経費の計算・
 *     出力のダイアログ、未保存の変更の確認のダイアログ
 *   - 見積書一覧（EstimateListPage）の本文と、そのモバイル幅（375px）の本文、プロジェクト詳細の
 *     見積書のセクション（EstimateSectionCard の region だけを巡り、他のスペックのセクションは
 *     範囲の外として読み飛ばす）。いずれもタスク 60.1 の変更の前から満たしており、網羅のための
 *     見張りとして置く
 *   - Tab では止まらず、キー操作でフォーカスが移る明細の行（セルから Esc・範囲選択の Shift+↓）と
 *     明細の領域（表示モードの切替の Alt+M）
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 明細は、子を 1 件持つ項目・その子・注記行の 3 項目の固定の小さな明細で測る（欄の数は
 * 項目の数に比例し、行の種類ごとの欄の並びはこの 3 項目で尽きるため）。
 * 状態はキーボードの操作で作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。
 * 失敗は page.route でその要求だけをパスで判定して差し替え、テスト用の DB の見積書を書き換えない。
 * いずれの失敗も API クライアントが再試行しない 4xx で作り、要求が 1 件だけ送られたことを確かめる。
 * 測る見積書とプロジェクトは、テスト用の DB へ直接作る（作成画面の操作に見積書の画面の測定を
 * 依らせないため）。
 * 判定の作法は e2e/specs/contracts/contract-management-focus-visible.spec.ts に倣う
 * （背景画像のグラデーションの色も背景の候補に入れる）。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (estimate-creation):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 60.1 は、見積書の作成画面と明細の編集画面の上で steering の方針の下限へ揃える。
 */

import {
  test,
  expect,
  type ElementHandle,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
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
    // 見積書の画面の文章の欄（textarea）も label で名付けた場合に備え、textarea も label の文言で呼ぶ
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

/** 本文（main）で Tab を押す上限。文書の先頭から共通ヘッダーを抜けて見積書の画面の本文を一巡して余る回数 */
const MAIN_WALK_MAX_STEPS = 120;
/** ダイアログで Tab を押す上限。文書の先頭から本文を抜け、ダイアログを一巡して余る回数 */
const DIALOG_WALK_MAX_STEPS = 150;
/** 開いたときにフォーカスを受けるダイアログの中で Tab を押す上限（一巡して余る回数） */
const SMALL_WALK_MAX_STEPS = 20;
/** 見積書の画面の本文 */
const MAIN_SCOPE = 'main';
/** ダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';
/** プロジェクト詳細の見積書のセクション（EstimateSectionCard の region） */
const ESTIMATE_SECTION_SCOPE = '[data-testid="estimate-section"]';

/** 測る見積書のプロジェクトの名称 */
const PROJECT_NAME = 'E2E見積書フォーカス表示用プロジェクト';
/** 測る見積書の名称 */
const ESTIMATE_NAME = 'フォーカス測定見積書';
/** 子を 1 件持つ項目・その子・注記行の名称（階層パネルの項目の名前になる） */
const PARENT_ITEM_NAME = 'フォーカス親項目';
const CHILD_ITEM_NAME = 'フォーカス子項目';
const NOTE_ITEM_NAME = 'フォーカス注記';

/** 失敗の応答の本文（RFC 7807）。detail は保存の失敗の文言になる */
const FAILURE_DETAIL = 'E2E のフォーカス表示の測定のための失敗';

/** パンくずの、ダッシュボードから見積書一覧までの 4 つの導線 */
const BREADCRUMB_TO_LIST = [
  'a "ダッシュボード"',
  'a "プロジェクト一覧"',
  'a "プロジェクト"',
  'a "見積書一覧"',
];

/** 作成画面の本文が Tab で止まる要素 */
const CREATE_FORM_DESCRIPTORS = [
  ...BREADCRUMB_TO_LIST,
  'input "見積書名"',
  'select "内訳書を選択"',
  'button "キャンセル"',
  'button "作成"',
];

/** 見積書の画面の、パンくずから表示行の選択までの要素（画面の並び順） */
const DETAIL_HEADER_DESCRIPTORS = [
  ...BREADCRUMB_TO_LIST,
  'button "削除"',
  'button "受領見積書を業者金額に転記"',
  'button "業者金額を実行金額に転記"',
  'button "実行金額を見積金額に転記"',
  'button "諸経費を計算して追加"',
  'button "出力"',
  'input "見積"',
  'input "実行"',
  'input "業者"',
];

/** 帳票用入力項目の欄 */
const REPORT_FIELD_DESCRIPTORS = [
  'input "提出日"',
  'input "見積有効期限"',
  'button "別途工事を追加"',
];

/** 明細操作のツールバーの、項目を選んでいないときの追加の釦 */
const TOOLBAR_ADD_DESCRIPTORS = [
  'button "+ 項目追加"',
  'button "値引き行追加"',
  'button "注記行追加"',
];

/** 明細操作のツールバーの、表示モードの切替とキー割当の一覧の入口 */
const TOOLBAR_TAIL_DESCRIPTORS = [
  'button "ツリー表示"',
  'button "ドリルダウン表示"',
  'button "キーボード操作の一覧"',
];

/** 階層パネルの要素（注記行の名前は編集で変わるため引数で受ける） */
function hierarchyPanelDescriptors(noteName: string = NOTE_ITEM_NAME): string[] {
  return [
    'button "すべて展開"',
    'button "すべて折りたたむ"',
    `button "${PARENT_ITEM_NAME} を折りたたむ"`,
    `button "${PARENT_ITEM_NAME}"`,
    `button "${CHILD_ITEM_NAME}"`,
    `button "${noteName}"`,
  ];
}

/** 3 行 1 セット（見積・実行・業者）の項目の欄。子を持つ項目の単価は集計の表示で欄が無い */
function itemLineDescriptors(withUnitPrice: boolean): string[] {
  const oneLine = [
    'input "名称"',
    'input "規格"',
    'input "単位"',
    'input "数量"',
    ...(withUnitPrice ? ['input "単価"'] : []),
    'input "備考"',
  ];
  return [...oneLine, ...oneLine, ...oneLine];
}

/** ツリー表示の明細の要素（子を持つ項目の折りたたみ・その 3 行・子の 3 行・注記行の名称） */
const TREE_TABLE_DESCRIPTORS = [
  'button "折りたたむ"',
  ...itemLineDescriptors(false),
  ...itemLineDescriptors(true),
  'input "名称"',
];

/** ツリー表示の初期の本文が Tab で止まる要素 */
const TREE_INITIAL_DESCRIPTORS = [
  ...DETAIL_HEADER_DESCRIPTORS,
  'button "階層パネルを隠す"',
  ...REPORT_FIELD_DESCRIPTORS,
  ...TOOLBAR_ADD_DESCRIPTORS,
  ...TOOLBAR_TAIL_DESCRIPTORS,
  ...hierarchyPanelDescriptors(),
  ...TREE_TABLE_DESCRIPTORS,
];

/**
 * 注記行の名称を編集して未保存の変更がある本文が Tab で止まる要素。保存の釦が有効になり、
 * 取り消しの釦が出て、階層パネルの注記行の名前が編集後の名称になる
 */
function dirtyTreeDescriptors(extraAfterSave: string[]): string[] {
  return [
    ...DETAIL_HEADER_DESCRIPTORS,
    'button "保存"',
    ...extraAfterSave,
    'button "階層パネルを隠す"',
    ...REPORT_FIELD_DESCRIPTORS,
    ...TOOLBAR_ADD_DESCRIPTORS,
    'button "元に戻す"',
    ...TOOLBAR_TAIL_DESCRIPTORS,
    ...hierarchyPanelDescriptors(`${NOTE_ITEM_NAME}X`),
    ...TREE_TABLE_DESCRIPTORS,
  ];
}

/**
 * 見積書一覧（EstimateListPage）の本文が Tab で止まる要素。パンくず 3 つ・新規作成の導線・
 * 見積書のカード（EstimateCard）の導線・表示件数の選択（PaginationUI。project-management の部品）
 */
const LIST_DESCRIPTORS = [
  'a "ダッシュボード"',
  'a "プロジェクト一覧"',
  'a "プロジェクト"',
  'a "見積書を新規作成"',
  `a "${ESTIMATE_NAME}の見積書詳細を見る"`,
  'select "表示件数"',
];

let projectId: string;
let estimateId: string;
let parentItemId: string;
let childItemId: string;

/** 3 行 1 セットの明細行（数量 1・単価 1,000） */
function standardLines(name: string) {
  return (['ESTIMATE', 'EXECUTION', 'VENDOR'] as const).map((lineType) => ({
    lineType,
    name,
    unit: '式',
    quantity: 1,
    unitPrice: 1000,
    amount: 1000,
  }));
}

/** 測定用のプロジェクトと見積書 1 件を作り、子を 1 件持つ項目・その子・注記行の明細を作る */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  projectId = (
    await prisma.project.create({
      data: {
        name: PROJECT_NAME,
        status: 'PREPARING',
        salesPersonId: testUser.id,
        createdById: testUser.id,
      },
    })
  ).id;
  estimateId = (
    await prisma.estimate.create({
      data: { projectId, name: ESTIMATE_NAME, createdAt: new Date('2026-04-01T00:00:00.000Z') },
    })
  ).id;
  parentItemId = (
    await prisma.estimateItem.create({
      data: { estimateId, displayOrder: 0, lines: { create: standardLines(PARENT_ITEM_NAME) } },
    })
  ).id;
  childItemId = (
    await prisma.estimateItem.create({
      data: {
        estimateId,
        parentId: parentItemId,
        displayOrder: 0,
        lines: { create: standardLines(CHILD_ITEM_NAME) },
      },
    })
  ).id;
  await prisma.estimateItem.create({
    data: {
      estimateId,
      displayOrder: 1,
      itemType: 'NOTE',
      lines: { create: [{ lineType: 'ESTIMATE', name: NOTE_ITEM_NAME }] },
    },
  });
}

/** 測定用のプロジェクトと、その下の見積書（明細は見積書とともに消える）を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった分は undefined のため除く（空の in は何も消さない）
  const projectIds = [projectId].filter((id): id is string => !!id);
  const prisma = getPrismaClient();
  await prisma.estimate.deleteMany({ where: { projectId: { in: projectIds } } });
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

/** 作成画面を開き、内訳書の選択の表示を待つ */
async function openCreatePage(page: Page): Promise<void> {
  await page.goto(`/projects/${projectId}/estimates/new`);
  await expect(page.getByRole('heading', { name: '見積書作成', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('combobox', { name: '内訳書を選択' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 見積書一覧を開き、見積書のカードの表示を待つ */
async function openListPage(page: Page): Promise<void> {
  await page.goto(`/projects/${projectId}/estimates`);
  await expect(page.getByRole('heading', { name: '見積書一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('link', { name: `${ESTIMATE_NAME}の見積書詳細を見る` })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 見積書の画面を開き、明細の 3 項目と階層パネルの表示を待つ */
async function openDetailPage(page: Page): Promise<void> {
  await page.goto(`/estimates/${estimateId}`);
  await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByTestId('estimate-hierarchy-panel')).toBeVisible({
    timeout: getTimeout(15000),
  });
  const table = page.locator('[aria-label="見積項目テーブル"]');
  for (const name of [PARENT_ITEM_NAME, CHILD_ITEM_NAME, NOTE_ITEM_NAME]) {
    await expect(table.locator(`input[value="${name}"]`).first()).toBeVisible({
      timeout: getTimeout(15000),
    });
  }
}

/** 釦をキーボードで押す（同じ名前の釦が複数あるときは文書の先の方） */
async function pressByKeyboard(page: Page, name: string): Promise<void> {
  await page.getByRole('main').getByRole('button', { name, exact: true }).first().focus();
  await page.keyboard.press('Enter');
}

/** 明細の注記行の名称の欄の末尾へキーボードで文字を足し、未保存の変更ありにする */
async function editNoteByKeyboard(page: Page): Promise<void> {
  const noteName = page
    .locator('[aria-label="見積項目テーブル"]')
    .locator(`input[value="${NOTE_ITEM_NAME}"]`);
  await noteName.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 今フォーカスを持つ要素の計算済みスタイル */
async function snapshotActive(page: Page): Promise<{
  handle: ElementHandle<Element>;
  snapshot: FocusSnapshot;
}> {
  const handle = await activeElementHandle(page);
  return { handle, snapshot: await snapshotFocusStyle(handle, MAIN_SCOPE) };
}

test.describe('見積書の画面のフォーカス表示', () => {
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
    // 表示モードの選択は端末に保存されるため、ツリー表示の既定から始める
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
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

  test('作成画面で見積書名を空にした本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);
    await page.getByLabel('見積書名').fill('');
    // 見積書名が空の間は作成の釦が無効になり、Tab で止まらない
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeDisabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS.slice(0, -1));
  });

  test('作成画面で作成の失敗のエラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 作成の要求（POST /api/projects/:projectId/estimates）だけを 400 に差し替える
    const createHits = await routeFailure(
      page,
      `/api/projects/${projectId}/estimates`,
      'POST',
      400
    );
    await openCreatePage(page);
    await pressByKeyboard(page, '作成');

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      '見積書の作成に失敗しました',
      { timeout: getTimeout(10000) }
    );
    expect(createHits(), '前提: 作成の要求が 1 件送られる').toBe(1);
    // 失敗の後も入力は保持され、部品は再び操作できる
    await expect(page.getByLabel('見積書名')).toHaveValue('見積書');
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
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
  // 見積書一覧と、プロジェクト詳細の見積書のセクション（網羅のための見張り）
  // ==========================================================================

  test('見積書一覧の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openListPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, LIST_DESCRIPTORS);
  });

  test('見積書一覧のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openListPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, LIST_DESCRIPTORS);
  });

  test('プロジェクト詳細の見積書のセクションの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}`);
    // 見積書のセクション（EstimateSectionCard）の読み込みが終わり、見積書のカードの導線が出るのを待つ
    await expect(page.getByTestId('estimate-section-skeleton')).toHaveCount(0, {
      timeout: getTimeout(15000),
    });
    await expect(
      page.getByRole('link', { name: `${ESTIMATE_NAME}の見積書詳細を見る` })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await resetFocusToDocumentStart(page);

    // 他のスペックのセクションの要素は範囲の外として読み飛ばし、見積書のセクションだけを巡る
    const visits = await walkFocusWithin(page, ESTIMATE_SECTION_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'a "見積書を新規作成"',
      'a "すべて見る"',
      `a "${ESTIMATE_NAME}の見積書詳細を見る"`,
    ]);
  });

  // ==========================================================================
  // 見積書の画面の本文
  // ==========================================================================

  test('見積書の画面のツリー表示の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, TREE_INITIAL_DESCRIPTORS);
  });

  test('見積書の画面で階層パネルの項目を選んだ本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    // 階層パネルの子を持つ項目をキーボードで選ぶと、明細の行が選択中になりツールバーの釦が増える
    await pressByKeyboard(page, PARENT_ITEM_NAME);
    await expect(page.getByTestId(`estimate-item-${parentItemId}`)).toHaveAttribute(
      'data-selected',
      'true',
      { timeout: getTimeout(10000) }
    );
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...DETAIL_HEADER_DESCRIPTORS,
      'button "階層パネルを隠す"',
      ...REPORT_FIELD_DESCRIPTORS,
      'button "+ 項目追加"',
      'button "+↳ 子項目追加"',
      'button "値引き行追加"',
      'button "注記行追加"',
      'button "複製"',
      'button "削除"',
      'button "下へ移動"',
      ...TOOLBAR_TAIL_DESCRIPTORS,
      ...hierarchyPanelDescriptors(),
      ...TREE_TABLE_DESCRIPTORS,
    ]);
  });

  test('見積書の画面で明細を編集して未保存の変更がある本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await editNoteByKeyboard(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, dirtyTreeDescriptors([]));
  });

  test('見積書の画面で保存の失敗を表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 保存の要求（PUT /api/estimates/:id/save）だけを 400 に差し替える
    const saveHits = await routeFailure(page, `/api/estimates/${estimateId}/save`, 'PUT', 400);
    await openDetailPage(page);
    await editNoteByKeyboard(page);
    await pressByKeyboard(page, '保存');

    await expect(page.getByTestId('estimate-save-error')).toContainText(FAILURE_DETAIL, {
      timeout: getTimeout(10000),
    });
    expect(saveHits(), '前提: 保存の要求が 1 件送られる').toBe(1);
    // 失敗の後も編集中の内容と未保存の表示は残る
    await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, dirtyTreeDescriptors(['button "保存エラーを閉じる"']));
  });

  test('見積書の画面で階層の操作のエラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    // 最上位の項目のセルから Esc で行へ移り、階層を上げるキー操作を押すとエラーが出る
    await page
      .locator('[aria-label="見積項目テーブル"]')
      .locator(`input[value="${PARENT_ITEM_NAME}"]`)
      .first()
      .focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    await expect(page.getByTestId('estimate-edit-error')).toContainText(
      'すでに最上位の階層のため、これ以上上げられません。',
      { timeout: getTimeout(10000) }
    );
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...DETAIL_HEADER_DESCRIPTORS,
      'button "階層パネルを隠す"',
      'button "操作エラーを閉じる"',
      ...REPORT_FIELD_DESCRIPTORS,
      ...TOOLBAR_ADD_DESCRIPTORS,
      'button "元に戻す"',
      ...TOOLBAR_TAIL_DESCRIPTORS,
      ...hierarchyPanelDescriptors(),
      ...TREE_TABLE_DESCRIPTORS,
    ]);
  });

  test('見積書の画面で階層パネルを隠した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await pressByKeyboard(page, '階層パネルを隠す');
    await expect(page.getByTestId('estimate-hierarchy-panel')).toBeHidden({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...DETAIL_HEADER_DESCRIPTORS,
      'button "階層パネルを表示"',
      ...REPORT_FIELD_DESCRIPTORS,
      ...TOOLBAR_ADD_DESCRIPTORS,
      ...TOOLBAR_TAIL_DESCRIPTORS,
      ...TREE_TABLE_DESCRIPTORS,
    ]);
  });

  test('見積書の画面のドリルダウン表示のルートの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await page.getByRole('radio', { name: 'ドリルダウン表示' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: getTimeout(10000) }
    );
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...DETAIL_HEADER_DESCRIPTORS,
      'button "階層パネルを隠す"',
      ...REPORT_FIELD_DESCRIPTORS,
      ...TOOLBAR_ADD_DESCRIPTORS,
      ...TOOLBAR_TAIL_DESCRIPTORS,
      ...hierarchyPanelDescriptors(),
      `button "${PARENT_ITEM_NAME} の子階層を表示"`,
      ...itemLineDescriptors(false),
      'input "名称"',
    ]);
  });

  test('見積書の画面のドリルダウン表示で子階層へ下げた本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await page.getByRole('radio', { name: 'ドリルダウン表示' }).focus();
    await page.keyboard.press('Enter');
    await pressByKeyboard(page, `${PARENT_ITEM_NAME} の子階層を表示`);
    const table = page.locator('[aria-label="見積項目テーブル"]');
    await expect(table.locator(`input[value="${CHILD_ITEM_NAME}"]`).first()).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(table.locator(`input[value="${NOTE_ITEM_NAME}"]`)).toHaveCount(0);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...DETAIL_HEADER_DESCRIPTORS,
      'button "階層パネルを隠す"',
      ...REPORT_FIELD_DESCRIPTORS,
      ...TOOLBAR_ADD_DESCRIPTORS,
      ...TOOLBAR_TAIL_DESCRIPTORS,
      ...hierarchyPanelDescriptors(),
      // 経路（パンくず）の一つ上へ戻る釦と、最上位の「全体」への導線
      'button "一つ上の階層へ戻る"',
      'button "全体"',
      ...itemLineDescriptors(true),
    ]);
  });

  test('見積書の画面で見積書の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 見積書の取得（GET /api/estimates/:id）だけを 400 に差し替える
    const detailHits = await routeFailure(page, `/api/estimates/${estimateId}`, 'GET', 400);
    await page.goto(`/estimates/${estimateId}`);
    await expect(
      page.getByRole('main').getByRole('alert').getByRole('button', { name: '再試行' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(detailHits(), '前提: 見積書の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('見積書の画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openDetailPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, TREE_INITIAL_DESCRIPTORS);
  });

  // ==========================================================================
  // キー操作でフォーカスが移る明細の行と領域
  // ==========================================================================

  test('キー操作でフォーカスが移る明細の行と明細の領域が明確なフォーカス表示を持ち離れると消える', async ({
    page,
  }) => {
    await openDetailPage(page);
    const parentRow = page.getByTestId(`estimate-item-${parentItemId}`);

    // 子を持つ項目の名称のセルから Esc を押すと、フォーカスがその行そのものへ移る
    await parentRow.locator(`input[value="${PARENT_ITEM_NAME}"]`).first().focus();
    await page.keyboard.press('Escape');
    await expect(parentRow).toBeFocused();
    const parent = await snapshotActive(page);

    // Shift+↓ で範囲選択を広げると、フォーカスが次の行（子の項目。選択中の背景）へ移る
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.getByTestId(`estimate-item-${childItemId}`)).toBeFocused();
    const child = await snapshotActive(page);
    const parentBlurred = await snapshotFocusStyle(parent.handle, MAIN_SCOPE);
    await expect(page.getByTestId(`estimate-item-${childItemId}`)).toHaveAttribute(
      'data-selected',
      'true'
    );

    // Tab で行を離れると、行の中の最初の欄へ進む
    await page.keyboard.press('Tab');
    const childBlurred = await snapshotFocusStyle(child.handle, MAIN_SCOPE);

    // 行へ戻り（Esc）、Alt+M で表示モードを切り替えると、フォーカスが明細の領域へ移る
    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+m');
    await expect(page.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: getTimeout(10000) }
    );
    const area = await snapshotActive(page);
    await page.keyboard.press('Tab');
    const areaBlurred = await snapshotFocusStyle(area.handle, MAIN_SCOPE);

    expectClearFocusWalk(
      [
        { focused: parent.snapshot, blurred: parentBlurred },
        { focused: child.snapshot, blurred: childBlurred },
        { focused: area.snapshot, blurred: areaBlurred },
      ],
      [
        // 行の名前は文言（行の種類の札と、単価・金額の表示）の先頭 30 字
        'div "見積1,0001,000実行1,0001,000業者1,00"',
        'div "見積1,000実行1,000業者1,000"',
        'div "階層構造すべて展開すべて折りたたむフォーカス親項目フォーカス"',
      ]
    );
  });

  // ==========================================================================
  // ダイアログ
  // ==========================================================================

  test('キー割当の一覧を開いたときの一覧そのものと全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    // 入口の釦をキーボードで押すと、一覧そのもの（role=dialog）へフォーカスが移る
    await page.getByTestId('open-keymap-help').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'キーボード操作の割り当て一覧' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog).toBeFocused();

    // 一覧そのものから Tab で進み、閉じる釦と一覧の本体（スクロール領域）を巡る
    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      'div "キーボード操作の割り当て一覧"',
      'button "閉じる"',
      'div "キー操作使える場面Alt+Insert選択行の直後に行を挿入"',
    ]);

    await dialog.focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
  });

  /** 本文の釦をキーボードで押して開くダイアログと、その中で Tab が止まる要素 */
  const DIALOG_CASES: ReadonlyArray<{
    title: string;
    opener: string;
    descriptors: string[];
    lastControl: (dialog: Locator) => Locator;
  }> = [
    {
      title: '見積書の削除の確認のダイアログ',
      opener: '削除',
      descriptors: ['button "キャンセル"', 'button "削除"'],
      lastControl: (dialog) => dialog.getByRole('button', { name: '削除', exact: true }),
    },
    {
      title: '受領見積書の転記のダイアログ',
      opener: '受領見積書を業者金額に転記',
      descriptors: ['select "受領見積書を選択"', 'select "転記先見積項目"', 'button "キャンセル"'],
      lastControl: (dialog) => dialog.getByRole('combobox', { name: '転記先見積項目' }),
    },
    {
      title: '業者金額の転記（NET の案分）のダイアログ',
      opener: '業者金額を実行金額に転記',
      descriptors: ['select "対象業者を選択"', 'button "キャンセル"'],
      lastControl: (dialog) => dialog.getByRole('combobox', { name: '対象業者を選択' }),
    },
    {
      title: '実行金額の転記（利益率）のダイアログ',
      opener: '実行金額を見積金額に転記',
      descriptors: [
        'input "利益率 (%)"',
        'input "すべて上書き（名称・規格・単位・数量・単価）"',
        'button "キャンセル"',
        'button "適用"',
      ],
      lastControl: (dialog) => dialog.getByRole('button', { name: '適用', exact: true }),
    },
    {
      title: '諸経費の計算のダイアログ',
      opener: '諸経費を計算して追加',
      descriptors: [
        'button "閉じる"',
        'select "諸経費種別"',
        'input "直接工事費"',
        'input "工期"',
        'input "改修工事"',
        'input "計算金額"',
      ],
      lastControl: (dialog) => dialog.getByLabel('計算金額'),
    },
    {
      title: '出力のダイアログ',
      opener: '出力',
      descriptors: [
        'input "見積見積金額行を出力します"',
        'input "実行実行金額行を出力します"',
        'input "業者業者金額行を出力します"',
        'input "Excel形式編集可能なExcelファイル（.xlsx）で出力します"',
        'button "キャンセル"',
        'button "出力"',
      ],
      lastControl: (dialog) => dialog.getByRole('button', { name: '出力', exact: true }),
    },
  ];

  for (const dialogCase of DIALOG_CASES) {
    test(`${dialogCase.title}の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ`, async ({
      page,
    }) => {
      await openDetailPage(page);
      await pressByKeyboard(page, dialogCase.opener);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      // ダイアログの中の選択肢などの読み込みが終わり、最後に止まる部品が出るのを待つ
      await expect(dialogCase.lastControl(dialog)).toBeVisible({ timeout: getTimeout(10000) });
      await resetFocusToDocumentStart(page);

      const visits = await walkFocusWithin(page, DIALOG_SCOPE, DIALOG_WALK_MAX_STEPS);

      expectClearFocusWalk(visits, dialogCase.descriptors);
    });
  }

  test('未保存の変更の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page);
    await editNoteByKeyboard(page);

    // 本文のパンくずの見積書一覧への導線をキーボードで押し、離脱の確認を出す
    await page.getByRole('main').getByRole('link', { name: '見積書一覧' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '変更が保存されていません' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByRole('button', { name: 'このページにとどまる' })).toBeFocused();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "このページにとどまる"', 'button "ページを離れる"']);

    // とどまる（Escape）と、画面と未保存の変更はそのまま残る
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}$`));
    await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();
  });
});
