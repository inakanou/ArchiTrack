# 本番環境デプロイガイド

本ドキュメントは、user-authentication機能の本番環境へのデプロイ手順を説明します。

## 前提条件

- ✅ タスク1.1-10.7が完了していること
- ✅ 全テストが成功していること（Backend 571/571, Frontend 378/378）
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

Railway環境に以下の環境変数を設定（一覧と各変数の意味は[環境変数設定](environment-variables.md)、Railway のサービスの作り方は[Railway設定](railway-setup.md)）。

> **Railway の変数名には `STAGING_`・`PRODUCTION_` を付けない。** 接頭辞は GitHub の環境シークレット（`PRODUCTION_BACKEND_URL` など）だけに付ける。誤って `STAGING_ARCHIVE_ENCRYPTION_KEY` の名前で作ると backend は `ProductionPrerequisiteError` で起動を繰り返す（[Railwayの変数名の注意](environment-variables.md#railwayの変数名の注意)）。

#### Backend環境変数

```bash
# Database（Railway の参照変数。Postgres・Redis の公開ネットワーク（TCP Proxy）は閉じる）
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis（本番で必須。欠けると起動を止める）
REDIS_URL=${{Redis.REDIS_URL}}

# JWT
JWT_PRIVATE_KEY=<Base64エンコードされたEdDSA秘密鍵>
JWT_PUBLIC_KEY=<Base64エンコードされたEdDSA公開鍵>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# 2FA の秘密の暗号化鍵（64文字16進数）
TWO_FACTOR_ENCRYPTION_KEY=<64文字16進数>

# 本番の前提（欠けると ProductionPrerequisiteError で起動を止める）
ARCHIVE_ENCRYPTION_KEY=<64文字16進数>  # 監査ログのアーカイブの暗号鍵。staging と別に生成
TRUST_PROXY_HOPS=3  # Railway のエッジ（2 段）→ frontend の nginx（1 段）

# Initial Admin（初回のシードの後にパスワードを変え、INITIAL_ADMIN_PASSWORD を削除する）
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<強力なパスワード>
INITIAL_ADMIN_DISPLAY_NAME=System Administrator
RUN_SEED=true

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
PORT=3000  # backend のドメインの向き先のポートと合わせる
MIGRATE_ON_DEPLOY=true

# ストレージ（Cloudflare R2）: STORAGE_TYPE=r2 と R2_*（環境変数設定を参照）
```

#### Frontend環境変数

```bash
# ビルド時: 画面が API を呼ぶ先 = frontend 自身の公開オリジン（API は nginx が中継する）
VITE_API_URL=https://<frontend のドメイン>
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# 実行時: API の中継先（必須。未設定・パス付きではコンテナが起動前の検査で止まる）
BACKEND_INTERNAL_URL=http://<backend のサービス名>.railway.internal:3000

# 実行時: セキュリティヘッダー（R2 を使う環境では CSP の 2 つが必須。HSTS は本番だけ）
CSP_IMG_SRC_EXTRA=https://<バケット名>.<アカウント ID>.r2.cloudflarestorage.com
CSP_CONNECT_SRC_EXTRA=https://<バケット名>.<アカウント ID>.r2.cloudflarestorage.com https://o<組織 ID>.ingest.sentry.io
NGINX_HSTS_VALUE=max-age=31536000; includeSubDomains
```

#### GitHub の環境シークレット（`production` 環境）

デプロイのジョブが使うのは Railway のトークン・サービス ID とヘルスチェックの URL だけである。DB・Redis・JWT・2FA・アーカイブの鍵・段数の本物の値は GitHub に登録しない（デプロイの前の `check:env` はダミーの値で変数の組と形だけを確かめ、Railway の実際の値は backend の起動時の検査が確かめる。是正計画 D9）。

- `RAILWAY_PRODUCTION_TOKEN`（Railway のプロジェクトトークン）
- `RAILWAY_BACKEND_SERVICE_ID`・`RAILWAY_FRONTEND_SERVICE_ID`
- `PRODUCTION_BACKEND_URL`・`PRODUCTION_FRONTEND_URL`（ヘルスチェック）

`RAILWAY_PROJECT_ID` はリポジトリの Secrets に置く。staging は同じものを `RAILWAY_STAGING_TOKEN`・`RAILWAY_BACKEND_STAGING_SERVICE_ID`・`RAILWAY_FRONTEND_STAGING_SERVICE_ID`・`STAGING_BACKEND_URL`・`STAGING_FRONTEND_URL` で `staging` 環境に登録する。以前登録していた `PRODUCTION_DATABASE_URL`・`PRODUCTION_REDIS_URL`・`PRODUCTION_JWT_PUBLIC_KEY`・`PRODUCTION_JWT_PRIVATE_KEY`・`PRODUCTION_TWO_FACTOR_ENCRYPTION_KEY`・`PRODUCTION_ARCHIVE_ENCRYPTION_KEY`・`PRODUCTION_TRUST_PROXY_HOPS`（staging は `STAGING_*`）と `SENTRY_DSN` は使われないため削除する。一覧は[CI/CD設定](cicd-github-actions.md#github-secretsの設定)。

### Step 2: データベースマイグレーション

`MIGRATE_ON_DEPLOY=true`・`RUN_SEED=true` のとき、backend の起動時にマイグレーションとシードが実行される。手動で行うときは backend のコンテナの中から実行する（Postgres の公開ネットワークを閉じているため、手元からの `railway run`・`railway connect` は届かない）。

```bash
railway ssh --service <backend のサービス名> --environment production
# 作業ディレクトリは /app
npm run prisma:migrate:deploy
node dist/prisma/seed.js
```

シードの後は[初回デプロイの後の後片づけ](secrets-management.md#初回デプロイの後の後片づけ必須)を行う。

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

デプロイ完了後、以下のスモークテストを実行（あわせて[配備の後の確認](railway-setup.md#配備の後の確認)の中継・CSP・送信元 IP の確認を行う）：

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
# Backend Service
SENTRY_DSN=<your-sentry-dsn>
SENTRY_ENVIRONMENT=production

# Frontend Service（ビルド時に埋め込まれるため、設定後は再ビルドが必要）
VITE_SENTRY_DSN=<your-sentry-dsn>
```

フロントエンドの送出処理（`frontend/src/utils/sentry.ts`）は常に配備されていますが、`VITE_SENTRY_DSN` を設定しない環境では即座に戻り、**送出は意図的に行われません**。

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
- [セキュリティ設計](../architecture/security-design.md)
