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
 * 主張の判定に拡張子の名指しの列挙は使わない。**basename が拡張子を持つこと**だけを見る
 * （下の「拡張子を絞らない理由」）。
 *
 * 検出しない形（限界。すべて見逃し側へ倒してある）:
 *   - **basename しか照合しない。** ツリーの字下げは手書きで、実際に structure.md の
 *     `site-surveys/` 配下は親より浅く書かれているなど、字下げからパスを組み立てると
 *     **在るファイルを誤って告発する**。下界の過大主張は上界の過小主張より危険であるため、
 *     ディレクトリの移動（`utils/foo.ts` → `config/foo.ts`）は検出しない。
 *   - **散文の言及は見ない。** `_最終更新: …（… `estimate-export.service.ts` 撤去 …）_` の
 *     ような同期記録は「撤去した」と述べており現存の主張ではない。ツリーの葉と
 *     先頭逆引用符の箇条書きだけを主張として扱う。実測（2026-08-30、下の「散文を見ない理由」）
 *     では、是正前の散文中のファイル名参照 111 件のうち実在しないものが 28 件あり、
 *     真の失効はそのうち 2 件だけであった。
 *   - **拡張子を持たない語は見ない。** `Dockerfile` / `commit-msg` / `pre-push` /
 *     `.prettierrc` のような名前は、実ファイルでもあれば Git フック名・npm script 名でも
 *     あり、形で区別できない。ドットで始まるだけの名前（`.env`）は追跡外のこともあるため、
 *     照合すると手元の環境で結果が変わる。拡張子を伴わない参照（`hooks/useCanvasViewport`）は
 *     タスク 115.198 の `check:steering-idents` の所管である。
 *   - **glob（`*` を含む形）とディレクトリ（末尾 `/`）は対象外。**
 *   - 設計文書（`.kiro/specs/<feature>/design.md`）は走査しない。そちらは歴史記録であり、
 *     参照先の実在はタスク 115.173 の担当である。
 *
 * 許容リストによる個別の逃がしは一切置いていない。
 *
 * ## 拡張子を絞らない理由（実測。タスク 115.199 で是正した）
 *
 * 本検査は当初 `.ts` / `.tsx` / `.css` に限っており、その根拠として `Fabric.js` /
 * `Node.js` / `decimal.js` / `tesseract.js` / `index.js` が「ファイル名以外の意味で使われる」
 * ことを挙げていた。2026-08-30 に**抽出トークンを数え直した**ところ、この根拠は成り立たない。
 * 数えたのは「行がどこに在るか」ではなく「規則が何を取り出すか」である（位置で語ると、
 * 測っていない断言がそのまま検査に固定される。115.168 の罠）。
 *   - 是正前（HEAD）の steering で規則に当たる主張は 720 件。そのうち `.js` / `.jsx` の
 *     抽出トークンは `eslint.config.js`×6・`frontend/eslint.config.js`・
 *     `backend/eslint.config.js`・`commitlint.config.js`・`vite.config.js`・`App.jsx`・
 *     `main.jsx`・`index.js` の **12 件**だけである。
 *   - `Fabric.js` / `Node.js` / `decimal.js` / `tesseract.js` は steering に計 23 行現れるが、
 *     **抽出トークンになった数は 0 件**である（同じ行が主張であっても、取り出されるのは
 *     葉の名前や箇条書きの先頭語であって、注釈や説明の中のライブラリ名ではない）。
 * つまり網を狭める根拠として挙げた四者は、狭めなくても一度も誤検出を生まない。
 * **測らずに書いた否定がそのまま網を狭め**、真の失効 4 件——`App.jsx` / `main.jsx` / `vite.config.js`
 * （実体は `.tsx` と `vite.config.ts`）と `.github/workflows/e2e-tests.yml`（実在は
 * `ci.yml` と `dependabot-automerge.yml` のみ）——を見逃していた（115.199 で是正）。
 * 拡張子を絞らない場合、是正前の steering で規則に当たる主張は 720 件あり、そのうち
 * 実在しないものは上の 5 件（真の失効 4 件・記法違反 1 件）で、**ライブラリ名・版数などに
 * よる誤検出は 0 件**であった（誤検出率 0/720）。是正後は 718 件・該当 0 件である。
 * 合格の報告が照合した主張の件数を示すので、この台の大きさは走らせれば確かめられる。
 *
 * ## 拡張子の語彙を実ファイルから作らない理由（実測）
 *
 * 115.198 の識別子検査は拡張子の語彙をリポジトリの実ファイルから機械的に作る。あちらの
 * 語彙は「拡張子付きは自分の所管ではない」と**棄却する**ためのもので、語彙に無い拡張子が
 * あっても隣の検査へ回るだけである。本検査の語彙は逆に**照合する対象を選ぶ**。実測では
 * `.jsx` はリポジトリのどのファイルにも無い（実ファイル由来の拡張子は 32 種で `.jsx` を
 * 含まない）。語彙を実ファイルから作ると `App.jsx` / `main.jsx` は語彙外となり、
 * **撤去された拡張子——まさに検出したい失効——が対象から外れる**。よってこの道は採れない。
 *
 * ## 主張と例示を分ける記法（形で分ける。許容リストは置かない）
 *
 * 命名規則の例示は「このファイルが在る」という主張ではない。両者を形で分けるため、
 * steering 側の記法を次に統一してある。
 *   実在の主張    行頭が逆引用符    `- \`browser.ts\` - テストヘルパー`
 *   規則の例示    ラベルを前置      `- **エントリーポイント**: \`index.js\` - …`
 * 後者は逆引用符が行頭に来ないため規則に当たらない。`.kiro/steering/structure.md` の
 * 「ファイル命名規則 > 一般規則」は既にこの形（`- コンポーネント: PascalCase (\`UserProfile.tsx\`)`）
 * を用いており、115.199 は隣の「特殊ファイル」を同じ形へ揃えただけである。
 *
 * ## 散文を見ない理由（実測）
 *
 * 数え方: `.kiro/steering/*.md` の各行のうちコードフェンスの外にあり、上の二規則の
 * どちらにも当たらない行を「散文」とし、その逆引用符内の語で basename が
 * `^\.[A-Za-z][A-Za-z0-9]*$` に合う拡張子を持つものを数えた（glob と末尾 `/` は除く）。
 *
 * 2026-08-30、**是正前（HEAD）**で数えると散文中のファイル名の形をした語は 111 件、
 * うち実在しないものは 28 件。真の失効は 2 件で、いずれも 115.199 が手で是正した。
 *   - `e2e/helpers/browser.js`（実体は `browser.ts`。tech.md）
 *   - `errors/ApiError.ts`（実体は `backend/src/errors/apiError.ts`。**大小文字の食い違い**。
 *     structure.md。綴りが一字違うだけの失効は見落としやすいので別分類として記す）
 * 残る 26 件は誤検出である（誤検出率 26/28）。したがって散文は主張として扱わない。
 *
 * **是正後**に同じ数え方をすると 124 件中 32 件が実在せず、真の失効は 0 件になる。内訳は
 * 同期記録に残る旧名 14 件（今回足した記録を含む）、命名規則の例示 3 件（`UserProfile.tsx` /
 * `formatDate.ts` / `API_ENDPOINTS.ts`）、拡張子そのもの 1 件（`.d.ts`）、ライブラリ名 2 件
 * （`decimal.js` / `tesseract.js`）、識別子・プロパティ経路 5 件（`global.fetch` /
 * `globalThis.fetch` / `import.meta.env.DEV` / `ExecutionBudgetItem.estimateItemId` /
 * `...Mobile`）、走査から外している生成物 2 件（`dist/prisma/seed.js` /
 * `./generated/prisma/client.js`）、拡張子なしのモジュール経路 5 件（115.198 の所管）。
 *
 * なお**大小文字の食い違いは主張の側でも起こりうる**。実在の照合は
 * `knownFileNames.has(basename)` という厳密一致であり、`ApiError.ts` と `apiError.ts` を
 * 別物として扱う（大小文字を区別しないファイルシステムでも、集合に入るのは実際の綴りなので
 * 判定は環境に依らない）。現在の 718 件の主張に大小文字だけが食い違うものは 0 件だが、
 * 起こりうる以上、自己検査に対の見本（`errors/ApiError.ts` は検出、`errors/apiError.ts` は
 * 非検出）を置いて固定してある。
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
  /**
   * 実在を照合した主張の総数。合格は「この有限集合の**すべて**が実在する」という
   * 全称命題であり、その台となる集合の大きさを報告に出す。0 件の合格（走査の空振り）を
   * 読み手が見分けられるようにするためである。
   */
  claims: number;
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

