# プロジェクト構造

ArchiTrackのプロジェクト構造とコーディング規約を定義します。

_最終更新: 2026-09-09（Steering Sync: `/kiro-steering`。ルートツリーが `scripts/`・`docs/`・`data/`・`.vscode/` の四つを一つも挙げていなかった（実測: `git ls-files | awk -F/ 'NF>1{print $1}' | sort -u` が返すルート直下の 11 件のうち、本書のツリーに現れるのは 7 件。コミット `faa54052`、2026-09-09 にリポジトリルートで実測）。とりわけ `scripts/` は押下前の関門（`npm run check:*` が 19 件、対の `:selftest` が 19 件）と CI の関門ジョブがすべてそこから起動する所でありながら、ツリーにも「主要ディレクトリの詳細」の節にも一度も現れていなかった。ツリーへ四件を加え、`scripts/` には節を新設した。節は一覧も件数も持たず、命名で役割が決まること（`check-*.ts` と対の `check-*.selftest.ts`、判定しない `survey-*`/`scan-*`/`list-*`、根拠を持つ `*-adjudication.*` と `*-baseline.json`）という規約だけを述べ、実体は `git ls-files` と `grep` で読み出す形にした——規約 (b)（数値を落として数える手段を書く）をディレクトリの内訳へ掛けたものである。対の自己検査は `check-*.ts` の 19 件すべてに在り、例外は `check-staged-coverage.cjs` の一件（対を持たず、押下前の関門からも CI からも呼ばれない。`package.json` の `coverage:staged:*` に定義があるだけ）。併せて「押下前の関門と CI の関門は同一ではない」ことを `comm` で読み出す形で明示した——実測では押下前だけが走らせる検査が 4 件（`check:adjudication-pointers`・`check:design-component-reqs`・`check:design-measurement-freshness`・`check:trace-coverage`）、CI だけが 1 件（`check:env`）である）_

_最終更新: 2026-09-05（Steering Sync: タスク 115.287。`e2e/helpers/browser.ts` の起動コマンドが二文書で違う実行器を名指していた（本書 `npx ts-node` が 3 行、`.kiro/steering/tech.md` `npx tsx` が 2 箇所で 6 行）。実際に叩いて正否を決めた——`npx tsx …` はヘルパー本体まで届くが、`npx ts-node …` はルートの `package.json` が `"type": "module"` であるため型のみの取り込みが `SyntaxError` になりヘルパーへ入る前に落ちる。`ts-node` はルートの `node_modules/.bin/` に無く `backend/package.json` の devDependency にしかないが、`npx` はレジストリまたは取得済みの控えから解決するため「見つからない」形では失敗しない（コミット `3e670d6a`、2026-09-05 にリポジトリルートで実測）。値を書き換えて揃える形は採らず、タスク 115.275 / 115.286 と同じ規約 (b)（書き写さず読み出す手段を書く）を掛けた——起動コマンドの権威は `.kiro/steering/tech.md` の「Claude Code統合」節に一本化し、本書は `grep` で読み出す手段だけを持つ）_

_2026-09-05（Steering Sync: タスク 115.286。押下前の関門について本書が述べていた「初期化処理」と「品質チェック（順次実行）」の記述を、実体（`.husky/scripts/pre-push.sh`）へ揃えた。`NODE_OPTIONS` の割り当ては本書の二箇所が `--max-old-space-size=1024` と述べていたが実体は `--max-old-space-size=2048` であり、番号付きの列挙は「Formatチェック」から始まっていたが実体はその前に `docker-compose.yml` の環境変数が `backend/.env.example` に載っているかの検査（警告のみで中断しない）を走らせる。値を書き換える形は採らず、タスク 115.275 が実体の件数に対して採った規約 (b)（数値を落として数える手段を書く）を関門の列挙へも掛けた——列挙が名指していた検査は `npm run check:req-coverage` の一つだけで、`check:design-*` / `check:steering-*` / `check:e2e-*` / `check:cf-evidence` / `check:dead-script-env` / `check:req-exclusions` は一つも現れていなかった（コミット `98744b92`、2026-09-05 にリポジトリルートで実測）。以後は `grep -nE` で手順の見出しを、`grep -oE` で検査の npm スクリプト名を読み出す。同型の列挙が `.kiro/steering/tech.md` にもあったため同じ形へ揃えた）_

_2026-09-05（Steering Sync: タスク 115.275。ディレクトリ注記・見出し・スペック状態が名乗っていた実体の件数 30 行を、規約 (b)（数値を落として数える手段を書く）へ置き換えた。再現コマンドを書ける 21 行のうち 13 行が既に食い違っており（`quantity-table/` 22→68、`frontend/src/utils/` 22→37、Storybook 132→157、`backend/src/routes/` 34→37 など。コミット `b84137b9`、2026-09-05 にリポジトリルートで実測）、残る 9 行（`全46タスク完了` の形）は、下記の 6 通りの走査規則（深さを問わないチェック項目・最上位の番号付き項目・相異なる最上位番号・見出し・完了印の付いた項目・深さを問わない相異なる番号）を当てた範囲では書かれた値を再現できなかった（導入時のコミットまで遡ると `project-management` と `itemized-statement-generation` の 2 行だけは「相異なる最上位番号」が一致する。これ以外の数え方は当てていない）。値の書き換えでは同じ陳腐化が繰り返されるため「実体の件数の書き方の規約」節を新設し、`npm run check:steering-dir-counts` が実測日を伴わない件数を検知する）_

_2026-09-02（Steering Sync: タスク 115.243。「テストの件数は書かず数える手段を書く」規約が名指していた `npm --prefix backend run test` が、タスク 115.216 の分離以降は既定側しか数えないため、手段ごとに何を選ぶかを併記する形へ是正した（backend は既定の実行・`test:integration`・`test:all`、frontend は `test` が全件）。併せて「数える手段を書くときは、その手段が何を選ぶかまで書く」——数値を撤去しても手段の指し先が変われば記述は同じように偽になる——を「テスト区分の列挙の規約」へ加えた）_

_2026-08-30（Steering Sync: タスク 115.200。`e2e/specs/` のテストカテゴリを網羅列挙へ是正し（20区分。従来は19区分で `execution-budget/` が欠落）、印で囲んで `npm run check:steering-test-tree` の検査対象にした。ディレクトリツリーの図は代表例である旨を明記して網羅の重複を解消（backend のテスト木は tech.md、frontend のテスト木も tech.md が権威）。「テスト区分の列挙の規約」節を新設。テストの件数・テストファイル数は撤去し、数える手段だけを残した）_

_2026-08-30（Steering Sync: タスク 115.199。実在検査の拡張子の絞りを撤去したことで露わになった失効を是正（`App.jsx`／`main.jsx` は実体が `.tsx`、`vite.config.js` は `vite.config.ts`）。「特殊ファイル」は規則の**例示**であって現存の主張ではないため、一般規則と同じくラベルを前置した形へ揃え、拡張子も実態（`index.ts`／`*.test.ts`／`*.spec.ts`）へ是正。同じ理由でE2E/Storybookの命名規則の例示もラベル前置へ揃えた。散文の `errors/ApiError.ts` は実体が `errors/apiError.ts` で大小文字が食い違っていたため是正）_

_2026-08-28（Steering Sync: タスク 115.169。撤去・改名に追随していなかった記載を是正（`ImageViewer.tsx`／`ImageViewer.stories.tsx` は 115.146、`LazyImage.tsx`／`LazyImage.stories.tsx` は 112.1 で撤去。`archive.service.test.ts` は `audit-log-archive.service.test.ts` へ改名、`env-validator.test.ts` は `unit/config/env.test.ts` へ移動・改名）。再発は `npm run check:steering-refs` が検知する）_

_2026-08-05（Steering Sync: 見積書作成の行操作・ネスト構造・帳票書式の再設計を反映。UI非依存の `frontend/src/domain/`（estimateEditReducer/estimateTree/estimateCalculations/estimateKeymap）を新設層として追加、`services/export/` の `load*ExportService.ts` 動的import分離、`components/estimate/` の表示・俯瞰・キー割当・帳票入力コンポーネント、backend `estimate-draft.service.ts` 追加と `estimate-export.service.ts` 撤去、`estimates.routes.ts` の経路整理、hooks件数を実測値32に是正）_

_2026-07-29（Steering Sync: 新ドメイン construction-photo（工事写真台帳）を反映。spec カタログ・`ConstructionPhotoSectionCard`・`pages/ConstructionPhoto*`/`ConstructionSignboardListPage`・`components/construction-photos/`・`api/construction-photo*`/`construction-signboards`・backend `services/signboard-*`（SVG描画・sharp合成）・e2e `construction-photos/` を追加）_

_2026-07-09（Steering Sync: `utils/imageFitScale.ts`・`hooks/useElementSize.ts`・`pages/SiteSurveyImageViewerPage.css`（`svh`二段宣言）を反映、hooks件数を実測値27に是正）_

_2026-06-30（Steering Sync: 現場調査の`gestures/`（canvasViewportController/touchGestureManager/gesture-thresholds）・`ZoomControls.tsx`・`useCanvasViewport`フック・`utils/image-compression.ts`を反映）_

_2026-04-08（Steering Sync: テストファイル数・Storybookカウント・contracts/コンポーネント追加を反映）_

## ルートディレクトリ構成

```
ArchiTrack/
├── .claude/                 # Claude Codeカスタマイズ
│   ├── CLAUDE.md           # プロジェクト固有AI運用ルール（AI運用7原則）
│   ├── commands/           # カスタムスラッシュコマンド
│   │   └── kiro/           # Kiro開発コマンド群
│   └── hooks/              # Claude Code フック
│       └── hook_pre_commands.sh  # コマンド実行前フック
├── .github/                # GitHub設定
│   ├── workflows/          # GitHub Actions CI/CD
│   │   ├── ci.yml          # 統合CI/CDパイプライン（CI + デプロイジョブ統合）
│   │   └── dependabot-automerge.yml  # Dependabot自動マージ
│   └── dependabot.yml      # Dependabot自動依存関係管理設定
├── .husky/                 # Git フック管理（Husky v9）
│   ├── _/                  # Husky内部設定
│   ├── scripts/            # フック実装スクリプト
│   │   ├── pre-commit.sh   # pre-commit実装（bash）
│   │   └── pre-push.sh     # pre-push実装（bash）
│   ├── pre-commit          # コミット前ラッパー（scripts/pre-commit.sh呼び出し）
│   ├── commit-msg          # コミットメッセージ検証（commitlint）
│   └── pre-push            # プッシュ前ラッパー（scripts/pre-push.sh呼び出し）
├── .kiro/                  # Kiro開発管理
│   ├── steering/           # プロジェクトステアリング
│   │   ├── product.md      # プロダクト概要
│   │   ├── tech.md         # 技術スタック
│   │   ├── structure.md    # プロジェクト構造
│   │   └── development-discipline.md # 開発規律（反実仮想の作法など）
│   └── specs/              # 機能仕様（動的生成）
├── .vscode/                # エディタ共有設定（推奨拡張・デバッグ構成・タスク）
├── e2e/                    # E2Eテスト（Playwright）
│   ├── specs/              # テスト仕様（カテゴリ別ディレクトリ。以下は代表例）
│   │   ├── api/            # APIエンドポイントテスト
│   │   ├── auth/           # 認証フローテスト
│   │   └── （他のカテゴリは e2e/ 節「テストカテゴリ」に網羅列挙）
│   ├── helpers/            # テストヘルパー・ユーティリティ
│   │   ├── wait-helpers.ts # CI環境対応の待機ヘルパー
│   │   ├── auth-actions.ts # 認証アクション（ログイン、ログアウト）
│   │   ├── browser.ts      # Claude Code統合ブラウザ操作
│   │   ├── test-users.ts   # テストユーザー定義
│   │   └── screenshot.ts   # スクリーンショットヘルパー
│   └── fixtures/           # テストフィクスチャ
│       ├── auth.fixtures.ts    # 認証フィクスチャ
│       ├── database.ts         # データベースフィクスチャ
│       └── seed-helpers.ts     # シードデータヘルパー
├── frontend/               # フロントエンドアプリケーション
│   ├── .storybook/         # Storybook設定（コンポーネントドキュメント）
│   │   ├── main.ts         # Storybook設定ファイル
│   │   └── preview.ts      # グローバルパラメータ・デコレータ
│   ├── src/                # ソースコード
│   │   ├── App.tsx         # メインAppコンポーネント
│   │   └── main.tsx        # エントリーポイント
│   ├── public/             # 公開静的ファイル
│   ├── package.json        # 依存関係
│   ├── vite.config.ts      # Vite設定
│   ├── nginx.conf          # 本番環境nginx設定
│   ├── Dockerfile          # 本番環境Dockerイメージ
│   ├── Dockerfile.dev      # 開発環境Dockerイメージ
│   ├── docker-entrypoint.sh # Docker起動時依存関係チェック
│   ├── railway.toml        # Railway デプロイ設定
│   ├── eslint.config.js    # ESLint設定（Flat Config形式）
│   ├── .prettierrc         # Prettier設定
│   └── .env.example        # 環境変数テンプレート
├── backend/                # バックエンドAPI
│   ├── docs/               # API ドキュメント
│   │   └── api-spec.json   # OpenAPI 3.0仕様（自動生成）
│   ├── performance/        # パフォーマンステスト
│   │   ├── autocannon.d.ts # autocannonカスタム型定義
│   │   └── health-check.perf.ts  # ヘルスチェック負荷テスト
│   ├── prisma/             # Prisma ORM
│   │   └── schema.prisma   # スキーマ定義（データモデル、マイグレーション）
│   ├── src/                # ソースコード
│   │   ├── index.ts        # Expressサーバーエントリーポイント
│   │   ├── app.ts          # Expressアプリケーション（テスト用に分離）
│   │   ├── db.ts           # Prisma Client（Driver Adapter Pattern）
│   │   ├── generated/      # 生成されたコード
│   │   │   └── prisma/     # Prisma Client出力先（Prisma 7）
│   │   ├── redis.ts        # Redis接続管理
│   │   ├── generate-swagger.ts  # Swagger/OpenAPI仕様生成スクリプト
│   │   ├── middleware/     # ミドルウェア
│   │   ├── types/          # カスタム型定義
│   │   ├── utils/          # ユーティリティ関数
│   │   └── __tests__/      # 単体テスト
│   ├── package.json        # 依存関係
│   ├── tsconfig.json       # TypeScript設定（performance/含む）
│   ├── vitest.config.ts    # Vitest設定
│   ├── Dockerfile.dev      # 開発環境Dockerイメージ
│   ├── docker-entrypoint.sh # Docker起動時依存関係チェック
│   ├── railway.toml        # Railway デプロイ設定
│   ├── eslint.config.js    # ESLint設定（Flat Config形式）
│   ├── .prettierrc         # Prettier設定
│   └── .env.example        # 環境変数テンプレート
├── scripts/                # リポジトリ全域のスクリプト（スペック／steering の関門群・調査用・環境準備）
├── docs/                   # 人間向けドキュメント（`api/`・`architecture/` ほか）
├── data/                   # スクリプトが読む静的データ
├── docker-compose.yml      # 基本サービス定義（環境非依存）
├── docker-compose.dev.yml  # 開発環境オーバーライド
├── docker-compose.test.yml # テスト環境オーバーライド（ポートオフセット、nginx本番イメージ）
├── docker-compose.debug.yml # デバッグオーバーライド（Node.js inspector）
├── docker-compose.ci.yml   # CI環境オーバーライド（nginx本番イメージ）
├── .env.dev                # 開発環境変数
├── .env.test               # テスト環境変数
├── package.json            # E2Eテスト依存関係
├── tsconfig.json           # TypeScript設定（E2Eテスト用）
├── playwright.config.ts    # Playwright設定（TypeScript）
├── eslint.config.js        # ESLint設定（Flat Config形式、E2Eテスト用）
├── commitlint.config.js    # Commitlint設定（Conventional Commits）
├── .prettierrc             # Prettierコードフォーマット設定
├── .gitignore              # Git除外設定
├── CLAUDE.md               # Claude Code設定・ガイドライン
└── README.md               # プロジェクトREADME（包括的なドキュメント、アーキテクチャ図、コントリビューションガイド含む）
```

