/**
 * @fileoverview 除外定義の形式検査そのものの自己検査
 *
 * scripts/check-requirement-exclusions.ts が、壊れた除外定義を実際に弾けることを
 * 「壊し方そのものを注入して」確認する（陽性対照）。合わせて、正しい定義を
 * 誤って弾かないこと（陰性対照）も確認する。
 *
 * 検証器が何も検出できない状態のまま本検査が「合格」を出すと、形式検証は名ばかりになる。
 * それを防ぐため、CI と pre-push では本検査の前にこの自己検査を走らせる。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-exclusions.selftest.ts
 *   npm run check:req-exclusions:selftest
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EXCLUSIONS_PATH, run } from './check-requirement-exclusions.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');
const SCHEMA_BASENAME = 'requirement-exclusions.schema.json';
const REAL_EXCLUSIONS = path.resolve(ROOT, EXCLUSIONS_PATH);
const REAL_SCHEMA = path.resolve(path.dirname(REAL_EXCLUSIONS), SCHEMA_BASENAME);

type Json = Record<string, unknown>;

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 定義の壊し方（正しい定義の複製を受け取り、その場で書き換える） */
  mutate?: (document: Json) => void;
  /** スキーマの壊し方 */
  mutateSchema?: (schema: Json) => void;
  /** 定義ファイルそのものを置き換える（JSON として壊す・置かない、を試すため） */
  rawDocument?: string | null;
  /** スキーマファイルを置かない */
  omitSchema?: boolean;
  /** 弾かれなければならない（true）／通らなければならない（false） */
  mustReject: boolean;
}

function loadReal(): Json {
  return JSON.parse(fs.readFileSync(REAL_EXCLUSIONS, 'utf-8')) as Json;
}

function loadRealSchema(): Json {
  return JSON.parse(fs.readFileSync(REAL_SCHEMA, 'utf-8')) as Json;
}

function entries(document: Json): Json[] {
  return document.exclusions as Json[];
}

/** 実物に必ず在るはずの除外を取り出す。無ければ前提が崩れているので失敗させる。 */
function entryAt(document: Json, index: number): Json {
  const entry = entries(document)[index];
  if (!entry) throw new Error(`前提: exclusions[${index}] が実物に存在しない`);
  return entry;
}

/** 除外が掲げる代替検証を取り出す。無ければ前提が崩れているので失敗させる。 */
function altOf(entry: Json): Json {
  const alternative = entry.alternativeVerification as Json | undefined;
  if (!alternative) throw new Error('前提: 代替検証が実物に存在しない');
  return alternative;
}

function summary(document: Json): Json {
  return document.summary as Json;
}

function byCategory(document: Json): Record<string, number> {
  return summary(document).byCategory as Record<string, number>;
}

function categories(document: Json): Json {
  return document.categories as Json;
}

/** 除外を1件取り除き、集計もそれに合わせて整える（壊したい一点だけを壊す） */
function dropOneEntry(document: Json, index: number): void {
  const list = entries(document);
  const removed = entryAt(document, index);
  list.splice(index, 1);
  const category = removed.category as string;
  const counts = byCategory(document);
  counts[category] = (counts[category] ?? 0) - 1;
  if (counts[category] === 0) {
    delete counts[category];
    delete categories(document)[category];
  }
  summary(document).totalExclusions = list.length;
}

// ============================================================================
// 弾かれなければならない壊し方（陽性対照）
// ============================================================================

