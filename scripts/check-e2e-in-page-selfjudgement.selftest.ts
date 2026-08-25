/**
 * @fileoverview 画面内自前判定 検出規則の自己検査
 *
 * scripts/check-e2e-in-page-selfjudgement.ts の検出規則が、タスク 115.81 で書き直される前に
 * 実際に e2e/specs/site-surveys/site-survey-responsive.spec.ts へ存在していた書き方をすべて
 * 捕捉し（漏れ）、画面の状態へ触れている正当な書き方を捕捉しない（過検出）ことを、
 * 書き方そのものを注入して確認する。
 *
 * 使用方法:
 *   npx tsx scripts/check-e2e-in-page-selfjudgement.selftest.ts
 *   npm run check:e2e-selfjudge:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、本検査の前に走らせる。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  classifyInPageScript,
  collectE2eFiles,
  run,
  scanSource,
  verdict,
  type RuleId,
} from './check-e2e-in-page-selfjudgement.js';

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する画面内スクリプト */
  script?: string;
  /** 検出されなければならない規則（捕捉してはならない書き方では null） */
  expected: RuleId | null;
  /** スクリプト単体では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（115.81 以前に実在した形）
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: '真をそのまま返す一行（実装が存在することを前提）',
    script: `() => {
      // ストレージ警告を表示するためのUIコンポーネントまたはロジックが存在するか確認
      return true; // 実装が存在することを前提
    }`,
    expected: 'R1-literal-only',
  },
  {
    name: '容量超過の判定を自前で書き起こして自らに主張する',
    script: `() => {
      const testError22 = { code: 22, name: 'QuotaExceededError' };
      const testError1014 = { code: 1014, name: 'NS_ERROR_DOM_QUOTA_REACHED' };
      return {
        detectsCode22: testError22.code === 22,
        detectsCode1014: testError1014.code === 1014,
      };
    }`,
    expected: 'R1-literal-only',
  },
  {
    name: 'SecurityError の判定を自前で書き起こす',
    script: `() => {
      const testSecurityError = { code: 18, name: 'SecurityError' };
      return { detectsCode18: testSecurityError.code === 18 };
    }`,
    expected: 'R1-literal-only',
  },
  {
    name: 'クロスブラウザ判定の述語を自前で定義して自らに適用する',
    script: `() => {
      const chromeError = { code: 22, name: 'QuotaExceededError' };
      const isQuotaError = (error: { code: number; name: string }) =>
        error.code === 22 || error.name === 'QuotaExceededError';
      return { chrome: isQuotaError(chromeError) };
    }`,
    expected: 'R1-literal-only',
  },
  {
    name: '関数式で書いた形も同じく捕捉する',
    script: `function () { return true; }`,
    expected: 'R1-literal-only',
  },
  {
    name: 'async で書いた形も同じく捕捉する',
    script: `async () => { return 1 === 1; }`,
    expected: 'R1-literal-only',
  },
  {
    name: '自分で書いた鍵を変数経由で読み返す（LRU削除の検証と称していた形）',
    script: `() => {
      const testKeys = ['lru_test_1', 'lru_test_2', 'lru_test_3'];
      testKeys.forEach((key, index) => {
        localStorage.setItem(key, \`value_\${index}\`);
      });
      const hasKeys = testKeys.every((key) => localStorage.getItem(key) !== null);
      testKeys.forEach((key) => localStorage.removeItem(key));
      return hasKeys;
    }`,
    expected: 'R2-self-read-back',
  },
  {
    name: '自分で書いた鍵をリテラルで読み返す',
    script: `() => {
      localStorage.setItem('x', '1');
      return localStorage.getItem('x') !== null;
    }`,
    expected: 'R2-self-read-back',
  },
];

// ============================================================================
// 捕捉してはならない書き方（過検出）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '要素ハンドルを受け取る形',
    script: `(el) => (el as HTMLElement).style.transform`,
    expected: null,
  },
  {
    name: '画面の要素を数える形',
    script: `() => document.querySelectorAll('img').length`,
    expected: null,
  },
  {
    name: '本番が画面へ置いた目印を読む形',
    script: `() => {
      const c = globalThis.__fabricCanvas;
      return c ? c.getObjects().length : -1;
    }`,
    expected: null,
  },
  {
    name: '本番が書いた鍵を読む形（自分では書かない）',
    script: `() => localStorage.getItem('accessToken')`,
    expected: null,
  },
  {
    name: '鍵を引数で受け取って読む補助',
    script: `(k) => localStorage.getItem(k)`,
    expected: null,
  },
  {
    name: '前提を積むだけで読み返さない形（書き込みのみ）',
    script: `({ prefix, total }) => {
      for (let i = 0; i < total; i++) {
        localStorage.setItem(\`\${prefix}stale-\${i}\`, '{}');
      }
    }`,
    expected: null,
  },
  {
    name: 'ブラウザにしか無い構築子を使う形',
    script: `() => new DataTransfer()`,
    expected: null,
  },
  {
    name: '記憶領域の失敗を注入する形（本番の判定は本番が行う）',
    script: `({ prefix, errorName }) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith(prefix)) {
          const error = new Error(errorName);
          error.name = errorName;
          throw error;
        }
        original.call(this, key, value);
      };
    }`,
    expected: null,
  },
];

// ============================================================================
// 走査対象と前提条件
// ============================================================================

function checkEmptyScanFails(): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-selfjudge-empty-'));
  try {
    const result = run(dir);
    if (result.scannedFiles !== 0) {
      return [`空の走査対象で ${result.scannedFiles} 件を数えた`];
    }
    const decision = verdict(result);
    if (decision.ok) {
      return ['走査対象が 0 件でも合格になった（第3原則違反）'];
    }
    return [];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function checkNoInPageScriptFails(): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-selfjudge-noscript-'));
  try {
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), 'export const x = 1;\n', 'utf8');
    const result = run(dir);
    if (result.scannedFiles === 0) {
      return ['走査対象を列挙できなかった'];
    }
    const decision = verdict(result);
    if (decision.ok) {
      return ['画面へ送るスクリプトが 0 件でも合格になった（第3原則違反）'];
    }
    return [];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function checkRealRepositoryIsScanned(): string[] {
  const files = collectE2eFiles();
  if (files.length === 0) {
    return ['リポジトリの e2e 配下を 1 件も列挙できなかった'];
  }
  const result = run();
  if (result.inPageScriptCount === 0) {
    return ['リポジトリの e2e から画面へ送るスクリプトを 1 件も抽出できなかった'];
  }
  return [];
}

function checkCallSiteIsLocated(): string[] {
  const source = [
    'test("x", async ({ page }) => {',
    '  const ok = await page.evaluate(() => {',
    '    return true;',
    '  });',
    '  expect(ok).toBeTruthy();',
    '});',
    '',
  ].join('\n');
  const result = scanSource('sample.spec.ts', source);
  if (result.findings.length !== 1) {
    return [`検出件数が 1 ではなく ${result.findings.length} だった`];
  }
  const finding = result.findings[0]!;
  if (finding.line !== 2) {
    return [`行番号が 2 ではなく ${finding.line} だった`];
  }
  if (finding.method !== 'evaluate') {
    return [`メソッド名が evaluate ではなく ${finding.method} だった`];
  }
  return [];
}

/**
 * `$eval` / `$$eval` は第一引数が選択子で、画面へ送るのは第二引数である。
 * 併せて、名前に含まれる `$` を正規表現へそのまま埋めると行末指定と衝突して
 * 一件も抽出できなくなる（黙って無検出になる）ため、ここで固定する。
 */
