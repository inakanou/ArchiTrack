# トラブルシューティング

このドキュメントでは、デプロイ時によくある問題とその解決方法を説明します。

---

## マイグレーション関連

### マイグレーション失敗

**症状:**
```
Error: P3015
Could not find the migration file at migration.sql.
```

**原因:**
- 空の`draft`ディレクトリが存在する
- マイグレーションファイルが不完全

**解決方法:**
```bash
# 空のdraftディレクトリを削除
rm -rf backend/prisma/migrations/draft

# マイグレーション状態を確認
npm --prefix backend run db:migrate:status

# 必要に応じてマイグレーションを再生成
npm --prefix backend run db:draft:create <migration-name>
npm --prefix backend run db:draft:finalize
```

### マイグレーションが適用されない

**症状:**
- デプロイ後、テーブルが作成されていない
- スキーマ変更が反映されない

**原因:**
- `prisma migrate deploy`が実行されていない
- `MIGRATE_ON_DEPLOY`環境変数が設定されていない

**解決方法:**

1. **環境変数確認:**
   ```bash
   # Railway Dashboard > Backend Service > Variables
   MIGRATE_ON_DEPLOY=true
   ```

2. **手動マイグレーション実行:**
   ```bash
   # Railway CLI
   railway link
   railway run npm --prefix backend run prisma:migrate:deploy
   ```

3. **デプロイログ確認:**
   - Railway Dashboard > Backend Service > Deployments > 最新デプロイ
   - ログに `Migration applied: <migration-name>` が表示されることを確認

---

## JWT関連

### JWT検証エラー

**症状:**
```
Error: JWS signature verification failed
```

**原因:**
1. `JWT_PUBLIC_KEY`が設定されていない
2. 鍵ペアが一致しない（公開鍵と秘密鍵が別々に生成された）
3. Base64エンコーディングが不正

**解決方法:**

1. **鍵ペアの再生成:**
   ```bash
   npm --prefix backend run generate:jwt-keys
   ```

2. **Railway環境変数を更新:**
   ```bash
   # Railway Dashboard > Backend Service > Variables
   JWT_PUBLIC_KEY=<新しい公開鍵>
   JWT_PRIVATE_KEY=<新しい秘密鍵>
   ```

3. **サービスを再デプロイ**

### JWT鍵が読み込めない

**症状:**
```
Error: Invalid JWT key format
```

**原因:**
- Base64エンコーディングが不正
- 改行文字が含まれている

**解決方法:**

1. **鍵を再生成:**
   ```bash
   npm --prefix backend run generate:jwt-keys
   ```

2. **`.env.keys`の内容をそのままコピー:**
   - 改行や空白を追加しない
   - Base64文字列全体をコピー

---

## 2FA関連

### 2FA復号化エラー

**症状:**
```
Error: Unable to decrypt 2FA secret
```

**原因:**
- `TWO_FACTOR_ENCRYPTION_KEY`が変更された
- 暗号化鍵が設定されていない

**解決方法:**

1. **正しい鍵を復元:**
   - バックアップから正しい`TWO_FACTOR_ENCRYPTION_KEY`を取得
   - Railway Dashboard > Variables に設定

2. **全ユーザーの2FA設定をリセット（最終手段）:**
   ```bash
   # Railway CLI
   railway link
   railway shell

   # データベース操作（慎重に実行）
   npx prisma studio
   # User テーブルで twoFactorEnabled を false に設定
   ```

3. **新しい暗号化鍵を生成:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## データベース関連

### データベース接続エラー

**症状:**
```
Error: P1001: Can't reach database server
```

**原因:**
1. `DATABASE_URL`が設定されていない
2. PostgreSQLサービスが起動していない
3. ネットワーク接続の問題

**解決方法:**

