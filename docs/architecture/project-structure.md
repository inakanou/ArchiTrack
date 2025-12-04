# プロジェクト構造

このドキュメントでは、ArchiTrackプロジェクトのディレクトリ構造とファイル構成について説明します。

---

## ディレクトリ構造概要

```
ArchiTrack/
├── frontend/                  # React/Viteフロントエンド
├── backend/                   # Node.js/Expressバックエンド
├── e2e/                       # E2Eテスト（Playwright）
├── docs/                      # ドキュメント
│   ├── getting-started/       # 初めての人向け
│   ├── development/           # 開発者向け
│   ├── deployment/            # デプロイ担当者向け
│   ├── architecture/          # 技術者・レビュワー向け
│   ├── api/                   # API利用者向け
│   └── contributing/          # コントリビューター向け
├── .kiro/                     # Kiro-style SDD
├── .claude/                   # Claude Code設定
├── .github/                   # CI/CD（GitHub Actions）
├── .husky/                    # Git hooks
├── scripts/                   # ユーティリティスクリプト
├── docker-compose.yml         # Docker Compose ベース設定
├── docker-compose.dev.yml     # 開発環境オーバーライド
├── docker-compose.test.yml    # テスト環境オーバーライド
├── docker-compose.debug.yml   # デバッグ環境オーバーライド
├── docker-compose.ci.yml      # CI環境オーバーライド
├── .env.dev                   # 開発環境変数
└── .env.test                  # テスト環境変数
```

---

## トップレベルディレクトリ

### `frontend/` - フロントエンドアプリケーション

React 19 + Vite 7によるモダンなシングルページアプリケーション。

```
frontend/
├── src/
│   ├── components/        # Reactコンポーネント
│   ├── pages/             # ページコンポーネント
│   ├── hooks/             # カスタムフック
│   ├── utils/             # ユーティリティ関数
│   ├── services/          # APIクライアント
│   ├── contexts/          # Reactコンテキスト
│   ├── types/             # TypeScript型定義
│   ├── App.tsx            # ルートコンポーネント
│   └── main.tsx           # エントリーポイント
├── public/                # 静的ファイル
├── .storybook/            # Storybook 10設定
├── __tests__/             # ユニットテスト
├── vite.config.ts         # Vite設定
└── package.json
```

**主要技術:**
- React 19（UI）
- Vite 7（ビルドツール）
- React Router 7（ルーティング）
- TypeScript 5.9（型安全性）
- Vitest 4（テスト）
- Storybook 10（コンポーネントカタログ）

### `backend/` - バックエンドAPI

Node.js 22 + Express 5によるRESTful APIサーバー。

```
backend/
├── src/
│   ├── config/            # アプリケーション設定
│   ├── services/          # ビジネスロジック
│   ├── middleware/        # Express ミドルウェア
│   ├── routes/            # ルート定義
│   ├── errors/            # カスタムエラー定義
│   ├── types/             # TypeScript型定義
│   ├── utils/             # ユーティリティ関数
│   ├── generated/         # 生成されたコード
│   │   └── prisma/        # Prisma Client出力先（Prisma 7）
│   ├── __tests__/         # テスト
│   │   ├── unit/          # ユニットテスト
│   │   └── integration/   # 統合テスト
│   ├── app.ts             # Expressアプリケーション
│   ├── index.ts           # サーバーエントリーポイント
│   ├── db.ts              # Prisma Client（Driver Adapter Pattern）
│   └── redis.ts           # Redis接続管理
├── prisma/
│   ├── schema.prisma      # データベーススキーマ
│   ├── migrations/        # マイグレーションファイル
│   └── seed.ts            # シードデータ
├── performance/           # パフォーマンステスト
├── dist/                  # ビルド出力（生成）
└── package.json
```

**主要技術:**
- Node.js 22（ランタイム）
- Express 5（Webフレームワーク）
- Prisma 7（ORM、Driver Adapter Pattern）
- PostgreSQL 15（データベース）
- Redis 7（キャッシュ/セッション）
- Vitest 4（テスト）

