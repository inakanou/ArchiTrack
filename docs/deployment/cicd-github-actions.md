# CI/CD設定（GitHub Actions）

このドキュメントでは、GitHub ActionsによるCI/CDパイプラインの設定方法を説明します。

---

## 概要

ArchiTrackは、GitHub ActionsでCI/CDパイプラインを実装しています。すべてのCI/CDは単一の統合ワークフロー（`.github/workflows/ci.yml`）で管理されています。

### ワークフロー構成

```
ci.yml
├── CI Jobs（並列実行）
│   ├── lint（backend, frontend, e2e）
│   ├── requirement-coverage
│   ├── typecheck（backend, frontend, e2e）
│   ├── test-unit（backend, frontend）
│   ├── build（backend, frontend）
│   └── security（backend, frontend）
├── test-storybook（lint, typecheck, build 完了後）
├── test-integration（全CI Jobs完了後）
└── CD Jobs（CI成功後）
    ├── deploy-staging（developブランチ）
    └── deploy-production（mainブランチ）
```

### トリガー

| イベント | 対象ブランチ | 実行内容 |
|---------|-------------|---------|
| **push** | main, develop | CI + CD（該当環境にデプロイ） |
| **pull_request** | main, develop | CIのみ |

---

## CI（継続的インテグレーション）

### 実行内容

1. **Lint & Format Check**: Prettier、ESLint（backend, frontend, e2e並列）
2. **Requirement Coverage**: 要件カバレッジ100%チェック
3. **Type Check**: TypeScript型チェック（backend, frontend, e2e並列）
4. **Unit Tests**: ユニットテスト + カバレッジ（backend, frontend並列）
5. **Build Test**: ビルド成功確認 + ESモジュール検証
6. **Storybook Tests**: コンポーネントテスト（Playwright使用）
7. **Integration & E2E Tests**: Docker環境（docker-compose.ci.yml）で統合・E2Eテスト
8. **Security Scan**: npm audit によるセキュリティスキャン

### CI環境のDocker構成

CI環境では `docker-compose.ci.yml` を使用します。標準ポート（5432, 6379, 3000, 5173）を使用し、データは一時ファイルシステム（tmpfs）に保存されます。

```bash
# CI環境と同じ構成でローカルテスト
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
```

### トリガー

- PRの作成・更新
- `main`、`develop`ブランチへのpush

### ワークフロー例（抜粋）

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint & Format Check
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [backend, frontend, e2e]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm --prefix ${{ matrix.workspace }} ci
      - run: npm --prefix ${{ matrix.workspace }} run format:check
      - run: npm --prefix ${{ matrix.workspace }} run lint

  test-integration:
    name: Integration & E2E Tests
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test-unit, build, test-storybook]
    if: github.actor != 'dependabot[bot]'
    steps:
      # ... 省略 ...
      - name: Start Docker Compose for E2E
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
          timeout 120 bash -c 'until docker ps | grep -q "healthy.*architrack-backend"; do sleep 2; done'
          timeout 120 bash -c 'until docker ps | grep -q "healthy.*architrack-frontend"; do sleep 2; done'
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true
          BASE_URL: http://localhost:5173
```

詳細は `.github/workflows/ci.yml` を参照してください。

---

## CD（継続的デプロイ）

### GitHub Secretsの設定

リポジトリの **Settings > Secrets and variables > Actions** に以下を追加：

#### テスト用（CI必須）

| Secret名 | 説明 | 生成方法 |
|---------|------|---------|
| `TEST_JWT_PUBLIC_KEY` | テスト用JWT公開鍵 | `npm --prefix backend run generate-keys` |
| `TEST_JWT_PRIVATE_KEY` | テスト用JWT秘密鍵 | `npm --prefix backend run generate-keys` |
| `TEST_TWO_FACTOR_ENCRYPTION_KEY` | テスト用2FA暗号化キー | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

#### 共通設定

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_TOKEN` | Railway APIトークン | Railway Dashboard > Account Settings > Tokens |
| `RAILWAY_PROJECT_ID` | プロジェクトID | `railway status --json \| jq -r '.project.id'` |

#### Staging環境

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_STAGING_TOKEN` | Staging用Railwayトークン | Railway Dashboard > Account Settings > Tokens |
| `RAILWAY_BACKEND_STAGING_SERVICE_ID` | BackendサービスID（Staging） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `RAILWAY_FRONTEND_STAGING_SERVICE_ID` | FrontendサービスID（Staging） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `STAGING_BACKEND_URL` | BackendのURL（Staging） | Railway Dashboard で確認 |
| `STAGING_FRONTEND_URL` | FrontendのURL（Staging） | Railway Dashboard で確認 |
| `STAGING_DATABASE_URL` | データベースURL（Staging） | Railway Dashboard で確認 |
| `STAGING_REDIS_URL` | RedisURL（Staging） | Railway Dashboard で確認 |
| `STAGING_JWT_PUBLIC_KEY` | JWT公開鍵（Staging） | 本番用に別途生成 |
| `STAGING_JWT_PRIVATE_KEY` | JWT秘密鍵（Staging） | 本番用に別途生成 |
| `STAGING_TWO_FACTOR_ENCRYPTION_KEY` | 2FA暗号化キー（Staging） | 本番用に別途生成 |

#### Production環境

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_PRODUCTION_TOKEN` | Production用Railwayトークン | Railway Dashboard > Account Settings > Tokens |
| `RAILWAY_BACKEND_SERVICE_ID` | BackendサービスID（Production） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `RAILWAY_FRONTEND_SERVICE_ID` | FrontendサービスID（Production） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `PRODUCTION_BACKEND_URL` | BackendのURL（Production） | Railway Dashboard で確認 |
| `PRODUCTION_FRONTEND_URL` | FrontendのURL（Production） | Railway Dashboard で確認 |
| `PRODUCTION_DATABASE_URL` | データベースURL（Production） | Railway Dashboard で確認 |
| `PRODUCTION_REDIS_URL` | RedisURL（Production） | Railway Dashboard で確認 |
| `PRODUCTION_JWT_PUBLIC_KEY` | JWT公開鍵（Production） | 本番用に別途生成 |
| `PRODUCTION_JWT_PRIVATE_KEY` | JWT秘密鍵（Production） | 本番用に別途生成 |
| `PRODUCTION_TWO_FACTOR_ENCRYPTION_KEY` | 2FA暗号化キー（Production） | 本番用に別途生成 |

