# Roadmap

## Overview

ローカル（Claude Desktop・Blender／Bonsai による BIM、スキルと共通スクリプト）で行う現場調査→BIM→図面→数量→見積の作業と、ArchiTrack を連携させる。ローカルは作業場、ArchiTrack は成果物の正本とし、両者を Claude が利用者ごとの権限でつなぐ。

本計画は三つの流れから成る。一つ目は単価台帳の流れで、協力会社の過去の見積を ArchiTrack の単価台帳へ移して正本にし、見積作成の画面で似た過去単価を表示して実行金額へ反映できるようにする。二つ目はコネクタの流れで、Claude Desktop のリモート MCP コネクタ（利用者ごとの OAuth）から ArchiTrack の案件・現場調査・単価台帳・数量表を読み書きできるようにする。三つ目は提出版の流れで、ローカルの BIM の道具群 ArchiBench が作った数量表・見積・工程表の下書きを「提出版」として取り込み、ArchiTrack での手直しを残したまま送り直せるようにする。

作成: 2026-10-21（kiro-discovery。利用者との検討の決定事項を記録）

更新: 2026-11-08（kiro-discovery の再入。ArchiBench からの提案 Issue #869 を取り込んだ。利用者の判断は下の「2026-11-08 の決定（Issue #869）」に記録する）

## Approach Decision

- **Chosen**: ArchiTrack をリモート MCP サーバーとして Claude Desktop のカスタムコネクタに登録し、利用者ごとに OAuth 2.1（既存のログインと 2FA を通る同意）で接続する。単価台帳は受領見積を拡張して兼ねる。ArchiBench の提出版と手直しの記録は、新しい spec（submission-intake）が 3 種類の形（数量表・見積・工程表）に共通の仕組みとして持つ
- **Why**:
  - Claude Desktop が主な利用環境で、ArchiTrack はほかの利用者も使うため、共有トークンではなく利用者ごとの認可と既存の RBAC・閲覧範囲・監査をそのまま効かせる必要がある
  - 受領見積の明細行は見積カードとほぼ同じ形であり、通常の業務で登録した受領見積がそのまま台帳に載れば二重登録が無くなる
  - 提出版と出所は、今どの spec も持たない新しい責務である。業務 spec ごとに持たせると同じ規則（版の付け方・出所の判定・送り直しの扱い）の持ち主が複数になってずれ、connector に持たせると「業務の規則を持たない窓口」という connector の境界が崩れる
- **Rejected alternatives**:
  - 個人用アクセストークン＋ローカル CLI：利用者が増えるとトークンの配布・保管・失効の管理が重く、Claude Desktop から直接は使えない
  - ローカル（stdio）MCP：各端末に実行環境とトークンが要り、複数の利用者に向かない
  - 台帳専用の見積カードを別モデルで持つ：受領見積と二重になる
  - 過去の見積ごとに仮の案件・見積依頼を作る：案件一覧が実在しない案件で埋まる
  - BIM のモデリングや IFC の処理を ArchiTrack へ移す：ローカルの Blender／Bonsai の作業効率を損なう
  - 提出版と出所を各業務 spec の拡張に持たせる：同じ仕組みを 4 か所で作ることになり、規則がずれる
  - 提出版と出所を claude-connector に持たせる：connector を通らない取り込み（画面など）で使えず、窓口に業務の規則が入る
  - 数量表の行の同一性を IFC の GlobalId で持つ：要素の増減で行が別の行になる（ArchiBench は行のキーを「分類キー＋区別」とし、GlobalId を追跡用の別の欄にしている）

## Scope

- **In**:
  - 単価台帳（過去の見積カードの全件移行、管理者向けの台帳画面、Excel の書き出し、似た単価の検索と按分計算。分類キーの一致を名称の近さより優先する）
  - 受領見積の拡張（見積依頼の任意化、明細行の区分・条件・換算・分類キー・数量表の行のキー、案件の条件・参考の印・読取の確認・業者名の文字での保持、原本の指紋と見積の区別による二重登録の検出）
  - 見積作成での似た過去単価の表示と、実行金額への反映（出典の記録）
  - 外部アプリの認可（OAuth 2.1、同意、連携中アプリの一覧と取り消し、監査、回数制限）
  - Claude 用リモート MCP コネクタ（読み取りから始め、台帳の登録・数量表・見積と工程の下書きの取り込み・見積の反映へ広げる。大きなデータは 1 回限りのアップロード先で受ける）
  - 数量表・見積・工程表への行のキー（分類キー＋区別）・分類キー・追跡用の GlobalId の組と、行のキーでの差分の適用
  - 提出版の取り込み（提出版の保存、欄ごとの出所、現在の版と手直しの読み出し、送り直しの適用）
