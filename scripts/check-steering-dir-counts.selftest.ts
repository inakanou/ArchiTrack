/**
 * @fileoverview steering の実体の件数の検査 判定器の自己検査（タスク 115.275）
 *
 * `scripts/check-steering-dir-counts.ts` の判定器が
 *   (1) **緩む向き**——実測日を伴わない実体の件数を取り逃がさないこと、
 *   (2) **狭まる向き**——実測日を添えた記述（規約 (a)）や、実体の件数でない数値を
 *       告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の中核は**是正前に実在した行**である。`注釈ツール（11ファイル）` と
 * `ビジネスロジック（59サービス）` と `（tasks.md のチェック項目245件すべて完了）` は
 * いずれもタスク 115.275 の着手時点で `.kiro/steering/structure.md` に在った実物であり、
 * 判定器を当てると 30 行が挙がった（コミット `b84137b9`、2026-09-05 に実測）。
 *
 * ## 対照群の母集団を空にする変異が赤くなること（AI運用7原則 第3原則）
 *
 * 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。
 * 何も主張していない状態であり、前提の崩壊として赤くする。前提の確認は配列への登録では
 * なく `reportPreconditions` の直列の手続きとして書き、`main` の冒頭で対照より先に走らせる。
 * 呼び出しごと外す経路は `checkPreconditionsAreWired` が塞ぎ、その守り手は `function check`
 * 宣言なので `structuralWiringFailures` が結線を強制する。相互に施錠される。
 *
 * ## 下限をどこに置くか（115.222 の判断を引き継ぐ）
 *
 *   - `STRUCTURAL`: 本ファイルが宣言する `function check*` を一つ残らず結線していること。
 *     検査を増減させれば下限も自動で追随する。**限界**: 語彙は行頭の `function check` という
 *     宣言の形から取るため、未結線の新しいアロー式検査（`const checkX = () => ...`）を足す
 *     場合だけ素通りする。本ファイルの検査関数は全て `function` 宣言で書くこと。
 *   - `MUST_DETECT` / `MUST_NOT_DETECT`: 本体側に下限を導ける語彙が無いため「空でないこと」
 *     に留める。**限界**: 件数を 1 件へ削る破壊は止まらない。根拠の無い件数を貼らないという
 *     115.222 の判断をそのまま引き継ぐ。**ただし陽性・陰性のどちらかが消えたら赤くする**
 *     下限は置く。片側だけの対照は判定器が恒真・恒偽に退化しても通ってしまうためである。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-dir-counts.selftest.ts
 *   npm run check:steering-dir-counts:selftest
 *
 * 判定器が壊れたまま本検査が「合格」を出す状態を防ぐため、押下前の関門と CI では
 * 本検査の前に走らせる。
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTIFACT_COUNT_UNITS,
  DETECTOR_POSITIVE_CONTROL,
  MEASUREMENT_DATE_PATTERN,
  TARGET_DOCUMENTS,
  buildCountPattern,
  decideExit,
  findDatelessCount,
  run,
} from './check-steering-dir-counts.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SELFTEST_PATH = fileURLToPath(import.meta.url);

/** リポジトリルート（本ファイルは scripts/ 直下に置かれる） */
const REPOSITORY_ROOT = path.resolve(path.dirname(SELFTEST_PATH), '..');

/** 取り逃がしてはならない書き方（緩む向きの対照）。中核は是正前に実在した行である */
const MUST_DETECT: { label: string; line: string }[] = [
  {
    label: '是正前の実物: ディレクトリ注記のファイル数',
    line: '│   │       ├── tools/               # 注釈ツール（11ファイル）',
  },
  {
    label: '是正前の実物: 下限表記のファイル数',
    line: '│   │   ├── estimate-request/        # 見積依頼コンポーネント（10+ファイル）',
  },
  {
    label: '是正前の実物: サービス数',
    line: '│   ├── services/          # ビジネスロジック（59サービス）',
  },
  {
    label: '是正前の実物: ルートファイル数を見出しで名乗る形',
    line: '**実装済みAPI（34ルートファイル）:**',
  },
  {
    label: '是正前の実物: スペックのタスク総数',
    line: '  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**（全46タスク完了）',
  },
  {
    label: '是正前の実物: tasks.md のチェック項目数',
    line: '  - 状態: **実装完了✅**（tasks.md のチェック項目245件すべて完了）',
  },
  {
    label: '全角数字で書いた件数',
    line: '│   ├── utils/             # ユーティリティ関数（２２ファイル）',
  },
  {
    label: '数値と単位語の間に空白がある形',
    line: '- カスタムフック（useMediaQuery 等 32 ファイル）',
  },
  {
    label: '実測日が年月だけで日を欠く形（規約 (a) を満たさない）',
    line: '- ルート定義（34ファイル。2026-09 に実測）',
  },
  {
    label: 'テスト区分の数',
    line: '- e2e/specs/ のテストカテゴリは 20区分である',
  },
];

