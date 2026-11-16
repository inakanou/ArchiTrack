# Research & Design Decisions

## Summary
- **Feature**: `unit-price-ledger`
- **Discovery Scope**: New Feature（既存の受領見積書の上に置く。受領見積書のモデルは estimate-request が持つ）
- **Key Findings**:
  - 受領見積書の登録の部品（ReceivedQuotationService）は、見積依頼か案件の文脈を必ず求め、案件の無い受領見積書を作れない。DB の制約（見積依頼があれば案件も必須）は、両方とも無い行を許す。取り込みには台帳の側の登録の経路が要る
  - pg_trgm は、DB の LC_CTYPE が C だと日本語の文字をすべて捨て、近さが 0 になる。日本語の名称は語の区切りが無いため similarity が低く出る（「天井下地」と「軽量鉄骨天井下地」で 0.27）。部分一致と word_similarity の併用が要る
  - 設計書の関門（部品と要件の突き合わせ・追跡表・設計書の実測）は、新しい spec を方針表へ載せ、設計書の数の実測（13 → 14）を更新するまで赤になる

## Research Log

### 受領見積書の既存の作り
- **Context**: 台帳は受領見積書を兼ねる（brief の Approach）。取り込み・修正・削除を、既存の決まりを崩さずに置く場所を決める
- **Sources Consulted**: backend の受領見積書の部品・経路・検証の定義、prisma のスキーマと migration 20261108000000_received_quotation_ledger_fields
- **Findings**:
  - 登録・更新・削除は、1 つのトランザクションの中で監査ログ（RECEIVED_QUOTATION_CREATED / UPDATED / DELETED）を書く。金額と原本のパスは監査ログに入れない
  - 楽観的排他制御は、更新の日時の一致で判定する（不一致は 409）
  - 更新と原本のプレビューは、案件の無い受領見積書を見つからないとして扱う（estimate-request Requirement 43.14）
  - 明細行の検証の定義（区分・条件・換算・参考・分類キーの上限）は、検証の定義のファイルに部品として切り出されている
- **Implications**: 台帳は、受領見積書の部品を変えずに、案件の無い受領見積書の登録・修正・削除を自分の部品で行う。検証の定義と監査ログの種類は、既存のものを使う

### pg_trgm と日本語の名称
- **Context**: 似た単価の検索（Requirement 7）
- **Sources Consulted**: https://www.postgresql.org/docs/15/pgtrgm.html 、PostgreSQL 15 の一時的なコンテナでの実測
- **Findings**:
  - LC_CTYPE が C の DB では `show_trgm('軽量鉄骨天井下地')` が空になる。en_US.utf8 では 9 個の 3 文字組が出る
  - 日本語では、similarity より word_similarity が高く出る（「天井下地」で 0.27 と 0.6）
  - 1〜2 文字の部分一致は、GIN の索引で正しく引けるが、索引の全体を走査する
  - 確かめ方：`SELECT datctype FROM pg_database WHERE datname = current_database();` と `SELECT show_trgm('天井');`
- **Implications**: 近さは word_similarity と similarity の大きい方で測る。名称を含む行は近さに関わらず候補にする。着手の前に、本番と staging の DB の LC_CTYPE を確かめる

### Prisma 7 での拡張と索引
- **Context**: 索引のずれの検出を避ける（brief の Constraints）
- **Sources Consulted**: https://www.prisma.io/docs/orm/prisma-schema/postgresql-extensions 、https://www.prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features 、Prisma 7.10.1 の CLI での検証
- **Findings**:
  - 拡張の宣言（postgresqlExtensions）は廃止予定の試験機能である。拡張は migration の SQL で有効にするのが今の推奨である
  - GIN の 3 文字組の索引は、試験機能なしでスキーマに書ける（`@@index([name(ops: raw("gin_trgm_ops"))], type: Gin)`）
  - スキーマに書かない索引は、migrate がずれと見なして消そうとする
- **Implications**: 拡張は migration の SQL だけで有効にし、索引はスキーマに書く

