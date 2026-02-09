/**
 * @fileoverview ItemSelectionPanelコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.4: ItemSelectionPanelコンポーネントを実装する
 * Task 30: クライアントサイド状態管理・保存ボタン方式への改修
 * Task 36.1: ItemSelectionPanelの改修テスト
 *
 * Requirements:
 * - 4.2: 見積依頼詳細画面に内訳書項目の一覧を表示する
 * - 4.3: 各項目行にチェックボックスを表示する
 * - 4.4: チェックボックス変更時にクライアントサイド状態のみ更新する
 * - 4.5: 保存ボタンクリック時に一括送信する
 * - 4.6: チェックボックスのデフォルト状態は選択済みとする
 * - 4.7: 「内訳書を本文に含める」チェックボックスを表示する
 * - 4.8: 見積依頼方法（メール/FAX）ラジオボタンを表示する
 * - 4.9: 項目が存在しない場合のメッセージを表示する
 * - 4.10: 他の見積依頼で選択済みの項目の背景色を変更する（bg-orange-50）
 * - 4.11: 他の見積依頼の依頼先取引先名を表示する
 * - 4.12: 複数の見積依頼で選択されている場合の取引先名をカンマ区切りで表示する
 * - 4.14: 見積依頼方法ラジオボタンのクライアントサイド管理
 * - 4.19: 未保存変更時の保存ボタン強調表示
 * - 4.20: ページ離脱時の確認ダイアログ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ItemSelectionPanel } from './ItemSelectionPanel';
import type { ItemWithSelectionInfo } from '../../types/estimate-request.types';

describe('ItemSelectionPanel', () => {
  const mockItems: ItemWithSelectionInfo[] = [
    {
      id: 'item-1',
      estimateRequestItemId: 'eri-1',
      customCategory: 'カテゴリA',
      workType: '仮設工事',
      name: '足場設置',
      specification: 'H=10m',
      unit: 'm2',
      quantity: 100,
      displayOrder: 1,
      selected: true,
      otherRequests: [],
    },
    {
      id: 'item-2',
      estimateRequestItemId: 'eri-2',
      customCategory: 'カテゴリB',
      workType: '解体工事',
      name: '内装解体',
      specification: null,
      unit: '式',
      quantity: 1,
      displayOrder: 2,
      selected: false,
      otherRequests: [],
    },
    {
      id: 'item-3',
      estimateRequestItemId: 'eri-3',
      customCategory: 'カテゴリC',
      workType: '躯体工事',
      name: 'コンクリート打設',
      specification: '21-18-25',
      unit: 'm3',
      quantity: 50,
      displayOrder: 3,
      selected: true,
      otherRequests: [
        {
          estimateRequestId: 'er-other-1',
          estimateRequestName: '他の見積依頼#1',
          tradingPartnerName: '協力業者X',
        },
      ],
    },
    {
      id: 'item-4',
      estimateRequestItemId: 'eri-4',
      customCategory: 'カテゴリD',
      workType: '仕上げ工事',
      name: '塗装',
      specification: 'OP塗り',
      unit: 'm2',
      quantity: 200,
      displayOrder: 4,
      selected: true,
      otherRequests: [
        {
          estimateRequestId: 'er-other-1',
          estimateRequestName: '他の見積依頼#1',
          tradingPartnerName: '協力業者X',
        },
        {
          estimateRequestId: 'er-other-2',
          estimateRequestName: '他の見積依頼#2',
          tradingPartnerName: '協力業者Y',
        },
      ],
    },
  ];

  const emptyItems: ItemWithSelectionInfo[] = [];

  const defaultProps = {
    items: mockItems,
    method: 'EMAIL' as const,
    includeBreakdownInBody: false,
    onItemSelectionChange: vi.fn(),
    onMethodChange: vi.fn(),
    onIncludeBreakdownChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('基本レンダリング', () => {
    it('項目一覧を表示する（Requirements: 4.2）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      expect(screen.getByText('足場設置')).toBeInTheDocument();
      expect(screen.getByText('内装解体')).toBeInTheDocument();
      expect(screen.getByText('コンクリート打設')).toBeInTheDocument();
      expect(screen.getByText('塗装')).toBeInTheDocument();
    });

    it('各項目にチェックボックスを表示する（Requirements: 4.3）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      expect(checkboxes.length).toBeGreaterThanOrEqual(4);
    });

    it('「内訳書を本文に含める」チェックボックスを表示する（Requirements: 4.7）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      expect(screen.getByLabelText(/内訳書を本文に含める/)).toBeInTheDocument();
    });

    it('見積依頼方法ラジオボタンを表示する（Requirements: 4.8）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      expect(screen.getByLabelText('メール')).toBeInTheDocument();
      expect(screen.getByLabelText('FAX')).toBeInTheDocument();
    });

    it('項目が存在しない場合メッセージを表示する（Requirements: 4.9）', () => {
      render(<ItemSelectionPanel {...defaultProps} items={emptyItems} />);

      expect(screen.getByText(/項目がありません/)).toBeInTheDocument();
    });
  });

  describe('チェックボックスの状態', () => {
    it('選択済み項目のチェックボックスはチェック状態である（Requirements: 4.6）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      // 最初の項目は selected: true
      expect(checkboxes[0]).toBeChecked();
      // 2番目の項目は selected: false
      expect(checkboxes[1]).not.toBeChecked();
    });
  });

  describe('チェックボックス変更（Task 30: クライアントサイド状態管理）', () => {
    it('チェックボックス変更時にonItemSelectionChangeが呼ばれない（Requirements: 4.4）', () => {
      const mockOnChange = vi.fn();
      render(<ItemSelectionPanel {...defaultProps} onItemSelectionChange={mockOnChange} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      expect(checkboxes[0]).toBeDefined();
      fireEvent.click(checkboxes[0]!);

      // クライアントサイド管理のため、APIコールバックは呼ばれない
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('チェックボックス変更後に保存ボタンで一括送信する（Requirements: 4.5, 4.6）', async () => {
      vi.useRealTimers();
      const mockOnChange = vi.fn().mockResolvedValue(undefined);
      render(<ItemSelectionPanel {...defaultProps} onItemSelectionChange={mockOnChange} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      // チェックボックスを変更
      fireEvent.click(checkboxes[0]!);

      // 保存ボタンをクリック
      const saveButton = screen.getByTestId('save-selection-button');
      fireEvent.click(saveButton);

      await waitFor(
        () => {
          expect(mockOnChange).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000 }
      );
    });
  });

  describe('他の見積依頼での選択状態', () => {
    it('他の見積依頼で選択済みの項目の背景色がオレンジ（Requirements: 4.10）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      // item-3は他の見積依頼で選択されている
      const row = screen.getByText('コンクリート打設').closest('tr');
      expect(row).toHaveStyle({ backgroundColor: 'rgb(255, 247, 237)' }); // bg-orange-50
    });

    it('他の見積依頼の依頼先取引先名を表示する（Requirements: 4.11）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      expect(screen.getByText('協力業者X')).toBeInTheDocument();
    });

    it('複数の見積依頼で選択されている場合、取引先名をカンマ区切りで表示する（Requirements: 4.12）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      // item-4は2つの見積依頼で選択されている
      expect(screen.getByText('協力業者X, 協力業者Y')).toBeInTheDocument();
    });
  });

  describe('メソッド変更（Task 30: クライアントサイド管理）', () => {
    it('見積依頼方法変更時にonMethodChangeが直接呼ばれない（Requirements: 4.14）', () => {
      const mockOnMethodChange = vi.fn();
      render(<ItemSelectionPanel {...defaultProps} onMethodChange={mockOnMethodChange} />);

      const faxRadio = screen.getByLabelText('FAX');
      fireEvent.click(faxRadio);

      // クライアントサイド管理のため、直接呼ばれない
      expect(mockOnMethodChange).not.toHaveBeenCalled();
    });

    it('見積依頼方法変更後に保存ボタンクリックでonMethodChangeが呼ばれる', async () => {
      vi.useRealTimers();
      const mockOnMethodChange = vi.fn();
      const mockOnChange = vi.fn().mockResolvedValue(undefined);
      render(
        <ItemSelectionPanel
          {...defaultProps}
          onMethodChange={mockOnMethodChange}
          onItemSelectionChange={mockOnChange}
        />
      );

      const faxRadio = screen.getByLabelText('FAX');
      fireEvent.click(faxRadio);

      // 保存ボタンをクリック
      const saveButton = screen.getByTestId('save-selection-button');
      fireEvent.click(saveButton);

      await waitFor(
        () => {
          expect(mockOnMethodChange).toHaveBeenCalledWith('FAX');
        },
        { timeout: 2000 }
      );
    });

    it('現在の見積依頼方法がラジオボタンで選択状態', () => {
      render(<ItemSelectionPanel {...defaultProps} method="EMAIL" />);

      expect(screen.getByLabelText('メール')).toBeChecked();
      expect(screen.getByLabelText('FAX')).not.toBeChecked();
    });
  });

  describe('内訳書を本文に含める', () => {
    it('チェックボックス変更時にonIncludeBreakdownChangeが呼ばれる', () => {
      const mockOnChange = vi.fn();
      render(<ItemSelectionPanel {...defaultProps} onIncludeBreakdownChange={mockOnChange} />);

      const checkbox = screen.getByLabelText(/内訳書を本文に含める/);
      fireEvent.click(checkbox);

      expect(mockOnChange).toHaveBeenCalledWith(true);
    });

    it('初期状態が反映される', () => {
      render(<ItemSelectionPanel {...defaultProps} includeBreakdownInBody={true} />);

      expect(screen.getByLabelText(/内訳書を本文に含める/)).toBeChecked();
    });
  });

  describe('項目表示内容', () => {
    it('カテゴリ、工種、名称、規格、単位、数量を表示する', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      // カテゴリ
      expect(screen.getByText('カテゴリA')).toBeInTheDocument();
      // 工種
      expect(screen.getByText('仮設工事')).toBeInTheDocument();
      // 名称
      expect(screen.getByText('足場設置')).toBeInTheDocument();
      // 規格
      expect(screen.getByText('H=10m')).toBeInTheDocument();
      // 単位（複数ある可能性があるのでgetAllBy使用）
      expect(screen.getAllByText('m2').length).toBeGreaterThanOrEqual(1);
      // 数量
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('規格がnullの場合は「-」を表示する', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      // item-2は規格がnull
      const row = screen.getByText('内装解体').closest('tr');
      // 複数の「-」がある可能性があるのでgetAllBy使用
      const dashes = within(row!).getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('アクセシビリティ', () => {
    it('テーブルに適切なaria-labelが設定されている', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label');
    });

    it('チェックボックスに適切なaria-labelが設定されている', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toHaveAttribute('aria-label');
      });
    });
  });

  describe('ローディング状態', () => {
    it('loading=trueの場合チェックボックスが無効化される', () => {
      render(<ItemSelectionPanel {...defaultProps} loading={true} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toBeDisabled();
      });
    });
  });

  // ==========================================================================
  // Task 36.1: 保存ボタン方式の改修テスト
  // ==========================================================================
  describe('保存ボタン方式 (Task 36.1)', () => {
    it('保存ボタンが表示される（Requirements: 4.6）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      expect(screen.getByTestId('save-selection-button')).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeInTheDocument();
    });

    it('未保存の変更がない場合、保存ボタンが無効化される（Requirements: 4.19）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      const saveButton = screen.getByTestId('save-selection-button');
      expect(saveButton).toBeDisabled();
    });

    it('未保存の変更がある場合、保存ボタンが有効になる（Requirements: 4.19）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      // チェックボックスを変更して未保存状態にする
      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      fireEvent.click(checkboxes[0]!);

      const saveButton = screen.getByTestId('save-selection-button');
      expect(saveButton).not.toBeDisabled();
    });

    it('保存成功時にフィードバックメッセージを表示する（Requirements: 4.8）', async () => {
      vi.useRealTimers();
      const mockOnChange = vi.fn().mockResolvedValue(undefined);
      render(<ItemSelectionPanel {...defaultProps} onItemSelectionChange={mockOnChange} />);

      // チェックボックスを変更
      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      fireEvent.click(checkboxes[0]!);

      // 保存ボタンをクリック
      const saveButton = screen.getByTestId('save-selection-button');
      fireEvent.click(saveButton);

      await waitFor(
        () => {
          expect(screen.getByText('保存しました')).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it('保存失敗時にエラーメッセージを表示しサーバー状態に復元する（Requirements: 4.9）', async () => {
      vi.useRealTimers();
      const mockOnChange = vi.fn().mockRejectedValue(new Error('保存失敗'));
      render(<ItemSelectionPanel {...defaultProps} onItemSelectionChange={mockOnChange} />);

      // チェックボックスを変更（選択解除）
      const checkboxes = screen.getAllByRole('checkbox', { name: /選択/ });
      fireEvent.click(checkboxes[0]!);

      // 保存ボタンをクリック
      const saveButton = screen.getByTestId('save-selection-button');
      fireEvent.click(saveButton);

      await waitFor(
        () => {
          expect(screen.getByText(/保存に失敗しました/)).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // サーバー状態に復元されるため、チェックボックスが元の状態に戻る
      expect(checkboxes[0]).toBeChecked();
    });
  });

  // ==========================================================================
  // Task 36.1: 列ヘッダー「任意分類」の表示テスト (Task 31.1)
  // ==========================================================================
  describe('列ヘッダー表示 (Task 36.1)', () => {
    it('列ヘッダーに「任意分類」が表示される（Requirements: 4.2）', () => {
      render(<ItemSelectionPanel {...defaultProps} />);

      expect(screen.getByText('任意分類')).toBeInTheDocument();
    });
  });
});
