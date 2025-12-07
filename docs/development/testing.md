# テスト戦略

このドキュメントでは、ArchiTrackのテスト戦略、テストの種類、実行方法について説明します。

---

## テストピラミッド

ArchiTrackでは、3層のテストアプローチを採用しています：

```
        ┌─────────────────┐
        │   E2E Tests     │  少数・高価値
        │   (Playwright)  │  システム全体の動作確認
        └─────────────────┘
              ↑
     ┌────────────────────┐
     │ Integration Tests  │  中量・ビジネスロジック
     │ (Vitest)           │  API・DB統合テスト
     └────────────────────┘
              ↑
   ┌──────────────────────────┐
   │     Unit Tests           │  多数・高速
   │     (Vitest)             │  関数・コンポーネント単位
   └──────────────────────────┘
```

---

## 1. ユニットテスト（Unit Tests）

**目的**: 個別の関数・コンポーネント・モジュールの動作を検証

**ツール**: Vitest + React Testing Library

**カバレッジ目標**: 80%以上（statements/branches/functions/lines）

### 実行方法

```bash
# Backend
npm --prefix backend run test:unit
npm --prefix backend run test:unit:coverage

# Frontend
npm --prefix frontend run test
npm --prefix frontend run test:coverage
```

### テストファイル配置

- Backend: `backend/src/**/*.test.ts`
- Frontend: `frontend/src/**/*.test.tsx`

### 例

```typescript
// backend/src/utils/validation.test.ts
describe('validateEmail', () => {
  it('有効なメールアドレスを検証', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('無効なメールアドレスを拒否', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
});
```

---

## 2. 統合テスト（Integration Tests）

**目的**: 複数のモジュール・システムの統合動作を検証

**ツール**: Vitest + Supertest (Backend) / React Testing Library (Frontend)

### 実行方法

```bash
# Backend統合テスト（開発環境のDocker内で実行）
docker exec architrack-backend-dev npm run test:integration

# テスト環境で実行する場合
docker exec architrack-backend-test npm run test:integration
```

### テストファイル配置

- Backend: `backend/src/__tests__/integration/**/*.test.ts`
- Frontend: `frontend/src/__tests__/integration/**/*.test.tsx`

### 例

```typescript
// backend/src/__tests__/integration/api.test.ts
describe('POST /api/adr', () => {
  it('新しいADRを作成できる', async () => {
    const response = await request(app)
      .post('/api/adr')
      .send({ title: 'Test ADR', content: 'Content' })
      .expect(201);

    expect(response.body).toHaveProperty('id');
  });
});
```

---

## 3. E2Eテスト（End-to-End Tests）

**目的**: ユーザー視点でシステム全体の動作を検証

**ツール**: Playwright (Chromium)

### テスト環境のセットアップ

```bash
# 1. プロジェクトルートで依存関係をインストール
npm install
# ↑ postinstallフックでPlaywright Chromiumが自動インストールされます

# 2. システム依存関係をインストール（WSL2/Linuxの場合、初回のみ）
sudo npx playwright install-deps chromium
```

### テスト環境の種類

ArchiTrackには、E2Eテスト用に複数の環境が用意されています：

| 環境 | 用途 | ポート |
|------|------|--------|
| **開発環境** | ローカル画面打鍵 | Backend: 3000、Frontend: 5173 |
| **テスト環境** | ローカル自動テスト | Backend: 3100、Frontend: 5174 |
| **CI環境** | GitHub Actions | Backend: 3000、Frontend: 5173 |

### 実行方法

#### 基本的なテスト実行（開発環境を使用）

```bash
# 開発環境を起動
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d

# E2Eテストを実行
npm run test:e2e
```

#### テスト環境で実行（推奨：開発環境と同時実行可能）

```bash
# テスト環境を起動（開発環境とポートが異なる）
docker compose -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d

# E2Eテストを実行（テスト環境のポートを指定）
BASE_URL=http://localhost:5174 npm run test:e2e
```

#### UIモードで実行（対話的）

```bash
npm run test:e2e:ui
```

#### ヘッドフルモード（ブラウザを表示）

```bash
npm run test:e2e:headed
```

#### デバッグモード

```bash
npm run test:e2e:debug
```

#### レポートの確認

```bash
# 最新のレポートを表示
npm run test:e2e:report
```

### テスト結果の管理

テスト実行時、結果はタイムスタンプ付きディレクトリに保存されます：

```
playwright-report/
└── 2025-11-01_03-32-57-560Z/    # タイムスタンプ付きレポート
    └── index.html

test-results/
└── 2025-11-01_03-32-57-560Z/    # タイムスタンプ付き結果
    ├── screenshots/              # 失敗時のスクリーンショット
    └── videos/                   # 失敗時のビデオ
```

