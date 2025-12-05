# インストール手順

このガイドでは、ArchiTrackのローカル開発環境をセットアップする手順を説明します。

---

## 前提条件の確認

[前提条件](prerequisites.md)のツールがすべてインストールされていることを確認してください。

---

## ステップ1: リポジトリのクローン

```bash
git clone <repository-url>
cd ArchiTrack
```

---

## ステップ2: 自動セットアップ（推奨）

環境を自動でセットアップするスクリプトを実行します：

```bash
./scripts/setup-local-env.sh
```

**このスクリプトが行うこと:**
- Git Hooksの設定
- JWT鍵・2FA暗号化キーの生成
- 開発環境用の `.env.dev` ファイル作成
- テスト環境用の `.env.test` ファイル作成
- 各ディレクトリの `.env` ファイル作成

---

## ステップ3: 手動セットアップ（オプション）

自動セットアップを使わない場合は、以下の手順で手動設定できます。

### Git Hooksの有効化

コミット前に自動的にコード品質チェックを実行するGit hooksを設定します。

```bash
git config core.hooksPath .husky
```

**Git Hooksの機能:**
- **Prettier**: コードフォーマット
- **ESLint**: コード品質チェックと自動修正
- **Prisma Format**: Prismaスキーマのフォーマット

### 環境変数ファイルの準備

```bash
# Backendの環境変数
cp backend/.env.example backend/.env

# Frontendの環境変数
cp frontend/.env.example frontend/.env
```

**注意:**
- `.env`ファイルはGitにコミットされません（`.gitignore`で除外）
- 本番環境の設定方法は[デプロイガイド](../deployment/overview.md)を参照してください

---

## ステップ4: Docker Composeでの起動

ArchiTrackでは、用途別に複数のDocker Compose構成を用意しています。

### 環境別のDocker Compose構成

| 環境 | 構成ファイル | 用途 |
|------|-------------|------|
| **開発環境** | `docker-compose.yml` + `docker-compose.dev.yml` | ローカル画面打鍵・開発作業 |
| **テスト環境** | `docker-compose.yml` + `docker-compose.test.yml` | ローカル自動テスト実行 |
| **デバッグ環境** | `docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.debug.yml` | Node.jsデバッガ接続 |
| **CI環境** | `docker-compose.yml` + `docker-compose.ci.yml` | GitHub Actions用 |

### 開発環境の起動（推奨）

```bash
# 開発環境を起動
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d
```

**起動されるサービス:**
- **PostgreSQL**: データベース（ポート: 5432）
- **Redis**: キャッシュ（ポート: 6379）
- **Mailhog**: モックSMTPサーバー（SMTP: 1025、Web UI: 8025）
- **Backend**: Node.js/Express（ポート: 3000、デバッグ: 9229）
- **Frontend**: Vite/React（ポート: 5173）

### アクセス先

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Swagger UI**: http://localhost:3000/docs
- **Mailhog UI**: http://localhost:8025

### テスト環境の起動

開発環境と同時実行可能（ポートオフセット済み）:

```bash
# テスト環境を起動
docker compose -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d
```

**テスト環境のポート:**
- **PostgreSQL**: 5433（開発: 5432）
- **Redis**: 6380（開発: 6379）
- **Mailhog**: 1026/8026（開発: 1025/8025）
- **Backend**: 3100（開発: 3000）
- **Frontend**: 5174（開発: 5173）

### バックグラウンド起動

```bash
# 開発環境
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d
```

### ログの確認

```bash
# 全サービスのログ
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# 特定サービスのログ
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f frontend
```

### サービスの停止

```bash
# コンテナを停止（データは保持）
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# コンテナとボリュームを削除（データも削除）
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
```

---

## ステップ5: 動作確認

### バックエンドのヘルスチェック

```bash
curl http://localhost:3000/health
```

**期待されるレスポンス:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-13T00:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### フロントエンドのアクセス

ブラウザで http://localhost:5173 にアクセスし、ArchiTrackのUIが表示されることを確認します。

---

## （オプション）ローカルでNode.js直接実行

Docker Composeを使わず、ローカル環境で直接実行する場合：

### PostgreSQLとRedisのみ起動

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d postgres redis mailhog
```

### Backendを起動

```bash
cd backend
npm install
npm run dev
```

### Frontendを起動

別のターミナルで：

```bash
cd frontend
npm install
npm run dev
```

---

## 初期管理者アカウント

開発環境とテスト環境では、初期管理者アカウントが自動で作成されます：

| 環境 | メールアドレス | パスワード |
|------|---------------|-----------|
| **開発環境** | `admin@example.com` | `AdminTest123!@#` |
| **テスト環境** | `admin@example.com` | `AdminTest123!@#` |

**カスタマイズ:**

`.env.dev` または `.env.test` で以下の環境変数を変更できます：

```bash
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=AdminTest123!@#
INITIAL_ADMIN_DISPLAY_NAME=System Administrator
```

---

## トラブルシューティング

### Docker Composeで起動できない場合

```bash
# コンテナとボリュームを削除して再起動
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up --build
```

### Backendがデータベースに接続できない場合

```bash
# PostgreSQLの起動確認
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps

# ログを確認
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs postgres
```

### Frontendで環境変数が読めない場合

```bash
# 環境変数が正しく設定されているか確認
cat frontend/.env

# VITE_API_URLが正しいか確認
echo $VITE_API_URL
```

### ファイルパーミッションの問題

Dockerコンテナはホストユーザー（UID:GID）で実行されるため、マウントされたボリュームでのパーミッション問題を回避できます。問題が発生した場合：

```bash
# UID/GIDを確認
id

# 明示的に指定して起動
UID=$(id -u) GID=$(id -g) docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d
```

---

## 次のステップ

インストールが完了したら、[クイックスタートガイド](quick-start.md)でArchiTrackの基本的な使い方を学びましょう。

開発を開始する場合は、[開発ワークフロー](../development/workflow.md)を参照してください。