## 主要ディレクトリの詳細

### `.claude/commands/kiro/`

Kiro-styleスペック駆動開発のカスタムコマンドを格納します。

**主要コマンド:**

- `steering.md` - ステアリングドキュメント管理
- `steering-custom.md` - カスタムステアリング作成
- `spec-init.md` - 新規仕様初期化
- `spec-requirements.md` - 要件定義生成
- `spec-design.md` - 技術設計作成
- `spec-tasks.md` - 実装タスク生成
- `spec-impl.md` - タスク実装実行
- `spec-status.md` - 仕様進捗確認
- `validate-design.md` - 設計品質レビュー
- `validate-gap.md` - 実装ギャップ分析

### `.claude/hooks/`

Claude Codeのカスタムフックスクリプト。

**構成:**

- `hook_pre_commands.sh` - コマンド実行前に実行されるフック
- `hook_stop_words.sh` - アシスタント応答のストップワード検出フック
- `rules/hook_pre_commands_rules.json` - コマンド前フック実行ルール定義
- `rules/hook_stop_words_rules.json` - ストップワード検出ルール定義

### `.husky/`

Gitフック管理ディレクトリ（Husky v9使用）。

**主要ファイル:**

- `pre-commit` + `scripts/pre-commit.sh` - コミット前に自動実行されるスクリプト
  - **ラッパー構造**: `pre-commit`（sh）→ `scripts/pre-commit.sh`（bash）でpipefail等を使用
  - バックエンドの変更: Prettier + ESLint + TypeScript型チェック
  - フロントエンドの変更: Prettier + ESLint + TypeScript型チェック
  - E2Eテストの変更: Prettier + ESLint + TypeScript型チェック
  - lint-stagedと連携して、ステージングされたファイルのみ処理
- `commit-msg` - コミットメッセージ検証スクリプト
  - commitlintによるConventional Commits形式の強制
  - type: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
  - subject: 小文字始まり、100文字以内、末尾にピリオド不要
- `pre-push` + `scripts/pre-push.sh` - プッシュ前に自動実行されるスクリプト
  - **ラッパー構造**: `pre-push`（sh）→ `scripts/pre-push.sh`（bash）でpipefail等を使用
  - **WSL2メモリ最適化**: 冒頭で `NODE_OPTIONS` を export してOOMを防ぐ。**割り当てる値は
    本書に書き写さない**（規約 (b)。タスク 115.286）。読むには
    `grep -n 'NODE_OPTIONS' .husky/scripts/pre-push.sh`
  - **Git操作検出**: ブランチ削除時はスキップ、新規ブランチ/更新時は全チェック
  - **実行される検査とその順序は本書に列挙しない**（規約 (b)。タスク 115.286）。
    読み出す手段は下の「Pre-pushフック（ラッパー構造）」の節に置く
  - E2Eテストは Docker のテスト環境（architrack-test、ポート3100/5174）で実行する
  - **同期実行**: すべてのテストを完了してからプッシュ実行
  - 失敗時はプッシュを中断、テスト環境を自動クリーンアップ

**有効化方法:**

```bash
git config core.hooksPath .husky
```

### `.kiro/steering/`

プロジェクト全体のコンテキストを提供するステアリングドキュメント。

**コアファイル（常時読み込み）:**

- `product.md` - プロダクト概要と価値提案
- `tech.md` - 技術スタック・開発環境
- `structure.md` - プロジェクト構造・コーディング規約

**カスタムファイル（必要に応じて）:**

- `development-discipline.md` - 開発規律（反実仮想を書く前に変異を実行する作法、全称否定の書き方）

プロジェクト固有のガイドラインを追加可能。

### `.kiro/specs/[feature-name]/`

個別機能の仕様を管理します（動的生成）。

**標準構成:**

```
.kiro/specs/[feature-name]/
├── requirements.md         # 要件定義
├── design.md              # 技術設計
├── tasks.md               # 実装タスク一覧
└── implementation/        # 実装記録（オプション）
```

**完了した仕様:**

**各スペックのタスク総数と完了数は本書に書かない**（タスク 115.275。数値を書くと、タスクが
一つ積まれただけで無言のうちに偽になる）。数える手段は次のとおりで、いずれもリポジトリルートで
実行する。スペック名の部分を数えたいスペックへ置き換える。

- 総数: `grep -cE "^[[:space:]]*- \[[ x]\]" .kiro/specs/site-survey/tasks.md`
- 完了数: `grep -cE "^[[:space:]]*- \[x\]" .kiro/specs/site-survey/tasks.md`

`✅実装完了` は**当初の実装範囲が終わったことを表す印**であり、完了数が総数と一致することは
意味しない（着地後に品質・是正のタスクが積まれるため）。

- `.kiro/specs/user-authentication/` - ユーザー認証機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 招待制ユーザー登録、ロールベースアクセス制御（RBAC）、JWT認証フロー、2FA、監査ログ

**実装完了の仕様:**

- `.kiro/specs/project-management/` - プロジェクト管理機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: プロジェクトCRUD、ステータス遷移管理（12種類のステータス）、担当者割り当て、検索・フィルタリング・ページネーション、取引先選択時の現場住所自動入力

- `.kiro/specs/trading-partner-management/` - 取引先管理機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 取引先CRUD、種別管理（顧客/協力業者）、請求締日・支払日管理、検索・フィルタリング・ページネーション

- `.kiro/specs/site-survey/` - 現場調査機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 現場調査CRUD、画像アップロード・管理（R2）、Canvas注釈編集（寸法線・矢印・図形・テキスト）、PDF報告書エクスポート

- `.kiro/specs/quantity-table-generation/` - 数量表作成機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 数量表CRUD、数量グループ・項目管理、計算方法選択（標準・面積体積・ピッチ）、調整係数・丸め設定、オートコンプリート入力支援、現場調査写真紐づけ、フィールドバリデーション（文字数制限・数値範囲・表示書式）、数量表インポート（Excel/PDF、Claude Vision OCR連携）

- `.kiro/specs/itemized-statement-generation/` - 内訳書作成機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 内訳書CRUD、数量表項目のピボット集計、分類軸（任意分類・工種・名称・規格・単位）によるグループ化、スナップショット独立性、ソート・フィルタリング・ページネーション、楽観的排他制御、Excel出力（.xlsx形式）、クリップボードコピー（タブ区切りテキスト）

- `.kiro/specs/estimate-request/` - 見積依頼機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 見積依頼CRUD、内訳書項目選択（クライアントサイド状態管理+保存ボタン方式、任意分類・工種列対応）、見積依頼文生成（メール/FAX対応）、クリップボードコピー、Excel出力、受領見積書登録（OCR構造化データ抽出、項目選択からの一括転記、customCategory・workTypeフィールド対応、NET金額は受領見積書単位で管理）、ステータス管理（依頼前/依頼済/見積受領済）

- `.kiro/specs/company-info/` - 自社情報登録機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 会社名・住所・連絡先管理（シングルトンパターン）、見積依頼文への自動挿入、楽観的排他制御

- `.kiro/specs/estimate-creation/` - 見積書作成機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 内訳書からの見積書生成、3行1セット構造（見積金額・実行金額・業者金額）、階層構造管理、受領見積書転記、NET金額案分計算、諸経費行管理、**明細編集のクライアント完結＋一括保存（行操作・階層移動・範囲操作・Undo/Redo・キーボード操作・階層表示モード・俯瞰パネル・注記行）**、**帳票出力のフロントエンド生成（A4横の表紙/内訳書/明細書 PDF・Excel、未保存プレビュー）**

- `.kiro/specs/contract-management/` - 契約書管理機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 契約書CRUD、新規契約・変更契約種別管理、見積書連動金額自動計算、ステータス管理（契約前/契約済）、変更前後比較表示、楽観的排他制御

- `.kiro/specs/construction-schedule/` - 工程表作成機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 工程表CRUD、工程項目管理（並び替え）、ガントチャート可視化（祝日カレンダー）、数量表連携、Excel/PDFエクスポート、プロジェクト詳細画面統合

- `.kiro/specs/execution-budget-management/` - 実行予算管理機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 実行予算CRUD（契約書・見積書連動）、実行予算項目管理、発注管理（ステータス遷移・金額案分）、出来高入力（パーセンテージボタン）、原価管理（月次締め処理）、変更契約適用履歴、Excel/PDFエクスポート（発注書・出来高）

- `.kiro/specs/construction-photo/` - 工事写真台帳機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**
  - 内容: 工事写真アルバムCRUD、写真項目追加の3系統（ローカル/カメラ/現場調査写真のコピー参照=独立複製）、写真項目管理（コメント・並び替え・印刷対象）、工事看板マスタ（プロジェクト単位・構造化テキスト、電子黒板SVG描画）、写真項目への看板配置（位置・サイズ）とオンデマンド合成（サーバ sharp composite）、台帳PDF出力（クライアント jsPDF・印刷対象のみ・看板重畳）、フルスクリーン画像ビューア（ズーム/回転/パン）、画像一括ZIPエクスポート、権限ベースUI制御、未保存離脱ガード、詳細画面モバイルレスポンシブ。site-survey パターンを踏襲した新規スペック（site-survey 本体は改修せずコピー参照のみ）

### `e2e/`

Playwright E2Eテスト環境。Claude Codeから直接ブラウザ操作が可能。

**ディレクトリ構成:**

```
e2e/
├── specs/                 # テスト仕様（カテゴリ別ディレクトリ。以下は代表例）
│   ├── api/              # APIエンドポイントテスト
│   │   └── *.spec.ts
│   ├── site-surveys/     # 現場調査テスト
│   │   └── *.spec.ts
│   ├── quantity-tables/  # 数量表テスト
│   │   └── *.spec.ts
│   ├── （他のカテゴリは下記「テストカテゴリ」に網羅列挙）
│   └── *.spec.ts         # カテゴリに属さない機能横断のスペック
├── helpers/              # テストヘルパー・ユーティリティ
│   ├── wait-helpers.ts   # CI環境対応の待機ヘルパー
│   ├── auth-actions.ts   # 認証アクション（ログイン、ログアウト）
│   ├── browser.ts        # Claude Code統合ブラウザ操作
│   ├── test-users.ts     # テストユーザー定義
│   └── screenshot.ts     # スクリーンショットヘルパー
├── fixtures/             # テストフィクスチャ
│   ├── auth.fixtures.ts  # 認証フィクスチャ
│   ├── database.ts       # データベースフィクスチャ
│   └── seed-helpers.ts   # シードデータヘルパー
└── global-setup.ts       # グローバルセットアップ（マスターデータ初期化）
```

**テストカテゴリ:**

以下は `e2e/specs/` 直下の**網羅列挙**である（`npm run check:steering-test-tree` が実体との
一致を検査する。`e2e/specs/` の網羅の権威はここ一箇所だけに置く）。

<!-- steering:test-dirs e2e/specs -->
- `admin/` - 管理機能テスト（ロール管理、権限管理、RBAC等）
- `api/` - バックエンドAPIエンドポイントのテスト（ヘルスチェック、JWKS等）
- `auth/` - 認証フローのE2Eテスト（ログイン、登録、2FA、セッション、セッション期限切れモーダル、招待、パスワードリセット等）
- `company-info/` - 自社情報テスト（CRUD、アクセス制御、楽観的排他制御）
- `construction-photos/` - 工事写真台帳テスト（アルバム、写真登録、看板合成）
- `contracts/` - 契約書テスト（CRUD操作、新規契約・変更契約、金額自動計算、比較表示、ステータス管理）
- `estimate/` - 見積書テスト（CRUD、階層構造、受領見積書転記、NET金額案分）
- `estimate-requests/` - 見積依頼テスト（CRUD操作、項目選択、見積依頼文生成、Excel出力、受領見積書、OCR構造化データ、OCR再実行/リトライ、PDFテキスト抽出、数値表示形式、受領見積書ステータス）
- `execution-budget/` - 実行予算テスト（予算作成、原価入力、月次締め、実行予算比較）
- `integration/` - システム全体の統合テスト（データベース、Redis、サービス連携等）
- `itemized-statements/` - 内訳書テスト（CRUD操作、ピボット集計、ソート・フィルタリング）
- `navigation/` - ナビゲーションテスト（AppHeader、メニュー表示等）
- `performance/` - パフォーマンステスト（ページロード時間、プロジェクト操作のパフォーマンス等）
- `projects/` - プロジェクト管理テスト（CRUD、ステータス遷移、一覧操作、アクセシビリティ等）
- `quantity-tables/` - 数量表テスト（CRUD操作、フィールド仕様、数量表コピー、タイトル行最適化、フォーカス全選択、オートコンプリート最適化、インポート機能）
- `schedules/` - 工程表テスト（CRUD操作、ガントチャート表示、エクスポート）
- `security/` - セキュリティテスト（CSRF、XSS対策等）
- `site-surveys/` - 現場調査テスト（CRUD、一覧、ナビゲーション、画像管理、注釈ツール、ビューア、アクセス制御、レスポンシブ、パフォーマンス、エクスポート、サムネイル再生成等）
- `trading-partners/` - 取引先管理テスト（CRUD、検索・フィルタリング、ナビゲーション、パフォーマンス等）
- `ui/` - フロントエンドUI要素のテスト（コンポーネント表示、ユーザー操作等）
<!-- /steering:test-dirs -->

カテゴリに属さず `e2e/specs/` 直下に置かれた機能横断のスペックもある（代表例）。

- `project-execution-budget-navigation.spec.ts` - 実行予算ナビゲーションテスト

**テストヘルパー:**

- `wait-helpers.ts` - CI環境対応の待機ヘルパー（`getTimeout()`パターン）
- `auth-actions.ts` - 認証アクション（`loginAsUser()`、`logout()`等）
- `browser.ts` - Claude Code統合ブラウザ操作
- `test-users.ts` - テストユーザー定義

**Claude Code統合:**

`e2e/helpers/browser.ts` により、AIアシスタントから直接ブラウザ操作が可能：

**起動コマンドは本書に書き写さない**（規約 (b)。タスク 115.287）。同じ起動を二文書が
別々に書き写した結果、本書だけが実行器の是正に追随できていなかった——
`.kiro/steering/tech.md` はタスク 115.199（2026-08-30）で `npx tsx` へ改められたのに対し、
本書は `npx ts-node` の形を 3 行のまま残していた。**権威は `.kiro/steering/tech.md` の
「Claude Code統合」節**であり、読み出す手段は次のとおり（いずれもリポジトリルートで実行する）。

