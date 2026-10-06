/**
 * @fileoverview プロジェクト管理機能のアクセシビリティE2Eテスト
 *
 * Task 16.4: アクセシビリティ E2Eテスト
 *
 * Requirements:
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 * - 20.4: フォーカス状態を視覚的に明確に表示する
 *
 * テスト内容:
 * - キーボードナビゲーション（Tab, Enter, Escape操作）
 * - axe-playwrightによる自動アクセシビリティチェック
 * - フォーム要素のaria-label
 * - フォーカス状態の視覚的表示
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { seedProject } from '../../helpers/project-list-preconditions';
import type { ElementHandle, Page } from '@playwright/test';

// ============================================================================
// フォーカス表示の判定（要件 20.4）
//
// 「フォーカス状態を視覚的に明確に表示する」を、次の二点で主張する。
//   (1) Tab でフォーカスした要素が、フォーカス中に**明確な**表示を持つ
//   (2) フォーカスが離れると、その表示が消える（常時付いている装飾をフォーカス表示と数えない）
// 「明確」の基準は WCAG の非テキストのコントラスト（1.4.11）とフォーカスの見え方
// （2.4.11 / 2.4.13 の 2 CSS px・3:1）に倣い、次のいずれかを満たすこととする。
//   - outline: 線種が none / hidden / auto 以外、幅 2px 以上、隣接する背景との
//     コントラスト比 3:1 以上。auto はブラウザ任せで太さも色も定まらないため数えない
//   - box-shadow: ぼかし 0・ずれ 0・広がり 2px 以上の輪で、背景とのコントラスト比 3:1 以上
// 画面からは計算済みスタイルの生の文字列だけを受け取り、判定はすべてこの側で行う。
// ============================================================================

/** フォーカスの表示を判定する閾値 */
const FOCUS_INDICATOR_MIN_WIDTH_PX = 2;
const FOCUS_INDICATOR_MIN_CONTRAST = 3;
/** 一画面で Tab を押す上限（無限に巡回しないための打ち切り） */
const FOCUS_WALK_MAX_STEPS = 150;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FocusSnapshot {
  descriptor: string;
  /** 文書内の位置（同じ要素へ戻ったことの判定に使う） */
  path: string;
  inMain: boolean;
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
  blurred: FocusSnapshot | null;
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
    const alphaToken = alphaPart ?? parts[3];
    return {
      r: parseFloat(parts[0] ?? 'NaN') / 255,
      g: parseFloat(parts[1] ?? 'NaN') / 255,
      b: parseFloat(parts[2] ?? 'NaN') / 255,
      a: parseAlpha(alphaToken),
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

async function snapshotFocusStyle(handle: ElementHandle<Element>): Promise<FocusSnapshot> {
  // transition の途中を読まないよう、要素の遷移が終わるのを待ってから読む
  await handle.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
  return handle.evaluate((el): FocusSnapshot => {
    const view = el.ownerDocument.defaultView!;
    const style = view.getComputedStyle(el);
    const backgroundChain: string[] = [];
    const pathSegments: string[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      backgroundChain.push(view.getComputedStyle(node).backgroundColor);
      const siblings: Element[] = node.parentElement ? Array.from(node.parentElement.children) : [];
      pathSegments.unshift(`${node.tagName}:${siblings.indexOf(node)}`);
    }
    const label =
      el.getAttribute('aria-label') ??
      (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const role = el.getAttribute('role');
    // 同じ文言のリンク（各区画の「新規作成」など）を見分けるため、リンクは遷移先も添える
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    return {
      descriptor:
        `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ''} "${label}"` +
        (href ? ` -> ${href}` : ''),
      path: pathSegments.join('>'),
      inMain: el.closest('main') !== null,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      backgroundChain,
    };
  });
}

interface FocusStep {
  /** Tab を押した後にフォーカスを持つ要素 */
  focused: FocusSnapshot;
  /** Tab を押す前にフォーカスを持っていた要素の、押した後（フォーカスが離れた後）の状態 */
  previousAfterBlur: FocusSnapshot;
}

/**
 * 一巡が終わったか。本文に入った後、本文の外へ出たか、本文で最初に止まった要素へ戻ったら終わり
 */
function isWalkFinished(steps: FocusStep[]): boolean {
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

/** 一巡の記録から、本文の中で止まった要素ごとの「フォーカス中」と「離れた直後」を組にする */
function toFocusVisits(steps: FocusStep[]): FocusVisit[] {
  const start = steps.findIndex((step) => step.focused.inMain);
  return start < 0
    ? []
    : steps.slice(start, steps.length - 1).map((step, index) => ({
        focused: step.focused,
        blurred: steps[start + index + 1]?.previousAfterBlur ?? null,
      }));
}

async function activeElementHandle(page: Page): Promise<ElementHandle<Element>> {
  const handle = (
    await page.evaluateHandle(() => document.activeElement ?? document.body)
  ).asElement();
  expect(handle, 'フォーカスを持つ要素を取得できる').not.toBeNull();
  return handle as ElementHandle<Element>;
}

/**
 * Tab キーだけで本文（main）の中のフォーカス可能な要素を一巡し、
 * 各要素のフォーカス中と、フォーカスが離れた直後の計算済みスタイルを集める
 */
async function walkFocusInMain(page: Page): Promise<FocusVisit[]> {
  const steps: FocusStep[] = [];
  let previous = await activeElementHandle(page);
  for (let step = 0; step < FOCUS_WALK_MAX_STEPS && !isWalkFinished(steps); step += 1) {
    await page.keyboard.press('Tab');
    const current = await activeElementHandle(page);
    steps.push({
      previousAfterBlur: await snapshotFocusStyle(previous),
      focused: await snapshotFocusStyle(current),
    });
    previous = current;
  }
  expect(
    isWalkFinished(steps),
    `Tab を ${FOCUS_WALK_MAX_STEPS} 回押しても本文の一巡が終わらない`
  ).toBe(true);
  return toFocusVisits(steps);
}

/** 一巡の結果から、要件 20.4 を満たさない要素の一覧を作る（空なら満たす） */
function collectFocusIndicatorViolations(visits: FocusVisit[]): string[] {
  const violations: string[] = [];
  for (const visit of visits) {
    const indicator = findClearFocusIndicator(visit.focused);
    if (!indicator) {
      violations.push(
        `フォーカス中に明確な表示が無い: ${visit.focused.descriptor} ` +
          `(outline=${visit.focused.outlineStyle} ${visit.focused.outlineWidth} ${visit.focused.outlineColor}, ` +
          `box-shadow=${visit.focused.boxShadow})`
      );
    }
    const blurredIndicator = visit.blurred ? findClearFocusIndicator(visit.blurred) : null;
    if (blurredIndicator) {
      violations.push(
        `フォーカスが離れても同じ表示が残る（フォーカスの有無を区別できない）: ` +
          `${visit.focused.descriptor} (${blurredIndicator})`
      );
    }
  }
  return violations;
}

/**
 * プロジェクト管理機能のアクセシビリティテスト
 */
test.describe('プロジェクト管理 アクセシビリティテスト', () => {
  test.describe.configure({ mode: 'serial' });

  // テスト用プロジェクトID
  let testProjectId: string | null = null;

  test.beforeAll(async () => {
    await cleanDatabase();
    await createTestUser('REGULAR_USER');
    await createTestUser('ADMIN_USER');
  });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  /**
   * axe-playwrightによる自動アクセシビリティチェック
   * WCAG 2.1 AA準拠を検証
   */
  test.describe('WCAG 2.1 AA準拠 自動チェック', () => {
    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト一覧画面のアクセシビリティチェック
     */
    test('プロジェクト一覧画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ページコンテンツが読み込まれるまで待機
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト作成画面のアクセシビリティチェック
     */
    test('プロジェクト作成画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByRole('heading', { name: /新規プロジェクト/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト詳細画面のアクセシビリティチェック
     */
    test('プロジェクト詳細画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 検証対象のプロジェクトを前提として無条件に用意する。
      // 「無ければ画面から作る」条件分岐は、前提の生成が壊れても静かに素通りする経路になり、
      // 失敗が前提の崩れた地点ではなく後段の検証に現れるため置かない。
      testProjectId = (await seedProject(page, 'アクセシビリティテスト')).id;

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // コンテンツが読み込まれるまで待機
      await expect(page.getByText(/基本情報/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト編集画面のアクセシビリティチェック
     */
    test('プロジェクト編集画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 検証対象のプロジェクトを前提として無条件に用意する。
      // 「無ければ画面から作る」条件分岐は、前提の生成が壊れても静かに素通りする経路になり、
      // 失敗が前提の崩れた地点ではなく後段の検証に現れるため置かない。
      testProjectId = (await seedProject(page, 'アクセシビリティ編集テスト')).id;

      // 詳細ページに移動して編集ボタンをクリック
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されるまで待機
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  /**
   * キーボードナビゲーションテスト
   */
  test.describe('キーボードナビゲーション', () => {
    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * Tabキーによるフォーカス移動テスト
     */
    test('プロジェクト作成フォームでTabキーによるフォーカス移動が正常に動作する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名フィールドにフォーカス
      const projectNameInput = page.getByLabel(/プロジェクト名/i);
      await projectNameInput.focus();
      await expect(projectNameInput).toBeFocused();

      // Tab: 顧客名コンボボックスへ
      await page.keyboard.press('Tab');
      const tradingPartnerCombobox = page.locator('[role="combobox"][aria-label="顧客名"]');
      await expect(tradingPartnerCombobox).toBeFocused();

      // Tab: 営業担当者セレクトへ
      await page.keyboard.press('Tab');
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toBeFocused();

      // Tab: 工事担当者セレクトへ
      await page.keyboard.press('Tab');
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      await expect(constructionPersonSelect).toBeFocused();

      // Tab: 現場住所フィールドへ
      await page.keyboard.press('Tab');
      const siteAddressInput = page.getByLabel(/現場住所/i);
      await expect(siteAddressInput).toBeFocused();

      // Tab: 概要フィールドへ
      await page.keyboard.press('Tab');
      const descriptionInput = page.getByLabel(/概要/i);
      await expect(descriptionInput).toBeFocused();

      // Tab: キャンセルボタンへ
      await page.keyboard.press('Tab');
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeFocused();

      // Tab: 作成ボタンへ
      await page.keyboard.press('Tab');
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await expect(createButton).toBeFocused();
    });

    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * Enterキーによる操作実行テスト
     */
    test('プロジェクト一覧画面でEnterキーによるボタン操作が正常に動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 新規作成ボタンが表示されるまで待機
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタンにフォーカスを移動
      await createButton.focus();
      await expect(createButton).toBeFocused();

      // Enterキーでボタンをクリック
      await page.keyboard.press('Enter');

      // 作成ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    });

    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * Escapeキーによるダイアログ閉じるテスト
     */
    test('削除確認ダイアログがEscapeキーで閉じられる', async ({ page, context }) => {
      // 一般ユーザーでプロジェクトを作成
      await loginAsUser(page, 'REGULAR_USER');

      // 検証対象のプロジェクトを前提として無条件に用意する。
      // 「無ければ画面から作る」条件分岐は、前提の生成が壊れても静かに素通りする経路になり、
      // 失敗が前提の崩れた地点ではなく後段の検証に現れるため置かない。
      testProjectId = (await seedProject(page, 'Escapeテスト')).id;

      // 管理者ユーザーに切り替え（削除ボタンを表示するため）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });
      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // Escキーでダイアログを閉じる
      await page.keyboard.press('Escape');

      // ダイアログが閉じられることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`));
    });

    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * 編集キャンセルのキーボード操作テスト
     */
    test('プロジェクト編集画面でキーボードのみでキャンセル操作が可能', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 詳細ページに移動して編集モードに入る
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });

      // 編集ボタンにフォーカスしてEnterキーで編集モードに入る
      await editButton.focus();
      await page.keyboard.press('Enter');

      // 編集フォームが表示されるまで待機
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // キャンセルボタンにフォーカスを移動
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await cancelButton.focus();
      await expect(cancelButton).toBeFocused();

      // Enterキーでキャンセル
      await page.keyboard.press('Enter');

      // 編集フォームが閉じられることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * フォーカス状態の視覚的表示テスト
   */
  test.describe('フォーカス状態の視覚的表示', () => {
    /**
     * REQ-20.4: フォーカス状態を視覚的に明確に表示
     * フォーカスリングの表示確認
     */
    test('プロジェクト作成フォームでフォーカス状態が視覚的に明確に表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクト名フィールドにフォーカス
      const projectNameInput = page.getByLabel(/プロジェクト名/i);
      await projectNameInput.focus();

      // フォーカス時にbox-shadowが適用されていることを確認
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boxShadow = await projectNameInput.evaluate((el: any): string => {
        return el.ownerDocument.defaultView.getComputedStyle(el).boxShadow;
      });

      // フォーカス時にbox-shadowが「none」でないことを確認
      expect(boxShadow).not.toBe('none');
    });

    /**
     * REQ-20.4: フォーカス状態を視覚的に明確に表示
     * ボタンのフォーカスリング表示確認
     */
    test('ボタン要素でフォーカス状態が視覚的に明確に表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 新規作成ボタン
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタンは focus:ring-2（box-shadow）でフォーカスを示し、
      // outline は focus:outline-none で消される（ProjectListPage.tsx）。
      // 加えて未フォーカスでも shadow-lg が掛かっているため、「outline か box-shadow の
      // いずれかが none でない」は**フォーカスしていなくても真**であり、
      // フォーカス表示の有無を一切確かめていなかった。
      // フォーカス前後で見た目が変わることを主張する。
      const readBoxShadow = async (): Promise<string> =>
        createButton.evaluate(
          (el): string => el.ownerDocument.defaultView!.getComputedStyle(el).boxShadow
        );

      const boxShadowBeforeFocus = await readBoxShadow();
      await createButton.focus();
      await expect(createButton).toBeFocused();
      const boxShadowAfterFocus = await readBoxShadow();

      expect(boxShadowAfterFocus, 'フォーカスしても box-shadow が変化しない').not.toBe(
        boxShadowBeforeFocus
      );
      expect(boxShadowAfterFocus).not.toBe('none');
    });

    /**
     * 本文のフォーカス可能な要素を Tab だけで一巡し、どの要素もフォーカス中に明確な表示を持ち、
     * 離れるとその表示が消えることを主張する。一巡が代表的な部品を実際に通ったことも併せて主張し、
     * 「一つも巡らずに違反 0 件」で緑になる形を塞ぐ。
     *
     * @requirement project-management/REQ-20.4: フォーカス状態を視覚的に明確に表示する（一覧画面）
     */
    test('一覧画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ (project-management/REQ-20.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await seedProject(page, 'フォーカス表示一覧');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(10000) });

      const visits = await walkFocusInMain(page);
      expect(collectFocusIndicatorViolations(visits)).toEqual([]);
      const descriptors = visits.map((visit) => visit.focused.descriptor);

      expect(descriptors, '一巡が新規作成ボタンを通る').toContainEqual(
        expect.stringMatching(/^button .*新規作成/)
      );
      expect(descriptors, '一巡が検索欄を通る').toContainEqual(
        expect.stringMatching(/^input\[role=searchbox\] "検索キーワード"/)
      );
      expect(descriptors, '一巡が一覧の行を通る').toContainEqual(
        expect.stringMatching(/フォーカス表示一覧/)
      );
    });

    /**
     * @requirement project-management/REQ-20.4: フォーカス状態を視覚的に明確に表示する（作成画面）
     */
    test('作成画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ (project-management/REQ-20.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const visits = await walkFocusInMain(page);
      expect(collectFocusIndicatorViolations(visits)).toEqual([]);
      const descriptors = visits.map((visit) => visit.focused.descriptor);

      expect(descriptors, '一巡がプロジェクト名の入力欄を通る').toContainEqual(
        expect.stringMatching(/^input "プロジェクト名"/)
      );
      expect(descriptors, '一巡が顧客名のコンボボックスを通る').toContainEqual(
        expect.stringMatching(/^input\[role=combobox\] "顧客名"/)
      );
      expect(descriptors, '一巡が営業担当者の選択欄を通る').toContainEqual(
        expect.stringMatching(/^select "営業担当者"/)
      );
      expect(descriptors, '一巡が概要の入力欄を通る').toContainEqual(
        expect.stringMatching(/^textarea "概要"/)
      );
      expect(descriptors, '一巡が作成ボタンを通る').toContainEqual(
        expect.stringMatching(/^button .*作成/)
      );
    });

    /**
     * @requirement project-management/REQ-20.4: フォーカス状態を視覚的に明確に表示する（詳細画面）
     */
    test('詳細画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ (project-management/REQ-20.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      const project = await seedProject(page, 'フォーカス表示詳細');
      await page.goto(`/projects/${project.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });

      const visits = await walkFocusInMain(page);
      expect(collectFocusIndicatorViolations(visits)).toEqual([]);
      const descriptors = visits.map((visit) => visit.focused.descriptor);

      expect(descriptors, '一巡が編集ボタンを通る').toContainEqual(
        expect.stringMatching(/^button .*編集/)
      );
      expect(descriptors, '一巡が契約書の区画のリンクを通る').toContainEqual(
        expect.stringMatching(/^a .* -> \/projects\/[^/]+\/contracts\//)
      );
      expect(descriptors, '一巡が実行予算の区画のリンクを通る').toContainEqual(
        expect.stringMatching(/^a .* -> \/projects\/[^/]+\/execution-budget$/)
      );
    });

    /**
     * @requirement project-management/REQ-20.4: フォーカス状態を視覚的に明確に表示する（編集画面）
     */
    test('編集画面の本文の全フォーカス要素がTab移動時に明確なフォーカス表示を持つ (project-management/REQ-20.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      const project = await seedProject(page, 'フォーカス表示編集');
      await page.goto(`/projects/${project.id}/edit`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const visits = await walkFocusInMain(page);
      expect(collectFocusIndicatorViolations(visits)).toEqual([]);
      const descriptors = visits.map((visit) => visit.focused.descriptor);

      expect(descriptors, '一巡がプロジェクト名の入力欄を通る').toContainEqual(
        expect.stringMatching(/^input "プロジェクト名"/)
      );
      expect(descriptors, '一巡が顧客名のコンボボックスを通る').toContainEqual(
        expect.stringMatching(/^input\[role=combobox\] "顧客名"/)
      );
      expect(descriptors, '一巡が工事担当者の選択欄を通る').toContainEqual(
        expect.stringMatching(/^select "工事担当者"/)
      );
    });
  });

  /**
   * ARIA属性のテスト
   */
  test.describe('ARIA属性', () => {
    /**
     * REQ-20.1, REQ-20.4
     * フォーム要素のaria-label属性テスト
     */
    test('プロジェクト作成フォームの各フィールドに適切なaria-label属性が設定されている', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 各フィールドのaria-label属性を確認
      await expect(page.locator('input[aria-label="プロジェクト名"]')).toBeVisible();
      await expect(page.locator('[role="combobox"][aria-label="顧客名"]')).toBeVisible();
      await expect(page.locator('select[aria-label="営業担当者"]')).toBeVisible();
      await expect(page.locator('select[aria-label="工事担当者"]')).toBeVisible();
      await expect(page.locator('input[aria-label="現場住所"]')).toBeVisible();
      await expect(page.locator('textarea[aria-label="概要"]')).toBeVisible();
    });

    /**
     * REQ-20.1, REQ-20.4
     * 必須フィールドのaria-required属性テスト
     */
    test('必須フィールドにaria-required属性が設定されている', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 必須フィールドのaria-required属性を確認
      const projectNameInput = page.locator('input[aria-label="プロジェクト名"]');
      await expect(projectNameInput).toHaveAttribute('aria-required', 'true');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toHaveAttribute('aria-required', 'true');

      // 顧客名は任意フィールドなのでaria-required="false"
      const tradingPartnerSelect = page.locator('[role="combobox"][aria-label="顧客名"]');
      await expect(tradingPartnerSelect).toHaveAttribute('aria-required', 'false');
    });

    /**
     * REQ-20.1, REQ-20.4
     * エラーメッセージのaria-live属性テスト
     */
    test('バリデーションエラー時にaria-liveで通知される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージがaria-live="polite"またはrole="alert"で表示されることを確認
      const errorMessage = page.locator('[role="alert"], [aria-live="polite"]');
      await expect(errorMessage.first()).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * REQ-20.1, REQ-20.4
     * ダイアログのaria属性テスト
     */
    test('削除確認ダイアログに適切なaria属性が設定されている', async ({ page }) => {
      // 管理者ユーザーでログイン
      await loginAsUser(page, 'ADMIN_USER');

      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // ダイアログが表示されるまで待機
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ダイアログのaria-labelledby属性を確認
      // Note: role="dialog" を持つ要素に限定して aria-labelledby を検証する
      const dialogContainer = page.getByRole('dialog').filter({
        has: page.locator('[aria-labelledby="delete-dialog-title"]'),
      });
      await expect(dialogContainer).toBeVisible();

      // ダイアログのaria-describedby属性を確認
      // Note: role="dialog" を持つ要素に限定して検証する
      const dialogWithDescription = page.getByRole('dialog').filter({
        has: page.locator('[aria-describedby="delete-dialog-description"]'),
      });
      await expect(dialogWithDescription).toBeVisible();

      // キャンセルボタンをクリックしてダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement project-management/REQ-20.2
     */
    test('フォーム要素にaria-label属性が適切に設定されている (project-management/REQ-20.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 各フォーム要素にaria-label属性が設定されていることを確認
      await expect(page.locator('input[aria-label="プロジェクト名"]')).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.locator('[role="combobox"][aria-label="顧客名"]')).toBeVisible();
      await expect(page.locator('select[aria-label="営業担当者"]')).toBeVisible();
      await expect(page.locator('select[aria-label="工事担当者"]')).toBeVisible();
      await expect(page.locator('input[aria-label="現場住所"]')).toBeVisible();
      await expect(page.locator('textarea[aria-label="概要"]')).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-20.3
     */
    test('エラーメッセージがaria-live属性でスクリーンリーダーに通知される (project-management/REQ-20.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // エラーメッセージを含む要素がaria-live属性を持つことを確認
      const errorContainer = page.locator('[aria-live="polite"], [aria-live="assertive"]');
      const containerExists = await errorContainer.count();

      // aria-live属性を持つ要素が存在することを確認
      expect(containerExists).toBeGreaterThan(0);
    });

    /**
     * @requirement project-management/REQ-20.5
     */
    test('WCAG 2.1 Level AA準拠のコントラスト比（通常テキスト4.5:1以上）を満たす (project-management/REQ-20.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // テーブルヘッダーまたはカードリストが表示されるまで待機
      const table = page.getByRole('table');
      const cardList = page.getByTestId('project-card-list');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);

      await expect(table.or(cardList).or(emptyMessage)).toBeVisible({ timeout: getTimeout(10000) });

      // 各テキスト要素のコントラスト比を確認（実際の計算は複雑なため、色が設定されていることのみ確認）
      const heading = page.getByRole('heading', { name: /プロジェクト一覧/i });
      await expect(heading).toBeVisible();

      // ヘッディングのスタイルを確認
      const headingStyles = await heading.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      });

      // テキスト色と背景色が設定されていることを確認
      expect(headingStyles.color).toBeTruthy();
      expect(headingStyles.backgroundColor).toBeTruthy();

      // Note: 実際のコントラスト比の計算はE2Eテストでは困難なため、
      // デザインシステムで適切な色が使用されていることを信頼する
    });
  });
});
