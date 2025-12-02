# CI/CD設定（GitHub Actions）

このドキュメントでは、GitHub ActionsによるCI/CDパイプラインの設定方法を説明します。

---

## 概要

ArchiTrackは、GitHub ActionsでCI/CDパイプラインを実装しています。

### ワークフロー

| ワークフロー | トリガー | 用途 |
|------------|---------|------|
| **CI** (`.github/workflows/ci.yml`) | PR作成・push時 | コード品質チェック・テスト |
| **CD - Staging** (`.github/workflows/cd-staging.yml`) | `develop`へのpush | Staging環境へ自動デプロイ |
| **CD - Production** (`.github/workflows/cd-production.yml`) | `main`へのpush | Production環境へ自動デプロイ |

---

## CI（継続的インテグレーション）

### 実行内容

1. **Lint & Format Check**: Prettier、ESLint
2. **Type Check**: TypeScript型チェック
3. **Unit Tests**: ユニットテスト + カバレッジ検証（80%以上）
4. **Build Test**: ビルド成功確認
5. **Integration & E2E Tests**: Docker環境で統合・E2Eテスト

### トリガー

- PRの作成・更新
- `main`、`develop`ブランチへのpush

### ワークフロー例

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  lint-and-format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Lint backend
        run: npm --prefix backend run lint
      - name: Format check backend
        run: npm --prefix backend run format:check
      - name: Lint frontend
        run: npm --prefix frontend run lint
      - name: Format check frontend
        run: npm --prefix frontend run format:check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run unit tests
        run: npm run test:coverage
      - name: Check coverage
        run: |
          # カバレッジ80%以上を確認
          npm run test:coverage:check
```

---

## CD（継続的デプロイ）

### GitHub Secretsの設定

リポジトリの **Settings > Secrets and variables > Actions** に以下を追加：

#### 共通設定

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_TOKEN` | Railway APIトークン | Railway Dashboard > Account Settings > Tokens |
| `RAILWAY_PROJECT_ID` | プロジェクトID | `railway status --json \| jq -r '.project.id'` |

#### Staging環境

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_BACKEND_STAGING_SERVICE_ID` | BackendサービスID（Staging） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `RAILWAY_FRONTEND_STAGING_SERVICE_ID` | FrontendサービスID（Staging） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `STAGING_BACKEND_URL` | BackendのURL（Staging） | Railway Dashboard で確認 |
| `STAGING_FRONTEND_URL` | FrontendのURL（Staging） | Railway Dashboard で確認 |

#### Production環境

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_BACKEND_SERVICE_ID` | BackendサービスID（Production） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `RAILWAY_FRONTEND_SERVICE_ID` | FrontendサービスID（Production） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `PRODUCTION_BACKEND_URL` | BackendのURL（Production） | Railway Dashboard で確認 |
| `PRODUCTION_FRONTEND_URL` | FrontendのURL（Production） | Railway Dashboard で確認 |

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