```bash
# 起動コマンドを権威の側から読み出す（実行器の綴りを本書に持たない）
grep -n 'e2e/helpers/browser.ts' .kiro/steering/tech.md

# 権威が名指す実行器を取り出し、ローカルの依存で解決することを確かめる
grep -oE 'npx [a-z0-9-]+ e2e/helpers/browser\.ts' .kiro/steering/tech.md | awk '{print $2}' | sort -u
ls node_modules/.bin
```

二つ目が**二行以上を返したら、権威が二種類以上の実行器を名乗っている**（本タスクが是正した
食い違いの再発である）。**行数は本書に書き写さない**——書き写した瞬間に規約 (b) を破り、
守る機械の関門も無い（`check:design-measurement-freshness` の
`LIVE_STEERING_RECORD_DECLARATIONS` はタスク 115.276 の判断で空に固定されており、
steering の現況の数値を宣言へ載せる道は開いていない）。**限界は拾い漏れの向きへ倒してある**
——`npx <実行器> <経路>` の綴りしか拾わないため、`node --import` を挟む形や実行器名に
大文字・記号を含む形は掛からない。

**テスト実行結果:**

テスト実行時、結果はタイムスタンプ付きディレクトリに保存されます：

```
playwright-report/YYYY-MM-DD_HH-MM-SS-MMMZ/  # HTMLレポート
test-results/YYYY-MM-DD_HH-MM-SS-MMMZ/       # スクリーンショット・ビデオ
```

### `frontend/`

フロントエンドアプリケーションのソースコードと設定。

**現在の構成:**

```
frontend/
├── .storybook/            # Storybook設定
│   ├── main.ts            # Storybook設定ファイル（React-Vite統合）
│   ├── preview.ts         # グローバルパラメータ・デコレータ
│   └── test-runner.ts     # test-runner設定（外部URLモック）
├── src/
│   ├── __tests__/         # 単体テスト（以下は代表例。区分の網羅列挙は tech.md「テスト構成」）
│   │   ├── api/           # APIクライアントテスト
│   │   │   └── client.test.ts  # APIクライアントテスト（fetch、エラーハンドリング）
│   │   └── components/    # Reactコンポーネントテスト
│   │       ├── ErrorBoundary.test.tsx  # エラーバウンダリコンポーネントテスト
│   │       └── AppHeader.test.tsx      # AppHeaderコンポーネントテスト
│   ├── components/        # Reactコンポーネント
│   │   ├── Navigation/             # ナビゲーションコンポーネント
│   │   │   ├── AppHeader.tsx       # アプリヘッダー（認証状態対応）
│   │   │   └── index.ts            # エクスポート集約
│   │   ├── ErrorBoundary.tsx       # エラーバウンダリコンポーネント
│   │   ├── ErrorBoundary.stories.tsx  # Storybook ストーリー（5バリアント）
│   │   ├── LoginForm.tsx           # ログインフォーム
│   │   ├── LoginForm.stories.tsx   # Storybook ストーリー
│   │   ├── RegisterForm.tsx        # 登録フォーム
│   │   ├── RegisterForm.stories.tsx # Storybook ストーリー
│   │   ├── PasswordResetForm.tsx   # パスワードリセットフォーム
│   │   ├── PasswordResetForm.stories.tsx # Storybook ストーリー
│   │   ├── PasswordStrengthIndicator.tsx # パスワード強度インジケーター
│   │   ├── PasswordStrengthIndicator.stories.tsx # Storybook ストーリー
│   │   ├── RolePermissionManager.tsx # ロール権限管理
│   │   ├── RolePermissionManager.stories.tsx # Storybook ストーリー
│   │   ├── ProtectedRoute.tsx      # 保護されたルート
│   │   ├── ProtectedLayout.tsx     # 保護されたページレイアウト（AppHeader付き）
│   │   ├── ProfileForm.tsx         # プロフィール編集フォーム
│   │   ├── SessionManager.tsx      # セッション管理UI
│   │   ├── SessionManagement.tsx   # セッション管理コンポーネント
│   │   ├── AuditLogViewer.tsx      # 監査ログ閲覧UI
│   │   ├── InvitationManager.tsx   # 招待管理UI
│   │   ├── TwoFactorManagement.tsx # 2FA管理UI
│   │   ├── TwoFactorSetupForm.tsx  # 2FA初期設定フォーム
│   │   ├── TwoFactorVerificationForm.tsx # 2FA検証フォーム
│   │   ├── OptimizedList.tsx       # 最適化されたリストコンポーネント
│   │   ├── FocusManager.tsx        # フォーカス管理コンポーネント
│   │   ├── ToastNotification.tsx   # トースト通知コンポーネント
│   │   ├── ToastContainer.tsx      # トースト通知コンテナ
│   │   ├── NetworkErrorDisplay.tsx # ネットワークエラー表示コンポーネント
│   │   ├── SessionExpiredModal.tsx # セッション期限切れモーダル（自動検出・再ログイン誘導）
│   │   └── projects/              # プロジェクト管理コンポーネント
│   │       ├── ProjectForm.tsx     # プロジェクト作成・編集フォーム（現場住所フィールド、取引先選択時の住所自動入力）
│   │       ├── CustomerNameInput.tsx # 顧客名入力
│   │       ├── UserSelect.tsx      # 担当者選択
│   │       ├── StatusTransitionUI.tsx # ステータス遷移UI
│   │       ├── BackwardReasonDialog.tsx # 差し戻し理由入力ダイアログ
│   │       ├── ProjectListTable.tsx # プロジェクト一覧テーブル
│   │       ├── ProjectListCard.tsx # プロジェクト一覧カード（モバイル）
│   │       ├── ProjectListView.tsx # プロジェクト一覧ビュー
│   │       ├── ProjectSearchFilter.tsx # 検索・フィルタUI
│   │       ├── PaginationUI.tsx    # ページネーションUI
│   │       ├── DeleteConfirmationDialog.tsx # 削除確認ダイアログ
│   │       ├── TradingPartnerSelect.tsx # 取引先選択（オートコンプリート、onSelectコールバック対応）
│   │       ├── QuantityTableSectionCard.tsx # 数量表セクションカード
│   │       ├── SiteSurveySectionCard.tsx # 現場調査セクションカード
│   │       ├── ItemizedStatementSectionCard.tsx # 内訳書セクションカード
│   │       ├── EstimateSectionCard.tsx # 見積書セクションカード
│   │       ├── EstimateRequestSectionCard.tsx # 見積依頼セクションカード
│   │       ├── ContractSectionCard.tsx # 契約書セクションカード
│   │       ├── ScheduleSectionCard.tsx # 工程表セクションカード
│   │       ├── ExecutionBudgetSectionCard.tsx # 実行予算セクションカード
│   │       └── ConstructionPhotoSectionCard.tsx # 工事写真台帳セクションカード
│   │   ├── trading-partners/        # 取引先管理コンポーネント
│   │       ├── TradingPartnerForm.tsx # 取引先作成・編集フォーム
│   │       ├── TradingPartnerFormContainer.tsx # フォームコンテナ（ロジック分離）
│   │       ├── TradingPartnerDetailView.tsx # 取引先詳細表示
│   │       ├── TradingPartnerListTable.tsx # 取引先一覧テーブル
│   │       ├── TradingPartnerSearchFilter.tsx # 検索・フィルタUI
│   │       ├── TradingPartnerPaginationUI.tsx # ページネーションUI
│   │       ├── TradingPartnerDeleteDialog.tsx # 削除確認ダイアログ
│   │       ├── TradingPartnerTypeSelect.tsx # 取引先種別選択
│   │       ├── BillingClosingDaySelect.tsx # 請求締日選択
│   │       └── PaymentDateSelect.tsx # 支払日選択
│   │   ├── site-survey/              # 現場調査共通コンポーネント（注釈復元ダイアログ等）
│   │   │   └── RestoreAnnotationDialog.tsx # 注釈復元ダイアログ
│   │   ├── site-surveys/            # 現場調査コンポーネント
│   │       ├── SiteSurveyForm.tsx   # 現場調査作成・編集フォーム
│   │       ├── SiteSurveyListTable.tsx # 現場調査一覧テーブル
│   │       ├── SiteSurveyListCard.tsx # 現場調査一覧カード（モバイル）
│   │       ├── SiteSurveyResponsiveView.tsx # レスポンシブビュー切り替え
│   │       ├── SiteSurveyDetailInfo.tsx # 現場調査詳細情報表示
│   │       ├── ImageUploader.tsx    # 画像アップロードUI
│   │       ├── AnnotationEditor.tsx # 注釈エディタ（Fabric.js）
│   │       ├── AnnotationToolbar.tsx # 注釈ツールバー（モバイル幅は単段横スクロール（nowrap）で縦占有を抑制）
│   │       ├── PhotoManagementPanel.tsx # 写真管理パネル
│   │       ├── AnnotatedImageThumbnail.tsx # 注釈付き画像サムネイル
│   │       ├── ImageExportDialog.tsx # 画像エクスポートダイアログ
│   │       ├── StorageWarningBanner.tsx # ストレージ警告バナー
│   │       ├── ZoomControls.tsx     # ズーム操作UI（ズームイン/アウト/全体表示・倍率バッジ、44px下部配置の表示専用）
│   │       ├── tools/               # 注釈ツール
│   │       │   ├── ArrowTool.ts     # 矢印ツール
│   │       │   ├── CircleTool.ts    # 円・楕円ツール
│   │       │   ├── DimensionTool.ts # 寸法線ツール
│   │       │   ├── DimensionValueInput.tsx # 寸法値入力コンポーネント
│   │       │   ├── DimensionValueInput.stories.tsx # 寸法値入力Storybook
│   │       │   ├── FreehandTool.ts  # フリーハンドツール
│   │       │   ├── PolygonTool.ts   # 多角形ツール
│   │       │   ├── PolylineTool.ts  # 折れ線ツール
│   │       │   ├── RectangleTool.ts # 四角形ツール
│   │       │   ├── TextTool.ts      # テキストツール
│   │       │   └── registerCustomShapes.ts # カスタムシェイプ登録
│   │       └── gestures/            # タッチジェスチャー・ビューポート制御
│   │           ├── canvasViewportController.ts # 中点ズーム/パン/フィットの状態制御（純粋ロジック、UI非依存）
│   │           ├── touchGestureManager.ts # マルチタッチ調停（2本指ピンチ/3本指以上の描画抑止/cooldown）
│   │           └── gesture-thresholds.ts # ジェスチャー判定閾値の定義
│   │   ├── quantity-table-import/    # 数量表インポートコンポーネント
│   │       ├── ImportDialog.tsx    # インポートダイアログ（Excel/PDFファイル選択、プレビュー、確定）
│   │       ├── ImportPreviewTable.tsx # インポートプレビューテーブル
│   │       ├── excel-parser.ts     # Excelファイルパーサー（SheetJS）
│   │       ├── field-mapping.ts    # フィールドマッピングロジック
│   │       ├── pdf-ocr-extractor.ts # PDF OCR抽出（Claude Vision API連携）
│   │       └── useImportDataExtractor.ts # データ抽出カスタムフック
│   │   ├── quantity-table/          # 数量表コンポーネント
│   │       ├── QuantityInput.tsx    # 数量入力
│   │       ├── QuantityGroupCard.tsx # 数量グループカード
│   │       ├── QuantityGroupTitleRow.tsx # グループタイトル行（最適化表示）
│   │       ├── QuantityItemRow.tsx  # 数量項目行
│   │       ├── CalculationFields.tsx # 計算フィールド群
│   │       ├── CalculationMethodSelect.tsx # 計算方法選択
│   │       ├── AdjustmentFactorInput.tsx # 調整係数入力
│   │       ├── RoundingUnitInput.tsx # 丸め単位入力
│   │       ├── AutocompleteInput.tsx # オートコンプリート入力（フォーカス時ドロップダウン表示）
│   │       ├── ItemCopyMoveDialog.tsx # コピー・移動ダイアログ
│   │       ├── CopyQuantityTableDialog.tsx # 数量表コピーダイアログ
│   │       ├── NumericFieldInput.tsx # 数値フィールド入力
│   │       ├── TextFieldInput.tsx   # テキストフィールド入力
│   │       ├── CalculationNumericInput.tsx # 計算用数値入力
│   │       ├── EditableQuantityItemRow.tsx # 編集可能項目行
│   │       ├── FieldValidatedItemRow.tsx # バリデーション付き項目行
│   │       ├── PhotoChangeDialog.tsx # 写真変更ダイアログ
│   │       ├── PhotoCommentDisplay.tsx # 写真コメント表示
│   │       ├── PhotoPreviewDialog.tsx # 写真プレビューダイアログ
│   │       ├── SortOrderButtons.tsx # 並び順変更ボタン
│   │       └── gridConstants.ts     # グリッド定数定義
│   │   ├── itemized-statement/      # 内訳書コンポーネント
│   │       ├── CreateItemizedStatementForm.tsx # 内訳書作成フォーム
│   │       ├── CreateItemizedStatementForm.stories.tsx # Storybook
│   │       ├── ItemizedStatementDeleteDialog.tsx # 削除確認ダイアログ
│   │       └── ItemizedStatementDeleteDialog.stories.tsx # Storybook
│   │   ├── estimate-request/        # 見積依頼コンポーネント
│   │       ├── EstimateRequestForm.tsx # 見積依頼フォーム
│   │       ├── ItemSelectionPanel.tsx # 内訳書項目選択パネル（クライアントサイド状態管理+保存ボタン方式、任意分類・工種列対応）
│   │       ├── EstimateRequestTextPanel.tsx # 見積依頼文表示パネル
│   │       ├── ClipboardCopyButton.tsx # クリップボードコピーボタン
│   │       ├── ExcelExportButton.tsx # Excel出力ボタン
│   │       ├── StatusBadge.tsx       # ステータスバッジ
│   │       ├── StatusTransitionButton.tsx # ステータス遷移ボタン
│   │       └── index.ts              # エクスポート集約
│   │   ├── estimate-requests/       # 受領見積書コンポーネント
│   │       ├── ReceivedQuotationForm.tsx # 受領見積書フォーム（一括転記対応）
│   │       ├── ReceivedQuotationList.tsx # 受領見積書一覧
│   │       ├── LineItemEditor.tsx    # 明細行エディタ（customCategory・workType・数値表示形式対応）
│   │       ├── OcrDataExtractor.tsx  # OCR構造化データ抽出（再実行/リトライ機能）
│   │       ├── FileInlinePreview.tsx # ファイルインラインプレビュー（PDFテキスト抽出対応）
│   │       ├── pdf-text-extractor.ts # pdfjs-distベースPDFテキスト抽出ロジック
│   │       ├── pdf-worker-config.ts  # pdfjs-dist worker共通設定モジュール
│   │       ├── number-format.ts      # 数値表示形式・丸め規則ユーティリティ
│   │       └── index.ts              # エクスポート集約
│   │   ├── estimate/                # 見積書コンポーネント
│   │       ├── EstimateCard.tsx      # 見積書カード
│   │       ├── EstimateItemRow.tsx   # 見積項目行
│   │       ├── EstimateItemTable.tsx # 見積項目テーブル
│   │       ├── EstimateItemToolbar.tsx # 見積項目ツールバー（範囲選択・表示モード切替・取り消し統合）
│   │       ├── EstimateItemTreeView.tsx # ツリー表示（展開/折りたたみ）
│   │       ├── EstimateItemDrilldownView.tsx # ドリルダウン表示（現在階層のみ）
│   │       ├── EstimateBreadcrumbPath.tsx # 現在階層の経路表示
│   │       ├── EstimateHierarchyPanel.tsx # 階層構造の俯瞰パネル
│   │       ├── EstimateKeymapHelp.tsx # キー割当一覧の表示
│   │       ├── EstimateReportFieldsPanel.tsx # 帳票用入力項目（別途工事・有効期限・提出日）
│   │       ├── useEstimateRowDrag.ts # 行のドラッグ&ドロップ
│   │       ├── TransferQuotationDialog.tsx # 受領見積書転記ダイアログ
│   │       ├── NetCalculationPanel.tsx # NET金額案分パネル
│   │       ├── NetAllocationDialog.tsx # NET案分ダイアログ（プロジェクト単位受領見積書選択）
│   │       ├── OverheadCostPanel.tsx # 諸経費パネル
│   │       ├── ProfitRatePanel.tsx   # 利益率パネル
│   │       ├── ProfitRateDialog.tsx  # 利益率適用ダイアログ
│   │       ├── EstimateExportDialog.tsx # 帳票出力ダイアログ（PDF/Excel、行タイプ選択）
│   │       └── index.ts              # エクスポート集約
│   │   ├── contract/                # 契約書コンポーネント
│   │       ├── ContractForm.tsx     # 契約書作成・編集フォーム（新規/変更契約対応、見積書連動金額計算）
│   │       └── ComparisonPanel.tsx  # 変更契約の変更前後比較パネル
│   │   ├── schedule/               # 工程表コンポーネント
│   │       ├── ScheduleForm.tsx    # 工程表作成・編集フォーム
│   │       ├── ScheduleItemRow.tsx # 工程項目行
│   │       ├── SortableScheduleList.tsx # 並び替え可能な工程項目リスト
│   │       ├── GanttChartPanel.tsx # ガントチャート表示パネル（祝日カレンダー対応）
│   │       └── ExportDialog.tsx    # Excel/PDFエクスポートダイアログ
│   │   ├── company-info/            # 自社情報コンポーネント
│   │       └── CompanyInfoForm.tsx   # 自社情報設定フォーム
│   │   ├── contracts/               # 契約書共通コンポーネント
│   │       ├── DeleteConfirmDialog.tsx # 契約書削除確認ダイアログ
│   │       └── DeleteConfirmDialog.stories.tsx # Storybook
│   │   └── common/                  # 共通コンポーネント
│   │       ├── Breadcrumb.tsx       # パンくずナビゲーション
│   │       ├── ConflictDialog.tsx    # 楽観的排他制御競合ダイアログ
│   │       ├── UnsavedChangesDialog.tsx # 未保存変更警告ダイアログ
│   │       └── ResourceNotFound.tsx # リソース未発見表示
│   ├── contexts/          # Reactコンテキスト
│   │   └── AuthContext.tsx # 認証コンテキスト
│   ├── pages/             # ページコンポーネント
│   │   ├── Dashboard.tsx   # ダッシュボード（ログイン後ランディング）
│   │   ├── LoginPage.tsx   # ログインページ
│   │   ├── RegisterPage.tsx # 登録ページ
│   │   ├── PasswordResetPage.tsx # パスワードリセットページ
│   │   ├── Profile.tsx     # プロフィールページ
│   │   ├── Sessions.tsx    # セッション管理ページ
│   │   ├── TwoFactorSetupPage.tsx # 2FA設定ページ
│   │   ├── InvitationsPage.tsx # 招待管理ページ（管理者）
│   │   ├── UserManagement.tsx # ユーザー管理ページ（管理者）
│   │   ├── RoleManagement.tsx # ロール管理ページ（管理者）
│   │   ├── PermissionManagement.tsx # 権限管理ページ（管理者）
│   │   ├── AuditLogs.tsx   # 監査ログページ（管理者）
│   │   ├── ProjectListPage.tsx # プロジェクト一覧ページ
│   │   ├── ProjectDetailPage.tsx # プロジェクト詳細ページ
│   │   ├── ProjectCreatePage.tsx # プロジェクト作成ページ
│   │   ├── ProjectEditPage.tsx # プロジェクト編集ページ
│   │   ├── TradingPartnerListPage.tsx # 取引先一覧ページ
│   │   ├── TradingPartnerDetailPage.tsx # 取引先詳細ページ
│   │   ├── TradingPartnerCreatePage.tsx # 取引先作成ページ
│   │   ├── TradingPartnerEditPage.tsx # 取引先編集ページ
│   │   ├── SiteSurveyListPage.tsx # 現場調査一覧ページ
│   │   ├── SiteSurveyDetailPage.tsx # 現場調査詳細ページ
│   │   ├── SiteSurveyCreatePage.tsx # 現場調査作成ページ
│   │   ├── SiteSurveyEditPage.tsx # 現場調査編集ページ
│   │   ├── SiteSurveyImageViewerPage.tsx # 画像ビューア/注釈エディタページ
│   │   ├── SiteSurveyImageViewerPage.css # 表示領域高さ（`vh`→`svh`二段宣言でアドレスバー伸縮に追従。インラインstyleで表現不可のため併置）
│   │   ├── QuantityTableListPage.tsx # 数量表一覧ページ
│   │   ├── QuantityTableCreatePage.tsx # 数量表作成ページ
│   │   ├── QuantityTableEditPage.tsx # 数量表編集ページ（クライアント側ドラフト編集・明示保存）
│   │   ├── quantityTableEditReducer.ts # 数量表編集ドラフトの useReducer 状態管理（保存ボタンで saveQuantityTableDraft により一括同期）
│   │   ├── QuantityTableRedirectPage.tsx # 数量表リダイレクトページ
│   │   ├── ItemizedStatementListPage.tsx # 内訳書一覧ページ
│   │   ├── ItemizedStatementDetailPage.tsx # 内訳書詳細ページ
│   │   ├── ItemizedStatementCreatePage.tsx # 内訳書作成ページ
│   │   ├── EstimateRequestListPage.tsx # 見積依頼一覧ページ
│   │   ├── EstimateRequestCreatePage.tsx # 見積依頼作成ページ
│   │   ├── EstimateRequestDetailPage.tsx # 見積依頼詳細ページ
│   │   ├── EstimateRequestEditPage.tsx # 見積依頼編集ページ
│   │   ├── CompanyInfoPage.tsx # 自社情報設定ページ
│   │   ├── EstimateListPage.tsx # 見積書一覧ページ
│   │   ├── EstimateCreatePage.tsx # 見積書作成ページ
│   │   ├── EstimateDetailPage.tsx # 見積書詳細ページ
│   │   ├── ContractListPage.tsx # 契約書一覧ページ
│   │   ├── ContractCreatePage.tsx # 契約書作成ページ
│   │   ├── ContractDetailPage.tsx # 契約書詳細ページ
│   │   ├── ContractEditPage.tsx # 契約書編集ページ
│   │   ├── ScheduleListPage.tsx # 工程表一覧ページ
│   │   ├── ScheduleCreatePage.tsx # 工程表作成ページ
│   │   ├── ScheduleDetailPage.tsx # 工程表詳細ページ
│   │   ├── ExecutionBudgetPage.tsx # 実行予算管理ページ（発注・出来高・原価統合）
│   │   ├── OrderDetailPage.tsx # 発注詳細ページ
│   │   ├── ProgressInputPage.tsx # 出来高入力ページ
│   │   ├── ConstructionPhotoListPage.tsx # 工事写真台帳一覧ページ
│   │   ├── ConstructionPhotoCreatePage.tsx # 工事写真台帳作成ページ
│   │   ├── ConstructionPhotoDetailPage.tsx # 工事写真台帳詳細ページ（写真項目・看板配置・PDF出力）
│   │   ├── ConstructionPhotoEditPage.tsx # 工事写真台帳編集ページ
│   │   ├── ConstructionPhotoImageViewerPage.tsx # 工事写真フルスクリーンビューア（ズーム/回転/パン）
│   │   └── ConstructionSignboardListPage.tsx # 工事看板マスタ管理ページ
│   ├── routes.tsx          # ルーティング設定（React Router v7）
│   ├── utils/             # ユーティリティ関数
│   │   ├── formatters.ts  # 日付フォーマット、APIステータス変換等
│   │   ├── image-compression.ts # 送信前の画像縮小・再エンコード（長辺2048px/JPEG0.85、非対応時は元ファイルへフォールバック）
│   │   ├── imageFitScale.ts # 画像フィット倍率算出の純関数（computeFitScale、allowUpscale/maxUpscaleで原寸頭打ちを制御）
│   │   ├── responsive.ts  # ブレークポイント・メディアクエリの単一情報源（BREAKPOINTS/MEDIA_QUERIES）
│   │   ├── react.ts       # Reactカスタムフック（useDebounce、usePrevious等）
│   │   ├── accessibility.ts # アクセシビリティユーティリティ
│   │   ├── calculation-engine.ts # 数量計算エンジン（フロントエンド版）
│   │   ├── field-validation.ts # フィールドバリデーション（文字数制限）
│   │   ├── numeric-range-validation.ts # 数値範囲バリデーション
│   │   ├── export-excel.ts # Excelエクスポート（内訳書、SheetJS）
│   │   └── copy-to-clipboard.ts # クリップボードコピー（タブ区切り）
│   ├── App.tsx            # メインAppコンポーネント（TypeScript）
│   ├── main.tsx           # Reactエントリーポイント（TypeScript）
│   └── vite-env.d.ts      # Vite環境変数型定義
├── public/                # 公開静的ファイル
├── dist/                  # ビルド成果物（.gitignore）
├── tsconfig.json          # TypeScript設定（Vite/React専用、Incremental Build有効）
├── tsconfig.node.json     # TypeScript設定（Vite設定ファイル用、composite: true）
├── vitest.config.ts       # Vitest設定（jsdom環境）
├── vitest.setup.ts        # Vitestセットアップスクリプト
├── Dockerfile             # 本番環境用（nginx）
├── Dockerfile.dev         # 開発環境用（Vite dev server）
├── docker-entrypoint.sh   # Docker起動時の依存関係チェック（アーキテクチャ固有モジュール対応）
├── railway.toml           # Railway デプロイ設定
├── nginx.conf             # nginx本番環境設定
├── vite.config.ts         # Vite設定（TypeScript版、ベストプラクティス）
├── package.json           # 依存関係（lint-staged設定を含む）
├── eslint.config.js       # ESLint設定（Flat Config形式、vitest.config.ts, vite.config.ts除外）
├── .prettierrc            # Prettier設定（プロジェクトルートからコピー、CI互換性確保）
└── .env.example           # 環境変数テンプレート
```

