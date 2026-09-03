/**
 * @fileoverview 追跡表の網羅検査（`scripts/check-traceability-coverage.ts`）の自己検査
 *
 * 本検査は「宣言と食い違わないこと」を求める形であるため、**検出規則が壊れると自明に緑を出す**。
 * 追跡表の本文行を 1 行も拾えなければ全受入基準が欠落として挙がり——それは赤くなるが——逆に
 * 受入基準の側を 1 件も拾えなければ欠落は 0 件になり、`exact` の宣言だけが「置き去り」として
 * 落ちる。**母集団が空のまま通る経路を残さないこと**が本自己検査の主目的である
 * （AI運用7原則 第3原則。タスク 115.222 の作法）。
 *
 * **宣言の上限に遊びが無いことも本自己検査が持つ**（タスク 115.262）。`ratchet` の上限を
 * 先回りで緩める書き換えは、その幅ぶんの新たな悪化を無言で吸収する。判定の群に遊びを禁じる
 * 陽性対照を三つ置き、実データの群では `construction-photo` の上限を実測 +55 件へ上げる変異を
 * 実際に当てて赤くなることを確かめる（是正前は同じ変異で本検査も自己検査も緑のままだった。
 * 2026-09-04 にコミット `1a673496` の作業ツリーで実測。本検査 EXIT=0 / 自己検査 32/32 件成功）。
 * 締める向き——実測が減ったときに上限を同じ値まで下げる形——は陰性対照で通ることを固定する。
 *
 * 併せて**被検体の同一性**を固定する（タスク 115.227 の作法）。本検査が実際に走らせる既定の
 * 対象（`discoverFeatureNames()` × `FEATURE_POLICIES`）と、自己検査が確かめる対象が同じもので
 * あることを、双方向の一致として書く。片方向だけだと、機能が増えたときに黙って検査の外へ落ちる。
 *
 * 使用方法:
 *   npx tsx scripts/check-traceability-coverage.selftest.ts
 *   npm run check:trace-coverage:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、pre-push では本検査の前に走らせる。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverFeatureNames } from './requirement-document';
import {
  DESIGN_DOCUMENT_BASENAME,
  FEATURE_POLICIES,
  TRACEABILITY_TABLE_HEADER,
  expandRequirementColumn,
  extractTraceabilityRows,
  judge,
  measureFeature,
  type FeaturePolicy,
} from './check-traceability-coverage';

const REPOSITORY_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** 合成の機能を一つ置いた根を作る */
function makeSyntheticRoot(
  features: Readonly<Record<string, { requirements: string; design?: string }>>
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-coverage-selftest-'));
  for (const [feature, documents] of Object.entries(features)) {
    const dir = path.join(root, '.kiro/specs', feature);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'requirements.md'), documents.requirements, 'utf8');
    if (documents.design !== undefined) {
      fs.writeFileSync(path.join(dir, DESIGN_DOCUMENT_BASENAME), documents.design, 'utf8');
    }
  }
  return root;
}

function removeRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** 受入基準を並べた要件定義書を組み立てる */
function requirementsDocument(
  requirements: readonly { number: string; criteria: readonly string[] }[]
): string {
  // 素材が空だと要件定義書は見出しだけになり、以下の照合は分母を失う（第3原則。115.252）
  if (requirements.length === 0) {
    throw new Error('合成素材 requirements が空です（この確認が空振りしています）');
  }
  const lines: string[] = ['# 要件定義書', ''];
  for (const requirement of requirements) {
    lines.push(`### Requirement ${requirement.number}: 題`, '', '#### Acceptance Criteria');
    requirement.criteria.forEach((text, index) => lines.push(`${index + 1}. ${text}`));
    lines.push('');
  }
  return lines.join('\n');
}

/** 追跡表を一つ持つ設計文書を組み立てる */
function designDocument(rows: readonly string[]): string {
  // 素材が空だと追跡表は表頭だけになり、被覆の主張は台を失う（第3原則。115.252）
  if (rows.length === 0) {
    throw new Error('合成素材 rows が空です（この確認が空振りしています）');
  }
  return [
    '# 設計',
    '',
    '## Requirements Traceability',
    '',
    '| Requirement | Summary | Components | Interfaces | Flows |',
    '|-------------|---------|------------|------------|-------|',
    ...rows,
    '',
    '本文の続き。',
    '',
  ].join('\n');
}