/**
 * 語が拡張子を持つか。**拡張子の名指しの列挙は置かない**（上の「拡張子を絞らない理由」）。
 *
 * `path.posix.extname` の意味に従うため、`.prettierrc` / `.gitignore` / `.env` のような
 * 「ドットで始まるだけの名前」は拡張子を持たないと見なす。追跡外のことがある `.env` を
 * 照合対象へ引き込むと、手元にファイルが在るかどうかで検査結果が変わってしまう。
 */
export function extensionOf(token: string): string | null {
  const extension = path.posix.extname(path.posix.basename(token));
  return extension.length > 0 ? extension.toLowerCase() : null;
}

/** ディレクトリツリーの葉（`├── name` / `└── name`） */
const TREE_ENTRY = /^[\s│]*(?:├──|└──)\s+(\S+)/;

/** 先頭が逆引用符の箇条書き（`- \`name\` - 説明`）。字下げは許す */
const BACKTICKED_BULLET = /^\s*-\s+`([^`]+)`\s+-\s/;

/**
 * 一行から「このファイルが在る」という主張を取り出す。主張でなければ null。
 *
 * 依存パッケージの箇条書き（`- \`decimal.js\` ^10.6.0 - …`）は、逆引用符の直後が
 * ` - ` ではなく版数であるため `BACKTICKED_BULLET` に当たらない。命名規則の例示
 * （`- コンポーネント: PascalCase (\`UserProfile.tsx\`)` / `- **エントリーポイント**: \`index.js\``）は
 * 逆引用符が先頭に来ないため当たらない。いずれも**書き方の形**で外れるのであって、
 * 名指しの除外ではない。
 */
