/**
 * @fileoverview 見積依頼の作成・編集のフォームと受領見積書のフォームのフォーカス表示のE2Eテスト
 *
 * Task 101.1: 本スペックの部品・ページのインラインの outline の打ち消しを外し、
 * フォーカス表示を steering（tech.md の「フォーカス表示方針」）の下限へ揃える。
 *
 * 対象の画面（見積依頼の新規作成画面・編集画面・受領見積書の登録のダイアログ（明細行のエディタと
 * 行の操作メニューを含む。ファイルを選ぶ前と後の両方）・受領見積書の編集のダイアログ（既存のファイルあり）・
 * ダイアログを閉じた詳細画面（状態遷移の釦・受領見積書の一覧を含む））を Tab だけで巡り、止まった要素ごとに次を主張する。
 *   (1) フォーカス中に、明確な表示（実線の outline か、ぼかし 0 の影の輪で、太さ 2px 以上・
 *       隣接する背景とのコントラスト比 3:1 以上）が出る
 *   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
 * 一巡が対象の部品を実際に通ったことも併せて主張し、「一つも巡らずに違反 0 件」で緑になる形を塞ぐ。
 * 判定の作法は e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts に倣う。
 * 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
 *
 * Requirements coverage (estimate-request):
 * 対象の部品の受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 101.1 は、要件 3・9・11・12 の画面の上で steering の方針の下限へ揃える。
 */

