# 技術スタック

ArchiTrackは、建設プロジェクトの管理・積算業務を効率化するためのWebアプリケーションです。プロジェクト管理、現場調査、数量拾い出し、内訳書作成、見積依頼・見積書作成までの一連の業務フローをサポートします。Claude Codeを活用したKiro-style Spec Driven Developmentで開発されています。

_最終更新: 2026-06-30（Steering Sync: 注釈Canvasのビューポート制御パターン（canvasViewportController→useCanvasViewport→ZoomControlsの一方向依存、2本指ピンチ中点ズーム/パン）、スマホ写真追加の二段構え高速化（フロント送信前圧縮＋応答の署名付きURLによる即時反映）を反映）_

_2026-06-08（Steering Sync: backend entrypointの実行時`npm ci`をdev/test限定化し本番はイメージ同梱依存を信頼するパターン（Railway永続ボリュームのroot所有node_modulesでのEACCESクラッシュループ対策）、sharp自己修復の非致命化を反映）_

_2026-06-05（Steering Sync: 全Dockerfileでcorepackによるnpm版固定（packageManager `npm@11.6.2`）でnpm ci決定性を確保するパターン、backend entrypointでのsharpネイティブバイナリ自己修復パターンを反映）_

_2026-06-04（Steering Sync: frontend react-router-dom を脆弱性対応で ^7.16.0 へ更新、backend Prisma 7.8.0 / @prisma/adapter-pg 7.3.0 へバージョン整合、ルートワークスペースのみ ESLint 10 系へ追従（frontend/backend は plugin 非互換のため 9 系維持）を反映）_

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

### 編集・保存パターン（数量表編集）

数量表編集画面はサーバー即時反映ではなく、**クライアントサイドドラフト + 明示保存モデル**を採用しています。

- 編集操作は `useReducer`（`frontend/src/pages/quantityTableEditReducer.ts`）でクライアント状態（ドラフト）に反映し、サーバーへは送らない
- 保存ボタン押下時に `saveQuantityTableDraft`（`frontend/src/api/quantity-tables.ts`）でグループ・項目の全状態を一括同期（バックエンド `PUT /api/quantity-tables/:id/save` → `saveDraft` サービス、`expectedUpdatedAt` で楽観的排他制御）
- 未保存変更の離脱ガード・未保存インジケーターバッジ・操作ヘッダー固定表示でUX担保
- インポートや現場調査からのグループ生成・グループコピーもドラフト更新として扱い、保存ボタンで確定する

他機能で用いるフィールド単位の即時保存・楽観的排他制御とは異なる明示保存方針である点に注意。

## フロントエンド

### 技術スタック

- **言語**: TypeScript 6.0.3（フロントエンドのみ。バックエンド/E2E は 5.9 系で運用）
- **フレームワーク**: React 19.2.0
- **ビルドツール**: Vite 8.0.8
- **開発サーバー**: Vite Dev Server
- **Webサーバー（本番）**: nginx
- **パッケージマネージャ**: npm

### 主要な依存関係

- `react` ^19.2.3 - UIライブラリ
- `react-dom` ^19.2.4 - React DOM操作
- `react-router-dom` ^7.16.0 - React Router v7（ルーティング、7.14.2以下のDoS脆弱性 GHSA-8x6r-g9mw-2r78 対応で7.16.0へ更新）
- `fabric` ^7.3.1 - Canvas注釈エディタ（現場調査画像編集、Group 化された矢印・タッチジェスチャー対応、2本指ピンチでの中点ズーム/パンとフィットを提供。ビューポート制御は `gestures/canvasViewportController`（純粋ロジック）→ `hooks/useCanvasViewport` → `ZoomControls`（表示専用）の一方向依存で構成し、`ImageViewer`/`AnnotationEditor` が共有する）
- `jspdf` ^4.0.0 - PDF報告書生成（現場調査、A4縦/横対応、見積書PDF出力）
- `xlsx` 0.20.3 - Excelファイル生成（内訳書・見積書・工程表エクスポート、SheetJS。npmレジストリではなくSheetJS公式CDNのtarballから取得）
- `jszip` ^3.10.1 - クライアントサイドZIP生成（現場調査画像の一括エクスポート、型定義同梱）
- `@holiday-jp/holiday_jp` ^2.5.1 - 日本の祝日データ（工程表ガントチャート祝日表示）
- `react-pdf` ^10.4.1 - PDFビューア（受領見積書プレビュー）、pdfjs-dist同梱
- `pdfjs-dist` (react-pdf依存) - PDFテキスト抽出（ハイブリッドアプローチ: テキストPDFはpdfjs-dist、画像PDFはOCR）
- `tesseract.js` ^7.0.0 - OCR文字認識（受領見積書構造化データ抽出、再実行/リトライ機能）
- `typescript` ^6.0.3 - TypeScriptコンパイラ（フロントエンドのみ TypeScript 6 系へ追従）
- `@types/react` ^19.2.7 - React型定義
- `@types/react-dom` ^19.2.3 - React DOM型定義
- `@vitejs/plugin-react` ^6.0.1 - Vite React プラグイン
- `@typescript-eslint/eslint-plugin` ^8.57.1 - TypeScript ESLintプラグイン
- `@typescript-eslint/parser` ^8.57.1 - TypeScript ESLintパーサー
- `eslint` ^9.39.1 - コード品質チェック（Flat Config形式）
- `eslint-plugin-react-hooks` ^7.1.1 - React Hooks ESLintプラグイン
- `prettier` ^3.8.1 - コードフォーマッター
- `lint-staged` ^16.4.0 - ステージングファイルへのリンター実行
- `tailwindcss` ^4.2.2 - ユーティリティファーストCSSフレームワーク
- `@tailwindcss/postcss` ^4.1.18 - Tailwind CSS PostCSSプラグイン
- `vitest` ^4.1.2 - 単体テストフレームワーク
- `@vitest/ui` ^4.1.2 - Vitest UIツール
- `@vitest/coverage-v8` ^4.1.2 - Vitestカバレッジ（V8プロバイダー）
- `@vitest/coverage-istanbul` ^4.1.2 - Vitestカバレッジ（Istanbulプロバイダー）
- `@testing-library/react` ^16.3.0 - Reactコンポーネントテスト
- `@testing-library/jest-dom` ^6.9.1 - Jest DOMマッチャー
- `@testing-library/user-event` ^14.6.1 - ユーザーイベントシミュレーション
- `jsdom` ^28.0.0 - ブラウザ環境シミュレーション
- `@sentry/react` ^10.32.1 - Sentryエラートラッキング（Frontend）
- `axe-playwright` ^2.2.2 - アクセシビリティ自動テスト
- `storybook` ^10.2.10 - コンポーネントドキュメント・開発環境（Storybook 10.x）
- `@storybook/react` ^10.1.8 - Storybook React統合（10.x系）
- `@storybook/react-vite` ^10.3.5 - Storybook React + Vite統合（10.x系）
- `@storybook/test-runner` ^0.24.2 - Storybookインタラクションテスト
- `rollup-plugin-visualizer` ^6.0.5 - バンドル分析ツール

