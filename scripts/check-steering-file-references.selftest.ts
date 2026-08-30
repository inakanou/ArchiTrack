/**
 * @fileoverview steering の実在検査 検出規則の自己検査
 *
 * `scripts/check-steering-file-references.ts` の検出規則が
 *   (1) **緩める向き**——撤去・改名に追随していない記載を取り逃がさないこと、
 *   (2) **狭めすぎる向き**——現に在るファイルの記載や、実在の主張ではない書き方
 *       （ライブラリ名・命名規則の例示・glob・撤去の記録）を告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * MUST_DETECT の各例は**是正前に steering に実在していた実物**である（前七件は
 * タスク 115.169、続く五件はタスク 115.199）。検出器が壊れていれば本検査（0 件）は自明に
 * 通ってしまうため、既知の該当を捕まえられることを先に固定する（陽性対照）。
 * 最後の一件（`errors/ApiError.ts`）だけは、**綴りは実在した実物**だが実物の行は散文の
 * 形（`- \`名前\`: 説明`）だったため、検出規則が見る形（`- \`名前\` - 説明`）へ写してある。
 * 実在の照合が**大小文字を区別する**ことを固定するための対で、MUST_NOT_DETECT 側に
 * 綴りまで一致させた同型の行（`errors/apiError.ts`）を置いてある。
 *
 * 見本が実データの形を写しているかは目視に頼らない。`checkSampleClassesCoverRealData` が
 * `.kiro/steering/*.md` の全行から**実データが実現している類**（規則 × 語の種類）を
 * 数え上げ、その一つ一つが見本にも現れることを求める。同じ関数が、拡張子を持つ主張が
 * 拡張子の種類によらず取り出されること（115.199 で絞りを撤去した点）も、実データの上の
 * 全称命題として固定する。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-file-references.selftest.ts
 *   npm run check:steering-refs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  collectRepositoryFileNames,
  collectSteeringDocuments,
  EXCLUDED_DIRECTORIES,
  extensionOf,
  extractClaim,
  run,
  scanDocument,
  STEERING_DIR,
} from './check-steering-file-references.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-steering-file-references.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** 注釈を取り除いた本体のソース（実行される部分だけを見るため） */
function readExecutableSource(): string {
  return fs
    .readFileSync(ENTRY_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/** 行の注入に用いる、リポジトリ本体の実在ファイル名集合 */
const REAL_FILE_NAMES = collectRepositoryFileNames(ROOT);

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する一行 */
  line?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（緩める向きの誤り）
// すべて 115.169 の是正前に .kiro/steering/*.md に実在した実物
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: 'ツリーの葉に撤去済みコンポーネント（structure.md の site-surveys/ 配下, 115.146 で撤去）',
    line: '│   │       ├── ImageViewer.tsx      # 画像ビューア（Fabric.js）',
    expected: true,
  },
  {
    name: 'ツリーの葉に撤去済みコンポーネント（112.1 で撤去）',
    line: '│   │       ├── LazyImage.tsx        # 遅延読み込み画像',
    expected: true,
  },
  {
    name: '先頭逆引用符の箇条書きに撤去済みストーリー（structure.md の Storybook 一覧）',
    line: '- `ImageViewer.stories.tsx` - 画像ビューア',
    expected: true,
  },
  {
    name: '先頭逆引用符の箇条書きに撤去済みストーリー（112.1 で撤去）',
    line: '- `LazyImage.stories.tsx` - 遅延読み込み画像',
    expected: true,
  },
  {
    name: 'ツリーの葉に改名前のテスト名（audit-log-archive.service.test.ts へ改名）',
    line: '│   │       │   ├── archive.service.test.ts # ログアーカイブ（6テスト）',
    expected: true,
  },
  {
    name: 'ツリーの葉に移動・改名前のテスト名（unit/config/env.test.ts へ）',
    line: '│   │           └── env-validator.test.ts # 環境変数バリデーション（14テスト）',
    expected: true,
  },
  {
    name: '字下げされた箇条書きに移動・改名前のテスト名（tech.md のテスト一覧）',
    line: '    - `env-validator.test.ts` - 環境変数バリデーション（14テスト）',
    expected: true,
  },
  {
    name: 'ツリーの葉に .jsx 時代のエントリ（structure.md, 実体は App.tsx。115.199 で是正）',
    line: '│   │   ├── App.jsx         # メインAppコンポーネント',
    expected: true,
  },
  {
    name: 'ツリーの葉に .jsx 時代のエントリ（structure.md, 実体は main.tsx。115.199 で是正）',
    line: '│   │   └── main.jsx        # エントリーポイント',
    expected: true,
  },
  {
    name: 'ツリーの葉に .js 時代の設定（structure.md, 実体は vite.config.ts。115.199 で是正）',
    line: '│   ├── vite.config.js      # Vite設定',
    expected: true,
  },
  {
    name: '箇条書きに存在しないワークフロー（tech.md, 実在は ci.yml のみ。115.199 で是正）',
    line: '- `.github/workflows/e2e-tests.yml` - CI/CD E2Eテストワークフロー',
    expected: true,
  },
  {
    name: '命名規則の例示を主張の形で書いた箇条書き（記法違反。ラベル前置へ直させる）',
    line: '- `index.js` - ディレクトリのエントリーポイント・エクスポート集約',
    expected: true,
  },
  {
    name: '大小文字だけが食い違う箇条書き（実体は errors/apiError.ts。structure.md の散文にあった綴り）',
    line: '- `errors/ApiError.ts` - カスタムAPIエラークラス',
    expected: true,
  },
];