**package.json の lint-staged設定:**

```json
"lint-staged": {
  "*.{ts,tsx}": [
    "prettier --write",
    "eslint --fix"
  ]
}
```

**Storybookストーリーファイル:**

認証・共通コンポーネント:
- `ErrorBoundary.stories.tsx` - エラーバウンダリコンポーネント（5バリアント）
- `LoginForm.stories.tsx` - ログインフォーム
- `RegisterForm.stories.tsx` - 登録フォーム
- `PasswordResetForm.stories.tsx` - パスワードリセットフォーム
- `PasswordStrengthIndicator.stories.tsx` - パスワード強度インジケーター
- `RolePermissionManager.stories.tsx` - ロール権限管理
- `SessionManagement.stories.tsx` - セッション管理
- `TwoFactorSetupForm.stories.tsx` - 2FA初期設定
- `TwoFactorVerificationForm.stories.tsx` - 2FA検証
- `common/Breadcrumb.stories.tsx` - パンくずナビゲーション
- `common/ResourceNotFound.stories.tsx` - リソース未発見表示

現場調査コンポーネント（site-surveys/）:
- `SiteSurveyForm.stories.tsx` - 現場調査フォーム
- `SiteSurveyListTable.stories.tsx` - 一覧テーブル
- `SiteSurveyListCard.stories.tsx` - 一覧カード（モバイル）
- `SiteSurveyResponsiveView.stories.tsx` - レスポンシブビュー
- `SiteSurveyDetailInfo.stories.tsx` - 詳細情報表示
- `ImageUploader.stories.tsx` - 画像アップロード
- `AnnotationToolbar.stories.tsx` - 注釈ツールバー
- `PhotoManagementPanel.stories.tsx` - 写真管理パネル
- `AnnotatedImageThumbnail.stories.tsx` - 注釈付きサムネイル
- `ImageExportDialog.stories.tsx` - エクスポートダイアログ
- `StorageWarningBanner.stories.tsx` - ストレージ警告バナー
- `tools/DimensionValueInput.stories.tsx` - 寸法値入力

現場調査コンポーネント（site-survey/）:
- `RestoreAnnotationDialog.stories.tsx` - 注釈復元ダイアログ

数量表コンポーネント（quantity-table/）:
- `AdjustmentFactorInput.stories.tsx` - 調整係数入力
- `AutocompleteInput.stories.tsx` - オートコンプリート入力
- `CalculationFields.stories.tsx` - 計算フィールド群
- `CalculationMethodSelect.stories.tsx` - 計算方法選択
- `CalculationNumericInput.stories.tsx` - 計算用数値入力
- `EditableQuantityItemRow.stories.tsx` - 編集可能項目行
- `FieldValidatedItemRow.stories.tsx` - バリデーション付き項目行
- `ItemCopyMoveDialog.stories.tsx` - コピー・移動ダイアログ
- `NumericFieldInput.stories.tsx` - 数値フィールド入力
- `QuantityGroupCard.stories.tsx` - 数量グループカード
- `QuantityInput.stories.tsx` - 数量入力
- `QuantityItemRow.stories.tsx` - 数量項目行
- `RoundingUnitInput.stories.tsx` - 丸め単位入力
- `TextFieldInput.stories.tsx` - テキストフィールド入力
- `PhotoChangeDialog.stories.tsx` - 写真変更ダイアログ
- `PhotoCommentDisplay.stories.tsx` - 写真コメント表示
- `PhotoPreviewDialog.stories.tsx` - 写真プレビューダイアログ
- `SortOrderButtons.stories.tsx` - 並び順変更ボタン

数量表インポートコンポーネント（quantity-table-import/）:
- `ImportDialog.stories.tsx` - インポートダイアログ
- `ImportPreviewTable.stories.tsx` - インポートプレビューテーブル

契約書コンポーネント（contract/）:
- `ContractForm.stories.tsx` - 契約書フォーム
- `ComparisonPanel.stories.tsx` - 変更前後比較パネル

契約書共通コンポーネント（contracts/）:
- `DeleteConfirmDialog.stories.tsx` - 契約書削除確認ダイアログ

プロジェクトコンポーネント（projects/）:
- `ContractSectionCard.stories.tsx` - 契約書セクションカード
- `QuantityTableSectionCard.stories.tsx` - 数量表セクションカード

内訳書コンポーネント（itemized-statement/）:
- `CreateItemizedStatementForm.stories.tsx` - 内訳書作成フォーム
- `ItemizedStatementDeleteDialog.stories.tsx` - 削除確認ダイアログ

**実装済み拡張ディレクトリ:**

