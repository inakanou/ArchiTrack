/**
 * @fileoverview 「検証無効化」検出規則の自己検査
 *
 * scripts/check-e2e-assertion-guards.ts の検出規則が、意図した書き方を
 * 捕捉し（漏れ）、意図しない書き方を捕捉しない（過検出）ことを、
 * 書き方そのものを注入して確認する。
 *
 * 使用方法:
 *   npx tsx scripts/check-e2e-assertion-guards.selftest.ts
 *   npm run check:e2e-guards:selftest
 *
 * 検出漏れの是正（タスク 115.24）と過検出の圧縮（タスク 115.25）は
 * 相反する方向の変更であるため、双方をこの一覧で同時に固定する。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_BASELINE_PATH,
  buildObservationPattern,
  collectBooleanHelperNames,
  collectE2eFiles,
  getObservationPattern,
  getObservationVocabulary,
  run,
  scanSource,
  type GuardType,
  type RunOptions,
} from './check-e2e-assertion-guards.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する書き方 */
  source: string;
  /**
   * 書き方の注入では確かめられない規則の確認（自前で失敗の一覧を返す）。
   * 指定した場合は走査を行わず、この関数の結果だけを見る。
   */
  custom?: () => string[];
  /** 検出されていなければならない型（同じ行に限定しない） */
  expected: GuardType[];
  /** 検出されてはならない型 */
  forbidden?: GuardType[];
  /** 理由の無い除外注釈が検出されること */
  expectInvalidAllow?: boolean;
  /** 除外注釈により検出が抑止されること */
  expectAllowed?: boolean;
}

// ============================================================================
// 115.24: 捕捉できていなかった三つの書き方
// ============================================================================

