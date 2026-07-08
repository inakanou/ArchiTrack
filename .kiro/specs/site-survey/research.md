# Gap Analysis: site-survey Requirements 24-30（画像注釈の視認性向上・モバイル操作性強化）

- **作成日**: 2026-04-24
- **対象要件**: `requirements.md` Requirement 24 〜 30
- **出典**:
  - 既存実装の詳細調査（Exploreサブエージェント）
  - Fabric.js 7.3.1 API 実現性検証（一次情報: `node_modules/fabric/dist/src/`）

## 0. 重要な前提訂正: Fabric.js バージョン

`frontend/package.json` は `"fabric": "^7.3.1"`、`node_modules/fabric/package.json` も `7.3.1` を指定している。既存コードのコメントや `tech.md` は "Fabric.js 6.x" と表記しているが、**実態は Fabric.js 7.3.1** である。本分析は 7.3.1 の一次情報を根拠にしている。

実影響:
- `toObject(propertiesToInclude?: string[])` シグネチャ、`classRegistry.setClass()`、`InteractiveObject.cornerSize / touchCornerSize`、`paintFirst: 'stroke'` 経路はすべて v7 でも利用可能
- 既存 `ArrowTool.ts:424` 付近の `@ts-expect-error` は v7 シグネチャとのズレ。今回の改修でついでに解消しておくと保守性が向上する

## 1. Current State Investigation（現状把握）

### 1.1 注釈アーキテクチャ概観

| レイヤ | 主要ファイル | 役割 |
|---|---|---|
| Canvas コア | `frontend/src/components/site-surveys/AnnotationEditor.tsx` | Fabric Canvas 初期化、イベント配線、保存、ロード、復元スケール補正 |
| ビューア | `frontend/src/components/site-surveys/ImageViewer.tsx` | ズーム・パン・タッチ（1本指/2本指）、回転 |
| ツールUI | `frontend/src/components/site-surveys/AnnotationToolbar.tsx` | ツール選択・色ピッカー・線幅・スタイルパネル |
| ツール本体 | `frontend/src/components/site-surveys/tools/*.ts` | Arrow/Text/Rectangle/Circle/Polygon/Polyline/Freehand/Dimension |
| シリアライズ | 各 tool の `toObject/fromObject`、`registerCustomShapes.ts` | Fabric `classRegistry` による型ID復元 |
| Undo/Redo | `frontend/src/services/UndoManager.ts`、`frontend/src/hooks/useFabricUndoIntegration.ts` | コマンドパターン + `object:added/modified/removed` hook |
| 出力 | `frontend/src/services/export/AnnotationRendererService.ts` | サムネイル・PDF・個別エクスポートの共通レンダラ |

### 1.2 既存のスタイル・デフォルト管理

- 一元管理箇所: `frontend/src/components/site-surveys/annotation-toolbar.constants.ts:135-140`
  ```ts
  export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
    strokeColor: '#ff0000',
    strokeWidth: 2,
    fillColor: '',
    fontSize: 16,
  };
  ```
- **問題点**: 各ツール側にも個別の `DEFAULT_*_OPTIONS` が重複定義されている
  - 例: `ArrowTool.ts:68-72` は `stroke: '#000000'`（`DEFAULT_STYLE_OPTIONS` の赤と不整合）
- セッション内スタイル継承: `AnnotationEditor.tsx:456-476` の `handleStyleChange` で実装あり

### 1.3 Undo/Redo 統合

- コマンドパターン完全実装（`UndoManager.ts:81-227`）
- Fabric イベント `object:added/modified/removed` を `useFabricUndoIntegration.ts:345-349` で捕捉
- スタイル変更は `object:modified` 経由で前状態・後状態を snapshot（104-128 行）して Undo/Redo 可能
- **今回追加する属性変更（白縁取り on/off 等）も、オブジェクト差分ベースで自然にUndo履歴に乗る**

### 1.4 シリアライズ互換性基盤

- Arrow/Text など全ツールが `toObject/fromObject` をカスタム定義
- `registerCustomShapes.ts` で `classRegistry.setClass('arrow', Arrow)` 等を実施
- 復元時: `AnnotationEditor.tsx:577-604` で `util.enlivenObjects(objects)` → スケール補正のみ実施（型スキーマ変更には非対応）

### 1.5 タッチ処理の現状

- `ImageViewer.tsx:921-1056` に `handleTouchStart/Move/End` を実装
  - 1本指: パン
  - 2本指: ピンチズーム + パン
  - 3本指以上: フォールバックで 1本指扱い（= 誤動作の温床）
- `AnnotationEditor.tsx` 側は `mouse:dblclick` を polygon の頂点確定にのみ使用（`:991`）
- **長押し検出、ダブルタップ検出、コンテキストメニューUIはいずれも未実装**

### 1.6 ツールバーのレスポンシブ状況

- `AnnotationToolbar.tsx:62-73` は inline style（TailwindCSS 未使用）
  - `overflowX: 'auto'` で横スクロールに対応
  - `flexWrap` は未指定
- タップ領域: `button.base.minWidth: 48px / minHeight: 48px`（WCAG 2.5.5 相当、概ね妥当）
- スタイル詳細パネル（`StylePanel` at `:269-401`）は常時表示（開閉トグルなし）

### 1.7 ビジュアルフィードバック

- ツール選択中ハイライト: 実装あり（`AnnotationToolbar.tsx:215-249`）
- ツールヒント: 実装あり（`title` / `aria-label`）
- カスタムカーソル: 未実装（`ImageViewer.tsx:1373-1378` でズーム/パン状態に応じた grab/grabbing のみ）
- 選択ハンドルサイズ: Fabric のデフォルト（`cornerSize: 13 / touchCornerSize: 24`）をそのまま使用、明示設定なし

## 2. Requirements Feasibility Analysis（要件実現性評価）

### Requirement-to-Asset Map

| Req | 必要資産 | 既存資産 | Gap 種別 | 備考 |
|---|---|---|---|---|
| **Req 24（矢印白縁取り）** | 二重ストローク描画可能な Fabric オブジェクト／`outline` 属性のシリアライズ／Undo 連携 | `Arrow extends Path` は単一ストロークのみ／`toObject/fromObject` はあり／Undo hook はあり | **Missing**（構造変更） | `Arrow extends Path` を `Arrow extends Group` へリファクタ必要 |
| **Req 25（テキスト白アウトライン）** | `IText` の stroke 設定／`paintFirst: 'stroke'`／`outline` 属性のシリアライズ | `IText` 初期化時に stroke 設定なし／`backgroundColor` のみ／`splitByGrapheme: true` 済み | **Missing**（プロパティ追加） | Fabric 7.3.1 の `paintFirst: 'stroke' + stroke + strokeUniform: true` で素直に実現可能 |
| **Req 26（デフォルトスタイル）** | ツール横断のトークン／白縁取りON初期値／初期色調整 | `DEFAULT_STYLE_OPTIONS` と各ツール内デフォルトが重複・不整合 | **Constraint**（整理必要） | 重複排除は機能改修の副次成果で実施する価値あり |
| **Req 27（タッチジェスチャー）** | ダブルタップ検出／長押し検出／コンテキストメニューUI／Req17 連携 | ダブルクリック（polygon確定用）のみ／長押しとコンテキストメニューは未実装 | **Missing**（新規UI＋新規ロジック） | `enablePointerEvents: true` + canvas レベルの `custom:dbltap`/`custom:longpress` emitter 化が推奨 |
| **Req 28（モバイルツールバー）** | `flexWrap` 対応／詳細属性パネルの開閉／ブレークポイント制御 | inline style + `overflowX: auto`、常時表示パネル | **Missing**（拡張） | TailwindCSS 統合（プロジェクト方針との整合）で一気に刷新するか、inline style のまま拡張するかの選択 |
| **Req 29（視覚フィードバック）** | ツール別カスタムカーソル／タッチ時ハンドル拡大／簡易ガイド／マルチタッチ中の抑止 | ハイライト・ツールヒントあり、残りは未実装 | **Missing**（設定追加） | `canvas.defaultCursor/hoverCursor/freeDrawingCursor` と `cornerSize/touchCornerSize` で対応可 |
| **Req 30（マルチタッチ安全性）** | 3本指以降の抑止／復帰クールダウン／Req17 連携 | 2本指まで定義、3本以上は未定義、誤動作の温床 | **Missing**（ロジック追加） | タッチ判定 state machine を `ImageViewer.tsx` に追加 |

