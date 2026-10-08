/**
 * @fileoverview 工事写真の一覧画面のフォーカス表示のE2Eテスト
 *
 * Task 28.1: 工事写真の一覧の検索フィルタの「フィルタをクリア」のフォーカスの輪を 3:1 以上にする。
 * 併せて、一覧画面の本文（main）の中でフォーカスを受ける要素を網羅して測る。
 *
 * 一覧画面を状態ごとに、文書の先頭から Tab だけで進めて本文（main）を一巡し、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 巡る画面と状態:
 *   - デスクトップの表（1 ページ目の 50 件と次のページの釦、2 ページ目の 1 件と前のページの釦）
 *   - 検索の適用中（キーワードで 1 件に絞り、適用中のフィルタの件数を出した状態）と、検索の結果が 0 件の状態
 *   - アルバムの削除の確認のダイアログ
 *   - モバイル幅のカード
 * 一巡は文書の先頭（どの要素にもフォーカスが無い状態）から始め、本文へ入った最初の要素から
 * 本文を出るまでに止まった要素の並びを、順序と件数まで含めて主張する。本文の手前で止まる要素を
 * 読み飛ばさないこと、「一つも巡らずに違反 0 件」で緑になる形を塞ぐことを兼ねる。
 * 状態はキーボードの操作だけで作る（マウスで押すと、その後の要素の :focus-visible の照合が
 * ブラウザの経験則で変わり、表示の有無を正しく測れないため）。
 * 判定の作法は e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts に倣い、
 * 背景画像のグラデーションの色も背景の候補に入れる点は e2e/specs/auth/auth-forms-focus-visible.spec.ts に倣う。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (construction-photo):
 * 受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 28.1 は、要件 3 の一覧画面の上で steering の方針の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import { seedProject, type SeededProject } from '../../helpers/project-list-preconditions';
import { API_BASE_URL } from '../../config';

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
/**
 * 一覧画面で Tab を押す上限。文書の先頭から共通ヘッダーを抜けて本文（main）へ入り、
 * 1 ページ 50 件の行（行・編集・削除の 3 要素ずつ）とページネーションを一巡して余る回数
 */
const LIST_WALK_MAX_STEPS = 260;
/** 削除の確認のダイアログの中で Tab を押す上限（一巡して余る回数） */
const DIALOG_WALK_MAX_STEPS = 20;
/** 一覧画面の本文 */
const MAIN_SCOPE = 'main';
/** 削除の確認のダイアログ */
const DIALOG_SCOPE = '[role="dialog"]';

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

/** 一覧の 1 ページの件数（frontend/src/pages/ConstructionPhotoListPage.tsx の PAGE_LIMIT） */
const PAGE_LIMIT = 50;

/** ログイン済みのページから API 呼び出し用の認証ヘッダを得る */
async function authHeaders(page: Page): Promise<{ Authorization: string }> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
  assertPrepared(accessToken, '認証トークン');
  return { Authorization: `Bearer ${accessToken}` };
}

/** プロジェクトを 1 件作り、その下へ名前を与えたアルバムを順に作る */
async function seedProjectWithAlbums(page: Page, albumNames: string[]): Promise<SeededProject> {
  const project = await seedProject(page, '工事写真フォーカス表示');
  const headers = await authHeaders(page);
  for (const name of albumNames) {
    const response = await page.request.post(
      `${API_BASE_URL}/api/projects/${project.id}/construction-photos`,
      { headers, data: { name } }
    );
    expect(
      response.ok(),
      `前提: アルバム「${name}」が作成される (status=${response.status()})`
    ).toBeTruthy();
  }
  return project;
}

/** 一覧の既定の並び（作成日の降順）で、指定したページに並ぶアルバムの名前を API から読む */
async function listedAlbumNames(
  page: Page,
  projectId: string,
  pageNumber: number
): Promise<string[]> {
  const response = await page.request.get(
    `${API_BASE_URL}/api/projects/${projectId}/construction-photos?page=${pageNumber}&limit=${PAGE_LIMIT}&sort=createdAt&order=desc`,
    { headers: await authHeaders(page) }
  );
  expect(response.status(), '前提: アルバムの一覧を取得できる').toBe(200);
  const body = (await response.json()) as { data: { name: string }[] };
  return body.data.map((album) => album.name);
}

/** 正規表現の特殊文字を逃がす */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 表の 1 行が Tab で止まる要素（行・編集・削除）の名前 */
function rowDescriptors(albumName: string): unknown[] {
  return [
    // 行は名前を持たないため、行の文言（先頭がアルバム名）で名乗る
    expect.stringMatching(new RegExp(`^tr "${escapeRegExp(albumName)}`)),
    `button "${albumName}を編集"`,
    `button "${albumName}を削除"`,
  ];
}

/** モバイル幅のカード 1 枚が Tab で止まる要素（詳細を開く釦・編集・削除）の名前 */
function cardDescriptors(albumName: string): unknown[] {
  return [
    `button "${albumName}の詳細を表示"`,
    `button "${albumName}を編集"`,
    `button "${albumName}を削除"`,
  ];
}

/** 本文の先頭から検索フィルタまでで Tab が止まる要素の名前（ブレッドクラム・見出しの行・検索フィルタ） */
function headDescriptors(project: SeededProject, sortOrderLabel: string): unknown[] {
  return [
    'a "ダッシュボード"',
    'a "プロジェクト一覧"',
    `a "${project.name}"`,
    'a "工事看板マスタ"',
    'a "+ 新規作成"',
    'input "検索キーワード"',
    'button "検索"',
    'select "並び替え"',
    `button "ソート順序を切り替え（現在: ${sortOrderLabel}）"`,
    'button "フィルタをクリア"',
  ];
}

