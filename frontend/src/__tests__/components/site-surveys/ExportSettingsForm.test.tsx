/**
 * ExportSettingsFormコンポーネントのテスト
 *
 * Task 83.1: ExportSettingsForm の切り出し
 * - 形式（JPEG/PNG）選択UI
 * - 解像度（low/medium/high）選択UI
 * - 注釈モード（include/exclude/original-only）選択UI
 * - value / onChange / disabled プロパティの挙動
 *
 * @see design.md - ExportSettingsForm (5247-5269)
 * @see requirements.md - 要件31.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportSettingsForm, {
  type ExportSettings,
} from '../../../components/site-surveys/ExportSettingsForm';

const defaultValue: ExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  annotationMode: 'include',
};

describe('ExportSettingsForm', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 基本レンダリング
  // ============================================================================

  describe('基本レンダリング', () => {
    it('コンポーネントが描画される', () => {
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      expect(screen.getByText('エクスポート形式')).toBeInTheDocument();
      expect(screen.getByText('品質（解像度）')).toBeInTheDocument();
      expect(screen.getByText('注釈オプション')).toBeInTheDocument();
    });

    it('形式選択ラジオ（JPEG / PNG）が表示される', () => {
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      expect(screen.getByRole('radio', { name: 'JPEG' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'PNG' })).toBeInTheDocument();
    });

    it('解像度選択ラジオ（低 / 中 / 高）が表示される', () => {
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      expect(screen.getByRole('radio', { name: '低' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '中' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '高' })).toBeInTheDocument();
    });

    it('注釈モード選択ラジオ（含める / 含めない / 元画像そのまま）が表示される', () => {
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      expect(screen.getByRole('radio', { name: '注釈を含める' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '注釈を含めない' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '元画像そのまま' })).toBeInTheDocument();
    });

    it('value で渡された値が選択状態として反映される', () => {
      const value: ExportSettings = {
        format: 'png',
        resolution: 'high',
        annotationMode: 'original-only',
      };

      render(<ExportSettingsForm value={value} onChange={mockOnChange} />);

      expect(screen.getByRole('radio', { name: 'PNG' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '高' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '元画像そのまま' })).toBeChecked();
    });
  });

  // ============================================================================
  // onChange イベント
  // ============================================================================

  describe('onChange', () => {
    it('形式を PNG に変更すると onChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      await user.click(screen.getByRole('radio', { name: 'PNG' }));

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith({
        ...defaultValue,
        format: 'png',
      });
    });

    it('解像度を high に変更すると onChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      await user.click(screen.getByRole('radio', { name: '高' }));

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith({
        ...defaultValue,
        resolution: 'high',
      });
    });

    it('注釈モードを exclude に変更すると onChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      await user.click(screen.getByRole('radio', { name: '注釈を含めない' }));

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith({
        ...defaultValue,
        annotationMode: 'exclude',
      });
    });

    it('注釈モードを original-only に変更すると onChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      await user.click(screen.getByRole('radio', { name: '元画像そのまま' }));

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith({
        ...defaultValue,
        annotationMode: 'original-only',
      });
    });
  });

  // ============================================================================
  // disabled 挙動
  // ============================================================================

  describe('disabled', () => {
    it('disabled=true のとき全ラジオが非活性になる', () => {
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} disabled={true} />);

      expect(screen.getByRole('radio', { name: 'JPEG' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'PNG' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '低' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '中' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '高' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '注釈を含める' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '注釈を含めない' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '元画像そのまま' })).toBeDisabled();
    });

    it('disabled=true のとき選択操作で onChange が呼ばれない', async () => {
      const user = userEvent.setup();
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} disabled={true} />);

      await user.click(screen.getByRole('radio', { name: 'PNG' }));
      await user.click(screen.getByRole('radio', { name: '高' }));
      await user.click(screen.getByRole('radio', { name: '注釈を含めない' }));

      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('disabled プロパティ未指定時はデフォルトで活性', () => {
      render(<ExportSettingsForm value={defaultValue} onChange={mockOnChange} />);

      expect(screen.getByRole('radio', { name: 'JPEG' })).not.toBeDisabled();
      expect(screen.getByRole('radio', { name: '低' })).not.toBeDisabled();
      expect(screen.getByRole('radio', { name: '注釈を含める' })).not.toBeDisabled();
    });
  });
});
