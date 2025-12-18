# ストレージ構成

このドキュメントでは、ArchiTrackの画像ストレージシステムの構成と、各環境での切り替え方法を説明します。

---

## アーキテクチャ概要

ArchiTrackは、ストレージ抽象化レイヤーを採用しており、環境に応じて異なるストレージバックエンドを使用できます。

```
┌─────────────────────────────────────────────────────────┐
│                    StorageProvider                       │
│                    (インターフェース)                      │
├─────────────────────────────────────────────────────────┤
│  upload() / get() / delete() / exists()                 │
│  getSignedUrl() / getPublicUrl()                        │
│  testConnection() / disconnect()                        │
└─────────────────────────────────────────────────────────┘
               ▲                           ▲
               │                           │
    ┌──────────┴──────────┐     ┌─────────┴──────────┐
    │ LocalStorageProvider │     │ R2StorageProvider   │
    │ (開発/テスト環境用)    │     │ (本番環境用)         │
    │ ファイルシステム       │     │ Cloudflare R2       │
    └─────────────────────┘     └────────────────────┘
```

### ストレージプロバイダー

| プロバイダー | 用途 | 特徴 |
|------------|------|------|
| **LocalStorageProvider** | 開発・テスト環境 | ローカルファイルシステムに保存、簡易的な署名付きURL |
| **R2StorageProvider** | 本番環境 | Cloudflare R2（S3互換）、真の署名付きURL、CDN統合 |

---

## 環境変数

### ストレージ共通

| 変数名 | 説明 | 必須度 | 有効値 |
|--------|------|--------|--------|
| `STORAGE_TYPE` | 使用するストレージタイプ | 任意 | `local` / `r2` |

> **Note:** `STORAGE_TYPE` を省略した場合、他の環境変数から自動判定されます。

### ローカルストレージ

| 変数名 | 説明 | 必須度 | 例 |
|--------|------|--------|-----|
| `LOCAL_STORAGE_PATH` | ファイル保存先のベースパス | **必須**（localの場合） | `./storage` |
| `LOCAL_STORAGE_URL` | 公開URLのベース | 推奨 | `http://localhost:3000/storage` |

### Cloudflare R2

| 変数名 | 説明 | 必須度 | 例 |
|--------|------|--------|-----|
| `R2_ENDPOINT` | R2エンドポイントURL | **必須**（r2の場合） | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | アクセスキーID | **必須**（r2の場合） | `<your-access-key>` |
| `R2_SECRET_ACCESS_KEY` | シークレットアクセスキー | **必須**（r2の場合） | `<your-secret-key>` |
| `R2_BUCKET_NAME` | バケット名 | **必須**（r2の場合） | `architrack-images` |
| `R2_PUBLIC_URL` | パブリックアクセスURL | 任意 | `https://images.your-domain.com` |

---

## 環境別設定

### 1. ローカル開発環境

**使用プロバイダー:** `LocalStorageProvider`

#### 設定例（`backend/.env`）

```bash
# ストレージ設定
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./storage
LOCAL_STORAGE_URL=http://localhost:3000/storage
```

#### 特徴

- ファイルは `./storage/` ディレクトリに保存
- メタデータは `.meta.json` ファイルで管理
- 開発用のため本番では使用不可
- サーバー起動時にディレクトリが自動作成される

#### ディレクトリ構造

```
backend/
└── storage/
    └── surveys/
        └── {surveyId}/
            ├── original/
            │   └── {imageId}.jpg
            └── thumbnail/
                └── {imageId}.jpg
```

---

### 2. CI/テスト環境（Docker）

**使用プロバイダー:** `LocalStorageProvider` (tmpfs)

#### 設定（`docker-compose.test.yml`）

```yaml
backend:
  environment:
    STORAGE_TYPE: local
    LOCAL_STORAGE_PATH: /app/storage
    LOCAL_STORAGE_URL: http://localhost:3100/storage
  volumes:
    # tmpfsで一時的なストレージ（テスト後自動削除）
    - type: tmpfs
      target: /app/storage
      tmpfs:
        mode: 01777  # 全ユーザー書き込み可能
```

#### 特徴

- `tmpfs` を使用してメモリ上にストレージを作成
- テスト終了時に自動的にデータが削除される
- 権限問題を回避するため `mode: 01777` を設定
- 開発環境と同時実行可能（ポートオフセット：3100, 5174）

#### ポートマッピング

| サービス | 開発環境 | テスト環境 |
|---------|---------|----------|
| Backend | 3000 | 3100 |
| Frontend | 5173 | 5174 |
| PostgreSQL | 5432 | 5433 |
| Redis | 6379 | 6380 |

---

