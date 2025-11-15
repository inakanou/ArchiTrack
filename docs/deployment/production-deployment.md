# 本番環境デプロイガイド

本ドキュメントは、user-authentication機能の本番環境へのデプロイ手順を説明します。

## 前提条件

- ✅ タスク1.1-10.7が完了していること
- ✅ 全テストが成功していること（Backend 564/564, Frontend 373/378）
- ✅ セキュリティレビューが完了していること（OWASP Top 10, STRIDE）
- ✅ Railway環境が設定済みであること

## デプロイ戦略

### Canary Deployment（段階的リリース）

本番環境へのデプロイはCanary Deployment戦略で実施します：

```
Phase 1: 5%のトラフィックを新バージョンに流す
  ↓ 監視（15分）
Phase 2: 25%のトラフィックを新バージョンに流す
  ↓ 監視（30分）
Phase 3: 100%のトラフィックを新バージョンに流す
```

## デプロイ手順

### Step 1: 環境変数の設定

Railway環境に以下の環境変数を設定：

#### Backend環境変数

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_PRIVATE_KEY=<Base64エンコードされたEdDSA秘密鍵>
JWT_PUBLIC_KEY=<Base64エンコードされたEdDSA公開鍵>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Password Security
TWO_FACTOR_ENCRYPTION_KEY=<32バイトのランダムキー>

# Initial Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<強力なパスワード>
INITIAL_ADMIN_DISPLAY_NAME=System Administrator

# SMTP (Nodemailer)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASS=<SMTPパスワード>

# Frontend URL
FRONTEND_URL=https://your-app.example.com

# Environment
NODE_ENV=production
RAILWAY_ENVIRONMENT=production
```

#### Frontend環境変数

```bash
VITE_API_BASE_URL=https://api.your-app.example.com
VITE_API_TIMEOUT=10000
```

### Step 2: データベースマイグレーション

```bash
# Railwayコンソールで実行
npm run prisma:migrate:deploy
npm run prisma:seed
```

### Step 3: デプロイ実行

#### Phase 1: 5%トラフィック（Canary）

```bash
# Railway CLI
railway up --environment production --canary 5
```

**監視項目**（15分間）:
- エラーレート < 1%
- レスポンスタイム（p95） < 500ms
- CPU使用率 < 70%
- メモリ使用率 < 80%

#### Phase 2: 25%トラフィック

監視結果が正常な場合：

```bash
railway up --environment production --canary 25
```

**監視項目**（30分間）:
- エラーレート < 1%
- レスポンスタイム（p95） < 500ms
- CPU使用率 < 70%
- メモリ使用率 < 80%

#### Phase 3: 100%トラフィック（Full Deployment）

監視結果が正常な場合：

```bash
railway up --environment production
```

### Step 4: スモークテスト

デプロイ完了後、以下のスモークテストを実行：

#### 1. ヘルスチェック

```bash
curl https://api.your-app.example.com/health
```

**期待結果**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-15T12:00:00.000Z",
  "uptime": 123.45,
  "database": "connected",
  "redis": "connected"
}
```

#### 2. ログイン機能テスト

```bash
curl -X POST https://api.your-app.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-admin-password"
  }'
```

**期待結果**: アクセストークンとリフレッシュトークンが返却される

#### 3. 招待機能テスト

```bash
curl -X POST https://api.your-app.example.com/api/v1/invitations \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**期待結果**: 招待が作成され、メールが送信される

#### 4. 2FA設定テスト

```bash
curl -X POST https://api.your-app.example.com/api/v1/auth/2fa/setup \
  -H "Authorization: Bearer <access-token>"
```

**期待結果**: QRコードとバックアップコードが返却される

#### 5. 権限チェックテスト

```bash
curl https://api.your-app.example.com/api/v1/users/me \
  -H "Authorization: Bearer <access-token>"
```

**期待結果**: 現在のユーザー情報とロールが返却される

## ロールバック手順

問題が発生した場合の緊急対応：

### 方法1: Railway環境切り戻し

```bash
# 前のデプロイメントにロールバック
railway rollback --environment production
```

### 方法2: 機能フラグ無効化

環境変数で機能を無効化：

```bash
FEATURE_USER_AUTH_ENABLED=false
```

### 方法3: データベースマイグレーションのロールバック

```bash
# Prismaマイグレーションのロールバック
npm run prisma:migrate:reset --force
npm run prisma:migrate:deploy --up-to <previous-migration-id>
```

## 監視とアラート

### Sentry設定

エラー監視のため、Sentryを設定：

```bash
SENTRY_DSN=<your-sentry-dsn>
SENTRY_ENVIRONMENT=production
```

### ログ監視

Railway Logsで以下を監視：

- 認証エラー
- 権限チェック失敗
- データベース接続エラー
- Redis接続エラー

### メトリクス監視

- エラーレート（目標: < 1%）
- レスポンスタイム（p95 < 500ms, p99 < 100ms for 権限チェック）
- スループット
- CPU/メモリ使用率

## トラブルシューティング

### 問題1: データベース接続エラー

**症状**: `Can't reach database server`

**解決策**:
1. DATABASE_URL環境変数を確認
2. Postgresサービスが起動していることを確認
3. ネットワークセキュリティグループを確認

### 問題2: Redis接続エラー

**症状**: Redis接続失敗、キャッシュ利用不可

**解決策**:
1. REDIS_URL環境変数を確認
2. Redisサービスが起動していることを確認
3. Graceful Degradationが動作し、DBフォールバックが機能していることを確認

### 問題3: JWT検証エラー

**症状**: `Invalid token signature`

**解決策**:
1. JWT_PRIVATE_KEY、JWT_PUBLIC_KEYが正しく設定されているか確認
2. 鍵のBase64エンコーディングが正しいか確認
3. ローテーション期間（90日）を確認

### 問題4: メール送信エラー

**症状**: 招待メールが送信されない

**解決策**:
1. SMTP設定（SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS）を確認
2. Bullキューが正常動作しているか確認
3. Redisキューに接続できているか確認

## 完了基準

以下の条件をすべて満たすこと：

- ✅ Canary deploymentが成功する（5% → 25% → 100%）
- ✅ スモークテストが全て成功する（5項目）
- ✅ エラーレート < 1%
- ✅ レスポンスタイム（p95） < 500ms
- ✅ ロールバック手順が動作する（確認済み）
- ✅ 監視とアラートが設定されている（Sentry、Railway Logs）

## 次のステップ

デプロイ完了後：

1. チームメンバーに通知
2. ドキュメント更新（デプロイ日時、バージョン）
3. ユーザーフィードバック収集
4. パフォーマンスモニタリング継続

---

**最終更新**: 2025-11-15
**責任者**: DevOps Team
**関連ドキュメント**:
- [技術設計書](../../.kiro/specs/user-authentication/design.md)
- [要件定義書](../../.kiro/specs/user-authentication/requirements.md)
- [セキュリティレビュー結果](../architecture/security-review.md)
