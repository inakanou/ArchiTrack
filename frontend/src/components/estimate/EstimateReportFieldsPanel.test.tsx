/**
 * @fileoverview EstimateReportFieldsPanel の単体テスト
 *
 * Task 56.8: 帳票用入力項目のパネル
 *
 * Requirements (estimate-creation):
 * - 54.1: 別途工事の記載を5件まで入力可能とする
 * - 54.2: 見積の有効期限を入力可能とする
 * - 54.3: 提出日を入力可能とする
 * - 54.6: 別途工事・有効期限・提出日を見積書画面から編集可能とする
 * - 54.7: 未入力の場合も空欄として扱う（未入力・空配列は通常の経路）
 *
 * 本パネルは状態を持たない。編集内容の所有者は `estimateEditReducer` の
 * `reportFields` であり、パネルは受け取った値を描画し、変更を通知するだけ。
 * 54.8（未保存の変更として扱う）の検証は `EstimateDetailPage.reportFields.test.tsx`。
 *
 * @module components/estimate/EstimateReportFieldsPanel.test
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateReportFieldsPanel } from './EstimateReportFieldsPanel';
import type { EstimateReportFields } from '../../domain/estimate/estimateEditReducer.types';

// ============================================================================
// ヘルパー
// ============================================================================

const EMPTY: EstimateReportFields = {
  submissionDate: null,
  validityPeriod: null,
  separateWorks: [],
};

const renderPanel = (
  value: EstimateReportFields
): { onChange: ReturnType<typeof vi.fn>; rerender: (next: EstimateReportFields) => void } => {
  const onChange = vi.fn();
  const view = render(<EstimateReportFieldsPanel value={value} onChange={onChange} />);
  return {
    onChange,
    rerender: (next) =>
      view.rerender(<EstimateReportFieldsPanel value={next} onChange={onChange} />),
  };
};

/**
 * 通知された値を自身の state へ戻す制御付きの入れ物
 *
 * 上限の検証には「1回の操作の結果を次の操作の入力にする」必要がある。
 * `onChange` の呼び出し引数だけを見ていると、2回目の追加が
 * 1回目の結果を踏まえたものかどうかを区別できない。
 */
function ControlledPanel({ initial }: { initial: EstimateReportFields }): React.ReactElement {
  const [value, setValue] = useState<EstimateReportFields>(initial);
  return (
    <>
      <EstimateReportFieldsPanel value={value} onChange={setValue} />
      <output data-testid="report-fields-json">{JSON.stringify(value)}</output>
      <output data-testid="separate-works-json">{JSON.stringify(value.separateWorks)}</output>
    </>
  );
}

/** 制御付きの入れ物が保持している帳票用入力項目 */
const controlledValue = (): EstimateReportFields =>
  JSON.parse(screen.getByTestId('report-fields-json').textContent ?? '') as EstimateReportFields;

const separateWorkInputs = (): HTMLInputElement[] =>
  within(screen.getByTestId('estimate-report-fields-panel')).queryAllByTestId(
    /^report-separate-work-\d+$/
  ) as HTMLInputElement[];

const addButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: '別途工事を追加' }) as HTMLButtonElement;

// ============================================================================
// テスト
// ============================================================================

