# Brief: claude-connector（Claude 用コネクタ）

## Problem

利用者は、現場調査→BIM→図面→数量→見積の作業を、Claude Desktop に指示して進めている。ローカルの Blender／Bonsai と Claude を使う作業は効率が高い。一方で、ArchiTrack への登録と ArchiTrack からの取り込みは手作業のファイルの上げ下げになっている。対象は、調査写真・注釈・コメントの取り込み、数量表の登録、過去単価の参照、見積の反映である。ArchiTrack はほかの利用者も使うため、Claude からの操作にも利用者ごとの権限・閲覧範囲・監査を効かせる必要がある。

## Current State

- ArchiTrack の API は画面用で、認証は 2FA 必須の JWT（HttpOnly cookie のリフレッシュトークン、CSRF 必須）である
  - user-authentication 要件33.1・33.3 は、画面用のアクセストークン以外のトークンと、想定利用者が本システムでないトークンを拒否する
  - 外部クライアント・OAuth・MCP の要件はどの spec にも無い
- OpenAPI（Swagger）は開発・試験の環境でだけ有効（要件42.9）
- 調査写真の一覧と署名付き URL を返す API はある。ZIP の一括出力はブラウザ側で組み立てていて、サーバー側には無い
- 閲覧範囲（要件39）と出力の監査記録（要件40）は、IPA の是正で仕様を定めたが、まだ実装されていない

## Desired Outcome

- 利用者が Claude Desktop のコネクタに ArchiTrack を登録すると、ブラウザで既存のログインと 2FA を通って同意し、自分の権限の範囲で Claude から ArchiTrack を操作できる
- Claude 経由の操作は監査ログに「Claude 経由」として残り、利用者は連携中のアプリを画面で確かめて取り消せる
- 最初の段階で、Claude が次のことをできる
  - 案件・現場調査・調査写真（注釈付き）・コメントを読む
  - 似た過去単価を引く
  - 業者の見積を台帳（受領見積）へ構造化して登録する（明細の区分・条件・換算・分類キー、数量表の行のキーとの対応、原本のファイルの添付。原本の指紋と見積の区別で二重登録を知らせる）
- 後の段階（第 2 段）で、次のことができる
  - ArchiBench が作った数量表・見積の下書き・工程表の下書きを提出版として取り込む（submission-intake の取り込みを呼ぶ）
  - 現在の版と、ArchiTrack で手直しされた欄を読む（ArchiBench が送り直すときの照合に使う）
  - 見積の明細（実行金額）へ金額を反映する
- 数量表など大きなデータを、Claude の会話の文脈に載せずに渡せる（2026-11-08 の追加。Issue #869）

## Approach

- 認可サーバー（OAuth 2.1）は user-authentication の拡張が持つ。既製のライブラリ（oidc-provider）を Express に載せ、同意画面を既存のログイン＋2FA につなぐ
  - クライアントの登録は CIMD を優先し、DCR も受ける
  - PKCE（S256）を必須にし、リフレッシュトークンは回転させる
  - Claude のコールバック URL を登録する
- 本 spec は、MCP の窓口（公式 SDK v2 をリソースサーバーとしてだけ使う。Streamable HTTP）と操作の一覧を持つ
  - 各操作は、トークンの利用者の権限（RBAC）・閲覧範囲（要件39）を毎回評価し、既存のサービスを呼ぶ
  - 出力に当たる操作は出力記録（要件40）を残す
  - MCP のトークンは画面用の JWT と別系統にし、内部 API へそのまま渡さない
- スコープは読み取りと書き込みを分け、最初は読み取りの操作から出す
  - 書き込みの操作は、楽観ロックと監査を通し、利用者が画面で確かめられる形で反映する
  - 下書きにするか、確定まで行うかは、操作ごとに設計で決める
- 大きなデータの受け渡しは、1 回限りのアップロード先で行う（2026-11-08 の利用者の判断：推奨案。roadmap の「2026-11-08 の決定」）
  - 操作が、期限付きで 1 回だけ使えるアップロード先（URL と ID）を発行する。ローカルからそこへファイルを上げ、取り込みや受領見積の登録の操作にはその ID を渡す
  - 利用者のトークンはローカルに置かない。アップロード先は発行した利用者・案件・用途・大きさの上限・期限に縛り、使い終わったものと期限切れのものは消す
  - ArchiBench の「Python から API へ直接つながない」の例外になるため、要件の前に ArchiBench 側の了承を Issue #869 で得る
- 画像は縮小して操作の結果として返す（結果は約 15 万文字が上限）
  - PC 側の Blender で使う原寸の画像は、期限付き URL を PC 側の Python から取得する手順を用意する
  - Claude 側から URL を開けることは前提にしない