**Prisma 7 Driver Adapter Pattern:**
```typescript
// db.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

**レイヤードアーキテクチャ:**
```
Routes → Services → Prisma Client → Database
```

### `e2e/` - E2Eテスト

Playwrightによるブラウザベースのエンドツーエンドテスト。

```
e2e/
├── tests/                 # テストファイル
│   ├── auth/              # 認証関連テスト
│   ├── admin/             # 管理者機能テスト
│   └── ...
├── fixtures/              # テストフィクスチャ
├── helpers/               # ヘルパー関数
├── playwright.config.ts   # Playwright設定
└── package.json
```

**テスト戦略:**
- ユーザーシナリオベース
- クリティカルパスの自動化
- CI/CDパイプライン統合
- 並列実行によるパフォーマンス最適化

### `docs/` - ドキュメント

プロジェクトの包括的なドキュメント。対象読者ごとに整理。

```
docs/
├── getting-started/       # 初めての人向け
│   ├── prerequisites.md   # 前提条件
│   ├── installation.md    # インストール
│   └── quick-start.md     # クイックスタート
├── development/           # 開発者向け
│   ├── workflow.md        # 開発ワークフロー
│   ├── testing.md         # テスト戦略
│   ├── coding-standards.md # コーディング規約
│   └── ...
├── deployment/            # デプロイ担当者向け
│   ├── overview.md        # デプロイ概要
│   ├── railway-setup.md   # Railway設定
│   └── ...
├── architecture/          # 技術者・レビュワー向け
│   ├── system-overview.md # システム概要
│   ├── security-design.md # セキュリティ設計
│   ├── tech-stack.md      # 技術スタック
│   └── project-structure.md # このドキュメント
├── api/                   # API利用者向け
│   ├── overview.md        # API概要
│   ├── authentication.md  # 認証API
│   └── ...
├── contributing/          # コントリビューター向け
│   ├── guide.md           # コントリビューションガイド
│   └── commit-conventions.md # コミット規約
└── features.md            # 機能一覧
```

### `.kiro/` - Kiro-style Spec-Driven Development

AI支援開発のためのスペック管理。

```
.kiro/
├── steering/              # プロジェクト全体のコンテキスト
│   ├── product.md         # プロダクト定義
│   ├── tech.md            # 技術標準
│   └── structure.md       # プロジェクト構造
└── specs/                 # 機能ごとのスペック
    ├── user-authentication/
    │   ├── spec.json      # スペックメタデータ
    │   ├── requirements.md # 要件定義
    │   ├── design.md      # 技術設計
    │   ├── tasks.md       # 実装タスク
    │   └── validation/    # 検証レポート
    └── ...
```

**ワークフロー:**
1. Requirements（要件定義）
2. Design（技術設計）
3. Tasks（タスク分解）
4. Implementation（実装）

### `.claude/` - Claude Code設定

Claude Codeのプロジェクト固有設定。

```
.claude/
├── CLAUDE.md              # AI運用6原則
└── commands/              # カスタムスラッシュコマンド
```

### `.github/` - CI/CD

GitHub ActionsによるCI/CDパイプライン。

```
.github/
├── workflows/
│   ├── ci.yml             # 継続的インテグレーション
│   └── cd.yml             # 継続的デプロイメント
└── dependabot.yml         # 依存関係自動更新
```

**CIワークフロー:**
1. Lint & Format チェック
2. 型チェック
3. ユニットテスト
4. 統合テスト
5. E2Eテスト
6. ビルド検証

**CDワークフロー:**
1. Railwayへの自動デプロイ（mainブランチ）
2. 環境変数検証
3. データベースマイグレーション
4. ヘルスチェック

### `.husky/` - Git Hooks

Git操作時の自動チェック。

```
.husky/
├── pre-commit             # コミット前チェック
├── commit-msg             # コミットメッセージ検証
├── pre-push               # プッシュ前チェック
└── scripts/
    └── pre-push.sh        # プッシュ前チェックスクリプト
