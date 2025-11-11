# プロジェクト構造

ArchiTrackのプロジェクト構造とコーディング規約を定義します。

_最終更新: 2025-11-11（ユーザー認証機能実装完了、テストカバレッジ80%達成を反映）_

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
│   │   ├── ci.yml          # CI/CDパイプライン定義（デプロイジョブ統合）
│   │   ├── cd.yml          # 継続的デプロイ（Railway staging/production）
│   │   ├── e2e-tests.yml   # E2Eテストワークフロー
│   │   └── dependabot-automerge.yml  # Dependabot自動マージ
│   └── dependabot.yml      # Dependabot自動依存関係管理設定
├── .husky/                 # Git フック管理（Husky v9）
│   ├── pre-commit          # コミット前フック（lint-staged + 型チェック）
│   ├── commit-msg          # コミットメッセージ検証（commitlint）
│   └── pre-push            # プッシュ前フック（型チェック + E2Eテスト）
├── .kiro/                  # Kiro開発管理
│   ├── steering/           # プロジェクトステアリング
│   │   ├── product.md      # プロダクト概要
│   │   ├── tech.md         # 技術スタック
│   │   └── structure.md    # プロジェクト構造
│   └── specs/              # 機能仕様（動的生成）
├── e2e/                    # E2Eテスト（Playwright）
│   ├── specs/              # テスト仕様（カテゴリ分け）
│   │   ├── api/            # APIエンドポイントテスト
│   │   ├── ui/             # UIコンポーネントテスト
│   │   └── integration/    # システム統合テスト
│   └── helpers/            # Claude Code統合ヘルパー
│       └── browser.js      # ブラウザ操作・スクリーンショット
├── frontend/               # フロントエンドアプリケーション
│   ├── .storybook/         # Storybook設定（コンポーネントドキュメント）
│   │   ├── main.ts         # Storybook設定ファイル
│   │   └── preview.ts      # グローバルパラメータ・デコレータ
│   ├── src/                # ソースコード
│   │   ├── App.jsx         # メインAppコンポーネント
│   │   └── main.jsx        # エントリーポイント
│   ├── public/             # 公開静的ファイル
│   ├── package.json        # 依存関係
│   ├── vite.config.js      # Vite設定
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
│   │   ├── db.ts           # Prisma Clientシングルトン
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
├── docker-compose.yml      # ローカル開発環境定義
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
- `rules/hook_pre_commands_rules.json` - フック実行ルール定義

### `.husky/`

Gitフック管理ディレクトリ（Husky v9使用）。

**主要ファイル:**

- `pre-commit` - コミット前に自動実行されるスクリプト
  - バックエンドの変更: Prettier + ESLint + TypeScript型チェック
  - フロントエンドの変更: Prettier + ESLint + TypeScript型チェック
  - E2Eテストの変更: Prettier + ESLint + TypeScript型チェック
  - lint-stagedと連携して、ステージングされたファイルのみ処理
- `commit-msg` - コミットメッセージ検証スクリプト
  - commitlintによるConventional Commits形式の強制
  - type: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
  - subject: 小文字始まり、100文字以内、末尾にピリオド不要
- `pre-push` - プッシュ前に自動実行されるスクリプト
  - Format check、Lint、TypeScript型チェック（Backend/Frontend/E2E）
  - ビルド（Backend/Frontend）
  - Backend単体テスト、Frontend単体テスト
  - Backend統合テスト（Docker環境必須）
  - E2Eテスト実行（Docker環境必須、タイムアウト: 10分）
  - **同期実行**: すべてのテストを完了してからプッシュ実行
  - **タイムアウト保護**: E2Eテストに10分のタイムアウト設定
  - 失敗時はプッシュを中断

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

- `.kiro/specs/user-authentication/` - ユーザー認証機能 ✅実装完了
  - 状態: 要件定義✅、技術設計✅、タスク分解✅、**実装完了✅**（全46タスク完了）
  - 内容: 招待制ユーザー登録、ロールベースアクセス制御（RBAC）、JWT認証フロー、2FA、監査ログ

### `e2e/`

Playwright E2Eテスト環境。Claude Codeから直接ブラウザ操作が可能。

**ディレクトリ構成:**

```
e2e/
├── specs/                 # テスト仕様（カテゴリ分け）
│   ├── api/              # APIエンドポイントテスト
│   │   └── *.spec.js
│   ├── ui/               # UIコンポーネント・ページテスト
│   │   └── *.spec.js
│   └── integration/      # システム統合テスト
│       └── *.spec.js
└── helpers/              # テストヘルパー・ユーティリティ
    └── browser.js        # Claude Code統合ブラウザ操作
```

