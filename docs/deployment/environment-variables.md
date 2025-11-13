# 環境変数設定

このドキュメントでは、ArchiTrackで使用する環境変数の設定方法を説明します。

---

## 必須環境変数チェックリスト

### Backend Service

| 変数名 | 説明 | 必須度 | デフォルト値 | 生成方法 |
|--------|------|--------|--------------|----------|
| `DATABASE_URL` | PostgreSQL接続文字列 | **必須** | なし | Railway自動設定 |
| `REDIS_URL` | Redis接続文字列 | 推奨 | なし | Railway自動設定 |
| `JWT_PUBLIC_KEY` | JWT検証用公開鍵（Base64エンコード） | **必須** | なし | [JWT鍵の生成](secrets-management.md#jwt鍵の生成) |
| `JWT_PRIVATE_KEY` | JWT署名用秘密鍵（Base64エンコード） | **必須** | なし | [JWT鍵の生成](secrets-management.md#jwt鍵の生成) |
| `TWO_FACTOR_ENCRYPTION_KEY` | 2FA秘密鍵暗号化用AES-256-GCM鍵 | **必須** | なし | [2FA鍵の生成](secrets-management.md#2fa暗号化鍵の生成) |
| `INITIAL_ADMIN_EMAIL` | 初期管理者メールアドレス | 推奨 | なし | 手動設定 |
| `INITIAL_ADMIN_PASSWORD` | 初期管理者パスワード | 推奨 | なし | 手動設定（12文字以上） |
| `INITIAL_ADMIN_DISPLAY_NAME` | 初期管理者表示名 | 任意 | `System Administrator` | 手動設定 |
| `ACCESS_TOKEN_EXPIRY` | アクセストークン有効期限 | 任意 | `15m` | 手動設定 |
| `REFRESH_TOKEN_EXPIRY` | リフレッシュトークン有効期限 | 任意 | `7d` | 手動設定 |
| `FRONTEND_URL` | フロントエンドURL（CORS設定用） | 任意 | `http://localhost:5173` | 手動設定 |
| `NODE_ENV` | 実行環境 | 任意 | `development` | `production` |
| `LOG_LEVEL` | ログレベル | 任意 | `info` | `info`/`debug`/`error` |
| `SENTRY_DSN` | Sentryエラートラッキング | 推奨 | なし | Sentry Project設定 |

### Frontend Service

| 変数名 | 説明 | 必須度 | デフォルト値 |
|--------|------|--------|--------------|
| `VITE_API_BASE_URL` | Backend APIのベースURL | **必須** | `http://localhost:3000` |
| `VITE_TOKEN_REFRESH_THRESHOLD` | トークン自動リフレッシュ閾値 | 任意 | `5m` |

---

## ローカル開発環境

### .envファイルの作成

```bash
# Backendの環境変数
cp backend/.env.example backend/.env

# Frontendの環境変数
cp frontend/.env.example frontend/.env
```

### Backend環境変数の設定

`backend/.env` を編集：

```bash
# データベース
DATABASE_URL="postgresql://user:password@localhost:5432/architrack"
REDIS_URL="redis://localhost:6379"

# JWT鍵（生成方法は「シークレット管理」参照）
JWT_PUBLIC_KEY="<Base64エンコードされた公開鍵>"
JWT_PRIVATE_KEY="<Base64エンコードされた秘密鍵>"

# 2FA暗号化鍵（生成方法は「シークレット管理」参照）
TWO_FACTOR_ENCRYPTION_KEY="<64文字16進数>"

# トークン有効期限
ACCESS_TOKEN_EXPIRY="15m"
REFRESH_TOKEN_EXPIRY="7d"

# CORS設定
FRONTEND_URL="http://localhost:5173"

# 環境
NODE_ENV="development"
LOG_LEVEL="debug"

# 初期管理者アカウント（任意）
INITIAL_ADMIN_EMAIL="admin@example.com"
INITIAL_ADMIN_PASSWORD="YourStrongPassword123!"
INITIAL_ADMIN_DISPLAY_NAME="System Administrator"

# Sentry（任意）
SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
```

### Frontend環境変数の設定

`frontend/.env` を編集：

```bash
# Backend API URL
VITE_API_BASE_URL="http://localhost:3000"

# トークンリフレッシュ閾値
VITE_TOKEN_REFRESH_THRESHOLD="5m"
```

---

## Railway環境

### Backend Service設定

Railway Dashboard > Backend Service > Variables に以下を追加：

```bash
# データベース（Railway自動設定）
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# JWT鍵
JWT_PUBLIC_KEY=<Base64エンコードされた公開鍵>
JWT_PRIVATE_KEY=<Base64エンコードされた秘密鍵>

# 2FA暗号化鍵
TWO_FACTOR_ENCRYPTION_KEY=<64文字16進数>

# トークン有効期限
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# CORS設定
FRONTEND_URL=https://your-frontend.railway.app

# 環境
NODE_ENV=production
LOG_LEVEL=info

# 初期管理者アカウント
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<強力なパスワード>
INITIAL_ADMIN_DISPLAY_NAME=System Administrator

# Sentry
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# デプロイ時マイグレーション自動実行（推奨）
MIGRATE_ON_DEPLOY=true
```

### Frontend Service設定

Railway Dashboard > Frontend Service > Variables に以下を追加：

```bash
# Backend API URL
VITE_API_BASE_URL=https://your-backend.railway.app

# トークンリフレッシュ閾値
VITE_TOKEN_REFRESH_THRESHOLD=5m
```

---

## CI/CD環境（GitHub Actions）

### GitHub Secretsの設定

リポジトリの Settings > Secrets and variables > Actions に以下を追加：

**共通設定:**

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_TOKEN` | Railway APIトークン | Railway Dashboard > Account Settings > Tokens |
| `RAILWAY_PROJECT_ID` | プロジェクトID | `railway status --json \| jq -r '.project.id'` |

**Staging環境:**

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_BACKEND_STAGING_SERVICE_ID` | BackendサービスID（Staging） | `railway status --json \| jq -r '.services[] \| select(.name=="backend-staging") \| .id'` |
| `RAILWAY_FRONTEND_STAGING_SERVICE_ID` | FrontendサービスID（Staging） | `railway status --json \| jq -r '.services[] \| select(.name=="frontend-staging") \| .id'` |
| `STAGING_BACKEND_URL` | BackendのURL（Staging） | Railway Dashboard で確認 |
| `STAGING_FRONTEND_URL` | FrontendのURL（Staging） | Railway Dashboard で確認 |

**Production環境:**

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_BACKEND_SERVICE_ID` | BackendサービスID（Production） | `railway status --json \| jq -r '.services[] \| select(.name=="backend") \| .id'` |
| `RAILWAY_FRONTEND_SERVICE_ID` | FrontendサービスID（Production） | `railway status --json \| jq -r '.services[] \| select(.name=="frontend") \| .id'` |
| `PRODUCTION_BACKEND_URL` | BackendのURL（Production） | Railway Dashboard で確認 |
| `PRODUCTION_FRONTEND_URL` | FrontendのURL（Production） | Railway Dashboard で確認 |

詳細は[CI/CD設定](cicd-github-actions.md)を参照してください。

---

## セキュリティ注意事項

### Gitにコミットしない

- `.env`ファイルは絶対にGitにコミットしない
- `.gitignore`で除外されていることを確認
- 誤ってコミットした場合は、即座に鍵をローテーション

### 強力なパスワード・鍵を使用

- JWT鍵: EdDSA（Ed25519）を使用
- 2FA暗号化鍵: 256ビット（64文字16進数）
- 初期管理者パスワード: 12文字以上、複雑性要件を満たす

### シークレットローテーション

- JWT鍵: 90日周期（推奨）
- 2FA暗号化鍵: 必要時（全ユーザーの2FA設定が無効化されるため慎重に）

詳細は[シークレット管理](secrets-management.md)を参照してください。

---

## トラブルシューティング

環境変数の設定に問題がある場合は、[トラブルシューティング](troubleshooting.md)を参照してください。

---

## 次のステップ

- [シークレット管理](secrets-management.md): JWT鍵・2FA鍵の生成
- [Railway設定](railway-setup.md): Railwayプロジェクトの作成
- [CI/CD設定](cicd-github-actions.md): GitHub Actionsの設定
