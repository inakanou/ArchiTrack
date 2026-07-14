/**
 * @fileoverview 計算用フィールドコンポーネント テスト
 *
 * Task 6.2: 計算用フィールドコンポーネントを実装する
 *
 * Requirements:
 * - 8.5: 「面積・体積」モードで計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.6: 「面積・体積」モードで計算用列に1つ以上の値が入力される場合、入力された項目のみを掛け算して計算結果を数量として自動設定する
 * - 8.8: 「ピッチ」モードで計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.9: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）に値が入力される場合、ピッチ計算式に基づいて本数を算出する
 * - 8.11: 計算用列の値変更時に数量を自動再計算する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalculationFields, { FIELDS_BY_METHOD } from './CalculationFields';
import type { AreaVolumeParams, PitchParams, CountParams } from '../../utils/calculation-engine';
import { CALCULATION_METHOD_ORDER, PARAM_KEYS_BY_METHOD } from '../../utils/calculation-method';
import type { CalculationMethod, CalculationParams } from '../../types/quantity-edit.types';

describe('CalculationFields', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 面積・体積モード表示テスト（Requirement 8.5）
  // ============================================================================

  describe('面積・体積モード - 表示', () => {
    it('面積・体積モードで4つの入力フィールドが表示される', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByLabelText(/幅/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/奥行き/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/高さ/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/重量/i)).toBeInTheDocument();
    });

    it('面積・体積モードで各フィールドのラベルが正しく表示される', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByText('幅（W）')).toBeInTheDocument();
      expect(screen.getByText('奥行き（D）')).toBeInTheDocument();
      expect(screen.getByText('高さ（H）')).toBeInTheDocument();
      expect(screen.getByText('重量')).toBeInTheDocument();
    });

    it('paramsの値が入力フィールドに反映される', () => {
      const params: AreaVolumeParams = {
        width: 10,
        depth: 20,
        height: 5,
        weight: 2.5,
      };

      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={params}
          onChange={vi.fn()}
          disabled={false}
        />
      );

      // REQ-14.3: 数値入力時は小数2桁で表示されるため、文字列として比較
      expect(screen.getByLabelText(/幅/i)).toHaveValue('10.00');
      expect(screen.getByLabelText(/奥行き/i)).toHaveValue('20.00');
      expect(screen.getByLabelText(/高さ/i)).toHaveValue('5.00');
      expect(screen.getByLabelText(/重量/i)).toHaveValue('2.50');
    });

    it('disabledがtrueの場合、全てのフィールドが無効化される', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={true} />
      );

      expect(screen.getByLabelText(/幅/i)).toBeDisabled();
      expect(screen.getByLabelText(/奥行き/i)).toBeDisabled();
      expect(screen.getByLabelText(/高さ/i)).toBeDisabled();
      expect(screen.getByLabelText(/重量/i)).toBeDisabled();
    });
  });

  // ============================================================================
  // 面積・体積モード入力テスト（Requirement 8.6）
  // ============================================================================

  describe('面積・体積モード - 入力', () => {
    let onChange: Mock<(params: CalculationParams) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('幅を入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const widthInput = screen.getByLabelText(/幅/i);
      fireEvent.change(widthInput, { target: { value: '10' } });
      fireEvent.blur(widthInput); // onBlur時にonChangeが呼ばれる

      expect(onChange).toHaveBeenCalledWith({ width: 10 });
    });

    it('奥行きを入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const depthInput = screen.getByLabelText(/奥行き/i);
      fireEvent.change(depthInput, { target: { value: '20' } });
      fireEvent.blur(depthInput);

      expect(onChange).toHaveBeenCalledWith({ depth: 20 });
    });

    it('高さを入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const heightInput = screen.getByLabelText(/高さ/i);
      fireEvent.change(heightInput, { target: { value: '5' } });
      fireEvent.blur(heightInput);

      expect(onChange).toHaveBeenCalledWith({ height: 5 });
    });

    it('重量を入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const weightInput = screen.getByLabelText(/重量/i);
      fireEvent.change(weightInput, { target: { value: '2.5' } });
      fireEvent.blur(weightInput);

      expect(onChange).toHaveBeenCalledWith({ weight: 2.5 });
    });

    it('既存の値がある場合、新しい値とマージされる', () => {
      const params: AreaVolumeParams = { width: 10 };

      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={params}
          onChange={onChange}
          disabled={false}
        />
      );

      const depthInput = screen.getByLabelText(/奥行き/i);
      fireEvent.change(depthInput, { target: { value: '20' } });
      fireEvent.blur(depthInput);

      expect(onChange).toHaveBeenCalledWith({ width: 10, depth: 20 });
    });

    it('空文字を入力するとundefinedになる', () => {
      const params: AreaVolumeParams = { width: 10 };

      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={params}
          onChange={onChange}
          disabled={false}
        />
      );

      const widthInput = screen.getByLabelText(/幅/i);
      fireEvent.change(widthInput, { target: { value: '' } });
      fireEvent.blur(widthInput);

      expect(onChange).toHaveBeenCalledWith({ width: undefined });
    });
  });

  // ============================================================================
  // ピッチモード表示テスト（Requirement 8.8）
  // ============================================================================

  describe('ピッチモード - 表示', () => {
    it('ピッチモードで6つの入力フィールドが表示される', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />);

      expect(screen.getByLabelText(/範囲長/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/端長1/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/端長2/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ピッチ長/i)).toBeInTheDocument();
      expect(screen.getByLabelText('長さ')).toBeInTheDocument();
      expect(screen.getByLabelText(/重量/i)).toBeInTheDocument();
    });

    it('ピッチモードで必須フィールドにマークが表示される', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />);

      // 必須フィールドに*マークがある
      expect(screen.getByText(/範囲長/i).parentElement?.textContent).toContain('*');
      expect(screen.getByText(/端長1/i).parentElement?.textContent).toContain('*');
      expect(screen.getByText(/端長2/i).parentElement?.textContent).toContain('*');
      expect(screen.getByText(/ピッチ長/i).parentElement?.textContent).toContain('*');
    });

    it('paramsの値が入力フィールドに反映される', () => {
      const params: PitchParams = {
        rangeLength: 1000,
        endLength1: 50,
        endLength2: 50,
        pitchLength: 200,
        length: 6,
        weight: 1.2,
      };

      render(
        <CalculationFields method="PITCH" params={params} onChange={vi.fn()} disabled={false} />
      );

      // REQ-14.3: 数値入力時は小数2桁で表示されるため、文字列として比較
      expect(screen.getByLabelText(/範囲長/i)).toHaveValue('1000.00');
      expect(screen.getByLabelText(/端長1/i)).toHaveValue('50.00');
      expect(screen.getByLabelText(/端長2/i)).toHaveValue('50.00');
      expect(screen.getByLabelText(/ピッチ長/i)).toHaveValue('200.00');
      expect(screen.getByLabelText('長さ')).toHaveValue('6.00');
      expect(screen.getByLabelText(/重量/i)).toHaveValue('1.20');
    });

    it('disabledがtrueの場合、全てのフィールドが無効化される', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={true} />);

      expect(screen.getByLabelText(/範囲長/i)).toBeDisabled();
      expect(screen.getByLabelText(/端長1/i)).toBeDisabled();
      expect(screen.getByLabelText(/端長2/i)).toBeDisabled();
      expect(screen.getByLabelText(/ピッチ長/i)).toBeDisabled();
      expect(screen.getByLabelText('長さ')).toBeDisabled();
      expect(screen.getByLabelText(/重量/i)).toBeDisabled();
    });
  });

  // ============================================================================
  // ピッチモード入力テスト（Requirement 8.9）
  // ============================================================================

  describe('ピッチモード - 入力', () => {
    let onChange: Mock<(params: CalculationParams) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('範囲長を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/範囲長/i);
      fireEvent.change(input, { target: { value: '1000' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ rangeLength: 1000 });
    });

    it('端長1を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/端長1/i);
      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ endLength1: 50 });
    });

    it('端長2を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/端長2/i);
      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ endLength2: 50 });
    });

    it('ピッチ長を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/ピッチ長/i);
      fireEvent.change(input, { target: { value: '200' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ pitchLength: 200 });
    });

    it('長さを入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText('長さ');
      fireEvent.change(input, { target: { value: '6' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ length: 6 });
    });

    it('既存の値がある場合、新しい値とマージされる', () => {
      const params: PitchParams = { rangeLength: 1000 };

      render(
        <CalculationFields method="PITCH" params={params} onChange={onChange} disabled={false} />
      );

      const input = screen.getByLabelText(/端長1/i);
      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ rangeLength: 1000, endLength1: 50 });
    });
  });

  // ============================================================================
  // 箇所数モード表示テスト（Task 68.1 / REQ-47 AC2, AC13, REQ-37 AC13, REQ-8 AC13）
  //
  // 現行実装は `method === 'AREA_VOLUME' ? AREA_VOLUME_FIELDS : PITCH_FIELDS` という
  // 二値の三項演算子であり、COUNT は無言でピッチのフィールド群へフォールバックする。
  // 以下のテストはその欠陥を直接検出する。
  // ============================================================================

  describe('箇所数モード - 表示', () => {
    it('箇所数・長さ・重量・調整係数・丸め設定がこの順序で表示される（REQ-47 AC2）', () => {
      const { container } = render(
        <CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={false} />
      );

      const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
      const labelTexts = inputs.map((input) => {
        const wrapper = input.parentElement as HTMLElement;
        const labelEl = wrapper.querySelector('label');
        return (labelEl?.textContent ?? '').replace('*', '').trim();
      });

      expect(labelTexts).toEqual(['箇所数', '長さ', '重量', '調整係数', '丸め設定']);
    });

    it('ピッチ固有のフィールド（範囲長・端長1・端長2・ピッチ長）が表示されない（REQ-47 AC13）', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={false} />);

      expect(screen.queryByLabelText(/範囲長/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/端長1/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/端長2/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/ピッチ長/i)).not.toBeInTheDocument();
    });

    it('面積・体積固有のフィールド（幅・奥行き・高さ）が表示されない', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={false} />);

      expect(screen.queryByLabelText(/幅/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/奥行き/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/高さ/i)).not.toBeInTheDocument();
    });

    it('箇所数フィールドが必須マーク付きで表示される（REQ-47 AC8）', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={false} />);

      const countInput = screen.getByLabelText(/箇所数/i);
      expect(countInput).toBeInTheDocument();
      expect(countInput).toHaveAttribute('aria-required', 'true');
      expect(screen.getByText(/箇所数/i).textContent).toContain('*');
    });

    it('長さ・重量は任意項目として必須マークなしで表示される', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={false} />);

      // 任意項目は required 未指定のため aria-required 属性を持たない（既存のピッチ「長さ」と同一の挙動）
      expect(screen.getByLabelText('長さ')).not.toHaveAttribute('aria-required');
      expect(screen.getByLabelText(/重量/i)).not.toHaveAttribute('aria-required');
      expect(screen.getByText('長さ').textContent).not.toContain('*');
      expect(screen.getByText('重量').textContent).not.toContain('*');
    });

    it('各フィールドの wrapper が flex-direction: row で label が input の左に水平配置される（REQ-37 AC13）', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={false} />);

      const labels = [/箇所数/i, '長さ', /重量/i, /調整係数/i, /丸め設定/i] as Array<
        string | RegExp
      >;
      for (const labelText of labels) {
        const input = screen.getByLabelText(labelText) as HTMLInputElement;
        const wrapper = input.parentElement as HTMLElement;
        expect(wrapper.style.display).toBe('flex');
        expect(wrapper.style.flexDirection).toBe('row');
        const labelEl = wrapper.querySelector('label') as HTMLLabelElement;
        expect(labelEl.htmlFor).toBe(input.id);
        expect(labelEl.style.height).toBe('14px');
        expect(input.style.height).toBe('22px');
      }
    });

    it('disabledがtrueの場合、全てのフィールドが無効化される', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={vi.fn()} disabled={true} />);

      expect(screen.getByLabelText(/箇所数/i)).toBeDisabled();
      expect(screen.getByLabelText('長さ')).toBeDisabled();
      expect(screen.getByLabelText(/重量/i)).toBeDisabled();
    });
  });

  // ============================================================================
  // 箇所数モード入力テスト（Task 68.1 / REQ-47 AC3, AC12）
  // ============================================================================

  describe('箇所数モード - 入力', () => {
    let onChange: Mock<(params: CalculationParams) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('箇所数を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="COUNT" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/箇所数/i);
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ count: 5 });
    });

    it('既存の箇所数がある場合、長さの入力とマージされる', () => {
      render(
        <CalculationFields
          method="COUNT"
          params={{ count: 5 } as CountParams}
          onChange={onChange}
          disabled={false}
        />
      );

      const input = screen.getByLabelText('長さ');
      fireEvent.change(input, { target: { value: '6' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith({ count: 5, length: 6 });
    });
  });

  // ============================================================================
  // 標準モード表示テスト
  // ============================================================================

  describe('標準モード', () => {
    it('標準モードではフィールドが表示されない', () => {
      render(
        <CalculationFields method="STANDARD" params={{}} onChange={vi.fn()} disabled={false} />
      );

      // 標準モードでは計算用フィールドは表示されない
      expect(screen.queryByLabelText(/幅/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/範囲長/i)).not.toBeInTheDocument();
    });

    it('標準モードではメッセージが表示される', () => {
      render(
        <CalculationFields method="STANDARD" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByText(/直接数量を入力/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 行内水平配置レイアウトテスト（Requirement 37.2, 37.4, 37.5）
  // ============================================================================

  describe('行内水平配置レイアウト（タスク 51.3）', () => {
    /**
     * Field wrapper（label + input のペア）を取得するヘルパー。
     * label の親要素を返す。
     */
    function getFieldWrapper(labelText: string | RegExp): HTMLElement {
      const input = screen.getByLabelText(labelText) as HTMLInputElement;
      const wrapper = input.parentElement as HTMLElement | null;
      if (!wrapper) {
        throw new Error(`fieldWrapper not found for label: ${String(labelText)}`);
      }
      return wrapper;
    }

    describe('面積・体積モード', () => {
      it('各フィールドの wrapper が flex-direction: row（label が input の左に水平配置）である', () => {
        render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [/幅/i, /奥行き/i, /高さ/i, /重量/i, /調整係数/i, /丸め設定/i];
        for (const labelText of labels) {
          const wrapper = getFieldWrapper(labelText);
          expect(wrapper.style.display).toBe('flex');
          expect(wrapper.style.flexDirection).toBe('row');
        }
      });

      it('label 要素が input 要素より DOM 順序で先に出現する（label が input の左隣）', () => {
        render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [/幅/i, /奥行き/i, /高さ/i, /重量/i, /調整係数/i, /丸め設定/i];
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label');
          expect(labelEl).not.toBeNull();
          // label が input より先に出現することを確認
          const compare = labelEl!.compareDocumentPosition(input);
          // DOCUMENT_POSITION_FOLLOWING (4) bit が立っていれば label の方が前
          expect(compare & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
      });

      it('すべての label が visible である（visibility:hidden / display:none / visually-hidden 化されていない）', () => {
        render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [/幅/i, /奥行き/i, /高さ/i, /重量/i, /調整係数/i, /丸め設定/i];
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label') as HTMLLabelElement;
          expect(labelEl).not.toBeNull();
          // インラインスタイルとして visibility:hidden や display:none が指定されていないこと
          expect(labelEl.style.visibility).not.toBe('hidden');
          expect(labelEl.style.display).not.toBe('none');
          // ラベルテキストが空でないこと（visually-hidden 用のクリッピングをしていない）
          expect((labelEl.textContent ?? '').trim().length).toBeGreaterThan(0);
        }
      });

      it('label の高さが 14px、input の高さが 22px に統一されている', () => {
        render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [/幅/i, /奥行き/i, /高さ/i, /重量/i, /調整係数/i, /丸め設定/i];
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label') as HTMLLabelElement;
          expect(labelEl.style.height).toBe('14px');
          expect(input.style.height).toBe('22px');
        }
      });

      it('フィールドが「幅(W) → 奥行き(D) → 高さ(H) → 重量 → 調整係数 → 丸め設定」の順序で水平配置される', () => {
        const { container } = render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        // すべての input 要素を DOM 順序で取得し、対応するラベルテキストを並べる
        const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
        const labelTexts = inputs.map((input) => {
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label');
          return (labelEl?.textContent ?? '').replace('*', '').trim();
        });

        expect(labelTexts).toEqual([
          '幅（W）',
          '奥行き（D）',
          '高さ（H）',
          '重量',
          '調整係数',
          '丸め設定',
        ]);
      });
    });

    describe('ピッチモード', () => {
      it('各フィールドの wrapper が flex-direction: row（label が input の左に水平配置）である', () => {
        render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [
          /範囲長/i,
          /端長1/i,
          /端長2/i,
          /ピッチ長/i,
          '長さ',
          /重量/i,
          /調整係数/i,
          /丸め設定/i,
        ] as Array<string | RegExp>;
        for (const labelText of labels) {
          const wrapper = getFieldWrapper(labelText);
          expect(wrapper.style.display).toBe('flex');
          expect(wrapper.style.flexDirection).toBe('row');
        }
      });

      it('label 要素が input 要素より DOM 順序で先に出現する（label が input の左隣）', () => {
        render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [
          /範囲長/i,
          /端長1/i,
          /端長2/i,
          /ピッチ長/i,
          '長さ',
          /重量/i,
          /調整係数/i,
          /丸め設定/i,
        ] as Array<string | RegExp>;
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label');
          expect(labelEl).not.toBeNull();
          const compare = labelEl!.compareDocumentPosition(input);
          expect(compare & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
      });

      it('すべての label が visible である（visibility:hidden / display:none / visually-hidden 化されていない）', () => {
        render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [
          /範囲長/i,
          /端長1/i,
          /端長2/i,
          /ピッチ長/i,
          '長さ',
          /重量/i,
          /調整係数/i,
          /丸め設定/i,
        ] as Array<string | RegExp>;
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label') as HTMLLabelElement;
          expect(labelEl).not.toBeNull();
          expect(labelEl.style.visibility).not.toBe('hidden');
          expect(labelEl.style.display).not.toBe('none');
          expect((labelEl.textContent ?? '').trim().length).toBeGreaterThan(0);
        }
      });

      it('label の高さが 14px、input の高さが 22px に統一されている', () => {
        render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const labels = [
          /範囲長/i,
          /端長1/i,
          /端長2/i,
          /ピッチ長/i,
          '長さ',
          /重量/i,
          /調整係数/i,
          /丸め設定/i,
        ] as Array<string | RegExp>;
        for (const labelText of labels) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label') as HTMLLabelElement;
          expect(labelEl.style.height).toBe('14px');
          expect(input.style.height).toBe('22px');
        }
      });

      it('フィールドが「範囲長 → 端長1 → 端長2 → ピッチ長 → 長さ → 重量 → 調整係数 → 丸め設定」の順序で水平配置される', () => {
        const { container } = render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
        const labelTexts = inputs.map((input) => {
          const wrapper = input.parentElement as HTMLElement;
          const labelEl = wrapper.querySelector('label');
          return (labelEl?.textContent ?? '').replace('*', '').trim();
        });

        expect(labelTexts).toEqual([
          '範囲長',
          '端長1',
          '端長2',
          'ピッチ長',
          '長さ',
          '重量',
          '調整係数',
          '丸め設定',
        ]);
      });
    });
  });

  // ============================================================================
  // Task 51.5: 行内水平配置レイアウト 統合検証
  //
  // Requirements: 37.2, 37.3
  // 51.3 で個別の order / wrapper 構造を確認済みだが、Task 51.5 では
  // 「ラベルとテキストボックスが交互配置され、すべてのラベルが getByLabelText
  //  で取得可能であること」を独立テストとして明示し、回帰防止の単一の根拠とする。
  // また「行高さがレイアウト変更前と同等であること」を label+input 合計高さで
  // 検証する（jsdom では実際のレイアウト計測が不可のため、設計値 14px + 22px = 36px
  // の構造アサーションで担保する。実レイアウトでの行高さは E2E と
  // EditableQuantityItemRow.test.tsx の padding 制約で検証）。
  // ============================================================================

  describe('Task 51.5: ラベル/入力交互配置 と 行高さ計測', () => {
    /**
     * 計算モード別の期待ラベル一覧。
     * このタスクで保証する「すべてのラベルが getByLabelText で取得可能」の正
     * （Source of Truth）として参照する。
     */
    const expectedLabels = {
      AREA_VOLUME: [/^幅/, /奥行き/, /^高さ/, /^重量/, /^調整係数/, /^丸め設定/] as Array<RegExp>,
      PITCH: [
        /^範囲長/,
        /^端長1/,
        /^端長2/,
        /^ピッチ長/,
        '長さ',
        /^重量/,
        /^調整係数/,
        /^丸め設定/,
      ] as Array<string | RegExp>,
    } as const;

    describe('Requirement 37.2: ラベル/入力交互配置 + 全ラベル getByLabelText 取得可能', () => {
      it('面積・体積モードで AC 4 順序のすべてのラベルが getByLabelText で取得でき、各 input と関連付けられている', () => {
        render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        for (const labelText of expectedLabels.AREA_VOLUME) {
          const input = screen.getByLabelText(labelText);
          // input が HTMLInputElement で、id を持ち、label が htmlFor で関連付けられていること
          expect(input).toBeInstanceOf(HTMLInputElement);
          expect(input.id).toBeTruthy();
        }
      });

      it('ピッチモードで AC 5 順序のすべてのラベルが getByLabelText で取得でき、各 input と関連付けられている', () => {
        render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        for (const labelText of expectedLabels.PITCH) {
          const input = screen.getByLabelText(labelText);
          expect(input).toBeInstanceOf(HTMLInputElement);
          expect(input.id).toBeTruthy();
        }
      });

      it('面積・体積モードで入力ノードと label ノードが「label → input」の連続ペアとして交互配置される', () => {
        const { container } = render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        // CalculationFields の fieldsGrid 内において、各 fieldWrapper（label + input ペア）が
        // 連続して並んでおり、各 wrapper 内では label が input の直前に出現する。
        const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
        // 期待数（AC 4: 面積・体積 6 フィールド）
        expect(inputs.length).toBe(expectedLabels.AREA_VOLUME.length);

        for (const input of inputs) {
          const wrapper = input.parentElement as HTMLElement;
          // wrapper 配下に label が 1 つだけ存在
          const labels = wrapper.querySelectorAll('label');
          expect(labels.length).toBe(1);
          // label の id 属性 / htmlFor 属性が input.id と一致
          const label = labels[0] as HTMLLabelElement;
          expect(label.htmlFor).toBe(input.id);
        }
      });

      it('ピッチモードで入力ノードと label ノードが「label → input」の連続ペアとして交互配置される', () => {
        const { container } = render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
        // 期待数（AC 5: ピッチ 8 フィールド）
        expect(inputs.length).toBe(expectedLabels.PITCH.length);

        for (const input of inputs) {
          const wrapper = input.parentElement as HTMLElement;
          const labels = wrapper.querySelectorAll('label');
          expect(labels.length).toBe(1);
          const label = labels[0] as HTMLLabelElement;
          expect(label.htmlFor).toBe(input.id);
        }
      });
    });

    describe('Requirement 37.3: 行高さ構造（label 14px + input 22px = 36px）', () => {
      it('面積・体積モードの label + input 合計高さが 36px に統一されている（行高さ 37px 維持の前提）', () => {
        render(
          <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
        );

        for (const labelText of expectedLabels.AREA_VOLUME) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const label = wrapper.querySelector('label') as HTMLLabelElement;

          // design.md L1501: 各 NumberInputField / AdjustmentField のラベル高さ 14px、入力高さ 22px
          // 「label が input の左に水平配置される」ため、ペアの高さは max(14, 22) = 22px となる。
          // EditableQuantityItemRow 側で 「ラベルとテキストボックスを交互に並べた一行」とするため、
          // ここでの高さアサーションは設計値の正と一致することを構造で担保する。
          expect(label.style.height).toBe('14px');
          expect(input.style.height).toBe('22px');
          // 縦合算した場合の上限は 36px（label 14px + input 22px）。
          // この値が EditableQuantityItemRow の行高さ 37px 維持の根拠となる。
          const totalVerticalHeight =
            parseFloat(label.style.height) + parseFloat(input.style.height);
          expect(totalVerticalHeight).toBe(36);
        }
      });

      it('ピッチモードの label + input 合計高さが 36px に統一されている（行高さ 37px 維持の前提）', () => {
        render(
          <CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />
        );

        for (const labelText of expectedLabels.PITCH) {
          const input = screen.getByLabelText(labelText) as HTMLInputElement;
          const wrapper = input.parentElement as HTMLElement;
          const label = wrapper.querySelector('label') as HTMLLabelElement;

          expect(label.style.height).toBe('14px');
          expect(input.style.height).toBe('22px');
          const totalVerticalHeight =
            parseFloat(label.style.height) + parseFloat(input.style.height);
          expect(totalVerticalHeight).toBe(36);
        }
      });
    });
  });

  // ============================================================================
  // フィールド定義 Record の網羅性・単一情報源テスト（Task 68.1 / REQ-47 AC13, AC14）
  //
  // FIELDS_BY_METHOD は `Record<Exclude<CalculationMethod, 'STANDARD'>, FieldDefinition[]>`
  // であり、計算方法の追加時にキーの定義漏れがコンパイルエラーになる。
  // 実行時にも「全計算方法が網羅されていること」「PARAM_KEYS_BY_METHOD とキーが
  // 二重管理でずれていないこと」を検証し、無言のフォールバックを構造的に防ぐ。
  // ============================================================================

  describe('FIELDS_BY_METHOD（フィールド定義の対応表）', () => {
    it('「標準」を除く全計算方法をキーとして網羅している', () => {
      const expectedMethods = CALCULATION_METHOD_ORDER.filter((m) => m !== 'STANDARD');

      expect(Object.keys(FIELDS_BY_METHOD).sort()).toEqual([...expectedMethods].sort());
    });

    it('各計算方法のフィールドキーが PARAM_KEYS_BY_METHOD と一致する（キーの二重管理を防ぐ）', () => {
      for (const method of CALCULATION_METHOD_ORDER) {
        const fieldKeys =
          method === 'STANDARD'
            ? []
            : FIELDS_BY_METHOD[method as Exclude<CalculationMethod, 'STANDARD'>].map((f) => f.key);

        expect(fieldKeys).toEqual([...PARAM_KEYS_BY_METHOD[method]]);
      }
    });

    it('箇所数モードのフィールドが「箇所数（必須・整数）→ 長さ → 重量」で定義されている', () => {
      expect(FIELDS_BY_METHOD.COUNT).toEqual([
        { key: 'count', label: '箇所数', required: true, integer: true },
        { key: 'length', label: '長さ', step: 0.01 },
        { key: 'weight', label: '重量', step: 0.01 },
      ]);
    });

    it('既存2方式（面積・体積／ピッチ）のフィールド定義が変わっていない（回帰防止）', () => {
      expect(FIELDS_BY_METHOD.AREA_VOLUME.map((f) => f.key)).toEqual([
        'width',
        'depth',
        'height',
        'weight',
      ]);
      expect(FIELDS_BY_METHOD.PITCH.map((f) => f.key)).toEqual([
        'rangeLength',
        'endLength1',
        'endLength2',
        'pitchLength',
        'length',
        'weight',
      ]);
      // 整数フィールドは箇所数のみ（既存フィールドの表示書式は不変）
      expect(FIELDS_BY_METHOD.AREA_VOLUME.some((f) => f.integer)).toBe(false);
      expect(FIELDS_BY_METHOD.PITCH.some((f) => f.integer)).toBe(false);
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('面積・体積モードの各入力フィールドはtype="text"でinputMode="decimal"', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
      );

      // REQ-14.3: 小数入力対応のためtype="text" + inputMode="decimal"を使用
      expect(screen.getByLabelText(/幅/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/幅/i)).toHaveAttribute('inputMode', 'decimal');
      expect(screen.getByLabelText(/奥行き/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/高さ/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/重量/i)).toHaveAttribute('type', 'text');
    });

    it('ピッチモードの各入力フィールドはtype="text"でinputMode="decimal"', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />);

      // REQ-14.3: 小数入力対応のためtype="text" + inputMode="decimal"を使用
      expect(screen.getByLabelText(/範囲長/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/範囲長/i)).toHaveAttribute('inputMode', 'decimal');
      expect(screen.getByLabelText(/端長1/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/端長2/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/ピッチ長/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText('長さ')).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/重量/i)).toHaveAttribute('type', 'text');
    });
  });

  // ============================================================================
  // フォーカス時の全選択（上書き入力の効率化。他の数量項目フィールドと挙動を統一）
  // ============================================================================

  describe('フォーカス時の全選択', () => {
    /** input にフォーカスし、中身全体が選択状態になっていることを検証する */
    const expectSelectAllOnFocus = (input: HTMLInputElement) => {
      fireEvent.focus(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
      // 値が空でないこと（全選択の意味があること）を担保
      expect(input.value.length).toBeGreaterThan(0);
    };

    it('面積・体積モードの計算パラメータ（幅・奥行き・高さ・重量）はフォーカスで全選択される', () => {
      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={{ width: 10, depth: 20, height: 5, weight: 2.5 } as AreaVolumeParams}
          onChange={vi.fn()}
          disabled={false}
        />
      );

      expectSelectAllOnFocus(screen.getByLabelText(/幅/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText(/奥行き/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText(/高さ/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText(/重量/i) as HTMLInputElement);
    });

    it('ピッチモードの計算パラメータ（範囲長・端長1・端長2・ピッチ長・長さ）はフォーカスで全選択される', () => {
      render(
        <CalculationFields
          method="PITCH"
          params={
            {
              rangeLength: 100,
              endLength1: 10,
              endLength2: 10,
              pitchLength: 5,
              length: 50,
            } as PitchParams
          }
          onChange={vi.fn()}
          disabled={false}
        />
      );

      expectSelectAllOnFocus(screen.getByLabelText(/範囲長/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText(/端長1/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText(/端長2/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText(/ピッチ長/i) as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText('長さ') as HTMLInputElement);
    });

    it('調整係数・丸め設定フィールドはフォーカスで全選択される', () => {
      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={{} as AreaVolumeParams}
          onChange={vi.fn()}
          disabled={false}
          adjustmentFactor={1.25}
          roundingUnit={0.5}
        />
      );

      expectSelectAllOnFocus(screen.getByLabelText('調整係数') as HTMLInputElement);
      expectSelectAllOnFocus(screen.getByLabelText('丸め設定') as HTMLInputElement);
    });
  });
});