### 2.1 複雑度シグナル

- **構造変更（重）**: Req 24（`Arrow extends Path` → `Group` へのリファクタ）
- **APIプロパティ追加（軽〜中）**: Req 25（paintFirst）、Req 29（cursor/cornerSize）、Req 26（トークン整理）
- **新規UIロジック（中）**: Req 27（dbltap/longpress カスタムイベント、コンテキストメニュー）、Req 28（responsive layout）
- **状態機械（中）**: Req 30（touch state machine）

### 2.2 Research Needed（設計フェーズに持ち越す調査事項）

- **R1**: Fabric v7 で `Arrow` を Group 化した場合の `objectCaching` と再描画パフォーマンス（高頻度描画時の挙動）。矢印の変形中ヒカツキが発生しないか要実測
- **R2**: `enablePointerEvents: true` へ切り替えた場合の `ImageViewer.tsx` 既存タッチ処理（1本指パン/2本指ピンチ）への副作用。既存挙動の回帰を避ける互換戦略
- **R3**: Fabric v7 の `toDataURL` で `paintFirst: 'stroke' + strokeUniform: true` の高解像度 multiplier 時レンダリング正確性
- **R4**: `Arrow` の Group 化マイグレーション戦略。過去データ（`type: 'arrow'` の Path 形式）と新データ（Group 形式）の両方を `classRegistry.setClass('arrow', ...)` で単一クラスが扱う場合のシリアライズ形（Group の子は Path として書き出し可能か、カスタムJSONに畳み込むか）
- **R5**: コンテキストメニューUIの既存デザイントークン・既存モーダル実装との整合性（プロジェクト内に既存のポップオーバー実装があるか）

## 3. Implementation Approach Options

### 3.1 Req 24（矢印の白縁取り）

#### Option A: 単一オブジェクト + shadow
- stroke + 白 shadow(blur=0) で二重表現
- **評価**: × 非推奨。`Object.mjs:358` の性能分岐、矢じり端部で shadow が不均一、Path の閉じていない形状で輪郭が崩れる

#### Option B: `Arrow extends Group`（白太線 Path + 本体 Path）（**推奨**）
- 既存 `generateArrowPath()` を流用、内部に 2 つの Path を保持
- `strokeLineCap: 'round'`、`strokeLineJoin: 'round'` で矢じりも綺麗に縁取られる
- トレードオフ: Arrow クラスをリファクタリング、`toObject/fromObject` 改修、既存データの後方互換対応
- ✅ 視認性 / 描画正確性 / Fabric 7 標準パス
- ❌ リファクタによる既存挙動のリグレッションリスク（ヒットテスト、リサイズハンドル、Dimension連携）

#### Option C: `paintFirst: 'stroke'` + 白 stroke
- **評価**: × Fabric の paintFirst は fill/stroke の順序切替のみ。二重ストロークは不可

**推奨**: **Option B**。後方互換は `outline` フィールド欠落時に従来表現フォールバックで対応可（Req 24 AC 9）。

### 3.2 Req 25（テキストの白アウトライン）

#### Option A: `paintFirst: 'stroke'` + stroke + strokeUniform（**推奨**）
- `Text.mjs:201-208` で stroke→fill の順序が保証される
- `splitByGrapheme: true`（既存設定）との互換性あり
- ✅ 数行の変更、既存Undo連携・保存系に自然に統合
- ❌ stroke 幅の外側だけを白にする UX が慣習的に期待される（Fabric は両側に半分ずつ描く）ため、見た目の微調整は design で要確認

#### Option B: テキスト背面に白い矩形 Path を重ねる Group 方式
- 背景色が矩形に限られる
- ✅ strokeUniform の微妙な表現差異を回避可
- ❌ 複雑化、フォントサイズ追従のロジックが追加で必要

**推奨**: **Option A**。白アウトライン幅は `strokeUniform: true` でズーム非依存に固定し、フォントサイズに対する比率調整は Req 25 AC 5 の仕様を JS 側で計算。

### 3.3 Req 26（デフォルトスタイル調整）

#### Option A: 既存の `DEFAULT_STYLE_OPTIONS` を拡張、ツール内デフォルトを撤去
- 単一の `AnnotationToolDefaults` トークン（色・線幅・白縁取り有無・フォントサイズ）を用意
- 各ツール内の `DEFAULT_*_OPTIONS` から色・線幅だけを参照に変更
- ✅ 重複排除、整合性向上
- ❌ 各ツールの既存呼び出しパターン変更が必要

#### Option B: 既存構造を維持し、白縁取り属性だけを各ツールに追加
- ✅ 最小変更
- ❌ 重複・不整合が残る（中期的に保守負債化）

**推奨**: **Option A**。Req 24/25 と同一 PR で実施すれば手戻りが少ない。

### 3.4 Req 27（タッチジェスチャー）

#### Option A: Fabric に閉じた拡張（canvas レベルの `custom:dbltap`/`custom:longpress` emitter）（**推奨**）
- `AnnotationEditor.tsx` 初期化時に canvas へ単一のジェスチャ判定ミドルウェアを追加
- 各ツールは既存の `mousedblclick` 受信と並列で `custom:dbltap` を受信
- コンテキストメニューは React コンポーネントとして `AnnotationEditor` の子として配置
- ✅ ツール側の変更量最小、既存mouse:dblclickフローとの互換
- ❌ `enablePointerEvents: true` への切替に伴う ImageViewer との副作用要検証（R2）

#### Option B: ImageViewer のタッチ state machine を拡張して判定
- ビューアがすべてのタッチを一元処理
- ✅ マルチタッチ安全性（Req 30）と自然に統合
- ❌ ツール本体と物理的に遠い位置でロジックが膨らみ、結合度が上がる

**推奨**: **Option A + Req 30 を共通の state machine** に統合し、Aが使う判定ロジックは ImageViewer 経由でも参照できるように薄い utility として切り出す。

### 3.5 Req 28（モバイルツールバーレイアウト）

#### Option A: inline style 拡張（`flexWrap`、属性パネル開閉）
- 最小変更で Req 28 AC 1-8 をカバー
- ✅ 既存style同居、段階導入容易
- ❌ TailwindCSS プロジェクト方針に逆行（長期保守性）

#### Option B: TailwindCSS への全面移行＋レスポンシブクラス適用
- ✅ プロジェクト全体のUI一貫性、ブレークポイント活用が明快
- ❌ 移行コストが高く、本要件の範囲を超える

**推奨**: **Option A**。Tailwind 全面移行は別スコープ。ただし、今回追加する箇所では Tailwind クラスを新規採用できるなら採用（hybrid 方針）。

### 3.6 Req 29（視覚フィードバック）

#### Option A: Fabric 標準プロパティ（`defaultCursor/hoverCursor/freeDrawingCursor`、`cornerSize/touchCornerSize`）による実装（**推奨**）
- メディアクエリ `(pointer: coarse)` でタッチ/マウスを分岐し、`FabricObject.ownDefaults.cornerSize = touch ? 20 : 13`、`touchCornerSize = touch ? 40 : 24` を設定
- ツール切替時に `canvas.defaultCursor = 'crosshair'` 等を更新
- 簡易ガイド・ツール別オーバーレイは React 層で実装
- ✅ Fabric 標準、実装コスト小
- ❌ カスタム画像カーソルは CSS `url()` 管理が必要

**推奨**: **Option A**。

### 3.7 Req 30（マルチタッチ安全性）

