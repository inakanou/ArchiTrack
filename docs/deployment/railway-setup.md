# Railway設定

このドキュメントでは、RailwayプラットフォームでのArchiTrackプロジェクトのセットアップ手順を説明します。

---

## 前提条件

- Railwayアカウント（https://railway.app）
- GitHub連携済み
- [Railway CLI](../getting-started/prerequisites.md#railway-cli)インストール済み

---

## 初回セットアップ

### ステップ1: プロジェクト作成

1. **Railway Dashboard にログイン**
   - https://railway.app にアクセス

2. **新しいプロジェクトを作成**
   - **New Project** ボタンをクリック
   - **Deploy from GitHub repo** を選択
   - ArchiTrackリポジトリを選択

### ステップ2: サービスの作成

以下の4つのサービスを作成します：

#### 1. PostgreSQL Database

- **テンプレートから作成:**
  - Railway Dashboard > **+ New** > **Database** > **PostgreSQL**
- **自動設定:**
  - `DATABASE_URL` 環境変数が自動生成されます

#### 2. Redis Cache

- **テンプレートから作成:**
  - Railway Dashboard > **+ New** > **Database** > **Redis**
- **自動設定:**
  - `REDIS_URL` 環境変数が自動生成されます

#### 3. Backend Service

- **Empty Serviceとして作成:**
  - Railway Dashboard > **+ New** > **Empty Service**
  - サービス名: `backend`

**設定:**

- **Root Directory**: `/backend`
- **Build Command**: Dockerfileから自動検出
- **Start Command**: `npx prisma migrate deploy && npm start`

**環境変数:**
```bash
# データベース（Railway自動参照）
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# JWT鍵（手動設定）
JWT_PUBLIC_KEY=<Base64エンコードされた公開鍵>
JWT_PRIVATE_KEY=<Base64エンコードされた秘密鍵>

# 2FA暗号化鍵（手動設定）
TWO_FACTOR_ENCRYPTION_KEY=<64文字16進数>

# CORS設定
FRONTEND_URL=https://your-frontend.railway.app

# 環境
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# 初期管理者アカウント
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<強力なパスワード>
INITIAL_ADMIN_DISPLAY_NAME=System Administrator

# Sentry（任意）
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# デプロイ時マイグレーション自動実行
MIGRATE_ON_DEPLOY=true
```

#### 4. Frontend Service

- **Empty Serviceとして作成:**
  - Railway Dashboard > **+ New** > **Empty Service**
  - サービス名: `frontend`

**設定:**

- **Root Directory**: `/frontend`
- **Build Command**: Dockerfileから自動検出

**環境変数:**
```bash
# Backend API URL
VITE_API_BASE_URL=https://your-backend.railway.app

# トークンリフレッシュ閾値
VITE_TOKEN_REFRESH_THRESHOLD=5m
```

### ステップ3: ドメイン設定

#### Backend Service

1. Backend Service > **Settings** > **Networking**
2. **Generate Domain** をクリック
3. 生成されたURL（例: `your-backend.railway.app`）をメモ

#### Frontend Service

1. Frontend Service > **Settings** > **Networking**
2. **Generate Domain** をクリック
3. 生成されたURL（例: `your-frontend.railway.app`）をメモ

#### CORS設定の更新

1. Backend Service > **Variables**
2. `FRONTEND_URL` を更新: `https://your-frontend.railway.app`
3. Frontend Service > **Variables**
4. `VITE_API_BASE_URL` を更新: `https://your-backend.railway.app`

### ステップ4: 自動デプロイの無効化

GitHub Actionsから制御するため、Railway UIからの自動デプロイを無効化します。

**Backend Service:**
1. Backend Service > **Settings** > **Service**
2. **Watch Paths** を空にする
3. または `railway.toml` に `watchPatterns = []` を設定

**Frontend Service:**
1. Frontend Service > **Settings** > **Service**
2. **Watch Paths** を空にする
3. または `railway.toml` に `watchPatterns = []` を設定

**railway.toml の設定例:**
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npx prisma migrate deploy && npm start"
watchPatterns = []  # Railway UIからの自動デプロイを無効化
```

---

## Railway CLI設定

### インストール

```bash
# npm経由（推奨）
npm install -g @railway/cli

# またはcurlスクリプト経由（Linux/macOS）
sh -c "$(curl -fsSL https://railway.app/install.sh)"
```

### 認証

```bash
# Railway認証（ブラウザ経由）
railway login

# プロジェクトリンク（プロジェクトルートで実行）
cd ArchiTrack
railway link
```

### 確認

```bash
# バージョン確認
railway --version

# 認証状態確認
railway whoami

# プロジェクト情報確認
railway status
```

---

## GitHub Secrets用のID取得

GitHub Actionsで使用するRailway IDを取得します。

### プロジェクトID

```bash
railway status --json | jq -r '.project.id'
```

### サービスID（Staging）

```bash
railway status --json | jq -r '.services[] | select(.name=="backend-staging") | .id'
railway status --json | jq -r '.services[] | select(.name=="frontend-staging") | .id'
```

### サービスID（Production）

```bash
railway status --json | jq -r '.services[] | select(.name=="backend") | .id'
railway status --json | jq -r '.services[] | select(.name=="frontend") | .id'
```

これらのIDを[CI/CD設定](cicd-github-actions.md)のGitHub Secretsに設定します。

---

## データベースマイグレーション

### 自動マイグレーション適用（推奨）

Railway環境変数に`MIGRATE_ON_DEPLOY=true`を設定することで、デプロイ時に自動的に`prisma migrate deploy`が実行されます。

**backend/railway.toml:**
```toml
[deploy]
startCommand = "npx prisma migrate deploy && npm start"
```

### 手動マイグレーション適用

```bash
# Railway CLI
railway link
railway run npm --prefix backend run prisma:migrate:deploy
```

### マイグレーション適用の確認

Railway UIでデプロイログを確認し、以下のメッセージを探す：
```
Migration applied: <migration-name>
```

**重要な注意点:**
- 本番環境では必ず`prisma:migrate:deploy`を使用（`prisma:migrate`は開発環境専用）
- マイグレーションファイルがGitにコミットされていることを確認
- データベースの破壊的変更（カラム削除など）は慎重に実施

---

## データベースシーディング

### 自動実行

環境変数 `INITIAL_ADMIN_EMAIL` と `INITIAL_ADMIN_PASSWORD` が設定されている場合、初回デプロイ時にシーディングスクリプトが自動実行されます。

### 手動実行

```bash
# Railway CLI
railway link
railway shell
npm --prefix backend run prisma:seed
```

---

## トラブルシューティング

### Railway環境でのデータベース接続エラー

**症状:**
```
Error: P1001: Can't reach database server
```

**原因と解決方法:**
- **原因1:** `DATABASE_URL` が設定されていない
  - **解決:** Railway Dashboard > Database > Connect で接続文字列を確認
- **原因2:** データベースが起動していない
  - **解決:** Railway Dashboard > Database > Restart

詳細は[トラブルシューティング](troubleshooting.md)を参照してください。

---

## 次のステップ

- [環境変数設定](environment-variables.md): 環境変数の設定
- [シークレット管理](secrets-management.md): JWT鍵・2FA鍵の生成
- [CI/CD設定](cicd-github-actions.md): GitHub Actionsの設定
- [デプロイ概要](overview.md): デプロイフロー
