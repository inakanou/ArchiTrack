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
 *
 * Task 108.1（Requirement 37）:
 * - 37.1: 失敗した画像を未送信画像として画面に保持する
 * - 37.3: 保持中の再送可能な画像をまとめて再送する
 * - 37.4: 再送では初回送信と同一の画像データを送り、再圧縮しない
 * - 37.6: 再送で全件成功したら未送信画像の表示を解消する
 * - 37.8: 破棄は確認の承諾時にのみ実行する
 * - 37.9: 新規のファイル選択・撮影でも既存の未送信画像を保持し続ける
 * - 37.10: アップロード中・再送中は追加の再送操作を受け付けない
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
import { compressImagesForUpload } from '../../../utils/image-compression';
import type { FailedUpload, UploadFailureKind } from '../../../types/upload.types';

// ============================================================================
// 画像圧縮のモック
//
// 再送で再圧縮が行われないこと（37.4）を検証するため、圧縮モジュールをスパイに
// 差し替える。既定の実装は入力をそのまま返す恒等関数とし、既存テストが期待する
// 「選択したファイルがそのまま onUpload へ渡る」挙動を維持する。
// ============================================================================

vi.mock('../../../utils/image-compression', () => ({
  compressImageForUpload: vi.fn(),
  compressImagesForUpload: vi.fn(),
}));

const compressImagesForUploadMock = vi.mocked(compressImagesForUpload);

// ============================================================================
// URL.createObjectURL / revokeObjectURL のスタブ
//
// jsdom は ObjectURL API を実装しないため、テストを条件付きで無効化せず
// スタブへ差し替える（AI運用第3原則）。
// ============================================================================

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

/** 発行済み ObjectURL の通し番号 */
let issuedObjectUrlCount = 0;

