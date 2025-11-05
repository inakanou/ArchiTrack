<div align="center">

# ArchiTrack

**アーキテクチャ決定記録（ADR）管理システム**

[![CI](https://github.com/your-org/ArchiTrack/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ArchiTrack/actions/workflows/ci.yml)
[![CD](https://github.com/your-org/ArchiTrack/actions/workflows/cd.yml/badge.svg)](https://github.com/your-org/ArchiTrack/actions/workflows/cd.yml)
[![codecov](https://codecov.io/gh/your-org/ArchiTrack/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/ArchiTrack)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [日本語](README.ja.md)

</div>

---

## 📋 目次

- [概要](#概要)
- [主な機能](#主な機能)
- [技術スタック](#技術スタック)
- [プロジェクト構成](#プロジェクト構成)
- [アーキテクチャ](#アーキテクチャ)
- [セットアップ](#ローカル開発環境のセットアップ)
- [開発ワークフロー](#開発ワークフロー)
- [テスト](#e2eテストplaywright)
- [デプロイ](#railwayへのデプロイ)
- [コントリビューション](#コントリビューション)
- [ライセンス](#ライセンス)

---

## 概要

ArchiTrackは、ソフトウェアプロジェクトにおけるアーキテクチャ決定記録（ADR: Architecture Decision Record）を効率的に管理するためのWebアプリケーションです。

### 主な特徴

- 🤖 **AI支援開発**: Claude Codeによる体系的な開発ワークフロー
- 📝 **スペック駆動**: 要件定義 → 設計 → タスク分解 → 実装の明確なフェーズ管理
- ⚡ **高速**: Vite + React 18によるモダンなフロントエンド
- 🔒 **セキュア**: Helmet、CORS、Rate Limitingによる多層防御
- 🐳 **コンテナ化**: Dockerによる一貫した開発・本番環境
- 🧪 **高品質**: 80%以上のテストカバレッジ要件
- 🚀 **自動デプロイ**: GitHub ActionsによるCI/CDパイプライン

---

## 主な機能

### 現在実装済み

- ✅ ヘルスチェックAPI
- ✅ Swagger/OpenAPI仕様書自動生成
- ✅ PostgreSQLデータベース統合
- ✅ Redisキャッシング準備
- ✅ Sentry統合（エラー監視）
- ✅ E2Eテスト環境（Playwright）

### 開発予定

- 🚧 ADR作成・編集・削除
- 🚧 ADRバージョン管理
- 🚧 ユーザー認証・認可
- 🚧 チーム管理機能
- 🚧 ADR検索・フィルタリング
- 🚧 Markdown エディタ
- 🚧 ADRテンプレート管理

---

## 開発アプローチ

このプロジェクトは **Claude Code** を活用した **Kiro-style Spec Driven Development（スペック駆動開発）** で開発されています。

### 主な特徴

- **AI支援開発**: Claude Codeによる体系的な開発ワークフロー
- **スペック駆動**: 要件定義 → 設計 → タスク分解 → 実装の明確なフェーズ管理
- **カスタムコマンド**: `/kiro:spec-init`, `/kiro:spec-requirements` などの開発支援コマンド
- **コンテナ化**: Dockerによる一貫した開発・本番環境

## 技術スタック

- **Frontend**: React 18 + Vite 5
- **Backend**: Node.js 20 + Express
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Development**: Docker & Docker Compose
- **E2E Testing**: Playwright + Chromium
- **AI Tool**: Claude Code
- **Deployment**: Railway (Railpack)

## プロジェクト構成

```
ArchiTrack/
├── frontend/              # React/Viteフロントエンド
│   ├── src/
│   │   ├── components/   # Reactコンポーネント
│   │   ├── api/          # APIクライアント
│   │   ├── utils/        # ユーティリティ関数
│   │   └── __tests__/    # テスト（Unit/Integration）
│   ├── Dockerfile        # 本番用（nginx）
│   ├── Dockerfile.dev    # 開発用
│   └── railway.toml      # Railway設定
├── backend/              # Node.js/Expressバックエンド
│   ├── src/
│   │   ├── routes/      # APIルート
│   │   ├── middleware/  # ミドルウェア
│   │   ├── config/      # 設定
│   │   ├── errors/      # エラーハンドリング
│   │   ├── utils/       # ユーティリティ
│   │   └── __tests__/   # テスト（Unit/Integration）
│   ├── prisma/
│   │   ├── schema.prisma    # データベーススキーマ
│   │   └── migrations/      # マイグレーションファイル
│   ├── Dockerfile.dev   # 開発用
│   └── railway.toml     # Railway設定
├── e2e/                 # E2Eテスト（Playwright）
│   ├── specs/
│   │   ├── api/         # APIテスト
│   │   ├── ui/          # UIテスト
│   │   └── integration/ # 統合テスト
│   └── helpers/         # ヘルパー関数
├── .kiro/               # Kiro-style SDD
│   ├── steering/        # ステアリングドキュメント
│   └── specs/           # 仕様管理
├── .claude/             # Claude Code設定
│   └── commands/        # カスタムコマンド
├── .github/
│   └── workflows/       # CI/CD（GitHub Actions）
├── .husky/              # Git hooks
├── docker-compose.yml   # ローカル開発環境
└── playwright.config.js # Playwright設定
```

---

## アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                         クライアント                              │
│                      (ブラウザ/モバイル)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                      Railway (Production)                        │
│  ┌──────────────────┐              ┌─────────────────────┐     │
│  │   Frontend       │              │   Backend API       │     │
│  │   (Nginx/React)  │──────────────│   (Node.js/Express) │     │
│  │   Port: 443      │   API calls  │   Port: 3000        │     │
│  └──────────────────┘              └──────────┬──────────┘     │
│                                                │                 │
│                                    ┌───────────┴─────────┐      │
│                                    │                     │      │
│                          ┌─────────▼──────┐   ┌─────────▼─────┐│
│                          │  PostgreSQL 15 │   │   Redis 7     ││
│                          │  (Database)    │   │   (Cache)     ││
│                          └────────────────┘   └───────────────┘│
└─────────────────────────────────────────────────────────────────┘

                        ローカル開発環境 (Docker Compose)
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐              ┌─────────────────────┐     │
│  │   Frontend       │              │   Backend API       │     │
│  │   (Vite HMR)     │──────────────│   (tsx watch)       │     │
│  │   Port: 5173     │              │   Port: 3000        │     │
│  └──────────────────┘              └──────────┬──────────┘     │
│                                                │                 │
│                                    ┌───────────┴─────────┐      │
│                                    │                     │      │
│                          ┌─────────▼──────┐   ┌─────────▼─────┐│
│                          │  PostgreSQL 15 │   │   Redis 7     ││
│                          │  (Docker)      │   │   (Docker)    ││
│                          └────────────────┘   └───────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### データフロー

```
1. クライアントリクエスト
   ↓
2. Nginx/Viteでルーティング
   ↓
3. バックエンドAPI (Express)
   ↓
4. ミドルウェアチェーン
   - CORS検証
   - Rate Limiting (Redis)
   - 認証/認可 (JWT - 実装予定)
   - リクエスト検証 (Zod)
   ↓
5. ビジネスロジック
   ↓
6. データベースアクセス (Prisma)
   - PostgreSQL (永続化)
   - Redis (キャッシング)
   ↓
7. レスポンス生成
   ↓
8. クライアントに返却
```

### セキュリティ層

```
┌─────────────────────────────────────────────┐
│ Application Layer                           │
│ - Helmet (セキュリティヘッダー)              │
│ - CORS (オリジン制限)                        │
│ - Rate Limiting (DDoS対策)                  │
│ - Input Validation (Zod)                    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Transport Layer                             │
│ - HTTPS強制 (本番環境)                      │
│ - HSTS ヘッダー                             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Infrastructure Layer                        │
│ - Railway (プラットフォームセキュリティ)     │
│ - PostgreSQL (接続暗号化)                   │
│ - Redis (接続暗号化)                        │
└─────────────────────────────────────────────┘
```

## ローカル開発環境のセットアップ

### 前提条件

このプロジェクトの開発には以下のツールが必要です：

#### 必須ツール

- **Node.js 20以上** - フロントエンド・バックエンドの実行環境
- **Docker & Docker Compose** - コンテナ化された開発環境（PostgreSQL、Redis、アプリケーション）
- **Claude Code** - AI支援開発環境（推奨）
- **jq** - JSONパーサー（Claude Codeのカスタムフック実行に必要）
- **Chromium（システム依存関係）** - E2Eテスト（Playwright）の実行に必要

#### Claude Code関連ツール

- **cc-sdd (Claude Code Spec Driven Development)**
  ```bash
  # 最新版のインストール・更新
  npx cc-sdd@latest --lang ja
  ```

  このツールにより、Kiro-style開発ワークフローのスラッシュコマンドが利用可能になります。

#### jqのインストール

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows (Chocolatey)
choco install jq

# Windows (Scoop)
scoop install jq
```

#### Chromium（E2Eテスト用）のインストール

E2Eテストを実行するには、Playwrightブラウザとシステム依存関係のインストールが必要です：

```bash
# 1. プロジェクトルートで依存関係をインストール
cd ArchiTrack
npm install
# ↑ postinstallフックでPlaywright Chromiumが自動インストールされます

# 2. システム依存関係をインストール（初回のみ）
# WSL2/Linux環境の場合
sudo npx playwright install-deps chromium

# macOS/Windowsの場合
# 通常は不要（Playwrightが自動的に必要な依存関係を管理）
```

**注意事項:**
- システム依存関係のインストールは、環境ごとに初回のみ実行すれば以降は不要です
- E2Eテストを実行しない場合は、このステップをスキップできます

### 開発環境の特徴

- **Dockerベース**: すべてのサービス（PostgreSQL、Redis、Frontend、Backend）をコンテナで実行
- **Claude Code統合**: カスタムスラッシュコマンドとフックによる開発支援
- **自動コード品質管理**: Git pre-commitフックによるPrettier + ESLint自動実行

### 手順1: Docker Composeでの起動

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd ArchiTrack

# 2. Git hooksを有効化（開発者向け）
git config core.hooksPath .husky

# 3. 環境変数ファイルをコピー
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Docker Composeで起動
docker-compose up

# アクセス先
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# Health Check: http://localhost:3000/health
```

### Git Hooksについて

このプロジェクトではコミット前に自動的にコード品質チェックを実行するGit hooksを使用しています。

**セットアップ:**
```bash
git config core.hooksPath .husky
```

これにより、コミット時に変更されたファイルに対して以下が自動実行されます：
- **Prettier**: コードフォーマット
- **ESLint**: コード品質チェックと自動修正

### Claude Codeによる開発

このプロジェクトはClaude Codeを使った開発を前提としています。

**利用可能なカスタムコマンド:**
```bash
# ステアリングドキュメント管理
/kiro:steering

# 新機能の仕様初期化
/kiro:spec-init [詳細な説明]

# 要件定義生成
/kiro:spec-requirements [feature-name]

# 技術設計作成
/kiro:spec-design [feature-name]

# 実装タスク生成
/kiro:spec-tasks [feature-name]

# 仕様の進捗確認
/kiro:spec-status [feature-name]
```

詳細は `CLAUDE.md` および `.claude/commands/kiro/` を参照してください。

### 手順2: ローカルでNode.js直接実行

#### PostgreSQLとRedisを起動

```bash
docker-compose up postgres redis
```

#### Backendを起動

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

#### Frontendを起動

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## API エンドポイント

### ヘルスチェック

```bash
GET /health

# レスポンス
{
  "status": "ok",
  "timestamp": "2025-10-30T00:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### API情報

```bash
GET /api

# レスポンス
{
  "message": "ArchiTrack API",
  "version": "1.0.0"
}
```

## Railwayへのデプロイ

このプロジェクトは**GitHub Actionsによる自動デプロイ**を使用しています。
mainブランチへのpush/マージで自動的にRailwayにデプロイされます。

### デプロイ方式

- **自動デプロイ**: GitHub Actions（CD workflow）がRailway CLIを使用してデプロイ
- **手動デプロイ**: GitHub Actionsから手動実行可能

### 初回セットアップ

#### 1. Railwayプロジェクトの作成

1. https://railway.app にログイン
2. 新しいプロジェクトを作成
3. 以下のサービスを追加：
   - **PostgreSQL** - Railwayテンプレートから作成
   - **Redis** - Railwayテンプレートから作成
   - **Backend** - Empty Serviceとして作成
   - **Frontend** - Empty Serviceとして作成

#### 2. Railway設定

各サービス（Backend/Frontend）の設定：

**Backend Service:**
- Root Directory: `/backend`
- Build Command: Dockerfileから自動検出
- 環境変数:
  ```
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  REDIS_URL=${{Redis.REDIS_URL}}
  NODE_ENV=production
  FRONTEND_URL=https://your-frontend.railway.app
  PORT=3000
  ```

**Frontend Service:**
- Root Directory: `/frontend`
- Build Command: Dockerfileから自動検出
- 環境変数:
  ```
  VITE_API_URL=https://your-backend.railway.app
  ```

**重要:** Railway UIで「Watch Paths」を空にするか、各サービスの自動デプロイを無効化してください
（GitHub Actionsから制御するため、railway.tomlに`watchPatterns = []`が設定されています）

#### 3. GitHub Secretsの設定

リポジトリの Settings > Secrets and variables > Actions に以下を追加：

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_TOKEN` | Railway APIトークン | Railway Dashboard > Account Settings > Tokens |
| `RAILWAY_PROJECT_ID` | プロジェクトID | `railway status --json \| jq -r '.project.id'` |
| `RAILWAY_BACKEND_SERVICE_ID` | BackendサービスID | `railway status --json \| jq -r '.services[] \| select(.name=="backend") \| .id'` |
| `RAILWAY_FRONTEND_SERVICE_ID` | FrontendサービスID | `railway status --json \| jq -r '.services[] \| select(.name=="frontend") \| .id'` |
| `PRODUCTION_BACKEND_URL` | BackendのURL | Railway Dashboard で確認 |
| `PRODUCTION_FRONTEND_URL` | FrontendのURL | Railway Dashboard で確認 |

**Railway CLIでID取得:**
```bash
# Railway CLIをインストール
npm i -g @railway/cli

# ログイン
railway login

# プロジェクトにリンク
cd /path/to/ArchiTrack
railway link

# プロジェクトIDとサービスID取得
railway status --json
```

### デプロイフロー

```bash
# 1. 開発ブランチで作業
git checkout -b feature/new-feature

# 2. 変更をコミット
git add .
git commit -m "feat: 新機能を追加"

# 3. PRを作成
git push origin feature/new-feature
gh pr create

# 4. CIが自動実行（テスト・ビルド確認）

# 5. PRをマージ
gh pr merge --squash

# 6. CDが自動実行（Railwayへデプロイ）
# - Railway CLIでBackend/Frontendを順次デプロイ
# - ヘルスチェック実行
# - 結果通知
```

### 手動デプロイ（緊急時）

GitHub Actionsから手動実行：

1. GitHub リポジトリの Actions タブを開く
2. "CD" workflowを選択
3. "Run workflow" をクリック
4. 環境を選択（production/staging）して実行

## 開発ワークフロー

### Kiro-style Spec Driven Development

このプロジェクトはスペック駆動開発を採用しています：

1. **ステアリング更新** - `/kiro:steering` でプロジェクトコンテキストを最新化（任意）
2. **仕様初期化** - `/kiro:spec-init` で新機能の仕様を作成
3. **要件定義** - `/kiro:spec-requirements` で詳細な要件を生成
4. **設計** - `/kiro:spec-design` で技術設計を作成
5. **タスク分解** - `/kiro:spec-tasks` で実装タスクに分解
6. **実装** - タスクに従って段階的に実装
7. **進捗確認** - `/kiro:spec-status` で進捗を追跡

各フェーズで人間のレビューを実施し、品質を確保します。

### ブランチ戦略

```
main (本番)
  └── develop (開発環境)
      ├── feature/xxx
      └── bugfix/yyy
```

### 開発手順（詳細）

新機能を追加する際の具体的なワークフローです。

#### Step 1: 開発準備

```bash
# リポジトリの最新状態を取得
git pull origin main

# 開発環境を起動
docker-compose up -d
```

#### Step 2: ステアリングドキュメントの確認・更新（初回または大きな変更時）

Claude Codeで以下のコマンドを実行：

```
/kiro:steering
```

これにより、プロジェクトの最新状態がAIに共有されます。

#### Step 3: フィーチャーブランチの作成

```bash
# 機能名でブランチを作成（例: feature/user-auth）
git checkout -b feature/user-auth
```

#### Step 4: 仕様の作成（Kiro-style SDD）

**4-1. 仕様の初期化**

Claude Codeで新機能の概要を詳しく説明して初期化：

```
/kiro:spec-init ユーザー認証機能を追加します。JWT形式のトークンベース認証を実装し、ログイン・ログアウト・トークン更新の機能を提供します。フロントエンドはReact、バックエンドはExpressで実装します。
```

これにより `.kiro/specs/user-auth/` ディレクトリが作成されます。

**4-2. 要件定義の生成**

```
/kiro:spec-requirements user-auth
```

生成された `requirements.md` を確認し、必要に応じて手動で修正・追記します。

**4-3. 技術設計の作成**

```
/kiro:spec-design user-auth
```

対話形式で要件を確認済みか聞かれるので、確認後に `y` で進めます。
生成された `design.md` をレビューし、アーキテクチャや技術選定が適切か確認します。

**4-4. 実装タスクの生成**

```
/kiro:spec-tasks user-auth
```

対話形式で要件と設計の確認を経て、実装タスクが `tasks.md` に生成されます。
各タスクは小さな単位に分割されており、段階的に実装できます。

**4-5. 仕様の進捗確認**

```
/kiro:spec-status user-auth
```

現在のフェーズ（要件/設計/タスク/実装）と進捗状況を確認できます。

#### Step 5: 仕様のコミットとレビュー依頼

```bash
# 仕様ファイルをステージング
git add .kiro/specs/user-auth/

# 仕様をコミット
git commit -m "docs: ユーザー認証機能の仕様を追加

- 要件定義
- 技術設計
- 実装タスク"

# リモートにプッシュ
git push origin feature/user-auth

# 仕様レビュー用のPRを作成
gh pr create --title "Spec: ユーザー認証機能" --body "## 概要
ユーザー認証機能の仕様を作成しました。

## レビューポイント
- [ ] 要件定義が適切か
- [ ] 技術設計がプロジェクトのアーキテクチャに適合しているか
- [ ] 実装タスクが適切に分割されているか

## 仕様ファイル
- .kiro/specs/user-auth/requirements.md
- .kiro/specs/user-auth/design.md
- .kiro/specs/user-auth/tasks.md

## 次のステップ
仕様承認後、同じブランチで実装を開始します。" --draft
```

**レビュー対応:**
- レビューフィードバックに基づいて仕様を修正
- 承認されたらPRのドラフトを解除してマージ準備
- または、実装を含めた最終PRまでドラフトのまま継続

#### Step 6: 実装

**6-1. タスクの確認**

`.kiro/specs/user-auth/tasks.md` を開き、実装するタスクを確認します。

**6-2. データベーススキーマの変更（必要な場合）**

新機能でデータベースの変更が必要な場合は、以下の手順で進めます：

**6-2-1. Prismaスキーマの編集**

`backend/prisma/schema.prisma` を編集して、必要なモデルを追加・変更します：

```prisma
// 例: ユーザーモデルにリフレッシュトークンフィールドを追加
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String?
  passwordHash String
  refreshToken String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}
```

**6-2-2. マイグレーションの作成・実行**

スキーマ変更をデータベースに反映します：

```bash
# マイグレーションファイルを生成・実行
npm --prefix backend run prisma:migrate

# マイグレーション名を入力（例: add_refresh_token_to_users）
# Enter a name for the new migration: › add_refresh_token_to_users
```

これにより以下が自動実行されます：
- マイグレーションファイルが `backend/prisma/migrations/` に生成
- データベースにマイグレーションが適用
- Prisma Clientが自動再生成

**6-2-3. マイグレーションの確認**

```bash
# Prisma Studioでデータベースを確認（オプション）
npm --prefix backend run prisma:studio
# ブラウザで http://localhost:5555 が開きます

# マイグレーションファイルをコミット対象に追加
git add backend/prisma/migrations/
git add backend/prisma/schema.prisma
```

**重要な注意点:**
- マイグレーションファイルは必ずGitにコミットしてください
- 本番環境へのマイグレーション適用は `npm --prefix backend run prisma:migrate:deploy` を使用
- スキーマ変更後は必ずPrisma Clientが再生成されているか確認

**6-3. Claude Codeで実装**

Claude Codeに以下のように依頼：

```
/kiro:spec-impl user-auth 1,2,3
```

または、個別に指示：

```
.kiro/specs/user-auth/tasks.md のタスク1「JWT認証ミドルウェアの実装」を実装してください
```

**6-4. 実装の確認**

- コードレビュー
- ローカルで動作確認
- 必要に応じてテストの追加

```bash
# フロントエンド確認
curl http://localhost:5173

# バックエンドAPI確認
curl http://localhost:3000/health
```

```bash
# 変更を確認
git status
git diff

# ステージング（データベース変更がある場合はマイグレーションも含める）
git add .
git add backend/prisma/migrations/  # マイグレーションがある場合

# コミット（pre-commitフックが自動実行されます）
git commit -m "feat: JWT認証ミドルウェアの実装"
# Prettier + ESLint + Prismaフォーマットが自動的に実行され、コードが整形されます
```

**コミットメッセージの規約:**
- `feat:` - 新機能
- `fix:` - バグ修正
- `docs:` - ドキュメント更新
- `style:` - コードフォーマット
- `refactor:` - リファクタリング
- `test:` - テスト追加・修正
- `chore:` - ビルド・ツール設定

**データベース変更を含むコミットの例:**
```bash
# スキーマ変更とマイグレーションを含むコミット
git commit -m "feat: ユーザー認証機能のデータベーススキーマを追加

- UserモデルにpasswordHashとrefreshTokenフィールドを追加
- マイグレーション: add_refresh_token_to_users"
```

```bash
# 実装をプッシュ
git push origin feature/user-auth

# Step 5でドラフトPRを作成している場合は更新
# PRの説明を実装内容に更新
gh pr edit --body "## 概要
ユーザー認証機能を追加しました。

## 仕様
- .kiro/specs/user-auth/requirements.md
- .kiro/specs/user-auth/design.md
- .kiro/specs/user-auth/tasks.md

## 変更内容
- JWT認証ミドルウェアの実装
- ログイン/ログアウトAPIの実装
- トークン更新APIの実装

## データベース変更（該当する場合のみ）
- Userモデルにpasswordハッシュとリフレッシュトークンを追加
- マイグレーション: \`add_refresh_token_to_users\`

## テスト
- [x] ログイン動作確認
- [x] トークン検証動作確認
- [x] ログアウト動作確認
- [x] マイグレーションの動作確認（データベース変更がある場合）

## スクリーンショット
（必要に応じて追加）"

# ドラフトを解除してレビュー依頼
gh pr ready
```

PR上でレビューを受け、必要に応じて修正：

```bash
# フィードバックに基づいて修正
# ...

# 再度コミット
git add .
git commit -m "fix: レビューフィードバックの反映"
git push origin feature/user-auth
```

```bash
# PRがレビュー承認されたらマージ
# GitHub UI上でマージボタンをクリック
# または
gh pr merge --squash

# mainブランチに移動して最新化
git checkout main
git pull origin main

# Railwayへの自動デプロイが開始されます
# Railway UIで状態を確認
```

#### Step 11: デプロイ確認

```bash
# Railway UIでデプロイログを確認
# ヘルスチェックエンドポイントで確認
curl https://your-backend.railway.app/health

# フロントエンドの確認
# ブラウザで https://your-frontend.railway.app にアクセス
```

**データベース変更がある場合の確認:**

Railway環境では、`package.json`の`build`スクリプトで`prisma:generate`が実行され、Prisma Clientが自動生成されます。マイグレーションは以下の方法で適用されます：

1. **自動マイグレーション適用（推奨）:**
   - Railway UIでbackendサービスの環境変数に`MIGRATE_ON_DEPLOY=true`を設定
   - デプロイ時に自動的に`prisma migrate deploy`が実行される

2. **手動マイグレーション適用:**
   ```bash
   # Railway CLIを使用
   railway run npm --prefix backend run prisma:migrate:deploy
   ```

3. **マイグレーション適用の確認:**
   ```bash
   # Railway UIでデプロイログを確認し、以下のメッセージを探す
   # "Migration applied: add_refresh_token_to_users"
   ```

**重要な注意点:**
- 本番環境では必ず`prisma:migrate:deploy`を使用（`prisma:migrate`は開発環境専用）
- マイグレーションファイルがGitにコミットされていることを確認
- データベースの破壊的変更（カラム削除など）は慎重に実施

### 日常的な開発フロー

小規模な修正や改善の場合：

```bash
# 1. 最新状態を取得
git pull origin main

# 2. ブランチ作成
git checkout -b fix/button-color

# 3. Claude Codeに依頼
# 「ログインボタンの色を青から緑に変更してください」

# 4. 確認・コミット
git add .
git commit -m "fix: ログインボタンの色を変更"

# 5. プッシュ・PR作成
git push origin fix/button-color
gh pr create --title "fix: ログインボタンの色を変更" --body "UIの視認性向上のため、ログインボタンの色を変更"

# 6. マージ
gh pr merge --squash
```

### チーム開発での注意点

1. **仕様を必ず作成**: 中規模以上の機能は必ず `/kiro:spec-init` から開始
2. **レビューを依頼**: PRは必ず他のメンバーにレビューを依頼
3. **コミットは小さく**: 1つのコミットで1つの変更
4. **ステアリング更新**: 大きな変更後は `/kiro:steering` を実行
5. **進捗共有**: `/kiro:spec-status` で進捗を共有

## トラブルシューティング

### Docker Composeで起動できない場合

```bash
# コンテナとボリュームを削除して再起動
docker-compose down -v
docker-compose up --build
```

### Backendがデータベースに接続できない場合

```bash
# PostgreSQLの起動確認
docker-compose ps

# ログを確認
docker-compose logs postgres
```

### Frontendで環境変数が読めない場合

```bash
# 環境変数が正しく設定されているか確認
# Backend APIのURLが正しいか確認
echo $VITE_API_URL
```

### E2Eテストが実行できない場合

```bash
# Chromiumの依存関係を確認
ldd ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | grep "not found"

# 依存関係が不足している場合
sudo npx playwright install-deps chromium

# Chromiumを再インストール
npx playwright install chromium
```

## テスト戦略

ArchiTrackでは、3層のテストアプローチを採用しています：

### テストピラミッド

```
        ┌─────────────────┐
        │   E2E Tests     │  少数・高価値
        │   (Playwright)  │  システム全体の動作確認
        └─────────────────┘
              ↑
     ┌────────────────────┐
     │ Integration Tests  │  中量・ビジネスロジック
     │ (Vitest)           │  API・DB統合テスト
     └────────────────────┘
              ↑
   ┌──────────────────────────┐
   │     Unit Tests           │  多数・高速
   │     (Vitest)             │  関数・コンポーネント単位
   └──────────────────────────┘
```

### 1. ユニットテスト（Unit Tests）

**目的**: 個別の関数・コンポーネント・モジュールの動作を検証

**ツール**: Vitest + React Testing Library

**カバレッジ目標**: 80%以上（statements/branches/functions/lines）

**実行方法**:
```bash
# Backend
npm --prefix backend run test:unit
npm --prefix backend run test:unit:coverage

# Frontend
npm --prefix frontend run test
npm --prefix frontend run test:coverage
```

**テストファイル配置**:
- Backend: `backend/src/**/*.test.ts`
- Frontend: `frontend/src/**/*.test.tsx`

**例**:
```typescript
// backend/src/utils/validation.test.ts
describe('validateEmail', () => {
  it('有効なメールアドレスを検証', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('無効なメールアドレスを拒否', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
});
```

### 2. 統合テスト（Integration Tests）

**目的**: 複数のモジュール・システムの統合動作を検証

**ツール**: Vitest + Supertest (Backend) / React Testing Library (Frontend)

**実行方法**:
```bash
# Backend統合テスト（Docker環境で実行）
docker exec architrack-backend npm run test:integration
```

**テストファイル配置**:
- Backend: `backend/src/__tests__/integration/**/*.test.ts`
- Frontend: `frontend/src/__tests__/integration/**/*.test.tsx`

**例**:
```typescript
// backend/src/__tests__/integration/api.test.ts
describe('POST /api/adr', () => {
  it('新しいADRを作成できる', async () => {
    const response = await request(app)
      .post('/api/adr')
      .send({ title: 'Test ADR', content: 'Content' })
      .expect(201);

    expect(response.body).toHaveProperty('id');
  });
});
```

### 3. E2Eテスト（End-to-End Tests）

**目的**: ユーザー視点でシステム全体の動作を検証

**ツール**: Playwright (Chromium)

**実行方法**: 後述の「E2Eテスト（Playwright）」セクション参照

### カバレッジレポート

テストカバレッジは以下の方法で確認できます：

```bash
# すべてのカバレッジを取得
npm run test:coverage

# カバレッジレポート（HTML）
# backend/coverage/index.html
# frontend/coverage/index.html
```

### CI/CDでのテスト実行

GitHub Actionsで自動的に以下が実行されます：

1. **Lint & Format Check**: コード品質チェック
2. **Type Check**: TypeScript型チェック
3. **Unit Tests**: ユニットテスト + カバレッジ検証
4. **Build Test**: ビルド成功確認
5. **Integration & E2E Tests**: Docker環境で統合・E2Eテスト

詳細は `.github/workflows/ci.yml` を参照してください。

---

## E2Eテスト（Playwright）

### テスト環境のセットアップ

Playwrightブラウザとシステム依存関係をインストール：

```bash
# 1. プロジェクトルートで依存関係をインストール
npm install
# ↑ postinstallフックでPlaywright Chromiumが自動インストールされます

# 2. システム依存関係をインストール（WSL2/Linuxの場合、初回のみ）
sudo npx playwright install-deps chromium
```

**注意事項:**
- `npm install` で自動的にChromiumがインストールされます
- システム依存関係のインストールは環境ごとに初回のみ実行すれば、以降は不要です

### テストの実行

#### 1. 基本的なテスト実行

```bash
# アプリケーションを起動
docker-compose up -d

# E2Eテストを実行
npm run test:e2e
```

#### 2. UIモードで実行（対話的）

```bash
npm run test:e2e:ui
```

#### 3. ヘッドフルモード（ブラウザを表示）

```bash
npm run test:e2e:headed
```

#### 4. デバッグモード

```bash
npm run test:e2e:debug
```

#### 5. レポートの確認

```bash
# 最新のレポートを表示
npm run test:e2e:report
```

### テスト結果の管理

テスト実行時、結果はタイムスタンプ付きディレクトリに保存されます：

```
playwright-report/
└── 2025-11-01_03-32-57-560Z/    # タイムスタンプ付きレポート
    └── index.html

test-results/
└── 2025-11-01_03-32-57-560Z/    # タイムスタンプ付き結果
    ├── screenshots/              # 失敗時のスクリーンショット
    └── videos/                   # 失敗時のビデオ
```

**メリット:**
- 複数回の実行結果を履歴として保存
- デバッグ時に過去の結果と比較可能
- ファイル名の衝突を防止

### Claude Codeから直接ブラウザを操作

#### スクリーンショット撮影

```bash
node e2e/helpers/browser.js screenshot http://localhost:5173 screenshot.png
```

#### ページ情報取得

```bash
node e2e/helpers/browser.js info http://localhost:5173
```

#### APIテスト

```bash
node e2e/helpers/browser.js api http://localhost:3000/api/health
```

### テストファイルの追加

テストは適切なカテゴリに分けて配置：

```
e2e/specs/
├── api/              # APIエンドポイントのテスト
├── ui/               # UIコンポーネントとページのテスト
└── integration/      # システム統合テスト
```

**UIテストの例:**
```javascript
// e2e/specs/ui/new-feature.spec.js
import { test, expect } from '@playwright/test';

test.describe('新機能', () => {
  test('テスト名', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ArchiTrack/);
  });
});
```

**特定カテゴリのみ実行:**
```bash
npx playwright test api/      # APIテストのみ
npx playwright test ui/       # UIテストのみ
npx playwright test integration/  # 統合テストのみ
```

### CI/CD

GitHub Actionsで自動的にE2Eテストが実行されます：
- PRのたびに実行
- mainブランチへのpushで実行
- テスト失敗時はスクリーンショットがアップロードされます

---

## コントリビューション

ArchiTrackへのコントリビューションを歓迎します！以下のガイドラインに従ってください。

### コントリビューションの流れ

1. **Issueの作成または確認**
   - 新機能・バグ修正の前に、既存のIssueを確認
   - 存在しない場合は新しいIssueを作成
   - Issueで実装方針を議論

2. **リポジトリのFork**
   ```bash
   # GitHubでForkボタンをクリック
   git clone https://github.com/your-username/ArchiTrack.git
   cd ArchiTrack
   ```

3. **開発環境のセットアップ**
   ```bash
   # Git hooksを有効化
   git config core.hooksPath .husky

   # Docker Composeで起動
   docker-compose up -d
   ```

4. **フィーチャーブランチの作成**
   ```bash
   git checkout -b feature/your-feature-name
   # または
   git checkout -b fix/issue-number-description
   ```

5. **仕様駆動開発（中規模以上の機能）**
   ```bash
   # Claude Codeを使用している場合
   /kiro:spec-init [詳細な機能説明]
   /kiro:spec-requirements [feature-name]
   /kiro:spec-design [feature-name]
   /kiro:spec-tasks [feature-name]
   ```

6. **実装**
   - コーディング規約に従う（下記参照）
   - テストを追加（カバレッジ80%以上維持）
   - コミットメッセージ規約に従う（下記参照）

7. **ローカルテスト**
   ```bash
   # フォーマット・Lint・型チェック
   npm --prefix backend run format:check
   npm --prefix backend run lint
   npm --prefix backend run type-check

   npm --prefix frontend run format:check
   npm --prefix frontend run lint
   npm --prefix frontend run type-check

   # テスト実行
   npm --prefix backend run test:unit
   npm --prefix frontend run test

   # ビルド確認
   npm --prefix backend run build
   npm --prefix frontend run build
   ```

8. **コミット＆プッシュ**
   ```bash
   git add .
   git commit -m "feat: 新機能の説明"
   git push origin feature/your-feature-name
   ```

9. **Pull Requestの作成**
   - GitHubでPull Requestを作成
   - PRテンプレートに従って記入
   - レビュアーを指定（可能であれば）

10. **レビュー対応**
    - レビューコメントに対応
    - 必要に応じて修正をコミット
    - 承認後にマージ

### コーディング規約

#### TypeScript/JavaScript

- **フォーマット**: Prettierに従う（自動整形）
- **Lint**: ESLintルールに準拠
- **命名規則**:
  - 変数/関数: camelCase (`getUserById`)
  - クラス/型: PascalCase (`UserModel`)
  - 定数: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
  - プライベート変数: `_`プレフィックス (`_internalState`)
- **型定義**: `any`を避け、厳密な型を使用
- **エラーハンドリング**: 適切なエラーハンドリングを実装

#### React

- **関数コンポーネント**: クラスコンポーネントは使用しない
- **Hooks**: React Hooksのルールに従う
- **Props**: 型定義を必ず行う
- **ファイル命名**: PascalCase (`UserProfile.tsx`)

#### データベース（Prisma）

- **スキーマ**: 変更後は必ずマイグレーションを生成
- **命名**: snake_case（テーブル・カラム名）
- **インデックス**: パフォーマンス考慮した適切なインデックス設定

### コミットメッセージ規約

Conventional Commitsに従います：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type（必須）

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードフォーマット（機能変更なし）
- `refactor`: リファクタリング
- `perf`: パフォーマンス改善
- `test`: テスト追加・修正
- `chore`: ビルド・ツール設定変更
- `ci`: CI/CD設定変更

#### Scope（任意）

変更の影響範囲: `backend`, `frontend`, `e2e`, `docker`, `ci`等

#### Subject（必須）

- 50文字以内
- 命令形（"add" not "added"）
- 先頭は小文字
- 末尾にピリオドをつけない

#### 例

```bash
# 良い例
feat(backend): JWT認証ミドルウェアを追加
fix(frontend): ログインボタンが押せない問題を修正
docs: READMEにセットアップ手順を追加
test(backend): ユーザーAPI統合テストを追加

# 悪い例
update code
Fixed bug
Add feature.
```

### Pull Request（PR）ガイドライン

#### PRタイトル

コミットメッセージと同じ規約に従います：

```
feat(backend): ユーザー認証機能を実装
```

#### PR本文テンプレート

```markdown
## 概要
この変更の目的を簡潔に説明してください。

## 変更内容
- 変更1
- 変更2
- 変更3

## 関連Issue
Closes #123

## テスト
- [ ] ユニットテスト追加
- [ ] 統合テスト追加
- [ ] E2Eテスト追加（該当する場合）
- [ ] 手動テスト完了

## チェックリスト
- [ ] コーディング規約に準拠
- [ ] テストカバレッジ80%以上維持
- [ ] ドキュメント更新（該当する場合）
- [ ] データベースマイグレーション生成（該当する場合）
- [ ] 破壊的変更がある場合は明記

## スクリーンショット（該当する場合）
変更前後のスクリーンショットを添付してください。
```

### レビュー基準

レビュアーは以下の観点でチェックします：

#### コード品質

- [ ] コーディング規約に準拠しているか
- [ ] 適切な型定義がされているか
- [ ] エラーハンドリングが適切か
- [ ] セキュリティ上の問題がないか

#### テスト

- [ ] テストが追加されているか
- [ ] カバレッジが維持されているか（80%以上）
- [ ] エッジケースが考慮されているか

#### 設計

- [ ] 既存のアーキテクチャに適合しているか
- [ ] DRY原則に従っているか
- [ ] 拡張性が考慮されているか

#### ドキュメント

- [ ] コードコメントが適切か
- [ ] README等のドキュメントが更新されているか
- [ ] APIドキュメント（Swagger）が更新されているか

### 行動規範

- **尊重**: すべてのコントリビューターを尊重する
- **建設的**: フィードバックは建設的に行う
- **協力的**: チームワークを重視する
- **包括的**: すべての人が参加しやすい環境を作る

### 質問・サポート

- **Issue**: バグ報告・機能要望は[GitHub Issues](https://github.com/your-org/ArchiTrack/issues)で
- **Discussion**: 議論は[GitHub Discussions](https://github.com/your-org/ArchiTrack/discussions)で
- **セキュリティ**: セキュリティ問題は直接報告（security@example.com）

---

## ライセンス

MIT

---

## 謝辞

このプロジェクトは以下のオープンソースプロジェクトに支えられています：

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [Playwright](https://playwright.dev/)
- [Claude Code](https://claude.ai/claude-code)

そして、すべてのコントリビューターに感謝します 🎉
