# データベースマイグレーション

このドキュメントでは、Prisma 7を使用したデータベーススキーマの変更とマイグレーション管理について説明します。

---

## Prisma 7 Driver Adapter Pattern

ArchiTrackでは、Prisma 7の**Driver Adapter Pattern**を採用しています。これにより、データベース接続をより細かく制御できます。

### スキーマ設定

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

### クライアント初期化

```typescript
// db.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

### 利点

- **接続制御**: コネクションプーリングのカスタマイズ
- **柔軟性**: 外部データベースドライバーとの統合
- **パフォーマンス**: 接続の最適化

---

## Draft Migrationsワークフロー

ArchiTrackでは、開発中のマイグレーションを安全に管理するための **Draft Migrations** ワークフローを採用しています。

### 特徴

- **誤コミット防止**: 開発中のマイグレーションを `.gitignore` で自動除外
- **安全機構**: Git pre-commit hookで万が一のステージングもブロック
- **試行錯誤可能**: 何度でもやり直せる開発環境

### ディレクトリ構造

```
prisma/migrations/
  ├── draft/              ← 開発中（.gitignore対象）
  │   └── 20251112_test/  ← Git追跡されない
  └── 20251110_auth/      ← 確定版（Git追跡）
```

---

## Draft Migrationsの使い方

### Step 1: Prismaスキーマの編集

`backend/prisma/schema.prisma` を編集：

```prisma
// 例: ユーザーモデルにリフレッシュトークンフィールドを追加
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String?
  passwordHash String
  refreshToken String?  // ← 追加
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}
```

### Step 2: Draftマイグレーション作成

```bash
# Draftマイグレーションを作成（migrations/draft/に配置）
npm --prefix backend run db:draft:create draft_add_refresh_token

# ↑ 自動的にprisma/migrations/draft/に作成されます
```

### Step 3: SQLを確認

```bash
# Draft一覧表示（SQLプレビュー付き）
npm --prefix backend run db:draft:list
```

### Step 4: 適用とテスト

```bash
# Draftを適用
npm --prefix backend run db:draft:apply

# 動作確認
npm --prefix backend test
```

### Step 5: やり直し（必要な場合）

```bash
# Draftを削除
npm --prefix backend run db:draft:clean

# スキーマを修正して再度Step 2から
npm --prefix backend run db:draft:create draft_add_refresh_token_v2
```

### Step 6: 確定（Git追跡対象に移行）

```bash
# Draftを確定版に移行
npm --prefix backend run db:draft:finalize

# ↑ migrations/draft/ → migrations/ に移動
# ↑ Git追跡対象になります
```

### Step 7: Gitコミット

```bash
# 確定版のみがGit追跡されます
git status
# → prisma/migrations/20251112_add_refresh_token/ が表示

git add backend/prisma/migrations/20251112_add_refresh_token/
git add backend/prisma/schema.prisma
git commit -m "feat(db): ユーザーモデルにリフレッシュトークンを追加"
```

---

## Draft管理コマンド

| コマンド | 説明 |
|---------|------|
| `npm run db:draft:create <name>` | Draft作成 |
| `npm run db:draft:list` | Draft一覧表示 |
| `npm run db:draft:apply [name]` | Draft適用 |
| `npm run db:draft:finalize [name]` | Draft確定（Git追跡対象に移行） |
| `npm run db:draft:clean [name]` | Draft削除 |

---

## 安全機構

### 1. .gitignore による自動除外

```gitignore
# backend/.gitignore
prisma/migrations/draft/
```

### 2. Git pre-commit hook によるブロック

万が一draftをステージングしても、コミットが自動的にブロックされます：

```bash
# 誤操作の例
git add backend/prisma/migrations/draft/

# コミット試行
git commit -m "test"
# ❌ Error: Draft migrations detected in staged files!
# → コミット中止
```

---

## ローカル開発環境

### マイグレーション作成

```bash
# スキーマを編集
vim backend/prisma/schema.prisma

# マイグレーションを生成して適用
npm --prefix backend run prisma:migrate
# または
npm --prefix backend run db:migrate:create <migration-name>
```

### マイグレーション状態の確認

```bash
npm --prefix backend run db:migrate:status
```

**期待される出力:**
```
Database schema is up to date!
```

### マイグレーションのロールバック

```bash
# 最後のマイグレーションをロールバック
npx prisma migrate resolve --rolled-back <migration-name>

# データベースをリセット（開発環境のみ）
npx prisma migrate reset
```

---

## Railway本番環境

### 自動マイグレーション

Railway環境では、デプロイ時に自動的にマイグレーションが適用されます。

**仕組み:**
1. `backend/railway.toml` に定義された build コマンドで `prisma generate` 実行
2. `start` コマンドで `prisma migrate deploy` 実行（本番用マイグレーション適用）
3. サーバー起動

**railway.toml の設定:**
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npx prisma migrate deploy && npm start"
```

**注意:** Prisma 7では、Prisma Clientは `backend/src/generated/prisma/` に出力されます。ビルド時に `prisma generate` が自動実行され、Clientが生成されます。

### マイグレーション検証手順

1. **ステージング環境でテスト:**
   - ステージング環境にデプロイ
   - マイグレーション適用を確認
   - データ整合性を検証

2. **本番環境へデプロイ:**
   - GitHub Actions CI/CD が自動実行
   - マイグレーション適用ログを確認
   - ヘルスチェックエンドポイントで確認

3. **ロールバック手順（緊急時）:**
   ```bash
   # Railway CLI でサービスに接続
   railway link
   railway shell

   # データベースバックアップから復元
   # または
   # 前バージョンへの切り戻し（Railway Dashboard）
   ```

---

## データベースシーディング

### シーディング内容

- **ロール**: `admin`（システム管理者）、`user`（一般ユーザー）
- **権限**: `*:*`（全権限）、`adr:read`、`adr:create`、`user:read` 等
- **ロール・権限紐付け**
- **初期管理者アカウント**（環境変数設定時）

### 実行方法

```bash
# ローカル開発環境
npm --prefix backend run prisma:seed
```

**冪等性:**
- 複数回実行しても安全
- 既存データは更新されず、不足データのみ追加

詳細は[デプロイガイド](../deployment/overview.md)を参照してください。

---

## 重要な注意点

- ✅ **Draftは何度でも作り直せます** - 試行錯誤が安全にできます
- ✅ **確定後は必ずGitコミット** - チーム全体で同じマイグレーション履歴を共有
- ✅ **本番環境では `db:migrate:deploy`** - 開発用の `prisma:migrate` は使用禁止
- ⚠️ **破壊的変更は慎重に** - カラム削除などは事前にバックアップ

---

## トラブルシューティング

### マイグレーション失敗

**症状:**
```
Error: P3015
Could not find the migration file at migration.sql.
```

**解決方法:**
```bash
# 空のdraftディレクトリを削除
rm -rf backend/prisma/migrations/draft

# マイグレーション状態を確認
npm --prefix backend run db:migrate:status
```

詳細は[デプロイのトラブルシューティング](../deployment/troubleshooting.md)を参照してください。
