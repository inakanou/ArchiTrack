# ArchiTrack

アーキテクチャ決定記録（ADR）管理システム

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
- **AI Tool**: Claude Code
- **Deployment**: Railway (Railpack)

## プロジェクト構成

```
ArchiTrack/
├── frontend/           # React/Viteフロントエンド
│   ├── src/
│   ├── Dockerfile      # 本番用(nginx)
│   ├── Dockerfile.dev  # 開発用
│   └── railway.toml    # Railway設定
├── backend/            # Node.js/Expressバックエンド
│   ├── src/
│   ├── Dockerfile.dev  # 開発用
│   └── railway.toml    # Railway設定
└── docker-compose.yml  # ローカル開発環境
```

## ローカル開発環境のセットアップ

### 前提条件

このプロジェクトの開発には以下のツールが必要です：

#### 必須ツール

- **Node.js 20以上** - フロントエンド・バックエンドの実行環境
- **Docker & Docker Compose** - コンテナ化された開発環境（PostgreSQL、Redis、アプリケーション）
- **Claude Code** - AI支援開発環境（推奨）
- **jq** - JSONパーサー（Claude Codeのカスタムフック実行に必要）

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

### 1. Railway CLIのインストールとログイン

```bash
# Railway CLIをインストール
npm i -g @railway/cli

# ログイン
railway login

# プロジェクトを初期化
railway init
```

### 2. サービス作成

Railwayダッシュボードで以下のサービスを作成：

- **PostgreSQL** - Railwayテンプレートから作成
- **Redis** - Railwayテンプレートから作成
- **Backend** - GitHubリポジトリから作成: `/backend`
- **Frontend** - GitHubリポジトリから作成: `/frontend`

### 3. 環境変数ファイルを設定

#### Backend Service
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NODE_ENV=production
FRONTEND_URL=https://your-frontend.railway.app
PORT=3000
```

#### Frontend Service
```
VITE_API_URL=https://your-backend.railway.app
```

### 4. デプロイ

GitHubへのプッシュでダッシュボードが自動デプロイされます：

```bash
git add .
git commit -m "Deploy to Railway"
git push origin main
```

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

### 開発手順

1. **仕様作成**: Claude Codeのスラッシュコマンドで仕様を作成
2. **ブランチ作成**: `feature/*` ブランチで開発
3. **実装**: スペックに従って段階的に実装
4. **コミット**: pre-commitフックが自動的にコード品質をチェック
5. **PR作成**: `develop` へのPRを作成
6. **テスト**: テスト環境で確認
7. **デプロイ**: `develop` を `main` へマージして本番デプロイ

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

## ライセンス

MIT