### 3. 本番環境（Cloudflare R2）

**使用プロバイダー:** `R2StorageProvider`

#### 設定例（Railway環境変数）

```bash
# ストレージ設定
STORAGE_TYPE=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<your-access-key-id>
R2_SECRET_ACCESS_KEY=<your-secret-access-key>
R2_BUCKET_NAME=architrack-images
R2_PUBLIC_URL=https://images.your-domain.com  # オプション
```

#### Cloudflare R2 セットアップ手順

1. **Cloudflareダッシュボードでバケットを作成**
   - R2 > Overview > Create bucket
   - バケット名: `architrack-images`

2. **APIトークンを生成**
   - R2 > Overview > Manage R2 API Tokens
   - Create API token
   - Permissions: Object Read & Write
   - Specify bucket: `architrack-images`

3. **環境変数を設定**
   - `R2_ENDPOINT`: アカウント設定で確認
   - `R2_ACCESS_KEY_ID`: 生成されたAccess Key ID
   - `R2_SECRET_ACCESS_KEY`: 生成されたSecret Access Key
   - `R2_BUCKET_NAME`: `architrack-images`

4. **（オプション）パブリックアクセスを設定**
   - R2 > bucket > Settings > Public access
   - Custom domain または R2.dev subdomain を設定
   - `R2_PUBLIC_URL` に設定

#### 特徴

- S3互換APIでCloudflare R2に接続
- 署名付きURLで一時的なアクセス権を付与（デフォルト1時間）
- 高い可用性とスケーラビリティ
- CDN統合によるグローバル配信
- 従量課金（egress費用なし）

---

## 環境切り替えロジック

`storage-factory.ts` の自動判定ロジック:

```typescript
// 優先順位:
// 1. STORAGE_TYPE 環境変数が明示的に設定されている場合
// 2. R2の設定が完備されている場合 → 'r2'
// 3. LOCAL_STORAGE_PATH が設定されている場合 → 'local'
// 4. どちらも設定されていない場合 → null (ストレージ無効)
```

### 判定フロー図

```
                 ┌─────────────────────┐
                 │  STORAGE_TYPE設定?  │
                 └─────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         'local'       'r2'        未設定
              │           │           │
              ▼           ▼           ▼
    ┌─────────────┐ ┌─────────┐ ┌─────────────────┐
    │ Local使用   │ │ R2使用  │ │ R2設定完備?     │
    └─────────────┘ └─────────┘ └─────────────────┘
                                       │
                              ┌────────┼────────┐
                              ▼        ▼        ▼
                            Yes       No    LOCAL_PATH?
                              │        │        │
                              ▼        ▼   ┌────┼────┐
                         ┌─────────┐   │   ▼         ▼
                         │ R2使用  │   │  Yes       No
                         └─────────┘   │   │         │
                                       │   ▼         ▼
                                       │ Local   ストレージ
                                       │  使用     無効
                                       └───────────┘
```

---

## 環境別設定まとめ

| 項目 | ローカル開発 | CI/テスト | 本番 |
|------|------------|----------|------|
| プロバイダー | Local | Local (tmpfs) | R2 |
| STORAGE_TYPE | `local` | `local` | `r2` |
| データ永続性 | あり | なし（自動削除） | あり |
| 署名付きURL | 簡易URL | 簡易URL | AWS署名V4 |
| セキュリティ | 低（開発用） | 低（テスト用） | 高 |
| スケーラビリティ | 低 | 低 | 高 |
| 費用 | 無料 | 無料 | 従量課金 |

---

## トラブルシューティング

### ストレージが設定されていないエラー

```
503 STORAGE_NOT_CONFIGURED
```

**原因:** ストレージ環境変数が設定されていない

**解決方法:**
1. `STORAGE_TYPE` を `local` または `r2` に設定
2. 対応する環境変数を設定

### ローカルストレージの権限エラー

```
EACCES: permission denied
```

**原因:** ストレージディレクトリへの書き込み権限がない

**解決方法（Docker環境）:**
```yaml
volumes:
  - type: tmpfs
    target: /app/storage
    tmpfs:
      mode: 01777
```

### R2接続エラー

```
R2 storage connection test failed
```

**原因:** R2認証情報が正しくない、またはバケットが存在しない

**解決方法:**
1. `R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` を確認
2. `R2_BUCKET_NAME` のバケットが存在することを確認
3. APIトークンの権限を確認

---

## 関連ドキュメント

- [環境変数設定](../deployment/environment-variables.md) - 全環境変数の一覧
- [システム構成](system-overview.md) - システム全体のアーキテクチャ
- [Railway設定](../deployment/railway-setup.md) - 本番環境のセットアップ
