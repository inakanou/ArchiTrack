# Roadmap

## Overview

ローカル（Claude Desktop・Blender／Bonsai による BIM、スキルと共通スクリプト）で行う現場調査→BIM→図面→数量→見積の作業と、ArchiTrack を連携させる。ローカルは作業場、ArchiTrack は成果物の正本とし、両者を Claude が利用者ごとの権限でつなぐ。

本計画は二つの流れから成る。一つ目は単価台帳の流れで、協力会社の過去の見積を ArchiTrack の単価台帳へ移して正本にし、見積作成の画面で似た過去単価を表示して実行金額へ反映できるようにする。二つ目はコネクタの流れで、Claude Desktop のリモート MCP コネクタ（利用者ごとの OAuth）から ArchiTrack の案件・現場調査・単価台帳・数量表を読み書きできるようにする。

作成: 2026-10-21（kiro-discovery。利用者との検討の決定事項を記録）

## Approach Decision

- **Chosen**: ArchiTrack をリモート MCP サーバーとして Claude Desktop のカスタムコネクタに登録し、利用者ごとに OAuth 2.1（既存のログインと 2FA を通る同意）で接続する。単価台帳は受領見積を拡張して兼ねる
- **Why**:
  - Claude Desktop が主な利用環境で、ArchiTrack はほかの利用者も使うため、共有トークンではなく利用者ごとの認可と既存の RBAC・閲覧範囲・監査をそのまま効かせる必要がある
  - 受領見積の明細行は見積カードとほぼ同じ形であり、通常の業務で登録した受領見積がそのまま台帳に載れば二重登録が無くなる
- **Rejected alternatives**:
  - 個人用アクセストークン＋ローカル CLI：利用者が増えるとトークンの配布・保管・失効の管理が重く、Claude Desktop から直接は使えない
  - ローカル（stdio）MCP：各端末に実行環境とトークンが要り、複数の利用者に向かない
  - 台帳専用の見積カードを別モデルで持つ：受領見積と二重になる
  - 過去の見積ごとに仮の案件・見積依頼を作る：案件一覧が実在しない案件で埋まる
  - BIM のモデリングや IFC の処理を ArchiTrack へ移す：ローカルの Blender／Bonsai の作業効率を損なう

## Scope

- **In**:
  - 単価台帳（過去の見積カードの全件移行、管理者向けの台帳画面、Excel の書き出し、似た単価の検索と按分計算）
  - 受領見積の拡張（見積依頼の任意化、明細行の区分・条件・換算、案件の条件・参考の印・読取の確認・業者名の文字での保持）
  - 見積作成での似た過去単価の表示と、実行金額への反映（出典の記録）
  - 外部アプリの認可（OAuth 2.1、同意、連携中アプリの一覧と取り消し、監査、回数制限）
  - Claude 用リモート MCP コネクタ（読み取りから始め、台帳の登録・数量の投入・見積の反映へ広げる）
  - 数量表への安定キー（IFC の GlobalId）付きの構造化データの取り込みと差分更新
- **Out**:
  - 案件の成果物（IFC・図面 PDF）の版管理（今回は外し、後で改めて検討する）
  - BIM のモデリング・図面の作成・IFC の解析を ArchiTrack で行うこと
  - ブラウザでの IFC の閲覧
  - 時期による単価の補正
  - ローカルのスキル（bim-estimate・vendor-quote-ledger ほか）と共通スクリプトの改修（本リポジトリの外。下の「外部の作業」に記録する）

## Constraints

- **IPA 注意喚起の是正と同じブランチで進める**。是正計画（docs/security/ipa-alert-20261009-remediation-plan.md）の §4「spec の構成を壊さないための守り」に従う（要件番号は既存の続き、既存条文の改訂は記録を残す、tasks.md は行頭見出しで挿入、関門は名指しで 1 本ずつ）
- **同じ spec を IPA と本計画で同時に開かない**。是正の進行中の user-authentication を閉じた後に本計画を始め、本計画が既存 spec を拡張するときは、その spec の IPA の是正項目を同じ回にまとめて行う（estimate-request・estimate-creation・quantity-table-generation）
- コネクタは IPA の是正で user-authentication が持つ仕組み（要件39 案件単位の閲覧範囲、要件40 出力の監査記録、要件43 異常の検知）を使うため、それらの実装の後に着手する
- 台帳全体（一覧・検索・修正・取り込み・Excel の書き出し）はシステム管理者だけ。見積作成の画面での似た単価の参照は見積を編集できる利用者。候補の案件名と原本のパスは、閲覧範囲内の案件と ArchiTrack に案件の無い過去カードだけに表示し、範囲外は「他案件」と表示する
- 実現性の確認（2026-10-21）で判明した前提:
  - 認可サーバーは自作せず既製のライブラリ（oidc-provider）を使い、MCP は公式 SDK v2 をリソースサーバーとしてだけ使う。SDK は既知の勧告を修正した版以上に固定し、要求ごとにサーバーを生成する
  - コネクタの通信は Anthropic のクラウドから来るため、本番など公開された環境でしか使えない。回数制限は IP 単位ではなくトークンの利用者単位で行う
  - nginx の中継先・CSRF の対象・401 応答の形を MCP と OAuth の経路に合わせて調整する
  - MCP のトークンは画面用の JWT と別系統にし、内部 API へそのまま渡さない
  - 似た単価の検索に pg_trgm を使う。本番 DB の lc_ctype が C だと日本語の類似度が常に 0 になるため、着手前に確認する
