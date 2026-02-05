# 開発ワークフロー

このドキュメントでは、ArchiTrackでの日常的な開発作業の流れを説明します。

---

## 開発アプローチ

ArchiTrackは **Claude Code** を活用した **Kiro-style Spec Driven Development（スペック駆動開発）** で開発されています。

### 主な特徴

- **AI支援開発**: Claude Codeによる体系的な開発ワークフロー
- **スペック駆動**: 要件定義 → 設計 → タスク分解 → 実装の明確なフェーズ管理
- **カスタムコマンド**: `/kiro:spec-init`, `/kiro:spec-requirements` などの開発支援コマンド

---

## ブランチ戦略

ArchiTrackでは**Git Flow**ベースのブランチ戦略を採用しています。

```
main (本番環境)
  ↑
  │ リリース時のみマージ
  │
develop (開発統合)  ← 常にmainより先に進む
  ↑
  │ 機能完成時マージ
  │
feature/* (機能開発)  ← developから分岐
hotfix/* (緊急修正)   ← mainから分岐
```

### ブランチの役割

- **main**: 本番環境にデプロイされる安定版（直接プッシュ禁止、PR必須、全CI成功必須）
- **develop**: 次のリリースに向けた開発統合ブランチ
- **feature/***: 個別の機能開発（developから分岐、developへマージ）
- **hotfix/***: 本番環境の緊急修正（mainから分岐、mainとdevelopへマージ）

### Dependabot統合

依存関係の自動更新PRは**developブランチ**に向けて作成されます：
- 週次で依存関係をチェック
- developで統合・テスト
- リリース時にmainへマージ

### 詳細

- [Git ワークフローガイド](git-workflow.md) - Git Flowの詳細な運用手順
- [ブランチ保護設定](../deployment/branch-protection.md) - GitHub ブランチ保護の設定方法

---

## Kiro-style Spec Driven Development

### 基本ワークフロー

1. **ステアリング更新** - `/kiro:steering` でプロジェクトコンテキストを最新化（任意）
2. **仕様初期化** - `/kiro:spec-init` で新機能の仕様を作成
3. **要件定義** - `/kiro:spec-requirements` で詳細な要件を生成
4. **設計** - `/kiro:spec-design` で技術設計を作成
5. **タスク分解** - `/kiro:spec-tasks` で実装タスクに分解
6. **実装** - タスクに従って段階的に実装（要件タグ `@requirement` を付与）
7. **Storybookストーリー作成** - 実装したコンポーネントのストーリーを作成（実装後ドキュメント化アプローチ）
8. **要件カバレッジ確認** - `npx tsx scripts/check-requirement-coverage.ts` でカバレッジを検証
9. **進捗確認** - `/kiro:spec-status` で進捗を追跡

各フェーズで人間のレビューを実施し、品質を確保します。

### Storybookによるコンポーネント管理

ArchiTrackでは「**実装後ドキュメント化アプローチ**」を採用しています：

```
要件定義 → 設計 → 実装 → Storybookストーリー作成 → ビジュアルテスト
```

**ワークフロー:**
1. 要件定義・設計に基づいてコンポーネントを実装
2. 実装完了後、Storybookストーリーを作成（`.stories.tsx`）
3. Storybook UIでビジュアル確認
4. Test Runnerでインタラクションテストとアクセシビリティテストを自動実行

**メリット:**
- 実装が確定してからドキュメント化するため、手戻りが少ない
- コンポーネントの実際の振る舞いを正確に記録
- UIの問題を実装後に発見

**Storybookテストの実行:**
```bash
# Storybookを起動（インタラクティブ確認）
npm --prefix frontend run storybook

# Test Runnerでストーリーを自動テスト
npm --prefix frontend run test-storybook

# CI/CD用（Storybookを起動してテスト実行後に自動終了）
npm --prefix frontend run test-storybook:ci
```

---

## 新機能開発の詳細手順

### Step 1: 開発準備

```bash
# リポジトリの最新状態を取得
git pull origin main

# 開発環境を起動
docker-compose up -d
```

### Step 2: ステアリングドキュメントの確認・更新（初回または大きな変更時）

Claude Codeで以下のコマンドを実行：

```
/kiro:steering
```

これにより、プロジェクトの最新状態がAIに共有されます。

### Step 3: フィーチャーブランチの作成

```bash
# 機能名でブランチを作成（例: feature/user-auth）
git checkout -b feature/user-auth
```

### Step 4: 仕様の作成（Kiro-style SDD）

#### 4-1. 仕様の初期化

Claude Codeで新機能の概要を詳しく説明して初期化：

```
/kiro:spec-init ユーザー認証機能を追加します。JWT形式のトークンベース認証を実装し、ログイン・ログアウト・トークン更新の機能を提供します。フロントエンドはReact、バックエンドはExpressで実装します。
```

これにより `.kiro/specs/user-auth/` ディレクトリが作成されます。

#### 4-2. 要件定義の生成

```
/kiro:spec-requirements user-auth
```

生成された `requirements.md` を確認し、必要に応じて手動で修正・追記します。

#### 4-3. 技術設計の作成

```
/kiro:spec-design user-auth
```

対話形式で要件を確認済みか聞かれるので、確認後に `y` で進めます。
生成された `design.md` をレビューし、アーキテクチャや技術選定が適切か確認します。

#### 4-4. 実装タスクの生成

```
/kiro:spec-tasks user-auth
```

対話形式で要件と設計の確認を経て、実装タスクが `tasks.md` に生成されます。
各タスクは小さな単位に分割されており、段階的に実装できます。

#### 4-5. 仕様の進捗確認

```
/kiro:spec-status user-auth
```

現在のフェーズ（要件/設計/タスク/実装）と進捗状況を確認できます。

### Step 5: 仕様のコミットとレビュー依頼

```bash
# 仕様ファイルをステージング
git add .kiro/specs/user-auth/

# 仕様をコミット
git commit -m "docs: ユーザー認証機能の仕様を追加

- 要件定義
- 技術設計
- 実装タスク"

# リモートにプッシュ
git push origin feature/user-auth

# 仕様レビュー用のPRを作成
gh pr create --title "Spec: ユーザー認証機能" --body "## 概要
ユーザー認証機能の仕様を作成しました。

## レビューポイント
- [ ] 要件定義が適切か
- [ ] 技術設計がプロジェクトのアーキテクチャに適合しているか
- [ ] 実装タスクが適切に分割されているか

## 仕様ファイル
- .kiro/specs/user-auth/requirements.md
- .kiro/specs/user-auth/design.md
- .kiro/specs/user-auth/tasks.md

## 次のステップ
仕様承認後、同じブランチで実装を開始します。" --draft
```

**レビュー対応:**
- レビューフィードバックに基づいて仕様を修正
- 承認されたらPRのドラフトを解除してマージ準備
- または、実装を含めた最終PRまでドラフトのまま継続

### Step 6: 実装

#### 6-1. タスクの確認

`.kiro/specs/user-auth/tasks.md` を開き、実装するタスクを確認します。

#### 6-2. データベーススキーマの変更（必要な場合）

新機能でデータベースの変更が必要な場合は、**Draft Migrationsワークフロー**を使用します。

詳細は[データベースマイグレーション](database-migration.md)を参照してください。

#### 6-3. Claude Codeで実装

Claude Codeに以下のように依頼：

```
/kiro:spec-impl user-auth 1,2,3
```

または、個別に指示：

```
.kiro/specs/user-auth/tasks.md のタスク1「JWT認証ミドルウェアの実装」を実装してください
```

#### 6-4. 要件タグの付与

実装したコードには、対応する要件を紐付ける`@requirement`タグを付与します：

```typescript
/**
 * @fileoverview 認証サービス
 *
 * Requirements (user-authentication):
 * - REQ-4.1: ログイン成功時にアクセストークンとリフレッシュトークンを発行
 * - REQ-4.4: 環境変数ACCESS_TOKEN_EXPIRYで設定された有効期限を持つアクセストークンを発行
 */

