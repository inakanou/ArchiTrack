# 技術スタック

## アーキテクチャ

ArchiTrackは、フロントエンドとバックエンドを分離したモノレポ構成を採用しています。Claude Codeのカスタムコマンド機能を活用し、開発ワークフローを自動化しています。

### システム構成

```
ArchiTrack/
├── frontend/     # フロントエンドアプリケーション
├── backend/      # バックエンドAPI
├── e2e/          # E2Eテスト（Playwright）
├── .claude/      # Claude Codeカスタムコマンド
└── .kiro/        # ステアリング・スペック管理
```

## フロントエンド

### 技術スタック

- **言語**: TypeScript 5.9.3
- **フレームワーク**: React 18.2.0
- **ビルドツール**: Vite 5.1.0
- **開発サーバー**: Vite Dev Server
- **Webサーバー（本番）**: nginx
- **パッケージマネージャ**: npm

### 主要な依存関係

- `react` ^18.2.0 - UIライブラリ
- `react-dom` ^18.2.0 - React DOM操作
- `typescript` ^5.9.3 - TypeScriptコンパイラ
- `@types/react` ^19.2.2 - React型定義
- `@types/react-dom` ^19.2.2 - React DOM型定義
- `@vitejs/plugin-react` ^4.2.1 - Vite React プラグイン
- `@typescript-eslint/eslint-plugin` ^8.46.2 - TypeScript ESLintプラグイン
- `@typescript-eslint/parser` ^8.46.2 - TypeScript ESLintパーサー
- `eslint` ^8.56.0 - コード品質チェック
- `prettier` ^3.6.2 - コードフォーマッター
- `lint-staged` ^15.2.0 - ステージングファイルへのリンター実行

### 設定ファイル

- `frontend/tsconfig.json` - TypeScript設定（Vite/React専用）
- `frontend/src/vite-env.d.ts` - Vite環境変数型定義
- `frontend/vite.config.js` - Vite設定
- `frontend/nginx.conf` - nginx設定（本番環境）
- `frontend/package.json` - 依存関係管理
- `frontend/.env.example` - 環境変数テンプレート
- `frontend/.eslintrc.json` - ESLint設定
- `frontend/.prettierrc` - Prettier設定（フロントエンド用、プロジェクトルートからコピー）
- `.prettierrc` - Prettier設定（プロジェクトルート）
- `frontend/Dockerfile` - 本番環境用Dockerイメージ
- `frontend/Dockerfile.dev` - 開発環境用Dockerイメージ
- `frontend/docker-entrypoint.sh` - Docker起動時の依存関係チェックスクリプト
- `frontend/railway.toml` - Railway デプロイ設定

## バックエンド

### 技術スタック

- **言語**: TypeScript 5.9.3
- **ランタイム**: Node.js 20
- **開発ランタイム**: tsx 4.20.6（TypeScript実行環境）
- **フレームワーク**: Express 4.18.2
- **データベースクライアント**: pg (PostgreSQL) 8.11.3
- **キャッシュクライアント**: ioredis 5.3.2
- **パッケージマネージャ**: npm
- **設定管理**: dotenv (.envファイル)

### 主要な依存関係

- `express` ^4.18.2 - Webフレームワーク
- `cors` ^2.8.5 - CORS ミドルウェア
- `pg` ^8.11.3 - PostgreSQL クライアント
- `ioredis` ^5.3.2 - Redis クライアント
- `dotenv` ^16.4.1 - 環境変数管理
- `pino` ^8.17.0 - ロガー
- `pino-http` ^9.0.0 - HTTP ロギングミドルウェア
- `pino-pretty` ^10.3.0 - ログの整形出力
- `typescript` ^5.9.3 - TypeScriptコンパイラ
- `tsx` ^4.20.6 - TypeScript実行環境
- `@types/express` ^5.0.5 - Express型定義
- `@types/cors` ^2.8.19 - CORS型定義
- `@types/node` ^24.9.2 - Node.js型定義
- `@types/pg` ^8.15.6 - PostgreSQL型定義
- `@typescript-eslint/eslint-plugin` ^8.46.2 - TypeScript ESLintプラグイン
- `@typescript-eslint/parser` ^8.46.2 - TypeScript ESLintパーサー
- `eslint` ^8.56.0 - コード品質チェック
- `prettier` ^3.6.2 - コードフォーマッター
- `husky` ^9.0.11 - Git フックマネージャー
- `lint-staged` ^15.2.0 - ステージングファイルへのリンター実行

