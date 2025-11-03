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
- `vitest` ^4.0.6 - 単体テストフレームワーク
- `@vitest/ui` ^4.0.6 - Vitest UIツール
- `@testing-library/react` ^16.3.0 - Reactコンポーネントテスト
- `@testing-library/jest-dom` ^6.9.1 - Jest DOMマッチャー
- `@testing-library/user-event` ^14.6.1 - ユーザーイベントシミュレーション
- `jsdom` ^27.1.0 - ブラウザ環境シミュレーション

### 設定ファイル

- `frontend/tsconfig.json` - TypeScript設定（Vite/React専用、Incremental Build有効）
- `frontend/tsconfig.node.json` - TypeScript設定（Vite設定ファイル用、composite: true）
- `frontend/src/vite-env.d.ts` - Vite環境変数型定義
- `frontend/vite.config.ts` - Vite設定（TypeScript版、ベストプラクティス）
- `frontend/vitest.config.ts` - Vitest設定（jsdom環境）
- `frontend/vitest.setup.ts` - Vitestセットアップスクリプト
- `frontend/nginx.conf` - nginx設定（本番環境）
- `frontend/package.json` - 依存関係管理
- `frontend/.env.example` - 環境変数テンプレート
- `frontend/.eslintrc.cjs` - ESLint設定（vitest.config.ts, vite.config.ts除外対応）
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
- **ORM**: Prisma 6.18.0（PostgreSQL用の型安全なデータアクセス）
- **データベースクライアント**: pg (PostgreSQL) 8.11.3、@prisma/client 6.18.0
- **キャッシュクライアント**: ioredis 5.3.2
- **パッケージマネージャ**: npm
- **設定管理**: dotenv (.envファイル)

### 主要な依存関係

- `express` ^4.18.2 - Webフレームワーク
- `cors` ^2.8.5 - CORS ミドルウェア
- `@prisma/client` ^6.18.0 - Prisma ORM クライアント（型安全なデータアクセス）
- `pg` ^8.11.3 - PostgreSQL クライアント
- `ioredis` ^5.3.2 - Redis クライアント
- `dotenv` ^16.4.1 - 環境変数管理
- `pino` ^8.17.0 - ロガー
- `pino-http` ^9.0.0 - HTTP ロギングミドルウェア
- `pino-pretty` ^10.3.0 - ログの整形出力（開発環境）
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
- `vitest` ^4.0.6 - 単体テストフレームワーク
- `@vitest/ui` ^4.0.6 - Vitest UIツール
- `supertest` ^7.2.0 - APIテストライブラリ
- `@types/supertest` ^6.1.0 - supertest型定義
- `prisma` ^6.18.0 - Prisma CLI（マイグレーション、スキーマ管理）
- `ts-node` ^10.9.2 - TypeScript実行環境（Prisma用）

### 設定ファイル

- `backend/tsconfig.json` - TypeScript設定（Node.js専用、Incremental Build有効）
- `backend/prisma/schema.prisma` - Prismaスキーマ定義（データモデル、マイグレーション）
- `backend/src/types/express.d.ts` - Express Request拡張型定義（pinoログ追加）
- `backend/src/types/env.d.ts` - 環境変数型定義（型安全なprocess.env）
- `backend/src/utils/logger.ts` - Pinoロガー設定（Railway環境対応）
- `backend/vitest.config.ts` - Vitest設定（Node.js環境）
- `backend/vitest.setup.ts` - Vitestセットアップスクリプト
- `backend/package.json` - 依存関係管理
- `backend/.env.example` - 環境変数テンプレート
- `backend/.eslintrc.cjs` - ESLint設定（vitest.config.ts除外対応）
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

## 単体テスト

### 技術スタック

- **テストフレームワーク**: Vitest 4.0.6
- **Backend**: supertest (APIテスト) + Vitest
- **Frontend**: React Testing Library + jsdom + Vitest
- **モック**: Vitest標準モック機能（vi.fn(), vi.mock()）
- **カバレッジ**: Vitest Coverage (v8プロバイダー)
- **UIツール**: Vitest UI

