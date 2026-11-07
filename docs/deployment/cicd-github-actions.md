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
│   ├── requirement-coverage（要件カバレッジ100%チェック）
│   ├── typecheck（backend, frontend, e2e）
│   ├── test-unit（backend, frontend + カバレッジ80%チェック）
│   ├── build（backend, frontend + ES Module検証）
│   └── security（セキュリティ監査）
├── test-storybook（lint, typecheck, build 完了後）
│   ├── Storybookテスト（アクセシビリティ含む）
│   └── Storybookストーリーカバレッジチェック（80%ターゲット）
├── test-integration（全CI Jobs + test-storybook + requirement-coverage 完了後）
│   ├── 統合テスト（Docker環境）
│   └── E2Eテスト（Playwright）
└── CD Jobs（ci-success後）
    ├── deploy-staging（developブランチ→Railway Staging）
    └── deploy-production（mainブランチ→Railway Production）
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
4. **Unit Tests**: ユニットテスト + カバレッジ80%チェック（backend, frontend並列）
5. **Build Test**: ビルド成功確認 + ESモジュール検証（backend）
6. **Storybook Tests**: コンポーネントテスト + アクセシビリティテスト + ストーリーカバレッジ80%チェック
7. **Integration & E2E Tests**: Docker環境（docker-compose.ci.yml）で統合・E2Eテスト
8. **Security Scan**: npm audit によるセキュリティスキャン（allowlist対応）

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
| `RAILWAY_PROJECT_ID` | プロジェクトID | `railway status --json \| jq -r '.project.id'` |