### 設定ファイル

- `backend/tsconfig.json` - TypeScript設定（Node.js専用）
- `backend/src/types/express.d.ts` - Express Request拡張型定義（pinoログ追加）
- `backend/src/types/env.d.ts` - 環境変数型定義（型安全なprocess.env）
- `backend/package.json` - 依存関係管理
- `backend/.env.example` - 環境変数テンプレート
- `backend/.eslintrc.json` - ESLint設定
- `backend/.prettierrc` - Prettier設定（バックエンド用、プロジェクトルートからコピー）
- `.prettierrc` - Prettier設定（プロジェクトルート）
- `.husky/` - Git フック設定ディレクトリ
- `backend/Dockerfile.dev` - 開発環境用Dockerイメージ
- `backend/docker-entrypoint.sh` - Docker起動時の依存関係チェックスクリプト
- `backend/railway.toml` - Railway デプロイ設定

## データベース・キャッシュ

### PostgreSQL

- **バージョン**: PostgreSQL 15 (Alpine)
- **用途**: メインデータストア
- **接続方式**: pgクライアントライブラリ経由
- **ヘルスチェック**: `pg_isready`コマンド

### Redis

- **バージョン**: Redis 7 (Alpine)
- **用途**: キャッシュ・セッション管理
- **接続方式**: ioredisクライアントライブラリ経由
- **ヘルスチェック**: `redis-cli ping`コマンド

## E2Eテスト

### 技術スタック

- **言語**: TypeScript 5.9.3
- **テストフレームワーク**: Playwright 1.40.0
- **ブラウザ**: Chromium (Playwright管理)
- **テスト構成**: カテゴリ分け（api, ui, integration）
- **レポート**: HTML形式、タイムスタンプ付きディレクトリ管理

### 主要な依存関係

- `@playwright/test` ^1.40.0 - E2Eテストフレームワーク
- `typescript` ^5.9.3 - TypeScriptコンパイラ
- `@types/node` ^24.9.2 - Node.js型定義
- `@typescript-eslint/eslint-plugin` ^8.46.2 - TypeScript ESLintプラグイン
- `@typescript-eslint/parser` ^8.46.2 - TypeScript ESLintパーサー
- Chromium - Playwright経由で自動インストール

### 設定ファイル

- `tsconfig.json` - TypeScript設定（E2Eテスト用）
- `playwright.config.ts` - Playwright設定（WSL2最適化、タイムスタンプ機能）
- `package.json` - E2Eテスト用依存関係とスクリプト
- `.github/workflows/e2e-tests.yml` - CI/CD E2Eテストワークフロー

### テストカテゴリ

- `e2e/specs/api/` - APIエンドポイントのテスト
- `e2e/specs/ui/` - UIコンポーネントとページのテスト
- `e2e/specs/integration/` - システム統合テスト
- `e2e/helpers/` - Claude Code統合ヘルパー（ブラウザ操作、スクリーンショット）

### タイムスタンプ機能

テスト実行時、結果は自動的にタイムスタンプ付きディレクトリに保存されます：

```
playwright-report/
└── YYYY-MM-DD_HH-MM-SS-MMMZ/
    └── index.html

test-results/
└── YYYY-MM-DD_HH-MM-SS-MMMZ/
    ├── screenshots/  # 失敗時のスクリーンショット
    └── videos/       # 失敗時のビデオ
```

### Claude Code統合

`e2e/helpers/browser.js`により、Claude Codeから直接ブラウザ操作が可能：