#### Option A: `ImageViewer.tsx` 側の touch state machine を拡張（**推奨**）
- `idle → 1-finger drawing → 2-finger pinch → N-finger suspend → cooldown → resume` の状態遷移を明示化
- ツール描画コミットは「単一指ドラッグ継続」を前提条件に
- ✅ 既存 touch ハンドラの直系拡張、責務がクリア
- ❌ AnnotationEditor 側の描画ロジックと同期する必要（コンセンサスを取るための薄い state ブリッジ）

#### Option B: AnnotationEditor 側で独立に判定
- ✅ ビューアを変更しない
- ❌ タッチイベントの発生源が複数になり、矛盾の温床に

**推奨**: **Option A**。Req 27 Option A の gesture emitter とタッチ state machine を同一の utility (`touchGestureManager.ts` 等) に集約。

## 4. 実装複雑度・リスク

| Req | Effort | Risk | 根拠 |
|---|---|---|---|
| Req 24: 矢印白縁取り | **M** (3-7d) | **Medium** | `Arrow extends Path → Group` の構造変更。シリアライズ、Dimensionとの連携、ハンドル挙動のリグレッション確認に工数 |
| Req 25: テキスト白アウトライン | **S** (1-3d) | **Low** | `paintFirst` + stroke の設定追加のみ。Undo/保存系は既存フロー流用 |
| Req 26: デフォルトスタイル | **S** (1-3d) | **Low** | 定数整理とトークン一元化。テスト影響は狭い |
| Req 27: タッチジェスチャー | **M** (3-7d) | **Medium** | `enablePointerEvents: true` 化の副作用検証（R2）、コンテキストメニューUIの新規実装 |
| Req 28: モバイルツールバー | **S-M** (2-5d) | **Low** | inline style の拡張。既存 overflowX:auto を残しつつ flexWrap と属性パネル開閉を追加 |
| Req 29: 視覚フィードバック | **S** (1-3d) | **Low** | Fabric 標準プロパティ設定とカーソル画像アセットの用意 |
| Req 30: マルチタッチ安全性 | **M** (3-7d) | **Medium** | State machine 追加、誤発火の復旧パス、Req17/Req27 との干渉検証 |
| **合計目安** | **L** (約2週間) | **Medium** | 全7要件を一連のPRで実施する場合 |

## 5. 設計フェーズへの引き継ぎ（Recommendations for Design）

### 5.1 Preferred Approach（総論）

- **コア方針**: **Option A 寄りハイブリッド**（Fabric 標準APIと既存アーキテクチャに沿って拡張）
  - Req 24: Group 化矢印
  - Req 25: `paintFirst: 'stroke'` テキスト
  - Req 26: デフォルト値トークンの一元化（Req 24/25 と同一PR）
  - Req 27+30: `ImageViewer` 配下に `touchGestureManager` を新設し、canvas-level `custom:dbltap`/`custom:longpress` と N-finger state machine を同居
  - Req 28: inline style 拡張（flexWrap、属性パネル開閉）、TailwindCSS 全面移行は別スコープ
  - Req 29: Fabric 標準プロパティ活用＋React オーバーレイで簡易ガイド

### 5.2 Key Decisions（設計で確定すべき論点）

1. **矢印のシリアライズ形**: Group 化した Arrow の `toObject` は（a）Group 子 Path を書き出す、（b）従来どおり `{startPoint, endPoint, stroke, strokeWidth, arrowheadSize, outline?}` に畳み込む、のいずれを採用するか。後者推奨（後方互換が自然）
2. **白縁取り幅の既定値**: Req 24 AC 2（本体線幅の 1.5 倍以上）の具体値。デザイン・視認性検証で確定
3. **`enablePointerEvents: true` 切替の採否と互換戦略**（R2）
4. **コンテキストメニューUIの実装技術**: 既存ポップオーバー/モーダルとの整合（R5）
5. **ハンドルサイズの既定値**: タッチ時 `cornerSize: 20 / touchCornerSize: 40` が妥当か、プロジェクトのデザインシステムに合わせて調整
6. **Req 26 のデフォルト色・線幅の具体値**: 赤系/オレンジ系の確定、初期線幅の確定（3px か 3.5px か 4px か）

### 5.3 Research Items to Carry Forward

- R1: Group 化 Arrow の `objectCaching` パフォーマンス実測
- R2: `enablePointerEvents: true` 切替の互換検証
- R3: `toDataURL` multiplier 時の `strokeUniform` テキスト正確性検証
- R4: `Arrow` Group 化のマイグレーション戦略
- R5: コンテキストメニューUIのデザイントークン整合

### 5.4 Out-of-Scope（本ギャップ分析では扱わない）

- 番号付きマーカー、ハイライター、ぼかし、トリミング、コピー貼付、曲線矢印（`discovery-addendum-2026-04-24.md` で Out of Scope 確定済み）
- TailwindCSS 全面移行（プロジェクトレベルの別スコープ）
- v6→v7 のコメント/tech.md 表記修正（今回のついで対応として軽微に実施可能）

## 6. 次のステップ

1. 本 research.md を入力として `/kiro-spec-design site-survey` を実行し、Boundary Commitments・データモデル・インターフェース・非機能方針を確定
2. 設計フェーズで R1-R5 の実測/調査を完了
3. その後 `/kiro-spec-tasks site-survey` でタスクを再生成（Req 24-30 を Requirement 1-23 と重複しないタスクID範囲で追加）

---

# Gap Analysis: site-survey Requirements 31-32（画像一括ZIPエクスポート・白縁取り対象の全形状拡張）

- **作成日**: 2026-05-29
- **対象要件**: `requirements.md` Requirement 31, 32
- **出典**:
  - Exploreサブエージェントによる既存実装の詳細調査（個別エクスポート、ZIPライブラリ有無、画像選択UI、白縁取り実装パターン）
  - 先行ギャップ分析（本ファイル前半: Req 24-30）の前提継承

## 1. Current State Investigation（現状把握）

### 1.1 個別画像エクスポート（Req 12）の現状アーキテクチャ

| レイヤ | 主要ファイル | 役割 |
|---|---|---|
| 設定UI | `frontend/src/components/site-surveys/ImageExportDialog.tsx` | 形式（JPEG/PNG）・解像度（低/中/高）・注釈含む/含まない・元画像そのままの選択ダイアログ |
| エクスポートサービス | `frontend/src/services/ExportService.ts:95-230` | `exportImage()`（Canvas → dataURL）、`downloadFile()`（Blob → createObjectURL → a.download）、`downloadOriginal()`（R2署名付きURLから fetch して blob 化）|
| 注釈レンダラ | `frontend/src/services/export/AnnotationRendererService.ts:86-216` | `renderImage()` 単一画像、`renderImages()` 複数画像順次レンダリング |
| PDF出力前例 | `frontend/src/services/export/PdfReportService.ts:402-813` | 複数画像を chunk して jsPDF に埋め込み（複数画像取り回しの参考実装）|

### 1.2 画像一覧の選択UI現状

- `frontend/src/components/site-surveys/SurveyImageGrid.tsx:1-180`
  - サムネイルグリッド表示と「上へ/下へ移動」「ドラッグ順序変更」「削除」「個別エクスポート」を実装
  - **チェックボックス／複数選択 UI は未実装**
- ストア層に画像複数選択用 state は存在しない

### 1.3 ZIP生成基盤の現状

- フロント `frontend/package.json:28-95`: ZIP関連ライブラリ未導入（jsPDF/xlsx はあり）
- バック `backend/package.json:48-92`: ZIP関連ライブラリ未導入
- 既存コードベースに ZIP 生成パスなし → 新規ライブラリ導入が必須

### 1.4 ダウンロード/進捗UIパターン

- ダウンロード: `ExportService.downloadFile()` の Blob + createObjectURL + a.download パターンが確立済み（一括ZIP も同関数を流用可）
- 進捗表示: `ImageExportDialog.tsx:183-195` の `isProcessing` フラグによる単純スピナーのみ。汎用トースト/プログレスバー実装は不在

