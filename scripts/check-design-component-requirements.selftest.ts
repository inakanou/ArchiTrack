/**
 * @fileoverview 追跡表と部品別の自己申告の突き合わせ（`scripts/check-design-component-requirements.ts`）の自己検査
 *
 * 本検査は「宣言と食い違わないこと」を求める形であるため、**検出規則が壊れると自明に緑を出す**。
 * 部品名の綴りが揃わなくなれば突き合わせの母集団は空になり、矛盾は 0 件になる。**母集団が空の
 * まま通る経路を残さないこと**が本自己検査の主目的である（AI運用7原則 第3原則。タスク 115.222 /
 * 115.242 / 115.244 の作法）。
 *
 * 併せて**被検体の同一性**を固定する（タスク 115.227 の作法）。本検査が実際に走らせる既定の
 * 対象（`discoverFeatureNames()` × `FEATURE_POLICIES`）と、自己検査が確かめる対象が同じもので
 * あることを、双方向の一致として書く。
 *
 * **陽性対照は実データに置く**。タスク 115.246 が決着させた食い違い——追跡表の要件28 の行が
 * `AnnotationContextMenu` を挙げる形——を実データの本文へメモリ上で差し戻すと、本検査は
 * その 1 件を矛盾として挙げなければならない。差し戻す前は 0 件でなければならない（陰性対照）。
 * ファイルは書き換えない。
 *
 * **自己検査自身の真空パスも塞ぐ**。対照群の配列を空にすれば `0/0 件の確認に成功しました` を
 * 出して EXIT=0 になりうる。`guardControlsArePresent()` を `main()` の中（**対照群の配列の
 * 外側**）に置き、群ごとの非空・確認の総数の下限・回帰の対照群の陽性/陰性の両立を実行の前に
 * 確かめる。関門を対照群の要素として持つ形は、配列ごと空にすると関門も消えるため採らない
 * （未着手タスク 115.252 の候補3 が名指す自己隠蔽）。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-component-requirements.selftest.ts
 *   npm run check:design-component-reqs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、本検査の前に走らせること。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverFeatureNames } from './requirement-document';
import { SPEC_DIR, DESIGN_DOC_NAME } from './design-document';
import {
  FEATURE_POLICIES,
  buildChapterIndex,
  extractRequirementNumbers,
  judge,
  measureDesignDocument,
  measureFeature,
  normalizeComponentName,
  splitComponentCell,
  type FeaturePolicy,
} from './check-design-component-requirements';

const REPOSITORY_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

interface TestCase {
  readonly name: string;
  /**
   * 対照の極性
   *
   * 回帰の対照群は陰性 1 件・陽性 2 件が混ざるため、**配列の長さだけでは片側の消失を
   * 捕まえられない**。極性を要素に持たせ、`guardControlsArePresent()` が両側の存在を個別に
   * 確かめる。
   */
  readonly polarity?: 'positive' | 'negative';
  run(): string[];
}

interface TestGroup {
  readonly title: string;
  readonly cases: TestCase[];
}

function expect(condition: boolean, message: string): string[] {
  return condition ? [] : [message];
}

/** 合成の機能を置いた根を作る（`discoverFeatureNames` は requirements.md の実在で機能を数える） */
function makeSyntheticRoot(features: Readonly<Record<string, string | null>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-component-reqs-selftest-'));
  for (const [feature, design] of Object.entries(features)) {
    const dir = path.join(root, SPEC_DIR, feature);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'requirements.md'), '# 要件定義書\n', 'utf8');
    if (design !== null) fs.writeFileSync(path.join(dir, DESIGN_DOC_NAME), design, 'utf8');
  }
  return root;
}

function removeRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** 追跡表と部品表を一つずつ持つ設計文書を組み立てる */
function designDocument(options: {
  readonly traceabilityRows: readonly string[];
  readonly componentRows: readonly string[];
  /** 部品表の表頭を壊す（走査が空振りする形の再現） */
  readonly breakComponentTable?: boolean;
}): string {
  const componentHeader =
    options.breakComponentTable === true
      ? '| 部品 | Domain/Layer | Intent | Req Coverage | Deps | Contracts |'
      : '| Component | Domain/Layer | Intent | Req Coverage | Deps | Contracts |';
  return [
    '# 設計',
    '',
    '## Requirements Traceability',
    '',
    '| Requirement | Summary | Components | Interfaces | Flows |',
    '|-------------|---------|------------|------------|-------|',
    ...options.traceabilityRows,
    '',
    '## Components and Interfaces',
    '',
    '### Component Summary',
    '',
    componentHeader,
    '|-----------|--------------|--------|--------------|------|-----------|',
    ...options.componentRows,
    '',
    '本文の続き。',
    '',
  ].join('\n');
}

/**
 * 名指しした機能だけを判定へ通す（AI運用7原則 第3原則。タスク 115.252 の是正。指摘 (2)）
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

function judgeOne(design: string, policy: FeaturePolicy): string[] {
  const root = makeSyntheticRoot({ f: design });
  try {
    return judgeNamed(root, { f: policy }, ['f']).failures;
  } finally {
    removeRoot(root);
  }
}

// ---------------------------------------------------------------------------
// (1) 検出規則
// ---------------------------------------------------------------------------

const DETECTION: TestCase[] = [
  {
    name: '受入基準の番号から上位番号を取り出す',
    run() {
      const { numbers, unparsed } = extractRequirementNumbers(' 27.2-27.5, 27.7, 28.3 ');
      return [
        ...expect(numbers.has('27'), '27 を拾えていない'),
        ...expect(numbers.has('28'), '28 を拾えていない'),
        ...expect(numbers.size === 2, `余計な番号を拾った: ${[...numbers].join(', ')}`),
        ...expect(unparsed.length === 0, `読めない表記が出た: ${unparsed.join(', ')}`),
      ];
    },
  },
  {
    name: '要件番号の範囲を両端込みで展開する',
    run() {
      const { numbers } = extractRequirementNumbers('1-12, 14, 18, 20');
      const failures: string[] = [];
      for (let number = 1; number <= 12; number++) {
        failures.push(...expect(numbers.has(String(number)), `${number} を展開していない`));
      }
      return [
        ...failures,
        ...expect(
          numbers.has('14') && numbers.has('18') && numbers.has('20'),
          '単独の番号を落とした'
        ),
        ...expect(!numbers.has('13'), '範囲外の 13 を拾った'),
      ];
    },
  },
  {
    name: '強調記号・バッククォート・取り消し線を装飾として落とす',
    run() {
      const { numbers } = extractRequirementNumbers('**5.2-5.4, 5.6**, `9`, ~~11~~');
      return [
        ...expect(numbers.has('5'), '強調記号つきの番号を落とした'),
        ...expect(numbers.has('9'), 'バッククォートつきの番号を落とした'),
        ...expect(numbers.has('11'), '取り消し線つきの番号を落とした'),
      ];
    },
  },
  {
    name: '番号を一つも取り出せないトークンは黙って捨てず数える',
    run() {
      const { numbers, unparsed } = extractRequirementNumbers('全要件, Cross-cutting');
      return [
        ...expect(numbers.size === 0, `散文から番号を捏造した: ${[...numbers].join(', ')}`),
        ...expect(unparsed.length === 2, `読めない表記を数えていない: ${unparsed.join(', ')}`),
      ];
    },
  },
  {
    name: '番号のあとに散文が続くトークンは番号を採りつつ partial に数える',
    run() {
      const { numbers, partial } = extractRequirementNumbers('24-30 cross-cutting');
      return [
        ...expect(numbers.has('24') && numbers.has('30'), '番号を採れていない'),
        ...expect(partial.length === 1, `散文つきのトークンを数えていない: ${partial.join(', ')}`),
      ];
    },
  },
  {
    name: 'Components 列を括弧の内側の読点で切らない',
    run() {
      const names = splitComponentCell(
        'AnnotationToolbar（要件24.5 の切替UI。同名の未結線 `StylePanel.tsx` ではなく、本部品が出荷経路）, AnnotationEditor'
      );
      return [
        ...expect(names.length === 2, `部品名の切り方が違う: ${JSON.stringify(names)}`),
        ...expect(names[0] === 'AnnotationToolbar', `注記を落とせていない: ${names[0]}`),
        ...expect(names[1] === 'AnnotationEditor', `2 件目が違う: ${names[1]}`),
      ];
    },
  },
  {
    name: '取り消し線で潰された部品名は母集団から外す',
    run() {
      return [
        ...expect(
          normalizeComponentName('~~ImageViewer~~（撤去済み）') === null,
          '撤去済みの部品を母集団に入れている'
        ),
        ...expect(
          normalizeComponentName('**PhotoManagementPanel**') === 'PhotoManagementPanel',
          '強調記号を落とせていない'
        ),
      ];
    },
  },
  {
    name: '章の見出しで領域を分ける',
    run() {
      const lines = [
        '# 設計',
        '## Requirements Traceability',
        '本文',
        '## Requirements 24-30: 題',
        '本文',
      ];
      const { chapterOf, chapters } = buildChapterIndex(lines);
      return [
        ...expect(chapters.length === 2, `章の数が違う: ${chapters.length}`),
        ...expect(
          chapterOf(3) === '（章の見出しより前）',
          `章の見出しより前を分けられていない: ${chapterOf(3)}`
        ),
        ...expect(
          chapterOf(5) === 'Requirements 24-30: 題',
          `章の見出しを拾えていない: ${chapterOf(5)}`
        ),
        ...expect(
          chapterOf(2) === '（章の見出しより前）',
          '`## Requirements Traceability` を章の見出しと誤認している'
        ),
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// (2) 陽性対照・陰性対照（実データ・タスク 115.246 の回帰）
// ---------------------------------------------------------------------------

/** タスク 115.246 が `AnnotationContextMenu` を外した追跡表の行の一部 */
const RESTORED_DEFECT_ANCHOR =
  '| 28.1-28.8 | モバイルツールバー、折返し・スクロール、属性パネル開閉、44px タップ領域 | AnnotationToolbar, StylePanel |';