beforeEach(() => {
  // vi.clearAllMocks() は呼び出し履歴のみを消すため、実装はここで毎回張り直す
  compressImagesForUploadMock.mockImplementation((files: File[]) => Promise.resolve(files));

  issuedObjectUrlCount = 0;
  URL.createObjectURL = vi.fn((): string => {
    issuedObjectUrlCount += 1;
    return `blob:mock/${issuedObjectUrlCount}`;
  });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

// ============================================================================
// モックとヘルパー
// ============================================================================

// モックファイルを作成するヘルパー関数
function createMockFile(name: string, size: number = 1024, type: string = 'image/jpeg'): File {
  // 大きなファイルサイズの場合は実際のBlobを作成せず、sizeプロパティをモックする
  const actualSize = Math.min(size, 1024);
  const blob = new Blob(['a'.repeat(actualSize)], { type });
  const file = new File([blob], name, { type });
  // sizeプロパティをオーバーライド（大きなファイルのテスト用）
  if (size > actualSize) {
    Object.defineProperty(file, 'size', { value: size, writable: false });
  }
  return file;
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
    it('should allow any MIME type and delegate format validation to backend (Req 21.8)', async () => {
      // 要件21対応: フロントエンドではMIMEタイプチェッ���を行わず、
      // バックエンドのマジックバイト検証に画像���式判定を委ねる
      const onUpload = vi.fn().mockResolvedValue({});
      const onValidationError = vi.fn();
      render(
        <ImageUploader
          {...defaultProps}
          onUpload={onUpload}
          onValidationError={onValidationError}
        />
      );

      const input = screen.getByTestId('file-input');
      const gifFile = createMockFile('test.gif', 1024, 'image/gif');

      fireEvent.change(input, { target: { files: [gifFile] } });

      await waitFor(() => {
        // MIMEタイプに関わらずバックエンドに送信される
        expect(onUpload).toHaveBeenCalledWith([gifFile]);
      });
      // フロントエンドではバリデーションエラーが発生��ない
      expect(onValidationError).not.toHaveBeenCalled();
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

    it('should pass valid files and report oversized files separately', async () => {
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
      // 要件21対応: MIMEタイプバリデーション廃止によりサイズ超過でテスト
      const oversizedFile = createMockFile('large.jpg', MAX_FILE_SIZE_BYTES + 1024, 'image/jpeg');

      fireEvent.change(input, { target: { files: [validFile, oversizedFile] } });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith([validFile]);
        expect(onValidationError).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ file: oversizedFile })])
        );
      });
    });

    it('should display validation error messages for oversized files', async () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByTestId('file-input');
      const oversizedFile = createMockFile('large.jpg', MAX_FILE_SIZE_BYTES + 1024, 'image/jpeg');

      fireEvent.change(input, { target: { files: [oversizedFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('validation-errors')).toBeInTheDocument();
      });
    });

    it('should clear validation errors on successful upload', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');

      // First, trigger validation error (サイズ超過)
      const oversizedFile = createMockFile('large.jpg', MAX_FILE_SIZE_BYTES + 1024, 'image/jpeg');
      fireEvent.change(input, { target: { files: [oversizedFile] } });

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
      const invalidFile = createMockFile('oversized.jpg', MAX_FILE_SIZE_BYTES + 1024, 'image/jpeg');

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

      // 例外時はアップロードエラー表示と未送信画像の失敗理由の双方に同じ文言が
      // 現れるため、対象を data-testid で特定して検証する
      await waitFor(() => {
        expect(screen.getByTestId('upload-error')).toHaveTextContent(/Network error/i);
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
        expect(screen.getByTestId('upload-error')).toHaveTextContent(/Upload failed/i);
      });

      // Retry succeeds
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
      });
      // 再送に成功した画像は未送信画像からも取り除かれる（37.6）
      expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
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

  // ==========================================================================
  // 拡��子不一致ファイルのアップロード（Requirement 21）
  // ==========================================================================

  describe('extension mismatch upload (Requirement 21)', () => {
    it('should allow uploading a file with mismatched extension when MIME type is image/* (Req 21.1)', async () => {
      // 拡張子.pngだが中身がJPEGのファイルをブラウザが開くとimage/pngとしてMIMEタイプが設定される
      // image/*はサポート対象なのでフロントエンドバリデーション��通過すべき
      const mockOnUpload = vi.fn().mockResolvedValue({});
      render(<ImageUploader {...defaultProps} onUpload={mockOnUpload} />);

      const file = createMockFile('photo.png', 1024, 'image/png');
      const input = screen.getByTestId('file-input');
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith([file]);
      });
    });

    it('should allow uploading a file with non-image extension but image MIME type (Req 21.5)', async () => {
      // ブラウザがfile.type をtext/plainと設定した場合でもアップロードが試行されるべき
      // フロントエンドでは画像形式かどうかの最終判定をバックエ��ドに委ねる
      const mockOnUpload = vi.fn().mockResolvedValue({});
      render(<ImageUploader {...defaultProps} onUpload={mockOnUpload} />);

      const file = createMockFile('document.txt', 1024, 'text/plain');
      const input = screen.getByTestId('file-input');
      fireEvent.change(input, { target: { files: [file] } });

      // text/plainの場合、フロントエンドのバリデーションを緩和して
      // バックエンドでマジックバイト判定に委ねるか、エラーメッセー��を表示する
      // 要件21.5: 画像以外の拡張子でも実際の画像形式がサポート対象であれば許可
      // => フロントエンドではMIMEタイプがimage/*でない場合もバックエンドに委ねる
      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith([file]);
      });
    });

    it('should show error when backend rejects non-image file (Req 21.6)', async () => {
      const mockOnUpload = vi
        .fn()
        .mockRejectedValue(
          new Error(
            'サポートされていない画像形式です。JPEG、PNG、WEBP形式のファイルをアップロードしてください。'
          )
        );
      const mockOnError = vi.fn();
      render(<ImageUploader {...defaultProps} onUpload={mockOnUpload} onError={mockOnError} />);

      const file = createMockFile('photo.jpg', 1024, 'image/jpeg');
      const input = screen.getByTestId('file-input');
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 未送信画像の保持と再送（Requirement 37 / Task 108.1）
  // ==========================================================================

  describe('pending uploads (Requirement 37)', () => {
    /** 失敗情報を組み立てる */
    function createFailure(
      file: File,
      error: string,
      kind: UploadFailureKind = 'retriable'
    ): FailedUpload {
      return { file, error, kind };
    }

    it('should keep failed images as pending when onUpload reports failures (37.1)', async () => {
      const file = createMockFile('failed.jpg', 1024);
      const onUpload = vi
        .fn()
        .mockResolvedValue({ failed: [createFailure(file, '送信に失敗しました')] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 1 件');
      expect(screen.getByTestId('pending-upload-filename')).toHaveTextContent('failed.jpg');
      expect(screen.getByTestId('pending-upload-reason')).toHaveTextContent('送信に失敗しました');
    });

    it('should treat a void return value as a full success (backward compatibility)', async () => {
      const file = createMockFile('ok.jpg', 1024);
      const onUpload = vi.fn().mockResolvedValue(undefined);

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith([file]);
      });
      expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
    });

    /**
     * @requirement site-survey/REQ-37.4: 再送は保持中の画像のみを対象とし再圧縮を行わない
     */
    it('should retry only retriable pending images and not re-compress them (37.3, 37.4)', async () => {
      const retriable = createMockFile('retriable.jpg', 1024);
      const permanent = createMockFile('permanent.jpg', 2048);
      const onUpload = vi
        .fn()
        .mockResolvedValueOnce({
          failed: [
            createFailure(retriable, '通信に失敗しました', 'retriable'),
            createFailure(permanent, 'ファイルサイズが上限を超えています', 'permanent'),
          ],
        })
        .mockResolvedValueOnce({ failed: [] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [retriable, permanent] },
      });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 2 件');
      });
      expect(compressImagesForUploadMock).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByTestId('pending-upload-retry-button'));

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledTimes(2);
      });
      // 再送対象は保持中の再送可能な画像のみ（37.3, 37.17）
      expect(onUpload).toHaveBeenNthCalledWith(2, [retriable]);
      // 再送で圧縮を通さない（37.4）
      expect(compressImagesForUploadMock).toHaveBeenCalledTimes(1);

      // 再送不可の画像のみが保持として残る（37.5）
      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 1 件');
      });
      expect(screen.getByTestId('pending-upload-filename')).toHaveTextContent('permanent.jpg');
    });

    it('should clear the pending panel when a retry succeeds for every image (37.6)', async () => {
      const file = createMockFile('retry-me.jpg', 1024);
      const onUpload = vi
        .fn()
        .mockResolvedValueOnce({ failed: [createFailure(file, '通信に失敗しました')] })
        .mockResolvedValueOnce({ failed: [] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('pending-upload-retry-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
      });
    });

    it('should keep pending images when the discard confirmation is rejected (37.8)', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const file = createMockFile('keep-me.jpg', 1024);
      const onUpload = vi
        .fn()
        .mockResolvedValue({ failed: [createFailure(file, '通信に失敗しました')] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('pending-upload-discard-button'));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
    });

    it('should discard pending images only when the confirmation is accepted (37.8)', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const file = createMockFile('discard-me.jpg', 1024);
      const onUpload = vi
        .fn()
        .mockResolvedValue({ failed: [createFailure(file, '通信に失敗しました')] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('pending-upload-discard-button'));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
      });
    });

    /**
     * @requirement site-survey/REQ-37.9: 新規のファイル選択でも既存の未送信画像を保持し続ける
     */
    it('should keep existing pending images when new files are selected (37.9)', async () => {
      const first = createMockFile('first.jpg', 1024);
      const second = createMockFile('second.jpg', 2048);
      const onUpload = vi
        .fn()
        .mockResolvedValueOnce({ failed: [createFailure(first, '通信に失敗しました')] })
        .mockResolvedValueOnce({ failed: [createFailure(second, '通信に失敗しました')] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      const input = screen.getByTestId('file-input');
      fireEvent.change(input, { target: { files: [first] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 1 件');
      });

      // 新たなファイル選択を行っても既存の保持は消えない
      fireEvent.change(input, { target: { files: [second] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 2 件');
      });
      const fileNames = screen
        .getAllByTestId('pending-upload-filename')
        .map((element) => element.textContent);
      expect(fileNames).toEqual(['first.jpg', 'second.jpg']);
    });

    it('should disable the retry action while an upload is in progress (37.10)', async () => {
      const file = createMockFile('busy.jpg', 1024);
      const onUpload = vi
        .fn()
        .mockResolvedValue({ failed: [createFailure(file, '通信に失敗しました')] });

      const { rerender } = render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();

      rerender(<ImageUploader {...defaultProps} onUpload={onUpload} isUploading />);

      expect(screen.getByTestId('pending-upload-retry-button')).toBeDisabled();
      expect(screen.getByTestId('pending-upload-discard-button')).toBeDisabled();
    });

    /**
     * @requirement site-survey/REQ-37.10: 処理の実行中は追加の再送操作を受け付けない
     */
    it('should not accept another retry while a retry is in flight (37.10)', async () => {
      const file = createMockFile('inflight.jpg', 1024);
      let resolveRetry: (outcome: { failed: FailedUpload[] }) => void = () => {};
      const onUpload = vi
        .fn()
        .mockResolvedValueOnce({ failed: [createFailure(file, '通信に失敗しました')] })
        .mockImplementationOnce(
          () =>
            new Promise<{ failed: FailedUpload[] }>((resolve) => {
              resolveRetry = resolve;
            })
        );

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('pending-upload-retry-button'));

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-retry-button')).toBeDisabled();
      });

      // 再送中の追加操作は受け付けない
      fireEvent.click(screen.getByTestId('pending-upload-retry-button'));
      expect(onUpload).toHaveBeenCalledTimes(2);

      resolveRetry({ failed: [] });

      await waitFor(() => {
        expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
      });
    });

    it('should keep the attempted images as retriable pending uploads when onUpload rejects (37.1)', async () => {
      // onUpload が outcome を返さず例外で失敗した場合でも、試行対象の File を
      // 捨てずに未送信画像として保持する。SiteSurveyDetailPage / PhotoUploader の
      // ハンドラは catch を持たないため、この経路は実運用で発生する。
      const first = createMockFile('rejected-1.jpg', 1024);
      const second = createMockFile('rejected-2.jpg', 2048);
      const onUpload = vi.fn().mockRejectedValue(new Error('ネットワークエラーが発生しました'));

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [first, second] },
      });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 2 件');
      const fileNames = screen
        .getAllByTestId('pending-upload-filename')
        .map((element) => element.textContent);
      expect(fileNames).toEqual(['rejected-1.jpg', 'rejected-2.jpg']);
      // 例外は既定で再送可能に分類されるため、再送手段が実行可能である（37.3, 37.17）
      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();
      expect(screen.queryByTestId('pending-upload-permanent-note')).not.toBeInTheDocument();
      // 例外の文言は失敗理由としても提示する（37.2）
      expect(screen.getAllByTestId('pending-upload-reason')[0]).toHaveTextContent(
        'ネットワークエラーが発生しました'
      );
    });

    it('should retry the pending images captured from a rejected upload (37.1, 37.3)', async () => {
      const file = createMockFile('rejected-retry.jpg', 1024);
      const onUpload = vi
        .fn()
        .mockRejectedValueOnce(new Error('ネットワークエラーが発生しました'))
        .mockResolvedValueOnce({ failed: [] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('pending-upload-retry-button'));

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledTimes(2);
      });
      // 保持していた File がそのまま再送される（37.4）
      expect(onUpload).toHaveBeenNthCalledWith(2, [file]);
      expect(compressImagesForUploadMock).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
      });
    });

    it('should keep the original files as pending when compression throws (37.1)', async () => {
      // 圧縮が失敗した場合、送信対象は確定していないが元ファイルは失われていない。
      // 撮影画像の喪失を避けるため、元ファイルを保持する。
      const file = createMockFile('compress-fails.jpg', 1024);
      compressImagesForUploadMock.mockRejectedValueOnce(new Error('画像の圧縮に失敗しました'));
      const onUpload = vi.fn().mockResolvedValue({ failed: [] });

      render(<ImageUploader {...defaultProps} onUpload={onUpload} />);

      fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('pending-upload-panel')).toBeInTheDocument();
      });
      expect(onUpload).not.toHaveBeenCalled();
      expect(screen.getByTestId('pending-upload-filename')).toHaveTextContent('compress-fails.jpg');
      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();

      // 保持された元ファイルは再送で圧縮を通さずそのまま送られる（37.4）
      await userEvent.click(screen.getByTestId('pending-upload-retry-button'));

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith([file]);
      });
      expect(compressImagesForUploadMock).toHaveBeenCalledTimes(1);
    });
  });
});
