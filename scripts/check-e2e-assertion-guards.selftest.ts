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

import { scanSource, type GuardType } from './check-e2e-assertion-guards.js';

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する書き方 */
  source: string;
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
// 実行
// ============================================================================

function runCase(index: number, testCase: Case): string[] {
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
