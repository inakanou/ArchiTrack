/**
 * @fileoverview useToastフックのテスト
 *
 * Task 13.1: トースト通知の統合
 *
 * Requirements:
 * - 18.4: 操作成功時のToastNotification表示
 * - 18.5: 操作失敗時のToastNotification表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { ToastProvider } from '../../components/ToastProvider';
import { useToast } from '../../hooks/useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  describe('基本機能', () => {
    it('ToastProvider内で使用した場合、コンテキストの値を返す', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      expect(result.current.toasts).toEqual([]);
      expect(typeof result.current.addToast).toBe('function');
      expect(typeof result.current.removeToast).toBe('function');
      expect(typeof result.current.success).toBe('function');
      expect(typeof result.current.error).toBe('function');
      expect(typeof result.current.warning).toBe('function');
      expect(typeof result.current.info).toBe('function');
    });

    it('ToastProvider外で使用した場合、エラーをスローする', () => {
      expect(() => {
        renderHook(() => useToast());
      }).toThrow('useToast must be used within a ToastProvider');
    });
  });

  describe('addToast', () => {
    it('トーストを追加できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast({
          type: 'success',
          message: 'テストメッセージ',
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('success');
      expect(toast.message).toBe('テストメッセージ');
      expect(toast.id).toBeDefined();
      expect(toast.createdAt).toBeDefined();
    });

    it('複数のトーストを追加できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast({ type: 'success', message: 'メッセージ1' });
        result.current.addToast({ type: 'error', message: 'メッセージ2' });
        result.current.addToast({ type: 'warning', message: 'メッセージ3' });
      });

      expect(result.current.toasts).toHaveLength(3);
    });

    it('カスタムdurationを設定できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast({
          type: 'success',
          message: 'カスタム期間',
          duration: 3000,
        });
      });

      const toast = result.current.toasts[0]!;
      expect(toast.duration).toBe(3000);
    });

    it('dismissibleオプションを設定できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast({
          type: 'info',
          message: '閉じるボタンなし',
          dismissible: false,
        });
      });

      const toast = result.current.toasts[0]!;
      expect(toast.dismissible).toBe(false);
    });
  });

  describe('removeToast', () => {
    it('トーストを削除できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast({ type: 'success', message: '削除テスト' });
      });

      const toast = result.current.toasts[0]!;
      const toastId = toast.id;

      act(() => {
        result.current.removeToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('存在しないIDを指定しても問題なく動作する', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.addToast({ type: 'success', message: 'テスト' });
      });

      act(() => {
        result.current.removeToast('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });
  });

  describe('ヘルパーメソッド', () => {
    it('success()でsuccessタイプのトーストを追加できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.success('成功しました');
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('success');
      expect(toast.message).toBe('成功しました');
    });

    it('error()でerrorタイプのトーストを追加できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.error('エラーが発生しました');
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('error');
      expect(toast.message).toBe('エラーが発生しました');
    });

    it('warning()でwarningタイプのトーストを追加できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.warning('警告メッセージ');
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('warning');
      expect(toast.message).toBe('警告メッセージ');
    });

    it('info()でinfoタイプのトーストを追加できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.info('お知らせ');
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('info');
      expect(toast.message).toBe('お知らせ');
    });

    it('ヘルパーメソッドにオプションを渡せる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.success('成功', { duration: 2000, dismissible: false });
      });

      const toast = result.current.toasts[0]!;
      expect(toast.duration).toBe(2000);
      expect(toast.dismissible).toBe(false);
    });
  });

  describe('プロジェクト操作用ヘルパーメソッド', () => {
    it('projectCreated()でプロジェクト作成成功メッセージを表示できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.projectCreated();
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('success');
      expect(toast.message).toBe('プロジェクトを作成しました');
    });

    it('projectUpdated()でプロジェクト更新成功メッセージを表示できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.projectUpdated();
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('success');
      expect(toast.message).toBe('プロジェクトを更新しました');
    });

    it('projectDeleted()でプロジェクト削除成功メッセージを表示できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.projectDeleted();
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('success');
      expect(toast.message).toBe('プロジェクトを削除しました');
    });

    it('projectStatusChanged()でステータス変更成功メッセージを表示できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.projectStatusChanged('調査中');
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('success');
      expect(toast.message).toBe('ステータスを「調査中」に変更しました');
    });

    it('operationFailed()で操作失敗メッセージを表示できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.operationFailed('ネットワークエラーが発生しました');
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('error');
      expect(toast.message).toBe('ネットワークエラーが発生しました');
    });

    it('operationFailed()でデフォルトメッセージを表示できる', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.operationFailed();
      });

      expect(result.current.toasts).toHaveLength(1);
      const toast = result.current.toasts[0]!;
      expect(toast.type).toBe('error');
      expect(toast.message).toBe('操作中にエラーが発生しました');
    });
  });

  describe('最大表示数', () => {
    it('最大5つまでトーストを表示する', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        for (let i = 0; i < 7; i++) {
          result.current.addToast({ type: 'info', message: `メッセージ${i + 1}` });
        }
      });

      // 最大5つまで
      expect(result.current.toasts).toHaveLength(5);
      // 最新のものが残る（古いものが削除される）
      const firstToast = result.current.toasts[0]!;
      const lastToast = result.current.toasts[4]!;
      expect(firstToast.message).toBe('メッセージ3');
      expect(lastToast.message).toBe('メッセージ7');
    });
  });
});
