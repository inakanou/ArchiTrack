/**
 * @fileoverview steering の識別子実在検査 検出規則の自己検査
 *
 * `scripts/check-steering-identifier-references.ts` の検出規則が
 *   (1) **緩める向き**——撤去・改名に追随していない識別子を取り逃がさないこと、
 *   (2) **狭めすぎる向き**——現に在る識別子や、実在の主張ではない書き方
 *       （ライブラリ名・コミット種別・CSS 単位・環境変数・glob・同期記録・コードフェンス）を
 *       告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * ## 主張の形（有限集合上の全称命題）
 *
 * 本自己検査は「見落としが無い」を主張しない。主張するのは次の二つだけである。
 *
 *   (A) **数え上げの全称命題**: 実データ（`.kiro/steering/*.md`）に現れるコードスパンを
 *       「行の類 × トークンの類 × 解決の可否」で分類した**有限集合**のうち、
 *       本自己検査の見本が一つも持たない類は**零**である。
 *       → `checkEveryRealizedClassHasSample`
 *
 *   (B) **主張三種の検出可能性**: 主張と判定する三つの類（部品・関数・モジュール）それぞれについて、
 *       実在しない識別子を仕込んだ材料を検出できる。
 *       → `MUST_DETECT` と `checkPlantedStaleIdentifierInRealSteering`
 *
 * (A) は 115.197 が確立した作法による。「走査して無言変異が無いことを示す」は終端しないため、
 * 受入条件を**実データが実現する同値類の数え上げ**へ置き換えている。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-identifier-references.selftest.ts
 *   npm run check:steering-idents:selftest
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  buildRepositoryIndex,
  classifyToken,
  classifyLine,
  CLAIM_CLASSES,
  collectCodeSpans,
  collectSteeringDocuments,
  EXCLUDED_DIRECTORIES,
  equivalenceKey,
  MODULE_EXTENSIONS,
  resolveSpan,
  run,
  scanDocument,
  STEERING_DIR,
  type CodeSpan,
  type RepositoryIndex,
} from './check-steering-identifier-references.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-steering-identifier-references.ts';
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

/** リポジトリ本体の索引（実在ファイル・実在シンボル・実在拡張子） */
const REAL_INDEX: RepositoryIndex = buildRepositoryIndex(ROOT);

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する一行 */
  line?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /**
   * この見本が写す同値類の鍵。`checkEveryRealizedClassHasSample` が
   * 実データの類と突き合わせる。
   */
  keys?: string[];
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（緩める向きの誤り）
//
// 1〜2 は **115.169 の是正前に `.kiro/steering/tech.md` に実在していた逐語**である
// （`git show` で当時の 72 行目・139 行目を取得した）。3〜5 は撤去済みの実物
// （`LazyImage` は 112.1 で撤去、`batchUpdateItems` は 115.173 が「現在のコードに存在しない」と
// 実測した識別子）を、実データが現に用いている文の形へ置いたものである。
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: '撤去済み部品を現存の共有先として挙げる（115.169 是正前の tech.md:72 逐語）',
    line: '- `fabric` ^7.3.1 - Canvas注釈エディタ（現場調査画像編集、Group 化された矢印・タッチジェスチャー対応、2本指ピンチでの中点ズーム/パンとフィットを提供。ビューポート制御は `gestures/canvasViewportController`（純粋ロジック）→ `hooks/useCanvasViewport` → `ZoomControls`（表示専用）の一方向依存で構成し、`ImageViewer`/`AnnotationEditor` が共有する）',
    expected: true,
    keys: ['body/component-claim/absent'],
  },
  {
    name: '撤去済み部品を two-layer 構成の共有先として挙げる（115.169 是正前の tech.md:139 逐語）',
    line: '- **責務の分離**: 「画像→コンテナのフィット」（`computeFitScale` によるキャンバス寸法算出）と「コンテナ内のズーム/パン」（`gestures/canvasViewportController`）は別レイヤとして扱い、混在させない。`ImageViewer` / `AnnotationEditor` はこの two-layer 構成を共有する',
    expected: true,
    keys: ['body/component-claim/absent'],
  },
  {
    name: '撤去済み部品名を単独で挙げる（112.1 で撤去した `LazyImage`）',
    line: '- 一覧の画像は `LazyImage` が遅延読み込みする',
    expected: true,
    keys: ['body/component-claim/absent'],
  },
  {
    name: '実在しないモジュール識別子を挙げる（112.1 で撤去した経路）',
    line: '- 遅延読み込みは `components/common/LazyImage` に置く',
    expected: true,
    keys: ['body/module-claim/absent'],
  },
  {
    name: '実在しない関数識別子を呼び出し形で挙げる（115.173 が実測した `batchUpdateItems`）',
    line: '- 明細の一括更新は `batchUpdateItems()` が担う',
    expected: true,
    keys: ['body/function-claim/absent'],
  },
];