### 1.5 既存の白縁取り実装（Req 24/25）パターン詳細

| ツール | 所在 | 属性名 | 実装パターン |
|---|---|---|---|
| Arrow | `frontend/src/components/site-surveys/tools/ArrowTool.ts:195-558` | `outline: ArrowOutlineAttribute { enabled, color, width }` | **Group 構造**: outlinePath（白・太）+ bodyPath（本体）の 2 つの Path を保持 |
| Text | `frontend/src/components/site-surveys/tools/TextTool.ts:233-354` | `textOutline: TextOutlineAttribute { enabled, widthRatio }` | **paintFirst='stroke'** + `stroke='#ffffff'` + `strokeWidth = fontSize × widthRatio` |
| トークン定義 | `frontend/src/components/site-surveys/annotation-style-tokens.ts:31-50, 105-121` | `ArrowOutlineAttribute`, `TextOutlineAttribute`, `ANNOTATION_DEFAULTS.arrowOutline/textOutline (enabled=true)` | 一元管理（Req 26 の成果として整備済み）|
| 復元機構 | `frontend/src/services/export/AnnotationRendererService.ts:156-193` | — | `enlivenObjects()` 経由で `toObject/fromObject` が自動的に outline 属性も復元 |

### 1.6 拡張対象 6 形状の現状

| ツール | 所在 | 現在の基底クラス | 白縁取り |
|---|---|---|---|
| Rectangle | `tools/RectangleTool.ts:1-100` | 標準 `Rect` | 未実装 |
| Circle | `tools/CircleTool.ts:100-300` | 標準 `Ellipse` | 未実装 |
| Polygon | `tools/PolygonTool.ts:101-378` | 標準 `Polygon` | 未実装 |
| Polyline | `tools/PolylineTool.ts:101-468` | 標準 `Polyline` | 未実装 |
| Freehand | `tools/FreehandTool.ts:103-520` | 標準 `Path` | 未実装 |
| Dimension | `tools/DimensionTool.ts:1-350` | `Path`（寸法線） + `FabricText`（寸法値ラベル）の複合 | 未実装 |

## 2. Requirements Feasibility Analysis（要件実現性評価）

### 2.1 Requirement-to-Asset Map

| Req | 必要資産 | 既存資産 | Gap 種別 | 備考 |
|---|---|---|---|---|
| **Req 31 #1-3, 16（起動・選択UI）** | 詳細画面の「全件/選択」エントリ、画像複数選択UI、選択状態管理、権限検証 | 詳細画面のグリッド・個別アクション、Req 14 のアクセス制御は既存 | **Missing**（UI・state 新規） | チェックボックス導入とストア拡張が必要 |
| **Req 31 #4-6, 17-18（設定UI・レンダリング）** | 既存設定UI・単一画像レンダリングを 1 つの設定で N 画像へ一括適用 | `ImageExportDialog`、`AnnotationRendererService.renderImages()` | **Constraint**（流用可） | ダイアログを「個別」「一括」両モード対応に拡張、または専用ダイアログを新設 |
| **Req 31 #7-9, 19（ZIPパッケージング）** | ZIPストリーム生成、ファイル名規則、中間生成物の破棄 | ZIPライブラリ未導入、命名規則の共通化なし | **Missing**（ライブラリ＋実装） | jszip 等の導入、命名規則の共通ユーティリティ化 |
| **Req 31 #10-12（進捗・キャンセル）** | 進捗UI（件数または割合）、キャンセル可能な処理制御 | 単純スピナーのみ、AbortController 系の前例も限定的 | **Missing**（UI・制御新規） | プログレスインジケータと中断可能な async ループ |
| **Req 31 #13-15（エラー・部分失敗・0件）** | 部分失敗時のユーザー選択フロー、0件時の中断、エラー集約 | 個別失敗のみハンドル | **Missing**（フロー新規） | 失敗集計→選択ダイアログ→再開/中止の状態機械 |
| **Req 32 #1-7, 9-10（6形状の白縁取り共通仕様）** | 各ツールへの outline 属性追加・描画ロジック・toObject/fromObject 拡張・Undo連携・後方互換 | Arrow が Group パターン、Text が paintFirst パターンの 2 系統を確立済み | **Missing**（6 ツールへ展開） | Group パターン優先（描画一貫性）。各ツールのカスタムクラス化・シリアライズ拡張が必要 |
| **Req 32 #8（出力経路の整合）** | サムネイル・プレビュー・PDF・個別/一括エクスポートで同一表現 | レンダラは `enlivenObjects` 経由のため、各ツールの `toObject/fromObject` を拡張すれば自動的に整合する | **Constraint** | 各ツールの拡張が完了すれば追加対応は最小 |
| **Req 32 #11, 13（既定値）** | 各ツール初期化時に outline 有効、`ANNOTATION_DEFAULTS` への追加 | `annotation-style-tokens.ts` のトークン枠組みは整備済み | **Constraint** | `rectangleOutline`/`circleOutline`/... トークン追加 + 統一型の検討 |
| **Req 32 #12（寸法値ラベル白アウトライン）** | 寸法値の `FabricText` に Req 25 と同等の `paintFirst='stroke'` 適用 | TextTool の paintFirst パターンが流用可 | **Constraint** | DimensionTool 内の `FabricText` 構築箇所への TextTool パターン適用 |
| **Req 32 #14（サムネイル再生成連動）** | 白縁取り変更を含む保存時にサムネイル再生成 | Req 23 のサムネイル再生成基盤が完成済み | **Constraint** | 追加配線不要（既存パイプラインに乗る）|

### 2.2 複雑度シグナル

- **新規ライブラリ導入＋パッケージング（中）**: Req 31 の jszip 導入と ZIP 生成サービス新設
- **複数選択UIと状態管理（中）**: Req 31 のチェックボックス UI、ストア拡張、全件/選択切替
- **6 ツールへの構造拡張（中〜重）**: Req 32 の Group 化または描画拡張を 6 ツール × 一貫した属性体系で実装
- **進捗・キャンセル・部分失敗フロー（中）**: Req 31 の async 制御と UX 設計

### 2.3 Research Needed（設計フェーズに持ち越す調査事項）

- **R6**: `jszip` 等のフロント側 ZIP ライブラリ採否と、画像枚数増（例: 100 枚 × 高解像度）時のクライアントメモリ上限。バック側 ZIP 生成（archiver + streaming）への切り替え閾値が必要か
- **R7**: 一括エクスポート中の Fabric Canvas 共有問題。`renderImages()` は単一の隠し Canvas を使い回す可能性があり、並列化不可・順次処理時の所要時間想定が必要
- **R8**: 「元画像そのまま出力」と「注釈含む」を同一 ZIP 内で混在させる要否（Req 31 #4 の「元画像そのまま」は択一設定の想定で要件化）。混在不要であれば実装単純化
- **R9**: ZIP 内ファイル名規則の確定（既存 `ExportService.ts` の個別出力命名 + 重複時のサフィックス規則）
- **R10**: 6 形状の白縁取りを Group パターン（Arrow と同様）と `_render` オーバーライドのいずれで実装するか。特に Freehand の高頻度 path 生成や Polygon/Polyline の頂点編集中のパフォーマンス
- **R11**: Dimension の寸法線と寸法値ラベル両方の白縁取り適用時のレイアウト（ラベル背景と白アウトラインの可読性、既存 Req 8/25 の background との競合）
- **R12**: 一括エクスポート中の中断可能性 — `renderImages()` ループに AbortController を組み込む粒度（画像単位/設定変換単位）

## 3. Implementation Approach Options

### 3.1 Req 31（一括ZIPエクスポート）