/**
 * @requirement user-authentication/REQ-4.1: 有効な認証情報でトークン発行
 */
async function login(email: string, password: string) {
  // 実装...
}
```

**形式:** `@requirement {feature-name}/REQ-{N}.{M}`
- `{feature-name}`: `.kiro/specs/`配下のディレクトリ名（例: `user-authentication`）
- `REQ-{N}`: 要件番号
- `.{M}`: 受入基準番号（任意）

詳細は[コーディング規約 - 要件トレーサビリティ](coding-standards.md#要件トレーサビリティrequirements-traceability)を参照してください。

#### 6-5. 実装の確認

- コードレビュー
- ローカルで動作確認
- 必要に応じてテストの追加

```bash
# フロントエンド確認
curl http://localhost:5173

# バックエンドAPI確認
curl http://localhost:3000/health
```

### Step 7: テストの実行

```bash
# フォーマット・Lint・型チェック
npm --prefix backend run format:check
npm --prefix backend run lint
npm --prefix backend run type-check

npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend run type-check

# テスト実行
npm --prefix backend run test:unit
npm --prefix frontend run test

# ビルド確認
npm --prefix backend run build
npm --prefix frontend run build

# 要件カバレッジ確認
npx tsx scripts/check-requirement-coverage.ts --threshold=0 --feature=user-auth
```

**要件カバレッジ**: 実装した機能が要件定義書（`.kiro/specs/`）のどの受入基準をカバーしているかを検証します。詳細は[テスト - 要件カバレッジ](testing.md#要件カバレッジrequirements-traceability)を参照してください。

### Step 8: コミット

```bash
# 変更を確認
git status
git diff

