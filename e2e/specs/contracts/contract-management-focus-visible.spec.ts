/**
 * @fileoverview 契約書の画面のフォーカス表示のE2Eテスト
 *
 * Task 17.1: 契約書のフォーム（ContractForm）の入力欄・選択・文章の欄のインラインの outline の打ち消しを
 * 外し、フォーカス表示を共通の :focus-visible の輪に一本化する。併せて、契約書の一覧・作成・編集・詳細の
 * 画面とダイアログでフォーカスを受ける要素を状態ごとに網羅して測る。
 *
 * 画面を状態ごとに、文書の先頭から Tab だけで進めて範囲を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - 一覧画面の契約書が無い本文、契約書が 2 件ある本文、一覧の取得に失敗した本文（再試行の釦）、
 *     契約書が 2 件ある本文のモバイル幅（375px）
 *   - 作成画面の初期の本文、変更契約を選び基となる契約書を選んだ本文（監理者の選択をクリアする釦を含む）、
 *     必須の欄を空のまま送信して検証エラーを出した本文、作成の要求が失敗した本文、
 *     プロジェクトの取得に失敗した本文（再試行の釦）、初期の本文のモバイル幅（375px）
 *   - 編集画面の初期の本文、契約日を空にして検証エラーを出した本文、保存の要求が失敗した本文、
 *     契約書の取得に失敗した本文（再試行の釦）、初期の本文のモバイル幅（375px）
 *   - 詳細画面の変更契約（契約前）の本文と、削除の確認のダイアログ、削除に失敗した後の確認のダイアログと
 *     失敗のトースト、ステータスの変更に失敗した後の本文と失敗のトースト、契約済の新規契約の本文、
 *     詳細の取得に失敗した本文（再試行の釦）と失敗のトースト、変更契約の本文のモバイル幅（375px）
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、範囲へ入った最初の要素から
 * 範囲を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。範囲の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 状態はキーボードの操作で作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。選択と日付の値は locator の
 * selectOption / fill で入れる（どちらもポインタの操作を伴わない）。
 * 失敗は page.route でその要求だけをパスで判定して差し替え、テスト用の DB の契約書を書き換えない。
 * 再試行の釦は再試行できる失敗（5xx）のときだけ出る画面があり、API クライアントは 5xx を 3 回まで
 * 再試行するため、その画面では 4 件の要求がすべて失敗してから測る。それ以外の失敗は再試行しない 4xx で作る。
 * 測る契約書・見積書・取引先・プロジェクトは、テスト用の DB へ直接作る（作成画面の操作に一覧・編集・
 * 詳細の測定を依らせないため）。削除の釦は契約書の削除の権限を持つ管理者にだけ出るため、管理者で入る。
 * 判定の作法は e2e/specs/schedules/construction-schedule-focus-visible.spec.ts に倣う
 * （背景画像のグラデーションの色も背景の候補に入れる）。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (contract-management):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 17.1 は、要件 1〜12 の契約書の画面の上で steering の方針の下限へ揃える。
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
    // 契約書のフォームは文章の欄（textarea）も label で名付けるため、textarea も label の文言で呼ぶ
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
/** 確認のダイアログやトーストの中で Tab を押す上限（一巡して余る回数） */
const SMALL_WALK_MAX_STEPS = 20;
/** 契約書の画面の本文 */
const MAIN_SCOPE = 'main';
/** 削除の確認のダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';
/** トースト（閉じる釦を直下に持つ通知。文書の中で本文より前に置かれる） */
const TOAST_SCOPE = '[role="alert"]:has(> button)';

/** 契約書が無い一覧画面と、作成画面を測るプロジェクトの名称 */
const EMPTY_PROJECT_NAME = 'E2E契約書フォーカス表示用プロジェクト（空）';
/** 契約書が 2 件ある一覧画面と、その編集・詳細画面を測るプロジェクトの名称 */
const POPULATED_PROJECT_NAME = 'E2E契約書フォーカス表示用プロジェクト（契約書あり）';
/** 作成画面で選ぶ見積書の名称（契約書が無いプロジェクトの見積書） */
const CREATE_ESTIMATE_NAME = 'フォーカス測定見積書（作成）';
/** 契約書の基となる見積書の名称（契約書があるプロジェクトの見積書） */
const SEEDED_ESTIMATE_NAME = 'フォーカス測定見積書';
/** 新規契約の監理者の取引先の名称 */
const SUPERVISOR_NAME = 'E2E契約書フォーカス表示用監理者';

