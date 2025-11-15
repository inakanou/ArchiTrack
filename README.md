<div align="center">

# ArchiTrack

**アーキテクチャ決定記録（ADR）管理システム**

[![CI](https://github.com/your-org/ArchiTrack/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ArchiTrack/actions/workflows/ci.yml)
[![CD](https://github.com/your-org/ArchiTrack/actions/workflows/cd.yml/badge.svg)](https://github.com/your-org/ArchiTrack/actions/workflows/cd.yml)
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
- ⚡ **高速**: Vite + React 18によるモダンなフロントエンド
- 🔒 **セキュア**: JWT認証、2FA、RBAC、Argon2ハッシュ化、HIBP漏洩チェック
- 🐳 **コンテナ化**: Dockerによる一貫した開発・本番環境
- 🧪 **高品質**: 80%以上のテストカバレッジ要件
- 🚀 **自動デプロイ**: GitHub ActionsによるCI/CDパイプライン

---

## クイックスタート

### 前提条件

- [Node.js 22以上](docs/getting-started/prerequisites.md#nodejs-22以上)
- [Docker & Docker Compose](docs/getting-started/prerequisites.md#docker--docker-compose)
- [Claude Code](docs/getting-started/prerequisites.md#claude-code)（推奨、[MCP設定](docs/development/mcp-setup.md)）

### 起動

```bash
# リポジトリをクローン
git clone <repository-url>
cd ArchiTrack

# Git hooksを有効化
git config core.hooksPath .husky

# 環境変数ファイルをコピー
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Docker Composeで起動
docker-compose up -d
```

**アクセス先:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs

詳細は[インストール手順](docs/getting-started/installation.md)を参照してください。

---

## ドキュメント

### 📚 はじめに

- [前提条件](docs/getting-started/prerequisites.md) - 必須ツールのインストール
- [インストール](docs/getting-started/installation.md) - ローカル環境のセットアップ
- [クイックスタート](docs/getting-started/quick-start.md) - 5分で起動

### 💻 開発

- [開発ワークフロー](docs/development/workflow.md) - Kiro-style SDD、ブランチ戦略
- [データベースマイグレーション](docs/development/database-migration.md) - Prisma、Draft機能
- [テスト](docs/development/testing.md) - ユニット・統合・E2Eテスト
- [コーディング規約](docs/development/coding-standards.md) - TypeScript・React・Prisma規約
- [Git設定](docs/development/git-configuration.md) - Git hooks設定
- [MCP設定](docs/development/mcp-setup.md) - Playwright MCPサーバー（Claude Code用）

### 🚀 デプロイ

- [デプロイ概要](docs/deployment/overview.md) - デプロイ方式とワークフロー
- [環境変数設定](docs/deployment/environment-variables.md) - 必須環境変数一覧
- [シークレット管理](docs/deployment/secrets-management.md) - JWT鍵・2FA鍵の生成
- [Railway設定](docs/deployment/railway-setup.md) - Railway初回セットアップ
- [CI/CD設定](docs/deployment/cicd-github-actions.md) - GitHub Actions設定
- [トラブルシューティング](docs/deployment/troubleshooting.md) - よくある問題と解決方法

### 🏗️ アーキテクチャ

- [システム構成](docs/architecture/system-overview.md) - システム全体像
- [データフロー](docs/architecture/data-flow.md) - データの流れ
- [セキュリティ設計](docs/architecture/security-design.md) - セキュリティ層
- [技術スタック](docs/architecture/tech-stack.md) - 技術選定理由

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
| **Frontend** | React 18 + Vite 7 |
| **Backend** | Node.js 22 + Express |
| **Database** | PostgreSQL 15 + Redis 7 |
| **Authentication** | JWT (EdDSA) + Argon2 + TOTP |
| **Testing** | Vitest + Playwright + Storybook |
| **Deployment** | Railway + GitHub Actions |

詳細は[技術スタック](docs/architecture/tech-stack.md)を参照してください。

---

## 主な機能

### 現在実装済み

#### インフラストラクチャ
- ✅ ヘルスチェックAPI
- ✅ Swagger/OpenAPI仕様書自動生成
- ✅ PostgreSQLデータベース統合
- ✅ Redisキャッシング準備
- ✅ Sentry統合（エラー監視）
- ✅ E2Eテスト環境（Playwright）

#### 認証・認可機能
- ✅ **ユーザー認証**: JWT（EdDSA署名）ベースの認証
- ✅ **招待制ユーザー登録**: 管理者による招待トークン発行
- ✅ **二段階認証（2FA）**: TOTP方式、バックアップコード、QRコード生成
- ✅ **パスワード管理**: Argon2idハッシュ化、HIBP漏洩チェック、パスワード履歴管理
- ✅ **ロールベースアクセス制御（RBAC）**: NIST RBAC標準準拠
- ✅ **セッション管理**: マルチデバイス対応、全デバイスログアウト
- ✅ **監査ログ**: センシティブな操作の完全記録

### 開発予定

- 🚧 ADR作成・編集・削除
- 🚧 ADRバージョン管理
- 🚧 チーム管理機能
- 🚧 ADR検索・フィルタリング
- 🚧 Markdown エディタ
- 🚧 ADRテンプレート管理

---

## プロジェクト構成

```
ArchiTrack/
├── frontend/              # React/Viteフロントエンド
├── backend/               # Node.js/Expressバックエンド
├── e2e/                   # E2Eテスト（Playwright）
├── docs/                  # ドキュメント
│   ├── getting-started/   # 初めての人向け
│   ├── development/       # 開発者向け
│   ├── deployment/        # デプロイ担当者向け
│   ├── architecture/      # 技術者・レビュワー向け
│   ├── api/               # API利用者向け
│   └── contributing/      # コントリビューター向け
├── .kiro/                 # Kiro-style SDD
├── .claude/               # Claude Code設定
├── .github/               # CI/CD（GitHub Actions）
└── docker-compose.yml     # ローカル開発環境
```

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