// ============================================================================
// 捕捉してはならない書き方（狭めすぎる向きの誤り＝働いている記述の誤爆）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '現に在るコンポーネントのツリーの葉',
    line: '│   │       ├── AnnotationEditor.tsx # 注釈エディタ（Fabric.js）',
    expected: false,
  },
  {
    name: '現に在るストーリーの箇条書き',
    line: '- `SiteSurveyForm.stories.tsx` - 現場調査フォーム',
    expected: false,
  },
  {
    name: '注釈にライブラリ名を含むツリーの葉（葉の名前だけを見る）',
    line: '│   │   ├── annotation.service.ts # 注釈管理（Fabric.js JSON保存）',
    expected: false,
  },
  {
    name: '命名規則の例示（逆引用符が先頭に来ない）',
    line: '  - コンポーネント: PascalCase (`UserProfile.tsx`)',
    expected: false,
  },
  {
    name: '命名規則の例示（ユーティリティ）',
    line: '  - ユーティリティ: camelCase (`formatDate.ts`)',
    expected: false,
  },
  {
    name: 'glob を含む箇条書き',
    line: '- `*.stories.tsx` - Storybookストーリーファイル（コンポーネントバリアント定義）',
    expected: false,
  },
  {
    name: 'glob を含むツリーの葉',
    line: '│   │   └── *.spec.ts',
    expected: false,
  },
  {
    name: '依存パッケージの箇条書き（逆引用符の直後が版数）',
    line: '- `decimal.js` ^10.6.0 - 高精度10進数計算（数量計算）',
    expected: false,
  },
  {
    name: '依存パッケージの箇条書き（OCR）',
    line: '- `tesseract.js` ^7.0.0 - OCR文字認識（受領見積書構造化データ抽出、再実行/リトライ機能）',
    expected: false,
  },
  {
    name: 'ディレクトリのツリー項目（末尾スラッシュ）',
    line: '│   │   ├── site-surveys/            # 現場調査コンポーネント',
    expected: false,
  },
  {
    name: '撤去を記録した同期ノートの散文（現存の主張ではない）',
    line: '_最終更新: 2026-08-05（Steering Sync: backend `estimate-draft.service.ts` 追加と `estimate-export.service.ts` 撤去）_',
    expected: false,
  },
  {
    name: '命名規則の特殊ファイル（ラベルを前置した例示の形。逆引用符が行頭に来ない）',
    line: '- **エントリーポイント**: `index.js` - ディレクトリのエクスポート集約',
    expected: false,
  },
  {
    name: '現に在る設定ファイルの箇条書き（.js を照合対象にしても告発しない）',
    line: '- `frontend/eslint.config.js` - ESLint設定（Flat Config形式）',
    expected: false,
  },
  {
    name: '現に在るワークフローの箇条書き（.yml を照合対象にしても告発しない）',
    line: '- `.github/workflows/ci.yml` - CI/CDワークフロー',
    expected: false,
  },
  {
    name: '現に在る設定の箇条書き（.json を照合対象にしても告発しない）',
    line: '- `tsconfig.json` - TypeScript設定（E2Eテスト用、Incremental Build有効）',
    expected: false,
  },
  {
    name: '現に在るシェルスクリプトのツリーの葉（.sh を照合対象にしても告発しない）',
    line: '│   ├── docker-entrypoint.sh # Docker起動時依存関係チェック',
    expected: false,
  },
  {
    name: '拡張子を持たない葉（Dockerfile。拡張子なしは 115.198 の所管との境界）',
    line: '│   ├── Dockerfile          # 本番環境Dockerイメージ',
    expected: false,
  },
  {
    name: 'ドットで始まり拡張子を持たない葉（.prettierrc。追跡外の .env を巻き込まない）',
    line: '│   ├── .prettierrc         # Prettier設定',
    expected: false,
  },
  {
    name: '拡張子を持たない箇条書き（Git フック名。拡張子なしは 115.198 の所管との境界）',
    line: '- `commit-msg` - コミットメッセージ検証スクリプト',
    expected: false,
  },
  {
    name: 'ディレクトリの箇条書き（末尾スラッシュ）',
    line: '- `.kiro/specs/user-authentication/` - ユーザー認証機能 ✅実装完了',
    expected: false,
  },
  {
    // 実データのディレクトリ名にドットを含むものは無く（`.kiro/` などは先頭ドットのみで
    // 拡張子を持たない）、末尾スラッシュの規則は拡張子の規則と重なって働いている。
    // 規則が**単独で**効いていることを固定するため、ドットを含む名前の合成例を置く。
    // これが無いと、末尾スラッシュの除外を落とす変異が誰にも捕まらない。
    name: 'ドットを含むディレクトリのツリーの葉（合成例。末尾スラッシュの規則が単独で効く）',
    line: '│   ├── generated/prisma.client/ # 生成物ディレクトリ',
    expected: false,
  },
  {
    name: '大小文字まで一致する箇条書き（上の MUST_DETECT の対照。同じ経路で告発しない）',
    line: '- `errors/apiError.ts` - カスタムAPIエラークラス',
    expected: false,
  },
];