# ステージング
git add .

# コミット（pre-commitフックが自動実行されます）
git commit -m "feat: JWT認証ミドルウェアの実装"
# Prettier + ESLint + Prismaフォーマットが自動的に実行され、コードが整形されます
```

**コミットメッセージの規約:**

詳細は[コミット規約](../contributing/commit-conventions.md)を参照してください。

- `feat:` - 新機能
- `fix:` - バグ修正
- `docs:` - ドキュメント更新
- `style:` - コードフォーマット
- `refactor:` - リファクタリング
- `test:` - テスト追加・修正
- `chore:` - ビルド・ツール設定

### Step 9: プッシュとPR作成

```bash
# 実装をプッシュ
git push origin feature/user-auth

# PRを作成（または既存のドラフトPRを更新）
gh pr create --title "feat: ユーザー認証機能を実装" --body "## 概要
ユーザー認証機能を追加しました。

## 仕様
- .kiro/specs/user-auth/requirements.md
- .kiro/specs/user-auth/design.md
- .kiro/specs/user-auth/tasks.md

## 変更内容
- JWT認証ミドルウェアの実装
- ログイン/ログアウトAPIの実装
- トークン更新APIの実装

## テスト
- [x] ログイン動作確認
- [x] トークン検証動作確認
- [x] ログアウト動作確認

## スクリーンショット
（必要に応じて追加）"

# ドラフトを解除してレビュー依頼
gh pr ready
```

### Step 10: レビュー対応

PR上でレビューを受け、必要に応じて修正：

```bash
# フィードバックに基づいて修正
# ...

# 再度コミット
git add .
git commit -m "fix: レビューフィードバックの反映"
git push origin feature/user-auth
```

### Step 11: マージ

```bash
# PRがレビュー承認されたらマージ
# GitHub UI上でマージボタンをクリック
# または
gh pr merge --squash

# mainブランチに移動して最新化
git checkout main
git pull origin main

# Railwayへの自動デプロイが開始されます
```

---

## 日常的な開発フロー

小規模な修正や改善の場合：

```bash
# 1. 最新状態を取得
git pull origin main

# 2. ブランチ作成
git checkout -b fix/button-color

# 3. Claude Codeに依頼
# 「ログインボタンの色を青から緑に変更してください」

# 4. 確認・コミット
git add .
git commit -m "fix: ログインボタンの色を変更"

# 5. プッシュ・PR作成
git push origin fix/button-color
gh pr create --title "fix: ログインボタンの色を変更" --body "UIの視認性向上のため、ログインボタンの色を変更"

# 6. マージ
gh pr merge --squash
```

---

## チーム開発での注意点

1. **仕様を必ず作成**: 中規模以上の機能は必ず `/kiro:spec-init` から開始
2. **レビューを依頼**: PRは必ず他のメンバーにレビューを依頼
3. **コミットは小さく**: 1つのコミットで1つの変更
4. **ステアリング更新**: 大きな変更後は `/kiro:steering` を実行
5. **進捗共有**: `/kiro:spec-status` で進捗を共有

---

## 次のステップ

- [データベースマイグレーション](database-migration.md): Prismaスキーマ編集とDraft機能
- [テスト](testing.md): ユニット・統合・E2Eテスト
- [コーディング規約](coding-standards.md): TypeScript・React・Prisma規約