/** 失敗の応答の本文（RFC 7807）。detail はトーストと本文のエラーの文言になる */
const FAILURE_DETAIL = 'E2E のフォーカス表示の測定のための失敗';

/** パンくずの、ダッシュボードから契約書一覧までの 4 つの導線 */
const BREADCRUMB_TO_LIST = [
  'a "ダッシュボード"',
  'a "プロジェクト一覧"',
  'a "プロジェクト"',
  'a "契約書一覧"',
];

/** 見積書の選択から監理者の欄までの、作成と編集で共通の部品（画面の並び順） */
const FORM_FIELD_DESCRIPTORS = [
  'select "見積書"',
  'input "消費税率（%）"',
  'input "契約日"',
  'input "工期着手日"',
  'input "工期完成日"',
  'input "引渡日"',
  'textarea "支払条件"',
  'textarea "別途工事"',
  'textarea "その他"',
  'input "監理者"',
];

/**
 * 作成画面（新規契約）の本文が Tab で止まる要素。契約種類の radio は一つの組で、Tab は選ばれた方に
 * だけ止まる。日付の欄は Tab が年・月・日の区画を移る間を一つの要素として数える
 */
const CREATE_FORM_DESCRIPTORS = [
  ...BREADCRUMB_TO_LIST,
  'input "新規契約"',
  ...FORM_FIELD_DESCRIPTORS,
  'button "キャンセル"',
  'button "作成"',
];

/**
 * 編集画面の本文が Tab で止まる要素。契約種類の radio は編集では無効のため止まらない。
 * 監理者が選ばれているため、監理者の選択をクリアする釦が出る
 */
const EDIT_FORM_DESCRIPTORS = [
  ...BREADCRUMB_TO_LIST,
  'a "契約書詳細"',
  ...FORM_FIELD_DESCRIPTORS,
  'button "選択をクリア"',
  'button "キャンセル"',
  'button "保存"',
];

/** 一覧画面の本文の、パンくずの導線 3 つと新規作成の導線 */
const LIST_HEADER_DESCRIPTORS = [
  'a "ダッシュボード"',
  'a "プロジェクト一覧"',
  'a "プロジェクト"',
  'a "契約書を新規作成"',
];

/**
 * 契約書が 2 件ある一覧画面の本文が Tab で止まる要素。行は契約種類・契約日・ステータス・
 * 請負代金額の 4 つの導線で、作成日時の新しい変更契約が先に並ぶ（日付は投入した固定の値）
 */
const POPULATED_LIST_DESCRIPTORS = [
  ...LIST_HEADER_DESCRIPTORS,
  'a "変更契約"',
  'a "2026年6月1日"',
  'a "契約前"',
  'a "￥1,320,000"',
  'a "新規契約"',
  'a "2026年4月1日"',
  'a "契約済"',
  'a "￥1,100,000"',
];

/** 変更契約（契約前）の詳細画面の本文が Tab で止まる要素 */
const AMENDMENT_DETAIL_DESCRIPTORS = [
  ...BREADCRUMB_TO_LIST,
  'button "契約済にする"',
  'a "編集"',
  'button "削除"',
  `a "${SEEDED_ESTIMATE_NAME}"`,
  'a "新規契約（2026年4月1日）"',
];

let emptyProjectId: string;
let populatedProjectId: string;
let createEstimateId: string;
let seededEstimateId: string;
let supervisorId: string;
let parentContractId: string;
let amendmentContractId: string;