### zip の読み取り
- **Context**: 過去の見積カードの一括取り込み（Requirement 2.1）
- **Sources Consulted**: https://github.com/101arrowz/fflate 、https://github.com/thejoshwolfe/yauzl 、各ライブラリの npm の情報
- **Findings**:
  - fflate は依存が無く、型を同梱し、既に両方の lockfile に間接の依存として入っている。展開の前に、項目ごとの展開後の大きさで項目を選べる
  - zip の中のファイル名は、UTF-8 の印が無いと文字化けする
- **Implications**: サーバーで fflate を直接の依存にして読む。カードの同一性は、ファイル名ではなくカードの ID の欄で判定する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 受領見積書を兼ねる（採用） | 台帳の見積は受領見積書そのもの。台帳は読み取りと台帳の項目の更新、案件の無い受領見積書の登録だけを持つ | 二重登録が無い。受領見積書の決まりがそのまま効く | 受領見積書のモデルの変更が台帳に響く | brief の Approach |
| 台帳の別の表 | 見積カードを別の表に持ち、受領見積書から写す | モデルが独立する | 二重登録と同期の手間 | brief で不採用 |

## Design Decisions

### Decision: 案件の無い受領見積書の登録を台帳の部品で行う
- **Context**: 受領見積書の部品は見積依頼か案件の文脈を必ず求める
- **Alternatives Considered**:
  1. 受領見積書の部品に「案件なし」の文脈を足す
  2. 台帳の部品が、受領見積書と明細行の行を直接作る
- **Selected Approach**: 2。監査ログの種類と検証の定義は既存のものを使う
- **Rationale**: estimate-request の画面と API の対象に案件の無い受領見積書を入れない決まり（Requirement 43.14）を、受領見積書の部品の側で崩さない
- **Trade-offs**: 登録の検証が 2 か所になる。検証の定義を共有して、上限の値のずれを防ぐ

### Decision: 似た単価の近さの測り方
- **Context**: Requirement 7.3・7.4
- **Selected Approach**: 近さ＝ GREATEST(similarity(名称と規格, 問い合わせ), word_similarity(問い合わせ, 名称と規格))。下限は 0.3。名称に問い合わせの名称を含む行は、近さに関わらず候補にする
- **Rationale**: 実測で、日本語の部分一致は word_similarity が高く出る。部分一致の併用で、短い語と下限に届かない語を拾う
- **Follow-up**: 取り込みの後の実データで、下限の値を確かめる。変えるときは設計を改める

### Decision: Excel をサーバーで作る
- **Context**: Requirement 6。台帳全体は件数が多く、画面に全件を読み込まない
- **Selected Approach**: サーバーで SheetJS により作り、作る前に出力の記録を書く（schedules の経路の recordExportBeforeGeneration と同じ順）
- **Trade-offs**: 出力の記録の種類に、案件の無い種類を 1 つ足す

### Decision: 画面の経路は権限で守る
- **Context**: Requirement 10.1・10.5。既存の管理者の画面はロールで守っている
- **Selected Approach**: 台帳の画面は通常の認証済みの経路に置き、画面の中で台帳の管理の権限を確かめる。メニューの項目も権限で出し分ける
- **Rationale**: 管理者以外のロールに権限を与えたときも、要件のとおりに働く

## Risks & Mitigations
- 本番の DB の LC_CTYPE が C である — 着手の前に確かめる。C なら名称の検索は部分一致だけになるため、進め方を利用者へ確かめる
- カードの件数が多く、1 回の取り込みが長くなる — 1 回の取り込みのカードの数に上限を置き、分けて取り込めるようにする
- 受領見積書のモデルの変更が台帳に響く — 設計の Revalidation Triggers に挙げる

## References
- [pg_trgm](https://www.postgresql.org/docs/15/pgtrgm.html) — 近さの関数と索引
- [Prisma: PostgreSQL extensions](https://www.prisma.io/docs/orm/prisma-schema/postgresql-extensions) — 拡張の有効化の推奨
- [Prisma: raw queries](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries) — 埋め込みの値の結び付け
- [fflate](https://github.com/101arrowz/fflate) — zip の読み取り
