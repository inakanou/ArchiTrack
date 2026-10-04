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
 * タスク 24.3: モバイル幅でのみ「保存」のタップ領域を横断ルールの下限（`TAP_TARGET_MIN_PX`）以上に
 * する（R19.3。利用者の判断（2026-10-04）で看板の配置のダイアログの操作ボタンを対象に含めた）。
 * デスクトップ幅の寸法は変えない。
 *
 * タスク 24.4: 利用者の判断（2026-10-04）で、看板を選んだときに既定の配置を与える。初期配置の
 * 無いときは、表示している既定の矩形を画像px座標へ換算した配置を確定値の初期値とする（ドラッグ等の
 * 操作をせずに保存しても、表示されている位置がそのまま保存される）。従来は確定値が null のまま
 * 残り、看板の指定だけが保存されて印字画像・PDF に看板が重ならなかった。換算は操作後と同じ
 * `displayRectToPlacement` を使う。初期配置があればそれを保ち、看板未指定なら null のままである。
 *
 * タスク 25.1: 利用者の判断（2026-10-04）で、画像の枠の幅を置かれた場所の幅に追従させる。エディタの
 * 外枠の幅を `useElementSize`（ResizeObserver）で測り、画像の枠の枠線の内側に収まる幅を
 * `maxDisplayWidth` の上限へ重ねる（`fitMaxDisplayWidth`）。モバイル幅のダイアログの本体の内側で
 * 実寸の写真（幅 1920 など）を描いても横にはみ出さない（R19.1）。デスクトップ幅では置かれた場所の幅が
 * `maxDisplayWidth` を超えるため表示は変わらない。表示の縮尺が変わるだけで、保存する配置は画像px座標
 * のままである。幅の変化（端末の回転など）で縮尺が変わったとき、ドラッグ等で確定した配置は既定へ
 * 戻さず、新しい縮尺で描き直す（写真・看板の有無・初期配置が変わったときだけ戻す）。
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

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas as FabricCanvas, FabricImage, Rect } from 'fabric';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../../types/construction-photo.types';
import useMediaQuery from '../../hooks/useMediaQuery';
import useElementSize from '../../hooks/useElementSize';
import { MEDIA_QUERIES } from '../../utils/responsive';
import { TAP_TARGET_MIN_PX } from '../../utils/tap-target';
import {
  computeDisplaySize,
  displayRectToPlacement,
  fitMaxDisplayWidth,
  placementToDisplayRect,
} from './signboard-placement-geometry';

// ============================================================================
// 定数
// ============================================================================

/** プレビューの既定最大表示幅（px） */
const DEFAULT_MAX_DISPLAY_WIDTH = 600;