- **Out**:
  - 案件の成果物（IFC・図面 PDF）の版管理（今回は外し、後で改めて検討する。submission-intake の提出版は ArchiTrack に取り込む数量表・見積・工程表の中身の版であり、成果物のファイルの版管理ではない）
  - BIM のモデリング・図面の作成・IFC の解析を ArchiTrack で行うこと
  - ブラウザでの IFC の閲覧
  - 時期による単価の補正
  - 工事内容の分類キーの体系そのものの保持と検査（体系の正本は ArchiBench の standards-registry。ArchiTrack はキーを文字として持つ）
  - 送り直しの照合（手直しの欄を残すか・人に確認を求めるかの判断）。ArchiBench の architrack-exchange が行い、ArchiTrack は判断に要る現在の版と出所を返し、送られた差分を当てる
  - ローカルのスキル（bim-estimate・vendor-quote-ledger ほか）と共通スクリプト、ArchiBench の改修（本リポジトリの外。下の「外部の作業」に記録する）

## Constraints

- **IPA 注意喚起の是正と同じブランチで進める**。是正計画（docs/security/ipa-alert-20261009-remediation-plan.md）の §4「spec の構成を壊さないための守り」に従う（要件番号は既存の続き、既存条文の改訂は記録を残す、tasks.md は行頭見出しで挿入、関門は名指しで 1 本ずつ）
- **同じ spec を IPA と本計画で同時に開かない**。是正の進行中の user-authentication を閉じた後に本計画を始め、本計画が既存 spec を拡張するときは、その spec の IPA の是正項目を同じ回にまとめて行う（estimate-request・estimate-creation・quantity-table-generation・construction-schedule）
- コネクタは IPA の是正で user-authentication が持つ仕組み（要件39 案件単位の閲覧範囲、要件40 出力の監査記録、要件43 異常の検知）を使うため、それらの実装の後に着手する
- 台帳全体（一覧・検索・修正・取り込み・Excel の書き出し）はシステム管理者だけ。見積作成の画面での似た単価の参照は見積を編集できる利用者。候補の案件名と原本のパスは、閲覧範囲内の案件と ArchiTrack に案件の無い過去カードだけに表示し、範囲外は「他案件」と表示する
- 実現性の確認（2026-10-21）で判明した前提:
  - 認可サーバーは自作せず既製のライブラリ（oidc-provider）を使い、MCP は公式 SDK v2 をリソースサーバーとしてだけ使う。SDK は既知の勧告を修正した版以上に固定し、要求ごとにサーバーを生成する
  - コネクタの通信は Anthropic のクラウドから来るため、本番など公開された環境でしか使えない。回数制限は IP 単位ではなくトークンの利用者単位で行う
  - nginx の中継先・CSRF の対象・401 応答の形を MCP と OAuth の経路に合わせて調整する
  - MCP のトークンは画面用の JWT と別系統にし、内部 API へそのまま渡さない
  - 似た単価の検索に pg_trgm を使う。本番 DB の lc_ctype が C だと日本語の類似度が常に 0 になるため、着手前に確認する
- ArchiBench へ送る形（ペイロード）の正本は ArchiTrack の spec とし、ArchiBench の architrack-exchange はその写し（現在は仮の版 0.x）に合わせる。形を決めたときは Issue #869 で ArchiBench 側へ知らせる
- 要件は E2E（Playwright）で画面の結線まで確かめて完了とする

## Boundary Strategy

- **Why this split**:
  - 台帳の流れはコネクタが無くても画面だけで価値が出るため、OAuth を待たずに先に進められる
  - 受領見積のデータの持ち主は estimate-request、見積の明細の持ち主は estimate-creation、数量表の持ち主は quantity-table-generation、工程表の持ち主は construction-schedule、認証・認可の仕組みの持ち主は user-authentication という既存の所管を崩さず、新しい責務（台帳の横断検索と管理、MCP の窓口、提出版と出所）だけを新しい spec にする
  - 業務 spec は自分の欄（行のキー・分類キー・GlobalId の組）と「行のキーで差分を当てる処理」だけを足し、submission-intake を知らない。出所は「現在の値」と「最後の提出版の値」の比較で求める案を第一とし（編集の処理に印を付ける仕組みを業務 spec へ足さずに済む）、submission-intake の設計で確定する。依存は submission-intake → 業務 spec の一方向にする
  - 受領見積は送り直して手直しを残すものではなく、登録して台帳に載るものであるため、提出版と出所の対象にしない。二重登録の検出（原本の指紋と見積の区別）は estimate-request が持つ