> 環境ごとの Secrets（下の Staging・Production）は Settings > Environments の `staging`・`production` の環境シークレットに置く（`deploy-staging`・`deploy-production` のジョブはその環境で動く）。
> Secrets の名前には `STAGING_`・`PRODUCTION_` の接頭辞が付くが、**Railway の変数の名前には付けない**（[変数名の注意](environment-variables.md#railwayの変数名の注意)）。
> DB・Redis・JWT・2FA・アーカイブの鍵・段数の本物の値は GitHub に置かない（Railway の変数だけに置く）。下の「デプロイの前の環境変数の検査」を参照。

#### Staging環境

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_STAGING_TOKEN` | Staging用Railwayトークン（プロジェクトトークン） | Railway Dashboard > Project Settings > Tokens で staging 環境を選んで作成 |
| `RAILWAY_BACKEND_STAGING_SERVICE_ID` | BackendサービスID（Staging） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `RAILWAY_FRONTEND_STAGING_SERVICE_ID` | FrontendサービスID（Staging） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `STAGING_BACKEND_URL` | BackendのURL（Staging）。ヘルスチェックに使う | Railway Dashboard で確認 |
| `STAGING_FRONTEND_URL` | FrontendのURL（Staging）。ヘルスチェックに使う | Railway Dashboard で確認 |

#### Production環境

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `RAILWAY_PRODUCTION_TOKEN` | Production用Railwayトークン（プロジェクトトークン） | Railway Dashboard > Project Settings > Tokens で production 環境を選んで作成 |
| `RAILWAY_BACKEND_SERVICE_ID` | BackendサービスID（Production） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `RAILWAY_FRONTEND_SERVICE_ID` | FrontendサービスID（Production） | [Railway設定](railway-setup.md#github-secrets用のid取得) |
| `PRODUCTION_BACKEND_URL` | BackendのURL（Production）。ヘルスチェックに使う | Railway Dashboard で確認 |
| `PRODUCTION_FRONTEND_URL` | FrontendのURL（Production）。ヘルスチェックに使う | Railway Dashboard で確認 |

#### デプロイの前の環境変数の検査（ダミー値）

デプロイのジョブの「Check environment variables (format only, dummy values)」は、本物の秘密を GitHub に複製せず、実行ごとに作るダミーの値（EdDSA の鍵は `backend/scripts/generate-eddsa-keys.ts --env-format`、2FA・アーカイブの鍵はランダムな 64 桁の 16 進、`DATABASE_URL`・`REDIS_URL` は固定のダミー、`FRONTEND_URL=https://example.invalid`、`TRUST_PROXY_HOPS=3`）で `npm --prefix backend run check:env`（`NODE_ENV=production`）を通す。確かめるのは、本番の起動時の検査が求める変数の組と形だけである（是正計画 D9、2026-11-07）。

Railway に設定した実際の値は、backend の起動時に同じ検査が確かめる。通らなければ新しいデプロイが `SUCCESS` にならず、`scripts/railway-deploy-wait.sh` がジョブを失敗させる。

> 以前は `check:env` のために `STAGING_`・`PRODUCTION_` の `DATABASE_URL`・`REDIS_URL`・`JWT_PUBLIC_KEY`・`JWT_PRIVATE_KEY`・`TWO_FACTOR_ENCRYPTION_KEY`・`ARCHIVE_ENCRYPTION_KEY`・`TRUST_PROXY_HOPS` と `SENTRY_DSN` を GitHub Secrets に登録していた。これらはもう使わないため、GitHub の Settings（リポジトリと `staging`・`production` の環境）から削除する。短い値の Secret（`STAGING_TRUST_PROXY_HOPS="3"`）があると GitHub は CI のログの `3` をすべて `***` に伏せるため、削除でこれも直る。Railway の変数（`TRUST_PROXY_HOPS=3`・`ARCHIVE_ENCRYPTION_KEY` など）は変えない。

### CD - Staging

#### トリガー

- `develop`ブランチへのpush（CI の全ジョブの合格の後。`ci.yml` の `deploy-staging` ジョブ）

#### 実行内容

1. 環境変数の検査（`check:env`。ダミー値で変数の組と形だけを確かめる）
2. Railway CLIでStaging環境のBackend・Frontendのサービスのデプロイを開始する（`railway up --detach`）
3. 新しいデプロイが Railway のヘルスチェックに合格する（状態が `SUCCESS`）まで待つ（`scripts/railway-deploy-wait.sh`。`FAILED`・`CRASHED`・置き換え・時間切れはジョブの失敗）
4. 公開ドメインへのヘルスチェック実行

`railway up --detach` はデプロイの開始だけで戻る。待たずにヘルスチェックをすると、新しい版が起動に失敗していても古い版が応答して合格してしまうため、新しいデプロイの状態を ID で追ってから確かめる。

#### ワークフロー例

```yaml
# .github/workflows/ci.yml の deploy-staging ジョブ（簡略化した抜粋）
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    needs: [ci-success]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    environment:
      name: staging
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Staging and wait for Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_STAGING_TOKEN }}
          RAILWAY_PROJECT_ID: ${{ secrets.RAILWAY_PROJECT_ID }}
        run: |
          # デプロイを開始し、新しいデプロイが SUCCESS になるまで待つ（実際の ci.yml は backend・frontend を並行に待つ）
          bash scripts/railway-deploy-wait.sh "${{ secrets.RAILWAY_BACKEND_STAGING_SERVICE_ID }}" staging
          bash scripts/railway-deploy-wait.sh "${{ secrets.RAILWAY_FRONTEND_STAGING_SERVICE_ID }}" staging

      - name: Health Check
        run: curl -f ${{ secrets.STAGING_BACKEND_URL }}/health || exit 1
```

### CD - Production

#### トリガー

- `main`ブランチへのpush（CI の全ジョブの合格の後。`ci.yml` の `deploy-production` ジョブ）

#### 実行内容

1. 環境変数の検査（`check:env`。ダミー値で変数の組と形だけを確かめる）
2. Railway CLIでProduction環境のBackend・Frontendのサービスのデプロイを開始する（`railway up --detach`）
3. 新しいデプロイが Railway のヘルスチェックに合格する（状態が `SUCCESS`）まで待つ（`scripts/railway-deploy-wait.sh`。`FAILED`・`CRASHED`・置き換え・時間切れはジョブの失敗）
4. 公開ドメインへのヘルスチェック実行

`railway up --detach` はデプロイの開始だけで戻る。待たずにヘルスチェックをすると、新しい版が起動に失敗していても古い版が応答して合格してしまうため、新しいデプロイの状態を ID で追ってから確かめる。

#### ワークフロー例

```yaml
# .github/workflows/ci.yml の deploy-production ジョブ（簡略化した抜粋）
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    needs: [ci-success]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment:
      name: production
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Production and wait for Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_PRODUCTION_TOKEN }}
          RAILWAY_PROJECT_ID: ${{ secrets.RAILWAY_PROJECT_ID }}
        run: |
          # デプロイを開始し、新しいデプロイが SUCCESS になるまで待つ（実際の ci.yml は backend・frontend を並行に待つ）
          bash scripts/railway-deploy-wait.sh "${{ secrets.RAILWAY_BACKEND_SERVICE_ID }}" production
          bash scripts/railway-deploy-wait.sh "${{ secrets.RAILWAY_FRONTEND_SERVICE_ID }}" production

      - name: Health Check
        run: curl -f ${{ secrets.PRODUCTION_BACKEND_URL }}/health || exit 1
```

---

## 手動デプロイ

`ci.yml` は `workflow_dispatch` を持たない。デプロイをやり直すときは、対象のブランチ（`develop`・`main`）への push で動いた CI の実行の、デプロイのジョブを再実行する。

### GitHub UIから実行

1. GitHub リポジトリ > **Actions** > **CI** で、対象のブランチの最新の実行を開く
2. **Re-run jobs** > **Re-run failed jobs**（または `deploy-staging`・`deploy-production` のジョブを選んで再実行）

### GitHub CLIから実行

```bash
# 対象のブランチの実行を探す
gh run list --workflow ci.yml --branch develop --limit 5

# 失敗したジョブを再実行する
gh run rerun <run-id> --failed
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