/** 画像の枠の枠線の太さ（px）。枠の幅は外枠の幅からこの左右の分を除いた幅に収める（タスク 25.1） */
const CANVAS_FRAME_BORDER_PX = 1;

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
  /** プレビューの最大表示幅（px、既定 600）。置かれた場所の幅が狭ければさらに縮める（タスク 25.1） */
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
    border: `${CANVAS_FRAME_BORDER_PX}px solid #d1d5db`,
    borderRadius: '4px',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  } as React.CSSProperties,
  // flexWrap:wrap と badge の overflowWrap:anywhere は、区切りの無い長い工事件名（英数字の一語）でも
  // 操作列を画面幅に収めるためのもの。これが無いと 375 幅でバッジが一行に広がり、案内文が幅 24px の
  // 縦長に潰れ、「保存」が画面外（right=611）へ押し出される（タスク 20.4 の E2E で実測, R19.1）。
  // デスクトップ幅では普通の長さの件名は一行に収まり、配置は変わらない
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
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
    overflowWrap: 'anywhere' as const,
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
  // モバイル幅でのみ合成するタップ領域の下限（R19.3, タスク 24.3。看板の配置のダイアログの
  // 「キャンセル」・写真項目の操作ボタンと同じ出所）。デスクトップ幅の寸法は変えない
  saveButtonMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
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
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const rectRef = useRef<Rect | null>(null);

  // 最新のコールバックを ref に保持（fabric ハンドラの再登録を避ける）
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // 置かれた場所の幅（エディタの外枠の幅）。未計測（0）のときは maxDisplayWidth で描く（タスク 25.1）
  const { width: containerWidth } = useElementSize(containerRef);
  const displayWidthLimit = fitMaxDisplayWidth(
    maxDisplayWidth,
    containerWidth > 0 ? containerWidth - CANVAS_FRAME_BORDER_PX * 2 : null
  );
  const displaySize = computeDisplaySize(photo.width, photo.height, displayWidthLimit);
  const scale = displaySize.scale;

  // 確定用に最新 placement を保持（保存操作で参照）。
  // ref は fabric ハンドラから同期的に更新し、レンダリングに依存させない。
  // 初期配置の無いときに表示する既定の矩形と、それを画像px座標へ換算した既定の配置（タスク 24.4）。
  // 看板を選んだまま操作せずに保存しても、表示している位置がそのまま保存される
  const defaultRect = useMemo(
    () => defaultDisplayRect(displaySize.width, displaySize.height),
    [displaySize.width, displaySize.height]
  );
  const defaultPlacement = useMemo(
    () => displayRectToPlacement(defaultRect, scale, photo.width, photo.height),
    [defaultRect, scale, photo.width, photo.height]
  );
  const placementRef = useRef<SignboardPlacement | null>(
    signboard ? (initialPlacement ?? defaultPlacement) : null
  );
  // ドラッグ等の操作で確定値を作ったか（タスク 25.1）。立っている間は、幅の変化で縮尺が変わっても
  // 確定値を既定へ戻さず、枠もその配置で描き直す。写真・看板の有無・初期配置が変わると下ろす
  const modifiedRef = useRef(false);

  const backgroundUrl = photo.thumbnailUrl ?? photo.printImageUrl;
  const hasSignboard = signboard !== null;

  // 確定値を戻す契機（写真・看板の有無・初期配置）の前回の値
  const syncInputsRef = useRef({
    photoId: photo.id,
    photoWidth: photo.width,
    photoHeight: photo.height,
    hasSignboard,
    initialPlacement,
  });

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
      modifiedRef.current = true;
      onChangeRef.current?.(next);
    },
    [scale, photo.width, photo.height]
  );

  // 看板の有無・初期配置が変われば確定値を同期（未指定は null、初期配置が無ければ既定の配置）。
  // 縮尺だけが変わった（置かれた場所の幅の変化）ときは、操作で作った確定値を保つ（タスク 25.1）。
  // キャンバスの構築より先に走らせ、構築が下ろした後の印を読むようにする
  useEffect(() => {
    const prev = syncInputsRef.current;
    const inputsChanged =
      prev.photoId !== photo.id ||
      prev.photoWidth !== photo.width ||
      prev.photoHeight !== photo.height ||
      prev.hasSignboard !== hasSignboard ||
      prev.initialPlacement !== initialPlacement;
    syncInputsRef.current = {
      photoId: photo.id,
      photoWidth: photo.width,
      photoHeight: photo.height,
      hasSignboard,
      initialPlacement,
    };
    if (inputsChanged) modifiedRef.current = false;
    if (modifiedRef.current) return;
    placementRef.current = hasSignboard ? (initialPlacement ?? defaultPlacement) : null;
  }, [photo.id, photo.width, photo.height, hasSignboard, initialPlacement, defaultPlacement]);

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
      // 操作で作った確定値があればそれを新しい縮尺で描く（幅の変化で既定へ戻さない, タスク 25.1）
      const displayRect =
        modifiedRef.current && placementRef.current
          ? placementToDisplayRect(placementRef.current, scale)
          : initialPlacement
            ? placementToDisplayRect(initialPlacement, scale)
            : defaultRect;

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
    // defaultRect は表示の寸法から導出されるため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    photo.id,
    photo.width,
    photo.height,
    backgroundUrl,
    hasSignboard,
    initialPlacement,
    displaySize.width,
    displaySize.height,
    scale,
    emitFromRect,
  ]);

  const handleSave = useCallback(() => {
    onSaveRef.current?.(hasSignboard ? placementRef.current : null);
  }, [hasSignboard]);

  return (
    <div ref={containerRef} style={styles.container} data-testid="signboard-placement-editor">
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
        <button
          type="button"
          style={{
            ...styles.saveButton,
            ...(isMobile ? styles.saveButtonMobile : {}),
          }}
          onClick={handleSave}
        >
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
