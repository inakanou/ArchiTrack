---
name: readme-update
description: "README.mdの更新・反映作業時に自動適用される品質基準。README.mdの最新化、プロジェクト状況の反映、ドキュメント更新を行う際に発動する。README、ドキュメント更新、docs/配下のサブドキュメントに関する作業時に適用。"
---

# README.md更新ガイドライン

README.mdはプロジェクトルートの単一ファイルではなく、`docs/`配下のサブドキュメント群と一体の構成である。
README.mdを更新する際は、関連するサブドキュメントも必ずセットで確認・更新すること。

## 1. ドキュメント構成

README.mdは以下のサブドキュメントへのリンクを含む。更新時は影響範囲を確認すること。

| カテゴリ | サブドキュメント（docs/配下） |
|---|---|
| **はじめに** | `getting-started/prerequisites.md`, `getting-started/installation.md`, `getting-started/quick-start.md`, `features.md` |
| **開発** | `development/workflow.md`, `development/database-migration.md`, `development/testing.md`, `development/debugging.md`, `development/coding-standards.md`, `development/git-configuration.md`, `development/mcp-setup.md` |
| **デプロイ** | `deployment/overview.md`, `deployment/environment-variables.md`, `deployment/secrets-management.md`, `deployment/key-rotation-procedure.md`, `deployment/railway-setup.md`, `deployment/r2-lifecycle-rules.md`, `deployment/cicd-github-actions.md`, `deployment/troubleshooting.md` |
| **アーキテクチャ** | `architecture/system-overview.md`, `architecture/data-flow.md`, `architecture/security-design.md`, `architecture/storage-configuration.md`, `architecture/tech-stack.md`, `architecture/project-structure.md` |
| **API** | `api/overview.md`, `api/authentication.md`, `api/authorization.md`, `api/error-handling.md` |
| **コントリビューション** | `contributing/guide.md`, `contributing/commit-conventions.md`, `contributing/code-of-conduct.md` |

## 2. 更新時の必須チェックリスト

README.mdに変更を加える際は、以下を必ず確認する。

1. **影響範囲の特定**: 変更内容が関連するサブドキュメントを特定する
2. **サブドキュメントの同期更新**: README.mdの記述と矛盾しないようサブドキュメントも更新する
3. **リンク整合性**: 新規ドキュメント追加時はREADME.mdのリンク一覧にも追記する
4. **技術スタック表の更新**: バージョンアップやライブラリ変更時は`技術スタック`セクションと`architecture/tech-stack.md`の両方を更新する
5. **機能一覧の更新**: 機能追加・変更時は`主な機能`セクションと`features.md`の両方を更新する

## 3. よくある更新パターンと対応サブドキュメント

| 更新内容 | README.mdの更新箇所 | 連動して更新するサブドキュメント |
|---|---|---|
| 新機能の追加 | 主な機能 > 実装済み | `features.md` |
| 技術スタック変更 | 技術スタック表 | `architecture/tech-stack.md` |
| 環境構築手順変更 | クイックスタート | `getting-started/quick-start.md`, `getting-started/installation.md` |
| API追加・変更 | （直接記載なし） | `api/`配下の該当ドキュメント |
| デプロイ設定変更 | （直接記載なし） | `deployment/`配下の該当ドキュメント |
| プロジェクト構成変更 | プロジェクト構成 | `architecture/project-structure.md` |
| セキュリティ変更 | 主な特徴 | `architecture/security-design.md` |
| Docker構成変更 | Docker Compose構成表 | `getting-started/installation.md` |