```bash
# スクリーンショット撮影
node e2e/helpers/browser.js screenshot http://localhost:5173 screenshot.png

# ページ情報取得
node e2e/helpers/browser.js info http://localhost:5173

# APIテスト
node e2e/helpers/browser.js api http://localhost:3000/health
```

## 開発環境

### Docker開発環境パターン

ArchiTrackでは、開発環境の一貫性と再現性を確保するため、以下のDocker開発パターンを採用しています。

#### エントリポイントスクリプトパターン

各サービス（backend/frontend）は専用のエントリポイントスクリプトを持ち、起動時の依存関係を自動管理します：

**フロントエンド (`frontend/docker-entrypoint.sh`):**
- アーキテクチャ固有モジュール（`@rollup/rollup-linux-${arch}-gnu`）のチェック
- 不足している場合のみ必要なモジュールを再インストール
- 起動時間の最適化（45-60秒 → 10-15秒）

**バックエンド (`backend/docker-entrypoint.sh`):**
- `node_modules/.bin`の存在確認
- 不足している場合のみ依存関係をインストール

#### ヘルスチェック設定

全サービスにヘルスチェックを実装し、依存関係の起動順序を保証：

- **PostgreSQL**: `pg_isready`コマンドで接続可能性を確認
- **Redis**: `redis-cli ping`でサービス状態を確認
- **Backend**: `curl http://localhost:3000/health`でAPIの準備状態を確認
- **Frontend**: `curl http://localhost:5173`でViteサーバーの起動を確認（`start_period: 45s`でnpm install時間を考慮）

#### 名前付きボリュームパターン

`node_modules`は名前付きボリュームとしてマウントし、ホストとコンテナ間のパーミッション問題を回避：

```yaml
volumes:
  - ./frontend:/app
  - frontend_node_modules:/app/node_modules
```

### 必須ツール

- **Node.js 20以上**: フロントエンド・バックエンドの実行環境
- **Docker & Docker Compose**: コンテナ化開発環境
- **Git**: バージョン管理
- **Claude Code**: AI支援開発環境
- **Chromium（システム依存関係）**: E2Eテスト（Playwright）の実行に必要
- **jq**: JSONパーサー（Claude Codeのカスタムフック実行に必要）
- **テキストエディタ/IDE**: VS Code推奨

### 推奨ツール

- **GitHub CLI (gh)**: PRやイシュー管理
- **Railway CLI**: デプロイメント管理
- **PostgreSQL クライアント**: データベース管理（TablePlus、pgAdmin等）
- **Redis クライアント**: キャッシュ確認（RedisInsight等）

## よく使うコマンド

### Docker Compose による起動（推奨）

```bash
# すべてのサービスを起動（PostgreSQL、Redis、Backend、Frontend）
docker-compose up

# バックグラウンドで起動
docker-compose up -d

# 特定のサービスのみ起動
docker-compose up postgres redis

# サービス停止
docker-compose down

# ボリュームも含めて完全削除
docker-compose down -v

# 再ビルドして起動
docker-compose up --build
```

### プロジェクトセットアップ（個別実行時）

```bash
# フロントエンド依存関係のインストール
cd frontend && npm install

# バックエンド依存関係のインストール
cd backend && npm install

# 環境変数ファイルの作成
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 開発サーバー起動（個別実行時）

```bash
# PostgreSQLとRedisをDocker Composeで起動
docker-compose up postgres redis

# フロントエンド開発サーバー（別ターミナル）
cd frontend && npm run dev

# バックエンド開発サーバー（別ターミナル）
cd backend && npm run dev

# バックエンド本番モード起動
cd backend && npm start
```

### ビルド・リント・フォーマット

```bash
# フロントエンドビルド
cd frontend && npm run build

# フロントエンドプレビュー
cd frontend && npm run preview

# ESLint実行（フロントエンド）
cd frontend && npm run lint

# ESLint修正（フロントエンド）
cd frontend && npm run lint:fix

# Prettier実行（フロントエンド）
cd frontend && npx prettier --write "src/**/*.{js,jsx}"

# ESLint実行（バックエンド）
cd backend && npm run lint

