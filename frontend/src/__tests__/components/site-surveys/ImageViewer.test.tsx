/**
 * @fileoverview ImageViewerコンポーネントのテスト
 *
 * Task 12.1: 基本ビューア機能を実装する（TDD）
 *
 * Requirements:
 * - 5.1: 画像をクリックすると画像ビューアをモーダルまたは専用画面で開く
 *
 * テスト対象:
 * - モーダル/専用画面での画像表示
 * - Fabric.js Canvasの初期化
 * - 画像の読み込みと表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// vi.hoistedでモックインスタンスを定義（ホイスティング対応）
const { mockCanvasInstance, mockFabricImageInstance, mockFromURL } = vi.hoisted(() => {
  const mockCanvasInstance = {
    setWidth: vi.fn(),
    setHeight: vi.fn(),
    backgroundImage: null as unknown, // Fabric.js v6 API
    renderAll: vi.fn(),
    dispose: vi.fn(),
    getZoom: vi.fn(() => 1),
    setZoom: vi.fn(),
    getWidth: vi.fn(() => 800),
    getHeight: vi.fn(() => 600),
    viewportCenterObject: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    setViewportTransform: vi.fn(),
    getObjects: vi.fn(() => []),
  };

  const mockFabricImageInstance = {
    scaleToWidth: vi.fn(),
    scaleToHeight: vi.fn(),
    set: vi.fn(),
    scale: vi.fn(),
    getScaledWidth: vi.fn(() => 800),
    getScaledHeight: vi.fn(() => 600),
    width: 1000,
    height: 800,
  };

  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  return {
    mockCanvasInstance,
    mockFabricImageInstance,
    mockFromURL,
  };
});

// Fabric.jsのモック
vi.mock('fabric', () => {
  // コンストラクタ関数としてモックを作成
  function MockCanvas() {
    return mockCanvasInstance;
  }

  return {
    Canvas: MockCanvas,
    FabricImage: {
      fromURL: mockFromURL,
    },
  };
});

import ImageViewer from '../../../components/site-surveys/ImageViewer';

// ============================================================================
// テストヘルパー
// ============================================================================

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  isOpen: true,
  onClose: vi.fn(),
};

// ============================================================================
// テストスイート
// ============================================================================

describe('ImageViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // モックインスタンスの関数をリセット
    Object.values(mockCanvasInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
    Object.values(mockFabricImageInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('モーダル表示', () => {
    it('isOpenがtrueの場合、モーダルが表示される', async () => {
      render(<ImageViewer {...defaultProps} />);

      // モーダルが表示されていることを確認
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });

    it('isOpenがfalseの場合、モーダルが表示されない', () => {
      render(<ImageViewer {...defaultProps} isOpen={false} />);

      // モーダルが表示されていないことを確認
      const modal = screen.queryByRole('dialog');
      expect(modal).not.toBeInTheDocument();
    });

    it('閉じるボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<ImageViewer {...defaultProps} onClose={onClose} />);

      // 閉じるボタンをクリック
      const closeButton = screen.getByRole('button', { name: /閉じる/i });
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ESCキーを押すとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<ImageViewer {...defaultProps} onClose={onClose} />);

      // ESCキーを押す
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('オーバーレイをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<ImageViewer {...defaultProps} onClose={onClose} />);

      // オーバーレイをクリック
      const overlay = screen.getByTestId('image-viewer-overlay');
      await user.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('コンテンツ部分をクリックしてもモーダルは閉じない', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<ImageViewer {...defaultProps} onClose={onClose} />);

      // コンテンツ部分をクリック
      const content = screen.getByTestId('image-viewer-content');
      await user.click(content);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Fabric.js Canvas初期化', () => {
    it('モーダルが開くとCanvasが初期化される', async () => {
      render(<ImageViewer {...defaultProps} />);

      // Canvasのメソッドが呼ばれることを確認
      await waitFor(() => {
        expect(mockCanvasInstance.setWidth).toHaveBeenCalled();
      });
    });

    it('モーダルが閉じるとCanvasがdisposeされる', async () => {
      const { rerender } = render(<ImageViewer {...defaultProps} />);

      // Canvasが初期化されるのを待つ
      await waitFor(() => {
        expect(mockCanvasInstance.setWidth).toHaveBeenCalled();
      });

      // isOpenをfalseに変更
      rerender(<ImageViewer {...defaultProps} isOpen={false} />);

      // disposeが呼ばれることを確認
      await waitFor(() => {
        expect(mockCanvasInstance.dispose).toHaveBeenCalled();
      });
    });
  });

  describe('画像読み込み', () => {
    it('画像URLが指定されると画像が読み込まれる', async () => {
      render(<ImageViewer {...defaultProps} />);

      await waitFor(() => {
        expect(mockFromURL).toHaveBeenCalledWith(defaultProps.imageUrl, expect.any(Object));
      });
    });

    it('画像読み込み中はローディング表示される', async () => {
      render(<ImageViewer {...defaultProps} />);

      // ローディング表示を確認
      const loadingIndicator = screen.getByRole('status', { name: /読み込み中/i });
      expect(loadingIndicator).toBeInTheDocument();
    });

    it('画像読み込み完了後はローディングが非表示になる', async () => {
      render(<ImageViewer {...defaultProps} />);

      // ローディングが非表示になるのを待つ
      await waitFor(() => {
        const loadingIndicator = screen.queryByRole('status', { name: /読み込み中/i });
        expect(loadingIndicator).not.toBeInTheDocument();
      });
    });

    it('画像読み込みエラー時はエラーメッセージが表示される', async () => {
      mockFromURL.mockRejectedValueOnce(new Error('画像の読み込みに失敗しました'));

      render(<ImageViewer {...defaultProps} />);

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent(/画像の読み込み/i);
      });
    });
  });

  describe('Canvasサイズ設定', () => {
    it('コンテナサイズに合わせてCanvasサイズが設定される', async () => {
      render(<ImageViewer {...defaultProps} />);

      await waitFor(() => {
        expect(mockCanvasInstance.setWidth).toHaveBeenCalled();
        expect(mockCanvasInstance.setHeight).toHaveBeenCalled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('モーダルにはaria-modal属性が設定されている', () => {
      render(<ImageViewer {...defaultProps} />);

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('モーダルにはaria-labelledby属性が設定されている', () => {
      render(<ImageViewer {...defaultProps} />);

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-labelledby');
    });

    it('閉じるボタンにはaria-label属性が設定されている', () => {
      render(<ImageViewer {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: /閉じる/i });
      expect(closeButton).toHaveAccessibleName();
    });
  });

  describe('propsによる制御', () => {
    it('imageUrlが変更されると画像が再読み込みされる', async () => {
      const { rerender } = render(<ImageViewer {...defaultProps} />);

      // 最初の画像読み込みを待つ
      await waitFor(() => {
        expect(mockFromURL).toHaveBeenCalledWith(defaultProps.imageUrl, expect.any(Object));
      });

      // 新しい画像URLで再レンダリング
      const newImageUrl = 'https://example.com/new-image.jpg';
      rerender(<ImageViewer {...defaultProps} imageUrl={newImageUrl} />);

      await waitFor(() => {
        expect(mockFromURL).toHaveBeenCalledWith(newImageUrl, expect.any(Object));
      });
    });

    it('imageNameが指定された場合、タイトルとして表示される', () => {
      const imageName = 'テスト画像.jpg';
      render(<ImageViewer {...defaultProps} imageName={imageName} />);

      const title = screen.getByText(imageName);
      expect(title).toBeInTheDocument();
    });

    it('imageNameが未指定の場合、デフォルトタイトルが表示される', () => {
      render(<ImageViewer {...defaultProps} />);

      const title = screen.getByText(/画像ビューア/i);
      expect(title).toBeInTheDocument();
    });
  });
});
