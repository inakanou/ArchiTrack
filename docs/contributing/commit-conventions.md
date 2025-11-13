# コミットメッセージ規約

ArchiTrackでは、Conventional Commitsに従ったコミットメッセージを使用します。

---

## 基本形式

```
<type>(<scope>): <subject>

<body>

<footer>
```

---

## Type（必須）

コミットの種類を示します。

| Type | 説明 | 例 |
|------|------|---|
| `feat` | 新機能 | `feat(backend): JWT認証ミドルウェアを追加` |
| `fix` | バグ修正 | `fix(frontend): ログインボタンが押せない問題を修正` |
| `docs` | ドキュメント変更 | `docs: READMEにセットアップ手順を追加` |
| `style` | コードフォーマット（機能変更なし） | `style(frontend): Prettierでフォーマット` |
| `refactor` | リファクタリング | `refactor(backend): ユーザーサービスをリファクタリング` |
| `perf` | パフォーマンス改善 | `perf(backend): データベースクエリを最適化` |
| `test` | テスト追加・修正 | `test(backend): ユーザーAPI統合テストを追加` |
| `chore` | ビルド・ツール設定変更 | `chore: ESLint設定を更新` |
| `ci` | CI/CD設定変更 | `ci: GitHub Actionsワークフローを追加` |

---

## Scope（任意）

変更の影響範囲を示します。

**例:**
- `backend` - バックエンド
- `frontend` - フロントエンド
- `e2e` - E2Eテスト
- `docker` - Docker設定
- `ci` - CI/CD設定
- `db` - データベース

**使用例:**
```
feat(backend): JWT認証ミドルウェアを追加
fix(frontend): ログインボタンが押せない問題を修正
docs(deployment): Railway設定ガイドを追加
```

---

## Subject（必須）

変更内容の簡潔な説明です。

**ルール:**
- **50文字以内**
- **命令形**（"add" not "added"、"fix" not "fixed"）
- **先頭は小文字**（日本語の場合は除く）
- **末尾にピリオドをつけない**

**良い例:**
```
feat: ユーザー認証機能を追加
fix: ログインボタンが押せない問題を修正
docs: セットアップ手順を追加
```

**悪い例:**
```
update code
Fixed bug
Add feature.
```

---

## Body（任意）

変更の詳細な説明です。

**ルール:**
- Subjectから1行空ける
- 「なぜ」この変更が必要か説明
- 72文字で折り返し

**例:**
```
feat(backend): JWT認証ミドルウェアを追加

ユーザー認証機能の実装のため、JWTベースの
認証ミドルウェアを追加しました。

- EdDSA（Ed25519）署名方式を使用
- アクセストークンとリフレッシュトークンをサポート
- トークン検証とリフレッシュロジックを実装
```

---

## Footer（任意）

破壊的変更やIssueへの参照を記載します。

### Issue参照

```
Closes #123
Fixes #456
Refs #789
```

### 破壊的変更

```
BREAKING CHANGE: 認証APIのレスポンス形式を変更

以前: { token: "..." }
現在: { accessToken: "...", refreshToken: "..." }
```

---

## 完全な例

### 新機能追加

```
feat(backend): JWT認証ミドルウェアを追加

ユーザー認証機能の実装のため、JWTベースの
認証ミドルウェアを追加しました。

- EdDSA（Ed25519）署名方式を使用
- アクセストークンとリフレッシュトークンをサポート
- トークン検証とリフレッシュロジックを実装

Closes #42
```

### バグ修正

```
fix(frontend): ログインボタンが押せない問題を修正

ログインフォームのバリデーションエラーが
ボタンの有効化を妨げていた問題を修正。

Fixes #78
```

### ドキュメント更新

```
docs: READMEにセットアップ手順を追加

新規開発者向けに、ローカル開発環境の
セットアップ手順を詳細に記載しました。
```

### 破壊的変更

```
feat(backend): 認証APIのレスポンス形式を変更

BREAKING CHANGE: 認証APIのレスポンス形式を変更

以前:
{
  "token": "..."
}

現在:
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 900
}

この変更により、既存のクライアントは
レスポンス処理を更新する必要があります。

Closes #99
```

---

## コミットのベストプラクティス

### 1. 小さく、頻繁にコミット

```bash
# 良い例
git commit -m "feat: ユーザーモデルを追加"
git commit -m "feat: ユーザーサービスを追加"
git commit -m "test: ユーザーサービステストを追加"

# 悪い例
git commit -m "feat: ユーザー認証機能を実装"
# ↑ 多数のファイルが1つのコミットに含まれる
```

### 2. 1つのコミットで1つの変更

```bash
# 良い例
git commit -m "fix: ログインボタンが押せない問題を修正"

# 悪い例
git commit -m "fix: ログインボタンとパスワードフィールドの問題を修正"
# ↑ 2つの異なる問題を1つのコミットで修正
```

### 3. テストとコードを一緒にコミット

```bash
# 良い例
git add src/services/user.service.ts
git add src/services/__tests__/user.service.test.ts
git commit -m "feat: ユーザーサービスを追加"

# 許容される例（テストを後から追加）
git commit -m "feat: ユーザーサービスを追加"
git commit -m "test: ユーザーサービステストを追加"
```

---

## Git Hooks

ArchiTrackでは、コミット時に自動的にコード品質チェックを実行するGit hooksを使用しています。

詳細は[Git設定](../development/git-configuration.md)を参照してください。

**自動実行される内容:**
- Prettier（コードフォーマット）
- ESLint（コード品質チェック）
- Prismaフォーマット（スキーマファイル）
- Draft Migrationsチェック

---

## 次のステップ

- [コントリビューションガイド](guide.md): コントリビューションの流れ
- [行動規範](code-of-conduct.md): コミュニティの行動規範
- [開発ワークフロー](../development/workflow.md): 開発の流れ