### Backend単体テスト

**主要な依存関係:**
- `vitest` ^4.0.6 - テストランナー
- `supertest` ^7.2.0 - HTTPアサーション
- `@vitest/ui` ^4.0.6 - 対話的UIツール

**設定ファイル:**
- `backend/vitest.config.ts` - Node.js環境設定
- `backend/vitest.setup.ts` - グローバルセットアップ

**テスト構成:**
- `backend/src/__tests__/` - テストファイル配置
  - `unit/errors/` - エラークラステスト
    - `ApiError.test.ts` - カスタムAPIエラークラスのテスト
  - `unit/middleware/` - ミドルウェアテスト
    - `errorHandler.test.ts` - エラーハンドリングミドルウェア（Zod、Prisma、一般エラー）
    - `httpsRedirect.test.ts` - HTTPS強制リダイレクトとHSTSヘッダー
    - `validate.test.ts` - Zodバリデーションミドルウェア（body/query/params）
  - `unit/routes/` - ルートテスト
    - `admin.routes.test.ts` - 管理者用ルート（ログレベル動的変更）
- `backend/src/app.ts` - テスト用にindex.tsから分離したExpressアプリ

**実行方法:**
```bash
npm --prefix backend run test        # 全テスト実行
npm --prefix backend run test:watch  # ウォッチモード
npm --prefix backend run test:ui     # UIモード
npm --prefix backend run test:coverage  # カバレッジレポート
```

**テストカバレッジ:**
- エラークラステスト（ApiError.test.ts）
- ミドルウェアテスト（errorHandler, httpsRedirect, validate）
- ルートテスト（admin.routes）
- 合計: 包括的なユニットテスト群

**型安全性のベストプラクティス:**
- Vitest MockとExpress型の互換性: `as unknown as Type` パターンを使用
- すべての型アサーションに説明コメントを追加
- ZodIssue型対応: `as unknown as ZodIssue` で新バージョンのZod型に対応
- NextFunction型: `vi.fn() as unknown as NextFunction` で適切に型付け
- process.env操作: テスト環境でのみ `eslint-disable` コメント付きで許可

### Frontend単体テスト

**主要な依存関係:**
- `vitest` ^4.0.6 - テストランナー
- `@testing-library/react` ^16.3.0 - Reactコンポーネントテスト
- `@testing-library/jest-dom` ^6.9.1 - DOMマッチャー
- `@testing-library/user-event` ^14.6.1 - ユーザーイベントシミュレーション
- `jsdom` ^27.1.0 - ブラウザ環境エミュレーション
- `@vitest/ui` ^4.0.6 - 対話的UIツール

**設定ファイル:**
- `frontend/vitest.config.ts` - jsdom環境、React プラグイン設定
- `frontend/vitest.setup.ts` - @testing-library/jest-dom グローバルセットアップ

**テスト構成:**
- `frontend/src/__tests__/` - テストファイル配置
  - `api/` - APIクライアントテスト
    - `client.test.ts` - APIクライアント（fetch、エラーハンドリング）
  - `components/` - Reactコンポーネントテスト
    - `ErrorBoundary.test.tsx` - エラーバウンダリコンポーネント

**実行方法:**
```bash
npm --prefix frontend run test        # 全テスト実行
npm --prefix frontend run test:watch  # ウォッチモード
npm --prefix frontend run test:ui     # UIモード
npm --prefix frontend run test:coverage  # カバレッジレポート
```

**テストカバレッジ:**
- APIクライアントテスト（client.test.ts）
- Reactコンポーネントテスト（ErrorBoundary.test.tsx）
- 合計: 包括的なユニットテスト群

**型安全性のベストプラクティス:**
- `global.fetch` → `globalThis.fetch`: ブラウザ環境の適切な名前空間を使用
- `import.meta.env.DEV`: 型を `boolean` に統一（`string | undefined` から変更）
- `useRef<T | undefined>(undefined)`: 明示的な undefined 初期値で型エラーを解消
- IntersectionObserver: entry null チェックを追加してランタイム安全性を向上
- useEffect cleanup: 明示的な `return undefined` でTypeScript型エラーを解消

