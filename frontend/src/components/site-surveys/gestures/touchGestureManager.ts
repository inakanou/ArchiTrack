/**
 * touchGestureManager (Req 27.1, 27.2, 27.6, 27.7, 27.9, 27.10, 30.1-30.8)
 *
 * Fabric Canvas にアタッチし、PointerEvent を listen して以下のジェスチャーを
 * 判定・発火する:
 *   - ダブルタップ: canvas.fire('custom:dbltap', GesturePayload)
 *   - 長押し: canvas.fire('custom:longpress', GesturePayload)
 *
 * 状態遷移:
 *   idle
 *     ↔ one-finger-down (1 本指 pointerdown)
 *         ↔ drawing (DRAG_THRESHOLD_PX を超える pointermove)
 *     ↔ two-finger-pinch-pan (2 本指)
 *     ↔ three-plus-suspend (3 本指以上)
 *     ↔ cooldown (マルチタッチ解除後 COOLDOWN_MS 間の描画抑止)
 *
 * 設計根拠:
 *   - `enablePointerEvents: true` を前提に、TouchEvent 併用は行わない（Req 30.2 の
 *     3 本指以降の厳密判定のため PointerEvent で一本化）
 *   - ImageViewer.tsx の既存 TouchEvent 処理とは独立（重複発火を避けるため pointer* のみ）
 *   - 閾値は gesture-thresholds.ts に集約（DRY / UX レビュー容易化）
 *
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-27.2
 * @requirement site-survey/REQ-27.6
 * @requirement site-survey/REQ-30.1
 * @requirement site-survey/REQ-30.2
 * @requirement site-survey/REQ-30.3
 * @requirement site-survey/REQ-30.6
 * @requirement site-survey/REQ-30.7
 * @requirement site-survey/REQ-30.8
 */
import { COOLDOWN_MS, DOUBLE_TAP_MS, DRAG_THRESHOLD_PX, LONG_PRESS_MS } from './gesture-thresholds';

/**
 * Fabric Canvas のうち、touchGestureManager が依存する最小 API サーフェス。
 * 本モジュールはジェスチャー検出のみ担当し、Fabric の内部型に過度に結合しない。
 */
export interface FabricCanvasLike {
  fire(eventName: string, options: GesturePayload): void;
  getElement(): HTMLCanvasElement;
}

/**
 * canvas.fire() の payload。
 * AnnotationContextMenu や各ツールは pointerType / currentTool で分岐を行う。
 */
export interface GesturePayload {
  pointerType: 'touch' | 'mouse' | 'pen';
  clientX: number;
  clientY: number;
  target?: unknown;
  currentTool: string;
}

/**
 * タッチ状態。System Flows の stateDiagram に準拠。
 */
export type TouchState =
  | 'idle'
  | 'one-finger-down'
  | 'drawing'
  | 'two-finger-pinch-pan'
  | 'three-plus-suspend'
  | 'cooldown';

export interface TouchGestureManager {
  /**
   * Fabric Canvas にアタッチする。
   * @returns detach 関数。unmount 時に必ず呼び出し、リスナー・タイマーを解放する。
   */
  attach(canvas: FabricCanvasLike, getCurrentTool: () => string): () => void;
  getTouchState(): TouchState;
}

/**
 * ダブルタップ判定用の直前タップ情報。
 */
interface LastTapRecord {
  time: number;
  x: number;
  y: number;
}

/**
 * PointerEvent 由来の pointerType を GesturePayload の型に正規化する。
 * 空文字列（古い実装）は 'touch' とみなす。
 */
const normalizePointerType = (raw: string): GesturePayload['pointerType'] => {
  if (raw === 'mouse' || raw === 'pen') return raw;
  return 'touch';
};