const RESTORED_DEFECT_MUTATION =
  '| 28.1-28.8 | モバイルツールバー、折返し・スクロール、属性パネル開閉、44px タップ領域 | AnnotationToolbar, StylePanel, AnnotationContextMenu |';
const RESTORED_DEFECT_ID =
  'Requirements 24-30: 画像注釈の視認性向上・モバイル操作性強化 | AnnotationContextMenu | 28';

function siteSurveyDesign(): string {
  return fs.readFileSync(
    path.join(REPOSITORY_ROOT, SPEC_DIR, 'site-survey', DESIGN_DOC_NAME),
    'utf8'
  );
}

const REGRESSION: TestCase[] = [
  {
    name: '陰性対照: 実データの site-survey に矛盾は 0 件',
    polarity: 'negative',
    run() {
      const measurement = measureDesignDocument('site-survey', siteSurveyDesign());
      return [
        ...expect(
          measurement.contradictions.length === 0,
          `矛盾が挙がった: ${measurement.contradictions.map((one) => one.id).join(' / ')}`
        ),
        ...expect(
          measurement.pairs > 0,
          `突き合わせの母集団が空（対照が空振り）: ${measurement.pairs}`
        ),
      ];
    },
  },
  {
    name: '陽性対照: 115.246 が外した割り当てを差し戻すと矛盾として挙がる',
    polarity: 'positive',
    run() {
      const design = siteSurveyDesign();
      if (!design.includes(RESTORED_DEFECT_ANCHOR)) {
        return [
          '変異の当て先が実データに無い（対照が空振り）。' +
            '追跡表の要件28 の行の書式が変わったなら RESTORED_DEFECT_ANCHOR を測り直すこと。',
        ];
      }
      const mutated = design.replace(RESTORED_DEFECT_ANCHOR, RESTORED_DEFECT_MUTATION);
      const measurement = measureDesignDocument('site-survey', mutated);
      return [
        ...expect(
          measurement.contradictions.some((one) => one.id === RESTORED_DEFECT_ID),
          `差し戻しても矛盾に挙がらない: ${measurement.contradictions.map((one) => one.id).join(' / ')}`
        ),
        ...expect(
          measurement.contradictions.length === 1,
          `変異が 1 件を超える差を生んだ: ${measurement.contradictions.map((one) => one.id).join(' / ')}`
        ),
      ];
    },
  },
  {
    name: '陽性対照: 部品名の綴りを揃えなくすると母集団が縮む（矛盾 0 件では通らない）',
    polarity: 'positive',
    run() {
      const design = siteSurveyDesign();
      const baseline = measureDesignDocument('site-survey', design);
      // 部品表の表頭を壊すと自己申告が拾えなくなる（走査が空振りした形の再現）
      const mutated = design.replace(
        /^\| Component \| Domain\/Layer \| Intent \| Req Coverage \|/gm,
        '| 部品 | Domain/Layer | Intent | Req Coverage |'
      );
      if (mutated === design) return ['変異の当て先が実データに無い（対照が空振り）'];
      const measurement = measureDesignDocument('site-survey', mutated);
      const policy = FEATURE_POLICIES['site-survey'];
      const minPairs = policy === undefined ? 0 : policy.minPairs;
      return [
        ...expect(baseline.pairs > measurement.pairs, '表頭を壊しても母集団が縮まない'),
        ...expect(
          measurement.pairs < minPairs,
          `母集団が縮んでも宣言の下限（${minPairs} 組）を割らない: ${measurement.pairs} 組。` +
            'この形は「矛盾 0 件」で緑になる真空パスである'
        ),
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// (3) 母集団が空なら失敗する（AI運用7原則 第3原則）
// ---------------------------------------------------------------------------

const NON_VACUITY: TestCase[] = [
  {
    name: '部品表だけが空振りすると由来別の下限で失敗する',
    run() {
      const design = siteSurveyDesign();
      const baseline = measureDesignDocument('site-survey', design);
      const mutated = design.replace(
        /^\| Component \| Domain\/Layer \| Intent \| Req Coverage \|/gm,
        '| 部品 | Domain/Layer | Intent | Req Coverage |'
      );
      if (mutated === design) return ['変異の当て先が実データに無い（対照が空振り）'];
      const measurement = measureDesignDocument('site-survey', mutated);
      const failures = judgeOne(mutated, {
        mode: 'ratchet',
        maxContradictions: 999,
        minPairs: 0,
        minTableDeclarations: baseline.tableDeclarations,
        minDetailDeclarations: 0,
        reason: 't',
      });
      return [
        ...expect(baseline.tableDeclarations > 0, '基準線の部品表由来が 0 件（対照が空振り）'),
        ...expect(
          measurement.tableDeclarations < baseline.tableDeclarations,
          `表頭を壊しても部品表由来の件数が減らない: ${measurement.tableDeclarations}`
        ),
        ...expect(
          failures.some((failure) => failure.includes('部品表由来の自己申告が')),
          `由来別の下限で赤くならない: ${JSON.stringify(failures)}`
        ),
      ];
    },
  },
  {
    name: '詳細節の Requirements 欄だけが空振りすると由来別の下限で失敗する（pairs は動かない）',
    run() {
      const design = siteSurveyDesign();
      const baseline = measureDesignDocument('site-survey', design);
      const mutated = design.replace(/^\| *(?:\*\*)?Requirements(?:\*\*)? *\|/gm, '| 要件 |');
      if (mutated === design) return ['変異の当て先が実データに無い（対照が空振り）'];
      const measurement = measureDesignDocument('site-survey', mutated);
      const failures = judgeOne(mutated, {
        mode: 'ratchet',
        maxContradictions: 999,
        minPairs: baseline.pairs,
        minTableDeclarations: 0,
        minDetailDeclarations: baseline.detailDeclarations,
        reason: 't',
      });
      return [
        ...expect(baseline.detailDeclarations > 0, '基準線の詳細節由来が 0 件（対照が空振り）'),
        ...expect(
          measurement.detailDeclarations < baseline.detailDeclarations,
          `欄を壊しても詳細節由来の件数が減らない: ${measurement.detailDeclarations}`
        ),
        // この形が由来別の下限を要する理由: `pairs` の下限では捕まえられない
        ...expect(
          measurement.pairs === baseline.pairs,
          `pairs が動いた（前提の再測定が要る）: ${baseline.pairs} → ${measurement.pairs}`
        ),
        ...expect(
          failures.some((failure) => failure.includes('詳細節の Requirements 欄由来')),
          `由来別の下限で赤くならない: ${JSON.stringify(failures)}`
        ),
        ...expect(
          !failures.some((failure) => failure.includes('突き合わせの母集団')),
          `pairs の下限が先に赤くしている（この対照の前提が崩れている）: ${JSON.stringify(failures)}`
        ),
      ];
    },
  },
  {
    name: '機能が 0 件なら失敗する',
    run() {
      const root = makeSyntheticRoot({});
      try {
        const { failures } = judge(root, {}, []);
        return expect(
          failures.some((failure) => failure.includes('機能が 1 件も見つかりません')),
          `機能 0 件で通ってしまう: ${JSON.stringify(failures)}`
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
        f: designDocument({
          traceabilityRows: ['| 1.1 | a | X | - | - |'],
          componentRows: ['| X | UI | i | 1.1 | - | - |'],
        }),
      });
      try {
        const { failures } = judgeNamed(root, {}, ['f']);
        return expect(
          failures.some((failure) => failure.includes('方針の宣言が空です')),
          `宣言が空でも通ってしまう: ${JSON.stringify(failures)}`
        );
      } finally {
        removeRoot(root);
      }
    },
  },
  {
    name: '部品別の自己申告が 0 件なら失敗する（表頭が変わって空振りした形）',
    run() {
      const failures = judgeOne(
        designDocument({
          traceabilityRows: ['| 1.1 | a | X | - | - |'],
          componentRows: ['| X | UI | i | 1.1 | - | - |'],
          breakComponentTable: true,
        }),
        {
          mode: 'ratchet',
          maxContradictions: 0,
          minPairs: 0,
          minTableDeclarations: 0,
          minDetailDeclarations: 0,
          reason: 't',
        }
      );
      return expect(
        failures.some((failure) => failure.includes('部品別の自己申告が 0 件です')),
        `自己申告 0 件でも「矛盾 0 件」で通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: '突き合わせの母集団が宣言の下限を割ったら失敗する',
    run() {
      const failures = judgeOne(
        designDocument({
          traceabilityRows: ['| 1.1 | a | Y | - | - |'],
          componentRows: ['| X | UI | i | 1.1 | - | - |'],
        }),
        {
          mode: 'ratchet',
          maxContradictions: 0,
          minPairs: 1,
          minTableDeclarations: 0,
          minDetailDeclarations: 0,
          reason: 't',
        }
      );
      return expect(
        failures.some((failure) => failure.includes('突き合わせの母集団')),
        `母集団が 0 組でも「矛盾 0 件」で通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'allowNoDeclarations の宣言が対象より長生きしたら失敗する',
    run() {
      const failures = judgeOne(
        designDocument({
          traceabilityRows: ['| 1.1 | a | X | - | - |'],
          componentRows: ['| X | UI | i | 1.1 | - | - |'],
        }),
        {
          mode: 'ratchet',
          maxContradictions: 0,
          minPairs: 0,
          minTableDeclarations: 0,
          minDetailDeclarations: 0,
          allowNoDeclarations: true,
          reason: 't',
        }
      );
      return expect(
        failures.some((failure) => failure.includes('allowNoDeclarations を宣言しています')),
        `置き去りの宣言が通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
];

// ---------------------------------------------------------------------------
// (4) 宣言と対象の双方向の一致（タスク 115.227 の作法）
// ---------------------------------------------------------------------------

const SUBJECT_IDENTITY: TestCase[] = [
  {
    name: '実在するが宣言に無い機能があれば失敗する',
    run() {
      const design = designDocument({
        traceabilityRows: ['| 1.1 | a | X | - | - |'],
        componentRows: ['| X | UI | i | 1.1 | - | - |'],
      });
      const root = makeSyntheticRoot({ declared: design, undeclared: design });
      try {
        const { failures } = judge(
          root,
          {
            declared: {
              mode: 'ratchet',
              maxContradictions: 0,
              minPairs: 0,
              minTableDeclarations: 0,
              minDetailDeclarations: 0,
              reason: 't',
            },
          },
          discoverFeatureNames(root)
        );
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
        alive: designDocument({
          traceabilityRows: ['| 1.1 | a | X | - | - |'],
          componentRows: ['| X | UI | i | 1.1 | - | - |'],
        }),
      });
      try {
        const { failures } = judge(
          root,
          {
            alive: {
              mode: 'ratchet',
              maxContradictions: 0,
              minPairs: 0,
              minTableDeclarations: 0,
              minDetailDeclarations: 0,
              reason: 't',
            },
            gone: {
              mode: 'ratchet',
              maxContradictions: 0,
              minPairs: 0,
              minTableDeclarations: 0,
              minDetailDeclarations: 0,
              reason: 't',
            },
          },
          discoverFeatureNames(root)
        );
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
// (5) 判定の型（exact / ratchet）と、突き合わせの前提
// ---------------------------------------------------------------------------

const CONTRADICTING = designDocument({
  traceabilityRows: ['| 1.1 | a | X | - | - |', '| 2.1 | b | X, Y | - | - |'],
  componentRows: ['| X | UI | i | 1.1 | - | - |', '| Y | UI | i | 2.1 | - | - |'],
});

const JUDGEMENT: TestCase[] = [
  {
    name: '追跡表が割り当てた要件を部品が自認していなければ矛盾として挙がる',
    run() {
      const measurement = measureDesignDocument('f', CONTRADICTING);
      return [
        ...expect(
          measurement.contradictions.length === 1,
          `矛盾の件数が違う: ${measurement.contradictions.map((one) => one.id).join(' / ')}`
        ),
        ...expect(
          measurement.contradictions[0]?.component === 'X' &&
            measurement.contradictions[0]?.requirement === '2',
          `矛盾の中身が違う: ${JSON.stringify(measurement.contradictions[0])}`
        ),
      ];
    },
  },
  {
    name: '章がその要件を部品別に語っていなければ矛盾と呼ばない（前提の確認）',
    run() {
      // 要件2 を自認する部品が一つも無い＝章が要件2 を部品別に語っていない
      const design = designDocument({
        traceabilityRows: ['| 1.1 | a | X | - | - |', '| 2.1 | b | X | - | - |'],
        componentRows: ['| X | UI | i | 1.1 | - | - |'],
      });
      const measurement = measureDesignDocument('f', design);
      return [
        ...expect(
          measurement.contradictions.length === 0,
          `語られていないことを矛盾と呼んでいる: ${measurement.contradictions.map((one) => one.id).join(' / ')}`
        ),
        ...expect(measurement.pairs === 1, `母集団が空（対照が空振り）: ${measurement.pairs}`),
      ];
    },
  },
  {
    name: '章をまたいだ割り当ては矛盾と呼ばない（章という単位の確認）',
    run() {
      const design = [
        '# 設計',
        '',
        '## Requirements Traceability',
        '',
        '| Requirement | Summary | Components | Interfaces | Flows |',
        '|---|---|---|---|---|',
        '| 1.1 | a | X | - | - |',
        '',
        '### Component Summary',
        '',
        '| Component | Domain/Layer | Intent | Req Coverage | Deps | Contracts |',
        '|---|---|---|---|---|---|',
        '| X | UI | i | 1.1 | - | - |',
        '',
        '## Requirements 9-9: 別の章',
        '',
        '### Requirements Traceability',
        '',
        '| Requirement | Summary | Components | Interfaces | Flows |',
        '|---|---|---|---|---|',
        '| 9.1 | a | X | - | - |',
        '',
        '#### Component Summary',
        '',
        '| Component | Domain/Layer | Intent | Req Coverage | Deps | Contracts |',
        '|---|---|---|---|---|---|',
        '| X | UI | i | 9.1 | - | - |',
        '',
      ].join('\n');
      const measurement = measureDesignDocument('f', design);
      return [
        ...expect(
          measurement.contradictions.length === 0,
          `章の適用範囲の違いを矛盾と誤判定した: ${measurement.contradictions.map((one) => one.id).join(' / ')}`
        ),
        ...expect(
          measurement.pairs === 2,
          `章ごとの母集団を数えられていない: ${measurement.pairs}`
        ),
      ];
    },
  },
  {
    name: 'exact: 宣言と一致すれば通る',
    run() {
      const failures = judgeOne(CONTRADICTING, {
        mode: 'exact',
        contradictions: ['（章の見出しより前） | X | 2'],
        minPairs: 2,
        minTableDeclarations: 0,
        minDetailDeclarations: 0,
        reason: 't',
      });
      return expect(failures.length === 0, `一致しているのに落ちた: ${JSON.stringify(failures)}`);
    },
  },
  {
    name: 'exact: 宣言に無い新たな矛盾があれば失敗する（AnnotationContextMenu の型）',
    run() {
      const failures = judgeOne(CONTRADICTING, {
        mode: 'exact',
        contradictions: [],
        minPairs: 2,
        minTableDeclarations: 0,
        minDetailDeclarations: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('宣言より増えています')),
        `新たな矛盾が通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'exact: 解消済みの宣言が置き去りなら失敗する',
    run() {
      const failures = judgeOne(
        designDocument({
          traceabilityRows: ['| 1.1 | a | X | - | - |'],
          componentRows: ['| X | UI | i | 1.1 | - | - |'],
        }),
        {
          mode: 'exact',
          contradictions: ['（章の見出しより前） | X | 2'],
          minPairs: 1,
          minTableDeclarations: 0,
          minDetailDeclarations: 0,
          reason: 't',
        }
      );
      return expect(
        failures.some((failure) => failure.includes('解消済みの矛盾が宣言に残っています')),
        `置き去りの宣言が通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
  {
    name: 'ratchet: 上限を超えたら失敗する',
    run() {
      const failures = judgeOne(CONTRADICTING, {
        mode: 'ratchet',
        maxContradictions: 0,
        minPairs: 2,
        minTableDeclarations: 0,
        minDetailDeclarations: 0,
        reason: 't',
      });
      return expect(
        failures.some((failure) => failure.includes('宣言の上限は 0 件')),
        `上限超過が通ってしまう: ${JSON.stringify(failures)}`
      );
    },
  },
];

// ---------------------------------------------------------------------------
// (6) 実データの対照
// ---------------------------------------------------------------------------

const REAL_DATA: TestCase[] = [
  {
    name: '実データに対して既定の対象で判定が通る（宣言が現況と一致している）',
    run() {
      const { failures, measurements } = judge(REPOSITORY_ROOT);
      const totalAssignments = measurements.reduce((sum, one) => sum + one.assignments, 0);
      const totalDeclarations = measurements.reduce((sum, one) => sum + one.declarations, 0);
      const totalPairs = measurements.reduce((sum, one) => sum + one.pairs, 0);
      return [
        ...expect(measurements.length > 0, '実測が 0 件（既定の対象が空）'),
        ...expect(totalAssignments > 0, '追跡表の割り当てが全機能で 0 件'),
        ...expect(totalDeclarations > 0, '部品別の自己申告が全機能で 0 件'),
        ...expect(totalPairs > 0, '突き合わせの母集団が全機能で 0 組'),
        ...expect(failures.length === 0, `実データで宣言と食い違う: ${JSON.stringify(failures)}`),
      ];
    },
  },
  {
    name: '実データの site-survey は章を複数持ち、章ごとに突き合わせている',
    run() {
      const measurement = measureFeature(REPOSITORY_ROOT, 'site-survey');
      return [
        ...expect(measurement.hasDesignDocument, 'site-survey の design.md が読めない'),
        ...expect(measurement.chapters > 1, `章が分かれていない: ${measurement.chapters}`),
        ...expect(
          measurement.traceabilityTables > 1,
          `追跡表が 1 つ以下: ${measurement.traceabilityTables}`
        ),
        ...expect(
          measurement.componentTables > 1,
          `部品表が 1 つ以下: ${measurement.componentTables}`
        ),
      ];
    },
  },
];

/**
 * 確認の総数の下限
 *
 * 2026-09-02 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。**確認を減らす向きの
 * 書き換えは差分に現れる。**
 */
const MINIMUM_TOTAL_CASES = 30;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則）
 *
 * 本自己検査は「対照群の配列を回して失敗が 0 件なら緑」という形であるため、**配列を空に
 * すると `0/0 件の確認に成功しました` を出して EXIT=0 になる**。それでは自己検査自身が
 * 真空パスを持つ。冒頭が宣言する「母集団が空のまま通る経路を残さない」に反する。
 *
 * **この関門は対照群の配列の要素として書かない。** 配列の要素として持つ形
 * （`scripts/check-counterfactual-evidence.selftest.ts` の `STRUCTURAL[]` が要素として持つ
 * `checkControlsArePresent()`）は、**配列ごと空にすると関門も一緒に消える**——未着手タスク
 * 115.252 の候補3 が名指す自己隠蔽である。ここでは `main()` の中、実行の前に、配列の外側から
 * 貼る。
 */
function guardControlsArePresent(groups: readonly TestGroup[]): void {
  const problems: string[] = [];

  for (const group of groups) {
    if (group.cases.length === 0) {
      problems.push(`対照群「${group.title}」が空です（この群は何も確かめていません）`);
    }
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
    );
  }

  // 回帰の対照群は配列の長さだけでは片側の消失を捕まえられないため、極性ごとに確かめる
  const regression = groups.find((group) => group.cases === REGRESSION);
  if (regression === undefined) {
    problems.push('回帰の対照群（REGRESSION）が groups に組まれていません');
  } else {
    const positives = regression.cases.filter((one) => one.polarity === 'positive').length;
    const negatives = regression.cases.filter((one) => one.polarity === 'negative').length;
    if (positives === 0) {
      problems.push(
        `対照群「${regression.title}」に陽性対照が 1 件もありません（検出器が何も検出しなくても緑になります）`
      );
    }
    if (negatives === 0) {
      problems.push(
        `対照群「${regression.title}」に陰性対照が 1 件もありません（検出器が何にでも反応しても緑になります）`
      );
    }
  }

  // 対照の現況を一行で印字する（タスク 115.252）。関門の判定に使うのと同じ変数から出す。
  // `npx tsx scripts/list-control-polarity-floors.ts` はこの行を読み、下限を貼り直すときの
  // 元の値にする。一覧の側で数え直さないのは、判定と一覧が別々の真実を持たないためである。
  // 本自己検査群が閉じている範囲と閉じていない範囲（三層の記録）は
  // `scripts/check-counterfactual-evidence.selftest.ts` の
  // 「本自己検査群が閉じている範囲と、閉じていない範囲」の節に正典を置く（タスク 115.252）。
  console.log(`📋 対照の現況: 総数 ${total}/${MINIMUM_TOTAL_CASES}（現況/宣言の下限）`);

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
    { title: '検出規則', cases: DETECTION },
    { title: '陽性対照・陰性対照（実データ・115.246 の回帰）', cases: REGRESSION },
    { title: '母集団が空なら失敗する', cases: NON_VACUITY },
    { title: '宣言と対象の双方向の一致', cases: SUBJECT_IDENTITY },
    { title: '判定の型と突き合わせの前提', cases: JUDGEMENT },
    { title: '実データの対照', cases: REAL_DATA },
  ];

  console.log(
    '🔍 追跡表と部品別の自己申告の突き合わせ 自己検査 (scripts/check-design-component-requirements.selftest.ts)'
  );
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