**テストカテゴリ:**

- `api/` - バックエンドAPIエンドポイントのテスト（ヘルスチェック、データ取得等）
- `ui/` - フロントエンドUI要素のテスト（コンポーネント表示、ユーザー操作等）
- `integration/` - システム全体の統合テスト（データベース、Redis、サービス連携等）

**Claude Code統合:**

`e2e/helpers/browser.js` により、AIアシスタントから直接ブラウザ操作が可能：

```bash
# スクリーンショット撮影
node e2e/helpers/browser.js screenshot http://localhost:5173 screenshot.png

# ページ情報取得
node e2e/helpers/browser.js info http://localhost:5173

# APIテスト
node e2e/helpers/browser.js api http://localhost:3000/health
```

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
│   └── preview.ts         # グローバルパラメータ・デコレータ
├── src/
│   ├── __tests__/         # 単体テスト
│   │   ├── api/           # APIクライアントテスト
│   │   │   └── client.test.ts  # APIクライアントテスト（fetch、エラーハンドリング）
│   │   └── components/    # Reactコンポーネントテスト
│   │       └── ErrorBoundary.test.tsx  # エラーバウンダリコンポーネントテスト
│   ├── components/        # Reactコンポーネント
│   │   ├── ErrorBoundary.tsx       # エラーバウンダリコンポーネント
│   │   └── ErrorBoundary.stories.tsx  # Storybook ストーリー（5バリアント）
│   ├── utils/             # ユーティリティ関数
│   │   ├── formatters.ts  # 日付フォーマット、APIステータス変換等
│   │   └── react.ts       # Reactカスタムフック（useDebounce、usePrevious等）
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

**想定される拡張:**