### 設定ファイル

- `frontend/tsconfig.json` - TypeScript設定（Vite/React専用、Incremental Build有効）
- `frontend/tsconfig.node.json` - TypeScript設定（Vite設定ファイル用、composite: true）
- `frontend/src/vite-env.d.ts` - Vite環境変数型定義
- `frontend/vite.config.ts` - Vite設定（TypeScript版、ベストプラクティス）
- `frontend/vitest.config.ts` - Vitest設定（jsdom環境）
- `frontend/vitest.setup.ts` - Vitestセットアップスクリプト
- `frontend/.storybook/main.ts` - Storybook設定（React-Vite統合）
- `frontend/.storybook/preview.ts` - Storybookグローバルパラメータ
- `frontend/.storybook/test-runner.ts` - Storybook test-runner設定（外部URLモック、決定的テスト結果）
- `frontend/nginx.conf` - nginx設定（本番環境、.mjs MIMEタイプ対応、SPA routing、Gzip圧縮、セキュリティヘッダー）
- `frontend/package.json` - 依存関係管理
- `frontend/.env.example` - 環境変数テンプレート
- `frontend/eslint.config.js` - ESLint設定（Flat Config形式、vitest.config.ts, vite.config.ts除外対応）
- `frontend/.prettierrc` - Prettier設定（フロントエンド用、プロジェクトルートからコピー）
- `.prettierrc` - Prettier設定（プロジェクトルート）
- `frontend/Dockerfile` - 本番環境用Dockerイメージ
- `frontend/Dockerfile.dev` - 開発環境用Dockerイメージ
- `frontend/docker-entrypoint.sh` - Docker起動時の依存関係チェックスクリプト
- `frontend/railway.toml` - Railway デプロイ設定

## バックエンド

### 技術スタック

- **言語**: TypeScript 5.9.3
- **ランタイム**: Node.js 22
- **開発ランタイム**: tsx 4.20.6（TypeScript実行環境）
- **フレームワーク**: Express 5.2.0
- **ORM**: Prisma 7.8.0（PostgreSQL用の型安全なデータアクセス、Driver Adapter Pattern）
- **データベースクライアント**: pg (PostgreSQL) 8.18.0、@prisma/client 7.8.0、@prisma/adapter-pg 7.3.0
- **キャッシュクライアント**: ioredis 5.10.1
- **セキュリティミドルウェア**: helmet 8.1.0、compression 1.8.1、cookie-parser 1.4.7、express-rate-limit 8.2.1
- **メール送信**: nodemailer 7.0.12、handlebars 4.7.8
- **JWT署名**: jose 6.1.3（EdDSA署名）
- **2FA**: otplib 12.0.1（TOTP）、qrcode 1.5.4
- **セキュリティ**: bloom-filters 3.0.4、CSRF保護（カスタム実装：cookie-based double-submit pattern）
- **パスワードハッシュ**: @node-rs/argon2 2.0.2（Rustバインディングによる高性能Argon2実装）
- **PDF生成**: jspdf ^4.1.0（見積書PDF出力）
- **バリデーション**: zod 4.3.6
- **ジョブキュー**: bull 4.16.5
- **パフォーマンス最適化**: dataloader 2.2.3（N+1問題対策）、画像メタデータキャッシング
- **画像処理**: sharp 0.34.5（圧縮・サムネイル生成）、multer 2.0.2（ファイルアップロード）。スマホ写真追加は二段構えで高速化（フロントが送信前に縮小・再エンコード `utils/image-compression` で通信量・サーバ負荷を削減 → サーバ sharp で確定圧縮・サムネイル生成）。アップロード応答に署名付きURL（originalUrl/thumbnailUrl）を含め、フロントは全件再取得せずローカル状態へ追記して即時反映する
- **AI/OCR精度向上**: @anthropic-ai/sdk 0.74.0（Claude Vision APIによる見積書OCR構造化データ抽出）
- **祝日データ**: @holiday-jp/holiday_jp ^2.5.1（日本の祝日判定、工程表エクスポート用）
- **ストレージ抽象化**: StorageProvider インターフェースによる環境別バックエンド切り替え
  - LocalStorageProvider（開発・テスト環境）
  - R2StorageProvider（本番環境、Cloudflare R2）
- **クラウドストレージ**: @aws-sdk/client-s3、@aws-sdk/s3-request-presigner（Cloudflare R2連携）
- **パッケージマネージャ**: npm
- **設定管理**: dotenv (.envファイル)

### 主要な依存関係