### Claude Codeから直接ブラウザを操作

#### スクリーンショット撮影

```bash
node e2e/helpers/browser.js screenshot http://localhost:5173 screenshot.png
```

#### ページ情報取得

```bash
node e2e/helpers/browser.js info http://localhost:5173
```

#### APIテスト

```bash
node e2e/helpers/browser.js api http://localhost:3000/api/health
```

### テストファイルの追加

テストは適切なカテゴリに分けて配置：

```
e2e/specs/
├── api/              # APIエンドポイントのテスト
├── ui/               # UIコンポーネントとページのテスト
└── integration/      # システム統合テスト
```

**UIテストの例:**
```javascript
// e2e/specs/ui/new-feature.spec.js
import { test, expect } from '@playwright/test';

test.describe('新機能', () => {
  test('テスト名', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ArchiTrack/);
  });
});
```

**特定カテゴリのみ実行:**
```bash
npx playwright test api/      # APIテストのみ
npx playwright test ui/       # UIテストのみ
npx playwright test integration/  # 統合テストのみ
```

---

## Storybookテスト

**目的**: UIコンポーネントのビジュアルテストとインタラクションテスト

**ツール**: Storybook + Test Runner

### 実行方法

```bash
# Storybookを起動（インタラクティブ確認）
npm --prefix frontend run storybook

# Test Runnerでストーリーを自動テスト
# - レンダリングテスト
# - アクセシビリティテスト（WCAG 2.1 AA準拠）
npm --prefix frontend run test-storybook

# CI/CD用（Storybookを起動してテスト実行後に自動終了）
npm --prefix frontend run test-storybook:ci
```

---

## カバレッジレポート

テストカバレッジは以下の方法で確認できます：

```bash
# すべてのカバレッジを取得
npm run test:coverage

# カバレッジレポート（HTML）
# backend/coverage/index.html
# frontend/coverage/index.html
```

**カバレッジ目標:**
- **statements**: 80%以上
- **branches**: 80%以上
- **functions**: 80%以上
- **lines**: 80%以上

---

## 要件カバレッジ（Requirements Traceability）

ArchiTrackでは、要件定義書（`.kiro/specs/`）とコード・テストの紐付けを管理する「要件カバレッジ」機能を提供しています。

### 概要

要件カバレッジは、以下を自動的に検証します：

1. `.kiro/specs/`配下の機能を自動検出
2. 各機能の要件定義書から全要件ID・受入基準を抽出
3. コード・テストファイルから要件参照タグを抽出
4. 機能別および全体でカバレッジ率を計算

### 要件参照タグのフォーマット

コードやテストに要件を紐付けるには、以下の形式を使用します：

```
@requirement {feature-name}/REQ-{N}.{M}
```

**形式の説明:**
- `{feature-name}`: `.kiro/specs/`配下のディレクトリ名（例: `user-authentication`, `project-management`）
- `REQ-{N}`: 要件番号（例: `REQ-4`, `REQ-10`）
- `.{M}`: 受入基準番号（任意、例: `.1`, `.5`）

**例:**
```typescript
/**
 * @fileoverview 認証サービス
 *
 * Requirements (user-authentication):
 * - REQ-4.1: ログイン成功時にアクセストークンとリフレッシュトークンを発行
 * - REQ-4.4: 環境変数ACCESS_TOKEN_EXPIRYで設定された有効期限を持つアクセストークンを発行
 */

/**
 * @requirement user-authentication/REQ-4.1: ログイン成功時トークン発行
 */
async function login(email: string, password: string) {
  // 実装...
}
```

**テストでの使用例:**
```typescript
describe('ログイン機能', () => {
  /**
   * @requirement user-authentication/REQ-4.1
   */
  it('有効な認証情報でトークンを発行する (user-authentication/REQ-4.1)', async () => {
    // テスト実装...
  });
});
```

### サポートされるタグ形式

| 形式 | 例 | 用途 |
|------|-----|------|
| `@requirement` | `@requirement user-authentication/REQ-4.1` | JSDocコメント、コード内 |
| 括弧形式 | `(user-authentication/REQ-4.1)` | テスト名、説明文内 |
| ヘッダー形式 | `Requirements (user-authentication):` | ファイルヘッダーの要件リスト |

### カバレッジチェックの実行