/**
 * 測定用のプロジェクト 2 件を作り、片方に見積書 1 件、もう片方に見積書 1 件・監理者の取引先 1 件と
 * 契約書 2 件（契約済の新規契約と、それを基にした契約前の変更契約）を作る
 */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
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
  createEstimateId = (
    await prisma.estimate.create({
      data: { projectId: emptyProjectId, name: CREATE_ESTIMATE_NAME },
    })
  ).id;
  seededEstimateId = (
    await prisma.estimate.create({
      data: { projectId: populatedProjectId, name: SEEDED_ESTIMATE_NAME },
    })
  ).id;
  supervisorId = (
    await prisma.tradingPartner.create({
      data: {
        name: SUPERVISOR_NAME,
        nameKana: 'イーツーイーケイヤクショフォーカスヒョウジヨウカンリシャ',
        address: '東京都千代田区フォーカス1-2-3',
        types: { create: { type: 'CUSTOMER' } },
      },
    })
  ).id;
  parentContractId = (
    await prisma.contract.create({
      data: {
        projectId: populatedProjectId,
        contractType: 'NEW',
        status: 'CONTRACTED',
        estimateId: seededEstimateId,
        contractDate: new Date('2026-04-01T00:00:00.000Z'),
        constructionStartDate: new Date('2026-04-10T00:00:00.000Z'),
        constructionEndDate: new Date('2026-09-30T00:00:00.000Z'),
        deliveryDate: new Date('2026-10-15T00:00:00.000Z'),
        supervisorTradingPartnerId: supervisorId,
        constructionPrice: 1000000,
        taxAmount: 100000,
        contractAmount: 1100000,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    })
  ).id;
  amendmentContractId = (
    await prisma.contract.create({
      data: {
        projectId: populatedProjectId,
        contractType: 'AMENDMENT',
        status: 'BEFORE_CONTRACT',
        parentContractId,
        estimateId: seededEstimateId,
        contractDate: new Date('2026-06-01T00:00:00.000Z'),
        constructionStartDate: new Date('2026-04-10T00:00:00.000Z'),
        constructionEndDate: new Date('2026-10-31T00:00:00.000Z'),
        deliveryDate: new Date('2026-11-15T00:00:00.000Z'),
        constructionPrice: 1200000,
        taxAmount: 120000,
        contractAmount: 1320000,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    })
  ).id;
}

/** 測定用のプロジェクトと、その下の契約書・見積書、監理者の取引先を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった分は undefined のため除く（空の in は何も消さない）
  const projectIds = [emptyProjectId, populatedProjectId].filter((id): id is string => !!id);
  const prisma = getPrismaClient();
  await prisma.contract.deleteMany({
    where: { projectId: { in: projectIds }, parentContractId: { not: null } },
  });
  await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.estimate.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.tradingPartner.deleteMany({ where: { name: SUPERVISOR_NAME } });
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
          title: status >= 500 ? 'Internal Server Error' : 'Bad Request',
          status,
          detail: FAILURE_DETAIL,
        }),
      });
    }
  );
  return () => hits;
}

/** フォームの選択肢と監理者の欄の読み込みが終わるのを待つ */
async function waitForFormReady(page: Page, estimateName: string): Promise<void> {
  await expect(
    page.getByRole('combobox', { name: '見積書' }).locator('option', { hasText: estimateName })
  ).toHaveCount(1, { timeout: getTimeout(10000) });
  await expect(page.getByRole('combobox', { name: '監理者' })).toBeEnabled({
    timeout: getTimeout(10000),
  });
}

/** 契約書が無いプロジェクトの作成画面を開き、フォームの表示を待つ */
async function openCreatePage(page: Page): Promise<void> {
  await page.goto(`/projects/${emptyProjectId}/contracts/new`);
  await expect(page.getByRole('heading', { name: '契約書作成', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await waitForFormReady(page, CREATE_ESTIMATE_NAME);
}

/** 新規契約の編集画面を開き、投入した値と監理者の表示を待つ */
async function openEditPage(page: Page): Promise<void> {
  await page.goto(`/projects/${populatedProjectId}/contracts/${parentContractId}/edit`);
  await expect(page.getByRole('heading', { name: '契約書編集', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await waitForFormReady(page, SEEDED_ESTIMATE_NAME);
  await expect(page.getByLabel('契約日')).toHaveValue('2026-04-01');
  await expect(page.getByRole('button', { name: '選択をクリア' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 契約書の詳細画面を開き、関連ドキュメントの見積書の導線の表示を待つ */
async function openDetailPage(page: Page, contractId: string): Promise<void> {
  await page.goto(`/projects/${populatedProjectId}/contracts/${contractId}`);
  await expect(page.getByRole('heading', { name: '契約書詳細', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('link', { name: SEEDED_ESTIMATE_NAME })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 契約書が 2 件ある一覧画面を開き、行の表示を待つ */
async function openPopulatedListPage(page: Page): Promise<void> {
  await page.goto(`/projects/${populatedProjectId}/contracts`);
  await expect(page.getByRole('heading', { name: '契約書一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByTestId(`contract-row-${parentContractId}`)).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByTestId(`contract-row-${amendmentContractId}`)).toBeVisible();
}

/** 釦をキーボードで押す */
async function pressByKeyboard(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).focus();
  await page.keyboard.press('Enter');
}

/**
 * 文書の先頭からトーストを一巡して測り、閉じる釦をキーボードで押して閉じる
 * （トーストは 5 秒で消え、消えると本文の要素の経路が変わるため、本文より先に測って閉じる）
 */
async function measureAndDismissToast(page: Page, message: string): Promise<void> {
  // 本文のエラーの枠（role=alert の直下に再試行の釦を持つ）と区別するため、閉じる釦で絞る
  const toast = page
    .locator(TOAST_SCOPE)
    .filter({ has: page.getByRole('button', { name: `${message}を閉じる` }) });
  await expect(toast).toBeVisible({ timeout: getTimeout(10000) });
  await resetFocusToDocumentStart(page);

  const toastVisits = await walkFocusWithin(page, TOAST_SCOPE, SMALL_WALK_MAX_STEPS);

  expectClearFocusWalk(toastVisits, [`button "${message}を閉じる"`]);
  await toast.getByRole('button', { name: `${message}を閉じる` }).focus();
  await page.keyboard.press('Enter');
  await expect(toast).toBeHidden({ timeout: getTimeout(10000) });
}

test.describe('契約書の画面のフォーカス表示', () => {
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
    await loginAsUser(page, 'ADMIN_USER');
  });

  // ==========================================================================
  // 一覧画面
  // ==========================================================================

  test('契約書が無い一覧画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto(`/projects/${emptyProjectId}/contracts`);
    await expect(page.getByText('契約書はまだありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [...LIST_HEADER_DESCRIPTORS, 'a "新規作成"']);
  });

  test('契約書が2件ある一覧画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openPopulatedListPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, POPULATED_LIST_DESCRIPTORS);
  });

  test('一覧画面で契約書の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 一覧の取得（GET /api/projects/:projectId/contracts）だけを 400 に差し替える
    const listHits = await routeFailure(
      page,
      `/api/projects/${populatedProjectId}/contracts`,
      'GET',
      400
    );
    await page.goto(`/projects/${populatedProjectId}/contracts`);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert.getByRole('button', { name: '再試行' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(listHits(), '前提: 一覧の取得の要求が 1 件送られる').toBe(1);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('契約書が2件ある一覧画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPopulatedListPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, POPULATED_LIST_DESCRIPTORS);
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

  test('作成画面で変更契約を選び基となる契約書を選んだ本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.goto(`/projects/${populatedProjectId}/contracts/new`);
    await expect(page.getByRole('heading', { name: '契約書作成', level: 1 })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await waitForFormReady(page, SEEDED_ESTIMATE_NAME);

    // 契約種類の radio の組を矢印キーで変更契約へ切り替える
    await page.getByRole('radio', { name: '新規契約' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: '変更契約' })).toBeChecked();
    const parentSelect = page.getByRole('combobox', { name: '基となる契約書' });
    await expect(parentSelect.locator(`option[value="${parentContractId}"]`)).toHaveCount(1, {
      timeout: getTimeout(10000),
    });
    await parentSelect.selectOption(parentContractId);
    // 基となる契約書の値が既定値として入り、監理者が選ばれてクリアの釦が出る
    await expect(page.getByLabel('契約日')).toHaveValue('2026-04-01', {
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('button', { name: '選択をクリア' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...BREADCRUMB_TO_LIST,
      'input "変更契約"',
      'select "基となる契約書"',
      ...FORM_FIELD_DESCRIPTORS,
      'button "選択をクリア"',
      'button "キャンセル"',
      'button "作成"',
    ]);
  });

  test('作成画面で必須の欄の検証エラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openCreatePage(page);

    // 必須の欄を空のまま作成の釦をキーボードで押すと、見積書・契約日・工期・引渡日に検証エラーが出る
    await pressByKeyboard(page, '作成');
    await expect(page.getByText('見積書の選択は必須です')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByText('引渡日の入力は必須です')).toBeVisible();
    await expect(page, '前提: 検証エラーで画面に留まる').toHaveURL(/\/contracts\/new$/);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面で作成の失敗のエラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 作成の要求（POST /api/projects/:projectId/contracts）だけを 400 に差し替える
    const createHits = await routeFailure(
      page,
      `/api/projects/${emptyProjectId}/contracts`,
      'POST',
      400
    );
    await openCreatePage(page);
    await page.getByRole('combobox', { name: '見積書' }).selectOption(createEstimateId);
    await page.getByLabel('契約日').fill('2026-04-01');
    await page.getByLabel('工期着手日').fill('2026-04-10');
    await page.getByLabel('工期完成日').fill('2026-09-30');
    await page.getByLabel('引渡日').fill('2026-10-15');
    await pressByKeyboard(page, '作成');

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(FAILURE_DETAIL, {
      timeout: getTimeout(10000),
    });
    expect(createHits(), '前提: 作成の要求が 1 件送られる').toBe(1);
    // 失敗の後も入力は保持され、部品は再び操作できる
    await expect(page.getByLabel('契約日')).toHaveValue('2026-04-01');
    await expect(page.getByRole('button', { name: '作成' })).toBeEnabled();
    await measureAndDismissToast(page, FAILURE_DETAIL);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, CREATE_FORM_DESCRIPTORS);
  });

  test('作成画面でプロジェクトの取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // プロジェクトの取得（GET /api/projects/:projectId）だけを 500 に差し替える。再試行の釦は再試行
    // できる失敗（5xx）のときだけ出るため 5xx で作り、API クライアントの 3 回の再試行まで失敗させる
    const projectHits = await routeFailure(page, `/api/projects/${emptyProjectId}`, 'GET', 500);
    await page.goto(`/projects/${emptyProjectId}/contracts/new`);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert.getByRole('button', { name: '再試行' })).toBeVisible({
      timeout: getTimeout(30000),
    });
    expect(projectHits(), '前提: 最初の要求と 3 回の再試行の 4 件が失敗する').toBe(4);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
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
  // 編集画面
  // ==========================================================================

  test('編集画面の初期の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_FORM_DESCRIPTORS);
  });

  test('編集画面で契約日の検証エラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openEditPage(page);
    await page.getByLabel('契約日').fill('');
    await pressByKeyboard(page, '保存');

    await expect(page.getByText('契約日の入力は必須です')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page, '前提: 検証エラーで画面に留まる').toHaveURL(/\/edit$/);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_FORM_DESCRIPTORS);
  });

  test('編集画面で保存の失敗のエラーを表示した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 保存の要求（PUT /api/contracts/:id）だけを 400 に差し替える（DB の契約書は書き換えない）
    const updateHits = await routeFailure(page, `/api/contracts/${parentContractId}`, 'PUT', 400);
    await openEditPage(page);
    await pressByKeyboard(page, '保存');

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(FAILURE_DETAIL, {
      timeout: getTimeout(10000),
    });
    expect(updateHits(), '前提: 保存の要求が 1 件送られる').toBe(1);
    await expect(page.getByRole('button', { name: '保存' })).toBeEnabled();
    await measureAndDismissToast(page, FAILURE_DETAIL);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_FORM_DESCRIPTORS);
  });

  test('編集画面で契約書の取得に失敗した本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 契約書の取得（GET /api/contracts/:id）だけを 500 に差し替える。再試行の釦は再試行できる
    // 失敗（5xx）のときだけ出るため 5xx で作り、API クライアントの 3 回の再試行まで失敗させる
    const detailHits = await routeFailure(page, `/api/contracts/${parentContractId}`, 'GET', 500);
    await page.goto(`/projects/${populatedProjectId}/contracts/${parentContractId}/edit`);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert.getByRole('button', { name: '再試行' })).toBeVisible({
      timeout: getTimeout(30000),
    });
    expect(detailHits(), '前提: 最初の要求と 3 回の再試行の 4 件が失敗する').toBe(4);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('編集画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openEditPage(page);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, EDIT_FORM_DESCRIPTORS);
  });

  // ==========================================================================
  // 詳細画面
  // ==========================================================================

  test('変更契約の詳細画面の本文と削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page, amendmentContractId);
    await resetFocusToDocumentStart(page);

    const mainVisits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(mainVisits, AMENDMENT_DETAIL_DESCRIPTORS);

    // 削除の釦をキーボードで押し、確認のダイアログを出す（確認は押さず、DB の契約書を残す）
    await pressByKeyboard(page, '削除');
    const dialog = page.getByRole('dialog', { name: 'この契約書を削除しますか?' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: 'キャンセル' }).focus();

    const dialogVisits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(dialogVisits, ['button "キャンセル"', 'button "削除する"']);

    // キャンセルで閉じ、契約書は残る
    await dialog.getByRole('button', { name: 'キャンセル' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page.getByRole('heading', { name: '契約書詳細', level: 1 })).toBeVisible();
  });

  test('削除の確認のダイアログで削除に失敗した状態の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 削除の要求（DELETE /api/contracts/:id）だけを 400 に差し替える（DB の契約書は消さない）
    const deleteHits = await routeFailure(
      page,
      `/api/contracts/${amendmentContractId}`,
      'DELETE',
      400
    );
    await openDetailPage(page, amendmentContractId);
    await pressByKeyboard(page, '削除');
    const dialog = page.getByRole('dialog', { name: 'この契約書を削除しますか?' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('button', { name: '削除する' }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog.getByRole('alert')).toHaveText('削除に失敗しました', {
      timeout: getTimeout(10000),
    });
    expect(deleteHits(), '前提: 削除の要求が 1 件送られる').toBe(1);
    await expect(dialog.getByRole('button', { name: '削除する' })).toBeEnabled();
    await measureAndDismissToast(page, '削除に失敗しました');
    // 一巡の起点をダイアログの先頭の「キャンセル」へ置く
    await dialog.getByRole('button', { name: 'キャンセル' }).focus();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, SMALL_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "キャンセル"', 'button "削除する"']);
  });

  test('詳細画面でステータスの変更に失敗した本文とトーストの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // ステータスの変更の要求（PATCH /api/contracts/:id/status）だけを 400 に差し替える
    const statusHits = await routeFailure(
      page,
      `/api/contracts/${amendmentContractId}/status`,
      'PATCH',
      400
    );
    await openDetailPage(page, amendmentContractId);
    await pressByKeyboard(page, '契約済にする');

    await measureAndDismissToast(page, FAILURE_DETAIL);
    expect(statusHits(), '前提: ステータスの変更の要求が 1 件送られる').toBe(1);
    await expect(page.getByRole('button', { name: '契約済にする' })).toBeEnabled();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, AMENDMENT_DETAIL_DESCRIPTORS);
  });

  test('契約済の新規契約の詳細画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await openDetailPage(page, parentContractId);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    // 契約済の契約書は「契約前に戻す」の釦を持ち、基となった契約書の導線は持たない
    expectClearFocusWalk(visits, [
      ...BREADCRUMB_TO_LIST,
      'button "契約前に戻す"',
      'a "編集"',
      'button "削除"',
      `a "${SEEDED_ESTIMATE_NAME}"`,
    ]);
  });

  test('詳細画面で契約書の取得に失敗した本文とトーストの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    // 詳細の取得（GET /api/contracts/:id）だけを 400 に差し替える（詳細画面の再試行の釦は失敗の種類に依らず出る）
    const detailHits = await routeFailure(
      page,
      `/api/contracts/${amendmentContractId}`,
      'GET',
      400
    );
    await page.goto(`/projects/${populatedProjectId}/contracts/${amendmentContractId}`);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert.getByRole('button', { name: '再試行' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(detailHits(), '前提: 詳細の取得の要求が 1 件送られる').toBe(1);
    await measureAndDismissToast(page, FAILURE_DETAIL);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "再試行"']);
  });

  test('変更契約の詳細画面のモバイル幅の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openDetailPage(page, amendmentContractId);
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, MAIN_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, AMENDMENT_DETAIL_DESCRIPTORS);
  });
});
