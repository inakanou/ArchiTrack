# デバッグガイド

このドキュメントでは、ArchiTrackプロジェクトのデバッグ方法について説明します。

---

## 必要な拡張機能

VSCodeで効率的にデバッグするために、以下の拡張機能をインストールしてください。

`.vscode/extensions.json`を開くと、推奨される拡張機能が表示されます。

| 拡張機能 | ID | 用途 |
|---------|-----|------|
| **Vitest** | `vitest.explorer` | ユニットテストの実行・デバッグ（**推奨**） |
| **Playwright Test for VSCode** | `ms-playwright.playwright` | E2Eテストの実行・デバッグ（**推奨**） |
| ESLint | `dbaeumer.vscode-eslint` | コード品質チェック |
| Prettier | `esbenp.prettier-vscode` | コードフォーマット |

> **推奨**: 単体テストはVitest Explorer、E2EテストはPlaywright Test拡張機能のテストエクスプローラーを使用することを推奨します。これらの拡張機能は、テストの実行・デバッグをGUIで直感的に行うことができます。

---

## デバッグ設定

VS Codeの「実行とデバッグ」パネルには、IDE拡張機能でカバーできないケースのみが定義されています：

| グループ | 用途 |
|---------|------|
| **1_server** | バックエンドサーバー（ローカル起動/Dockerアタッチ） |
| **2_integration** | 統合テスト（Docker環境） |
| **3_compound** | 複合構成（Full Stack） |

> **設計方針**: 単体テスト（Vitest）とE2Eテスト（Playwright）はIDE拡張機能のテストエクスプローラーが最も効率的なため、launch.jsonからは除外されています。

### 1. Playwright E2Eテストのデバッグ

Playwright Test拡張機能（`ms-playwright.playwright`）のテストエクスプローラーを使用します：

1. Playwright拡張機能をインストール
2. テストファイルを開く
3. テストエクスプローラーでテストを選択
4. ▶ボタンで実行、または右クリックして「Debug Test」を選択

テストエクスプローラーから、ヘッドフルモード、デバッグモード、UIモードなど各種実行方法を選択できます。

#### 環境変数

| 変数 | 説明 |
|------|------|
| `PWDEBUG=1` | Playwright Inspectorを起動（`.vscode/settings.json`で自動設定済み） |
| `--headed` | ヘッドレスモードを無効化（ブラウザを表示） |

### 2. Vitestユニットテストのデバッグ

Vitest Explorer拡張機能（`vitest.explorer`）のテストエクスプローラーを使用します：

1. Vitest拡張機能をインストール
2. `backend/vitest.config.ts`と`frontend/vitest.config.ts`が自動検出される
3. テストファイルを開く
4. テストエクスプローラーでテストを選択
5. ▶ボタンで実行、またはデバッグアイコンでデバッグ

テストエクスプローラーから、watch mode・個別テスト実行・デバッグが直感的に行えます。

### 3. バックエンドサーバーのデバッグ

1. 「**Backend: Dev Server**」を選択
2. **F5**キーでデバッグ開始
3. サーバーコードにブレークポイントを設定
4. APIエンドポイントにリクエストを送信すると、ブレークポイントで停止

---

## デバッグのベストプラクティス

### 1. ブレークポイントの設定

| 操作 | 説明 |
|------|------|
| 行番号の左側をクリック | ブレークポイントを設定 |
| ブレークポイントを右クリック → 「Edit Breakpoint」 | 条件付きブレークポイント |
| ブレークポイントを右クリック → 「Log Point」 | ログポイント（コード停止せずログ出力） |

### 2. デバッグコンソールの活用

- **デバッグコンソール**タブで変数の値を確認
- JavaScriptの式を評価可能（例: `user.email`, `response.data`）

### 3. 変数の監視

- **変数**パネルで現在のスコープの変数を確認
- **ウォッチ**パネルで特定の式を監視

### 4. コールスタックの確認

- **コールスタック**パネルで関数の呼び出し履歴を確認
- 各フレームをクリックして、その時点での変数を確認

### 5. ステップ実行

| キー | 操作 | 説明 |
|------|------|------|
| **F10** | ステップオーバー | 現在の行を実行し、次の行へ |
| **F11** | ステップイン | 関数の中に入る |
| **Shift+F11** | ステップアウト | 現在の関数から抜ける |
| **F5** | 続行 | 次のブレークポイントまで実行 |

---

## Docker環境でのデバッグ

### バックエンドのリモートデバッグ

Docker内で動作するバックエンドにVSCodeからアタッチしてデバッグできます。

#### 方法1: デバッグ環境で起動

VS Codeのタスク「**Docker: Dev Up (Debug)**」を実行、または以下のコマンドを実行：