export function extractClaim(lineText: string): string | null {
  const matched = TREE_ENTRY.exec(lineText) ?? BACKTICKED_BULLET.exec(lineText);
  if (matched === null) return null;
  const token = matched[1];
  if (token === undefined) return null;
  if (token.includes('*')) return null;
  if (token.endsWith('/')) return null;
  if (extensionOf(token) === null) return null;
  return token;
}

/** 一つの steering 文書に含まれる主張（実在を照合する記載）の数 */
export function countClaims(source: string): number {
  return source.split(/\r?\n/).filter((lineText) => extractClaim(lineText) !== null).length;
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
  let claims = 0;
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    claims += countClaims(source);
    findings.push(...scanDocument(relativePath, source, knownFileNames));
  }

  return { findings, scannedFiles: documents, steeringDir, claims };
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

  // 前提条件で検査を無効化しない: 文書は在るのに主張が一つも取れないなら、
  // 検出規則が壊れている（走査の空振り）。0 件の合格は合格ではなく失敗とする
  if (result.claims === 0) {
    if (!json) {
      console.error('❌ steering 文書は在るのに、実在を照合できる記載が一件もありません');
      console.error(`   走査したファイル: ${result.scannedFiles.join(', ')}`);
      console.error(
        '   ディレクトリツリーの葉と行頭逆引用符の箇条書きを取り出す規則が壊れている疑いがあります'
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
      console.error('   実在の主張ではなく命名規則の**例示**なら、`- **ラベル**: `名前`` のように');
      console.error(
        '   ラベルを前置してください（逆引用符が行頭に来ない形は主張として扱いません）。'
      );
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
      `✅ steering が挙げるファイルはすべて実在します（走査 ${result.scannedFiles.length} ファイル: ` +
        `${result.steeringDir}/*.md、実在を照合した主張 ${result.claims} 件）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