```

**pre-commit（高速）:**
- lint-staged（変更ファイルのみ）
- 型チェック

**pre-push（包括的）:**
- フォーマットチェック
- 型チェック（全体）
- Lint（全体）
- ビルド
- ユニットテスト（カバレッジ）
- 統合テスト
- E2Eテスト
- セキュリティスキャン

### `scripts/` - ユーティリティスクリプト

プロジェクト管理用のシェルスクリプト。

```
scripts/
├── setup-local-env.sh     # ローカル環境セットアップ
└── ...
```

---

## 設定ファイル

### ルートレベル

| ファイル | 説明 |
|---------|------|
| `docker-compose.yml` | Docker Composeベース設定（サービス定義） |
| `docker-compose.dev.yml` | 開発環境オーバーライド（ポート: 3000, 5173） |
| `docker-compose.test.yml` | テスト環境オーバーライド（ポート: 3100, 5174、データ揮発） |
| `docker-compose.debug.yml` | デバッグ環境オーバーライド（Node.js inspector有効） |
| `docker-compose.ci.yml` | CI環境オーバーライド（GitHub Actions用、データ揮発） |
| `.env.dev` | 開発環境変数（Git管理外） |
| `.env.test` | テスト環境変数（Git管理外） |
| `.gitignore` | Git除外設定 |
| `package.json` | ルートパッケージ設定（E2Eテスト） |
| `README.md` | プロジェクトREADME |

### Docker Compose構成

ArchiTrackでは、用途別に複数のDocker Compose構成を用意しています：

```bash
# 開発環境
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d

# テスト環境（開発環境と同時実行可能）
docker compose -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d

# デバッグ環境（Node.js inspector有効）
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.debug.yml --env-file .env.dev up -d

# CI環境
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
```

**環境別ポート:**

| サービス | 開発環境 | テスト環境 | CI環境 |
|---------|---------|----------|--------|
| PostgreSQL | 5432 | 5433 | 5432 |
| Redis | 6379 | 6380 | 6379 |
| Mailhog SMTP | 1025 | 1026 | 1025 |
| Mailhog UI | 8025 | 8026 | 8025 |
| Backend | 3000 | 3100 | 3000 |
| Backend Debug | 9229 | 9230 | - |
| Frontend | 5173 | 5174 | 5173 |

### Backend

| ファイル | 説明 |
|---------|------|
| `backend/tsconfig.json` | TypeScript設定 |
| `backend/vitest.config.ts` | Vitest設定 |
| `backend/.env.example` | バックエンド環境変数テンプレート |
| `backend/prisma/schema.prisma` | Prismaスキーマ |

### Frontend

| ファイル | 説明 |
|---------|------|
| `frontend/tsconfig.json` | TypeScript設定 |
| `frontend/vite.config.ts` | Vite設定 |
| `frontend/vitest.config.ts` | Vitest設定 |
| `frontend/.storybook/main.ts` | Storybook設定 |
| `frontend/.env.example` | フロントエンド環境変数テンプレート |

### E2E

| ファイル | 説明 |
|---------|------|
| `e2e/playwright.config.ts` | Playwright設定 |

---

## ビルド出力とアーティファクト

以下のディレクトリは`.gitignore`で除外されています：

| ディレクトリ | 説明 |
|-------------|------|
| `backend/dist/` | TypeScriptコンパイル出力 |
| `frontend/dist/` | Viteビルド出力 |
| `frontend/storybook-static/` | Storybookビルド出力 |
| `node_modules/` | npm依存関係 |
| `coverage/` | テストカバレッジレポート |
| `playwright-report/` | Playwright HTMLレポート |
| `test-results/` | テスト結果（スクリーンショット、ビデオ） |
| `.logs/` | ログファイル |

---

## 関連ドキュメント

- [開発ワークフロー](../development/workflow.md) - Kiro-style SDD詳細
- [テスト](../development/testing.md) - テスト戦略とディレクトリ構成
- [コーディング規約](../development/coding-standards.md) - ファイル命名規則
- [システム構成](system-overview.md) - アーキテクチャ概要
