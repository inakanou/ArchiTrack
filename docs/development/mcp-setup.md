# MCP (Model Context Protocol) サーバー設定

## 概要

ArchiTrackでは、Claude Codeユーザー向けにPlaywright MCPサーバーを提供しています。このMCPサーバーにより、Claude CodeからブラウザをAI制御し、E2Eテストの対話的実行やデバッグが可能になります。

## 前提条件

- [Claude Code](https://claude.ai/claude-code) がインストールされていること
- プロジェクトルートに `.mcp.json` が存在すること（このリポジトリには既に含まれています）

## 機能

Playwright MCPサーバーを使用すると、以下の操作がClaude Code経由で可能になります：

- **ブラウザ操作の自動化**: ページ遷移、フォーム入力、ボタンクリックなど
- **E2Eテストの対話的実行**: テストの実行と結果の確認をAIと対話しながら実施
- **デバッグ支援**: 失敗したテストのスクリーンショット確認、エラー原因の特定
- **UI要素の検査**: セレクター生成、要素の属性確認

## セットアップ手順

### 1. MCP設定ファイルの確認

プロジェクトルートの `.mcp.json` を確認します：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@1.50.0"
      ],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "${HOME}/.cache/ms-playwright"
      }
    }
  }
}
```

### 2. Claude Codeの再起動

`.mcp.json` の変更を反映させるため、Claude Codeを再起動します。

### 3. 初回起動時の自動セットアップ

Claude Code起動時、Playwright MCPサーバーが自動的に以下を実行します：

- `@playwright/mcp@1.50.0` のダウンロード
- Playwrightブラウザバイナリのダウンロード（約300MB）

**初回のみ数分かかる場合があります。**

### 4. 動作確認

Claude Codeで以下のように確認できます：

```
「Playwright MCPサーバーが利用可能か確認してください」
```

正常に動作していれば、MCPツールのリストにPlaywright関連の機能が表示されます。

## カスタマイズ

### ローカル設定の上書き

個人固有の設定（認証情報、プロキシ設定など）が必要な場合、`.mcp.local.json` を作成します：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@1.50.0"],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "${HOME}/.cache/ms-playwright",
        "HTTP_PROXY": "http://proxy.example.com:8080"
      }
    }
  }
}
```

**注意:** `.mcp.local.json` は `.gitignore` に含まれており、バージョン管理されません。

### バージョンの固定

`.mcp.json` では特定バージョン（`@1.50.0`）を指定しています。これにより：

- **再現性**: チーム全員が同じバージョンを使用
- **安定性**: 予期しない破壊的変更を回避
- **デバッグ容易性**: バージョン起因の問題を特定しやすい

最新版を使用する場合は `@latest` に変更できますが、チーム全体で合意してください。

## トラブルシューティング

### MCPサーバーが認識されない

**症状:** Claude Codeで Playwright 関連のツールが表示されない

**解決策:**
1. Claude Codeを完全に終了（バックグラウンドプロセスも含む）
2. `.mcp.json` の構文エラーをチェック（JSONバリデーター使用）
3. Claude Codeを再起動
4. Claude Codeのログを確認

### ブラウザバイナリのダウンロードに失敗

**症状:** 初回起動時にエラーメッセージ

**解決策:**
1. インターネット接続を確認
2. プロキシ設定が必要な場合は `.mcp.local.json` に追加
3. 手動でインストール:
   ```bash
   npx playwright install chromium
   ```

### 古いバージョンが使用される

**症状:** `.mcp.json` のバージョンを更新しても反映されない

**解決策:**
1. npmキャッシュをクリア:
   ```bash
   npm cache clean --force
   ```
2. Claude Codeを再起動

## セキュリティ考慮事項

### 機密情報の取り扱い

- **絶対に `.mcp.json` に機密情報を含めない**（認証トークン、パスワードなど）
- 機密情報は `.mcp.local.json` または環境変数で管理
- `.mcp.local.json` が `.gitignore` に含まれていることを確認

### バージョン管理

- 脆弱性が発見されたバージョンを使用しない
- セキュリティアップデートを定期的に確認
- [Playwright リリースノート](https://github.com/microsoft/playwright/releases) を監視

## 関連ドキュメント

- [Claude Code公式ドキュメント](https://code.claude.com/docs/)
- [MCP (Model Context Protocol) 仕様](https://modelcontextprotocol.io/)
- [Playwright公式ドキュメント](https://playwright.dev/)
- [プロジェクトのE2Eテストガイド](testing.md#e2eテスト)

## よくある質問

### Q: MCPサーバーは必須ですか？

A: いいえ、オプションです。Claude Codeを使用しない開発者には不要です。

### Q: 他のMCPサーバーも追加できますか？

A: はい。`.mcp.json` に複数のサーバー設定を追加できます。

### Q: チーム全員がMCPを使用する必要がありますか？

A: いいえ。個人の開発環境設定なので、各自が自由に選択できます。

### Q: CI/CD環境でMCPサーバーは動作しますか？

A: MCPサーバーは開発環境専用です。CI/CD環境では通常のPlaywrightテストが実行されます。