- `express` ^5.2.0 - Webフレームワーク
- `cors` ^2.8.5 - CORS ミドルウェア
- `helmet` ^8.1.0 - セキュリティヘッダー設定
- `compression` ^1.8.1 - レスポンス圧縮
- `cookie-parser` ^1.4.7 - Cookieパース
- `@anthropic-ai/sdk` ^0.74.0 - Anthropic Claude Vision API（OCR精度向上）
- `@prisma/client` ^7.8.0 - Prisma ORM クライアント（型安全なデータアクセス）
- `@prisma/adapter-pg` ^7.6.0 - Prisma Driver Adapter for PostgreSQL
- `decimal.js` ^10.6.0 - 高精度10進数計算（数量計算）
- `pg` ^8.18.0 - PostgreSQL クライアント
- `ioredis` ^5.10.1 - Redis クライアント
- `bull` ^4.16.5 - ジョブキュー（非同期処理）
- `nodemailer` ^7.0.12 - メール送信
- `handlebars` ^4.7.8 - テンプレートエンジン
- `dataloader` ^2.2.3 - データローダー（N+1問題対策）
- `jose` ^6.1.3 - JWT EdDSA署名・検証
- `otplib` ^12.0.1 - TOTP 2FA
- `qrcode` ^1.5.4 - QRコード生成
- `bloom-filters` ^3.0.4 - セキュリティ機能強化
- `express-rate-limit` ^8.2.1 - レート制限
- `zod` ^4.3.6 - スキーマバリデーション
- `dotenv` ^17.3.1 - 環境変数管理
- `@sentry/node` ^10.47.0 - Sentryエラートラッキング（Backend）
- `@sentry/profiling-node` ^10.47.0 - Sentryプロファイリング
- `pino` ^10.3.0 - ロガー
- `pino-http` ^11.0.0 - HTTP ロギングミドルウェア
- `pino-pretty` ^13.1.2 - ログの整形出力（開発環境）
- `swagger-jsdoc` ^6.2.8 - JSDocからOpenAPI仕様を生成
- `swagger-ui-express` ^5.0.1 - Swagger UI統合（開発環境）
- `typescript` ^5.9.3 - TypeScriptコンパイラ
- `tsx` ^4.20.6 - TypeScript実行環境
- `@types/express` ^5.0.5 - Express型定義
- `@types/cors` ^2.8.19 - CORS型定義
- `@types/node` ^24.10.1 - Node.js型定義
- `@types/pg` ^8.16.0 - PostgreSQL型定義
- `@types/swagger-jsdoc` ^6.0.4 - swagger-jsdoc型定義
- `@types/swagger-ui-express` ^4.1.8 - swagger-ui-express型定義
- `@typescript-eslint/eslint-plugin` ^8.49.0 - TypeScript ESLintプラグイン
- `@typescript-eslint/parser` ^8.49.0 - TypeScript ESLintパーサー
- `eslint` ^9.39.2 - コード品質チェック（Flat Config形式）
- `prettier` ^3.8.1 - コードフォーマッター
- `husky` ^9.0.11 - Git フックマネージャー
- `lint-staged` ^16.4.0 - ステージングファイルへのリンター実行
- `vitest` ^4.0.6 - 単体テストフレームワーク
- `@vitest/ui` ^4.0.8 - Vitest UIツール
- `@vitest/coverage-v8` ^4.0.18 - Vitestカバレッジ（V8プロバイダー）
- `supertest` ^7.1.4 - APIテストライブラリ
- `@types/supertest` ^6.0.3 - supertest型定義
- `autocannon` ^8.0.0 - 高性能負荷テストツール
- `prisma` ^7.8.0 - Prisma CLI（マイグレーション、スキーマ管理）
- `ts-node` ^10.9.2 - TypeScript実行環境（Prisma用）

### 設定ファイル

- `backend/tsconfig.json` - TypeScript設定（Node.js専用、Incremental Build有効、performance/含む）
- `backend/prisma/schema.prisma` - Prismaスキーマ定義（データモデル、マイグレーション）
- `backend/src/types/express.d.ts` - Express Request拡張型定義（pinoログ追加）
- `backend/src/types/env.d.ts` - 環境変数型定義（型安全なprocess.env）
- `backend/src/utils/logger.ts` - Pinoロガー設定（Railway環境対応）
- `backend/src/generate-swagger.ts` - OpenAPI仕様生成スクリプト
- `backend/docs/api-spec.json` - 生成されたOpenAPI 3.0仕様
- `backend/performance/health-check.perf.ts` - ヘルスチェックAPI負荷テスト
- `backend/performance/autocannon.d.ts` - autocannon型定義ファイル
- `backend/vitest.config.ts` - Vitest設定（Node.js環境）
- `backend/vitest.setup.ts` - Vitestセットアップスクリプト
- `backend/package.json` - 依存関係管理
- `backend/.env.example` - 環境変数テンプレート
- `backend/eslint.config.js` - ESLint設定（Flat Config形式、vitest.config.ts除外対応）
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
- `supertest` ^7.1.4 - HTTPアサーション
- `@vitest/ui` ^4.0.8 - 対話的UIツール
- `@vitest/coverage-v8` ^4.0.18 - カバレッジツール（V8プロバイダー）

**設定ファイル:**
- `backend/vitest.config.ts` - Node.js環境設定、カバレッジ閾値設定
- `backend/vitest.setup.ts` - グローバルセットアップ

**カバレッジ閾値（2025-11-11更新）:**
```typescript
coverage: {
  thresholds: {
    statements: 80,  // 現在: 89.46%
    branches: 80,    // 現在: 80.00% ✅達成
    functions: 80,   // 現在: 93.43%
    lines: 80        // 現在: 89.42%
  }
}
```