const MUST_REJECT: Case[] = [
  {
    name: '必須項目の欠落（reason が無い除外）',
    mutate: (d) => {
      delete entryAt(d, 0).reason;
    },
    mustReject: true,
  },
  {
    name: '代替検証そのものの欠落（E2Eで確かめない約束の相手が無い）',
    mutate: (d) => {
      delete entryAt(d, 0).alternativeVerification;
    },
    mustReject: true,
  },
  {
    name: '代替検証の手段が空文字（形だけの代替検証）',
    mutate: (d) => {
      altOf(entryAt(d, 0)).method = '';
    },
    mustReject: true,
  },
  {
    name: '代替検証に未知の項目',
    mutate: (d) => {
      altOf(entryAt(d, 0)).owner = '誰か';
    },
    mustReject: true,
  },
  {
    name: '受入基準の識別子の書式違反（枝番が無い）',
    mutate: (d) => {
      entryAt(d, 0).id = 'REQ-23';
    },
    mustReject: true,
  },
  {
    name: '受入基準の識別子の書式違反（要件番号ではない文字列）',
    mutate: (d) => {
      entryAt(d, 0).id = 'パフォーマンス関連';
    },
    mustReject: true,
  },
  {
    name: '除外に未知の項目',
    mutate: (d) => {
      entryAt(d, 0).note = 'あとで消す';
    },
    mustReject: true,
  },
  {
    name: '型違反（reason が文字列ではない）',
    mutate: (d) => {
      entryAt(d, 0).reason = 42;
    },
    mustReject: true,
  },
  {
    name: '除外が一件も無い（前提条件で検査を無効化しない）',
    mutate: (d) => {
      d.exclusions = [];
      d.categories = { performance: categories(d).performance };
      summary(d).totalExclusions = 0;
      summary(d).byCategory = {};
    },
    mustReject: true,
  },
  {
    name: '識別子の重複（同じ受入基準を二重に除外）',
    mutate: (d) => {
      const list = entries(d);
      const copy = JSON.parse(JSON.stringify(entryAt(d, 0))) as Json;
      list.push(copy);
      const counts = byCategory(d);
      const category = copy.category as string;
      counts[category] = (counts[category] ?? 0) + 1;
      summary(d).totalExclusions = list.length;
    },
    mustReject: true,
  },
  {
    name: 'categories に定義されていない分類',
    mutate: (d) => {
      const counts = byCategory(d);
      const before = entryAt(d, 0).category as string;
      counts[before] = (counts[before] ?? 0) - 1;
      counts['思いつきの分類'] = 1;
      entryAt(d, 0).category = '思いつきの分類';
    },
    mustReject: true,
  },
  {
    name: 'どの除外からも使われていない分類の定義',
    mutate: (d) => {
      categories(d)['使われない分類'] = {
        description: '誰も使わない',
        verificationPhase: 'none',
      };
    },
    mustReject: true,
  },
  {
    name: '分類の定義に検証フェーズが無い',
    mutate: (d) => {
      delete (categories(d).performance as Json).verificationPhase;
    },
    mustReject: true,
  },
  {
    name: '集計の総数が実際とずれている',
    mutate: (d) => {
      summary(d).totalExclusions = entries(d).length + 6;
    },
    mustReject: true,
  },
  {
    name: '分類別の集計が実際とずれている',
    mutate: (d) => {
      const counts = byCategory(d);
      counts.performance = (counts.performance ?? 0) + 4;
    },
    mustReject: true,
  },
  {
    name: '該当が一件も無い分類が集計に残っている',
    mutate: (d) => {
      byCategory(d)['亡霊の分類'] = 3;
    },
    mustReject: true,
  },
  {
    name: '版番号の書式違反',
    mutate: (d) => {
      d.version = 'v1';
    },
    mustReject: true,
  },
  {
    name: '更新日の書式違反',
    mutate: (d) => {
      d.lastUpdated = '2026/08/25';
    },
    mustReject: true,
  },
  {
    name: '最上位に未知の項目',
    mutate: (d) => {
      d.todo = 'あとで整理する';
    },
    mustReject: true,
  },
  {
    name: 'スキーマ参照が別のファイルを指す',
    mutate: (d) => {
      d.$schema = './requirement-exclusions.v2.schema.json';
    },
    mustReject: true,
  },
  {
    name: 'スキーマ参照の欠落',
    mutate: (d) => {
      delete d.$schema;
    },
    mustReject: true,
  },
  {
    name: 'スキーマ参照の先が実在しない（ダングリング参照）',
    omitSchema: true,
    mustReject: true,
  },
  {
    name: '定義が JSON として壊れている',
    rawDocument: '{ "exclusions": [ ',
    mustReject: true,
  },
  {
    name: '定義ファイルが存在しない（前提条件で検査を無効化しない）',
    rawDocument: null,
    mustReject: true,
  },
  {
    name: '検証器が解釈できないスキーマ語彙（黙って素通りさせない）',
    mutateSchema: (s) => {
      ((s.$defs as Json).exclusion as Json).oneOf = [];
    },
    mustReject: true,
  },
];