import { test, expect, type ElementHandle, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  seedEstimateRequest,
  type EstimateRequestSeed,
} from '../../helpers/estimate-request-preconditions';

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
/** 画面の本文で Tab を押す上限（ヘッダーを抜けて本文を一巡して余る回数） */
const PAGE_WALK_MAX_STEPS = 60;
/** 受領見積書のフォームの中で Tab を押す上限 */
const FORM_WALK_MAX_STEPS = 40;
/** 操作メニューの中で Tab を押す上限 */
const MENU_WALK_MAX_STEPS = 6;
/** 詳細画面の本文で Tab を押す上限（ヘッダーを抜けて本文を一巡して余る回数） */
const DETAIL_WALK_MAX_STEPS = 150;

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
    for (let node: Element | null = el; node; node = node.parentElement) {
      backgroundChain.push(view.getComputedStyle(node).backgroundColor);
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

/** 受領見積書の登録のダイアログを、キーボードの操作だけで開く */
async function openReceivedQuotationCreateDialogByKeyboard(page: Page, estimateRequestId: string) {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  const openButton = page.getByRole('button', { name: '受領見積書登録' });
  await expect(openButton).toBeVisible({ timeout: getTimeout(10000) });
  await openButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '受領見積書の登録' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 受領見積書のフォームの範囲（ダイアログの中の form） */
const RECEIVED_QUOTATION_FORM_SCOPE = 'form:has(#quotation-name)';
/** 前提として置く受領見積書の名前 */
const RECEIVED_QUOTATION_NAME = 'フォーカス表示の受領見積書';

/** 画像のファイルを添えた受領見積書を API で一件作る（詳細画面の一覧と編集のダイアログを測るため） */
async function createReceivedQuotationWithFile(
  page: Page,
  seed: EstimateRequestSeed,
  name: string
): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const buffer = await fs.readFile(path.resolve('e2e/fixtures/test-image.png'));
  const response = await page.request.post(
    `${API_BASE_URL}/api/estimate-requests/${seed.estimateRequestId}/quotations`,
    {
      headers: { Authorization: `Bearer ${seed.accessToken}` },
      multipart: {
        name,
        submittedAt: '2026-10-01T00:00:00.000Z',
        file: { name: 'test-image.png', mimeType: 'image/png', buffer },
      },
    }
  );
  expect(response.ok(), `前提: 受領見積書が作成される (status=${response.status()})`).toBe(true);
}

test.describe('見積依頼の画面のフォーカス表示', () => {
  test.describe.configure({ mode: 'serial' });

  let seed: EstimateRequestSeed | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // ビューポートをデスクトップの大きさに揃える（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await loginAsUser(page, 'REGULAR_USER');
    if (seed === null) {
      const stamp = Date.now();
      seed = await seedEstimateRequest(page, {
        label: 'フォーカス表示',
        siteAddress: '東京都千代田区フォーカス1-1-1',
        partnerEmail: `focus-visible-${stamp}@example.com`,
        groupName: 'フォーカス表示グループ',
        item: {
          workType: '内装工事',
          name: 'フォーカス表示項目',
          specification: '規格A',
          unit: 'm2',
          quantity: 10,
        },
      });
      // 詳細画面の受領見積書の一覧と、編集のダイアログ（既存のファイルあり）を測るために一件置く
      await createReceivedQuotationWithFile(page, seed, RECEIVED_QUOTATION_NAME);
    }
  });

  test('新規作成画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await page.goto(`/projects/${seed!.projectId}/estimate-requests/new`);
    await expect(page.getByRole('heading', { name: '見積依頼 新規作成' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    // 内訳書の選択肢が読み込まれてから巡る（読み込み中の表示のまま巡らない）
    await expect(
      page.getByRole('combobox', { name: '内訳書' }).getByRole('option', { name: /テスト内訳書/ })
    ).toHaveCount(1, { timeout: getTimeout(10000) });

    const visits = await walkFocusWithin(page, 'main', PAGE_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通る部品'
    ).toEqual(
      expect.arrayContaining([
        'input "見積依頼名"',
        expect.stringMatching(/^input ".*宛先/),
        'select "内訳書"',
        'button "キャンセル"',
        'button "作成"',
      ])
    );
  });

  test('編集画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await page.goto(`/estimate-requests/${seed!.estimateRequestId}/edit`);
    await expect(page.getByRole('heading', { name: '見積依頼 編集' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    // 既存の値がプリセットされてから巡る
    await expect(page.getByRole('textbox', { name: '名前' })).toHaveValue(/テスト見積依頼/, {
      timeout: getTimeout(10000),
    });

    const visits = await walkFocusWithin(page, 'main', PAGE_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通る部品'
    ).toEqual(
      expect.arrayContaining([
        'a "詳細に戻る"',
        'input "名前"',
        'button "キャンセル"',
        'button "更新"',
      ])
    );
  });

  test('受領見積書の登録のフォームの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await openReceivedQuotationCreateDialogByKeyboard(page, seed!.estimateRequestId);
    const firstField = page.getByRole('textbox', { name: '受領見積書名' });
    await firstField.focus();
    await expect(firstField).toBeFocused();

    const visits = await walkFocusWithin(page, RECEIVED_QUOTATION_FORM_SCOPE, FORM_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通る部品（画面の並び順）'
    ).toEqual([
      'input "受領見積書名"',
      'input "提出日"',
      expect.stringMatching(/^div "ファイルを選択/),
      'button "項目選択から転記"',
      'input "行1 任意分類"',
      'input "行1 工種"',
      'input "行1 名称"',
      'input "行1 規格"',
      'input "行1 単位"',
      'input "行1 数量"',
      'input "行1 単価"',
      'input "行1 備考"',
      'button "行1の操作メニュー"',
      'button "行を追加"',
      'input "NET金額"',
      'button "キャンセル"',
      'button "登録"',
    ]);
  });

  test('ファイルを選んだ後の受領見積書のフォームの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await openReceivedQuotationCreateDialogByKeyboard(page, seed!.estimateRequestId);
    // ファイルを選ぶと、ファイルの削除の釦と OCR / データパースの欄が加わる
    await page.getByTestId('file-input').setInputFiles('e2e/fixtures/test-lineitem-table.xlsx');
    await expect(page.getByRole('button', { name: '一括取り込み' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const firstField = page.getByRole('textbox', { name: '受領見積書名' });
    await firstField.focus();
    await expect(firstField).toBeFocused();

    const visits = await walkFocusWithin(page, RECEIVED_QUOTATION_FORM_SCOPE, FORM_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通る部品（ファイルの選択で加わる部品を含む）'
    ).toEqual(
      expect.arrayContaining([
        'input "受領見積書名"',
        'button "削除"',
        expect.stringMatching(/^button ".*OCR \/ データパース"$/),
        'button "一括取り込み"',
        'input "行1 任意分類"',
        'input "NET金額"',
        'button "登録"',
      ])
    );
  });

  test('明細行の操作メニューの全項目がTab移動時に明確なフォーカス表示を持つ', async ({ page }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await openReceivedQuotationCreateDialogByKeyboard(page, seed!.estimateRequestId);
    // 2 行にして、1 行目のメニューの「下に移動」「削除」を活性にする
    const addButton = page.getByRole('button', { name: '行を追加' });
    await addButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: '行2 任意分類' })).toBeVisible();

    const toggle = page.getByRole('button', { name: '行1の操作メニュー' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    // メニューは開くと最初の活性な項目へフォーカスを移す
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: '下に移動' })).toBeFocused({
      timeout: getTimeout(5000),
    });

    const visits = await walkFocusWithin(page, '[role="menu"]', MENU_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通るメニューの項目'
    ).toEqual(['button "下に移動"', 'button "削除"']);
  });

  test('詳細画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await page.goto(`/estimate-requests/${seed!.estimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 状態遷移の釦と受領見積書の一覧が描かれてから巡る（読み込み中の表示のまま巡らない）
    await expect(page.getByRole('button', { name: 'ステータスを依頼済に変更する' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      page.getByRole('list', { name: '受領見積書一覧' }).getByText(RECEIVED_QUOTATION_NAME)
    ).toBeVisible({ timeout: getTimeout(10000) });

    const visits = await walkFocusWithin(page, 'main', DETAIL_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通る部品'
    ).toEqual(
      expect.arrayContaining([
        'a "見積依頼一覧"',
        'button "ステータスを依頼済に変更する"',
        'button "見積依頼文を表示"',
        'input "内訳書を本文に含める"',
        'button "受領見積書登録"',
        'button "プレビュー"',
        'button "編集"',
        'button "削除"',
      ])
    );
  });

  test('編集のダイアログ（既存のファイルあり）の受領見積書のフォームの全フォーカス要素がTab移動時に明確なフォーカス表示を持つ', async ({
    page,
  }) => {
    expect(seed, '前提: 見積依頼の前提データが作成されている').not.toBeNull();
    await page.goto(`/estimate-requests/${seed!.estimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    const editButton = page
      .getByRole('list', { name: '受領見積書一覧' })
      .getByRole('button', { name: '編集', exact: true });
    await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
    await editButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '受領見積書の編集' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    const firstField = page.getByRole('textbox', { name: '受領見積書名' });
    await expect(firstField).toHaveValue(RECEIVED_QUOTATION_NAME, { timeout: getTimeout(10000) });
    await firstField.focus();
    await expect(firstField).toBeFocused();

    const visits = await walkFocusWithin(page, RECEIVED_QUOTATION_FORM_SCOPE, FORM_WALK_MAX_STEPS);

    expect(collectFocusIndicatorViolations(visits)).toEqual([]);
    expect(
      visits.map((visit) => visit.focused.descriptor),
      '一巡が通る部品（既存のファイルで加わる部品を含む）'
    ).toEqual(
      expect.arrayContaining([
        'input "受領見積書名"',
        'button "削除"',
        expect.stringMatching(/^button ".*OCR \/ データパース"$/),
        'button "OCR実行"',
        'input "行1 任意分類"',
        'input "NET金額"',
        'button "更新"',
      ])
    );
  });
});