**テスト構成:**
- `backend/src/__tests__/` - テストファイル配置
  - `unit/errors/` - エラークラステスト（21テスト）
    - `ApiError.test.ts` - カスタムAPIエラークラスのテスト
  - `unit/middleware/` - ミドルウェアテスト（91テスト）
    - `errorHandler.test.ts` - エラーハンドリングミドルウェア（Zod、Prisma、一般エラー）
    - `httpsRedirect.test.ts` - HTTPS強制リダイレクトとHSTSヘッダー
    - `validate.test.ts` - Zodバリデーションミドルウェア（body/query/params）
    - `authenticate.middleware.test.ts` - JWT認証ミドルウェア（10テスト）
    - `authorize.middleware.test.ts` - 権限チェックミドルウェア（13テスト）
    - `RedisRateLimitStore.test.ts` - Redisレート制限ストア（14テスト、カバレッジ100%）
    - `rateLimit.test.ts` - レート制限ミドルウェア（3テスト）
    - `logger.test.ts` - HTTPロガーミドルウェア（17テスト）
  - `unit/routes/` - ルートテスト（23テスト）
    - `admin.routes.test.ts` - 管理者用ルート（ログレベル動的変更）
    - `jwks.routes.test.ts` - JWKS公開鍵配信エンドポイント（8テスト、カバレッジ100%）
  - `unit/services/` - サービステスト（324テスト）
    - `auth.service.test.ts` - 認証統合サービス（24テスト）
    - `token.service.test.ts` - JWTトークン管理（EdDSA署名、18テスト）
    - `session.service.test.ts` - セッション管理（19テスト）
    - `invitation.service.test.ts` - 招待制登録（16テスト）
    - `password.service.test.ts` - パスワード管理（35テスト）
    - `two-factor.service.test.ts` - 2FA管理（TOTP + バックアップコード）
    - `role.service.test.ts` - ロール管理（23テスト）
    - `permission.service.test.ts` - 権限管理（23テスト）
    - `role-permission.service.test.ts` - ロール権限紐付け（24テスト）
    - `user-role.service.test.ts` - ユーザーロール管理（27テスト）
    - `rbac.service.test.ts` - RBAC統合サービス（21テスト）
    - `audit-log.service.test.ts` - 監査ログ（35テスト）
    - `audit-log-archive.service.test.ts` - ログアーカイブ（6テスト）
    - `email.service.test.ts` - メール送信（Bull非同期キュー、14テスト）
  - `unit/utils/` - ユーティリティテスト（14テスト）
    - `sentry.test.ts` - Sentryユーティリティ（カバレッジ94.11%）
    - `env-validator.test.ts` - 環境変数バリデーション（14テスト）
- `backend/src/app.ts` - テスト用にindex.tsから分離したExpressアプリ

**テスト合計:** 単体テスト167ファイル + 統合テスト31ファイル

**実行方法:**
```bash
npm --prefix backend run test        # 全テスト実行
npm --prefix backend run test:watch  # ウォッチモード
npm --prefix backend run test:ui     # UIモード
npm --prefix backend run test:coverage  # カバレッジレポート（閾値チェック付き）
npm --prefix backend run test:unit   # ユニットテストのみ
npm --prefix backend run test:unit:coverage  # ユニットテストカバレッジ
npm --prefix backend run coverage:check  # カバレッジギャップ検出（0%カバレッジファイル検出）
```

**カバレッジ改善履歴:**
- 2025-11-03: Statements 79.6%→92.64%, Branches 69.5%→86.7%, Functions 76.59%→88.67%, Lines 80.47%→92.83%
- **2025-11-11: Branches 78.79%→80.00% ✅目標達成**（email.service、jwks.routes、auth.service、two-factor.service等のブランチテスト追加）

**型安全性のベストプラクティス:**
- Vitest MockとExpress型の互換性: `as unknown as Type` パターンを使用
- すべての型アサーションに説明コメントを追加
- ZodIssue型対応: `as unknown as ZodIssue` で新バージョンのZod型に対応
- NextFunction型: `vi.fn() as unknown as NextFunction` で適切に型付け
- process.env操作: テスト環境でのみ `eslint-disable` コメント付きで許可

### Frontend単体テスト

**主要な依存関係:**
- `vitest` ^4.1.0 - テストランナー
- `@testing-library/react` ^16.3.0 - Reactコンポーネントテスト
- `@testing-library/jest-dom` ^6.9.1 - DOMマッチャー
- `@testing-library/user-event` ^14.6.1 - ユーザーイベントシミュレーション
- `jsdom` ^28.0.0 - ブラウザ環境エミュレーション
- `@vitest/ui` ^4.1.0 - 対話的UIツール

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
npm --prefix frontend run coverage:check  # カバレッジギャップ検出（0%カバレッジファイル検出）
```

**テストカバレッジ:**
- APIクライアントテスト（client.test.ts）
- Reactコンポーネントテスト（ErrorBoundary.test.tsx、LoginForm.test.tsx、RegisterForm.test.tsx等）
- 認証フローテスト、フォームバリデーションテスト（パスワード複雑性含む）
- 合計: 339テストファイル（包括的なユニットテスト群）

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

- `@playwright/test` ^1.57.0 - E2Eテストフレームワーク
- `typescript` ^5.9.3 - TypeScriptコンパイラ
- `@types/node` ^25.0.3 - Node.js型定義
- `@typescript-eslint/eslint-plugin` ^8.47.0 - TypeScript ESLintプラグイン
- `@typescript-eslint/parser` ^8.48.1 - TypeScript ESLintパーサー
- `@prisma/client` ^7.0.1 - Prisma Client（テストデータ生成、ルートpackage.json経由でbackendと共有）
- `prisma` ^7.1.0 - Prisma CLI（スキーマ管理、ルートpackage.json経由）
- `eslint` ^10.4.1 - ルートワークスペースのコード品質チェック。**注**: frontend/backend は eslint-plugin-react 系の ESLint 10 非互換のため意図的に ESLint 9 系（Flat Config）を維持しており、ルートのみ ESLint 10 系へ追従している
- `cross-env` ^10.1.0 - クロスプラットフォーム環境変数設定
- `exceljs` ^4.4.0 - E2Eでエクスポート済み.xlsxを読み取り検証（内訳書CRUD等のExcel出力アサーション用。生成側はfrontendのxlsx/SheetJS）
- Chromium - Playwright経由で自動インストール

### 設定ファイル

- `tsconfig.json` - TypeScript設定（E2Eテスト用、Incremental Build有効）
- `playwright.config.ts` - Playwright設定（WSL2最適化、タイムスタンプ機能）
- `package.json` - E2Eテスト用依存関係とスクリプト
- `.github/workflows/e2e-tests.yml` - CI/CD E2Eテストワークフロー

### テストカテゴリ

- `e2e/specs/api/` - APIエンドポイントのテスト（ヘルスチェック、JWKS）
- `e2e/specs/ui/` - UIコンポーネントとページのテスト
- `e2e/specs/integration/` - システム統合テスト
- `e2e/specs/auth/` - 認証フローテスト（ログイン、登録、2FA、パスワードリセット、招待）
- `e2e/specs/admin/` - 管理機能テスト（ロール管理、権限管理、RBAC等）
- `e2e/specs/security/` - セキュリティテスト（CSRF、XSS対策等）
- `e2e/specs/navigation/` - ナビゲーションテスト（AppHeader、メニュー表示等）
- `e2e/specs/projects/` - プロジェクト管理テスト（CRUD、ステータス遷移、一覧操作等）
- `e2e/specs/performance/` - パフォーマンステスト（ページロード時間、プロジェクト操作）
- `e2e/helpers/` - テストヘルパー・ユーティリティ
  - `wait-helpers.ts` - CI環境対応の待機ヘルパー（`getTimeout()`パターン）
  - `auth-actions.ts` - 認証アクション（ログイン、ログアウト、2FA）
  - `browser.ts` - Claude Code統合ブラウザ操作
  - `test-users.ts` - テストユーザー定義
  - `screenshot.ts` - スクリーンショットヘルパー

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

### CI環境対応の待機パターン

E2Eテストでは、CI環境での安定性を確保するため、`e2e/helpers/wait-helpers.ts`の待機ヘルパーを使用します。

**主要パターン:**

- **`getTimeout(baseMs)`**: CI環境では自動的にタイムアウトを2倍に延長
- **`waitForPageStable(page)`**: ネットワークアイドルまで待機
- **`waitForAuthState(page)`**: 認証状態確立をリトライ付きで待機
- **`waitForElementWithRetry(page, locator)`**: 要素表示をリトライ付きで待機
- **`waitForApiResponse(page, action, urlPattern)`**: APIレスポンス待機付きアクション実行

**playwright.config.ts のCI対応:**
- タイムアウト: CI環境では2倍に延長（120秒 / 60秒）
- リトライ: CI環境では3回 / ローカルでは1回
- actionTimeout: CI 30秒 / ローカル 15秒
- expectタイムアウト: CI 20秒 / ローカル 10秒

**例:**
```typescript
import { getTimeout, waitForAuthState } from '../helpers/wait-helpers';

