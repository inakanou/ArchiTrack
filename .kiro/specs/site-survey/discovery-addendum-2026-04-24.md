# Discovery Addendum: 画像注釈機能の見た目・スマホ操作性強化

- **作成日**: 2026-04-24
- **対象spec**: site-survey（既存spec更新 / Path A）
- **由来**: `/kiro-discovery` セッション（ユーザー要望: 画像注釈機能の見た目模倣とスマホ操作性向上）

本ドキュメントは、既存の `site-survey/requirements.md` に追加される新要件の根拠・スコープ・設計方針を、次フェーズ（`/kiro-spec-requirements`）に引き継ぐための記録である。

## 背景

現場調査画面の画像注釈機能は、寸法線・矢印・円・四角形・多角形・折れ線・フリーハンド・テキストの主要ツールを既に備えている（実装は `frontend/src/components/site-surveys/tools/` 配下、`AnnotationEditor.tsx`、`AnnotationToolbar.tsx`、`ImageViewer.tsx`）。

一方、一般的な画像注釈ソフトで標準的に提供されている「注釈の視認性を担保する白縁取り表現」と「モバイル端末向けの操作性」の両面で明確なギャップがあり、現場スマホ運用時のユーザー体験に課題がある。

## 今回の対応範囲（In Scope）

以下8項目に限定する。

### カテゴリA: 見た目（一般的な画像注釈ソフト風の視認性確保）

| # | ギャップ項目 | 現状 | 目指す状態 |
|---|---|---|---|
| A1 | 矢印の白縁取り | 未実装 | ダブルストローク（外側に白太線、内側に本体色）で任意背景でも視認可能 |
| A2 | テキストの白縁取り（アウトライン） | 未実装（背景色のみ） | 文字の外側に白ストローク（textStroke）を付与。背景色とは独立に選択可能 |
| A3 | デフォルトカラー/スタイル | 赤2pxのみ | 白縁取りを前提とした既定色・既定線幅の見直し。Skitch 風の明瞭な既定値を採用 |

### カテゴリB: スマホ操作性向上（Skitch / iOS マークアップ風）

| # | ギャップ項目 | 現状 | 目指す状態 |
|---|---|---|---|
| B1 | ダブルタップでテキスト編集起動 | 未実装 | 既存テキスト注釈をダブルタップすると編集モードに入る |
| B2 | 長押しジェスチャー | 未実装 | 選択中オブジェクトの長押しでコンテキストメニュー（編集/複製/削除 等） |
| B3 | モバイル向けツールバー（折返し・縦配置） | flexWrap 未指定 | 画面幅に応じた折返し、縦スクロール対応、スマホ優先のツール配置 |
| B4 | カスタムカーソル/ツールヒント | Fabric 標準のみ | 選択中ツールに応じたカーソル表現、タップ先のヒント表示 |
| B5 | 3点以上のマルチタッチ | 未対応 | ピンチ中に追加タッチが入っても描画誤検知しないガード、タッチ数3以上の扱いを明示化 |

## Non-Goals（今回の対象外）

次の項目は、ユーザー合意により今回のスコープ外とする（別要件として切り出すかは未定）。

- 番号付きマーカー（連番丸数字）
- ハイライター（半透明マーカー）
- ぼかし/モザイク
- 切り抜き/トリミング
- コピー/貼り付け
- 曲線矢印（カーブしたベジェ矢印）

## 用語・表記ルール

- **外部ソフトの固有名詞は spec / design / tasks / 実装コード内で使用しない**（ユーザー指示）
- 見た目については「画像注釈に一般的な白縁取り表現」「視認性を担保する外縁ストローク」等、機能説明ベースで記述する
- スマホ操作性については「モバイル写真マークアップUIの慣習」等、パターン名ベースで記述する

## スタイル方針（設計フェーズで詳細化）

- **矢印の白縁取り**: Fabric.js で本体Pathの下に白太線の同形状Pathを重ねるダブルストローク方式を第一候補とする（Fabric標準APIで実現可能、レンダリングコスト小）
- **テキストの白縁取り**: Fabric IText の `stroke` + `strokeWidth` + `paintFirst: 'stroke'` による textStroke を第一候補とする。既存の背景色（backgroundColor）とは独立に切り替え可能にする
- **デフォルトカラー**: 白縁取りを前提に、現在の赤2pxから Skitch 風の明瞭色（橙〜赤、3〜4px 目安）へ再調整。トークン化して色・線幅をセットで持てるようにする

## スマホ操作性の参考UXパターン（Skitch / iOS マークアップ）

- 画面下部固定ツールバー、ツール項目は大きめタップ領域（44pt 以上目安）
- 選択中ツールは明確にハイライト
- 長押し→バブルメニュー / ダブルタップ→編集 / ピンチ→ズーム のジェスチャー階層
- マルチタッチ中は描画コミットをロックし、タッチ数が1に戻ってから描画再開

## 既存実装との関連ファイル（要件化・設計時に参照）

- `frontend/src/components/site-surveys/AnnotationEditor.tsx` — Canvas初期化・イベント処理・ツール切替
- `frontend/src/components/site-surveys/AnnotationToolbar.tsx` — ツールUI・色・線幅ピッカー
- `frontend/src/components/site-surveys/ImageViewer.tsx` — ビューア・ズーム・パン・タッチ処理
- `frontend/src/components/site-surveys/tools/ArrowTool.ts` — 矢印（白縁取り実装対象）
- `frontend/src/components/site-surveys/tools/TextTool.ts` — テキスト（白縁取り実装対象）
- `frontend/src/components/site-surveys/annotation-toolbar.constants.ts` — デフォルト色・線幅（既定値見直し対象）
- `frontend/src/hooks/useFabricUndoIntegration.ts` — 新規スタイル変更をUndo/Redoに統合
- その他全ツール（Circle/Rectangle/Polygon/Polyline/Freehand/Dimension）はダブルストローク適用のオプション化を検討

## spec運用上の注意

- 既存 `site-survey/spec.json` は現在 `phase: tasks-generated`（approved済）
- 今回の要件追加に伴い、次フェーズで **phase を `requirements-generated` にロールバックし、approvals を再承認フローに戻す**
- 追加される要件番号は既存の Requirement 23 以降の連番（Requirement 24 以降）として割り当てる

## 次のアクション

- `/kiro-spec-requirements site-survey`
  - 本 addendum を入力として、Requirement 24 以降に上記 A1–A3, B1–B5 を EARS 形式で追加する
  - 用語ルール（外部ソフト名の禁止）を厳守する
- 追加後、`/kiro-validate-gap site-survey` → `/kiro-spec-design site-survey` → `/kiro-spec-tasks site-survey` と進める
