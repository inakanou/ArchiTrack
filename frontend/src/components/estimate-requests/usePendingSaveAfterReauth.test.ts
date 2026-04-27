/**
 * @fileoverview usePendingSaveAfterReauth カスタムフックのユニットテスト
 *
 * Task 81.3: ReceivedQuotationForm セッション保護・未保存変更ガード・並び順送信のユニットテスト
 *
 * Requirements:
 * - 38.1: 受領見積書の保存中にセッション切れが発生した際に編集状態を保持し、
 *         再認証後に保存処理を自動再実行する
 * - 38.6: 再認証成功時に pendingSaveOperationRef を再実行する
 * - 38.7: ログイン画面遷移選択時は pendingSaveOperationRef をクリアして再実行しない
 *
 * Source under test:
 * - frontend/src/components/estimate-requests/usePendingSaveAfterReauth.ts
 *   （task 79.1 で実装済み。本ファイルはキャラクタライゼーション/ロックインテスト）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePendingSaveAfterReauth } from './usePendingSaveAfterReauth';

// useAuth のモック値を制御するための可変オブジェクト
const mockAuthState = {
  sessionExpiredDuringOperation: false,
  sessionExpired: false,
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    sessionExpiredDuringOperation: mockAuthState.sessionExpiredDuringOperation,
    sessionExpired: mockAuthState.sessionExpired,
  }),
}));

describe('usePendingSaveAfterReauth (Task 81.3)', () => {
  beforeEach(() => {
    // 各テスト前にモック認証状態を初期化
    mockAuthState.sessionExpiredDuringOperation = false;
    mockAuthState.sessionExpired = false;
    vi.clearAllMocks();
  });

  describe('再認証成功時の自動リトライ (Requirements: 38.1, 38.6)', () => {
    it('sessionExpiredDuringOperation が true → false に遷移し、sessionExpired=false の場合に pending fn が実行される', async () => {
      const pendingFn = vi.fn().mockResolvedValue(undefined);

      // 初期状態: sessionExpiredDuringOperation=false
      const { result, rerender } = renderHook(() => usePendingSaveAfterReauth());

      // pending fn を登録
      act(() => {
        result.current.setPendingSave(pendingFn);
      });

      // 再認証中に遷移
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender();

      // この時点では pending fn は実行されていない
      expect(pendingFn).not.toHaveBeenCalled();

      // 再認証成功（true → false）
      mockAuthState.sessionExpiredDuringOperation = false;
      mockAuthState.sessionExpired = false;
      rerender();

      // pending fn が自動実行されるのを待つ
      await waitFor(() => {
        expect(pendingFn).toHaveBeenCalledTimes(1);
      });
    });

    it('再認証成功後の自動実行で pendingRef がクリアされる（次の遷移では再実行されない）', async () => {
      const pendingFn = vi.fn().mockResolvedValue(undefined);

      const { result, rerender } = renderHook(() => usePendingSaveAfterReauth());

      act(() => {
        result.current.setPendingSave(pendingFn);
      });

      // 1回目: true → false 遷移
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender();
      mockAuthState.sessionExpiredDuringOperation = false;
      mockAuthState.sessionExpired = false;
      rerender();

      await waitFor(() => {
        expect(pendingFn).toHaveBeenCalledTimes(1);
      });

      // 2回目: 再度 true → false 遷移しても pending は既にクリア済みのため呼ばれない
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender();
      mockAuthState.sessionExpiredDuringOperation = false;
      rerender();

      // 引き続き 1 回のみ
      expect(pendingFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('ログイン画面遷移選択時のスキップ (Requirements: 38.7)', () => {
    it('sessionExpired=true 状態での true → false 遷移では pending fn が実行されない', async () => {
      const pendingFn = vi.fn().mockResolvedValue(undefined);

      const { result, rerender } = renderHook(() => usePendingSaveAfterReauth());

      act(() => {
        result.current.setPendingSave(pendingFn);
      });

      // 再認証中に遷移
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender();

      // ログイン画面遷移選択 = sessionExpired=true、かつ
      // sessionExpiredDuringOperation も false に戻る
      mockAuthState.sessionExpired = true;
      mockAuthState.sessionExpiredDuringOperation = false;
      rerender();

      // pending fn は実行されない
      // （await 不要だが、副作用が後続マイクロタスクで起きる可能性に備え一拍待つ）
      await Promise.resolve();
      expect(pendingFn).not.toHaveBeenCalled();
    });

    it('sessionExpired=true への遷移で pendingRef がクリアされる（その後 sessionExpired=false に戻っても再実行されない）', async () => {
      const pendingFn = vi.fn().mockResolvedValue(undefined);

      const { result, rerender } = renderHook(() => usePendingSaveAfterReauth());

      act(() => {
        result.current.setPendingSave(pendingFn);
      });

      // ログイン画面遷移選択（sessionExpired=true）が起きる
      mockAuthState.sessionExpired = true;
      rerender();

      // pendingRef はこの時点でクリアされている（実装上）
      // 後続で再認証中→成功遷移を発生させても pending は呼ばれない
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender();
      mockAuthState.sessionExpiredDuringOperation = false;
      mockAuthState.sessionExpired = false;
      rerender();

      await Promise.resolve();
      expect(pendingFn).not.toHaveBeenCalled();
    });
  });

  describe('clearPendingSave による明示的クリア', () => {
    it('clearPendingSave 後の true → false 遷移では pending fn が実行されない', async () => {
      const pendingFn = vi.fn().mockResolvedValue(undefined);

      const { result, rerender } = renderHook(() => usePendingSaveAfterReauth());

      act(() => {
        result.current.setPendingSave(pendingFn);
      });

      // 明示的にクリア
      act(() => {
        result.current.clearPendingSave();
      });

      // 再認証中→成功遷移
      mockAuthState.sessionExpiredDuringOperation = true;
      rerender();
      mockAuthState.sessionExpiredDuringOperation = false;
      mockAuthState.sessionExpired = false;
      rerender();

      await Promise.resolve();
      expect(pendingFn).not.toHaveBeenCalled();
    });
  });

  describe('pending 未登録時の no-op 動作', () => {
    it('pending fn 未登録の状態で true → false 遷移しても何も起きない（エラーにならない）', () => {
      const { rerender } = renderHook(() => usePendingSaveAfterReauth());

      // setPendingSave 未呼び出しで遷移を発生させる
      mockAuthState.sessionExpiredDuringOperation = true;
      expect(() => rerender()).not.toThrow();

      mockAuthState.sessionExpiredDuringOperation = false;
      mockAuthState.sessionExpired = false;
      expect(() => rerender()).not.toThrow();
    });

    it('pending fn 未登録の状態で sessionExpired=true 遷移しても何も起きない', () => {
      const { rerender } = renderHook(() => usePendingSaveAfterReauth());

      mockAuthState.sessionExpired = true;
      expect(() => rerender()).not.toThrow();
    });
  });
});
