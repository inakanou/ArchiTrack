/**
 * @fileoverview BulkExportDialog のテスト
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * Requirements:
 * - 15.1: 一括ZIPダウンロード起動
 * - 15.5: 全件エクスポート起動
 * - 15.6: 選択エクスポート起動
 * - 15.7: 選択0件時の選択エクスポート無効化
 * - 15.11: 対象0件時の非実行+通知
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkExportDialog } from './BulkExportDialog';

describe('BulkExportDialog', () => {
  describe('起動と設定確定 (Requirement 15.1, 15.5, 15.6)', () => {
    it('全件モードで開くと対象件数を表示する', () => {
      render(
        <BulkExportDialog
          open
          mode="all"
          totalCount={5}
          selectedCount={0}
          onClose={vi.fn()}
          onStart={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/対象 5 件/)).toBeInTheDocument();
    });

    it('選択モードで開くと選択件数を表示する', () => {
      render(
        <BulkExportDialog
          open
          mode="selected"
          totalCount={10}
          selectedCount={3}
          onClose={vi.fn()}
          onStart={vi.fn()}
        />
      );

      expect(screen.getByText(/選択 3 件/)).toBeInTheDocument();
    });

    it('形式/解像度/看板モードを選択して開始すると、選んだ設定で onStart が呼ばれる', () => {
      const onStart = vi.fn();
      render(
        <BulkExportDialog
          open
          mode="all"
          totalCount={5}
          selectedCount={0}
          onClose={vi.fn()}
          onStart={onStart}
        />
      );

      fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));
      fireEvent.click(screen.getByRole('radio', { name: '高' }));
      fireEvent.click(screen.getByRole('radio', { name: 'アップロード原本そのまま' }));
      fireEvent.click(screen.getByRole('button', { name: '開始' }));

      expect(onStart).toHaveBeenCalledWith({
        format: 'png',
        resolution: 'high',
        signboardMode: 'original',
      });
    });

    it('キャンセルボタン押下で onClose が呼ばれ、onStart は呼ばれない', () => {
      const onClose = vi.fn();
      const onStart = vi.fn();
      render(
        <BulkExportDialog
          open
          mode="all"
          totalCount={5}
          selectedCount={0}
          onClose={onClose}
          onStart={onStart}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
    });

    it('open=false のとき何も描画しない', () => {
      render(
        <BulkExportDialog
          open={false}
          mode="all"
          totalCount={5}
          selectedCount={0}
          onClose={vi.fn()}
          onStart={vi.fn()}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('対象0件の非実行+通知 (Requirement 15.11)', () => {
    it('全件モードで対象アルバムが0件のとき、開始ボタンを無効化し onEmptyTarget を呼ぶ', () => {
      const onEmptyTarget = vi.fn();
      const onStart = vi.fn();
      render(
        <BulkExportDialog
          open
          mode="all"
          totalCount={0}
          selectedCount={0}
          onClose={vi.fn()}
          onStart={onStart}
          onEmptyTarget={onEmptyTarget}
        />
      );

      expect(onEmptyTarget).toHaveBeenCalledTimes(1);
      const startButton = screen.getByRole('button', { name: '開始' });
      expect(startButton).toBeDisabled();

      fireEvent.click(startButton);
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('選択0件時の選択エクスポート無効化 (Requirement 15.7)', () => {
    it('選択モードで選択件数が0のとき、開始ボタンを無効化し onEmptyTarget を呼ぶ', () => {
      const onEmptyTarget = vi.fn();
      const onStart = vi.fn();
      render(
        <BulkExportDialog
          open
          mode="selected"
          totalCount={10}
          selectedCount={0}
          onClose={vi.fn()}
          onStart={onStart}
          onEmptyTarget={onEmptyTarget}
        />
      );

      expect(onEmptyTarget).toHaveBeenCalledTimes(1);
      const startButton = screen.getByRole('button', { name: '開始' });
      expect(startButton).toBeDisabled();
      expect(screen.getByText(/選択されていません/)).toBeInTheDocument();

      fireEvent.click(startButton);
      expect(onStart).not.toHaveBeenCalled();
    });

    it('選択件数が1件以上あれば開始ボタンは活性のままで onEmptyTarget は呼ばれない', () => {
      const onEmptyTarget = vi.fn();
      render(
        <BulkExportDialog
          open
          mode="selected"
          totalCount={10}
          selectedCount={1}
          onClose={vi.fn()}
          onStart={vi.fn()}
          onEmptyTarget={onEmptyTarget}
        />
      );

      expect(onEmptyTarget).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '開始' })).not.toBeDisabled();
    });
  });
});
