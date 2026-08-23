/**
 * @fileoverview 注釈エディタ基盤コンポーネント
 *
 * Task 13.1: Fabric.js Canvas統合を実装する
 * Task 13.2: ツール切り替えUIを実装する
 * Task 13.3: オブジェクト選択・操作機能を実装する
 *
 * useRef + useEffectによるCanvas初期化、dispose処理の実装（クリーンアップ）、
 * 背景画像の設定、ツールバー統合、オブジェクト選択・移動・リサイズ・削除機能を行うコンポーネントです。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 6.4: 既存の寸法線をクリックすると寸法線を選択状態にして編集可能にする
 * - 6.5: 寸法線の端点をドラッグすると寸法線の位置を調整する
 * - 6.6: 選択中の寸法線を削除すると寸法線を画像から除去する
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 * - 7.7: 既存の図形をクリックすると図形を選択状態にして編集可能にする
 * - 7.8: 選択中の図形をドラッグすると図形の位置を移動する
 * - 7.9: 選択中の図形のハンドルをドラッグすると図形のサイズを変更する
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 *
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-27.2
 * @requirement site-survey/REQ-27.3
 * @requirement site-survey/REQ-27.4
 * @requirement site-survey/REQ-27.5
 * @requirement site-survey/REQ-27.7
 * @requirement site-survey/REQ-27.8
 * @requirement site-survey/REQ-27.9
 * @requirement site-survey/REQ-27.10
 * @requirement site-survey/REQ-29.1
 * @requirement site-survey/REQ-29.2
 * @requirement site-survey/REQ-29.4
 * @requirement site-survey/REQ-29.5
 * @requirement site-survey/REQ-29.7
 * @requirement site-survey/REQ-29.8
 * @requirement site-survey/REQ-30.1
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-24.10
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-25.11
 * @requirement site-survey/REQ-32.5
 * @requirement site-survey/REQ-32.10
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Canvas as FabricCanvas,
  FabricImage,
  FabricObject,
  Polyline,
  type TPointerEventInfo,
  type TPointerEvent,
} from 'fabric';
import AnnotationToolbar, {
  type ToolType,
  type StyleOptions,
  type OutlineCapableTool,
} from './AnnotationToolbar';
// Task 115.60 (Req 26.1, 26.5): 既定スタイルは一元管理の資材から供給する。
// 本画面で局所に宣言すると中央の値を影で覆い、実際に描かれる注釈が中央の意図と食い違う。
import { DEFAULT_STYLE_OPTIONS } from './annotation-toolbar.constants';
// Task 115.96 (Req 25.2, 32.5): 白アウトラインの幅比率など、切替以外の既定は
// 一元管理の資材から引く（切替のためにここで別の既定値を持たない）。
import { ANNOTATION_DEFAULTS } from './annotation-style-tokens';
// Task 115.73 (Req 32.2): 復元時の表示倍率は座標系ごとに適用先が異なる。
// 集合体へ複写された線幅は実描画から導出し直す（詳細は annotation-restore-scale.ts）。
import { resolveRestoredStrokeWidth } from './annotation-restore-scale';
import { AnnotationContextMenu, type ContextMenuAction } from './AnnotationContextMenu';
import { AnnotationGuide } from './AnnotationGuide';
import { GUIDE_IDLE_MS, COOLDOWN_MS } from './gestures/gesture-thresholds';
import { createArrow } from './tools/ArrowTool';
import { createCircle } from './tools/CircleTool';
import { createRectangle } from './tools/RectangleTool';
import { PolygonBuilder, createPolygon } from './tools/PolygonTool';
import { PolylineBuilder, createPolyline } from './tools/PolylineTool';
import { DEFAULT_FREEHAND_OPTIONS, createFreehandBrush, FreehandBrush } from './tools/FreehandTool';
import { createDimensionLine, type DimensionLine } from './tools/DimensionTool';
import DimensionValueInput from './tools/DimensionValueInput';
import { createTextAnnotation } from './tools/TextTool';
import { UndoManager } from '../../services/UndoManager';
import { useFabricUndoIntegration } from '../../hooks/useFabricUndoIntegration';
import {
  saveAnnotation,
  getAnnotation,
  updateAnnotatedThumbnail,
  deleteAnnotatedThumbnail,
  exportAnnotationJson,
} from '../../api/survey-annotations';
import { ApiError } from '../../api/client';
import { exportImage, downloadFile, downloadOriginalImage } from '../../services/ExportService';
import { useToast } from '../../hooks/useToast';
import ImageExportDialog from './ImageExportDialog';
import type { ExportOptions } from './ImageExportDialog';
import type { SurveyImageInfo } from '../../types/site-survey.types';
import { util } from 'fabric';
// カスタムシェイプをFabric.jsクラスレジストリに登録（enlivenObjectsで復元するために必要）
import './tools/registerCustomShapes';
// Task 72.1: タッチジェスチャー統合 (Req 27.1, 27.2, 30.1) とハンドルサイズ設定 (Req 29.4, 29.5)
import { createTouchGestureManager } from './gestures/touchGestureManager';
import type { GesturePayload } from './gestures/touchGestureManager';
import { configureHandleSizes, applyToolCursor } from './annotation-visual-feedback';
// Task 96.1: ビューポート制御（ズーム/パン）の React 橋渡しフックとズーム操作UI (Req 33.9, 34.1, 34.2, 34.8)
import { useCanvasViewport } from '../../hooks/useCanvasViewport';
import type { FabricCanvasLike } from './gestures/canvasViewportController';
import ZoomControls from './ZoomControls';
// Task 101.1 (Req 36.1, 36.2, 36.4): フィット倍率算出の一元化・コンテナ実寸購読・モバイル判定。
// フィット計算は computeFitScale（原寸頭打ち/拡大許容を allowUpscale で制御）へ移行し、
// useElementSize でコンテナ実寸の変化に追従して再フィットする。
import { computeFitScale } from '../../utils/imageFitScale';
// Task 115.81 (Req 15.4, 15.5, 15.7-15.10): 自動保存・復元基盤の画面結線。
// design.md「AutoSaveManager」の Dependencies が Inbound: AnnotationEditor と定めるため、
// 基盤の生成・購読・UI 表示はいずれも本コンポーネントが担う。
import { AutoSaveManager } from '../../services/AutoSaveManager';
import type { AnnotationData as AnnotationDraftData } from '../../services/AutoSaveManager';
import { isLocalStorageAvailable } from '../../utils/storage-error';
import { useAnnotationRestoration } from '../../hooks/useAnnotationRestoration';
import RestoreAnnotationDialog from '../site-survey/RestoreAnnotationDialog';
import StorageWarningBanner from './StorageWarningBanner';
import type { StorageWarningType } from './StorageWarningBanner';
// Task 115.105 (Req 15.6): 通信断の告知とサーバー保存の抑止。
// design.md「ネットワーク状態管理フロー」の Key Decisions が
// 「ネットワーク切断時は警告を表示し、サーバー保存をブロック」「localStorage への一時保存は継続」
// と定めるため、告知は NetworkStatusIndicator、抑止は useNetworkStatus の canSave が担う。
import NetworkStatusIndicator from '../NetworkStatusIndicator';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import useElementSize from '../../hooks/useElementSize';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';

// windowオブジェクトにFabricキャンバスを公開するための型拡張（E2Eテスト用）
declare global {
  interface Window {
    __fabricCanvas?: FabricCanvas | null;
  }
}

/**
 * 復元した注釈オブジェクトへ表示倍率と操作可否を適用してキャンバスへ追加する
 *
 * サーバー保存済み注釈の復元（Req 9.2）とローカル下書きの復元（Req 15.5）で同じ変換を使う。
 * 二重実装にすると倍率適用先（Task 115.73, Req 32.2）の是正が片側にしか効かないため共有する。
 *
 * @param canvas 対象キャンバス
 * @param enlivenedObjects `util.enlivenObjects` で実体化済みのオブジェクト
 * @param savedCanvasWidth 保存時のキャンバス幅（不明なら倍率1）
 * @param savedCanvasHeight 保存時のキャンバス高さ（不明なら倍率1）
 * @param interactive 選択・操作を許可するか
 * @returns 適用した倍率と追加件数
 */
function addRestoredAnnotationObjects(
  canvas: FabricCanvas,
  enlivenedObjects: unknown[],
  savedCanvasWidth: number | undefined,
  savedCanvasHeight: number | undefined,
  interactive: boolean
): { addedCount: number; scaleX: number; scaleY: number; needsScaling: boolean } {
  const currentCanvasWidth = canvas.getWidth();
  const currentCanvasHeight = canvas.getHeight();
  const scaleX =
    savedCanvasWidth && savedCanvasWidth > 0 ? currentCanvasWidth / savedCanvasWidth : 1;
  const scaleY =
    savedCanvasHeight && savedCanvasHeight > 0 ? currentCanvasHeight / savedCanvasHeight : 1;
  const needsScaling = scaleX !== 1 || scaleY !== 1;
  const avgScale = (scaleX + scaleY) / 2;

  let addedCount = 0;

  enlivenedObjects.forEach((obj) => {
    // FabricObjectであることを確認
    if (obj && typeof obj === 'object' && 'set' in obj && 'type' in obj) {
      const fabricObj = obj as FabricObject;

      // スケール変換が必要な場合は適用
      if (needsScaling) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objAny = fabricObj as any;
        const left = objAny.left ?? 0;
        const top = objAny.top ?? 0;
        fabricObj.set({
          left: left * scaleX,
          top: top * scaleY,
          scaleX: (objAny.scaleX ?? 1) * scaleX,
          scaleY: (objAny.scaleY ?? 1) * scaleY,
        });

        // ストローク幅の解決（Task 115.73, Req 32.2）
        // 集合体（Group）の注釈は実描画を子が保持し、表示倍率は上の scaleX/scaleY
        // 経由で子へ伝搬する。集合体自身の strokeWidth は子から複写された後方互換用の
        // 値であり、ここへ重ねて倍率を掛けると複写元（実描画）と座標系が食い違う。
        // resolveRestoredStrokeWidth は集合体なら実描画から導出し直し、集合体でない
        // 注釈（テキストの白アウトラインは strokeUniform のため拡大率が線幅へ伝搬
        // しない）は従来どおり平均倍率を掛ける。
        if (objAny.strokeWidth) {
          fabricObj.set({
            strokeWidth: resolveRestoredStrokeWidth(fabricObj, objAny.strokeWidth, avgScale),
          });
        }
      }

      // 閲覧モードでは選択不可、それ以外は選択ツールの場合のみ選択可能
      fabricObj.set({
        selectable: interactive,
        evented: interactive,
      });
      canvas.add(fabricObj);
      addedCount += 1;
    }
  });

  return { addedCount, scaleX, scaleY, needsScaling };
}

/**
 * ドラッグ状態を管理する型
 */
interface DragState {
  isDragging: boolean;
  startPoint: { x: number; y: number } | null;
}

// ============================================================================
// 型定義
// ============================================================================

/**
 * Task 96.3 (Req 33.8): 空き領域ダブルタップによるズームトグルの拡大倍率。
 * 等倍（フィット）状態でダブルタップした際に当該タップ点を中心へこの倍率で拡大する。
 */
const DOUBLE_TAP_ZOOM_SCALE = 2;

/**
 * Task 96.3 (Req 33.8): ダブルタップズームトグルで「等倍（フィット）相当」とみなす許容差。
 * 現在ズームが `1 + この値` 以下なら拡大、超えていれば fit() で全体表示へ戻す。
 */
const DOUBLE_TAP_ZOOM_EPSILON = 0.01;

/**
 * Task 101.1 (Req 33.7, 36.8): 再フィット時に「等倍表示中（＝初期化状態）」とみなすズーム許容誤差。
 * これを超えるズーム/パン中はユーザーの表示状態を保持し、再フィット（キャンバス寸法の再計算・
 * viewport の恒等リセット）を適用しない。design.md「再フィットフロー」Key decisions を参照。
 */
const REFIT_IDENTITY_ZOOM_EPSILON = 0.01;

/**
 * Task 96.3 / 115.47 (Req 27.1, 27.2, 27.9, 27.10, 33.8):
 * ジェスチャー通知（`custom:dbltap` / `custom:longpress`）の座標から実対象を解決する。
 *
 * `GesturePayload` は操作対象を持たない（Task 115.49 で使われない宣言を除去済み）。
 * `touchGestureManager.buildPayload` は対象を設定せず、Fabric の `canvas.fire` も
 * カスタムイベントに `target` を付与しないため、通知から対象を読む実装は必ず空振りする。
 * 対象は通知の clientX/clientY から Fabric の実ヒットテストで解決しなければならない。
 *
 * Fabric v7 の `findTarget` は clientX/clientY を持つイベント様オブジェクトから
 * `getScenePoint` 経由で対象を解決し、`{ target?, subTargets, ... }` を返す。
 *
 * ダブルタップ側と長押し側で判定を二重に持たないよう、両者はこの 1 箇所を共用する。
 */
const resolveGestureTarget = (
  canvas: FabricCanvas,
  payload: GesturePayload
): FabricObject | undefined => {
  const eventLike = {
    clientX: payload.clientX,
    clientY: payload.clientY,
  } as unknown as TPointerEvent;
  return canvas.findTarget(eventLike).target;
};

/**
 * AnnotationEditorの状態
 */
interface AnnotationEditorState {
  /** 読み込み中フラグ */
  isLoading: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** 現在選択中のツール */
  activeTool: ToolType;
  /** スタイルオプション */
  styleOptions: StyleOptions;
  /** Undo可能かどうか */
  canUndo: boolean;
  /** Redo可能かどうか */
  canRedo: boolean;
  /** 保存中フラグ */
  isSaving: boolean;
  /** 保存成功メッセージ */
  saveSuccess: boolean;
  /**
   * 直近の誤りが保存の失敗によるものか（Req 9.5）
   *
   * Task 115.102: 誤りの表示は以前からあったが、やり直す手段が無かった。
   * 保存の失敗のときだけ再試行の導線を出すため、誤りの出所を区別する。
   */
  saveFailed: boolean;
  /** 背景画像の回転角度 */
  imageRotation: 0 | 90 | 180 | 270;
  /**
   * 詳細属性パネル（スタイルパネル）を開いているか（Req 28.8）
   *
   * 選択中ツールの再タップで反転する。ツールを切替えたときは開いた状態へ戻す。
   */
  isStylePanelVisible: boolean;
}

/**
 * AnnotationEditorのProps
 */