// ============================================================================
// 通らなければならない形（陰性対照）
// ============================================================================

const MUST_ACCEPT: Case[] = [
  {
    name: 'リポジトリの実物',
    mustReject: false,
  },
  {
    name: '閾値を持たない代替検証（threshold は任意項目）',
    mutate: (d) => {
      delete altOf(entryAt(d, 0)).threshold;
    },
    mustReject: false,
  },
  {
    name: '機能名を冠さない旧来の識別子（REQ-N.M）',
    mutate: (d) => {
      const list = entries(d);
      const target = list.find((entry) => (entry.id as string).includes('/'));
      if (!target) throw new Error('前提: 機能名を冠した識別子が実物に存在しない');
      target.id = 'REQ-999.1';
    },
    mustReject: false,
  },
  {
    name: '機能名を冠した識別子（feature/REQ-N.M）',
    mutate: (d) => {
      const list = entries(d);
      const target = list.find((entry) => !(entry.id as string).includes('/'));
      if (!target) throw new Error('前提: 機能名を冠さない識別子が実物に存在しない');
      target.id = 'site-survey/REQ-999.1';
    },
    mustReject: false,
  },
  {
    name: '除外を1件減らし集計もそろえた定義',
    mutate: (d) => {
      dropOneEntry(d, 0);
    },
    mustReject: false,
  },
];

// ============================================================================
// 実行
// ============================================================================

function evaluate(testCase: Case): { rejected: boolean; detail: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-exclusions-selftest-'));
  try {
    if (!testCase.omitSchema) {
      const schema = loadRealSchema();
      testCase.mutateSchema?.(schema);
      fs.writeFileSync(path.join(dir, SCHEMA_BASENAME), JSON.stringify(schema, null, 2));
    }

    const documentPath = path.join(dir, 'requirement-exclusions.json');
    if (testCase.rawDocument === null) {
      // ファイルを置かない
    } else if (typeof testCase.rawDocument === 'string') {
      fs.writeFileSync(documentPath, testCase.rawDocument);
    } else {
      const document = loadReal();
      testCase.mutate?.(document);
      fs.writeFileSync(documentPath, JSON.stringify(document, null, 2));
    }

    const result = run(documentPath);
    return {
      rejected: result.violations.length > 0,
      detail: result.violations
        .slice(0, 3)
        .map((v) => `${v.pointer}: ${v.message}`)
        .join(' / '),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  const failures: string[] = [];
  let passed = 0;

  console.log('=== 弾かれなければならない壊し方（陽性対照） ===');
  for (const testCase of MUST_REJECT) {
    const { rejected, detail } = evaluate(testCase);
    if (rejected) {
      passed += 1;
      console.log(`  ✅ ${testCase.name} → ${detail}`);
    } else {
      failures.push(`検出漏れ: ${testCase.name}`);
      console.log(`  ❌ ${testCase.name} → 弾かれなかった`);
    }
  }

  console.log('');
  console.log('=== 通らなければならない形（陰性対照） ===');
  for (const testCase of MUST_ACCEPT) {
    const { rejected, detail } = evaluate(testCase);
    if (!rejected) {
      passed += 1;
      console.log(`  ✅ ${testCase.name}`);
    } else {
      failures.push(`過検出: ${testCase.name} → ${detail}`);
      console.log(`  ❌ ${testCase.name} → 誤って弾かれた（${detail}）`);
    }
  }

  const total = MUST_REJECT.length + MUST_ACCEPT.length;
  console.log('');
  if (failures.length > 0) {
    console.error(`❌ 自己検査に失敗しました（${failures.length}/${total} 件）`);
    for (const failure of failures) console.error(`   - ${failure}`);
    process.exit(1);
  }

  console.log(
    `✅ 自己検査に合格しました（${passed}/${total} 件: 陽性対照 ${MUST_REJECT.length} / 陰性対照 ${MUST_ACCEPT.length}）`
  );
}

main();