```
frontend/src/
├── api/               # APIクライアント
│   ├── auth.ts        # 認証API
│   ├── client.ts      # 共通クライアント
│   ├── projects.ts    # プロジェクトAPI
│   ├── quantity-tables.ts # 数量表API
│   ├── site-surveys.ts # 現場調査API
│   ├── survey-annotations.ts # 注釈API
│   ├── survey-images.ts # 調査画像API
│   ├── construction-photos.ts # 工事写真台帳API（アルバム・写真項目・看板配置）
│   ├── construction-photo-images.ts # 工事写真画像API（アップロード・原本/印刷画像配信）
│   ├── construction-signboards.ts # 工事看板マスタAPI
│   ├── trading-partners.ts # 取引先API
│   ├── itemized-statements.ts # 内訳書API
│   ├── estimate-requests.ts # 見積依頼API
│   ├── estimate-request-status.ts # 見積依頼ステータスAPI
│   ├── received-quotations.ts # 受領見積書API
│   ├── claude-vision.ts # Claude Vision OCR API
│   ├── company-info.ts # 自社情報API
│   ├── estimates.ts # 見積書API
│   └── contracts.ts # 契約書API
│   ├── schedules.ts # 工程表API
│   ├── execution-budget.ts # 実行予算API
│   ├── order-detail.ts # 発注詳細API
│   └── progress.ts # 出来高API
├── domain/            # UI非依存のドメインロジック層（純関数・reducer。Reactに依存させない）
│   └── estimate/      # 見積明細の編集モデル
│       ├── estimateEditReducer.ts # 編集状態の遷移関数（行操作・階層移動・範囲操作）
│       ├── estimateTree.ts # ツリー導出・祖先金額の再計算
│       ├── estimateCalculations.ts # 案分・利益率・集計のクライアント計算
│       └── estimateKeymap.ts # キー割当の単一定義（画面のヘルプ表示と共用）
├── hooks/             # カスタムフック（useMediaQuery、useAuth、useEstimateEditor、useEstimateKeyboard、useEstimateUndo、useEstimateNavigation、useEstimateViewModePreference、useAutocompleteCandidateStore、useUnsavedChanges、useScheduleState、useHolidayCalendar、useCanvasViewport（注釈Canvasの中点ズーム/パン/フィット状態）、useElementSize（ResizeObserverで要素実寸を購読し再フィットに使用）等）
├── services/          # サービス層（TokenRefreshManager.ts、AutoSaveManager.ts、UndoManager.ts）
│   └── export/        # 帳票・エクスポート生成（jsPDF/SheetJS。`load*ExportService.ts` の動的importで初期チャンクから分離）
├── types/             # 型定義（auth.types.ts、session.types.ts、quantity-import.types.ts等）
├── utils/             # ユーティリティ関数
│   ├── calculation-engine.ts # 数量計算エンジン（フロントエンド版）
│   ├── estimate-calculation.ts # 見積金額計算ユーティリティ（数値表示形式・丸め規則）
│   ├── field-validation.ts # フィールドバリデーション
│   └── numeric-range-validation.ts # 数値範囲バリデーション
└── assets/            # 静的アセット（今後追加予定）
```

**想定される追加拡張:**

```
frontend/src/
└── stores/            # 状態管理（今後追加予定）
```

### `backend/`

バックエンドAPIのソースコードと設定。

**現在の構成:**

```
backend/
├── docs/                  # API ドキュメント
│   └── api-spec.json      # OpenAPI 3.0仕様（自動生成）
├── performance/           # パフォーマンステスト
│   ├── autocannon.d.ts    # autocannonカスタム型定義
│   └── health-check.perf.ts  # ヘルスチェック負荷テスト（<100ms、>1000req/s）
├── prisma/
│   └── schema.prisma      # Prismaスキーマ定義（データモデル、マイグレーション）
├── src/
│   ├── __tests__/         # テスト（ブランチカバレッジ80%達成✅）
│   │   ├── integration/   # 統合テスト（PostgreSQL・Redisを実起動）
│   │   └── unit/          # 単体テスト（以下は代表例。区分の網羅列挙は tech.md「テスト構成」）
│   │       ├── errors/    # エラークラステスト
│   │       │   └── ApiError.test.ts  # カスタムAPIエラークラス
│   │       ├── middleware/  # ミドルウェアテスト
│   │       │   ├── errorHandler.test.ts        # エラーハンドリング（Zod、Prisma、一般エラー）
│   │       │   ├── httpsRedirect.test.ts       # HTTPS強制とHSTSヘッダー
│   │       │   ├── validate.test.ts            # Zodバリデーション（body/query/params）
│   │       │   ├── authenticate.middleware.test.ts # JWT認証ミドルウェア
│   │       │   ├── authorize.middleware.test.ts    # 権限チェックミドルウェア
│   │       │   ├── RedisRateLimitStore.test.ts # Redisレート制限ストア
│   │       │   ├── rateLimit.test.ts           # レート制限ミドルウェア
│   │       │   └── logger.test.ts              # HTTPロガーミドルウェア
│   │       ├── routes/    # ルートテスト
│   │       │   ├── admin.routes.test.ts  # 管理者ルート（ログレベル動的変更）
│   │       │   └── jwks.routes.test.ts   # JWKS公開鍵配信
│   │       ├── services/  # サービステスト
│   │       │   ├── auth.service.test.ts  # 認証統合
│   │       │   ├── token.service.test.ts # JWTトークン管理（EdDSA署名）
│   │       │   ├── session.service.test.ts # セッション管理
│   │       │   ├── invitation.service.test.ts # 招待制登録
│   │       │   ├── password.service.test.ts # パスワード管理
│   │       │   ├── two-factor.service.test.ts # 2FA管理（TOTP + バックアップコード）
│   │       │   ├── role.service.test.ts # ロール管理
│   │       │   ├── permission.service.test.ts # 権限管理
│   │       │   ├── role-permission.service.test.ts # ロール権限紐付け
│   │       │   ├── user-role.service.test.ts # ユーザーロール管理
│   │       │   ├── rbac.service.test.ts # RBAC統合
│   │       │   ├── audit-log.service.test.ts # 監査ログ
│   │       │   ├── audit-log-archive.service.test.ts # ログアーカイブ
│   │       │   ├── email.service.test.ts # メール送信（Bull非同期キュー）
│   │       │   ├── project.service.test.ts # プロジェクト管理
│   │       │   └── project-status.service.test.ts # プロジェクトステータス遷移
│   │       ├── utils/     # ユーティリティテスト
│   │       │   └── sentry.test.ts  # Sentryエラートラッキング
│   │       └── config/    # 設定テスト
│   │           └── env.test.ts     # 環境変数バリデーション
│   ├── errors/            # カスタムエラー定義
│   │   ├── apiError.ts    # 汎用APIエラークラス
│   │   ├── projectError.ts # プロジェクト関連エラー
│   │   ├── tradingPartnerError.ts # 取引先関連エラー
│   │   ├── siteSurveyError.ts # 現場調査関連エラー
│   │   ├── quantityTableError.ts # 数量表関連エラー
│   │   ├── itemizedStatementError.ts # 内訳書関連エラー
│   │   ├── estimateRequestError.ts # 見積依頼関連エラー
│   │   ├── estimateRequestStatusError.ts # 見積依頼ステータス関連エラー
│   │   ├── receivedQuotationError.ts # 受領見積書関連エラー
│   │   ├── companyInfoError.ts # 自社情報関連エラー
│   │   ├── estimateError.ts # 見積書関連エラー
│   │   ├── claudeVisionError.ts # Claude Vision関連エラー
│   │   ├── contractError.ts # 契約書関連エラー
│   │   ├── scheduleError.ts # 工程表関連エラー
│   │   ├── executionBudgetError.ts # 実行予算関連エラー
│   │   ├── orderError.ts # 発注関連エラー
│   │   └── progressError.ts # 出来高関連エラー
│   ├── middleware/        # ミドルウェア
│   │   ├── errorHandler.middleware.ts  # エラーハンドリング
│   │   ├── httpsRedirect.middleware.ts # HTTPS強制リダイレクト
│   │   ├── logger.middleware.ts        # Pino HTTPロギング
│   │   ├── validate.middleware.ts      # Zodバリデーション
│   │   ├── authenticate.middleware.ts  # JWT認証
│   │   └── authorize.middleware.ts     # 権限チェック（RBAC）
│   ├── routes/            # ルート定義
│   │   ├── admin.routes.ts  # 管理者ルート（Swagger JSDoc付き）
│   │   ├── jwks.routes.ts   # JWKS公開鍵配信（RFC 7517準拠）
│   │   ├── auth.routes.ts   # 認証ルート（招待登録、ログイン、2FA等）
│   │   ├── invitation.routes.ts # 招待管理ルート
│   │   ├── session.routes.ts # セッション管理ルート
│   │   ├── audit-log.routes.ts # 監査ログルート
│   │   ├── permissions.routes.ts # 権限管理ルート
│   │   ├── roles.routes.ts  # ロール管理ルート
│   │   ├── user-roles.routes.ts # ユーザーロール管理ルート
│   │   ├── users.routes.ts  # ユーザー管理ルート（担当者候補取得）
│   │   ├── projects.routes.ts # プロジェクト管理ルート（CRUD、ステータス遷移）
│   │   ├── trading-partners.routes.ts # 取引先管理ルート（CRUD、検索）
│   │   ├── site-surveys.routes.ts # 現場調査ルート（CRUD）
│   │   ├── survey-images.routes.ts # 調査画像ルート（アップロード、削除、順序変更）
│   │   ├── annotation.routes.ts # 注釈ルート（保存、取得、エクスポート）
│   │   ├── quantity-tables.routes.ts # 数量表ルート（CRUD）
│   │   ├── quantity-groups.routes.ts # 数量グループルート（CRUD）
│   │   ├── quantity-items.routes.ts # 数量項目ルート（CRUD、移動）
│   │   ├── autocomplete.routes.ts # オートコンプリートルート（入力支援）
│   │   ├── itemized-statements.routes.ts # 内訳書ルート（CRUD、ピボット集計）
│   │   ├── estimate-requests.routes.ts # 見積依頼ルート（CRUD、項目選択）
│   │   ├── estimate-request-status.routes.ts # 見積依頼ステータスルート
│   │   ├── received-quotation.routes.ts # 受領見積書ルート（ファイルアップロード）
│   │   ├── company-info.routes.ts # 自社情報ルート（シングルトンCRUD）
│   │   ├── project-quotations.routes.ts # プロジェクト単位受領見積書取得ルート（転記用）
│   │   ├── claude-vision.routes.ts # Claude Vision OCRルート（見積書構造化データ抽出）
│   │   ├── estimates.routes.ts # 見積書ルート（CRUD、明細一括保存 PUT /:id/save、明細取得、諸経費計算）
│   │   ├── contracts.routes.ts # 契約書ルート（CRUD、ステータス遷移）
│   │   ├── schedules.routes.ts # 工程表ルート（CRUD、エクスポート）
│   │   ├── execution-budget.routes.ts # 実行予算ルート（CRUD、変更契約適用）
│   │   ├── order.routes.ts # 発注ルート（CRUD、ステータス遷移、金額案分）
│   │   ├── progress.routes.ts # 出来高ルート（CRUD、パーセンテージ入力）
│   │   ├── cost-monthly-close.routes.ts # 月次締めルート（原価管理）
│   │   └── export.routes.ts # エクスポートルート（発注書・出来高Excel/PDF）
│   ├── config/            # 設定ファイル
│   │   ├── env.ts          # 環境変数設定
│   │   └── security.constants.ts # セキュリティ定数
│   ├── schemas/           # Zodバリデーションスキーマ
│   │   ├── project.schema.ts # プロジェクト関連
│   │   ├── trading-partner.schema.ts # 取引先関連
│   │   ├── site-survey.schema.ts # 現場調査関連
│   │   ├── annotation.schema.ts # 注釈関連
│   │   ├── quantity-table.schema.ts # 数量表関連
│   │   ├── itemized-statement.schema.ts # 内訳書関連
│   │   ├── estimate-request.schema.ts # 見積依頼関連
│   │   ├── received-quotation.schema.ts # 受領見積書関連
│   │   ├── company-info.schema.ts # 自社情報関連
│   │   ├── claude-vision.schema.ts # Claude Vision OCR関連
│   │   ├── estimate.schema.ts # 見積書関連
│   │   ├── contract.schema.ts # 契約書関連
│   │   ├── schedule.schema.ts # 工程表関連
│   │   └── execution-budget.schema.ts # 実行予算関連
│   ├── services/          # ビジネスロジック
│   │   ├── auth.service.ts  # 認証統合サービス
│   │   ├── token.service.ts # JWTトークン管理（EdDSA署名）
│   │   ├── session.service.ts # セッション管理
│   │   ├── invitation.service.ts # 招待制登録
│   │   ├── password.service.ts # パスワード管理（Argon2）
│   │   ├── two-factor.service.ts # 2FA管理（TOTP + バックアップコード）
│   │   ├── role.service.ts # ロール管理
│   │   ├── permission.service.ts # 権限管理
│   │   ├── role-permission.service.ts # ロール権限紐付け
│   │   ├── user-role.service.ts # ユーザーロール管理
│   │   ├── rbac.service.ts # RBAC統合サービス
│   │   ├── audit-log.service.ts # 監査ログ
│   │   ├── audit-log-archive.service.ts # ログアーカイブ
│   │   ├── email.service.ts # メール送信（Bull非同期キュー、Handlebars）
│   │   ├── project.service.ts # プロジェクト管理（CRUD、楽観的排他制御）
│   │   ├── project-status.service.ts # プロジェクトステータス遷移（12種類のステータス）
│   │   ├── trading-partner.service.ts # 取引先管理（CRUD、種別管理、楽観的排他制御）
│   │   ├── site-survey.service.ts # 現場調査管理（CRUD、楽観的排他制御）
│   │   ├── survey-image.service.ts # 調査画像管理（メタデータ管理）
│   │   ├── image-upload.service.ts # 画像アップロード（R2連携）
│   │   ├── image-processor.service.ts # 画像処理（圧縮、サムネイル生成）
│   │   ├── batch-upload.service.ts # バッチアップロード（キュー処理）
│   │   ├── image-order.service.ts # 画像順序管理
│   │   ├── image-delete.service.ts # 画像削除（R2連携）
│   │   ├── image-list.service.ts # 画像一覧取得（署名付きURL付き）
│   │   ├── image-metadata.service.ts # 画像メタデータ管理
│   │   ├── signed-url.service.ts # 署名付きURL生成（R2）
│   │   ├── annotation.service.ts # 注釈管理（Fabric.js JSON保存）
│   │   ├── annotated-thumbnail.service.ts # 注釈付きサムネイル生成
│   │   ├── quantity-table.service.ts # 数量表管理（CRUD、saveDraft によるフル状態同期、楽観的排他制御）
│   │   ├── quantity-group.service.ts # 数量グループ管理（CRUD、写真紐づけ）
│   │   ├── quantity-item.service.ts # 数量項目管理（CRUD、移動、コピー）
│   │   ├── quantity-validation.service.ts # 数量バリデーション（必須項目、計算方法別検証）
│   │   ├── quantity-field-validation.service.ts # フィールドバリデーション（文字数制限、数値範囲）
│   │   ├── calculation-engine.ts # 計算エンジン（標準、面積体積、ピッチ計算）
│   │   ├── itemized-statement.service.ts # 内訳書管理（CRUD、楽観的排他制御）
│   │   ├── itemized-statement-pivot.service.ts # 内訳書ピボット集計（分類軸グループ化）
│   │   ├── estimate-request.service.ts # 見積依頼管理（CRUD、項目選択、楽観的排他制御）
│   │   ├── estimate-request-status.service.ts # 見積依頼ステータス管理
│   │   ├── estimate-request-text.service.ts # 見積依頼文生成（メール/FAX対応）
│   │   ├── received-quotation.service.ts # 受領見積書管理（ファイルアップロード）
│   │   ├── company-info.service.ts # 自社情報管理（シングルトンパターン、楽観的排他制御）
│   │   ├── estimate.service.ts # 見積書管理（CRUD、楽観的排他制御）
│   │   ├── estimate-item.service.ts # 見積項目管理（3行1セット、階層構造）
│   │   ├── estimate-draft.service.ts # 見積明細の一括保存（ツリー全体の差分適用、単一トランザクション、楽観ロック）
│   │   ├── estimate-calculation.service.ts # 見積金額計算（NET金額案分）
│   │   ├── estimate-validation.service.ts # 見積書バリデーション
│   │   ├── overhead-cost.service.ts # 諸経費計算（行の追加はクライアント側）
│   │   ├── claude-vision.service.ts # Claude Vision OCR（Anthropic API統合、見積書構造化データ抽出）
│   │   ├── contract.service.ts # 契約書管理（CRUD、ステータス遷移、見積書連動金額計算、楽観的排他制御）
│   │   ├── schedule.service.ts # 工程表管理（CRUD、工程項目管理、数量表連携、楽観的排他制御）
│   │   ├── schedule-export.service.ts # 工程表エクスポート（Excel/PDF出力）
│   │   ├── execution-budget.service.ts # 実行予算管理（CRUD、契約書・見積書連動、変更契約適用、楽観的排他制御）
│   │   ├── order.service.ts # 発注管理（CRUD、ステータス遷移、金額案分）
│   │   ├── order-export.service.ts # 発注書エクスポート（Excel/PDF出力）
│   │   ├── progress.service.ts # 出来高管理（CRUD、パーセンテージ入力）
│   │   ├── progress-export.service.ts # 出来高エクスポート（Excel/PDF出力）
│   │   ├── cost.service.ts # 原価管理（原価集計・分析）
│   │   └── monthly-close.service.ts # 月次締め処理（締め・解除・履歴管理）
│   ├── storage/           # ストレージ抽象化レイヤー
│   │   ├── index.ts       # エクスポート集約
│   │   ├── storage-provider.interface.ts # ストレージプロバイダーインターフェース
│   │   ├── storage-factory.ts # ストレージファクトリー（環境別自動判定）
│   │   ├── local-storage.provider.ts # ローカルストレージ（開発・テスト用）
│   │   └── r2-storage.provider.ts # R2ストレージ（本番用）
│   ├── templates/         # メールテンプレート
│   │   └── （Handlebarsテンプレート）
│   ├── types/             # カスタム型定義
│   │   ├── express.d.ts   # Express Request拡張（pinoログ、user追加）
│   │   ├── env.d.ts       # 環境変数型定義（型安全なprocess.env）
│   │   ├── result.ts      # Result型（Ok/Err）
│   │   ├── auth.types.ts  # 認証関連型定義
│   │   ├── session.types.ts # セッション関連型定義
│   │   ├── password.types.ts # パスワード関連型定義
│   │   └── project.types.ts # プロジェクト関連型定義（ステータス、遷移）
│   ├── utils/             # ユーティリティ関数
│   │   ├── logger.ts      # Pinoロガー設定（Railway環境対応、pino-pretty統合）
│   │   ├── sentry.ts      # Sentryエラートラッキング
│   │   ├── cache.ts       # キャッシュユーティリティ
│   │   ├── controller-helpers.ts # コントローラーヘルパー
│   │   ├── result-mapper.ts # Result型マッパー
│   │   ├── kana-converter.ts # かな変換ユーティリティ
│   │   ├── seed-helpers.ts # シードデータヘルパー
│   │   └── timing.ts      # タイミングユーティリティ
│   ├── app.ts             # Expressアプリケーション（テスト用に分離、Swagger UI統合）
│   ├── index.ts           # Expressサーバーエントリーポイント（app.tsをimportして起動）
│   ├── generate-swagger.ts  # Swagger/OpenAPI仕様生成スクリプト（JSDocから生成）
│   ├── generated/         # 生成されたコード
│   │   └── prisma/        # Prisma Client出力先（Prisma 7 Driver Adapter）
│   ├── db.ts              # Prisma Client（Driver Adapter Pattern、lazy initialization）
│   └── redis.ts           # Redis接続管理（lazy initialization）
├── tsconfig.json          # TypeScript設定（Node.js専用、strictモード、Incremental Build有効、performance/含む）
├── vitest.config.ts       # Vitest設定（Node.js環境）
├── vitest.setup.ts        # Vitestセットアップスクリプト
├── Dockerfile.dev         # 開発環境用Dockerイメージ
├── docker-entrypoint.sh   # Docker起動時の依存関係チェック
├── railway.toml           # Railway デプロイ設定
├── package.json           # 依存関係（lint-staged設定を含む）
├── eslint.config.js       # ESLint設定（Flat Config形式、vitest.config.ts除外）
├── .prettierrc            # Prettier設定（プロジェクトルートからコピー、CI互換性確保）
└── .env.example           # 環境変数テンプレート
```

