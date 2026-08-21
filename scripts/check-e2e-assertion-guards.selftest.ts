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

import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  buildObservationPattern,
  collectBooleanHelperNames,
  collectE2eFiles,
  getObservationPattern,
  getObservationVocabulary,
  scanSource,
  type GuardType,
} from './check-e2e-assertion-guards.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

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
