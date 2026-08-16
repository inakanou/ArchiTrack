/**
 * @fileoverview 数量項目テキストフィールドの入力時点での上限超過防止テスト
 *
 * Task 115.33 (site-survey) / Task 12.1 (quantity-table-generation)
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・備考は全角25文字/半角50文字を超える入力を防止する
 * - 13.2: 工種は全角8文字/半角16文字を超える入力を防止する
 * - 13.3: 単位は全角3文字/半角6文字を超える入力を防止する
 *
 * 「防止する」は保存時の拒否ではなく入力時点で受け付けないことを指す。
 * 要件22.5（数量グループ名）と同じく、上限以内の入力のみを状態へ反映する方式で実現する。
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AutocompleteInput from '../../../components/quantity-table/AutocompleteInput';
import EditableQuantityItemRow from '../../../components/quantity-table/EditableQuantityItemRow';
import TextFieldInput from '../../../components/quantity-table/TextFieldInput';
import type { AutocompleteFieldName } from '../../../hooks/useAutocompleteCandidateStore';
import { calculateStringWidth, type TextFieldName } from '../../../utils/field-validation';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

Element.prototype.scrollIntoView = vi.fn();

/**
 * 実画面と同じ controlled component の経路を通すステートフルなラッパー。
 * onChange で状態が更新されない限り入力欄の値は変化しない。
 */
function ControlledAutocomplete({
  field,
  label,
  onChangeSpy,
  onBlurAddCandidateSpy,
  initialValue = '',
}: {
  field: AutocompleteFieldName;
  label: string;
  onChangeSpy?: (value: string) => void;
  onBlurAddCandidateSpy?: (field: AutocompleteFieldName, value: string) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <AutocompleteInput
      id={`${field}-input`}
      label={label}
      value={value}
      onChange={(next) => {
        onChangeSpy?.(next);
        setValue(next);
      }}
      field={field}
      getSuggestions={() => []}
      onBlurAddCandidate={(f, v) => onBlurAddCandidateSpy?.(f, v)}
    />
  );
}

/**
 * フィールドごとの上限（半角換算の文字幅）。
 * 権威はバックエンドの FIELD_CONSTRAINTS（backend/src/services/quantity-field-validation.service.ts）。
 */
const FIELD_MAX_WIDTHS: Array<{
  field: AutocompleteFieldName;
  label: string;
  maxWidth: number;
  /** 上限ちょうどとなる全角文字数 */
  zenkakuAtLimit: number;
}> = [
  { field: 'majorCategory', label: '大項目', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'middleCategory', label: '中項目', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'minorCategory', label: '小項目', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'customCategory', label: '任意分類', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'name', label: '名称', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'specification', label: '規格', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'remarks', label: '備考', maxWidth: 50, zenkakuAtLimit: 25 },
  { field: 'workType', label: '工種', maxWidth: 16, zenkakuAtLimit: 8 },
  { field: 'unit', label: '単位', maxWidth: 6, zenkakuAtLimit: 3 },
];