const MISSED_FORMS: Case[] = [
  {
    name: '115.24-1 分割して受ける形（観測結果を分割代入で受けて黙って抜ける）',
    source: [
      "test('destructured', async ({ page }) => {",
      '  const { visible } = await page.evaluate(() => ({ visible: false }));',
      '  if (!visible) {',
      '    return;',
      '  }',
      "  await expect(page.getByRole('dialog')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '115.24-2 宣言と代入を分ける形（上位の有効範囲の宣言に後から代入する）',
    source: [
      'let testProjectId: string;',
      'test.beforeAll(async () => {',
      '  testProjectId = await createProject();',
      '});',
      "test('declared then assigned', async ({ page }) => {",
      '  if (!testProjectId) {',
      '    return;',
      '  }',
      "  await expect(page.getByText('x')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '115.24-3 三項で検証を包む形',
    source: [
      "test('ternary', async ({ page }) => {",
      "  const shown = await page.getByRole('dialog').isVisible();",
      "  shown ? await expect(page.getByRole('dialog')).toBeVisible() : undefined;",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
];

// ============================================================================
// 115.25: 圧縮の対象（正当な主張であり数えてはならない）
// ============================================================================

const OVER_DETECTIONS: Case[] = [
  {
    name: '115.25-1 空文字で宣言して後から代入した値の検証',
    source: [
      "let accessToken: string = '';",
      "test('login', async ({ request }) => {",
      "  const loginResponse = await request.post('/api/v1/auth/login');",
      '  const loginBody = await loginResponse.json();',
      '  accessToken = loginBody.accessToken;',
      '  expect(accessToken).toBeTruthy();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T3-tautology'],
  },
  {
    name: '115.25-2 既定値を補ったうえでの検証',
    source: [
      "test('project id', async ({ page }) => {",
      '  const match = page.url().match(/\\/projects\\/([0-9a-f-]+)$/);',
      '  const projectId = match?.[1] ?? null;',
      '  expect(projectId).toBeTruthy();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T3-tautology'],
  },
  {
    name: '115.25-3 比較の形を持つ式（リテラル比較は実質のある検証）',
    source: [
      "test('status', async ({ request }) => {",
      "  const response = await request.get('/api/health');",
      '  expect(response.status() === 304).toBeTruthy();',
      '  expect(response.status() >= 200).toBeTruthy();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T3-tautology'],
  },
];

// ============================================================================
// 115.25: 圧縮の境界（代入の右辺のうち何を主題として評価するか）
//
// 「後から代入される名前は宣言時の値を辿らない」という圧縮の規則は、
// 代入の右辺まで一律に打ち切ると本物の恒真判定を取り逃がす。
// 右辺の形そのものが恒真になり得るもの（論理和・既定値・型判定）は評価し、
// 真偽リテラルの単純な代入は評価しない、という境界をここで固定する。
// ============================================================================

const ASSIGNMENT_BOUNDARY: Case[] = [
  {
    name: '115.25-4 論理和を代入した値の検証は恒真として検出する',
    source: [
      "test('assigned disjunction', async ({ page }) => {",
      '  let errorFound = false;',
      '  const currentUrl = page.url();',
      "  const isStillOnNewPage = currentUrl.includes('/trading-partners/new');",
      '  const didNotNavigateToDetail = !currentUrl.match(/\\/trading-partners\\/[0-9a-f-]+$/);',
      '  errorFound = isStillOnNewPage || didNotNavigateToDetail;',
      '  expect(errorFound).toBeTruthy();',
      '});',
    ].join('\n'),
    expected: ['T3-tautology'],
  },
  {
    name: '115.25-5 条件のもとで真を代入する観測フラグは検出しない',
    source: [
      "test('observed flag', async ({ page }) => {",
      '  let downloadHappened = false;',
      "  if (await page.getByRole('dialog').isVisible()) {",
      '    downloadHappened = true;',
      '  }',
      '  expect(downloadHappened).toBeTruthy();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T3-tautology'],
  },
];

// ============================================================================
// 圧縮によって失われてはならない検出（本セッションで確立した合格の判定基準）
// ============================================================================

const MUST_KEEP: Case[] = [
  {
    name: '維持1 比較を含むが恒真な論理和（site-survey-access-control の画像到達性）',
    source: [
      "test('image accessible', async ({ page }) => {",
      '  const imageApiResponse = await page',
      "    .waitForResponse((response) => response.url().includes('/images'))",
      '    .catch(() => null);',
      '  const isImageAccessible =',
      '    imageApiResponse === null || imageApiResponse.ok() || imageApiResponse.status() === 304;',
      '  expect(isImageAccessible).toBeTruthy();',
      '});',
    ].join('\n'),
    expected: ['T3-tautology'],
  },
  {
    // Task 115.127 段0 で引数なしの飛ばしも T6 として計上するようになったため、
    // この書き方は「観測結果による関門（T5）」と「沈黙して飛ばす（T6）」の双方に該当する。
    name: '維持2 自ら観測した結果を条件にする（quantity-item-action-menu の前提確認）',
    source: [
      "test('action menu', async ({ page }) => {",
      '  const navigated = await navigateToQuantityTableEdit(page);',
      '  if (!navigated) {',
      '    test.skip();',
      '    return;',
      '  }',
      "  await expect(page.getByRole('menu')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate', 'T6-conditional-skip'],
  },
  {
    name: '維持3 条件付きのスキップ',
    source: ["test.skip(process.env.CI !== 'true', 'CI でのみ実行する');"].join('\n'),
    expected: ['T6-conditional-skip'],
  },
  {
    name: '維持4 型判定による恒真式',
    source: [
      "test('typeof', async ({ request }) => {",
      "  const response = await request.get('/api/health');",
      '  const body = await response.json();',
      "  expect(typeof body.totalCount === 'number').toBeTruthy();",
      '});',
    ].join('\n'),
    expected: ['T3-tautology'],
  },
  {
    name: '維持5 待機の指定を尊重しない判定',
    source: [
      "test('ignored timeout', async ({ page }) => {",
      "  const shown = await page.getByRole('dialog').isVisible({ timeout: 1000 });",
      '  if (shown) {',
      "    await expect(page.getByRole('dialog')).toBeVisible();",
      '  }',
      '});',
    ].join('\n'),
    expected: ['T2-ignored-timeout', 'T5-observed-result-gate'],
  },
  {
    name: '維持6 理由の無い除外注釈は除外として扱わない',
    source: [
      "test('invalid allow', async ({ page }) => {",
      "  const shown = await page.getByRole('dialog').isVisible();",
      '  // e2e-guard-allow:',
      '  if (shown) {',
      "    await expect(page.getByRole('dialog')).toBeVisible();",
      '  }',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
    expectInvalidAllow: true,
  },
  {
    name: '維持7 理由のある除外注釈は検出を抑止する',
    source: [
      "test('valid allow', async ({ page }) => {",
      "  const shown = await page.getByRole('dialog').isVisible();",
      '  // e2e-guard-allow: 検証ではなく前提の準備',
      '  if (shown) {',
      "    await expect(page.getByRole('dialog')).toBeVisible();",
      '  }',
      '});',
    ].join('\n'),
    expected: [],
    expectAllowed: true,
  },
  {
    name: '維持8 前提が満たせないときに失敗させる分岐は検出しない',
    source: [
      "test('fail fast', async ({ page }) => {",
      '  const navigated = await navigateToQuantityTableEdit(page);',
      '  if (!navigated) {',
      "    throw new Error('前提の画面へ遷移できない');",
      '  }',
      "  await expect(page.getByRole('menu')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T5-observed-result-gate'],
  },
];

// ============================================================================
// 115.127 段0: 引数なしの飛ばし（条件式を渡さない `test.skip()`）
//
// T6 は当初「第一引数に式を渡す形」だけを見ていたため、条件分岐の内側で
// 引数なしの `test.skip()` を呼ぶ形（当時 50 箇所）が一件も計上されていなかった。
// 効果は条件式を渡す形と同一であり、抑止一覧の総数がその分だけ実態より小さかった。
// 是正（50 箇所の解消）を終えたうえで規則を追加し、ここに固定する。
// ============================================================================

const BARE_SKIP: Case[] = [
  {
    name: '115.127-1 条件分岐の内側で引数なしに飛ばす形',
    source: [
      "test('bare skip in branch', async ({ page }) => {",
      '  const navigated = await navigateToQuantityTableEdit(page);',
      '  if (!navigated) {',
      '    test.skip();',
      '    return;',
      '  }',
      "  await expect(page.getByRole('menu')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T6-conditional-skip'],
  },
  {
    name: '115.127-2 無条件に引数なしで飛ばす形（検証そのものの放棄）',
    source: [
      "test('bare skip unconditional', async ({ page }) => {",
      '  test.skip();',
      "  await expect(page.getByRole('menu')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T6-conditional-skip'],
  },
  {
    name: '115.127-3 引数なしの test.fixme も同型として計上する',
    source: [
      "test('bare fixme', async ({ page }) => {",
      '  try {',
      "    await page.waitForEvent('download', { timeout: 30000 });",
      '  } catch {',
      '    test.fixme();',
      '  }',
      '});',
    ].join('\n'),
    expected: ['T6-conditional-skip'],
  },
  {
    name: '115.127-4 タイトルと本体を渡す宣言（skip 付きテストの定義）は計上しない',
    source: [
      "test.skip('未実装のため保留する', async ({ page }) => {",
      "  await expect(page.getByRole('menu')).toBeVisible();",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T6-conditional-skip'],
  },
  {
    name: '115.127-5 describe 単位の skip は T6 の対象外（別軸のため計上しない）',
    source: [
      "test.describe.skip('保留中の一群', () => {",
      "  test('x', async ({ page }) => {",
      "    await expect(page.getByRole('menu')).toBeVisible();",
      '  });',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T6-conditional-skip'],
  },
];

// ============================================================================
// 115.127 段3: 検出器の規則による対象外（計画の A 群・B 群）
//
// A 群（述語ヘルパー／page.evaluate の内側）と B 群（どの経路でも throw か主張へ
// 到達する分岐）は、そもそも検証を無効化していない。検出器の偽陽性である。
// これらは注釈ではなく**規則**で外す。規則で外す以上、外す形と外してはならない
// 紛らわしい形の双方をここで固定しないと、規則は「大量除外による見かけ上の解消」と
// 区別が付かなくなる。
//
// 対象外にする側（段3-1 〜 段3-4）は、規則を元へ戻すとすべて検出されて落ちる。
// 維持する側（段3-5 〜 段3-9）は、規則を広げすぎるとすべて消えて落ちる。
// ============================================================================

const RULE_EXCLUSION: Case[] = [
  {
    // 命名は述語らしくない（`prepare`）。それでも構造が真偽を返す関数であるため対象外。
    // 逆向きの確認は段3-9（述語らしい命名だが真偽を返さない関数）に置いている。
    name: '段3-1 真偽を返す関数の内側で真偽を決める分岐（命名ではなく構造で判定する）',
    source: [
      'async function prepare(page) {',
      "  const loginForm = page.locator('form');",
      '  const count = await loginForm.count();',
      '  if (count === 0) {',
      '    return false;',
      '  }',
      '  return true;',
      '}',
    ].join('\n'),
    expected: [],
  },
  {
    name: '段3-2 戻り値の型注釈が真偽である遷移ヘルパーの内側',
    source: [
      'async function navigateToEdit(page): Promise<boolean> {',
      '  const card = page.locator(\'[data-testid="project-card"]\').first();',
      '  if (!(await card.isVisible())) {',
      '    return false;',
      '  }',
      '  await card.click();',
      '  return true;',
      '}',
    ].join('\n'),
    expected: [],
  },
  {
    name: '段3-3 ブラウザ側で評価される関数の内側で値を決める分岐',
    source: [
      "test('evaluate extracts a value', async ({ page }) => {",
      '  const size = await page.evaluate(() => {',
      "    const count = document.querySelectorAll('canvas').length;",
      '    if (count === 0) {',
      '      return null;',
      '    }',
      '    return count;',
      '  });',
      '  expect(size).not.toBeNull();',
      '});',
    ].join('\n'),
    expected: [],
  },
  {
    name: '段3-4 どの経路でも throw か無条件の主張に到達する分岐',
    source: [
      "test('guaranteed', async ({ page }) => {",
      "  const visible = await page.locator('input').isVisible();",
      '  if (!visible) {',
      '    const area = page.locator(\'[data-testid="upload-area"]\');',
      '    if ((await area.count()) > 0) {',
      '      await expect(area).toBeVisible();',
      '    } else {',
      "      throw new Error('アップロード領域が無い');",
      '    }',
      '  } else {',
      "    await expect(page.locator('input')).toBeVisible();",
      '  }',
      '});',
    ].join('\n'),
    expected: [],
  },
  {
    // 脱出するのは then 節だが、主張は else 節にある。すなわち主張は条件が偽の経路でしか
    // 実行されない。「分岐の内側に expect が一つも無いこと」を規則から外すと、この形が
    // 述語の実装として消える。
    name: '段3-10 述語ヘルパーの内側でも、else 節が主張していれば検出する',
    source: [
      'async function checkDialog(page): Promise<boolean> {',
      "  const shown = await page.getByRole('dialog').isVisible();",
      '  if (!shown) {',
      '    return false;',
      '  } else {',
      "    await expect(page.getByRole('dialog')).toBeVisible();",
      '  }',
      '  return true;',
      '}',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '段3-5 述語ヘルパーの内側でも、分岐が主張を包んでいれば検出する',
    source: [
      'async function hasHeading(page): Promise<boolean> {',
      "  const visible = await page.getByRole('heading').isVisible();",
      '  if (visible) {',
      "    await expect(page.getByRole('heading')).toBeVisible();",
      '  }',
      '  return visible;',
      '}',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '段3-6 テスト本体の中の同じ形（沈黙して抜ける）は検出する',
    source: [
      "test('silent exit in test body', async ({ page }) => {",
      "  const count = await page.getByRole('row').count();",
      '  if (count === 0) {',
      '    return;',
      '  }',
      "  await expect(page.getByRole('row').first()).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '段3-7 throw を含まない全域分岐（G 群）は検出したまま残す',
    source: [
      "test('total branch', async ({ page }) => {",
      "  const shown = await page.getByRole('dialog').isVisible();",
      '  if (shown) {',
      "    await expect(page.getByRole('dialog')).toBeVisible();",
      '  } else {',
      "    await expect(page.getByRole('alert')).toBeVisible();",
      '  }',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '段3-8 throw はあるが素通りする経路が残る分岐は検出する',
    source: [
      "test('bypassable throw', async ({ page }) => {",
      "  const shown = await page.getByRole('dialog').isVisible();",
      '  if (shown) {',
      "    const ok = await page.getByRole('alert').isVisible();",
      '    if (!ok) {',
      "      throw new Error('補助要素が無い');",
      '    }',
      "    await expect(page.getByRole('dialog')).toBeVisible();",
      '  } else {',
      "    const alt = await page.getByRole('button').isVisible();",
      '    if (alt) {',
      "      await expect(page.getByRole('button')).toBeVisible();",
      '    }',
      '  }',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    // 命名は述語らしい（`isRowVisible`）が、真偽を返さない。名前で外していれば消える。
    name: '段3-9 述語らしい命名でも真偽を返さない関数の内側は検出する',
    source: [
      'async function isRowVisible(page) {',
      "  const count = await page.getByRole('row').count();",
      '  if (count === 0) {',
      '    return;',
      '  }',
      "  await expect(page.getByRole('row').first()).toBeVisible();",
      '}',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
];

// ============================================================================
// 115.137 観測の語彙と沈黙脱出の見極め
//
// 段2 で `isVisible({ timeout })` 二百五十六箇所を補助 `isVisibleWithin` へ畳んだ結果、
// 検出器の観測の語彙（語境界で一致させる `\bisVisible\b`）が補助名に一致しなくなり、
// これらの分類が実質 `await` の有無だけに依存する状態になっていた。
// あわせて、沈黙して抜ける分岐の見極めが「本体のすべての文が脱出であること」を
// 求めていたため、脱出の直前に後始末が一つ挟まるだけで無検出になっていた。
// 双方を両向き（検出する／検出してはならない）で固定する。
// ============================================================================

const OBSERVATION_VOCABULARY: Case[] = [
  {
    name: '115.137-1 真偽を返す待機の補助で沈黙して抜ける形を検出する（await に依存しない）',
    // await を条件式の外へ出しても検出が消えないこと。是正前は
    // `\bisVisible\b` が `isVisibleWithin` に一致せず、await も無いため無検出だった。
    source: [
      "test('helper gate without await', async ({ page }) => {",
      '  const seen = isVisibleWithin(importButton, 3000);',
      '  if (!seen) {',
      '    return;',
      '  }',
      '  await expect(importButton).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '115.137-2 後始末を挟んで沈黙して抜ける形を検出する（実例 import-e2e.spec.ts:809）',
    source: [
      "test('cleanup then silent exit', async ({ page }) => {",
      "  const dialog = page.getByRole('dialog');",
      '  if (!(await isVisibleWithin(groupButton, 3000))) {',
      "    const cancelBtn = dialog.getByRole('button', { name: 'キャンセル' }).last();",
      '    if (await isVisibleWithin(cancelBtn, 2000)) {',
      '      await cancelBtn.click();',
      '    }',
      '    return;',
      '  }',
      '  await expect(dialog).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '115.137-3 後始末をしても抜けない分岐は検出しない（検証へ必ず到達する）',
    // 115.137-2 と一文字違いの紛らわしい形。脱出しないため後段の主張は必ず実行される。
    source: [
      "test('cleanup without exit', async ({ page }) => {",
      "  const dialog = page.getByRole('dialog');",
      '  if (await isVisibleWithin(cancelBtn, 2000)) {',
      '    await cancelBtn.click();',
      '  }',
      '  await expect(dialog).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T4-response-field-gate', 'T5-observed-result-gate'],
  },
  {
    name: '115.137-4 抜ける前に throw する分岐は検出しない（沈黙しない）',
    source: [
      "test('throw before exit', async ({ page }) => {",
      '  if (!(await isVisibleWithin(importButton, 3000))) {',
      "    await page.screenshot({ path: 'failure.png' });",
      "    throw new Error('取り込みボタンが出ない（前提が満たせない）');",
      '  }',
      '  await expect(importButton).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T4-response-field-gate', 'T5-observed-result-gate'],
  },
  {
    name: '115.137-5 観測の語彙は e2e/helpers の「真偽を返す関数」から自動で取り込む',
    // 補助が増えるたびに検出器を書き換える運用は、書き換え漏れがそのまま
    // 静かな無検出になる。名前の一覧を手で持たないことを規則として固定する。
    source: '',
    expected: [],
    custom: (): string[] => {
      const names = collectBooleanHelperNames();
      const failures: string[] = [];
      if (!names.includes('isVisibleWithin')) {
        failures.push(`isVisibleWithin が取り込まれていない: [${names.join(', ')}]`);
      }
      if (names.length === 0) {
        failures.push('e2e/helpers から真偽を返す関数が一つも取り込まれていない');
      }
      return failures;
    },
  },
];

// ============================================================================
// 115.137 査読の是正: 探索・再試行の定型を負債として数えない
//
// 沈黙脱出の見極めを「本体の終端が脱出であること」へ広げた際、`break` / `continue` を
// 「検証からの脱出」と同一視したため、**削減計画が E 群の是正先として推奨している形**
// （探索ループ ＋ break ＋ ループ直後の無条件の主張）が丸ごと誤検出になった。
// 正しい書き方を負債として数えないこと、そして**その形が劣化したら検出すること**の
// 両向きをここで固定する。これが無かったことが、この回帰を素通しさせた直接の原因である。
// ============================================================================

const LOOP_ESCAPE: Case[] = [
  {
    name: '115.137-6 探索ループ＋break＋ループ直後の無条件の主張は検出しない（推奨する書き方）',
    // 実例 e2e/specs/projects/project-kana-search.spec.ts:445。
    // break は繰り返しを抜けるだけでテストからは抜けない。観測が偽なら直後の主張が必ず落ちる。
    source: [
      "test('search loop with break', async ({ page }) => {",
      "  const rows = page.locator('tbody tr');",
      '  const rowCount = await rows.count();',
      '  let foundTestProject = false;',
      '  for (let i = 0; i < rowCount; i++) {',
      '    const rowText = await rows.nth(i).textContent();',
      "    if (rowText && rowText.includes('対象')) {",
      '      foundTestProject = true;',
      '      break;',
      '    }',
      '  }',
      '  expect(foundTestProject).toBe(true);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T4-response-field-gate', 'T5-observed-result-gate'],
  },
  {
    name: '115.137-7 再試行ループ＋break＋ループ後に throw する関門は検出しない',
    // 実例 e2e/specs/project-status-transition.spec.ts:62。
    // 主張ではなく throw で受ける形も「観測が偽なら必ず落ちる」ことに変わりはない。
    source: [
      "test('retry loop with break and throw', async ({ page }) => {",
      '  let optionsLoaded = false;',
      '  for (let retry = 0; retry < 3; retry++) {',
      "    const options = await page.locator('option').all();",
      '    if (options.length > 1) {',
      '      optionsLoaded = true;',
      '      break;',
      '    }',
      '  }',
      '  if (!optionsLoaded) {',
      "    throw new Error('ユーザー一覧を読み込めませんでした');",
      '  }',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T4-response-field-gate', 'T5-observed-result-gate'],
  },
  {
    name: '115.137-8 同じ探索ループでも、抜けた先で結果を検査しなければ検出する',
    // 115.137-6 が「推奨する書き方を数えない」ためのものである以上、
    // その形が劣化した場合（観測の結果をどこでも受けない）は検出できなければならない。
    source: [
      "test('search loop without outcome check', async ({ page }) => {",
      "  const rows = page.locator('tbody tr');",
      '  const rowCount = await rows.count();',
      '  let foundTestProject = false;',
      '  for (let i = 0; i < rowCount; i++) {',
      '    const rowText = await rows.nth(i).textContent();',
      "    if (rowText && rowText.includes('対象')) {",
      '      foundTestProject = true;',
      '      break;',
      '    }',
      '  }',
      "  await page.getByRole('button', { name: '閉じる' }).click();",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '115.137-9 値を作る補助の中の「値を返す return」は検出しない（脱出ではない）',
    // 実例 e2e/specs/auth/password-reset.spec.ts:587 / import-e2e.spec.ts:132。
    // 値を返す関数が値を返す経路を持つのは関数であることそのもの。
    // 債務は呼び出し側がその値をどう扱うかにあり、呼び出し側の分岐は従来どおり検出される。
    source: [
      'async function fetchMailBody(url: string): Promise<string | null> {',
      '  const response = await fetch(url);',
      '  if (response.ok) {',
      '    const data = (await response.json()) as { text: string };',
      '    return data.text;',
      '  }',
      '  return null;',
      '}',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T4-response-field-gate', 'T5-observed-result-gate'],
  },
  {
    name: '115.137-10 テスト本体の中の「値を伴わない return」は検出する（真正の沈黙脱出）',
    // 115.137-9 と紛らわしい形。こちらは以降の検証が丸ごと実行されない。
    source: [
      "test('bare return in test body', async ({ page }) => {",
      '  if (!(await isVisibleWithin(importButton, 3000))) {',
      '    await page.screenshot();',
      '    return;',
      '  }',
      '  await expect(importButton).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
];

// ============================================================================
// 115.137 査読の是正: 語彙の二つの規則と走査対象を、それぞれ独立に固定する
//
// 「語彙を広げた」ことの効き目は、今日の走査結果には現れない（実測で出力は不変）。
// 効き目が現れるのは `await` を条件式の外へ出す書き換えが入ったときであり、
// そのときに静かに無検出へ落ちないことを保証するのがこの一群の役目である。
// 接頭辞一致と自動取り込みは別の規則なので、どちらか一方を戻したら落ちる形を別々に置く。
// ============================================================================

const VOCABULARY_RULES: Case[] = [
  {
    name: '115.137-11 接頭辞一致でしか捉えられない補助（e2e/helpers に無い名前）で検出する',
    // `isVisibleSoon` は自動取り込みの対象に存在しない。接頭辞一致を語境界一致へ戻すと落ちる。
    source: [
      "test('prefix vocabulary', async ({ page }) => {",
      '  const seen = isVisibleSoon(banner, 3000);',
      '  if (!seen) {',
      '    return;',
      '  }',
      '  await expect(banner).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '115.137-12 自動取り込みが走査本体の語彙へ結線されている（部品が動くだけでは通さない）',
    // 今日の `e2e/helpers` が持つ真偽を返す関数は四つとも接頭辞規則で捉えられるため、
    // 走査結果には自動取り込みの寄与が現れない。寄与が現れるのは接頭辞に当たらない
    // 補助が追加されたときであり、その経路（構造で拾う→語彙へ載る）をここで固定する。
    //
    // 部品（`collectBooleanHelperNames` / `buildObservationPattern`）を個別に呼ぶだけでは
    // 結線が切れても気づけない（実際、是正前のこの事例は結線を切っても緑のままだった）。
    // そのため走査本体が用いる語彙 `getObservationVocabulary()` を直接主張する。
    source: '',
    expected: [],
    custom: (): string[] => {
      const failures: string[] = [];

      // (a) 構造で拾えること。接頭辞規則では捉えられない名前が要るので、
      //     この検出器自身のソース（`scripts/`）を取り込み元にして確かめる。
      const scriptNames = collectBooleanHelperNames(SCRIPTS_DIR);
      const probe = 'if (!containsAssertion(node))';
      if (!scriptNames.includes('containsAssertion')) {
        failures.push('真偽を返す関数を構造で拾えていない: containsAssertion が取り込まれない');
      }
      if (!buildObservationPattern(scriptNames).test(probe)) {
        failures.push('自動で取り込んだ名前が観測の語彙に載っていない');
      }
      if (buildObservationPattern([]).test(probe)) {
        failures.push('取り込み無しでも一致してしまい、自動取り込みの寄与を確認できない');
      }

      // (b) その取り込みが走査本体へ実際に結線されていること。
      const vocabulary = getObservationVocabulary();
      const collected = collectBooleanHelperNames();
      if (collected.length === 0) {
        failures.push('e2e/helpers から真偽を返す関数を一つも取り込めていない');
      }
      if (vocabulary.helperNames.length === 0) {
        failures.push('走査本体の語彙に取り込み結果が一つも載っていない（結線が切れている）');
      }
      const missing = collected.filter((name) => !vocabulary.helperNames.includes(name));
      if (missing.length > 0) {
        failures.push(`取り込んだ名前が走査本体の語彙へ届いていない: ${missing.join(', ')}`);
      }
      // 名前を保持したまま組み立てへ渡さない書き換えも止める。
      if (
        buildObservationPattern([...vocabulary.helperNames]).source !== vocabulary.pattern.source
      ) {
        failures.push('走査が用いる正規表現が、取り込んだ名前から組まれていない');
      }
      // 語彙から走査への最後の一跳ね。`getObservationPattern` が語彙を迂回して
      // 別の正規表現を返す書き換えは、上の主張をすべて満たしたまま素通りする。
      // 参照そのものが同一であることを主張して閉じる。
      if (getObservationPattern() !== vocabulary.pattern) {
        failures.push('走査が参照する正規表現が、語彙の持つ正規表現と別物になっている');
      }
      return failures;
    },
  },
  {
    name: '115.137-13 取り込み元が失われた場合は黙って空を返さず検査を失敗させる',
    source: '',
    expected: [],
    custom: (): string[] => {
      const failures: string[] = [];
      try {
        collectBooleanHelperNames(path.join(SCRIPTS_DIR, '__not_exist__'));
        failures.push('取り込み元が無くても例外にならない（静かに語彙が縮む）');
      } catch {
        // 期待どおり
      }
      return failures;
    },
  },
  {
    name: '115.137-14 走査対象はテストとその補助だけ（Playwright の実行基盤を含まない）',
    // `e2e/global-setup.ts` の疎通待ちや `e2e/reporters/` の進捗表示は通常の制御フローであり、
    // 検証の放棄ではない。走査対象を置き場所の役割で決めていることを固定する。
    source: '',
    expected: [],
    custom: (): string[] => {
      const failures: string[] = [];
      const files = collectE2eFiles().map((f) => f.split(path.sep).join('/'));
      for (const marker of ['/e2e/global-setup.ts', '/e2e/config.ts', '/e2e/reporters/']) {
        if (files.some((f) => f.includes(marker))) {
          failures.push(`実行基盤が走査対象に含まれている: ${marker}`);
        }
      }
      for (const marker of ['/e2e/specs/', '/e2e/helpers/']) {
        if (!files.some((f) => f.includes(marker))) {
          failures.push(`走査対象から外れている: ${marker}`);
        }
      }
      return failures;
    },
  },
];

// ============================================================================
// 115.127 段7: 再試行の成功時に関数ごと抜ける形（retryExhaustionFailureExclusion）
//
// 規則で対象外にする以上、**その規則が守っている境界**を両側から固定する。
// 守られていない防護は防護ではない（Task 115.128）。
// 「捕捉してはならない書き方」を 1 件、規則の各条件が効いていることを示す
// 「捕捉しなければならない書き方」を 3 件（throw が無い／分岐が主張を包む／
// throw が握り潰されうる）登録する。
// ============================================================================

const RETRY_EXHAUSTION: Case[] = [
  {
    name: '段7-1 再試行の成功時 return ＋繰り返し直後の無条件 throw は検出しない',
    // 実例 e2e/specs/auth/invitations.spec.ts:51。
    // 結末は「成立したので抜ける」か「上限まで成立せず throw で落ちる」の二つだけで、
    // 素通りする経路が無い。throw より後の文は到達しないため飛び越す検証も存在しない。
    source: [
      'async function loadInvitationPage(page: Page): Promise<void> {',
      '  let lastError: Error | null = null;',
      '  for (let attempt = 0; attempt < 3; attempt++) {',
      "    await page.goto('/invitations');",
      '    const errorAlert = page.getByText(/招待一覧を取得できませんでした/i);',
      '    const hasError = (await errorAlert.count()) > 0 && (await errorAlert.isVisible());',
      '    if (!hasError) {',
      '      return;',
      '    }',
      "    lastError = new Error('招待一覧の取得に失敗しました');",
      '  }',
      "  throw lastError ?? new Error('招待画面のロードに失敗しました');",
      '}',
    ].join('\n'),
    expected: [],
    forbidden: ['T1-conditional-expect', 'T4-response-field-gate', 'T5-observed-result-gate'],
  },
  {
    name: '段7-2 繰り返しの後に throw が無ければ検出する（上限に達しても黙って戻る）',
    // 規則の条件 (d)。上限まで成立しなかったときに何も起きないなら真正の沈黙脱出であり、
    // 呼び出し側は前提が崩れたまま先へ進む。
    source: [
      'async function loadInvitationPage(page: Page): Promise<void> {',
      '  for (let attempt = 0; attempt < 3; attempt++) {',
      "    await page.goto('/invitations');",
      '    const errorAlert = page.getByText(/招待一覧を取得できませんでした/i);',
      '    const hasError = (await errorAlert.count()) > 0 && (await errorAlert.isVisible());',
      '    if (!hasError) {',
      '      return;',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '段7-3 分岐の内側に expect があれば検出する（主張を包む分岐は再試行の待機ではない）',
    // 規則の条件 (a)。繰り返しの後に throw があっても、観測が偽の周回では主張が実行されない。
    // 「上限まで一度も成立しない」場合にだけ落ちる形は、主張が飛ぶことを止めていない。
    source: [
      'async function loadInvitationPage(page: Page): Promise<void> {',
      '  for (let attempt = 0; attempt < 3; attempt++) {',
      "    await page.goto('/invitations');",
      '    const errorAlert = page.getByText(/招待一覧を取得できませんでした/i);',
      '    const hasError = (await errorAlert.count()) > 0 && (await errorAlert.isVisible());',
      '    if (!hasError) {',
      "      await expect(page.getByRole('table')).toBeVisible();",
      '      return;',
      '    }',
      '  }',
      "  throw new Error('招待画面のロードに失敗しました');",
      '}',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  {
    name: '段7-4 繰り返しと関数の境界の間に try が挟まれば検出する（throw が握り潰されうる）',
    // 規則の条件 (d) の但し書き。throw が捕捉されれば関数は黙って戻り、
    // 「上限まで成立しなかった」ことが呼び出し側に伝わらない。
    source: [
      'async function loadInvitationPage(page: Page): Promise<void> {',
      '  try {',
      '    for (let attempt = 0; attempt < 3; attempt++) {',
      "      await page.goto('/invitations');",
      '      const errorAlert = page.getByText(/招待一覧を取得できませんでした/i);',
      '      const hasError = (await errorAlert.count()) > 0 && (await errorAlert.isVisible());',
      '      if (!hasError) {',
      '        return;',
      '      }',
      '    }',
      "    throw new Error('招待画面のロードに失敗しました');",
      '  } catch {',
      "    console.warn('招待画面のロードに失敗しましたが続行します');",
      '  }',
      '}',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
];

// ============================================================================
// 115.128: 抑止一覧を守る二つの関門（増加方向の基準更新の拒否・基準の自己整合の検査）
//
// この二つは Task 115.93 が検査器へ置いた関門であり、抑止一覧が黙って恒久化する経路を
// 塞ぐためのものである。ところが自己検査は検出規則しか見ておらず、関門が将来の改変で
// 静かに壊れても誰も気づかない状態にあった。守られていない防護は防護ではない。
//
// 関門は「引数を解釈し、基準を読み、拒否して終了コードを返す」という一続きの経路であり、
// 部品を個別に呼んだだけでは結線が切れても緑のままになる（Task 115.137 の教訓）。
// そのため検査本体 `run()` をそのまま呼び、終了コード・出力・基準ファイルの中身で主張する。
// 実基準を汚さないよう、使い捨ての基準と使い捨ての spec を作業場所に作って発火させ、
// 実行のたびに実基準が一字も変わっていないことを併せて確かめる。
// ============================================================================

/** 使い捨ての spec（沈黙して抜ける形。T5 として必ず検出される）。 */
function silentExitSpec(count: number): string {
  const blocks: string[] = [];
  for (let i = 0; i < count; i++) {
    blocks.push(
      [
        `test('silent exit ${i}', async ({ page }) => {`,
        "  const visible = await page.getByRole('dialog').isVisible();",
        '  if (!visible) {',
        '    return;',
        '  }',
        "  await expect(page.getByRole('dialog')).toBeVisible();",
        '});',
      ].join('\n')
    );
  }
  return blocks.join('\n\n');
}

interface SandboxBaseline {
  generatedTotal: number;
  allowedTotal: number;
  files: Record<string, Partial<Record<GuardType, number>>>;
  allowedFiles: Record<string, number>;
}

/**
 * 使い捨ての作業場所で確認を行い、必ず後始末する。
 * 併せて、実基準がこの確認によって書き換わっていないことを主張する。
 */
function withSandbox(fn: (dir: string) => string[]): string[] {
  // 既定の位置に実基準が無いなら、比較そのものが成立しない（黙って素通りさせない）。
  if (!fs.existsSync(DEFAULT_BASELINE_PATH)) {
    return [`既定の基準の位置に実基準がない: ${DEFAULT_BASELINE_PATH}`];
  }
  const realBaselineBefore = fs.readFileSync(DEFAULT_BASELINE_PATH, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guard-selftest-'));
  try {
    const failures = fn(dir);
    if (fs.readFileSync(DEFAULT_BASELINE_PATH, 'utf8') !== realBaselineBefore) {
      failures.push('実基準 e2e/assertion-guard-baseline.json が確認の実行で書き換えられた');
    }
    return failures;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeSandboxBaseline(dir: string, baseline: SandboxBaseline): string {
  const baselinePath = path.join(dir, 'baseline.json');
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  return baselinePath;
}

function writeSandboxSpec(dir: string, source: string): string {
  const specPath = path.join(dir, 'sandbox.spec.ts');
  fs.writeFileSync(specPath, `${source}\n`, 'utf8');
  return specPath;
}

/** 検査本体を呼ぶ。出力は自己検査の表示を汚さないよう捕えたうえで主張に用いる。 */
function runCheck(argv: string[], options: RunOptions): { code: number; output: string } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]): void => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  try {
    return { code: run(argv, options), output: lines.join('\n') };
  } finally {
    console.log = original;
  }
}

function readTotals(baselinePath: string): { generatedTotal: number; allowedTotal: number } {
  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
    generatedTotal?: number;
    allowedTotal?: number;
  };
  return { generatedTotal: parsed.generatedTotal ?? -1, allowedTotal: parsed.allowedTotal ?? -1 };
}

const BASELINE_GUARDS: Case[] = [
  {
    name: '115.128-1 増える方向の基準更新は既定で拒否し、基準を書き換えない',
    source: '',
    expected: [],
    custom: (): string[] =>
      withSandbox((dir) => {
        const failures: string[] = [];
        const baselinePath = writeSandboxBaseline(dir, {
          generatedTotal: 0,
          allowedTotal: 0,
          files: {},
          allowedFiles: {},
        });
        const specPath = writeSandboxSpec(dir, silentExitSpec(1));
        const before = fs.readFileSync(baselinePath, 'utf8');
        const { code, output } = runCheck(['--update-baseline'], {
          baselinePath,
          collectFiles: () => [specPath],
        });
        if (!output.includes('検出件数: 1')) {
          failures.push(
            `使い捨ての spec が 1 件検出されていない（確認が空振りしている）: ${output}`
          );
        }
        if (code === 0) {
          failures.push('件数が増える更新が拒否されていない（終了コード 0）');
        }
        if (!output.includes('件数が増える方向の基準更新は既定で拒否します')) {
          failures.push('拒否の理由が出力されていない');
        }
        if (fs.readFileSync(baselinePath, 'utf8') !== before) {
          failures.push('拒否したにもかかわらず基準が書き換えられた');
        }
        return failures;
      }),
  },
  {
    name: '115.128-2 --allow-increase を明示すれば増加を記録できる',
    source: '',
    expected: [],
    custom: (): string[] =>
      withSandbox((dir) => {
        const failures: string[] = [];
        const baselinePath = writeSandboxBaseline(dir, {
          generatedTotal: 0,
          allowedTotal: 0,
          files: {},
          allowedFiles: {},
        });
        const specPath = writeSandboxSpec(dir, silentExitSpec(1));
        const { code, output } = runCheck(['--update-baseline', '--allow-increase'], {
          baselinePath,
          collectFiles: () => [specPath],
        });
        if (code !== 0) {
          failures.push(`明示した増加が拒否された（終了コード ${code}）: ${output}`);
        }
        if (!output.includes('増加を記録しました')) {
          failures.push('増加を記録した旨が出力されていない');
        }
        const totals = readTotals(baselinePath);
        if (totals.generatedTotal !== 1) {
          failures.push(
            `基準が増加後の件数で書き出されていない: generatedTotal ${totals.generatedTotal}`
          );
        }
        return failures;
      }),
  },
  {
    name: '115.128-3 減る方向の基準更新は --allow-increase 無しでも通る',
    source: '',
    expected: [],
    custom: (): string[] =>
      withSandbox((dir) => {
        const failures: string[] = [];
        const baselinePath = writeSandboxBaseline(dir, {
          generatedTotal: 0,
          allowedTotal: 0,
          files: {},
          allowedFiles: {},
        });
        // まず 2 件を記録した基準を作る（増加なので明示が要る）。
        const specPath = writeSandboxSpec(dir, silentExitSpec(2));
        const seeded = runCheck(['--update-baseline', '--allow-increase'], {
          baselinePath,
          collectFiles: () => [specPath],
        });
        if (seeded.code !== 0 || readTotals(baselinePath).generatedTotal !== 2) {
          failures.push(`前提の基準（2 件）を用意できていない: ${seeded.output}`);
          return failures;
        }
        // 1 件へ減らした状態での更新は、明示無しでも通らなければならない。
        fs.writeFileSync(specPath, `${silentExitSpec(1)}\n`, 'utf8');
        const { code, output } = runCheck(['--update-baseline'], {
          baselinePath,
          collectFiles: () => [specPath],
        });
        if (code !== 0) {
          failures.push(`減る方向の更新が拒否された（終了コード ${code}）: ${output}`);
        }
        const totals = readTotals(baselinePath);
        if (totals.generatedTotal !== 1) {
          failures.push(
            `基準が減少後の件数で書き出されていない: generatedTotal ${totals.generatedTotal}`
          );
        }
        return failures;
      }),
  },
  {
    name: '115.128-4 検出の内訳と総数が食い違う基準は照合の前に拒否する',
    source: '',
    expected: [],
    custom: (): string[] =>
      withSandbox((dir) => {
        const failures: string[] = [];
        // 内訳は 1 件しか無いのに総数だけ 5 件へ書き換えた形（抑止の総量を見えなくする改竄）。
        const baselinePath = writeSandboxBaseline(dir, {
          generatedTotal: 5,
          allowedTotal: 0,
          files: { 'e2e/specs/sandbox.spec.ts': { 'T5-observed-result-gate': 1 } },
          allowedFiles: {},
        });
        const { code, output } = runCheck([], { baselinePath, collectFiles: () => [] });
        if (code === 0) {
          failures.push('内訳と総数が食い違う基準が受け入れられた（終了コード 0）');
        }
        if (!output.includes('基準の内訳と総数が一致しません')) {
          failures.push(`不整合の理由が出力されていない: ${output}`);
        }
        return failures;
      }),
  },
  {
    name: '115.128-5 除外の内訳と総数が食い違う基準も拒否する',
    source: '',
    expected: [],
    custom: (): string[] =>
      withSandbox((dir) => {
        const failures: string[] = [];
        // 検出側は整合しており、除外側だけを書き換えた形。条件の片側だけを見る改変を止める。
        const baselinePath = writeSandboxBaseline(dir, {
          generatedTotal: 0,
          allowedTotal: 4,
          files: {},
          allowedFiles: { 'e2e/specs/sandbox.spec.ts': 1 },
        });
        const { code, output } = runCheck([], { baselinePath, collectFiles: () => [] });
        if (code === 0) {
          failures.push('除外の内訳と総数が食い違う基準が受け入れられた（終了コード 0）');
        }
        if (!output.includes('基準の内訳と総数が一致しません')) {
          failures.push(`不整合の理由が出力されていない: ${output}`);
        }
        return failures;
      }),
  },
  {
    name: '115.128-6 内訳と総数が整合した基準は通す（関門が何でも拒否しているのではない）',
    source: '',
    expected: [],
    custom: (): string[] =>
      withSandbox((dir) => {
        const failures: string[] = [];
        const baselinePath = writeSandboxBaseline(dir, {
          generatedTotal: 1,
          allowedTotal: 1,
          files: { 'e2e/specs/sandbox.spec.ts': { 'T5-observed-result-gate': 1 } },
          allowedFiles: { 'e2e/specs/sandbox.spec.ts': 1 },
        });
        const { code, output } = runCheck([], { baselinePath, collectFiles: () => [] });
        if (output.includes('基準の内訳と総数が一致しません')) {
          failures.push('整合した基準が不整合として拒否された');
        }
        if (code !== 0) {
          failures.push(`整合した基準で検査が失敗した（終了コード ${code}）: ${output}`);
        }
        return failures;
      }),
  },
  {
    name: '115.128-7 差し替えを指定しない実行は実基準を見る（本番の経路が緩んでいない）',
    source: '',
    expected: [],
    custom: (): string[] => {
      const failures: string[] = [];
      const expectedPath = path.join(ROOT, 'e2e', 'assertion-guard-baseline.json');
      if (path.resolve(DEFAULT_BASELINE_PATH) !== path.resolve(expectedPath)) {
        failures.push(`既定の基準の位置が実基準ではない: ${DEFAULT_BASELINE_PATH}`);
        return failures;
      }
      const realBaseline = JSON.parse(fs.readFileSync(DEFAULT_BASELINE_PATH, 'utf8')) as {
        reduction?: { doc?: string };
      };
      const doc = realBaseline.reduction?.doc;
      if (typeof doc !== 'string' || doc.length === 0) {
        failures.push('実基準に reduction.doc が無く、既定の経路を出力から確かめられない');
        return failures;
      }
      // 走査だけを空にして、基準の読み出しは既定のまま行わせる。
      // 実基準にしか書かれていない削減計画の所在が出力に現れることで、既定の経路を確かめる。
      const { code, output } = runCheck([], { collectFiles: () => [] });
      if (!output.includes(`削減計画: ${doc}`)) {
        failures.push(`差し替えを指定しない実行が実基準を読んでいない: ${output}`);
      }
      if (code !== 0) {
        failures.push(`実基準での実行が失敗した（終了コード ${code}）: ${output}`);
      }
      return failures;
    },
  },
];

// ============================================================================
// 115.139: 抽出で除外したものの不在を主張する形（第八の型）
//
// 抜き出しの正規表現が needle を受理しないなら、抽出後の文字列に needle が
// 現れることは原理的に無い。そのうえで「needle が無いこと」を主張しても
// 決して失敗しない。両方向（検出する例・検出してはならない例）を固定する。
// ============================================================================

const EXCLUDED_ABSENCE: Case[] = [
  {
    name: '115.139-1 小数点を受理しない抜き出しの直後に小数点の不在を主張する（実例 number-format-e2e）',
    source: [
      "test('total', async ({ page }) => {",
      "  const totalText = (await page.locator('[data-testid=\"total-amount\"]').textContent()) ?? '';",
      '  const numberMatch = totalText.match(/[\\d,]+/);',
      "  expect(numberMatch![0].replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T7-excluded-absence'],
  },
  {
    name: '115.139-2 needle を残らず取り除く置換の直後に不在を主張する',
    source: [
      "test('strip', async ({ page }) => {",
      "  const text = (await page.locator('#total').textContent()) ?? '';",
      "  const digits = text.replace(/\\./g, '');",
      "  expect(digits).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T7-excluded-absence'],
  },
  {
    name: '115.139-3 抜き出しを小数点まで広げた形は検出しない（是正後の形）',
    source: [
      "test('total fixed', async ({ page }) => {",
      "  const totalText = (await page.locator('[data-testid=\"total-amount\"]').textContent()) ?? '';",
      '  const numberMatch = totalText.match(/[\\d,]+(?:\\.\\d+)?/);',
      "  expect(numberMatch![0].replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T7-excluded-absence'],
  },
  {
    name: '115.139-4 抽出を経ない不在の主張は検出しない（画面の値をそのまま見る）',
    source: [
      "test('raw value', async ({ page }) => {",
      "  const value = await page.locator('#unit-price').inputValue();",
      "  expect(value).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T7-excluded-absence'],
  },
  {
    name: '115.139-5 needle と無関係な文字だけを取り除く置換は検出しない（実質のある主張）',
    source: [
      "test('strip commas', async ({ page }) => {",
      "  const text = (await page.locator('#amount').textContent()) ?? '';",
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T7-excluded-absence'],
  },
  {
    name: '115.139-6 受理しうる文字の上界が定まらない抜き出しは検出しない（解析できない側へ倒す）',
    source: [
      "test('unbounded', async ({ page }) => {",
      "  const text = (await page.locator('#amount').textContent()) ?? '';",
      '  const matched = text.match(/\\S+/);',
      "  expect(matched![0]).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T7-excluded-absence'],
  },
];

// ============================================================================
// 115.140: 不在と観測の失敗を区別しない主張（T8）
//
// 補助が「対象が不在」と「そもそも観測できなかった」の双方で同じ空値を返すなら、
// その空値に対する不在の主張は、どちらで成立したのかを区別しない。
// 両方向（検出する例・検出してはならない例）を固定する。
// ============================================================================

const AMBIGUOUS_ABSENCE: Case[] = [
  {
    name: '115.140-1 空値の経路が二つある補助の戻り値へ不在を主張する（実例 drawing-selection-prevention）',
    source: [
      'async function getActiveObject(page) {',
      '  return await page.evaluate(() => {',
      '    const canvas = window.__fabricCanvas;',
      '    if (!canvas) {',
      '      return null;',
      '    }',
      '    const active = canvas.getActiveObject();',
      '    if (!active) {',
      '      return null;',
      '    }',
      "    return { type: active.type ?? 'unknown' };",
      '  });',
      '}',
      "test('no selection', async ({ page }) => {",
      '  const activeObj = await getActiveObject(page);',
      '  expect(activeObj).toBeNull();',
      '});',
    ].join('\n'),
    expected: ['T8-ambiguous-absence'],
  },
  {
    name: '115.140-2 局所変数を挟まず直接主題に書いた形も検出する',
    source: [
      'async function getActiveObject(page) {',
      '  return await page.evaluate(() => {',
      '    const canvas = window.__fabricCanvas;',
      '    if (!canvas) {',
      '      return null;',
      '    }',
      '    const active = canvas.getActiveObject();',
      '    if (!active) {',
      '      return null;',
      '    }',
      '    return { type: active.type };',
      '  });',
      '}',
      "test('no selection', async ({ page }) => {",
      '  expect(await getActiveObject(page)).toBeNull();',
      '});',
    ].join('\n'),
    expected: ['T8-ambiguous-absence'],
  },
  {
    name: '115.140-3 undefined を空値とする主張も同じ形として検出する',
    source: [
      'async function readRecord(page) {',
      '  return await page.evaluate(() => {',
      '    const store = window.__store;',
      '    if (!store) {',
      '      return undefined;',
      '    }',
      '    const hit = store.find();',
      '    if (!hit) {',
      '      return undefined;',
      '    }',
      '    return hit;',
      '  });',
      '}',
      "test('no record', async ({ page }) => {",
      '  const record = await readRecord(page);',
      '  expect(record).toBeUndefined();',
      '});',
    ].join('\n'),
    expected: ['T8-ambiguous-absence'],
  },
  {
    name: '115.140-4 観測できない経路を失敗させた形は検出しない（是正後の形）',
    source: [
      'async function getActiveObject(page) {',
      '  return await page.evaluate(() => {',
      '    const canvas = window.__fabricCanvas;',
      '    if (!canvas) {',
      "      throw new Error('描画面が取得できない');",
      '    }',
      '    const active = canvas.getActiveObject();',
      '    if (!active) {',
      '      return null;',
      '    }',
      '    return { type: active.type };',
      '  });',
      '}',
      "test('no selection', async ({ page }) => {",
      '  const activeObj = await getActiveObject(page);',
      '  expect(activeObj).toBeNull();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T8-ambiguous-absence'],
  },
  {
    name: '115.140-5 空値の経路が一つだけの補助は検出しない（不在の条件が一つに定まる）',
    source: [
      'async function readDraft(page, key) {',
      '  return await page.evaluate((k) => localStorage.getItem(k), key);',
      '}',
      "test('no draft', async ({ page }) => {",
      "  expect(await readDraft(page, 'k')).toBeNull();",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T8-ambiguous-absence'],
  },
  {
    name: '115.140-6 存在を主張する形は検出しない（不在の主張ではない）',
    source: [
      'async function getActiveObject(page) {',
      '  return await page.evaluate(() => {',
      '    const canvas = window.__fabricCanvas;',
      '    if (!canvas) {',
      '      return null;',
      '    }',
      '    const active = canvas.getActiveObject();',
      '    if (!active) {',
      '      return null;',
      '    }',
      '    return { type: active.type };',
      '  });',
      '}',
      "test('selected', async ({ page }) => {",
      '  const activeObj = await getActiveObject(page);',
      '  expect(activeObj).not.toBeNull();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T8-ambiguous-absence'],
  },
  {
    name: '115.140-7 同名の補助が複数宣言されている形は検出しない（どれが呼ばれるか決められない）',
    source: [
      'async function probe(page) {',
      '  return await page.evaluate(() => {',
      '    const canvas = window.__fabricCanvas;',
      '    if (!canvas) {',
      '      return null;',
      '    }',
      '    if (!canvas.getActiveObject()) {',
      '      return null;',
      '    }',
      '    return { type: 1 };',
      '  });',
      '}',
      'async function outer(page) {',
      '  async function probe(page2) {',
      '    return await page2.evaluate(() => null);',
      '  }',
      '  return await probe(page);',
      '}',
      "test('no selection', async ({ page }) => {",
      '  const found = await probe(page);',
      '  expect(found).toBeNull();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T8-ambiguous-absence'],
  },
];

// ============================================================================
// 115.141: 真偽を返す関数の結果を式文として捨てる形（T9）
//
// 真偽を返す前提の補助を呼び、戻り値を一切見ない形は、前提が崩れたときの失敗を
// 前提の地点ではなく後段へ持ち越す。さらに predicateImplementationExclusion
// （段3 が加えた除外）の正当性は「真偽を呼び出し側がどう扱うかは関門である」ことに
// 依拠しており、戻り値を捨てる呼び出しはその依拠を呼び出し側で空洞にする。
// 両方向（検出する例・検出してはならない例）を固定する。
//
// 取り込みの経路を確かめる例では、`e2e/helpers/` から実際に集めた名前を用いる。
// 名前を書き写すと補助の改名で静かに無検出へ落ちるためである。
// ============================================================================

/** `e2e/helpers/` から実際に集めた「真偽を返す関数」の名前（取り込み経路の確認に用いる） */
const HELPER_BOOLEAN_NAME = collectBooleanHelperNames()[0]!;

const DISCARDED_PREDICATE_RESULT: Case[] = [
  {
    name: '115.141-1 同一ファイルの真偽を返す補助の結果を捨てる（実例 site-survey-viewer）',
    source: [
      'async function ensureImageExists(page, id): Promise<boolean> {',
      '  const count = await page.locator(".img").count();',
      '  if (count > 0) {',
      '    return true;',
      '  }',
      '  return false;',
      '}',
      "test('viewer', async ({ page }) => {",
      '  await ensureImageExists(page, id);',
      '  await expect(page.locator(".img").first()).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-2 戻り値を主張で受ける是正後の形は検出しない',
    source: [
      'async function ensureImageExists(page, id): Promise<boolean> {',
      '  const count = await page.locator(".img").count();',
      '  if (count > 0) {',
      '    return true;',
      '  }',
      '  return false;',
      '}',
      "test('viewer', async ({ page }) => {",
      '  const prepared = await ensureImageExists(page, id);',
      "  assertPrepared(prepared, '画像の前提');",
      '  await expect(page.locator(".img").first()).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-3 取り込んだ真偽を返す補助の結果を捨てる（実例 sessions）',
    source: [
      `import { ${HELPER_BOOLEAN_NAME} } from '../../helpers/wait-helpers';`,
      "test('sessions', async ({ page }) => {",
      `  await ${HELPER_BOOLEAN_NAME}(page);`,
      '  await expect(page.getByText(/現在のデバイス/)).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-4 取り込みも宣言も無い名前は検出しない（真偽を返すか決められない）',
    source: [
      "test('sessions', async ({ page }) => {",
      `  await ${HELPER_BOOLEAN_NAME}(page);`,
      '  await expect(page.getByText(/現在のデバイス/)).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-5 同一ファイルの宣言は取り込みより優先する（同名の別物を巻き込まない）',
    source: [
      `import { ${HELPER_BOOLEAN_NAME} } from '../../helpers/wait-helpers';`,
      `async function ${HELPER_BOOLEAN_NAME}Local(page): Promise<void> {`,
      '  await page.goto("/");',
      '}',
      `async function ${HELPER_BOOLEAN_NAME}(page): Promise<void> {`,
      '  await page.goto("/");',
      '}',
      "test('navigate', async ({ page }) => {",
      `  await ${HELPER_BOOLEAN_NAME}(page);`,
      '  await expect(page.getByRole("heading")).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-6 真偽を返さない補助の結果を捨てる形は検出しない',
    source: [
      'async function navigateToEdit(page): Promise<void> {',
      '  await page.goto("/edit");',
      '}',
      "test('edit', async ({ page }) => {",
      '  await navigateToEdit(page);',
      '  await expect(page.getByRole("heading")).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-7 ブラウザ側で評価される関数の内側は検出しない（実例 site-survey-images の drag 送出）',
    source: [
      "test('drag', async ({ page }) => {",
      '  const observed = await page.evaluate(() => {',
      '    const dispatch = (element, type): boolean => {',
      '      return !element.dispatchEvent(new DragEvent(type));',
      '    };',
      "    dispatch(document.body, 'dragstart');",
      "    const overPrevented = dispatch(document.body, 'dragover');",
      '    return { overPrevented };',
      '  });',
      '  expect(observed.overPrevented).toBe(true);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-8 同名の宣言で真偽と非真偽が混在する形は検出しない（どれが呼ばれるか決められない）',
    source: [
      'async function ensureReady(page): Promise<boolean> {',
      '  return (await page.locator(".x").count()) > 0;',
      '}',
      'async function outer(page) {',
      '  async function ensureReady(page2): Promise<void> {',
      '    await page2.goto("/");',
      '  }',
      '  await ensureReady(page);',
      '}',
      "test('ready', async ({ page }) => {",
      '  await ensureReady(page);',
      '  await expect(page.locator(".x").first()).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-9 型注釈が無くても return がすべて真偽なら検出する（命名にも注釈にも依らない）',
    source: [
      'async function prepareThing(page) {',
      '  const count = await page.locator(".x").count();',
      '  if (count > 0) {',
      '    return true;',
      '  }',
      '  return false;',
      '}',
      "test('thing', async ({ page }) => {",
      '  await prepareThing(page);',
      '  await expect(page.locator(".x").first()).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-10 void 演算子で明示的に捨てる形も検出する',
    source: [
      'const ensureReady = async (page): Promise<boolean> => {',
      '  return (await page.locator(".x").count()) > 0;',
      '};',
      "test('ready', async ({ page }) => {",
      '  void ensureReady(page);',
      '  await expect(page.locator(".x").first()).toBeVisible();',
      '});',
    ].join('\n'),
    expected: ['T9-discarded-predicate-result'],
  },
  {
    name: '115.141-11 変数で受けるだけの形は検出しない（未使用は型検査・lint の領分。T9 の限界）',
    source: [
      'async function ensureReady(page): Promise<boolean> {',
      '  return (await page.locator(".x").count()) > 0;',
      '}',
      "test('ready', async ({ page }) => {",
      '  const ready = await ensureReady(page);',
      '  await expect(page.locator(".x").first()).toBeVisible();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T9-discarded-predicate-result'],
  },
];

// ============================================================================
// 115.143 型が構文で確定した値に対する型の主張（T10）
// ============================================================================
// `expect(typeof x).toBe('string')` は、主題の実行時の型が構文だけで一つに定まるなら
// 画面が何を表示していても成立する。T3 は同じ主張を真偽の matcher に載せた形
// （`expect(typeof x === 'string').toBeTruthy()`）だけを数えており、matcher を
// 載せ替えた形が無検出になっていた。
//
// 一方で「typeof を見たら恒真」と広く数えると、応答の JSON の項目に対する
// 実質のある実行時の検査（項目が無ければ 'undefined' になって落ちる）まで巻き込む。
// 両方向を固定する。
// ============================================================================

const SETTLED_TYPE_ASSERTION: Case[] = [
  {
    name: '115.143-1 既定値で型を固めた観測に対する型の主張（実例 photo-comment 是正前）',
    source: [
      "test('comment', async ({ page }) => {",
      '  const commentArea = page.locator(\'[data-testid="photo-comment-display"]\').first();',
      "  const text = (await commentArea.textContent()) ?? '';",
      "  expect(typeof text).toBe('string');",
      '});',
    ].join('\n'),
    expected: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-2 是正後の「空であること」の主張は検出しない',
    source: [
      "test('comment', async ({ page }) => {",
      '  const commentArea = page.locator(\'[data-testid="photo-comment-display"]\');',
      '  await expect(commentArea).toBeAttached();',
      '  await expect(commentArea).toBeEmpty();',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-3 応答の JSON の項目に対する型の主張は検出しない（項目が無ければ落ちる）',
    source: [
      "test('sections', async ({ request }) => {",
      "  const response = await request.get('/api/projects/1');",
      '  const body = await response.json();',
      "  expect(typeof body.sections.estimates.totalCount).toBe('number');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-4 変数を挟まず直接書いた形も検出する',
    source: [
      "test('comment', async ({ page }) => {",
      "  expect(typeof ((await page.locator('.c').textContent()) ?? '')).toBe('string');",
      '});',
    ].join('\n'),
    expected: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-5 既定値の無い観測は検出しない（string | null のため型が定まらない）',
    source: [
      "test('comment', async ({ page }) => {",
      "  const text = await page.locator('.c').textContent();",
      "  expect(typeof text).toBe('string');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-6 否定を挟む型の主張は検出しない（恒偽であって恒真ではない）',
    source: [
      "test('comment', async ({ page }) => {",
      "  const text = (await page.locator('.c').textContent()) ?? '';",
      "  expect(typeof text).not.toBe('string');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-7 主張された型が確定した型と食い違う形は検出しない（落ちうる主張）',
    source: [
      "test('comment', async ({ page }) => {",
      "  const text = (await page.locator('.c').textContent()) ?? '';",
      "  expect(typeof text).toBe('number');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-8 toEqual に載せ替えた同じ主張も検出する',
    source: [
      "test('comment', async ({ page }) => {",
      "  const text = (await page.locator('.c').textContent()) ?? '';",
      "  expect(typeof text).toEqual('string');",
      '});',
    ].join('\n'),
    expected: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-9 リテラルそのものに対する型の主張も検出する',
    source: ["test('literal', async () => {", "  expect(typeof 'x').toBe('string');", '});'].join(
      '\n'
    ),
    expected: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-10 後から代入される名前は辿らない（見逃す側へ倒した限界）',
    source: [
      "test('comment', async ({ page }) => {",
      "  let text = '';",
      "  text = (await page.locator('.c').textContent()) ?? '';",
      "  expect(typeof text).toBe('string');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-11 戻り値の型を表に持たない呼び出しは検出しない（表の限界）',
    source: [
      "test('comment', async ({ page }) => {",
      "  const value = (await readCommentText(page)) ?? '';",
      "  expect(typeof value).toBe('string');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    name: '115.143-12 真偽の matcher に載せた同じ主張は従来どおり T3 として検出する',
    source: [
      "test('comment', async ({ page }) => {",
      "  const text = (await page.locator('.c').textContent()) ?? '';",
      "  expect(typeof text === 'string').toBeTruthy();",
      '});',
    ].join('\n'),
    expected: ['T3-tautology'],
  },
  // --------------------------------------------------------------------------
  // 115.164: T10 の狭め方の境界を単独で固定する（規則を広げる変異への防護）
  //
  // 115.143 の非検出側 7 件のうち、最重要の境界（応答の JSON の項目参照は**実質のある
  // 検査**であって恒真ではない）を単独で固定していたのは 115.143-3 の一件だけであった。
  // 下の三件は、それぞれ異なる狭め方を**単独で反転させる変異**で落ちることを実測して足した。
  // --------------------------------------------------------------------------
  {
    // 狭め方: `??` の左辺の型が判らなければ全体も「判らない」とする
    //   （`if (!left || !right) return undefined;`）。
    // 変異: 左辺が判らないときに空集合として扱い、既定値の型だけで決める。
    // この形は応答の項目が無ければ 0（number）だが、項目が文字列なら 'string' となって
    // 落ちる。すなわち既定値を伴っても応答の項目参照は実質のある検査である。
    name: '115.164-1 応答の JSON の項目に既定値を与えた形は検出しない（既定値だけで型を決めない）',
    source: [
      "test('sections', async ({ request }) => {",
      "  const response = await request.get('/api/projects/1');",
      '  const body = await response.json();',
      '  const totalCount = body.sections.estimates.totalCount ?? 0;',
      "  expect(typeof totalCount).toBe('number');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    // 狭め方: `??` の左辺の型のうち null / undefined 以外を右辺へ合併する。
    // 変異: 左辺を捨てて右辺の型だけを採る。
    // 既定値の型が観測の型と異なるため型の集合は 2 要素（'string' と 'number'）であり、
    // 主張は画面に文字が出ていれば落ちる。115.143-5（既定値の無い観測）は `??` を
    // 通らないため、この合併の側を単独では固定できない。
    name: '115.164-2 既定値の型が観測の型と異なるなら型は定まらない（集合が 2 要素）',
    source: [
      "test('count', async ({ page }) => {",
      "  const shown = (await page.locator('.c').textContent()) ?? 0;",
      "  expect(typeof shown).toBe('number');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
  {
    // 狭め方: 同名の宣言が複数ある名前は、どの値が主題か決められないため辿らない
    //   （`if (values.length !== 1) return undefined;`）。
    // 変異: 複数あるとき最初の宣言を採る。
    // 115.143-10 が固定するのは「後から代入される名前」であり、同名の宣言が複数ある形は
    // 限界節に書かれていながら自己検査には無かった。
    name: '115.164-3 同名の宣言が複数ある名前は辿らない（どの値が主題か決められない）',
    source: [
      "test('first', async ({ page }) => {",
      "  const text = (await page.locator('.a').textContent()) ?? '';",
      '  expect(text.length).toBeGreaterThan(0);',
      '});',
      '',
      "test('second', async ({ page }) => {",
      "  const text = await page.locator('.b').getAttribute('data-value');",
      "  expect(typeof text).toBe('string');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T10-settled-type-assertion'],
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(index: number, testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const failures: string[] = [];
  const result = scanSource(`selftest/case-${index}.spec.ts`, testCase.source);
  const detected = new Set(result.findings.map((f) => f.type));

  for (const type of testCase.expected) {
    if (!detected.has(type)) {
      failures.push(`${type} が検出されていない`);
    }
  }
  for (const type of testCase.forbidden ?? []) {
    if (detected.has(type)) {
      const hit = result.findings.find((f) => f.type === type);
      failures.push(`${type} が検出されている（過検出）: ${hit?.snippet ?? ''}`);
    }
  }
  if (testCase.expected.length === 0 && !testCase.forbidden && result.findings.length > 0) {
    failures.push(`検出されてはならないが検出された: ${result.findings[0]!.snippet}`);
  }
  if (testCase.expectInvalidAllow && result.invalidAllows.length === 0) {
    failures.push('理由の無い除外注釈が検出されていない');
  }
  if (!testCase.expectInvalidAllow && result.invalidAllows.length > 0) {
    failures.push('理由の無い除外注釈が誤って検出された');
  }
  if (testCase.expectAllowed && result.allowed.length === 0) {
    failures.push('除外注釈による抑止が働いていない');
  }
  return failures;
}

// ============================================================================
// 115.162: 空の母集団に対する不在の主張（T11）
//
// 母集団から作った値へ不在を主張しながら、母集団が空でないことを別に確かめない形は、
// 母集団が空なら（連結は空文字、写像は空配列になり）常に成立する。
// 両方向（検出する例・検出してはならない例）を固定する。
// ============================================================================

const EMPTY_POPULATION_ABSENCE: Case[] = [
  {
    name: '115.162-1 失敗一覧を連結した文字列へ不在を主張する（実例 site-survey-upload-validation-e2e）',
    source: [
      "test('upload', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      "  expect(body).toHaveProperty('failed');",
      '  const failureReasons = (Array.isArray(body.failed) ? body.failed : [])',
      "    .map((failure) => failure.error ?? '')",
      "    .join(' / ');",
      '  expect(failureReasons).not.toMatch(/サポートされていないファイル形式/);',
      '});',
    ].join('\n'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-2 母集団の大きさを固定してから不在を主張する形は検出しない（是正後の形）',
    source: [
      "test('upload fixed', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      '  const successful = body.successful;',
      '  const failed = body.failed;',
      '  expect(successful.length + failed.length).toBe(1);',
      "  const failureReasons = failed.map((failure) => failure.error ?? '').join(' / ');",
      '  expect(failureReasons).not.toMatch(/サポートされていないファイル形式/);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-3 写像で作った配列へ不在を主張する形も同型として検出する',
    source: [
      "test('ids', async ({ page }) => {",
      '  const rows = await fetchRows(page);',
      '  const ids = rows.map((row) => row.id);',
      "  expect(ids).not.toContain('deleted-id');",
      '});',
    ].join('\n'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-4 母集団の要素の実在を別に主張していれば検出しない（実例 site-survey-image-request-scaling）',
    source: [
      "test('ids guarded', async ({ page }) => {",
      '  const rows = await fetchRows(page);',
      '  const head = rows[0];',
      '  expect(head.id).toBeTruthy();',
      '  const ids = rows.map((row) => row.id);',
      "  expect(ids).not.toContain('deleted-id');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-5 母集団を経ない不在の主張は検出しない（画面の値をそのまま見る）',
    source: [
      "test('raw', async ({ page }) => {",
      "  const text = (await page.locator('#alert').textContent()) ?? '';",
      '  expect(text).not.toMatch(/アップロードに失敗/);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-6 空文字にも一致する正規表現は検出しない（母集団が空なら主張は落ちる）',
    source: [
      "test('empty matches', async ({ page }) => {",
      '  const rows = await fetchRows(page);',
      "  const joined = rows.map((row) => row.label).join(' / ');",
      '  expect(joined).not.toMatch(/^$/);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-7 綴りが構文で定まらない needle は検出しない（解析できない側へ倒す）',
    source: [
      "test('dynamic needle', async ({ page }) => {",
      '  const rows = await fetchRows(page);',
      "  const joined = rows.map((row) => row.label).join('');",
      '  expect(joined).not.toContain(coverOnlyText);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.180-1 宣言のあとに積んで作る集まりも検出する（実例 projects/project-list-columns）',
    source: [
      "test('pushed', async ({ page }) => {",
      '  const headerTexts = [];',
      "  const count = await page.locator('th').count();",
      '  for (let i = 0; i < count; i++) {',
      "    headerTexts.push((await page.locator('th').nth(i).textContent()) ?? '');",
      '  }',
      "  expect(headerTexts).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.180-2 積んで作る集まりでも大きさを先に固定していれば検出しない（是正後の形）',
    source: [
      "test('pushed and fixed', async ({ page }) => {",
      '  const headerTexts = [];',
      "  const count = await page.locator('th').count();",
      '  for (let i = 0; i < count; i++) {',
      "    headerTexts.push((await page.locator('th').nth(i).textContent()) ?? '');",
      '  }',
      '  expect(headerTexts).toHaveLength(6);',
      "  expect(headerTexts).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.180-3 積み足しが一度も現れない空の集まりは検出しない（母集団が空になりうる形ではない）',
    source: [
      "test('never pushed', async ({ page }) => {",
      '  const headerTexts = [];',
      "  expect(headerTexts).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.180-4 宣言時に要素を持つ集まりは検出しない（積み足しがあっても空にはならない）',
    source: [
      "test('non-empty at declaration', async ({ page }) => {",
      "  const headerTexts = ['プロジェクト名'];",
      "  headerTexts.push((await page.locator('th').first().textContent()) ?? '');",
      "  expect(headerTexts).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.180-5 後から代入される名前は検出しない（宣言時の値が主題の値とは限らない）',
    source: [
      "test('reassigned', async ({ page }) => {",
      '  let headerTexts = [];',
      '  headerTexts = await readHeaderTexts(page);',
      "  headerTexts.push('末尾');",
      "  expect(headerTexts).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.180-6 積み足さない操作は積み足しとして数えない（`concat` は受け手を空のまま残す）',
    // 免除の探索は主題の綴りを宣言の初期化子まで展開するため、`collected.concat(...)` を
    // 受けた名前を主題にすると**免除の側でも**救われてしまい、この事例は
    // 積み足しの種別を固定しない（Task 115.163 の教訓）。母集団の名前が
    // 展開後にも現れない主題で大きさを主張し、機序を一つに絞る。
    source: [
      "test('concat leaves the receiver empty', async ({ page }) => {",
      '  const collected = [];',
      '  const labels = await readHeaderTexts(page);',
      '  collected.concat(labels);',
      '  expect(labels).toHaveLength(6);',
      "  expect(collected).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    // `push` と対で登録する（Task 115.180 のレビュー）。`COLLECTION_APPENDS` から
    // `unshift` を外す変異で**この事例だけ**が落ちることを実測しており、
    // 「push / unshift を対象へ加えた」という記述の両半分が固定されている。
    // e2e 配下に現在 `unshift` の実例は 0 件だが、**検出 0 件は該当が無いことを
    // 意味しない**（Task 115.164）ため、同じ積み足しの形として覆う側へ倒す。
    name: '115.180-7 `unshift` で積んで作る集まりも検出する（`push` と同じ積み足しの形）',
    source: [
      "test('unshifted', async ({ page }) => {",
      '  const headerTexts = [];',
      "  const count = await page.locator('th').count();",
      '  for (let i = 0; i < count; i++) {',
      "    headerTexts.unshift((await page.locator('th').nth(i).textContent()) ?? '');",
      '  }',
      "  expect(headerTexts).not.toContain('ID');",
      '});',
    ].join('\n'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.162-9 否定を伴わない主張だけを母集団の固定として数える（不在の主張は自らを保証しない）',
    source: [
      "test('negated guard does not count', async ({ page }) => {",
      '  const rows = await fetchRows(page);',
      '  const ids = rows.map((row) => row.id);',
      "  expect(rows).not.toContain('x');",
      "  expect(ids).not.toContain('deleted-id');",
      '});',
    ].join('\n'),
    expected: ['T11-empty-population-absence'],
  },
];

// ============================================================================
// 115.163: 先行の主張が含意する後続の主張（T12）
//
// 直前の主張が受理する文字列の集合に needle が現れ得ないとき、後続の不在の主張は
// 先行の主張の含意で決して失敗しない。要件の被覆に穴は空かないが、主張として
// 何も足していない飾りである。両方向（検出する例・検出してはならない例）を固定する。
// ============================================================================

const IMPLIED_SUCCESSOR: Case[] = [
  {
    name: '115.163-1 錨付きの書式の主張が小数点を排除する（実例 estimate-number-format-e2e の案分後金額）',
    source: [
      "test('allocated', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      "  expect(text, '案分後金額が表示されていない').toMatch(/^[0-9,]+円$/);",
      "  const numericPart = text.replace(/[,円]/g, '');",
      "  expect(numericPart).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T12-implied-successor'],
  },
  {
    name: '115.163-2 是正後（先行の主張だけを残す）は検出しない',
    source: [
      "test('allocated fixed', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      "  expect(text, '案分後金額が整数の表示になっていない').toMatch(/^[0-9,]+円$/);",
      "  const numericPart = text.replace(/[,円]/g, '');",
      '  expect(Number.parseInt(numericPart, 10)).toBe(333);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-3 先行が小数点を受理するなら後続は実質を持つ（検出しない）',
    source: [
      "test('accepts decimal', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,.]+円$/);',
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-4 錨が無い正規表現は文字列全体を縛らない（検出しない）',
    source: [
      "test('unanchored', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/[0-9,]+円/);',
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-5 選択肢の一つでも錨が欠ければ縛れない（検出しない）',
    source: [
      "test('one branch unanchored', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,]+円$|[0-9,]+点/);',
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-6 同名の別束縛は対応づけない（隣り合う繰り返しで同じ名前を使う形）',
    source: [
      "test('shadowed', async ({ page }) => {",
      '  for (let i = 0; i < 2; i++) {',
      "    const text = (await page.getByTestId('preview-allocated').nth(i).textContent()) ?? '';",
      '    expect(text).toMatch(/^[0-9,]+円$/);',
      '  }',
      '  const amountTexts = await page.locator(\'[data-testid="amount-field"]\').allTextContents();',
      '  expect(amountTexts.length).toBeGreaterThan(0);',
      '  for (const text of amountTexts) {',
      "    expect(text.replace(/,/g, '')).not.toContain('.');",
      '  }',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-7 綴りを確定させる等値の主張も先行として数える',
    source: [
      "test('equality leading', async ({ page }) => {",
      "  const text = (await page.getByTestId('total-amount').textContent()) ?? '';",
      "  expect(text).toBe('2,500');",
      "  expect(text.replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T12-implied-successor'],
  },
  {
    name: '115.163-8 先行の綴りが needle を含むなら後続は実質を持つ（検出しない）',
    source: [
      "test('equality contains needle', async ({ page }) => {",
      "  const text = (await page.getByTestId('total-amount').textContent()) ?? '';",
      "  expect(text).toBe('2,500.50');",
      "  expect(text.replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-9 後続より後ろに書かれた主張は先行として数えない',
    source: [
      "test('leading comes later', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '  expect(text).toMatch(/^[0-9,]+円$/);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 実例（estimate-number-format-e2e の locator + `?? ''` + textContent）は、
    // 「locator を主題とする matcher を数えない」ことと「`??` を遡らない」ことの
    // **二つ**に同時に救われている。二つを一つのケースで束ねると、片方を緩めても
    // 落ちないため、どちらの判断も固定できない。よってケースを機構ごとに割る。
    // 本ケースは後者（`??` を遡らない）だけを単独で固定する。
    name: '115.163-10 `??` の左辺へは遡らない（先行と後続の名前が繋がらない。意図した見逃し）',
    source: [
      "test('nullish coalescing not traversed', async ({ page }) => {",
      "  const rawText = await page.getByTestId('total-amount').textContent();",
      "  expect(rawText).toBe('2,500');",
      "  const amountText = rawText ?? '';",
      "  expect(amountText.replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    name: '115.163-11 needle を取り除く置換は T7 が数える（T12 では重ねて数えない）',
    source: [
      "test('removal belongs to T7', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,]+円$/);',
      "  expect(text.replace(/\\./g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T7-excluded-absence'],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 実在の e2e/specs/estimate/estimate-number-format-e2e.spec.ts:507 を写した形。
    // 先行は「空でない」としか言っておらず、後続の「小数点を含まない」は実質を持つ。
    // `collectLanguageFixingAssertions` の `!negated` を外すとこのケースが落ちる
    // （＝実在の主張を「飾り」と誤って告発し、実のある主張の削除を迫る）。
    name: '115.163-12 否定を伴う先行は言語を確定させない（実在の 507 行を写した形）',
    source: [
      "test('negated leading has no language', async ({ page }) => {",
      '  const unitPrices = page.locator(\'[data-testid="line-type-EXECUTION"]\').locator(',
      '    \'input[aria-label="単価"]\'',
      '  );',
      '  for (let i = 0; i < 2; i++) {',
      '    const value = await unitPrices.nth(i).inputValue();',
      "    expect(value, '案分後の実行金額行の単価が空').not.toBe('');",
      "    expect(value).not.toContain('.');",
      '  }',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 115.163-10 から割った片割れ。locator を主題とする matcher（`toHaveText`）を
    // `LANGUAGE_FIXING_EQUALITY_MATCHERS` へ足す**単独の変異**で落ちる最小形にするため、
    // 後続の主題を locator の名前そのものに置いている（実在の形では間に
    // `textContent()` と `??` が挟まり、そちらは 115.163-10 が固定する）。
    name: '115.163-13 locator を主題とする matcher は言語を確定させる先行として数えない',
    source: [
      "test('locator matcher not language fixing', async ({ page }) => {",
      "  const amountText = page.getByTestId('total-amount');",
      "  await expect(amountText).toHaveText('2,500');",
      "  expect(amountText).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // `isFullyAnchored` の `m` の除外を単独で固定する。`m` があると `^`/`$` は
    // 行頭・行末に一致するため、複数行の文字列では錨が文字列全体を縛らない。
    name: '115.163-14 `m` 修飾子つきの錨は文字列全体を縛らない（検出しない）',
    source: [
      "test('multiline flag', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,]+円$/m);',
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // `absenceSubjectRoots` の「置換後の文字列が needle の文字を含むなら遡らない」判定を
    // 単独で固定する。置換が needle を**生む**なら、先行が何を縛っていようと後続は実質を持つ。
    name: '115.163-15 needle を生む置換を挟むなら後続は実質を持つ（検出しない）',
    source: [
      "test('replacement introduces needle', async ({ page }) => {",
      "  const text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,]+円$/);',
      "  expect(text.replace(/円/g, '.')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 後から代入される名前は、先行の主張の時点の値と後続の時点の値が同じとは限らない。
    // この判断は二箇所（`collectLanguageFixingAssertions` の先行の主題、
    // `absenceSubjectRoots` の後続の根）に**同じ名前**への同じ条件として書かれている。
    // 先行と後続は綴りが一致する場合にしか対応づかず、`reassigned` は綴りの集合であるため、
    // 先行側のガードだけを外してもこの形は落ちない（後続側が根を返さない）。実測でも
    // 先行側だけの除去は 117/117 のまま素通りする。本ケースは「両方を外すと落ちる」
    // ことで、少なくとも一方が残ることを固定する。後続側だけの除去は 115.163-17 が捕える。
    name: '115.163-16 後から代入される名前は先行と後続を対応づけない（検出しない）',
    source: [
      "test('reassigned subject', async ({ page }) => {",
      "  let text = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,]+円$/);',
      "  text = (await page.getByTestId('preview-total').textContent()) ?? '';",
      "  expect(text.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 後から代入される名前は、そこで**遡りを打ち切る**必要もある。打ち切らないと
    // 「代入される前の出どころ」（ここでは `raw`）まで根に含まれ、その名前に対する
    // 先行の主張と繋がってしまう。`raw` 自身は再代入されないため、先行の主題に対する
    // ガード（115.163-16）ではこの形を止められない。すなわち `absenceSubjectRoots`
    // 側のガードは単独で効いており、外すとこのケースが落ちる。
    name: '115.163-17 後から代入される名前で遡りを打ち切る（代入前の出どころへ繋げない）',
    source: [
      "test('reassigned stops the walk', async ({ page }) => {",
      "  const raw = (await page.getByTestId('preview-allocated').textContent()) ?? '';",
      '  expect(raw).toMatch(/^[0-9,]+円$/);',
      '  let amountText = raw;',
      "  amountText = (await page.getByTestId('preview-total').textContent()) ?? '';",
      "  expect(amountText.replace(/[,円]/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  // --------------------------------------------------------------------------
  // 115.164: 115.163 の査読が挙げた「狭める判断」のうち、実効を持つものを固定する
  //
  // 査読は五つの判断を挙げた（後続側の否定の要求／空の needle の番人／同名の宣言が
  // 複数のときの遡り抑止／自己比較／束縛の解決不能での打ち切り）。2026-08-25 に一つずつ
  // 単独で反転させて測ったところ、自己検査 118 件はいずれの変異でも全て緑のままであった。
  // うち三つ（否定の要求・同名の宣言・束縛の解決不能）は自作の例で検出が反転する、
  // すなわち**実効を持つ**ことを確かめたため、下の三件で固定する。
  // 残る二つ（空の needle・自己比較）は反転させても検出が動かない。理由は検出器側の
  // コメントに実測とともに記した（`impliedSuccessor` を参照）。
  // --------------------------------------------------------------------------
  {
    // 狭め方: 後続は**否定を伴う** `toContain` に限る。
    // 変異: 否定の要求を外す。
    // 先行が受理しない綴りを肯定で主張する形は「決して失敗しない」のではなく
    // 「必ず失敗する」形であり、飾りではなく落ちる主張である。数えてはならない。
    name: '115.164-4 否定を伴わない後続は含意の対象にしない（恒偽であって恒真ではない）',
    source: [
      "test('positive successor', async ({ page }) => {",
      "  const amount = (await page.locator('.a').textContent()) ?? '';",
      '  expect(amount).toMatch(/^[0-9,]+円$/);',
      "  expect(amount).toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 狭め方: 中間の名前に同名の宣言が複数あるときは出どころへ遡らない
    //   （`absenceSubjectRoots` の `values.length === 1`）。
    // 変異: 複数あるとき最初の宣言を採る。
    // 一つ目のテストだけなら T12 として検出される形である（115.163-1 と同じ骨格）。
    // 二つ目のテストが同じ名前を別の値で宣言した時点で、後続の主題がどちらの値から
    // 来たのかは構文だけでは決められない。
    name: '115.164-5 同名の宣言が複数ある中間の名前では遡らない（先行と繋げない）',
    source: [
      "test('first', async ({ page }) => {",
      "  const amount = (await page.locator('.a').textContent()) ?? '';",
      '  expect(amount).toMatch(/^[0-9,]+円$/);',
      "  const cleaned = amount.replace(/,/g, '');",
      "  expect(cleaned).not.toContain('.');",
      '});',
      '',
      "test('second', async ({ page }) => {",
      "  const other = (await page.locator('.b').textContent()) ?? '';",
      '  const cleaned = other.trim();',
      '  expect(cleaned.length).toBeGreaterThan(0);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  {
    // 狭め方: 主題の名前を束縛へ解決できないときは対応づけない
    //   （`impliedSuccessor` の `if (!rootBinding) continue;`）。
    // 変異: この打ち切りを外す。先行も後続も解決できず双方 undefined となって「同じ束縛」と
    // 見なされ、対応づいてしまう。取り込んだ名前や大域の名前は同じ綴りでも同じ束縛とは限らない。
    name: '115.164-6 束縛を解決できない名前は先行と後続を対応づけない（取り込んだ名前）',
    source: [
      "import { fixedAmountLabel } from '../helpers/labels';",
      '',
      "test('imported binding', async () => {",
      '  expect(fixedAmountLabel).toMatch(/^[0-9,]+円$/);',
      "  expect(fixedAmountLabel).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
];

// ============================================================================
// 115.181: 変異の掃討で見つかった「実効を持つのに固定されていない枝」
//
// 検出規則の狭める向きの判断（定数の集合・関門の条件）を一つずつ変異させ、
// 自己検査が緑のままである枝を洗い出した（合計 91 変異）。生き残った枝のうち、
// 検出器へ直に書き方を当てて**実効があると実測できた**ものをここで固定する。
// 各事例は、対応する枝を外す変異で**その事例だけ**が落ちることを実測している。
// ============================================================================

/** 応答の失敗一覧を連結し、加工を一つ挟んで不在を主張する形（T11 の `STRING_PRESERVING`） */
const stringPreservingCase = (call: string): string =>
  [
    "test('string preserving', async ({ page }) => {",
    '  const response = await page.waitForResponse(() => true);',
    '  const body = await response.json();',
    `  const reasons = body.failed.map((failure) => failure.error).join(' / ').${call};`,
    "  expect(reasons).not.toContain('拒否');",
    '});',
  ].join('\n');

/** 母集団から集まりを作り、その配列へ不在を主張する形（T11 の `COLLECTION_PROJECTIONS`） */
const collectionProjectionCase = (call: string): string =>
  [
    "test('collection projection', async ({ page }) => {",
    '  const response = await page.waitForResponse(() => true);',
    '  const body = await response.json();',
    `  const items = body.failed.${call};`,
    "  expect(items).not.toContain('拒否');",
    '});',
  ].join('\n');

/** 即時判定に待機を指定する形（T2 の `IMMEDIATE_PREDICATES`） */
const immediatePredicateCase = (predicate: string): string =>
  [
    "test('ignored timeout', async ({ page }) => {",
    `  const observed = await page.getByRole('dialog').${predicate}({ timeout: 1000 });`,
    '  if (observed) {',
    "    await expect(page.getByRole('dialog')).toBeVisible();",
    '  }',
    '});',
  ].join('\n');

const SWEPT_BRANCHES: Case[] = [
  // --------------------------------------------------------------------------
  // T11 `STRING_PRESERVING`（本タスクが名指しで受け取った枝）
  //
  // 集合を空にする変異でも自己検査は緑のままであった（実測）。つまり六つの綴りは
  // **一つも固定されていなかった**。綴りごとに、その綴りだけを外す変異で
  // 当該の事例だけが落ちることを実測している。
  // --------------------------------------------------------------------------
  {
    name: '115.181-1 `trim` を挟んだ連結も母集団から作った値として数える',
    source: stringPreservingCase('trim()'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-2 `trimStart` を挟んだ連結も母集団から作った値として数える',
    source: stringPreservingCase('trimStart()'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-3 `trimEnd` を挟んだ連結も母集団から作った値として数える',
    source: stringPreservingCase('trimEnd()'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-4 `toLowerCase` を挟んだ連結も母集団から作った値として数える',
    source: stringPreservingCase('toLowerCase()'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-5 `toUpperCase` を挟んだ連結も母集団から作った値として数える',
    source: stringPreservingCase('toUpperCase()'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-6 `normalize` を挟んだ連結も母集団から作った値として数える',
    source: stringPreservingCase('normalize()'),
    expected: ['T11-empty-population-absence'],
  },
  // --------------------------------------------------------------------------
  // T11 `COLLECTION_PROJECTIONS`
  //
  // `map` だけが固定されていた（`map` を外すと三つの事例が落ちる）。残る四つの綴りは
  // 外しても自己検査が緑のままであり、いずれも実効を持つ（実測）。
  // --------------------------------------------------------------------------
  {
    name: '115.181-7 `filter` で作った配列も母集団から作った値として数える',
    source: collectionProjectionCase('filter((failure) => !!failure)'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-8 `flatMap` で作った配列も母集団から作った値として数える',
    source: collectionProjectionCase('flatMap((failure) => [failure])'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-9 `slice` で作った配列も母集団から作った値として数える',
    source: collectionProjectionCase('slice(0, 3)'),
    expected: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-10 `concat` で作った配列も母集団から作った値として数える',
    source: collectionProjectionCase('concat([])'),
    expected: ['T11-empty-population-absence'],
  },
  // --------------------------------------------------------------------------
  // T12 `LANGUAGE_FIXING_EQUALITY_MATCHERS` / T10 `TYPE_EQUALITY_MATCHERS`
  //
  // どちらの集合も `toBe` だけが固定されていた。「三つの等値の matcher を数える」と
  // 書きながら、外しても落ちない綴りが T12 に二つ、T10 に一つ残っていた。
  // --------------------------------------------------------------------------
  {
    name: '115.181-11 `toEqual` で綴りを確定させる先行も含意の元として数える',
    source: [
      "test('toEqual leading', async ({ page }) => {",
      "  const text = (await page.getByTestId('total-amount').textContent()) ?? '';",
      "  expect(text).toEqual('2,500');",
      "  expect(text.replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T12-implied-successor'],
  },
  {
    name: '115.181-12 `toStrictEqual` で綴りを確定させる先行も含意の元として数える',
    source: [
      "test('toStrictEqual leading', async ({ page }) => {",
      "  const text = (await page.getByTestId('total-amount').textContent()) ?? '';",
      "  expect(text).toStrictEqual('2,500');",
      "  expect(text.replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: ['T12-implied-successor'],
  },
  {
    name: '115.181-13 `toStrictEqual` に載せ替えた型の主張も検出する',
    source: [
      "test('toStrictEqual type', async ({ page }) => {",
      "  const text = (await page.locator('.c').textContent()) ?? '';",
      "  expect(typeof text).toStrictEqual('string');",
      '});',
    ].join('\n'),
    expected: ['T10-settled-type-assertion'],
  },
  // --------------------------------------------------------------------------
  // T2 `IMMEDIATE_PREDICATES`
  //
  // `isVisible` だけが固定されていた。残る五つの述語は外しても自己検査が緑のままで、
  // いずれも実効を持つ（実測）。事例は T2 だけを主張する。同じ書き方は T5 でも
  // 検出されるが、そちらは別の事例が固定している。
  // --------------------------------------------------------------------------
  {
    name: '115.181-14 `isHidden` に待機を指定する形も検出する',
    source: immediatePredicateCase('isHidden'),
    expected: ['T2-ignored-timeout'],
  },
  {
    name: '115.181-15 `isEnabled` に待機を指定する形も検出する',
    source: immediatePredicateCase('isEnabled'),
    expected: ['T2-ignored-timeout'],
  },
  {
    name: '115.181-16 `isDisabled` に待機を指定する形も検出する',
    source: immediatePredicateCase('isDisabled'),
    expected: ['T2-ignored-timeout'],
  },
  {
    name: '115.181-17 `isChecked` に待機を指定する形も検出する',
    source: immediatePredicateCase('isChecked'),
    expected: ['T2-ignored-timeout'],
  },
  {
    name: '115.181-18 `isEditable` に待機を指定する形も検出する',
    source: immediatePredicateCase('isEditable'),
    expected: ['T2-ignored-timeout'],
  },
  {
    // 語彙の寄与を切り分けるため `await` を含まない形を用いる。分類の関門は
    // 「観測の語彙 **または** `await` **または** 沈黙脱出」であり、`await` を含む形では
    // `count` を語彙から外しても分類が変わらない（実測。1 件も落ちなかった）。
    name: '115.181-19 `count` は観測の語彙として実効を持つ（`await` を含まない形で切り分ける）',
    source: [
      "test('count without await', async ({ page }) => {",
      '  const summary = readSummary();',
      '  if (summary.count === 0) {',
      '    return;',
      '  }',
      "  await expect(page.getByTestId('row').first()).toBeVisible();",
      '});',
    ].join('\n'),
    expected: ['T5-observed-result-gate'],
  },
  // --------------------------------------------------------------------------
  // 関門の条件（外すと検出が広がる向きの判断）
  //
  // ここから下は「狭める向きの判断」を外す変異で自己検査が緑のままだったもののうち、
  // 実効があると実測できた枝である。いずれも陰性対照（検出してはならない形）で固定する。
  // --------------------------------------------------------------------------
  {
    // `slice` を写像として数えるため、`join` で文字列になったあとに `slice` を挟むと
    // 種別が `array` へ移る。`STRING_PRESERVING` の枝は種別が `string` のときだけ
    // 遡るため、ここから先へは進まない。**既知の見逃しであり、望ましい挙動ではない。**
    // `inherited?.kind === 'string'` を外す変異ではこの形が検出へ変わる（実測）。
    name: '115.181-20 種別が配列へ移った母集団に文字列の加工を挟む形は数えない（既知の限界）',
    source: [
      "test('array kind with string preserving', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      "  const reasons = body.failed.map((failure) => failure.error).join(' / ').slice(0, 20).trim();",
      "  expect(reasons).not.toContain('拒否');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    // `toMatch` は文字列にしか当たらない。配列の母集団を `toMatch` で見る形は
    // 実行時に成立しない書き方であり、数えると過検出になる。
    name: '115.181-21 配列の母集団は `toContain` だけを見る（`toMatch` は文字列にしか当たらない）',
    source: [
      "test('array population with toMatch', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      '  const items = body.failed.map((failure) => failure.error);',
      '  expect(items).not.toMatch(/拒否/);',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    // 空文字はどんな文字列にも含まれる。母集団が空なら主題は空文字となり、
    // この主張は**落ちる**。したがって素通りする形ではない。
    // 115.162-6（空文字に一致する正規表現）の、文字列リテラル版に当たる。
    name: '115.181-22 空文字の needle は検出しない（母集団が空なら主張は落ちる）',
    source: [
      "test('empty needle', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      "  const reasons = body.failed.map((failure) => failure.error).join(' / ');",
      "  expect(reasons).not.toContain('');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    // 同名の宣言が別の母集団を指すなら、主題がどちらの値を取るかは構文だけでは
    // 決められない。数え切れない側は検出しない。
    name: '115.181-23 同名の宣言が別の母集団を指すなら遡らない（検出しない）',
    source: [
      "test('same name different populations', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      '  {',
      "    const reasons = body.failed.map((failure) => failure.error).join(' / ');",
      '    expect(reasons).not.toMatch(/拒否/);',
      '  }',
      '  {',
      "    const reasons = body.other.map((failure) => failure.error).join(' / ');",
      '    expect(reasons).not.toMatch(/拒否/);',
      '  }',
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    // 母集団を指す名前は「受け手として現れた識別子・項目参照の綴り」だけを集める。
    // 呼び出しの結果を綴りとして集めると、免除の探索がその綴りに当たって緩くなる。
    // 受け手の限定を外す変異ではこの形が無検出へ変わる（実測）。
    name: '115.181-24 呼び出しの結果は母集団の名前として数えない（免除の探索を緩めない）',
    source: [
      "test('call receiver is not a population name', async ({ page }) => {",
      "  const reasons = readRows(page).map((row) => row.id).join(' / ');",
      '  expect(readRows(page)).toHaveLength(3);',
      '  expect(reasons).not.toMatch(/拒否/);',
      '});',
    ].join('\n'),
    expected: ['T11-empty-population-absence'],
  },
  {
    // `\$` はエスケープされたドル記号であり、文字列の終端の錨ではない。
    // 錨と数えると、末尾に何が続いていても「文字列全体が縛られている」と
    // 誤って見なすことになる。
    name: '115.181-25 エスケープされたドル記号は錨として数えない（検出しない）',
    source: [
      "test('escaped dollar is not an anchor', async ({ page }) => {",
      "  const text = (await page.getByTestId('total-amount').textContent()) ?? '';",
      '  expect(text).toMatch(/^[0-9,]+\\$/);',
      "  expect(text.replace(/,/g, '')).not.toContain('.');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T12-implied-successor'],
  },
  // --------------------------------------------------------------------------
  // 母集団の大きさを固定する主張の探索の限界（**望ましい挙動ではなく、既知の限界**）
  //
  // 探索は「母集団を指す名前が、否定を伴わない `expect(...)` の主題に語として現れるか」
  // だけを見る。したがって大きさと無関係な主張や、空であることを述べる主張でも
  // 「固定済み」と見なす。過検出は主張を消す圧力になるため見逃す側へ倒した判断であり
  // （限界の節に名指しで記載済み）、是正はしない。
  //
  // ここで固定するのは**限界そのもの**である。宣言だけあって固定の無い判断は
  // 次の変更で黙って失われる（Task 115.156）ため、限界を狭める向きの変更が
  // 「気づかないうちに」入ることを防ぐ。狭めたくなったときはこの二件が落ちるので、
  // 限界の節の書き換えと対で行うことになる。
  // --------------------------------------------------------------------------
  {
    name: '115.181-26 大きさと無関係な主張でも固定済みと見なす（既知の限界。是正しない）',
    source: [
      "test('unrelated assertion counts as fixing', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      '  const ids = body.rows.map((row) => row.id);',
      '  expect(ids).toBeDefined();',
      "  expect(ids).not.toContain('deleted-id');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
  {
    name: '115.181-27 空であることの主張でも固定済みと見なす（既知の限界。是正しない）',
    source: [
      "test('toHaveLength(0) counts as fixing', async ({ page }) => {",
      '  const response = await page.waitForResponse(() => true);',
      '  const body = await response.json();',
      '  const ids = body.rows.map((row) => row.id);',
      '  expect(ids).toHaveLength(0);',
      "  expect(ids).not.toContain('deleted-id');",
      '});',
    ].join('\n'),
    expected: [],
    forbidden: ['T11-empty-population-absence'],
  },
];

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '115.24 捕捉できていなかった三つの書き方', cases: MISSED_FORMS },
    { title: '115.25 過検出（正当な主張は数えない）', cases: OVER_DETECTIONS },
    { title: '115.25 圧縮の境界（代入の右辺の扱い）', cases: ASSIGNMENT_BOUNDARY },
    { title: '維持すべき検出', cases: MUST_KEEP },
    { title: '115.127 段0 引数なしの飛ばし', cases: BARE_SKIP },
    { title: '115.127 段3 検出器の規則による対象外（A 群・B 群）', cases: RULE_EXCLUSION },
    { title: '115.137 観測の語彙と沈黙脱出の見極め', cases: OBSERVATION_VOCABULARY },
    { title: '115.137 探索・再試行の定型を負債として数えない', cases: LOOP_ESCAPE },
    { title: '115.137 語彙の二つの規則と走査対象', cases: VOCABULARY_RULES },
    { title: '115.127 段7 再試行の成功時に抜ける形の境界', cases: RETRY_EXHAUSTION },
    { title: '115.128 抑止一覧を守る二つの関門', cases: BASELINE_GUARDS },
    { title: '115.139 抽出で除外したものの不在を主張する形', cases: EXCLUDED_ABSENCE },
    { title: '115.140 不在と観測の失敗を区別しない主張', cases: AMBIGUOUS_ABSENCE },
    {
      title: '115.141 真偽を返す関数の結果を式文として捨てる形',
      cases: DISCARDED_PREDICATE_RESULT,
    },
    {
      title: '115.143 型が構文で確定した値に対する型の主張',
      cases: SETTLED_TYPE_ASSERTION,
    },
    {
      title: '115.162 / 115.180 空の母集団に対する不在の主張',
      cases: EMPTY_POPULATION_ABSENCE,
    },
    {
      title: '115.163 先行の主張が含意する後続の主張',
      cases: IMPLIED_SUCCESSOR,
    },
    {
      title: '115.181 変異の掃討で見つかった実効を持つ枝',
      cases: SWEPT_BRANCHES,
    },
  ];

  console.log('🔍 検証無効化の検出規則 自己検査 (scripts/check-e2e-assertion-guards.selftest.ts)');
  let failed = 0;
  let index = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      index += 1;
      const failures = runCase(index, testCase);
      if (failures.length === 0) {
        console.log(`  ✅ ${testCase.name}`);
      } else {
        failed += 1;
        console.log(`  ❌ ${testCase.name}`);
        for (const failure of failures) console.log(`     - ${failure}`);
      }
    }
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
}

main();
