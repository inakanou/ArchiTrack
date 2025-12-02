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

## ステップ2: Git Hooksの有効化

コミット前に自動的にコード品質チェックを実行するGit hooksを設定します。

```bash
git config core.hooksPath .husky
```

**Git Hooksの機能:**
- **Prettier**: コードフォーマット
- **ESLint**: コード品質チェックと自動修正
- **Prisma Format**: Prismaスキーマのフォーマット

---

## ステップ3: 環境変数ファイルの準備

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

### すべてのサービスを起動

```bash
docker-compose up
```

**起動されるサービス:**
- **PostgreSQL**: データベース（ポート: 5432）
- **Redis**: キャッシュ（ポート: 6379）
- **Backend**: Node.js/Express（ポート: 3000）
- **Frontend**: Vite/React（ポート: 5173）

### アクセス先

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Swagger UI**: http://localhost:3000/docs

### バックグラウンド起動

```bash
docker-compose up -d
```

### ログの確認

```bash
# 全サービスのログ
docker-compose logs -f

# 特定サービスのログ
docker-compose logs -f backend
docker-compose logs -f frontend
```

### サービスの停止

```bash
# コンテナを停止（データは保持）
docker-compose down

# コンテナとボリュームを削除（データも削除）
docker-compose down -v
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
docker-compose up postgres redis
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
cat frontend/.env

# VITE_API_BASE_URLが正しいか確認
echo $VITE_API_BASE_URL
```

---

## 次のステップ

インストールが完了したら、[クイックスタートガイド](quick-start.md)でArchiTrackの基本的な使い方を学びましょう。

開発を開始する場合は、[開発ワークフロー](../development/workflow.md)を参照してください。