/** 表の見出しのソートの釦の名前 */
const SORT_HEADER_DESCRIPTORS = ['button "作成日でソート"', 'button "更新日でソート"'];

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

/** 一覧画面を開き、表（またはカード）の読み込みが終わるのを待つ */
async function openListPage(page: Page, project: SeededProject): Promise<void> {
  await page.goto(`/projects/${project.id}/construction-photos`);
  await expect(page.getByRole('heading', { name: '工事写真一覧' })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.locator('main[aria-busy]')).toHaveAttribute('aria-busy', 'false', {
    timeout: getTimeout(10000),
  });
}

/** 検索欄へキーボードで語を打ち、Enter で検索を適用する */
async function searchByKeyboard(page: Page, keyword: string): Promise<void> {
  const searchInput = page.getByRole('searchbox', { name: '検索キーワード' });
  await searchInput.focus();
  // 入力済みの語を選んでから打ち、置き換える（検索語は 2 文字以上）
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(keyword);
  await expect(searchInput).toHaveValue(keyword);
  await page.keyboard.press('Enter');
  await expect(page.locator('main[aria-busy]')).toHaveAttribute('aria-busy', 'false', {
    timeout: getTimeout(10000),
  });
}

test.describe('工事写真の一覧画面のフォーカス表示', () => {
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

  test('表の1ページ目と2ページ目の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const albumNames = Array.from(
      { length: PAGE_LIMIT + 1 },
      (_, index) => `焦点${String(index + 1).padStart(2, '0')}`
    );
    const project = await seedProjectWithAlbums(page, albumNames);
    const firstPageNames = await listedAlbumNames(page, project.id, 1);
    const secondPageNames = await listedAlbumNames(page, project.id, 2);
    expect(
      [firstPageNames.length, secondPageNames.length],
      '前提: 50 件と 1 件の 2 ページ'
    ).toEqual([PAGE_LIMIT, 1]);

    await openListPage(page, project);
    await expect(page.getByRole('table', { name: '工事写真一覧' })).toBeVisible();
    await resetFocusToDocumentStart(page);

    const firstPageVisits = await walkFocusWithin(page, MAIN_SCOPE, LIST_WALK_MAX_STEPS);

    expectClearFocusWalk(firstPageVisits, [
      ...headDescriptors(project, '降順（新しい順）'),
      ...SORT_HEADER_DESCRIPTORS,
      ...firstPageNames.flatMap(rowDescriptors),
      'button "次のページ"',
    ]);

    // 次のページの釦をキーボードで押して 2 ページ目へ移る
    await page.getByRole('button', { name: '次のページ' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('page-info')).toHaveText('2 / 2 ページ', {
      timeout: getTimeout(10000),
    });
    await expect(page.locator('main[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await resetFocusToDocumentStart(page);

    const secondPageVisits = await walkFocusWithin(page, MAIN_SCOPE, LIST_WALK_MAX_STEPS);

    expectClearFocusWalk(secondPageVisits, [
      ...headDescriptors(project, '降順（新しい順）'),
      ...SORT_HEADER_DESCRIPTORS,
      ...secondPageNames.flatMap(rowDescriptors),
      'button "前のページ"',
    ]);
  });

  test('検索の適用中と検索の結果が0件の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const project = await seedProjectWithAlbums(page, ['焦点甲乙', '焦点丙丁']);
    await openListPage(page, project);
    await expect(page.getByRole('table', { name: '工事写真一覧' })).toBeVisible();

    await searchByKeyboard(page, '甲乙');
    await expect(page.getByText('件のフィルタが適用中')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('table', { name: '工事写真一覧' }).getByRole('row')).toHaveCount(2);
    await resetFocusToDocumentStart(page);

    const filteredVisits = await walkFocusWithin(page, MAIN_SCOPE, LIST_WALK_MAX_STEPS);

    expectClearFocusWalk(filteredVisits, [
      ...headDescriptors(project, '降順（新しい順）'),
      ...SORT_HEADER_DESCRIPTORS,
      ...rowDescriptors('焦点甲乙'),
    ]);

    await searchByKeyboard(page, '該当なし');
    await expect(page.getByText('工事写真アルバムがありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
    await resetFocusToDocumentStart(page);

    const emptyVisits = await walkFocusWithin(page, MAIN_SCOPE, LIST_WALK_MAX_STEPS);

    expectClearFocusWalk(emptyVisits, [
      ...headDescriptors(project, '降順（新しい順）'),
      // 空の表示の中の新規作成の導線
      'a "+ 新規作成"',
    ]);
  });

  test('アルバムの削除の確認のダイアログの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const project = await seedProjectWithAlbums(page, ['焦点削除']);
    await openListPage(page, project);

    // 行の削除の釦をキーボードで押してダイアログを開く（初期のフォーカスはキャンセルの釦）
    await page.getByRole('button', { name: '焦点削除を削除' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'アルバムの削除' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeFocused();

    const visits = await walkFocusWithin(page, DIALOG_SCOPE, DIALOG_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, ['button "キャンセル"', 'button "削除"']);
  });

  test('モバイル幅のカードの本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    const project = await seedProjectWithAlbums(page, ['焦点一', '焦点二']);
    const names = await listedAlbumNames(page, project.id, 1);
    await page.setViewportSize({ width: 375, height: 812 });
    await openListPage(page, project);
    await expect(page.getByTestId('album-card-list')).toBeVisible();
    await resetFocusToDocumentStart(page);

    const visits = await walkFocusWithin(page, MAIN_SCOPE, LIST_WALK_MAX_STEPS);

    expectClearFocusWalk(visits, [
      ...headDescriptors(project, '降順（新しい順）'),
      ...names.flatMap(cardDescriptors),
    ]);
  });
});