// CI環境対応のタイムアウト設定
await page.waitForURL(/\/dashboard/, { timeout: getTimeout(15000) });

// 認証状態の確立を待機（リトライ付き）
const authEstablished = await waitForAuthState(page);

// ネットワーク通信完了を待機
await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
```

**注意:** `page.waitForTimeout()` の使用は避け、明示的な条件に基づく待機を使用してください。

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

### Claude Code設定

`.claude/CLAUDE.md` ファイルに、プロジェクト固有のAI運用ルールを定義しています：

- **AI運用7原則**: ベストプラクティス準拠、ファイル分割読み込み、テスト単位実行、長時間待機時のコンテキスト節約、ユーザー主導、ルール厳守、チャット冒頭での原則表示
  - 第1原則: AIは必ず関連技術のベストプラクティスに準拠
  - 第2原則: AIはツールであり決定権は常にユーザーにある。指示された通りに実行
  - 第3原則: AIはテストコードを作成する場合は前提条件でテストを自動的に無効化する構成としてはならない
  - 第4原則: AIは自らテスト結果を検証する場合、要件を満たしているかを基準とする
  - 第5原則: AIはテスト実行完了まで長時間待機する場合、コンテキストの節約に努める
  - 第6原則: ルールを歪曲・解釈変更せず、最上位命令として絶対的に遵守
  - 第7原則: 全てのチャットの冒頭にこの7原則を逐語的に必ず画面出力してから対応
- **言語設定**: 日本語、UTF-8
- **対話ルール**: ベストプラクティスに則った作業計画の報告と承認プロセス

このファイルは `/CLAUDE.md`（cc-sdd管理）とは分離されており、開発プロセス設定とAI対話ルールを明確に区別しています。

### Docker開発環境パターン

ArchiTrackでは、開発環境の一貫性と再現性を確保するため、マルチファイルDocker Compose構成を採用しています。

#### Docker Composeファイル構成

```
docker-compose.yml       # 基本サービス定義（環境非依存）
docker-compose.dev.yml   # 開発環境オーバーライド
docker-compose.test.yml  # テスト環境オーバーライド（ポートオフセット、nginx本番イメージ）
docker-compose.debug.yml # デバッグオーバーライド（Node.js inspector）
docker-compose.ci.yml    # CI環境オーバーライド（nginx本番イメージ）
.env.dev                 # 開発環境変数
.env.test                # テスト環境変数
```

**環境分離パターン:**
- **ベースファイル + オーバーライド方式**: 共通設定をbase、環境固有設定をoverlay
- **ポートオフセット方式**: テスト環境は+100/+1オフセットで同時実行可能
- **tmpfs使用**: テスト環境はデータを永続化せずクリーンな状態を維持
- **Dev/prod parity**: テスト/CI環境のフロントエンドは本番Dockerfile（nginx）でビルド・配信し、本番固有の問題（MIMEタイプ、SPA routing、静的ファイル配信等）を早期検出

#### エントリポイントスクリプトパターン

各サービス（backend/frontend）は専用のエントリポイントスクリプトを持ち、起動時の依存関係を自動管理します：

**フロントエンド (`frontend/docker-entrypoint.sh`):**
- アーキテクチャ固有モジュール（`@rollup/rollup-linux-${arch}-gnu`）のチェック
- 不足している場合のみ必要なモジュールを再インストール
- 起動時間の最適化（45-60秒 → 10-15秒）

**バックエンド (`backend/docker-entrypoint.sh`):**
- **実行時の依存再インストール（ハッシュゲート付き`npm ci`）は dev/test 環境限定**（`NODE_ENV`で分岐）: dev/testはソースと`node_modules`をボリュームマウントするためホスト側`package*.json`変更の起動時取り込みが必要。本番はDockerfileで`npm ci --omit=dev`し`node_modules`を`node`ユーザー所有で焼き込み済みのため、起動時再インストールは行わずイメージ同梱依存を信頼する
  - **背景**: 本番でハッシュゲートが`npm ci`を起動すると、Railway永続ボリューム上のroot所有`node_modules`を`node`ユーザーが置換できずEACCES（unlink拒否）で失敗→`set -e`によりentrypointがexec前に終了→サーバが待受せずHealthcheck失敗のクラッシュループに陥る。依存bumpで`package-lock.json`が変わった瞬間のみ顕在化していた
- **sharpネイティブバイナリの自己修復**: 上記ハッシュゲートは`node_modules`実体の健全性までは検証しないため、永続ボリューム上の`node_modules`が陳腐化し実行プラットフォーム向けの`libvips`（musl）を欠くとsharpロードが失敗し、ストレージサービス初期化失敗→画像アップロードが503となる。そのため**全環境で**起動毎にロード可否を検証し、不可なら`npm install --no-save sharp`で現在のプラットフォーム向けに再解決して修復する（lockfileは変更しない）。**修復失敗は非致命扱い**とし、修復不能時もアプリ起動を継続する（アプリは`index.ts`でstorage/sharp初期化失敗時も起動継続する設計のため、ここでクラッシュさせるとHealthcheck失敗・クラッシュループの原因になる）

#### npm版固定パターン（ビルド決定性）

全Dockerfile（backend/frontend、build/dev）は`corepack enable npm`で`package.json`の`packageManager`フィールドに宣言したnpmへ固定する：

- **背景**: `node:22-alpine`同梱npm（10.9.7）はoptional依存（`canvas`等）の解決ロジックがnpm版で異なり、別版npmで生成した`package-lock.json`を不整合（EUSAGE）として拒否し`npm ci`が失敗する
- **方針**: lockfileを生成したnpmと同一版をビルドでも使うことで`npm ci`を決定的にする（現在は`npm@11.6.2`を両プロジェクトで固定）
- **適用範囲**: ローカルDocker / CI / Railwayデプロイ全てで同一挙動を保証

#### デバッグサポート

Node.js inspectorモードによるVSCodeデバッグ統合：
- **docker-compose.debug.yml**: `npm run dev:debug`コマンドに切り替え
- **デバッガーポート**: 開発環境9229、テスト環境9230
- **VSCode設定**: `.vscode/launch.json`の"Attach to Docker Backend"設定を使用

#### 初期管理者アカウント

データベースシード時の初期管理者アカウント設定：
- 環境変数で設定可能: `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_DISPLAY_NAME`
- デフォルト値あり、本番環境では必ず変更

#### ヘルスチェック設定

全サービスにヘルスチェックを実装し、依存関係の起動順序を保証：

- **PostgreSQL**: `pg_isready`コマンドで接続可能性を確認
- **Redis**: `redis-cli ping`でサービス状態を確認
- **Backend**: `curl http://localhost:3000/health`でAPIの準備状態を確認
- **Frontend**: 開発環境では`curl http://localhost:5173`でViteサーバーの起動を確認（`start_period: 45s`）、テスト/CI環境では`wget http://127.0.0.1:80`でnginxの起動を確認（`start_period: 10s`）