// ============================================================================
// 走査対象と前提条件（機構を見る）
// ============================================================================

/** 走査対象が 0 件のとき合格にしないこと（第3原則） */
function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ref-empty-'));
  try {
    // 本体を一時ルート配下の scripts/ へ複製する。本体は自身の位置から ROOT を導くため、
    // これで「steering 文書が一件も無いリポジトリ」を再現できる。
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));

    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(
        `走査対象が 0 件でも終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    if (!(executed.stderr ?? '').includes('一件も見つかりませんでした')) {
      failures.push('走査対象 0 件を「合格」と告げている疑いがある');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 走査から報告までの一連が実際に働くこと。
 * `extractClaim` 単体が正しくても、列挙・読み込み・集計のどこかが壊れていれば
 * 本検査は「0 件」で自明に合格してしまう。仮の steering を作り、
 * 撤去済みの記載を置いたときに findings が立ち、在る記載では立たないことを固定する。
 */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ref-e2e-'));
  try {
    const steeringDir = path.join(tempRoot, STEERING_DIR);
    fs.mkdirSync(steeringDir, { recursive: true });
    // 実在させる側のファイル（basename の照合が「在る」を正しく認めることの対照）
    fs.mkdirSync(path.join(tempRoot, 'frontend', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'frontend', 'src', 'Present.tsx'), 'export {};\n');
    fs.writeFileSync(path.join(tempRoot, 'frontend', 'src', 'Present.stories.tsx'), 'export {};\n');
    /**
     * 合格側の見本。**実データが持つ二つの規則をどちらも写す**（ツリーの葉と
     * 行頭逆引用符の箇条書き）。葉だけの見本にすると、箇条書きの規則が主張として
     * 数えられなくなる変異——本検査の報告が 718 件 → 567 件へ動く変異——を
     * 「主張 1 件」の期待が素通りさせてしまう（115.197 の教訓）。
     */
    const PASSING_DOCUMENT = [
      '# 構造',
      '│   ├── Present.tsx        # 在るコンポーネント',
      '- `Present.stories.tsx` - 在るストーリー',
    ].join('\n');
    fs.writeFileSync(
      path.join(steeringDir, 'structure.md'),
      [
        '# 構造',
        '│   ├── Present.tsx        # 在るコンポーネント',
        '│   ├── Removed.tsx        # 撤去済みコンポーネント',
        '- `Removed.stories.tsx` - 撤去済みストーリー',
        '- `*.stories.tsx` - Storybookストーリーファイル',
      ].join('\n')
    );

    const result = run({ root: tempRoot });
    if (result.scannedFiles.length !== 1) {
      failures.push(`仮の steering を1件列挙できていない（${result.scannedFiles.length} 件）`);
    }
    const detected = result.findings.map((finding) => `${finding.line}:${finding.reference}`);
    const expected = ['3:Removed.tsx', '4:Removed.stories.tsx'];
    if (detected.join(' / ') !== expected.join(' / ')) {
      failures.push(
        `検出が期待と違う。期待「${expected.join(' / ')}」／` +
          `実際「${detected.join(' / ') || '（無し）'}」`
      );
    }

    // ビルド生成物に旧名が残っていても「在る」と数えないこと
    fs.mkdirSync(path.join(tempRoot, 'frontend', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'frontend', 'dist', 'Removed.tsx'), 'export {};\n');
    const withArtifact = run({ root: tempRoot });
    if (withArtifact.findings.length !== expected.length) {
      failures.push('ビルド生成物に残った旧名を実在として数えてしまう（撤去の検知が効かなくなる）');
    }

    // 撤去済みの記載を落とせば合格すること（常時失敗の裏返しを塞ぐ）
    fs.writeFileSync(path.join(steeringDir, 'structure.md'), PASSING_DOCUMENT);
    const clean = run({ root: tempRoot });
    if (clean.claims !== 2) {
      failures.push(`合格側の見本から主張を 2 件取り出せていない（${clean.claims} 件）`);
    }
    if (clean.findings.length !== 0) {
      failures.push(
        `是正後の材料で該当が残る: ${clean.findings.map((f) => f.reference).join(' / ')}`
      );
    }

    // 終了コードまで含めた挙動（報告の詐称・件数の間引きを塞ぐ）
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    fs.writeFileSync(
      path.join(steeringDir, 'structure.md'),
      ['# 構造', '│   ├── Removed.tsx        # 撤去済みコンポーネント'].join('\n')
    );
    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(`該当がある材料で終了コードが 1 にならなかった（status=${executed.status}）`);
    }
    const stderr = executed.stderr ?? '';
    if (!stderr.includes('合計 1 件 / 1 ファイル（走査 1 ファイル）')) {
      const actual = /合計 .*ファイル）/.exec(stderr)?.[0] ?? '（要約行が無い）';
      failures.push(`報告される件数が期待と違う。実際「${actual}」`);
    }

    // 合格の側でも、全称命題の台となる主張の件数を報告すること（0 件の合格を見分けられるように）
    fs.writeFileSync(path.join(steeringDir, 'structure.md'), PASSING_DOCUMENT);
    const passed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (passed.status !== 0) {
      failures.push(`是正後の材料で終了コードが 0 にならなかった（status=${passed.status}）`);
    }
    if (!(passed.stdout ?? '').includes('実在を照合した主張 2 件')) {
      failures.push(
        `合格の報告が主張の件数を示していない。実際「${(passed.stdout ?? '').trim()}」`
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * リポジトリ本体の steering 文書を**一件も落とさずに**列挙できること。
 *
 * 「一件でも列挙できていれば良い」では、`collectSteeringDocuments` に名指しの除外を
 * 差し込む間引きを見逃す。本検査の側で `.kiro/steering` を独立に走査し、
 * `.md` の集合が実装の戻りと完全一致することを求める。
 */
function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];

  const expected = fs
    .readdirSync(path.join(ROOT, STEERING_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${STEERING_DIR}/${entry.name}`)
    .sort();

  const documents = collectSteeringDocuments(ROOT, STEERING_DIR);
  if (documents.length === 0) {
    failures.push('リポジトリ本体の steering 文書が一件も列挙できていない');
  }
  for (const required of [`${STEERING_DIR}/structure.md`, `${STEERING_DIR}/tech.md`]) {
    if (!documents.includes(required)) {
      failures.push(`走査対象に ${required} が含まれていない`);
    }
  }
  for (const document of expected) {
    if (!documents.includes(document)) {
      failures.push(`走査対象から落ちている steering がある: ${document}`);
    }
  }
  for (const document of documents) {
    if (!expected.includes(document)) {
      failures.push(`実在しない走査対象が混ざっている: ${document}`);
    }
  }

  // 走査件数の下限。既定の product/tech/structure を消して件数を減らす形を塞ぐ
  const MINIMUM_STEERING_DOCUMENTS = 3;
  if (documents.length < MINIMUM_STEERING_DOCUMENTS) {
    failures.push(
      `走査対象が ${MINIMUM_STEERING_DOCUMENTS} 件を下回っている（${documents.length} 件）`
    );
  }
  return failures;
}