### なぜVitestを選択したか

- **ES Modulesネイティブサポート**: Jest の実験的ESMサポートよりも安定
- **Viteとの統合**: フロントエンドがViteを使用しているため、一貫性のある設定
- **高速実行**: Viteのトランスフォーム機能を活用した高速テスト
- **TypeScriptファーストサポート**: 追加設定不要でTypeScript実行可能
- **統一されたテスト環境**: Backend/Frontend両方で同じツールチェーン

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

- `tsconfig.json` - TypeScript設定（E2Eテスト用、Incremental Build有効）
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

### 単体テスト（Vitest）

```bash
# Backend単体テスト
npm --prefix backend run test        # 全テスト実行
npm --prefix backend run test:watch  # ウォッチモード
npm --prefix backend run test:ui     # UIモード
npm --prefix backend run test:coverage  # カバレッジレポート

# Frontend単体テスト
npm --prefix frontend run test        # 全テスト実行
npm --prefix frontend run test:watch  # ウォッチモード
npm --prefix frontend run test:ui     # UIモード
npm --prefix frontend run test:coverage  # カバレッジレポート

# 全ての単体テストを実行（Backend + Frontend）
npm --prefix backend run test && npm --prefix frontend run test
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
npm --prefix backend run type-check

# Frontend型チェック
npm --prefix frontend run type-check

# E2E型チェック
npm run type-check

# Backendビルド
npm --prefix backend run build

# Frontend TSビルド
npm --prefix frontend run build
```

### Prisma開発

```bash
# Prisma Clientを生成
npm --prefix backend run prisma:generate

# マイグレーションを作成・実行（開発環境）
npm --prefix backend run prisma:migrate

# 本番環境へマイグレーション適用
npm --prefix backend run prisma:migrate:deploy

# Prisma Studio起動（データベースGUI）
npm --prefix backend run prisma:studio

# スキーマフォーマット
npm --prefix backend run prisma:format
```

#### TypeScript Incremental Build

全てのtsconfig.json（backend、frontend、E2E）でIncremental Buildを有効化しています：