```bash
# 基本的なカバレッジチェック（閾値0%で実行、全機能対象）
npx tsx scripts/check-requirement-coverage.ts --threshold=0

# 特定機能のみチェック
npx tsx scripts/check-requirement-coverage.ts --feature=user-authentication

# 詳細出力
npx tsx scripts/check-requirement-coverage.ts --verbose

# JSON形式で出力（CI/CD統合用）
npx tsx scripts/check-requirement-coverage.ts --json

# strictモード（除外リストにない未カバー要件があれば失敗）
npx tsx scripts/check-requirement-coverage.ts --strict
```

### レポート出力例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  要件カバレッジレポート（複数機能対応・受入基準レベル）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📦 検出された機能:
     - project-management: 21要件, 160受入基準
     - user-authentication: 35要件, 361受入基準

  【機能別カバレッジ】

     project-management:
       要件: 12/21 (57.1%)
       受入基準: 52/160 (32.5%)
       E2E適用対象: [███████░░░░░░░░░░░░░] 32.5%

     user-authentication:
       要件: 21/35 (60.0%)
       受入基準: 36/361 (10.0%)
       E2E適用対象: [██░░░░░░░░░░░░░░░░░░] 10.4%
```

### 機能の自動検出

`.kiro/specs/`配下のディレクトリは自動的に検出されます。新しい機能を追加する際、スクリプトの設定変更は不要です。

```
.kiro/specs/
├── user-authentication/    # 自動検出
│   └── requirements.md
├── project-management/     # 自動検出
│   └── requirements.md
└── new-feature/            # 新機能追加時も自動検出
    └── requirements.md
```

### E2E対象外要件の除外

E2Eテストで検証できない要件（パフォーマンス、インフラ、セキュリティ等）は `e2e/requirement-exclusions.json` に定義することでカバレッジ計算から除外できます。

```json
{
  "exclusions": [
    {
      "id": "user-authentication/REQ-23.3",
      "category": "performance",
      "reason": "パフォーマンステストは別途実施",
      "alternativeVerification": {
        "method": "負荷テスト",
        "tool": "k6/Artillery"
      }
    }
  ]
}
```

### ベストプラクティス

1. **新機能追加時**: `.kiro/specs/{feature-name}/requirements.md` を作成
2. **実装時**: 該当する要件IDをコードコメントに記載
3. **テスト作成時**: テスト名またはdescribeブロックに要件IDを含める
4. **CI/CD**: `--threshold` オプションでカバレッジ閾値を設定

---

## CI/CDでのテスト実行

GitHub Actionsで自動的に以下が実行されます：

1. **Lint & Format Check**: コード品質チェック（backend, frontend, e2e）
2. **Requirement Coverage**: 要件カバレッジチェック（100%必須）
3. **Type Check**: TypeScript型チェック（backend, frontend, e2e）
4. **Unit Tests**: ユニットテスト + カバレッジ検証（backend, frontend）
5. **Build Test**: ビルド成功確認 + ESモジュール検証
6. **Storybook Tests**: コンポーネントのビジュアル・アクセシビリティテスト
7. **Integration & E2E Tests**: Docker環境（docker-compose.ci.yml）で統合・E2Eテスト
8. **Security Scan**: npm audit によるセキュリティスキャン

### CI環境のDocker構成

CI環境では `docker-compose.ci.yml` を使用し、標準ポート（3000, 5173）で実行されます：

```bash
# CI環境と同じ構成でローカルテスト
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
```

詳細は `.github/workflows/ci.yml` を参照してください。

---

## テスト実行のベストプラクティス

### 開発中

```bash
# ユニットテストをwatch mode で実行
npm --prefix backend run test:unit -- --watch
npm --prefix frontend run test -- --watch
```

### PR作成前

```bash
# すべてのテストを実行
npm --prefix backend run test:unit
npm --prefix frontend run test
npm run test:e2e

# カバレッジ確認
npm run test:coverage
```

### デプロイ前

- CI/CDで自動実行されるテストがすべてパスしていることを確認
- カバレッジが80%以上維持されていることを確認

---

## トラブルシューティング

### E2Eテストが実行できない場合

```bash
# Chromiumの依存関係を確認
ldd ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | grep "not found"

# 依存関係が不足している場合
sudo npx playwright install-deps chromium

# Chromiumを再インストール
npx playwright install chromium
```

### テストが不安定な場合

- ネットワーク遅延を考慮した適切なタイムアウト設定
- データベースの状態をテストごとにリセット
- 並列実行を避ける（`--workers=1`）

---

## 次のステップ

- [デバッグガイド](debugging.md): VSCodeでのデバッグ方法
- [コーディング規約](coding-standards.md): テストコードの書き方
- [CI/CD設定](../deployment/cicd-github-actions.md): GitHub Actionsの設定
