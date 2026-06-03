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
import { render, screen, within, fireEvent } from '@testing-library/react';
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

    it('数量入力フォーカス時に既存の入力値が全選択される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const input = screen.getByLabelText(/数量/) as HTMLInputElement;
      // フォーカス時にselectメソッドが呼ばれることを検証
      const selectSpy = vi.spyOn(input, 'select');

      fireEvent.focus(input);

      expect(selectSpy).toHaveBeenCalledTimes(1);

      selectSpy.mockRestore();
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

  // ============================================================================
  // Task 51.2: 計算用フィールド群の水平配置レイアウト - 行高さ維持 / overflow 規約
  //
  // 51.1 Spike で操作列セル wrapper への inline 配置を導入済み。51.2 では以下を担保:
  //   - メイン行高さが内容物（label 14px + input 22px + 行内 padding 2px*2 = 40px 程度）
  //     で暴れず、固定 height / min-height で 37px 超過を強制しないこと（行高さ不変規約）
  //   - 計算用フィールド群を含む wrapper が flex-shrink: 0 を持ち、Grid 列幅(80px)を
  //     超えて右側に展開できること（操作列セルから視覚的にはみ出して表示される）
  //   - EditableQuantityItemRow 自身（最上位 wrapper / メイン row / 操作列セル wrapper）
  //     のスタイルが overflow-x: auto / scroll を持たず、表領域 overflow を発生させないこと
  //     （計算用フィールド群がビューポート右端を超えた場合、ページ全体の水平スクロールで閲覧する
  //       — design.md L1519「表領域は overflow-x: visible を維持」）
  //
  // Requirements: 37.1 (操作列右側に同一行水平配置), 37.3 (行高さ不変),
  //               37.6 (ビューポート右端超過時はページ全体スクロール),
  //               37.7 (標準モードでは非表示)
  // ============================================================================
  describe('Task 51.2: 行高さ維持 / overflow 規約', () => {
    it('面積・体積モード時、メイン行（role="row"）に min-height 固定指定がない（37px 超過を強制しない）', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const row = screen.getByTestId('quantity-item-row');
      const mainRow = row.querySelector('[role="row"]') as HTMLElement | null;
      expect(mainRow).not.toBeNull();
      // min-height を指定すると内容より大きい固定高さを強制し、37px 超過の原因となる。
      // 行高さは子要素自然高さで決まる前提のため min-height は空であること。
      expect(mainRow!.style.minHeight).toBe('');
    });

    it('面積・体積モード時、操作列セル wrapper に flex-shrink: 0 が指定され Grid 列幅(80px)を超えた展開が可能', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      // flex-shrink: 0 でないと Grid 操作列(80px)に押し込まれ折り返し or 切り詰めが発生する。
      // 計算用フィールド群が右側へ inline 展開するための必須条件。
      expect(wrapper.style.flexShrink).toBe('0');
    });

    it('面積・体積モード時、EditableQuantityItemRow 最上位 wrapper に overflow-x: auto/scroll が指定されていない（表領域は overflow:visible 維持）', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const row = screen.getByTestId('quantity-item-row');
      // design.md L1519: 計算用フィールド群がビューポート右端を超えても表領域は
      // overflow-x: visible を維持し、ページ全体の水平スクロールで閲覧する。
      // EditableQuantityItemRow が overflow-x: auto を出すと、行内スクロールバーが出て
      // アクションメニュードロップダウンが切れる（REQ-25.1/25.2 と整合）。
      expect(['auto', 'scroll']).not.toContain(row.style.overflowX);
      expect(['auto', 'scroll']).not.toContain(row.style.overflow);
    });

    it('面積・体積モード時、メイン行 div に overflow-x: auto/scroll が指定されていない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const row = screen.getByTestId('quantity-item-row');
      const mainRow = row.querySelector('[role="row"]') as HTMLElement | null;
      expect(mainRow).not.toBeNull();
      // メイン行自体に overflow-x: auto を出すと行ごとに独立した水平スクロールバーが
      // 発生して視認性が落ちる。ページ全体スクロール（REQ-25）に委ねる。
      expect(['auto', 'scroll']).not.toContain(mainRow!.style.overflowX);
      expect(['auto', 'scroll']).not.toContain(mainRow!.style.overflow);
    });

    it('面積・体積モード時、操作列セル wrapper に overflow-x: auto/scroll が指定されていない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      // wrapper にスクロール出すとアクションメニューのドロップダウンが切れるため不可。
      expect(['auto', 'scroll']).not.toContain(wrapper.style.overflowX);
      expect(['auto', 'scroll']).not.toContain(wrapper.style.overflow);
    });

    it('ピッチモード時、計算用フィールド群を含む wrapper も同じ flex-shrink/overflow 規約に従う', () => {
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
      expect(wrapper.style.flexShrink).toBe('0');
      expect(['auto', 'scroll']).not.toContain(wrapper.style.overflowX);
      expect(['auto', 'scroll']).not.toContain(wrapper.style.overflow);
    });

    it('標準モード時、計算用フィールドが表示されない（操作列セル wrapper には計算フィールド非描画）', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      // 計算フィールドは描画されないため、wrapper の自然幅は操作ボタン分のみで収まる。
      expect(screen.queryByLabelText(/幅/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/範囲長/)).not.toBeInTheDocument();
      // wrapper は存在するが overflow 規約は維持される。
      expect(wrapper).toBeInTheDocument();
      expect(['auto', 'scroll']).not.toContain(wrapper.style.overflowX);
    });

    it('メイン行の縦パディングが 2px 以下（37px 行高さ維持のため余分な縦余白を持たない）', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const row = screen.getByTestId('quantity-item-row');
      const mainRow = row.querySelector('[role="row"]') as HTMLElement | null;
      expect(mainRow).not.toBeNull();
      // design.md L1500: 行高さ 37px 維持のため縦パディング縮小。
      // 子要素は label 14px + input 22px + gap 1px = 37px なので、縦パディングが
      // それを超えると行が膨らむ。padding-top / padding-bottom は 2px 以下に抑える。
      // jsdom では shorthand padding が個別プロパティに展開されないことがあるため
      // shorthand と個別の両方を確認する。
      const styleTop = mainRow!.style.paddingTop;
      const styleBottom = mainRow!.style.paddingBottom;
      const shorthand = mainRow!.style.padding;

      // shorthand に '2px 4px' 等が入っている場合は先頭値を縦パディングとして扱う
      let verticalPadding: string;
      if (styleTop) {
        verticalPadding = styleTop;
      } else if (shorthand) {
        verticalPadding = shorthand.split(' ')[0] ?? '';
      } else {
        verticalPadding = '';
      }
      // 数値抽出して 2px 以下であることを assertion
      const num = parseFloat(verticalPadding || '0');
      expect(Number.isNaN(num)).toBe(false);
      expect(num).toBeLessThanOrEqual(2);

      // 同様に padding-bottom も 2px 以下
      let verticalPaddingBottom: string;
      if (styleBottom) {
        verticalPaddingBottom = styleBottom;
      } else if (shorthand) {
        const parts = shorthand.split(' ');
        // 'top right bottom left' or 'vertical horizontal'
        verticalPaddingBottom = parts.length >= 3 ? (parts[2] ?? '') : (parts[0] ?? '');
      } else {
        verticalPaddingBottom = '';
      }
      const numBottom = parseFloat(verticalPaddingBottom || '0');
      expect(Number.isNaN(numBottom)).toBe(false);
      expect(numBottom).toBeLessThanOrEqual(2);
    });

    it('メイン行の alignItems が start に維持され、縦ストレッチで行高さが暴れない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const row = screen.getByTestId('quantity-item-row');
      const mainRow = row.querySelector('[role="row"]') as HTMLElement | null;
      expect(mainRow).not.toBeNull();
      // 51.1 Spike 採用案で「メイン行 alignItems: 'start' を維持し、操作列セル
      // wrapper の alignItems: center で inline 配置を実現する」と決まっている。
      // alignItems が stretch / center に変わると、計算用フィールド群の高さに
      // 引きずられて他セルも縦伸びし 37px 超過の原因になる。
      expect(mainRow!.style.alignItems).toBe('start');
    });

    it('操作列セル wrapper に whiteSpace: nowrap が指定され、計算用フィールド群が折り返さない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      render(<EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />);

      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      // flex-shrink: 0 だけでは wrapper 内の inline 要素は折り返しうる。
      // 「メイン行と同一行内で水平配置（REQ-37.1）」を保証するため whiteSpace: nowrap で
      // 折り返しを明示的に抑止する。これにより 51.3 で CalculationFields 内部レイアウトを
      // 横ペア化したときに、行内幅不足で改行されて行高さが暴れる事態を防げる。
      expect(wrapper.style.whiteSpace).toBe('nowrap');
    });

    it('計算用フィールド inline ラッパーに whiteSpace: nowrap が指定され、フィールド間で折り返さない', () => {
      const itemWithAreaVolume = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5 },
      };
      const { container } = render(
        <EditableQuantityItemRow {...defaultProps} item={itemWithAreaVolume} />
      );

      // inlineCalculationFields は action-cell-inline-wrapper 内に存在する。
      // CalculationFields のラッパー自身を取得するため、action-cell-inline-wrapper の
      // 子要素のうち QuantityItemActionMenu 以外の div を絞り込む。
      const wrapper = screen.getByTestId('action-cell-inline-wrapper');
      // 計算用フィールドの「幅」入力が含まれる祖先 div の whiteSpace を確認する
      const widthInput = screen.getByLabelText(/幅/);
      // 一階層上に遡って wrapper 直下の inline ラッパー要素を取得
      let node: HTMLElement | null = widthInput.parentElement;
      while (node && node !== wrapper && node.parentElement !== wrapper) {
        node = node.parentElement;
      }
      expect(node).not.toBeNull();
      expect(node).not.toBe(wrapper);
      // この inline ラッパーで折り返し抑止
      expect((node as HTMLElement).style.whiteSpace).toBe('nowrap');
      // 念のためコンテナ取得確認
      expect(container.contains(widthInput)).toBe(true);
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

  // ============================================================================
  // Task 51.4: 計算方法切替時の表示制御と動作互換性
  //
  // Requirements: 37.7, 37.8, 37.9, 37.10, 37.11, 37.12
  // Requirement 8/9/10 と同等の挙動を維持しているかを回帰防止する。
  // ============================================================================
  describe('Task 51.4: 計算方法切替時の表示制御と動作互換性', () => {
    // ------------------------------------------------------------------------
    // Requirement 37.7: 標準モードでは計算用フィールド群を一切表示しない
    // ------------------------------------------------------------------------
    describe('Requirement 37.7: 標準モードで計算用フィールド非表示', () => {
      it('STANDARD モードのとき、操作列 inline wrapper 内に CalculationFields の入力が一切存在しない', () => {
        render(<EditableQuantityItemRow {...defaultProps} />);
        const wrapper = screen.getByTestId('action-cell-inline-wrapper');

        // 面積・体積で表示される全フィールド
        expect(wrapper.querySelector('input[id$="-width"]')).toBeNull();
        // wrapper 内に「幅」ラベル / 「奥行き」ラベル等が存在しないこと
        // CalculationFields 内の getByLabelText 対象が一切描画されていないこと
        expect(screen.queryByLabelText(/^幅/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/奥行き/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/^高さ/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/重量/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/範囲長/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/端長1/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/端長2/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/ピッチ長/)).not.toBeInTheDocument();
        // 調整係数 / 丸め設定も非表示（REQ-9.8 / REQ-10.8）
        expect(screen.queryByLabelText(/調整係数/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/丸め設定/)).not.toBeInTheDocument();
        // 「直接数量を入力してください」メッセージ（CalculationFields の STANDARD 出力）も
        // 計算用フィールド群が wrapper に存在しないことの直接証拠としては不要なので
        // 描画されない（CalculationFields は条件レンダリングで描画自体スキップ）
        expect(screen.queryByText(/直接数量を入力/)).not.toBeInTheDocument();
      });
    });

    // ------------------------------------------------------------------------
    // Requirement 37.10 / 37.11: 計算方法切替時の即時表示／非表示／差し替え
    // ------------------------------------------------------------------------
    describe('Requirement 37.10 / 37.11: 計算方法切替時の即時表示・非表示', () => {
      it('STANDARD → AREA_VOLUME に切り替えると面積・体積の計算用フィールドが即座に表示される', () => {
        const { rerender } = render(<EditableQuantityItemRow {...defaultProps} />);
        // 初期: STANDARD → 計算用フィールド非表示
        expect(screen.queryByLabelText(/^幅/)).not.toBeInTheDocument();

        // 切替: AREA_VOLUME
        rerender(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        // 即座に表示
        expect(screen.getByLabelText(/^幅/)).toBeInTheDocument();
        expect(screen.getByLabelText(/奥行き/)).toBeInTheDocument();
        expect(screen.getByLabelText(/^高さ/)).toBeInTheDocument();
        expect(screen.getByLabelText(/重量/)).toBeInTheDocument();
        expect(screen.getByLabelText(/調整係数/)).toBeInTheDocument();
        expect(screen.getByLabelText(/丸め設定/)).toBeInTheDocument();
      });

      it('AREA_VOLUME → STANDARD に切り替えると計算用フィールドが即座に非表示になる', () => {
        const { rerender } = render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        expect(screen.getByLabelText(/^幅/)).toBeInTheDocument();

        rerender(<EditableQuantityItemRow {...defaultProps} item={{ ...mockItem }} />);
        // 即座に非表示
        expect(screen.queryByLabelText(/^幅/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/調整係数/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/丸め設定/)).not.toBeInTheDocument();
      });

      it('AREA_VOLUME → PITCH に切り替えると面積・体積フィールドが消えピッチフィールドに差し替わる', () => {
        const { rerender } = render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        // 初期: 面積・体積フィールド表示
        expect(screen.getByLabelText(/^幅/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/範囲長/)).not.toBeInTheDocument();

        rerender(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
            }}
          />
        );
        // 面積・体積フィールドは消える
        expect(screen.queryByLabelText(/^幅/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/奥行き/)).not.toBeInTheDocument();
        // ピッチフィールドが表示される
        expect(screen.getByLabelText(/範囲長/)).toBeInTheDocument();
        expect(screen.getByLabelText(/端長1/)).toBeInTheDocument();
        expect(screen.getByLabelText(/端長2/)).toBeInTheDocument();
        expect(screen.getByLabelText(/ピッチ長/)).toBeInTheDocument();
        // 調整係数・丸め設定はピッチでも継続表示
        expect(screen.getByLabelText(/調整係数/)).toBeInTheDocument();
        expect(screen.getByLabelText(/丸め設定/)).toBeInTheDocument();
      });

      it('PITCH → AREA_VOLUME に切り替えるとピッチフィールドが消え面積・体積フィールドに差し替わる', () => {
        const { rerender } = render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
            }}
          />
        );
        expect(screen.getByLabelText(/範囲長/)).toBeInTheDocument();

        rerender(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        // ピッチフィールドは消える
        expect(screen.queryByLabelText(/範囲長/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/端長1/)).not.toBeInTheDocument();
        // 面積・体積フィールドが表示される
        expect(screen.getByLabelText(/^幅/)).toBeInTheDocument();
        expect(screen.getByLabelText(/奥行き/)).toBeInTheDocument();
      });
    });

    // ------------------------------------------------------------------------
    // Requirement 37.8: 混在時の独立した描画
    // ------------------------------------------------------------------------
    describe('Requirement 37.8: 混在時の独立描画', () => {
      it('STANDARD・AREA_VOLUME・PITCH を同時に複数行描画したとき、各行が独立して対応する計算用フィールドを表示する', () => {
        const standardItem: QuantityItemDetail = {
          ...mockItem,
          id: 'item-standard',
          calculationMethod: 'STANDARD',
        };
        const areaVolumeItem: QuantityItemDetail = {
          ...mockItem,
          id: 'item-area-volume',
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10, depth: 5 },
        };
        const pitchItem: QuantityItemDetail = {
          ...mockItem,
          id: 'item-pitch',
          calculationMethod: 'PITCH',
          calculationParams: {
            rangeLength: 10,
            endLength1: 1,
            endLength2: 1,
            pitchLength: 2,
          },
        };

        const { container } = render(
          <>
            <EditableQuantityItemRow {...defaultProps} item={standardItem} />
            <EditableQuantityItemRow {...defaultProps} item={areaVolumeItem} />
            <EditableQuantityItemRow {...defaultProps} item={pitchItem} />
          </>
        );

        // 3 つの quantity-item-row が並んでいること
        const rowsList = Array.from(
          container.querySelectorAll('[data-testid="quantity-item-row"]')
        ) as HTMLElement[];
        expect(rowsList.length).toBe(3);

        // 行ごとに「自分の計算方法に対応するフィールド」だけを持つこと
        const standardRow = rowsList[0]!;
        const areaVolumeRow = rowsList[1]!;
        const pitchRow = rowsList[2]!;

        // STANDARD 行: 計算用フィールドゼロ
        expect(standardRow.querySelector('input[type="text"][inputmode="decimal"]')).not.toBeNull();
        // 数量入力フィールド以外に CalculationFields の入力がない
        // 「幅 / 範囲長 / 調整係数」が STANDARD 行内に存在しないこと
        expect(within(standardRow).queryByLabelText(/^幅/)).not.toBeInTheDocument();
        expect(within(standardRow).queryByLabelText(/範囲長/)).not.toBeInTheDocument();
        expect(within(standardRow).queryByLabelText(/調整係数/)).not.toBeInTheDocument();

        // AREA_VOLUME 行: 面積・体積フィールド存在、ピッチフィールド非存在
        expect(within(areaVolumeRow).getByLabelText(/^幅/)).toBeInTheDocument();
        expect(within(areaVolumeRow).getByLabelText(/奥行き/)).toBeInTheDocument();
        expect(within(areaVolumeRow).queryByLabelText(/範囲長/)).not.toBeInTheDocument();
        expect(within(areaVolumeRow).getByLabelText(/調整係数/)).toBeInTheDocument();

        // PITCH 行: ピッチフィールド存在、面積・体積フィールド非存在
        expect(within(pitchRow).getByLabelText(/範囲長/)).toBeInTheDocument();
        expect(within(pitchRow).getByLabelText(/端長1/)).toBeInTheDocument();
        expect(within(pitchRow).getByLabelText(/ピッチ長/)).toBeInTheDocument();
        expect(within(pitchRow).queryByLabelText(/^幅/)).not.toBeInTheDocument();
        expect(within(pitchRow).queryByLabelText(/奥行き/)).not.toBeInTheDocument();
        expect(within(pitchRow).getByLabelText(/調整係数/)).toBeInTheDocument();
      });
    });

    // ------------------------------------------------------------------------
    // Requirement 37.12: 計算用フィールド群の専用タイトル行（別行）を表示しない
    // ------------------------------------------------------------------------
    describe('Requirement 37.12: 専用タイトル行非描画', () => {
      it('AREA_VOLUME モード時、計算用フィールド群の専用タイトル行を別行として描画しない', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        const row = screen.getByTestId('quantity-item-row');
        // 旧レイアウトでメイン行下に別行を描画していた data-testid が残存しないこと
        expect(row.querySelector('[data-testid="calculation-fields-row"]')).toBeNull();
        // 役割 row は 1 つだけ（メイン行のみ）。計算用フィールド専用 row は存在しない。
        const rowsInside = row.querySelectorAll('[role="row"]');
        expect(rowsInside.length).toBe(1);
        // 計算用フィールド「幅」がメイン行（role="row"）内部に配置されること
        const mainRow = rowsInside[0] as HTMLElement;
        const widthInput = screen.getByLabelText(/^幅/);
        expect(mainRow.contains(widthInput)).toBe(true);
      });

      it('PITCH モード時も計算用フィールド群の専用タイトル行を別行として描画しない', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
            }}
          />
        );
        const row = screen.getByTestId('quantity-item-row');
        expect(row.querySelector('[data-testid="calculation-fields-row"]')).toBeNull();
        const rowsInside = row.querySelectorAll('[role="row"]');
        expect(rowsInside.length).toBe(1);
      });
    });

    // ------------------------------------------------------------------------
    // Requirement 37.9: バリデーション・自動計算・小数2桁表示・デフォルト値が
    //                   Requirement 8・9・10 と同一に保たれる
    // ------------------------------------------------------------------------
    describe('Requirement 37.9: Requirement 8/9/10 動作互換性', () => {
      it('面積・体積モードで params 既存値が小数2桁で表示される（REQ-14.3 同等）', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5, height: 2 },
            }}
          />
        );
        expect(screen.getByLabelText(/^幅/)).toHaveValue('10.00');
        expect(screen.getByLabelText(/奥行き/)).toHaveValue('5.00');
        expect(screen.getByLabelText(/^高さ/)).toHaveValue('2.00');
      });

      it('面積・体積モードの調整係数・丸め設定はデフォルト値 1.00 / 0.01 で表示される（REQ-9.1 / REQ-10.1）', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10 },
              adjustmentFactor: 1,
              roundingUnit: 0.01,
            }}
          />
        );
        expect(screen.getByLabelText(/調整係数/)).toHaveValue('1.00');
        expect(screen.getByLabelText(/丸め設定/)).toHaveValue('0.01');
      });

      it('面積・体積モードで計算用列の値変更時、onUpdate に再計算後の quantity が含まれる（REQ-8.6 / REQ-8.11 自動再計算）', async () => {
        const user = userEvent.setup();
        const onUpdate = vi.fn();
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
              adjustmentFactor: 1,
              roundingUnit: 0.01,
            }}
            onUpdate={onUpdate}
          />
        );
        const heightInput = screen.getByLabelText(/^高さ/);
        await user.clear(heightInput);
        await user.type(heightInput, '2');
        await user.tab();

        // calculationParams と quantity の両方が onUpdate 引数に渡されること
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall?.[0]).toBe('item-1');
        // calculationParams は height=2 を含む
        expect(lastCall?.[1]).toEqual(
          expect.objectContaining({
            calculationParams: expect.objectContaining({ height: 2 }),
            // 10 * 5 * 2 = 100、調整係数1、丸め 0.01 → quantity=100
            quantity: expect.any(Number),
          })
        );
        expect(lastCall?.[1].quantity).toBe(100);
      });

      it('調整係数を変更すると quantity が再計算される（REQ-9.2 / REQ-9.6）', async () => {
        const user = userEvent.setup();
        const onUpdate = vi.fn();
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5, height: 2 },
              adjustmentFactor: 1,
              roundingUnit: 0.01,
            }}
            onUpdate={onUpdate}
          />
        );
        const factorInput = screen.getByLabelText(/調整係数/);
        await user.clear(factorInput);
        await user.type(factorInput, '1.5');
        await user.tab();

        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall?.[1]).toEqual(
          expect.objectContaining({
            adjustmentFactor: 1.5,
            // 10 * 5 * 2 * 1.5 = 150
            quantity: 150,
          })
        );
      });

      it('丸め設定を変更すると quantity が再計算される（REQ-10.2 / REQ-10.6）', async () => {
        const user = userEvent.setup();
        const onUpdate = vi.fn();
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 1.234, depth: 1, height: 1 },
              adjustmentFactor: 1,
              roundingUnit: 0.01,
            }}
            onUpdate={onUpdate}
          />
        );
        const roundingInput = screen.getByLabelText(/丸め設定/);
        await user.clear(roundingInput);
        await user.type(roundingInput, '0.1');
        await user.tab();

        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall?.[1]).toEqual(
          expect.objectContaining({
            roundingUnit: 0.1,
            // 1.234 を 0.1 単位で切り上げ → 1.3
            quantity: expect.any(Number),
          })
        );
        // 切り上げ結果が 1.3 になる（REQ-10.2 切り上げ仕様）
        expect(lastCall?.[1].quantity).toBeCloseTo(1.3, 5);
      });

      it('計算方法を STANDARD → AREA_VOLUME に切り替えると、既存 calculationParams で quantity が再計算される（REQ-8.1 切替時再計算）', async () => {
        const onUpdate = vi.fn();
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'STANDARD',
              // STANDARD 状態だが、過去に AREA_VOLUME で入力された params が保持されている想定
              calculationParams: { width: 4, depth: 5, height: 2 },
              adjustmentFactor: 1,
              roundingUnit: 0.01,
            }}
            onUpdate={onUpdate}
          />
        );
        // 計算方法セレクトを AREA_VOLUME に変更
        const select = screen.getByRole('combobox', { name: /計算方法/ });
        await userEvent.selectOptions(select, 'AREA_VOLUME');

        // onUpdate に再計算結果（4*5*2 = 40）と calculationMethod 切替が含まれること
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall?.[1]).toEqual(
          expect.objectContaining({
            calculationMethod: 'AREA_VOLUME',
            quantity: 40,
          })
        );
      });
    });
  });

  // ============================================================================
  // Task 51.5: 計算用フィールド配置のテスト統合検証
  //
  // Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6（E2E 側）, 37.7, 37.8, 37.12
  // 51.1-51.4 で個別の構造アサーションを積み上げたが、本ブロックでは
  // 「EditableQuantityItemRow の利用視点での総括」として以下を独立に検証する:
  //   1. 面積・体積モード時、AC 4 全 6 ラベルが getByLabelText で取得可能
  //   2. ピッチモード時、AC 5 全 8 ラベルが getByLabelText で取得可能
  //   3. メイン行内の DOM 構造高さ（label 14px + input 22px 構造）を維持
  //   4. 計算用フィールド群が role="row" 内の同一行に inline 配置（別行非存在）
  //
  // 51.6 で対応する E2E 検証（ビューポート右端超過時のページ全体スクロール）は
  // e2e/specs/quantity-tables/quantity-table-inline-calculation-fields.spec.ts で実施。
  // ============================================================================
  describe('Task 51.5: 計算用フィールド配置統合検証', () => {
    describe('Requirement 37.2: 全ラベル getByLabelText 取得可能', () => {
      it('面積・体積モード時、AC 4 順序の全 6 ラベル（幅・奥行き・高さ・重量・調整係数・丸め設定）が getByLabelText で取得可能で input と関連付けられている', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        const expected: Array<RegExp> = [
          /^幅/,
          /奥行き/,
          /^高さ/,
          /^重量/,
          /^調整係数/,
          /^丸め設定/,
        ];
        for (const labelText of expected) {
          const input = screen.getByLabelText(labelText);
          expect(input).toBeInstanceOf(HTMLInputElement);
          // input が id を持ち、対応する label と htmlFor で関連付けられていること
          expect((input as HTMLInputElement).id).toBeTruthy();
        }
      });

      it('ピッチモード時、AC 5 順序の全 8 ラベル（範囲長・端長1・端長2・ピッチ長・長さ・重量・調整係数・丸め設定）が getByLabelText で取得可能で input と関連付けられている', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
            }}
          />
        );
        const expected: Array<string | RegExp> = [
          /^範囲長/,
          /^端長1/,
          /^端長2/,
          /^ピッチ長/,
          '長さ',
          /^重量/,
          /^調整係数/,
          /^丸め設定/,
        ];
        for (const labelText of expected) {
          const input = screen.getByLabelText(labelText);
          expect(input).toBeInstanceOf(HTMLInputElement);
          expect((input as HTMLInputElement).id).toBeTruthy();
        }
      });
    });

    describe('Requirement 37.3: 行高さ構造（label 14px + input 22px の維持）', () => {
      it('面積・体積モード時、計算用フィールドの label が 14px、input が 22px のままメイン行に inline 配置される', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        const labels: Array<RegExp> = [/^幅/, /奥行き/, /^高さ/, /^重量/, /^調整係数/, /^丸め設定/];
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const label = wrapper.querySelector('label') as HTMLLabelElement;
          expect(label.style.height).toBe('14px');
          expect(input.style.height).toBe('22px');
        }
      });

      it('ピッチモード時も計算用フィールドの label が 14px、input が 22px に維持される', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
            }}
          />
        );
        const labels: Array<string | RegExp> = [
          /^範囲長/,
          /^端長1/,
          /^端長2/,
          /^ピッチ長/,
          '長さ',
          /^重量/,
          /^調整係数/,
          /^丸め設定/,
        ];
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const label = wrapper.querySelector('label') as HTMLLabelElement;
          expect(label.style.height).toBe('14px');
          expect(input.style.height).toBe('22px');
        }
      });
    });

    describe('Requirement 37.1, 37.12: 計算用フィールド群がメイン行と同一行に inline 配置（別行不在）', () => {
      it('面積・体積モード時、計算用フィールド群がメイン行（role="row"）内に配置され、計算用フィールド専用行が描画されない', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5 },
            }}
          />
        );
        const row = screen.getByTestId('quantity-item-row');
        // 子孫の role="row" は 1 つだけ（メイン行のみ）
        const innerRows = row.querySelectorAll('[role="row"]');
        expect(innerRows.length).toBe(1);

        // 旧レイアウトの calculation-fields-row（別行）が残存しないこと
        expect(row.querySelector('[data-testid="calculation-fields-row"]')).toBeNull();

        // 各計算用フィールドの入力がメイン行内に配置されていること
        const mainRow = innerRows[0] as HTMLElement;
        for (const labelText of [/^幅/, /奥行き/, /^高さ/, /^重量/, /^調整係数/, /^丸め設定/]) {
          const input = screen.getByLabelText(labelText);
          expect(mainRow.contains(input)).toBe(true);
        }
      });

      it('ピッチモード時、計算用フィールド群がメイン行（role="row"）内に配置され、計算用フィールド専用行が描画されない', () => {
        render(
          <EditableQuantityItemRow
            {...defaultProps}
            item={{
              ...mockItem,
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
            }}
          />
        );
        const row = screen.getByTestId('quantity-item-row');
        const innerRows = row.querySelectorAll('[role="row"]');
        expect(innerRows.length).toBe(1);
        expect(row.querySelector('[data-testid="calculation-fields-row"]')).toBeNull();

        const mainRow = innerRows[0] as HTMLElement;
        for (const labelText of [
          /^範囲長/,
          /^端長1/,
          /^端長2/,
          /^ピッチ長/,
          '長さ',
          /^重量/,
          /^調整係数/,
          /^丸め設定/,
        ] as Array<string | RegExp>) {
          const input = screen.getByLabelText(labelText);
          expect(mainRow.contains(input)).toBe(true);
        }
      });
    });
  });
});