export interface AnnotationEditorProps {
  /** 表示する画像のURL */
  imageUrl: string;
  /** 画像ID */
  imageId: string;
  /** 調査ID */
  surveyId: string;
  /** 初期ズーム値（REQ-5.6: ビューアとの状態共有用） */
  initialZoom?: number;
  /** 初期回転角度（REQ-5.6: ビューアとの状態共有用） */
  initialRotation?: number;
  /** 初期パン位置（REQ-5.6: ビューアとの状態共有用） */
  initialPan?: { x: number; y: number };
  /**
   * 表示状態（ズーム・回転・位置）の変化通知（REQ-5.6）。
   *
   * Task 115.83: 閲覧モードと編集モードの切り替えでは canvas を作り直すため、
   * 表示状態は本コンポーネントの外（ホスト画面）が保持しなければ共有が成立しない。
   * 変化のたびに最新値を通知し、ホストが `initialZoom` / `initialRotation` /
   * `initialPan` として次のモードへ渡し戻す。
   */
  onViewStateChange?: (state: {
    zoom: number;
    rotation: number;
    pan: { x: number; y: number };
  }) => void;
  /** 閲覧専用モード（REQ-9.2: 注釈を表示するが編集は不可） */
  readOnly?: boolean;
  /** 画像情報（ImageExportDialog用、REQ-12.2, 12.3, 12.4） */
  imageInfo?: SurveyImageInfo;
  /** 注釈保存成功時のコールバック（REQ-23.5: サムネイルURL反映用） */
  onAnnotationSaved?: (result: { annotatedThumbnailUrl: string | null }) => void;
  /** 画像一覧の強制再取得コールバック（REQ-23.6: サムネイル再生成失敗時の旧状態残留防止） */
  onRequestRefresh?: () => void;
  /**
   * 未保存の編集の有無の変化通知（REQ-9.3）
   *
   * Task 115.102: 離脱を捕捉する仕組み（`useBlocker` / `beforeunload`）は画面（ルート）側に
   * 置く必要があるため、未保存かどうかの判定だけを本コンポーネントが担い、離脱の確認は
   * ホスト画面が行う。読み込み・復元由来の変更は未保存として数えない。
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

/**
 * Task 115.82 (Req 6.2): ポインタイベントからクライアント座標（ビューポート基準）を取り出す。
 *
 * 寸法値入力欄は position: fixed の重ね合わせ層へ配置するため、キャンバス内部座標ではなく
 * ビューポート基準の座標が要る。マウス／ペンは event 自身が、タッチは changedTouches が持つ。
 *
 * @param event Fabric から渡される元の DOM イベント
 * @returns クライアント座標。取り出せない場合は null
 */
function resolveClientPoint(event: TPointerEvent | undefined): { x: number; y: number } | null {
  if (!event) {
    return null;
  }
  const mouseLike = event as { clientX?: number; clientY?: number };
  if (typeof mouseLike.clientX === 'number' && typeof mouseLike.clientY === 'number') {
    return { x: mouseLike.clientX, y: mouseLike.clientY };
  }
  const touchLike = event as { changedTouches?: ArrayLike<{ clientX: number; clientY: number }> };
  const touch = touchLike.changedTouches?.[0];
  if (touch) {
    return { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

/**
 * Task 115.82 (Req 6.2): 寸法値入力欄が最初に示す単位。
 *
 * `DimensionValueInput` が選べる単位（mm / cm / m）の先頭に合わせる。
 */
const DEFAULT_DIMENSION_UNIT = 'mm';

const STYLES = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
  },
  toolbarContainer: {
    padding: '8px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    zIndex: 20,
  },
  // Task 115.81 (Req 15.8, 15.9): ストレージ警告帯の配置。ツールバーの直上に置き、
  // 「今すぐ保存」への導線が編集領域を覆わないようにする。
  storageWarningContainer: {
    padding: '8px',
    backgroundColor: '#ffffff',
    zIndex: 21,
  },
  // Task 115.105 (Req 15.6): 通信状態の告知帯。ストレージ警告帯と同じくツールバーの直上に置く。
  networkStatusContainer: {
    padding: '8px',
    backgroundColor: '#ffffff',
    zIndex: 21,
  },
  container: {
    position: 'relative' as const,
    flex: 1,
    width: '100%',
    minHeight: '400px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Task 115.82 (Req 6.2): 寸法値入力欄を載せる重ね合わせ層。
  // キャンバス要素の DOM は Fabric が所有するため、その内側へ React で描画せず
  // ビューポート基準の固定層に置く（AnnotationContextMenu と同じ方式）。
  // 層自体はポインタを透過させ、入力欄だけが操作を受け取る。
  dimensionInputOverlay: {
    position: 'fixed' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex: 1000,
  },
  dimensionInputAnchor: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    pointerEvents: 'auto' as const,
  },
  canvasWrapper: {
    position: 'relative' as const,
    // Task 96.2 (Req 33.5, 30.1): ブラウザ既定のタッチジェスチャー（スクロール/ピンチズーム等）を
    // 抑止し、touchGestureManager の PointerEvent ベース調停にジェスチャーを一本化する。
    touchAction: 'none' as const,
  },
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 10,
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(0, 0, 0, 0.1)',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorContainer: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    zIndex: 10,
  },
  errorMessage: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px 24px',
    color: '#991b1b',
    textAlign: 'center' as const,
    maxWidth: '400px',
  },
  // Req 9.5: 保存に失敗したとき、同じ操作をやり直すための導線
  errorRetryButton: {
    marginTop: '12px',
    padding: '8px 20px',
    border: '1px solid #991b1b',
    borderRadius: '6px',
    backgroundColor: '#991b1b',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorRetryButtonDisabled: {
    backgroundColor: '#6b7280',
    borderColor: '#6b7280',
    cursor: 'not-allowed',
  },
  savingOverlay: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    zIndex: 20,
  },
  savingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(59, 130, 246, 0.3)',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  savingText: {
    fontSize: '14px',
    color: '#374151',
  },
  successMessage: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    zIndex: 20,
  },
  successText: {
    fontSize: '14px',
    color: '#065f46',
  },
};

// ============================================================================
// ヘルパー
// ============================================================================

/**
 * 回転角度を 0 以上 360 未満へ正規化する
 *
 * 保存済みデータ由来の回転角度は 0/90/180/270 に限られない値（360度、負の値、
 * 数値でない値）を含み得るため、合成済みサムネイルの生成要否を判定する前に
 * 正規化する。正規化結果が 0 の場合は「回転が加えられていない」とみなす。
 *
 * @param rotation - 回転角度（度）
 * @returns 0 以上 360 未満へ正規化した回転角度（判定不能な値は 0）
 *
 * @requirement 22.8
 */
function normalizeImageRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) {
    return 0;
  }
  return ((rotation % 360) + 360) % 360;
}

/**
 * 白縁取りの有効/無効を切替えられる注釈の最小構造
 *
 * 矢印（`Arrow`）と 6 形状（`Rectangle` / `Circle` / `Polygon` / `Polyline` /
 * `Freehand` / `DimensionLine`）がいずれも実装する。テキストは `setTextOutline` を
 * 持つ別系統であり、生成時に `textOutline` を渡す経路を使う。
 */
interface OutlineToggleableAnnotation {
  setOutline(next: { enabled: boolean }): void;
}

/**
 * 生成直後の注釈へ、当該ツールの白縁取り切替状態を適用する (Req 24.5, 32.5)
 *
 * Task 115.96: 道具帯の切替は「以降に描かれる注釈へ適用する描画設定」である。
 * 既存の注釈へは適用しない（Req 24.9 / 25.10 / 32.9 の後方互換を壊さないため）。
 *
 * `setOutline` は canvas へアタッチ済みのとき `object:modified` を発火するため、
 * 本関数は必ず `canvas.add` の**前**に呼ぶこと。追加後に呼ぶと、注釈の追加と
 * 白縁取りの適用が二つの取り消し単位として履歴に積まれる。
 *
 * 生成の失敗（座標が退化しているなど、ファクトリが `null` を返す場合）は呼び出し側で
 * 判定する。ここで `null` を受け付けると、生成できていないことを黙って見逃す。
 *
 * @param shape 生成直後の注釈
 * @param tool 生成に使ったツール
 * @param outlineEnabled ツール別の白縁取り切替状態
 */
function applyOutlineEnabled(
  shape: OutlineToggleableAnnotation,
  tool: OutlineCapableTool,
  outlineEnabled: Record<OutlineCapableTool, boolean>
): void {
  shape.setOutline({ enabled: outlineEnabled[tool] });
}

/** 表示へ適用できる回転角度（度） */
type ImageRotation = 0 | 90 | 180 | 270;

/** 表示へ適用できる回転角度の一覧（インデックス = 90度単位の象限） */
const IMAGE_ROTATION_QUADRANTS: readonly [
  ImageRotation,
  ImageRotation,
  ImageRotation,
  ImageRotation,
] = [0, 90, 180, 270];

/**
 * 保存済みの回転角度を表示へ適用できる角度へ検証・正規化する
 *
 * 表示への適用（applyImageRotation）は 90度/270度のときだけ表示領域の縦横を入れ替えるため、
 * 想定外の値（負の値・360度以上・90度単位でない値・数値でない値）をそのまま渡すと、
 * 角度だけが適用されて縦横が入れ替わらず画像が切れる、あるいは角度指定自体が破綻する。
 * 破損データ・旧データ・外部からの直接更新に備え、表示へ適用する前に想定内の4つの角度へ
 * 丸める。normalizeImageRotation（生成要否の判定と同一の規則）で 0 以上 360 未満へ
 * 正規化したうえで、最も近い90度単位の象限へ丸めることで、適用する角度と表示領域の
 * 縦横が常に整合する。
 *
 * @param rotation - 保存済みデータ由来の回転角度（値の妥当性は保証されない）
 * @returns 表示へ適用できる回転角度（0/90/180/270）
 *
 * @requirement 22.5, 22.8
 */
