/**
 * @fileoverview steering が現存物として挙げるファイルの実在検査
 *
 * `.kiro/steering/` は毎セッション読み込まれる「**現在の**プロジェクト構成」の記述である。
 * 設計文書（`.kiro/specs/<feature>/design.md`）が当時の判断を残す歴史記録であるのとは扱いが異なり、
 * steering に列挙されたファイルは「いま在る」という主張として読まれる。
 *
 * タスク 115.169 の実測では、この主張が**撤去のたびに追随していなかった**。
 *   - `ImageViewer.tsx` / `ImageViewer.stories.tsx`（タスク 115.146 で撤去）
 *   - `LazyImage.tsx` / `LazyImage.stories.tsx`（タスク 112.1 で撤去）
 *   - `archive.service.test.ts`（`audit-log-archive.service.test.ts` へ改名）
 *   - `env-validator.test.ts`（`unit/config/env.test.ts` へ移動・改名。structure.md と tech.md の両方）
 * いずれも「撤去したタスクの境界の外」で失効しており、**規約は境界内でしか働かない**ため
 * 人手では追随しない。115.169 は個別の是正に加えて、再発を機械で検知する本検査を置いた。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-file-references.ts [--verbose] [--json]
 *   npm run check:steering-refs
 *
 * 検出する形（いずれも「このファイルが在る」と述べている形）:
 *   ディレクトリツリーの葉    `│   ├── ImageViewer.tsx      # 画像ビューア`
 *   先頭が逆引用符の箇条書き  `- \`ImageViewer.stories.tsx\` - 画像ビューア`
 *                             `    - \`env-validator.test.ts\` - 環境変数バリデーション`
 *
 * 判定:
 *   リポジトリ内に**同じ basename のファイルが一つも無い**ときに失格とする。
 *   ビルド生成物（node_modules / dist / build / coverage / storybook-static /
 *   playwright-report / test-results）は走査から外す。生成物に残った旧名を「在る」と
 *   数えてしまうと、撤去の検知が効かなくなるためである。
 *
 * 検出しない形（限界。すべて見逃し側へ倒してある）:
 *   - **basename しか照合しない。** ツリーの字下げは手書きで、実際に structure.md の
 *     `site-surveys/` 配下は親より浅く書かれているなど、字下げからパスを組み立てると
 *     **在るファイルを誤って告発する**。下界の過大主張は上界の過小主張より危険であるため、
 *     ディレクトリの移動（`utils/foo.ts` → `config/foo.ts`）は検出しない。
 *   - **拡張子は `.ts` / `.tsx` / `.css` に限る。** steering は `.js` / `.jsx` を
 *     ファイル名以外の意味でも使う（`Fabric.js`・`Node.js`・`decimal.js`・`tesseract.js` は
 *     ライブラリ名、`index.js` は命名規則の例示）。これらは実在の主張ではないため、
 *     拡張子の側で網を狭めて誤検出を避ける。結果として `vite.config.js` のような
 *     真の失効は検出しない。
 *   - **散文の言及は見ない。** `_最終更新: …（… `estimate-export.service.ts` 撤去 …）_` の
 *     ような同期記録は「撤去した」と述べており現存の主張ではない。ツリーの葉と
 *     先頭逆引用符の箇条書きだけを主張として扱う。
 *   - **glob（`*` を含む形）とディレクトリ（末尾 `/`）は対象外。**
 *   - 設計文書（`.kiro/specs/<feature>/design.md`）は走査しない。そちらは歴史記録であり、
 *     参照先の実在はタスク 115.173 の担当である。
 *
 * これらの限界は**是正できない限界ではない**ものを含む（拡張子の絞りは steering 側の
 * 書き方が整えば緩められる）。ここでは誤検出を出さない側に倒した選択であることを明記し、
 * 許容リストによる個別の逃がしは一切置いていない。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

export interface SteeringRefFinding {
  /** リポジトリ相対の steering 文書パス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 実在しないと判定した記載（例: `ImageViewer.tsx`） */
  reference: string;
  /** 検出行の内容（前後の空白を除く） */
  snippet: string;
}

export interface RunOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** steering 文書の置き場所（リポジトリ相対） */
  steeringDir?: string;
}

export interface RunResult {
  findings: SteeringRefFinding[];
  scannedFiles: string[];
  steeringDir: string;
}

// ============================================================================
// 走査対象の決定
// ============================================================================

/** steering 文書の置き場所 */
export const STEERING_DIR = '.kiro/steering';

