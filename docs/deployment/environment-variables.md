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
| `NODE_ENV` | 実行環境 | 任意 | `development` | `production`。API ドキュメント（`/docs`）とエラー応答のスタックトレースは `development`・`test` と明示したときだけ有効（未設定では無効） |
| `TRUST_PROXY_HOPS` | 信頼する中継の段数（送信元 IP の識別。回数制限・監査ログに使う） | **本番で必須**（未設定では起動を止める） | `0`（中継を信頼しない） | 0 以上の整数。`true` などは起動時の検証で拒否。本番・staging は `3`（Railway のエッジが X-Forwarded-For に利用者の IP とエッジ自身の IP の 2 段を足し、frontend の nginx が 1 段を足す。2026-11-07 に staging で実測）。配備時に監査ログの送信元 IP と自分の公開 IP（`curl https://ifconfig.me`）の一致を確かめる |
| `ARCHIVE_ENCRYPTION_KEY` | 監査ログのアーカイブの暗号鍵（AES-256、64 桁の 16 進） | **本番で必須**（未設定・形式違いでは起動を止める） | なし | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。試験・CI の compose の固定値は本番で使わない |
| `JWT_ISSUER` | トークンの発行者（JWT の `iss`） | 任意 | `architrack` | 空・前後の空白は起動時の検証で拒否 |
| `JWT_AUDIENCE` | トークンの想定利用者（JWT の `aud`） | 任意 | `architrack-api` | 空・前後の空白は起動時の検証で拒否 |
| `LOG_LEVEL` | ログレベル | 任意 | `info` | `info`/`debug`/`error` |
| `SECURITY_ALERT_<種類>_THRESHOLD` | セキュリティ上の異常の検知の閾値（時間窓の件数がこれを超えると全システム管理者へ通知）。`<種類>` は `LOGIN_FAILED`・`PERMISSION_DENIED`（403 と閲覧範囲外のアクセスの合算）・`RATE_LIMITED`（429）・`SERVER_ERROR`（5xx）・`DATA_EXPORT`（利用者ごと） | 任意 | 20・30・100・20・50 | 正の整数。試験・CI の compose と ci.yml は E2E・統合テストの全件で超えない `1000000` |
| `SECURITY_ALERT_<種類>_WINDOW_SECONDS` | 同じ検知の時間窓（秒） | 任意 | `DATA_EXPORT` は 3600、他は 300 | 正の整数。計数は分単位の桶 |
| `SECURITY_ALERT_<種類>_COOLDOWN_SECONDS` | 同じ種類の通知を抑止する時間（秒）。`DATA_EXPORT` は利用者ごとに抑止する | 任意 | 1800 | 正の整数 |
| `SECURITY_ALERT_NOTIFICATION_LIMIT` | 異常の通知の総数の上限（時間窓あたりの通数）。超えた通知は送らず、次に送る通知の末尾に添えるか、時間窓が明けた後に定期処理が要約 1 通で送る | 任意 | 10 | 正の整数。試験・CI の compose と ci.yml は `1000000` |
| `SECURITY_ALERT_NOTIFICATION_WINDOW_SECONDS` | 異常の通知の総数の上限の時間窓（秒。固定の時間窓） | 任意 | 3600 | 正の整数 |
| `DISABLE_RATE_LIMIT` | レート制限無効化（開発・テスト用） | 任意 | `false` | `true`（ローカルのみ推奨） |
| `SENTRY_DSN` | Sentryエラートラッキング | 推奨 | なし | Sentry Project設定 |

### Storage Configuration

