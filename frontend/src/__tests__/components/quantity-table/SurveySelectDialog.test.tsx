/**
 * @fileoverview 現場調査選択ダイアログコンポーネントの単体テスト
 *
 * Task 57.4: 一括生成フロントエンドの単体テスト（SurveySelectDialog 担当）
 *
 * SurveySelectDialog の UI 責務を回帰防止する:
 * - 現場調査一覧（名前・写真件数）の表示 / isOpen=false での非表示
 * - 現場調査を選択し確定すると onConfirm(選択 siteSurveyId) が呼ばれる
 * - isCreating=true で確定ボタン等が disabled、インジケーター（role=status）が表示される（重複実行防止）
 * - 空一覧時の表示と確定ボタン disabled
 * - 閉じる操作（閉じるボタン / Escape / オーバーレイ）で onClose が呼ばれ、生成中はロックされる
 *
 * Requirements:
 * - 40.1: 現場調査一覧から1件を選択するダイアログを表示する
 * - 40.2: 現場調査の名前と写真件数を表示する
 * - 40.11: 実行中はインジケーター表示・重複実行防止（ボタン disabled）
 * - 40.13: 完了は呼び出し側（編集画面）責務だが、確定コールバックを起点とする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveySelectDialog from '../../../components/quantity-table/SurveySelectDialog';
import type { SiteSurveySummary } from '../../../components/quantity-table/SurveySelectDialog';

const mockSurveys: SiteSurveySummary[] = [
  { id: 'survey-1', name: '現場調査1', photoCount: 2 },
  { id: 'survey-2', name: '写真なし調査', photoCount: 0 },
  { id: 'survey-3', name: '現場調査3', photoCount: 5 },
];

function buildProps(overrides: Partial<React.ComponentProps<typeof SurveySelectDialog>> = {}) {
  return {
    isOpen: true,
    siteSurveys: mockSurveys,
    isCreating: false,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('SurveySelectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 表示 / 非表示（Requirements 40.1, 40.2）
  // ==========================================================================
  describe('表示・非表示', () => {
    it('isOpen=true でダイアログとタイトルが表示されること', () => {
      render(<SurveySelectDialog {...buildProps()} />);

      expect(screen.getByTestId('survey-select-dialog')).toBeInTheDocument();
      expect(screen.getByText('現場調査から一括追加')).toBeInTheDocument();
    });

    it('isOpen=false では何も描画されないこと', () => {
      render(<SurveySelectDialog {...buildProps({ isOpen: false })} />);

      expect(screen.queryByTestId('survey-select-dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('現場調査から一括追加')).not.toBeInTheDocument();
    });

    it('現場調査一覧が名前と「写真 {photoCount} 件」で表示されること', () => {
      render(<SurveySelectDialog {...buildProps()} />);

      expect(screen.getByText('現場調査1')).toBeInTheDocument();
      expect(screen.getByText('写真 2 件')).toBeInTheDocument();
      expect(screen.getByText('写真なし調査')).toBeInTheDocument();
      expect(screen.getByText('写真 0 件')).toBeInTheDocument();
      expect(screen.getByText('現場調査3')).toBeInTheDocument();
      expect(screen.getByText('写真 5 件')).toBeInTheDocument();
    });

    it('一覧の各現場調査が選択肢（radio）として描画されること', () => {
      render(<SurveySelectDialog {...buildProps()} />);

      mockSurveys.forEach((survey) => {
        expect(screen.getByTestId(`survey-select-option-${survey.id}`)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 選択・確定コールバック（Requirements 40.1, 40.13）
  // ==========================================================================
  describe('選択と確定', () => {
    it('初期状態では確定ボタンが disabled であること（未選択）', () => {
      render(<SurveySelectDialog {...buildProps()} />);

      expect(screen.getByTestId('survey-select-dialog-confirm')).toBeDisabled();
    });

    it('現場調査を選択して確定すると onConfirm が選択した siteSurveyId で呼ばれること', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onConfirm })} />);

      await user.click(screen.getByTestId('survey-select-option-survey-1'));
      await user.click(screen.getByTestId('survey-select-dialog-confirm'));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith('survey-1');
    });

    it('選択した項目が aria-checked=true になること', async () => {
      const user = userEvent.setup();
      render(<SurveySelectDialog {...buildProps()} />);

      const option = screen.getByTestId('survey-select-option-survey-3');
      expect(option).toHaveAttribute('aria-checked', 'false');

      await user.click(option);

      expect(screen.getByTestId('survey-select-option-survey-3')).toHaveAttribute(
        'aria-checked',
        'true'
      );
    });

    it('未選択のまま確定ボタンを押しても onConfirm が呼ばれないこと', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onConfirm })} />);

      // disabled なボタンはクリックしてもハンドラが発火しない
      await user.click(screen.getByTestId('survey-select-dialog-confirm'));

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 生成中（Requirements 40.11）
  // ==========================================================================
  describe('生成中（重複実行防止）', () => {
    it('isCreating=true で確定ボタンが disabled になりインジケーター（role=status, 生成中...）が表示されること', () => {
      render(<SurveySelectDialog {...buildProps({ isCreating: true })} />);

      expect(screen.getByTestId('survey-select-dialog-confirm')).toBeDisabled();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('生成中...')).toBeInTheDocument();
    });

    it('選択済みでも isCreating=true なら確定ボタンが disabled になること（選択状態に依存せず生成中フラグでロックされる）', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<SurveySelectDialog {...buildProps()} />);

      // 1件選択（この時点では確定可能）
      await user.click(screen.getByTestId('survey-select-option-survey-1'));
      expect(screen.getByTestId('survey-select-dialog-confirm')).not.toBeDisabled();

      // 生成中へ遷移すると選択済みでも disabled になる
      rerender(<SurveySelectDialog {...buildProps({ isCreating: true })} />);
      expect(screen.getByTestId('survey-select-dialog-confirm')).toBeDisabled();
    });

    it('isCreating=true ではキャンセル・閉じるボタンも disabled になること', () => {
      render(<SurveySelectDialog {...buildProps({ isCreating: true })} />);

      expect(screen.getByTestId('survey-select-dialog-close')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    });

    it('isCreating=true では選択済みでも確定操作で onConfirm が再発火しないこと（重複防止）', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const { rerender } = render(<SurveySelectDialog {...buildProps({ onConfirm })} />);

      // 先に選択しておく
      await user.click(screen.getByTestId('survey-select-option-survey-1'));
      // 生成中へ遷移
      rerender(<SurveySelectDialog {...buildProps({ onConfirm, isCreating: true })} />);

      await user.click(screen.getByTestId('survey-select-dialog-confirm'));

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('isCreating=false のときはインジケーターが表示されず「実行」ラベルになること', () => {
      render(<SurveySelectDialog {...buildProps()} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText('実行')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 空一覧（Requirements 40.2）
  // ==========================================================================
  describe('空一覧', () => {
    it('現場調査が0件のとき空メッセージが表示され確定ボタンが disabled であること', () => {
      render(<SurveySelectDialog {...buildProps({ siteSurveys: [] })} />);

      expect(screen.getByTestId('survey-select-dialog-empty')).toBeInTheDocument();
      expect(screen.getByText('選択可能な現場調査がありません')).toBeInTheDocument();
      expect(screen.queryByTestId('survey-select-dialog-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('survey-select-dialog-confirm')).toBeDisabled();
    });
  });

  // ==========================================================================
  // 閉じる操作（Requirements 40.11: 生成中ロック）
  // ==========================================================================
  describe('閉じる操作', () => {
    it('閉じるボタン押下で onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onClose })} />);

      await user.click(screen.getByTestId('survey-select-dialog-close'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('キャンセルボタン押下で onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onClose })} />);

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape キーで onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onClose })} />);

      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('オーバーレイクリックで onClose が呼ばれること', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onClose })} />);

      await user.click(screen.getByTestId('survey-select-dialog'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('isCreating=true のとき Escape キーで onClose が呼ばれないこと（ロック）', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onClose, isCreating: true })} />);

      await user.keyboard('{Escape}');

      expect(onClose).not.toHaveBeenCalled();
    });

    it('isCreating=true のときオーバーレイクリックで onClose が呼ばれないこと（ロック）', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SurveySelectDialog {...buildProps({ onClose, isCreating: true })} />);

      await user.click(screen.getByTestId('survey-select-dialog'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
