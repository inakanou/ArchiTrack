# シークレット管理

このドキュメントでは、ArchiTrackで使用するシークレット（JWT鍵、2FA暗号化鍵）の生成、設定、ローテーション方法を説明します。

---

## シークレットの保管

### 開発環境

- **`.env`ファイル**（Gitに含めない、`.gitignore`で除外）
- `.env.example`をコピーして`.env`を作成
- チーム共有にはパスワードマネージャー（1Password、Bitwarden等）を使用

### 本番環境（Railway）

- **Railway Dashboard > プロジェクト > Variables**
- 環境変数を個別に設定（コピー&ペースト）
- **絶対にGitにコミットしない**

---

## JWT鍵の生成と設定

ArchiTrackは、EdDSA（Ed25519）署名方式のJWTを使用します。

### ステップ1: 鍵ペアの生成

```bash
# backendディレクトリで実行
npm --prefix backend run generate:jwt-keys
```

**出力例:**
```
✅ EdDSA key pair generated successfully!
📝 Keys saved to .env.keys
🔑 Key ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

⚠️  IMPORTANT: Add these to your environment variables and keep JWT_PRIVATE_KEY secure!

For Railway deployment:
1. Go to Railway dashboard > Variables
2. Add JWT_PUBLIC_KEY and JWT_PRIVATE_KEY
3. Redeploy the service
```

### ステップ2: Railway環境変数設定

1. **Railway Dashboard にアクセス:**
   - プロジェクト選択 → Backend Service → Variables

2. **環境変数を追加:**
   - `JWT_PUBLIC_KEY`: `.env.keys`の`JWT_PUBLIC_KEY`の値をコピー&ペースト
   - `JWT_PRIVATE_KEY`: `.env.keys`の`JWT_PRIVATE_KEY`の値をコピー&ペースト

3. **サービスを再デプロイ:**
   - Railway が自動的に再デプロイを実行

### ステップ3: ローカル開発環境設定

```bash
# .env.keysの内容を backend/.env にコピー
cat backend/.env.keys >> backend/.env
```

---

## 2FA暗号化鍵の生成

TOTP秘密鍵をデータベースに暗号化して保存するためのAES-256-GCM鍵を生成します。

### ステップ1: 暗号化鍵の生成

```bash
# 256ビット（64文字16進数）のランダム鍵を生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**出力例:**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### ステップ2: 環境変数設定

**Railway:**
```bash
# Railway Dashboard > Variables
TWO_FACTOR_ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**ローカル:**
```bash
# backend/.env
TWO_FACTOR_ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

---

## シークレットローテーション

### JWT鍵のローテーション（推奨: 90日周期）

#### ステップ1: 新しい鍵ペアを生成

```bash
npm --prefix backend run generate:jwt-keys
```

#### ステップ2: グレースピリオド設定（30日間）

古いトークンを検証し続けるため、古い公開鍵を一時的に保持します。

```bash
# Railway Dashboard > Variables
JWT_PUBLIC_KEY_OLD=<現在の公開鍵>  # 古い鍵を一時的に保持
JWT_PUBLIC_KEY=<新しい公開鍵>
JWT_PRIVATE_KEY=<新しい秘密鍵>
```

**実装方法:**
- バックエンドで`JWT_PUBLIC_KEY_OLD`が設定されている場合、両方の鍵で検証を試みる
- 新しい鍵で署名したトークンを発行

#### ステップ3: 30日後に古い鍵を削除

```bash
# Railway Dashboard > Variables
JWT_PUBLIC_KEY_OLD を削除
```

---

### 2FA暗号化鍵のローテーション

⚠️ **注意:** 2FA暗号化鍵をローテーションすると、**全ユーザーの2FA設定が無効化されます。**

#### ステップ1: データベースバックアップ

```bash
# Railway Dashboard > Database > Backups
```

#### ステップ2: 新しい暗号化鍵を生成

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### ステップ3: 新しい鍵を設定

```bash
# Railway Dashboard > Variables
TWO_FACTOR_ENCRYPTION_KEY=<新しい鍵>
```

#### ステップ4: 全ユーザーに2FA再設定を通知

- メール通知
- ログイン時の通知バナー
- サポートページの更新

---

## 初期管理者アカウントの設定

### 自動作成（推奨）

環境変数を設定すると、初回デプロイ時にシーディングスクリプトが自動実行されます。

```bash
# Railway Dashboard > Variables
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=YourStrongPassword123!@#
INITIAL_ADMIN_DISPLAY_NAME=System Administrator
```

**パスワード要件:**
- 12文字以上
- 複雑性要件（大文字、小文字、数字、特殊文字のうち3種類以上）

### 手動作成

```bash
# ローカル開発環境
npm --prefix backend run prisma:seed
```

**注意:**
- 既に管理者が存在する場合はスキップされます（冪等性）

---

## セキュリティベストプラクティス

### Gitにコミットしない

- `.env`ファイル、`.env.keys`は絶対にGitにコミットしない
- `.gitignore`で除外されていることを確認
- 誤ってコミットした場合は、即座に鍵をローテーション

### 強力な鍵を使用

- **JWT鍵**: EdDSA（Ed25519）を使用（推奨）
- **2FA暗号化鍵**: 256ビット（64文字16進数）

### アクセス制限

- Railway環境変数は最小限のメンバーのみアクセス可能に
- パスワードマネージャーで共有（平文のSlack/Email送信は避ける）

### 定期的なローテーション

- **JWT鍵**: 90日周期（推奨）
- **2FA暗号化鍵**: セキュリティインシデント発生時のみ（全ユーザー影響あり）

---

## トラブルシューティング

### JWT検証エラー

**症状:**
```
Error: JWS signature verification failed
```

**原因と解決方法:**
- **原因1:** `JWT_PUBLIC_KEY` が設定されていない
  - **解決:** Railway Dashboard > Variables で設定
- **原因2:** 鍵ペアが一致しない
  - **解決:** 鍵ペアを再生成し、再設定

### 2FA復号化エラー

**症状:**
```
Error: Unable to decrypt 2FA secret
```

**原因と解決方法:**
- **原因:** `TWO_FACTOR_ENCRYPTION_KEY` が変更された
  - **解決:** 正しい鍵を復元するか、全ユーザーの2FA設定をリセット

詳細は[トラブルシューティング](troubleshooting.md)を参照してください。

---

## 次のステップ

- [環境変数設定](environment-variables.md): 環境変数の設定方法
- [Railway設定](railway-setup.md): Railwayプロジェクトの作成
- [デプロイ概要](overview.md): デプロイフロー
