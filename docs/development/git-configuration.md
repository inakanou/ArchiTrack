# Git設定

このドキュメントでは、ArchiTrackプロジェクトで使用するGit設定とGit hooksについて説明します。

---

## Git Hooksの設定

ArchiTrackでは、コミット前に自動的にコード品質チェックを実行するGit hooksを使用しています。

### セットアップ

```bash
git config core.hooksPath .husky
```

これにより、`.husky/` ディレクトリ内のフックスクリプトが有効化されます。

---

## pre-commit Hook

コミット時に以下が自動実行されます：

### 1. Prettier（コードフォーマット）

変更されたファイルを自動的にフォーマットします。

**対象ファイル:**
- `*.ts`
- `*.tsx`
- `*.js`
- `*.jsx`
- `*.json`
- `*.md`

### 2. ESLint（コード品質チェック）

コード品質をチェックし、自動修正可能な問題を修正します。

**チェック項目:**
- 未使用変数
- コーディング規約違反
- ベストプラクティス違反

### 3. Prismaフォーマット

Prismaスキーマファイルをフォーマットします。

**対象ファイル:**
- `prisma/schema.prisma`

### 4. Draft Migrationsブロック

誤って開発中のマイグレーションをコミットすることを防ぎます。

**チェック:**
- `prisma/migrations/draft/` 配下のファイルがステージングされていないか確認
- 検出された場合はコミットを中止

---

## フックスクリプトの動作

### コミット成功例

```bash
$ git commit -m "feat: 新機能を追加"

✔ Preparing lint-staged...
✔ Running tasks for staged files...
  ✔ Formatting with Prettier...
  ✔ Linting with ESLint...
  ✔ Formatting Prisma schema...
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
✔ Checking for draft migrations...

[feature/new-feature abc1234] feat: 新機能を追加
 3 files changed, 45 insertions(+), 10 deletions(-)
```

### コミット失敗例（Draft Migration検出）

```bash
$ git add backend/prisma/migrations/draft/
$ git commit -m "test"

✔ Preparing lint-staged...
✔ Running tasks for staged files...
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
✖ Checking for draft migrations...

❌ Error: Draft migrations detected in staged files!

Found draft migrations:
  backend/prisma/migrations/draft/20251112_test/

Draft migrations should NOT be committed. Please:
1. Finalize the draft: npm --prefix backend run db:draft:finalize
2. Or remove from staging: git reset HEAD backend/prisma/migrations/draft/

Commit aborted.
```

---

## フックのカスタマイズ

### lint-staged設定

`.husky/pre-commit` のlint-staged設定をカスタマイズできます。

**例:**
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged --config .lintstagedrc.json
```

`.lintstagedrc.json`:
```json
{
  "*.{ts,tsx}": [
    "prettier --write",
    "eslint --fix"
  ],
  "*.{js,jsx}": [
    "prettier --write",
    "eslint --fix"
  ],
  "*.{json,md}": [
    "prettier --write"
  ],
  "prisma/schema.prisma": [
    "prisma format"
  ]
}
```

---

## 手動でのコード品質チェック

Git hooksを使わずに手動で実行する場合：

### Prettierフォーマット

```bash
# Backend
npm --prefix backend run format
npm --prefix backend run format:check

# Frontend
npm --prefix frontend run format
npm --prefix frontend run format:check
```

### ESLint

```bash
# Backend
npm --prefix backend run lint
npm --prefix backend run lint:fix

# Frontend
npm --prefix frontend run lint
npm --prefix frontend run lint:fix
```

### TypeScript型チェック

```bash
# Backend
npm --prefix backend run type-check

# Frontend
npm --prefix frontend run type-check
```

### Prismaフォーマット

```bash
npm --prefix backend run prisma:format
```

---

## Git設定のベストプラクティス

### ユーザー情報の設定

```bash
# グローバル設定
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# プロジェクト固有の設定
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### エディタ設定

```bash
# VSCodeを使用する場合
git config --global core.editor "code --wait"

# Vimを使用する場合
git config --global core.editor "vim"
```

### デフォルトブランチ名

```bash
git config --global init.defaultBranch main
```

---

## トラブルシューティング

### Git hooksが実行されない

```bash
# hooksPathが正しく設定されているか確認
git config core.hooksPath

# 期待される出力: .husky
```

```bash
# 再設定
git config core.hooksPath .husky
```

### フックスクリプトに実行権限がない

```bash
# 実行権限を付与
chmod +x .husky/pre-commit
```

### lint-stagedがインストールされていない

```bash
# 依存関係を再インストール
npm install
```

---

## Git Hooks無効化（非推奨）

開発中に一時的にhooksを無効化したい場合（**推奨されません**）：

```bash
# コミット時のみhooksをスキップ
git commit --no-verify -m "message"
```

**注意:**
- `--no-verify` の使用は最小限にしてください
- CI/CDで同じチェックが実行されるため、最終的にはフォーマット・Lintエラーで失敗します

---

## 次のステップ

- [コーディング規約](coding-standards.md): コーディングルール
- [ワークフロー](workflow.md): 開発の流れ
- [コントリビューションガイド](../contributing/guide.md): PRの作成方法