function checkSelectorFormsAreScanned(): string[] {
  const source = [
    'const a = await page.$$eval("img", () => { return true; });',
    'const b = await page.$eval("img", () => { return true; });',
    '',
  ].join('\n');
  const result = scanSource('sample.spec.ts', source);
  if (result.inPageScriptCount !== 2) {
    return [`抽出件数が 2 ではなく ${result.inPageScriptCount} だった`];
  }
  const methods = result.findings.map((finding) => finding.method).sort();
  if (methods.join(',') !== '$$eval,$eval') {
    return [`検出したメソッドが $$eval,$eval ではなく ${methods.join(',') || '（無し）'} だった`];
  }
  return [];
}

// ============================================================================
// 返り値が消費されるか（呼び出し側の構造）
// ============================================================================

/** 一つの断片を走査して、当たった規則の一覧を返す */
function rulesFor(snippet: string): string[] {
  return scanSource('sample.spec.ts', snippet).findings.map((finding) => finding.rule);
}

/** 断片ごとに「検出されること／されないこと」を確かめる */
function checkConsumption(
  cases: ReadonlyArray<{ label: string; snippet: string }>,
  mustDetect: boolean
): string[] {
  const failures: string[] = [];
  for (const { label, snippet } of cases) {
    const extracted = scanSource('sample.spec.ts', snippet).inPageScriptCount;
    if (extracted !== 1) {
      failures.push(`${label}: 画面へ送るスクリプトの抽出が 1 件ではなく ${extracted} 件だった`);
      continue;
    }
    const rules = rulesFor(snippet);
    if (mustDetect && rules.length !== 1) {
      failures.push(`${label}: 検出されなければならないのに ${rules.length} 件だった`);
    }
    if (!mustDetect && rules.length !== 0) {
      failures.push(`${label}: 検出してはならないのに ${rules.join(',')} が当たった`);
    }
  }
  return failures;
}

