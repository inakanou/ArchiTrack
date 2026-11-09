# Brief: submission-intake（提出版の取り込み）

作成: 2026-11-08（kiro-discovery の再入。ArchiBench からの提案 Issue #869 の「提出版と手直しの記録」。roadmap の「2026-11-08 の決定」）

## Problem

積算・設計の担当者は、ローカルの BIM の道具群 ArchiBench で、モデルから数量表・見積の下書き・工程表の下書きを作り、提出版だけを ArchiTrack へ送る（送るのは Claude が claude-connector で行う）。ArchiTrack では、ほかの利用者が表記・端数・値引き・利益率・注記などを手直しする。数量・工事内容の変更は BIM に戻って直し、ArchiBench が送り直す。このとき次の問題がある。

- ArchiTrack は送られたものを版で持たないため、どの提出版をもとに今の中身になっているかが分からない
- どの欄が ArchiBench から来た値で、どの欄が ArchiTrack で手直しされた値かが分からない。送り直すと手直しが消えるか、手直しを守るために送り直せない
- 手直しされた行の数量が送り直しで変わったとき、人に確認を求める手がかりが無い

## Current State

- 数量表（quantity-table-generation）・見積（estimate-creation）・工程表（construction-schedule）は、画面での編集と、ファイルからの取り込み（数量表の要件27〜33。31.9 は既存項目の末尾への追加のみ）を持つ。モデルの `version` は楽観的排他制御のためのもので、提出された版を残す仕組みはどの spec にも無い
- 行の同一性を表す欄が無い。ArchiBench は行のキー（分類キー＋区別）と、追跡用の GlobalId の組を別々に持つ（ArchiBench の architrack-exchange の設計、形の写しの版 0.1。仮）
- ArchiBench の architrack-exchange は、ArchiTrack の現状（行ごとの値と欄ごとの出所 `archibench`・`edited`・`added`）を読み、手直しを残した「送る内容」（もとにした版 `baseVersion` と操作の一覧、または全体）を作る。照合と人の確認はローカルで行う
- 業務 spec の拡張（roadmap の実施順 8・9）で、数量表・見積・工程表の行に行のキー・分類キー（工程表は数量表の行のキー・GlobalId の組も）と、行のキーで差分を当てる処理が入る予定

## Desired Outcome

- ArchiBench から送られた数量表・見積の下書き・工程表の下書きが、提出版（形の種類・形の版・提出版の番号・作成元・受け取った中身）として残る
- 欄ごとに、ArchiBench から来た値か、ArchiTrack で手直しした値か、ArchiTrack で足した行かが分かる
- connector（と、必要なら画面）から、現在の版と手直しされた欄を読める
- 送り直しは、もとにした提出版が現在の版と一致するときだけ当たり、手直しされた欄は送る内容が明示しない限り変わらない。もとにした版が古いときは拒否して、照合のやり直しを求める
- 取り込みの結果は監査ログに残り、利用者は画面で取り込まれた版を確かめられる

## Approach

- 3 種類の形（数量表・見積・工程表）に共通の仕組みとして持つ。業務の規則（値の検査・保存・採番）は各業務 spec の「行のキーで差分を当てる処理」を呼んで任せ、本 spec は版と出所だけを持つ
- 出所は「現在の値」と「最後の提出版の値」の比較で求める案を第一とする。業務 spec の編集の処理に印を付ける仕組みを足さずに済み、依存が本 spec → 業務 spec の一方向になる。比較で求められない場合（手直しして同じ値へ戻した、送り直しで ArchiBench の値を採ったなど）の扱いと、比較か記録かの最終の決定は設計で行う
- 形（ペイロード）の正本は本 spec が持ち、各欄の型と上限は業務 spec のモデルに合わせる。ArchiBench の写し（版 0.1）を出発点にし、決まった形を Issue #869 で知らせる
- 取り込みを「全体」で受けるか「差分（もとにした版＋操作の一覧）」で受けるかは要件で決める（ArchiBench の送る内容は両方を持てる）
- 大きなデータは claude-connector の 1 回限りのアップロード先で受け、本 spec はその ID から中身を読む

