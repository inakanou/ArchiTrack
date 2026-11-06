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
   # backend のコンテナに入って実行する（作業ディレクトリは /app）
   railway ssh --service <backend のサービス名> --environment <staging|production>
   npm run prisma:migrate:deploy
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

### JWT 鍵の入れ替えの後に全員がログアウトされる

**症状:**
- `JWT_PUBLIC_KEY`・`JWT_PRIVATE_KEY` を入れ替えた後、既存のセッションのリフレッシュが失敗し、利用者がログインの画面へ戻される

**原因:**
- 旧鍵で署名したアクセストークン・リフレッシュトークンを新しい鍵では検証できない（想定どおりの動作）

**解決方法:**
- 利用者にログインし直してもらう
- 定期のローテーションで既存のセッションを保ちたいときだけ、猶予期間として `JWT_PUBLIC_KEY_OLD` に旧公開鍵を設定する（[鍵ローテーション手順書](key-rotation-procedure.md)）
- **漏えいの疑い（インシデント）で入れ替えたときは `JWT_PUBLIC_KEY_OLD` を設定しない**（漏れたかもしれない旧鍵のトークンを受け付けてしまう。[インシデント時の緊急ローテーション](key-rotation-procedure.md#インシデント時の緊急ローテーション)）

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

2. **復号できない 2FA を未登録へ戻す（鍵を戻せないとき）:**
   - 下の「[2FA の暗号化鍵の入れ替えの後に 6 桁のコードの画面から進めない](#2fa-の暗号化鍵の入れ替えの後に-6-桁のコードの画面から進めない)」を参照（データベースを直接書き換えない）

### 2FA の暗号化鍵の入れ替えの後に 6 桁のコードの画面から進めない

**症状:**
- `TWO_FACTOR_ENCRYPTION_KEY` を入れ替えてデプロイした後、2FA を登録済みの利用者（管理者を含む）がログインの 6 桁のコードの画面で正しいコードを入れても進めない
- backend のログに `TOTP秘密鍵の復号化に失敗しました` が出る

**原因:**
- 古い鍵で暗号化した TOTP の秘密を新しい鍵で復号できない（鍵の入れ替えでは想定どおりの動作）

**解決方法:**

```bash
# backend のコンテナに入る（作業ディレクトリは /app）
railway ssh --service <backend のサービス名> --environment <staging|production>

# 確認だけ（書き込まない）。対象の利用者と人数を表示する
npm run user:reset-undecryptable-2fa

# 書き込む（理由は監査に残る）
npm run user:reset-undecryptable-2fa -- --apply --reason "2FA の暗号化鍵の入れ替え"
```

- 対象の利用者は次のログインで 2FA を登録し直す。詳細は[シークレット管理](secrets-management.md#2fa暗号化鍵のローテーション)
- Postgres の公開ネットワークを閉じた環境では、手元から DB へつなぐ `railway run`・`railway connect` は届かない。`railway ssh` で backend のコンテナの中から実行する

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
   # backend のコンテナの中から確かめる（Postgres の公開ネットワークは閉じているため手元からは届かない）
   railway ssh --service <backend のサービス名> --environment <staging|production>
   npx prisma migrate status
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
   # backend のコンテナに入って実行する（作業ディレクトリは /app）
   railway ssh --service <backend のサービス名> --environment <staging|production>
   node dist/prisma/seed.js
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
   - 下の「[`Invalid RAILWAY_TOKEN` でデプロイが失敗する](#invalid-railway_token-でデプロイが失敗する)」を参照

3. **サービスIDを確認:**
   ```bash
   railway status --json | jq -r '.services'
   ```

### `Invalid RAILWAY_TOKEN` でデプロイが失敗する

**症状:**
- デプロイのジョブ（`deploy-staging`・`deploy-production`）の Railway の CLI が `Invalid RAILWAY_TOKEN` で止まる

**原因:**
- Railway がトークンを取り消した（2026-11 の Railway のセキュリティインシデントでは、既存のトークンが取り消された）、またはトークンが期限切れ・削除済み

**解決方法:**
1. Railway Dashboard > Project Settings > **Tokens** で、環境（staging・production）ごとにプロジェクトトークンを作り直す
2. GitHub の環境シークレット `RAILWAY_STAGING_TOKEN`（`staging` 環境）・`RAILWAY_PRODUCTION_TOKEN`（`production` 環境）を新しい値に更新する
3. 失敗したデプロイのジョブを再実行する（[手動デプロイ](cicd-github-actions.md#手動デプロイ)）

> トークンの取り消しが漏えいの疑いによるときは、Railway の変数（JWT 鍵・2FA 暗号化鍵など）も入れ替える（[インシデント時の緊急ローテーション](key-rotation-procedure.md#インシデント時の緊急ローテーション)）。

### backend が `ProductionPrerequisiteError` で起動を繰り返す

**症状:**
- backend のデプロイが `CRASHED` になる、またはデプロイのジョブが `Railway deployment did not become active` で失敗する
- backend のログに次が出る
  ```
  ProductionPrerequisiteError: Production prerequisites are missing or invalid: ARCHIVE_ENCRYPTION_KEY (64 hex characters)
  ```

**原因:**
- 本番（`NODE_ENV=production`）の前提の変数（`ARCHIVE_ENCRYPTION_KEY`・`TRUST_PROXY_HOPS`・`REDIS_URL`）が Railway の backend に無い、または形が違う（`ARCHIVE_ENCRYPTION_KEY` は 64 桁の 16 進）
- **Railway の変数の名前に GitHub Secrets の接頭辞を付けた**（例: `STAGING_ARCHIVE_ENCRYPTION_KEY`）。backend は `ARCHIVE_ENCRYPTION_KEY` しか読まない。デプロイの前の `check:env` は GitHub Secrets を読むため合格してしまう

**解決方法:**
1. Railway Dashboard > Backend Service > **Variables** で、メッセージに出た変数をアプリが読む名前（接頭辞なし）で設定する。誤った名前の変数は削除する
2. 再デプロイし、デプロイが `SUCCESS` になることを確かめる
3. GitHub の環境シークレット（`STAGING_ARCHIVE_ENCRYPTION_KEY` など）が Railway と同じ値か確かめる

詳細は[Railwayの変数名の注意](environment-variables.md#railwayの変数名の注意)を参照。

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
   - `Server started` のログ（`port` の値）を確認

2. **ヘルスチェックエンドポイントをテスト:**
   ```bash
   curl https://<backend-url>/health
   ```

3. **Railwayサービスを再起動:**
   - Railway Dashboard > Service > **Restart**

### 外から 502（`Application failed to respond`）なのにコンテナの中の `/health` は正常

**症状:**
- 公開ドメインへの `curl https://<backend のドメイン>/health` が 502（`Application failed to respond`）
- Railway のデプロイは `SUCCESS` で、ログに `Server started`（`port` は `3000`）が出ている

**原因:**
- 公開ドメインの向き先のポート（Target Port）がアプリの待ち受けのポート（`PORT`。既定 `3000`）と違う。Railway のヘルスチェックはコンテナの待ち受けのポートへ届くため合格する

**解決方法:**
1. Backend Service > **Settings** > **Networking** で、ドメインの向き先のポートを `PORT` の値に直す
2. 外から `/health` が 200 になることを確かめる

frontend の公開ドメイン経由の `/csrf-token` だけが 502 になるときは、frontend の `BACKEND_INTERNAL_URL` のホスト・ポートが backend のプライベートネットワークの名前・`PORT` と合っているかを確かめる（[Railway設定](railway-setup.md#4-frontend-service)）。

---

## ヘルスチェックが5分間 service unavailable で失敗する（起動時 npm ci の EACCES）

**症状:**
```
Starting Container
Checking dependencies...
package.json or package-lock.json has changed, updating dependencies...
npm error code EACCES
npm error syscall unlink
npm error path /app/node_modules/@emnapi/core/LICENSE
...
1/1 replicas never became healthy!
Healthcheck failed!
```
- Docker イメージの build / push は成功するが、起動後 `/health` が応答せず Healthcheck が
  タイムアウトする。直前にデプロイログで上記の `npm ci` EACCES が繰り返し出る。

**原因:**
- backend は `node` ユーザーで起動する（`Dockerfile` の `USER node`）。
- `docker-entrypoint.sh` の依存チェックが `package-lock.json` のハッシュ変化を検知すると
  起動時に `npm ci` を実行する。
- `/app/node_modules` が **Railway 永続ボリューム**で、その中身が **root 所有**（過去に root
  実行だったイメージが作成）の場合、`node` ユーザーは既存ファイルを置換できず EACCES で失敗する。
- entrypoint は `set -e` のためサーバ起動（`exec`）に到達せず終了し、クラッシュループになる。
- 依存 bump で `package-lock.json` が変わった瞬間に顕在化する（不変の間はハッシュ一致で
  `npm ci` がスキップされ表面化しない）。

**解決方法:**

1. **`/app/node_modules` の永続ボリュームを外す（推奨・恒久対処）:**
   - node_modules は Dockerfile の `npm ci --omit=dev` でイメージに焼き込み済みのため、
     本番で永続化する必要はない。
   - Railway Dashboard > Service（backend）> **Settings > Volumes** で `/app/node_modules`
     にマウントされたボリュームを削除（Detach / Delete）し、再デプロイする。
   - entrypoint は本番（`NODE_ENV=production`）では実行時 `npm ci` を行わず、イメージ同梱の
     node_modules を使用する。

2. **ボリュームを残す運用の場合:**
   - ボリュームを一度削除して作り直し、`node` ユーザーが書き込める状態にする
     （root 所有の古い node_modules を残さない）。

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

## レート制限関連

### E2Eテストでレート制限エラー

**症状:**
```
Error: Rate limit exceeded
Too many requests from this IP, please try again later.
```

**原因:**
- E2Eテストで複数のリクエストを短時間に送信
- `DISABLE_RATE_LIMIT`環境変数が設定されていない
- Docker Composeで環境変数が正しく渡されていない

**解決方法:**

1. **環境変数を確認:**
   ```bash
   # .envファイルに設定
   echo "DISABLE_RATE_LIMIT=true" >> .env
   ```

2. **Docker コンテナを再起動:**
   ```bash
   docker compose down
   docker compose up -d
   ```

3. **環境変数が渡されているか確認:**
   ```bash
   docker exec architrack-backend printenv | grep DISABLE_RATE_LIMIT
   # 出力: DISABLE_RATE_LIMIT=true
   ```

4. **GitHub Actions E2Eテストの場合:**
   - `.github/workflows/ci.yml`の「Create .env file for E2E」ステップを確認
   - `DISABLE_RATE_LIMIT=true`が含まれているか確認

**注意事項:**
- 本番環境（Railway）では`DISABLE_RATE_LIMIT`を`false`または未設定にする
- セキュリティのため、ローカル開発・テスト環境のみで有効化

---

## フロントエンド関連

### .mjsファイルのMIMEタイプエラー（nginx）

**症状:**
```
Setting up fake worker failed: "Failed to fetch dynamically imported module: https://<frontend-url>/assets/pdf.worker.min-XXXX.mjs"
```
- PDFアップロード時に「PDFの読み込みに失敗しました」と表示される
- pdfjs-distのWorkerファイル（`.mjs`）が読み込めない

**原因:**
- nginxのデフォルト`mime.types`に`.mjs`のMIMEタイプマッピングが含まれていない
- `X-Content-Type-Options: nosniff`ヘッダーにより、ブラウザがMIMEタイプの推測を行わない
- ES Modulesとして`.mjs`ファイルを読み込む際、`application/javascript`の`Content-Type`が必須

**解決方法:**

1. **`frontend/nginx.conf`に`.mjs`用のlocationブロックを追加:**
   ```nginx
   # .mjsファイル用MIMEタイプ設定（pdfjs-dist workerファイル等）
   location ~* \.mjs$ {
       types { }
       default_type application/javascript;
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

2. **MIMEタイプの確認:**
   ```bash
   # nginxコンテナ内でmime.typesを確認
   docker exec <frontend-container> cat /etc/nginx/mime.types | grep mjs

   # レスポンスヘッダーの確認
   curl -sI http://localhost:5173/assets/pdf.worker.min-XXXX.mjs | grep Content-Type
   # 期待値: Content-Type: application/javascript
   ```

**予防策:**
- テスト・CI環境は本番相当（nginx）で実行し、MIMEタイプ問題を早期検出する
- 新しいファイル拡張子（`.mjs`, `.wasm`等）を使用するライブラリ追加時はnginx設定を確認する

---

### 写真・PDF が画面に出ない（R2 は正常）

**症状:**
- 写真のサムネイル・PDF が表示されない。R2 のバケットにはファイルがあり、API も署名 URL を返している
- ブラウザのコンソールに `Refused to load the image ... because it violates the following Content Security Policy directive: "img-src ..."`（または `connect-src`）が出る

**原因:**
- frontend の `CSP_IMG_SRC_EXTRA`・`CSP_CONNECT_SRC_EXTRA` が未設定で、CSP が R2 の署名 URL の配信元（`https://<バケット名>.<アカウント ID>.r2.cloudflarestorage.com`）を拒んでいる

**解決方法:**
1. 配信中の CSP を確かめる
   ```bash
   curl -sI https://<frontend のドメイン> | grep -i content-security-policy
   # img-src・connect-src に R2 の配信元が入っていなければ未設定
   ```
2. Railway Dashboard > Frontend Service > **Variables** に、R2 の配信元を `CSP_IMG_SRC_EXTRA`・`CSP_CONNECT_SRC_EXTRA` として設定する（`connect-src` には Sentry の取り込み先も空白区切りで加える）。実行時の変数のため再デプロイ（再起動）で反映される
3. 画面で写真・PDF を表示し、コンソールに CSP の違反が出ないことを確かめる

詳細は[環境変数設定](environment-variables.md#frontend-service)を参照。

---

## 監査ログ関連

### 監査ログの送信元 IP が Railway のエッジの IP になる

**症状:**
- 監査ログ・ログイン履歴の送信元 IP が、利用者の IP ではなくデータセンターの範囲の IP（Railway のエッジの IP）に揃う
- 全利用者が同じ IP として扱われ、回数制限を共有する

**原因:**
- backend の `TRUST_PROXY_HOPS` が実際の中継の段数より少ない。Railway の構成では「Railway のエッジ（X-Forwarded-For に 2 段を足す）→ frontend の nginx（1 段）→ backend」で `3` が必要（`2` ではエッジの IP になる。2026-11-07 に staging で実測）

**解決方法:**
1. Railway Dashboard > Backend Service > **Variables** で `TRUST_PROXY_HOPS=3` にする（GitHub の環境シークレット `STAGING_TRUST_PROXY_HOPS`・`PRODUCTION_TRUST_PROXY_HOPS` も同じ値に）
2. 自分の公開 IP を確かめてからログインし、監査ログの送信元 IP がそれと一致することを確かめる
   ```bash
   curl https://ifconfig.me
   ```
3. 一致しなければ段数を直す（多すぎると利用者が X-Forwarded-For を偽って送信元を詐称できるため、一致する最小の値にする）

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
