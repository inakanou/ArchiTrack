# クイックスタートガイド

このガイドでは、ArchiTrackを5分で起動し、基本的な動作を確認します。

---

## 前提条件

- [前提条件](prerequisites.md)のツールがインストール済み
- [インストール手順](installation.md)が完了済み

---

## ステップ1: アプリケーションの起動（1分）

```bash
# プロジェクトルートで実行
docker-compose up -d
```

**起動完了の確認:**
```bash
docker-compose ps
```

すべてのサービスが`Up`状態であることを確認します。

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

## ステップ4: 初期管理者アカウントの作成（2分）

### シーディングスクリプトの実行

```bash
# backend/.env に以下を追加
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=YourStrongPassword123!
INITIAL_ADMIN_DISPLAY_NAME=System Administrator
```

```bash
# シーディング実行
docker exec architrack-backend npm run prisma:seed
```

**期待される出力:**
```
✅ Roles seeded successfully
✅ Permissions seeded successfully
✅ Role-Permission mappings seeded successfully
✅ Initial admin account created: admin@example.com
```

### ログイン

1. http://localhost:5173 にアクセス
2. 以下の情報でログイン:
   - **メールアドレス**: `admin@example.com`
   - **パスワード**: `YourStrongPassword123!`

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

1. **全サービスが起動しているか**: `docker-compose ps`
2. **ログにエラーがないか**: `docker-compose logs -f`
3. **ポートが使用中でないか**: `lsof -i :3000` / `lsof -i :5173`

詳細は[デプロイのトラブルシューティング](../deployment/troubleshooting.md)を参照してください。
