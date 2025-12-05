# クイックスタートガイド

このガイドでは、ArchiTrackを5分で起動し、基本的な動作を確認します。

---

## 前提条件

- [前提条件](prerequisites.md)のツールがインストール済み
- [インストール手順](installation.md)が完了済み（または以下のクイックセットアップを実行）

---

## ステップ1: アプリケーションの起動（1分）

### クイックセットアップ（初回のみ）

```bash
# プロジェクトルートで実行
./scripts/setup-local-env.sh
```

### 開発環境の起動

```bash
# 開発環境を起動
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d
```

**起動完了の確認:**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

すべてのサービスが`Up (healthy)`状態であることを確認します。

---

## ステップ2: バックエンドの動作確認（1分）

### ヘルスチェック

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

### API情報の確認

```bash
curl http://localhost:3000/api
```

**期待されるレスポンス:**
```json
{
  "message": "ArchiTrack API",
  "version": "1.0.0"
}
```

### Swagger UIの確認

ブラウザで http://localhost:3000/docs にアクセスし、API仕様書が表示されることを確認します。

---

## ステップ3: フロントエンドの動作確認（1分）

ブラウザで http://localhost:5173 にアクセスし、ArchiTrackのUIが表示されることを確認します。

---

## ステップ4: 初期管理者アカウントでログイン（1分）

開発環境では、初期管理者アカウントが自動で作成されます。

### ログイン

1. http://localhost:5173 にアクセス
2. 以下の情報でログイン:
   - **メールアドレス**: `admin@example.com`
   - **パスワード**: `AdminTest123!@#`

### 手動でシーディングを実行する場合

初期データが作成されていない場合は、手動でシーディングを実行できます：

```bash
# シーディング実行
docker exec architrack-backend-dev npm run prisma:seed
```

**期待される出力:**
```
✅ Roles seeded successfully
✅ Permissions seeded successfully
✅ Role-Permission mappings seeded successfully
✅ Initial admin account created: admin@example.com
```

---

## ステップ5: E2Eテストの実行（オプション）

```bash
# E2Eテストを実行
npm run test:e2e
```

**注意:**
- 初回実行時はChromiumのシステム依存関係のインストールが必要な場合があります
- 詳細は[テストガイド](../development/testing.md)を参照してください

---

## 次のステップ

### 開発を開始する

- [開発ワークフロー](../development/workflow.md): Kiro-style Spec Driven Development
- [データベースマイグレーション](../development/database-migration.md): Prismaスキーマ編集
- [テスト](../development/testing.md): ユニット・統合・E2Eテスト

### API仕様を確認する

- [API概要](../api/overview.md)
- [認証API](../api/authentication.md)
- [認可API](../api/authorization.md)

### デプロイする

- [デプロイ概要](../deployment/overview.md)
- [Railway設定](../deployment/railway-setup.md)

---

## トラブルシューティング

問題が発生した場合は、以下を確認してください：

1. **全サービスが起動しているか**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps`
2. **ログにエラーがないか**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f`
3. **ポートが使用中でないか**: `lsof -i :3000` / `lsof -i :5173`

詳細は[デプロイのトラブルシューティング](../deployment/troubleshooting.md)を参照してください。