#### 名前付きボリュームパターン

`node_modules`は名前付きボリュームとしてマウントし、ホストとコンテナ間のパーミッション問題を回避：

```yaml
volumes:
  - ./frontend:/app
  - frontend_node_modules:/app/node_modules
```

#### ホストユーザーパターン

ファイルパーミッション問題回避のため、コンテナはホストユーザーとして実行：
```yaml
user: "${UID:-1000}:${GID:-1000}"
```

### 必須ツール

- **Node.js 22以上**: バックエンド実行環境（engines: >=22.0.0）、フロントエンドはNode.js 20.19.0+または22.12.0+
- **Docker & Docker Compose**: コンテナ化開発環境（コンテナ環境では0.0.0.0でリスンして外部アクセスを許可）
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

ArchiTrackでは、**開発環境**と**テスト環境**を分離した複数ファイル構成を採用しています。

#### 環境構成

| 環境 | 用途 | データベース | ポート（Backend/Frontend/PostgreSQL/Redis） |
|------|------|-------------|-------------------------------------------|
| 開発環境 | 手動テスト・画面打鍵 | architrack_dev | 3000/5173/5432/6379 |
| テスト環境 | 自動テスト（Unit/Integration/E2E） | architrack_test | 3100/5174/5433/6380 |
| CI環境 | GitHub Actions | architrack_test | 3000/5173/5432/6379 |
| デバッグ環境 | VSCodeデバッグ | architrack_dev | 3000/5173/5432/6379 + 9229 |

#### Docker Composeファイル構成

```
docker-compose.yml       # 基本サービス定義（環境非依存）
docker-compose.dev.yml   # 開発環境オーバーライド
docker-compose.test.yml  # テスト環境オーバーライド（ポートオフセット、nginx本番イメージ）
docker-compose.debug.yml # デバッグオーバーライド（Node.js inspector）
docker-compose.ci.yml    # CI環境オーバーライド（nginx本番イメージ）
.env.dev                 # 開発環境変数
.env.test                # テスト環境変数
```

#### 開発環境（画面打鍵用）

```bash
# npm scriptsを使用（推奨）
npm run dev:docker           # 起動（フォアグラウンド）
npm run dev:docker:build     # 再ビルドして起動
npm run dev:docker:down      # 停止
npm run dev:docker:logs      # ログ確認

# 直接コマンドを使用する場合（-p オプションでプロジェクト名を指定）
docker compose -p architrack-dev -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up
docker compose -p architrack-dev -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev down
```

#### テスト環境（自動テスト用）

```bash
# npm scriptsを使用（推奨）
npm run test:docker          # 起動（バックグラウンド）
npm run test:docker:build    # 再ビルドして起動
npm run test:docker:down     # 停止（データ破棄）
npm run test:docker:logs     # ログ確認

# E2Eテスト実行
npm run test:e2e             # テスト実行
npm run test:e2e:headed      # ブラウザ表示モード
npm run test:e2e:ui          # UIモード

# 直接コマンドを使用する場合（-p オプションでプロジェクト名を指定）
docker compose -p architrack-test -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d
docker compose -p architrack-test -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test down -v
```

#### 同時実行（開発＋テスト）

開発環境とテスト環境はポートが分離されているため、同時に起動できます：

```bash
# 開発環境を起動（ポート: 3000, 5173, 5432, 6379）
npm run dev:docker &

# テスト環境を起動（ポート: 3100, 5174, 5433, 6380）
npm run test:docker
```

