/**
 * @fileoverview 取引先のフォームの入力部品のフォーカス表示のE2Eテスト
 *
 * Task 33.1: 取引先のフォームの部品のインラインの outline の打ち消しを外し、
 * フォーカス表示を steering（tech.md の「フォーカス表示方針」）へ揃える。
 *
 * 作成・編集フォームを Tab だけで巡り、止まった入力部品ごとに次を主張する。
 *   (1) フォーカス中に、全画面共通の :focus-visible の outline（実線・幅 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) 入力欄が自前の影の輪（box-shadow）を重ねない（表示が二重にならない）
 *   (3) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 判定の作法は e2e/specs/projects/project-accessibility.spec.ts の「フォーカス状態の視覚的表示」に倣う。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements (trading-partner-management):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 33.1 は機能レベル検証の指摘の是正として、要件 12 の画面の上で steering の方針へ揃える。
 */

import { test, expect, type ElementHandle, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { seedTradingPartner } from '../../helpers/project-list-preconditions';

// ============================================================================
// フォーカス表示の判定
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
/** フォームの中で Tab を押す上限（無限に巡回しないための打ち切り） */
const FORM_WALK_MAX_STEPS = 30;

/** 作成・編集フォームで Tab が止まる入力部品の名前（画面の並び順） */
const EXPECTED_FORM_CONTROLS = [
  'input "取引先名"',
  'input "フリガナ"',
  'input "顧客"',
  'input "協力業者"',
  'input "住所"',
  'input "部課/支店/支社名"',
  'input "代表者名"',
  'input "電話番号"',
  'input "FAX番号"',
  'input "メールアドレス"',
  'select "請求締日"',
  'select "支払日 - 月"',
  'select "支払日 - 日"',
  'textarea "備考"',
];

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FocusSnapshot {
  descriptor: string;
  /** フォームの中の入力部品（input / select / textarea）か */
  isFormControl: boolean;
  /** 本文（main）の中の要素か */
  inMain: boolean;
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
    // 名前は aria-label、無ければ aria-labelledby の指す要素の文言（必須の印「*」は除く）
    const labelledBy = el.getAttribute('aria-labelledby');
    const labelledText = labelledBy
      ? (el.ownerDocument.getElementById(labelledBy)?.textContent ?? '').replace('*', '').trim()
      : (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    // 名前を持たない入力部品（label で包んだチェックボックスなど）は、結び付いた label の文言で名乗る
    const associatedLabel =
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement
        ? (el.labels?.[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()
        : '';
    const label = el.getAttribute('aria-label') ?? (labelledText || associatedLabel);
    const pathSegments: string[] = [];
    for (let node: Element | null = el; node?.parentElement; node = node.parentElement) {
      pathSegments.unshift(String(Array.prototype.indexOf.call(node.parentElement.children, node)));
    }
    return {
      descriptor: `${el.tagName.toLowerCase()} "${label}"`,
      isFormControl: el.matches('form input, form select, form textarea'),
      inMain: el.closest('main') !== null,
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
 * 取引先名の欄から Tab キーだけでフォームの入力部品を巡り、入力部品の外（ボタン）へ出たら止める。
 * 各入力部品のフォーカス中と、Tab で離れた直後の計算済みスタイルを組にして返す。
 */
async function walkFormControls(page: Page): Promise<FocusVisit[]> {
  const firstControl = page.getByRole('textbox', { name: '取引先名' });
  await firstControl.focus();
  await expect(firstControl).toBeFocused();

  const visits: FocusVisit[] = [];
  let current = await activeElementHandle(page);
  let focused = await snapshotFocusStyle(current);
  for (let step = 0; step < FORM_WALK_MAX_STEPS && focused.isFormControl; step += 1) {
    await page.keyboard.press('Tab');
    const next = await activeElementHandle(page);
    visits.push({ focused, blurred: await snapshotFocusStyle(current) });
    current = next;
    focused = await snapshotFocusStyle(next);
  }
  expect(
    focused.isFormControl,
    `Tab を ${FORM_WALK_MAX_STEPS} 回押してもフォームの入力部品の外へ出ない`
  ).toBe(false);
  return visits;
}

/** 巡った入力部品ごとに、フォーカス中・離れた直後の表示を判定の結果へまとめる */
function summarizeVisits(visits: FocusVisit[]): {
  descriptor: string;
  indicator: string;
  boxShadow: string;
  indicatorAfterBlur: string;
}[] {
  return visits.map((visit) => ({
    descriptor: visit.focused.descriptor,
    indicator: findClearFocusIndicator(visit.focused) ?? 'なし',
    boxShadow: visit.focused.boxShadow,
    indicatorAfterBlur: findClearFocusIndicator(visit.blurred) ?? 'なし',
  }));
}

/** 全入力部品が、共通の outline だけでフォーカスを示し、離れると消えることの期待値 */
function expectedSummary(): {
  descriptor: string;
  indicator: unknown;
  boxShadow: string;
  indicatorAfterBlur: string;
}[] {
  return EXPECTED_FORM_CONTROLS.map((descriptor) => ({
    descriptor,
    // 明確な表示は全画面共通の :focus-visible の outline が担う
    indicator: expect.stringMatching(/^outline solid 2px/),
    // 影の輪を重ねない（表示が二重にならない）
    boxShadow: 'none',
    // フォーカスが離れると表示が消える
    indicatorAfterBlur: 'なし',
  }));
}

/** 一覧画面の本文で Tab を押す上限（ヘッダー・本文・ページネーションを一巡して余る回数） */
const LIST_WALK_MAX_STEPS = 80;
/** 一覧画面の巡回で一覧に並べる取引先の件数（1 ページ 10 件で 2 ページ目を作り、ページの移動の釦を出す） */
const LIST_SEED_COUNT = 11;

interface ListFocusStep {
  /** Tab を押した後にフォーカスを持つ要素 */
  focused: FocusSnapshot;
  /** Tab を押す前にフォーカスを持っていた要素の、押した後（フォーカスが離れた後）の状態 */
  previousAfterBlur: FocusSnapshot;
}

/** 一巡が終わったか。本文に入った後、本文の外へ出たか、本文で最初に止まった要素へ戻ったら終わり */
function isListWalkFinished(steps: ListFocusStep[]): boolean {
  const start = steps.findIndex((step) => step.focused.inMain);
  const first = steps[start];
  const last = steps[steps.length - 1];
  return (
    first !== undefined &&
    last !== undefined &&
    steps.length - 1 > start &&
    (!last.focused.inMain || last.focused.path === first.focused.path)
  );
}

/**
 * Tab キーだけで一覧画面の本文（main）の中のフォーカスを受ける要素を一巡し、
 * 各要素のフォーカス中と、Tab で離れた直後の計算済みスタイルを組にして返す
 */
async function walkFocusInMain(page: Page): Promise<FocusVisit[]> {
  const steps: ListFocusStep[] = [];
  let previous = await activeElementHandle(page);
  for (let step = 0; step < LIST_WALK_MAX_STEPS && !isListWalkFinished(steps); step += 1) {
    await page.keyboard.press('Tab');
    const current = await activeElementHandle(page);
    steps.push({
      previousAfterBlur: await snapshotFocusStyle(previous),
      focused: await snapshotFocusStyle(current),
    });
    previous = current;
  }
  expect(
    isListWalkFinished(steps),
    `Tab を ${LIST_WALK_MAX_STEPS} 回押しても本文の一巡が終わらない`
  ).toBe(true);
  const start = steps.findIndex((step) => step.focused.inMain);
  return steps.slice(start, steps.length - 1).map((step, index) => ({
    focused: step.focused,
    blurred: steps[start + index + 1]!.previousAfterBlur,
  }));
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

test.describe('取引先のフォームの入力部品のフォーカス表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('作成フォームの全入力部品がTab移動時に共通のoutlineで明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/trading-partners/new');
    await expect(page.getByRole('heading', { name: /取引先の新規作成/ })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('textbox', { name: '取引先名' })).toBeVisible();

    const visits = await walkFormControls(page);

    expect(summarizeVisits(visits)).toEqual(expectedSummary());
  });

  test('編集フォームの全入力部品がTab移動時に共通のoutlineで明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const partner = await seedTradingPartner(page, 'フォーカス表示編集');
    await page.goto(`/trading-partners/${partner.id}/edit`);
    await expect(page.getByRole('heading', { name: /取引先の編集/ })).toBeVisible({
      timeout: getTimeout(10000),
    });
    // 既存の値がプリセットされてから巡る（読み込み中の表示のまま巡らない）
    await expect(page.getByRole('textbox', { name: '取引先名' })).toHaveValue(partner.name, {
      timeout: getTimeout(10000),
    });

    const visits = await walkFormControls(page);

    expect(summarizeVisits(visits)).toEqual(expectedSummary());
  });
});

test.describe('取引先の一覧画面のフォーカス表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * 一覧画面の本文を Tab だけで一巡し、止まった要素のどれもがフォーカス中に明確な表示
   * （outline か影の輪で、2px 以上・背景とのコントラスト比 3:1 以上）を持ち、離れると消えることを主張する。
   * 一巡が検索フィルタ・ソートの見出し・行・ページネーションの各部品を実際に通ったことも併せて主張し、
   * 「一つも巡らずに違反 0 件」で緑になる形を塞ぐ。
   */
  test('一覧画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    // 検索語で今回の取引先だけに絞り、1 ページ 10 件で 2 ページ目を作る
    const keyword = `フォーカス一覧${Date.now()}`;
    for (let index = 0; index < LIST_SEED_COUNT; index += 1) {
      await seedTradingPartner(page, `${keyword}-${String(index).padStart(2, '0')}`);
    }
    await page.goto(`/trading-partners?search=${encodeURIComponent(keyword)}&limit=10`);
    await expect(page.getByRole('heading', { name: '取引先一覧' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      page.getByRole('table', { name: '取引先一覧' }).getByText(keyword).first()
    ).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('button', { name: 'ページ 2' })).toBeVisible();

    const visits = await walkFocusInMain(page);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    const descriptors = visits.map((visit) => visit.focused.descriptor);
    expect(descriptors, '一巡が通る部品').toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^button ".*新規作成/),
        expect.stringMatching(/^input ".*検索/),
        'input "顧客"',
        'input "協力業者"',
        'button "フィルタをクリア"',
        expect.stringMatching(/^button ".+でソート"$/),
        expect.stringMatching(new RegExp(`^tr ".*${keyword}`)),
        'button "ページ 2"',
        expect.stringMatching(/^button ".*次/),
        expect.stringMatching(/^select /),
      ])
    );
  });
});