/**
 * リポジトリ走査から外すディレクトリ（すべてビルド生成物・取得物）。
 * ここに挙げたものは「在るファイル」として数えない。生成物に旧名が残っていても
 * 撤去を検知できるようにするためであり、**検出を緩める向きには働かない**。
 */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/** `.kiro/steering/*.md` を列挙する */
export function collectSteeringDocuments(
  root: string,
  steeringDir: string = STEERING_DIR
): string[] {
  const absoluteDir = path.join(root, steeringDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const documents: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    documents.push(`${steeringDir}/${entry.name}`);
  }
  return documents.sort();
}

/** リポジトリに実在するファイルの basename 集合を作る */
export function collectRepositoryFileNames(root: string): Set<string> {
  const names = new Set<string>();
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      } else {
        names.add(entry.name);
      }
    }
  }
  return names;
}

// ============================================================================
// 検出規則
// ============================================================================

/** 実在を照合する拡張子（上の「検出しない形」に理由を記した） */
export const CHECKED_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.css'];

/** ディレクトリツリーの葉（`├── name` / `└── name`） */
const TREE_ENTRY = /^[\s│]*(?:├──|└──)\s+(\S+)/;

/** 先頭が逆引用符の箇条書き（`- \`name\` - 説明`）。字下げは許す */
const BACKTICKED_BULLET = /^\s*-\s+`([^`]+)`\s+-\s/;

/**
 * 一行から「このファイルが在る」という主張を取り出す。主張でなければ null。
 *
 * 依存パッケージの箇条書き（`- \`decimal.js\` ^10.6.0 - …`）は、逆引用符の直後が
 * ` - ` ではなく版数であるため `BACKTICKED_BULLET` に当たらない。命名規則の例示
 * （`- コンポーネント: PascalCase (\`UserProfile.tsx\`)`）は逆引用符が先頭に来ないため
 * 当たらない。いずれも**書き方の形**で外れるのであって、名指しの除外ではない。
 */
export function extractClaim(lineText: string): string | null {
  const matched = TREE_ENTRY.exec(lineText) ?? BACKTICKED_BULLET.exec(lineText);
  if (matched === null) return null;
  const token = matched[1];
  if (token === undefined) return null;
  if (token.includes('*')) return null;
  if (token.endsWith('/')) return null;
  if (!CHECKED_EXTENSIONS.some((extension) => token.endsWith(extension))) return null;
  return token;
}

/** 一つの steering 文書から、実在しないファイルの記載を検出する */
export function scanDocument(
  relativePath: string,
  source: string,
  knownFileNames: ReadonlySet<string>
): SteeringRefFinding[] {
  const findings: SteeringRefFinding[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    const claim = extractClaim(lineText);
    if (claim === null) return;
    if (knownFileNames.has(path.posix.basename(claim))) return;
    findings.push({
      file: relativePath,
      line: index + 1,
      reference: claim,
      snippet: lineText.trim(),
    });
  });
  return findings;
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const steeringDir = options.steeringDir ?? STEERING_DIR;
  const documents = collectSteeringDocuments(root, steeringDir);
  const knownFileNames = collectRepositoryFileNames(root);

  const findings: SteeringRefFinding[] = [];
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    findings.push(...scanDocument(relativePath, source, knownFileNames));
  }

  return { findings, scannedFiles: documents, steeringDir };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗
  if (result.scannedFiles.length === 0) {
    if (!json) {
      console.error('❌ 走査対象の steering 文書が一件も見つかりませんでした');
      console.error(`   走査したディレクトリ: ${result.steeringDir}`);
      console.error(
        '   リポジトリルートで実行しているか、対象パスが変わっていないか確認してください'
      );
    }
    process.exit(1);
  }

  if (result.findings.length > 0) {
    if (!json) {
      console.error('❌ steering が現存物として挙げるファイルに、実在しないものがあります');
      console.error('');
      console.error('   steering は毎セッション読み込まれる「現在の構成」の記述です。撤去・改名に');
      console.error(
        '   追随していない記載は、後任を存在しないファイルへ導きます（タスク 115.169）。'
      );
      console.error('   記載を落とすか、移管先のファイル名へ指し直してください。');
      console.error('');
      const byFile = new Map<string, SteeringRefFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        console.error(`   ${file} (${list.length}件)`);
        for (const finding of list) {
          console.error(`     L${finding.line}: ${finding.reference}`);
          if (verbose) console.error(`        ${finding.snippet}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル（走査 ${result.scannedFiles.length} ファイル）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ steering が挙げるファイルはすべて実在します（走査 ${result.scannedFiles.length} ファイル: ${result.steeringDir}/*.md）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
