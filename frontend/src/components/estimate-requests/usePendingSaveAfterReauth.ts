/**
 * @fileoverview セッション切れ時の保存自動リトライ用カスタムフック
 *
 * Task 79.1: usePendingSaveAfterReauth カスタムフックの実装
 *
 * Requirements:
 * - 38.1: 受領見積書の保存中にセッション切れが発生した際に編集状態を保持し、
 *         再認証後に保存処理を自動再実行する
 * - 38.6: 再認証成功時に pendingSaveOperationRef を再実行する
 * - 38.7: ログイン画面遷移選択時は pendingSaveOperationRef をクリアして再実行しない
 *
 * Design Reference:
 * - design.md「ReceivedQuotationForm - 改訂4」State Management
 *   `usePendingSaveAfterReauth` カスタムフック（4770-4810）
 *
 * Notes:
 * - 本フックは AuthContext の `sessionExpiredDuringOperation` を購読し、
 *   true → false の遷移エッジを検知して保存処理（pendingRef）を再実行する。
 * - 既存の `SessionExpiredModal`（`ProtectedLayout` でグローバルマウント済み）
 *   と組み合わせて利用する想定。本フック自体はモーダル UI を持たない。
 * - ReceivedQuotationForm への接続は task 79.3 のスコープ。
 *   本タスク（79.1）では Form 本体には接続せず、フック単体の追加のみ行う。
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';

/**
 * ペンディング保存操作（再認証成功後にリトライする関数）
 *
 * Requirements: 38.1
 */
export type PendingSaveOperation = () => Promise<void>;

/**
 * usePendingSaveAfterReauth の戻り値
 */
export interface UsePendingSaveAfterReauthResult {
  /** 保存処理を pendingRef にセットする */
  setPendingSave: (op: PendingSaveOperation) => void;
  /** pendingRef をクリアする */
  clearPendingSave: () => void;
}

/**
 * セッション切れ時の保存自動リトライ用カスタムフック
 *
 * 動作概要:
 * 1. `useAuth().sessionExpiredDuringOperation` を購読する
 * 2. `prevReauthRef` で前回値を保持し、true → false の遷移エッジを検知する
 * 3. 遷移時に `sessionExpired` が false（再認証成功）であれば pendingRef を再実行
 * 4. 遷移時に `sessionExpired` が true（ログイン画面遷移選択）であれば pendingRef をクリア
 *
 * Requirements: 38.1, 38.6, 38.7
 */
export function usePendingSaveAfterReauth(): UsePendingSaveAfterReauthResult {
  const { sessionExpiredDuringOperation, sessionExpired } = useAuth();
  const pendingRef = useRef<PendingSaveOperation | null>(null);
  const prevReauthRef = useRef<boolean>(false);

  useEffect(() => {
    const wasReauthInProgress = prevReauthRef.current;
    prevReauthRef.current = sessionExpiredDuringOperation;

    // 再認証モーダルが閉じた瞬間のみ判定（true → false 遷移）
    if (
      wasReauthInProgress &&
      !sessionExpiredDuringOperation &&
      !sessionExpired &&
      pendingRef.current
    ) {
      const op = pendingRef.current;
      pendingRef.current = null;
      void op();
    }

    // ログイン画面遷移選択時は pending をクリア
    if (sessionExpired && pendingRef.current) {
      pendingRef.current = null;
    }
  }, [sessionExpiredDuringOperation, sessionExpired]);

  const setPendingSave = useCallback((op: PendingSaveOperation) => {
    pendingRef.current = op;
  }, []);

  const clearPendingSave = useCallback(() => {
    pendingRef.current = null;
  }, []);

  return { setPendingSave, clearPendingSave };
}
