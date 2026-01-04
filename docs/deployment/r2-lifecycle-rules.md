# R2 Lifecycle Rules設定

このドキュメントでは、ArchiTrackのCloudflare R2バケットに対する孤立ファイル（orphaned files）の自動削除ルールの設定方法を説明します。

---

## 前提条件

- Cloudflareアカウント（R2 Object Storage有効化済み）
- ArchiTrackのR2バケット作成済み（[ストレージ構成](../architecture/storage-configuration.md)参照）
- 本番環境へのデプロイ完了

---

## 概要

### 背景

画像削除処理においてR2からのファイル削除に失敗した場合、アプリケーションはファイルを `orphaned/` プレフィックスにコピーします。これにより：

1. データベースとストレージの整合性を維持
2. 孤立ファイルを一箇所に集約
3. Lifecycle Ruleによる自動クリーンアップ

## 要件

- **対象**: `orphaned/` プレフィックスを持つすべてのオブジェクト
- **削除期間**: 7日後に自動削除
- **Requirements**: 4.8（孤立ファイル処理）

---

## Cloudflare R2 ダッシュボードでの設定手順

### ステップ1: R2バケットへのアクセス

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 左メニューから **R2 Object Storage** を選択
3. 対象のバケットをクリック

### ステップ2: Lifecycle Rules 設定画面を開く

1. バケット詳細画面で **Settings** タブを選択
2. **Lifecycle rules** セクションを見つける
3. **Add rule** ボタンをクリック

### ステップ3: ルールの作成

以下の設定でルールを作成します：

| 項目 | 設定値 |
|------|--------|
| **Rule name** | `Delete orphaned files after 7 days` |
| **Prefix filter** | `orphaned/` |
| **Action** | Delete objects |
| **Days after creation** | 7 |

#### 設定画面の入力例

```
Rule name: Delete orphaned files after 7 days
Apply to: Objects matching a prefix
Prefix: orphaned/
Object lifecycle:
  - [x] Delete objects after 7 days
```

### ステップ4: ルールの保存

1. **Create rule** ボタンをクリック
2. ルールが一覧に追加されたことを確認

---

## Wrangler CLIでの設定（代替方法）

`wrangler.toml` に以下の設定を追加することも可能です：

```toml
[[r2_buckets]]
binding = "ARCHITRACK_BUCKET"
bucket_name = "architrack-images"

# Lifecycle rules (wrangler r2 bucket lifecycle)
# Note: CLI設定は2024年12月時点で限定的なサポート
```

現時点ではダッシュボードからの設定を推奨します。

---

## 設定確認

### 確認方法1: ダッシュボード

1. バケットの **Settings** > **Lifecycle rules** で設定を確認
2. ルールが `Active` 状態であることを確認

### 確認方法2: テストファイルによる検証

```bash
# 1. テストファイルをorphaned/プレフィックスにアップロード
aws s3api put-object \
  --endpoint-url $R2_ENDPOINT \
  --bucket $R2_BUCKET_NAME \
  --key "orphaned/test-lifecycle-$(date +%s).txt" \
  --body /dev/null

# 2. 7日後にファイルが削除されていることを確認
aws s3api head-object \
  --endpoint-url $R2_ENDPOINT \
  --bucket $R2_BUCKET_NAME \
  --key "orphaned/test-lifecycle-TIMESTAMP.txt"
# 期待結果: 404 Not Found
```

---

## アプリケーションでの孤立ファイル処理フロー

```
[画像削除リクエスト]
        |
        v
[データベースから削除]
        |
        v
[R2から削除を試行]
        |
    成功?
   /     \
  Yes     No
   |       |
   v       v
[完了]  [orphaned/にコピー]
             |
             v
        [ログ記録]
             |
             v
        [7日後自動削除]
```

## 関連コード

孤立ファイル処理の実装箇所：

- `backend/src/services/image-delete.service.ts` - `moveToOrphaned()` メソッド
- `backend/src/storage/r2-storage.provider.ts` - `copy()` メソッド

---

## トラブルシューティング

### Lifecycle Ruleが適用されない

1. ルールのステータスが `Active` であることを確認
2. プレフィックスが正確に `orphaned/` であることを確認（末尾スラッシュ必須）
3. 7日間の経過を待つ（削除は作成日から計算）

### 孤立ファイルが増え続ける

1. アプリケーションログで削除失敗の原因を確認
2. R2の接続設定を確認
3. 権限（IAMポリシー）を確認

---

## 監視とアラート

孤立ファイルの発生はSentryに警告として記録されます。頻繁に発生する場合は、R2接続の問題を調査してください。

ログのパターン：
```
warn: 孤立ファイル: orphaned/プレフィックスに移動しました。7日後に自動削除されます。
error: 孤立ファイルの移動に失敗しました。手動での確認が必要です。
```

---

## 参考リンク

- [Cloudflare R2 Object Lifecycle Rules Documentation](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Cloudflare R2 Dashboard](https://dash.cloudflare.com/)

---

## 次のステップ

- [ストレージ構成](../architecture/storage-configuration.md): ストレージ全体の構成
- [トラブルシューティング](troubleshooting.md): よくある問題と解決方法
- [デプロイ概要](overview.md): デプロイフロー
