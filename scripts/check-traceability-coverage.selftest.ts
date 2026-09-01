/**
 * @fileoverview 追跡表の網羅検査（`scripts/check-traceability-coverage.ts`）の自己検査
 *
 * 本検査は「宣言と食い違わないこと」を求める形であるため、**検出規則が壊れると自明に緑を出す**。
 * 追跡表の本文行を 1 行も拾えなければ全受入基準が欠落として挙がり——それは赤くなるが——逆に
 * 受入基準の側を 1 件も拾えなければ欠落は 0 件になり、`exact` の宣言だけが「置き去り」として
 * 落ちる。**母集団が空のまま通る経路を残さないこと**が本自己検査の主目的である
 * （AI運用7原則 第3原則。タスク 115.222 の作法）。
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
  run(): string[];
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
      const { covered, unparsed } = expandRequirementColumn([
        '|  | 要約 | X | - | - |',
        '| - | 要約 | X | - | - |',
      ]);
      return [
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
        const { failures } = judge(root, {}, ['f']);
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
        const { failures } = judge(root, policies, ['f']);
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
        const { failures } = judge(root, policies, ['f']);
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
        const { failures } = judge(root, policies, ['f']);
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
        const { failures } = judge(root, policies, ['f']);
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
        const { failures } = judge(root, policies, discoverFeatureNames(root));
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
        const { failures } = judge(root, policies, discoverFeatureNames(root));
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

function judgeOneFeature(
  rows: readonly string[],
  criteria: readonly string[],
  policy: FeaturePolicy
): string[] {
  const root = makeSyntheticRoot({
    f: {
      requirements: requirementsDocument([{ number: '1', criteria }]),
      design: designDocument(rows),
    },
  });
  try {
    return judge(root, { f: policy }, ['f']).failures;
  } finally {
    removeRoot(root);
  }
}

const JUDGEMENT: TestCase[] = [
  {
    name: 'exact: 宣言と一致すれば通る',
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
    name: 'ratchet: 上限以下なら通り、超えれば失敗する',
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

function main(): void {
  const groups: { title: string; cases: TestCase[] }[] = [
    { title: '検出規則（Requirement 列の読み方）', cases: DETECTION },
    { title: '母集団が空なら失敗する', cases: NON_VACUITY },
    { title: '宣言と対象の双方向の一致', cases: SUBJECT_IDENTITY },
    { title: '判定の型（exact / ratchet）', cases: JUDGEMENT },
    { title: '実データの対照', cases: REAL_DATA },
  ];

  console.log('🔍 追跡表の網羅検査 自己検査 (scripts/check-traceability-coverage.selftest.ts)');
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