describe('EstimateReportFieldsPanel', () => {
  describe('描画（54.1, 54.2, 54.3, 54.7）', () => {
    it('未入力の帳票用入力項目を空欄として描画する', () => {
      renderPanel(EMPTY);

      expect((screen.getByLabelText('提出日') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('見積有効期限') as HTMLInputElement).value).toBe('');
      expect(separateWorkInputs()).toHaveLength(0);
      // 未入力は「上限に達していない」通常の状態。追加できなければ 54.1 が満たせない。
      expect(addButton()).toBeEnabled();
    });

    it('保存済みの値を各欄に描画する', () => {
      renderPanel({
        submissionDate: '2026-08-04',
        validityPeriod: '提出日より3ヶ月間',
        separateWorks: ['電気設備工事', '空調設備工事', '外構工事'],
      });

      expect((screen.getByLabelText('提出日') as HTMLInputElement).value).toBe('2026-08-04');
      expect((screen.getByLabelText('見積有効期限') as HTMLInputElement).value).toBe(
        '提出日より3ヶ月間'
      );
      expect(separateWorkInputs().map((input) => input.value)).toEqual([
        '電気設備工事',
        '空調設備工事',
        '外構工事',
      ]);
      // 番号付きで区別できること（帳票の別途工事欄は番号付き5行）
      expect((screen.getByLabelText('別途工事1') as HTMLInputElement).value).toBe('電気設備工事');
      expect((screen.getByLabelText('別途工事3') as HTMLInputElement).value).toBe('外構工事');
    });

    it('提出日は日付入力、有効期限と別途工事はサーバーの文字数上限に揃える', () => {
      renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [''],
      });

      expect(screen.getByLabelText('提出日')).toHaveAttribute('type', 'date');
      // 保存スキーマ（backend `estimate.schema.ts`）の上限と同値。
      // 上限を超える値を画面から作れると保存が 400 で弾かれる。
      expect(screen.getByLabelText('見積有効期限')).toHaveAttribute('maxlength', '100');
      expect(screen.getByLabelText('別途工事1')).toHaveAttribute('maxlength', '200');
    });
  });

  describe('編集の通知（54.6）', () => {
    it('提出日を入力すると提出日だけを差し替えて通知する', async () => {
      const user = userEvent.setup();
      render(
        <ControlledPanel
          initial={{
            submissionDate: '2026-08-04',
            validityPeriod: '提出日より1ヶ月間',
            separateWorks: ['電気設備工事'],
          }}
        />
      );

      await user.clear(screen.getByLabelText('提出日'));
      await user.type(screen.getByLabelText('提出日'), '2026-09-01');

      expect(controlledValue()).toEqual({
        submissionDate: '2026-09-01',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気設備工事'],
      });
    });

    it('提出日を消すと空文字ではなく未入力として通知する', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: '2026-08-04',
        validityPeriod: null,
        separateWorks: [],
      });

      await user.clear(screen.getByLabelText('提出日'));

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
      });
    });

    it('有効期限を入力すると有効期限だけを差し替えて通知する', async () => {
      const user = userEvent.setup();
      render(
        <ControlledPanel
          initial={{
            submissionDate: '2026-08-04',
            validityPeriod: null,
            separateWorks: [],
          }}
        />
      );

      await user.type(screen.getByLabelText('見積有効期限'), '3ヶ月');

      expect(controlledValue()).toEqual({
        submissionDate: '2026-08-04',
        validityPeriod: '3ヶ月',
        separateWorks: [],
      });
    });

    it('有効期限を消すと空文字ではなく未入力として通知する', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: null,
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: [],
      });

      await user.clear(screen.getByLabelText('見積有効期限'));

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
      });
    });

    it('別途工事を編集すると当該位置だけを差し替えて通知する', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['電気設備工事', '空調設備工事', '外構工事'],
      });

      await user.type(screen.getByLabelText('別途工事2'), '２');

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['電気設備工事', '空調設備工事２', '外構工事'],
      });
    });

    it('別途工事を空にしても行は残り、空欄として通知する', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['電気設備工事', '空調設備工事'],
      });

      await user.clear(screen.getByLabelText('別途工事1'));

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['', '空調設備工事'],
      });
    });

    it('別途工事を削除すると当該位置を取り除いて通知する', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['電気設備工事', '空調設備工事', '外構工事'],
      });

      await user.click(screen.getByRole('button', { name: '別途工事2を削除' }));

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['電気設備工事', '外構工事'],
      });
    });
  });

  describe('別途工事の件数上限（54.1: 5件まで）', () => {
    it('0件から追加すると1件になる', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel(EMPTY);

      await user.click(addButton());

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [''],
      });
    });

    it('4件のときは追加でき5件になる', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['工事1', '工事2', '工事3', '工事4'],
      });

      expect(addButton()).toBeEnabled();
      await user.click(addButton());

      expect(onChange).toHaveBeenLastCalledWith({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['工事1', '工事2', '工事3', '工事4', ''],
      });
    });

    it('5件のときは追加できない', async () => {
      const user = userEvent.setup();
      const { onChange } = renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['工事1', '工事2', '工事3', '工事4', '工事5'],
      });

      expect(separateWorkInputs()).toHaveLength(5);
      expect(addButton()).toBeDisabled();

      await user.click(addButton());

      expect(onChange).not.toHaveBeenCalled();
    });

    it('4件から連続で追加しても6件目は作られない', async () => {
      const user = userEvent.setup();
      render(
        <ControlledPanel
          initial={{
            submissionDate: null,
            validityPeriod: null,
            separateWorks: ['工事1', '工事2', '工事3', '工事4'],
          }}
        />
      );

      await user.click(addButton());
      expect(separateWorkInputs()).toHaveLength(5);

      await user.click(addButton());

      expect(separateWorkInputs()).toHaveLength(5);
      expect(screen.getByTestId('separate-works-json').textContent).toBe(
        JSON.stringify(['工事1', '工事2', '工事3', '工事4', ''])
      );
    });

    it('5件から削除すると再び追加できる', async () => {
      const user = userEvent.setup();
      render(
        <ControlledPanel
          initial={{
            submissionDate: null,
            validityPeriod: null,
            separateWorks: ['工事1', '工事2', '工事3', '工事4', '工事5'],
          }}
        />
      );

      await user.click(screen.getByRole('button', { name: '別途工事5を削除' }));
      expect(addButton()).toBeEnabled();

      await user.click(addButton());

      expect(screen.getByTestId('separate-works-json').textContent).toBe(
        JSON.stringify(['工事1', '工事2', '工事3', '工事4', ''])
      );
    });

    it('残り件数を画面に示す', () => {
      renderPanel({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['工事1', '工事2', '工事3', '工事4', '工事5'],
      });

      expect(screen.getByTestId('separate-works-count')).toHaveTextContent('5 / 5 件');
    });
  });
});