interface TestCase {
  readonly name: string;
  /**
   * 対照の極性（タスク 115.252）
   *
   * 陽性（検出器が挙げなければならない側）と陰性（挙げてはならない側）の**両方**が残って
   * いることを `guardControlsArePresent()` が群ごとに確かめるための属性。**名前の綴りから
   * 導かない**（115.247 の作法）。極性を持たない機構の確認では省く。
   */
  readonly polarity?: 'positive' | 'negative';
  run(): string[];
}

interface TestGroup {
  readonly title: string;
  readonly cases: readonly TestCase[];
}

function expect(condition: boolean, message: string): string[] {
  return condition ? [] : [message];
}

// ---------------------------------------------------------------------------
// (1) 検出規則: Requirement 列の読み方
// ---------------------------------------------------------------------------

const DETECTION: TestCase[] = [
  {
    name: '単独の番号を拾う',
    run() {
      const { covered, unparsed } = expandRequirementColumn(['| 4.14 | 要約 | X | - | - |']);
      return [
        ...expect(covered.has('REQ-4.14'), 'REQ-4.14 を拾えていない'),
        ...expect(unparsed.length === 0, `読めない表記が出た: ${unparsed.join(', ')}`),
      ];
    },
  },
  {
    name: '範囲を両端込みで展開する',
    run() {
      const { covered } = expandRequirementColumn(['| 4.1-4.6 | 要約 | X | - | - |']);
      const failures: string[] = [];
      for (let number = 1; number <= 6; number++) {
        failures.push(
          ...expect(covered.has(`REQ-4.${number}`), `REQ-4.${number} を展開していない`)
        );
      }
      failures.push(...expect(!covered.has('REQ-4.7'), '範囲の外の REQ-4.7 を拾っている'));
      failures.push(...expect(covered.size === 6, `展開した件数が 6 でない: ${covered.size}`));
      return failures;
    },
  },
  {
    name: '右端が二桁の範囲を辞書順で切らない（32.9-32.10）',
    run() {
      const { covered } = expandRequirementColumn(['| 32.9-32.10 | 要約 | X | - | - |']);
      return [
        ...expect(covered.has('REQ-32.9'), 'REQ-32.9 を展開していない'),
        ...expect(covered.has('REQ-32.10'), 'REQ-32.10 を展開していない'),
        ...expect(covered.size === 2, `展開した件数が 2 でない: ${covered.size}`),
      ];
    },
  },
  {
    name: '全角の波ダッシュも範囲として読む（10.3〜10.6）',
    run() {
      const { covered, unparsed } = expandRequirementColumn(['| 10.3〜10.6 | 要約 | X | - | - |']);
      return [
        ...expect(covered.size === 4, `展開した件数が 4 でない: ${covered.size}`),
        ...expect(unparsed.length === 0, `読めない表記が出た: ${unparsed.join(', ')}`),
      ];
    },
  },
  {
    name: '列挙と範囲の混在を読む（4.1-4.6, 4.9, 4.14）',
    run() {
      const { covered } = expandRequirementColumn(['| 4.1-4.6, 4.9, 4.14 | 要約 | X | - | - |']);
      return [
        ...expect(covered.has('REQ-4.9'), 'REQ-4.9 を拾えていない'),
        ...expect(covered.has('REQ-4.14'), 'REQ-4.14 を拾えていない'),
        ...expect(!covered.has('REQ-4.7'), '書かれていない REQ-4.7 を拾っている'),
        ...expect(covered.size === 8, `展開した件数が 8 でない: ${covered.size}`),
      ];
    },
  },
  {
    name: '強調記号とバッククォートを装飾として剥がす',
    run() {
      const { covered, unparsed } = expandRequirementColumn([
        '| **4.7** | 要約 | X | - | - |',
        '| `4.8` | 要約 | X | - | - |',
      ]);
      return [
        ...expect(covered.has('REQ-4.7'), '強調記号付きの REQ-4.7 を拾えていない'),
        ...expect(covered.has('REQ-4.8'), 'バッククォート付きの REQ-4.8 を拾えていない'),
        ...expect(unparsed.length === 0, `読めない表記が出た: ${unparsed.join(', ')}`),
      ];
    },
  },
  {
    name: '英字付きの要件番号を読む（27A.3）',
    run() {
      const { covered } = expandRequirementColumn(['| 27A.3 | 要約 | X | - | - |']);
      return expect(covered.has('REQ-27A.3'), 'REQ-27A.3 を拾えていない');
    },
  },
  {
    name: '読めない表記を黙って捨てない',
    run() {
      const { covered, unparsed } = expandRequirementColumn([
        '| 17.x | 要約 | X | - | - |',
        '| 4.1a | 要約 | X | - | - |',
        '| 1.3.1 | 要約 | X | - | - |',
        '| 5 | 要約 | X | - | - |',
      ]);
      return [
        ...expect(unparsed.length === 4, `読めない表記が 4 件でない: ${unparsed.length}`),
        ...expect(
          covered.size === 0,
          `読めない表記から番号を作っている: ${[...covered].join(', ')}`
        ),
      ];
    },
  },
  {
    name: '要件をまたぐ範囲と逆順の範囲は読めない表記に積む',
    run() {
      const { covered, unparsed } = expandRequirementColumn([
        '| 4.5-5.2 | 要約 | X | - | - |',
        '| 4.6-4.2 | 要約 | X | - | - |',
      ]);
      return [
        ...expect(unparsed.length === 2, `読めない表記が 2 件でない: ${unparsed.length}`),
        ...expect(covered.size === 0, `不正な範囲を展開している: ${[...covered].join(', ')}`),
      ];
    },
  },
  {
    name: '空欄と `-` は読めない表記に数えない',
    run() {
      // 陰性の合成素材。**空にすると `unparsed` も `covered` も必ず空になり、この確認は
      // 「何も入れなければ何も出ない」を言うだけの真空パスになる**（第3原則。115.252）
      const blankColumnRows = ['|  | 要約 | X | - | - |', '| - | 要約 | X | - | - |'];
      const { covered, unparsed } = expandRequirementColumn(blankColumnRows);
      return [
        ...expect(
          blankColumnRows.length > 0,
          '合成素材 blankColumnRows が空です（この確認が空振りしています）'
        ),
        ...expect(unparsed.length === 0, `読めない表記が出た: ${unparsed.join(', ')}`),
        ...expect(covered.size === 0, '空欄から番号を作っている'),
      ];
    },
  },
  {
    name: '表頭の 2 行下から `|` で始まらない行の直前までを本文行とする',
    run() {
      const design = designDocument(['| 1.1 | a | X | - | - |', '| 1.2 | b | Y | - | - |']);
      const { tables, rows } = extractTraceabilityRows(design);
      return [
        ...expect(tables === 1, `表の数が 1 でない: ${tables}`),
        ...expect(rows.length === 2, `本文行が 2 行でない: ${rows.length}`),
        ...expect(
          rows.every((row) => !row.includes('---')),
          '区切り行を本文行に数えている'
        ),
      ];
    },
  },
  {
    name: '表が複数あればすべての本文行を集める',
    run() {
      const design = `${designDocument(['| 1.1 | a | X | - | - |'])}\n${designDocument([
        '| 2.1 | b | Y | - | - |',
        '| 2.2 | c | Z | - | - |',
      ])}`;
      const { tables, rows } = extractTraceabilityRows(design);
      return [
        ...expect(tables === 2, `表の数が 2 でない: ${tables}`),
        ...expect(rows.length === 3, `本文行が 3 行でない: ${rows.length}`),
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// (2) 母集団が空なら失敗する（AI運用7原則 第3原則 / タスク 115.222 の作法）
// ---------------------------------------------------------------------------

const NON_VACUITY: TestCase[] = [
  {
    name: '機能が 0 件なら失敗する',
    run() {
      const root = makeSyntheticRoot({});
      try {
        const { failures } = judge(root, FEATURE_POLICIES, []);
        return expect(
          failures.some((failure) => failure.includes('機能が 1 件も見つかりません')),
          `空の母集団が通ってしまう: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '方針の宣言が空なら失敗する',
    run() {
      const root = makeSyntheticRoot({
        f: { requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]) },
      });
      try {
        const { failures } = judgeNamed(root, {}, ['f']);
        return expect(
          failures.some((failure) => failure.includes('方針の宣言が空です')),
          `空の宣言が通ってしまう: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '現役の受入基準が 0 件なら失敗する',
    run() {
      const root = makeSyntheticRoot({
        f: {
          // 全件が取り消し線で撤廃されている＝分母が空
          requirements: requirementsDocument([{ number: '1', criteria: ['~~撤廃~~'] }]),
          design: designDocument(['| 1.1 | a | X | - | - |']),
        },
      });
      const policies: Record<string, FeaturePolicy> = {
        f: { mode: 'ratchet', maxMissing: 0, maxOrphans: 99, maxUnparsed: 0, reason: 'test' },
      };
      try {
        const { failures } = judgeNamed(root, policies, ['f']);
        return expect(
          failures.some((failure) => failure.includes('現役の受入基準が 0 件です')),
          `分母が空でも通ってしまう: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '追跡表の本文行が 0 行なら失敗する（走査の空振りを検知する）',
    run() {
      const root = makeSyntheticRoot({
        f: {
          requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]),
          design: '# 設計\n\n表は無い。\n',
        },
      });
      const policies: Record<string, FeaturePolicy> = {
        f: { mode: 'ratchet', maxMissing: 99, maxOrphans: 0, maxUnparsed: 0, reason: 'test' },
      };
      try {
        const { failures } = judgeNamed(root, policies, ['f']);
        return expect(
          failures.some((failure) => failure.includes('追跡表の本文行が 0 行です')),
          `本文行が 0 行でも通ってしまう: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '本文行 0 行は allowNoTraceabilityTable の宣言があるときだけ許される',
    run() {
      const root = makeSyntheticRoot({
        f: {
          requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]),
          design: '# 設計\n\n表は無い。\n',
        },
      });
      const policies: Record<string, FeaturePolicy> = {
        f: {
          mode: 'ratchet',
          maxMissing: 1,
          maxOrphans: 0,
          maxUnparsed: 0,
          allowNoTraceabilityTable: true,
          reason: 'test',
        },
      };
      try {
        const { failures } = judgeNamed(root, policies, ['f']);
        return expect(failures.length === 0, `許可があるのに落ちた: ${JSON.stringify(failures)}`);
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '表が在るのに allowNoTraceabilityTable を宣言していれば失敗する（宣言の置き去り）',
    run() {
      const root = makeSyntheticRoot({
        f: {
          requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]),
          design: designDocument(['| 1.1 | a | X | - | - |']),
        },
      });
      const policies: Record<string, FeaturePolicy> = {
        f: {
          mode: 'ratchet',
          maxMissing: 0,
          maxOrphans: 0,
          maxUnparsed: 0,
          allowNoTraceabilityTable: true,
          reason: 'test',
        },
      };
      try {
        const { failures } = judgeNamed(root, policies, ['f']);
        return expect(
          failures.some((failure) => failure.includes('allowNoTraceabilityTable を宣言しています')),
          `置き去りの宣言が通ってしまう: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// (3) 宣言と対象の双方向の一致（タスク 115.227 の作法）
// ---------------------------------------------------------------------------

const SUBJECT_IDENTITY: TestCase[] = [
  {
    name: '実在するが宣言に無い機能があれば失敗する',
    run() {
      const root = makeSyntheticRoot({
        declared: {
          requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]),
          design: designDocument(['| 1.1 | a | X | - | - |']),
        },
        undeclared: {
          requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]),
          design: designDocument(['| 1.1 | a | X | - | - |']),
        },
      });
      const policies: Record<string, FeaturePolicy> = {
        declared: { mode: 'ratchet', maxMissing: 0, maxOrphans: 0, maxUnparsed: 0, reason: 't' },
      };
      try {
        const { failures } = judgeNamed(root, policies, discoverFeatureNames(root));
        return expect(
          failures.some((failure) => failure.includes('undeclared が FEATURE_POLICIES に宣言')),
          `未宣言の機能が黙って検査の外へ落ちる: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '宣言にあって実在しない機能があれば失敗する',
    run() {
      const root = makeSyntheticRoot({
        alive: {
          requirements: requirementsDocument([{ number: '1', criteria: ['a'] }]),
          design: designDocument(['| 1.1 | a | X | - | - |']),
        },
      });
      const policies: Record<string, FeaturePolicy> = {
        alive: { mode: 'ratchet', maxMissing: 0, maxOrphans: 0, maxUnparsed: 0, reason: 't' },
        gone: { mode: 'ratchet', maxMissing: 0, maxOrphans: 0, maxUnparsed: 0, reason: 't' },
      };
      try {
        const { failures } = judgeNamed(root, policies, discoverFeatureNames(root));
        return expect(
          failures.some((failure) => failure.includes('gone が .kiro/specs/ に実在しません')),
          `宣言が対象より長生きしても通る: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: 'FEATURE_POLICIES の鍵が実データの機能名と双方向に一致する',
    run() {
      const discovered = discoverFeatureNames(REPOSITORY_ROOT);
      const declared = Object.keys(FEATURE_POLICIES);
      const missingDeclarations = discovered.filter((name) => !declared.includes(name));
      const staleDeclarations = declared.filter((name) => !discovered.includes(name));
      return [
        ...expect(discovered.length > 0, '実データの機能が 0 件（走査が空振りしている）'),
        ...expect(
          missingDeclarations.length === 0,
          `宣言の無い機能: ${missingDeclarations.join(', ')}`
        ),
        ...expect(
          staleDeclarations.length === 0,
          `実在しない宣言: ${staleDeclarations.join(', ')}`
        ),
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// (4) 判定の型（exact / ratchet）
// ---------------------------------------------------------------------------

/**
 * 一つの機能だけを組み立てて判定へ通す（AI運用7原則 第3原則。タスク 115.252 の是正。指摘 (2)）
 *
 * **素材が空なら判定へ通さず止める。** `JUDGEMENT` 群の確認はすべて実引数へ配列リテラルを
 * 直書きしてこの関数を呼ぶ形で、追跡表の行と受入基準の本文がそのまま判定の台である。
 * 台を空にすると、`failures.length === 0` を求める陰性側は入力が無いまま成立し、
 * 陽性側も別の失敗文言へ滑る。素材の外側に在るこの入口で空を拒む。
 */
function judgeOneFeature(
  rows: readonly string[],
  criteria: readonly string[],
  policy: FeaturePolicy
): string[] {
  if (rows.length === 0) {
    throw new Error('合成素材 rows が空です（この確認が空振りしています）');
  }
  if (criteria.length === 0) {
    throw new Error('合成素材 criteria が空です（この確認が空振りしています）');
  }
  const root = makeSyntheticRoot({
    f: {
      requirements: requirementsDocument([{ number: '1', criteria }]),
      design: designDocument(rows),
    },
  });
  try {
    return judgeNamed(root, { f: policy }, ['f']).failures;
  } finally {
    removeRoot(root);
  }
}

/**
 * 名指しした機能だけを判定へ通す（タスク 115.252 の是正。指摘 (2)）
 *
 * 名指しの一覧を空にすると判定は見る機能を失い、以下の照合は素材に依らず成立しうる。
 * **空を許す経路は「機能が 0 件なら失敗する」対照が直に `judge` を呼ぶ一本だけ**にして、
 * それ以外はこの入口を通す。
 */
function judgeNamed(
  root: string,
  policies: Record<string, FeaturePolicy>,
  names: readonly string[]
): { failures: string[] } {
  if (names.length === 0) {
    throw new Error('判定へ渡す機能名 names が空です（この確認が空振りしています）');
  }
  return judge(root, policies, [...names]);
}

const JUDGEMENT: TestCase[] = [
  {
    name: 'exact: 宣言と一致すれば通る',
    polarity: 'negative',
    run() {
      const failures = judgeOneFeature(['| 1.1 | a | X | - | - |'], ['a', 'b'], {
        mode: 'exact',
        missing: ['REQ-1.2'],
        orphans: [],
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(failures.length === 0, `一致しているのに落ちた: ${JSON.stringify(failures)}`);
    },
  },
  {
    name: 'exact: 宣言に無い新たな欠落があれば失敗する（4.14 の型）',
    polarity: 'positive',
    run() {
      const failures = judgeOneFeature(['| 1.1 | a | X | - | - |'], ['a', 'b', 'c'], {
        mode: 'exact',
        missing: ['REQ-1.2'],
        orphans: [],
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('REQ-1.3')),
        `新設した受入基準の漏れを見逃す: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'exact: 解消済みの欠落が宣言に残っていれば失敗する',
    polarity: 'positive',
    run() {
      const failures = judgeOneFeature(['| 1.1, 1.2 | a | X | - | - |'], ['a', 'b'], {
        mode: 'exact',
        missing: ['REQ-1.2'],
        orphans: [],
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('解消済みの欠落が宣言に残っています')),
        `置き去りの宣言が通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'exact: 現役でない番号を追跡表が挙げていれば失敗する',
    polarity: 'positive',
    run() {
      const failures = judgeOneFeature(['| 1.1, 1.9 | a | X | - | - |'], ['a'], {
        mode: 'exact',
        missing: [],
        orphans: [],
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('REQ-1.9')),
        `死語を見逃す: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'exact: 撤廃された受入基準は分母に入らず、表に残っていれば死語になる',
    polarity: 'positive',
    run() {
      const failures = judgeOneFeature(['| 1.1, 1.2 | a | X | - | - |'], ['a', '~~撤廃~~'], {
        mode: 'exact',
        missing: [],
        orphans: ['REQ-1.2'],
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        failures.length === 0,
        `撤廃の扱いが宣言と食い違う: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'exact: 読めない表記が宣言の上限を超えれば失敗する',
    polarity: 'positive',
    run() {
      const failures = judgeOneFeature(['| 1.1, 17.x | a | X | - | - |'], ['a'], {
        mode: 'exact',
        missing: [],
        orphans: [],
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('読めない表記')),
        `読めない表記を見逃す: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'ratchet: 上限が実測を上回れば失敗する（先回りの緩和を止める。タスク 115.262）',
    polarity: 'positive',
    run() {
      // 欠落は 1 件（`b` が追跡表に無い）。上限を 5 件と先回りで宣言した形。
      const failures = judgeOneFeature(['| 1.1 | a | X | - | - |'], ['a', 'b'], {
        mode: 'ratchet',
        maxMissing: 5,
        maxOrphans: 0,
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('遊び 4 件')),
        `上限を先回りで緩めても通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'ratchet: 死語・読めない表記の上限にも遊びを許さない（タスク 115.262）',
    polarity: 'positive',
    run() {
      // 死語 1 件（`1.9`）・読めない表記 1 件（`17.x`）に対し、上限を 3 件ずつ宣言した形。
      const failures = judgeOneFeature(['| 1.1, 1.9, 17.x | a | X | - | - |'], ['a'], {
        mode: 'ratchet',
        maxMissing: 0,
        maxOrphans: 3,
        maxUnparsed: 3,
        reason: 't',
      });
      return [
        ...expect(
          failures.some((f) => f.includes('現役でない番号の上限を 3 件')),
          `死語の上限の遊びを見逃す: ${JSON.stringify(failures)}`
        ),
        ...expect(
          failures.some((f) => f.includes('読めない表記の上限を 3 件')),
          `読めない表記の上限の遊びを見逃す: ${JSON.stringify(failures)}`
        ),
      ];
    },
  },
  {
    name: 'ratchet: 網羅が前進したとき上限を実測へ下げれば通る（締める向きを妨げない）',
    polarity: 'negative',
    run() {
      // 追跡表が `1.1, 1.2` を挙げ受入基準は 2 件——欠落 0 件。上限を 0 へ下げた宣言は通る。
      const rows = ['| 1.1, 1.2 | a | X | - | - |'];
      const tightened = judgeOneFeature(rows, ['a', 'b'], {
        mode: 'ratchet',
        maxMissing: 0,
        maxOrphans: 0,
        maxUnparsed: 0,
        reason: 't',
      });
      return expect(
        tightened.length === 0,
        `上限を締める向きが妨げられている: ${JSON.stringify(tightened)}`
      );
    },
  },
  {
    name: 'exact: 読めない表記の上限に遊びがあれば失敗する（タスク 115.262）',
    polarity: 'positive',
    run() {
      // 読めない表記は 0 件。`exact` の側でも上限を先回りで 9 件へ緩める経路を塞ぐ。
      const failures = judgeOneFeature(['| 1.1 | a | X | - | - |'], ['a'], {
        mode: 'exact',
        missing: [],
        orphans: [],
        maxUnparsed: 9,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('遊び 9 件')),
        `exact の maxUnparsed を先回りで緩めても通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'ratchet: 上限以下なら通り、超えれば失敗する',
    polarity: 'negative',
    run() {
      const rows = ['| 1.1 | a | X | - | - |'];
      const withinLimit = judgeOneFeature(rows, ['a', 'b'], {
        mode: 'ratchet',
        maxMissing: 1,
        maxOrphans: 0,
        maxUnparsed: 0,
        reason: 't',
      });
      const overLimit = judgeOneFeature(rows, ['a', 'b', 'c'], {
        mode: 'ratchet',
        maxMissing: 1,
        maxOrphans: 0,
        maxUnparsed: 0,
        reason: 't',
      });
      return [
        ...expect(withinLimit.length === 0, `上限以下で落ちた: ${JSON.stringify(withinLimit)}`),
        ...expect(overLimit.length > 0, '上限を超えても通ってしまう'),
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// (5) 実データの対照（本検査が実際に見ている対象で空振りしていないこと）
// ---------------------------------------------------------------------------

const REAL_DATA: TestCase[] = [
  {
    name: '表頭の正規表現が実データの設計文書に当たっている',
    polarity: 'negative',
    run() {
      const failures: string[] = [];
      let featuresWithTables = 0;
      let totalRows = 0;
      for (const feature of discoverFeatureNames(REPOSITORY_ROOT)) {
        const designPath = path.join(
          REPOSITORY_ROOT,
          '.kiro/specs',
          feature,
          DESIGN_DOCUMENT_BASENAME
        );
        if (!fs.existsSync(designPath)) continue;
        const { tables, rows } = extractTraceabilityRows(fs.readFileSync(designPath, 'utf8'));
        if (tables > 0) featuresWithTables += 1;
        totalRows += rows.length;
      }
      failures.push(
        ...expect(
          featuresWithTables > 0,
          '追跡表を持つ機能が 0 件（表頭の正規表現が当たっていない）'
        )
      );
      failures.push(...expect(totalRows > 0, '追跡表の本文行が 0 行（走査が空振りしている）'));
      return failures;
    },
  },
  {
    name: '表頭の正規表現を壊すと実データの本文行が 0 行になる（この対照が空振りでないこと）',
    run() {
      // 表頭の判定が「たまたま何にでも当たる」形でないことを、当てて確かめる。
      const broken = /^\| *Requirement \| *Summary \| *Componentz \|/;
      const designPath = path.join(
        REPOSITORY_ROOT,
        '.kiro/specs/site-survey',
        DESIGN_DOCUMENT_BASENAME
      );
      const content = fs.readFileSync(designPath, 'utf8');
      const matched = content.split('\n').filter((line) => TRACEABILITY_TABLE_HEADER.test(line));
      const brokenMatched = content.split('\n').filter((line) => broken.test(line));
      return [
        ...expect(matched.length > 0, 'site-survey の design.md で表頭に当たっていない'),
        ...expect(brokenMatched.length === 0, '綴りを崩した正規表現でも当たってしまう'),
      ];
    },
  },
  {
    name: 'site-survey の追跡表から 4.14 を落とすと欠落として挙がる（陽性対照）',
    polarity: 'positive',
    run() {
      const designPath = path.join(
        REPOSITORY_ROOT,
        '.kiro/specs/site-survey',
        DESIGN_DOCUMENT_BASENAME
      );
      const requirementsPath = path.join(
        REPOSITORY_ROOT,
        '.kiro/specs/site-survey/requirements.md'
      );
      const design = fs.readFileSync(designPath, 'utf8');
      const before = '| 4.1-4.6, 4.9, 4.14 |';
      const after = '| 4.1-4.6, 4.9 |';
      if (!design.includes(before)) {
        return [`site-survey の追跡表に \`${before}\` の行が見つからない（陽性対照が空振り）`];
      }
      const root = makeSyntheticRoot({
        'site-survey': {
          requirements: fs.readFileSync(requirementsPath, 'utf8'),
          design: design.replace(before, after),
        },
      });
      try {
        const measurement = measureFeature(root, 'site-survey');
        return [
          ...expect(
            measurement.missing.includes('REQ-4.14'),
            `4.14 を落としても欠落に挙がらない: ${measurement.missing.length} 件`
          ),
          ...expect(
            measurement.rows > 0,
            `合成の根で本文行が 0 行（対照が空振り）: ${measurement.rows}`
          ),
        ];
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '実データの ratchet の上限は遊び 0 であり、上げると赤くなる（陽性対照。タスク 115.262）',
    polarity: 'positive',
    run() {
      const features = discoverFeatureNames(REPOSITORY_ROOT);
      const failures: string[] = [];

      // (1) 現況の宣言が実測ちょうどであること。本関門は現況を一つも動かさずに成立する。
      let ratchetFeatures = 0;
      for (const feature of features) {
        const policy = FEATURE_POLICIES[feature];
        if (policy === undefined || policy.mode !== 'ratchet') continue;
        ratchetFeatures += 1;
        const measurement = measureFeature(REPOSITORY_ROOT, feature);
        failures.push(
          ...expect(
            policy.maxMissing === measurement.missing.length &&
              policy.maxOrphans === measurement.orphans.length &&
              policy.maxUnparsed === measurement.unparsed.length,
            `${feature}: 宣言の上限に遊びがある` +
              `（宣言 ${policy.maxMissing}/${policy.maxOrphans}/${policy.maxUnparsed} ・ ` +
              `実測 ${measurement.missing.length}/${measurement.orphans.length}/${measurement.unparsed.length}）`
          )
        );
      }
      failures.push(
        ...expect(ratchetFeatures > 0, 'ratchet の機能が 0 件（この対照が空振りしている）')
      );

      // (2) 上限を上げる変異を実データへ当てる。115.228 のレビューが実測した穴そのものである
      //     （2026-09-04 の現況では `construction-photo` の 145 件を 200 件へ上げる形）。
      const subject = 'construction-photo';
      const policy = FEATURE_POLICIES[subject];
      if (policy === undefined || policy.mode !== 'ratchet') {
        return [...failures, `${subject} が ratchet でない（この対照が空振りしている）`];
      }
      const actual = measureFeature(REPOSITORY_ROOT, subject).missing.length;
      const loosened: Record<string, FeaturePolicy> = {
        ...FEATURE_POLICIES,
        [subject]: { ...policy, maxMissing: actual + 55 },
      };
      const loosenedFailures = judgeNamed(REPOSITORY_ROOT, loosened, features).failures;
      failures.push(
        ...expect(
          loosenedFailures.some(
            (one) => one.startsWith(`${subject}: `) && one.includes('遊び 55 件')
          ),
          `${subject} の上限を ${actual} から ${actual + 55} へ上げても通ってしまう: ` +
            JSON.stringify(loosenedFailures)
        )
      );
      return failures;
    },
  },
  {
    name: '実データに対して既定の対象で判定が通る（宣言が現況と一致している）',
    run() {
      const { failures, measurements } = judge(REPOSITORY_ROOT);
      const totalCriteria = measurements.reduce((sum, one) => sum + one.criteria, 0);
      const totalRows = measurements.reduce((sum, one) => sum + one.rows, 0);
      return [
        ...expect(measurements.length > 0, '実測が 0 件（既定の対象が空）'),
        ...expect(totalCriteria > 0, '現役の受入基準が全機能で 0 件'),
        ...expect(totalRows > 0, '追跡表の本文行が全機能で 0 行'),
        ...expect(failures.length === 0, `実データで宣言と食い違う: ${JSON.stringify(failures)}`),
      ];
    },
  },
];

/**
 * 陽性対照・陰性対照の件数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/list-control-polarity-floors.ts` が出す値をそのまま置く
 * （タスク 115.262 が陽性対照 4 件・陰性対照 1 件を足したぶん、6/3 から 10/4 へ上げた）。
 *
 * **総数の下限だけでは片側の消失を捕まえられない。** 陽性対照を削って同じ数だけ陰性対照を
 * 足せば総数は動かないため、極性ごとに別の下限を貼る。極性は要素の宣言（`expected` ないし
 * `polarity`）から導き、**名前の綴りからは導かない**（115.247 の作法）。
 */
const MINIMUM_POSITIVE_CONTROLS = 10;
const MINIMUM_NEGATIVE_CONTROLS = 4;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-traceability-coverage.selftest.ts | tail -1` の出す値をそのまま置く
 * （タスク 115.262 が 5 件を足したぶん、32 件から 37 件へ上げた）。
 * **確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い。** 115.222 は本体の検査種別の直和型から下限を
 * 導いたが、本体 `check-traceability-coverage.ts` の判定は `exact` / `ratchet` の 2 型しか
 * 持たず、37 件の確認の大半は型に対応しない。導けないため件数で貼る。
 */
const MINIMUM_TOTAL_CASES = 37;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `DETECTION` / `NON_VACUITY` / `SUBJECT_IDENTITY` / `JUDGEMENT` /
 * `REAL_DATA` のいずれを空にしても、また `main()` の中の `groups` を空にしても
 * `✅ N/N 件の確認に成功しました` を出して EXIT=0 になった（`groups` を空にした場合は
 * `0/0`）。**母集団が空の検査は何も主張していない。**
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形（115.252 の候補3）は配列
 * ごと空にすると関門も一緒に消える。`main()` の中、確認の実行より前に、配列の外側から貼る。
 *
 * **限界（塞いでいないこと）**: 総数の下限は現況ちょうどのため 1 件でも削れば赤くなるが、
 * **削った分だけ別の群へ確認を足せば総数は動かない**。群ごとの下限は「空でないこと」までしか
 * 課せない（件数を導く語彙が本体に無い。115.222 が陰性対照について書き残した限界と同じ形）。
 *
 * **もう一つの限界**: `main()` からこの関門の呼び出し自体を落とせば、関門は走らなくなる。
 * 呼び出しの直列性を構造で要求する形——115.242 が `check-design-path-references.selftest.ts`
 * に置いた「深さ 0・文の先頭・呼び出し直後の `;`」の三点——は、本タスクでは各ファイルへ
 * 展開していない。**塞がないことと、書かないことは別である**（115.242 の教訓）。
 */
function guardControlsArePresent(groups: readonly TestGroup[]): void {
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
  const groups: TestGroup[] = [
    { title: '検出規則（Requirement 列の読み方）', cases: DETECTION },
    { title: '母集団が空なら失敗する', cases: NON_VACUITY },
    { title: '宣言と対象の双方向の一致', cases: SUBJECT_IDENTITY },
    {
      title: '判定の型（exact / ratchet）',
      cases: JUDGEMENT,
    },
    { title: '実データの対照', cases: REAL_DATA },
  ];

  console.log('🔍 追跡表の網羅検査 自己検査 (scripts/check-traceability-coverage.selftest.ts)');
  guardControlsArePresent(groups);
  let failed = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      const failures = testCase.run();
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