/** 告発してはならない書き方（狭まる向きの対照） */
const MUST_NOT_DETECT: { label: string; line: string }[] = [
  {
    label: '規約 (a): 実測日を同じ行へ添えた件数',
    line: '- ルート定義は 37 ファイルである（2026-09-05 に実測。コミット `b84137b9`）',
  },
  {
    label: '規約 (b): 数値を落として数える手段を書いた形',
    line: '│   ├── routes/            # ルート定義（数える手段は `git ls-files backend/src/routes | wc -l`）',
  },
  {
    label: '実体の件数ではない単位語（種類）',
    line: '  - 内容: ステータス遷移管理（12種類のステータス）',
  },
  {
    label: '実体の件数ではない単位語（バリアント）',
    line: '│   ├── ErrorBoundary.stories.tsx  # Storybook ストーリー（5バリアント）',
  },
  {
    label: '数値が単位語の後ろへ来る言及（タスク番号）',
    line: '  見た目で区別できなかった（タスク 115.200）',
  },
  {
    label: '数値を含まないディレクトリ注記',
    line: '│   ├── contexts/          # Reactコンテキスト',
  },
  {
    label: '構造の記法（3行1セット）',
    line: '  - 内容: 3行1セット構造（見積金額・実行金額・業者金額）',
  },
  {
    label: 'ポート番号や文字数の制約',
    line: '  - subject: 小文字始まり、100文字以内、末尾にピリオド不要',
  },
];

interface Failure {
  scope: string;
  detail: string;
}

const failures: Failure[] = [];

function fail(scope: string, detail: string): void {
  failures.push({ scope, detail });
}

/** 前提の確認。母集団が空のまま緑で通る経路を塞ぐ（第3原則） */
function reportPreconditions(): void {
  if (MUST_DETECT.length === 0) {
    fail(
      'PRECONDITION',
      'MUST_DETECT が空です（陽性の対照が無いと判定器の恒偽を捕らえられません）'
    );
  }
  if (MUST_NOT_DETECT.length === 0) {
    fail(
      'PRECONDITION',
      'MUST_NOT_DETECT が空です（陰性の対照が無いと判定器の恒真を捕らえられません）'
    );
  }
  if ((ARTIFACT_COUNT_UNITS as readonly string[]).length === 0) {
    fail(
      'PRECONDITION',
      'ARTIFACT_COUNT_UNITS が空です（単位語が無ければ判定器は何も検出しません）'
    );
  }
  if ((TARGET_DOCUMENTS as readonly string[]).length === 0) {
    fail('PRECONDITION', 'TARGET_DOCUMENTS が空です（走査対象が無ければ検査は空回りします）');
  }
}

/** `reportPreconditions` の呼び出しごと外す経路を塞ぐ */
function checkPreconditionsAreWired(): void {
  const source = readFileSync(SELFTEST_PATH, 'utf8');
  const called = /^\s*reportPreconditions\(\);/m.test(source);
  if (!called) {
    fail('STRUCTURAL', '`reportPreconditions()` が呼ばれていません（前提の確認が外されています）');
  }
}