```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

**パフォーマンス向上:**
- Backend: 1.485s → 0.800s（46%高速化）
- Frontend: 0.895s → 0.632s（29%高速化）
- E2E: 0.847s → 0.710s（16%高速化）
- **合計: 3.227s → 2.142s（34%高速化）**

**仕組み:**
- 初回実行時に`.tsbuildinfo`ファイルを生成
- 2回目以降は変更されたファイルのみ型チェック
- `.tsbuildinfo`は`.gitignore`に追加済み（ビルドキャッシュのため）

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

`.github/workflows/ci.yml` でCI/CDパイプラインを定義しています。

**CIワークフロー（ステージ型）:**

プッシュ・PR時に自動実行されます。

**Stage 1: Code Quality Checks（コード品質チェック）**
- Backend: Format check, Lint, TypeScript型チェック
- Frontend: Format check, Lint, TypeScript型チェック
- E2E: Format check, Lint, TypeScript型チェック
- **Fail-fast戦略**: いずれかのチェック失敗で即座に終了
- **同期実行**: 各ジョブは完了を待ってから次のステージへ進行

**Stage 1.5: Security Scanning（セキュリティスキャン）**
- Backend/Frontend: `npm audit --audit-level=moderate`
- Trivy: ファイルシステム・設定ファイルのセキュリティスキャン
- **Stage 1成功後に実行**

**Stage 2: Build（ビルド）**
- Backend: `npm run build`
- Frontend: `npm run build`
- **Stage 1成功後に実行**
- ビルド成果物をartifactとしてアップロード

**Stage 3: Unit Tests（単体テスト）**
- Backend: `npm run test:unit:coverage`（11テスト）
  - **同期実行**: テスト完了を待ってから次のステージへ進行（Shift-Left原則）
- Frontend: `npm run test:coverage`（13テスト）
  - **同期実行**: テスト完了を待ってから次のステージへ進行（Shift-Left原則）
- **Stage 2成功後に実行**
- **Fail-fast戦略**: いずれかのテスト失敗で即座に終了
- カバレッジレポートをartifactとしてアップロード

**Stage 4: Integration Tests（統合テスト）**
- Backend: `npm run test:integration:coverage`
  - **同期実行**: テスト完了を待ってから次のステージへ進行（Shift-Left原則）
- PostgreSQL/Redisサービスを起動
- **Stage 3成功後に実行**
- カバレッジレポートをartifactとしてアップロード

**Stage 5: E2E Tests（E2Eテスト）**
- Docker Composeでサービス起動
- ヘルスチェック待機（最大180秒）
- Playwright E2Eテスト実行（タイムアウト: 30分）
  - **同期実行**: テスト完了を待ってからワークフロー完了（Shift-Left原則）
  - **タイムアウト保護**: 30分でハングアップを防止
- **Stage 3,4成功後に実行**
- 失敗時にスクリーンショット・ビデオをartifactとしてアップロード

**Stage 6: Docker Build Test（Dockerビルドテスト）**
- Backend/Frontend: Dockerイメージビルド検証
- **Stage 2成功後に実行（Stage 4と並列）**

**ワークフローの特徴:**
- **ステージ型構成**: 品質→セキュリティ→ビルド→単体→統合→E2Eの順で段階的に実行
- **Fail-fast戦略**: 早期ステージでの失敗で即座に終了（無駄なリソース消費を回避）
- **Shift-Left原則**: すべてのテストを同期実行し、品質を早期保証
- **Defense in Depth戦略**: 複数レイヤーでの品質・セキュリティ保証
- **再現可能なビルド**: `npm ci` による依存関係インストール
- **並列実行**: 同一ステージ内のジョブは並列実行（Backend/Frontend）


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

1. **Formatチェック（Backend/Frontend/E2E）**: `npm run format:check`
   - Prettierによるコードフォーマット検証
   - 整形されていないコードがある場合は警告
2. **型チェック（Backend/Frontend/E2E）**: `npm run type-check`
   - TypeScript型エラーの検出
3. **Lintチェック（Backend/Frontend/E2E）**: `npm run lint`
   - ESLintによるコード品質検証
4. **ビルド（Backend/Frontend）**: `npm run build`
   - 本番環境ビルドの成功確認
5. **Backend単体テスト**: `npm --prefix backend run test:unit`
6. **Frontend単体テスト**: `npm --prefix frontend run test`
7. **Backend統合テスト**: `docker exec architrack-backend npm run test:integration`
   - Docker環境必須（起動していない場合はエラー）
8. **E2Eテスト実行**: `npm run test:e2e`（タイムアウト: 10分）
   - Docker環境必須（起動していない場合はエラー）
   - **同期実行**: テスト完了を待ってからプッシュ実行（Shift-Left原則）
   - **タイムアウト保護**: 10分でハングアップを防止
   - **詳細なエラーハンドリング**: タイムアウトとテスト失敗を区別

型エラー、テスト失敗、またはタイムアウトがある場合、プッシュは中断されます。

**テスト実行順序の理由:**
- Format/Lint/型チェック（超高速）→ ビルド（高速）→ 単体テスト（高速）→ 統合テスト（中速）→ E2Eテスト（低速）の順で実行
- **Fail-fast戦略**: 早期ステージでの失敗で即座に中断（無駄なリソース消費を回避）
- **Shift-Left原則**: 問題を早期発見し、プッシュ前に品質を保証
- **Defense in Depth戦略**: 複数レイヤーでの品質保証（Format → Lint → Type → Build → Unit → Integration → E2E）

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
  "*.{js,ts}": [
    "prettier --write",
    "eslint --fix"
  ],
  "prisma/schema.prisma": [
    "prisma format"
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