### CD - Staging

#### トリガー

- `develop`ブランチへのpush
- 手動実行（workflow_dispatch）

#### 実行内容

1. Railway CLIでStaging環境のBackendサービスをデプロイ
2. Railway CLIでStaging環境のFrontendサービスをデプロイ
3. ヘルスチェック実行

#### ワークフロー例

```yaml
# .github/workflows/cd-staging.yml
name: CD - Staging

on:
  push:
    branches: [develop]
  workflow_dispatch:

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy Backend to Staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway link --project ${{ secrets.RAILWAY_PROJECT_ID }} --service ${{ secrets.RAILWAY_BACKEND_STAGING_SERVICE_ID }}
          railway up --detach

      - name: Deploy Frontend to Staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway link --project ${{ secrets.RAILWAY_PROJECT_ID }} --service ${{ secrets.RAILWAY_FRONTEND_STAGING_SERVICE_ID }}
          railway up --detach

      - name: Health Check
        run: |
          sleep 30
          curl -f ${{ secrets.STAGING_BACKEND_URL }}/health || exit 1
```

### CD - Production

#### トリガー

- `main`ブランチへのpush
- 手動実行（workflow_dispatch）

#### 実行内容

1. Railway CLIでProduction環境のBackendサービスをデプロイ
2. Railway CLIでProduction環境のFrontendサービスをデプロイ
3. ヘルスチェック実行

#### ワークフロー例

```yaml
# .github/workflows/cd-production.yml
name: CD - Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy Backend to Production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway link --project ${{ secrets.RAILWAY_PROJECT_ID }} --service ${{ secrets.RAILWAY_BACKEND_SERVICE_ID }}
          railway up --detach

      - name: Deploy Frontend to Production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway link --project ${{ secrets.RAILWAY_PROJECT_ID }} --service ${{ secrets.RAILWAY_FRONTEND_SERVICE_ID }}
          railway up --detach

      - name: Health Check
        run: |
          sleep 30
          curl -f ${{ secrets.PRODUCTION_BACKEND_URL }}/health || exit 1
```

---

## 手動デプロイ

### GitHub UIから実行

1. **Actionsタブを開く**
   - GitHub リポジトリ > **Actions**

2. **ワークフローを選択**
   - Staging: **"CD - Staging"**
   - Production: **"CD - Production"**

3. **Run workflow**
   - **"Run workflow"** ボタンをクリック
   - ブランチ選択（`develop` または `main`）
   - **"Run workflow"** で実行

### GitHub CLIから実行

```bash
# Staging環境へデプロイ
gh workflow run "CD - Staging" --ref develop

# Production環境へデプロイ
gh workflow run "CD - Production" --ref main
```

---

## CI/CDログの確認

### GitHub UI

1. **Actionsタブを開く**
   - GitHub リポジトリ > **Actions**

2. **ワークフロー実行を選択**
   - 実行したいワークフローをクリック

3. **ジョブログを確認**
   - 各ジョブのログを展開して確認

### GitHub CLI

```bash
# 最新のワークフロー実行を確認
gh run list

# 特定のワークフロー実行のログを表示
gh run view <run-id> --log
```

---

## トラブルシューティング

### CI失敗時

1. **ログを確認**
   - GitHub Actions > 失敗したワークフロー > ログ確認

2. **ローカルで再現**
   ```bash
   # Lint・Format・型チェック
   npm run lint
   npm run format:check
   npm run type-check

   # テスト実行
   npm run test:coverage
   ```

3. **修正してプッシュ**
   ```bash
   git add .
   git commit -m "fix: CI失敗を修正"
   git push
   ```

### CD失敗時

1. **Railway環境変数を確認**
   - [環境変数設定](environment-variables.md)

2. **Railway CLI で手動デプロイ**
   ```bash
   railway link
   railway up
   ```

3. **ヘルスチェック確認**
   ```bash
   curl https://<backend-url>/health
   ```

詳細は[トラブルシューティング](troubleshooting.md)を参照してください。

---

## 次のステップ

- [デプロイ概要](overview.md): デプロイフロー
- [Railway設定](railway-setup.md): Railwayプロジェクトの作成
- [環境変数設定](environment-variables.md): 環境変数の設定