1. **環境変数確認:**
   ```bash
   # Railway Dashboard > Backend Service > Variables
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

2. **PostgreSQL起動確認:**
   - Railway Dashboard > PostgreSQL Service
   - ステータスが `Active` であることを確認
   - 必要に応じて **Restart**

3. **接続テスト:**
   ```bash
   # Railway CLI
   railway link
   railway run npx prisma db push --preview-feature
   ```

---

## シーディング関連

### シーディング失敗

**症状:**
```
Error: Admin role not found. Run seedRoles() first.
```

**原因:**
- シーディングの順序が正しくない
- データベースが空の状態でシーディングが実行されていない

**解決方法:**

1. **データベースをリセット（開発環境のみ）:**
   ```bash
   npm --prefix backend run prisma:migrate:reset -- --force
   ```

2. **シーディング再実行:**
   ```bash
   npm --prefix backend run prisma:seed
   ```

3. **Railway環境での手動シーディング:**
   ```bash
   # Railway CLI
   railway link
   railway shell
   npm run prisma:seed
   ```

---

## デプロイ関連

### Railway デプロイ失敗

**症状:**
- デプロイが `Failed` ステータスになる
- アプリケーションが起動しない

**原因:**
1. ビルドエラー
2. 環境変数の設定ミス
3. ポート設定の問題

**解決方法:**

1. **デプロイログを確認:**
   - Railway Dashboard > Service > Deployments > 失敗したデプロイ
   - エラーメッセージを確認

2. **ローカルでビルドテスト:**
   ```bash
   npm --prefix backend run build
   npm --prefix frontend run build
   ```

3. **環境変数を再確認:**
   - [環境変数設定](environment-variables.md)

4. **ポート設定確認:**
   ```bash
   # Railway Dashboard > Backend Service > Variables
   PORT=3000
   ```

### GitHub Actions デプロイ失敗

**症状:**
- CD workflow が失敗する
- Railway への接続エラー

**原因:**
1. GitHub Secrets が設定されていない
2. Railway トークンが無効
3. サービスIDが間違っている

**解決方法:**

1. **GitHub Secrets を確認:**
   - Settings > Secrets and variables > Actions
   - [CI/CD設定](cicd-github-actions.md#github-secretsの設定)

2. **Railway トークンを再生成:**
   - Railway Dashboard > Account Settings > Tokens
   - 新しいトークンを生成
   - GitHub Secrets の `RAILWAY_TOKEN` を更新

3. **サービスIDを確認:**
   ```bash
   railway status --json | jq -r '.services'
   ```

---

## ヘルスチェック失敗

**症状:**
```
curl: (7) Failed to connect to <backend-url> port 443: Connection refused
```

**原因:**
1. アプリケーションが起動していない
2. ポート設定が間違っている
3. ヘルスチェックエンドポイントが実装されていない

**解決方法:**

1. **デプロイログを確認:**
   - Railway Dashboard > Service > Deployments
   - "Application started on port 3000" メッセージを確認

2. **ヘルスチェックエンドポイントをテスト:**
   ```bash
   curl https://<backend-url>/health
   ```

3. **Railwayサービスを再起動:**
   - Railway Dashboard > Service > **Restart**

---

## パフォーマンス関連

### アプリケーションが遅い

**原因:**
1. データベースクエリの最適化不足
2. インデックスの不足
3. Redisキャッシュが機能していない

**解決方法:**

1. **Redisキャッシュを確認:**
   ```bash
   # Railway Dashboard > Redis Service
   # ステータスが Active であることを確認
   ```

2. **データベースインデックスを追加:**
   ```prisma
   // prisma/schema.prisma
   model User {
     // ...
     @@index([email])
   }
   ```

3. **クエリのパフォーマンスを分析:**
   ```bash
   # Prisma Studio で確認
   npx prisma studio
   ```

---

## その他

### 環境変数が反映されない

**症状:**
- 設定した環境変数が読み込まれない

**原因:**
- サービスが再起動されていない
- 環境変数名が間違っている

**解決方法:**

1. **サービスを再起動:**
   - Railway Dashboard > Service > **Restart**

2. **環境変数名を確認:**
   - [環境変数設定](environment-variables.md)

3. **デプロイログで確認:**
   - Railway Dashboard > Service > Deployments
   - 環境変数が正しく読み込まれているか確認

---

## サポート

上記の方法で解決しない場合：

1. **Issueを作成:**
   - GitHub Issues: https://github.com/your-org/ArchiTrack/issues

2. **ログを添付:**
   - Railway デプロイログ
   - GitHub Actions ログ
   - エラーメッセージ

3. **環境情報を記載:**
   - Node.js バージョン
   - Railway環境（Staging/Production）
   - ブラウザ情報（フロントエンドの問題の場合）

---

## 次のステップ

- [デプロイ概要](overview.md): デプロイフロー
- [環境変数設定](environment-variables.md): 環境変数の設定
- [シークレット管理](secrets-management.md): JWT鍵・2FA鍵の管理