#### Option A: フロント完結（jszip でブラウザ側 ZIP 生成）（**推奨**）
- 構成: `bulkExportService.ts` 新設 → 対象画像を `renderImages()` で順次レンダリング → `JSZip` インスタンスに追加 → `generateAsync()` → 既存 `downloadFile()` で DL
- ✅ 既存レンダリング基盤・ダウンロード基盤の最大流用、バック側変更不要、サーバ負荷ゼロ
- ✅ Req 14（アクセス制御）は既存の画像取得 API が担保
- ❌ 大量画像時のクライアントメモリ消費（R6）。100 枚 × 高解像度で問題が出れば後段で Option C へ移行
- ❌ ブラウザを閉じると中断（要件で明示的に許容されている範囲）

#### Option B: バック完結（Fastify + archiver でストリーミング）
- 構成: 新規 API `POST /surveys/:id/images/export/bulk` → archiver で R2 から fetch して ZIP ストリーミング → ブラウザは a.download
- ✅ メモリ問題なし、巨大ファイル対応、複数ユーザーの並列実行に強い
- ❌ サーバ側で注釈レンダリング基盤（Canvas / 画像合成）を新規構築する必要があり、フロントの Fabric.js 依存ロジックを再実装することになる（コード重複・整合性リスク）
- ❌ R2 → サーバ → ブラウザの帯域経路を経由するため転送効率がフロント完結より劣る

#### Option C: ハイブリッド（閾値以下はフロント、閾値超はバックジョブ + 通知）
- 50 枚以下: Option A、50 枚超: バック非同期ジョブ + 完了通知 + 署名付きURL
- ✅ 規模に応じた最適化
- ❌ 実装複雑度大、本要件のスコープを超える

**推奨**: **Option A（フロント完結 jszip）**。R6 で枚数上限を確認し、想定運用（数十枚規模）に収まれば本方式で完結。閾値超ケースは Option C を将来拡張として保留。

### 3.2 Req 31 の画像選択 UI

#### Option A: `SurveyImageGrid` にチェックボックスを追加（**推奨**）
- 既存グリッドの各サムネイル左上にチェックボックスを表示、選択件数表示と「選択画像エクスポート」ボタンをツールバーへ追加
- ✅ 既存コンポーネントの自然な拡張
- ❌ 既存の「個別エクスポート」アクションとの UI 競合に注意（個別アクションメニューを維持）

#### Option B: 「選択モード」のトグル切替
- 明示的に選択モードに入ったときのみチェックボックスを表示
- ✅ デフォルト UI を変えない
- ❌ 操作ステップが 1 増える

**推奨**: **Option A**。チェックボックスをデフォルト表示し、「全件一括エクスポート」と「選択画像エクスポート」を併置するシンプルなフロー。

### 3.3 Req 31 の進捗・キャンセルUX

#### Option A: モーダル + プログレスバー + キャンセルボタン（**推奨**）
- `BulkExportProgressDialog`（新規）を `bulkExportService` の進捗 callback と連動
- 件数表示「3 / 12 件処理中」+ 割合バー + キャンセルボタン
- ✅ ユーザーに明示的なフィードバック、誤操作（タブ閉じ等）の抑止効果

#### Option B: トースト型の小型インジケータ
- 画面右下に小さく表示、バックグラウンド処理感を強調
- ❌ 汎用トースト実装が不在のため、結局 UI 部品を新設する必要がある

**推奨**: **Option A**。汎用トースト基盤がない現状ではモーダルが最短実装。

### 3.4 Req 32（6 形状の白縁取り）

#### Option A: Group パターン（Arrow と同じ方式を 6 ツールへ展開）（**推奨**）
- 各ツール = `outlinePath/outlineShape`（白・幅 × 1.5+）+ `bodyShape`（既存）を含む Group
- ✅ Arrow と統一的なアーキテクチャ、塗りつぶしあり形状（Rectangle/Circle/Polygon）でも自然
- ✅ `toObject/fromObject` の拡張パターンを Arrow から踏襲可能
- ❌ 6 ツール × 構造リファクタの工数大。リサイズ/形状変形ハンドル、Req 17（描画ツール使用中の選択防止）、Req 30（マルチタッチ）等の既存挙動の回帰確認が広範に必要

#### Option B: Fabric `_render` オーバーライド（描画時に stroke 2 回描画）
- 各ツールの `_render(ctx)` をオーバーライドし、`ctx.lineWidth = bodyWidth × 1.5; ctx.strokeStyle = 'white'; super._render(ctx);` を本体描画前に 1 回追加
- ✅ オブジェクト構造は単一のまま、シリアライズ拡張が最小
- ✅ ハンドル/ヒットテスト/既存挙動への影響が小さい
- ❌ Fabric 内部 API（`_render`）への依存、Fabric v8 以降のメジャー更新時の壊れやすさ
- ❌ Freehand の多数 segment、Polygon/Polyline の多頂点でのパフォーマンス再評価が必要（R10）
- ❌ Arrow が Group 方式である現状と実装パターンが分岐し、保守の認知負荷が増える

#### Option C: paintFirst による単一 stroke 切替
- ✅ 最小変更
- ❌ paintFirst は fill/stroke の順序切替のみで「二重 stroke」は実現不可。本要件には不適合

**推奨**: **Option A**（Group パターン統一）。短期的工数は B より大きいが、Arrow との実装一貫性、長期保守性、Fabric API 依存度の低さで優位。Dimension は Group 化の特殊ケースとして、寸法線部分に outline、寸法値ラベル部分に Req 25 と同等の paintFirst を適用するハイブリッド構造とする（Req 32 #12）。

### 3.5 Req 32 の属性体系

#### Option A: 共通型 `ShapeOutlineAttribute { enabled, color, width }` を annotation-style-tokens に追加（**推奨**）
- Arrow の `ArrowOutlineAttribute` と互換、各ツールは同型を保持
- `ANNOTATION_DEFAULTS` に `rectangleOutline`/`circleOutline`/... を追加（または `shapeOutline` 共通既定）
- ✅ Arrow との型整合、`enabled=true` 既定の Req 32 #11/13 を一箇所で管理

**推奨**: **Option A**。

## 4. 実装複雑度・リスク

| Req | Effort | Risk | 根拠 |
|---|---|---|---|
| Req 31: 一括ZIPエクスポート（フロント完結） | **M** (4-6d) | **Medium** | jszip 導入、`bulkExportService` 新設、`SurveyImageGrid` 選択UI、`BulkExportProgressDialog` 新規、Req 12 設定ダイアログの一括対応拡張、部分失敗・キャンセル・0件・権限の各フロー |
| Req 32: 6 形状の白縁取り（Group パターン展開） | **M-L** (5-9d) | **Medium** | 6 ツール × Group 化リファクタ、`toObject/fromObject` 拡張、`annotation-style-tokens` 拡張、Dimension の寸法値ラベル白アウトライン、Req 17/20/23/26/30 への回帰確認、後方互換（白縁取り属性欠落時の従来表現） |
| **合計目安** | **L** (約 2 週間) | **Medium** | Req 31/32 を一連の PR / 関連 PR で実施する場合 |

## 5. 設計フェーズへの引き継ぎ（Recommendations for Design）

### 5.1 Preferred Approach（総論）

- **Req 31**: フロント完結 jszip 方式（3.1 Option A）+ チェックボックスをデフォルト表示する選択UI（3.2 Option A）+ モーダル進捗（3.3 Option A）
- **Req 32**: Group パターン統一（3.4 Option A）+ 共通型 `ShapeOutlineAttribute`（3.5 Option A）。Dimension は Group + 寸法値ラベルの paintFirst のハイブリッド
- 既存 Req 12 の `ImageExportDialog` は「個別/一括」両モード対応へ拡張するか、`BulkExportDialog` を分離するかは設計で決定（再利用率とコード分離のトレードオフ）

### 5.2 Key Decisions（設計で確定すべき論点）