- **Shared seams to watch**:
  - 受領見積のモデル（estimate-request が持ち、unit-price-ledger が読む）。見積依頼の任意化は、見積書への転記（estimate-creation 要件4.5）と案件単位の受領見積の取得にも影響する
  - 類似単価の検索と按分計算の API（unit-price-ledger が持ち、estimate-creation の画面と claude-connector の操作が使う）
  - OAuth のトークンの検証と利用者の権限の解決（user-authentication が持ち、claude-connector が使う）
  - 閲覧範囲と出力記録（user-authentication が持ち、台帳の候補表示とコネクタの操作が適用する）
  - 行のキー（分類キー＋区別）と分類キーの書き方（ArchiBench の quantity-takeoff と standards-registry が決め、quantity-table-generation・estimate-creation・construction-schedule・estimate-request が同じ書き方で持つ）
  - 行のキーで差分を当てる処理（各業務 spec が持ち、submission-intake が呼ぶ）。楽観ロックの version と提出版の番号を混同しない
  - 提出版の形（数量表・見積・工程表は submission-intake、受領見積は estimate-request が持つ）と ArchiBench の写し（architrack-exchange）
  - 1 回限りのアップロード先（claude-connector が持ち、submission-intake と受領見積の原本の添付が使う）

## 2026-11-08 の決定（Issue #869）

- 提出版と手直しの記録は新しい spec（submission-intake）に持たせる。cc-sdd の「責務の境界ごとに spec 1 本、境界を越える約束は 1 か所が持つ」に沿う（利用者の判断「この案で進めて」）
- 受領見積の分類キー・数量表の行のキー・原本の指紋（sha256）・見積の区別は、次の回の estimate-request の拡張に入れる（利用者の判断：推奨案）
- 数量表の行の同一性は ArchiBench に合わせ、行のキー（分類キー＋区別）で持つ。GlobalId の組は追跡用の別の欄にする（利用者の判断：推奨案。roadmap 2026-10-21 の「GlobalId をキーにした差分更新」を改めた）
- 大きなデータは、connector の操作が発行する期限付き・1 回限りのアップロード先へローカルから上げ、取り込みの操作にはその ID を渡す。利用者のトークンはローカルに置かない（利用者の判断：推奨案）
- estimate-request の要件（2026-11-08）で、見積依頼に紐づかない受領見積書は案件を必須とし、登録と一覧は estimate-request の専用の画面が持ち、案件の詳細画面への欄の配置は project-management の拡張が持つと決めた（利用者の判断：推奨案）。project-management を開くため、その IPA の是正（5.3）を同じ回に行う
- 未決の点:
  - 1 回限りのアップロード先は、#869 の「ArchiBench の Python から API へ直接つながない」の例外になる。ArchiBench 側の了承を Issue #869 で得る
  - 見積の単価・金額の端数は、ArchiBench（国の運用：細目の単価は有効上位 3 桁など、金額は 1 円未満切捨て）と ArchiTrack（estimate-creation 要件22：小数第 1 位の四捨五入）で 1 円違いうる。取り込みで丸め直すかを estimate-creation の 2 回目の拡張で決める
  - 取り込みを「全体」で受けるか「差分」で受けるか。submission-intake の要件で決める（ArchiBench の送る内容は両方を持てる）

## Existing Spec Updates

- [ ] estimate-request -- 受領見積の見積依頼を任意にし（14.1 の改訂）、明細行に区分（諸経費・交通費・産廃・値引き・法定福利費・別途）・条件・換算・分類キー・数量表の行のキー、受領見積に案件の条件・参考の印・読取の確認・採否・業者名（文字）・原本の指紋（sha256）・見積の区別を持たせ、指紋と区別で二重登録を検出する。同じ回に IPA の是正項目（5.5）も行う。Dependencies: IPA の user-authentication の完了
- [ ] project-management -- 案件の詳細画面に「受領見積書」の欄を置き、estimate-request の案件の受領見積書の一覧（同 spec の Requirement 43）への入口にする（同 spec の Requirement 27・38・40 の先例）。同じ回に IPA の是正項目（5.3）も行う。Dependencies: estimate-request の拡張
- [ ] estimate-creation -- 明細行ごとに似た過去単価を表示し（単価＋諸経費按分−値引き按分、業者名つき）、実行金額の行へ反映して出典を記録する（4.5 の改訂、実行金額行の出典欄）。同じ回に IPA の是正項目（5.8）も行う。Dependencies: unit-price-ledger
- [ ] user-authentication -- 外部アプリの認可（OAuth 2.1 の認可サーバー、2FA を通る同意画面、MCP 用のトークン、連携中アプリの一覧と取り消し、監査、利用者単位の回数制限）を加える（33.1・33.3 の改訂）。Dependencies: IPA の user-authentication の完了（要件39・40 の実装）
- [ ] quantity-table-generation -- 数量項目に行のキー（分類キー＋区別）・分類キー・追跡用の GlobalId の組を持たせ、行のキーで差分を当てる処理を加える（31.9 の「末尾への追加のみ」との整理）。同じ回に IPA の是正項目（5.6）も行う。Dependencies: claude-connector（第 1 段）
- [ ] estimate-creation（2 回目） -- 見積の項目に行のキー・分類キーを持たせ、行のキーで差分を当てる処理を加える。取り込みでの端数の扱い（要件22 との関係）を決める。Dependencies: quantity-table-generation の拡張
- [ ] construction-schedule -- 工程表の項目に行のキー・分類キー・数量表の行のキー・追跡用の GlobalId の組を持たせ、行のキーで差分を当てる処理を加える。同じ回に IPA の是正項目（5.10）も行う。Dependencies: quantity-table-generation の拡張