/**
 * リポジトリの実在ファイル走査が本物であること。
 * この集合が過大（生成物込み）だと撤去を見逃し、過小だと在るファイルを告発する。
 */
function checkRepositoryFileNamesAreReal(): string[] {
  const failures: string[] = [];
  const present = ['AnnotationEditor.tsx', 'imageFitScale.ts', 'package.json', 'tsconfig.json'];
  for (const name of present) {
    if (!REAL_FILE_NAMES.has(name)) {
      failures.push(`実在するファイルが実在集合に無い: ${name}`);
    }
  }
  const absent = ['ImageViewer.tsx', 'LazyImage.tsx', 'ImageViewer.stories.tsx'];
  for (const name of absent) {
    if (REAL_FILE_NAMES.has(name)) {
      failures.push(
        `撤去済みのファイルが実在集合に入っている: ${name}（生成物が走査から外れていない疑い）`
      );
    }
  }
  // 生成物ディレクトリが外れていること（撤去の検知が効かなくなる向きを塞ぐ）
  for (const directory of ['node_modules', 'dist', 'coverage', 'storybook-static']) {
    if (!EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ビルド生成物 ${directory} が走査から外れていない`);
    }
  }
  // 逆に、本体のソース木を丸ごと外していないこと（過検出へ倒れる向き）
  for (const directory of ['frontend', 'backend', 'e2e', 'scripts', '.kiro']) {
    if (EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ソース木 ${directory} が走査から外れている（在るファイルを告発してしまう）`);
    }
  }
  return failures;
}