1. **ZIP ライブラリ選定**: `jszip` の最新版を採用するか。バンドルサイズ・gzip 対応・ストリーミング書込みの可否を確認（R6）
2. **クライアントメモリ閾値**: 一括処理可能な最大画像数の上限ガード（例: 100 枚で警告、200 枚で拒否）の方針
3. **ZIP 内ファイル名規則**: 画像順序番号プレフィックス、現場調査名、注釈含む/原本の区別を含めるか（R9）
4. **設定 UI の構造**: `ImageExportDialog` を「単一/一括」両対応に拡張 vs `BulkExportDialog` 新設
5. **進捗 UX の具体形**: 件数表示・割合バー・推定残り時間・キャンセル時の確認ダイアログの要否
6. **Group 化対象 6 ツールの toObject/fromObject 形式**: Arrow の踏襲方針（Group 子は内部 Path として書き出し、復元時に再構築）の確定
7. **`ShapeOutlineAttribute` 既定値**: `width` を本体線幅の何倍にするか（Req 32 #2 の「1.5 倍以上」の具体値）。Arrow の実値（`ANNOTATION_DEFAULTS.arrowOutline.width`）と整合
8. **Dimension の寸法値ラベル**: 既存背景色（Req 8 由来）との重畳順序、白アウトラインと背景色の併用可否
9. **既存白縁取り属性欠落時の挙動**: Arrow の後方互換実装（Req 24 #9）を 6 形状にも踏襲（Req 32 #9）

### 5.3 Research Items to Carry Forward

- R6: ZIP ライブラリの選定とクライアントメモリ上限実測
- R7: `renderImages()` の Canvas 共有制約とシリアル処理時間
- R8: 「元画像そのまま」と「注釈含む」の混在可否（要件解釈の確認）
- R9: ZIP 内ファイル名規則の確定
- R10: Group パターンでの 6 形状描画パフォーマンス（特に Freehand/Polygon）
- R11: Dimension の白縁取り + 寸法値ラベル白アウトラインのレイアウト/可読性
- R12: 一括エクスポートのキャンセル粒度（AbortController 適用箇所）

### 5.4 Out-of-Scope（本ギャップ分析では扱わない）

- 一括 PDF 単一ファイル出力（Req 11 の PDF 報告書スコープ維持、Req 31 では明示的に Out of Scope）
- バック側 ZIP ジョブ化・非同期化（R6 の実測結果次第で別スコープ）
- 白縁取り対象形状ごとの個別カスタマイズパラメータ化（Req 32 で明示的に Out of Scope）

## 6. 次のステップ

1. 本 research.md の Req 31/32 セクションを入力として `/kiro-spec-design site-survey` を実行し、Boundary Commitments・データモデル・インターフェース・非機能方針を追記
2. 設計フェーズで R6-R12 の実測/調査を完了（特に R6 メモリ上限、R10 描画パフォーマンスは早期に確認）
3. その後 `/kiro-spec-tasks site-survey` でタスクを再生成（Req 31/32 を Req 1-30 と重複しないタスクID範囲で追加）

---

# ギャップ分析: Req 33/34・Req 29.4改訂（スマホ注釈編集UXの業界標準準拠）

_作成: 2026-06-29 / 対象: Requirement 33（編集モードのピンチズーム・パンと描画の両立）、Requirement 34（編集モードのズーム操作手段・倍率表示）、Requirement 29.4 改訂（選択ハンドル44px）_

## 7. 現状調査（Current State）

### 7.1 実際の編集画面の構成
- 編集画面の本体は `frontend/src/components/site-surveys/AnnotationEditor.tsx`（2012行、Fabric.js v7）。`SiteSurveyImageViewerPage` が閲覧/編集の双方を `readOnly` 切替で本コンポーネントに描画（`initialZoom`/`initialRotation`/`initialPan` を受け取る）。
- `frontend/src/components/site-surveys/ImageViewer.tsx`（1721行）に**完成度の高いピンチズーム/2本指パン/中点ズーム/ホイール/キーボード操作**が実装済み。ただし参照元は barrel(`index.ts`)・Storybook・定数のみで、**編集ページからは未使用（実質デッドコード）**。

### 7.2 再利用可能な資産
| 資産 | 内容 | 再利用観点 |
|---|---|---|
| `ImageViewer.tsx` | `applyPinchZoom`(中点基準)、`applyPan`、`handleTouchStart/Move/End`、`setZoom`/`clampZoom`、`handleWheel`、keyboard pan/zoom、`setViewportTransform` 一式 | ロジック移植/共通化の最有力ソース |
| `gestures/touchGestureManager.ts` | Pointerベース FSM（idle/one-finger-down/drawing/two-finger-pinch-pan/three-plus-suspend/cooldown）。現状は**検出のみ**（`custom:dbltap`/`custom:longpress` 発火） | ズーム/パン/描画の「調停レイヤー」へ拡張する基盤 |
| `gestures/gesture-thresholds.ts` | DOUBLE_TAP/LONG_PRESS/COOLDOWN/DRAG_THRESHOLD 集約 | 閾値の単一情報源 |
| `image-viewer.constants.ts` | ZOOM/ROTATION/PAN/TOUCH 定数（MIN_ZOOM,MAX_ZOOM,WHEEL_ZOOM_FACTOR,PINCH_THRESHOLD 等） | 編集モードでも共用可能 |
| `annotation-visual-feedback.ts` | `configureHandleSizes()`（cornerSize 20/13・touchCornerSize 40/24） | 29.4の44px化の改修点 |
| Fabric.js v7 | `zoomToPoint(point, zoom)`、`setViewportTransform`、`isDrawingMode` | 中点ズーム・ビューポート制御の標準API |
| `e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts` | モバイル注釈ジェスチャーE2E（Req27-30） | Req33/34のE2E追加先 |
| vitest + @testing-library + axe-playwright | 単体/結合/a11yテスト基盤 | 新規ロジックの単体テスト＋44px a11y検証 |

## 8. Requirement-to-Asset マップ（ギャップタグ: Missing / Unknown / Constraint）

| 要件 | 必要な技術要素 | 既存資産 | ギャップ |
|---|---|---|---|
| 33.1 1本指=描画 | Fabric `isDrawingMode`/各Tool | AnnotationEditorに実装済み | OK |
| 33.2/33.3 2本指ピンチ＋中点ズーム | `zoomToPoint`/距離・中点算出 | ImageViewer `applyPinchZoom` | **Missing**（編集Canvasに未配線） |
| 33.4 2本指パン | viewportTransform 平行移動 | ImageViewer `applyPan` | **Missing**（編集Canvasに未配線） |
| 33.5 描画途中の2本指で描画中断→ズーム/パン | 多指検出と描画抑止の調停 | touchGestureManager(検出のみ) | **Missing**（調停未実装） |
| 33.6 拡大中も正確な座標で描画 | viewportズームと描画座標整合 | Fabric pointer変換 | **Unknown**（isDrawingMode×viewport×多指の整合検証要） |
| 33.7 ズーム/パン後の描画再開でビュー維持 | ビュー状態の保持 | ImageViewer lastPanPosition等 | **Missing**（編集側に状態保持なし） |
| 33.8 ダブルタップで拡大/全体トグル | dbltap→zoom切替 | dbltapは検出済み(テキスト編集用) | **Missing/Constraint**（既存dbltapはテキスト編集に割当。用途競合の解消要） |
| 33.9/33.10 ズーム範囲と操作体系の一貫性 | 閲覧/編集のジェスチャー共通化 | 二系統に分裂 | **Constraint**（ImageViewer=TouchEvent系／AnnotationEditor=Fabric+Pointer系） |
| 33.11/33.12 選択ツールでタッチ選択・移動 | Fabric selection/`object:moving` | AnnotationEditorに実装あり | **Unknown**（拡大中・タッチでの確実性検証要） |
| 33.13 描画ツール時の誤選択防止 | Req17維持 | 実装済み(selectable/evented制御) | OK |
| 34.1-34.4 ズームUI/倍率/Fit | ボタン・倍率表示・fit算出 | AnnotationToolbarに無し（回転/Undo/Redo/保存/Export のみ） | **Missing** |
| 34.5 ズームUI 44px | タッチターゲット | toolbar項目44px慣行あり | OK（適用要） |
| 34.6 下部・片手到達配置 | レイアウト | 既存ツールバーは上部 | **Missing**（配置設計要） |
| 34.7 等倍時はパン抑止 | MIN_PAN_ZOOM判定 | ImageViewer `isPanEnabled` | **Missing**（編集側未配線） |
| 29.4 ハンドル44px | `configureHandleSizes` 改修 | 現状20/13(+touch40/24) | **Missing**（44px化要） |

