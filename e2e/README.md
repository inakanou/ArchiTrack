# E2E テスト

Playwrightを使用したEnd-to-Endテスト。

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

#### 2. フルページスクリーンショット

```typescript
// フルページのスクリーンショット（デフォルトでtrue）
await takeScreenshot(page, testInfo, 'full-page', { fullPage: true });
```

#### 3. 失敗時の自動スクリーンショット

```typescript
import { takeScreenshotOnFailure } from '../../helpers/screenshot.js';

test.describe('テストスイート', () => {
  // テスト失敗時に自動的にスクリーンショットを撮影
  test.afterEach(async ({ page }, testInfo) => {
    await takeScreenshotOnFailure(page, testInfo);
  });

  test('テストケース', async ({ page }, testInfo) => {
    // テストコード
    await expect(page).toHaveTitle(/Expected Title/);
  });
});
```

### スクリーンショット名のルール

- テストケース名から自動生成される場合、以下のルールで変換されます：
  - 英数字、日本語、スペース、ハイフン以外の文字は削除
  - スペースはハイフンに変換
  - 小文字に変換

例：
- `"フロントエンドが正常に起動すること"` → `"フロントエンドが正常に起動すること"`
- `"User Login Test (Success)"` → `"user-login-test-success"`

### タイムスタンプについて

- タイムスタンプは、テスト実行開始時に1度だけ生成されます
- 同じテスト実行内のすべてのスクリーンショットは、同じタイムスタンプフォルダに保存されます
- 形式: `YYYYMMDD-HHMMSS`（例: `20251102-073000`）

### HTMLレポートとの連携

撮影したスクリーンショットは、自動的にPlaywrightのHTMLレポートに添付されます。

```bash
# HTMLレポートを表示
npx playwright show-report
```

レポート内でスクリーンショットを確認できます。

### 例

```typescript
import { test, expect } from '@playwright/test';
import { takeScreenshot, takeScreenshotOnFailure } from '../../helpers/screenshot.js';

test.describe('ログイン機能', () => {
  test.afterEach(async ({ page }, testInfo) => {
    await takeScreenshotOnFailure(page, testInfo);
  });

  test('ログイン成功時のテスト', async ({ page }, testInfo) => {
    await page.goto('/login');

    // ログインフォーム表示を確認
    await takeScreenshot(page, testInfo, 'login-form');

    // ログイン情報を入力
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');

    // ログイン前の状態をキャプチャ
    await takeScreenshot(page, testInfo, 'before-login');

    // ログインボタンをクリック
    await page.click('button[type="submit"]');

    // ログイン後のダッシュボードを確認
    await expect(page).toHaveURL('/dashboard');
    await takeScreenshot(page, testInfo, 'after-login-dashboard');
  });
});
```

保存先:
```
playwright-report/screenshots/20251102-073000/
└── ログイン機能/
    └── chromium/
        ├── login-form.png
        ├── before-login.png
        └── after-login-dashboard.png
```

## テストの実行

```bash
# すべてのE2Eテストを実行
npm run test:e2e

# 特定のテストファイルのみ実行
npm run test:e2e -- e2e/specs/ui/homepage.spec.ts

# UIモードで実行（デバッグに便利）
npm run test:e2e:ui

# ヘッドモードで実行（ブラウザを表示）
npm run test:e2e:headed
```
