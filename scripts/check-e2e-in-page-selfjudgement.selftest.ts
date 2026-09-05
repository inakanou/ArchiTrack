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

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

interface Case {
  /** 何を確かめるか */
  name: string;
  /**
   * 対照の極性（タスク 115.252）
   *
   * 陽性（検出されなければならない書き方）と陰性（検出してはならない書き方）の**両方**が
   * 残っていることを `guardControlsArePresent()` が確かめるための属性。**名前の綴りからも、
   * 変数名からも導かない**（115.247 の作法）。機構の確認（`STRUCTURAL`）は極性を持たない。
   */
  polarity?: 'positive' | 'negative';
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
    polarity: 'positive',
    script: `() => {
      // ストレージ警告を表示するためのUIコンポーネントまたはロジックが存在するか確認
      return true; // 実装が存在することを前提
    }`,
    expected: 'R1-literal-only',
  },
  {
    name: '容量超過の判定を自前で書き起こして自らに主張する',
    polarity: 'positive',
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
    polarity: 'positive',
    script: `() => {
      const testSecurityError = { code: 18, name: 'SecurityError' };
      return { detectsCode18: testSecurityError.code === 18 };
    }`,
    expected: 'R1-literal-only',
  },
  {
    name: 'クロスブラウザ判定の述語を自前で定義して自らに適用する',
    polarity: 'positive',
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
    polarity: 'positive',
    script: `function () { return true; }`,
    expected: 'R1-literal-only',
  },
  {
    name: 'async で書いた形も同じく捕捉する',
    polarity: 'positive',
    script: `async () => { return 1 === 1; }`,
    expected: 'R1-literal-only',
  },
  {
    name: '自分で書いた鍵を変数経由で読み返す（LRU削除の検証と称していた形）',
    polarity: 'positive',
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
    polarity: 'positive',
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
    polarity: 'negative',
    script: `(el) => (el as HTMLElement).style.transform`,
    expected: null,
  },
  {
    name: '画面の要素を数える形',
    polarity: 'negative',
    script: `() => document.querySelectorAll('img').length`,
    expected: null,
  },
  {
    name: '本番が画面へ置いた目印を読む形',
    polarity: 'negative',
    script: `() => {
      const c = globalThis.__fabricCanvas;
      return c ? c.getObjects().length : -1;
    }`,
    expected: null,
  },
  {
    name: '本番が書いた鍵を読む形（自分では書かない）',
    polarity: 'negative',
    script: `() => localStorage.getItem('accessToken')`,
    expected: null,
  },
  {
    name: '鍵を引数で受け取って読む補助',
    polarity: 'negative',
    script: `(k) => localStorage.getItem(k)`,
    expected: null,
  },
  {
    name: '前提を積むだけで読み返さない形（書き込みのみ）',
    polarity: 'negative',
    script: `({ prefix, total }) => {
      for (let i = 0; i < total; i++) {
        localStorage.setItem(\`\${prefix}stale-\${i}\`, '{}');
      }
    }`,
    expected: null,
  },
  {
    name: 'ブラウザにしか無い構築子を使う形',
    polarity: 'negative',
    script: `() => new DataTransfer()`,
    expected: null,
  },
  {
    name: '記憶領域の失敗を注入する形（本番の判定は本番が行う）',
    polarity: 'negative',
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
/**
 * 見本の一覧を検出器へ通し、検出の有無が求めたとおりであることを確かめる。
 *
 * **素材が空なら以下の照合は一度も回らず、この確認は何も主張しない**（AI運用7原則 第3原則。
 * タスク 115.252 の是正。指摘 (2)）。本ファイルの確認は実引数へ配列リテラルを直書きして
 * この関数を呼ぶ形が大半で、その配列を空にすると `for` の本体が一度も走らない。
 * 素材の外側に在るこの入口で空を拒み、呼び出す全箇所へ一度に効かせる。
 */
function checkConsumption(
  cases: ReadonlyArray<{ label: string; snippet: string }>,
  mustDetect: boolean
): string[] {
  const failures: string[] = [];
  if (cases.length === 0) {
    failures.push('素材 cases が空です（この確認が空振りしています）');
  }
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

interface Group {
  readonly title: string;
  readonly cases: readonly Case[];
}

/**
 * 陽性対照・陰性対照の件数の下限（タスク 115.252）
 *
 * 2026-09-03 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/list-control-polarity-floors.ts` が出す値をそのまま置く。
 *
 * **総数の下限だけでは片側の消失を捕まえられない。** 陽性対照を削って同じ数だけ陰性対照を
 * 足せば総数は動かないため、極性ごとに別の下限を貼る。極性は要素の宣言（`expected` ないし
 * `polarity`）から導き、**名前の綴りからは導かない**（115.247 の作法）。
 */
const MINIMUM_POSITIVE_CONTROLS = 8;
const MINIMUM_NEGATIVE_CONTROLS = 8;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-03 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-e2e-in-page-selfjudgement.selftest.ts | tail -1` の出す値をそのまま
 * 置く。**確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い。** 本体 `check-e2e-in-page-selfjudgement.ts` の
 * `RuleId` は規則の識別子を列挙するが、陽性対照は一つの規則につき複数の書き方を持つため
 * 「規則の数」は下限にならない。導けないため件数で貼る。
 */
const MINIMUM_TOTAL_CASES = 27;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `MUST_DETECT` / `MUST_NOT_DETECT` / `CONSUMPTION` / `STRUCTURAL`
 * のいずれを空にしても `✅ N/N 件の確認に成功しました` を出して EXIT=0 になった
 * （それぞれ 19/19・19/19・21/21・22/22）。既存の `total === 0` の関門は**全部を空にした
 * ときにしか働かず、群ごとの消失は素通りする**。
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形（115.252 の候補3）は配列
 * ごと空にすると関門も一緒に消える。`main()` の中、確認の実行より前に、配列の外側から貼る。
 *
 * **限界（塞いでいないこと）**: 総数の下限は現況ちょうどのため 1 件でも削れば赤くなるが、
 * **削った分だけ別の群へ確認を足せば総数は動かない**。群ごとの下限は「空でないこと」までしか
 * 課せない（115.222 が陰性対照について書き残した限界と同じ形）。
 *
 * **もう一つの限界**: `main()` からこの関門の呼び出し自体を落とせば、関門は走らなくなる。
 * 呼び出しの直列性を構造で要求する形——115.242 が `check-design-path-references.selftest.ts`
 * に置いた「深さ 0・文の先頭・呼び出し直後の `;`」の三点——は、本タスクでは各ファイルへ
 * 展開していない。**塞がないことと、書かないことは別である**（115.242 の教訓）。
 */
function guardControlsArePresent(groups: readonly Group[]): void {
  const problems: string[] = [];

  if (groups.length === 0) {
    problems.push('対照群が一つも登録されていません（この自己検査は何も確かめていません）');
  }
  for (const group of groups) {
    if (group.cases.length === 0) {
      problems.push(`対照群「${group.title}」が空です（この群は何も確かめていません）`);
    }
  }

  // **極性の要求は宣言せず、無条件の規則と数で持つ（タスク 115.252。Critical #2 の一般形）。**
  // 群ごとに「必要な極性」を配列の属性で設定する形は、関門を配列リテラルで設定する形であり、
  // その配列を `[]` へ空化すれば要求ごと消える（115.252 の候補3 の自己隠蔽の変種）。
  //
  // **無条件の規則の定義域は群ではなく自己検査の全体に取る。** 実測（2026-09-03、リポジトリ
  // ルート）: 定義域を群に取って「極性を持つ要素がある群は陽性と陰性を各 1 件以上持つ」と
  // すると、`captured`/`not-captured` に分けた群は構成上どちらか一方の極性しか持たないため
  // 満たしようがなく、この形を当てた 9 ファイルのうち 7 ファイルが赤くなった。群の極性が
  // 均質であることは設計であって欠陥ではない。定義域を全体に上げれば規則は無条件のまま立つ。
  //
  // **片側が痩せる向きの変異は数で押さえる。** 数は空にできないため、配列リテラルを空化する
  // 変異作用素に対して構造的に免疫である（下限は現況ちょうど。余裕ゼロ）。
  const polarities = groups.flatMap((group) => group.cases.map((one) => one.polarity));
  if (polarities.some((one) => one !== undefined)) {
    if (!polarities.includes('positive')) {
      problems.push('陽性対照が 1 件もありません（検出器が何も検出しなくても緑になります）');
    }
    if (!polarities.includes('negative')) {
      problems.push('陰性対照が 1 件もありません（検出器が何にでも反応しても緑になります）');
    }
  }
  const positives = polarities.filter((one) => one === 'positive').length;
  const negatives = polarities.filter((one) => one === 'negative').length;
  if (positives < MINIMUM_POSITIVE_CONTROLS) {
    problems.push(
      `陽性対照が ${positives} 件しかありません（宣言の下限は ${MINIMUM_POSITIVE_CONTROLS} 件）。` +
        '陽性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }
  if (negatives < MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件しかありません（宣言の下限は ${MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '陰性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
    );
  }

  // 対照の現況を一行で印字する（タスク 115.252）。関門の判定に使うのと同じ変数から出す。
  // `npx tsx scripts/list-control-polarity-floors.ts` はこの行を読み、下限を貼り直すときの
  // 元の値にする。一覧の側で数え直さないのは、判定と一覧が別々の真実を持たないためである。
  // 本自己検査群が閉じている範囲と閉じていない範囲（三層の記録）は
  // `scripts/check-counterfactual-evidence.selftest.ts` の
  // 「本自己検査群が閉じている範囲と、閉じていない範囲」の節に正典を置く（タスク 115.252）。
  console.log(
    `📋 対照の現況: 陽性対照 ${positives}/${MINIMUM_POSITIVE_CONTROLS} ・ ` +
      `陰性対照 ${negatives}/${MINIMUM_NEGATIVE_CONTROLS} ・ ` +
      `総数 ${total}/${MINIMUM_TOTAL_CASES}（現況/宣言の下限）`
  );

  if (problems.length > 0) {
    console.log(
      '\n❌ 自己検査の対照群そのものが欠けています（この状態で出る「合格」は意味を持ちません）'
    );
    for (const problem of problems) console.log(`   - ${problem}`);
    process.exit(1);
  }
}

function main(): void {
  const groups: Group[] = [
    {
      title: '捕捉しなければならない書き方',
      cases: MUST_DETECT,
    },
    {
      title: '捕捉してはならない書き方（過検出）',
      cases: MUST_NOT_DETECT,
    },
    { title: '返り値が消費されるか（呼び出し側の構造）', cases: CONSUMPTION },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];
  guardControlsArePresent(groups);

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
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
