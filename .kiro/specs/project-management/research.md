# Research & Design Decisions

## Summary
- **Feature**: project-management（Requirements 42〜46 と 9.5・9.6・28.1 の改訂。2026-11-09）
- **Discovery Scope**: Extension（既存の詳細画面・編集画面・削除・定期処理への追加）。軽い調査（design-discovery-light）で、読むだけの調べものを 3 本（受領見積書・閲覧範囲・担当者・削除の現況、完全削除の対象と外部キー・ストレージ・定期処理、画面と権限）行った
- **Key Findings**:
  - 受領見積書の登録・編集・削除は `estimate_request:update` を求める（estimate-request の design の D3）。42.10 の「見積依頼の作成権限」は同じ読みに合わせないと、ボタンを押した先が 403 になる
  - 詳細画面の不在の表示は汎用の 404 の画面で、編集画面の表示（「プロジェクトが見つかりません」）と揃っていない。21.13 の E2E は `test.fail()` で失敗を予期している
  - 完全削除は `Cascade` だけに任せられない。受領見積書の案件の外部キーが `Restrict` で、木の中にも `Restrict` が 5 本ある。ストレージのキーはプロジェクトの接頭辞を持たず、一覧の部品も無いため、キーを DB から集めて 1 件ずつ消す
  - 関連データの件数（9.5）は常に 0 を返す仮の実装で、経路も無い。既存の E2E は関連データの無いプロジェクトで確かめていた

## Research Log

### 受領見積書のデータと権限
- **Context**: 42・43 の総数・直近・権限
- **Findings**: 一覧の経路は配列だけを返す。`findByProjectId` の `include: 'all'` は論理削除されていない受領見積書のうち、見積依頼の無いものと論理削除されていない見積依頼に紐づくものを返す。`req.user` は権限を持たず、経路の中では `getSharedRBACService().hasPermission` を使う（claude-vision の経路の先例）
- **Implications**: 件数と直近の部品を同じ条件で足し、43.3 の一致を保つ。権限の判定はサーバーで行い、応答に鍵を含めない

### 担当者の変更
- **Findings**: 保存は成功すると常に詳細画面へ移る。編集フォームは工事担当者を空にしても `undefined` を送り、サーバーは `null` のときだけ紐づけを外す。画面の型 `ProjectDetail` は `createdById` を持たないが、サーバーは返している
- **Implications**: 判定の材料（作成者・`project:read_all`・変更後の担当者）は画面で揃う。工事担当者を空にしたら `null` を送るよう直さないと、確認の判定と保存の結果が食い違う

### 完全削除
- **Findings**: 定期処理は `createScheduledJobDefinitions(prisma)` に定義を足す形で、`NODE_ENV=test` では登録されない（E2E で動かない）。手動で起動する経路は無い。監査ログは外部キーを持たず、削除はトリガーが拒む。ストレージの `delete` は無いキーで失敗しない
- **Implications**: 完全削除は統合試験で確かめ、E2E は除外の台帳へ登録する。ファイル→DB の順にすれば、どこで止まっても次の回で完了する

### 気づいたが本章の境界の外とするもの
- 40.1 は実行予算セクションを工程表セクションの下に置くが、画面は実行予算を工程表の上に描いている。tasks.md に意図的な変更の記録は無い。本章は受領見積書セクションの位置（見積依頼と見積書の間）だけを扱い、この並びは変えない

## Architecture Pattern Evaluation
| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| `project.delete` の連鎖だけ | 外部キーの `Cascade` に任せる | 簡単 | 受領見積書の `Restrict` で必ず止まる。木の中の `Restrict` は連鎖の順に依存する | 採らない |
| 葉から明示の削除＋連鎖 | `Restrict` の行を葉から消してから連鎖に任せる | 順に依存しない。消す範囲が明示 | 外部キーが増えたら順を見直す | 採る（Revalidation Triggers） |
| 関連データに削除の印を付ける | 9.6 の改訂前の形 | 個別の表示を絞れる | 完全削除でまとめて消すため役に立たない | 要件の段階で採らない |

## Design Decisions

### Decision: 新規登録のボタンの権限
- **Context**: 42.10・42.12 の「見積依頼の作成権限」と、登録の経路の `estimate_request:update`
- **Selected Approach**: `estimate_request:update` で出し分ける（estimate-request の 43.11 と D3 の読みに合わせる）
- **Rationale**: `estimate_request:create` で出すと、押した先の登録が 403 になる
- **Follow-up**: 要件の文言を「受領見積書の登録の権限」に改める場合は、estimate-request の 43.11 と揃えて利用者が決める

### Decision: 1 回の完全削除の件数
- **Selected Approach**: 最大 20 件で、残りは翌日以降
- **Trade-offs**: 保持期間を数日超えて消えることがある。1 回の所要と R2 の要求を抑える

## Risks & Mitigations
- 他のプロジェクトの見積依頼がこのプロジェクトの内訳書を参照していると、`Restrict` で DB の削除が毎回失敗する — 失敗をプロジェクトごとに記録し、他のプロジェクトの完全削除を止めない。起きたら運用が記録で気づく
- 複数のインスタンスで同じ定期処理が重なる — Bull の繰り返しの jobId で一つに絞られる前提。重なっても、ファイルの削除と DB の削除はどちらもやり直しの効く順にしている
- 導入の直後に、90 日を過ぎた既存の論理削除のプロジェクトが消える — 46.8 として利用者が承認した（2026-11-09）。1 回 20 件ずつ進む

## References
- `docs/security/ipa-alert-20261009-remediation-plan.md` §5.3
- `docs/deployment/data-protection.md`（データベースのバックアップの保持 最長 89 日）
- `.kiro/specs/estimate-request/design.md` の D3（受領見積書の登録の権限）