/**
 * 返り値を束縛しない呼び出しは捕捉しない（過検出の禁止）
 *
 * 本規則の根拠は「その値への主張はテスト自身への主張である」ことにあるため、
 * 主張に使われない返り値は対象外である。実在した
 * `await page.waitForFunction(() => true, ...)` は、直後に page.route 傍受による
 * 本番駆動の主張が置かれた死んだ一行であり、偽の緑ではない。
 */
function checkUnconsumedIsNotDetected(): string[] {
  return checkConsumption(
    [
      {
        label: '文の位置に置かれた waitForFunction',
        snippet: 'await page.waitForFunction(() => true, {}, { timeout: 5000 });\n',
      },
      {
        label: '実在した形（本文を持つ waitForFunction）',
        snippet: [
          'await page.waitForFunction(',
          '  () => {',
          '    return true;',
          '  },',
          '  { timeout: 10000 }',
          ');',
          '',
        ].join('\n'),
      },
      {
        label: '直前が条件節の閉じ括弧',
        snippet: 'if (enabled) await page.waitForFunction(() => true);\n',
      },
      {
        label: '塊の先頭に置かれた形',
        snippet: 'async function f() {\n  await page.waitForFunction(() => true);\n}\n',
      },
      {
        label: '直前が行コメントだけの形',
        snippet: '// APIが呼び出されたことを確認\nawait page.waitForFunction(() => true);\n',
      },
      {
        label: '自分で書いた鍵を読み返すが返り値を捨てる形（R2 も同じ条件に従う）',
        snippet:
          "await page.evaluate(() => {\n  localStorage.setItem('x', '1');\n  return localStorage.getItem('x') !== null;\n});\n",
      },
    ],
    false
  );
}

/**
 * 返り値が使われる呼び出しは捕捉する（検出漏れの禁止）
 *
 * 起票が指す 115.81 以前の 5 件はいずれも `const X = await page.evaluate(...)` であり、
 * 束縛した値へ `expect` が主張していた。
 */
function checkConsumedIsDetected(): string[] {
  return checkConsumption(
    [
      { label: '宣言で束縛する形', snippet: 'const x = await page.evaluate(() => true);\n' },
      { label: '既存の変数へ代入する形', snippet: 'x = await page.evaluate(() => true);\n' },
      {
        label: '主張の引数へ直に渡す形',
        snippet: 'expect(await page.evaluate(() => true)).toBeTruthy();\n',
      },
      {
        label: 'return で持ち出す形',
        snippet: 'async function f() {\n  return page.evaluate(() => true);\n}\n',
      },
      {
        label: '括弧で包まれた部分式',
        snippet: 'const y = (await page.evaluate(() => true)) || fallback;\n',
      },
      {
        label: 'プロパティの値',
        snippet: 'const o = { flag: await page.evaluate(() => true) };\n',
      },
      {
        label: '三項の枝',
        snippet: 'const z = cond ? await page.evaluate(() => true) : false;\n',
      },
      {
        label: '受け手が連なる形（this.page）',
        snippet: 'const w = await this.page.evaluate(() => true);\n',
      },
    ],
    true
  );
}

