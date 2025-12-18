/**
 * useAnnotationRestoration Hook Tests
 *
 * 状態復元機能のテスト:
 * - ページリロード時のlocalStorageチェック
 * - 未保存データ復元確認ダイアログ
 * - サーバーデータとの比較・選択
 *
 * @see tasks.md - Task 18.3
 * @see requirements.md - Requirement 13.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAnnotationRestoration } from '../../hooks/useAnnotationRestoration';
import type { AnnotationData, LocalStorageData } from '../../services/AutoSaveManager';
import { AutoSaveManager } from '../../services/AutoSaveManager';

// Mock AutoSaveManager
vi.mock('../../services/AutoSaveManager', async () => {
  const actual = await vi.importActual('../../services/AutoSaveManager');
  return {
    ...actual,
    AutoSaveManager: vi.fn(),
  };
});

describe('useAnnotationRestoration', () => {
  let mockAutoSaveManager: {
    loadFromLocal: ReturnType<typeof vi.fn>;
    clearLocal: ReturnType<typeof vi.fn>;
    hasUnsavedData: ReturnType<typeof vi.fn>;
    getLastSavedAt: ReturnType<typeof vi.fn>;
    setServerUpdatedAt: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };

  const mockAnnotationData: AnnotationData = {
    version: '1.0',
    objects: [
      {
        type: 'rect',
        left: 100,
        top: 100,
        width: 200,
        height: 150,
      },
    ],
    background: '#ffffff',
  };

  const mockLocalStorageData: LocalStorageData = {
    imageId: 'image-123',
    surveyId: 'survey-456',
    annotationData: mockAnnotationData,
    savedAt: '2025-01-01T12:00:00.000Z',
    serverUpdatedAt: '2025-01-01T10:00:00.000Z', // Different from current server version
  };

  const mockServerAnnotationData: AnnotationData = {
    version: '1.0',
    objects: [
      {
        type: 'circle',
        left: 200,
        top: 200,
        radius: 50,
      },
    ],
    background: '#000000',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAutoSaveManager = {
      loadFromLocal: vi.fn(),
      clearLocal: vi.fn(),
      hasUnsavedData: vi.fn(),
      getLastSavedAt: vi.fn(),
      setServerUpdatedAt: vi.fn(),
      destroy: vi.fn(),
    };

    (AutoSaveManager as ReturnType<typeof vi.fn>).mockImplementation(() => mockAutoSaveManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should check for unsaved local data on mount', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(false);

      renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: null,
          serverUpdatedAt: null,
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(mockAutoSaveManager.hasUnsavedData).toHaveBeenCalledWith('image-123');
      });
    });

    it('should return initial state correctly when no local data exists', () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(false);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(null);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: null,
          serverUpdatedAt: null,
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      expect(result.current.hasLocalData).toBe(false);
      expect(result.current.showRestoreDialog).toBe(false);
      expect(result.current.localData).toBeNull();
    });

    it('should detect local data and show restore dialog', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });
      expect(result.current.showRestoreDialog).toBe(true);
      expect(result.current.localData).toEqual(mockLocalStorageData);
    });
  });

  describe('local data comparison with server data', () => {
    it('should identify when local data is newer than server data', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        savedAt: '2025-01-01T13:00:00.000Z', // Local is newer
        serverUpdatedAt: '2025-01-01T11:00:00.000Z',
      });

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });
      expect(result.current.isLocalNewer).toBe(true);
    });

    it('should identify when server data is newer than local data', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        savedAt: '2025-01-01T12:00:00.000Z',
        serverUpdatedAt: '2025-01-01T11:00:00.000Z',
      });

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T14:00:00.000Z', // Server is newer
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });
      expect(result.current.isLocalNewer).toBe(false);
    });

    it('should detect server data changes since last local save', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        savedAt: '2025-01-01T12:00:00.000Z',
        serverUpdatedAt: '2025-01-01T11:00:00.000Z', // Server was at this version when local saved
      });

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T13:00:00.000Z', // Server has been updated since
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });
      // Server changed since user's local save - conflict situation
      expect(result.current.hasServerConflict).toBe(true);
    });

    it('should not show conflict when server has not changed since local save', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        savedAt: '2025-01-01T12:00:00.000Z',
        serverUpdatedAt: '2025-01-01T11:00:00.000Z',
      });

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z', // Server unchanged
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });
      expect(result.current.hasServerConflict).toBe(false);
    });
  });

  describe('restore dialog actions', () => {
    it('should restore local data when user chooses to restore', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const onRestore = vi.fn();

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
          onRestore,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      act(() => {
        result.current.confirmRestore();
      });

      expect(onRestore).toHaveBeenCalledWith(mockAnnotationData);
      expect(result.current.showRestoreDialog).toBe(false);
    });

    it('should discard local data and use server data when user chooses to discard', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const onDiscard = vi.fn();

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
          onDiscard,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      act(() => {
        result.current.discardLocal();
      });

      expect(mockAutoSaveManager.clearLocal).toHaveBeenCalledWith('image-123');
      expect(onDiscard).toHaveBeenCalled();
      expect(result.current.showRestoreDialog).toBe(false);
      expect(result.current.hasLocalData).toBe(false);
    });

    it('should dismiss dialog without action when user cancels', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.showRestoreDialog).toBe(true);
      });

      act(() => {
        result.current.dismissDialog();
      });

      // Dialog hidden but local data still exists
      expect(result.current.showRestoreDialog).toBe(false);
      expect(result.current.hasLocalData).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle case when server data is null (new image)', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: null,
          serverUpdatedAt: null,
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      // Should still show restore dialog for new images with local data
      expect(result.current.showRestoreDialog).toBe(true);
      expect(result.current.hasServerConflict).toBe(false);
    });

    it('should handle case when local savedAt is invalid', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        savedAt: 'invalid-date',
      });

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      // Should handle gracefully - assume local data is older
      expect(result.current.isLocalNewer).toBe(false);
    });

    it('should not show restore dialog if local data matches server data timestamp', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        savedAt: '2025-01-01T12:00:00.000Z',
        serverUpdatedAt: '2025-01-01T12:00:00.000Z', // Same as server
      });

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T12:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      // No need to show dialog if server already has this version
      expect(result.current.showRestoreDialog).toBe(false);
    });

    it('should update when imageId changes', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(false);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(null);

      const { result, rerender } = renderHook(
        ({ imageId }) =>
          useAnnotationRestoration({
            imageId,
            serverAnnotationData: null,
            serverUpdatedAt: null,
            autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
          }),
        { initialProps: { imageId: 'image-123' } }
      );

      // Wait for initial queueMicrotask to complete
      await waitFor(() => {
        expect(mockAutoSaveManager.hasUnsavedData).toHaveBeenCalledWith('image-123');
      });

      // Change imageId
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue({
        ...mockLocalStorageData,
        imageId: 'image-456',
      });

      rerender({ imageId: 'image-456' });

      await waitFor(() => {
        expect(mockAutoSaveManager.hasUnsavedData).toHaveBeenCalledWith('image-456');
      });

      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });
    });
  });

  describe('restore dialog state', () => {
    it('should provide formatted timestamps for display', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:30:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      // Should provide human-readable timestamps
      expect(result.current.localSavedAtFormatted).toBeDefined();
      expect(result.current.serverUpdatedAtFormatted).toBeDefined();
    });

    it('should return annotation data comparison info', async () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: mockServerAnnotationData,
          serverUpdatedAt: '2025-01-01T11:00:00.000Z',
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      // Wait for queueMicrotask to complete
      await waitFor(() => {
        expect(result.current.hasLocalData).toBe(true);
      });

      expect(result.current.localObjectCount).toBe(1);
      expect(result.current.serverObjectCount).toBe(1);
    });
  });

  describe('manual check for local data', () => {
    it('should provide method to manually recheck for local data', () => {
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(false);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(null);

      const { result } = renderHook(() =>
        useAnnotationRestoration({
          imageId: 'image-123',
          serverAnnotationData: null,
          serverUpdatedAt: null,
          autoSaveManager: mockAutoSaveManager as unknown as AutoSaveManager,
        })
      );

      expect(result.current.hasLocalData).toBe(false);

      // Simulate localStorage data being added (e.g., from another tab)
      mockAutoSaveManager.hasUnsavedData.mockReturnValue(true);
      mockAutoSaveManager.loadFromLocal.mockReturnValue(mockLocalStorageData);

      act(() => {
        result.current.recheckLocalData();
      });

      expect(result.current.hasLocalData).toBe(true);
    });
  });
});