```
frontend/src/
├── components/        # UIコンポーネント（今後追加）
├── pages/             # ページコンポーネント（今後追加）
├── services/          # APIクライアント（今後追加）
├── stores/            # 状態管理（今後追加）
└── assets/            # 静的アセット（今後追加）
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
│   ├── __tests__/         # 単体テスト（ブランチカバレッジ80%達成✅）
│   │   └── unit/          # ユニットテスト（472テスト）
│   │       ├── errors/    # エラークラステスト
│   │       │   └── ApiError.test.ts  # カスタムAPIエラークラス
│   │       ├── middleware/  # ミドルウェアテスト
│   │       │   ├── errorHandler.test.ts        # エラーハンドリング（Zod、Prisma、一般エラー）
│   │       │   ├── httpsRedirect.test.ts       # HTTPS強制とHSTSヘッダー
│   │       │   ├── validate.test.ts            # Zodバリデーション（body/query/params）
│   │       │   ├── authenticate.middleware.test.ts # JWT認証ミドルウェア（10テスト）
│   │       │   ├── authorize.middleware.test.ts    # 権限チェックミドルウェア（13テスト）
│   │       │   ├── RedisRateLimitStore.test.ts # Redisレート制限ストア（14テスト）
│   │       │   ├── rateLimit.test.ts           # レート制限ミドルウェア（3テスト）
│   │       │   └── logger.test.ts              # HTTPロガーミドルウェア（17テスト）
│   │       ├── routes/    # ルートテスト
│   │       │   ├── admin.routes.test.ts  # 管理者ルート（ログレベル動的変更）
│   │       │   └── jwks.routes.test.ts   # JWKS公開鍵配信（8テスト）
│   │       ├── services/  # サービステスト（324テスト）
│   │       │   ├── auth.service.test.ts  # 認証統合（24テスト）
│   │       │   ├── token.service.test.ts # JWTトークン管理（EdDSA、18テスト）
│   │       │   ├── session.service.test.ts # セッション管理（19テスト）
│   │       │   ├── invitation.service.test.ts # 招待制登録（16テスト）
│   │       │   ├── password.service.test.ts # パスワード管理（35テスト）
│   │       │   ├── two-factor.service.test.ts # 2FA管理（TOTP + バックアップコード）
│   │       │   ├── role.service.test.ts # ロール管理（23テスト）
│   │       │   ├── permission.service.test.ts # 権限管理（23テスト）
│   │       │   ├── role-permission.service.test.ts # ロール権限紐付け（24テスト）
│   │       │   ├── user-role.service.test.ts # ユーザーロール管理（27テスト）
│   │       │   ├── rbac.service.test.ts # RBAC統合（21テスト）
│   │       │   ├── audit-log.service.test.ts # 監査ログ（35テスト）
│   │       │   ├── archive.service.test.ts # ログアーカイブ（6テスト）
│   │       │   └── email.service.test.ts # メール送信（Bull、14テスト）
│   │       └── utils/     # ユーティリティテスト
│   │           ├── sentry.test.ts  # Sentryエラートラッキング（13テスト）
│   │           └── env-validator.test.ts # 環境変数バリデーション（14テスト）
│   ├── errors/            # カスタムエラー定義
│   │   └── ApiError.ts    # カスタムAPIエラークラス
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
│   │   └── auth.routes.ts   # 認証ルート（招待登録、ログイン、2FA等）
│   ├── services/          # ビジネスロジック
│   │   ├── auth.service.ts  # 認証統合サービス
│   │   ├── token.service.ts # JWTトークン管理（EdDSA署名）
│   │   ├── session.service.ts # セッション管理
│   │   ├── invitation.service.ts # 招待制登録
│   │   ├── password.service.ts # パスワード管理（bcrypt）
│   │   ├── two-factor.service.ts # 2FA管理（TOTP + バックアップコード）
│   │   ├── role.service.ts # ロール管理
│   │   ├── permission.service.ts # 権限管理
│   │   ├── role-permission.service.ts # ロール権限紐付け
│   │   ├── user-role.service.ts # ユーザーロール管理
│   │   ├── rbac.service.ts # RBAC統合サービス
│   │   ├── audit-log.service.ts # 監査ログ
│   │   ├── archive.service.ts # ログアーカイブ
│   │   └── email.service.ts # メール送信（Bull非同期キュー）
│   ├── types/             # カスタム型定義
│   │   ├── express.d.ts   # Express Request拡張（pinoログ、user追加）
│   │   ├── env.d.ts       # 環境変数型定義（型安全なprocess.env）
│   │   ├── result.ts      # Result型（Ok/Err）
│   │   ├── auth.types.ts  # 認証関連型定義
│   │   ├── session.types.ts # セッション関連型定義
│   │   └── password.types.ts # パスワード関連型定義
│   ├── utils/             # ユーティリティ関数
│   │   ├── logger.ts      # Pinoロガー設定（Railway環境対応、pino-pretty統合）
│   │   ├── env-validator.ts # 環境変数バリデーション（Zod）
│   │   └── sentry.ts      # Sentryエラートラッキング
│   ├── app.ts             # Expressアプリケーション（テスト用に分離、Swagger UI統合）
│   ├── index.ts           # Expressサーバーエントリーポイント（app.tsをimportして起動）
│   ├── generate-swagger.ts  # Swagger/OpenAPI仕様生成スクリプト（JSDocから生成）
│   ├── db.ts              # Prisma Clientシングルトン（lazy initialization）
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
- `db.ts`: Prisma Clientのシングルトン実装。lazy initializationにより初回アクセス時に接続確立
- `redis.ts`: Redisクライアントのlazy initialization実装。初回アクセス時に接続確立
- `errors/ApiError.ts`: カスタムAPIエラークラス。BadRequestError、ValidationError等を提供
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

**管理API:**
- `POST /admin/log-level`: ログレベル動的変更（本番環境デバッグ用）
- `GET /admin/log-level`: 現在のログレベル取得

**認証API:**
- 招待登録、ログイン、ログアウト、トークンリフレッシュ、2FA検証、パスワードリセット、ユーザー情報取得

**2FA管理API:**
- 2FA初期設定、有効化、無効化、バックアップコード再生成

**セッション管理API:**
- セッション一覧取得、特定セッション削除、セッション有効期限延長

**ロール・権限管理API:**
- ロールCRUD、権限CRUD、ロール権限紐付け、ユーザーロール管理

**監査ログAPI:**
- 監査ログ一覧取得（フィルタリング、ページネーション）、ログアーカイブ

**公開鍵配信API:**
- `GET /.well-known/jwks.json`: JWT検証用公開鍵（JWKS形式、RFC 7517準拠）

**実装済みミドルウェア:**

- エラーハンドリング: ApiError、Zod、Prismaエラーの統一処理
- HTTPSリダイレクト: 本番環境でHTTP→HTTPS強制
- HSTSヘッダー: Strict-Transport-Securityヘッダー設定
- リクエストバリデーション: Zodスキーマによる型安全なバリデーション
- ロギング: Pino HTTPロギングミドルウェア
- **JWT認証**: EdDSA署名検証、アクセス/リフレッシュトークン
- **権限チェック**: RBACによる動的権限検証、キャッシング統合

## Docker構成

### `docker-compose.yml`

ローカル開発環境全体を定義します。

**サービス構成:**

- `postgres`: PostgreSQL 15データベース（ポート5432）
- `redis`: Redis 7キャッシュ（ポート6379）
- `backend`: Node.js/Expressバックエンド（ポート3000）
- `frontend`: React/Viteフロントエンド（ポート5173）

**開発環境の特徴:**

- **ヘルスチェック**: 全サービスでヘルスチェックを実装し、起動順序と依存関係を保証
- **名前付きボリューム**: `node_modules`を名前付きボリュームとしてマウント、パーミッション問題を回避
- **エントリポイントスクリプト**: 各サービスは専用のdocker-entrypoint.shで依存関係を自動管理
- **フロントエンド最適化**: アーキテクチャ固有モジュールの選択的再インストールで起動時間を短縮（45-60秒 → 10-15秒）

### Dockerfile構成

**Frontend:**
- `Dockerfile`: 本番環境用。マルチステージビルドでViteビルド→nginx配信
- `Dockerfile.dev`: 開発環境用。Vite dev serverでホットリロード対応
- `docker-entrypoint.sh`: 起動時にアーキテクチャ固有モジュール（`@rollup/rollup-linux-${arch}-gnu`）をチェックし、不足時のみ再インストール

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

- `index.js` - ディレクトリのエントリーポイント・エクスポート集約
- `*.test.js` - ユニットテストファイル
- `*.spec.js` - E2Eテストファイル（Playwright）またはスペックファイル（BDD）
- `*.stories.tsx` - Storybookストーリーファイル（コンポーネントバリアント定義）
- `.env.example` - 環境変数テンプレート

**E2Eテストファイル命名規則:**

- `e2e/specs/api/*.spec.ts` - APIエンドポイントテスト（例: `health.spec.ts`）
- `e2e/specs/ui/*.spec.ts` - UIテスト（例: `homepage.spec.ts`）
- `e2e/specs/integration/*.spec.ts` - 統合テスト（例: `database.spec.ts`）
- `e2e/helpers/*.ts` - テストヘルパー関数（例: `browser.ts`）

**Storybookストーリーファイル命名規則:**

- `frontend/src/components/*.stories.tsx` - コンポーネントのストーリー（例: `ErrorBoundary.stories.tsx`）
- CSF 3.0（Component Story Format 3.0）形式で記述

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

#### 1. Pre-commitフック

コミット前に自動的に以下が実行されます：

- 変更されたバックエンドファイル（`*.ts`）: Prettier + ESLint + TypeScript型チェック
- 変更されたフロントエンドファイル（`*.{ts,tsx}`）: Prettier + ESLint + TypeScript型チェック
- 変更されたE2Eファイル（`*.ts`, `playwright.config.ts`）: Prettier + ESLint + TypeScript型チェック

型エラーがある場合、コミットは中断されます。

#### 2. Commit-msgフック

コミットメッセージが Conventional Commits形式に従っているかチェック。形式違反の場合はコミットを中断します。

#### 3. Pre-pushフック

プッシュ前に以下を実行：

1. **Formatチェック（Backend/Frontend/E2E）**: Prettierによるコードフォーマット検証
2. **型チェック（Backend/Frontend/E2E）**: TypeScript型エラーの検出
3. **Lintチェック（Backend/Frontend/E2E）**: ESLintによるコード品質検証
4. **ビルド（Backend/Frontend）**: 本番環境ビルドの成功確認
5. **Backend単体テスト（カバレッジチェック）**: `npm --prefix backend run test:unit:coverage`（149テスト、カバレッジ閾値80%）
6. **Frontend単体テスト（カバレッジチェック）**: `npm --prefix frontend run test:coverage`（13テスト、カバレッジ閾値80%）
7. **Backend統合テスト**: `docker exec architrack-backend npm run test:integration`（Docker環境必須）
8. **E2Eテスト実行**: `npm run test:e2e`（タイムアウト: 10分、Docker環境必須）
   - **同期実行**: テスト完了を待ってからプッシュ実行
   - **タイムアウト保護**: 10分でハングアップを防止
   - **詳細なエラーハンドリング**: タイムアウトとテスト失敗を区別

型エラー、テスト失敗、またはタイムアウトがある場合、プッシュは中断されます。

**テスト実行順序の理由:**
- Format/Lint/型チェック（超高速）→ ビルド（高速）→ 単体テスト（高速）→ 統合テスト（中速）→ E2Eテスト（低速）の順で実行
- **Fail-fast戦略**: 早期ステージでの失敗で即座に中断
- **Shift-Left原則**: 問題を早期発見し、プッシュ前に品質を保証
- **Defense in Depth戦略**: 複数レイヤーでの品質保証

**カバレッジ達成状況:**
- **Branches: 80.00% ✅達成**（2025-11-11）
- Statements: 89.46%
- Functions: 93.43%
- Lines: 89.42%
- テスト合計: 472テスト

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