/**
 * 続く呼び出しへ渡す形は捕捉する（検出漏れの禁止。タスク 115.156）
 *
 * `await page.evaluate(...).then((v) => expect(v)...)` は、呼び出しそのものは文の位置に
 * あるが、返り値は続く `.then` の受け手へ渡って主張に使われる。手前だけを後ろ向きに
 * 読む判定ではこの形を「消費されない」と誤って判定して見逃す。
 */
function checkChainedConsumptionIsDetected(): string[] {
  return checkConsumption(
    [
      {
        label: '文の位置で then へ渡す形',
        snippet: 'await page.evaluate(() => true).then((v) => expect(v).toBeTruthy());\n',
      },
      {
        label: 'await を伴わずに then へ渡す形',
        snippet: 'page.evaluate(() => true).then((v) => expect(v).toBeTruthy());\n',
      },
      {
        label: 'then の受け手が識別子の形',
        snippet: 'await page.evaluate(() => true).then(assertTruthy);\n',
      },
      {
        label: 'catch を挟んでから then へ渡す形（値は連なりを通り抜ける）',
        snippet:
          'await page.evaluate(() => true).catch(() => false).then((v) => expect(v).toBeTruthy());\n',
      },
      {
        label: '省略可能連結で then へ渡す形',
        snippet: 'await page.evaluate(() => true)?.then((v) => expect(v).toBeTruthy());\n',
      },
      {
        label: 'then が改行を跨いで続く形',
        snippet: [
          'await page',
          '  .evaluate(() => true)',
          '  .then((v) => expect(v).toBeTruthy());',
          '',
        ].join('\n'),
      },
    ],
    true
  );
}

/**
 * 続く呼び出しが返り値を受け取らない形は捕捉しない（過検出の禁止。タスク 115.156）
 *
 * 消費は検出の必要条件である（scanSource は消費されない呼び出しを読み飛ばす）。したがって
 * 消費と見なす範囲を広げる変更は、広げすぎると負債ではない書き方へ赤を出す**過検出**の
 * 方向へ劣化する。見逃しは逆に消費の範囲を**狭めた**ときに生じる。
 * `.catch` / `.finally` の受け手は解決値を受け取らないため、これらだけが続く形では
 * 返り値は依然としてどこにも渡っていない。連なりの外にある `.then` を取り違える形、
 * および画面へ送るスクリプトの内側にある `.then` を取り違える形も併せて固定する。
 */
function checkChainedNonConsumptionIsNotDetected(): string[] {
  return checkConsumption(
    [
      {
        label: 'catch だけが続く形（受け手は解決値を受け取らない）',
        snippet: 'await page.evaluate(() => true).catch(() => {});\n',
      },
      {
        label: 'finally だけが続く形（受け手は何も受け取らない）',
        snippet: 'await page.evaluate(() => true).finally(() => {});\n',
      },
      {
        label: 'catch と finally だけが続く形',
        snippet: 'await page.evaluate(() => true).catch(() => {}).finally(() => {});\n',
      },
      {
        label: '受け手を持たない then',
        snippet: 'await page.evaluate(() => true).then();\n',
      },
      {
        label: '解決側の受け手が null の then（拒否側だけを受ける形）',
        snippet: 'await page.evaluate(() => true).then(null, (e) => log(e));\n',
      },
      {
        label: '連なりの外にある別の文の then',
        snippet: 'await page.evaluate(() => true);\npending.then((v) => expect(v).toBeTruthy());\n',
      },
      {
        label: '画面へ送るスクリプトの内側にある then',
        snippet: 'await page.evaluate(() => Promise.resolve(true).then((v) => v));\n',
      },
      {
        label: '続くのが呼び出しでない項目参照',
        snippet: 'await page.evaluate(() => true).then;\n',
      },
    ],
    false
  );
}

