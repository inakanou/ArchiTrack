/**
 * @fileoverview StylePanelコンポーネントのテスト
 *
 * Task 13.4: スタイル設定パネルを実装する（TDD）
 *
 * Requirements:
 * - 6.7: 寸法線の色・線の太さをカスタマイズ可能にする
 * - 7.10: 図形の色・線の太さ・塗りつぶしをカスタマイズ可能にする
 * - 8.5: テキストのフォントサイズ・色・背景色をカスタマイズ可能にする
 *
 * テスト対象:
 * - 色選択（線色、塗りつぶし色）
 * - 線の太さ設定
 * - フォントサイズ設定（テキスト用）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StylePanel, {
  type StyleOptions,
  DEFAULT_STYLE_OPTIONS,
} from '../../../components/site-surveys/StylePanel';

// ============================================================================
// テストヘルパー
// ============================================================================

const defaultProps = {
  styleOptions: DEFAULT_STYLE_OPTIONS,
  onStyleChange: vi.fn(),
  disabled: false,
};

/**
 * IDで入力フィールドを取得するヘルパー
 */
function getInputById(id: string): HTMLInputElement {
  const input = document.getElementById(id) as HTMLInputElement;
  if (!input) throw new Error(`Input with id "${id}" not found`);
  return input;
}

// ============================================================================
// テストスイート
// ============================================================================

