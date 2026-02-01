# CI/CD設定（GitHub Actions）

このドキュメントでは、GitHub ActionsによるCI/CDパイプラインの設定方法を説明します。

---

## 概要

ArchiTrackは、GitHub ActionsでCI/CDパイプラインを実装しています。すべてのCI/CDは単一の統合ワークフロー（`.github/workflows/ci.yml`）で管理されています。

### ワークフロー構成

```
ci.yml
├── Phase 1: 静的解析（並列実行）
│   ├── lint（backend, frontend, e2e - 3並列）
│   ├── typecheck（backend, frontend, e2e - 3並列）
│   ├── requirement-coverage（要件カバレッジ100%チェック）
│   └── security（セキュリティ監査）
│
├── Phase 2: 単体テスト（シャード分割 + blob reporter）
│   ├── test-unit-backend（4シャード並列、blob report出力）
│   ├── test-unit-frontend（4シャード並列、blob report出力）
│   └── test-unit-results（--merge-reportsで全シャード集約・カバレッジ80%チェック）
│
├── Phase 3: ビルド（並列実行）
│   └── build（backend, frontend - 2並列 + ES Module検証）
│
├── Phase 4: Storybookテスト ← needs: [lint, typecheck]
│   └── test-storybook（アクセシビリティ + カバレッジ80%）
│
├── Phase 5: 統合テスト
│   └── test-integration（Docker環境）
│
├── Phase 6: E2Eテスト（シャード分割 + blob reporter）← needs: [build, test-unit-results]
│   ├── test-e2e（4シャード並列、blob report出力）
│   └── test-e2e-results（merge-reportsで統合HTMLレポート生成）
│
├── Phase 7: CI成功判定
│   └── ci-success（フェーズ別ステータスをGitHub Job Summary出力）
│
└── Phase 8: デプロイ（CI成功後）
    ├── deploy-staging（developブランチ→Railway Staging）
    └── deploy-production（mainブランチ→Railway Production）
```

### パフォーマンス最適化

| 最適化手法 | 対象 | 効果 |
|-----------|------|------|
| **シャード分割** | 単体テスト、E2Eテスト | 4並列実行で実行時間を約1/4に短縮 |
| **単一テスト実行** | 単体テスト | カバレッジ付きテストを1回で実行（二重実行を排除） |
| **blob reporter + merge-reports** | 単体テスト、E2Eテスト | 全シャードのレポート・カバレッジを正確に集約 |
| **CI依存関係最適化** | E2E、Storybook | クリティカルパスの短縮（不要な待ち合わせを削除） |
| **Playwrightブラウザキャッシュ** | Storybook、E2E | ブラウザのダウンロード時間を削減 |
| **Prismaキャッシュ** | 全ジョブ | Prismaバイナリの再ダウンロードを回避 |
| **依存関係キャッシュ** | 全ジョブ | npm ciの実行時間を短縮 |
| **fail-fast: false** | マトリクスジョブ | 1シャードの失敗で他を中断しない |

### GitHub Job Summary

各ジョブの結果は GitHub Actions の **Job Summary** に出力され、PRページやActionsページで視覚的に確認できます。

| ジョブ | Summary内容 |
|-------|------------|
| requirement-coverage | 要件カバレッジチェック結果 |
| security | セキュリティ監査ポリシー |
| test-unit-results | Backend/Frontend カバレッジレポート（全シャードマージ済み） |
| test-storybook | Storybookカバレッジ |
| test-integration | 統合テスト結果（詳細テーブル） |
| test-e2e-results | E2E統合HTMLレポート（全シャードマージ済み） |
| ci-success | 全ジョブのフェーズ別ステータス一覧（Phase 1〜8） |

### トリガー

| イベント | 対象ブランチ | 実行内容 |
|---------|-------------|---------|
| **push** | main, develop | CI + CD（該当環境にデプロイ） |
| **pull_request** | main, develop | CIのみ |

---

## CI（継続的インテグレーション）

### 実行内容

1. **Lint & Format Check**: Prettier、ESLint（backend, frontend, e2e - 3並列）
2. **Type Check**: TypeScript型チェック（backend, frontend, e2e - 3並列）
3. **Requirement Coverage**: 要件カバレッジ100%チェック
4. **Security Scan**: npm audit によるセキュリティスキャン（allowlist対応）
5. **Unit Tests**: ユニットテスト（backend 4シャード + frontend 4シャード = 8並列）+ カバレッジ80%チェック
6. **Build Test**: ビルド成功確認 + ESモジュール検証（backend, frontend - 2並列）
7. **Storybook Tests**: コンポーネントテスト + アクセシビリティテスト + ストーリーカバレッジ80%チェック
8. **Integration Tests**: Docker環境（docker-compose.ci.yml）で統合テスト
9. **E2E Tests**: Playwright E2Eテスト（4シャード並列）

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

env:
  NODE_VERSION: '22'

jobs:
  # Phase 2: 単体テスト（シャード分割で並列実行 + blob reporter）
  test-unit-backend:
    name: Unit Tests Backend (shard ${{ matrix.shard }}/4)
    runs-on: ubuntu-latest
    needs: [typecheck]
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm --prefix backend ci
      # カバレッジ付きテストを1回で実行（blob reporterで結果出力）
      - name: Run unit tests with coverage (shard ${{ matrix.shard }}/4)
        run: npm --prefix backend run test:unit:coverage -- --shard=${{ matrix.shard }}/4 --reporter=blob --reporter=github-actions
      # blob reportをアーティファクトとしてアップロード
      - uses: actions/upload-artifact@v6
        if: ${{ !cancelled() }}
        with:
          name: backend-blob-shard-${{ matrix.shard }}
          path: backend/.vitest-reports/
          retention-days: 1

  # Phase 2: 結果集約（全シャードのblob reportをマージ）
  test-unit-results:
    name: Unit Test Results
    runs-on: ubuntu-latest
    needs: [test-unit-backend, test-unit-frontend]
    if: ${{ !cancelled() }}
    steps:
      # 全blob reportをダウンロード → Vitest --merge-reportsで集約
      - name: Merge backend test reports and coverage
        run: npx vitest --merge-reports --reporter=default --coverage

  # Phase 6: E2Eテスト（シャード分割で並列実行 + blob reporter）
  test-e2e:
    name: E2E Tests (shard ${{ matrix.shard }}/4)
    runs-on: ubuntu-latest
    needs: [build, test-unit-results]  # 依存関係を最適化
    if: github.actor != 'dependabot[bot]'
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v6
      # ... setup steps ...
      - name: Run E2E tests (shard ${{ matrix.shard }}/4)
        run: npx playwright test --shard=${{ matrix.shard }}/4
        env:
          CI: true
          BASE_URL: http://localhost:5173
      # blob reportをアーティファクトとしてアップロード
      - uses: actions/upload-artifact@v6
        if: ${{ !cancelled() }}
        with:
          name: e2e-blob-report-${{ matrix.shard }}
          path: blob-report/
          retention-days: 1

  # Phase 6: E2E結果集約（blob reportからHTML reportを生成）
  test-e2e-results:
    name: E2E Test Results
    needs: [test-e2e]
    if: ${{ !cancelled() }}
    steps:
      - name: Merge into HTML Report
        run: npx playwright merge-reports --reporter html ./all-blob-reports
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