```bash
# デバッグ用オーバーライドを追加して起動
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.debug.yml --env-file .env.dev up -d
```

このコマンドは `npm run dev:debug` でバックエンドを起動し、Node.js inspectorが有効になります（ポート: 9229）。

#### 方法2: VSCodeでアタッチ

1. デバッグパネルを開く（Ctrl+Shift+D）
2. 以下の設定から選択：
   - **Backend: Attach to Docker (Dev)** - 開発環境（ポート9229）
   - **Backend: Attach to Docker (Test)** - テスト環境（ポート9230）
3. F5キーでアタッチ
4. ブレークポイントを設定してAPIリクエストを送信

#### デバッグポート

| 環境 | デバッグポート |
|------|---------------|
| **開発環境** | 9229 |
| **テスト環境** | 9230 |

### Full Stack デバッグ（Compound構成）

「**Full Stack: Dev (Docker + Attach)**」を選択すると、以下が自動的に実行されます：

1. Docker環境がデバッグモードで起動（`preLaunchTask`）
2. バックエンドへのデバッガアタッチ

---

## Docker環境の自動準備

VSCodeからテストをデバッグ実行する際、Dockerコンテナの準備が必要です。

### 仕組み

launch.jsonの統合テスト設定には`preLaunchTask`が設定されており、テスト実行前に`scripts/ensure-docker-ready.sh`が自動実行されます。

```json
{
  "name": "Integration: Backend (Docker)",
  "preLaunchTask": "Docker: Ensure Test Ready",
  ...
}
```

E2Eテスト（Playwright拡張機能から実行）の場合は、事前にDocker環境を手動で準備してください。

### 手動でDocker環境を準備する場合

VS Codeのタスクメニューから実行するか、以下のコマンドを使用：

```bash
# スクリプトを直接実行
./scripts/ensure-docker-ready.sh

# または npm scripts を使用して開発環境を起動（推奨）
npm run dev:docker

# テスト環境を起動
npm run test:docker
```

### VS Code タスク一覧

タスクは `Ctrl+Shift+P` → `Tasks: Run Task` から実行できます。

| カテゴリ | タスク | 説明 |
|---------|--------|------|
| **Docker** | Docker: Dev Up | 開発環境のDockerコンテナを起動 |
| | Docker: Dev Up (Debug) | デバッグモードで起動（debugger: 9229） |
| | Docker: Dev Down | 開発環境のDockerコンテナを停止 |
| | Docker: Test Up | テスト環境のDockerコンテナを起動 |
| | Docker: Test Down | テスト環境のDockerコンテナを停止 |
| | Docker: Ensure Test Ready | E2E/統合テスト用のDockerを準備 |
| **静的解析** | Check: Static All (Parallel) | 全静的解析をワークスペース並列で一括実行 |
| **ビルド** | Build: All (Parallel) | backend/frontendを並列ビルド |
| **テスト** | Test: All Unit (Coverage + Parallel) | 全単体テスト（カバレッジ + CI同等並列実行） |
| | Test: Backend Integration | 統合テスト（Docker環境） |
| **Pre-Push** | Pre-Push: Full Checks | Git Pre-Push Hook相当の全チェック（並列実行） |

---

## トラブルシューティング

### Playwrightデバッグが動作しない

1. Playwright拡張機能がインストールされているか確認
2. `npm install`を実行してすべての依存関係をインストール
3. `npx playwright install`を実行してブラウザをインストール

### Vitestデバッグが動作しない

1. `node_modules`を削除して再インストール
2. VSCodeを再起動
3. TypeScriptのバージョンが正しいか確認

### ブレークポイントで停止しない

1. ソースマップが正しく生成されているか確認
2. TypeScriptの設定で`sourceMap: true`が有効になっているか確認
3. ビルド後のコードではなく、ソースコードでデバッグしているか確認

### E2Eテストで「ECONNREFUSED」エラーが発生する

バックエンドのDockerコンテナが起動していない可能性があります：

```bash
# コンテナの状態を確認
docker ps -a

# バックエンドが停止している場合（npm scriptsを使用、推奨）
npm run dev:docker

# または直接コマンドを使用する場合
# docker compose -p architrack-dev -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d

# バックエンドのログを確認
npm run dev:docker:logs
# または
# docker logs architrack-backend-dev
```

---

## 追加リソース

- [Playwright VSCode拡張機能ドキュメント](https://playwright.dev/docs/getting-started-vscode)
- [VSCodeデバッグガイド](https://code.visualstudio.com/docs/editor/debugging)
- [Vitestデバッグガイド](https://vitest.dev/guide/debugging.html)

---

## 次のステップ

- [テスト戦略](testing.md): テストの種類と実行方法
- [コーディング規約](coding-standards.md): テストコードの書き方
