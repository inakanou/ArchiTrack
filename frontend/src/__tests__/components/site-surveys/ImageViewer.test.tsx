/**
 * @fileoverview ImageViewerコンポーネントのテスト
 *
 * Task 12.1: 基本ビューア機能を実装する（TDD）
 * Task 12.2: ズーム機能を実装する（TDD）
 *
 * Requirements:
 * - 5.1: 画像をクリックすると画像ビューアをモーダルまたは専用画面で開く
 * - 5.2: ズームイン/ズームアウト操作で画像を拡大/縮小表示
 *
 * テスト対象:
 * - モーダル/専用画面での画像表示
 * - Fabric.js Canvasの初期化
 * - 画像の読み込みと表示
 * - マウスホイールによるズームイン/ズームアウト
 * - ズームボタンUI
 * - ズーム範囲制限（0.1x-10x）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZOOM_CONSTANTS } from '../../../components/site-surveys/ImageViewer';

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

  // ============================================================================
  // Task 12.2: ズーム機能のテスト
  // Requirements: 5.2 - ズームイン/ズームアウト操作で画像を拡大/縮小表示
  // ============================================================================
  describe('ズーム機能', () => {
    describe('ズームボタンUI', () => {
      it('ズームインボタンが表示される', async () => {
        render(<ImageViewer {...defaultProps} />);

        await waitFor(() => {
          const zoomInButton = screen.getByRole('button', { name: /ズームイン/i });
          expect(zoomInButton).toBeInTheDocument();
        });
      });

      it('ズームアウトボタンが表示される', async () => {
        render(<ImageViewer {...defaultProps} />);

        await waitFor(() => {
          const zoomOutButton = screen.getByRole('button', { name: /ズームアウト/i });
          expect(zoomOutButton).toBeInTheDocument();
        });
      });

      it('ズームリセットボタンが表示される', async () => {
        render(<ImageViewer {...defaultProps} />);

        await waitFor(() => {
          const resetButton = screen.getByRole('button', { name: /100%/i });
          expect(resetButton).toBeInTheDocument();
        });
      });

      it('現在のズーム倍率が表示される', async () => {
        render(<ImageViewer {...defaultProps} />);

        await waitFor(() => {
          // 初期値は100%
          const zoomDisplay = screen.getByTestId('zoom-display');
          expect(zoomDisplay).toHaveTextContent('100%');
        });
      });
    });

    describe('ズームボタンによるズーム操作', () => {
      it('ズームインボタンをクリックするとズームレベルが上がる', async () => {
        const user = userEvent.setup();
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // ズームインボタンをクリック
        const zoomInButton = screen.getByRole('button', { name: /ズームイン/i });
        await user.click(zoomInButton);

        // ズームレベルが上がることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
        });
      });

      it('ズームアウトボタンをクリックするとズームレベルが下がる', async () => {
        const user = userEvent.setup();
        // 初期ズームレベルを1.5に設定
        mockCanvasInstance.getZoom.mockReturnValue(1.5);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // ズームアウトボタンをクリック
        const zoomOutButton = screen.getByRole('button', { name: /ズームアウト/i });
        await user.click(zoomOutButton);

        // ズームレベルが下がることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
        });
      });

      it('100%ボタンをクリックするとズームがリセットされる', async () => {
        const user = userEvent.setup();
        // 初期ズームレベルを2.0に設定
        mockCanvasInstance.getZoom.mockReturnValue(2.0);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // リセットボタンをクリック
        const resetButton = screen.getByRole('button', { name: /100%/i });
        await user.click(resetButton);

        // ズームレベルが1.0にリセットされることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalledWith(1);
        });
      });
    });

    describe('ズーム範囲制限', () => {
      it('最小ズーム倍率は0.1x', () => {
        expect(ZOOM_CONSTANTS.MIN_ZOOM).toBe(0.1);
      });

      it('最大ズーム倍率は10x', () => {
        expect(ZOOM_CONSTANTS.MAX_ZOOM).toBe(10);
      });

      it('ズームステップは0.1', () => {
        expect(ZOOM_CONSTANTS.ZOOM_STEP).toBe(0.1);
      });

      it('最小ズーム倍率以下にはズームアウトできない', async () => {
        const user = userEvent.setup();
        // 最小ズームレベルに設定
        mockCanvasInstance.getZoom.mockReturnValue(ZOOM_CONSTANTS.MIN_ZOOM);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // ズームアウトボタンをクリック
        const zoomOutButton = screen.getByRole('button', { name: /ズームアウト/i });
        await user.click(zoomOutButton);

        // setZoomが最小値未満で呼ばれていないことを確認
        // または呼ばれても最小値以上であることを確認
        const calls = mockCanvasInstance.setZoom.mock.calls as number[][];
        const zoomValues = calls.map((call) => call[0]);
        zoomValues.forEach((zoom) => {
          expect(zoom).toBeGreaterThanOrEqual(ZOOM_CONSTANTS.MIN_ZOOM);
        });
      });

      it('最大ズーム倍率以上にはズームインできない', async () => {
        const user = userEvent.setup();
        // 最大ズームレベルに設定
        mockCanvasInstance.getZoom.mockReturnValue(ZOOM_CONSTANTS.MAX_ZOOM);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // ズームインボタンをクリック
        const zoomInButton = screen.getByRole('button', { name: /ズームイン/i });
        await user.click(zoomInButton);

        // setZoomが最大値超過で呼ばれていないことを確認
        const calls = mockCanvasInstance.setZoom.mock.calls as number[][];
        const zoomValues = calls.map((call) => call[0]);
        zoomValues.forEach((zoom) => {
          expect(zoom).toBeLessThanOrEqual(ZOOM_CONSTANTS.MAX_ZOOM);
        });
      });
    });

    describe('マウスホイールによるズーム', () => {
      it('マウスホイールでズームインできる', async () => {
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // Canvasコンテナを取得
        const canvasContainer = screen.getByTestId('canvas-container');

        // ホイールイベント（上方向 = ズームイン）
        fireEvent.wheel(canvasContainer, {
          deltaY: -100,
          ctrlKey: false,
        });

        // setZoomが呼ばれることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
        });
      });

      it('マウスホイールでズームアウトできる', async () => {
        mockCanvasInstance.getZoom.mockReturnValue(2.0);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // Canvasコンテナを取得
        const canvasContainer = screen.getByTestId('canvas-container');

        // ホイールイベント（下方向 = ズームアウト）
        fireEvent.wheel(canvasContainer, {
          deltaY: 100,
          ctrlKey: false,
        });

        // setZoomが呼ばれることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
        });
      });

      it('ホイールズームは範囲内に制限される', async () => {
        mockCanvasInstance.getZoom.mockReturnValue(1.0);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // Canvasコンテナを取得
        const canvasContainer = screen.getByTestId('canvas-container');

        // 大量のズームインを試行
        for (let i = 0; i < 200; i++) {
          fireEvent.wheel(canvasContainer, {
            deltaY: -100,
            ctrlKey: false,
          });
        }

        // setZoomが呼ばれた値が範囲内であることを確認
        const calls = mockCanvasInstance.setZoom.mock.calls as number[][];
        calls.forEach((call) => {
          expect(call[0]).toBeGreaterThanOrEqual(ZOOM_CONSTANTS.MIN_ZOOM);
          expect(call[0]).toBeLessThanOrEqual(ZOOM_CONSTANTS.MAX_ZOOM);
        });
      });
    });

    describe('ズーム表示の更新', () => {
      it('ズームイン後にズーム倍率表示が更新される', async () => {
        const user = userEvent.setup();
        let currentZoom = 1.0;
        mockCanvasInstance.getZoom.mockImplementation(() => currentZoom);
        mockCanvasInstance.setZoom.mockImplementation((zoom: number) => {
          currentZoom = zoom;
        });

        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // 初期表示を確認
        const zoomDisplay = screen.getByTestId('zoom-display');
        expect(zoomDisplay).toHaveTextContent('100%');

        // ズームインボタンをクリック
        const zoomInButton = screen.getByRole('button', { name: /ズームイン/i });
        await user.click(zoomInButton);

        // 表示が更新されることを確認
        await waitFor(() => {
          expect(zoomDisplay).not.toHaveTextContent('100%');
        });
      });
    });

    describe('キーボードショートカット', () => {
      it('+キーでズームインできる', async () => {
        const user = userEvent.setup();
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // +キーを押す
        await user.keyboard('+');

        // setZoomが呼ばれることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
        });
      });

      it('-キーでズームアウトできる', async () => {
        const user = userEvent.setup();
        mockCanvasInstance.getZoom.mockReturnValue(2.0);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // -キーを押す
        await user.keyboard('-');

        // setZoomが呼ばれることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
        });
      });

      it('0キーでズームリセットできる', async () => {
        const user = userEvent.setup();
        mockCanvasInstance.getZoom.mockReturnValue(2.0);
        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // 0キーを押す
        await user.keyboard('0');

        // setZoomが1.0で呼ばれることを確認
        await waitFor(() => {
          expect(mockCanvasInstance.setZoom).toHaveBeenCalledWith(1);
        });
      });
    });

    describe('ズームボタンの無効化', () => {
      it('最大ズーム時にズームインボタンが無効になる', async () => {
        const user = userEvent.setup();
        // モックでgetZoomが最大値を返すように設定
        // ただし、setZoomが呼ばれた後に状態を更新
        let currentZoom = 1.0;
        mockCanvasInstance.getZoom.mockImplementation(() => currentZoom);
        mockCanvasInstance.setZoom.mockImplementation((zoom: number) => {
          currentZoom = zoom;
        });

        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // 最大ズームに達するまでズームインを繰り返す
        const zoomInButton = screen.getByRole('button', { name: /ズームイン/i });

        // 初期状態では有効
        expect(zoomInButton).not.toBeDisabled();

        // 最大値まで直接ズーム（setZoomを直接呼び出す）
        // setZoomに最大値を設定
        currentZoom = ZOOM_CONSTANTS.MAX_ZOOM;
        // ボタンクリックでstateを更新させる
        await user.click(zoomInButton);

        // 状態が更新されるのを待つ
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /ズームイン/i })).toBeDisabled();
        });
      });

      it('最小ズーム時にズームアウトボタンが無効になる', async () => {
        const user = userEvent.setup();
        // モックでgetZoomが最小値を返すように設定
        let currentZoom = 1.0;
        mockCanvasInstance.getZoom.mockImplementation(() => currentZoom);
        mockCanvasInstance.setZoom.mockImplementation((zoom: number) => {
          currentZoom = zoom;
        });

        render(<ImageViewer {...defaultProps} />);

        // 画像読み込み完了を待つ
        await waitFor(() => {
          expect(mockFromURL).toHaveBeenCalled();
        });

        // 最小ズームに達するまでズームアウトを繰り返す
        const zoomOutButton = screen.getByRole('button', { name: /ズームアウト/i });

        // 初期状態では有効
        expect(zoomOutButton).not.toBeDisabled();

        // 最小値まで直接ズーム
        currentZoom = ZOOM_CONSTANTS.MIN_ZOOM;
        // ボタンクリックでstateを更新させる
        await user.click(zoomOutButton);

        // 状態が更新されるのを待つ
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /ズームアウト/i })).toBeDisabled();
        });
      });
    });
  });
});
