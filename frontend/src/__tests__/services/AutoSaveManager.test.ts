import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AutoSaveState } from '../../services/AutoSaveManager';
import {
  AutoSaveManager,
  LocalStorageData,
  AnnotationData,
  IAutoSaveManager,
} from '../../services/AutoSaveManager';

// Use the type to prevent unused import warning
const _autoSaveStateTypeCheck: AutoSaveState | null = null;
void _autoSaveStateTypeCheck;

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

// Replace global localStorage
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('AutoSaveManager', () => {
  let autoSaveManager: AutoSaveManager;

  const mockAnnotationData: AnnotationData = {
    version: '1.0',
    objects: [
      {
        type: 'rect',
        version: '1.0',
        originX: 'left',
        originY: 'top',
        left: 100,
        top: 100,
        width: 200,
        height: 150,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
      },
    ],
    background: '#ffffff',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();
    autoSaveManager = new AutoSaveManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    autoSaveManager.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default debounce interval of 30 seconds', () => {
      expect(autoSaveManager.getDebounceInterval()).toBe(30000);
    });

    it('should allow custom debounce interval', () => {
      const customManager = new AutoSaveManager({ debounceInterval: 60000 });
      expect(customManager.getDebounceInterval()).toBe(60000);
      customManager.destroy();
    });

    it('should initialize with idle status', () => {
      expect(autoSaveManager.getStatus()).toBe('idle');
    });
  });

  describe('saveToLocal', () => {
    it('should save annotation data to localStorage immediately when force is true', () => {
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData, true);

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const setItemCall = localStorageMock.setItem.mock.calls[0];
      expect(setItemCall).toBeDefined();
      const savedData = JSON.parse(setItemCall![1]) as LocalStorageData;
      expect(savedData.imageId).toBe('image-123');
      expect(savedData.surveyId).toBe('survey-456');
      expect(savedData.annotationData).toEqual(mockAnnotationData);
      expect(savedData.savedAt).toBeDefined();
    });

    it('should debounce save operations when force is false', () => {
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData, false);

      // Should not save immediately
      expect(localStorageMock.setItem).not.toHaveBeenCalled();

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(30000);

      // Now it should save
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    });

    it('should reset debounce timer on subsequent save calls', () => {
      // First call
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData);

      // Wait 15 seconds
      vi.advanceTimersByTime(15000);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();

      // Second call - should reset timer
      const updatedData: AnnotationData = {
        ...mockAnnotationData,
        objects: [
          ...mockAnnotationData.objects,
          { type: 'circle' } as AnnotationData['objects'][number],
        ],
      };
      autoSaveManager.saveToLocal('image-123', 'survey-456', updatedData);

      // Wait another 15 seconds (total 30 from second call would be 45 from first)
      vi.advanceTimersByTime(15000);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();

      // Wait remaining 15 seconds (total 30 from second call)
      vi.advanceTimersByTime(15000);
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);

      // Should save the updated data
      const setItemCallUpdate = localStorageMock.setItem.mock.calls[0];
      expect(setItemCallUpdate).toBeDefined();
      const savedData = JSON.parse(setItemCallUpdate![1]) as LocalStorageData;
      expect(savedData.annotationData.objects).toHaveLength(2);
    });

    it('should update status to saving and then saved', () => {
      const statusChanges: string[] = [];
      autoSaveManager.setOnStatusChange((state) => {
        statusChanges.push(state.autoSaveStatus);
      });

      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData);

      // Status should be saving (pending)
      expect(autoSaveManager.getStatus()).toBe('saving');

      // Fast-forward to complete the save
      vi.advanceTimersByTime(30000);

      expect(statusChanges).toContain('saving');
      expect(statusChanges).toContain('saved');
    });

    it('should include savedAt timestamp in saved data', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData, true);

      const setItemCallTimestamp = localStorageMock.setItem.mock.calls[0];
      expect(setItemCallTimestamp).toBeDefined();
      const savedData = JSON.parse(setItemCallTimestamp![1]) as LocalStorageData;
      expect(savedData.savedAt).toBe(now.toISOString());
    });

    it('should use correct storage key format', () => {
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData, true);

      const setItemCallKey = localStorageMock.setItem.mock.calls[0];
      expect(setItemCallKey).toBeDefined();
      expect(setItemCallKey![0]).toBe('architrack_annotation_image-123');
    });
  });

  describe('loadFromLocal', () => {
    it('should return null when no data exists for the given imageId', () => {
      const result = autoSaveManager.loadFromLocal('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return saved data for the given imageId', () => {
      const savedData: LocalStorageData = {
        imageId: 'image-123',
        surveyId: 'survey-456',
        annotationData: mockAnnotationData,
        savedAt: new Date().toISOString(),
        serverUpdatedAt: null,
      };

      localStorageMock.setItem('architrack_annotation_image-123', JSON.stringify(savedData));

      const result = autoSaveManager.loadFromLocal('image-123');
      expect(result).toEqual(savedData);
    });

    it('should return null for corrupted data', () => {
      localStorageMock.setItem('architrack_annotation_image-123', 'invalid-json');

      const result = autoSaveManager.loadFromLocal('image-123');
      expect(result).toBeNull();
    });
  });

  describe('clearLocal', () => {
    it('should remove data for the specified imageId', () => {
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData, true);
      autoSaveManager.clearLocal('image-123');

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('architrack_annotation_image-123');
    });

    it('should cancel pending save for the cleared imageId', () => {
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData);

      // Clear before debounce completes
      autoSaveManager.clearLocal('image-123');

      // Fast-forward past debounce time
      vi.advanceTimersByTime(30000);

      // setItem should not be called (cancelled)
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      // removeItem should be called
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('architrack_annotation_image-123');
    });
  });

  describe('hasUnsavedData', () => {
    it('should return false when no data exists', () => {
      expect(autoSaveManager.hasUnsavedData('image-123')).toBe(false);
    });

    it('should return true when data exists for the given imageId', () => {
      const savedData: LocalStorageData = {
        imageId: 'image-123',
        surveyId: 'survey-456',
        annotationData: mockAnnotationData,
        savedAt: new Date().toISOString(),
        serverUpdatedAt: null,
      };

      localStorageMock.setItem('architrack_annotation_image-123', JSON.stringify(savedData));

      // Recreate autoSaveManager to pick up the saved data
      expect(autoSaveManager.hasUnsavedData('image-123')).toBe(true);
    });
  });

  describe('getLastSavedAt', () => {
    it('should return null when no data exists', () => {
      expect(autoSaveManager.getLastSavedAt('image-123')).toBeNull();
    });

    it('should return the savedAt timestamp for existing data', () => {
      const savedAt = '2025-01-01T12:00:00.000Z';
      const savedData: LocalStorageData = {
        imageId: 'image-123',
        surveyId: 'survey-456',
        annotationData: mockAnnotationData,
        savedAt,
        serverUpdatedAt: null,
      };

      localStorageMock.setItem('architrack_annotation_image-123', JSON.stringify(savedData));

      expect(autoSaveManager.getLastSavedAt('image-123')).toBe(savedAt);
    });
  });

  describe('setServerUpdatedAt', () => {
    it('should update serverUpdatedAt for existing data', () => {
      const savedData: LocalStorageData = {
        imageId: 'image-123',
        surveyId: 'survey-456',
        annotationData: mockAnnotationData,
        savedAt: new Date().toISOString(),
        serverUpdatedAt: null,
      };

      localStorageMock.setItem('architrack_annotation_image-123', JSON.stringify(savedData));

      const serverTime = '2025-01-01T13:00:00.000Z';
      autoSaveManager.setServerUpdatedAt('image-123', serverTime);

      const updated = autoSaveManager.loadFromLocal('image-123');
      expect(updated?.serverUpdatedAt).toBe(serverTime);
    });

    it('should do nothing if no data exists', () => {
      autoSaveManager.setServerUpdatedAt('non-existent', '2025-01-01T13:00:00.000Z');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('status callback', () => {
    it('should call onStatusChange callback when status changes', () => {
      const onStatusChange = vi.fn();
      autoSaveManager.setOnStatusChange(onStatusChange);

      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData);

      expect(onStatusChange).toHaveBeenCalledWith({
        hasUnsavedChanges: true,
        lastAutoSavedAt: null,
        autoSaveStatus: 'saving',
      });
    });

    it('should allow removing the callback', () => {
      const onStatusChange = vi.fn();
      autoSaveManager.setOnStatusChange(onStatusChange);
      autoSaveManager.setOnStatusChange(null);

      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData);

      expect(onStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should cancel all pending save operations', () => {
      autoSaveManager.saveToLocal('image-123', 'survey-456', mockAnnotationData);
      autoSaveManager.destroy();

      vi.advanceTimersByTime(30000);

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should clear the status change callback', () => {
      const onStatusChange = vi.fn();
      autoSaveManager.setOnStatusChange(onStatusChange);
      autoSaveManager.destroy();

      // Try to trigger a status change - should not call the callback
      // since the manager is destroyed
      expect(onStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('multiple images', () => {
    it('should handle saves for multiple images independently', () => {
      autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData);
      autoSaveManager.saveToLocal('image-2', 'survey-2', mockAnnotationData);

      vi.advanceTimersByTime(30000);

      // Both images should be saved
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(2);
    });

    it('should clear only the specified image data', () => {
      autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);
      autoSaveManager.saveToLocal('image-2', 'survey-2', mockAnnotationData, true);

      autoSaveManager.clearLocal('image-1');

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('architrack_annotation_image-1');
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith('architrack_annotation_image-2');
    });
  });

  describe('STORAGE_KEY_PREFIX', () => {
    it('should use the correct storage key prefix', () => {
      autoSaveManager.saveToLocal('test-image', 'test-survey', mockAnnotationData, true);

      const setItemCallPrefix = localStorageMock.setItem.mock.calls[0];
      expect(setItemCallPrefix).toBeDefined();
      const key = setItemCallPrefix![0];
      expect(key).toMatch(/^architrack_annotation_/);
    });
  });

  describe('interface compliance', () => {
    it('should implement IAutoSaveManager interface', () => {
      // Type check - this will fail at compile time if interface is not implemented
      const manager: IAutoSaveManager = autoSaveManager;

      expect(typeof manager.saveToLocal).toBe('function');
      expect(typeof manager.loadFromLocal).toBe('function');
      expect(typeof manager.clearLocal).toBe('function');
      expect(typeof manager.hasUnsavedData).toBe('function');
      expect(typeof manager.getLastSavedAt).toBe('function');
      expect(typeof manager.setServerUpdatedAt).toBe('function');
      expect(typeof manager.setOnStatusChange).toBe('function');
      expect(typeof manager.destroy).toBe('function');
    });
  });
});
