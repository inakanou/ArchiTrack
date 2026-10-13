/**
 * @fileoverview 見積書の編集セッション（在席情報）フック
 *
 * 見積書詳細画面は常時編集の画面（estimate-creation REQ-27.1）であり、開いている間が
 * そのまま「編集中」である。本フックは画面を開いている間、在席を一定間隔で通知し、
 * 応答に含まれる「編集中の他の利用者」を返す。画面はそれを警告として表示する（REQ-11.7）。
 *
 * - マウント時に即時に通知し、以後は `ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS` ごとに通知する
 * - タブが前面へ戻ったとき（`visibilitychange`）にも即時に通知する。バックグラウンドの
 *   タブではブラウザがタイマーを間引くため、戻った直後の表示を最新にする
 * - アンマウント時（アプリ内の画面遷移）に退出を通知する。タブを閉じる・再読み込み・
 *   アプリ外への移動ではアンマウントが走らないため、`pagehide` で `keepalive` 付きの退出を送る。
 *   それでも退出が届かないとき（通信断・ブラウザの強制終了など）は、サーバーの TTL を
 *   過ぎた時点で相手の画面から警告が消える
 * - 403（estimate:update を持たない）・404（見積書なし）を受けたら通知をやめる
 *   （編集できない利用者は編集中と数えない）
 * - 通信エラーのときは直前の表示を保つ（相手の在否について新しい情報が無いため）
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module hooks/useEstimateEditPresence
 */

import { useEffect, useState } from 'react';
import {
  heartbeatEstimateEditSession,
  leaveEstimateEditSession,
  type EstimateOtherEditor,
} from '../api/estimates';
import { ApiError } from '../api/client';

/**
 * 在席を通知する間隔（ミリ秒）
 *
 * バックエンドの `ESTIMATE_EDIT_SESSION_HEARTBEAT_INTERVAL_SECONDS` と同じ値。
 * サーバーの TTL（90 秒）はこの間隔の 3 倍以上に取ってある。
 */
export const ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;

export interface UseEstimateEditPresenceReturn {
  /** 編集中の他の利用者（在席を通知している順） */
  otherEditors: EstimateOtherEditor[];
}

const EMPTY: EstimateOtherEditor[] = [];

/**
 * 見積書の編集セッションへ在席を通知し、編集中の他の利用者を返す
 *
 * @param estimateId - 見積書ID。未確定（undefined / 空文字）の間は何もしない
 */
export function useEstimateEditPresence(
  estimateId: string | undefined
): UseEstimateEditPresenceReturn {
  const [otherEditors, setOtherEditors] = useState<EstimateOtherEditor[]>(EMPTY);

  useEffect(() => {
    if (!estimateId) {
      return undefined;
    }

    let active = true;
    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stop = (): void => {
      stopped = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    /** 退出を通知する。失敗は無視する（TTL で失効する） */
    const leaveQuietly = (options?: { keepalive?: boolean }): void => {
      try {
        void Promise.resolve(leaveEstimateEditSession(estimateId, options)).catch(() => undefined);
      } catch {
        // 送信を始められなかった場合も TTL で失効する
      }
    };

    const beat = async (): Promise<void> => {
      if (stopped) return;
      try {
        const response = await heartbeatEstimateEditSession(estimateId);
        if (!active) return;
        setOtherEditors(Array.isArray(response?.otherEditors) ? response.otherEditors : EMPTY);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 404)) {
          stop();
          setOtherEditors(EMPTY);
        }
        // それ以外（通信エラー等）は直前の表示を保つ
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void beat();
      }
    };

    // タブを閉じる・再読み込み・アプリ外への移動（アンマウントが走らない）。
    // 文書が破棄される前に送信を始めるため、同期的に呼び出す。
    // ページが戻る（bfcache から復元される）場合は、次の定期通知で在席を記録し直す。
    const handlePageHide = (): void => {
      if (stopped) return;
      leaveQuietly({ keepalive: true });
    };

    void beat();
    intervalId = setInterval(() => {
      void beat();
    }, ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      active = false;
      const wasStopped = stopped;
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      setOtherEditors(EMPTY);
      if (!wasStopped) {
        leaveQuietly();
      }
    };
  }, [estimateId]);

  return { otherEditors };
}