export const createTouchGestureManager = (): TouchGestureManager => {
  let touchState: TouchState = 'idle';
  const activePointers = new Map<
    number,
    { x: number; y: number; startX: number; startY: number }
  >();
  let lastTap: LastTapRecord | null = null;
  let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  let cooldownTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearLongPressTimer = (): void => {
    if (longPressTimeout !== null) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  };

  const clearCooldownTimer = (): void => {
    if (cooldownTimeout !== null) {
      clearTimeout(cooldownTimeout);
      cooldownTimeout = null;
    }
  };

  const clearAllTimers = (): void => {
    clearLongPressTimer();
    clearCooldownTimer();
  };

  /**
   * attach 呼び出し 1 回分の状態管理と listener を構築する。
   * 多重 attach は想定しない（single owner）。
   */
  const attach = (canvas: FabricCanvasLike, getCurrentTool: () => string): (() => void) => {
    const element = canvas.getElement();

    /**
     * GesturePayload を組み立てる。currentTool は発火時の値を取得する（Req 17 連携）。
     */
    const buildPayload = (event: PointerEvent): GesturePayload => ({
      pointerType: normalizePointerType(event.pointerType),
      clientX: event.clientX,
      clientY: event.clientY,
      currentTool: getCurrentTool(),
    });

    const handlePointerDown = (event: PointerEvent): void => {
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      });

      const count = activePointers.size;

      if (count >= 3) {
        // Req 30.2: 3 本指以上は全てサスペンド
        clearAllTimers();
        touchState = 'three-plus-suspend';
        return;
      }

      if (count === 2) {
        // Req 30.1: 2 本指は進行中の描画を中止しピンチ/パンモードへ
        clearLongPressTimer();
        touchState = 'two-finger-pinch-pan';
        return;
      }

      // 1 本指: ダブルタップ判定 → one-finger-down 遷移 → 長押しタイマ開始
      const now = Date.now();
      if (
        lastTap !== null &&
        now - lastTap.time <= DOUBLE_TAP_MS &&
        Math.abs(event.clientX - lastTap.x) <= DRAG_THRESHOLD_PX &&
        Math.abs(event.clientY - lastTap.y) <= DRAG_THRESHOLD_PX
      ) {
        // ダブルタップ検出: Req 27.1 / 27.6
        canvas.fire('custom:dbltap', buildPayload(event));
        lastTap = null;
        clearLongPressTimer();
        touchState = 'idle';
        return;
      }

      touchState = 'one-finger-down';
      clearLongPressTimer();

      longPressTimeout = setTimeout(() => {
        // Req 27.2 / 27.6: 500ms 保持で長押し発火
        // PointerEvent 由来情報がタイマ発火時にも必要なため、event を closure でキャプチャ
        if (touchState === 'one-finger-down') {
          canvas.fire('custom:longpress', buildPayload(event));
        }
        longPressTimeout = null;
      }, LONG_PRESS_MS);
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const pointer = activePointers.get(event.pointerId);
      if (pointer === undefined) {
        return;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (touchState === 'one-finger-down') {
        const dx = event.clientX - pointer.startX;
        const dy = event.clientY - pointer.startY;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
          // Req 30.8: 単一指のドラッグ継続で drawing 状態へ
          clearLongPressTimer();
          touchState = 'drawing';
        }
      }
    };

    /**
     * cooldown → idle への遷移。Req 30.3 の 150ms 抑止を実装。
     */
    const startCooldown = (): void => {
      touchState = 'cooldown';
      clearCooldownTimer();
      cooldownTimeout = setTimeout(() => {
        touchState = 'idle';
        cooldownTimeout = null;
      }, COOLDOWN_MS);
    };

    const handlePointerUp = (event: PointerEvent): void => {
      const pointer = activePointers.get(event.pointerId);
      activePointers.delete(event.pointerId);

      const remaining = activePointers.size;

      if (touchState === 'three-plus-suspend') {
        if (remaining === 0) {
          // 全指離れた: Req 30.3 cooldown へ
          clearAllTimers();
          startCooldown();
        }
        // まだ指が残っている場合は three-plus-suspend のまま
        return;
      }

      if (touchState === 'two-finger-pinch-pan') {
        if (remaining === 0) {
          clearAllTimers();
          startCooldown();
        } else if (remaining === 1) {
          // 1 本残った: Req 30.3 の cooldown 経由で再開許可
          clearAllTimers();
          startCooldown();
        }
        return;
      }

      if (touchState === 'drawing') {
        clearLongPressTimer();
        touchState = 'idle';
        return;
      }

      if (touchState === 'one-finger-down') {
        // シングルタップ: 次のダブルタップ判定に備えて lastTap を更新
        clearLongPressTimer();
        if (pointer !== undefined) {
          lastTap = {
            time: Date.now(),
            x: pointer.startX,
            y: pointer.startY,
          };
        }
        touchState = 'idle';
        return;
      }

      // cooldown / idle で来た場合は状態を変更しない（防御的）
    };

    const handlePointerCancel = (_event: PointerEvent): void => {
      // Req 30.8: 異常終了時は即座に idle 化
      activePointers.clear();
      clearAllTimers();
      touchState = 'idle';
      lastTap = null;
    };

    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerCancel);
      clearAllTimers();
      activePointers.clear();
      lastTap = null;
      touchState = 'idle';
    };
  };

  return {
    attach,
    getTouchState: () => touchState,
  };
};
