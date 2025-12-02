# コントリビューションガイド

ArchiTrackへのコントリビューションを歓迎します！このガイドでは、コントリビューションの流れを説明します。

---

## コントリビューションの流れ

### 1. Issueの作成または確認

新機能・バグ修正の前に、既存のIssueを確認してください。

- 存在しない場合は新しいIssueを作成
- Issueで実装方針を議論

### 2. リポジトリのFork

```bash
# GitHubでForkボタンをクリック
git clone https://github.com/your-username/ArchiTrack.git
cd ArchiTrack
```

### 3. 開発環境のセットアップ

```bash
# Git hooksを有効化
git config core.hooksPath .husky

# Docker Composeで起動
docker-compose up -d
```

詳細は[インストール手順](../getting-started/installation.md)を参照してください。

### 4. フィーチャーブランチの作成

```bash
git checkout -b feature/your-feature-name
# または
git checkout -b fix/issue-number-description
```

**ブランチ命名規則:**
- `feature/` - 新機能
- `fix/` - バグ修正
- `docs/` - ドキュメント変更
- `refactor/` - リファクタリング
- `test/` - テスト追加

### 5. 仕様駆動開発（中規模以上の機能）

Claude Codeを使用している場合：

```bash
# 仕様を作成
/kiro:spec-init [詳細な機能説明]
/kiro:spec-requirements [feature-name]
/kiro:spec-design [feature-name]
/kiro:spec-tasks [feature-name]
```

詳細は[開発ワークフロー](../development/workflow.md)を参照してください。

### 6. 実装

- [コーディング規約](../development/coding-standards.md)に従う
- テストを追加（カバレッジ80%以上維持）
- [コミットメッセージ規約](commit-conventions.md)に従う

### 7. ローカルテスト

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
```

### 8. コミット＆プッシュ

```bash
git add .
git commit -m "feat: 新機能の説明"
git push origin feature/your-feature-name
```

### 9. Pull Requestの作成

GitHub上でPull Requestを作成：

- PRテンプレートに従って記入
- レビュアーを指定（可能であれば）

**PRタイトル:**
```
feat(backend): ユーザー認証機能を実装
```

**PR本文テンプレート:**
```markdown
## 概要
この変更の目的を簡潔に説明してください。

## 変更内容
- 変更1
- 変更2
- 変更3

## 関連Issue
Closes #123

## テスト
- [ ] ユニットテスト追加
- [ ] 統合テスト追加
- [ ] E2Eテスト追加（該当する場合）
- [ ] 手動テスト完了

## チェックリスト
- [ ] コーディング規約に準拠
- [ ] テストカバレッジ80%以上維持
- [ ] ドキュメント更新（該当する場合）
- [ ] データベースマイグレーション生成（該当する場合）
- [ ] 破壊的変更がある場合は明記

## スクリーンショット（該当する場合）
変更前後のスクリーンショットを添付してください。
```

### 10. レビュー対応

- レビューコメントに対応
- 必要に応じて修正をコミット
- 承認後にマージ

---

## コーディング規約

詳細は[コーディング規約](../development/coding-standards.md)を参照してください。

### TypeScript/JavaScript

- **フォーマット**: Prettierに従う（自動整形）
- **Lint**: ESLintルールに準拠
- **命名規則**:
  - 変数/関数: camelCase (`getUserById`)
  - クラス/型: PascalCase (`UserModel`)
  - 定数: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

### React

- **関数コンポーネント**: クラスコンポーネントは使用しない
- **Hooks**: React Hooksのルールに従う
- **Props**: 型定義を必ず行う

### データベース（Prisma）

- **スキーマ**: 変更後は必ずマイグレーションを生成
- **命名**: snake_case（テーブル・カラム名）
- **インデックス**: パフォーマンス考慮した適切なインデックス設定

---

## コミットメッセージ規約

詳細は[コミット規約](commit-conventions.md)を参照してください。

### 基本形式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードフォーマット（機能変更なし）
- `refactor`: リファクタリング
- `perf`: パフォーマンス改善
- `test`: テスト追加・修正
- `chore`: ビルド・ツール設定変更

### 例

```bash
feat(backend): JWT認証ミドルウェアを追加
fix(frontend): ログインボタンが押せない問題を修正
docs: READMEにセットアップ手順を追加
```

---

## Pull Request（PR）ガイドライン

### PRタイトル

コミットメッセージと同じ規約に従います：

```
feat(backend): ユーザー認証機能を実装
```

### レビュー基準

レビュアーは以下の観点でチェックします：

#### コード品質

- [ ] コーディング規約に準拠しているか
- [ ] 適切な型定義がされているか
- [ ] エラーハンドリングが適切か
- [ ] セキュリティ上の問題がないか

#### テスト

- [ ] テストが追加されているか
- [ ] カバレッジが維持されているか（80%以上）
- [ ] エッジケースが考慮されているか

#### 設計

- [ ] 既存のアーキテクチャに適合しているか
- [ ] DRY原則に従っているか
- [ ] 拡張性が考慮されているか

#### ドキュメント

- [ ] コードコメントが適切か
- [ ] README等のドキュメントが更新されているか
- [ ] APIドキュメント（Swagger）が更新されているか

---

## 行動規範

詳細は[行動規範](code-of-conduct.md)を参照してください。

- **尊重**: すべてのコントリビューターを尊重する
- **建設的**: フィードバックは建設的に行う
- **協力的**: チームワークを重視する
- **包括的**: すべての人が参加しやすい環境を作る

---

## 質問・サポート

- **Issue**: バグ報告・機能要望は[GitHub Issues](https://github.com/your-org/ArchiTrack/issues)で
- **Discussion**: 議論は[GitHub Discussions](https://github.com/your-org/ArchiTrack/discussions)で
- **セキュリティ**: セキュリティ問題は直接報告（security@example.com）

---

## 次のステップ

- [コミット規約](commit-conventions.md): コミットメッセージのルール
- [行動規範](code-of-conduct.md): コミュニティの行動規範
- [開発ワークフロー](../development/workflow.md): 開発の流れ
