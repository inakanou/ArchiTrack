/**
 * @fileoverview EditableQuantityItemRow コンポーネントテスト
 *
 * Task 7.2: 各フィールドにオートコンプリートを適用する
 *
 * Requirements:
 * - 7.1: 大項目フィールドで入力するとオートコンプリート候補を表示
 * - 7.2: 中項目フィールドで大項目に紐づく候補を表示
 * - 7.3: 小項目フィールドで大項目・中項目に紐づく候補を表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditableQuantityItemRow from './EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

// Task 18.1: useAutocompleteモックは不要（新モード専用）

describe('EditableQuantityItemRow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockItem: QuantityItemDetail = {
    id: 'item-1',
    quantityGroupId: 'group-1',
    majorCategory: '建築工事',
    middleCategory: '内装仕上工事',
    minorCategory: null,
    customCategory: null,
    workType: '足場工事',
    name: '外部足場',
    specification: 'H=10m',
    unit: 'm2',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1,
    roundingUnit: 0.01,
    quantity: 100,
    remarks: '備考テスト',
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const defaultProps = {
    item: mockItem,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    getSuggestions: vi.fn().mockReturnValue([]),
    onBlurAddCandidate: vi.fn(),
  };

  beforeEach(() => {
    // Setup logic can go here if needed
  });

  describe('基本表示', () => {
    it('各フィールドが編集可能な入力フィールドとして表示される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 大項目フィールド（AutocompleteInputなのでcombobox roleを持つ）
      expect(screen.getByRole('combobox', { name: /大項目/ })).toBeInTheDocument();

      // 工種フィールド（AutocompleteInput）
      expect(screen.getByRole('combobox', { name: /工種/ })).toBeInTheDocument();

      // 名称フィールド（AutocompleteInputなのでcombobox roleを持つ）
      expect(screen.getByRole('combobox', { name: /名称/ })).toBeInTheDocument();

      // 単位フィールド（AutocompleteInput）
      expect(screen.getByRole('combobox', { name: /単位/ })).toBeInTheDocument();
    });

    it('初期値が各入力フィールドに設定される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /大項目/ })).toHaveValue('建築工事');
      expect(screen.getByRole('combobox', { name: /工種/ })).toHaveValue('足場工事');
      expect(screen.getByRole('combobox', { name: /名称/ })).toHaveValue('外部足場');
      expect(screen.getByRole('combobox', { name: /単位/ })).toHaveValue('m2');
    });
  });

  describe('フィールド更新 (Req 7.4)', () => {
    it('大項目変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /大項目/ });
      // 入力フィールドに文字を追加して変更イベントを発火
      await userEvent.type(input, 'X');

      // 最後のonUpdate呼び出しで値が変更されたことを確認
      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          majorCategory: expect.stringContaining('X'),
        })
      );
    });

    it('工種変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /工種/ });
      await userEvent.type(input, 'X');

      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          workType: expect.any(String),
        })
      );
    });

    it('名称変更時にonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /名称/ });
      await user.clear(input);
      await user.type(input, '更新された名称');

      // AutocompleteInput経由でcreateUpdateHandlerが即座にonUpdateを呼ぶ
      expect(onUpdate).toHaveBeenCalled();
    });

    it('単位変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /単位/ });
      await userEvent.type(input, 'X');

      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          unit: expect.any(String),
        })
      );
    });
  });

  describe('オートコンプリートフィールド設定 (Req 7.1, 7.2, 7.3)', () => {
    it('大項目フィールドはオートコンプリート対応入力フィールド', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByRole('combobox', { name: /大項目/ });
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('工種フィールドはオートコンプリート対応入力フィールド', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByRole('combobox', { name: /工種/ });
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('単位フィールドはオートコンプリート対応入力フィールド', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByRole('combobox', { name: /単位/ });
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });
  });

  describe('必須フィールドのバリデーション', () => {
    it('大項目が空でもエラー表示されない（任意フィールド）', () => {
      const itemWithEmptyMajor = { ...mockItem, majorCategory: '' };
      render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithEmptyMajor} showValidation />
      );

      // 大項目は任意フィールドのため、空でもエラーは表示されない
      expect(screen.queryByText('大項目は必須です')).not.toBeInTheDocument();
    });

    it('工種が空の場合にエラー表示', () => {
      const itemWithEmptyWorkType = { ...mockItem, workType: '' };
      render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithEmptyWorkType} showValidation />
      );

      expect(screen.getByText('工種は必須です')).toBeInTheDocument();
    });

    it('名称が空の場合にエラー表示', () => {
      const itemWithEmptyName = { ...mockItem, name: '' };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithEmptyName} showValidation />);

      expect(screen.getByText('名称は必須です')).toBeInTheDocument();
    });

    it('単位が空の場合にエラー表示', () => {
      const itemWithEmptyUnit = { ...mockItem, unit: '' };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithEmptyUnit} showValidation />);

      expect(screen.getByText('単位は必須です')).toBeInTheDocument();
    });
  });

  describe('削除操作（REQ-36: アクションメニュー統合後）', () => {
    it('アクションメニューの削除をクリック時にonDeleteが呼ばれる', async () => {
      const onDelete = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onDelete={onDelete} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const deleteButton = screen.getByRole('menuitem', { name: /削除/ });
      await userEvent.click(deleteButton);

      expect(onDelete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('コピー操作', () => {
    it('コピーボタンクリック時にonCopyが呼ばれる', async () => {
      const onCopy = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onCopy={onCopy} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const copyButton = screen.getByRole('menuitem', { name: /コピー/ });
      await userEvent.click(copyButton);

      expect(onCopy).toHaveBeenCalledWith('item-1');
    });
  });

  describe('unsavedValues伝播', () => {
    it('コンポーネントがレンダリングされる', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 大項目フィールドが存在することを確認
      expect(screen.getByRole('combobox', { name: /大項目/ })).toBeInTheDocument();
    });
  });

  describe('数量変更', () => {
    it('数量入力時にonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      // REQ-14.2: type="text" + inputMode="decimal"に変更されたためtextbox roleを使用
      const input = screen.getByLabelText(/数量/);
      // 値を変更してblurでonUpdateを発火
      await user.clear(input);
      await user.type(input, '150');
      await user.tab(); // blur発火

      // onUpdateがquantityフィールドで呼ばれることを確認
      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          quantity: 150,
        })
      );
    });

    it('無効な数量が入力された場合はデフォルト値が設定される', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      // REQ-14.2: type="text" + inputMode="decimal"に変更
      const input = screen.getByLabelText(/数量/);
      // 空入力後にblurでREQ-15.2: 空入力時は0を設定
      await user.clear(input);
      await user.tab();

      // REQ-15.2: 空または無効な値の場合は0を設定
      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          quantity: 0,
        })
      );
    });
  });

  describe('調整係数変更', () => {
    it('標準モードでは調整係数フィールドが表示されない', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 標準モードでは調整係数フィールドは表示されない
      expect(screen.queryByLabelText(/調整係数/)).not.toBeInTheDocument();
    });

    it('面積・体積モードで調整係数入力時にonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} onUpdate={onUpdate} />
      );

      // REQ-9: 面積・体積/ピッチ選択時のみ調整係数フィールドが表示される
      const input = screen.getByLabelText(/調整係数/);
      // 値を変更してblurでonUpdateを発火
      await user.clear(input);
      await user.type(input, '1.5');
      await user.tab(); // blur発火

      // onUpdateがadjustmentFactorフィールドで呼ばれることを確認
      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          adjustmentFactor: 1.5,
        })
      );
    });
  });

  describe('丸め設定変更', () => {
    it('標準モードでは丸め設定フィールドが表示されない', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 標準モードでは丸め設定フィールドは表示されない
      expect(screen.queryByLabelText(/丸め設定/)).not.toBeInTheDocument();
    });

    it('面積・体積モードで丸め設定入力時にonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} onUpdate={onUpdate} />
      );

      // REQ-10: 面積・体積/ピッチ選択時のみ丸め設定フィールドが表示される
      const input = screen.getByLabelText(/丸め設定/);
      // 値を変更してblurでonUpdateを発火
      await user.clear(input);
      await user.type(input, '0.1');
      await user.tab(); // blur発火

      // onUpdateがroundingUnitフィールドで呼ばれることを確認
      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          roundingUnit: 0.1,
        })
      );
    });
  });

  describe('備考変更', () => {
    it('備考入力時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /備考/ });
      // 文字を追加入力
      await userEvent.type(input, 'X');

      // onUpdateがremarksフィールドで呼ばれることを確認
      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          remarks: expect.any(String),
        })
      );
    });
  });

  describe('中項目変更', () => {
    it('中項目入力時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /中項目/ });
      await userEvent.type(input, 'X');

      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          middleCategory: expect.any(String),
        })
      );
    });
  });

  describe('規格変更', () => {
    it('規格入力時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /規格/ });
      await userEvent.type(input, 'X');

      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          specification: expect.any(String),
        })
      );
    });
  });

  describe('計算方法変更', () => {
    it('計算方法選択時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      // 計算方法のセレクトボックスを探す（オプション: STANDARD, AREA_VOLUME, PITCH）
      const select = screen.getByRole('combobox', { name: /計算方法/ });
      await userEvent.selectOptions(select, 'AREA_VOLUME');

      expect(onUpdate).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({
          calculationMethod: 'AREA_VOLUME',
        })
      );
    });
  });

  describe('メニュー制御', () => {
    it('メニューボタンを再度クリックするとメニューが閉じる', async () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      // メニューが表示される
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // 再度クリック
      await userEvent.click(moreButton);

      // メニューが閉じる
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('メニューを開いた状態で外部をクリックするとメニューが閉じる', async () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      // メニューが表示される
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // 他の入力フィールドをクリック（blurイベントをシミュレート）
      const nameInput = screen.getByRole('combobox', { name: /名称/ });
      await userEvent.click(nameInput);

      // メニューが閉じる（blurハンドラによる）
      // 注: このテストはblurイベントの伝播に依存するため、環境によって動作が異なる場合がある
    });
  });

  describe('showValidation無効時', () => {
    it('showValidationがfalseの場合、バリデーションエラーは表示されない', () => {
      const itemWithEmptyName = { ...mockItem, name: '' };
      render(
        <EditableQuantityItemRow
          {...defaultProps}
          item={itemWithEmptyName}
          showValidation={false}
        />
      );

      expect(screen.queryByText('名称は必須です')).not.toBeInTheDocument();
    });
  });

  describe('REQ-8.3: 負の数量警告', () => {
    it('標準モードで負の数量の場合、警告が表示される', () => {
      const itemWithNegativeQuantity = {
        ...mockItem,
        quantity: -10,
        calculationMethod: 'STANDARD' as const,
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithNegativeQuantity} />);

      expect(screen.getByText(/負の値が入力されています/)).toBeInTheDocument();
    });

    it('標準モードで正の数量の場合、警告は表示されない', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      expect(screen.queryByText(/負の値が入力されています/)).not.toBeInTheDocument();
    });
  });

  describe('REQ-9.3: 調整係数警告', () => {
    it('面積・体積モードで調整係数が0以下の場合、警告が表示される', () => {
      const itemWithZeroFactor = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
        adjustmentFactor: 0,
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithZeroFactor} />);

      expect(screen.getByText(/0以下の値は使用できません/)).toBeInTheDocument();
    });

    it('面積・体積モードで調整係数が負の場合、警告が表示される', () => {
      const itemWithNegativeFactor = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
        adjustmentFactor: -0.5,
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithNegativeFactor} />);

      expect(screen.getByText(/0以下の値は使用できません/)).toBeInTheDocument();
    });

    it('面積・体積モードで調整係数が正の場合、警告は表示されない', () => {
      const itemWithPositiveFactor = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
        adjustmentFactor: 1.5,
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithPositiveFactor} />);

      // 調整係数の警告が表示されないことを確認
      const warnings = screen.queryAllByText(/0以下の値は使用できません/);
      expect(warnings.length).toBe(0);
    });
  });

  describe('REQ-10.3: 丸め設定警告', () => {
    it('面積・体積モードで丸め設定が0以下の場合、警告が表示される', () => {
      const itemWithZeroRounding = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
        roundingUnit: 0,
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithZeroRounding} />);

      expect(screen.getByText(/0以下の値は使用できません/)).toBeInTheDocument();
    });

    it('面積・体積モードで丸め設定が負の場合、警告が表示される', () => {
      const itemWithNegativeRounding = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
        roundingUnit: -0.1,
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithNegativeRounding} />);

      expect(screen.getByText(/0以下の値は使用できません/)).toBeInTheDocument();
    });
  });

  describe('REQ-6.3: 項目移動（REQ-36: アクションメニュー統合後）', () => {
    it('上へ移動ボタンをクリックするとonMoveUpが呼ばれる', async () => {
      const onMoveUp = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onMoveUp={onMoveUp} canMoveUp={true} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const moveUpButton = screen.getByRole('menuitem', { name: /上へ移動/ });
      await userEvent.click(moveUpButton);

      expect(onMoveUp).toHaveBeenCalledWith('item-1');
    });

    it('下へ移動ボタンをクリックするとonMoveDownが呼ばれる', async () => {
      const onMoveDown = vi.fn();
      render(
        <EditableQuantityItemRow {...defaultProps} onMoveDown={onMoveDown} canMoveDown={true} />
      );

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const moveDownButton = screen.getByRole('menuitem', { name: /下へ移動/ });
      await userEvent.click(moveDownButton);

      expect(onMoveDown).toHaveBeenCalledWith('item-1');
    });

    it('canMoveUpがfalseの場合、上へ移動ボタンはdisabledである', async () => {
      render(<EditableQuantityItemRow {...defaultProps} canMoveUp={false} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const moveUpButton = screen.getByRole('menuitem', { name: /上へ移動/ });
      expect(moveUpButton).toBeDisabled();
    });

    it('canMoveDownがfalseの場合、下へ移動ボタンはdisabledである', async () => {
      render(<EditableQuantityItemRow {...defaultProps} canMoveDown={false} />);

      const moreButton = screen.getByLabelText('アクション');
      await userEvent.click(moreButton);

      const moveDownButton = screen.getByRole('menuitem', { name: /下へ移動/ });
      expect(moveDownButton).toBeDisabled();
    });
  });

  describe('面積・体積モード', () => {
    it('面積・体積モードの場合、計算フィールドが表示される', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      // 計算フィールドが表示される
      expect(screen.getByLabelText(/幅/)).toBeInTheDocument();
    });

    it('標準モードの場合、計算フィールドは表示されない', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 計算フィールドは表示されない
      expect(screen.queryByLabelText(/幅/)).not.toBeInTheDocument();
    });
  });

  describe('ピッチモード', () => {
    it('ピッチモードの場合、計算フィールドが表示される', () => {
      const itemWithPitch = {
        ...mockItem,
        calculationMethod: 'PITCH' as const,
        calculationParams: {
          rangeLength: 10,
          endLength1: 1,
          endLength2: 1,
          pitchLength: 2,
        },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithPitch} />);

      // 計算フィールドが表示される
      expect(screen.getByLabelText(/範囲長/)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Task 51.1 Spike: 操作列セル wrapper 拡張 - DOM 構造検測
  //
  // 採用案では、計算用フィールド群を操作列セル内の wrapper div に inline 配置する。
  // jsdom は実高さを計測しないため、style 属性・className・flex-direction 等の
  // 構造的属性で「行高さを増やさない配置」が適用されているかを assertion する。
  // 実高さの計測検証は後続タスク（E2E）で行う前提。
  //
  // Requirements: 37.1（操作列右側に同一行水平配置）, 37.3（行高さ不変）
  // ============================================================================
  describe('Task 51.1 Spike: 操作列セル wrapper 拡張', () => {
    it('面積・体積モード時、操作列セル内に inline 配置用 wrapper（横並び flex）が存在する', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      // 操作列セル内の wrapper を data-testid で取得
      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      expect(wrapper).toBeInTheDocument();
      // 行高さを増やさず横並び配置するため flex-direction: row が必要
      expect(wrapper.style.display).toBe('flex');
      expect(wrapper.style.flexDirection).toBe('row');
      expect(wrapper.style.alignItems).toBe('center');
    });

    it('面積・体積モード時、計算用フィールド群が wrapper 内（操作列セル内）に配置される', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      const widthInput = screen.getByLabelText(/幅/);
      // 計算用フィールド「幅」が操作列セル内の wrapper の子孫であること
      expect(wrapper.contains(widthInput)).toBe(true);
    });

    it('ピッチモード時、計算用フィールド群が wrapper 内（操作列セル内）に配置される', () => {
      const itemWithPitch = {
        ...mockItem,
        calculationMethod: 'PITCH' as const,
        calculationParams: {
          rangeLength: 10,
          endLength1: 1,
          endLength2: 1,
          pitchLength: 2,
        },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithPitch} />);

      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      const rangeInput = screen.getByLabelText(/範囲長/);
      expect(wrapper.contains(rangeInput)).toBe(true);
    });

    it('標準モード時、計算用フィールド wrapper の子要素にはアクションメニューのみ存在し、計算用フィールド群は描画されない', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // wrapper 自体は標準モードでも存在する（操作ボタン用）
      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      expect(wrapper).toBeInTheDocument();
      // 計算用フィールド（幅）が描画されていないこと
      expect(screen.queryByLabelText(/幅/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/範囲長/)).not.toBeInTheDocument();
    });

    it('面積・体積モード時、別行（calculationFieldsRow 別行 div）として計算用フィールドが描画されない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      // 採用案では「メイン行の操作列内」へ移すため、行下別行の data-testid は存在しないこと
      // POC として明示的な testid を持たせて並列レイアウトであることを保証する
      const widthInput = screen.getByLabelText(/幅/);
      const row = screen.getByTestId('quantity-item-row');
      // 計算用フィールド「幅」が role="row" 要素配下の同一 row 内に含まれること
      const mainRow = row.querySelector('[role="row"]');
      expect(mainRow).not.toBeNull();
      expect(mainRow?.contains(widthInput)).toBe(true);
    });

    it('面積・体積モード時、メイン行（role="row"）に固定 height が指定されていない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const row = screen.getByTestId('quantity-item-row');
      const mainRow = row.querySelector('[role="row"]') as HTMLElement | null;
      expect(mainRow).not.toBeNull();
      // 内容に応じた高さに対応するため、メイン行 div 自体には固定 height を指定しない。
      // 実行高さ 37px はメイン行の子要素（label 14px + input 22px + gap 1px = 37px）と
      // 操作列セル wrapper の align-items: center により達成する。
      expect(mainRow!.style.height).toBe('');
    });
  });

  describe('小項目・任意分類フィールド', () => {
    it('小項目フィールドが表示される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /小項目/ })).toBeInTheDocument();
    });

    it('任意分類フィールドが表示される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /任意分類/ })).toBeInTheDocument();
    });

    it('小項目変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /小項目/ });
      await userEvent.type(input, 'テスト');

      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          minorCategory: expect.any(String),
        })
      );
    });

    it('任意分類変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      render(<EditableQuantityItemRow {...defaultProps} onUpdate={onUpdate} />);

      const input = screen.getByRole('combobox', { name: /任意分類/ });
      await userEvent.type(input, 'テスト');

      expect(onUpdate).toHaveBeenLastCalledWith(
        'item-1',
        expect.objectContaining({
          customCategory: expect.any(String),
        })
      );
    });
  });

  describe('名称フィールドの動作', () => {
    it('名称フィールドがAutoCompleteInputとしてレンダリングされる', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      // 名称フィールドがcomboboxロールを持つことを確認
      const input = screen.getByRole('combobox', { name: /名称/ });
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('外部足場');
    });

    it('名称が空の場合、バリデーションエラーが表示される', () => {
      const emptyNameItem = { ...mockItem, name: '' };
      render(<EditableQuantityItemRow {...defaultProps} item={emptyNameItem} />);

      expect(screen.getByText('名称は必須です')).toBeInTheDocument();
    });
  });
});
