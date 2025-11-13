# ArchiTrack E2Eテストガイド

ArchiTrackのEnd-to-End (E2E) テストの実行方法とベストプラクティスをまとめたドキュメントです。

## 目次

- [概要](#概要)
- [アーキテクチャ](#アーキテクチャ)
- [初回セットアップ](#初回セットアップ)
- [テスト実行](#テスト実行)
- [テストデータ管理](#テストデータ管理)
- [トラブルシューティング](#トラブルシューティング)
- [ベストプラクティス](#ベストプラクティス)

---

## 概要

ArchiTrackのE2Eテストは、以下の技術スタックで構築されています：

- **テストフレームワーク**: Playwright 1.40+
- **プログラミング言語**: TypeScript
- **テストブラウザ**: Chromium（WSL2対応）
- **データベース**: PostgreSQL 15（Dockerコンテナ）
- **テストデータ管理**: Prisma Client + フィクスチャパターン

### テストの種類

- **認証機能** (`e2e/specs/auth/`): ログイン、登録、パスワードリセット、2FA、セッション管理
- **UI機能** (`e2e/specs/ui/`): ホームページ、ナビゲーション、レスポンシブデザイン

---

## アーキテクチャ

### ディレクトリ構造

```
e2e/
├── fixtures/              # テストデータ作成ヘルパー
│   ├── database.ts        # Prisma Client管理とDBクリーンアップ
│   └── auth.fixtures.ts   # 認証関連のテストデータ作成
├── helpers/               # テストユーティリティ
│   ├── test-users.ts      # テストユーザー定義とパスワードハッシュ化
│   ├── screenshot.ts      # スクリーンショット撮影
│   └── browser.ts         # ブラウザヘルパー
├── specs/                 # テストスペック
│   ├── auth/              # 認証機能テスト
│   └── ui/                # UI機能テスト
├── global-setup.ts        # グローバルセットアップ（マスターデータ初期化）
└── README.md              # このファイル
```

### テストデータ管理のアーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ グローバルセットアップ（1回のみ実行）                     │
│ - Role, Permission, RolePermissionの初期化               │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 各テストケース（test.beforeEach）                        │
│ 1. データベースクリーンアップ（User, Invitation等削除）   │
│ 2. テストユーザー作成（TEST_USERSから）                  │
│ 3. localStorage/Cookieクリア                             │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ テスト実行                                               │
│ - UI操作                                                │
│ - API呼び出し検証                                        │
│ - 状態遷移確認                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 初回セットアップ

### 前提条件

- Node.js 20.19+ または 22.12+
- Docker & Docker Compose
- npm 10+

### 1. 依存パッケージのインストール

```bash
# ルートプロジェクトの依存パッケージをインストール
npm install

# バックエンドの依存パッケージをインストール
npm --prefix backend install

# フロントエンドの依存パッケージをインストール
npm --prefix frontend install
```

**重要**: `npm install`実行時に自動的に以下が実行されます（postinstallスクリプト）:
- Playwright Chromiumブラウザのインストール
- Prisma Clientの生成（`prisma/schema.prisma`から）

### 2. Dockerコンテナの起動

```bash
# すべてのサービスを起動（PostgreSQL, Redis, backend, frontend）
docker compose up -d

# コンテナの状態を確認
docker compose ps

# ログを確認（必要に応じて）
docker compose logs -f
```

**期待される出力**:
```
NAME                  SERVICE    STATUS         PORTS
architrack-backend    backend    Up (healthy)   0.0.0.0:3000->3000/tcp
architrack-frontend   frontend   Up (healthy)   0.0.0.0:5173->5173/tcp
architrack-postgres   postgres   Up (healthy)   0.0.0.0:5432->5432/tcp
architrack-redis      redis      Up (healthy)   0.0.0.0:6379->6379/tcp
```

### 3. データベースマイグレーション（初回のみ）

```bash
# バックエンドのデータベースマイグレーション
npm --prefix backend run prisma:migrate
```

### 4. 動作確認

```bash
# 簡単なテストを実行して環境を確認
npm run test:e2e -- e2e/specs/ui/homepage.spec.ts
```

---

## テスト実行

### 基本的なコマンド

```bash
# すべてのE2Eテストを実行
npm run test:e2e

# 特定のテストファイルのみ実行
npm run test:e2e -- e2e/specs/auth/login.spec.ts

# 特定のテストスイートのみ実行
npm run test:e2e -- e2e/specs/auth/

# UIモードで実行（デバッグに便利）
npm run test:e2e:ui

# ヘッドレスモードを無効化（ブラウザを表示）
npm run test:e2e:headed

# デバッグモード
npm run test:e2e:debug

# HTMLレポートを表示
npm run test:e2e:report
```

### 並列実行とワーカー数

デフォルト設定:
- **ローカル**: CPU数に応じた並列実行
- **CI環境**: 1ワーカー（順次実行）

特定のテストスイートで並列実行を無効化する場合:
```typescript
test.describe('ログイン機能', () => {
  // データベースクリーンアップの競合を防ぐため順次実行
  test.describe.configure({ mode: 'serial' });

  // テストケース...
});
```

---

## テストデータ管理

### テストユーザー定義（`e2e/helpers/test-users.ts`）

事前定義されたテストユーザー:

```typescript
import { TEST_USERS, createTestUser } from '../helpers/test-users';

// 利用可能なテストユーザー
TEST_USERS.REGULAR_USER    // 通常ユーザー（2FA無効）
TEST_USERS.ADMIN_USER      // 管理者ユーザー
TEST_USERS.TWO_FA_USER     // 2FA有効ユーザー
TEST_USERS.REGULAR_USER_2  // 追加の通常ユーザー
```

### テスト内でのデータ作成

```typescript
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';

test.beforeEach(async ({ page, context }) => {
  // テスト状態をクリア
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());

  // データベースをクリーンアップ
  await cleanDatabase();

  // テストユーザーを作成
  await createTestUser('REGULAR_USER');
});
```

### その他のフィクスチャ

```typescript
import {
  createInvitation,
  createPasswordResetToken,
  createRefreshToken,
} from '../../fixtures/auth.fixtures';

// 招待トークン作成
const invitation = await createInvitation({
  email: 'newuser@example.com',
  inviterId: adminUser.id,
});

// パスワードリセットトークン作成
const resetToken = await createPasswordResetToken({
  userId: user.id,
});

// リフレッシュトークン作成
const refreshToken = await createRefreshToken({
  userId: user.id,
  deviceInfo: 'Chrome on Windows',
});
```

---

## トラブルシューティング

### 1. Prisma Clientエラー

**症状**:
```
PrismaClientConstructorValidationError: Invalid value undefined for datasource "db"
```

**解決方法**:
```bash
# Prisma Clientを再生成
npx prisma generate

# または、postinstallスクリプトを再実行
npm install
```

### 2. データベース接続エラー

**症状**:
```
Can't reach database server at `localhost:5432`
```

**解決方法**:
```bash
# Dockerコンテナが起動しているか確認
docker compose ps

# PostgreSQLコンテナが停止している場合は起動
docker compose up -d postgres

# ログを確認
docker compose logs postgres
```

### 3. テストがハングアップする

**症状**: テストが無限に待機して終了しない

**原因と解決方法**:

1. **localStorage/Cookie干渉**
   - 前のテストの認証状態が残っている
   - `beforeEach`で`cleanDatabase()`を呼んでいるか確認

2. **要素が見つからない**
   - セレクターが間違っている可能性
   - スクリーンショットを確認: `test-results/*/test-failed-1.png`

3. **ネットワークタイムアウト**
   - Docker コンテナの応答が遅い
   - `playwright.config.ts`のタイムアウト設定を確認

### 4. 並列実行時のデータ競合

**症状**:
```
Unique constraint failed on the fields: (`email`)
```

**解決方法**:
テストスイートで順次実行を有効化:
```typescript
test.describe.configure({ mode: 'serial' });
```

### 5. ブラウザが起動しない（WSL2環境）

**症状**:
```
browserType.launch: Executable doesn't exist
```

**解決方法**:
```bash
# Playwrightブラウザを再インストール
npx playwright install chromium

# 依存ライブラリをインストール（WSL2の場合）
npx playwright install-deps chromium
```

---

## ベストプラクティス

### 1. テスト分離の徹底

**良い例**:
```typescript
test.beforeEach(async ({ page, context }) => {
  // 各テストが独立して実行可能
  await cleanDatabase();
  await createTestUser('REGULAR_USER');
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
});
```

**悪い例**:
```typescript
// ❌ グローバル変数でテストデータを共有
let sharedUser;

test.beforeAll(async () => {
  sharedUser = await createTestUser('REGULAR_USER');
});

test('テスト1', async ({ page }) => {
  // sharedUserが他のテストで変更される可能性
});
```

### 2. セレクターの明確化

**良い例**:
```typescript
// ID属性を使用（最も確実）
await page.locator('input#email').fill('user@example.com');

// role属性を使用（セマンティック）
await page.getByRole('button', { name: /ログイン/i }).click();

// label要素と関連付け
await page.getByLabel(/メールアドレス/i).fill('user@example.com');
```

**悪い例**:
```typescript
// ❌ CSSクラス名に依存（変更されやすい）
await page.locator('.btn-primary').click();

// ❌ 曖昧なセレクター（複数要素にマッチする可能性）
await page.getByLabel(/パスワード/i).fill('password');
```

### 3. タイムアウトの適切な設定

```typescript
// 個別の操作タイムアウト
await page.locator('#slow-element').click({ timeout: 30000 });

// expect のタイムアウト
await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
```

### 4. エラーメッセージの検証

```typescript
// ✅ 正規表現で柔軟に検証
await expect(page.getByText(/メールアドレスは必須/i)).toBeVisible();

// ❌ 完全一致は避ける（文言変更に脆弱）
await expect(page.getByText('メールアドレスは必須です。')).toBeVisible();
```

### 5. テストの可読性

```typescript
test('有効な認証情報でログインできる', async ({ page }) => {
  // Given: ログインページを表示
  await page.goto('/login');

  // When: 有効な認証情報を入力してログイン
  await page.getByLabel(/メールアドレス/i).fill('user@example.com');
  await page.locator('input#password').fill('Password123!');
  await page.getByRole('button', { name: /ログイン/i }).click();

  // Then: ホームページにリダイレクトされる
  await expect(page).toHaveURL('http://localhost:5173/');
});
```

### 6. デバッグのヒント

```typescript
// スクリーンショットを手動で撮影
await page.screenshot({ path: 'debug.png', fullPage: true });

// ページのHTMLをログ出力
console.log(await page.content());

// 特定の要素の状態を確認
const element = page.locator('#target');
console.log({
  visible: await element.isVisible(),
  enabled: await element.isEnabled(),
  text: await element.textContent(),
});

// ブラウザコンソールログを表示
page.on('console', msg => console.log('BROWSER:', msg.text()));
```

---

## スクリーンショット機能

### 概要

テスト実行時のスクリーンショットは、タイムスタンプ付きフォルダに自動的に整理され、テストケースと紐づけられます。

### フォルダ構造

```
playwright-report/screenshots/
└── {timestamp}/                    # 実行日時（例: 20251102-073000）
    └── {test-suite}/               # テストスイート名（例: homepage）
        └── {browser}/              # ブラウザ名（例: chromium）
            └── {screenshot-name}.png  # スクリーンショット
```

### 使用方法

#### 1. 基本的なスクリーンショット撮影

```typescript
import { test, expect } from '@playwright/test';
import { takeScreenshot } from '../../helpers/screenshot.js';

test('テストケース名', async ({ page }, testInfo) => {
  await page.goto('/');

  // スクリーンショットを撮影
  await takeScreenshot(page, testInfo, 'screenshot-name');
});
```

#### 2. 失敗時の自動スクリーンショット

```typescript
import { takeScreenshotOnFailure } from '../../helpers/screenshot.js';

test.describe('テストスイート', () => {
  // テスト失敗時に自動的にスクリーンショットを撮影
  test.afterEach(async ({ page }, testInfo) => {
    await takeScreenshotOnFailure(page, testInfo);
  });

  test('テストケース', async ({ page }, testInfo) => {
    await expect(page).toHaveTitle(/Expected Title/);
  });
});
```

---

## 参考資料

- [Playwright公式ドキュメント](https://playwright.dev/docs/intro)
- [Prismaドキュメント](https://www.prisma.io/docs)
- [ArchiTrack仕様書](.kiro/specs/user-authentication/)

---

## よくある質問

### Q1. テストが遅いのですが、高速化できますか？

**A**: 以下の方法を試してください:

1. **並列実行を有効化** (データ競合に注意)
2. **headlessモードで実行** (デフォルト)
3. **ビデオ録画を無効化**:
   ```typescript
   // playwright.config.ts
   use: {
     video: 'off',
   }
   ```

### Q2. CI環境でテストを実行する方法は？

**A**: GitHub Actionsの例:

```yaml
- name: Run E2E Tests
  run: |
    docker compose up -d
    npm run test:e2e
  env:
    CI: true
```

### Q3. テストデータベースと開発データベースを分離すべきですか？

**A**: **推奨します**。現在は同じデータベース（`architrack_dev`）を使用していますが、将来的には以下のように分離することを推奨します:

```yaml
# docker-compose.yml
services:
  postgres-test:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: architrack_test
    ports:
      - "5433:5432"
```

```typescript
// e2e/fixtures/database.ts
const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://postgres:test@localhost:5433/architrack_test';
```

---

**最終更新**: 2025-11-13