**package.json の lint-staged設定:**

```json
"lint-staged": {
  "*.{js,ts}": [
    "prettier --write",
    "eslint --fix"
  ],
  "prisma/schema.prisma": [
    "prisma format"
  ]
}
```

**想定される拡張:**

```
backend/src/
├── controllers/       # APIコントローラー（今後追加）
├── models/            # データモデル（今後追加）
├── services/          # ビジネスロジック（今後追加）
├── routes/            # ルーティング定義（今後追加）
├── middlewares/       # ミドルウェア（今後追加）
└── utils/             # ユーティリティ関数（今後追加）
```

**主要ファイルの説明:**

- `prisma/schema.prisma`: Prismaスキーマ定義。データモデル、リレーション、インデックスを定義
- `app.ts`: Expressアプリケーション本体。ミドルウェア、ルート、エラーハンドリング、Swagger UI統合を定義。単体テスト可能にするためindex.tsから分離
- `index.ts`: サーバー起動エントリーポイント。app.tsからExpressアプリをimportし、ポートをリッスン
- `generate-swagger.ts`: Swagger/OpenAPI 3.0仕様生成スクリプト。JSDocコメントからapi-spec.jsonを自動生成
- `docs/api-spec.json`: 自動生成されたOpenAPI 3.0仕様ファイル。Swagger UIで提供される
- `performance/health-check.perf.ts`: autocannonを使用したヘルスチェックエンドポイントの負荷テスト（目標: <100ms、>1000req/s）
- `performance/autocannon.d.ts`: autocannonライブラリのカスタム型定義ファイル（TypeScript型安全性）
- `db.ts`: Prisma 7 Driver Adapter Patternによる接続管理。`@prisma/adapter-pg`と`PrismaPg`を使用し、lazy initializationにより初回アクセス時に接続確立。Prisma Clientは`./generated/prisma/client.js`からインポート
- `redis.ts`: Redisクライアントのlazy initialization実装。初回アクセス時に接続確立
- `errors/apiError.ts`: カスタムAPIエラークラス。BadRequestError、ValidationError等を提供
- `middleware/errorHandler.middleware.ts`: グローバルエラーハンドラー。Zod、Prisma、一般エラーを統一的に処理
- `middleware/httpsRedirect.middleware.ts`: 本番環境でHTTPSへの強制リダイレクトとHSTSヘッダー設定
- `middleware/validate.middleware.ts`: Zodスキーマによるリクエストバリデーション（body/query/params）
- `routes/admin.routes.ts`: 管理者用ルート（ログレベル動的変更）。Swagger JSDocコメント付き
- `utils/logger.ts`: Pinoロガー設定。Railway環境では構造化JSON、開発環境ではpino-prettyで視認性向上

**実装済みAPI:**

**基盤API:**
- `GET /health`: ヘルスチェックエンドポイント（サービス状態、DB/Redis接続状態）
- `GET /api`: API情報エンドポイント（バージョン情報）
- `GET /docs`: Swagger UIによるインタラクティブなAPIドキュメント（開発環境のみ）
- `GET /favicon.ico`: 404エラー防止用faviconハンドラー

**管理API（admin.routes.ts）:**
- `POST /admin/log-level`: ログレベル動的変更（本番環境デバッグ用）
- `GET /admin/log-level`: 現在のログレベル取得

**認証API（auth.routes.ts）:**
- 招待登録、ログイン、ログアウト、トークンリフレッシュ、2FA検証、パスワードリセット、ユーザー情報取得

**招待管理API（invitation.routes.ts）:**
- 招待トークン生成、招待メール送信

**2FA管理API（auth.routes.ts内）:**
- 2FA初期設定、有効化、無効化、バックアップコード再生成

**セッション管理API（session.routes.ts）:**
- セッション一覧取得、特定セッション削除、セッション有効期限延長

**ロール管理API（roles.routes.ts）:**
- ロールCRUD、ロール一覧取得

**権限管理API（permissions.routes.ts）:**
- 権限CRUD、権限一覧取得、ロール権限紐付け

**ユーザーロール管理API（user-roles.routes.ts）:**
- ユーザーロール割り当て、解除、一覧取得

**監査ログAPI（audit-log.routes.ts）:**
- 監査ログ一覧取得（フィルタリング、ページネーション）、ログアーカイブ

**公開鍵配信API（jwks.routes.ts）:**
- `GET /.well-known/jwks.json`: JWT検証用公開鍵（JWKS形式、RFC 7517準拠）

**プロジェクト管理API（projects.routes.ts）:**
- `GET /api/projects`: プロジェクト一覧取得（ページネーション、検索、フィルタリング、ソート）
- `GET /api/projects/:id`: プロジェクト詳細取得
- `POST /api/projects`: プロジェクト作成
- `PUT /api/projects/:id`: プロジェクト更新（楽観的排他制御）
- `DELETE /api/projects/:id`: プロジェクト論理削除
- `PATCH /api/projects/:id/status`: ステータス変更（差し戻し理由必須対応）
- `GET /api/projects/status-counts`: ステータス別プロジェクト件数取得
- `GET /api/projects/:id/status-history`: ステータス変更履歴取得

**ユーザー管理API（users.routes.ts）:**
- `GET /api/users/assignable`: 担当者候補一覧取得（admin以外の有効なユーザー）

**取引先管理API（trading-partners.routes.ts）:**
- `GET /api/trading-partners`: 取引先一覧取得（ページネーション、検索、フィルタリング、ソート）
- `GET /api/trading-partners/:id`: 取引先詳細取得
- `POST /api/trading-partners`: 取引先作成
- `PUT /api/trading-partners/:id`: 取引先更新（楽観的排他制御）
- `DELETE /api/trading-partners/:id`: 取引先論理削除
- `GET /api/trading-partners/search`: 取引先検索（オートコンプリート用）

**現場調査管理API（site-surveys.routes.ts）:**
- `POST /api/projects/:projectId/site-surveys`: 現場調査作成
- `GET /api/projects/:projectId/site-surveys`: 現場調査一覧取得（ページネーション、検索、フィルタリング）
- `GET /api/site-surveys/:id`: 現場調査詳細取得
- `PUT /api/site-surveys/:id`: 現場調査更新（楽観的排他制御）
- `DELETE /api/site-surveys/:id`: 現場調査論理削除

**調査画像API（survey-images.routes.ts）:**
- `POST /api/site-surveys/:id/images`: 画像アップロード（multipart/form-data）
- `GET /api/site-surveys/:id/images`: 画像一覧取得
- `PUT /api/site-surveys/:id/images/order`: 画像順序変更
- `DELETE /api/site-surveys/images/:imageId`: 画像削除

**注釈API（annotation.routes.ts）:**
- `GET /api/site-surveys/images/:imageId/annotations`: 注釈データ取得
- `PUT /api/site-surveys/images/:imageId/annotations`: 注釈データ保存（Fabric.js JSON）
- `GET /api/site-surveys/images/:imageId/annotations/export`: 注釈JSONエクスポート

**数量表管理API（quantity-tables.routes.ts）:**
- `GET /api/projects/:projectId/quantity-tables`: 数量表一覧取得
- `GET /api/quantity-tables/:id`: 数量表詳細取得
- `POST /api/projects/:projectId/quantity-tables`: 数量表作成
- `PUT /api/quantity-tables/:id`: 数量表更新（名前等のメタ更新、楽観的排他制御）
- `PUT /api/quantity-tables/:id/save`: フル状態同期保存（saveDraft）。クライアント側ドラフトのグループ・項目全体を一括確定。expectedUpdatedAt による楽観的排他制御。旧 bulk-save を統合・置換
- `DELETE /api/quantity-tables/:id`: 数量表削除

**数量グループAPI（quantity-groups.routes.ts）:**
- `POST /api/quantity-tables/:tableId/groups`: 数量グループ作成
- `PUT /api/quantity-groups/:id`: 数量グループ更新
- `DELETE /api/quantity-groups/:id`: 数量グループ削除

**数量項目API（quantity-items.routes.ts）:**
- `POST /api/quantity-groups/:groupId/items`: 数量項目作成
- `PUT /api/quantity-items/:id`: 数量項目更新
- `DELETE /api/quantity-items/:id`: 数量項目削除
- `POST /api/quantity-items/:id/copy`: 数量項目コピー
- `POST /api/quantity-items/:id/move`: 数量項目移動

**オートコンプリートAPI（autocomplete.routes.ts）:**
- `GET /api/projects/:projectId/autocomplete/:field`: フィールド別入力候補取得

**内訳書管理API（itemized-statements.routes.ts）:**
- `GET /api/projects/:projectId/itemized-statements`: 内訳書一覧取得（ページネーション、検索）
- `GET /api/projects/:projectId/itemized-statements/latest`: プロジェクト詳細用サマリー取得
- `GET /api/itemized-statements/:id`: 内訳書詳細取得（全項目含む）
- `POST /api/projects/:projectId/itemized-statements`: 内訳書作成（数量表ピボット集計）
- `DELETE /api/itemized-statements/:id`: 内訳書論理削除（楽観的排他制御）
- `PATCH /api/itemized-statements/:id/items/order`: 内訳書項目並び替え（バッチ保存）

**見積依頼管理API（estimate-requests.routes.ts）:**
- `GET /api/projects/:projectId/estimate-requests`: 見積依頼一覧取得（ページネーション）
- `GET /api/estimate-requests/:id`: 見積依頼詳細取得（項目選択含む）
- `POST /api/projects/:projectId/estimate-requests`: 見積依頼作成
- `PUT /api/estimate-requests/:id`: 見積依頼更新（楽観的排他制御）
- `DELETE /api/estimate-requests/:id`: 見積依頼論理削除
- `POST /api/estimate-requests/:id/items`: 項目選択更新
- `GET /api/estimate-requests/:id/text`: 見積依頼文取得（メール/FAX対応）

**見積依頼ステータスAPI（estimate-request-status.routes.ts）:**
- `PATCH /api/estimate-requests/:id/status`: ステータス変更（依頼前/依頼済/見積受領済）
- `GET /api/estimate-requests/:id/status-history`: ステータス変更履歴取得

**受領見積書API（received-quotation.routes.ts）:**
- `GET /api/estimate-requests/:estimateRequestId/received-quotations`: 受領見積書一覧取得
- `GET /api/received-quotations/:id`: 受領見積書詳細取得
- `POST /api/estimate-requests/:estimateRequestId/received-quotations`: 受領見積書登録（ファイルアップロード）
- `PUT /api/received-quotations/:id`: 受領見積書更新
- `DELETE /api/received-quotations/:id`: 受領見積書削除
- `POST /api/received-quotations/:id/structured-data`: OCR構造化データ登録