| 変数名 | 説明 | 必須度 | デフォルト値 | 備考 |
|--------|------|--------|--------------|------|
| `STORAGE_TYPE` | ストレージタイプ | 任意 | 自動判定 | `local` / `r2` |
| `LOCAL_STORAGE_PATH` | ローカルストレージのベースパス | **必須**（local） | なし | 例: `./storage` |
| `LOCAL_STORAGE_URL` | ローカルストレージの公開URL | 推奨（local） | なし | 例: `http://localhost:3000/storage` |
| `R2_ENDPOINT` | R2エンドポイントURL | **必須**（r2） | なし | Cloudflareアカウント設定で確認 |
| `R2_ACCESS_KEY_ID` | R2アクセスキーID | **必須**（r2） | なし | R2 APIトークンで生成 |
| `R2_SECRET_ACCESS_KEY` | R2シークレットアクセスキー | **必須**（r2） | なし | R2 APIトークンで生成 |
| `R2_BUCKET_NAME` | R2バケット名 | **必須**（r2） | なし | 例: `architrack-images` |
| `R2_PUBLIC_URL` | R2公開URL（CDN） | 任意 | なし | パブリックバケットの場合 |

> 詳細は[ストレージ構成](../architecture/storage-configuration.md)を参照してください。

### Frontend Service

| 変数名 | 説明 | 必須度 | デフォルト値 |
|--------|------|--------|--------------|
| `VITE_API_BASE_URL` | Backend APIのベースURL | **必須** | `http://localhost:3000` |
| `VITE_TOKEN_REFRESH_THRESHOLD` | トークン自動リフレッシュ閾値 | 任意 | `5m` |
| `VITE_SENTRY_DSN` | Sentryエラートラッキング（Frontend） | 推奨 | なし |
| `BACKEND_INTERNAL_URL` | API（`/api/`・`/csrf-token`）の中継先。`scheme://host[:port]` だけ（パス・クエリは不可）。未設定・形の違いはコンテナの起動前の検査で止まる | **必須**（実行時） | なし |
| `CSP_IMG_SRC_EXTRA` | CSP の `img-src` の追加の取得先（R2 の配信元など。空白区切り）。R2 を使う本番・staging は `https://<バケット名>.<アカウント ID>.r2.cloudflarestorage.com`（署名 URL のオリジン）。未設定では写真・PDF が画面に出ない | R2 を使う環境で**必須**（実行時） | 空 |
| `CSP_CONNECT_SRC_EXTRA` | CSP の `connect-src` の追加の取得先（R2 の配信元、Sentry の取り込み先など。空白区切り）。R2 は `CSP_IMG_SRC_EXTRA` と同じオリジン | R2 を使う環境で**必須**（実行時） | 空 |
| `NGINX_HSTS_VALUE` | `Strict-Transport-Security` の値。本番だけ設定する（空なら付けない） | 本番で推奨（実行時） | 空 |

> `VITE_` で始まる変数はViteが**ビルド時**にバンドルへ埋め込みます。実行中のコンテナに設定しても読まれないため、値を変えたら**フロントエンドの再ビルドが必要**です（`frontend/Dockerfile` の `ARG VITE_SENTRY_DSN` が受け口）。
> `VITE_SENTRY_DSN` が**未設定の環境では、`frontend/src/utils/sentry.ts` が即座に戻り、監視への送出は意図的に行われません**（送出処理そのものは常に配備されています）。

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

# レート制限（開発・テスト用）
DISABLE_RATE_LIMIT="true"

# ストレージ設定（ローカル開発用）
STORAGE_TYPE="local"
LOCAL_STORAGE_PATH="./storage"
LOCAL_STORAGE_URL="http://localhost:3000/storage"

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

# Sentry（任意。未設定なら送出は行われない）
# VITE_SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
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

# レート制限（本番環境では必ず有効化）
# DISABLE_RATE_LIMIT=false  # デフォルトfalse、設定不要（ローカル開発のみtrue推奨）

# ストレージ設定（Cloudflare R2）
STORAGE_TYPE=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<your-access-key-id>
R2_SECRET_ACCESS_KEY=<your-secret-access-key>
R2_BUCKET_NAME=architrack-images
# R2_PUBLIC_URL=https://images.your-domain.com  # パブリックバケットの場合（オプション）

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

# Sentry（推奨）
# ビルド時に埋め込まれるため、設定・変更後はフロントエンドの再デプロイ（再ビルド）が必要
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
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
