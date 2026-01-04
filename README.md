<div align="center">

# ArchiTrack

**アーキテクチャ決定記録（ADR）管理システム**

[![CI/CD](https://github.com/your-org/ArchiTrack/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ArchiTrack/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/your-org/ArchiTrack/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/ArchiTrack)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [日本語](README.ja.md)

</div>

---

## 概要

ArchiTrackは、ソフトウェアプロジェクトにおけるアーキテクチャ決定記録（ADR: Architecture Decision Record）を効率的に管理するためのWebアプリケーションです。Claude Codeを活用したKiro-style Spec Driven Developmentで開発されています。

### 主な特徴

- 🤖 **AI支援開発**: Claude Codeによる体系的な開発ワークフロー
- 📝 **スペック駆動**: 要件定義 → 設計 → タスク分解 → 実装の明確なフェーズ管理
- 🔗 **要件トレーサビリティ**: コード・テストと要件定義書の自動紐付け・カバレッジ測定
- ⚡ **高速**: Vite 7 + React 19によるモダンなフロントエンド
- 🔒 **セキュア**: JWT認証（EdDSA）、2FA、RBAC、Argon2ハッシュ化、HIBP漏洩チェック
- 🗄️ **モダンORM**: Prisma 7（Driver Adapter Pattern）による型安全なデータアクセス
- 🐳 **コンテナ化**: Dockerによる一貫した開発・本番環境
- 🧪 **高品質**: 80%以上のテストカバレッジ要件、要件カバレッジ検証
- 🚀 **自動デプロイ**: GitHub ActionsによるCI/CDパイプライン

---

## クイックスタート

```bash
# 1. 環境を自動セットアップ（初回のみ）
./scripts/setup-local-env.sh

# 2. 開発環境を起動（npm scriptsを使用、推奨）
npm run dev:docker

# または直接コマンドを使用する場合
# docker compose -p architrack-dev -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up
```

**アクセス先:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs

詳細は[クイックスタート](docs/getting-started/quick-start.md)または[インストール手順](docs/getting-started/installation.md)を参照してください。

---

## ドキュメント

### 📚 はじめに

- [前提条件](docs/getting-started/prerequisites.md) - 必須ツールのインストール
- [インストール](docs/getting-started/installation.md) - ローカル環境のセットアップ
- [クイックスタート](docs/getting-started/quick-start.md) - 5分で起動
- [機能一覧](docs/features.md) - 実装済み・開発予定機能の詳細

### 💻 開発

- [開発ワークフロー](docs/development/workflow.md) - Kiro-style SDD、ブランチ戦略
- [データベースマイグレーション](docs/development/database-migration.md) - Prisma、Draft機能
- [テスト](docs/development/testing.md) - ユニット・統合・E2Eテスト、要件カバレッジ
- [デバッグ](docs/development/debugging.md) - VSCodeデバッグ設定、トラブルシューティング
- [コーディング規約](docs/development/coding-standards.md) - TypeScript・React・Prisma規約、要件タグ
- [Git設定](docs/development/git-configuration.md) - Git hooks設定
- [MCP設定](docs/development/mcp-setup.md) - Playwright MCPサーバー（Claude Code用）

### 🚀 デプロイ

- [デプロイ概要](docs/deployment/overview.md) - デプロイ方式とワークフロー
- [環境変数設定](docs/deployment/environment-variables.md) - 必須環境変数一覧
- [シークレット管理](docs/deployment/secrets-management.md) - JWT鍵・2FA鍵の生成
- [鍵ローテーション手順](docs/deployment/key-rotation-procedure.md) - EdDSA鍵の定期更新手順
- [Railway設定](docs/deployment/railway-setup.md) - Railway初回セットアップ
- [R2 Lifecycle Rules](docs/deployment/r2-lifecycle-rules.md) - 孤立ファイル自動削除設定
- [CI/CD設定](docs/deployment/cicd-github-actions.md) - GitHub Actions設定
- [トラブルシューティング](docs/deployment/troubleshooting.md) - よくある問題と解決方法

### 🏗️ アーキテクチャ

- [システム構成](docs/architecture/system-overview.md) - システム全体像
- [データフロー](docs/architecture/data-flow.md) - データの流れ
- [セキュリティ設計](docs/architecture/security-design.md) - セキュリティ層
- [ストレージ構成](docs/architecture/storage-configuration.md) - 画像ストレージ（Local/R2）
- [技術スタック](docs/architecture/tech-stack.md) - 技術選定理由
- [プロジェクト構造](docs/architecture/project-structure.md) - ディレクトリ構成とファイル構成

### 🔌 API

- [API概要](docs/api/overview.md) - API仕様、Swagger UI
- [認証API](docs/api/authentication.md) - ログイン、2FA、パスワードリセット
- [認可API](docs/api/authorization.md) - ロール管理、権限管理
- [エラーハンドリング](docs/api/error-handling.md) - エラーコード一覧

### 🤝 コントリビューション

- [コントリビューションガイド](docs/contributing/guide.md) - コントリビューションの流れ
- [コミット規約](docs/contributing/commit-conventions.md) - コミットメッセージのルール
- [行動規範](docs/contributing/code-of-conduct.md) - コミュニティの行動規範

---

## 技術スタック

| 分類 | 技術 |
|------|------|
| **Frontend** | React 19 + Vite 7 + TypeScript 5.9 |
| **Backend** | Node.js 22 + Express 5 + Prisma 7 |
| **Database** | PostgreSQL 15 + Redis 7 |
| **Authentication** | JWT (EdDSA) + Argon2 + TOTP |
| **Testing** | Vitest 4 + Playwright + Storybook 10 |
| **Deployment** | Railway + GitHub Actions |

---

## 主な機能

### 実装済み
- **認証・認可基盤**: JWT（EdDSA署名）+ 2FA、RBAC、監査ログ
- **プロジェクト管理**: プロジェクトCRUD、12種類のステータス遷移管理、担当者割り当て
- **取引先管理**: 顧客・協力業者のCRUD、種別管理、請求締日・支払日設定
- **現場調査**: プロジェクトに紐付く調査管理、画像アップロード（R2連携）、Canvas注釈編集（Fabric.js）、PDF報告書エクスポート
- **インフラ**: ヘルスチェックAPI、Swagger、PostgreSQL/Redis統合

### 開発予定
- ADR作成・編集、バージョン管理、チーム管理、検索機能などのコア機能

詳細な機能リストは[機能一覧](docs/features.md)を参照してください。

---

## プロジェクト構成

- **frontend/** - React 19 + Vite 7 + TypeScript 5.9 フロントエンド
- **backend/** - Node.js 22 + Express 5 + Prisma 7 バックエンド
- **e2e/** - Playwright E2Eテスト
- **docs/** - 包括的なドキュメント（対象読者ごとに整理）
- **.kiro/** - Kiro-style Spec-Driven Development
- **.github/** - CI/CD（GitHub Actions）

### Docker Compose構成

| 環境 | 構成ファイル | 用途 |
|------|-------------|------|
| **開発環境** | `docker-compose.yml` + `docker-compose.dev.yml` | ローカル画面打鍵・開発作業 |
| **テスト環境** | `docker-compose.yml` + `docker-compose.test.yml` | ローカル自動テスト実行 |
| **デバッグ環境** | `+ docker-compose.debug.yml` | Node.jsデバッガ接続 |
| **CI環境** | `docker-compose.yml` + `docker-compose.ci.yml` | GitHub Actions用 |

詳細なディレクトリ構造は[プロジェクト構造](docs/architecture/project-structure.md)を参照してください。

---

## コントリビューション

ArchiTrackへのコントリビューションを歓迎します！

1. [コントリビューションガイド](docs/contributing/guide.md)を確認
2. [行動規範](docs/contributing/code-of-conduct.md)に同意
3. [開発環境をセットアップ](docs/getting-started/installation.md)
4. フィーチャーブランチで開発
5. Pull Requestを作成

詳細は[コントリビューションガイド](docs/contributing/guide.md)を参照してください。

---

## ライセンス

MIT

---

## 謝辞

このプロジェクトは以下のオープンソースプロジェクトに支えられています：

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [Playwright](https://playwright.dev/)
- [Claude Code](https://claude.ai/claude-code)

そして、すべてのコントリビューターに感謝します 🎉
