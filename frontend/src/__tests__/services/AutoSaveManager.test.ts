import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  AutoSaveState,
  CacheEntry,
  StorageStats,
  SaveResult,
} from '../../services/AutoSaveManager';
import {
  AutoSaveManager,
  LocalStorageData,
  AnnotationData,
  IAutoSaveManager,
} from '../../services/AutoSaveManager';

// Use the type to prevent unused import warning
const _cacheEntryTypeCheck: CacheEntry | null = null;
const _storageStatsTypeCheck: StorageStats | null = null;
const _saveResultTypeCheck: SaveResult | null = null;
void _cacheEntryTypeCheck;
void _storageStatsTypeCheck;
void _saveResultTypeCheck;

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

  describe('localStorage quota management (Task 18.2)', () => {
    describe('LRU cache eviction', () => {
      it('should track savedAt for LRU ordering', () => {
        // Save data for multiple images with different timestamps
        const now = new Date('2025-01-01T12:00:00Z');
        vi.setSystemTime(now);

        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:05:00Z'));
        autoSaveManager.saveToLocal('image-2', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:10:00Z'));
        autoSaveManager.saveToLocal('image-3', 'survey-1', mockAnnotationData, true);

        // Verify each entry has different savedAt timestamps
        const data1 = autoSaveManager.loadFromLocal('image-1');
        const data2 = autoSaveManager.loadFromLocal('image-2');
        const data3 = autoSaveManager.loadFromLocal('image-3');

        expect(data1?.savedAt).toBe('2025-01-01T12:00:00.000Z');
        expect(data2?.savedAt).toBe('2025-01-01T12:05:00.000Z');
        expect(data3?.savedAt).toBe('2025-01-01T12:10:00.000Z');
      });

      it('should get all cached entries sorted by savedAt (oldest first)', () => {
        const now = new Date('2025-01-01T12:00:00Z');
        vi.setSystemTime(now);

        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:10:00Z'));
        autoSaveManager.saveToLocal('image-2', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:05:00Z'));
        autoSaveManager.saveToLocal('image-3', 'survey-1', mockAnnotationData, true);

        const entries = autoSaveManager.getAllCacheEntries();

        expect(entries).toHaveLength(3);
        // Should be sorted by savedAt, oldest first
        expect(entries[0]!.imageId).toBe('image-1'); // 12:00
        expect(entries[1]!.imageId).toBe('image-3'); // 12:05
        expect(entries[2]!.imageId).toBe('image-2'); // 12:10
      });

      it('should evict oldest entry when storage limit is exceeded', () => {
        // Create a manager with a small max cache size for testing
        const smallCacheManager = new AutoSaveManager({
          maxCacheSizeBytes: 1000, // 1KB for testing
          maxCachedImages: 10,
        });

        // Create data that will exceed 1KB when all 3 are stored
        const largeData: AnnotationData = {
          version: '1.0',
          objects: Array(20).fill({
            type: 'rect',
            left: 100,
            top: 100,
            width: 200,
            height: 150,
          }),
          background: '#ffffff',
        };

        // Save multiple entries
        vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
        smallCacheManager.saveToLocal('image-1', 'survey-1', largeData, true);

        vi.setSystemTime(new Date('2025-01-01T12:05:00Z'));
        smallCacheManager.saveToLocal('image-2', 'survey-1', largeData, true);

        // At this point, oldest entries should be evicted
        // The manager should call ensureStorageSpace before saving

        // Get current entries
        const entries = smallCacheManager.getAllCacheEntries();

        // Should have limited entries (some evicted due to size limit)
        expect(entries.length).toBeLessThanOrEqual(2);

        smallCacheManager.destroy();
      });

      it('should clear oldest entries to make space for new data', () => {
        const smallCacheManager = new AutoSaveManager({
          maxCacheSizeBytes: 500,
          maxCachedImages: 2,
        });

        vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
        smallCacheManager.saveToLocal('image-old', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:05:00Z'));
        smallCacheManager.saveToLocal('image-middle', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:10:00Z'));
        smallCacheManager.saveToLocal('image-new', 'survey-1', mockAnnotationData, true);

        const entries = smallCacheManager.getAllCacheEntries();

        // Should keep only max 2 images
        expect(entries.length).toBeLessThanOrEqual(2);

        // If limited to 2, oldest should be evicted
        const imageIds = entries.map((e) => e.imageId);
        if (entries.length === 2) {
          expect(imageIds).not.toContain('image-old');
          expect(imageIds).toContain('image-new');
        }

        smallCacheManager.destroy();
      });
    });

    describe('maximum storage capacity (4MB)', () => {
      it('should use default max cache size of 4MB', () => {
        expect(autoSaveManager.getMaxCacheSizeBytes()).toBe(4 * 1024 * 1024);
      });

      it('should allow custom max cache size', () => {
        const customManager = new AutoSaveManager({
          maxCacheSizeBytes: 2 * 1024 * 1024, // 2MB
        });
        expect(customManager.getMaxCacheSizeBytes()).toBe(2 * 1024 * 1024);
        customManager.destroy();
      });

      it('should calculate total cache size correctly', () => {
        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);
        autoSaveManager.saveToLocal('image-2', 'survey-1', mockAnnotationData, true);

        const totalSize = autoSaveManager.getTotalCacheSize();
        expect(totalSize).toBeGreaterThan(0);
      });

      it('should warn when single entry exceeds 1MB', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Create data larger than 1MB
        const hugeData: AnnotationData = {
          version: '1.0',
          objects: Array(50000).fill({
            type: 'rect',
            left: 100,
            top: 100,
            width: 200,
            height: 150,
            customProperty: 'some long text data',
          }),
          background: '#ffffff',
        };

        autoSaveManager.saveToLocal('image-huge', 'survey-1', hugeData, true);

        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds 1MB'));

        consoleWarnSpy.mockRestore();
      });
    });

    describe('QuotaExceededError handling', () => {
      it('should handle QuotaExceededError gracefully', () => {
        // Mock localStorage.setItem to throw QuotaExceededError
        const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw quotaError;
        });

        const onStatusChange = vi.fn();
        autoSaveManager.setOnStatusChange(onStatusChange);

        // Try to save - should handle the error gracefully
        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        // Should update status to error
        expect(onStatusChange).toHaveBeenCalledWith(
          expect.objectContaining({
            autoSaveStatus: 'error',
          })
        );

        setItemSpy.mockRestore();
      });

      it('should retry after clearing old entries on QuotaExceededError', () => {
        // First save some data successfully
        autoSaveManager.saveToLocal('image-old-1', 'survey-1', mockAnnotationData, true);
        autoSaveManager.saveToLocal('image-old-2', 'survey-1', mockAnnotationData, true);

        // Now mock to throw on first attempt, succeed on retry
        let callCount = 0;
        const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
        const setItemSpy = vi
          .spyOn(localStorage, 'setItem')
          .mockImplementation((key: string, value: string) => {
            callCount++;
            if (callCount <= 1 && key.includes('image-new')) {
              throw quotaError;
            }
            // Use the original mock
            localStorageMock.setItem(key, value);
          });

        // This should trigger cleanup and retry
        autoSaveManager.saveToLocal('image-new', 'survey-1', mockAnnotationData, true);

        // Verify retry happened
        expect(setItemSpy).toHaveBeenCalled();

        setItemSpy.mockRestore();
      });

      it('should return false from saveToLocal when quota cannot be freed', () => {
        // Mock to always throw QuotaExceededError
        const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw quotaError;
        });

        const result = autoSaveManager.saveToLocalWithResult(
          'image-1',
          'survey-1',
          mockAnnotationData,
          true
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('quota');

        setItemSpy.mockRestore();
      });
    });

    describe('storage statistics', () => {
      it('should report storage usage statistics', () => {
        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);
        autoSaveManager.saveToLocal('image-2', 'survey-1', mockAnnotationData, true);

        const stats = autoSaveManager.getStorageStats();

        expect(stats).toHaveProperty('totalSize');
        expect(stats).toHaveProperty('entryCount');
        expect(stats).toHaveProperty('maxSize');
        expect(stats).toHaveProperty('usagePercent');

        expect(stats.entryCount).toBe(2);
        expect(stats.maxSize).toBe(4 * 1024 * 1024);
        expect(stats.usagePercent).toBeGreaterThanOrEqual(0);
        expect(stats.usagePercent).toBeLessThanOrEqual(100);
      });

      it('should detect when storage is near capacity', () => {
        const smallCacheManager = new AutoSaveManager({
          maxCacheSizeBytes: 1000,
        });

        // Fill up most of the storage
        const largeData: AnnotationData = {
          version: '1.0',
          objects: Array(10).fill({
            type: 'rect',
            left: 100,
            top: 100,
            width: 200,
            height: 150,
          }),
          background: '#ffffff',
        };

        smallCacheManager.saveToLocal('image-1', 'survey-1', largeData, true);

        const stats = smallCacheManager.getStorageStats();

        // Usage should be significant
        expect(stats.usagePercent).toBeGreaterThan(50);

        smallCacheManager.destroy();
      });
    });

    describe('clearOldestEntries', () => {
      it('should clear specified number of oldest entries', () => {
        vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:05:00Z'));
        autoSaveManager.saveToLocal('image-2', 'survey-1', mockAnnotationData, true);

        vi.setSystemTime(new Date('2025-01-01T12:10:00Z'));
        autoSaveManager.saveToLocal('image-3', 'survey-1', mockAnnotationData, true);

        // Clear 2 oldest entries
        autoSaveManager.clearOldestEntries(2);

        const entries = autoSaveManager.getAllCacheEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0]!.imageId).toBe('image-3'); // Only newest remains
      });

      it('should handle clearing more entries than exist', () => {
        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        // Try to clear 10 entries when only 1 exists
        autoSaveManager.clearOldestEntries(10);

        const entries = autoSaveManager.getAllCacheEntries();
        expect(entries).toHaveLength(0);
      });
    });
  });

  describe('AutoSaveManager configuration extension (Task 35.6)', () => {
    describe('isAutoSaveAvailable', () => {
      it('should return true when localStorage is available', () => {
        expect(autoSaveManager.isAutoSaveAvailable()).toBe(true);
      });

      it('should return false when localStorage is not available', () => {
        // Mock localStorage.setItem to throw SecurityError (tested in isAutoSaveAvailable)
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new DOMException('Blocked', 'SecurityError');
        });

        const newManager = new AutoSaveManager();
        expect(newManager.isAutoSaveAvailable()).toBe(false);

        setItemSpy.mockRestore();
        newManager.destroy();
      });

      it('should return false when in private browsing mode', () => {
        // Simulate private mode by making setItem fail
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        });

        const newManager = new AutoSaveManager();
        expect(newManager.isAutoSaveAvailable()).toBe(false);

        setItemSpy.mockRestore();
        newManager.destroy();
      });
    });

    describe('onQuotaExceeded callback', () => {
      it('should allow setting onQuotaExceeded callback', () => {
        const onQuotaExceeded = vi.fn();
        autoSaveManager.setOnQuotaExceeded(onQuotaExceeded);

        // Verify it was set (no direct way to test, but should not throw)
        expect(() => autoSaveManager.setOnQuotaExceeded(onQuotaExceeded)).not.toThrow();
      });

      it('should call onQuotaExceeded callback when quota is exceeded', () => {
        const onQuotaExceeded = vi.fn();
        autoSaveManager.setOnQuotaExceeded(onQuotaExceeded);

        // Mock localStorage.setItem to always throw QuotaExceededError
        const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw quotaError;
        });

        // Try to save - should trigger callback
        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
        expect(onQuotaExceeded).toHaveBeenCalledWith(expect.objectContaining({
          imageId: 'image-1',
          surveyId: 'survey-1',
        }));
      });

      it('should allow removing onQuotaExceeded callback with null', () => {
        const onQuotaExceeded = vi.fn();
        autoSaveManager.setOnQuotaExceeded(onQuotaExceeded);
        autoSaveManager.setOnQuotaExceeded(null);

        // Mock quota exceeded
        const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw quotaError;
        });

        autoSaveManager.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        // Callback should not be called since it was removed
        expect(onQuotaExceeded).not.toHaveBeenCalled();
      });
    });

    describe('private browsing mode configuration', () => {
      it('should allow disabling auto-save for private browsing mode', () => {
        const managerWithPrivateMode = new AutoSaveManager({
          disableAutoSave: true,
        });

        expect(managerWithPrivateMode.isAutoSaveDisabled()).toBe(true);
        managerWithPrivateMode.destroy();
      });

      it('should not save when auto-save is disabled', () => {
        const managerWithPrivateMode = new AutoSaveManager({
          disableAutoSave: true,
        });

        managerWithPrivateMode.saveToLocal('image-1', 'survey-1', mockAnnotationData, true);

        // Should not attempt to save
        expect(localStorageMock.setItem).not.toHaveBeenCalled();

        managerWithPrivateMode.destroy();
      });

      it('should return SaveResult with success=false when auto-save is disabled', () => {
        const managerWithPrivateMode = new AutoSaveManager({
          disableAutoSave: true,
        });

        const result = managerWithPrivateMode.saveToLocalWithResult(
          'image-1',
          'survey-1',
          mockAnnotationData,
          true
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('disabled');

        managerWithPrivateMode.destroy();
      });
    });
  });
});
