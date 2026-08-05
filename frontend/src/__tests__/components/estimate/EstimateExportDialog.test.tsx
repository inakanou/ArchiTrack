/**
 * @fileoverview EstimateExportDialog の DOM 契約テスト（Task 56.9）
 *
 * 出力ダイアログは E2E（`e2e/specs/estimate/*`）が**属性セレクタで直接掴む**数少ない画面要素で、
 * 行タイプは `input[type="checkbox"][value="ESTIMATE"]`、出力形式は
 * `input[type="radio"][name="export-format"][value="xlsx"]` で選択されている。
 * 56.9 で出力経路をフロントエンド生成へ差し替えた際にこれらの目印が失われると、
 * 単体テストは緑のまま E2E だけが落ちる（発見が数十分後になる）。
 *
 * 本ファイルは**振る舞いではなく目印**を固定する。
 * 選択・既定値・生成・未保存表示の振る舞いは
 * `components/estimate/EstimateExportDialog.test.tsx` が受け持つ。
 *
 * Requirements:
 * - REQ-32.1: 「見積」「実行」「業者」をチェックボックスで複数選択可能とする
 * - REQ-10.9 / REQ-32.8: 出力形式のデフォルトは表計算形式（Excel / .xlsx）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstimateExportDialog } from '../../../components/estimate/EstimateExportDialog';
import type { EstimateExportDialogProps } from '../../../components/estimate/EstimateExportDialog';

const props: EstimateExportDialogProps = {
  isOpen: true,
  estimateName: 'テスト見積書',
  projectId: 'proj-1',
  items: [],
  reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
  hasUnsavedChanges: false,
  onClose: vi.fn(),
};

describe('EstimateExportDialog - E2E が依存する DOM 契約', () => {
  it('ダイアログの役割と説明文を保つ', () => {
    render(<EstimateExportDialog {...props} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('見積書出力')).toBeInTheDocument();
    // `estimate-e2e.spec.ts` が /出力形式を選択/i で待ち合わせる
    expect(screen.getByText(/出力形式を選択/)).toBeInTheDocument();
    expect(screen.getByText('出力対象')).toBeInTheDocument();
  });

  it('行タイプを value 付きのチェックボックスとして描画する', () => {
    render(<EstimateExportDialog {...props} />);

    for (const [value, label] of [
      ['ESTIMATE', '見積'],
      ['EXECUTION', '実行'],
      ['VENDOR', '業者'],
    ] as const) {
      const input = document.querySelector(`input[type="checkbox"][value="${value}"]`);
      expect(input).not.toBeNull();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('出力形式を name="export-format" のラジオボタンとして描画する', () => {
    render(<EstimateExportDialog {...props} />);

    for (const value of ['pdf', 'xlsx'] as const) {
      const input = document.querySelector(
        `input[type="radio"][name="export-format"][value="${value}"]`
      );
      expect(input).not.toBeNull();
    }
  });

  it('「出力」「キャンセル」のボタン名を保つ', () => {
    render(<EstimateExportDialog {...props} />);

    expect(screen.getByRole('button', { name: '出力' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
  });
});