#### 従来のコマンド（後方互換）

```bash
# 旧: docker-compose up（現在は開発環境として動作）
# 新: npm run dev:docker を推奨

# 特定のサービスのみ起動（開発環境）
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up postgres redis
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

# E2Eテスト実行（cross-envで環境変数設定）
npm run test:e2e  # DISABLE_RATE_LIMIT=true を自動設定

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

### フロントエンド開発ツール

```bash
# Storybook起動（ポート6006）
npm --prefix frontend run storybook

# Storybookビルド（静的サイト生成）
npm --prefix frontend run build-storybook
```

### バックエンド開発ツール

```bash
# OpenAPI仕様生成
npm --prefix backend run docs:generate

# パフォーマンステスト実行
npm --prefix backend run test:perf             # ヘルスチェック
npm --prefix backend run test:perf:login       # ログイン
npm --prefix backend run test:perf:project     # プロジェクトCRUD
npm --prefix backend run test:perf:trading-partner  # 取引先CRUD
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

#### Prisma 7 Driver Adapter Pattern

Prisma 7では、Driver Adapter Patternを採用し、データベース接続を直接管理します:

- **`@prisma/adapter-pg`**: PostgreSQL用のDriver Adapter
- **Prisma Client出力先**: `backend/src/generated/prisma/`
- **接続管理**: `PrismaPg`アダプター経由で`pg`クライアントを使用
- **利点**: より細かい接続制御、コネクションプーリングのカスタマイズ

**スキーマ設定（prisma/schema.prisma）:**
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**クライアント初期化（db.ts）:**
```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

#### Database Seeding

- `backend/prisma/seed.ts` - 開発環境・本番環境用のシードデータ
- Railway デプロイ時に自動実行（`docker-entrypoint.sh`経由）
- シードパターン: デフォルト管理者ユーザー、初期ロール・権限
- 本番環境では`dist/prisma/seed.js`（コンパイル済み）を使用

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

# レート制限（開発・テスト環境専用）
DISABLE_RATE_LIMIT=true  # 本番環境では必ずfalseまたは未設定
```

本番環境では各サービスのRailway内部URLまたは公開URLを指定します。

## ポート設定

### 環境別ポートマップ

| サービス | 開発環境 | テスト環境 | CI環境 | 本番環境 |
|---------|---------|----------|--------|---------|
| Backend | 3000 | 3100 | 3000 | Railway |
| Frontend | 5173 | 5174 | 5173 | Railway |
| PostgreSQL | 5432 | 5433 | 5432 | Railway |
| Redis | 6379 | 6380 | 6379 | Railway |
| Mailhog SMTP | 1025 | 1026 | - | - |
| Mailhog Web | 8025 | 8026 | - | - |
| nginx（本番） | - | - | - | 80/443 |

### 同時実行対応

テスト環境はポートオフセット（+100/+1）を使用しているため、開発環境と同時に起動可能です。

Railway環境では動的に割り当てられるPORTを使用します。

## CI/CD

### GitHub Actions

`.github/workflows/ci.yml` で統合CI/CDパイプラインを定義しています（CDはCIワークフロー内に統合）。

**CIワークフロー（最適化された並列実行）:**

プッシュ・PR時に自動実行されます。

**主要ジョブ:**
1. **lint** - フォーマット・構文チェック（backend/frontend/e2e並列）
   - Matrix strategy活用で並列実行
   - Prettier + ESLint
2. **typecheck** - TypeScript型チェック（backend/frontend/e2e並列）
   - Matrix strategy活用で並列実行
3. **test-unit** - ユニットテスト（backend/frontend並列）
   - Matrix strategy活用で並列実行
   - Codecov連携でカバレッジ自動アップロード
4. **build** - ビルドテスト（backend/frontend並列）
   - Matrix strategy活用で並列実行
   - ビルド成果物をartifactとしてアップロード
5. **test-integration** - 統合・E2Eテスト（順次実行）
   - Docker Composeでサービス起動
   - Backend統合テスト + Playwright E2Eテスト
   - ヘルスチェック待機（最大120秒）
   - 失敗時にスクリーンショット・ビデオをartifactとしてアップロード
6. **security** - セキュリティスキャン（backend/frontend並列）
   - Matrix strategy活用で並列実行
   - npm audit実行
7. **ci-success** - 全ジョブ成功確認ゲート

**ワークフローの特徴:**
- **Matrix Strategy**: 並列実行による高速化
- **Concurrency設定**: 同一ワークフロー内での重複実行を自動キャンセル
- **Codecov連携**: テストカバレッジの自動アップロード・レポート
- **Fail-fast戦略**: 早期ステージでの失敗で即座に終了
- **Shift-Left原則**: 問題を早期発見し、品質を保証
- **再現可能なビルド**: `npm ci` による依存関係インストール

**CDワークフロー（Railway デプロイメント）:**

CI成功後、CIワークフロー内でデプロイジョブが実行されます（統合パイプライン構成）。

**主要ステップ:**
1. **Railway CLI セットアップ**: Railway環境へのデプロイ準備
2. **デプロイ実行**: staging/production環境へのデプロイ
   - Backend: Prisma Client自動生成（`npm run build`内で実行）
   - Backend: マイグレーション自動適用（Railway環境でデプロイ時に実行）
   - Backend: 0.0.0.0でリスンしてコンテナ環境の外部アクセスを許可
3. **ヘルスチェック**: デプロイ後のサービス状態確認
   - 最大10回リトライ（30秒間隔）
   - /healthエンドポイントで確認（HTTPS対応）
   - Railway環境ではHTTPSリダイレクトが有効化（CORS preflight対応を改善）
4. **GitHub Environment統合**: デプロイ履歴の記録
   - 環境URL設定（シークレット警告対策済み）
5. **エラーハンドリング**: CI失敗/キャンセル時のCD自動スキップ
   - CIステータスをチェックし、失敗時はCDを実行しない
   - ciワークフロー内にデプロイジョブを統合し、ci完了後にcdを自動実行

