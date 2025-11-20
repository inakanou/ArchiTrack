# Git ワークフロー

ArchiTrackプロジェクトでは、**Git Flow**ベースのブランチ戦略を採用しています。

## 目次

- [ブランチ戦略概要](#ブランチ戦略概要)
- [ブランチの役割](#ブランチの役割)
- [開発フロー](#開発フロー)
- [Dependabot統合](#dependabot統合)
- [緊急対応（Hotfix）](#緊急対応hotfix)
- [ベストプラクティス](#ベストプラクティス)

---

## ブランチ戦略概要

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

### 基本原則

1. **mainブランチ**は常に本番環境にデプロイ可能な状態
2. **developブランチ**は次のリリースに向けた開発統合ブランチ
3. **featureブランチ**は個別の機能開発用
4. **hotfixブランチ**は本番環境の緊急修正用

---

## ブランチの役割

### main（本番ブランチ）

- **目的**: 本番環境にデプロイされるコード
- **保護レベル**: 最高（直接プッシュ禁止、PR必須、全CI成功必須）
- **デプロイ**: mainへのマージで自動的にRailway本番環境へデプロイ
- **タグ付け**: リリース時にバージョンタグを付与（例: `v0.1.0`）

**ルール:**
- 直接コミット・プッシュは禁止
- developブランチからのPRのみマージ可能
- 全てのCIチェックが成功していること
- 最低1名のレビュー承認が必要

### develop（開発統合ブランチ）

- **目的**: 次のリリースに向けた機能の統合
- **保護レベル**: 中（PRレビュー推奨、CI成功必須）
- **デプロイ**: developへのマージで自動的にRailway Staging環境へデプロイ（将来実装予定）
- **更新頻度**: 日常的（featureブランチがマージされる度）

**ルール:**
- featureブランチからのPRをマージ
- Dependabotの依存関係更新PRはdevelopに向ける
- mainより常に先に進んでいる状態を維持
- 定期的にmainにリリースとしてマージ

### feature/*（機能開発ブランチ）

- **目的**: 個別の機能・改善の開発
- **命名規則**: `feature/<機能名>`（例: `feature/user-authentication`）
- **ライフサイクル**: developから分岐 → 開発 → developへマージ → 削除
- **保護レベル**: なし

**ルール:**
- developブランチから分岐
- 開発完了後、developブランチへPR作成
- マージ後はブランチを削除

**命名例:**
```
feature/user-authentication  # ユーザー認証機能
feature/adr-search           # ADR検索機能
feature/dashboard-redesign   # ダッシュボード再設計
```

### hotfix/*（緊急修正ブランチ）

- **目的**: 本番環境の緊急バグ修正
- **命名規則**: `hotfix/<Issue番号>-<簡潔な説明>`（例: `hotfix/123-login-error`）
- **ライフサイクル**: mainから分岐 → 修正 → mainとdevelopの両方へマージ → 削除

**ルール:**
- mainブランチから分岐
- 修正完了後、mainとdevelopの両方へPR作成
- mainマージ時にバージョンタグを付与（例: `v0.1.1`）

---

## 開発フロー

### 1. 新機能開発

```bash
# 1. developブランチを最新化
git checkout develop
git pull origin develop

# 2. featureブランチを作成
git checkout -b feature/new-feature

# 3. 開発作業
# （コーディング、テスト追加、コミット）

# 4. リモートにプッシュ
git push origin feature/new-feature

# 5. GitHub上でPR作成（develop ← feature/new-feature）
gh pr create --base develop --head feature/new-feature \
  --title "feat: 新機能の追加" \
  --body "## 概要
新機能を追加しました。

## 変更内容
- 機能A
- 機能B

## テスト
- [x] ユニットテスト追加
- [x] 統合テスト追加"

# 6. CIの成功を確認

# 7. レビュー承認後、マージ
gh pr merge --squash

# 8. ローカルのfeatureブランチを削除
git checkout develop
git pull origin develop
git branch -d feature/new-feature
```

### 2. リリースフロー

```bash
# 1. developブランチを確認
git checkout develop
git pull origin develop

# 2. リリース準備が整ったら、PR作成（main ← develop）
gh pr create --base main --head develop \
  --title "Release v0.2.0" \
  --body "## リリース内容
- ユーザー認証機能
- ADR管理基本機能
- パフォーマンス改善

## テスト
- [x] 全CI成功
- [x] Staging環境での動作確認
- [x] セキュリティレビュー完了

## リリースノート
`.kiro/specs/*/release-notes.md`参照"

# 3. レビュー承認後、マージ

# 4. mainブランチでバージョンタグを付与
git checkout main
git pull origin main
git tag -a v0.2.0 -m "Release v0.2.0

- ユーザー認証機能
- ADR管理基本機能
- パフォーマンス改善"
git push origin v0.2.0

# 5. 本番環境への自動デプロイを確認
```

### 3. Hotfix（緊急修正）フロー

```bash
# 1. mainブランチから分岐
git checkout main
git pull origin main
git checkout -b hotfix/123-critical-bug

# 2. 修正作業
# （バグ修正、テスト追加、コミット）

# 3. リモートにプッシュ
git push origin hotfix/123-critical-bug

# 4. mainへのPR作成
gh pr create --base main --head hotfix/123-critical-bug \
  --title "hotfix: 致命的なバグの修正 (#123)" \
  --body "## 問題
ログイン時にセッションエラーが発生

## 修正内容
セッション管理ロジックを修正

## 影響範囲
ログイン機能のみ

Fixes #123"

# 5. mainへマージ後、developへもマージするPR作成
gh pr create --base develop --head hotfix/123-critical-bug \
  --title "hotfix: 致命的なバグの修正 (#123) [develop統合]"

# 6. 両方のPRがマージされたら、バージョンタグを付与
git checkout main
git pull origin main
git tag -a v0.1.1 -m "Hotfix v0.1.1 - ログインエラー修正"
git push origin v0.1.1

# 7. hotfixブランチを削除
git branch -d hotfix/123-critical-bug
```

---

## Dependabot統合

Dependabotによる依存関係更新は、**developブランチ**向けに自動的にPRが作成されます。

### 設定

`.github/dependabot.yml` で以下のように設定されています：

```yaml
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    target-branch: "develop"  # developブランチに向ける
    schedule:
      interval: "weekly"
```

### 処理フロー

```
Dependabot更新検出
  ↓
developブランチ向けにPR作成
  ↓
CI自動実行
  ↓
レビュー・承認
  ↓
developにマージ
  ↓
次回リリース時にmainへマージ
```

### レビューガイドライン

Dependabot PRをレビューする際のチェックポイント：

1. **破壊的変更（Breaking Changes）の確認**
   - メジャーバージョンアップは特に注意
   - CHANGELOGやリリースノートを確認

2. **CI結果の確認**
   - 全てのテストが成功しているか
   - セキュリティスキャンに問題がないか

3. **依存関係の整合性**
   - 他のパッケージとの競合がないか
   - peerDependenciesの警告がないか

4. **セキュリティ更新の優先**
   - セキュリティ脆弱性修正は優先的にマージ

**マージ手順:**
```bash
# Dependabot PRをローカルで確認（オプション）
gh pr checkout <PR番号>
npm --prefix backend install
npm --prefix backend run test

# 問題なければマージ
gh pr review --approve
gh pr merge --squash
```

---

## 緊急対応（Hotfix）

### Hotfixが必要なケース

- 本番環境で致命的なバグが発見された
- セキュリティ脆弱性の緊急修正が必要
- データ破損のリスクがある問題

### Hotfixの優先度判断

| 優先度 | 条件 | 対応時間 |
|--------|------|---------|
| **Critical** | サービス停止、データ損失リスク | 即座 |
| **High** | 主要機能の動作不良 | 数時間以内 |
| **Medium** | 一部機能の軽微な不具合 | 1日以内 |

**Medium以下は次回リリースで対応を検討**

### Hotfix作業手順（詳細）

1. **Issue作成**
   ```bash
   gh issue create --title "Critical: ログイン失敗エラー" \
     --body "## 現象
   ユーザーがログインできない

   ## 再現手順
   1. ログインページにアクセス
   2. 正しい認証情報を入力
   3. エラーが表示される

   ## 影響範囲
   全ユーザー

   ## 優先度
   Critical"
   ```

2. **Hotfixブランチ作成**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/456-login-failure
   ```

3. **修正とテスト**
   - 問題を特定
   - 最小限の変更で修正
   - テストを追加して再発防止

4. **PR作成とマージ**
   - mainへのPR作成
   - 緊急レビュー
   - マージ後、即座にデプロイ確認

5. **developへの反映**
   - developへもマージしてバックポート

6. **パッチバージョンタグ**
   ```bash
   git tag -a v0.1.1 -m "Hotfix: ログイン失敗エラー修正"
   git push origin v0.1.1
   ```

---

## ベストプラクティス

### ブランチ管理

1. **ブランチは小さく保つ**
   - 1つのブランチで1つの機能/修正
   - 大きな機能は複数のfeatureブランチに分割

2. **定期的にdevelopからリベース**
   ```bash
   git checkout feature/my-feature
   git fetch origin
   git rebase origin/develop
   ```

3. **マージ後はブランチを削除**
   ```bash
   # リモートブランチ削除（GitHub UIで自動設定可能）
   git push origin --delete feature/old-feature

   # ローカルブランチ削除
   git branch -d feature/old-feature
   ```

### コミット規約

- **Conventional Commits**に従う
- 1コミットで1つの論理的な変更
- 詳細はREADME.mdの「コミットメッセージ規約」参照

### PR作成時の注意点

1. **自己レビューを実施**
   - 変更差分を確認
   - 不要なコメント・デバッグコードを削除

2. **CI成功を確認**
   - すべてのチェックが緑になってからレビュー依頼

3. **適切な説明を記載**
   - 変更の背景・目的
   - テスト方法
   - スクリーンショット（UI変更時）

4. **レビュアーを指定**
   - 関連分野の専門家をアサイン
   - 最低1名の承認を得る

### ブランチの命名規則

```bash
# 機能開発
feature/user-authentication
feature/adr-template-system
feature/dashboard-redesign

# バグ修正
fix/login-button-disabled
fix/data-validation-error

# 緊急修正
hotfix/123-session-leak
hotfix/456-sql-injection

# リファクタリング
refactor/api-client-structure
refactor/database-queries

# パフォーマンス改善
perf/reduce-bundle-size
perf/optimize-database-queries
```

### トラブルシューティング

#### コンフリクトが発生した場合

```bash
# developの最新状態を取得
git fetch origin

# リベース実行
git rebase origin/develop

# コンフリクト解決
# （エディタでコンフリクトを修正）

# 解決後、リベース続行
git add .
git rebase --continue

# force pushが必要な場合（featureブランチのみ）
git push origin feature/my-feature --force-with-lease
```

#### 誤ってmainに直接コミットした場合

```bash
# コミットを取り消す（コミット前の状態に戻す）
git reset --soft HEAD~1

# 正しいブランチを作成
git checkout -b feature/accidental-commit

# コミット
git commit -m "feat: 本来の変更"

# プッシュ
git push origin feature/accidental-commit
```

---

## 参考資料

- [Git Flow公式ドキュメント](https://nvie.com/posts/a-successful-git-branching-model/)
- [GitHub Flow](https://docs.github.com/ja/get-started/quickstart/github-flow)
- [Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/)
- [ブランチ保護設定ガイド](../deployment/branch-protection.md)

---

**最終更新**: 2025-11-19