describe('数量項目テキストフィールドの入力時点での上限超過防止 (Req 13.1, 13.2, 13.3)', () => {
  describe('AutocompleteInput 単体', () => {
    describe.each(FIELD_MAX_WIDTHS)(
      '$label（上限 半角$maxWidth / 全角$zenkakuAtLimit）',
      ({ field, label, maxWidth, zenkakuAtLimit }) => {
        it('半角で上限ちょうどの入力は受け付ける', () => {
          render(<ControlledAutocomplete field={field} label={label} />);
          const input = screen.getByLabelText(label);

          const atLimit = 'a'.repeat(maxWidth);
          fireEvent.change(input, { target: { value: atLimit } });

          expect(input).toHaveValue(atLimit);
          expect(calculateStringWidth((input as HTMLInputElement).value)).toBe(maxWidth);
        });

        it('半角で上限を1文字超える入力は受け付けない', () => {
          const onChangeSpy = vi.fn();
          render(<ControlledAutocomplete field={field} label={label} onChangeSpy={onChangeSpy} />);
          const input = screen.getByLabelText(label);

          const atLimit = 'a'.repeat(maxWidth);
          fireEvent.change(input, { target: { value: atLimit } });
          onChangeSpy.mockClear();

          fireEvent.change(input, { target: { value: 'a'.repeat(maxWidth + 1) } });

          // 上限を超える値は親へ通知されず、入力欄の値も上限のまま変化しない
          expect(onChangeSpy).not.toHaveBeenCalled();
          expect(input).toHaveValue(atLimit);
          expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
            maxWidth
          );
        });

        it('全角で上限ちょうどの入力は受け付ける', () => {
          render(<ControlledAutocomplete field={field} label={label} />);
          const input = screen.getByLabelText(label);

          const atLimit = 'あ'.repeat(zenkakuAtLimit);
          fireEvent.change(input, { target: { value: atLimit } });

          expect(input).toHaveValue(atLimit);
          expect(calculateStringWidth((input as HTMLInputElement).value)).toBe(maxWidth);
        });

        it('全角で上限を1文字超える入力は受け付けない', () => {
          const onChangeSpy = vi.fn();
          render(<ControlledAutocomplete field={field} label={label} onChangeSpy={onChangeSpy} />);
          const input = screen.getByLabelText(label);

          const atLimit = 'あ'.repeat(zenkakuAtLimit);
          fireEvent.change(input, { target: { value: atLimit } });
          onChangeSpy.mockClear();

          fireEvent.change(input, { target: { value: 'あ'.repeat(zenkakuAtLimit + 1) } });

          expect(onChangeSpy).not.toHaveBeenCalled();
          expect(input).toHaveValue(atLimit);
          expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
            maxWidth
          );
        });

        it('上限を超えた値が既に入っている場合は短くする編集を受け付ける', () => {
          const onChangeSpy = vi.fn();
          render(
            <ControlledAutocomplete
              field={field}
              label={label}
              onChangeSpy={onChangeSpy}
              // 保存時検証を経ていない既存データを想定し、上限超過の値を初期値とする
              initialValue={'a'.repeat(maxWidth + 5)}
            />
          );
          const input = screen.getByLabelText(label);
          onChangeSpy.mockClear();

          // まだ上限は超えているが、短くなる編集は受け付ける（編集不能にしない）
          const shorter = 'a'.repeat(maxWidth + 2);
          fireEvent.change(input, { target: { value: shorter } });
          expect(input).toHaveValue(shorter);

          // 上限以内まで縮めれば当然受け付ける
          const atLimit = 'a'.repeat(maxWidth);
          fireEvent.change(input, { target: { value: atLimit } });
          expect(input).toHaveValue(atLimit);

          // 上限以内へ戻った後は超過入力を受け付けない
          fireEvent.change(input, { target: { value: 'a'.repeat(maxWidth + 1) } });
          expect(input).toHaveValue(atLimit);
        });

        it('上限を超えた値が入っている間は幅が変わらない編集を受け付けない', () => {
          // 上限超過の既存データは、幅の検証を行わない数量項目作成API経由で実在しうる
          // （site-survey タスク115.30 が未対応のため）。その値をさらに別の超過値へ
          // 書き換える操作は「上限を超える入力」であり受け付けない。
          const overLimit = 'a'.repeat(maxWidth + 5);
          render(<ControlledAutocomplete field={field} label={label} initialValue={overLimit} />);
          const input = screen.getByLabelText(label);

          // 幅が変わらない（＝縮まらない）編集は、上限を超えたままなので拒否する
          fireEvent.change(input, { target: { value: 'b'.repeat(maxWidth + 5) } });
          expect(input).toHaveValue(overLimit);

          // 全角へ置き換えて幅が増える編集も当然拒否する
          fireEvent.change(input, { target: { value: 'あ'.repeat(maxWidth + 5) } });
          expect(input).toHaveValue(overLimit);
        });

        it('半角カタカナは半角1文字として扱われ上限ちょうどまで入力できる', () => {
          render(<ControlledAutocomplete field={field} label={label} />);
          const input = screen.getByLabelText(label);

          const atLimit = 'ｱ'.repeat(maxWidth);
          fireEvent.change(input, { target: { value: atLimit } });

          expect(input).toHaveValue(atLimit);

          fireEvent.change(input, { target: { value: 'ｱ'.repeat(maxWidth + 1) } });
          expect(input).toHaveValue(atLimit);
        });

        it('変換中は幅の判定を行わず、確定時に判定する', () => {
          render(<ControlledAutocomplete field={field} label={label} />);
          const input = screen.getByLabelText(label);

          // 上限を超える読みでも変換中は保持される（変換を妨げない）
          const reading = 'あ'.repeat(zenkakuAtLimit + 3);
          expect(calculateStringWidth(reading)).toBeGreaterThan(maxWidth);

          fireEvent.compositionStart(input);
          fireEvent.change(input, { target: { value: reading } });
          expect(input).toHaveValue(reading);

          // 確定値が上限以内なら受け付ける
          const committed = 'あ'.repeat(zenkakuAtLimit);
          fireEvent.change(input, { target: { value: committed } });
          fireEvent.compositionEnd(input, { data: committed });
          expect(input).toHaveValue(committed);

          // 変換終了後は再び入力時点で幅を判定する
          fireEvent.change(input, { target: { value: 'あ'.repeat(zenkakuAtLimit + 1) } });
          expect(input).toHaveValue(committed);
        });

        it('変換の確定値が上限を超える場合は変換開始前の確定値へ戻す', () => {
          const before = 'a'.repeat(maxWidth - 1);
          render(<ControlledAutocomplete field={field} label={label} initialValue={before} />);
          const input = screen.getByLabelText(label);

          const reading = 'あ'.repeat(zenkakuAtLimit + 3);
          fireEvent.compositionStart(input);
          fireEvent.change(input, { target: { value: reading } });
          // 変換せずそのまま確定した（＝確定値が上限超過）
          fireEvent.compositionEnd(input, { data: reading });

          expect(input).toHaveValue(before);
          expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
            maxWidth
          );
        });
      }
    );

    /**
     * 実利用で常用される語が変換で確定できることを、実ブラウザと同じイベント順序
     * （compositionstart → 変換中の input → compositionend）で確かめる。
     * 読みの幅が上限を超えるため、変換中に幅で拒否する実装では確定に到達できない。
     */
    describe.each([
      { field: 'unit' as const, label: '単位', maxWidth: 6, reading: 'りゅうべい', word: '立米' },
      { field: 'unit' as const, label: '単位', maxWidth: 6, reading: 'へいべい', word: '平米' },
      {
        field: 'workType' as const,
        label: '工種',
        maxWidth: 16,
        reading: 'どうろどこうこうじ',
        word: '道路土工工事',
      },
    ])('$label に「$word」を変換で入力する', ({ field, label, maxWidth, reading, word }) => {
      it('読みが上限を超えても変換を経て確定できる', () => {
        // 前提：読みの幅は上限超過、確定語の幅は上限以内
        expect(calculateStringWidth(reading)).toBeGreaterThan(maxWidth);
        expect(calculateStringWidth(word)).toBeLessThanOrEqual(maxWidth);

        const onChangeSpy = vi.fn();
        render(<ControlledAutocomplete field={field} label={label} onChangeSpy={onChangeSpy} />);
        const input = screen.getByLabelText(label);

        fireEvent.compositionStart(input);
        // かなを1文字ずつ入力していく（変換中）
        for (let i = 1; i <= reading.length; i += 1) {
          fireEvent.change(input, { target: { value: reading.slice(0, i) } });
        }
        // 読みが途中で切り捨てられていないこと
        expect(input).toHaveValue(reading);

        // 変換候補を選び確定する
        fireEvent.change(input, { target: { value: word } });
        fireEvent.compositionEnd(input, { data: word });

        expect(input).toHaveValue(word);
        expect(onChangeSpy).toHaveBeenLastCalledWith(word);
      });
    });
  });

  /**
   * TextFieldInput は本番の描画経路からは参照されていないが、
   * 要件13の入力制御部品としてタスク12.1が規定した部品であり公開APIとして再輸出されている。
   * AutocompleteInput と同じ防止方式・同じ変換の扱いであることを検証で固定する。
   */
  describe('TextFieldInput 単体', () => {
    function ControlledTextField({
      fieldName,
      label,
      onChangeSpy,
      initialValue = '',
    }: {
      fieldName: TextFieldName;
      label: string;
      onChangeSpy?: (value: string) => void;
      initialValue?: string;
    }) {
      const [value, setValue] = useState(initialValue);
      return (
        <TextFieldInput
          id={`text-${fieldName}`}
          fieldName={fieldName}
          label={label}
          value={value}
          onChange={(next) => {
            onChangeSpy?.(next);
            setValue(next);
          }}
        />
      );
    }

    it.each([
      { fieldName: 'name' as const, label: '名称', maxWidth: 50 },
      { fieldName: 'workType' as const, label: '工種', maxWidth: 16 },
      { fieldName: 'unit' as const, label: '単位', maxWidth: 6 },
    ])('$label は上限ちょうどを受け付け、超過は受け付けない', ({ fieldName, label, maxWidth }) => {
      const onChangeSpy = vi.fn();
      render(<ControlledTextField fieldName={fieldName} label={label} onChangeSpy={onChangeSpy} />);
      const input = screen.getByLabelText(label);

      const atLimit = 'a'.repeat(maxWidth);
      fireEvent.change(input, { target: { value: atLimit } });
      expect(input).toHaveValue(atLimit);

      onChangeSpy.mockClear();
      fireEvent.change(input, { target: { value: 'a'.repeat(maxWidth + 1) } });
      expect(onChangeSpy).not.toHaveBeenCalled();
      expect(input).toHaveValue(atLimit);
    });

    it.each([
      {
        fieldName: 'unit' as const,
        label: '単位',
        maxWidth: 6,
        reading: 'りゅうべい',
        word: '立米',
      },
      { fieldName: 'unit' as const, label: '単位', maxWidth: 6, reading: 'へいべい', word: '平米' },
      {
        fieldName: 'workType' as const,
        label: '工種',
        maxWidth: 16,
        reading: 'どうろどこうこうじ',
        word: '道路土工工事',
      },
    ])('$label に「$word」を変換で入力できる', ({ fieldName, label, maxWidth, reading, word }) => {
      expect(calculateStringWidth(reading)).toBeGreaterThan(maxWidth);
      expect(calculateStringWidth(word)).toBeLessThanOrEqual(maxWidth);

      render(<ControlledTextField fieldName={fieldName} label={label} />);
      const input = screen.getByLabelText(label);

      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: reading } });
      expect(input).toHaveValue(reading);

      fireEvent.change(input, { target: { value: word } });
      fireEvent.compositionEnd(input, { data: word });
      expect(input).toHaveValue(word);
    });

    it.each([
      { fieldName: 'name' as const, label: '名称', maxWidth: 50 },
      { fieldName: 'workType' as const, label: '工種', maxWidth: 16 },
      { fieldName: 'unit' as const, label: '単位', maxWidth: 6 },
    ])(
      '$label は変換の確定値が上限を超える場合に変換開始前へ戻す',
      ({ fieldName, label, maxWidth }) => {
        const before = 'a'.repeat(maxWidth - 1);
        render(<ControlledTextField fieldName={fieldName} label={label} initialValue={before} />);
        const input = screen.getByLabelText(label);

        const reading = 'あ'.repeat(maxWidth);
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: reading } });
        fireEvent.compositionEnd(input, { data: reading });

        expect(input).toHaveValue(before);
      }
    );

    it.each([
      { fieldName: 'name' as const, label: '名称', maxWidth: 50 },
      { fieldName: 'workType' as const, label: '工種', maxWidth: 16 },
      { fieldName: 'unit' as const, label: '単位', maxWidth: 6 },
    ])(
      '$label は上限超過中の幅が変わらない編集を受け付けない',
      ({ fieldName, label, maxWidth }) => {
        const overLimit = 'a'.repeat(maxWidth + 5);
        render(
          <ControlledTextField fieldName={fieldName} label={label} initialValue={overLimit} />
        );
        const input = screen.getByLabelText(label);

        fireEvent.change(input, { target: { value: 'b'.repeat(maxWidth + 5) } });
        expect(input).toHaveValue(overLimit);

        // 短くする編集は受け付ける（編集不能にしない）
        fireEvent.change(input, { target: { value: 'a'.repeat(maxWidth + 2) } });
        expect(input).toHaveValue('a'.repeat(maxWidth + 2));
      }
    );
  });

  describe('EditableQuantityItemRow（実画面の描画経路）', () => {
    const baseItem: QuantityItemDetail = {
      id: 'item-1',
      quantityGroupId: 'group-1',
      majorCategory: '',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '',
      name: '',
      specification: null,
      unit: '',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1,
      roundingUnit: 0.01,
      quantity: 0,
      remarks: null,
      displayOrder: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    function StatefulRow({
      onUpdateSpy,
    }: {
      onUpdateSpy: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
    }) {
      const [item, setItem] = useState<QuantityItemDetail>(baseItem);
      return (
        <EditableQuantityItemRow
          item={item}
          showFieldLabels
          onUpdate={(itemId, updates) => {
            onUpdateSpy(itemId, updates);
            setItem((prev) => ({ ...prev, ...updates }));
          }}
          onDelete={vi.fn()}
          onCopy={vi.fn()}
          getSuggestions={vi.fn().mockReturnValue([])}
          onBlurAddCandidate={vi.fn()}
        />
      );
    }

    it.each([
      { label: '名称', maxWidth: 50 },
      { label: '工種', maxWidth: 16 },
      { label: '単位', maxWidth: 6 },
    ])('$label は上限ちょうどを受け付け、超過は受け付けない', ({ label, maxWidth }) => {
      const onUpdateSpy = vi.fn();
      render(<StatefulRow onUpdateSpy={onUpdateSpy} />);
      // 必須エラーのツールチップにも同名の aria-label が付くため、入力欄は combobox ロールで特定する
      const input = screen.getByRole('combobox', { name: new RegExp(`^${label}`) });

      const atLimit = 'a'.repeat(maxWidth);
      fireEvent.change(input, { target: { value: atLimit } });
      expect(input).toHaveValue(atLimit);

      onUpdateSpy.mockClear();
      fireEvent.change(input, { target: { value: 'a'.repeat(maxWidth + 1) } });

      expect(onUpdateSpy).not.toHaveBeenCalled();
      expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(maxWidth);
    });
  });

  /**
   * 変換中の記録の寿命（Task 115.42、Req 13.1/13.2/13.3）
   *
   * 変換中は幅の判定を迂回する。その記録を確定の通知（compositionend）でしか消さないと、
   * 確定が届かないまま焦点が外れた場合に記録が残り、以後その入力欄では変換と無関係の
   * 直接入力でも判定が迂回され続ける（入力時点の防止が恒久的に無効化される）。
   *
   * 記録の寿命は「一回の焦点セッション」とする。焦点を得た時点で初期化し、焦点を失う
   * 時点で必ず終了させる。終了時には変換の確定と同じ幅の判定を適用し、判定を通った値だけを
   * 状態と外部（候補の登録）へ渡す。
   */
  describe('変換中の記録の寿命 (Task 115.42)', () => {
    /** 単位欄（上限 半角6 / 全角3）。変換中の読み「りゅうべい」は幅10で上限を超える */
    const UNIT_MAX_WIDTH = 6;
    const READING = 'りゅうべい';

    describe('AutocompleteInput', () => {
      /** 焦点を得てから、確定の通知が届かないまま変換中に焦点を失う */
      function loseFocusWhileComposing(input: HTMLElement) {
        fireEvent.focus(input);
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: READING } });
        expect(input).toHaveValue(READING);
        fireEvent.blur(input);
      }

      it('確定が届かないまま焦点を失った後も直接入力に幅の判定が働く', () => {
        expect(calculateStringWidth(READING)).toBeGreaterThan(UNIT_MAX_WIDTH);

        render(<ControlledAutocomplete field="unit" label="単位" initialValue="m" />);
        const input = screen.getByLabelText('単位');

        loseFocusWhileComposing(input);

        // 変換と無関係の直接入力。上限を超える幅は受け付けてはならない
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'a'.repeat(UNIT_MAX_WIDTH + 1) } });
        expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
          UNIT_MAX_WIDTH
        );

        // 上限以内は従来どおり受け付ける
        const atLimit = 'a'.repeat(UNIT_MAX_WIDTH);
        fireEvent.change(input, { target: { value: atLimit } });
        expect(input).toHaveValue(atLimit);
      });

      it('確定が届かないまま焦点を失うと幅の判定を経ていない値は残らない', () => {
        render(<ControlledAutocomplete field="unit" label="単位" initialValue="m" />);
        const input = screen.getByLabelText('単位');

        loseFocusWhileComposing(input);

        // 変換開始直前の（幅の判定を通った）値へ戻る
        expect(input).toHaveValue('m');
      });

      it('焦点喪失では上限を超える値が候補として登録されない', () => {
        const onBlurAddCandidateSpy = vi.fn();
        render(
          <ControlledAutocomplete
            field="unit"
            label="単位"
            initialValue="m"
            onBlurAddCandidateSpy={onBlurAddCandidateSpy}
          />
        );
        const input = screen.getByLabelText('単位');

        loseFocusWhileComposing(input);

        expect(onBlurAddCandidateSpy).not.toHaveBeenCalledWith('unit', READING);
        // 登録されうるのは幅の判定を通った値だけ
        for (const [, registered] of onBlurAddCandidateSpy.mock.calls) {
          expect(calculateStringWidth(registered)).toBeLessThanOrEqual(UNIT_MAX_WIDTH);
        }
      });

      it('上限を超えた既存の値は焦点喪失で候補に登録されない', () => {
        // 幅の検証を持たない経路で作られた既存データを想定する。編集はできる（短くする
        // 編集を受け付ける）が、候補一覧へ入れると以後の入力の元になってしまう。
        const onBlurAddCandidateSpy = vi.fn();
        const overLimit = 'a'.repeat(UNIT_MAX_WIDTH + 4);
        render(
          <ControlledAutocomplete
            field="unit"
            label="単位"
            initialValue={overLimit}
            onBlurAddCandidateSpy={onBlurAddCandidateSpy}
          />
        );
        const input = screen.getByLabelText('単位');

        fireEvent.focus(input);
        fireEvent.blur(input);

        // 値そのものは編集の妨げにならないよう保持されるが、候補には登録しない
        expect(input).toHaveValue(overLimit);
        expect(onBlurAddCandidateSpy).not.toHaveBeenCalled();
      });

      it('変換を経て確定した上限以内の値は焦点喪失で候補に登録される', () => {
        const onBlurAddCandidateSpy = vi.fn();
        render(
          <ControlledAutocomplete
            field="unit"
            label="単位"
            onBlurAddCandidateSpy={onBlurAddCandidateSpy}
          />
        );
        const input = screen.getByLabelText('単位');

        fireEvent.focus(input);
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: READING } });
        fireEvent.change(input, { target: { value: '立米' } });
        fireEvent.compositionEnd(input, { data: '立米' });
        fireEvent.blur(input);

        expect(input).toHaveValue('立米');
        expect(onBlurAddCandidateSpy).toHaveBeenCalledWith('unit', '立米');
      });

      it('焦点を得た時点で変換中の記録が初期化される', () => {
        render(<ControlledAutocomplete field="unit" label="単位" />);
        const input = screen.getByLabelText('単位');

        // 焦点喪失を伴わずに変換中の記録だけが残った状態を作る
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: READING } });

        // 改めて焦点を得た後は、変換と無関係の直接入力に幅の判定が働く
        fireEvent.focus(input);
        const wider = 'あ'.repeat(6); // 幅12。残っている読み（幅10）より広い
        expect(calculateStringWidth(wider)).toBeGreaterThan(calculateStringWidth(READING));
        fireEvent.change(input, { target: { value: wider } });
        expect(input).not.toHaveValue(wider);
      });
    });

    describe('TextFieldInput', () => {
      function ControlledUnitTextField({ initialValue = '' }: { initialValue?: string }) {
        const [value, setValue] = useState(initialValue);
        return (
          <TextFieldInput
            id="text-unit-lifetime"
            fieldName="unit"
            label="単位"
            value={value}
            onChange={setValue}
          />
        );
      }

      it('確定が届かないまま焦点を失った後も直接入力に幅の判定が働く', () => {
        render(<ControlledUnitTextField initialValue="m" />);
        const input = screen.getByLabelText('単位');

        fireEvent.focus(input);
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: READING } });
        fireEvent.blur(input);

        // 幅の判定を経ていない読みは残らない
        expect(input).toHaveValue('m');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'a'.repeat(UNIT_MAX_WIDTH + 1) } });
        expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
          UNIT_MAX_WIDTH
        );
      });

      it('焦点を得た時点で変換中の記録が初期化される', () => {
        render(<ControlledUnitTextField />);
        const input = screen.getByLabelText('単位');

        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: READING } });

        fireEvent.focus(input);
        const wider = 'あ'.repeat(6); // 幅12。残っている読み（幅10）より広い
        fireEvent.change(input, { target: { value: wider } });
        expect(input).not.toHaveValue(wider);
      });

      it('変換を経て確定した上限以内の値は焦点喪失でも保持される', () => {
        render(<ControlledUnitTextField />);
        const input = screen.getByLabelText('単位');

        fireEvent.focus(input);
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: READING } });
        fireEvent.change(input, { target: { value: '立米' } });
        fireEvent.compositionEnd(input, { data: '立米' });
        fireEvent.blur(input);

        expect(input).toHaveValue('立米');
      });
    });
  });
});
