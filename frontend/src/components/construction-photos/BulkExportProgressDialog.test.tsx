/**
 * @fileoverview BulkExportProgressDialog のテスト
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * Requirements:
 * - 15.8: 進捗状況（完了件数・総件数）の表示
 * - 15.9: 進行中エクスポート処理の中断
 * - 15.10: 部分失敗の表示
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { BulkExportProgressDialog } from './BulkExportProgressDialog';

describe('BulkExportProgressDialog', () => {
  it('open=false のとき何も描画しない', () => {
    render(
      <BulkExportProgressDialog
        open={false}
        progress={null}
        isRunning
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('progress=null のとき準備中メッセージを表示する', () => {
    render(
      <BulkExportProgressDialog
        open
        progress={null}
        isRunning
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('準備中…')).toBeInTheDocument();
  });

  describe('進捗表示 (Requirement 15.8)', () => {
    it('完了件数・総件数を表示する', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 3, total: 10, failed: 0 }}
          isRunning
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('3 / 10 件')).toBeInTheDocument();
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '30');
    });
  });

  describe('部分失敗の表示 (Requirement 15.10)', () => {
    it('failed > 0 のとき失敗件数を表示する', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 5, total: 10, failed: 2 }}
          isRunning
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/失敗 2 件/)).toBeInTheDocument();
    });

    it('failed = 0 のとき失敗件数を表示しない', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 5, total: 10, failed: 0 }}
          isRunning
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByText(/失敗/)).not.toBeInTheDocument();
    });
  });

  describe('中断操作 (Requirement 15.9)', () => {
    it('実行中は中断ボタンを表示し、押下で onCancel が呼ばれる', () => {
      const onCancel = vi.fn();
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 3, total: 10, failed: 0 }}
          isRunning
          onCancel={onCancel}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '中断' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('完了後(isRunning=false)は中断ボタンの代わりに閉じるボタンを表示し、押下で onClose が呼ばれる', () => {
      const onClose = vi.fn();
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 10, total: 10, failed: 0 }}
          isRunning={false}
          onCancel={vi.fn()}
          onClose={onClose}
        />
      );

      expect(screen.queryByRole('button', { name: '中断' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