// ============================================================================
// 捕捉してはならない書き方（狭めすぎる向きの誤り＝働いている記述の誤爆）
//
// 各件は本体の**別々の棄却枝**に対応する。どの枝が消えるとどれが赤くなるかは
// `checkEveryNegativeControlHasAnExclusiveMutation` が変異で実証する（115.191 の作法）。
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '現存の部品名を共有先として挙げる（tech.md:141 の逐語）',
    line: '- **責務の分離**: 「画像→コンテナのフィット」（`computeFitScale` によるキャンバス寸法算出）と「コンテナ内のズーム/パン」（`gestures/canvasViewportController`）は別レイヤとして扱い、混在させない。`AnnotationEditor`（閲覧/編集の両モード）と `ConstructionPhotoImageViewer` はこの two-layer 構成を共有する',
    expected: false,
    keys: [
      'body/module-claim/present',
      'body/component-claim/present',
      'body/rejected:bare-non-component',
    ],
  },
  {
    name: '現存の関数名を呼び出し形で挙げる（structure.md:365 の逐語）',
    line: '- タイムアウトは `getTimeout()` で環境ごとに切り替える',
    expected: false,
    keys: ['body/function-claim/present'],
  },
  {
    name: '外部ライブラリから取り込む型名（`PrismaPg`。宣言は無いが取り込みで実在する）',
    line: '- `PrismaPg` アダプタ経由で接続する',
    expected: false,
    keys: ['body/component-claim/present'],
  },
  {
    name: 'ライブラリ名（非 PascalCase の裸の識別子。限界として見ない）',
    line: '- `react` ^19.2.0 - UIライブラリ',
    expected: false,
    keys: ['body/rejected:bare-non-component'],
  },
  {
    name: 'コミット種別の列挙（非 PascalCase の裸の識別子）',
    line: '- `feat` / `fix` / `refactor` / `chore` を用いる',
    expected: false,
    keys: ['body/rejected:bare-non-component'],
  },
  {
    name: 'CSS 単位（非 PascalCase の裸の識別子）',
    line: '- 動的ビューポート高は `svh` を基準にし `vh` でフォールバックする',
    expected: false,
    keys: ['body/rejected:bare-non-component'],
  },
  {
    name: '環境変数名（ALL_CAPS。非 PascalCase の裸の識別子）',
    line: '- `NODE_ENV` と `INITIAL_ADMIN_EMAIL` を設定する',
    expected: false,
    keys: ['body/rejected:bare-non-component'],
  },
  {
    name: 'npm スコープ付きパッケージ名（`@` 接頭）',
    line: '- `@prisma/adapter-pg` ^7.9.1 - PostgreSQL アダプタ',
    expected: false,
    keys: ['body/rejected:npm-scope'],
  },
  {
    name: 'glob を含む記載',
    line: '- `pages/ConstructionPhoto*` と `services/signboard-*` を追加',
    expected: false,
    keys: ['body/rejected:glob'],
  },
  {
    name: 'ディレクトリ（末尾スラッシュ）',
    line: '- `components/` と `api/` に配置する',
    expected: false,
    keys: ['body/rejected:directory'],
  },
  {
    name: 'URL（スキームを含む）',
    line: '- `https://your-backend.railway.app` を設定する',
    expected: false,
    keys: ['body/rejected:url'],
  },
  {
    name: 'プレースホルダを含む例示（`<` `>`）',
    line: '3. **ブランチ作成**: 機能ブランチを作成（例: `feature/<機能名>`）',
    expected: false,
    keys: ['body/rejected:placeholder'],
  },
  {
    name: '拡張子を伴うファイル参照（115.169 の所管。二重所管にしない）',
    line: '- `frontend/package.json` と `backend/vitest.config.ts` を確認する',
    expected: false,
    keys: ['body/rejected:file-reference'],
  },
  {
    name: '拡張子を伴う撤去済みファイル参照（撤去済みでも本検査は所管しない）',
    line: '- `ImageViewer.tsx` は撤去済みである',
    expected: false,
    keys: ['body/rejected:file-reference'],
  },
  {
    name: '受け手付きの呼び出し（本番識別子の主張ではない）',
    line: '- `page.waitForTimeout()` を用いてはならない',
    expected: false,
    keys: ['body/rejected:method-call'],
  },
  {
    name: '空白や記号を含む断片（コマンド・型注釈・HTTP 経路）',
    line: '- `npm ci` と `PUT /api/estimates/:id/save` と `type: subject`',
    expected: false,
    keys: ['body/rejected:whitespace'],
  },
  {
    name: '句読点を含む断片（識別子の形をしていない）',
    line: '- `.tsbuildinfo` と `pg_isready` を確認する',
    expected: false,
    keys: ['body/rejected:bare-non-component'],
  },
  {
    name: 'カスタムスラッシュコマンド（コロンを含み識別子の形をしていない。product.md:67 の逐語）',
    line: '- **カスタムスラッシュコマンド**: `/kiro:spec-init`, `/kiro:spec-requirements`, `/kiro:spec-design`など、開発プロセスを支援するコマンド群',
    expected: false,
    keys: ['body/rejected:punctuation'],
  },
  {
    name: '同期記録の行に撤去済みファイル名が並ぶ（structure.md:5 の逐語）',
    line: '_最終更新: 2026-08-28（Steering Sync: タスク 115.169。撤去・改名に追随していなかった記載を是正（`ImageViewer.tsx`／`ImageViewer.stories.tsx` は 115.146、`LazyImage.tsx`／`LazyImage.stories.tsx` は 112.1 で撤去。`archive.service.test.ts` は `audit-log-archive.service.test.ts` へ改名、`env-validator.test.ts` は `unit/config/env.test.ts` へ移動・改名）。再発は `npm run check:steering-refs` が検知する）_',
    expected: false,
    keys: ['sync-note/rejected:file-reference', 'sync-note/rejected:whitespace'],
  },
  {
    name: '同期記録の行にディレクトリと glob が並ぶ（structure.md:7 の逐語）',
    line: '_2026-08-05（Steering Sync: 見積書作成の行操作・ネスト構造・帳票書式の再設計を反映。UI非依存の `frontend/src/domain/`（estimateEditReducer/estimateTree/estimateCalculations/estimateKeymap）を新設層として追加、`services/export/` の `load*ExportService.ts` 動的import分離、`components/estimate/` の表示・俯瞰・キー割当・帳票入力コンポーネント、backend `estimate-draft.service.ts` 追加と `estimate-export.service.ts` 撤去、`estimates.routes.ts` の経路整理、hooks件数を実測値32に是正）_',
    expected: false,
    keys: [
      'sync-note/rejected:directory',
      'sync-note/rejected:glob',
      'sync-note/rejected:file-reference',
    ],
  },
  {
    name: '同期記録の行に版数付きパッケージ名がある（tech.md:17 の逐語）',
    line: '_2026-06-05（Steering Sync: 全Dockerfileでcorepackによるnpm版固定（packageManager `npm@11.6.2`）でnpm ci決定性を確保するパターン、backend entrypointでのsharpネイティブバイナリ自己修復パターンを反映）_',
    expected: false,
    keys: ['sync-note/rejected:punctuation'],
  },
  {
    name: 'コードフェンス内のディレクトリツリーの葉（structure.md:631 の逐語。逆引用符はコードを成さない）',
    line: [
      '```',
      '│   │   ├── SiteSurveyImageViewerPage.css # 表示領域高さ（`vh`→`svh`二段宣言でアドレスバー伸縮に追従。インラインstyleで表現不可のため併置）',
      '```',
    ].join('\n'),
    expected: false,
    keys: ['fenced/rejected:bare-non-component'],
  },
  {
    name: 'コードフェンス内の glob（structure.md:817 の逐語）',
    line: [
      '```',
      '│   └── export/        # 帳票・エクスポート生成（jsPDF/SheetJS。`load*ExportService.ts` の動的importで初期チャンクから分離）',
      '```',
    ].join('\n'),
    expected: false,
    keys: ['fenced/rejected:glob'],
  },
  {
    name: '同期記録の行（現存の主張ではない。撤去済み `ImageViewer` を含む tech.md:5 の逐語）',
    line: '_最終更新: 2026-08-28（Steering Sync: タスク 115.169。ビューポート制御・two-layer 構成の共有先を実測へ是正（撤去済みの `ImageViewer` ではなく `AnnotationEditor`（閲覧モードは `readOnly` 描画）と `ConstructionPhotoImageViewer`）。記載ファイルの実在は `npm run check:steering-refs` が検知する）_',
    expected: false,
    keys: [
      'sync-note/component-claim',
      'sync-note/rejected:bare-non-component',
      'sync-note/rejected:whitespace',
    ],
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ident-empty-'));
  try {
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
 * `classifyToken` 単体が正しくても、列挙・索引・集計のどこかが壊れていれば
 * 本検査は「0 件」で自明に合格してしまう。仮の steering と仮のソース木を作り、
 * 失効した識別子で findings が立ち、在る識別子では立たないことを固定する。
 */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steering-ident-e2e-'));
  try {
    const steeringDir = path.join(tempRoot, STEERING_DIR);
    fs.mkdirSync(steeringDir, { recursive: true });
    const hooksDir = path.join(tempRoot, 'frontend', 'src', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, 'usePresentHook.ts'),
      'export function usePresentHook() {}\n'
    );
    fs.mkdirSync(path.join(tempRoot, 'frontend', 'src', 'components'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'frontend', 'src', 'components', 'PresentPanel.tsx'),
      'export const PresentPanel = () => null;\n'
    );

    const document = [
      '# 技術',
      '- 現存の部品は `PresentPanel` である',
      '- 撤去済みの部品は `RemovedPanel` である',
      '- 現存の経路は `hooks/usePresentHook` である',
      '- 失効した経路は `hooks/useRemovedHook` である',
      '- 現存の関数は `usePresentHook()` である',
      '- 失効した関数は `useRemovedHook()` である',
    ].join('\n');
    fs.writeFileSync(path.join(steeringDir, 'tech.md'), document);

    const result = run({ root: tempRoot });
    if (result.scannedFiles.length !== 1) {
      failures.push(`仮の steering を1件列挙できていない（${result.scannedFiles.length} 件）`);
    }
    const detected = result.findings.map((finding) => `${finding.line}:${finding.token}`);
    const expected = ['3:RemovedPanel', '5:hooks/useRemovedHook', '7:useRemovedHook()'];
    if (detected.join(' / ') !== expected.join(' / ')) {
      failures.push(
        `検出が期待と違う。期待「${expected.join(' / ')}」／` +
          `実際「${detected.join(' / ') || '（無し）'}」`
      );
    }

    // ビルド生成物に旧名が残っていても「在る」と数えないこと
    const distDir = path.join(tempRoot, 'frontend', 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'RemovedPanel.tsx'), 'export const RemovedPanel = 1;\n');
    const withArtifact = run({ root: tempRoot });
    if (withArtifact.findings.length !== expected.length) {
      failures.push('ビルド生成物に残った旧名を実在として数えてしまう（撤去の検知が効かなくなる）');
    }

    // 是正すれば合格すること（常時失敗の裏返しを塞ぐ）。
    // **素材を空にすると文書が空になり、「是正すれば合格する」が「何も書かなければ合格する」
    // へ退化して、この主張は恒真になる**（第3原則。115.252）
    const correctedLines = ['# 技術', '- 現存の部品は `PresentPanel` である'];
    if (correctedLines.length === 0) {
      failures.push('素材 correctedLines が空です（この確認が空振りしています）');
    }
    fs.writeFileSync(path.join(steeringDir, 'tech.md'), correctedLines.join('\n'));
    const clean = run({ root: tempRoot });
    if (clean.findings.length !== 0) {
      failures.push(`是正後の材料で該当が残る: ${clean.findings.map((f) => f.token).join(' / ')}`);
    }

    // 終了コードまで含めた挙動（報告の詐称・件数の間引きを塞ぐ）
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    fs.writeFileSync(
      path.join(steeringDir, 'tech.md'),
      ['# 技術', '- 撤去済みの部品は `RemovedPanel` である'].join('\n')
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
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * **「該当0件」が空振りでないことの実証**（115.194 の作法）。
 *
 * 実データは現在 0 件である。0 件が「実在しない」のか「走査器が動いていない」のかは
 * 区別できないため、**実データの写しに 115.169 是正前の逐語を仕込み**、
 * 実データと同じ索引で検出できることを示す。
 */
function checkPlantedStaleIdentifierInRealSteering(): string[] {
  const failures: string[] = [];
  const target = `${STEERING_DIR}/tech.md`;
  const source = fs.readFileSync(path.join(ROOT, target), 'utf-8');

  const baseline = scanDocument(target, source, REAL_INDEX);
  if (baseline.length !== 0) {
    failures.push(
      `実データの ${target} に該当がある（本検査は 0 件を前提に空振りを否定している）: ` +
        baseline.map((f) => `L${f.line} ${f.token}`).join(' / ')
    );
  }

  const planted = source.replace(
    '`AnnotationEditor`（閲覧モードは `readOnly` 描画）と `ConstructionPhotoImageViewer` が共有する）',
    '`ImageViewer`/`AnnotationEditor` が共有する）'
  );
  if (planted === source) {
    failures.push(
      '仕込み先の逐語が実データから失われている（仕込みが当たっていない＝空振りの実証になっていない）'
    );
    return failures;
  }
  const withPlant = scanDocument(target, planted, REAL_INDEX);
  if (!withPlant.some((finding) => finding.token === 'ImageViewer')) {
    failures.push(
      '実データの写しに仕込んだ失効識別子 `ImageViewer` を検出できない（走査が空振りしている）'
    );
  }
  return failures;
}

/**
 * **(A) 数え上げの全称命題**（115.197 の作法）。
 *
 * 実データのコードスパンを「行の類 × トークンの類 × 解決の可否」で分類し、
 * その**有限集合**のうち見本を欠く類が零であることを主張する。
 * 「無言変異が存在しない」は主張しない。
 */
function checkEveryRealizedClassHasSample(): string[] {
  const failures: string[] = [];

  const realized = new Map<string, string>();
  for (const relativePath of collectSteeringDocuments(ROOT)) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
    for (const span of collectCodeSpans(relativePath, source, REAL_INDEX.extensions)) {
      const key = equivalenceKey(span, spanResolution(span));
      if (!realized.has(key)) realized.set(key, `${relativePath}:${span.line} \`${span.token}\``);
    }
  }
  if (realized.size === 0) {
    failures.push('実データから同値類を一つも数え上げられていない（走査が働いていない）');
    return failures;
  }

  const sampled = new Set<string>();
  for (const testCase of [...MUST_DETECT, ...MUST_NOT_DETECT]) {
    if (testCase.line === undefined) continue;
    const produced = new Set<string>();
    for (const span of collectCodeSpans('sample/tech.md', testCase.line, REAL_INDEX.extensions)) {
      produced.add(equivalenceKey(span, spanResolution(span)));
    }
    // 宣言された鍵と、**この見本が**実際に生む鍵が食い違っていないこと。
    // 累積集合で照合すると、別の見本が生んだ鍵で宣言が通ってしまう。
    for (const declared of testCase.keys ?? []) {
      if (!produced.has(declared)) {
        failures.push(
          `見本「${testCase.name}」が宣言する類 ${declared} を、実際には生んでいない（宣言の陳腐化）。` +
            `実際に生んだ類: ${[...produced].join(' / ') || '（無し）'}`
        );
      }
    }
    for (const key of produced) sampled.add(key);
  }

  for (const [key, where] of realized) {
    if (!sampled.has(key)) {
      failures.push(`実データが実現する類 ${key} の見本が無い（実例: ${where}）`);
    }
  }
  return failures;
}

/** 主張でない類は解決を問わない（鍵の作り方を一箇所に閉じる） */
function spanResolution(span: CodeSpan): boolean | null {
  if (span.lineClass !== 'body') return null;
  if (!CLAIM_CLASSES.includes(span.tokenClass)) return null;
  return resolveSpan(span, REAL_INDEX);
}

/**
 * 同期記録の除外が**万能の逃がし口**になっていないこと。
 *
 * 「行全体が斜体なら現存の主張ではない」という形の規則は、斜体を別の用途に使い始めた
 * 瞬間に主張を丸ごと逃がす。実データの行全体斜体が**すべて Steering Sync の記録**である
 * ことを固定し、そうでなくなったら**失敗**させる（第3原則: 前提が失われたら赤くする）。
 */
function checkSyncNoteExclusionIsNotAWildcard(): string[] {
  const failures: string[] = [];
  let syncLines = 0;
  for (const relativePath of collectSteeringDocuments(ROOT)) {
    const lines = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8').split(/\r?\n/);
    let fence = false;
    lines.forEach((lineText, index) => {
      const lineClass = classifyLine(lineText, fence);
      if (/^\s*```/.test(lineText)) fence = !fence;
      if (lineClass !== 'sync-note') return;
      syncLines += 1;
      if (!lineText.includes('Steering Sync')) {
        failures.push(
          `行全体が斜体だが同期記録ではない: ${relativePath}:${index + 1} ${lineText.trim().slice(0, 40)}`
        );
      }
    });
  }
  if (syncLines === 0) {
    failures.push('実データに同期記録の行が一件も無い（除外規則が空振りしている）');
  }
  return failures;
}

/** リポジトリ本体の steering 文書を**一件も落とさずに**列挙できること */
function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];

  const expected = fs
    .readdirSync(path.join(ROOT, STEERING_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${STEERING_DIR}/${entry.name}`)
    .sort();

  const documents = collectSteeringDocuments(ROOT, STEERING_DIR);
  const requiredDocuments = [`${STEERING_DIR}/structure.md`, `${STEERING_DIR}/tech.md`];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (requiredDocuments.length === 0) {
    failures.push('素材 requiredDocuments が空です（この確認が空振りしています）');
  }
  for (const required of requiredDocuments) {
    if (!documents.includes(required)) failures.push(`走査対象に ${required} が含まれていない`);
  }
  for (const document of expected) {
    if (!documents.includes(document)) failures.push(`走査対象から落ちている: ${document}`);
  }
  for (const document of documents) {
    if (!expected.includes(document))
      failures.push(`実在しない走査対象が混ざっている: ${document}`);
  }
  // **遊びを持たせない**（タスク 115.298）。是正前は 3 と宣言しながら現況が 4 件で
  // 遊びが 1 件あり、steering 文書を一件まで無言で走査から落とせた（2026-09-05 に実測）。
  const MINIMUM_STEERING_DOCUMENTS = 4;
  if (documents.length < MINIMUM_STEERING_DOCUMENTS) {
    failures.push(
      `走査対象が ${MINIMUM_STEERING_DOCUMENTS} 件を下回っている（${documents.length} 件）`
    );
  }
  if (documents.length > MINIMUM_STEERING_DOCUMENTS) {
    failures.push(
      `走査対象が ${documents.length} 件で、宣言の下限 ${MINIMUM_STEERING_DOCUMENTS} 件を上回っている` +
        `（遊び ${documents.length - MINIMUM_STEERING_DOCUMENTS} 件）。下限は現況ちょうどに保ってください——` +
        `遊びを持つ下限は、その幅ぶんの無言の目減りを吸収します。` +
        `MINIMUM_STEERING_DOCUMENTS を ${documents.length} 件へ上げてください。`
    );
  }
  return failures;
}

/**
 * リポジトリの索引が本物であること。
 * 索引が過大（生成物込み）だと撤去を見逃し、過小だと在る識別子を告発する。
 */
function checkRepositoryIndexIsReal(): string[] {
  const failures: string[] = [];
  const presentSymbols = [
    'AnnotationEditor',
    'ConstructionPhotoImageViewer',
    'ZoomControls',
    'computeFitScale',
    'getTimeout',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (presentSymbols.length === 0) {
    failures.push('合成素材 presentSymbols が空です（この確認が空振りしています）');
  }
  for (const symbol of presentSymbols) {
    if (!REAL_INDEX.symbols.has(symbol)) failures.push(`実在する識別子が索引に無い: ${symbol}`);
  }
  const absentSymbols = ['ImageViewer', 'LazyImage', 'batchUpdateItems'];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (absentSymbols.length === 0) {
    failures.push('合成素材 absentSymbols が空です（この確認が空振りしています）');
  }
  for (const symbol of absentSymbols) {
    if (REAL_INDEX.symbols.has(symbol)) {
      failures.push(`撤去済みの識別子が索引に入っている: ${symbol}（生成物が外れていない疑い）`);
    }
  }
  const presentPaths = [
    'frontend/src/hooks/useCanvasViewport.ts',
    'frontend/src/utils/imageFitScale.ts',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (presentPaths.length === 0) {
    failures.push('合成素材 presentPaths が空です（この確認が空振りしています）');
  }
  for (const relativePath of presentPaths) {
    if (!REAL_INDEX.paths.has(relativePath)) {
      failures.push(`実在するパスが索引に無い: ${relativePath}`);
    }
  }
  const requiredExtensions = ['.ts', '.tsx', '.json', '.md'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (requiredExtensions.length === 0) {
    failures.push('素材 requiredExtensions が空です（この確認が空振りしています）');
  }
  for (const extension of requiredExtensions) {
    if (!REAL_INDEX.extensions.has(extension)) {
      failures.push(`実在する拡張子が語彙に無い: ${extension}`);
    }
  }
  // 拡張子の語彙は**実ファイルから作る**。名指しの列挙に退化していないこと
  if (REAL_INDEX.extensions.has('.service')) {
    failures.push('`.service` が拡張子語彙に混ざっている（モジュール識別子が誤って除外される）');
  }
  const mustBeExcluded = ['node_modules', 'dist', 'coverage', 'storybook-static'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustBeExcluded.length === 0) {
    failures.push('素材 mustBeExcluded が空です（この確認が空振りしています）');
  }
  for (const directory of mustBeExcluded) {
    if (!EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ビルド生成物 ${directory} が走査から外れていない`);
    }
  }
  const mustNotBeExcluded = ['frontend', 'backend', 'e2e', 'scripts', '.kiro'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustNotBeExcluded.length === 0) {
    failures.push('素材 mustNotBeExcluded が空です（この確認が空振りしています）');
  }
  for (const directory of mustNotBeExcluded) {
    if (EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ソース木 ${directory} が走査から外れている（在る識別子を告発してしまう）`);
    }
  }
  if (MODULE_EXTENSIONS.length === 0) {
    failures.push('MODULE_EXTENSIONS が空である（モジュール識別子が何も解決しない）');
  }
  return failures;
}

/**
 * 索引の三つの供給源（宣言・取り込み・ファイル名）が**それぞれ独自に効いている**こと。
 * どれかを外しても索引が縮まないなら、その供給源は遊んでおり、
 * 「索引が本物である」の主張は一部が空虚になる（115.197 の `CODE_DIRS` の教訓）。
 */
function checkEveryIndexSourceContributes(): string[] {
  const failures: string[] = [];
  const sources: Array<{ label: string; only: string }> = [
    { label: '宣言', only: 'declaration' },
    { label: '取り込み', only: 'import' },
    { label: 'ファイル名', only: 'basename' },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (sources.length === 0) {
    failures.push('合成素材 sources が空です（この確認が空振りしています）');
  }
  for (const source of sources) {
    const withoutIt = buildRepositoryIndex(ROOT, { skipSymbolSources: [source.only] });
    if (withoutIt.symbols.size >= REAL_INDEX.symbols.size) {
      failures.push(
        `索引の供給源「${source.label}」を外しても索引が縮まない（この供給源は遊んでいる）`
      );
    }
  }
  return failures;
}

/**
 * 検出結果を名指しで逃がす経路が無いこと（許容リストの名前ではなく機構を見る）。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

  /** 部品名・関数名らしき文字列リテラル（許容リストの実体） */
  const IDENTIFIER_LITERAL = /['"]([A-Z][a-z0-9]+[A-Za-z0-9]{2,}|[a-z]+[A-Z][A-Za-z0-9]{2,})['"]/;

  const bodies: Array<{ label: string; declaration: string }> = [
    { label: 'classifyToken', declaration: 'export function classifyToken(' },
    { label: 'classifyLine', declaration: 'export function classifyLine(' },
    { label: 'collectCodeSpans', declaration: 'export function collectCodeSpans(' },
    { label: 'resolveSpan', declaration: 'export function resolveSpan(' },
    { label: 'scanDocument', declaration: 'export function scanDocument(' },
    { label: 'run', declaration: 'export function run(' },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (bodies.length === 0) {
    failures.push('合成素材 bodies が空です（この確認が空振りしています）');
  }

  for (const body of bodies) {
    const start = source.indexOf(body.declaration);
    if (start < 0) {
      failures.push(`${body.label} の宣言が見つからない（改名されている疑い）`);
      continue;
    }
    const rest = source.slice(start + body.declaration.length);
    const nextDeclaration = rest.search(/\nexport (?:function|const) |\nfunction /);
    const text = nextDeclaration < 0 ? rest : rest.slice(0, nextDeclaration);
    const matched = IDENTIFIER_LITERAL.exec(text);
    if (matched !== null) {
      failures.push(
        `${body.label} の本体に識別子らしき文字列リテラルがある（名指しの逃がしの疑い）: ${matched[0]}`
      );
    }
    if (body.label === 'run' && /\.filter\(|\.slice\(|\.splice\(/.test(text)) {
      failures.push('run が findings を間引いている');
    }
  }
  return failures;
}

/**
 * **陰性対照の実効**（115.191 の作法）。
 *
 * 陰性対照の空振りは静かである。実効は「変異を加えたか」ではなく
 * 「**その対照でしか捕まらない変異が在るか**」で測る。棄却枝を一つずつ潰す変異を当て、
 * 各変異について**赤くなる陰性対照が実在する**ことを確かめる。
 */
function checkEveryNegativeControlHasAnExclusiveMutation(): string[] {
  const failures: string[] = [];
  /** 棄却枝を無効化する変異（本体を写して置換する形にはせず、規則を直に呼んで判定する） */
  const mutations: Array<{ label: string; token: string; expected: string }> = [
    { label: 'glob の棄却', token: 'pages/ConstructionPhoto*', expected: 'rejected:glob' },
    { label: 'ディレクトリの棄却', token: 'components/', expected: 'rejected:directory' },
    { label: 'URL の棄却', token: 'https://your-backend.railway.app', expected: 'rejected:url' },
    { label: 'npm スコープの棄却', token: '@prisma/adapter-pg', expected: 'rejected:npm-scope' },
    { label: 'プレースホルダの棄却', token: 'feature/<機能名>', expected: 'rejected:placeholder' },
    {
      label: 'ファイル参照の棄却',
      token: 'frontend/package.json',
      expected: 'rejected:file-reference',
    },
    {
      label: '受け手付き呼び出しの棄却',
      token: 'page.waitForTimeout()',
      expected: 'rejected:method-call',
    },
    { label: '空白の棄却', token: 'npm ci', expected: 'rejected:whitespace' },
    { label: '非 PascalCase の棄却', token: 'react', expected: 'rejected:bare-non-component' },
    // 部品名の絞りの**両端**を固定する。どちらも実データに現れる語であり、
    // ここを緩めても実データの同値類は動かないため、数え上げでは捕まらない
    // （変異走査で M9「部品名を ALL_CAPS まで広げる」が無言だったことによる。115.181 の作法）。
    { label: 'ALL_CAPS の棄却', token: 'STYLES', expected: 'rejected:bare-non-component' },
    {
      label: 'camelCase の棄却（限界の固定）',
      token: 'computeFitScale',
      expected: 'rejected:bare-non-component',
    },
    { label: '部品の主張', token: 'AnnotationEditor', expected: 'component-claim' },
    { label: '関数の主張', token: 'getTimeout()', expected: 'function-claim' },
    { label: 'モジュールの主張', token: 'hooks/useCanvasViewport', expected: 'module-claim' },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mutations.length === 0) {
    failures.push('合成素材 mutations が空です（この確認が空振りしています）');
  }
  for (const mutation of mutations) {
    const actual = classifyToken(mutation.token, REAL_INDEX.extensions);
    if (actual !== mutation.expected) {
      failures.push(
        `${mutation.label}: \`${mutation.token}\` の類が期待と違う（期待 ${mutation.expected} / 実際 ${actual}）`
      );
    }
    // その類の見本が陰性・陽性のどちらかに実在すること（枝が対照に紐づいていること）
    const covered = [...MUST_DETECT, ...MUST_NOT_DETECT].some((testCase) =>
      (testCase.keys ?? []).some((key) => key.includes(actual))
    );
    if (!covered) {
      failures.push(`${mutation.label}: 類 ${actual} を写す見本が一つも無い`);
    }
  }
  return failures;
}

/**
 * **緩める向きの二枝を端で固定する**（115.181 の作法）。
 *
 * 変異走査で無言だった二つの変異に対応する。いずれも「緩めても実データの同値類が動かない」
 * ため数え上げでは捕まらず、宣言だけあって固定の無い判断として次の変更で黙って失われる。
 *
 *   (a) 同期記録の判定を `^_` だけに緩めると、行頭が下線の**あらゆる行**が主張から外れる。
 *       実データに該当が無いため無言になる（変異 M18）。
 *   (b) モジュールの照合を末尾一致から部分一致へ緩めると、
 *       `hooks/useCanvasView` が `hooks/useCanvasViewport.ts` に当たってしまい、
 *       失効した経路が「在る」と数えられる（変異 M19）。
 */
function checkExclusionAndResolutionAreBounded(): string[] {
  const failures: string[] = [];

  // (a) 行頭が下線でも、行全体が斜体でなければ主張を読む行である
  const notItalic = '_注意: この段落は斜体で閉じていないため本文である。`AnnotationEditor` を指す';
  if (classifyLine(notItalic, false) !== 'body') {
    failures.push('行全体が斜体でない行まで同期記録として除外している（除外が万能化している）');
  }
  const italic = '_2026-08-28（Steering Sync: 反映）_';
  if (classifyLine(italic, false) !== 'sync-note') {
    failures.push('同期記録の行を本文として読んでいる（除外が働いていない）');
  }

  // (b) モジュールの照合は**区切りに揃った末尾一致**であること
  const asModule = (token: string): CodeSpan => ({
    file: 'sample/tech.md',
    line: 1,
    token,
    lineClass: 'body',
    tokenClass: 'module-claim',
    snippet: token,
  });
  if (!resolveSpan(asModule('hooks/useCanvasViewport'), REAL_INDEX)) {
    failures.push('実在するモジュール経路を解決できない（照合が働いていない）');
  }
  const misalignedTokens = ['hooks/useCanvasView', 'ooks/useCanvasViewport'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (misalignedTokens.length === 0) {
    failures.push('素材 misalignedTokens が空です（この確認が空振りしています）');
  }
  for (const token of misalignedTokens) {
    if (resolveSpan(asModule(token), REAL_INDEX)) {
      failures.push(
        `区切りに揃わない部分一致で解決してしまう: ${token}（失効した経路を「在る」と数える）`
      );
    }
  }
  return failures;
}

/** 陽性・陰性の対照そのものが空でないこと（0 件の自明な合格を塞ぐ） */
function checkControlsArePresent(): string[] {
  const failures: string[] = [];
  if (MUST_DETECT.length === 0) failures.push('MUST_DETECT が空である');
  if (MUST_NOT_DETECT.length === 0) failures.push('MUST_NOT_DETECT が空である');
  for (const claimClass of CLAIM_CLASSES) {
    const hasPositive = MUST_DETECT.some((testCase) =>
      (testCase.keys ?? []).some((key) => key === `body/${claimClass}/absent`)
    );
    if (!hasPositive) failures.push(`主張の類 ${claimClass} に「実在しない」側の陽性対照が無い`);
    const hasNegative = MUST_NOT_DETECT.some((testCase) =>
      (testCase.keys ?? []).some((key) => key === `body/${claimClass}/present`)
    );
    if (!hasNegative) failures.push(`主張の類 ${claimClass} に「実在する」側の陰性対照が無い`);
  }
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: '検出結果を名指しで逃がす経路が無い（許容リストの名前ではなく機構を見る）',
    expected: false,
    custom: checkNoFindingsNarrowing,
  },
  {
    name: '走査から報告までが実際に働く（仮の steering で失効識別子を捕まえる）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: '実データの 0 件が空振りでない（実データの写しに 115.169 是正前の逐語を仕込む）',
    expected: false,
    custom: checkPlantedStaleIdentifierInRealSteering,
  },
  {
    name: '(A) 実データが実現する同値類のうち見本を欠くものが零',
    expected: false,
    custom: checkEveryRealizedClassHasSample,
  },
  {
    name: '同期記録の除外が万能の逃がし口になっていない',
    expected: false,
    custom: checkSyncNoteExclusionIsNotAWildcard,
  },
  {
    name: 'リポジトリ本体の steering を実際に列挙できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: '索引が本物である（生成物を含めず、ソース木を落とさない）',
    expected: false,
    custom: checkRepositoryIndexIsReal,
  },
  {
    name: '索引の供給源がそれぞれ独自に効いている',
    expected: false,
    custom: checkEveryIndexSourceContributes,
  },
  {
    name: '陰性対照に、その対照でしか捕まらない変異が在る（115.191）',
    expected: false,
    custom: checkEveryNegativeControlHasAnExclusiveMutation,
  },
  {
    name: '緩める向きの二枝が端で固定されている（115.181）',
    expected: false,
    custom: checkExclusionAndResolutionAreBounded,
  },
  {
    name: '陽性・陰性の対照が空でなく、主張三種を両側から覆う',
    expected: false,
    custom: checkControlsArePresent,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const findings = scanDocument('sample/tech.md', testCase.line ?? '', REAL_INDEX);
  const detected = findings.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${findings.map((f) => f.token).join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

interface Group {
  readonly title: string;
  readonly cases: readonly Case[];
}

/**
 * 見本の極性（タスク 115.252）
 *
 * **名前の綴りからも変数名からも導かない**（115.247 の作法）。要素が持つ `expected` 属性——
 * 「検出されなければならない」か否か——がそのまま極性である。`custom` を持つ要素は機構の
 * 確認であって検出の対照ではないため、極性を持たない。
 */
function polarityOf(one: Case): 'positive' | 'negative' | undefined {
  if (one.custom !== undefined) return undefined;
  return one.expected ? 'positive' : 'negative';
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
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_POSITIVE_CONTROLS = 5;
const MINIMUM_NEGATIVE_CONTROLS = 24;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-03 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-steering-identifier-references.selftest.ts | tail -1` の出す値をそのまま置く。
 * **確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 導けないため件数で貼る。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_TOTAL_CASES = 41;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `MUST_DETECT` / `MUST_NOT_DETECT` は既存の要素側の確認が捕まえたが、`STRUCTURAL` を空に
 * すると **29/29 緑・EXIT=0**（守り手自身が `STRUCTURAL` の中に居るため自分を守れない）。
 * `main()` の中の `groups` を空にすると **0/0 緑・EXIT=0**。
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形——本ファイルの
 * `STRUCTURAL` に載っていた `checkControlsArePresent()` がまさにそれ——は、**配列ごと空にすると関門も
 * 一緒に消える**（115.252 の候補3）。`main()` の中、確認の実行より前に、配列の外側から貼る。
 * 既存の要素側の確認は残してあるが、それは冗長な二重掛けであって関門ではない。
 *
 * **限界（塞いでいないこと）**: 総数の下限は現況ちょうどのため 1 件でも削れば赤くなるが、
 * **削った分だけ別の群へ確認を足せば総数は動かない**。群ごとの下限は「空でないこと」と
 * 「要求した極性が 1 件以上残ること」までしか課せない（件数を導く語彙が本体に無い。
 * 115.222 が陰性対照について書き残した限界と同じ形）。
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
  const polarities = groups.flatMap((group) => group.cases.map((one) => polarityOf(one)));
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
  // 下限に遊びを持たせない（タスク 115.298）
  if (positives > MINIMUM_POSITIVE_CONTROLS) {
    problems.push(
      `陽性対照が ${positives} 件で、宣言した下限 ${MINIMUM_POSITIVE_CONTROLS} 件を上回ります（遊び ${positives - MINIMUM_POSITIVE_CONTROLS} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_POSITIVE_CONTROLS を ${positives} 件へ上げてください。`
    );
  }
  if (negatives < MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件しかありません（宣言の下限は ${MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '陰性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (negatives > MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件で、宣言した下限 ${MINIMUM_NEGATIVE_CONTROLS} 件を上回ります（遊び ${negatives - MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_NEGATIVE_CONTROLS を ${negatives} 件へ上げてください。`
    );
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (total > MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件で、宣言した下限 ${MINIMUM_TOTAL_CASES} 件を上回ります（遊び ${total - MINIMUM_TOTAL_CASES} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_TOTAL_CASES を ${total} 件へ上げてください。`
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
      title: '捕捉しなければならない書き方（115.169 是正前の逐語と撤去済みの実物）',
      cases: MUST_DETECT,
    },
    {
      title: '捕捉してはならない書き方（過検出）',
      cases: MUST_NOT_DETECT,
    },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 steering の識別子実在検査 検出規則 自己検査 (scripts/check-steering-identifier-references.selftest.ts)'
  );
  // 対照群の配列の外側に置く関門。実行より前に、群そのものが在ることを確かめる。
  guardControlsArePresent(groups);
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
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
