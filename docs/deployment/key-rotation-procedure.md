# EdDSA鍵ローテーション運用手順書

本ドキュメントは、ArchiTrack認証システムで使用するEdDSA (Ed25519) 鍵ペアのローテーション手順を定義します。

## 概要

| 項目 | 値 |
|------|-----|
| ローテーション周期 | 90日ごと（NIST推奨） |
| 猶予期間 | 30日間 |
| アルゴリズム | EdDSA (Ed25519) |
| 署名ライブラリ | jose v5 |

## 前提条件

- Node.js 20.x 以上がインストールされていること
- 管理者権限でRailway Dashboardにアクセスできること
- `scripts/generate-eddsa-keys.ts` が存在すること

## ローテーションスケジュール

```
T-7日目: 準備フェーズ（カレンダーリマインダー設定）
T日目:   新鍵生成フェーズ（新しい鍵ペア生成、環境変数更新、再デプロイ）
T日目〜T+29日目: 猶予期間（新旧両方の鍵で検証）
T+30日目: 旧鍵削除フェーズ（JWT_PUBLIC_KEY_OLD削除、再デプロイ）
T+90日目: 次回ローテーションのリマインダー
```

---

## フェーズ1: 準備（T-7日目）

### 1.1 現在の鍵情報を確認

```bash
# Railway環境変数から現在の鍵のKey IDを確認
# Railway Dashboard > Variables > JWT_PUBLIC_KEY の値をコピー
# 以下のコマンドでデコード
echo "BASE64_VALUE_HERE" | base64 -d | jq .kid
```

### 1.2 カレンダーリマインダー設定

以下の日程でリマインダーを設定：

- **T日目**: 鍵ローテーション開始日
- **T+30日目**: 旧鍵削除日

---

## フェーズ2: 新鍵生成（T日目）

### 2.1 新しい鍵ペアを生成

```bash
# プロジェクトルートで実行
cd /path/to/ArchiTrack

# 鍵生成スクリプトを実行
npx tsx scripts/generate-eddsa-keys.ts

# 出力例:
# Generating EdDSA (Ed25519) key pair...
# Keys saved to .env.keys
# Key ID: eddsa-1730000000000
```

### 2.2 生成された鍵を確認

```bash
# .env.keysの内容を確認
cat .env.keys

# 出力例:
# JWT_PUBLIC_KEY=eyJrdHkiOiJPS1AiLC...
# JWT_PRIVATE_KEY=eyJrdHkiOiJPS1AiLC...
```

### 2.3 Railway環境変数を更新

1. Railway Dashboardを開く
2. 対象プロジェクトの **Variables** タブを開く
3. 以下の環境変数を更新：

| 変数名 | 操作 | 値 |
|--------|------|-----|
| `JWT_PUBLIC_KEY_OLD` | 新規作成 | 現在の `JWT_PUBLIC_KEY` の値をコピー |
| `JWT_PUBLIC_KEY` | 上書き | 新しい公開鍵（.env.keysから） |
| `JWT_PRIVATE_KEY` | 上書き | 新しい秘密鍵（.env.keysから） |

### 2.4 サービスを再デプロイ

1. Railway Dashboardの **Deploy** ボタンをクリック
2. デプロイ完了を待機

### 2.5 ローカルファイルを削除

```bash
# セキュリティのため、.env.keysを削除
rm .env.keys
```

### 2.6 JWKSエンドポイントを確認

```bash
# 両方の鍵が配信されていることを確認
curl https://your-backend.railway.app/.well-known/jwks.json | jq .

# 期待される出力:
# {
#   "keys": [
#     { "kid": "eddsa-1730000000000", ... }, // 新しい鍵
#     { "kid": "eddsa-1720000000000", ... }  // 旧い鍵
#   ]
# }
```

---

## フェーズ3: 猶予期間（T日目〜T+29日目）

この期間中、システムは以下のように動作します：

| 操作 | 動作 |
|------|------|
| 新規トークン発行 | 新しい `JWT_PRIVATE_KEY` で署名 |
| 既存トークン検証 | `JWT_PUBLIC_KEY` または `JWT_PUBLIC_KEY_OLD` で検証 |
| JWKSエンドポイント | 両方の公開鍵を配信 |

**注意**: この期間中は特別な操作は不要です。

---

## フェーズ4: 旧鍵削除（T+30日目）

### 4.1 Railway環境変数を更新

1. Railway Dashboardを開く
2. **Variables** タブを開く
3. `JWT_PUBLIC_KEY_OLD` を削除

### 4.2 サービスを再デプロイ

1. **Deploy** ボタンをクリック
2. デプロイ完了を待機

### 4.3 JWKSエンドポイントを確認

```bash
# 旧鍵が削除されていることを確認
curl https://your-backend.railway.app/.well-known/jwks.json | jq .keys[].kid

# 期待される出力: 新しいKey IDのみ
# "eddsa-1730000000000"
```

---

## ローテーション完了チェックリスト

- [ ] T-7日目: カレンダーリマインダー設定
- [ ] T日目: 新しい鍵ペア生成
- [ ] T日目: `JWT_PUBLIC_KEY_OLD` に現在の公開鍵をコピー
- [ ] T日目: `JWT_PUBLIC_KEY` と `JWT_PRIVATE_KEY` を新しい鍵で上書き
- [ ] T日目: Railway再デプロイ
- [ ] T日目: `.env.keys` ファイル削除
- [ ] T日目: JWKSエンドポイントで両方の鍵が配信されていることを確認
- [ ] T+30日目: `JWT_PUBLIC_KEY_OLD` 削除
- [ ] T+30日目: Railway再デプロイ
- [ ] T+30日目: JWKSエンドポイントで旧鍵が削除されたことを確認
- [ ] T+90日目: 次回ローテーションのリマインダー設定

---

## トラブルシューティング

### 問題: JWKSエンドポイントが鍵を返さない

**原因**: 環境変数が正しく設定されていない可能性

**解決策**:
1. Railway Variablesで環境変数を確認
2. 値がBase64エンコードされていることを確認
3. サービスを再デプロイ

### 問題: トークン検証に失敗する

**原因**: kidが一致していない可能性

**解決策**:
1. トークンのヘッダーからkidを確認: `echo "TOKEN" | cut -d. -f1 | base64 -d | jq .kid`
2. JWKSエンドポイントに対応する鍵が存在するか確認
3. 猶予期間中であることを確認

### 問題: 再デプロイ後にエラーが発生する

**原因**: 環境変数の形式が不正

**解決策**:
1. 環境変数の値が改行を含んでいないことを確認
2. Base64エンコードが正しいことを確認
3. 必要に応じて鍵を再生成

---

## セキュリティ注意事項

1. `.env.keys` ファイルは決してGitにコミットしないこと
2. `JWT_PRIVATE_KEY` は安全に保管し、第三者に共有しないこと
3. 本番環境では、Railway環境変数のみを使用すること
4. 鍵生成は安全なローカル環境でのみ実行すること
5. 鍵情報をSlackやメールで共有しないこと

---

## 関連ドキュメント

- [シークレット管理](secrets-management.md) - JWT鍵・2FA鍵の生成方法
- [EdDSA鍵生成スクリプト](../../scripts/generate-eddsa-keys.ts)
- [JWKSエンドポイント実装](../../backend/src/routes/jwks.routes.ts)
- [TokenService実装](../../backend/src/services/token.service.ts)
- [design.md - 鍵ローテーション戦略](../../.kiro/specs/user-authentication/design.md)