**デプロイ環境:**
- **Backend Service**: `backend/` ディレクトリから自動ビルド・デプロイ
  - Prisma Client自動生成（ビルド時）
  - マイグレーション自動適用（デプロイ時）
  - HTTPS強制リダイレクト有効（本番環境）
- **Frontend Service**: `frontend/` ディレクトリからnginx本番イメージをビルド・デプロイ（テスト/CI環境でも同一Dockerfileを使用し、Dev/prod parityを確保）
- **PostgreSQL**: RailwayマネージドPostgreSQL 15
- **Redis**: RailwayマネージドRedis 7

各サービスの環境変数はRailway UIまたは `railway.toml` で管理します。

### Dependabot 自動依存関係管理

`.github/dependabot.yml` と `.github/workflows/dependabot-automerge.yml` で自動依存関係更新を実装しています。

**監視対象エコシステム（5つ、計85依存関係）:**
1. **NPM Root** - E2Eテスト（7依存関係）
2. **NPM Backend** - バックエンドAPI（42依存関係）
3. **NPM Frontend** - フロントエンドUI（36依存関係）
4. **GitHub Actions** - ワークフロー（5 actions）
5. **Docker** - ベースイメージ（2 images）

**更新スケジュール:**
- 週次月曜 09:00-10:00 UTC（各エコシステムで時間差）
- 最大5件のPRまで同時作成

**自動マージ戦略:**
- **minor/patchアップデート**: CI成功後に自動マージ
- **majorアップデート**: 手動レビュー必須
- SemVerベースの判断で安全性を確保

**セキュリティ統合:**
- GitHub Advisory Databaseとの連携
- セキュリティ脆弱性の優先的な更新

## 開発ガイドライン

### README.mdドキュメント

プロジェクトの包括的なドキュメントとして、以下を含むREADME.mdを整備しています：

- **プロジェクトバッジ**: CI/CD、Codecov、ライセンスバッジ
- **目次**: 全セクションへのクイックアクセス
- **アーキテクチャ図**: システム構成、データフロー、セキュリティ層の視覚化
- **テスト戦略**: テストピラミッドと各レベルのテスト説明
- **コントリビューションガイド**: 10ステップの貢献フロー、コーディング規約、PR基準

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

### コントリビューションワークフロー

10ステップの包括的な貢献フローを定義しています：

1. **Issue作成**: 機能提案・バグ報告を明確に記述
2. **フォーク**: 自分のGitHubアカウントにリポジトリをフォーク
3. **ブランチ作成**: 機能ブランチを作成（例: `feature/new-feature`）
4. **セットアップ**: ローカル開発環境をDocker Composeで構築
5. **実装**: コーディング規約に従って実装
6. **品質チェック**: Lint、Format、Type Check、Testを実行
7. **コミット**: Conventional Commitsに従ってコミット
8. **プッシュ**: フォークしたリポジトリにプッシュ
9. **PR作成**: 変更内容を明確に説明したPRを作成
10. **レビュー対応**: フィードバックに基づいて修正

### PRレビュー基準

以下の基準を満たすPRを受け入れます：

- ✅ すべてのCI/CDチェックがパス
- ✅ テストカバレッジが80%以上を維持
- ✅ Conventional Commitsに準拠
- ✅ コードレビューで承認
- ✅ コンフリクトが解消されている
- ✅ ドキュメントが適切に更新されている

### コード品質管理

ArchiTrackでは、3段階のGit hooksにより品質を自動保証しています。

#### ES Module Validation

- `validate:esm` - 包括的なES Moduleバリデーションスクリプト
- 全importで`.js`拡張子の使用を検証（ES module要件）
- ビルドプロセスの一部として実行
- ランタイムモジュール解決エラーを事前に防止

```bash
# Backend ESM検証
npm --prefix backend run validate:esm

# Frontend ESM検証
npm --prefix frontend run validate:esm
```

#### Pre-commitフック（`.husky/pre-commit` + `scripts/pre-commit.sh`）

**ラッパー構造**: `pre-commit`（sh）→ `scripts/pre-commit.sh`（bash）の2層構造。

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

#### Pre-pushフック（`.husky/pre-push` + `scripts/pre-push.sh`）

**ラッパー構造**: `pre-push`（sh）→ `scripts/pre-push.sh`（bash）の2層構造でpipefail等を使用。

プッシュ前に自動的に以下が実行されます：

0. **Docker環境自動構築**: テスト環境（architrack-test）自動起動
1. **Formatチェック（Backend/Frontend/E2E）**: Prettierによるコードフォーマット検証
2. **型チェック（Backend/Frontend/E2E）**: TypeScript型エラーの検出
3. **Lintチェック（Backend/Frontend/E2E）**: ESLintによるコード品質検証
4. **ビルド（Backend/Frontend）**: 本番環境ビルドの成功確認 + ES Module検証
5. **セキュリティ監査**: `scripts/security-audit.mjs`（本番依存high以上でブロック）
6. **Backend単体テスト（カバレッジチェック）**: カバレッジ閾値80%
7. **Frontend単体テスト（カバレッジチェック）**: カバレッジ閾値80%
8. **Storybookテスト**: インタラクションテスト + アクセシビリティ + カバレッジ80%
9. **Backend統合テスト**: Docker環境（architrack-test）内で実行
10. **要件カバレッジチェック**: E2E対象の受入基準100%確認
11. **CI環境変数整合性チェック**: pre-pushとCIの設定一致確認
12. **コンテナ再起動**: E2E前のメモリリフレッシュ
13. **E2Eテスト実行**: `CI=true npx playwright test`

型エラー、テスト失敗、カバレッジ不足がある場合、プッシュは中断されます。

**テスト実行順序の理由:**
- Format/Lint/型チェック（超高速）→ ビルド（高速）→ セキュリティ監査 → 単体テスト（高速）→ Storybook → 統合テスト（中速）→ E2Eテスト（低速）の順で実行
- **Fail-fast戦略**: 早期ステージでの失敗で即座に中断（無駄なリソース消費を回避）
- **Shift-Left原則**: 問題を早期発見し、プッシュ前に品質を保証
- **Defense in Depth戦略**: 複数レイヤーでの品質保証（Format → Lint → Type → Build → Security → Unit → Storybook → Integration → E2E）

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
