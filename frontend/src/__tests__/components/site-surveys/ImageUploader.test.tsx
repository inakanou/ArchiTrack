/**
 * @fileoverview ImageUploader コンポーネントテスト
 *
 * Task 9.3: 画像アップロードUIを実装する
 *
 * TDDに従い、実装前にテストを作成
 *
 * Requirements:
 * - 4.1: ファイル選択ダイアログ
 * - 4.2: 複数ファイル選択対応
 * - 4.5: エラー表示（形式不正）
 * - 4.6: エラー表示（サイズ超過）
 * - 13.3: モバイル環境でのカメラ連携
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageUploader, {
  type ImageUploaderProps,
  ALLOWED_FILE_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from '../../../components/site-surveys/ImageUploader';

// ============================================================================
// モックとヘルパー
// ============================================================================

// モックファイルを作成するヘルパー関数
function createMockFile(name: string, size: number = 1024, type: string = 'image/jpeg'): File {
  const blob = new Blob(['a'.repeat(size)], { type });
  return new File([blob], name, { type });
}

// DataTransferを作成するヘルパー（jsdom環境用）
function createMockDataTransfer(files: File[]) {
  return {
    files: files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: ['Files'],
    getData: () => '',
    setData: () => {},
    clearData: () => {},
    setDragImage: () => {},
    dropEffect: 'none' as const,
    effectAllowed: 'all' as const,
  };
}

// ============================================================================
// 定数のテスト
// ============================================================================

describe('ImageUploader constants', () => {
  it('should export ALLOWED_FILE_TYPES', () => {
    expect(ALLOWED_FILE_TYPES).toBeDefined();
    expect(ALLOWED_FILE_TYPES).toContain('.jpg');
    expect(ALLOWED_FILE_TYPES).toContain('.jpeg');
    expect(ALLOWED_FILE_TYPES).toContain('.png');
    expect(ALLOWED_FILE_TYPES).toContain('.webp');
  });

  it('should export ALLOWED_MIME_TYPES', () => {
    expect(ALLOWED_MIME_TYPES).toBeDefined();
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain('image/webp');
  });

  it('should export MAX_FILE_SIZE constants', () => {
    expect(MAX_FILE_SIZE_BYTES).toBeDefined();
    expect(MAX_FILE_SIZE_MB).toBeDefined();
    expect(MAX_FILE_SIZE_BYTES).toBe(MAX_FILE_SIZE_MB * 1024 * 1024);
  });
});

// ============================================================================
// コンポーネントテスト
// ============================================================================

describe('ImageUploader', () => {
  const defaultProps: ImageUploaderProps = {
    onUpload: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 基本レンダリング
  // ==========================================================================

  describe('rendering', () => {
    it('should render the component', () => {
      render(<ImageUploader {...defaultProps} />);
      expect(screen.getByTestId('image-uploader')).toBeInTheDocument();
    });

    it('should render upload area with label', () => {
      render(<ImageUploader {...defaultProps} />);
      expect(screen.getByText(/画像をアップロード/i)).toBeInTheDocument();
    });

    it('should render drag and drop instruction', () => {
      render(<ImageUploader {...defaultProps} />);
      expect(screen.getByText(/ドラッグ＆ドロップ/i)).toBeInTheDocument();
    });

    it('should render allowed file types hint', () => {
      render(<ImageUploader {...defaultProps} />);
      expect(screen.getByText(/JPEG.*PNG.*WEBP/i)).toBeInTheDocument();
    });

    it('should render file size limit hint', () => {
      render(<ImageUploader {...defaultProps} />);
      expect(screen.getByText(new RegExp(`${MAX_FILE_SIZE_MB}MB`, 'i'))).toBeInTheDocument();
    });

    it('should render file input with correct accept attribute', () => {
      render(<ImageUploader {...defaultProps} />);
      const input = screen.getByTestId('file-input');
      expect(input).toHaveAttribute('accept', ALLOWED_FILE_TYPES.join(','));
    });

    it('should render file input with multiple attribute', () => {
      render(<ImageUploader {...defaultProps} />);
      const input = screen.getByTestId('file-input');
      expect(input).toHaveAttribute('multiple');
    });

    it('should render camera button for mobile (with capture attribute)', () => {
      render(<ImageUploader {...defaultProps} />);
      const cameraButton = screen.getByTestId('camera-button');
      expect(cameraButton).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      render(<ImageUploader {...defaultProps} disabled />);
      const uploadArea = screen.getByTestId('upload-area');
      expect(uploadArea).toHaveAttribute('aria-disabled', 'true');
    });
  });

  // ==========================================================================
  // ファイル選択
  // ==========================================================================

  describe('file selection', () => {
    it('should open file dialog when clicking upload area', async () => {
      const user = userEvent.setup();
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByTestId('file-input') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const uploadArea = screen.getByTestId('upload-area');
      await user.click(uploadArea);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should handle single file selection', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');
      const file = createMockFile('test.jpg', 1024);

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith([file]);
      });
    });

    it('should handle multiple file selection', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');
      const files = [
        createMockFile('test1.jpg', 1024),
        createMockFile('test2.png', 2048),
        createMockFile('test3.webp', 3072),
      ];

      fireEvent.change(input, { target: { files } });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(files);
      });
    });

    it('should not call onUpload when no files selected', async () => {
      const onUpload = vi.fn();
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');
      fireEvent.change(input, { target: { files: [] } });

      expect(onUpload).not.toHaveBeenCalled();
    });

    it('should not call onUpload when disabled', async () => {
      const onUpload = vi.fn();
      render(<ImageUploader {...defaultProps} onUpload={onUpload} disabled />);

      const input = screen.getByTestId('file-input');
      const file = createMockFile('test.jpg', 1024);

      fireEvent.change(input, { target: { files: [file] } });

      expect(onUpload).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ドラッグ＆ドロップ
  // ==========================================================================

  describe('drag and drop', () => {
    it('should show drag active state when dragging over', async () => {
      render(<ImageUploader {...defaultProps} />);

      const uploadArea = screen.getByTestId('upload-area');

      fireEvent.dragEnter(uploadArea, {
        dataTransfer: { types: ['Files'] },
      });

      await waitFor(() => {
        expect(uploadArea).toHaveAttribute('data-drag-active', 'true');
      });
    });

    it('should remove drag active state when dragging out', async () => {
      render(<ImageUploader {...defaultProps} />);

      const uploadArea = screen.getByTestId('upload-area');

      fireEvent.dragEnter(uploadArea, {
        dataTransfer: { types: ['Files'] },
      });

      fireEvent.dragLeave(uploadArea);

      await waitFor(() => {
        expect(uploadArea).not.toHaveAttribute('data-drag-active', 'true');
      });
    });

    it('should handle file drop', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const uploadArea = screen.getByTestId('upload-area');
      const files = [createMockFile('test.jpg', 1024)];
      const dataTransfer = createMockDataTransfer(files);

      fireEvent.drop(uploadArea, { dataTransfer });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(files);
      });
    });

    it('should handle multiple files drop', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const uploadArea = screen.getByTestId('upload-area');
      const files = [createMockFile('test1.jpg', 1024), createMockFile('test2.png', 2048)];
      const dataTransfer = createMockDataTransfer(files);

      fireEvent.drop(uploadArea, { dataTransfer });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(files);
      });
    });

    it('should not handle drop when disabled', async () => {
      const onUpload = vi.fn();
      render(<ImageUploader {...defaultProps} onUpload={onUpload} disabled />);

      const uploadArea = screen.getByTestId('upload-area');
      const files = [createMockFile('test.jpg', 1024)];
      const dataTransfer = createMockDataTransfer(files);

      fireEvent.drop(uploadArea, { dataTransfer });

      expect(onUpload).not.toHaveBeenCalled();
    });

    it('should prevent default on dragOver', () => {
      render(<ImageUploader {...defaultProps} />);

      const uploadArea = screen.getByTestId('upload-area');
      const event = new Event('dragover', { bubbles: true, cancelable: true });

      fireEvent(uploadArea, event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  // ==========================================================================
  // ファイルバリデーション
  // ==========================================================================

  describe('file validation', () => {
    it('should reject unsupported file types', async () => {
      const onUpload = vi.fn();
      const onValidationError = vi.fn();
      render(
        <ImageUploader
          {...defaultProps}
          onUpload={onUpload}
          onValidationError={onValidationError}
        />
      );

      const input = screen.getByTestId('file-input');
      const invalidFile = createMockFile('test.gif', 1024, 'image/gif');

      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(onValidationError).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              file: invalidFile,
              error: expect.stringContaining('形式'),
            }),
          ])
        );
      });
      expect(onUpload).not.toHaveBeenCalled();
    });

    it('should reject files exceeding size limit', async () => {
      const onUpload = vi.fn();
      const onValidationError = vi.fn();
      render(
        <ImageUploader
          {...defaultProps}
          onUpload={onUpload}
          onValidationError={onValidationError}
        />
      );

      const input = screen.getByTestId('file-input');
      const largeFile = createMockFile('large.jpg', MAX_FILE_SIZE_BYTES + 1024);

      fireEvent.change(input, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(onValidationError).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              file: largeFile,
              error: expect.stringContaining('サイズ'),
            }),
          ])
        );
      });
      expect(onUpload).not.toHaveBeenCalled();
    });

    it('should pass valid files and report invalid files separately', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      const onValidationError = vi.fn();
      render(
        <ImageUploader
          {...defaultProps}
          onUpload={onUpload}
          onValidationError={onValidationError}
        />
      );

      const input = screen.getByTestId('file-input');
      const validFile = createMockFile('valid.jpg', 1024);
      const invalidFile = createMockFile('invalid.gif', 1024, 'image/gif');

      fireEvent.change(input, { target: { files: [validFile, invalidFile] } });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith([validFile]);
        expect(onValidationError).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ file: invalidFile })])
        );
      });
    });

    it('should display validation error messages', async () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByTestId('file-input');
      const invalidFile = createMockFile('test.gif', 1024, 'image/gif');

      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('validation-errors')).toBeInTheDocument();
      });
    });

    it('should clear validation errors on successful upload', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');

      // First, trigger validation error
      const invalidFile = createMockFile('test.gif', 1024, 'image/gif');
      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('validation-errors')).toBeInTheDocument();
      });

      // Then, upload valid file
      const validFile = createMockFile('test.jpg', 1024);
      fireEvent.change(input, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(screen.queryByTestId('validation-errors')).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 進捗表示
  // ==========================================================================

  describe('upload progress', () => {
    it('should show uploading state when isUploading is true', () => {
      render(<ImageUploader {...defaultProps} isUploading />);
      expect(screen.getByTestId('upload-progress')).toBeInTheDocument();
    });

    it('should display progress percentage', () => {
      render(
        <ImageUploader
          {...defaultProps}
          isUploading
          uploadProgress={{ completed: 2, total: 5, current: 1 }}
        />
      );
      expect(screen.getByText(/2.*\/.*5/)).toBeInTheDocument();
    });

    it('should display progress bar', () => {
      render(
        <ImageUploader
          {...defaultProps}
          isUploading
          uploadProgress={{ completed: 2, total: 4, current: 2 }}
        />
      );
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should show spinner during upload', () => {
      render(<ImageUploader {...defaultProps} isUploading />);
      expect(screen.getByTestId('upload-spinner')).toBeInTheDocument();
    });

    it('should disable input during upload', () => {
      render(<ImageUploader {...defaultProps} isUploading />);
      const input = screen.getByTestId('file-input');
      expect(input).toBeDisabled();
    });
  });

  // ==========================================================================
  // モバイル対応（カメラ連携）
  // ==========================================================================

  describe('mobile camera support', () => {
    it('should render camera capture input', () => {
      render(<ImageUploader {...defaultProps} />);
      const cameraInput = screen.getByTestId('camera-input');
      expect(cameraInput).toBeInTheDocument();
      expect(cameraInput).toHaveAttribute('capture', 'environment');
      expect(cameraInput).toHaveAttribute('accept', 'image/*');
    });

    it('should handle camera capture', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const cameraInput = screen.getByTestId('camera-input');
      const file = createMockFile('camera-photo.jpg', 1024);

      fireEvent.change(cameraInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith([file]);
      });
    });

    it('should open camera input when camera button is clicked', async () => {
      const user = userEvent.setup();
      render(<ImageUploader {...defaultProps} />);

      const cameraInput = screen.getByTestId('camera-input') as HTMLInputElement;
      const clickSpy = vi.spyOn(cameraInput, 'click');

      const cameraButton = screen.getByTestId('camera-button');
      await user.click(cameraButton);

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================

  describe('accessibility', () => {
    it('should have accessible labels', () => {
      render(<ImageUploader {...defaultProps} />);
      const input = screen.getByTestId('file-input');
      expect(input).toHaveAccessibleName();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<ImageUploader {...defaultProps} />);

      const uploadArea = screen.getByTestId('upload-area');
      uploadArea.focus();

      expect(document.activeElement).toBe(uploadArea);

      // Space key should trigger file dialog
      const input = screen.getByTestId('file-input') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      await user.keyboard(' ');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should announce upload progress to screen readers', () => {
      render(
        <ImageUploader
          {...defaultProps}
          isUploading
          uploadProgress={{ completed: 2, total: 5, current: 2 }}
        />
      );
      const progressRegion = screen.getByRole('status');
      expect(progressRegion).toBeInTheDocument();
    });

    it('should announce validation errors to screen readers', async () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByTestId('file-input');
      const invalidFile = createMockFile('test.gif', 1024, 'image/gif');

      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        const errorRegion = screen.getByRole('alert');
        expect(errorRegion).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // エラーハンドリング
  // ==========================================================================

  describe('error handling', () => {
    it('should call onError when upload fails', async () => {
      const error = new Error('Upload failed');
      const onUpload = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();

      render(<ImageUploader {...defaultProps} onUpload={onUpload} onError={onError} />);

      const input = screen.getByTestId('file-input');
      const file = createMockFile('test.jpg', 1024);

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('should display upload error message', async () => {
      const error = new Error('Network error');
      const onUpload = vi.fn().mockRejectedValue(error);

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');
      const file = createMockFile('test.jpg', 1024);

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      const error = new Error('Upload failed');
      const onUpload = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');
      const file = createMockFile('test.jpg', 1024);

      // First attempt fails
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/Upload failed/i)).toBeInTheDocument();
      });

      // Retry succeeds
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.queryByText(/Upload failed/i)).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // カスタムスタイル
  // ==========================================================================

  describe('custom styling', () => {
    it('should apply custom className', () => {
      render(<ImageUploader {...defaultProps} className="custom-class" />);
      expect(screen.getByTestId('image-uploader')).toHaveClass('custom-class');
    });

    it('should apply compact style when compact prop is true', () => {
      render(<ImageUploader {...defaultProps} compact />);
      expect(screen.getByTestId('image-uploader')).toHaveAttribute('data-compact', 'true');
    });
  });
});