/**
 * 検出結果を名指しで逃がす経路が無いこと（許容リストの名前ではなく機構を見る）。
 *
 * 「`ImageViewer.tsx` だけは見逃す」といった逃がしは、本体のソースに**ファイル名の
 * 文字列リテラル**として現れる。走査・判定・集計の各関数の本体にその形が無いことと、
 * `run` が findings を間引かないことを固定する。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

  /**
   * ファイル名・拡張子らしき文字列リテラル（許容リスト／拡張子の名指しの列挙の実体）。
   * 115.199 で拡張子の絞りを撤去したため、`.ts` だけでなく**あらゆる拡張子**の
   * リテラルを疑う。名指しの列挙が本体へ戻ればここで捕まる。
   */
  const FILE_NAME_LITERAL = /['"`][A-Za-z0-9_@-][A-Za-z0-9_@.-]*\.[A-Za-z][A-Za-z0-9]{0,9}['"`]/;

  /**
   * 拡張子そのものの文字列リテラル（`'.ts'`）。主張の抽出と拡張子の判定は
   * **拡張子の種類を一切知ってはならない**ため、この二つの本体にだけ適用する。
   * 走査対象の選別（`.md` の steering 文書を選ぶ）は主張の絞りではないので対象外。
   */
  const EXTENSION_LITERAL = /['"`]\.[A-Za-z][A-Za-z0-9]{0,9}['"`]/;

  const bodies: Array<{ label: string; declaration: string }> = [
    { label: 'extractClaim', declaration: 'export function extractClaim(' },
    { label: 'scanDocument', declaration: 'export function scanDocument(' },
    { label: 'collectSteeringDocuments', declaration: 'export function collectSteeringDocuments(' },
    {
      label: 'collectRepositoryFileNames',
      declaration: 'export function collectRepositoryFileNames(',
    },
    { label: 'run', declaration: 'export function run(' },
  ];

  for (const body of bodies) {
    const start = source.indexOf(body.declaration);
    if (start < 0) {
      failures.push(`${body.label} の宣言が見つからない（改名されている疑い）`);
      continue;
    }
    // 次の関数宣言までを本体とみなす
    const rest = source.slice(start + body.declaration.length);
    const nextDeclaration = rest.search(/\nexport (?:function|const) |\nfunction /);
    const text = nextDeclaration < 0 ? rest : rest.slice(0, nextDeclaration);
    if (FILE_NAME_LITERAL.test(text)) {
      failures.push(
        `${body.label} の本体にファイル名の文字列リテラルがある（名指しの逃がしの疑い）: ` +
          `${FILE_NAME_LITERAL.exec(text)?.[0]}`
      );
    }
    if (body.label === 'run' && /\.filter\(|\.slice\(|\.splice\(/.test(text)) {
      failures.push('run が findings を間引いている');
    }
  }

  // 拡張子の判定にも名指しの列挙が無いこと。`extensionOf` は path の意味だけで決める
  const extensionStart = source.indexOf('export function extensionOf(');
  if (extensionStart < 0) {
    failures.push('extensionOf の宣言が見つからない（改名されている疑い）');
  } else {
    const rest = source.slice(extensionStart);
    const next = rest.slice(1).search(/\nexport (?:function|const) |\nfunction /);
    const text = next < 0 ? rest : rest.slice(0, next + 1);
    if (EXTENSION_LITERAL.test(text)) {
      failures.push(
        `extensionOf の本体に拡張子の文字列リテラルがある（名指しの列挙の復活）: ` +
          `${EXTENSION_LITERAL.exec(text)?.[0]}`
      );
    }
  }

  // 主張の抽出も拡張子の種類を知ってはならない
  const claimStart = source.indexOf('export function extractClaim(');
  if (claimStart < 0) {
    failures.push('extractClaim の宣言が見つからない（改名されている疑い）');
  } else {
    const rest = source.slice(claimStart);
    const next = rest.slice(1).search(/\nexport (?:function|const) |\nfunction /);
    const text = next < 0 ? rest : rest.slice(0, next + 1);
    if (EXTENSION_LITERAL.test(text)) {
      failures.push(
        `extractClaim の本体に拡張子の文字列リテラルがある（名指しの列挙の復活）: ` +
          `${EXTENSION_LITERAL.exec(text)?.[0]}`
      );
    }
  }
  return failures;
}

/**
 * 検出しないと明記した限界が、実際にその形でだけ働いていること。
 * 「散文は見ない」は見逃しであって合格ではないため、**限界そのものを固定**して
 * 後任が「検出されないから問題が無い」と読み違えないようにする。
 */
function checkDocumentedLimits(): string[] {
  const failures: string[] = [];
  const knownEmpty: ReadonlySet<string> = new Set<string>();

  // (a) basename しか照合しない: ディレクトリが違っても在れば検出しない
  const moved = scanDocument(
    'sample/structure.md',
    '│   ├── AnnotationEditor.tsx # 別のディレクトリに書かれていても検出しない',
    REAL_FILE_NAMES
  );
  if (moved.length !== 0) {
    failures.push('限界(a)が崩れている: basename が在るのに検出してしまう');
  }

  // (b) 散文の言及は主張として扱わない
  const prose = scanDocument(
    'sample/structure.md',
    'backend `estimate-export.service.ts` を撤去した（同期記録）',
    knownEmpty
  );
  if (prose.length !== 0) {
    failures.push('限界(b)が崩れている: 散文の言及を主張として扱っている');
  }

  // (c) 拡張子を持たない語は主張として扱わない（115.198 の識別子検査との境界）
  for (const line of [
    '│   ├── Dockerfile          # 本番環境Dockerイメージ',
    '│   ├── .prettierrc         # Prettier設定',
    '- `commit-msg` - コミットメッセージ検査',
  ]) {
    if (extractClaim(line) !== null) {
      failures.push(
        `限界(c)が崩れている: 拡張子を持たない語を主張として取り出している（${line.trim()}）`
      );
    }
  }

  // (c') 逆に、拡張子を持つ語は**拡張子の種類によらず**主張として取り出すこと。
  //      115.199 以前はここが `.ts` / `.tsx` / `.css` に絞られており真の失効を見逃した
  for (const [line, expected] of [
    ['│   ├── vite.config.js      # Vite設定', 'vite.config.js'],
    ['│   │   ├── App.jsx         # メインAppコンポーネント', 'App.jsx'],
    [
      '- `.github/workflows/e2e-tests.yml` - CI/CD E2Eテストワークフロー',
      '.github/workflows/e2e-tests.yml',
    ],
    ['│   ├── nginx.conf          # 本番環境nginx設定', 'nginx.conf'],
    ['│   ├── railway.toml        # Railway デプロイ設定', 'railway.toml'],
  ] as const) {
    if (extractClaim(line) !== expected) {
      failures.push(`限界(c')が崩れている: 拡張子で網を狭めている（${expected} を取り出せない）`);
    }
  }

  // (c'') 拡張子の判定そのもの。ドットで始まるだけの名前は拡張子を持たないと見なす
  for (const [token, expected] of [
    ['vite.config.ts', '.ts'],
    ['.github/workflows/ci.yml', '.yml'],
    ['Dockerfile.dev', '.dev'],
    ['nginx.conf', '.conf'],
    ['Dockerfile', null],
    ['.prettierrc', null],
    ['.env', null],
    ['commit-msg', null],
  ] as const) {
    if (extensionOf(token) !== expected) {
      failures.push(
        `拡張子の判定が違う: ${token} → 期待 ${expected ?? 'null'} / 実際 ${extensionOf(token) ?? 'null'}`
      );
    }
  }

  // (d) 主張の形そのものは働いている（(a)〜(c) が「常に null」ではないことの対照）
  if (extractClaim('│   ├── ImageViewer.tsx      # 画像ビューア') !== 'ImageViewer.tsx') {
    failures.push('主張の抽出そのものが働いていない（限界の確認が自明に通っている）');
  }
  return failures;
}

/**
 * 見本が**実データの形を写している**ことを、類の数え上げで確かめる。
 *
 * 検出規則が一行に対して下す判断は「どちらの規則に当たるか × その語がどの種類か」で
 * 決まる。`.kiro/steering/*.md` の全行を走って**実データが実現している類**を数え上げ、
 * その一つ一つが MUST_DETECT / MUST_NOT_DETECT の見本にも現れていることを求める。
 * 実データにしか無い類が残っていれば、見本はその形を一度も試していない。
 */
function classifyLine(lineText: string): string | null {
  const tree = /^[\s│]*(?:├──|└──)\s+(\S+)/.exec(lineText);
  const bullet = /^\s*-\s+`([^`]+)`\s+-\s/.exec(lineText);
  const rule = tree !== null ? 'tree' : bullet !== null ? 'bullet' : null;
  const token = (tree ?? bullet)?.[1];
  if (rule === null || token === undefined) return null;
  if (token.includes('*')) return `${rule}:glob`;
  if (token.endsWith('/')) return `${rule}:directory`;
  // 拡張子の有無は本体の `extensionOf` に**頼らずに**判定する。実装を写して数えると、
  // 実装が拡張子を落としたときに類そのものが消え、数え上げが自明に通ってしまう
  if (path.posix.extname(path.posix.basename(token)).length === 0) return `${rule}:no-extension`;
  return `${rule}:extension`;
}

function checkSampleClassesCoverRealData(): string[] {
  const failures: string[] = [];
  const documents = collectSteeringDocuments(ROOT, STEERING_DIR);

  const byData = new Map<string, string>();
  const claimExtensions = new Set<string>();
  let unextracted = 0;
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
    source.split(/\r?\n/).forEach((lineText, index) => {
      const label = classifyLine(lineText);
      if (label === null) return;
      if (!byData.has(label)) byData.set(label, `${relativePath}:${index + 1}`);
      if (!label.endsWith(':extension')) return;
      // 拡張子を持つ語は、拡張子の種類によらず主張として取り出されなければならない
      if (extractClaim(lineText) === null) {
        unextracted += 1;
        failures.push(
          `拡張子を持つ主張が取り出せていない: ${relativePath}:${index + 1} ${lineText.trim()}`
        );
        return;
      }
      claimExtensions.add(
        path.posix.extname(path.posix.basename(extractClaim(lineText) as string)).toLowerCase()
      );
    });
  }

  const bySamples = new Set<string>();
  for (const testCase of [...MUST_DETECT, ...MUST_NOT_DETECT]) {
    const label = classifyLine(testCase.line ?? '');
    if (label !== null) bySamples.add(label);
  }

  for (const [label, where] of byData) {
    if (!bySamples.has(label)) {
      failures.push(`実データに在る類を見本が写していない: ${label}（例 ${where}）`);
    }
  }

  // 数え上げそのものが空振りしていないこと
  const MINIMUM_CLASSES = 4;
  if (byData.size < MINIMUM_CLASSES) {
    failures.push(`実データから数え上げた類が ${byData.size} 種しかない（走査の空振りの疑い）`);
  }
  // 拡張子の網が実際に広いこと。`.ts` / `.tsx` / `.css` の三種へ戻せばここで落ちる
  const MINIMUM_EXTENSIONS = 10;
  if (claimExtensions.size < MINIMUM_EXTENSIONS) {
    failures.push(
      `主張として照合された拡張子が ${claimExtensions.size} 種しかない` +
        `（${MINIMUM_EXTENSIONS} 種を下回る。拡張子で網を狭めた疑い）: ` +
        `${[...claimExtensions].sort().join(' ')}`
    );
  }
  if (unextracted > 0) {
    failures.push(`拡張子を持つのに主張として扱われない記載が ${unextracted} 件ある`);
  }
  return failures;
}

/**
 * 主張が一件も取れないとき合格にしないこと（第3原則・走査の空振り）。
 * steering 文書は在るのに検出規則が何も取り出さない状態は、0 件の自明な合格になる。
 */
function checkVacuousScanFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ref-vacuous-'));
  try {
    const steeringDir = path.join(tempRoot, STEERING_DIR);
    fs.mkdirSync(steeringDir, { recursive: true });
    // 文書は在るが、検出規則に当たる行が一つも無い
    fs.writeFileSync(
      path.join(steeringDir, 'structure.md'),
      ['# 構造', '散文だけの steering。`AnnotationEditor.tsx` は散文中の言及である。'].join('\n')
    );
    const result = run({ root: tempRoot });
    if (result.claims !== 0) {
      failures.push(`主張が 0 件のはずが ${result.claims} 件と数えられた`);
    }

    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(
        `主張 0 件でも終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    if (!(executed.stderr ?? '').includes('実在を照合できる記載が一件もありません')) {
      failures.push('主張 0 件を「合格」と告げている疑いがある');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 報告される主張の件数が、**独立の実装で**数え直した値と一致すること（件数の詐称を塞ぐ）。
 *
 * 本体の `countClaims` を呼んで数え直してはならない。報告側も検査側も同じ関数を通るため、
 * `countClaims` 自体の誤りが両側で相殺されて見えなくなる（同語反復）。実測でも、
 * `countClaims` から行頭逆引用符の箇条書きを除く変異を入れると本検査の報告は
 * 718 件 → 567 件へ動くのに、`countClaims` で数え直す形の確認は緑のままだった。
 * よってここでは自己検査側の独立実装 `classifyLine` で数え、報告と突き合わせる。
 */
function checkClaimCountIsHonest(): string[] {
  const failures: string[] = [];
  const documents = collectSteeringDocuments(ROOT, STEERING_DIR);
  let expected = 0;
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
    for (const lineText of source.split(/\r?\n/)) {
      if (classifyLine(lineText)?.endsWith(':extension') === true) expected += 1;
    }
  }
  const result = run();
  if (result.claims !== expected) {
    failures.push(
      `報告された主張の件数が独立の数え直しと違う（報告 ${result.claims} / 実測 ${expected}）`
    );
  }
  if (expected === 0) {
    failures.push('リポジトリ本体の steering から主張が一件も取れていない');
  }
  return failures;
}

/** 陽性対照そのものが空でないこと（0 件の自明な合格を塞ぐ） */
function checkPositiveControlsArePresent(): string[] {
  const failures: string[] = [];
  if (MUST_DETECT.length === 0) failures.push('MUST_DETECT が空である');
  if (MUST_NOT_DETECT.length === 0) failures.push('MUST_NOT_DETECT が空である');
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: '主張が 0 件のとき合格にしない（走査の空振り）',
    expected: false,
    custom: checkVacuousScanFails,
  },
  {
    name: '報告される主張の件数が独立の数え直しと一致する',
    expected: false,
    custom: checkClaimCountIsHonest,
  },
  {
    name: '見本が実データの実現する類をすべて写している（拡張子の網の広さを含む）',
    expected: false,
    custom: checkSampleClassesCoverRealData,
  },
  {
    name: '検出結果を名指しで逃がす経路が無い（許容リストの名前ではなく機構を見る）',
    expected: false,
    custom: checkNoFindingsNarrowing,
  },
  {
    name: '走査から報告までが実際に働く（仮の steering で撤去済みの記載を捕まえる）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: 'リポジトリ本体の steering を実際に列挙できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: '実在ファイル集合が本物である（生成物を含めず、ソース木を落とさない）',
    expected: false,
    custom: checkRepositoryFileNamesAreReal,
  },
  {
    name: '明記した限界が、その形でだけ働いている',
    expected: false,
    custom: checkDocumentedLimits,
  },
  {
    name: '陽性対照が空でない',
    expected: false,
    custom: checkPositiveControlsArePresent,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const findings = scanDocument('sample/structure.md', testCase.line ?? '', REAL_FILE_NAMES);
  const detected = findings.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${findings.map((f) => f.reference).join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '捕捉しなければならない書き方（115.169 の是正前の実物）', cases: MUST_DETECT },
    { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 steering の実在検査 検出規則 自己検査 (scripts/check-steering-file-references.selftest.ts)'
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
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
}

main();
