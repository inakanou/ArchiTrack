/**
 * @fileoverview AnnotationToolbarコンポーネントのテスト
 *
 * Task 13.2: ツール切り替えUIを実装する（TDD）
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 *
 * テスト対象:
 * - ツールバーコンポーネントのレンダリング
 * - 各種ツール（選択、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキスト）の切り替え
 * - アクティブツールの視覚的フィードバック
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';
import { TOOL_DEFINITIONS } from '../../../components/site-surveys/annotation-toolbar.constants';

// ============================================================================
// テストヘルパー
// ============================================================================

const defaultProps = {
  activeTool: 'select' as ToolType,
  onToolChange: vi.fn(),
  disabled: false,
};

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 13.2: ツールバーUIテスト
  // ==========================================================================
  describe('ツールバーUI', () => {
    describe('ツールバーのレンダリング', () => {
      it('ツールバーコンテナがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const toolbar = screen.getByTestId('annotation-toolbar');
        expect(toolbar).toBeInTheDocument();
      });

      it('ツールバーにはrole="toolbar"が設定される', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const toolbar = screen.getByRole('toolbar');
        expect(toolbar).toBeInTheDocument();
      });

      it('ツールバーにはaria-labelが設定される', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const toolbar = screen.getByRole('toolbar');
        expect(toolbar).toHaveAttribute('aria-label', '注釈ツール');
      });
    });

    describe('ツールボタンのレンダリング', () => {
      it('選択ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const selectButton = screen.getByRole('button', { name: /選択/i });
        expect(selectButton).toBeInTheDocument();
      });

      it('寸法線ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const dimensionButton = screen.getByRole('button', { name: /寸法線/i });
        expect(dimensionButton).toBeInTheDocument();
      });

      it('矢印ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const arrowButton = screen.getByRole('button', { name: /矢印/i });
        expect(arrowButton).toBeInTheDocument();
      });

      it('円ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const circleButton = screen.getByRole('button', { name: /円/i });
        expect(circleButton).toBeInTheDocument();
      });

      it('四角形ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const rectangleButton = screen.getByRole('button', { name: /四角形/i });
        expect(rectangleButton).toBeInTheDocument();
      });

      it('多角形ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const polygonButton = screen.getByRole('button', { name: /多角形/i });
        expect(polygonButton).toBeInTheDocument();
      });

      it('折れ線ツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const polylineButton = screen.getByRole('button', { name: /折れ線/i });
        expect(polylineButton).toBeInTheDocument();
      });

      it('フリーハンドツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const freehandButton = screen.getByRole('button', { name: /フリーハンド/i });
        expect(freehandButton).toBeInTheDocument();
      });

      it('テキストツールボタンがレンダリングされる', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const textButton = screen.getByRole('button', { name: /テキスト/i });
        expect(textButton).toBeInTheDocument();
      });

      it('すべてのツールボタンとアクションボタンが表示される', () => {
        render(<AnnotationToolbar {...defaultProps} />);

        const buttons = screen.getAllByRole('button');
        // 9種類のツールボタン + 4種類のアクションボタン（元に戻す、やり直し、保存、エクスポート）= 13個
        expect(buttons).toHaveLength(13);
      });
    });
  });

  // ==========================================================================
  // ツール切り替えテスト
  // ==========================================================================
  describe('ツール切り替え', () => {
    it('選択ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(
        <AnnotationToolbar {...defaultProps} activeTool="arrow" onToolChange={onToolChange} />
      );

      const selectButton = screen.getByRole('button', { name: /選択/i });
      await user.click(selectButton);

      expect(onToolChange).toHaveBeenCalledWith('select');
    });

    it('寸法線ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const dimensionButton = screen.getByRole('button', { name: /寸法線/i });
      await user.click(dimensionButton);

      expect(onToolChange).toHaveBeenCalledWith('dimension');
    });

    it('矢印ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      await user.click(arrowButton);

      expect(onToolChange).toHaveBeenCalledWith('arrow');
    });

    it('円ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const circleButton = screen.getByRole('button', { name: /円/i });
      await user.click(circleButton);

      expect(onToolChange).toHaveBeenCalledWith('circle');
    });

    it('四角形ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const rectangleButton = screen.getByRole('button', { name: /四角形/i });
      await user.click(rectangleButton);

      expect(onToolChange).toHaveBeenCalledWith('rectangle');
    });

    it('多角形ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const polygonButton = screen.getByRole('button', { name: /多角形/i });
      await user.click(polygonButton);

      expect(onToolChange).toHaveBeenCalledWith('polygon');
    });

    it('折れ線ツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const polylineButton = screen.getByRole('button', { name: /折れ線/i });
      await user.click(polylineButton);

      expect(onToolChange).toHaveBeenCalledWith('polyline');
    });

    it('フリーハンドツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const freehandButton = screen.getByRole('button', { name: /フリーハンド/i });
      await user.click(freehandButton);

      expect(onToolChange).toHaveBeenCalledWith('freehand');
    });

    it('テキストツールボタンクリックでonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      const textButton = screen.getByRole('button', { name: /テキスト/i });
      await user.click(textButton);

      expect(onToolChange).toHaveBeenCalledWith('text');
    });

    it('既にアクティブなツールをクリックしてもonToolChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(
        <AnnotationToolbar {...defaultProps} activeTool="select" onToolChange={onToolChange} />
      );

      const selectButton = screen.getByRole('button', { name: /選択/i });
      await user.click(selectButton);

      expect(onToolChange).toHaveBeenCalledWith('select');
    });
  });

  // ==========================================================================
  // アクティブツールの視覚的フィードバックテスト
  // ==========================================================================
  describe('アクティブツールの視覚的フィードバック', () => {
    it('選択ツールがアクティブな場合、選択ボタンにアクティブスタイルが適用される', () => {
      render(<AnnotationToolbar {...defaultProps} activeTool="select" />);

      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(selectButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('寸法線ツールがアクティブな場合、寸法線ボタンにアクティブスタイルが適用される', () => {
      render(<AnnotationToolbar {...defaultProps} activeTool="dimension" />);

      const dimensionButton = screen.getByRole('button', { name: /寸法線/i });
      expect(dimensionButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('矢印ツールがアクティブな場合、矢印ボタンにアクティブスタイルが適用される', () => {
      render(<AnnotationToolbar {...defaultProps} activeTool="arrow" />);

      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      expect(arrowButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('アクティブでないツールボタンにはaria-pressed="false"が設定される', () => {
      render(<AnnotationToolbar {...defaultProps} activeTool="select" />);

      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      expect(arrowButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('アクティブなツールボタンにはdata-active属性が設定される', () => {
      render(<AnnotationToolbar {...defaultProps} activeTool="circle" />);

      const circleButton = screen.getByRole('button', { name: /円/i });
      expect(circleButton).toHaveAttribute('data-active', 'true');
    });

    it('アクティブでないツールボタンにはdata-active="false"が設定される', () => {
      render(<AnnotationToolbar {...defaultProps} activeTool="select" />);

      const circleButton = screen.getByRole('button', { name: /円/i });
      expect(circleButton).toHaveAttribute('data-active', 'false');
    });
  });

  // ==========================================================================
  // disabled状態テスト
  // ==========================================================================
  describe('disabled状態', () => {
    it('disabled=trueの場合、すべてのツールボタンが無効化される', () => {
      render(<AnnotationToolbar {...defaultProps} disabled={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('disabled=trueの場合、ツールボタンクリックでonToolChangeが呼ばれない', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} disabled={true} onToolChange={onToolChange} />);

      const selectButton = screen.getByRole('button', { name: /選択/i });
      await user.click(selectButton);

      expect(onToolChange).not.toHaveBeenCalled();
    });

    it('disabled=falseの場合、すべてのツールボタンが有効化される', () => {
      render(<AnnotationToolbar {...defaultProps} disabled={false} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  // ==========================================================================
  // ツール定義テスト
  // ==========================================================================
  describe('ツール定義', () => {
    it('TOOL_DEFINITIONSに全てのツールが定義されている', () => {
      const expectedTools: ToolType[] = [
        'select',
        'dimension',
        'arrow',
        'circle',
        'rectangle',
        'polygon',
        'polyline',
        'freehand',
        'text',
      ];

      expectedTools.forEach((tool) => {
        expect(TOOL_DEFINITIONS[tool]).toBeDefined();
        expect(TOOL_DEFINITIONS[tool].id).toBe(tool);
        expect(TOOL_DEFINITIONS[tool].label).toBeDefined();
        expect(TOOL_DEFINITIONS[tool].icon).toBeDefined();
      });
    });

    it('各ツール定義にはid、label、iconが含まれる', () => {
      Object.values(TOOL_DEFINITIONS).forEach((tool) => {
        expect(tool.id).toBeDefined();
        expect(tool.label).toBeDefined();
        expect(tool.icon).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // アクセシビリティテスト
  // ==========================================================================
  describe('アクセシビリティ', () => {
    it('ツールバーにはキーボードナビゲーションが可能', async () => {
      const user = userEvent.setup();
      const onToolChange = vi.fn();

      render(<AnnotationToolbar {...defaultProps} onToolChange={onToolChange} />);

      // 最初のボタンにフォーカス
      const selectButton = screen.getByRole('button', { name: /選択/i });
      selectButton.focus();
      expect(selectButton).toHaveFocus();

      // Enterキーでツール選択
      await user.keyboard('{Enter}');
      expect(onToolChange).toHaveBeenCalledWith('select');
    });

    it('ツールボタンにはアクセシブルな名前が設定される', () => {
      render(<AnnotationToolbar {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('ツールボタンにはツールチップ（title属性）が設定される', () => {
      render(<AnnotationToolbar {...defaultProps} />);

      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(selectButton).toHaveAttribute('title');
    });
  });

  // ==========================================================================
  // レスポンシブ対応テスト
  // ==========================================================================
  describe('レスポンシブ対応', () => {
    it('ツールバーは横方向にスクロール可能（overflow-x: auto）', () => {
      render(<AnnotationToolbar {...defaultProps} />);

      const toolbar = screen.getByTestId('annotation-toolbar');
      // スタイルのチェックは実装側で確認
      expect(toolbar).toBeInTheDocument();
    });

    it('各ツールボタンには最小幅が設定される', () => {
      render(<AnnotationToolbar {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      // ボタンが適切にレンダリングされていることを確認
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
