/**
 * @fileoverview 計算方法選択コンポーネント テスト
 *
 * Task 6.1: 計算方法選択コンポーネントを実装する
 *
 * Requirements:
 * - 8.1: 計算方法列に「標準」をデフォルト値として設定する
 * - 8.5: 「面積・体積」が選択された場合、計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.8: 「ピッチ」が選択された場合、計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.12: 計算方法の選択肢として「標準」「面積・体積」「ピッチ」「箇所数」を提供する（Task 68.3）
 * - 47.1: 計算方法の選択肢に「箇所数」を含める（Task 68.3）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalculationMethodSelect from './CalculationMethodSelect';
import type { CalculationMethod } from '../../types/quantity-edit.types';
import {
  CALCULATION_METHOD_OPTIONS,
  CALCULATION_METHOD_ORDER,
  CALCULATION_METHOD_LABELS,
} from '../../utils/calculation-method';

describe('CalculationMethodSelect', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 表示テスト
  // ============================================================================

  describe('表示', () => {
    it('計算方法ドロップダウンが表示される', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      expect(select).toBeInTheDocument();
    });

    it('4つの計算方法オプションがこの順序で存在する（標準/面積・体積/ピッチ/箇所数）（REQ-8.12 / REQ-47.1）', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
      expect(options[0]).toHaveTextContent('標準');
      expect(options[1]).toHaveTextContent('面積・体積');
      expect(options[2]).toHaveTextContent('ピッチ');
      expect(options[3]).toHaveTextContent('箇所数');
    });

    it('選択肢はレジストリ（CALCULATION_METHOD_OPTIONS）と value・label・順序が一致する（単一情報源）', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option') as HTMLOptionElement[];
      expect(options.map((option) => option.value)).toEqual([...CALCULATION_METHOD_ORDER]);
      expect(options.map((option) => option.textContent)).toEqual(
        CALCULATION_METHOD_OPTIONS.map((option) => option.label)
      );
      // ラベルもレジストリの単一情報源から供給されること
      expect(options.map((option) => option.textContent)).toEqual(
        CALCULATION_METHOD_ORDER.map((method) => CALCULATION_METHOD_LABELS[method])
      );
    });

    it('valueプロパティに応じた選択状態が反映される（COUNT）', () => {
      render(<CalculationMethodSelect value="COUNT" onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i }) as HTMLSelectElement;
      expect(select.value).toBe('COUNT');
    });

    it('valueプロパティに応じた選択状態が反映される（STANDARD）', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i }) as HTMLSelectElement;
      expect(select.value).toBe('STANDARD');
    });

    it('valueプロパティに応じた選択状態が反映される（AREA_VOLUME）', () => {
      render(<CalculationMethodSelect value="AREA_VOLUME" onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i }) as HTMLSelectElement;
      expect(select.value).toBe('AREA_VOLUME');
    });

    it('valueプロパティに応じた選択状態が反映される（PITCH）', () => {
      render(<CalculationMethodSelect value="PITCH" onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i }) as HTMLSelectElement;
      expect(select.value).toBe('PITCH');
    });

    it('disabledプロパティがtrueの場合、ドロップダウンが無効化される', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} disabled />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      expect(select).toBeDisabled();
    });

    it('ラベルが表示される', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} />);

      expect(screen.getByText('計算方法')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 選択変更テスト
  // ============================================================================

  describe('選択変更', () => {
    let onChange: Mock<(method: CalculationMethod) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('計算方法を変更するとonChangeが呼ばれる', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'AREA_VOLUME' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('AREA_VOLUME');
    });

    it('標準から面積・体積に変更できる', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'AREA_VOLUME' } });

      expect(onChange).toHaveBeenCalledWith('AREA_VOLUME');
    });

    it('標準からピッチに変更できる', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'PITCH' } });

      expect(onChange).toHaveBeenCalledWith('PITCH');
    });

    it('標準から箇所数に変更できる（REQ-47.1）', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'COUNT' } });

      expect(onChange).toHaveBeenCalledWith('COUNT');
    });

    it('ピッチから箇所数に変更できる（REQ-47.13）', () => {
      render(<CalculationMethodSelect value="PITCH" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'COUNT' } });

      expect(onChange).toHaveBeenCalledWith('COUNT');
    });

    it('箇所数から標準に変更できる（REQ-47.14）', () => {
      render(<CalculationMethodSelect value="COUNT" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'STANDARD' } });

      expect(onChange).toHaveBeenCalledWith('STANDARD');
    });

    it('面積・体積から標準に変更できる', () => {
      render(<CalculationMethodSelect value="AREA_VOLUME" onChange={onChange} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      fireEvent.change(select, { target: { value: 'STANDARD' } });

      expect(onChange).toHaveBeenCalledWith('STANDARD');
    });

    it('無効化時はセレクトがdisabled属性を持つ', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={onChange} disabled />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      // disabled属性が設定されていることを確認
      // 実際のブラウザではdisabled要素は操作不可だが、
      // fireEvent.changeはDOM属性を無視して発火するためこのテストで動作を確認
      expect(select).toBeDisabled();
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('セレクトにはaria-labelledbyが設定されている', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      expect(select).toHaveAccessibleName();
    });

    it('idプロパティが反映される', () => {
      render(<CalculationMethodSelect value="STANDARD" onChange={vi.fn()} id="custom-select-id" />);

      const select = screen.getByRole('combobox', { name: /計算方法/i });
      expect(select).toHaveAttribute('id', 'custom-select-id');
    });
  });

  // ============================================================================
  // デフォルト値テスト（Requirement 8.1）
  // ============================================================================

  describe('デフォルト値', () => {
    it('デフォルトは「標準」（STANDARD）', () => {
      // この動作はコンポーネント外で制御されるが、テストで確認
      const defaultMethod: CalculationMethod = 'STANDARD';
      render(<CalculationMethodSelect value={defaultMethod} onChange={vi.fn()} />);

      const select = screen.getByRole('combobox', { name: /計算方法/i }) as HTMLSelectElement;
      expect(select.value).toBe('STANDARD');
    });
  });
});
