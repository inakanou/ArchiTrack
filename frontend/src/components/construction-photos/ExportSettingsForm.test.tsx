/**
 * @fileoverview ExportSettingsForm のテスト
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * Requirements:
 * - 15.2: エクスポート画像形式（JPEG/PNG）の選択
 * - 15.3: エクスポート解像度（低/中/高）の選択
 * - 15.4: 看板重畳モード（composited/plain/original）の選択
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportSettingsForm } from './ExportSettingsForm';
import type { ConstructionPhotoExportSettings } from '../../services/export/ConstructionPhotoBulkExportService';

const DEFAULT_VALUE: ConstructionPhotoExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  signboardMode: 'composited',
};

describe('ExportSettingsForm', () => {
  describe('形式選択 (Requirement 15.2)', () => {
    it('JPEG/PNGのラジオボタンを表示し、現在値をチェック状態にする', () => {
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={vi.fn()} />);

      expect(screen.getByRole('radio', { name: 'JPEG' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'PNG' })).not.toBeChecked();
    });

    it('PNGを選択すると onChange に format=png を含む設定が渡る', () => {
      const onChange = vi.fn();
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALUE, format: 'png' });
    });

    it('JPEGを選択すると onChange に format=jpeg を含む設定が渡る', () => {
      const onChange = vi.fn();
      const pngValue: ConstructionPhotoExportSettings = { ...DEFAULT_VALUE, format: 'png' };
      render(<ExportSettingsForm value={pngValue} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));

      expect(onChange).toHaveBeenCalledWith({ ...pngValue, format: 'jpeg' });
    });
  });

  describe('解像度選択 (Requirement 15.3)', () => {
    it('低/中/高のラジオボタンを表示する', () => {
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={vi.fn()} />);

      expect(screen.getByRole('radio', { name: '低' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '中' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '高' })).toBeInTheDocument();
    });

    it('高を選択すると onChange に resolution=high を含む設定が渡る', () => {
      const onChange = vi.fn();
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: '高' }));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALUE, resolution: 'high' });
    });

    it('低を選択すると onChange に resolution=low を含む設定が渡る', () => {
      const onChange = vi.fn();
      const highValue: ConstructionPhotoExportSettings = { ...DEFAULT_VALUE, resolution: 'high' };
      render(<ExportSettingsForm value={highValue} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: '低' }));

      expect(onChange).toHaveBeenCalledWith({ ...highValue, resolution: 'low' });
    });

    it('中を選択すると onChange に resolution=medium を含む設定が渡る', () => {
      const onChange = vi.fn();
      const lowValue: ConstructionPhotoExportSettings = { ...DEFAULT_VALUE, resolution: 'low' };
      render(<ExportSettingsForm value={lowValue} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: '中' }));

      expect(onChange).toHaveBeenCalledWith({ ...lowValue, resolution: 'medium' });
    });
  });

  describe('看板重畳モード選択 (Requirement 15.4)', () => {
    it('composited/plain/originalの3択を表示する', () => {
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={vi.fn()} />);

      expect(screen.getByRole('radio', { name: '看板を重畳した画像' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '看板を重畳しない加工画像' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'アップロード原本そのまま' })).toBeInTheDocument();
    });

    it('原本そのままを選択すると onChange に signboardMode=original を含む設定が渡る', () => {
      const onChange = vi.fn();
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: 'アップロード原本そのまま' }));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALUE, signboardMode: 'original' });
    });

    it('看板を重畳しない加工画像を選択すると onChange に signboardMode=plain を含む設定が渡る', () => {
      const onChange = vi.fn();
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: '看板を重畳しない加工画像' }));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALUE, signboardMode: 'plain' });
    });

    it('看板を重畳した画像を選択すると onChange に signboardMode=composited を含む設定が渡る', () => {
      const onChange = vi.fn();
      const plainValue: ConstructionPhotoExportSettings = {
        ...DEFAULT_VALUE,
        signboardMode: 'plain',
      };
      render(<ExportSettingsForm value={plainValue} onChange={onChange} />);

      fireEvent.click(screen.getByRole('radio', { name: '看板を重畳した画像' }));

      expect(onChange).toHaveBeenCalledWith({ ...plainValue, signboardMode: 'composited' });
    });
  });

  describe('disabled', () => {
    it('disabled=true のとき全てのラジオボタンを非活性にする', () => {
      render(<ExportSettingsForm value={DEFAULT_VALUE} onChange={vi.fn()} disabled />);

      screen.getAllByRole('radio').forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });
  });
});