## Scope

- **In**:
  - 提出版の保存（形の種類・形の版・提出版の番号・作成元・受け取った中身・受け取った日時と利用者）
  - 形の検証の窓口（形の版の照合、行のキーの一意、業務 spec の検査の呼び出し）
  - 欄ごとの出所（ArchiBench 由来・手直し・ArchiTrack で追加）の判定
  - 現在の版と出所の読み出し（connector の操作が使う）
  - 送り直しの適用（もとにした版の照合、行のキーでの差分の適用、手直しの欄の保護、競合の拒否）
  - 提出版の履歴の画面での確認、取り込みの監査記録、権限と閲覧範囲の適用
- **Out**:
  - 受領見積（登録して台帳に載るもので、送り直さない。二重登録の検出は estimate-request が持つ）
  - 送り直しの照合の判断と人の確認（ArchiBench の architrack-exchange）
  - 行の値の検査・保存・採番、行のキーで差分を当てる処理そのもの（各業務 spec）
  - MCP の操作と 1 回限りのアップロード先（claude-connector）
  - 分類キーの体系の保持と検査（ArchiBench の standards-registry）
  - 案件の成果物（IFC・図面 PDF）の版管理（roadmap の Out）

## Boundary Candidates

- 提出版の保存と形の検証
- 出所の判定（比較による算出、または記録）
- 現在の版と出所の読み出し
- 送り直しの適用（版の照合、差分の適用、手直しの保護、競合）

## Out of Boundary

- 数量表・見積・工程表の業務の規則と画面の編集（各業務 spec）
- 認証・認可・閲覧範囲・監査の仕組みそのもの（user-authentication）
- connector の窓口とアップロード先（claude-connector）

## Upstream / Downstream

- **Upstream**:
  - quantity-table-generation の拡張（行のキー・分類キー・GlobalId の組、行のキーでの差分の適用）
  - estimate-creation の 2 回目の拡張（同上。取り込みでの端数の扱い）
  - construction-schedule の拡張（同上。数量表の行のキー）
  - user-authentication（RBAC、要件39 の閲覧範囲、監査）
  - claude-connector 第 1 段（1 回限りのアップロード先）
- **Downstream**:
  - claude-connector 第 2 段（提出版の取り込みと、現在の版と手直しの読み出しの操作）
  - ArchiBench の architrack-exchange（写しを本 spec の形に合わせて 1.0 にする）

## Existing Spec Touchpoints

- **Extends**: なし（新規 spec）。前提として、業務 spec の拡張（roadmap の実施順 8・9）が先に入る
- **Adjacent**:
  - quantity-table-generation — 要件27〜33 の取り込み（ファイル・OCR）。本 spec の提出版の取り込みとは経路を分ける。31.9 の整理は同 spec の拡張で行う
  - estimate-creation — 要件22（丸め）。ArchiBench の端数（国の運用）との違いを同 spec の 2 回目の拡張で決め、本 spec はそれに従う
  - construction-schedule — 要件2（数量表連携）。工程表の項目と数量表の行のキーの対応
  - 各業務 spec の楽観的排他制御の `version` — 提出版の番号と混同しない

## Constraints

- IPA 注意喚起の是正と同じブランチで進める。是正計画の §4 の守りに従う
- 業務 spec は本 spec を知らない（依存は本 spec → 業務 spec の一方向）
- 技術スタックは既存のまま（Express 5、Prisma 7、PostgreSQL、React 19）
- 数量表の上限は ArchiBench の写しに合わせる想定（グループ 1000・行 5000、見積の項目 2000・階層 100、工程表 200 項目）。要件で業務 spec の上限（IPA 是正計画 §5.14）と揃える
- 生成物は日本語（spec.json.language=ja）
- 要件は E2E で画面の結線まで確かめて完了とする（connector の操作は claude-connector の第 2 段で確かめる）