補足: `AnnotationEditor` の `initialZoom`/`initialPan`/`initialRotation` は**props宣言のみで本体未使用**（REQ-5.6のビュー状態共有が未実装）。

## 9. 実装アプローチ（Options）

### Option A: AnnotationEditor を直接拡張
ImageViewer のズーム/パン/タッチ処理を AnnotationEditor 内へ移植し、Fabric描画と内蔵調停する。
- ✅ 最短で致命的欠陥（拡大して描けない）を解消／既存ロジック流用
- ❌ 2012行の巨大コンポーネントがさらに肥大／二重実装（ImageViewer）は残存し一貫性(33.10)が未解決

### Option B: 共通ビューポート/ジェスチャー制御を新規モジュール化
`touchGestureManager` を「検出のみ」から「ズーム/パン/描画調停込み」へ拡張、または新規 `useCanvasViewport`/`viewportController` を新設し、AnnotationEditor と ImageViewer の双方が利用。
- ✅ 二重実装を構造的に解消し 33.9/33.10 の一貫性を満たす／単体テスト容易
- ❌ 初期コスト大／既存ImageViewer・AnnotationEditor双方の改修で回帰リスク

### Option C: ハイブリッド（推奨・段階導入）
- **フェーズ1**: AnnotationEditor に最小のズーム/パン＋2本指調停を実装（ImageViewerの`applyPinchZoom`/`applyPan`/距離・中点算出を流用）。← Req33の致命部（33.2-33.7）を即解消。
- **フェーズ2**: 29.4 ハンドル44px＋拡大中の選択/移動の確実化（33.11/33.12）。
- **フェーズ3**: ズームUI/倍率バッジ/Fit/下部配置/ダブルタップズーム（Req34, 33.8）。dbltap用途競合を整理。
- **フェーズ4**: 共通モジュールへ抽出して二重実装解消、ImageViewerの統合/廃止を判断（33.10の最終担保）。
- ✅ 早期に体感改善を出しつつ、最終的に保守性も確保／回帰を段階的に管理
- ❌ 段階間の一時的な実装重複を許容する必要

## 10. 工数・リスク

| 項目 | Effort | Risk | 根拠 |
|---|---|---|---|
| Req33 ジェスチャー両立（中核） | L | Medium | Fabric描画とビューポート制御の調停・多指安全性の回帰リスク。既存ImageViewerロジック流用で緩和 |
| Req34 ズームUI/倍率/Fit | M | Low | 既存ZOOM定数・setZoom流用、UI追加が中心 |
| Req29.4 ハンドル44px | S | Low | `configureHandleSizes` 定数改修＋a11y/E2E検証 |
| 二重実装の統一（Option C フェーズ4） | M〜L | Medium | 閲覧/編集双方に影響。設計判断（ImageViewer去就）次第 |

## 11. 設計フェーズへの申し送り

- **推奨アプローチ**: Option C（ハイブリッド・段階導入）。フェーズ1で致命的欠陥を即解消し、フェーズ4で一貫性(33.10)と保守性を回収。
- **主要設計判断**:
  1. ビューポート制御の所在（AnnotationEditor内蔵 vs 共通 `useCanvasViewport`/`viewportController`）
  2. `touchGestureManager` を調停レイヤーへ拡張するか、ビューポート制御は別hookに分離するか
  3. ImageViewer の去就（統合 / 廃止 / 当面併存）
  4. 保存座標系（canvasサイズ基準の `enlivenObjects` スケール復元）と viewportTransform ズームの分離維持（ズームは表示のみ・保存データ不変）
  5. 既存 dbltap（テキスト編集）と Req33.8 ダブルタップズームの用途競合の解消方針
  6. `readOnly`（閲覧）時のズーム/パン有効化方針（REQ-9.2 注釈表示との整合）
- **Research Needed**:
  - RN1: Fabric v7 で `isDrawingMode` 中の多指 PointerEvent 挙動と `touch-action: none`／`preventDefault` の境界（描画ブラシのポインタ専有と2本指検出の両立）
  - RN2: `zoomToPoint` と `setViewportTransform`／パン clamp（表示範囲制限）の相互作用
  - RN3: 拡大中の1本指描画の座標整合（viewport変換後の `getPointer` 精度）
  - RN4: 既存 `site-survey-annotation-mobile.spec.ts` のPlaywrightタッチ/ピンチ模擬の手法（Req33/34のE2E追加可否）

## 12. 次のステップ
1. 本セクション（Req33/34・29.4）を入力として `/kiro-spec-design site-survey` を実行し、Boundary Commitments・ビューポート制御の設計・dbltap競合解消・二重実装統一方針を追記
2. RN1-RN4 を設計フェーズで確認（特に RN1/RN3 は早期に技術検証）
3. その後 `/kiro-spec-tasks site-survey` でタスクを再生成（Req33/34 を既存タスクID範囲と重複しない範囲で追加、Option C のフェーズ順を反映）

## 13. 設計合成の結論（2026-06-29 設計フェーズ）

- **Generalization**: ズーム/パン/中点ズームは閲覧/編集共通の「ビューポート制御」能力 → `gestures/canvasViewportController.ts` に単一実装として一般化。閲覧/編集の両方が同コントローラを利用し二重実装を解消（Req 33.10）。
- **Build vs Adopt**: 新規ライブラリは採用せず、`ImageViewer.tsx` の実証済み算術（中点ピンチ・clampZoom・isPanEnabled）を抽出再利用＋Fabric標準 `zoomToPoint` を採用（tech.md「追加依存なし」に整合）。
- **Simplification**: 既存 `touchGestureManager` の FSM を流用し `two-finger-pinch-pan` に振る舞いを追加するのみ（新規状態機械を作らない）。React 状態は `useCanvasViewport` 1フックに集約。
- **重要決定**: ①ズームは `viewportTransform` 表示専用とし保存座標は不変（Req 9 後方互換）。②ダブルタップは対象がテキスト注釈なら編集（Req 27.1）、空き領域ならズームトグル（Req 33.8）で排他調停。③`ImageViewer` のコントローラ移行はフェーズ4（Req 33.10 最終担保、回帰時は保留可能）。
- **RN 解消方針**: RN1=canvasに`touch-action:none`＋2本目検出で`isDrawingMode`退避/ブラシ破棄。RN2=`zoomToPoint`後に`clampPan`。RN3=`getScenePoint`がviewport考慮のため追加変換不要（E2Eで担保）。RN4=Playwrightタッチ模擬手法はタスク着手時に確定。

---

# ギャップ分析: Requirement 35・36（スマートフォン表示崩れ是正）

作成日: 2026-07-08 / 対象: 新規 Requirement 35（現場調査詳細画面のスマホ表示最適化）・Requirement 36（画像編集エディタのモバイル表示領域最適化）。
本分析は実ブラウザ（iPhone SE 相当 375×667, Playwright）での再現確認に基づく。実測: 詳細画面 `scrollWidth=565`（横190pxはみ出し）、編集モード canvas 実寸 `100×100`。

## 1. 現状把握（既存資産）

### レスポンシブ基盤（再利用可能・確立済み）
- `frontend/src/hooks/useMediaQuery.ts`: `useMediaQuery(query): boolean`（`matchMedia`監視・SSR安全）。
- `frontend/src/utils/responsive.ts`: `MEDIA_QUERIES.isMobile = '(max-width: 767px)'`（Req 35/36 の「概ね768px未満」と一致）、`isSmallMobile='(max-width:479px)'` 等。`BREAKPOINTS.mobile=768`。
- `frontend/src/hooks/useResponsive.ts`: `{ isMobile, isSmallMobile, isTablet, ... }` を返すラッパー。
- 標準パターン（`SiteSurveyResponsiveView.tsx:355,402`）: `const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile)` で早期returnしモバイル専用表示に分岐。

