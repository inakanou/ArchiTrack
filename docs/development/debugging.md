# デバッグガイド

このドキュメントでは、ArchiTrackプロジェクトのデバッグ方法について説明します。

---

## 必要な拡張機能

VSCodeで効率的にデバッグするために、以下の拡張機能をインストールしてください。

`.vscode/extensions.json`を開くと、推奨される拡張機能が表示されます。

| 拡張機能 | ID | 用途 |
|---------|-----|------|
| Playwright Test for VSCode | `ms-playwright.playwright` | E2Eテストのデバッグ |
| ESLint | `dbaeumer.vscode-eslint` | コード品質チェック |
| Prettier | `esbenp.prettier-vscode` | コードフォーマット |
| Vitest | `vitest.explorer` | ユニットテストの実行・デバッグ |

---

## デバッグ設定

### 1. Playwright E2Eテストのデバッグ

#### 方法1: VSCode拡張機能を使用（推奨）

1. Playwright拡張機能をインストール
2. テストファイルを開く
3. テストの左側に表示される▶ボタンをクリック
4. デバッグするには、右クリックして「Debug Test」を選択

#### 方法2: デバッグ設定を使用

1. **F5**キーを押すか、デバッグパネルを開く
2. 「**Run Playwright E2E Tests (Headed)**」を選択
3. ブレークポイントを設定したい行番号の左側をクリック
4. デバッグを開始

#### 方法3: 現在のファイルのみデバッグ

1. デバッグしたいテストファイルを開く
2. 「**Run Current Playwright Test File (Headed)**」を選択
3. **F5**キーでデバッグ開始

#### 環境変数

| 変数 | 説明 |
|------|------|
| `PWDEBUG=1` | Playwright Inspectorを起動 |
| `--headed` | ヘッドレスモードを無効化（ブラウザを表示） |

### 2. Vitestユニットテストのデバッグ

#### フロントエンドテスト

1. 「**Debug Frontend Vitest Tests**」を選択
2. または、特定のファイルをデバッグする場合は「**Debug Current Frontend Test File**」を選択
3. **F5**キーでデバッグ開始

#### バックエンドテスト

1. 「**Debug Backend Vitest Tests**」を選択
2. **F5**キーでデバッグ開始

### 3. バックエンドサーバーのデバッグ

1. 「**Debug Backend Server**」を選択
2. **F5**キーでデバッグ開始
3. サーバーコードにブレークポイントを設定
4. APIエンドポイントにリクエストを送信すると、ブレークポイントで停止

### 4. フロントエンドのデバッグ

#### ブラウザデバッグ

1. Chromeを以下のコマンドで起動:
   ```bash
   google-chrome --remote-debugging-port=9222
   ```

2. 「**Attach to Chrome (Frontend)**」を選択
3. **F5**キーでデバッグ開始
4. ブラウザでアプリケーションを開く
5. VSCodeでブレークポイントを設定

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

## Docker環境の自動準備

VSCodeからE2Eテストをデバッグ実行する際、Dockerコンテナは自動的に準備されます。

### 仕組み

launch.jsonの各E2Eテスト設定には`preLaunchTask`が設定されており、テスト実行前に`scripts/ensure-docker-ready.sh`が自動実行されます。

```json
{
  "name": "Run Playwright E2E Tests (Headed)",
  "preLaunchTask": "Ensure Docker Ready for E2E",
  ...
}
```

### 手動でDocker環境を準備する場合

```bash
# スクリプトを直接実行
./scripts/ensure-docker-ready.sh

# または docker compose で起動
docker compose up -d
```

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

# バックエンドが停止している場合
docker compose up -d

# バックエンドのログを確認
docker logs architrack-backend
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