# ESLint修正（バックエンド）
cd backend && npm run lint:fix

# Prettier実行（バックエンド）
cd backend && npx prettier --write "src/**/*.js"
```

### E2Eテスト（Playwright）

```bash
# E2Eテストセットアップ（初回のみ）
npm install
sudo npx playwright install-deps chromium  # WSL2/Linuxのみ

# E2Eテスト実行
npm run test:e2e

# UIモードで実行（対話的）
npm run test:e2e:ui

# ヘッドフルモード（ブラウザを表示）
npm run test:e2e:headed

# デバッグモード
npm run test:e2e:debug

# レポート表示（最新）
npm run test:e2e:report

# カテゴリ別実行
npx playwright test api/           # APIテストのみ
npx playwright test ui/            # UIテストのみ
npx playwright test integration/   # 統合テストのみ

# Claude Codeからブラウザ操作
node e2e/helpers/browser.js screenshot http://localhost:5173 screenshot.png
node e2e/helpers/browser.js info http://localhost:5173
node e2e/helpers/browser.js api http://localhost:3000/health
```

### Kiroスラッシュコマンド

```bash
# ステアリングドキュメント作成・更新
/kiro:steering

# 新規仕様の初期化
/kiro:spec-init [詳細な説明]

# 要件定義の生成
/kiro:spec-requirements [feature-name]

# 技術設計の作成
/kiro:spec-design [feature-name]

# 実装タスクの生成
/kiro:spec-tasks [feature-name]

# 仕様の進捗確認
/kiro:spec-status [feature-name]

# 設計品質レビュー
/kiro:validate-design [feature-name]

# 実装ギャップ分析
/kiro:validate-gap [feature-name]
```

### TypeScript開発

```bash
# Backend型チェック
cd backend && npm run type-check

# Frontend型チェック
cd frontend && npm run type-check

# E2E型チェック
npm run type-check

# Backendビルド
cd backend && npm run build

# Frontend TSビルド
cd frontend && npm run build
```

### Git操作

```bash
# ステータス確認
git status

# Gitフックの有効化（初回のみ）
git config core.hooksPath .husky

# 変更のコミット
git add .
git commit -m "feat: commit message"
# 注1: commit-msgフックがConventional Commits形式をチェック
# 注2: pre-commitフックが自動的にPrettier + ESLint + TypeScript型チェックを実行

# リモートへプッシュ
git push origin main
# 注: pre-pushフックがTypeScript型チェックとE2Eテストを実行
```

## 環境変数

### フロントエンド環境変数

```bash
# API接続先URL
VITE_API_URL=http://localhost:3000
```

本番環境では `https://your-backend.railway.app` のようなRailway URLを指定します。

### バックエンド環境変数

```bash
# サーバー設定
PORT=3000
NODE_ENV=development  # または production

# データベース接続
DATABASE_URL=postgresql://postgres:dev@localhost:5432/architrack_dev

# Redis接続
REDIS_URL=redis://localhost:6379

# CORS設定
FRONTEND_URL=http://localhost:5173
```

本番環境では各サービスのRailway内部URLまたは公開URLを指定します。

## ポート設定

デフォルトのポート設定:

- **フロントエンド**: 5173 (Vite dev server)
- **バックエンド**: 3000
- **PostgreSQL**: 5432
- **Redis**: 6379
- **nginx（本番）**: 80/443

Railway環境では動的に割り当てられるPORTを使用します。

## CI/CD

### GitHub Actions

`.github/workflows/ci.yml` および `.github/workflows/e2e-tests.yml` でCI/CDパイプラインを定義しています。

**CIワークフロー:**
- **自動テスト**: プッシュ・PR時に実行
- **ビルド検証**: フロントエンド・バックエンドのビルド確認
- **ESLintチェック**: コード品質自動検証
- **再現可能なビルド**: `npm ci` による依存関係インストール