### Requirement 35 対象（現場調査詳細画面）
- `components/site-surveys/PhotoManagementPanel.tsx`（1210行, インライン`styles`）: `panelItem`(93, `display:flex`横並び) / `imageSection`(102, **`flexShrink:0, width:'320px'`固定**) / `metadataSection`(140, `flex:1`) / `textarea`(178, **`fontSize:'14px'`**)。**`useMediaQuery`/`isMobile` 未使用**。
- 条件分岐スタイルの確立パターンあり: `panelItemStyle = {...styles.panelItem, ...(isDragging?...:{}) }`(574-577), `{...styles.textarea, ...(commentError?...:{})}`(733) → **spread合成で `isMobile` 分岐を差し込み可能**。
- `pages/SiteSurveyDetailPage.tsx`（インライン`styles`, `maxWidth:'1200px'`）も `isMobile` 未使用。

### Requirement 36 対象（画像編集・閲覧）
- `pages/SiteSurveyImageViewerPage.tsx`: `editorContainer.height='calc(100vh - 200px)'`(**142**), `minHeight:500`(143)。AnnotationEditor を内包(316)。
- `components/site-surveys/AnnotationEditor.tsx`（2318行）: フィット計算 `scale = Math.min(maxW/imgW, maxH/imgH, 1)`(**678**) → `canvas.setDimensions({width:scaledWidth,...})`(**710**)。回転時 setDimensions(1821)。
- `components/site-surveys/ImageViewer.tsx`（1687行）: 同じ `Math.min(...,1)`(**1194**) → setDimensions(1202)。
- `components/site-surveys/AnnotationToolbar.tsx`: `flexWrap:'wrap' + overflowX:'auto'`(80-88), ボタン `minWidth/Height:44px`(180-181, Req28.3済)。AnnotationEditor の flex column 内で**画像領域の上に積層**（`toolbarContainer` zIndex20 → その下 `container` flex:1）。高さは折返し量で可変。

## 2. Requirement→資産マップ（ギャップ種別: Missing / Constraint）

| 受入基準 | 既存資産 | ギャップ |
|---|---|---|
| 35.1 縦積み / 35.3 写真幅可変 | `panelItem`横並び+`imageSection`320px固定 | **Missing**: `isMobile`分岐で`flexDirection:'column'`・`width:'100%'`・`metadataSection`に`minWidth:0`追加 |
| 35.2 / 36.6 水平はみ出し不発生 | 分岐なし（現状190pxはみ出し） | **Missing**: 上記レイアウト修正で解消。E2Eアサート未整備 |
| 35.4 入力16px以上 | `textarea fontSize:'14px'` | **Missing**: 16px化（他入力欄も点検） |
| 35.5 / 36系 44pxタッチ | Req28で一部44px(ツールバー)、詳細画面の並替/削除/チェックは未点検 | **Constraint/Missing**: 詳細画面の操作要素サイズ点検・調整 |
| 36.1 フィット / 36.2 小画像も拡大 | `Math.min(...,1)`で拡大頭打ち | **Missing**: モバイルで上限`1`を緩和しフィット倍率まで拡大 |
| 36.3 作業領域短辺≥画面短辺50% | ツールバー折返しで圧迫、下限規定なし | **Missing**: ツールバー占有抑制＋領域算出見直し |
| 36.4 高さの動的VP追従 | `calc(100vh-200px)`、**svh/dvh未使用(全社0件)**、**ResizeObserver無し**（フィットは画像ロード/回転時のみ再計算、resizeは`calcOffset`のみ 1710） | **Missing**: `svh`基準化＋`ResizeObserver`で再フィット |
| 36.5 ツールバー占有抑制 | flexWrapで多段化 | **Missing**: モバイルで単段横スクロール/集約など |
| 36.7 ヘッダー/パンくず重なり | `breadcrumbContainer overflowX:'auto'`(43)は既存、重畳は残存 | **Constraint**: sticky/z-index調整 |
| 35.6/35.7/36.8 既存挙動維持 | Req10・Req33/34の実装 | **Constraint**: 回帰防止（保存/未保存管理・ズーム/パン/回転の座標系） |

## 3. 実装アプローチ（A/B/C）

### Requirement 35（詳細画面） — 推奨: **Option A（既存拡張）**
- `PhotoManagementPanel.tsx` / `SiteSurveyDetailPage.tsx` に `useMediaQuery(MEDIA_QUERIES.isMobile)` を導入し、確立済みspread合成で `panelItemMobile`(縦積み)・`imageSectionMobile`(100%)・`metadataSectionMobile`(minWidth:0)・`textarea`の16px化を追加。
- ✅ 既存パターン踏襲・最小差分・複雑な写真パネルロジック(1210行)を複製しない。 ❌ インラインstyle分岐が増える。
- Option B（`SiteSurveyResponsiveView`同様にモバイル専用コンポーネント新設）は、ドラッグ並替・保存・未保存管理を二重実装するため非推奨。

### Requirement 36（編集エディタ） — 推奨: **Option C（ハイブリッド）**
- 拡張: `AnnotationEditor.tsx`(678,710) / `ImageViewer.tsx`(1194,1202) のフィット計算でモバイル時の`1`上限を緩和、`SiteSurveyImageViewerPage.tsx:142` を `svh`基準（`vh`フォールバック付き）へ。
- 新設(小): 「コンテナ実寸監視→再フィット」を担う共有フック（例 `useContainerFit`/`ResizeObserver`ラッパ）を1つ導入し、AnnotationEditor/ImageViewer双方から利用（重複算術の集約）。
- ツールバー(36.5): `AnnotationToolbar` にモバイル単段横スクロール等のレイアウトを追加。
- ✅ 実証済み算術を活かしつつ再フィット漏れ(ResizeObserver欠如)を根本解消。 ❌ Req33/34（ズーム/パン/回転の座標系・view-state共有）への回帰リスクがあり結合テスト必須。

## 4. 工数・リスク

- **Requirement 35**: Effort **S–M**（インラインstyle分岐＋入力16px＋タッチ点検＋E2E）。Risk **Low**（既存レスポンシブ基盤・分岐パターンをそのまま利用、機能挙動は不変）。
- **Requirement 36**: Effort **M**（フィット計算改修＋ResizeObserver＋svh＋ツールバー）。Risk **Medium**（`Math.min`緩和と再フィットがReq33/34のズーム倍率・パン位置・回転座標系、Req9保存座標不変と競合しないことの担保が必要）。

## 5. 設計フェーズへの申し送り

**優先方針**: 35=Option A、36=Option C。ブレークポイントは既存 `MEDIA_QUERIES.isMobile`(767px) に統一。

**Research Needed（設計で確定）**:
- RN-a: `svh`/`dvh` の採用単位（`svh`基準＋`vh`フォールバック）と、`ResizeObserver` 再フィット時に**現在のズーム倍率・パン位置・描画中状態を保持**する条件（Req33/34整合）。
- RN-b: 36.3「作業領域短辺≥画面短辺50%」を満たすためのツールバー高さ上限/レイアウト（単段横スクロール vs 折りたたみ）。実測で50%達成可否を検証。
- RN-c: `Math.min(...,1)` 緩和のスコープ（モバイル限定か全幅共通か）。デスクトップ挙動維持(35.7相当)との切り分け。
- RN-d: E2E方式 — `playwright.config.ts` は現状 `chromium` 単一で **mobileプロジェクト無し**。既存慣習（各testで`newContext({viewport})`/`setViewportSize`）を踏襲しつつ、**`scrollWidth<=innerWidth`（横はみ出し）・作業領域短辺・入力`font-size>=16`・44pxタッチ** の直接アサートを追加（現状は下端チェックのみ）。`site-survey-responsive.spec.ts`・`site-survey-annotation-mobile.spec.ts` を拡張。

