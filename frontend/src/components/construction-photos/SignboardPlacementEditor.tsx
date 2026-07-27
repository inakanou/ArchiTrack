/**
 * @fileoverview 看板配置エディタ
 *
 * Task 6.4: 看板配置エディタ
 *
 * 写真背景の上に「1枚の緑ボード Rect」を重ね、ドラッグ移動・ハンドル拡縮で
 * 位置と大きさを指定する軽量な fabric エディタ。ユーザー操作後、表示座標を
 * 画像ピクセル座標へ換算して {@link SignboardPlacement} を算出し、onChange/onSave
 * で返す。看板未指定（signboard=null）は Rect を表示せず placement=null を許容する。
 *
 * 座標換算は純関数 {@link module:components/construction-photos/signboard-placement-geometry}
 * に集約し、本コンポーネントは fabric 連携とコールバック契約のみを担う。
 *
 * Requirements:
 * - 9.1: 看板の表示位置・大きさを画像ピクセル座標で確定する
 * - 9.2: 看板の指定は任意（未指定を許可）
 * - 9.3: プレビュー上でドラッグして表示位置を移動する
 * - 9.4: プレビュー上で大きさを拡大・縮小する
 * - 9.5: 保存操作で看板・位置・大きさを確定する
 * - 9.6: 看板が指定されていることを識別可能に表示する
 *
 * Boundary: SignboardPlacementEditor
 *
 * @module components/construction-photos/SignboardPlacementEditor
 */

import { useCallback, useEffect, useRef } from 'react';
import { Canvas as FabricCanvas, FabricImage, Rect } from 'fabric';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../../types/construction-photo.types';
import {
  computeDisplaySize,
  displayRectToPlacement,
  placementToDisplayRect,
} from './signboard-placement-geometry';

// ============================================================================
// 定数
// ============================================================================

/** プレビューの既定最大表示幅（px） */
const DEFAULT_MAX_DISPLAY_WIDTH = 600;

/** 緑ボードの塗り（電子小黒板の濃緑・半透明で背景写真を透過確認可能に） */
const BOARD_FILL = 'rgba(0, 77, 38, 0.55)';
const BOARD_STROKE = '#ffffff';

// ============================================================================
// Props
// ============================================================================

export interface SignboardPlacementEditorProps {
  /** 対象の写真項目（背景・画像実寸の供給元） */
  photo: ConstructionPhotoWithUrls;
  /** 配置する工事看板。未指定（null）なら Rect を表示せず placement=null を許容 */
  signboard: ConstructionSignboard | null;
  /** 既存配置（あれば表示座標へ復元して Rect を初期配置） */
  initialPlacement?: SignboardPlacement | null;
  /** プレビューの最大表示幅（px、既定 600） */
  maxDisplayWidth?: number;
  /** ドラッグ/拡縮のたびに算出した画像px座標の placement を通知 */
  onChange?: (placement: SignboardPlacement | null) => void;
  /** 保存操作時に確定した placement を通知（看板未指定なら null） */
  onSave?: (placement: SignboardPlacement | null) => void;
}