- 実現性の確認（2026-10-21）で判明した、既存の構成とぶつかる点を設計で解く
  - nginx が中継していない経路（/mcp、/.well-known、OAuth の経路）
  - CSRF の対象外にする経路
  - 401 応答に付ける WWW-Authenticate（resource_metadata）
  - 通信がすべて Anthropic のクラウドから来ることを前提にした、利用者単位の回数制限と異常の検知（要件43）
  - SDK の既知の勧告を修正した版以上への固定と、要求ごとのサーバー生成

## Scope

- **In**:
  - MCP の窓口（Streamable HTTP、保護されたリソースのメタデータ、401 応答）
  - 操作の一覧と、各操作での権限・閲覧範囲・出力記録・監査（Claude 経由の印）の適用
  - 読み取りの操作
    - 案件の一覧と詳細
    - 現場調査と写真・注釈・コメント
    - 似た過去単価の検索
  - 書き込みの操作
    - 受領見積（台帳）への業者見積の登録
    - 数量表・見積の下書き・工程表の下書きの提出版の取り込みと、現在の版と手直しの欄の読み出し（第 2 段。submission-intake の後）
    - 見積の明細への金額の反映
  - 1 回限りのアップロード先の発行と受け取り
  - 調査写真を PC 側で取得するための期限付き URL の発行
- **Out**:
  - OAuth の認可サーバー・同意画面・連携中アプリの管理画面・トークンの検証（user-authentication の拡張が持つ）
  - 台帳・数量表・見積・工程表の業務の規則そのもの（各業務 spec が持つ）
  - 提出版の保存・欄ごとの出所・送り直しの適用の規則（submission-intake が持つ）
  - 送り直しの照合の判断（ArchiBench の architrack-exchange が行う）
  - 案件の成果物（IFC・図面 PDF）の版管理
  - ローカルの MCP（stdio）や個人用アクセストークン
  - ローカルのスキルと共通スクリプトの改修（本リポジトリの外）

## Boundary Candidates

- MCP の窓口と配備（nginx の中継、CSRF の対象外、401 応答、利用者単位の回数制限）
- 操作の土台（トークンからの利用者の解決、権限・閲覧範囲・出力記録・監査の共通の適用）
- 読み取りの操作群
- 書き込みの操作群（業務ごとに段階を分けて加える）
- 大きなデータの受け渡し（1 回限りのアップロード先の発行・受け取り・後始末）

## Out of Boundary

- 認可サーバーとトークンの発行・失効（user-authentication）
- 各業務の API と規則（estimate-request・unit-price-ledger・quantity-table-generation・estimate-creation・site-survey）

## Upstream / Downstream

- **Upstream**:
  - user-authentication（IPA の是正の要件39・40・43 の実装と、外部アプリの認可の拡張）
  - unit-price-ledger（似た単価の検索 API）
  - site-survey（写真と署名付き URL）
  - estimate-request（受領見積の登録）
  - submission-intake（提出版の取り込み、現在の版と手直しの読み出し。第 2 段）
- **Downstream**:
  - ローカルのスキル（vendor-quote-ledger・bim-estimate・bim-quantity-takeoff・bim-public-modeling）が ArchiTrack を正本として使う形への切り替え
  - ArchiBench の architrack-exchange（Claude が connector で提出版と受領見積を送る手順のスキル）

## Existing Spec Touchpoints

- **Extends**: なし（新規 spec）。前提として user-authentication の拡張（外部アプリの認可、要件33.1・33.3 の改訂）が先に入る
- **Adjacent**:
  - user-authentication — 要件26（CSRF・cookie 前提）、33（トークンの種別と想定利用者）、34（2FA 必須）、35（回数制限）、39（閲覧範囲）、40（出力記録）、42（管理用の経路）、43（異常の検知）
  - quantity-table-generation — 要件27〜33 の取り込み。31.9（末尾への追加のみ）は差分更新と方針がずれるため、同 spec の拡張で整理する（行のキーは分類キー＋区別、GlobalId の組は追跡用。2026-11-08 の決定）。connector は数量表を直接書かず、submission-intake を通す
  - submission-intake — 提出版の形（数量表・見積・工程表）の正本。connector の操作の入出力はこの形に合わせる
  - site-survey — 署名付き URL の配信規約

## Constraints

- IPA 注意喚起の是正と同じブランチで進める。IPA の user-authentication（要件39・40 を含む）と、user-authentication の拡張（外部アプリの認可）を閉じた後に着手する
- コネクタは Anthropic のクラウドから接続されるため、本番など公開された環境でしか使えない。開発環境の動作確認は MCP のクライアントを手元で動かして行う
- 書き込みの操作は、Claude の調査機能では承認なしに実行されうる。そのため、スコープを読み取りと分け、最小にする
- 技術スタックは既存のまま（Express 5、Prisma 7、TypeScript）。追加の依存は公式 MCP SDK v2（Apache-2.0）と oidc-provider（MIT）を想定し、版は固定する
- 生成物は日本語（spec.json.language=ja）
- 要件は E2E で確かめて完了とする（コネクタは MCP のクライアントを使った統合試験を含む）
