# データ保護と運用の前提

_作成: 2026-11-07（[IPA 注意喚起に基づく是正計画](../security/ipa-alert-20261009-remediation-plan.md) の W1〜W4）_

本書は、本番のデプロイ経路と変数の所在（W1）、DB のバックアップと復元訓練（W2）、アプリログの保持（W3）、保存時・通信時の暗号化の前提（W4）を記す。各節は「現状（コード・設定・提供元の文書で確かめたこと）」「決まり」「利用者が確かめる・決めること」の順に書く。

Railway・Cloudflare の仕様は 2026-11-07 時点の公式文書による。仕様は変わりうるため、運用の判断の前に出典を確かめ直す。

---

## W1. 本番のデプロイ経路と本番の変数の所在

### 現状

- 経路: `main` への push → `ci.yml` の `deploy-production` ジョブ → 環境変数の組と形の検査（ダミー値。[CI/CD設定](cicd-github-actions.md#デプロイの前の環境変数の検査ダミー値)） → `scripts/railway-deploy-wait.sh` が backend・frontend をデプロイし、新しいデプロイが `SUCCESS` になるまで待つ → 公開ドメインのヘルスチェック
- 本番の Railway の環境（production）には、2026-11-07 の時点でサービスが無い（staging だけが稼働している）
- 本番の変数の本物の値は Railway の production 環境の変数だけに置く。GitHub には複製しない（是正計画 D9）
- GitHub の `production` 環境の secrets に置くのは、`RAILWAY_PRODUCTION_TOKEN`・`RAILWAY_BACKEND_SERVICE_ID`・`RAILWAY_FRONTEND_SERVICE_ID`・`PRODUCTION_BACKEND_URL`・`PRODUCTION_FRONTEND_URL` だけ（リポジトリの secrets に `RAILWAY_PROJECT_ID`）

### 決まり

- 本番の変数の一覧と値の作り方は [環境変数設定](environment-variables.md) と [シークレット管理](secrets-management.md) に従う。変数の名前に `PRODUCTION_` を付けない
- 本番の構築の手順は [本番環境デプロイ](production-deployment.md) と [Railway設定](railway-setup.md) に従う

### 利用者が確かめる・決めること

- [ ] 本番の構築の前に、GitHub の `production` 環境の secrets（上の 5 件）を登録する
- [ ] GitHub の `production` 環境に保護の規則（必須のレビュアー、デプロイできるブランチを `main` に限る）を設定する（是正計画 O4）

---

## W2. DB のバックアップと復元訓練

### 現状（Railway の仕様）

出典: [Railway Docs: Backups](https://docs.railway.com/reference/backups)

- Railway のボリュームのバックアップは、サービスの設定の Backups の欄で予定を選ぶ（複数を同時に選べる）

| 予定 | 頻度 | 保持 |
|------|------|------|
| Daily | 24 時間ごと | 6 日 |
| Weekly | 7 日ごと | 27 日 |
| Monthly | 30 日ごと | 89 日 |

- 手動のバックアップはいつでも取れる（ボリュームの容量の 50% までの使用量に限る）
- 復元は、バックアップの日付の新しいボリュームを同じ場所へマウントし、元のボリュームは外して残す。復元は同じプロジェクト・同じ環境の中に限る
- **ボリュームを消去すると、そのバックアップも全て消える**。バックアップは Railway の同じ環境に依存する
- Railway の文書は、バックアップの保存時の暗号化に触れていない（本書では暗号化されているとは扱わない）

### 決まり

- 本番の PostgreSQL のボリュームに Daily・Weekly・Monthly の 3 つの予定を全て設定する（最長 89 日まで遡れる）
- スキーマを変えるマイグレーションの前に、手動のバックアップを取る
- 監査ログは DB とは別に、13 か月より前の月を暗号化したアーカイブとして R2 に 8 年保持する（[セキュリティ設計](../architecture/security-design.md)）。DB のバックアップの保持（最長 89 日）より長く残る記録はこのアーカイブである

### 復元訓練の手順（staging で行う）

1. staging の PostgreSQL の Backups の欄で手動のバックアップを取り、取った日時を記録する
2. 検証用のデータ（試験の案件など）を 1 件作る
3. 手順 1 のバックアップを Restore し、Deploy で反映する
4. 確かめる: backend の `/health` が 200 になる、管理者でログインできる、手順 2 のデータが無い（復元の時点へ戻った）、監査ログの一覧が開ける
5. 結果（日時、所要時間、確かめた項目の合否）を記録する

### 利用者が確かめる・決めること

- [ ] 本番の構築の後に、PostgreSQL のバックアップの 3 つの予定を設定する
- [ ] 復元訓練の頻度を決める（案: 四半期に 1 回と、PostgreSQL の大きな版の更新の前）
- [ ] Railway の外へ独立した複製（`pg_dump` を暗号化して別の保存先へ置く）を持つかを決める。Railway のバックアップはボリュームの消去やアカウントの事故と運命を共にするため、持たない場合はその前提を受け入れる判断として記録する

---

## W3. アプリログの保持

### 現状

- backend は pino で JSON の構造化ログを標準出力へ書き、Railway のログに残る。外部への転送は行っていない
- Railway のログの保持は契約のプランで決まる（出典: [Railway Docs: Logs](https://docs.railway.com/observability/logs)）

| プラン | アプリのログの保持 |
|------|------|
| Free | 3 日 |
| Trial・Hobby | 7 日 |
| Pro | 30 日 |
| Enterprise | 最長 90 日 |

- Railway にはログの転送先（log drain）の設定が無い。プランの保持より長く残すには、転送の仕組み（Vector・Fluent Bit などの転送役、または提供元の SDK・OpenTelemetry）をアプリ側で用意する
- ログとは別に、次は Railway のログの保持に依存しない
  - 監査ログ（DB に 13 か月、その後は暗号化したアーカイブを R2 に 8 年）。認証・アカウント操作・権限・出力などの記録の対象は [セキュリティ設計](../architecture/security-design.md#監査ログ) のとおり
  - 例外の記録（Sentry。保持は Sentry の契約に従う）

### 決まり

- セキュリティの調査に使う記録（誰が・いつ・何を）は監査ログを正とする。アプリログは障害の調査の補助とし、保持は Railway のプランに従う

### 利用者が確かめる・決めること

- [ ] Railway の契約のプランを確かめ、アプリログの保持の日数を本書に記す
- [ ] アプリログをプランの保持より長く残す必要があるかを決める。必要なら転送先（保存先・保持期間・閲覧できる人）を決める

---

## W4. 暗号化と接続の前提

### 現状

| 対象 | 保存時 | 通信時 | 出典・根拠 |
|------|------|------|------|
| R2 の保存物（画像・PDF・監査ログのアーカイブ） | 全ての保存物とメタデータを AES-256（GCM）で暗号化。常に有効で設定は要らない | TLS | [Cloudflare Docs: R2 Data security](https://developers.cloudflare.com/r2/reference/data-security/) |
| 監査ログのアーカイブ | 上に加え、アプリが AES-256-GCM で暗号化してから置く（鍵は `ARCHIVE_ENCRYPTION_KEY`） | — | [セキュリティ設計](../architecture/security-design.md) |
| 2FA の秘密 | アプリが AES-256-GCM で暗号化して DB に置く（鍵は `TWO_FACTOR_ENCRYPTION_KEY`） | — | [セキュリティ設計](../architecture/security-design.md) |
| backend ↔ PostgreSQL・Redis | Railway の文書は DB のボリュームの保存時の暗号化に触れていない | プライベートネットワーク（`<サービス名>.railway.internal`）。サービスの間の通信は全て WireGuard で暗号化され、環境ごとに隔てられる | [Railway Docs: Private Networking](https://docs.railway.com/reference/private-networking) |
| 利用者のブラウザ ↔ frontend | — | HTTPS（Railway のエッジ）。本番は HSTS を付ける（`NGINX_HSTS_VALUE`） | [Railway設定](railway-setup.md) |

### 決まり

- backend の `DATABASE_URL`・`REDIS_URL` は、プライベートネットワークのホスト（`*.railway.internal`）を指す値にする（Railway の PostgreSQL・Redis のサービスの参照変数 `DATABASE_URL`・`REDIS_URL` を使い、公開用の `DATABASE_PUBLIC_URL` などを使わない）
- PostgreSQL・Redis の TCP Proxy（外部からの接続口）は無効にする（是正計画 O4）
- 保守のために一時的に外部から DB へつなぐときは、TCP Proxy を有効にした間だけ `sslmode=require` で接続し、終わったら無効に戻す

### 利用者が確かめる・決めること

- [ ] staging・本番の backend の `DATABASE_URL`・`REDIS_URL` のホストが `*.railway.internal` であること（値の全体を画面に出さず、ホストの部分だけを確かめる）
- [ ] staging・本番の PostgreSQL・Redis の TCP Proxy が無効であること
- [ ] DB のボリュームの保存時の暗号化が要件として要るかを決める。要る場合は Railway へ確認する（文書に記載が無いため）
