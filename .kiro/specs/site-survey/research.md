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