/** 本ファイルが宣言する検査関数がすべて main へ結線されていること */
function checkStructuralWiring(): void {
  const source = readFileSync(SELFTEST_PATH, 'utf8');
  const declared = [...source.matchAll(/^function (check[A-Za-z0-9_]*)\(/gm)].map((m) => m[1]);
  if (declared.length === 0) {
    fail(
      'STRUCTURAL',
      '`function check*` の宣言が一つも見つかりません（語彙の抽出が壊れています）'
    );
    return;
  }
  const mainBody = /function main\(\): void \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
  for (const name of declared) {
    if (!new RegExp(`\\b${name}\\(\\);`).test(mainBody)) {
      fail('STRUCTURAL', `\`${name}()\` が main へ結線されていません`);
    }
  }
}

/** 緩む向き: 実測日を伴わない実体の件数を取り逃がさない */
function checkMustDetect(): void {
  const pattern = buildCountPattern(ARTIFACT_COUNT_UNITS);
  for (const sample of MUST_DETECT) {
    if (findDatelessCount(sample.line, pattern) === undefined) {
      fail('MUST_DETECT', `取り逃がし: ${sample.label} — ${sample.line.trim().slice(0, 80)}`);
    }
  }
}

/** 狭まる向き: 規約を満たす記述や実体でない数値を告発しない */
function checkMustNotDetect(): void {
  const pattern = buildCountPattern(ARTIFACT_COUNT_UNITS);
  for (const sample of MUST_NOT_DETECT) {
    const hit = findDatelessCount(sample.line, pattern);
    if (hit !== undefined) {
      fail(
        'MUST_NOT_DETECT',
        `過検出: ${sample.label} — 掛かった綴り \`${hit.subject}\` / ${sample.line.trim().slice(0, 80)}`
      );
    }
  }
}

/** 実測日の形は `YYYY-MM-DD` に限る（年月だけの形を免除に使わせない） */
function checkDatePatternShape(): void {
  if (!MEASUREMENT_DATE_PATTERN.test('2026-09-05')) {
    fail('DATE_PATTERN', '`2026-09-05` が実測日として認識されません');
  }
  if (MEASUREMENT_DATE_PATTERN.test('2026-09')) {
    fail('DATE_PATTERN', '`2026-09`（日を欠く形）が実測日として認識されています');
  }
}

/** 走査対象が無い／空のとき、0 件の合格を合格にしない（第3原則） */
function checkVacuousRunsFail(): void {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'steering-dir-counts-'));
  try {
    // (1) 走査対象が実在しない
    const missing = run({ root: workspace });
    if (decideExit(missing).ok) {
      fail('VACUUM', '走査対象が一件も実在しないのに合格しました');
    }

    // (2) 対象は在るが単位語が空（判定器の恒偽）
    mkdirSync(path.join(workspace, '.kiro', 'steering'), { recursive: true });
    writeFileSync(
      path.join(workspace, '.kiro', 'steering', 'structure.md'),
      '# 見出し\n\n│   ├── utils/  # ユーティリティ関数（22ファイル）\n',
      'utf8'
    );
    const emptyUnits = run({ root: workspace, units: [] });
    if (decideExit(emptyUnits).ok) {
      fail('VACUUM', '単位語の一覧が空なのに合格しました（判定器の恒偽が素通りします）');
    }

    // (3) 対象も単位語も在るなら、その一行を検出する
    const detected = run({ root: workspace });
    if (detected.findings.length !== 1) {
      fail('VACUUM', `一行の実物を検出できませんでした（検出 ${detected.findings.length} 件）`);
    }
    if (decideExit(detected).ok) {
      fail('VACUUM', '検出が在るのに合格しました');
    }

    // (4) 実測日を添えると合格へ転じる（規約 (a) が効いていること）
    writeFileSync(
      path.join(workspace, '.kiro', 'steering', 'structure.md'),
      '# 見出し\n\n- ユーティリティ関数は 37 ファイル（2026-09-05 に実測）\n',
      'utf8'
    );
    const exempt = run({ root: workspace });
    if (!decideExit(exempt).ok) {
      fail('VACUUM', '実測日を添えた記述が合格しません（規約 (a) の免除が効いていません）');
    }
    if (exempt.exempted !== 1) {
      fail('VACUUM', `免除の件数が 1 ではありません（${exempt.exempted}）`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** 判定器の陽性の対照が本体側に残っていること */
function checkDetectorPositiveControl(): void {
  const pattern = buildCountPattern(ARTIFACT_COUNT_UNITS);
  if (findDatelessCount(DETECTOR_POSITIVE_CONTROL, pattern) === undefined) {
    fail('DETECTOR', '本体の陽性の対照 `DETECTOR_POSITIVE_CONTROL` が検出されません');
  }
}

/**
 * 走査対象の steering 文書の数（完全一致。タスク 115.276）
 *
 * `structure.md`（115.275）と `product.md`（115.276）の二件である。
 * **この定数はタスク 115.276 の判断の掛け金である**——走査範囲を狭めれば赤くなり、
 * 広げるときも定数の書き換えを伴うので差分に必ず現れる（115.262 / 115.271 / 115.273 の作法）。
 *
 * 入れなかった二文書の根拠は本体の冒頭「走査範囲」に実測がある
 * （`tech.md` は実体でない件数が 1 件掛かり、`development-discipline.md` は
 * 数値と実測日が別の行に分かれた散文が 10 行掛かる。コミット `079604bb`、2026-09-05 に実測）。
 */
const SCANNED_STEERING_DOCUMENTS = 2;

/** 走査対象の件数が宣言どおりであること（狭める向きの無言の縮小を塞ぐ） */
function checkScannedDocumentCount(): void {
  const declared = (TARGET_DOCUMENTS as readonly string[]).length;
  if (declared !== SCANNED_STEERING_DOCUMENTS) {
    fail(
      'SCOPE',
      `走査対象が ${declared} 件で、宣言した ${SCANNED_STEERING_DOCUMENTS} 件と一致しません` +
        '（SCANNED_STEERING_DOCUMENTS を見よ。範囲を動かす判断は実測とともに書くこと）'
    );
  }
  for (const required of ['.kiro/steering/structure.md', '.kiro/steering/product.md']) {
    if (!(TARGET_DOCUMENTS as readonly string[]).includes(required)) {
      fail('SCOPE', `${required} が走査対象から外れています`);
    }
  }
}

/**
 * 規約 (b) へ移した記述が本当に免除ではなく「掛からない」こと（タスク 115.276）
 *
 * 規約 (a)（実測日を添える）は免除として数えられるが、規約 (b)（数値を落として数える手段を
 * 書く）は**数値そのものが消える**ため判定の入口に入らない。両者を取り違えると、
 * 数値が残ったまま緑になる経路を見落とす。是正後の `product.md` の当該行を逐語で当てる。
 */
function checkRegimeBLineIsNotMerelyExempted(): void {
  const pattern = buildCountPattern(ARTIFACT_COUNT_UNITS);
  const document = path.join(REPOSITORY_ROOT, '.kiro/steering/product.md');
  const lines = readFileSync(document, 'utf8')
    .split('\n')
    .filter((raw) => raw.includes('コンポーネントドキュメント') && raw.includes('Storybook'));
  if (lines.length !== 1) {
    fail('REGIME_B', `product.md の Storybook の記述が ${lines.length} 行あります（1 行を期待）`);
    return;
  }
  const line = lines[0] ?? '';
  if (pattern.test(line)) {
    fail('REGIME_B', `規約 (b) へ移した行に「数値 + 単位語」が残っています: ${line.slice(0, 90)}`);
  }
  if (!line.includes('git ls-files')) {
    fail('REGIME_B', '規約 (b) の数える手段が当該行から失われています');
  }
  const reverted = line.replace('ストーリーファイルの数は', '141ストーリーファイル、数は');
  if (findDatelessCount(reverted, pattern) === undefined) {
    fail(
      'REGIME_B',
      '是正前の綴り（`141ストーリーファイル`）が検出されません（陽性の対照が死んでいます）'
    );
  }
}

/** 本番の走査対象が実在すること（対象を消して緑にする経路を塞ぐ） */
function checkRealTargetExists(): void {
  const result = run();
  if (result.scannedFiles.length !== TARGET_DOCUMENTS.length) {
    fail(
      'REAL_TARGET',
      `宣言した走査対象 ${TARGET_DOCUMENTS.length} 件のうち ${result.scannedFiles.length} 件しか実在しません`
    );
  }
  if (result.scannedLines === 0) {
    fail('REAL_TARGET', '本番の走査対象を読んだのに照合した行が0行です');
  }
}

function main(): void {
  reportPreconditions();
  checkPreconditionsAreWired();
  checkStructuralWiring();
  checkMustDetect();
  checkMustNotDetect();
  checkDatePatternShape();
  checkVacuousRunsFail();
  checkDetectorPositiveControl();
  checkScannedDocumentCount();
  checkRegimeBLineIsNotMerelyExempted();
  checkRealTargetExists();

  const total = MUST_DETECT.length + MUST_NOT_DETECT.length;
  if (failures.length === 0) {
    console.log(
      `✅ steering 実体件数 判定器の自己検査に合格しました` +
        `（陽性 ${MUST_DETECT.length} 件 / 陰性 ${MUST_NOT_DETECT.length} 件 / 対照 ${total} 件）`
    );
    // 失敗既定（module の頂）をここで解除する
    process.exitCode = 0;
    return;
  }

  console.error('❌ steering 実体件数 判定器の自己検査に失敗しました');
  console.error('');
  for (const failure of failures) {
    console.error(`   [${failure.scope}] ${failure.detail}`);
  }
  console.error('');
  console.error(`   合計 ${failures.length} 件 / 対照 ${total} 件`);
  process.exit(1);
}

main();
