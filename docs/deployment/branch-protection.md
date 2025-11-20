# ブランチ保護設定ガイド

GitHubのブランチ保護機能を使用して、重要なブランチ（main、develop）への誤ったコミットやマージを防ぎます。

## 目次

- [概要](#概要)
- [mainブランチの保護設定](#mainブランチの保護設定)
- [developブランチの保護設定](#developブランチの保護設定)
- [設定確認方法](#設定確認方法)
- [トラブルシューティング](#トラブルシューティング)

---

## 概要

### ブランチ保護の目的

1. **品質保証**: CI/CDが成功しないコードはマージできない
2. **レビュー文化**: 最低1名のレビュー承認を必須化
3. **事故防止**: 直接プッシュを禁止し、PRを経由させる
4. **監査証跡**: すべての変更をPR経由で記録

### 保護対象ブランチ

| ブランチ | 保護レベル | 理由 |
|---------|-----------|------|
| main | **最高** | 本番環境にデプロイされるため |
| develop | **中** | 次期リリースの統合ブランチのため |

---

## mainブランチの保護設定

### 設定手順

1. GitHubリポジトリページで **Settings** タブをクリック
2. 左サイドバーから **Branches** を選択
3. **Add branch protection rule** ボタンをクリック
4. **Branch name pattern** に `main` と入力
5. 以下の設定を有効化

### 必須設定

#### 1. Require a pull request before merging

✅ **有効化**

- **Require approvals**: `1`
  - 最低1名のレビュー承認が必要
  - より厳格にする場合は `2` に設定

- ✅ **Dismiss stale pull request approvals when new commits are pushed**
  - 新しいコミットがプッシュされたら承認をリセット
  - レビュー後の変更を再確認するため

- ✅ **Require review from Code Owners**（オプション）
  - `.github/CODEOWNERS` ファイルが存在する場合に有効化
  - 特定ファイルの変更には特定メンバーの承認が必要

#### 2. Require status checks to pass before merging

✅ **有効化**

- ✅ **Require branches to be up to date before merging**
  - マージ前にブランチを最新状態にすることを強制
  - マージ時のコンフリクトを最小化

**必須ステータスチェック（以下をすべて選択）:**

```
Lint & Format Check (backend)
Lint & Format Check (frontend)
Lint & Format Check (e2e)
TypeScript Type Check (backend)
TypeScript Type Check (frontend)
TypeScript Type Check (e2e)
Unit Tests (backend)
Unit Tests (frontend)
Build Test (backend)
Build Test (frontend)
Integration & E2E Tests
Security Scan (backend)
Security Scan (frontend)
CI Success
```

**注意**: ステータスチェックは、一度CIが実行されるとドロップダウンに表示されます。初回設定時に表示されない場合は、PRを作成してCIを実行後、再度設定画面に戻って選択してください。

#### 3. Require linear history

✅ **有効化**

- マージコミットを禁止し、リベースまたはスカッシュマージのみを許可
- コミット履歴をクリーンに保つ

#### 4. Include administrators

✅ **有効化**

- 管理者も含めて全員がルールに従う
- 例外を作らないことで一貫性を保つ

#### 5. Restrict who can push to matching branches（推奨）

✅ **有効化**（チームの方針に応じて）

- リリース担当者やシニア開発者のみに制限
- より厳格な運用を行う場合に設定

**設定例:**
- リリースマネージャー
- テックリード
- CI/CDボット（GitHub Actions）

#### 6. Do not allow bypassing the above settings

✅ **有効化**

- どのような状況でも上記ルールをバイパスできない
- 最高レベルの保護

### 設定完了

すべての設定を確認したら、**Create** ボタンをクリックして保存します。

---

## developブランチの保護設定

### 設定手順

1. **Add branch protection rule** をクリック
2. **Branch name pattern** に `develop` と入力
3. 以下の設定を有効化

### 推奨設定

#### 1. Require a pull request before merging

✅ **有効化**

- **Require approvals**: `1`（推奨）
  - featureブランチのマージには最低1名のレビュー
  - チームサイズに応じて調整可能

- ✅ **Dismiss stale pull request approvals when new commits are pushed**

#### 2. Require status checks to pass before merging

✅ **有効化**

- ✅ **Require branches to be up to date before merging**

**必須ステータスチェック（mainと同じ）:**

```
Lint & Format Check (backend)
Lint & Format Check (frontend)
Lint & Format Check (e2e)
TypeScript Type Check (backend)
TypeScript Type Check (frontend)
TypeScript Type Check (e2e)
Unit Tests (backend)
Unit Tests (frontend)
Build Test (backend)
Build Test (frontend)
Integration & E2E Tests
Security Scan (backend)
Security Scan (frontend)
CI Success
```

#### 3. Require linear history

✅ **有効化**

#### 4. Include administrators（オプション）

チームの方針に応じて設定:
- **有効**: 厳格な運用
- **無効**: 管理者の柔軟性を確保

### 設定完了

**Create** ボタンをクリックして保存します。

---

## 設定確認方法

### GitHub UI での確認

1. **Settings** > **Branches**
2. **Branch protection rules** セクションに以下が表示されることを確認:
   ```
   main
   develop
   ```
3. 各ルールをクリックして詳細設定を確認

### 実際の動作確認

#### mainブランチへの直接プッシュが禁止されているか

```bash
git checkout main
git pull origin main
echo "test" >> test.txt
git add test.txt
git commit -m "test"
git push origin main
```

**期待される結果:**
```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Changes must be made through a pull request.
```

#### PR作成時にCI成功が必須になっているか

1. テストが失敗するコードを含むPRを作成
2. PRページで **Merge pull request** ボタンが無効化されていることを確認
3. 「All checks have passed」が表示されるまでマージできないことを確認

#### レビュー承認が必須になっているか

1. 自分でPRを作成
2. **Merge pull request** ボタンが無効化されていることを確認
3. 別のユーザーによる承認後、ボタンが有効化されることを確認

---

## トラブルシューティング

### ステータスチェックが表示されない

**原因**: まだCIが一度も実行されていない

**解決方法:**
1. ダミーのPRを作成してCIを実行
2. CI実行後、ブランチ保護設定画面に戻る
3. ドロップダウンからステータスチェックを選択

### 管理者が保護ルールをバイパスしてしまう

**原因**: 「Include administrators」が無効化されている

**解決方法:**
1. ブランチ保護設定を開く
2. ✅ **Include administrators** を有効化
3. **Save changes** をクリック

### 緊急時にマージできない

**通常のフロー:**
- 緊急時でもPRを作成し、レビューを依頼
- レビュアーに緊急であることを伝達（Slackなど）
- 承認後、即座にマージ

**真の緊急事態（サービス停止中など）:**
1. リポジトリ管理者に連絡
2. 一時的にブランチ保護を無効化
3. 修正をマージ
4. **即座にブランチ保護を再有効化**

⚠️ **警告**: ブランチ保護の無効化は最終手段です。可能な限り通常のフローに従ってください。

### Dependabot PRがマージできない

**原因1**: ステータスチェックが失敗している

**解決方法:**
- CI ログを確認
- 依存関係の破壊的変更がないか確認
- 必要に応じてコードを修正

**原因2**: レビュー承認が必要

**解決方法:**
- DependabotのPRを確認
- セキュリティ更新は優先的に承認
- メジャーバージョンアップは慎重にレビュー

### 古いPRがマージできない

**原因**: 「Require branches to be up to date」が有効で、ブランチが古い

**解決方法:**
```bash
# PRのブランチをチェックアウト
gh pr checkout <PR番号>

# developまたはmainから最新を取得してリベース
git fetch origin
git rebase origin/develop  # または origin/main

# 強制プッシュ
git push origin HEAD --force-with-lease
```

---

## セキュリティ考慮事項

### 推奨事項

1. **定期的な設定レビュー**
   - 四半期ごとにブランチ保護設定を見直す
   - 新しいCIチェックを追加した際は設定を更新

2. **監査ログの確認**
   - Settings > Audit log でブランチ保護の変更履歴を確認
   - 不正な変更がないか定期的にチェック

3. **チーム教育**
   - 新メンバーにブランチ保護の意義を説明
   - バイパス方法を安易に共有しない

4. **アクセス権の最小化**
   - リポジトリ管理者権限は必要最小限に
   - ブランチ保護設定変更権限を制限

### 注意事項

- ブランチ保護設定の変更は慎重に行う
- 設定変更後は必ず動作確認を実施
- 緊急時の対応フローを事前に決めておく

---

## 関連ドキュメント

- [Git ワークフロー](../development/git-workflow.md)
- [CI/CD パイプライン](./../development/ci-cd.md)
- [コントリビューションガイド](../../README.md#コントリビューション)

---

**最終更新**: 2025-11-19