## Direct Implementation Candidates

- なし

## External Work（本リポジトリの外）

- [ ] 共通スクリプトの単価台帳の道具（daicho）と vendor-quote-ledger のスキルを、Google ドライブの台帳から ArchiTrack への登録に切り替える。Dependencies: unit-price-ledger、claude-connector
- [ ] bim-estimate のスキルが過去の単価を ArchiTrack から引くようにする。Dependencies: claude-connector
- [ ] bim-quantity-takeoff の出力を数量表の取り込みの形式でも出す。Dependencies: quantity-table-generation の拡張
- [ ] 調査写真を Blender 側（PC）で使うための取得手順（期限付き URL を PC 側の Python から取りに行く）。Dependencies: claude-connector
- [ ] ArchiBench の architrack-exchange の写しを、ArchiTrack の spec で決まった形（受領見積は estimate-request、数量表・見積・工程表は submission-intake）に合わせて 1.0 にする。Dependencies: estimate-request の拡張、submission-intake
- [ ] ArchiBench 側に 1 回限りのアップロード先の利用（#869 の「直接つながない」の例外）の了承を得る。Dependencies: none（claude-connector の要件の前に）

## 実施順（本計画と IPA の是正の合わせた順）

1. IPA の是正：user-authentication（完了。2026-10-30・10-31 に `/kiro-validate-impl` が GO）
2. estimate-request の拡張と IPA の是正（5.5）。#869 の受領見積の欄（分類キー・数量表の行のキー・原本の指紋・見積の区別）を含む
3. project-management の拡張（案件の詳細画面の受領見積書の欄）と IPA の是正（5.3）
4. unit-price-ledger（過去カードの全件移行を含む。分類キーの一致を優先する検索）
5. estimate-creation の拡張と IPA の是正（5.8）
6. user-authentication の拡張（外部アプリの認可）
7. claude-connector 第 1 段（読み取り・似た単価・受領見積の構造化した登録と原本の添付・1 回限りのアップロード先）
8. quantity-table-generation の拡張と IPA の是正（5.6）
9. estimate-creation の 2 回目の拡張、construction-schedule の拡張と IPA の是正（5.10）
10. submission-intake（新規）
11. claude-connector 第 2 段（数量表・見積の下書き・工程表の下書きの取り込み、実行金額への反映）
12. 残りの IPA の是正（site-survey・construction-photo ほか、是正計画 §3 の順。project-management は 3、construction-schedule は 9 で済ませる）

## Specs (dependency order)

- [ ] unit-price-ledger -- 過去の見積を文字情報で持つ単価台帳（全件移行、管理者画面、Excel 書き出し、似た単価の検索と按分計算の API、権限）。検索は分類キーの一致を名称の近さより優先する。Dependencies: none
- [ ] claude-connector -- Claude Desktop 用のリモート MCP コネクタ（利用者の権限・閲覧範囲・出力記録を通す操作の一覧。読み取りから始め、台帳の登録・数量表と見積・工程の下書きの取り込み・見積の反映へ広げる。1 回限りのアップロード先を持つ）。Dependencies: unit-price-ledger（第 2 段は submission-intake）
- [ ] submission-intake -- ArchiBench が作った数量表・見積・工程表の下書きの提出版の取り込み（提出版の保存、欄ごとの出所、現在の版と手直しの読み出し、もとにした版の照合と行のキーでの差分の適用）。Dependencies: quantity-table-generation の拡張、estimate-creation の 2 回目の拡張、construction-schedule の拡張