function toDisplayImageRotation(rotation: unknown): ImageRotation {
  const numeric = typeof rotation === 'number' ? rotation : Number.NaN;
  const normalized = normalizeImageRotation(numeric);
  // normalized は 0 以上 360 未満のため、象限は 0..4 に収まる（4 は一周＝0 と等価）
  const quadrant = Math.round(normalized / 90) % IMAGE_ROTATION_QUADRANTS.length;
  return IMAGE_ROTATION_QUADRANTS[quadrant] ?? IMAGE_ROTATION_QUADRANTS[0];
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 注釈エディタ基盤コンポーネント
 *
 * Fabric.js Canvasを使用して画像上に注釈を描画するための基盤コンポーネントです。
 *
 * Task 13.1: Fabric.js Canvas統合
 * - useRef + useEffectによるCanvas初期化
 * - dispose処理の実装（クリーンアップ）
 * - 背景画像の設定
 *
 * Task 13.2: ツール切り替えUI
 * - ツールバーコンポーネント統合
 * - 選択ツール、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキストの切り替え
 * - アクティブツールの視覚的フィードバック
 *
 * Task 13.3: オブジェクト選択・操作機能
 * - クリックによるオブジェクト選択
 * - 選択オブジェクトのハイライト表示（コントロール、ボーダー）
 * - ドラッグによる移動
 * - ハンドルによるリサイズ
 * - Delete/Backspaceキーによる削除
 * - Escapeキーによる選択解除
 */
function AnnotationEditor({
  imageUrl,
  imageId,
  surveyId,
  initialZoom,
  initialRotation,
  initialPan,
  readOnly = false,
  imageInfo,
  onAnnotationSaved,
  onRequestRefresh,
  onViewStateChange,
  onDirtyChange,
}: AnnotationEditorProps): React.JSX.Element {
  // Toast通知フック（REQ-23.6: サムネイル再生成失敗時のエラー通知用）
  const toast = useToast();

  // Task 115.105 (Req 15.6): 通信状態の購読。
  // canSave はサーバー保存の可否のみを表す。localStorage への自動保存は切断中も継続する。
  const { canSave: canSaveToServer, warningMessage: offlineWarningMessage } = useNetworkStatus();
  const isServerSaveBlocked = !canSaveToServer;
  // DOM参照 - Canvas要素を動的に挿入するコンテナ
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fabric.js Canvas参照
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // 背景画像参照
  const backgroundImageRef = useRef<FabricImage | null>(null);

  // Canvas dispose状態を追跡（React StrictModeでの二重マウント対応）
  const isDisposedRef = useRef(false);

  /** 背景画像の累積回転角度を管理するRef (Req 22.1, 22.8) */
  const imageRotationRef = useRef<0 | 90 | 180 | 270>(0);

  // Task 115.83 (Req 5.6): 表示状態の共有。canvas 生成のたびに「ホストが保持している
  // 最新の回転角度」を参照する必要があるため、props を ref で追随させる。
  const initialRotationRef = useRef(initialRotation);
  initialRotationRef.current = initialRotation;
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;

  // Canvas要素参照（動的に生成）
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  // Task 101.1 (Req 36.1, 36.2, 35.7): モバイル幅ではフィット倍率まで拡大許容（allowUpscale=true）、
  // デスクトップは原寸頭打ち（allowUpscale=false）で現行挙動を維持する。
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  // loadImage（useCallback）と再フィット effect の依存を安定させるため、最新値は ref 経由で参照する。
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  // Task 101.1 (Req 36.4): コンテナ実寸を購読し、アドレスバー伸縮・端末回転・レイアウト変化などの
  // resize に追従して再フィットを発火する（フィット適用は下部の専用 effect が担う）。
  const containerSize = useElementSize(containerRef);

  // 状態管理
  const [state, setState] = useState<AnnotationEditorState>({
    isLoading: true,
    error: null,
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: false,
    canRedo: false,
    isSaving: false,
    saveSuccess: false,
    saveFailed: false,
    imageRotation: 0,
    isStylePanelVisible: true,
  });

  // エクスポートダイアログの状態管理（REQ-12.2, 12.3, 12.4）
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  /** 注釈データ（JSON）のエクスポート処理中フラグ（Task 115.102 / Req 9.6） */
  const [isExportingAnnotationJson, setIsExportingAnnotationJson] = useState(false);

  // Task 72.2 (Req 27.10): 長押し由来コンテキストメニューの表示状態。
  // 実際の描画は Task 72.3 で AnnotationContextMenu コンポーネントをマウントする際に行う。
  // 本タスクでは state と配線のみを提供する。
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number } | null;
    targetObject: FabricObject | null;
  }>({ visible: false, position: null, targetObject: null });

  // ---------------------------------------------------------------------------
  // Task 115.82 (Req 6.2, 6.3): 寸法値入力欄の表示状態
  //
  // 寸法線が描画された直後に、その線を対象とする入力欄をポップアップで開く（Req 6.2）。
  // 確定すると対象の寸法線へ数値と単位を書き込み、線上のラベルとして描画する（Req 6.3）。
  // 位置はクライアント座標で保持し、position: fixed の重ね合わせ層の中へ配置する
  // （AnnotationContextMenu と同じ方式。キャンバス要素の DOM を React が触らないため）。
  // ---------------------------------------------------------------------------
  const [dimensionValueInput, setDimensionValueInput] = useState<{
    target: DimensionLine;
    position: { x: number; y: number };
    initialValue: string;
    initialUnit: string;
  } | null>(null);

  // Task 72.4 (Req 29.7, 29.8): AnnotationGuide の表示状態と idle タイマ参照。
  // ツール選択後 GUIDE_IDLE_MS (=3000ms) 間描画操作が無ければ guideVisible=true にし、
  // 描画開始 (mouse:down) もしくは別ツールへの切替で dismiss する。
  const [guideVisible, setGuideVisible] = useState(false);
  const guideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存成功メッセージを 3 秒後に消すための timer 参照（unmount 後の setState を防止）
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Task 115.81: 自動保存・復元基盤（Req 15.4, 15.5, 15.7-15.10）
  // ---------------------------------------------------------------------------

  /**
   * AutoSaveManager インスタンス（コンポーネントのライフサイクル間で維持）
   *
   * Req 15.9: localStorage が使えない（プライベートブラウジング等の SecurityError）環境では
   * 生成時点で自動保存を無効化し、手動保存のみで動作させる。検出は utils/storage-error に
   * 一元化した `isLocalStorageAvailable` が担う（Req 15.10 のクロスブラウザ判定を含む）。
   */
  const autoSaveManagerRef = useRef<AutoSaveManager | null>(null);
  if (!autoSaveManagerRef.current) {
    autoSaveManagerRef.current = new AutoSaveManager({
      disableAutoSave: !isLocalStorageAvailable(),
    });
  }
  const autoSaveManager = autoSaveManagerRef.current;

  /** ストレージ警告帯の表示種別（Req 15.8: 容量超過 / Req 15.9: プライベートモード） */
  const [storageWarning, setStorageWarning] = useState<StorageWarningType | null>(null);

  /**
   * プライベートモード警告の「今後表示しない」選択（Req 15.9）
   *
   * 選択の永続化先は localStorage だが、この警告が出ている環境ではその localStorage が
   * 使えない。選択を無視すると UI の申し出が嘘になるため、編集セッションの間だけ尊重する。
   */
  const suppressPrivateWarningRef = useRef(false);

  /** サーバー保存済み注釈（ローカル下書きとの比較材料。Req 15.5） */
  const [serverAnnotation, setServerAnnotation] = useState<{
    data: AnnotationDraftData | null;
    updatedAt: string | null;
  }>({ data: null, updatedAt: null });

  /** 画像・注釈の読み込みが完了し、以後の変更をユーザー編集として扱ってよいか（Req 15.4） */
  const autoSaveReadyRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Task 115.102 (Req 9.3): 未保存の編集の有無
  // ---------------------------------------------------------------------------

  /** 未保存の編集があるか。Fabric のイベントハンドラから読むため参照で持つ。 */
  const isDirtyRef = useRef(false);

  /** ホストへの通知先。props の同一性に依存させないため参照で追随させる。 */
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  /**
   * 未保存状態を更新し、変化したときだけホストへ通知する（Req 9.3）
   *
   * @param next 未保存があるか
   */
  const setDirty = useCallback((next: boolean) => {
    if (isDirtyRef.current === next) {
      return;
    }
    isDirtyRef.current = next;
    onDirtyChangeRef.current?.(next);
  }, []);

  /** 復元要求（ダイアログで「復元する」が押された）を描画側へ受け渡す参照 */
  const pendingRestoreRef = useRef<AnnotationDraftData | null>(null);
  const [restoreRequestId, setRestoreRequestId] = useState(0);

  /**
   * 復元フックの戻り値への参照
   *
   * フックの呼び出しは handleSave の定義より後ろに置く必要がある（onRestore が
   * キャンバス適用を伴うため）。手動保存の完了から再チェックを呼ぶ経路だけを参照で繋ぐ。
   */
  const restorationRef = useRef<{ recheckLocalData: () => void } | null>(null);

  /**
   * 現在のキャンバス内容から注釈データを構築する
   *
   * サーバー保存（Req 9.1）とローカル自動保存（Req 15.4）で同じ形を使う。形が食い違うと
   * 復元時の倍率算出（canvasWidth/canvasHeight）と回転復元（imageRotation）が片側で失われる。
   */
  const buildAnnotationData = useCallback((canvas: FabricCanvas): AnnotationDraftData => {
    const objects = canvas.getObjects().filter((obj) => obj !== backgroundImageRef.current);

    return {
      version: '1.0',
      objects: objects.map((obj) => obj.toObject()),
      canvasWidth: canvas.getWidth(),
      canvasHeight: canvas.getHeight(),
      imageRotation: imageRotationRef.current,
    };
  }, []);

  // UndoManagerインスタンス（コンポーネントのライフサイクル間で維持）
  const undoManagerRef = useRef<UndoManager | null>(null);
  if (!undoManagerRef.current) {
    undoManagerRef.current = new UndoManager(50);
  }
  const undoManager = undoManagerRef.current;

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

  // ドラッグ状態管理（描画ツール用）
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    startPoint: null,
  });

  // 現在のアクティブツールを追跡（イベントハンドラ内でアクセスするため）
  const activeToolRef = useRef<ToolType>('select');

  // 現在のスタイルオプションを追跡（イベントハンドラ内でアクセスするため）
  const styleOptionsRef = useRef<StyleOptions>(DEFAULT_STYLE_OPTIONS);

  // 多角形ビルダー（多角形ツール用）
  const polygonBuilderRef = useRef<PolygonBuilder | null>(null);

  // 折れ線ビルダー（折れ線ツール用）
  const polylineBuilderRef = useRef<PolylineBuilder | null>(null);

  // 編集中のテキスト参照（テキストツールの編集解除用）
  const editingTextRef = useRef<boolean>(false);

  // プレビュー用オブジェクト参照（描画途中のプレビュー表示用）
  const previewShapeRef = useRef<FabricObject | null>(null);

  // Task 72.1: touchGestureManager の detach 関数参照（unmount 時に detach するため）
  const touchGestureDetachRef = useRef<(() => void) | null>(null);

  // Task 96.1: initialZoom/initialPan を canvas ごとに一度だけ適用するためのガード参照。
  const initialViewAppliedRef = useRef(false);

  // Task 115.83 (Req 5.6): 初期ビュー適用が済み、表示状態の通知を開始してよいかの参照。
  const viewReadyRef = useRef(false);

  // Task 115.83 (Req 5.4): 閲覧モードの単一ポインタ・ドラッグによるパン操作の進行状態。
  const viewerPanPointersRef = useRef<Set<number>>(new Set());
  const viewerPanOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Task 96.2 (Req 33.5, 30.1): 2本指ジェスチャー突入時に退避する描画モード（isDrawingMode）。
  // cooldown→idle 復帰時に、退避値と選択中ツールに応じて isDrawingMode を復元する。
  const prevDrawingModeRef = useRef(false);

  // Task 96.2 (Req 33.7): ジェスチャー終了（cooldown→idle）を検出して描画モードを復元するための
  // ポーリングタイマ参照。touchGestureManager は終了コールバックを持たないため、
  // getTouchState() をポーリングして idle 復帰を捉える。
  const gestureRestoreTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fabric.js と UndoManager の連携フック
  // fabricCanvasRef.currentを使用（Canvasがない場合はnull）
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);

  // Task 96.1 (Req 33.9, 34.1-34.4): canvasViewportController と React 状態（現在倍率）を
  // 橋渡しするフック。生成される単一の controller を touchGestureManager（attach の
  // viewportController）と ZoomControls（zoom/zoomIn/zoomOut/fit）で共有する。
  const {
    zoom,
    zoomIn,
    zoomOut,
    fit,
    controller: viewportController,
  } = useCanvasViewport({
    canvas: fabricCanvas as unknown as FabricCanvasLike | null,
  });
  // Task 96.3 (Req 33.8): handleDoubleTap から最新の viewportController を参照するための ref。
  // handleDoubleTap の依存を空に保ち、canvas 初期化 effect の再実行（dispose/再生成）を避ける。
  const viewportControllerRef = useRef(viewportController);
  viewportControllerRef.current = viewportController;

  /**
   * Task 115.83 (Req 5.6): 現在の表示状態（ズーム・回転・位置）をホストへ通知する。
   *
   * ホスト（`SiteSurveyImageViewerPage`）はこれを保持し、閲覧⇄編集の切り替えで
   * 作り直される canvas へ `initialZoom` / `initialRotation` / `initialPan` として
   * 渡し戻す。依存を持たない ref 経由の実装にして、イベントハンドラや effect から
   * 安全に呼べるようにする。
   */
  const reportViewState = useCallback((): void => {
    // canvas 生成直後〜初期ビュー適用前は、新しい canvas の等倍値（zoom=1）が一時的に
    // 見えている。この途中経過を通知するとホストが保持している共有状態を等倍で
    // 上書きしてしまうため、初期ビュー適用が済むまで通知しない。
    if (!viewReadyRef.current) return;
    const notify = onViewStateChangeRef.current;
    if (!notify) return;
    const controller = viewportControllerRef.current;
    if (!controller) return;
    const { zoom: currentZoom, panX, panY } = controller.getState();
    notify({
      zoom: currentZoom,
      rotation: imageRotationRef.current,
      pan: { x: panX, y: panY },
    });
  }, []);

  // ズーム倍率の変化（ボタン操作・ピンチ・フィット・初期ビュー適用）をホストへ通知する（Req 5.6）。
  useEffect(() => {
    reportViewState();
  }, [zoom, reportViewState]);
  const { setProgrammaticOperation } = useFabricUndoIntegration({
    canvas: fabricCanvas,
    undoManager,
    enabled: !state.isLoading,
  });
  // プログラム的操作フラグをrefに保存（イベントハンドラ内で使用）
  const setProgrammaticRef = useRef(setProgrammaticOperation);
  setProgrammaticRef.current = setProgrammaticOperation;

  // UndoManager状態変更コールバック設定
  useEffect(() => {
    undoManager.setOnChange((undoState) => {
      setState((prev) => ({
        ...prev,
        canUndo: undoState.canUndo,
        canRedo: undoState.canRedo,
      }));
    });

    return () => {
      undoManager.setOnChange(null);
    };
  }, [undoManager]);

  /**
   * Task 72.3 (Req 27.4): コンテキストメニュー表示中は canvas.skipTargetFind = true にし、
   * 背景画像への新規描画操作（ヒットテスト/選択）を抑止する。メニュー非表示時は false に戻す。
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.skipTargetFind = contextMenu.visible;
  }, [contextMenu.visible]);

  /**
   * Task 72.4 (Req 29.7, 29.8): ツール選択変更時に idle タイマ (GUIDE_IDLE_MS=3000ms) を開始し、
   * 3 秒間描画操作が無い場合に AnnotationGuide を visible にする。
   *
   * - select ツールはガイド対象外（操作ヒント不要）
   * - ツール変更のたびにガイドを一旦非表示にし、新しいタイマを設定する
   * - クリーンアップ時は進行中のタイマを破棄する
   */
  useEffect(() => {
    // ツール変更時にまず非表示へ戻す
    setGuideVisible(false);
    if (guideTimerRef.current) {
      clearTimeout(guideTimerRef.current);
      guideTimerRef.current = null;
    }

    // select は簡易ガイドの対象外
    if (state.activeTool === 'select') {
      return;
    }

    guideTimerRef.current = setTimeout(() => {
      setGuideVisible(true);
      guideTimerRef.current = null;
    }, GUIDE_IDLE_MS);

    return () => {
      if (guideTimerRef.current) {
        clearTimeout(guideTimerRef.current);
        guideTimerRef.current = null;
      }
    };
  }, [state.activeTool]);

  /**
   * Task 72.5 (Req 29.1, 29.2): ツール切替時のカーソル適用連動。
   *
   * - `applyToolCursor(canvas, activeTool)` を呼出して
   *   `defaultCursor` / `hoverCursor` / `freeDrawingCursor` を更新する
   * - `canvas.setCursor(canvas.defaultCursor)` を明示呼出し、
   *   ホバー中のカーソルを即時に反映する（マウスが画像領域上にある状態で
   *   ツールを切替えた直後に現カーソルが残る問題を回避）
   * - マウント初期や unmount 過程で canvas が未確立の場合は何もしない
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }
    applyToolCursor(canvas, state.activeTool);
    if (canvas.defaultCursor) {
      canvas.setCursor(canvas.defaultCursor);
    }
  }, [state.activeTool]);

  /**
   * ツール変更ハンドラ
   *
   * Task 13.3: ツール切り替え時にオブジェクト選択を解除
   * Task 15: 各描画ツールの設定
   */
  const handleToolChange = useCallback((tool: ToolType) => {
    // ツールを変更
    //
    // Task 115.104 (Req 28.8): 別のツールへ切替えたときは、そのツールの詳細属性パネルを
    // 開いた状態で見せる。開閉のトグルは「選択中ツールの再タップ」だけの責務であり、
    // 同じツールが再び渡された場合は開閉状態をそのまま保つ。
    setState((prev) => ({
      ...prev,
      activeTool: tool,
      isStylePanelVisible: prev.activeTool === tool ? prev.isStylePanelVisible : true,
    }));
    activeToolRef.current = tool;

    // Task 115.82 (Req 6.2): 未確定の寸法値入力欄はツール切替で閉じる
    setDimensionValueInput(null);

    // Task 13.3: 選択ツール以外に切り替える場合、現在の選択を解除
    if (tool !== 'select' && fabricCanvasRef.current) {
      fabricCanvasRef.current.discardActiveObject();
      fabricCanvasRef.current.renderAll();
    }

    // Task 13.3: Canvasの選択モードを設定
    if (fabricCanvasRef.current) {
      const canvas = fabricCanvasRef.current;
      // selectツールの場合は選択を有効化、それ以外は無効化
      canvas.selection = tool === 'select';

      // すべてのオブジェクトの選択可否を設定（背景画像を除く）
      canvas.getObjects().forEach((obj) => {
        // 背景画像はスキップ
        if (obj === backgroundImageRef.current) return;
        obj.set({
          selectable: tool === 'select',
          evented: tool === 'select',
        });
      });
      canvas.renderAll();

      // フリーハンドモードの設定
      if (tool === 'freehand') {
        // Task 115.50 (Req 32.1, 32.11): 素の PencilBrush ではなく FreehandBrush を設定する。
        // FreehandBrush は描画完了時（PencilBrush._finalizeAndAddPath → createPath）に
        // 白縁取り付きの FreehandPath（outlinePath + bodyPath の Group）を生成するため、
        // 本番の描画で作られるフリーハンド注釈が要件 32 の対象形状となる。
        canvas.isDrawingMode = true;
        const brush = createFreehandBrush(
          {
            stroke: styleOptionsRef.current.strokeColor,
            strokeWidth: styleOptionsRef.current.strokeWidth,
            decimate: DEFAULT_FREEHAND_OPTIONS.decimate,
            // Task 115.96 (Req 32.5): フリーハンドは描画完了時にブラシが形状を組み立てるため、
            // 切替はブラシの生成オプションとして渡す
            outlineEnabled: styleOptionsRef.current.outlineEnabled.freehand,
          },
          canvas
        );
        canvas.freeDrawingBrush = brush;
      } else {
        // フリーハンドモードを無効化
        canvas.isDrawingMode = false;
      }
    }

    // 多角形・折れ線ビルダーをリセット
    if (tool !== 'polygon') {
      polygonBuilderRef.current = null;
    }
    if (tool !== 'polyline') {
      polylineBuilderRef.current = null;
    }

    // テキスト編集フラグをリセット
    if (tool !== 'text') {
      editingTextRef.current = false;
    }

    // ドラッグ状態をリセット
    dragStateRef.current = { isDragging: false, startPoint: null };

    // プレビューオブジェクトをクリア
    if (previewShapeRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(previewShapeRef.current);
      previewShapeRef.current = null;
      fabricCanvasRef.current.renderAll();
    }
  }, []);

  /**
   * ツール別の白縁取り切替状態を画面・参照・描画中のブラシへ反映する
   *
   * Task 115.96 (Req 24.5, 25.2, 32.5, 24.10, 25.11, 32.10):
   * 切替の適用と、その取り消し・やり直しで同じ経路を通す。取り消しだけ別経路にすると
   * 「画面のチェックは戻るがブラシは戻らない」といった片側だけの復元になる。
   *
   * @param outlineEnabled 適用するツール別の切替状態
   */
  const applyOutlineEnabledSetting = useCallback(
    (outlineEnabled: Record<OutlineCapableTool, boolean>) => {
      setState((prev) => ({
        ...prev,
        styleOptions: { ...prev.styleOptions, outlineEnabled },
      }));
      styleOptionsRef.current = { ...styleOptionsRef.current, outlineEnabled };

      // フリーハンドは描画完了時にブラシが形状を組み立てるため、ブラシ側にも反映する
      const brush = fabricCanvasRef.current?.freeDrawingBrush;
      if (brush instanceof FreehandBrush) {
        brush.setOutlineEnabled(outlineEnabled.freehand);
      }
    },
    []
  );

  /**
   * スタイル変更ハンドラ
   */
  const handleStyleChange = useCallback(
    (options: Partial<StyleOptions>) => {
      const { outlineEnabled: nextOutlineEnabled, ...restOptions } = options;

      // Req 24.10 / 25.11 / 32.10: 白縁取りの有効化/無効化の切替は Undo/Redo 履歴に記録する。
      // 色・線幅・文字サイズの変更は要件が履歴記録を求めていないため従来どおり記録しない。
      if (nextOutlineEnabled !== undefined) {
        const previousOutlineEnabled = styleOptionsRef.current.outlineEnabled;
        applyOutlineEnabledSetting(nextOutlineEnabled);
        undoManager.pushWithoutExecute({
          type: 'outline-toggle',
          execute: () => applyOutlineEnabledSetting(nextOutlineEnabled),
          undo: () => applyOutlineEnabledSetting(previousOutlineEnabled),
        });
      }

      if (Object.keys(restOptions).length === 0) {
        return;
      }

      setState((prev) => ({
        ...prev,
        styleOptions: { ...prev.styleOptions, ...restOptions },
      }));
      styleOptionsRef.current = { ...styleOptionsRef.current, ...restOptions };

      // フリーハンドモードの場合はブラシの設定も更新
      if (
        fabricCanvasRef.current &&
        activeToolRef.current === 'freehand' &&
        fabricCanvasRef.current.freeDrawingBrush
      ) {
        if (restOptions.strokeColor !== undefined) {
          fabricCanvasRef.current.freeDrawingBrush.color = restOptions.strokeColor;
        }
        if (restOptions.strokeWidth !== undefined) {
          fabricCanvasRef.current.freeDrawingBrush.width = restOptions.strokeWidth;
        }
      }
    },
    [applyOutlineEnabledSetting, undoManager]
  );

  /**
   * 画像を読み込んでCanvasに表示
   */
  const loadImage = useCallback(
    async (canvas: FabricCanvas, url: string) => {
      // Task 115.81 (Req 15.4): 読み込み・復元でキャンバスへ載る注釈をユーザー編集と
      // 取り違えないよう、読み込みの開始時点で自動保存の受付を閉じる。編集モードの
      // 切り替えでは canvas が作り直されて本関数が再実行されるため、初回だけでは足りない。
      autoSaveReadyRef.current = false;
      // Req 9.3: 画像の読み込みをやり直す時点では、まだユーザーの編集は無い
      setDirty(false);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // 画像を読み込み
        const img = await FabricImage.fromURL(url, {
          crossOrigin: 'anonymous',
        });

        // 非同期処理後、Canvasがdisposeされていないか確認
        // また、渡されたcanvasインスタンスが現在のcanvasと同じかも確認
        // （React StrictModeで古いcanvasインスタンスのクロージャが実行される可能性がある）
        /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
        if (
          isDisposedRef.current ||
          !fabricCanvasRef.current ||
          fabricCanvasRef.current !== canvas
        ) {
          console.warn('Canvas has been disposed or replaced during image loading');
          return;
        }

        // コンテナサイズを取得
        const containerWidth = containerRef.current?.clientWidth || 800;
        const containerHeight = containerRef.current?.clientHeight || 600;

        // パディングを考慮
        const padding = 48;

        // 画像サイズを計算
        const imgWidth = img.width || 1;
        const imgHeight = img.height || 1;

        // Task 101.1 (Req 36.1, 36.2, 35.7): フィット倍率算出を computeFitScale へ移行。
        // 従来の Math.min(maxW/imgW, maxH/imgH, 1) を一般化し、原寸頭打ち（末尾の 1）を
        // allowUpscale で制御する。モバイル幅では allowUpscale=true とし小画像もフィット倍率まで
        // 拡大（Req 36.2）、デスクトップは allowUpscale=false で原寸頭打ちの現行挙動を維持（Req 35.7）。
        const scale = computeFitScale({
          imageWidth: imgWidth,
          imageHeight: imgHeight,
          containerWidth,
          containerHeight,
          padding,
          allowUpscale: isMobileRef.current,
        });

        // スケールを設定
        img.scale(scale);

        // Canvasサイズを計算
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        // 背景画像として設定する前に選択不可・移動不可に設定。
        // 併せて Fabric v7 で originX/Y の既定値が left/top → center/center に変更されたため、
        // 画像をキャンバス中心に配置して全体表示する。
        img.set({
          selectable: false,
          evented: false,
          originX: 'center',
          originY: 'center',
          left: scaledWidth / 2,
          top: scaledHeight / 2,
        });

        // 再度disposeチェック（React StrictModeでのcanvas置換も考慮）
        /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
        if (
          isDisposedRef.current ||
          !fabricCanvasRef.current ||
          fabricCanvasRef.current !== canvas
        ) {
          console.warn('Canvas has been disposed or replaced during image processing');
          return;
        }

        canvas.setDimensions({ width: scaledWidth, height: scaledHeight });

        // 背景画像として設定（Fabric.js v6 API）
        canvas.backgroundImage = img;
        // 背景画像の参照を保存
        backgroundImageRef.current = img;

        // Task 96.4 (Req 33.11, 33.12): 選択ツールでの初回ロード時もタッチ/クリックで
        // 既存注釈を選択・移動できるよう、canvas.selection を現在のツール状態へ同期する。
        // canvas 生成時は selection:false 固定のため、ここで activeTool/readOnly に基づき是正する
        // （以後のツール切替時は handleToolChange が同期する）。これにより拡大表示中でも
        // Fabric の選択（マーキー）/ object:moving（scenePoint=viewport 考慮）への委譲が成立する。
        canvas.selection = !readOnly && activeToolRef.current === 'select';

        // Task 115.83 (Req 5.6): ホストが保持している共有回転角度を初期表示へ適用する。
        // 閲覧⇄編集の切り替えでは canvas を作り直すため、これが無いと直前の回転が失われる。
        // 共有値は「この画面で今表示している向き」であり、保存済みの回転（Req 22.5）より
        // 新しいので、指定されている場合はそちらを優先する。
        const sharedRotation = toDisplayImageRotation(initialRotationRef.current);
        const hasSharedRotation = initialRotationRef.current !== undefined;
        if (hasSharedRotation) {
          imageRotationRef.current = sharedRotation;
          if (sharedRotation !== 0) {
            applyImageRotation(canvas, img, sharedRotation);
          }
          setState((prev) => ({ ...prev, imageRotation: sharedRotation }));
        }

        canvas.renderAll();

        // REQ-9.2: 保存された注釈データを復元
        try {
          const annotationData = await getAnnotation(imageId);
          // Task 115.81 (Req 15.5): ローカル下書きとの比較材料をフックへ渡すため保持する
          setServerAnnotation({
            data: annotationData?.data ?? null,
            updatedAt: annotationData?.updatedAt ?? null,
          });
          if (annotationData && annotationData.data) {
            // 再度disposeチェック
            /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
            if (
              isDisposedRef.current ||
              !fabricCanvasRef.current ||
              fabricCanvasRef.current !== canvas
            ) {
              console.warn('Canvas has been disposed or replaced during annotation loading');
              return;
            }

            // 回転状態の復元 (Req 22.4, 22.5, 22.8)
            // Task 115.11: 保存済みの値は 0/90/180/270 に限られない（破損データ・旧データ・
            // 外部からの直接更新）。想定外の値のまま表示へ適用すると画像が切れる／角度指定が
            // 破綻するため、表示へ適用する前に想定内の角度へ検証・正規化する。
            // Task 115.83 (Req 5.6): 共有された回転が指定されている場合は上書きしない。
            const savedRotation = toDisplayImageRotation(annotationData.data.imageRotation);
            if (!hasSharedRotation && savedRotation !== 0 && backgroundImageRef.current) {
              imageRotationRef.current = savedRotation;
              applyImageRotation(canvas, backgroundImageRef.current, savedRotation);
              setState((prev) => ({ ...prev, imageRotation: savedRotation }));
            }

            // 注釈オブジェクトを復元
            const objects = annotationData.data.objects;
            if (objects && objects.length > 0) {
              // Fabric.js v6 の enlivenObjects を使用してオブジェクトを復元
              const enlivenedObjects = await util.enlivenObjects(objects);

              // 再度disposeチェック
              /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
              if (
                isDisposedRef.current ||
                !fabricCanvasRef.current ||
                fabricCanvasRef.current !== canvas
              ) {
                console.warn('Canvas has been disposed or replaced during object restoration');
                return;
              }

              // 復元したオブジェクトをキャンバスに追加（倍率適用は共有ヘルパーが担う）
              const restored = addRestoredAnnotationObjects(
                canvas,
                enlivenedObjects,
                annotationData.data.canvasWidth,
                annotationData.data.canvasHeight,
                !readOnly && activeToolRef.current === 'select'
              );
              canvas.renderAll();
              console.log(
                `Restored ${restored.addedCount} annotation objects` +
                  (restored.needsScaling
                    ? ` (scaled: ${restored.scaleX.toFixed(2)}x${restored.scaleY.toFixed(2)})`
                    : '')
              );
            }
          }
        } catch (annotationErr) {
          // 注釈データの読み込みに失敗してもエラーにはしない（画像は表示する）
          console.warn('注釈データの読み込みに失敗しました:', annotationErr);
        }

        // Task 115.81 (Req 15.4): 読み込み・復元由来の object:added では自動保存を起動しない。
        // ここから先の変更だけをユーザー編集とみなす。
        autoSaveReadyRef.current = true;
        setState((prev) => ({ ...prev, isLoading: false, error: null }));
        /* istanbul ignore next -- @preserve 画像読み込みエラーのキャッチ（ネットワークエラー等） */
      } catch (err) {
        console.error('画像の読み込みに失敗しました:', err);
        // disposeされていない場合のみstate更新
        if (!isDisposedRef.current) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : '画像の読み込みに失敗しました',
          }));
        }
      }
    },
    [imageId, readOnly, setDirty]
  );

  /**
   * Canvasイベントリスナーを設定
   *
   * Task 13.3: オブジェクト選択・操作機能のイベント
   * Task 15: 各描画ツールのマウスイベント処理
   * - mouse:down/move/up: 描画ツールの操作
   * - mouse:dblclick: 多角形・折れ線の完了
   * - selection:created/updated/cleared: オブジェクト選択の変更
   * - object:moving/modified/scaling: オブジェクトの移動・変更・リサイズ
   */
  /* istanbul ignore next -- @preserve イベントハンドラはFabric.jsコールバック内で実行 */
  const setupEventListeners = useCallback((canvas: FabricCanvas) => {
    // マウスダウンイベント - ドラッグ開始または多角形/折れ線の頂点追加
    canvas.on('mouse:down', (options: TPointerEventInfo<TPointerEvent>) => {
      // Task 72.4 (Req 29.7, 29.8): 描画/操作が開始されたら簡易ガイドを dismiss し、
      // idle タイマも破棄する。描画直前/途中の非侵襲的なガイドが視覚的競合を起こさないため。
      if (guideTimerRef.current) {
        clearTimeout(guideTimerRef.current);
        guideTimerRef.current = null;
      }
      setGuideVisible(false);

      // Fabric.js v7ではoptions.scenePointを使用（キャンバス座標）
      const pointer = options.scenePoint;
      const activeTool = activeToolRef.current;
      if (!pointer) {
        return;
      }

      // 選択ツールまたはフリーハンドの場合は何もしない
      if (activeTool === 'select' || activeTool === 'freehand') {
        return;
      }

      // 注: handleToolChangeで描画ツール選択時にevented: false, selectable: falseを
      // 全オブジェクトに設定済みのため、既存オブジェクト上でも描画操作を実行する。
      // また、handleToolChangeでdiscardActiveObject()を呼び出し済みのため、
      // アクティブオブジェクトのチェックも不要。

      // 多角形ツール - 頂点を追加
      if (activeTool === 'polygon') {
        if (!polygonBuilderRef.current) {
          polygonBuilderRef.current = new PolygonBuilder();
        }
        polygonBuilderRef.current.addVertex({ x: pointer.x, y: pointer.y });
        return;
      }

      // 折れ線ツール - 頂点を追加
      if (activeTool === 'polyline') {
        if (!polylineBuilderRef.current) {
          polylineBuilderRef.current = new PolylineBuilder();
        }
        polylineBuilderRef.current.addPoint({ x: pointer.x, y: pointer.y });
        return;
      }

      // テキストツール - シングルクリックで配置
      if (activeTool === 'text') {
        // 編集中のテキストがある場合は編集を終了するだけで、新しいテキストを作成しない
        // editingTextRefがtrueの場合、前回テキストを作成して編集モードに入っている
        if (editingTextRef.current) {
          // 編集フラグをリセット
          editingTextRef.current = false;
          // Fabric.jsが自動的に編集を終了するので、ここでは何もしない
          // 新しいテキストを作成せずにreturn
          return;
        }

        const currentStyle = styleOptionsRef.current;
        const textAnnotation = createTextAnnotation(
          { x: pointer.x, y: pointer.y },
          {
            initialText: 'テキスト',
            fontSize: currentStyle.fontSize,
            fill: currentStyle.strokeColor,
            // Task 115.102 (Req 8.5): 道具帯で選んだ背景色を反映する。
            // 道具帯は透明を空文字で表し、テキストツール側は 'transparent' で表すため橋渡しする。
            backgroundColor:
              currentStyle.textBackgroundColor === ''
                ? 'transparent'
                : currentStyle.textBackgroundColor,
            // Task 115.102 (Req 8.6): 道具帯で選んだ吹き出し形式を反映する。
            balloonStyle: currentStyle.balloonStyle,
            // Task 115.96 (Req 25.2): 道具帯の白アウトライン切替を反映する。
            // 幅比率は一元管理の資材から引く（切替は有効/無効だけを決める）。
            textOutline: {
              enabled: currentStyle.outlineEnabled.text,
              widthRatio: ANNOTATION_DEFAULTS.textOutline.widthRatio,
            },
          }
        );
        canvas.add(textAnnotation);
        // ダブルクリック編集モードを設定
        textAnnotation.setupDoubleClickEditing(canvas);
        canvas.renderAll();
        // テキストを選択状態にして編集モードに入る
        canvas.setActiveObject(textAnnotation);
        textAnnotation.enterEditing();
        textAnnotation.selectAll();
        // 編集モードに入ったことを記録
        editingTextRef.current = true;
        return;
      }

      // その他の描画ツール - ドラッグ開始
      dragStateRef.current = {
        isDragging: true,
        startPoint: { x: pointer.x, y: pointer.y },
      };
    });

    // マウス移動イベント - ドラッグ中のプレビュー表示
    canvas.on('mouse:move', (options: TPointerEventInfo<TPointerEvent>) => {
      const pointer = options.scenePoint;
      const activeTool = activeToolRef.current;
      const dragState = dragStateRef.current;
      const currentStyle = styleOptionsRef.current;

      if (!pointer) {
        return;
      }

      // 選択ツールまたはフリーハンド、テキストの場合はプレビュー不要
      if (activeTool === 'select' || activeTool === 'freehand' || activeTool === 'text') {
        return;
      }

      // 多角形ツールのプレビュー（クリックベース）
      if (activeTool === 'polygon' && polygonBuilderRef.current) {
        const vertices = polygonBuilderRef.current.getVertices();
        const firstVertex = vertices[0];
        if (vertices.length > 0 && firstVertex) {
          // 既存のプレビューを削除（Undo履歴に記録しない）
          if (previewShapeRef.current) {
            setProgrammaticRef.current(true);
            canvas.remove(previewShapeRef.current);
            setProgrammaticRef.current(false);
          }
          // 全ての頂点 + マウス位置を含むPolylineでプレビュー表示
          // 多角形なので最後に始点への線も追加して閉じる
          const previewPoints = [
            ...vertices.map((v) => ({ x: v.x, y: v.y })),
            { x: pointer.x, y: pointer.y },
            { x: firstVertex.x, y: firstVertex.y }, // 始点に戻って閉じる
          ];
          const previewLine = new Polyline(previewPoints, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: 'transparent',
            opacity: 0.5,
            selectable: false,
            evented: false,
          });
          previewShapeRef.current = previewLine;
          setProgrammaticRef.current(true);
          canvas.add(previewLine);
          setProgrammaticRef.current(false);
          canvas.renderAll();
        }
        return;
      }

      // 折れ線ツールのプレビュー（クリックベース）
      if (activeTool === 'polyline' && polylineBuilderRef.current) {
        const points = polylineBuilderRef.current.getPoints();
        if (points.length > 0) {
          // 既存のプレビューを削除（Undo履歴に記録しない）
          if (previewShapeRef.current) {
            setProgrammaticRef.current(true);
            canvas.remove(previewShapeRef.current);
            setProgrammaticRef.current(false);
          }
          // 全てのポイント + マウス位置を含むPolylineでプレビュー表示
          const previewPoints = [
            ...points.map((p) => ({ x: p.x, y: p.y })),
            { x: pointer.x, y: pointer.y },
          ];
          const previewLine = new Polyline(previewPoints, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: 'transparent',
            opacity: 0.5,
            selectable: false,
            evented: false,
          });
          previewShapeRef.current = previewLine;
          setProgrammaticRef.current(true);
          canvas.add(previewLine);
          setProgrammaticRef.current(false);
          canvas.renderAll();
        }
        return;
      }

      // ドラッグ中でなければプレビュー不要
      if (!dragState.isDragging || !dragState.startPoint) {
        return;
      }

      const startPoint = dragState.startPoint;
      const endPoint = { x: pointer.x, y: pointer.y };

      // 既存のプレビューを削除（Undo履歴に記録しない）
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        canvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }

      // ツールに応じてプレビュー図形を作成
      // Task 115.96 (Req 24.5, 32.5): プレビューにも白縁取り切替を反映する。
      // 反映しないと、ドラッグ中に見えている姿と確定後の姿が食い違う。
      let previewShape: FabricObject | null = null;
      switch (activeTool) {
        case 'arrow': {
          const previewArrow = createArrow(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          if (previewArrow) {
            applyOutlineEnabled(previewArrow, 'arrow', currentStyle.outlineEnabled);
          }
          previewShape = previewArrow;
          break;
        }
        case 'circle': {
          const previewCircle = createCircle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          if (previewCircle) {
            applyOutlineEnabled(previewCircle, 'circle', currentStyle.outlineEnabled);
          }
          previewShape = previewCircle;
          break;
        }
        case 'rectangle': {
          const previewRectangle = createRectangle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          if (previewRectangle) {
            applyOutlineEnabled(previewRectangle, 'rectangle', currentStyle.outlineEnabled);
          }
          previewShape = previewRectangle;
          break;
        }
        case 'dimension': {
          const previewDimension = createDimensionLine(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          if (previewDimension) {
            applyOutlineEnabled(previewDimension, 'dimension', currentStyle.outlineEnabled);
          }
          previewShape = previewDimension;
          break;
        }
        default:
          break;
      }

      // プレビュー図形を表示（半透明で表示）
      // プレビュー操作はUndo履歴に記録しない
      if (previewShape) {
        previewShape.set({
          opacity: 0.5,
          selectable: false,
          evented: false,
        });
        previewShapeRef.current = previewShape;
        setProgrammaticRef.current(true);
        canvas.add(previewShape);
        setProgrammaticRef.current(false);
        canvas.renderAll();
      }
    });

    // マウスアップイベント - 図形の作成
    canvas.on('mouse:up', (options: TPointerEventInfo<TPointerEvent>) => {
      const dragState = dragStateRef.current;
      const activeTool = activeToolRef.current;

      // プレビューオブジェクトを削除（Undo履歴に記録しない）
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        canvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }

      // 選択ツールまたはフリーハンドの場合は図形を作成しない
      if (activeTool === 'select' || activeTool === 'freehand') {
        dragStateRef.current = { isDragging: false, startPoint: null };
        return;
      }

      // 注: handleToolChangeで描画ツール選択時にevented: false, selectable: falseを
      // 全オブジェクトに設定済みのため、既存オブジェクト上でも図形作成を実行する。
      const pointer = options.scenePoint;

      // ドラッグ中でなければ何もしない
      if (!dragState.isDragging || !dragState.startPoint) {
        return;
      }

      // pointerがない場合は何もしない（上で既にチェック済みだが念のため）
      if (!pointer) {
        dragStateRef.current = { isDragging: false, startPoint: null };
        return;
      }
      const startPoint = dragState.startPoint;
      const endPoint = { x: pointer.x, y: pointer.y };

      // ドラッグ状態をリセット
      dragStateRef.current = { isDragging: false, startPoint: null };

      // スタイルオプションを取得
      const currentStyle = styleOptionsRef.current;

      // ツールに応じて図形を作成
      let shape = null;
      // Task 115.82 (Req 6.2): 寸法線が作成されたときだけ寸法値入力欄を開くための参照
      let createdDimension: DimensionLine | null = null;
      switch (activeTool) {
        case 'arrow': {
          const arrow = createArrow(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          // Task 115.96 (Req 24.5): canvas へ載せる前に切替を反映する
          if (arrow) {
            applyOutlineEnabled(arrow, 'arrow', currentStyle.outlineEnabled);
          }
          shape = arrow;
          break;
        }
        case 'circle': {
          const circle = createCircle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          if (circle) {
            applyOutlineEnabled(circle, 'circle', currentStyle.outlineEnabled);
          }
          shape = circle;
          break;
        }
        case 'rectangle': {
          const rectangle = createRectangle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          if (rectangle) {
            applyOutlineEnabled(rectangle, 'rectangle', currentStyle.outlineEnabled);
          }
          shape = rectangle;
          break;
        }
        case 'dimension': {
          // Task 115.82 (Req 6.2): 作成した寸法線は入力欄の対象として保持する
          const dimension = createDimensionLine(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          if (dimension) {
            applyOutlineEnabled(dimension, 'dimension', currentStyle.outlineEnabled);
          }
          shape = dimension;
          createdDimension = dimension;
          break;
        }
        default:
          // テキストなどは別途実装
          break;
      }

      // 図形が作成されたらCanvasに追加
      if (shape) {
        canvas.add(shape);
        canvas.renderAll();
      }

      // Task 115.82 (Req 6.2): 寸法線が描画されたら寸法値入力用のテキストフィールドを開く。
      // 本ハンドラ自体が readOnly でない場合にのみ登録されるため、閲覧モードでは到達しない。
      if (createdDimension) {
        const clientPoint = resolveClientPoint(options.e);
        // 退避先のキャンバス座標は入力欄を置く position: fixed 層とは座標系が異なり、
        // 位置がずれうる。Fabric は mouse:up へ必ず元の DOM イベントを渡すため
        // 実際には到達しないが、位置の欠落で入力欄自体を出さない方が要件6.2 に反する。
        const anchorPoint = clientPoint ?? { x: endPoint.x, y: endPoint.y };
        setDimensionValueInput({
          target: createdDimension,
          // 入力欄がポインタ位置と重ならないよう少しずらす
          position: { x: anchorPoint.x + 12, y: anchorPoint.y + 12 },
          initialValue: createdDimension.customData.dimensionValue ?? '',
          initialUnit: createdDimension.customData.dimensionUnit || DEFAULT_DIMENSION_UNIT,
        });
      }
    });

    // ダブルクリックイベント - 多角形・折れ線の完了
    canvas.on('mouse:dblclick', () => {
      const activeTool = activeToolRef.current;

      // プレビューオブジェクトを削除（Undo履歴に記録しない）
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        canvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }

      // 多角形ツール - 多角形を完了
      if (activeTool === 'polygon' && polygonBuilderRef.current) {
        const currentStyle = styleOptionsRef.current;
        const polygon = createPolygon(polygonBuilderRef.current.getVertices(), {
          stroke: currentStyle.strokeColor,
          strokeWidth: currentStyle.strokeWidth,
          fill: currentStyle.fillColor || 'transparent',
        });
        if (polygon) {
          // Task 115.96 (Req 32.5): canvas へ載せる前に切替を反映する
          applyOutlineEnabled(polygon, 'polygon', currentStyle.outlineEnabled);
          canvas.add(polygon);
          canvas.renderAll();
        }
        polygonBuilderRef.current = null;
        return;
      }

      // 折れ線ツール - 折れ線を完了
      if (activeTool === 'polyline' && polylineBuilderRef.current) {
        const currentStyle = styleOptionsRef.current;
        const polyline = createPolyline(polylineBuilderRef.current.getPoints(), {
          stroke: currentStyle.strokeColor,
          strokeWidth: currentStyle.strokeWidth,
          fill: 'transparent',
        });
        if (polyline) {
          // Task 115.96 (Req 32.5): canvas へ載せる前に切替を反映する
          applyOutlineEnabled(polyline, 'polyline', currentStyle.outlineEnabled);
          canvas.add(polyline);
          canvas.renderAll();
        }
        polylineBuilderRef.current = null;
        return;
      }
    });

    // Task 13.3: オブジェクト選択イベント
    canvas.on('selection:created', () => {
      // オブジェクト選択時
    });

    canvas.on('selection:updated', () => {
      // 選択オブジェクト変更時
    });

    canvas.on('selection:cleared', () => {
      // 選択解除時
    });

    // Task 13.3: オブジェクト操作イベント
    canvas.on('object:moving', () => {
      // オブジェクト移動中
    });

    canvas.on('object:scaling', () => {
      // オブジェクトリサイズ中
    });

    canvas.on('object:modified', () => {
      // オブジェクト変更完了（移動・リサイズ完了後）
    });
  }, []);

  /**
   * Canvasイベントリスナーを解除
   */
  /* istanbul ignore next -- @preserve イベントリスナー解除はアンマウント時のみ実行 */
  const removeEventListeners = useCallback((canvas: FabricCanvas) => {
    // 基本マウスイベント
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    canvas.off('mouse:dblclick');

    // Task 13.3: オブジェクト選択イベント
    canvas.off('selection:created');
    canvas.off('selection:updated');
    canvas.off('selection:cleared');

    // Task 13.3: オブジェクト操作イベント
    canvas.off('object:moving');
    canvas.off('object:scaling');
    canvas.off('object:modified');
  }, []);

  /**
   * Task 72.2 / 96.3 (Req 27.1, 33.8): ダブルタップ用途調停ハンドラ
   *
   * touchGestureManager が発火する `custom:dbltap` を受け、ダブルタップ位置の対象によって
   * 用途を排他的に切り替える（design.md「ダブルタップ用途調停」）。
   *   - テキスト注釈上 (`textAnnotation` / `i-text` / `text`) → `enterEditing()` で編集モード
   *     へ遷移（Req 27.1, 27.8 後方互換）。ズームトグルは行わない。
   *   - 空き領域（対象なし）または背景画像 (`image`) 上 → ズーム/全体表示トグル（Req 33.8）。
   *     現在ズームが等倍（≒1）なら当該タップ点を中心に拡大し、拡大中なら fit() で全体表示へ戻す。
   *   - テキスト以外の注釈（rectangle 等）上では編集もズームも行わない（責務分岐表）。
   *
   * controller には新メソッドを足さず、AnnotationEditor 内で `getState().zoom` を見て
   * `zoomToPoint`/`fit` を呼び分ける（境界維持）。マウス環境の `mouse:dblclick` は既存の
   * セットアップで維持される（Req 27.8）。
   */
  const handleDoubleTap = useCallback((payload: GesturePayload) => {
    const canvas = fabricCanvasRef.current;
    if (canvas === null) {
      return;
    }

    // Task 96.3 (round 1 修正) / 115.47: payload.target には依存せず、タップ点の座標から
    // 実ヒットテストで対象を得る（判定は resolveGestureTarget の 1 箇所のみ。長押し側と共用）。
    const target = resolveGestureTarget(canvas, payload) as
      | { type?: string; enterEditing?: () => void }
      | undefined;

    // Req 27.1: テキスト注釈上は従来どおり編集モードへ（後方互換）。ズームはしない。
    // これにより、従来 payload.target=undefined→no-op で実質壊れていたタッチのテキスト編集も
    // 正しく enterEditing へ到達する。
    if (target?.type === 'textAnnotation' || target?.type === 'i-text' || target?.type === 'text') {
      target.enterEditing?.();
      return;
    }

    // Req 33.8: 空き領域（対象なし）または背景画像上のみズームトグルの対象とする。
    // 背景画像は canvas.backgroundImage でありヒットテスト対象外（findTarget は undefined を返す）
    // だが、万一 image オブジェクトがヒットした場合も空き領域扱いとする（防御的）。
    // テキスト以外の注釈の上では編集もズームも行わない。
    const isEmptyArea = target === undefined || target.type === 'image';
    if (!isEmptyArea) {
      return;
    }

    const controller = viewportControllerRef.current;
    if (controller === null) {
      return;
    }

    // controller に新メソッドを足さず、現在ズームを見て拡大↔全体表示を排他に切り替える。
    const tapPoint = { x: payload.clientX, y: payload.clientY };
    if (controller.getState().zoom <= 1 + DOUBLE_TAP_ZOOM_EPSILON) {
      controller.zoomToPoint(tapPoint, DOUBLE_TAP_ZOOM_SCALE);
    } else {
      controller.fit();
    }
  }, []);

  /**
   * Task 72.2 / 115.47 (Req 27.2, 27.9, 27.10): 長押しハンドラ
   *
   * 選択ツール選択中に、長押し点の座標をヒットテスト（`resolveGestureTarget`）して対象が
   * 得られた場合のみコンテキストメニュー state を visible にする（Req 27.2, 27.10）。
   * 通知（GesturePayload）は target を含まないため、対象は必ず座標から解決する。
   * 描画ツール選択中は Req 17 (描画ツール使用中のオブジェクト選択防止) と Req 27.9 に従い
   * コンテキストメニューを表示せず何もしない（ヒットテストも行わない）。
   */
  const handleLongPress = useCallback((payload: GesturePayload) => {
    // Req 27.9 / Req 17: 描画ツール選択中は長押しによるメニュー表示を行わない
    if (activeToolRef.current !== 'select') {
      return;
    }

    const canvas = fabricCanvasRef.current;
    if (canvas === null) {
      return;
    }

    // Task 115.47: payload.target には依存せず、長押し点の座標から実ヒットテストで対象を得る
    // （ダブルタップ側と同一方式。判定は resolveGestureTarget の 1 箇所のみ）。
    const target = resolveGestureTarget(canvas, payload);

    // 防御的: 長押し点に対象が無ければメニューを開かない
    if (!target) {
      return;
    }
    setContextMenu({
      visible: true,
      position: { x: payload.clientX, y: payload.clientY },
      targetObject: target,
    });
  }, []);

  /**
   * Task 72.3 (Req 27.5): コンテキストメニューを閉じる
   *
   * オーバーレイの外タップ、またはアクション実行直後に呼ばれる。state を初期化する。
   */
  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ visible: false, position: null, targetObject: null });
  }, []);

  /**
   * Task 115.104 (Req 28.8): 選択中ツールの再タップで詳細属性パネルを開閉する
   *
   * `AnnotationToolbar` は「現在選択中のツールがもう一度押された」ことだけを通知する。
   * 開閉の状態を持つのは編集画面側であり、ここでトグルする。ツールの選択状態は
   * `handleToolChange` が従来どおり同じツールで更新するため維持される。
   */
  const handleActiveToolReTap = useCallback(() => {
    setState((prev) => ({ ...prev, isStylePanelVisible: !prev.isStylePanelVisible }));
  }, []);

  /**
   * Task 115.82 (Req 6.3): 寸法値の確定
   *
   * 入力された数値と単位を対象の寸法線へ書き込み、線上のラベルとして描画する。
   * `object:modified` を発火して Undo 履歴と自動保存（Task 115.81 の結線）へ反映させる。
   *
   * 数値が空（未入力・空白のみ）の場合は単位も書き込まない。要件6.3 が表示を求めるのは
   * 「数値とオプションの単位」であり、単位は数値に付随する任意要素だからである。
   * `DimensionLine.setDimensionWithLabel` はラベルを `` `${value} ${unit}` `` で組み立てるため、
   * 空の数値をそのまま渡すと `" mm"` のような単位だけのラベルが描かれてしまう。
   * 空の値と空の単位を明示して渡すことで、既に値を持つ寸法線を空で確定した場合も
   * ラベルが確実に消える（`_hasLabel` が false へ戻る）。
   */
  const handleDimensionValueConfirm = useCallback(
    (value: string, unit: string) => {
      const canvas = fabricCanvasRef.current;
      const target = dimensionValueInput?.target ?? null;
      if (canvas && target) {
        const trimmedValue = value.trim();
        const hasValue = trimmedValue !== '';
        target.setDimensionWithLabel(canvas, hasValue ? trimmedValue : '', hasValue ? unit : '');
        target.setCoords();
        canvas.fire('object:modified', { target });
        canvas.renderAll();
      }
      setDimensionValueInput(null);
    },
    [dimensionValueInput]
  );

  /**
   * Task 115.82 (Req 6.2): 寸法値入力のキャンセル
   *
   * 入力欄を閉じるだけで、描画済みの寸法線は残す（値なしの寸法線として扱う）。
   */
  const handleDimensionValueCancel = useCallback(() => {
    setDimensionValueInput(null);
  }, []);

  /**
   * Task 72.3 (Req 27.3, 27.7): コンテキストメニューのアクション実行
   *
   * - edit: テキスト系オブジェクト（text / i-text / textAnnotation）のみ enterEditing() を呼ぶ
   * - duplicate: Fabric v6 の `clone()` は Promise<FabricObject> を返すため、.then で受けて
   *   `{ left: left+20, top: top+20 }` オフセットを set した後 canvas.add + setActiveObject する
   * - delete: canvas.remove(target) でオブジェクトを削除
   *
   * いずれの操作も `useFabricUndoIntegration` が `object:added` / `object:removed` を
   * 自然に捕捉し、Undo 履歴に載せる（Req 27.7）。
   */
  const handleContextMenuAction = useCallback((action: ContextMenuAction, target: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }
    switch (action) {
      case 'edit': {
        const t = target as unknown as { type?: string; enterEditing?: () => void };
        if (t.type === 'text' || t.type === 'i-text' || t.type === 'textAnnotation') {
          t.enterEditing?.();
        }
        break;
      }
      case 'duplicate': {
        const cloneFn = (target as unknown as { clone?: () => Promise<FabricObject> }).clone;
        if (typeof cloneFn !== 'function') {
          break;
        }
        cloneFn.call(target).then((cloned: FabricObject) => {
          cloned.set({
            left: (target.left ?? 0) + 20,
            top: (target.top ?? 0) + 20,
          });
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
          canvas.requestRenderAll();
        });
        break;
      }
      case 'delete': {
        canvas.remove(target);
        canvas.requestRenderAll();
        break;
      }
    }
    // 実行後はメニューを閉じる
    setContextMenu({ visible: false, position: null, targetObject: null });
  }, []);

  /**
   * Fabric.js Canvasの初期化
   *
   * React StrictModeでの二重マウント対応:
   * Canvas要素を動的に生成することで、dispose後の再初期化問題を回避する。
   * Fabric.jsはdispose時にCanvas要素を内部的に変更するため、
   * 同じDOM要素を再利用するとエラーが発生する。
   */
  useEffect(() => {
    if (!canvasWrapperRef.current) {
      return;
    }

    // dispose状態をリセット
    isDisposedRef.current = false;

    let canvas: FabricCanvas | null = null;
    let canvasElement: HTMLCanvasElement | null = null;

    try {
      // コンテナサイズを取得（初期化時に指定）
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = containerRef.current?.clientHeight || 600;

      // Canvas要素を動的に生成（React StrictMode対応）
      // 既存のCanvas要素をクリア（React StrictModeでの二重マウント対応）
      while (canvasWrapperRef.current.firstChild) {
        canvasWrapperRef.current.removeChild(canvasWrapperRef.current.firstChild);
      }
      canvasElement = document.createElement('canvas');
      canvasWrapperRef.current.appendChild(canvasElement);
      canvasElementRef.current = canvasElement;

      // Canvasを初期化（サイズを初期化時に指定）
      // Task 72.1 / design.md「touchGestureManager」の Service Interface の Risks / Decisions
      // （`enablePointerEvents: true` を初手から採用する）: enablePointerEvents を有効化し、
      // touchGestureManager が PointerEvent ベースで多指ジェスチャーを厳密判定できるようにする
      canvas = new FabricCanvas(canvasElement, {
        selection: false, // 背景画像が選択されないように
        renderOnAddRemove: true,
        width: containerWidth,
        height: containerHeight,
        enablePointerEvents: true,
      });

      fabricCanvasRef.current = canvas;

      // Task 72.1 (Req 29.4, 29.5): タッチ/マウス環境に応じたハンドルサイズを設定
      configureHandleSizes();

      // Task 96.1: 新しい canvas を生成したため、initialZoom/initialPan の適用ガードを解除する。
      // 実際の touchGestureManager アタッチと初期ビュー適用は viewportController が
      // 生成された後（setFabricCanvas による再レンダー後）の専用 effect で行う。
      initialViewAppliedRef.current = false;
      // Task 115.83 (Req 5.6): 新しい canvas の等倍値をホストへ通知しないよう、
      // 初期ビュー適用が済むまで表示状態の通知を止める。
      viewReadyRef.current = false;

      // Task 72.2 (Req 27.1, 27.9, 27.10): touchGestureManager が fire する
      // custom:dbltap / custom:longpress に React 側ハンドラを配線する。
      // 既存の mouse:dblclick は setupEventListeners が登録しており、Req 27.8 の
      // マウス従来挙動は維持される。
      // Fabric の on/off はイベント名に union 型を要求するため、型アサーションで回避する。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).on('custom:dbltap', handleDoubleTap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).on('custom:longpress', handleLongPress);

      // Fabric.js と UndoManager の連携用にCanvasを状態に設定
      setFabricCanvas(canvas);

      // E2Eテスト用にwindowオブジェクトにキャンバスを公開
      if (typeof window !== 'undefined') {
        window.__fabricCanvas = canvas;
      }

      // readOnlyモードでなければイベントリスナーを設定
      if (!readOnly) {
        setupEventListeners(canvas);
      }

      // 画像を読み込み
      if (imageUrl) {
        loadImage(canvas, imageUrl);
        prevImageUrlRef.current = imageUrl;
      }
      /* istanbul ignore next -- @preserve Canvas初期化エラー（DOM関連エラー等） */
    } catch (err) {
      console.error('Failed to initialize Fabric.js canvas:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'キャンバスの初期化に失敗しました',
      }));
    }

    // クリーンアップ（dispose処理）
    /* istanbul ignore next -- @preserve クリーンアップ処理はアンマウント時のみ実行 */
    return () => {
      // dispose状態を設定（非同期処理をキャンセル）
      isDisposedRef.current = true;

      // Task 72.4: idle ガイドタイマを破棄（unmount 後の setState を防止）
      if (guideTimerRef.current) {
        clearTimeout(guideTimerRef.current);
        guideTimerRef.current = null;
      }

      // 保存成功メッセージ用のタイマも破棄（unmount 後の setState を防止）
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current);
        saveSuccessTimerRef.current = null;
      }

      // Task 96.1: touchGestureManager の detach は専用 effect（viewportController 依存）の
      // クリーンアップで行うため、ここでは扱わない。

      if (canvas) {
        try {
          // readOnlyモードでなければイベントリスナーを解除
          if (!readOnly) {
            removeEventListeners(canvas);
          }
          // Task 72.2: custom:dbltap / custom:longpress のリスナーを解除
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (canvas as any).off('custom:dbltap', handleDoubleTap);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (canvas as any).off('custom:longpress', handleLongPress);
          // Canvasをdispose
          canvas.dispose();
        } catch (err) {
          console.warn('Error during canvas cleanup:', err);
        }
      }
      // 動的に生成したCanvas要素をDOMから削除
      if (canvasElement && canvasElement.parentNode) {
        canvasElement.parentNode.removeChild(canvasElement);
      }
      fabricCanvasRef.current = null;
      backgroundImageRef.current = null;
      canvasElementRef.current = null;

      // Fabric.js と UndoManager の連携をクリア
      setFabricCanvas(null);

      // E2Eテスト用のwindowオブジェクトをクリア
      if (typeof window !== 'undefined') {
        window.__fabricCanvas = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageUrlの変更は別のuseEffectで対応
  }, [
    loadImage,
    setupEventListeners,
    removeEventListeners,
    readOnly,
    handleDoubleTap,
    handleLongPress,
  ]);

  /**
   * Task 96.1 (Req 27.1, 27.2, 30.1, 33.2-33.5, 34.7): touchGestureManager を canvas に
   * アタッチする。useCanvasViewport が生成した単一の viewportController を
   * options.viewportController として注入し、2本指ピンチ→中点ズーム / 2本指ドラッグ→パンを
   * 同一コントローラ経由で駆動する（ZoomControls とコントローラを共有）。
   *
   * canvas 初期化（setFabricCanvas）後の再レンダーで viewportController が生成されてから
   * 実行する必要があるため、Canvas 生成 effect とは分離する。
   * touchGestureManager は FabricCanvasLike（最小サーフェス）を要求するため構造的に
   * 満たされる形でキャストして渡す。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas || !viewportController) {
      return;
    }
    const gestureManager = createTouchGestureManager();

    /**
     * Task 96.2 (Req 33.7): ジェスチャー終了（cooldown→idle、全指離脱後の復帰タイミング）を
     * getTouchState() のポーリングで検出し、退避していた描画モードを復元する。
     * touchGestureManager は終了コールバックを公開しないため（境界外・変更不可）、
     * 状態ゲッターをポーリングして idle 復帰を捉える。復元値は「退避した描画モード」と
     * 「現在の選択中ツール」の両方を考慮する（ジェスチャー中にツールが変わった場合の安全策）。
     */
    const stopRestorePolling = (): void => {
      if (gestureRestoreTimerRef.current !== null) {
        clearInterval(gestureRestoreTimerRef.current);
        gestureRestoreTimerRef.current = null;
      }
    };
    const startRestorePolling = (): void => {
      stopRestorePolling();
      gestureRestoreTimerRef.current = setInterval(() => {
        if (gestureManager.getTouchState() !== 'idle') {
          return;
        }
        const currentCanvas = fabricCanvasRef.current;
        if (currentCanvas) {
          // 退避した描画モードかつ現在もフリーハンド選択中の場合のみ描画モードへ復帰する。
          currentCanvas.isDrawingMode =
            prevDrawingModeRef.current && activeToolRef.current === 'freehand';
        }
        stopRestorePolling();
      }, COOLDOWN_MS);
    };

    /**
     * Task 96.2 (Req 33.5, 30.1): 2本目の指が追加され two-finger-pinch-pan へ遷移する瞬間に
     * touchGestureManager から発火されるコールバック。進行中の描画を確定せず中断する:
     *   1. 現在の isDrawingMode を退避し、即座に false 化して以後の描画入力を止める
     *   2. 進行中のフリーハンド・ブラシストロークを破棄（中途半端なパスを残さない）
     *   3. シェイプツールの進行中ドラッグ／プレビューも中断・除去する
     *   4. cooldown→idle 復帰で描画モードを戻すためのポーリングを開始する
     */
    const handleGestureStart = (): void => {
      const currentCanvas = fabricCanvasRef.current;
      if (!currentCanvas) {
        return;
      }

      // 1) 描画モードを退避して即時停止
      prevDrawingModeRef.current = currentCanvas.isDrawingMode;
      currentCanvas.isDrawingMode = false;

      // 2) 進行中のブラシストロークを破棄（Fabric PencilBrush の内部点列・トップコンテキスト）
      const brush = currentCanvas.freeDrawingBrush as { _reset?: () => void } | null | undefined;
      brush?._reset?.();
      const drawingSurface = currentCanvas as unknown as {
        _isCurrentlyDrawing?: boolean;
        contextTop?: CanvasRenderingContext2D | null;
        clearContext?: (ctx: CanvasRenderingContext2D) => void;
      };
      drawingSurface._isCurrentlyDrawing = false;
      if (drawingSurface.contextTop && typeof drawingSurface.clearContext === 'function') {
        drawingSurface.clearContext(drawingSurface.contextTop);
      }

      // 3) シェイプツールの進行中ドラッグ／プレビューを中断（誤コミット防止）
      dragStateRef.current = { isDragging: false, startPoint: null };
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        currentCanvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }
      currentCanvas.requestRenderAll?.();

      // 4) ジェスチャー終了（cooldown→idle）での描画モード復帰ポーリングを開始
      startRestorePolling();
    };

    const detach = gestureManager.attach(
      canvas as unknown as import('./gestures/touchGestureManager').FabricCanvasLike,
      () => activeToolRef.current,
      { viewportController, onGestureStart: handleGestureStart }
    );
    touchGestureDetachRef.current = detach;

    return () => {
      stopRestorePolling();
      try {
        detach();
      } catch (err) {
        console.warn('Error during touch gesture manager detach:', err);
      }
      touchGestureDetachRef.current = null;
    };
  }, [fabricCanvas, viewportController]);

  /**
   * Task 98.2 (Req 27.1, 33.8, 33.11): Fabric の内部オフセット（_offset）をスクロール時にも
   * 再計算する。
   *
   * Fabric v7 は `calcOffset` を window の "resize" にのみ自動アタッチし、"scroll" には
   * アタッチしない。一方モバイルでは、テキスト注釈編集の隠し textarea フォーカスや
   * アドレスバー伸縮などでページ/ビジュアルビューポートがスクロールすると、canvas 要素の
   * 画面オフセットが変化する。`_offset` が陳腐化したままだと `findTarget`（ダブルタップ調停・
   * タッチ選択のヒットテスト基準）が誤判定し、テキスト上ダブルタップで編集に入れない／
   * 拡大中の注釈をタップ選択できない等の実バグになる。
   *
   * そこで scroll / visualViewport の resize・scroll で `calcOffset()` を呼び直し、
   * 併せて編集突入（canvas 準備完了）時にも一度再計算して、ヒットテスト基準を実レイアウトに
   * 追従させる。E2E ではこの実経路を検証する（テスト側の calcOffset 直接呼び出しの回避を撤去）。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas) {
      return;
    }
    const recalc = (): void => {
      // dispose 済み canvas への呼び出しを防ぐ。calcOffset 非対応（テストのモック等）も防御。
      if (fabricCanvasRef.current === canvas && typeof canvas.calcOffset === 'function') {
        canvas.calcOffset();
      }
    };
    // 編集突入（canvas 準備完了）時の初回再計算
    recalc();
    // scroll / resize / visualViewport 変化での再計算（遅延的な追従）
    window.addEventListener('scroll', recalc, { passive: true });
    window.addEventListener('resize', recalc);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', recalc);
    vv?.addEventListener('scroll', recalc);
    // 操作直前（touchstart / pointerdown）の capture フェーズで必ず再計算する。
    // scroll イベントはスクロール途中の中間値で発火することがあり、findTarget が参照する
    // 直前の `_offset` が陳腐化したままになり得る。Fabric のハンドラ（bubble フェーズ）より
    // 前に capture で calcOffset を呼ぶことで、各タッチ/ポインタ操作のヒットテスト基準を
    // その瞬間の実レイアウトへ確実に同期する（findTarget 誤判定の根治）。
    window.addEventListener('touchstart', recalc, { capture: true, passive: true });
    window.addEventListener('pointerdown', recalc, { capture: true });
    return () => {
      window.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
      vv?.removeEventListener('resize', recalc);
      vv?.removeEventListener('scroll', recalc);
      window.removeEventListener('touchstart', recalc, { capture: true });
      window.removeEventListener('pointerdown', recalc, { capture: true });
    };
  }, [fabricCanvas]);

  /**
   * Task 96.1 (Req 33.9): props の initialZoom / initialPan を初期ビュー状態として
   * canvas 初期化後に viewportController 経由で一度だけ適用する（REQ-5.6 のビュー状態共有）。
   * ズーム範囲は controller.clampZoom（ZOOM_CONSTANTS）に準拠し、パンは等倍時抑止
   * （isPanEnabled, Req 34.7）に従う。initialZoom/initialPan が未指定の場合は何もしない。
   *
   * Task 115.83 (Req 5.6): 適用の契機を「画像の読み込み完了後」へ改めた。canvas 生成直後は
   * 表示寸法が暫定（コンテナ実寸の当て込み）で、その中心を基準にズームすると復元位置が
   * ずれるためである。あわせてパンを**絶対位置の復元**として扱う。`controller.pan` は
   * 相対量を足す API であり、ズーム適用後の translate は 0 とは限らないため、
   * 現在位置との差分を渡さないと共有された位置を再現できない。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas || !viewportController) {
      return;
    }
    if (initialViewAppliedRef.current) {
      return;
    }
    // 画像読み込み中は表示寸法が確定していないため、確定後に適用する。
    if (state.isLoading) {
      return;
    }
    initialViewAppliedRef.current = true;

    if (initialZoom !== undefined) {
      // 表示領域中央を基準に初期倍率を適用（clampZoom はコントローラ内で担保）。
      const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 };
      viewportController.zoomToPoint(center, initialZoom);
    }
    if (initialPan) {
      // 絶対位置として復元する（等倍時は controller 内部で抑止, Req 34.7）。
      const current = viewportController.getState();
      viewportController.pan(initialPan.x - current.panX, initialPan.y - current.panY);
    }

    // ここまでで新しい canvas の表示状態が確定した。以後の変化はホストへ通知してよい。
    viewReadyRef.current = true;
    reportViewState();
    // initialZoom/initialPan は「初期」値のため、canvas/controller の確定時のみ適用する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricCanvas, viewportController, state.isLoading, reportViewState]);

  /**
   * 画像URLが変更された場合の再読み込み
   */
  useEffect(() => {
    if (!fabricCanvasRef.current) {
      return;
    }

    // 画像URLが変更された場合のみ再読み込み
    if (prevImageUrlRef.current !== imageUrl && imageUrl) {
      loadImage(fabricCanvasRef.current, imageUrl);
      prevImageUrlRef.current = imageUrl;
    }
  }, [imageUrl, loadImage]);

  // surveyIdは将来の機能拡張で使用予定
  void surveyId;

  /**
   * Undo操作ハンドラ
   */
  const handleUndo = useCallback(() => {
    if (undoManager.canUndo()) {
      undoManager.undo();
    }
  }, [undoManager]);

  /**
   * Redo操作ハンドラ
   */
  const handleRedo = useCallback(() => {
    if (undoManager.canRedo()) {
      undoManager.redo();
    }
  }, [undoManager]);

  /**
   * 背景画像に回転を適用し、キャンバスサイズを調整する
   *
   * @param canvas - Fabric.jsキャンバス
   * @param bgImage - 背景画像
   * @param rotation - 適用する回転角度
   *
   * @requirement 22.3
   */
  const applyImageRotation = useCallback(
    (canvas: FabricCanvas, bgImage: FabricImage, rotation: 0 | 90 | 180 | 270): void => {
      // 元画像の自然サイズ（スケール前）
      const naturalWidth = bgImage.width ?? 0;
      const naturalHeight = bgImage.height ?? 0;
      const scale = bgImage.scaleX ?? 1;

      // 90度/270度の場合は幅と高さが入れ替わる
      const isSwapped = rotation === 90 || rotation === 270;
      const canvasWidth = isSwapped ? naturalHeight * scale : naturalWidth * scale;
      const canvasHeight = isSwapped ? naturalWidth * scale : naturalHeight * scale;

      // キャンバスサイズを調整
      canvas.setDimensions({ width: canvasWidth, height: canvasHeight });

      // 背景画像の回転を設定
      bgImage.set({
        angle: rotation,
        originX: 'center',
        originY: 'center',
        left: canvasWidth / 2,
        top: canvasHeight / 2,
      });

      canvas.renderAll();
    },
    []
  );

  /**
   * Task 101.1 (Req 36.1, 36.2, 36.4, 36.8): コンテナ実寸の変化（モバイルブラウザの
   * アドレスバー伸縮・端末回転・レイアウト変化）に追従してキャンバス寸法を再フィットする。
   *
   * design.md「## Requirements 35-36」の「fitの二重性の分離」に従い、本 effect が所有するのは
   * 「画像→コンテナのフィット」＝キャンバス寸法計算（computeFitScale→setDimensions）のみ。
   * viewport の恒等リセット（controller.fit()＝ズーム/パンのリセット）は Req 33-34 が所有し、
   * ここでは呼ぶのみで canvasViewportController の内部実装は変更しない。
   *
   * 再フィットは「等倍表示中または初期化時のみ」適用する。ユーザーがズーム/パン中
   * （controller.getState().zoom が等倍から乖離）は表示状態を保持し再フィットしない
   * （Req 33.7 整合・Req 36.8 非回帰）。
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const bgImage = backgroundImageRef.current;
    // 画像未ロード時（初期化前・dispose 後）は何もしない。
    if (!canvas || !bgImage) {
      return;
    }
    // 実寸未計測（ResizeObserver 非対応環境・初期 0）では再フィットしない。
    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    // ズーム/パン中（等倍でない）はユーザーの表示状態を保持し、再フィットしない（Req 33.7, 36.8）。
    const controller = viewportControllerRef.current;
    const currentZoom = controller ? controller.getState().zoom : 1;
    if (Math.abs(currentZoom - 1) > REFIT_IDENTITY_ZOOM_EPSILON) {
      return;
    }

    // フィット倍率を再算出する（loadImage と同一の padding / allowUpscale 方針）。
    const padding = 48;
    const naturalWidth = bgImage.width || 1;
    const naturalHeight = bgImage.height || 1;
    const scale = computeFitScale({
      imageWidth: naturalWidth,
      imageHeight: naturalHeight,
      containerWidth,
      containerHeight,
      padding,
      allowUpscale: isMobileRef.current,
    });

    // 背景画像のスケールを更新（保存座標は不変。表示のみに作用＝Req 9 後方互換）。
    bgImage.scale(scale);

    // 回転状態を考慮してキャンバス寸法・画像配置を更新する（Req 22 の回転挙動を非回帰）。
    const rotation = imageRotationRef.current;
    if (rotation !== 0) {
      applyImageRotation(canvas, bgImage, rotation);
    } else {
      const scaledWidth = naturalWidth * scale;
      const scaledHeight = naturalHeight * scale;
      bgImage.set({
        originX: 'center',
        originY: 'center',
        left: scaledWidth / 2,
        top: scaledHeight / 2,
      });
      canvas.setDimensions({ width: scaledWidth, height: scaledHeight });
      canvas.renderAll();
    }

    // 等倍/初期化時のみ viewport を恒等へリセットする（Req 33-34 所有の controller.fit を呼ぶのみ）。
    controller?.fit();
  }, [containerSize.width, containerSize.height, applyImageRotation]);

  /**
   * 背景画像を90度時計回りに回転する
   *
   * - 背景画像のangleを90度加算（累積回転）
   * - 90度/270度の場合はキャンバスの幅と高さを入れ替え
   * - 描画済み注釈オブジェクトの位置・サイズは維持（追従しない）
   * - Undo/Redo履歴に回転操作を記録
   *
   * @requirement 22.1, 22.2, 22.3, 22.6, 22.8
   */
  const handleRotate = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const bgImage = backgroundImageRef.current;
    if (!canvas || !bgImage) return;

    // 1. 回転前の状態を保存（Undo用）
    const prevRotation = imageRotationRef.current;

    // 2. 新しい回転角度を計算（0 → 90 → 180 → 270 → 0）
    const newRotation = ((prevRotation + 90) % 360) as 0 | 90 | 180 | 270;
    imageRotationRef.current = newRotation;

    // 3. 背景画像の回転を適用
    applyImageRotation(canvas, bgImage, newRotation);

    // 4. Undo/Redo履歴に記録（pushWithoutExecuteで既に実行済みの操作を記録）
    undoManager.pushWithoutExecute({
      type: 'rotate',
      execute: () => {
        imageRotationRef.current = newRotation;
        applyImageRotation(canvas, bgImage, newRotation);
        setState((prev) => ({ ...prev, imageRotation: newRotation }));
      },
      undo: () => {
        imageRotationRef.current = prevRotation;
        applyImageRotation(canvas, bgImage, prevRotation);
        setState((prev) => ({ ...prev, imageRotation: prevRotation }));
      },
    });

    // 5. 状態を更新
    setState((prev) => ({ ...prev, imageRotation: newRotation }));

    // 6. Task 115.83 (Req 5.6): 回転もモード間で共有する表示状態のひとつ
    reportViewState();

    // 7. Task 115.102 (Req 9.3): 回転角度は注釈データとして保存される（Req 22.4）ため、
    //    保存前に画面を離れると失われる。未保存の編集として数える。
    if (!readOnly) {
      setDirty(true);
    }
  }, [undoManager, applyImageRotation, reportViewState, readOnly, setDirty]);

  /**
   * Task 115.83 (Req 5.4): 閲覧モードの単一ポインタ・ドラッグによるパン操作。
   *
   * design.md「Requirements 33-34」の「既存 ImageViewer（閲覧モード）との差異」は、
   * 1本指（単一ポインタ）パンを閲覧モードの入力割当と定めている（編集モードは1本指を
   * 描画/移動に充てるため2本指パンで代替する）。本ハンドラはその閲覧モード側の割当であり、
   * `readOnly` のときだけコンテナへ結線する。
   *
   * 2本指以上のときは `touchGestureManager` のピンチ/2本指パンに委ね、二重にビューポートを
   * 動かさないよう自前のパンを中断する。移動量は前フレームからの差分で与え、等倍時の抑止と
   * 範囲補正は `canvasViewportController` が担う（Req 34.7）。
   */
  const handleViewerPanPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    viewerPanPointersRef.current.add(event.pointerId);
    if (viewerPanPointersRef.current.size !== 1) {
      // 2本指以上に増えた時点で単一ポインタのパンは中断する。
      viewerPanOriginRef.current = null;
      return;
    }
    // マウスは主ボタンのみ（右クリック等でパンを始めない）。
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const controller = viewportControllerRef.current;
    if (!controller || !controller.isPanEnabled()) {
      return;
    }
    viewerPanOriginRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleViewerPanPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const origin = viewerPanOriginRef.current;
    if (!origin || viewerPanPointersRef.current.size !== 1) {
      return;
    }
    const controller = viewportControllerRef.current;
    if (!controller) {
      return;
    }
    // 前フレームからの差分で動かし、基準点を現在位置へ進める。
    controller.pan(event.clientX - origin.x, event.clientY - origin.y);
    viewerPanOriginRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  /**
   * Task 115.83 (Req 5.4, 5.6): ポインタ操作の終了。
   *
   * 単一ポインタのパンを終了させるだけでなく、**両モードで**確定した表示状態を
   * ホストへ通知する。`touchGestureManager` は 2本指パンの終了コールバックを公開せず、
   * パンは倍率も変えないため、ここで拾わないと編集モードで動かした表示位置が
   * モード切り替えで失われる。倍率の変化は別途 `zoom` の effect が通知する。
   */
  const handleViewerPanPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      viewerPanPointersRef.current.delete(event.pointerId);
      viewerPanOriginRef.current = null;
      reportViewState();
    },
    [reportViewState]
  );

  /**
   * 保存操作ハンドラ
   *
   * REQ-9.1: 全ての注釈データをデータベースに保存する
   * REQ-9.4: 保存中インジケーターを表示する
   * REQ-9.5: エラーメッセージを表示してリトライを促す
   * 注釈保存後、合成済み画像を注釈付きサムネイルへ反映する
   * REQ-23.4: 合成済みサムネイルの更新完了を保証してから保存完了とみなす
   * REQ-23.6: 更新に失敗した場合はエラーを提示し、旧状態が残らないよう再取得を要求する
   */
  const handleSave = useCallback(async () => {
    if (!fabricCanvasRef.current || state.isSaving) return;

    // Task 115.105 (Req 15.6): 通信が切れている間はサーバー保存を実行しない。
    // ボタンの無効化だけでは、無効化されない導線（保存失敗後の再試行、ストレージ警告帯の
    // 「今すぐ保存」）から到達しうるため、実行側でも抑止して理由を提示する。
    if (isServerSaveBlocked) {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        saveSuccess: false,
        saveFailed: false,
        error: offlineWarningMessage,
      }));
      return;
    }

    const canvas = fabricCanvasRef.current;

    // 保存中状態に設定
    setState((prev) => ({
      ...prev,
      isSaving: true,
      error: null,
      saveSuccess: false,
      saveFailed: false,
    }));

    try {
      // 注釈データを構築（キャンバス寸法と回転角度を含める - PDF/サムネイルでのスケール変換・回転用）
      const annotationData = buildAnnotationData(canvas);
      const objects = annotationData.objects;

      // APIを呼び出して保存
      const saveResponse = await saveAnnotation(imageId, { data: annotationData });

      // Task 115.102 (Req 13.5): 保存が成功した時点で操作履歴を捨てる。
      // 保存後も履歴が残っていると、保存前の状態へ「元に戻す」ことができてしまい、
      // その状態のまま次に保存すると、保存済みの注釈がサーバー上から消える。
      // 合成済みサムネイルの更新可否より前に置く。注釈本体は既に確定しており、
      // サムネイル更新の失敗で早期 return する経路でも履歴を残してはならないため。
      undoManager.clear();

      // Task 115.102 (Req 9.3): サーバーへ確定したので未保存の編集は無くなる
      setDirty(false);

      // Task 115.1: 合成済み画像は注釈付きサムネイル（annotatedThumbnailPath）へ保存する。
      // 通常サムネイルはアップロード時の素の画像として不変。
      //
      // Task 115.3 (Req 22.4, 23.2, 23.3): 回転は原本を書き換えず注釈データとして保存される。
      // 回転を反映した画像を持つのは編集画面のキャンバスだけであるため、注釈が0件でも
      // 回転が加えられていれば合成済みサムネイルを生成・更新する必要がある。
      // 逆に注釈も回転も無い場合、合成結果は素のサムネイルと同一の内容にしかならない。
      // この場合は合成済みサムネイルが存在しない状態へ収束させ、表示を素のサムネイルへ
      // 退避させる（Req 22.5, 23.8）。
      const hasRotation = normalizeImageRotation(annotationData.imageRotation ?? 0) !== 0;
      const requiresAnnotatedThumbnail = objects.length > 0 || hasRotation;

      // Task 115.107: 合成済みサムネイルの表示元は、この直後の合成済みサムネイル更新
      // （クライアント合成）だけが決める。注釈保存の応答は表示元を持たない。
      let annotatedThumbnailUrl: string | null = null;
      try {
        if (requiresAnnotatedThumbnail) {
          // キャンバスを画像としてエクスポート（JPEG形式、品質0.9）
          const imageData = canvas.toDataURL({
            format: 'jpeg',
            quality: 0.9,
            multiplier: 1,
          });
          const thumbnailResponse = await updateAnnotatedThumbnail(imageId, imageData);
          annotatedThumbnailUrl = thumbnailResponse.annotatedThumbnailUrl ?? null;
        } else {
          // 既存の合成済みサムネイルを残さない。既に無い場合も成功する（冪等）
          await deleteAnnotatedThumbnail(imageId);
          annotatedThumbnailUrl = null;
        }
      } catch (thumbnailErr) {
        // Task 115.2 / REQ-23.4: 合成済みサムネイルの更新完了を保存完了の条件とするため、
        // 更新に失敗した場合は保存完了（saveSuccess）とみなさない。
        // Task 115.3: 取り消し（存在しない状態への収束）も同じく表示の最新化であるため、
        // 失敗時の扱いは更新と同一とする。
        // REQ-23.6: 失敗を握り潰さず、エラー提示と再取得要求を行う。
        // なお注釈本体は既に保存済みであるため、注釈保存の契約（保存成功）は巻き戻さない。
        console.error('合成済みサムネイルの更新に失敗しました:', thumbnailErr);

        setState((prev) => ({ ...prev, isSaving: false, saveSuccess: false }));

        toast.error(
          '注釈は保存されましたがサムネイル再生成に失敗しました。画面を再読み込みしてください。',
          { duration: 8000 }
        );

        // 旧状態のサムネイルを最新として通知しない
        if (onAnnotationSaved) {
          onAnnotationSaved({ annotatedThumbnailUrl: null });
        }

        // 画像一覧を強制再取得して旧状態残留を防止
        if (onRequestRefresh) {
          onRequestRefresh();
        }

        return;
      }

      // REQ-23.5: 更新後の annotatedThumbnailUrl をコールバックで通知
      if (onAnnotationSaved) {
        onAnnotationSaved({ annotatedThumbnailUrl });
      }

      // Task 115.81 (Req 15.5): サーバーへ確定したのでローカル下書きは未保存ではなくなる。
      // 残したままにすると次回訪問時に復元確認が常時出て、実際の未保存編集と区別できなくなる。
      autoSaveManager.clearLocal(imageId);
      setServerAnnotation({
        data: annotationData,
        updatedAt: saveResponse.updatedAt,
      });
      restorationRef.current?.recheckLocalData();
      // 容量超過の警告帯は手動保存の完了をもって役目を終える（Req 15.8）
      setStorageWarning((prev) => (prev === 'quota-exceeded' ? null : prev));

      // 保存成功
      setState((prev) => ({ ...prev, isSaving: false, saveSuccess: true }));

      // 3秒後に成功メッセージを消す（unmount 後の setState を防ぐため timer 参照を保持）
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current);
      }
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null;
        if (isDisposedRef.current) return;
        setState((prev) => ({ ...prev, saveSuccess: false }));
      }, 3000);
    } catch (err) {
      console.error('注釈の保存に失敗しました:', err);
      // Req 9.5: 誤りを伝えたうえで、同じ操作をやり直す導線（再試行）を出す
      setState((prev) => ({
        ...prev,
        isSaving: false,
        saveFailed: true,
        error: err instanceof Error ? err.message : '注釈の保存に失敗しました',
      }));
    }
  }, [
    imageId,
    state.isSaving,
    isServerSaveBlocked,
    offlineWarningMessage,
    onAnnotationSaved,
    onRequestRefresh,
    toast,
    buildAnnotationData,
    autoSaveManager,
    undoManager,
    setDirty,
  ]);

  // ---------------------------------------------------------------------------
  // Task 115.81: 自動保存・復元基盤の結線（Req 15.4, 15.5, 15.7-15.10）
  // ---------------------------------------------------------------------------

  /**
   * ローカル下書きをキャンバスへ適用する要求を受け取る（Req 15.5）
   *
   * ダイアログ確定時点ではキャンバスや背景画像がまだ準備中でありうるため、要求を参照へ退避し、
   * 準備完了を待つ effect が実際の適用を行う。
   */
  const handleRestoreLocalDraft = useCallback((data: AnnotationDraftData) => {
    pendingRestoreRef.current = data;
    setRestoreRequestId((prev) => prev + 1);
  }, []);

  /**
   * 未保存データ復元フック（Req 15.5）
   *
   * localStorage の下書きとサーバー保存済み注釈を比較し、復元確認ダイアログの表示可否を決める。
   */
  const restoration = useAnnotationRestoration({
    imageId,
    serverAnnotationData: serverAnnotation.data,
    serverUpdatedAt: serverAnnotation.updatedAt,
    autoSaveManager,
    onRestore: handleRestoreLocalDraft,
  });
  // 参照の更新はレンダー中に行わない（React Compiler の制約）。描画後に最新値を載せ替える
  useEffect(() => {
    restorationRef.current = restoration;
  }, [restoration]);

  /**
   * Req 15.8 / 15.9: ストレージ警告帯の購読
   *
   * - QuotaExceededError のリトライ後も保存できなかった場合に容量超過の警告を出す（15.8）
   * - localStorage が使えない環境（SecurityError 等）では自動保存無効の警告を出す（15.9）
   */
  useEffect(() => {
    if (readOnly) {
      return;
    }

    if (
      !suppressPrivateWarningRef.current &&
      (autoSaveManager.isAutoSaveDisabled() || !autoSaveManager.isAutoSaveAvailable())
    ) {
      setStorageWarning('private-browsing');
    }

    autoSaveManager.setOnQuotaExceeded(() => {
      setStorageWarning('quota-exceeded');
    });

    return () => {
      autoSaveManager.setOnQuotaExceeded(null);
    };
  }, [autoSaveManager, readOnly]);

  /**
   * Req 15.4: 注釈編集中の自動保存
   *
   * 注釈の追加・変更・削除を検知し、編集中は一定間隔（既定30秒）で localStorage へ保存する。
   * 描き続けている最中にも保存が起こる（発火条件は AutoSaveManager 側が持つ）。
   * 読み込み・復元由来の object:added は autoSaveReadyRef で除外する。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas || readOnly) {
      return;
    }

    const scheduleAutoSave = () => {
      if (!autoSaveReadyRef.current) {
        return;
      }
      // Req 9.3: 読み込み・復元由来ではないキャンバス変更は未保存の編集である
      setDirty(true);
      autoSaveManager.saveToLocal(imageId, surveyId, buildAnnotationData(canvas));
    };

    canvas.on('object:added', scheduleAutoSave);
    canvas.on('object:modified', scheduleAutoSave);
    canvas.on('object:removed', scheduleAutoSave);

    return () => {
      canvas.off('object:added', scheduleAutoSave);
      canvas.off('object:modified', scheduleAutoSave);
      canvas.off('object:removed', scheduleAutoSave);
    };
  }, [fabricCanvas, readOnly, imageId, surveyId, autoSaveManager, buildAnnotationData, setDirty]);

  /**
   * Req 15.5: 復元確定後にローカル下書きをキャンバスへ適用する
   */
  useEffect(() => {
    if (restoreRequestId === 0 || state.isLoading) {
      return;
    }

    const canvas = fabricCanvasRef.current;
    const draft = pendingRestoreRef.current;
    if (!canvas || !draft) {
      return;
    }
    pendingRestoreRef.current = null;

    let cancelled = false;

    void (async () => {
      // 既存の注釈のみ除去する（背景画像は保持する）
      canvas
        .getObjects()
        .filter((obj) => obj !== backgroundImageRef.current)
        .forEach((obj) => canvas.remove(obj));

      const objects = draft.objects ?? [];
      if (objects.length > 0) {
        const enlivenedObjects = await util.enlivenObjects(objects);
        if (cancelled || isDisposedRef.current || fabricCanvasRef.current !== canvas) {
          return;
        }
        addRestoredAnnotationObjects(
          canvas,
          enlivenedObjects,
          draft.canvasWidth,
          draft.canvasHeight,
          !readOnly && activeToolRef.current === 'select'
        );
      }
      canvas.renderAll();
      // Req 9.3: 復元した下書きはサーバーへ未確定の編集である
      if (!readOnly) {
        setDirty(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restoreRequestId, state.isLoading, readOnly, setDirty]);

  /**
   * アンマウント時に保留中の自動保存タイマーを破棄する
   */
  useEffect(() => {
    return () => {
      autoSaveManager.destroy();
    };
  }, [autoSaveManager]);

  /**
   * エクスポートダイアログを開く
   *
   * REQ-12.1: 個別画像のエクスポートボタンで注釈をレンダリングした画像を生成
   * REQ-12.2: JPEG、PNG形式でのエクスポートをサポート
   * REQ-12.3: エクスポート画像の解像度（品質）を選択可能
   * REQ-12.4: 注釈なしの元画像もダウンロード可能
   */
  const handleExport = useCallback(() => {
    // imageInfoがある場合はダイアログを開く
    if (imageInfo) {
      setIsExportDialogOpen(true);
      return;
    }

    // imageInfoがない場合は従来通りPNG形式でエクスポート
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;

    try {
      // 画像をエクスポート（PNG形式）
      const dataUrl = exportImage(canvas, { format: 'png', quality: 1.0 });

      // ファイル名を生成
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `annotation_${imageId}_${timestamp}.png`;

      // ダウンロード
      downloadFile(dataUrl, filename);
    } catch (err) {
      console.error('画像のエクスポートに失敗しました:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : '画像のエクスポートに失敗しました',
      }));
    }
  }, [imageId, imageInfo]);

  /**
   * ImageExportDialogからのエクスポート実行
   *
   * REQ-12.2: JPEG、PNG形式でのエクスポートをサポート
   * REQ-12.3: エクスポート画像の解像度（品質）を選択可能
   */
  const handleExportWithOptions = useCallback(
    (options: ExportOptions) => {
      if (!fabricCanvasRef.current) return;

      setIsExporting(true);

      try {
        const canvas = fabricCanvasRef.current;

        // 品質の数値変換
        const qualityMap: Record<string, number> = {
          low: 0.6,
          medium: 0.8,
          high: 1.0,
        };
        const quality = qualityMap[options.quality] || 0.8;

        // 画像をエクスポート
        const dataUrl = exportImage(canvas, {
          format: options.format,
          quality,
          includeAnnotations: options.includeAnnotations,
        });

        // ファイル名を生成
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = imageInfo?.fileName?.replace(/\.[^/.]+$/, '') || 'annotation';
        const filename = `${baseName}_${timestamp}.${options.format}`;

        // ダウンロード
        downloadFile(dataUrl, filename);

        // ダイアログを閉じる
        setIsExportDialogOpen(false);
      } catch (err) {
        console.error('画像のエクスポートに失敗しました:', err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : '画像のエクスポートに失敗しました',
        }));
      } finally {
        setIsExporting(false);
      }
    },
    [imageInfo?.fileName]
  );

  /**
   * 元画像ダウンロード
   *
   * REQ-12.4: 注釈なしの元画像もダウンロード可能
   */
  const handleDownloadOriginal = useCallback(async () => {
    if (!imageInfo?.originalUrl) return;

    setIsDownloading(true);

    try {
      await downloadOriginalImage(imageInfo.originalUrl, {
        filename: imageInfo.fileName,
      });
      setIsExportDialogOpen(false);
    } catch (err) {
      console.error('元画像のダウンロードに失敗しました:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : '元画像のダウンロードに失敗しました',
      }));
    } finally {
      setIsDownloading(false);
    }
  }, [imageInfo?.originalUrl, imageInfo?.fileName]);

  /**
   * 注釈データを JSON 形式でエクスポートする（Task 115.102 / Req 9.6）
   *
   * 保存済みの注釈データをサーバーから取得し、JSON ファイルとしてダウンロードさせる。
   * 画像の書き出し（Req 12）とは別の導線であり、注釈そのものの受け渡しに用いる。
   * 保存前の編集内容ではなくサーバー上の確定内容を出す（要件9.6 の対象は「注釈データ」）。
   */
  const handleExportAnnotationJson = useCallback(async () => {
    setIsExportingAnnotationJson(true);

    try {
      const jsonString = await exportAnnotationJson(imageId);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const baseName = imageInfo?.fileName?.replace(/\.[^/.]+$/, '') || `annotation_${imageId}`;
      downloadFile(blob, `${baseName}_annotations.json`);
      setIsExportDialogOpen(false);
    } catch (err) {
      console.error('注釈データのエクスポートに失敗しました:', err);
      const isNotFound = err instanceof ApiError && err.statusCode === 404;
      setState((prev) => ({
        ...prev,
        saveFailed: false,
        error: isNotFound
          ? '保存された注釈データがありません。先に保存してください。'
          : err instanceof Error
            ? err.message
            : '注釈データのエクスポートに失敗しました',
      }));
    } finally {
      setIsExportingAnnotationJson(false);
    }
  }, [imageId, imageInfo?.fileName]);

  /**
   * エクスポートダイアログを閉じる
   */
  const handleCloseExportDialog = useCallback(() => {
    setIsExportDialogOpen(false);
  }, []);

  /**
   * キーボードイベントハンドラ
   *
   * Task 13.3: Delete/Backspace/Escapeキーによるオブジェクト操作
   * - Delete/Backspace: 選択中のオブジェクトを削除
   * - Escape: 選択を解除
   * - Ctrl+Z: Undo操作
   * - Ctrl+Shift+Z / Ctrl+Y: Redo操作
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!fabricCanvasRef.current) return;

      const canvas = fabricCanvasRef.current;
      const activeObject = canvas.getActiveObject();

      // テキスト編集中の場合はキー入力を処理しない（ITextに任せる）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (activeObject && (activeObject as any).isEditing) {
        return;
      }

      // Ctrl+Z: Undo (Shiftなし)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Shift+Z または Ctrl+Y: Redo
      if (
        (event.ctrlKey || event.metaKey) &&
        ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')
      ) {
        event.preventDefault();
        handleRedo();
        return;
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          // 選択中のオブジェクトを削除
          if (activeObject) {
            canvas.remove(activeObject);
            canvas.discardActiveObject();
            canvas.renderAll();
          }
          break;

        case 'Escape':
          // 選択を解除
          if (activeObject) {
            canvas.discardActiveObject();
            canvas.renderAll();
          }
          break;

        /* istanbul ignore next -- @preserve 未処理のキーは無視（defensive coding） */
        default:
          break;
      }
    },
    [handleUndo, handleRedo]
  );

  return (
    <>
      {/* スピナーアニメーション用CSS */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* 全体ラッパー */}
      <div style={STYLES.wrapper}>
        {/* Task 115.105 (Req 15.6): 通信断の告知。切断中は警告を、復帰時は復帰通知を出す。
            閲覧のみのときは保存操作自体が無いため出さない。 */}
        {!readOnly && (
          <div style={STYLES.networkStatusContainer}>
            <NetworkStatusIndicator showReconnected />
          </div>
        )}

        {/* Task 115.81 (Req 15.8, 15.9): ストレージ警告帯。
            - quota-exceeded: 自動保存に失敗したので手動の「今すぐ保存」を促す（15.8）
            - private-browsing: 自動保存を無効化し手動保存のみで動作することを伝える（15.9） */}
        {!readOnly && storageWarning && (
          <div style={STYLES.storageWarningContainer}>
            <StorageWarningBanner
              type={storageWarning}
              onDismiss={(doNotShowAgain) => {
                if (doNotShowAgain) {
                  suppressPrivateWarningRef.current = true;
                }
                setStorageWarning(null);
              }}
              onSaveNow={storageWarning === 'quota-exceeded' ? handleSave : undefined}
              showDoNotShowAgain={storageWarning === 'private-browsing'}
            />
          </div>
        )}

        {/* ツールバー（readOnlyモードでは非表示） */}
        {!readOnly && (
          <div style={STYLES.toolbarContainer}>
            <AnnotationToolbar
              activeTool={state.activeTool}
              onToolChange={handleToolChange}
              onActiveToolReTap={handleActiveToolReTap}
              stylePanelVisible={state.isStylePanelVisible}
              disabled={state.isLoading || state.isSaving}
              styleOptions={state.styleOptions}
              onStyleChange={handleStyleChange}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSave={handleSave}
              saveDisabled={isServerSaveBlocked}
              saveDisabledReason={offlineWarningMessage ?? undefined}
              onExport={handleExport}
              canUndo={state.canUndo}
              canRedo={state.canRedo}
              onRotate={handleRotate}
            />
          </div>
        )}

        {/* コンテナ */}
        <div
          ref={containerRef}
          style={STYLES.container}
          data-testid="annotation-editor-container"
          data-context-menu-visible={contextMenu.visible ? 'true' : 'false'}
          role="application"
          aria-label={readOnly ? '注釈ビューア' : '注釈エディタ'}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={readOnly ? undefined : handleKeyDown}
          /* Task 115.83 (Req 5.4): 閲覧モードのみ単一ポインタ・ドラッグをパンに割り当てる。
             編集モードの1本指は描画/選択に充てるため結線しない（2本指パンで代替）。 */
          onPointerDown={readOnly ? handleViewerPanPointerDown : undefined}
          onPointerMove={readOnly ? handleViewerPanPointerMove : undefined}
          /* 終了側は両モードで結線する。2本指パン（touchGestureManager）の終了もここで
             拾い、確定した表示状態をホストへ共有する（Req 5.6）。 */
          onPointerUp={handleViewerPanPointerUp}
          onPointerCancel={handleViewerPanPointerUp}
          onPointerLeave={handleViewerPanPointerUp}
        >
          {/* Canvas - 動的に生成されるCanvas要素のコンテナ */}
          {/* Task 96.2 (Req 33.5, 30.1): touch-action:none でブラウザ既定ジェスチャーを抑止 */}
          <div
            ref={canvasWrapperRef}
            style={STYLES.canvasWrapper}
            data-testid="annotation-canvas-wrapper"
          />

          {/* ローディング表示 */}
          {state.isLoading && (
            <div style={STYLES.loadingOverlay}>
              <div role="status" aria-label="読み込み中" style={STYLES.spinner} />
            </div>
          )}

          {/* 保存中表示（readOnlyモードでは非表示） */}
          {!readOnly && state.isSaving && (
            <div style={STYLES.savingOverlay} role="status" aria-label="保存中">
              <div style={STYLES.savingSpinner} />
              <span style={STYLES.savingText}>保存中...</span>
            </div>
          )}

          {/* 保存成功表示（readOnlyモードでは非表示） */}
          {!readOnly && state.saveSuccess && (
            <div style={STYLES.successMessage} role="status" aria-label="保存完了">
              <span style={STYLES.successText}>✓ 保存しました</span>
            </div>
          )}

          {/* エラー表示 */}
          {state.error && (
            <div style={STYLES.errorContainer}>
              <div role="alert" style={STYLES.errorMessage} data-testid="annotation-save-error">
                {state.error}
                {/* Task 115.102 (Req 9.5): 保存に失敗したときは再実行の手段を添える。
                    誤りの表示だけでは、ユーザーはもう一度保存する導線を持てない。 */}
                {!readOnly && state.saveFailed && (
                  <div>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={state.isSaving}
                      /* Task 115.105 (Req 15.6): 通信断中は押下を成立させたうえで
                         handleSave が理由を提示して抑止する（aria-disabled で状態を伝える） */
                      aria-disabled={state.isSaving || isServerSaveBlocked}
                      style={{
                        ...STYLES.errorRetryButton,
                        ...(state.isSaving || isServerSaveBlocked
                          ? STYLES.errorRetryButtonDisabled
                          : {}),
                      }}
                      data-testid="save-retry-button"
                    >
                      再試行
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task 72.4 (Req 29.7, 29.8): ツール選択後の簡易ガイドオーバーレイ。
              - 画像領域（container）内に配置し、非侵襲的に表示する。
              - 表示制御は state.activeTool に連動した useEffect の idle タイマが担う。 */}
          <AnnotationGuide
            visible={guideVisible}
            toolKind={state.activeTool}
            onDismiss={() => setGuideVisible(false)}
          />
        </div>
      </div>

      {/* Task 96.1 (Req 34.1, 34.2, 34.6, 34.8): ズーム操作コントロール。
          - Task 115.83 (Req 5.2, 5.3): 閲覧モードでも表示する。要件5 は閲覧時の拡大・縮小・
            回転の手段を求めており、従来の `!readOnly` 条件では閲覧のみの状態で操作手段が
            一切現れず要件を満たさなかった。canvas/画像準備中（isLoading）は非表示。
          - 回転ボタンは閲覧モードのときだけ本コントロールへ載せる。編集モードの回転ボタンは
            Req 22.7 が「既存のツールバーに配置する」と定めており、二重に置かない。
          - position: fixed の下部オーバーレイで、背景 canvas の描画ヒット領域外に配置し、
            stopPropagation/preventDefault により描画の誤発火を防ぐ（ZoomControls 内で実装）。
          - 片手到達（Req 34.6）はレイアウトビューポート＝デバイス幅であることが前提。
            ホスト画面側でページ水平 overflow を抑止すること（SiteSurveyImageViewerPage の
            breadcrumbContainer.overflowX を参照）。
          - controller 未生成（canvas 初期化前）は disabled とする。 */}
      {!state.isLoading && (
        <ZoomControls
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={fit}
          onRotate={readOnly ? handleRotate : undefined}
          disabled={!viewportController}
        />
      )}

      {/* エクスポートダイアログ（REQ-12.2, 12.3, 12.4） */}
      {imageInfo && (
        <ImageExportDialog
          open={isExportDialogOpen}
          imageInfo={imageInfo}
          onExport={handleExportWithOptions}
          onClose={handleCloseExportDialog}
          onDownloadOriginal={handleDownloadOriginal}
          onExportAnnotationJson={handleExportAnnotationJson}
          exporting={isExporting}
          downloading={isDownloading}
          exportingAnnotationJson={isExportingAnnotationJson}
        />
      )}

      {/* Task 115.81 (Req 15.5): 未保存データ復元確認ダイアログ。
          localStorage に自動保存された下書きがある状態で再訪問・リロードすると表示する。 */}
      {!readOnly && (
        <RestoreAnnotationDialog
          isOpen={restoration.showRestoreDialog}
          localSavedAt={restoration.localSavedAtFormatted}
          serverUpdatedAt={restoration.serverUpdatedAtFormatted}
          isLocalNewer={restoration.isLocalNewer}
          hasServerConflict={restoration.hasServerConflict}
          localObjectCount={restoration.localObjectCount}
          serverObjectCount={restoration.serverObjectCount}
          onRestore={restoration.confirmRestore}
          onDiscard={restoration.discardLocal}
          onDismiss={restoration.dismissDialog}
        />
      )}

      {/* Task 115.82 (Req 6.2, 6.3): 寸法値入力欄。
          寸法線を描画した直後に表示し（6.2）、確定した数値と単位を寸法線上へ描く（6.3）。 */}
      {dimensionValueInput && (
        <div style={STYLES.dimensionInputOverlay}>
          <div style={STYLES.dimensionInputAnchor}>
            <DimensionValueInput
              position={dimensionValueInput.position}
              initialValue={dimensionValueInput.initialValue}
              initialUnit={dimensionValueInput.initialUnit}
              onConfirm={handleDimensionValueConfirm}
              onCancel={handleDimensionValueCancel}
            />
          </div>
        </div>
      )}

      {/* 注釈コンテキストメニュー (Task 72.3, Req 27.2-27.5, 27.7) */}
      <AnnotationContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        targetObject={contextMenu.targetObject}
        onAction={handleContextMenuAction}
        onClose={handleContextMenuClose}
      />
    </>
  );
}

export default AnnotationEditor;