// ============================================================================
// スタイル
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  canvasWrapper: {
    position: 'relative' as const,
    lineHeight: 0,
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  } as React.CSSProperties,
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '9999px',
    backgroundColor: '#065f46',
    color: '#ffffff',
    fontSize: '12px',
  } as React.CSSProperties,
  hint: {
    color: '#6b7280',
    fontSize: '12px',
  } as React.CSSProperties,
  saveButton: {
    padding: '6px 16px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 看板配置エディタ本体。
 */
export default function SignboardPlacementEditor({
  photo,
  signboard,
  initialPlacement = null,
  maxDisplayWidth = DEFAULT_MAX_DISPLAY_WIDTH,
  onChange,
  onSave,
}: SignboardPlacementEditorProps): React.ReactElement {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const rectRef = useRef<Rect | null>(null);

  // 最新のコールバックを ref に保持（fabric ハンドラの再登録を避ける）
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const displaySize = computeDisplaySize(photo.width, photo.height, maxDisplayWidth);
  const scale = displaySize.scale;

  // 確定用に最新 placement を保持（保存操作で参照）。
  // ref は fabric ハンドラから同期的に更新し、レンダリングに依存させない。
  const placementRef = useRef<SignboardPlacement | null>(signboard ? initialPlacement : null);

  const backgroundUrl = photo.thumbnailUrl ?? photo.printImageUrl;
  const hasSignboard = signboard !== null;

  /** Rect の現在の表示座標から画像px placement を算出して通知・保持する */
  const emitFromRect = useCallback(
    (rect: Rect) => {
      const next = displayRectToPlacement(
        {
          left: rect.left ?? 0,
          top: rect.top ?? 0,
          width: rect.width ?? 0,
          height: rect.height ?? 0,
          scaleX: rect.scaleX ?? 1,
          scaleY: rect.scaleY ?? 1,
        },
        scale,
        photo.width,
        photo.height
      );
      placementRef.current = next;
      onChangeRef.current?.(next);
    },
    [scale, photo.width, photo.height]
  );

  // fabric キャンバスの初期化と Rect 配置。写真・看板・初期配置・表示幅の変化で再構築。
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const canvas = new FabricCanvas(el);
    canvasRef.current = canvas;
    canvas.setDimensions({ width: displaySize.width, height: displaySize.height });

    let disposed = false;

    // 背景写真を読み込んで敷く
    FabricImage.fromURL(backgroundUrl)
      .then((img) => {
        if (disposed) return;
        img.set({ selectable: false, evented: false, left: 0, top: 0 });
        img.scaleToWidth(displaySize.width);
        canvas.backgroundImage = img;
        canvas.requestRenderAll();
      })
      .catch(() => {
        /* 背景読込失敗時も配置操作は継続可能（背景なしで描画） */
      });

    // 看板ありのときのみ 1 枚の緑ボード Rect を配置
    if (hasSignboard) {
      const displayRect = initialPlacement
        ? placementToDisplayRect(initialPlacement, scale)
        : defaultDisplayRect(displaySize.width, displaySize.height);

      const rect = new Rect({
        left: displayRect.left,
        top: displayRect.top,
        width: displayRect.width,
        height: displayRect.height,
        scaleX: 1,
        scaleY: 1,
        fill: BOARD_FILL,
        stroke: BOARD_STROKE,
        strokeWidth: 2,
        strokeUniform: true,
        cornerColor: '#ffffff',
        transparentCorners: false,
        lockRotation: true,
      });
      rectRef.current = rect;
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.requestRenderAll();

      // ドラッグ移動・拡縮の確定で placement を再算出
      const handleModified = (e: { target?: unknown }): void => {
        const target = (e?.target as Rect | undefined) ?? rectRef.current;
        if (target) emitFromRect(target);
      };
      canvas.on('object:modified', handleModified);
    } else {
      rectRef.current = null;
    }

    return () => {
      disposed = true;
      canvas.off('object:modified');
      rectRef.current = null;
      canvasRef.current = null;
      canvas.dispose();
    };
    // displaySize は photo/maxDisplayWidth から導出されるため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    photo.id,
    photo.width,
    photo.height,
    backgroundUrl,
    hasSignboard,
    initialPlacement,
    maxDisplayWidth,
    scale,
    emitFromRect,
  ]);

  // 看板の有無・初期配置が変われば確定値を同期（未指定は null）
  useEffect(() => {
    placementRef.current = hasSignboard ? initialPlacement : null;
  }, [hasSignboard, initialPlacement]);

  const handleSave = useCallback(() => {
    onSaveRef.current?.(hasSignboard ? placementRef.current : null);
  }, [hasSignboard]);

  return (
    <div style={styles.container} data-testid="signboard-placement-editor">
      <div style={styles.canvasWrapper}>
        <canvas ref={canvasElRef} />
      </div>
      <div style={styles.toolbar}>
        {hasSignboard ? (
          <span style={styles.badge} data-testid="signboard-indicator">
            看板: {signboard.workName || '未設定'}
          </span>
        ) : (
          <span style={styles.hint}>看板は未指定です（配置なしで保存できます）</span>
        )}
        {hasSignboard && (
          <span style={styles.hint}>ドラッグで移動、ハンドルで大きさを調整できます</span>
        )}
        <button type="button" style={styles.saveButton} onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ヘルパー
// ============================================================================

/** 初期配置が無い場合の既定 Rect（表示領域の中央付近に控えめなサイズで配置） */
function defaultDisplayRect(
  displayWidth: number,
  displayHeight: number
): { left: number; top: number; width: number; height: number } {
  const width = displayWidth * 0.4;
  const height = displayHeight * 0.25;
  return {
    left: (displayWidth - width) / 2,
    top: (displayHeight - height) / 2,
    width,
    height,
  };
}