- 要件は E2E（Playwright）で画面の結線まで確かめて完了とする

## Boundary Strategy

- **Why this split**:
  - 台帳の流れはコネクタが無くても画面だけで価値が出るため、OAuth を待たずに先に進められる
  - 受領見積のデータの持ち主は estimate-request、見積の明細の持ち主は estimate-creation、認証・認可の仕組みの持ち主は user-authentication という既存の所管を崩さず、新しい責務（台帳の横断検索と管理、MCP の窓口）だけを新しい spec にする
- **Shared seams to watch**:
  - 受領見積のモデル（estimate-request が持ち、unit-price-ledger が読む）。見積依頼の任意化は、見積書への転記（estimate-creation 要件4.5）と案件単位の受領見積の取得にも影響する
  - 類似単価の検索と按分計算の API（unit-price-ledger が持ち、estimate-creation の画面と claude-connector の操作が使う）
  - OAuth のトークンの検証と利用者の権限の解決（user-authentication が持ち、claude-connector が使う）
  - 閲覧範囲と出力記録（user-authentication が持ち、台帳の候補表示とコネクタの操作が適用する）

## Existing Spec Updates

- [ ] estimate-request -- 受領見積の見積依頼を任意にし（14.1 の改訂）、明細行に区分（諸経費・交通費・産廃・値引き・法定福利費・別途）・条件・換算、受領見積に案件の条件・参考の印・読取の確認・採否・業者名（文字）を持たせる。同じ回に IPA の是正項目（5.5）も行う。Dependencies: IPA の user-authentication の完了
- [ ] estimate-creation -- 明細行ごとに似た過去単価を表示し（単価＋諸経費按分−値引き按分、業者名つき）、実行金額の行へ反映して出典を記録する（4.5 の改訂、実行金額行の出典欄）。同じ回に IPA の是正項目（5.8）も行う。Dependencies: unit-price-ledger
- [ ] user-authentication -- 外部アプリの認可（OAuth 2.1 の認可サーバー、2FA を通る同意画面、MCP 用のトークン、連携中アプリの一覧と取り消し、監査、利用者単位の回数制限）を加える（33.1・33.3 の改訂）。Dependencies: IPA の user-authentication の完了（要件39・40 の実装）
- [ ] quantity-table-generation -- 安定キー（IFC の GlobalId）付きの構造化データの取り込みと差分更新を加える（31.9 との整理）。同じ回に IPA の是正項目（5.6）も行う。Dependencies: claude-connector

## Direct Implementation Candidates

- なし

## External Work（本リポジトリの外）

- [ ] 共通スクリプトの単価台帳の道具（daicho）と vendor-quote-ledger のスキルを、Google ドライブの台帳から ArchiTrack への登録に切り替える。Dependencies: unit-price-ledger、claude-connector
- [ ] bim-estimate のスキルが過去の単価を ArchiTrack から引くようにする。Dependencies: claude-connector
- [ ] bim-quantity-takeoff の出力を数量表の取り込みの形式でも出す。Dependencies: quantity-table-generation の拡張
- [ ] 調査写真を Blender 側（PC）で使うための取得手順（期限付き URL を PC 側の Python から取りに行く）。Dependencies: claude-connector

## 実施順（本計画と IPA の是正の合わせた順）

1. IPA の是正：user-authentication（進行中。要件39・40 を含めて閉じる）
2. estimate-request の拡張と IPA の是正（5.5）
3. unit-price-ledger（過去カードの全件移行を含む）
4. estimate-creation の拡張と IPA の是正（5.8）
5. user-authentication の拡張（外部アプリの認可）
6. claude-connector
7. quantity-table-generation の拡張と IPA の是正（5.6）
8. 残りの IPA の是正（site-survey・project-management・construction-photo ほか、是正計画 §3 の順）

## Specs (dependency order)

- [ ] unit-price-ledger -- 過去の見積を文字情報で持つ単価台帳（全件移行、管理者画面、Excel 書き出し、似た単価の検索と按分計算の API、権限）。Dependencies: none
- [ ] claude-connector -- Claude Desktop 用のリモート MCP コネクタ（利用者の権限・閲覧範囲・出力記録を通す操作の一覧。読み取りから始め、台帳の登録・数量の投入・見積の反映へ広げる）。Dependencies: unit-price-ledger