**自社情報API（company-info.routes.ts）:**
- `GET /api/company-info`: 自社情報取得
- `PUT /api/company-info`: 自社情報更新（楽観的排他制御）

**プロジェクト単位受領見積書API（project-quotations.routes.ts）:**
- `GET /api/projects/:projectId/received-quotations`: プロジェクトに紐付く受領見積書一覧取得（転記ダイアログ用）

**Claude Vision OCR API（claude-vision.routes.ts）:**
- `POST /api/claude-vision/extract`: Claude Vision APIによる画像の構造化データ抽出（複数ページ一括処理対応、mode: 'estimate'=見積書OCR / 'quantity-table'=数量表インポートOCR）

**見積書管理API（estimates.routes.ts）:**
- `GET /api/projects/:projectId/estimates`: 見積書一覧取得
- `GET /api/estimates/:id`: 見積書詳細取得（階層構造含む）
- `POST /api/projects/:projectId/estimates`: 見積書作成（内訳書参照オプション）
- `PUT /api/estimates/:id`: 見積書更新（楽観的排他制御）
- `DELETE /api/estimates/:id`: 見積書論理削除
- `POST /api/estimates/:id/items`: 見積項目追加（3行1セット自動生成）
- `PUT /api/estimates/:id/items/:itemId`: 見積項目更新
- `DELETE /api/estimates/:id/items/:itemId`: 見積項目削除
- `POST /api/estimates/:id/items/:itemId/transfer`: 受領見積書転記
- `POST /api/estimates/:id/prorate`: NET金額案分計算
- `POST /api/estimates/:id/profit-rate`: 利益率適用
- `GET /api/estimates/:id/export`: Excel/PDF出力（複数行タイプ選択対応：見積・実行・業者）

**契約書管理API（contracts.routes.ts）:**
- `GET /api/projects/:projectId/contracts`: 契約書一覧取得（ページネーション、ソート）
- `GET /api/contracts/:id`: 契約書詳細取得（リレーション展開）
- `POST /api/projects/:projectId/contracts`: 契約書作成（新規契約・変更契約）
- `PUT /api/contracts/:id`: 契約書更新（楽観的排他制御）
- `PATCH /api/contracts/:id/status`: 契約書ステータス変更
- `DELETE /api/contracts/:id`: 契約書論理削除

**工程表管理API（schedules.routes.ts）:**
- `GET /api/projects/:projectId/schedules`: 工程表一覧取得（ページネーション、ソート）
- `GET /api/schedules/:id`: 工程表詳細取得（工程項目含む）
- `POST /api/projects/:projectId/schedules`: 工程表作成（数量表連携オプション）
- `PUT /api/schedules/:id`: 工程表更新（楽観的排他制御）
- `DELETE /api/schedules/:id`: 工程表論理削除
- `GET /api/schedules/:id/export`: 工程表エクスポート（Excel/PDF形式選択）

**実行予算管理API（execution-budget.routes.ts）:**
- `GET /api/projects/:projectId/execution-budgets`: 実行予算一覧取得
- `GET /api/execution-budgets/:id`: 実行予算詳細取得（項目含む）
- `POST /api/projects/:projectId/execution-budgets`: 実行予算作成（契約書・見積書連動）
- `PUT /api/execution-budgets/:id`: 実行予算更新（楽観的排他制御）
- `DELETE /api/execution-budgets/:id`: 実行予算論理削除
- `POST /api/execution-budgets/:id/apply-amendment`: 変更契約適用

**発注管理API（order.routes.ts）:**
- `GET /api/execution-budgets/:executionBudgetId/orders`: 発注一覧取得
- `GET /api/orders/:id`: 発注詳細取得
- `POST /api/execution-budgets/:executionBudgetId/orders`: 発注作成（金額案分）
- `PUT /api/orders/:id`: 発注更新
- `PATCH /api/orders/:id/status`: 発注ステータス変更
- `DELETE /api/orders/:id`: 発注削除

**出来高管理API（progress.routes.ts）:**
- `GET /api/orders/:orderId/progress-records`: 出来高一覧取得
- `POST /api/orders/:orderId/progress-records`: 出来高登録（パーセンテージ入力）
- `PUT /api/progress-records/:id`: 出来高更新
- `DELETE /api/progress-records/:id`: 出来高削除

**月次締めAPI（cost-monthly-close.routes.ts）:**
- `POST /api/projects/:projectId/monthly-close`: 月次締め実行
- `DELETE /api/projects/:projectId/monthly-close/:yearMonth`: 月次締め解除
- `GET /api/projects/:projectId/monthly-close-history`: 月次締め履歴取得

**エクスポートAPI（export.routes.ts）:**
- `GET /api/orders/:id/export`: 発注書エクスポート（Excel/PDF）
- `GET /api/progress-records/:id/export`: 出来高エクスポート（Excel/PDF）

**実装済みミドルウェア:**

- エラーハンドリング: ApiError、Zod、Prismaエラーの統一処理
- HTTPSリダイレクト: 本番環境でHTTP→HTTPS強制
- HSTSヘッダー: Strict-Transport-Securityヘッダー設定
- リクエストバリデーション: Zodスキーマによる型安全なバリデーション
- ロギング: Pino HTTPロギングミドルウェア
- **JWT認証**: EdDSA署名検証、アクセス/リフレッシュトークン
- **権限チェック**: RBACによる動的権限検証、キャッシング統合
- **CSRF保護**: cookie-based double-submit pattern（csrf.middleware.ts）
- **ファイルアップロード**: multer統合（upload.middleware.ts）
- **レート制限**: express-rate-limit + RedisRateLimitStore（rateLimit.middleware.ts）

### `scripts/`

どの package にも属さず**リポジトリ全域**で走るスクリプトを置く。主目的は、スペックと
steering が述べることと実体の一致を機械で見る**関門**であり、押下前の関門
（`.husky/scripts/pre-push.sh`）と CI（`.github/workflows/ci.yml`）の双方がここから起動する。

**命名で役割が決まる:**

| 命名 | 役割 | 押下前の関門で走るか |
|------|------|----------------------|
| `check-*.ts` | 関門。違反を検出して非零で終わる | 走る（`npm run check:*`） |
| `check-*.selftest.ts` | 関門自身の自己検査。関門が「常に緑」へ退化していないことを見る | 走る（`npm run check:*:selftest`） |
| `survey-*.ts` / `scan-*.ts` / `list-*.ts` | 調査用。判定せず母数や分布だけを出す。関門を書く前に実体を測る道具 | 走らない |
| `*-adjudication.{md,json}` | 関門が許した個別の例外と、その裁定の根拠 | 関門が読む |
| `*-baseline.json` | 既知の指摘を凍らせた基準点。増分だけを赤にする | 関門が読む |

**規約:**

- **`check-*.ts` には同名の `check-*.selftest.ts` を対で置く。** 関門は「見るべきものを見なく
  なっても緑のまま」という形で静かに死ぬため、自己検査が入口の消失を赤にする（`development-discipline.md`
  の「自己検査へ失敗既定を入れ入口の消失を赤にする」を見よ）。**例外は `check-staged-coverage.cjs`
  の一件**で、これは対を持たず、押下前の関門からも CI からも呼ばれていない
  （`package.json` に `coverage:staged:backend` / `coverage:staged:frontend` として定義があるだけ）。
- **例外は消さずに裁定として残す。** `*-adjudication.*` と `*-baseline.json` は「なぜこの一件を
  許したか」を持つ。根拠を持たない例外は書かない。
- **調査用を関門へ昇格させない。** `survey-*` / `scan-*` / `list-*` は一度きりの実測の道具であり、
  得た値はタスクの記録や設計文書へ移す。スクリプト自体は追試の手段として残す。

**関門の一覧と件数は本書へ書かない**（規約 (b)：数値を落として数える手段を書く）。次で読み出す
（いずれもリポジトリルートで実行する）。

```bash
# 関門の実体（対の自己検査を除く）
git ls-files 'scripts/check-*.ts' | grep -v '\.selftest\.ts$'

# 押下前の関門が実際に起動する検査
grep -oE 'npm run check:[a-z0-9-]+' .husky/scripts/pre-push.sh | sort -u

# 調査用スクリプト
git ls-files 'scripts/survey-*.ts' 'scripts/scan-*.ts' 'scripts/list-*.ts'
```

**押下前の関門と CI の関門は同一ではない。** 「CI が緑なら押下前も緑」は成り立たないため、
差分を確かめてから押す。

```bash
comm -23 <(grep -oE 'check:[a-z0-9-]+' .husky/scripts/pre-push.sh | sort -u) \
         <(grep -oE 'check:[a-z0-9-]+' .github/workflows/ci.yml | sort -u)
```

## Docker構成

### マルチファイルDocker Compose構成

ArchiTrackでは、環境ごとにDocker Composeファイルを分離し、柔軟な構成管理を実現しています。

**ファイル構成パターン:**

| ファイル | 用途 |
|---------|------|
| `docker-compose.yml` | 基本サービス定義（環境非依存）|
| `docker-compose.dev.yml` | 開発環境オーバーライド（永続化、標準ポート）|
| `docker-compose.test.yml` | テスト環境オーバーライド（tmpfs、ポートオフセット、nginx本番イメージ）|
| `docker-compose.debug.yml` | デバッグオーバーライド（Node.js inspector）|
| `docker-compose.ci.yml` | CI環境オーバーライド（GitHub Actions用、nginx本番イメージ）|
| `.env.dev` | 開発環境変数 |
| `.env.test` | テスト環境変数 |

**サービス構成（全環境共通）:**

- `postgres`: PostgreSQL 15データベース
- `redis`: Redis 7キャッシュ
- `mailhog`: Mailpit（モックSMTPサーバー）
- `backend`: Node.js/Expressバックエンド
- `frontend`: React/Viteフロントエンド（開発環境: Vite dev server、テスト/CI環境: nginx本番イメージ）

**環境別特徴:**

| 環境 | データ永続化 | ポート | Frontend | 用途 |
|-----|------------|-------|----------|------|
| 開発 | ボリューム | 標準（3000, 5173等） | Vite dev server | 手動テスト・画面打鍵 |
| テスト | tmpfs（揮発性）| オフセット（+100/+1）| nginx（本番Dockerfile）| 自動テスト |
| デバッグ | ボリューム | 標準 + 9229 | Vite dev server | VSCodeデバッグ |
| CI | tmpfs | 標準 | nginx（本番Dockerfile）| GitHub Actions |

**開発環境の特徴:**

- **ヘルスチェック**: 全サービスでヘルスチェックを実装し、起動順序と依存関係を保証
- **名前付きボリューム**: `node_modules`を名前付きボリュームとしてマウント、パーミッション問題を回避
- **エントリポイントスクリプト**: 各サービスは専用のdocker-entrypoint.shで依存関係を自動管理
- **フロントエンド最適化**: アーキテクチャ固有モジュールの選択的再インストールで起動時間を短縮（45-60秒 → 10-15秒）
- **ホストユーザー実行**: `user: "${UID:-1000}:${GID:-1000}"`でパーミッション問題回避
- **初期管理者アカウント**: 環境変数でシードデータの管理者を設定可能

### Dockerfile構成

**Frontend:**
- `Dockerfile`: 本番環境用（テスト/CI環境でも使用）。マルチステージビルドでViteビルド→nginx配信。Dev/prod parityにより本番固有の問題を早期検出
- `Dockerfile.dev`: 開発環境用。Vite dev serverでホットリロード対応
- `docker-entrypoint.sh`: 起動時にアーキテクチャ固有モジュール（`@rollup/rollup-linux-${arch}-gnu`）をチェックし、不足時のみ再インストール
- `nginx.conf`: 本番nginx設定（SPA routing、Gzip圧縮、セキュリティヘッダー、.mjs MIMEタイプ対応）

**Backend:**
- `Dockerfile.dev`: 開発環境用。Node.js --watchでホットリロード対応
- `docker-entrypoint.sh`: 起動時にnode_modulesをチェックし、不足時のみ依存関係をインストール

## コード構成パターン

### モジュール分割の原則

1. **単一責任**: 各モジュールは1つの責務を持つ
2. **疎結合**: モジュール間の依存を最小限に
3. **高凝集**: 関連する機能を同じモジュールに配置
4. **階層化**: プレゼンテーション層・ビジネスロジック層・データ層を分離
5. **Lazy Initialization**: データベース・キャッシュ接続は初回アクセス時に確立
6. **ストレージ抽象化**: StorageProviderインターフェースによる環境別バックエンド切り替え（Factory Pattern）

### ディレクトリ命名規則

- **複数形を使用**: `components/`, `services/`, `models/`
- **小文字ケバブケース**: `user-profile/`, `api-client/`
- **目的を明確に**: `utils/`（汎用）vs `helpers/`（特定機能補助）

## ファイル命名規則

### 一般規則

- **拡張子**: `.ts`, `.tsx`（TypeScript）、設定ファイルは`.js`も許可
- **ケース**:
  - コンポーネント: PascalCase (`UserProfile.tsx`)
  - ユーティリティ: camelCase (`formatDate.ts`)
  - 定数: UPPER_SNAKE_CASE (`API_ENDPOINTS.ts`)
- **意味のある名前**: 機能を明確に表現
- **型定義ファイル**: `.d.ts`拡張子（例: `express.d.ts`, `env.d.ts`, `vite-env.d.ts`）

### 特殊ファイル

以下は**規則の例示**であって「このファイルが在る」という主張ではないため、
一般規則と同じくラベルを前置した形で書く（行頭が逆引用符の箇条書きは現存の主張を表す）。

- **エントリーポイント**: `index.ts` - ディレクトリのエクスポート集約
- **ユニットテスト**: `*.test.ts` - ユニットテストファイル
- **E2E/スペック**: `*.spec.ts` - E2Eテストファイル（Playwright）またはスペックファイル（BDD）
- **Storybook**: `*.stories.tsx` - コンポーネントバリアント定義
- **環境変数テンプレート**: `.env.example` - コミットする雛形（実値の `.env` は追跡しない）

**E2Eテストファイル命名規則:**（同じく規則の例示。ラベルを前置する）

- **APIテスト**: `e2e/specs/api/*.spec.ts`（例: `health.spec.ts`）
- **UIテスト**: `e2e/specs/ui/*.spec.ts`（例: `homepage.spec.ts`）
- **統合テスト**: `e2e/specs/integration/*.spec.ts`（例: `database.spec.ts`）
- **テストヘルパー**: `e2e/helpers/*.ts`（例: `browser.ts`）

**Storybookストーリーファイル命名規則:**（同じく規則の例示。ラベルを前置する）

- **ストーリー**: `frontend/src/components/*.stories.tsx`（例: `ErrorBoundary.stories.tsx`）
- **形式**: CSF 3.0（Component Story Format 3.0）で記述

### テスト区分の列挙の規約

steering の列挙は既定で**代表例**である。網羅を主張する列挙だけを、次の三行の形で囲む。

- **開始印**: `<!-- steering:test-dirs <リポジトリ相対の根> -->`
- **項目**: 行頭を逆引用符で始める箇条書きで、根の直下の名前を `config/` のように書く
  （読みやすさのため根の名前を一段だけ前置してもよい。例: `unit/config/`）
- **終了印**: `<!-- /steering:test-dirs -->`

並べると次の形になる（この囲みはコードフェンスの中にあるため、検査は宣言として数えない）。