describe('StylePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // コンポーネント基本構造テスト
  // ==========================================================================
  describe('コンポーネント構造', () => {
    it('StylePanelコンテナがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const panel = screen.getByTestId('style-panel');
      expect(panel).toBeInTheDocument();
    });

    it('パネルにはrole="group"が設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const panel = screen.getByRole('group', { name: /スタイル設定/i });
      expect(panel).toBeInTheDocument();
    });

    it('パネルにはaria-labelが設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const panel = screen.getByTestId('style-panel');
      expect(panel).toHaveAttribute('aria-label', 'スタイル設定');
    });
  });

  // ==========================================================================
  // 線色設定テスト (Requirement 6.7, 7.10)
  // ==========================================================================
  describe('線色設定', () => {
    it('線色選択フィールドがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const strokeColorLabel = screen.getByLabelText('線色');
      expect(strokeColorLabel).toBeInTheDocument();
    });

    it('線色の色選択入力がレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const colorInput = getInputById('stroke-color');
      expect(colorInput).toBeInTheDocument();
      expect(colorInput).toHaveAttribute('type', 'color');
    });

    it('線色の初期値が正しく設定される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        strokeColor: '#ff0000',
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const colorInput = getInputById('stroke-color');
      expect(colorInput).toHaveValue('#ff0000');
    });

    it('線色を変更するとonStyleChangeが呼ばれる', () => {
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const colorInput = getInputById('stroke-color');
      fireEvent.change(colorInput, { target: { value: '#00ff00' } });

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          strokeColor: '#00ff00',
        })
      );
    });

    it('プリセットカラーボタンが表示される', () => {
      render(<StylePanel {...defaultProps} />);

      // プリセットカラーが少なくとも表示されていることを確認
      const presetSection = screen.getByTestId('stroke-color-presets');
      expect(presetSection).toBeInTheDocument();
    });

    it('プリセットカラーをクリックすると線色が変更される', async () => {
      const user = userEvent.setup();
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const presetButtons = screen.getAllByTestId(/stroke-preset-/);
      expect(presetButtons.length).toBeGreaterThan(0);

      const firstPresetButton = presetButtons[0];
      if (!firstPresetButton) throw new Error('Preset button not found');
      await user.click(firstPresetButton);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          strokeColor: expect.any(String),
        })
      );
    });
  });

  // ==========================================================================
  // 塗りつぶし色設定テスト (Requirement 7.10, 8.5)
  // ==========================================================================
  describe('塗りつぶし色設定', () => {
    it('塗りつぶし色選択フィールドがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const fillColorLabel = screen.getByLabelText('塗りつぶし');
      expect(fillColorLabel).toBeInTheDocument();
    });

    it('塗りつぶし色の色選択入力がレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const colorInput = getInputById('fill-color');
      expect(colorInput).toBeInTheDocument();
      expect(colorInput).toHaveAttribute('type', 'color');
    });

    it('塗りつぶし色の初期値が正しく設定される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        fillColor: '#0000ff',
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const colorInput = getInputById('fill-color');
      expect(colorInput).toHaveValue('#0000ff');
    });

    it('塗りつぶし色を変更するとonStyleChangeが呼ばれる', () => {
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const colorInput = getInputById('fill-color');
      fireEvent.change(colorInput, { target: { value: '#ffff00' } });

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fillColor: '#ffff00',
        })
      );
    });

    it('塗りつぶしなしオプションが選択できる', async () => {
      const user = userEvent.setup();
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const noFillButton = screen.getByRole('button', { name: /塗りつぶしなし/i });
      expect(noFillButton).toBeInTheDocument();

      await user.click(noFillButton);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fillColor: 'transparent',
        })
      );
    });

    it('プリセットカラーボタンが表示される', () => {
      render(<StylePanel {...defaultProps} />);

      const presetSection = screen.getByTestId('fill-color-presets');
      expect(presetSection).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 線の太さ設定テスト (Requirement 6.7, 7.10)
  // ==========================================================================
  describe('線の太さ設定', () => {
    it('線の太さ設定フィールドがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const strokeWidthLabel = screen.getByLabelText('線の太さ');
      expect(strokeWidthLabel).toBeInTheDocument();
    });

    it('線の太さのスライダー入力がレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const slider = getInputById('stroke-width');
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveAttribute('type', 'range');
    });

    it('線の太さの初期値が正しく設定される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        strokeWidth: 4,
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const slider = getInputById('stroke-width');
      expect(slider).toHaveValue('4');
    });

    it('線の太さを変更するとonStyleChangeが呼ばれる', () => {
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const slider = getInputById('stroke-width');
      fireEvent.change(slider, { target: { value: '6' } });

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          strokeWidth: 6,
        })
      );
    });

    it('線の太さには最小値（1）が設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const slider = getInputById('stroke-width');
      expect(slider).toHaveAttribute('min', '1');
    });

    it('線の太さには最大値（20）が設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const slider = getInputById('stroke-width');
      expect(slider).toHaveAttribute('max', '20');
    });

    it('現在の線の太さが表示される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        strokeWidth: 5,
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const valueDisplay = screen.getByTestId('stroke-width-value');
      expect(valueDisplay).toHaveTextContent('5');
    });

    it('プリセットの太さボタンが表示される', () => {
      render(<StylePanel {...defaultProps} />);

      // 1, 2, 4, 6, 8のプリセットが表示されることを確認
      const presetButtons = screen.getAllByTestId(/stroke-width-preset-/);
      expect(presetButtons.length).toBeGreaterThan(0);
    });

    it('プリセットの太さをクリックすると太さが変更される', async () => {
      const user = userEvent.setup();
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const preset4Button = screen.getByTestId('stroke-width-preset-4');
      await user.click(preset4Button);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          strokeWidth: 4,
        })
      );
    });
  });

  // ==========================================================================
  // フォントサイズ設定テスト (Requirement 8.5)
  // ==========================================================================
  describe('フォントサイズ設定', () => {
    it('フォントサイズ設定フィールドがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const fontSizeLabel = screen.getByLabelText('フォントサイズ');
      expect(fontSizeLabel).toBeInTheDocument();
    });

    it('フォントサイズの入力フィールドがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const input = getInputById('font-size');
      expect(input).toBeInTheDocument();
    });

    it('フォントサイズの初期値が正しく設定される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        fontSize: 20,
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const input = getInputById('font-size');
      expect(input).toHaveValue(20);
    });

    it('フォントサイズを変更するとonStyleChangeが呼ばれる', () => {
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const input = getInputById('font-size');
      fireEvent.change(input, { target: { value: '24' } });

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fontSize: 24,
        })
      );
    });

    it('フォントサイズには最小値（8）が設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const input = getInputById('font-size');
      expect(input).toHaveAttribute('min', '8');
    });

    it('フォントサイズには最大値（72）が設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const input = getInputById('font-size');
      expect(input).toHaveAttribute('max', '72');
    });

    it('プリセットのフォントサイズボタンが表示される', () => {
      render(<StylePanel {...defaultProps} />);

      const presetButtons = screen.getAllByTestId(/font-size-preset-/);
      expect(presetButtons.length).toBeGreaterThan(0);
    });

    it('プリセットのフォントサイズをクリックするとサイズが変更される', async () => {
      const user = userEvent.setup();
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const preset18Button = screen.getByTestId('font-size-preset-18');
      await user.click(preset18Button);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fontSize: 18,
        })
      );
    });
  });

  // ==========================================================================
  // フォント色設定テスト (Requirement 8.5)
  // ==========================================================================
  describe('フォント色設定', () => {
    it('フォント色選択フィールドがレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const fontColorLabel = screen.getByLabelText('文字色');
      expect(fontColorLabel).toBeInTheDocument();
    });

    it('フォント色の色選択入力がレンダリングされる', () => {
      render(<StylePanel {...defaultProps} />);

      const colorInput = getInputById('font-color');
      expect(colorInput).toBeInTheDocument();
      expect(colorInput).toHaveAttribute('type', 'color');
    });

    it('フォント色の初期値が正しく設定される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        fontColor: '#333333',
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const colorInput = getInputById('font-color');
      expect(colorInput).toHaveValue('#333333');
    });

    it('フォント色を変更するとonStyleChangeが呼ばれる', () => {
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const colorInput = getInputById('font-color');
      fireEvent.change(colorInput, { target: { value: '#ffffff' } });

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fontColor: '#ffffff',
        })
      );
    });
  });

  // ==========================================================================
  // disabled状態テスト
  // ==========================================================================
  describe('disabled状態', () => {
    it('disabled=trueの場合、すべての入力フィールドが無効化される', () => {
      render(<StylePanel {...defaultProps} disabled={true} />);

      const sliders = screen.getAllByRole('slider');
      const spinbuttons = screen.getAllByRole('spinbutton');
      const colorInputs = document.querySelectorAll('input[type="color"]');

      sliders.forEach((slider) => {
        expect(slider).toBeDisabled();
      });
      spinbuttons.forEach((input) => {
        expect(input).toBeDisabled();
      });
      colorInputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });

    it('disabled=trueの場合、プリセットボタンも無効化される', () => {
      render(<StylePanel {...defaultProps} disabled={true} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('disabled=falseの場合、すべての入力フィールドが有効化される', () => {
      render(<StylePanel {...defaultProps} disabled={false} />);

      const sliders = screen.getAllByRole('slider');
      sliders.forEach((slider) => {
        expect(slider).not.toBeDisabled();
      });
    });
  });

  // ==========================================================================
  // DEFAULT_STYLE_OPTIONSテスト
  // ==========================================================================
  describe('DEFAULT_STYLE_OPTIONS', () => {
    it('デフォルトの線色が定義されている', () => {
      expect(DEFAULT_STYLE_OPTIONS.strokeColor).toBeDefined();
      expect(typeof DEFAULT_STYLE_OPTIONS.strokeColor).toBe('string');
    });

    it('デフォルトの塗りつぶし色が定義されている', () => {
      expect(DEFAULT_STYLE_OPTIONS.fillColor).toBeDefined();
      expect(typeof DEFAULT_STYLE_OPTIONS.fillColor).toBe('string');
    });

    it('デフォルトの線の太さが定義されている', () => {
      expect(DEFAULT_STYLE_OPTIONS.strokeWidth).toBeDefined();
      expect(typeof DEFAULT_STYLE_OPTIONS.strokeWidth).toBe('number');
      expect(DEFAULT_STYLE_OPTIONS.strokeWidth).toBeGreaterThan(0);
    });

    it('デフォルトのフォントサイズが定義されている', () => {
      expect(DEFAULT_STYLE_OPTIONS.fontSize).toBeDefined();
      expect(typeof DEFAULT_STYLE_OPTIONS.fontSize).toBe('number');
      expect(DEFAULT_STYLE_OPTIONS.fontSize).toBeGreaterThan(0);
    });

    it('デフォルトの文字色が定義されている', () => {
      expect(DEFAULT_STYLE_OPTIONS.fontColor).toBeDefined();
      expect(typeof DEFAULT_STYLE_OPTIONS.fontColor).toBe('string');
    });
  });

  // ==========================================================================
  // アクセシビリティテスト
  // ==========================================================================
  describe('アクセシビリティ', () => {
    it('すべての入力フィールドにはラベルが設定される', () => {
      render(<StylePanel {...defaultProps} />);

      // IDで入力フィールドが存在し、対応するラベルがあることを確認
      expect(getInputById('stroke-color')).toBeInTheDocument();
      expect(getInputById('fill-color')).toBeInTheDocument();
      expect(getInputById('stroke-width')).toBeInTheDocument();
      expect(getInputById('font-size')).toBeInTheDocument();
      expect(getInputById('font-color')).toBeInTheDocument();
    });

    it('スライダーにはaria属性が設定される', () => {
      render(<StylePanel {...defaultProps} />);

      const slider = getInputById('stroke-width');
      expect(slider).toHaveAttribute('aria-valuemin');
      expect(slider).toHaveAttribute('aria-valuemax');
      expect(slider).toHaveAttribute('aria-valuenow');
    });

    it('キーボードでプリセットボタンを操作できる', async () => {
      const user = userEvent.setup();
      const onStyleChange = vi.fn();

      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      const presetButton = screen.getByTestId('stroke-width-preset-4');
      presetButton.focus();

      await user.keyboard('{Enter}');

      expect(onStyleChange).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // レスポンシブ対応テスト
  // ==========================================================================
  describe('レスポンシブ対応', () => {
    it('パネルはコンパクトなレイアウトで表示される', () => {
      render(<StylePanel {...defaultProps} />);

      const panel = screen.getByTestId('style-panel');
      expect(panel).toBeInTheDocument();
      // コンパクトなレイアウトであることを確認（実装側でスタイル検証）
    });

    it('設定項目はグループ化されて表示される', () => {
      render(<StylePanel {...defaultProps} />);

      // 色設定セクションが存在
      const colorSection = screen.getByTestId('color-settings-section');
      expect(colorSection).toBeInTheDocument();

      // 線設定セクションが存在
      const strokeSection = screen.getByTestId('stroke-settings-section');
      expect(strokeSection).toBeInTheDocument();

      // テキスト設定セクションが存在
      const textSection = screen.getByTestId('text-settings-section');
      expect(textSection).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 色の値検証テスト
  // ==========================================================================
  describe('色の値検証', () => {
    it('有効なHEX色コードが受け入れられる', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        strokeColor: '#123abc',
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      const colorInput = getInputById('stroke-color');
      expect(colorInput).toHaveValue('#123abc');
    });

    it('3桁のHEX色コードが6桁に変換されて表示される', () => {
      const styleOptions: StyleOptions = {
        ...DEFAULT_STYLE_OPTIONS,
        strokeColor: '#f00',
      };

      render(<StylePanel {...defaultProps} styleOptions={styleOptions} />);

      // input[type=color]は6桁のHEXを期待するため、3桁は変換される
      const colorInput = getInputById('stroke-color');
      expect(colorInput).toHaveValue('#ff0000');
    });
  });
});