**E2Eテストワークフロー:**
- **自動E2Eテスト**: PRおよびmainブランチへのpush時に実行
- **段階的な依存関係インストール**: ルート、バックエンド、フロントエンドを個別にインストール
  ```yaml
  - npm ci                      # ルート（E2Eテスト）
  - npm --prefix backend ci     # バックエンド依存関係
  - npm --prefix frontend ci    # フロントエンド依存関係
  ```
- **lint/format実行前の準備**: 各サービスの依存関係インストール後にlint・formatチェック
- **Docker Compose統合**: テスト実行前にすべてのサービスを起動
- **ヘルスチェック待機**: 全サービスが健全状態になるまで最大180秒待機
- **失敗時のアーティファクト**: スクリーンショット・ビデオを自動保存
- **テストレポート**: HTML形式のレポートをアーティファクトとして保存

### Railway デプロイメント

GitHubリポジトリと連携し、mainブランチへのプッシュで自動デプロイを実施：

- **Backend Service**: `backend/` ディレクトリから自動ビルド・デプロイ
- **Frontend Service**: `frontend/` ディレクトリからnginx本番イメージをビルド・デプロイ
- **PostgreSQL**: RailwayマネージドPostgreSQL 15
- **Redis**: RailwayマネージドRedis 7

各サービスの環境変数はRailway UIまたは `railway.toml` で管理します。

## 開発ガイドライン

### コーディング規約

- **言語**: 思考は英語、コメントとドキュメントは日本語
- **コミットメッセージ**: 日本語で明確に記述
- **ブランチ戦略**: mainブランチベースの開発
- **コードスタイル**: Prettierによる自動フォーマット（`.prettierrc`）
  - セミコロン: あり
  - クォート: シングルクォート
  - インデント: 2スペース
  - 末尾カンマ: ES5互換
  - 行幅: 100文字
  - アロー関数の括弧: 常に使用

### コード品質管理

ArchiTrackでは、3段階のGit hooksにより品質を自動保証しています。

#### Pre-commitフック（`.husky/pre-commit`）

コミット前に自動的に以下が実行されます：

1. **lint-staged**: ステージングされたファイルのみ処理
2. **Prettier**: コードフォーマット自動適用
3. **ESLint**: コード品質チェックと自動修正
4. **TypeScript型チェック**: 型エラーがある場合はコミット中断

**実行対象:**
- Backend: `*.ts`ファイルが変更された場合
- Frontend: `*.{ts,tsx}`ファイルが変更された場合
- E2E: `*.ts`または`playwright.config.ts`が変更された場合

#### Commit-msgフック（`.husky/commit-msg`）

コミットメッセージが以下の形式に従っているかチェック：

- **Conventional Commits形式**: `type: subject`
- **許可されるtype**: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- **subject制約**: 小文字始まり、100文字以内、末尾にピリオド不要
- **ツール**: commitlint + @commitlint/config-conventional

**設定ファイル**: `commitlint.config.js`

#### Pre-pushフック（`.husky/pre-push`）

プッシュ前に自動的に以下が実行されます：

1. **Backend型チェック**: `npm --prefix backend run type-check`
2. **Frontend型チェック**: `npm --prefix frontend run type-check`
3. **E2E型チェック**: `npm run type-check`
4. **E2Eテスト実行**: `npm run test:e2e`

型エラーまたはテスト失敗がある場合、プッシュは中断されます。

#### lint-staged設定

**フロントエンド**:
```json
"lint-staged": {
  "*.{ts,tsx}": [
    "prettier --write",
    "eslint --fix"
  ]
}
```

**バックエンド**:
```json
"lint-staged": {
  "*.ts": [
    "prettier --write",
    "eslint --fix"
  ]
}
```

**E2E**:
```json
"lint-staged": {
  "*.ts": [
    "prettier --write",
    "eslint --fix"
  ]
}
```

### ワークフロー

1. `/kiro:steering` でプロジェクトコンテキストを最新化
2. `/kiro:spec-init` で新機能の仕様を初期化
3. 要件 → 設計 → タスク → 実装の順に進める
4. 各フェーズで人間のレビューを実施
5. タスク完了時にステータスを更新
6. コミット時に自動的にコード品質チェックが実行される