```
<!-- steering:test-dirs backend/src/__tests__/unit -->
（根の直下の区分を、逆引用符付きの箇条書きで並べる）
<!-- /steering:test-dirs -->
```

- 印で囲まれた列挙は、その根の直下でテストを含むディレクトリと**過不足なく一致**していなければ
  ならない。`npm run check:steering-test-tree` が両方向（挙げすぎ・挙げ足りない）を検査する。
- 印で囲まれていないディレクトリツリーや箇条書きは代表例であり、抜けがあってよい。
  網羅と紛れないよう「以下は代表例」と書き添える。
- **網羅の権威は根ごとに一箇所だけ**に置く。同じ根の宣言が二箇所にあると検査が失敗する。
- **テストの件数・テストファイル数は steering に書かない。** 数える手段を書く。是正時に実測した
  ところ、書かれていた数値 59 個のうち 38 個が既に食い違っており、残る 21 個の正しい数値と
  見た目で区別できなかった（タスク 115.200）。
- **数える手段を書くときは、その手段が何を選ぶかまで書く。** backend は
  `npm --prefix backend run test` が既定の実行（統合検証を除く）、
  `npm --prefix backend run test:integration` が統合検証、
  `npm --prefix backend run test:all` が両方であり、frontend は
  `npm --prefix frontend run test` が全件である。手段だけを名指して選ぶ範囲を書かないと、
  区分が分かれた時点（backend はタスク 115.216）で**手段の名前は残ったまま意味が変わる**。
  数値を撤去しても、手段の指し先が変われば記述は同じように偽になる（タスク 115.243）。

### 実体の件数の書き方の規約（タスク 115.275）

ディレクトリのファイル数のような**実体を数えた値**を本書へ書くときは、次の (a) (b) のどちらかを
必ず選ぶ（`.kiro/specs/site-survey/design.md` の「実測値の書き方（タスク 115.212）」と同じ規約を
本書へも掛けたものである）。

- **(a) 実測日を数値と同じ行へ添える。** 日付は `YYYY-MM-DD` の形で書き、再現コマンドと
  コミットのハッシュを併記する。同じ日に複数のタスクが着地するため、日付だけでは版を絞れない。
- **(b) 数値を落とし、数える手段を書く。** ディレクトリのファイル数は
  `git ls-files frontend/src/hooks | wc -l` の形で数える（リポジトリルートで実行する）。
  Storybook のストーリーファイルは `git ls-files "frontend/src/**/*.stories.tsx" | wc -l`、
  バックエンドのルートファイルは `git ls-files backend/src/routes | wc -l` である。

**ディレクトリツリーの図と見出しは (b) を採る。** ファイルが一つ増減しただけで値が偽になり、
増減させた変更の側にはその値を直す動機が無いためである。

`npm run check:steering-dir-counts` が (a) を満たさない件数を検出する（自己検査は
`npm run check:steering-dir-counts:selftest`）。判定は行単位で、「数値 + 実体の単位語
（ファイル／ルートファイル／ストーリー／サービス／タスク／区分／件）」を含む行が、同じ行に
実測日を持つかだけを見る。**数値が実体と一致するかまでは見ない**——一致は (b) を選んで数値を
書かないことで得る。検出しない形（`5バリアント` のような単位語の一覧に無い数え方、
数値と実測日が別の行に分かれた散文）は `scripts/check-steering-dir-counts.ts` の冒頭が列挙する。

是正の根拠: 本書には実測日を持たない実体の件数が 30 行あり、再現コマンドを書ける 21 行のうち
13 行が既に食い違っていた（`quantity-table/` 22→68、`frontend/src/utils/` 22→37、
Storybook 132→157 など。コミット `b84137b9`、2026-09-05 にリポジトリルートで実測）。
残る 9 行（`全46タスク完了` の形。同じくコミット `b84137b9`、2026-09-05 に実測）については、
走査規則の空間が開いており「どの数え方でも再現できない」を機械で確かめる手段が無いため、
**当てた規則を挙げて範囲を限る**（`.kiro/steering/development-discipline.md` の
「『掃き終えた』を未検証の前提で支えない」に従う）。当てたのは次の 6 通りである
（`<spec>` は当該スペックのディレクトリ名。いずれもリポジトリルートで実行する）。

1. `grep -cE '^[[:space:]]*- \[[ x]\]' .kiro/specs/<spec>/tasks.md` — 深さを問わないチェック項目
2. `grep -cE '^- \[[ x]\] [0-9]+\. ' .kiro/specs/<spec>/tasks.md` — 最上位の番号付き項目
3. `grep -oE '^- \[[ x]\] [0-9]+' .kiro/specs/<spec>/tasks.md | grep -oE '[0-9]+$' | sort -un | wc -l` — 相異なる最上位番号
4. `grep -cE '^#{2,3} ' .kiro/specs/<spec>/tasks.md` — 見出し
5. `grep -cE '^[[:space:]]*- \[x\]' .kiro/specs/<spec>/tasks.md` — 完了印の付いた項目
6. `grep -oE '^[[:space:]]*- \[[ x]\] [0-9]+(\.[0-9]+)*' .kiro/specs/<spec>/tasks.md | grep -oE '[0-9]+(\.[0-9]+)*$' | sort -u | wc -l` — 深さを問わない相異なる番号

**(1) 機械保証**: 無い。走査規則の空間は列挙できないため、この命題に機械の裏付けは付かない。
`npm run check:steering-dir-counts` が見るのは「実測日を伴わない件数が在るか」だけであり、
数え方が失われているかどうかは見ない。

**(2) 上の 6 規則を当てた結果**（コミット `b84137b9`、2026-09-05 にリポジトリルートで実測）:

- `b84137b9` の時点では **9 行すべてが 6 規則のいずれとも一致しない**。例えば
  `contract-management` の 17 に対し規則 1〜6 は 45／16／16／0／45／45 を返す。
- 当該文言が本書へ入った版まで遡ると **2 行は再現できる**。版は
  `git log -S '全17タスク完了' --oneline --reverse -- .kiro/steering/structure.md`（2026-09-05 に実行）
  の形で特定した。その版の `tasks.md` へ当て直すと `project-management` は規則 3 が 17、
  `itemized-statement-generation` は規則 3 が 16 を返し、書かれた値と一致する
  （コミット `06844cb4` と `0efe3215`、2026-09-05 に実測）。
- 残る 7 行は導入時点でも 6 規則のいずれとも一致しない（`user-authentication` の 46 は導入版
  `5e9b3320` で 65／10／10／2／31／65、`company-info` の 22 は `28d3a5c4` で
  26／7／7／3／26／26。2026-09-05 に実測）。

**(3) 未走査の残余**: 上の 6 規則以外の数え方は当てていない。いずれかの数え方が値を再現するなら
本段落は偽になる。

結論は「上の 6 規則の範囲では、`b84137b9` の時点で 9 行すべてが再現できず、導入時点まで遡っても
7 行が再現できなかった」である。再現できた 2 行も現況では偽であり、値を書き換えるだけでは
同じ陳腐化が繰り返される。

## インポート構成

### インポート順序

1. 外部ライブラリ（`react`, `vue`, `express`等）
2. エイリアスパス（`@/components`, `@/utils`）
3. 相対パス（`./`, `../`）
4. スタイルシート・アセット

### 例

```javascript
// 外部ライブラリ
import React from 'react'
import axios from 'axios'

// エイリアスパス
import Button from '@/components/Button'
import { formatDate } from '@/utils/date'

// 相対パス
import UserCard from './UserCard'
import config from '../config'

// スタイル
import './styles.css'
```

## 主要なアーキテクチャ原則

### 1. スペック駆動開発

すべての主要機能は`.kiro/specs/`で仕様管理を行い、要件→設計→タスク→実装の流れを守ります。

### 2. ステアリングドキュメントの活用

プロジェクト全体のコンテキストを`.kiro/steering/`で維持し、AIアシスタントとの一貫した協業を実現します。

### 3. フロントエンド・バックエンド分離

- 各層が独立して開発・デプロイ可能
- API契約に基づく疎結合な連携
- それぞれのスケーラビリティを確保

### 4. 段階的な実装

大きな機能を小さなタスクに分解し、段階的に実装・検証を進めます。

### 5. 人間のレビュー重視

各フェーズ（要件・設計・タスク）で人間のレビューを必須とし、早期の問題発見を促進します。

## コード品質管理ファイル

### `.prettierrc`

プロジェクトルートに配置されたPrettier設定ファイル。フロントエンドとバックエンドで共通のフォーマットルールを定義：

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always"
}
```

### lint-staged統合

各 `package.json` に `lint-staged` セクションを定義し、ステージングされたファイルに対してPrettierとESLintを順次実行します。

## バージョン管理規約

### ブランチ戦略

- `main` - 本番環境・安定版
- `feature/*` - 機能開発ブランチ（必要に応じて）
- `fix/*` - バグ修正ブランチ（必要に応じて）

### コミットメッセージ

**Conventional Commits形式を厳格に適用**（commitlintで強制）：

**形式**: `type: subject`

**許可されるtype**:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードスタイル変更（機能に影響なし）
- `refactor`: リファクタリング
- `perf`: パフォーマンス改善
- `test`: テスト追加・修正
- `build`: ビルドシステム変更
- `ci`: CI設定変更
- `chore`: その他の変更
- `revert`: コミットの取り消し

**subjectルール**:
- 小文字始まり（例: ✅ `add user authentication` ❌ `Add user authentication`）
- 100文字以内
- 末尾にピリオド不要
- 日本語または英語で簡潔に記述

**例**:
```
feat: add user authentication with JWT
fix: resolve database connection timeout issue
docs: update README with TypeScript setup guide
refactor: improve type safety by eliminating any types
```

**詳細説明**（オプション）:
- 空行の後に複数行で記述可能
- 関連する仕様やイシュー番号を含める

### Git Hooks

`.husky/`により、以下の3段階でコード品質を自動保証：

#### 1. Pre-commitフック（ラッパー構造）

`.husky/pre-commit`（sh）→ `.husky/scripts/pre-commit.sh`（bash）の2層構造で実装。

コミット前に自動的に以下が実行されます：

- 変更されたバックエンドファイル（`*.ts`）: Prettier + ESLint + TypeScript型チェック
- 変更されたフロントエンドファイル（`*.{ts,tsx}`）: Prettier + ESLint + TypeScript型チェック
- 変更されたE2Eファイル（`*.ts`, `playwright.config.ts`）: Prettier + ESLint + TypeScript型チェック

型エラーがある場合、コミットは中断されます。

#### 2. Commit-msgフック

コミットメッセージが Conventional Commits形式に従っているかチェック。形式違反の場合はコミットを中断します。

#### 3. Pre-pushフック（ラッパー構造）

`.husky/pre-push`（sh）→ `.husky/scripts/pre-push.sh`（bash）の2層構造で実装。

**初期化処理:**
- WSL2メモリ最適化（冒頭で `NODE_OPTIONS` を export する。**割り当てる値は書き写さず**、
  `grep -n 'NODE_OPTIONS' .husky/scripts/pre-push.sh` で読む。タスク 115.286）
- Git操作タイプ検出（ブランチ削除時はスキップ）
- ログファイル管理とローテーション

**品質チェック（順次実行）— 押下前の関門の書き方の規約（タスク 115.286）:**

**押下前の関門の項目と順序を本書に列挙しない。** 実体の件数に掛けた規約 (b)（数値を落として
数える手段を書く）を、関門の列挙へも掛けたものである。権威は `.husky/scripts/pre-push.sh`
であり、次の二つで読み出す（いずれもリポジトリルートで実行する）。

```bash
# 実行される手順を上から順に（スクリプトが自分で名乗る見出しだけを拾う）
grep -nE '^[[:space:]]*echo "[^ "✅❌💡🆕📝]+ [A-Z]' .husky/scripts/pre-push.sh

# 起動される検査の名前（:selftest / :verbose の接尾辞は落ちるので検査名だけが並ぶ）
grep -oE 'npm run check:[a-z0-9-]+' .husky/scripts/pre-push.sh | sort -u
```

一つ目は手順の見出しだけを拾い、失敗時の案内（`❌` で始まる行・`対応方法:`・`詳細確認:`）と
入れ子の待機ログを落とす。**限界は拾い漏れの向きへ倒してある**——見出しを英大文字で始めない
手順や、`echo` を伴わない手順は掛からない。二つ目が挙げる検査がすべて一つ目の出力にも現れる
ことは確かめてある（コミット `98744b92`、2026-09-05 にリポジトリルートで実測）。

**是正の根拠**: 是正前の本書はこの位置に番号付きの列挙を持っていたが、一つ目のコマンドが
返す手順を大きく取りこぼしていた。二つ目が挙げる検査のうち本書の列挙が名指していたのは
「要件カバレッジチェック」だけで、`check:req-exclusions`・`check:e2e-guards`・
`check:e2e-selfjudge`・`check:design-refs`・`check:design-code-refs`・
`check:design-path-refs`・`check:design-component-reqs`・`check:trace-coverage`・
`check:design-measurement-freshness`・`check:steering-refs`・`check:steering-idents`・
`check:steering-test-tree`・`check:steering-dir-counts`・`check:cf-evidence`・
`check:dead-script-env` は一つも現れていなかった（コミット `98744b92`、2026-09-05 に実測）。
順序も食い違っており、列挙は「Formatチェック」から始まっていたが、実際にはその前に
`docker-compose.yml` の環境変数が `backend/.env.example` に載っているかの検査（警告のみで
中断しない）が走る。値と手順を書き写す形では、関門が一つ増えるたびに本書が無言で偽になる
（タスク 115.275 が実体の件数に対して採った作法と同じ理由である）。

型エラー、テスト失敗、カバレッジ不足がある場合、プッシュは中断されます。

**テスト実行順序の理由:**
- 速い検査ほど先に走らせる（fail-fast のため）。**どの検査がどの位置に来るかは書き写さず、
  上のコマンドで読む**（タスク 115.286）
- **Fail-fast戦略**: 早期ステージでの失敗で即座に中断
- **Shift-Left原則**: 問題を早期発見し、プッシュ前に品質を保証
- **Defense in Depth戦略**: 複数レイヤーでの品質保証

**カバレッジ達成状況（単体テスト）:**
- **Branches: 80.00% ✅達成**（2025-11-11）
- Statements: 89.46%
- Functions: 93.43%
- Lines: 89.42%
- 件数は次の出力で数える（steering にはテストの件数・ファイル数を書かない。タスク 115.200）
  - backend の既定の実行（統合検証を除く）: `npm --prefix backend run test`
  - backend の統合検証: `npm --prefix backend run test:integration`
  - backend の既定＋統合: `npm --prefix backend run test:all`
  - frontend の全件: `npm --prefix frontend run test`
  - 上の内訳はタスク 115.216 が統合検証を既定の実行から外したことによる（タスク 115.243）

### .gitignore

以下を除外：

- `node_modules/` - 依存関係
- `.env` - 環境変数（機密情報）
- `dist/`, `build/` - ビルド成果物
- `*.tsbuildinfo`, `.tsbuildinfo` - TypeScript Incremental Buildキャッシュ
- `playwright-report/` - Playwrightテストレポート（タイムスタンプ付き）
- `test-results/` - Playwrightテスト結果（スクリーンショット・ビデオ）
- `storybook-static/` - Storybookビルド成果物
- `.storybook-cache/` - Storybookキャッシュ
- IDE設定ファイル
- ログファイル