/**
 * 表に無いメソッドを挟む連なりは辿らない（見逃す側へ倒す判断の固定。タスク 115.156）
 *
 * ヘッダの限界節が宣言しているとおり、`then` / `catch` / `finally` 以外のメソッドを挟む
 * 連なりは、挟まれたメソッドが解決値をどう扱うかが構文だけでは決められないため、
 * そこで辿るのをやめる。結果としてこの形は消費と判定せず、検出もしない——
 * すなわち**見逃す側**へ倒している。この判断が失われる（表に無いメソッドを素通りさせて
 * 連なりを辿り続ける）と、消費と見なす範囲が広がって過検出の方向へ劣化するため、
 * ここで非検出として固定する。
 */
function checkUnknownChainMethodStopsWalk(): string[] {
  return checkConsumption(
    [
      {
        label: '表に無いメソッドを挟んでから then へ渡す形',
        snippet: 'await page.evaluate(() => true).valueOf().then((v) => expect(v).toBeTruthy());\n',
      },
    ],
    false
  );
}

/**
 * 正規表現リテラルの中の引用符で、以降のファイル全体の読み取りが壊れないこと
 *
 * 消費の判定はコメントと文字列を潰した写しの上で行う。`/['"]/` のような
 * 正規表現リテラルを文字列の始まりと誤読すると、それ以降が丸ごと潰れて
 * すべての呼び出しが「消費されない」と判定され、黙って無検出になる。
 */
function checkRegexLiteralDoesNotBreakScan(): string[] {
  const source = [
    'const quoted = /[\'"]/g;',
    'const x = await page.evaluate(() => true);',
    '',
  ].join('\n');
  const rules = rulesFor(source);
  if (rules.join(',') !== 'R1-literal-only') {
    return [`正規表現リテラルの後で検出できなかった（実際: ${rules.join(',') || '無し'}）`];
  }
  return [];
}

const CONSUMPTION: Case[] = [
  {
    name: '返り値を束縛しない呼び出しは捕捉しない（過検出の禁止）',
    expected: null,
    custom: checkUnconsumedIsNotDetected,
  },
  {
    name: '返り値が使われる呼び出しは捕捉する（検出漏れの禁止）',
    expected: null,
    custom: checkConsumedIsDetected,
  },
  {
    name: '正規表現リテラルの引用符で以降の走査が壊れない',
    expected: null,
    custom: checkRegexLiteralDoesNotBreakScan,
  },
  {
    name: '続く呼び出しへ渡す形は捕捉する（検出漏れの禁止）',
    expected: null,
    custom: checkChainedConsumptionIsDetected,
  },
  {
    name: '続く呼び出しが返り値を受け取らない形は捕捉しない（過検出の禁止）',
    expected: null,
    custom: checkChainedNonConsumptionIsNotDetected,
  },
  {
    name: '表に無いメソッドを挟む連なりは辿らない（見逃す側へ倒す判断の固定）',
    expected: null,
    custom: checkUnknownChainMethodStopsWalk,
  },
];

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: null,
    custom: checkEmptyScanFails,
  },
  {
    name: '画面へ送るスクリプトが 0 件のとき合格にしない（第3原則）',
    expected: null,
    custom: checkNoInPageScriptFails,
  },
  {
    name: 'リポジトリ本体の e2e を実際に列挙し、スクリプトを抽出できる',
    expected: null,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: '検出箇所の行番号とメソッド名を正しく指す',
    expected: null,
    custom: checkCallSiteIsLocated,
  },
  {
    name: '選択子を伴う形（$eval / $$eval）でも第二引数を走査できる',
    expected: null,
    custom: checkSelectorFormsAreScanned,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const detected = classifyInPageScript(testCase.script ?? '');
  if (detected !== testCase.expected) {
    return [`期待 ${testCase.expected ?? '検出しない'} に対し 実際 ${detected ?? '検出しない'}`];
  }
  return [];
}

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '捕捉しなければならない書き方', cases: MUST_DETECT },
    { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '返り値が消費されるか（呼び出し側の構造）', cases: CONSUMPTION },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 画面内自前判定 検出規則 自己検査 (scripts/check-e2e-in-page-selfjudgement.selftest.ts)'
  );
  let failed = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      const failures = runCase(testCase);
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
  if (total === 0) {
    console.log('\n❌ 確認項目が 0 件です。自己検査が空振りしています。');
    process.exit(1);
  }
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
}

main();
