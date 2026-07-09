<div align="center">

# ArchiTrack

**建設プロジェクト管理・積算支援システム**

[![CI/CD](https://github.com/inakanou/ArchiTrack/actions/workflows/ci.yml/badge.svg)](https://github.com/inakanou/ArchiTrack/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/inakanou/ArchiTrack/branch/main/graph/badge.svg)](https://codecov.io/gh/inakanou/ArchiTrack)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

</div>

---

## 概要

ArchiTrackは、建設プロジェクトの管理・積算業務を効率化するためのWebアプリケーションです。プロジェクト管理、現場調査、数量拾い出し、内訳書作成、見積依頼・見積書作成までの一連の業務フローをサポートします。Claude Codeを活用したKiro-style Spec Driven Developmentで開発されています。

### 主な特徴

- 🤖 **AI支援開発**: Claude Codeによる体系的な開発ワークフロー
- 📝 **スペック駆動**: 要件定義 → 設計 → タスク分解 → 実装の明確なフェーズ管理
- 🏗️ **建設プロジェクト管理**: 現場調査・数量拾い出し・内訳書・見積依頼・見積書の一気通貫ワークフロー
- ⚡ **高速**: Vite 8 + React 19によるモダンなフロントエンド
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
- [Gitワークフロー](docs/development/git-workflow.md) - Git Flowベースのブランチ戦略
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
- [本番環境デプロイ](docs/deployment/production-deployment.md) - 本番環境へのデプロイ手順
- [ブランチ保護](docs/deployment/branch-protection.md) - GitHubブランチ保護設定
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
| **Frontend** | React 19 + Vite 8 + React Router 7 + TypeScript 6.0 + Tailwind CSS 4 |
| **Backend** | Node.js 22 + Express 5 + Prisma 7 + Zod 4 |
| **Database** | PostgreSQL 15 + Redis 7 |
| **Authentication** | JWT (EdDSA) + Argon2 + TOTP |
| **Testing** | Vitest 4 + Playwright + Storybook 10 |
| **Monitoring** | Sentry (Frontend + Backend) |
| **Deployment** | Railway + GitHub Actions |

---

## 主な機能

### 実装済み
- **認証・認可基盤**: JWT（EdDSA署名）+ 2FA、RBAC、監査ログ
- **プロジェクト管理**: プロジェクトCRUD、12種類のステータス遷移管理、担当者割り当て、ステータス別件数表示、取引先選択時の現場住所自動入力
- **取引先管理**: 顧客・協力業者のCRUD、種別管理、請求締日・支払日設定
- **現場調査**: プロジェクトに紐付く調査管理、画像アップロード（R2連携、マジックバイト判定による拡張子不一致許容、スマホ写真追加の高速化＝送信前クライアント圧縮・全件再取得廃止の即時反映・サムネイル優先表示）、画像プレビュー/編集の全体表示対応、Canvas注釈編集（Fabric.js、90度単位回転機能、注釈デフォルトスタイルの一元化、全形状（矢印・テキスト・寸法線・円・四角形・多角形・折れ線・フリーハンド）の白縁取りによる視認性向上、モバイル向けタッチジェスチャー/コンテキストメニュー、折返しツールバー、マルチタッチ抑止、2本指ピンチでの中点ズーム/パン、ズーム操作UI（ズームイン/アウト/全体表示・倍率表示・44px下部配置）、ダブルタップでの編集/ズーム調停、44px選択ハンドル）、スマートフォン表示最適化（詳細画面のモバイル縦積みレイアウト・水平はみ出し防止・16px入力欄・44pxタップ領域、編集画面のsvh基準表示領域・小画像のフィット拡大・単段横スクロールツールバー・ヘッダー重なり解消）、PDF報告書エクスポート、画像一括エクスポート（全件/選択画像をZIPダウンロード、共通エクスポート設定再利用、進捗表示・キャンセル・部分失敗対応）
- **数量表作成**: 現場調査結果に基づく数量拾い出し、クライアントサイド編集・明示保存モデル（編集はクライアント状態に反映し保存ボタン押下時に全状態を一括同期、未保存変更の離脱ガード・未保存インジケーターバッジ、操作ヘッダーの固定表示）、数量グループ・項目管理（グループ名変更・並び替え）、現場調査からの数量グループ一括生成（写真枚数分のグループを連番命名で自動作成）、写真プレビュー・変更ダイアログ（写真重なり解消レイアウト）、計算方法選択（標準・面積体積・ピッチ）、調整係数・丸め設定、オートコンプリート入力支援、数量表コピー機能、注釈付き画像対応PDF出力、水平スクロール時の画像・コメント固定表示
- **内訳書作成**: 数量表項目のピボット集計、分類軸によるグループ化、項目初期ソート順・手動並び替え（バッチ保存）、Excel出力（.xlsx形式）、クリップボードコピー（タブ区切りテキスト）
- **見積依頼管理**: 協力業者への見積依頼（TradingPartnerSelectコンボボックスUI）、内訳書項目選択、見積依頼文生成（メール/FAX、クリップボードコピー、Excel出力、メーラーへのワンクリック転記）、受領見積書登録（OCR構造化データ抽出、再実行/リトライ機能、PDFテキスト抽出ハイブリッドアプローチ、Claude Vision API統合によるOCR精度向上、項目選択からの一括転記）、ステータス管理
- **自社情報登録**: 会社名・住所・連絡先のシングルトン管理、見積依頼文への自動挿入
- **見積書作成**: 内訳書からの見積書生成、3行1セット構造（見積金額・実行金額・業者金額）、階層構造管理、項目並び替え（↑/↓ボタン）、受領見積書転記（改善ダイアログUI）、NET金額案分計算、利益率適用、諸経費（共通費）自動計算、値引き行（見積金額行のみ・マイナス単価許容・案分/利益率適用対象外）、改修工事フラグ（建築新営/改修パターン）、サマリー表示・コンパクトUI、Excel出力
- **契約書管理**: 新規契約・変更契約の作成、見積書からの金額自動取得、プロジェクト情報自動表示、変更前後比較表示、契約ステータス管理（契約前/契約済）、関連ドキュメントリンク、契約書編集
- **工程表作成**: 数量表連携による項目自動取得、ガントチャート形式リアルタイム表示（土日祝色分け）、任意項目追加・並び替え、出力対象チェックボックス、ラベル・詳細文字入力、Excel/PDF出力（プロジェクト名・自社名付き）、プロジェクト詳細画面への工程表セクション統合
- **数量表インポート**: Excel/PDFファイルからの数量データ自動取得（Claude Vision OCR対応）、インポート結果プレビュー、フィールドマッピング
- **実行予算管理**: 契約書からの実行予算作成、見積項目の階層構造表示（折り畳み対応）、実行単価編集、発注管理（取引先指定・項目選択・ステータス遷移・金額案分）、出来高入力（即0%/50%/100%・±5%・直接入力）、原価管理（月別支出・累計支出・残予算）、月次締め処理、契約変更反映、発注・出来高のExcel/PDF出力
- **インフラ**: ヘルスチェックAPI、Swagger、PostgreSQL/Redis統合

### 開発予定
- ADR管理機能（作成・編集、バージョン管理、検索機能）

詳細な機能リストは[機能一覧](docs/features.md)を参照してください。

---

## プロジェクト構成

- **frontend/** - React 19 + Vite 8 + TypeScript 6.0 フロントエンド
- **backend/** - Node.js 22 + Express 5 + Prisma 7 バックエンド
- **e2e/** - Playwright E2Eテスト
- **docs/** - 包括的なドキュメント（対象読者ごとに整理）
- **.kiro/** - Kiro-style Spec-Driven Development
- **.github/** - CI/CD（GitHub Actions）

### Docker Compose構成

| 環境 | 構成ファイル | 用途 | フロントエンド |
|------|-------------|------|---------------|
| **開発環境** | `docker-compose.yml` + `docker-compose.dev.yml` | ローカル画面打鍵・開発作業 | Vite Dev Server（HMR） |
| **テスト環境** | `docker-compose.yml` + `docker-compose.test.yml` | ローカル自動テスト実行 | nginx（本番相当） |
| **デバッグ環境** | `+ docker-compose.debug.yml` | Node.jsデバッガ接続 | Vite Dev Server（HMR） |
| **CI環境** | `docker-compose.yml` + `docker-compose.ci.yml` | GitHub Actions用 | nginx（本番相当） |

> テスト・CI環境のフロントエンドは本番と同じDockerfile（nginx + ビルド済み静的ファイル）を使用し、Dev/prod parity原則に準拠しています。

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
