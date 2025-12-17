/**
 * @fileoverview SiteSurveyDetailInfo コンポーネントのテスト
 *
 * Task 9.1: 現場調査基本情報表示コンポーネントの実装
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * Requirements:
 * - 1.2: 現場調査詳細画面を表示する際、現場調査の基本情報と関連する画像一覧を表示する
 * - 12.1: プロジェクトへのアクセス権を持つユーザーは現場調査を閲覧可能
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 * - 12.3: 適切な権限を持たない場合、操作を拒否してエラーメッセージを表示
 *
 * テスト対象:
 * - 調査名、調査日、メモの表示
 * - 編集ボタン・削除ボタン
 * - プロジェクトへの戻り導線
 * - 権限に基づくボタン表示制御
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SiteSurveyDetailInfo from '../../../components/site-surveys/SiteSurveyDetailInfo';
import type { SiteSurveyDetail } from '../../../types/site-survey.types';

// ============================================================================
// テストデータ
// ============================================================================

const mockSurveyDetail: SiteSurveyDetail = {
  id: 'survey-1',
  projectId: 'project-1',
  name: 'テスト現場調査',
  surveyDate: '2025-01-15',
  memo: 'これはテスト用のメモです。\n複数行にわたる説明を含みます。',
  thumbnailUrl: 'https://example.com/thumbnail.jpg',
  imageCount: 5,
  createdAt: '2025-01-10T09:00:00.000Z',
  updatedAt: '2025-01-12T14:30:00.000Z',
  project: {
    id: 'project-1',
    name: 'テストプロジェクト',
  },
  images: [],
};

const mockSurveyDetailWithoutMemo: SiteSurveyDetail = {
  ...mockSurveyDetail,
  memo: null,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * コンポーネントをレンダリングするヘルパー
 */
function renderComponent(
  props: {
    survey?: SiteSurveyDetail;
    onEdit?: () => void;
    onDelete?: () => void;
    isDeleting?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
  } = {}
) {
  const defaultProps = {
    survey: mockSurveyDetail,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    isDeleting: false,
    canEdit: true,
    canDelete: true,
  };

  const mergedProps = { ...defaultProps, ...props };

  return {
    ...render(
      <MemoryRouter>
        <SiteSurveyDetailInfo {...mergedProps} />
      </MemoryRouter>
    ),
    onEdit: mergedProps.onEdit,
    onDelete: mergedProps.onDelete,
  };
}

// ============================================================================
// テストスイート
// ============================================================================

describe('SiteSurveyDetailInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 基本情報表示 (Requirements 1.2)
  // ==========================================================================

  describe('基本情報表示', () => {
    it('調査名が見出しとして表示される', () => {
      renderComponent();

      expect(screen.getByRole('heading', { level: 2, name: 'テスト現場調査' })).toBeInTheDocument();
    });

    it('調査日が表示される', () => {
      renderComponent();

      // 調査日ラベルと値が表示される
      expect(screen.getByText('調査日')).toBeInTheDocument();
      expect(screen.getByText('2025/01/15')).toBeInTheDocument();
    });

    it('メモが表示される', () => {
      renderComponent();

      // メモラベルと値が表示される
      expect(screen.getByText('メモ')).toBeInTheDocument();
      expect(screen.getByText(/これはテスト用のメモです/)).toBeInTheDocument();
    });

    it('メモがnullの場合はメモセクションが表示されない', () => {
      renderComponent({ survey: mockSurveyDetailWithoutMemo });

      expect(screen.queryByText('メモ')).not.toBeInTheDocument();
    });

    it('作成日時が表示される', () => {
      renderComponent();

      expect(screen.getByText('作成日時')).toBeInTheDocument();
      // 日本語形式の日時が表示される
      expect(screen.getByText(/2025\/01\/10/)).toBeInTheDocument();
    });

    it('更新日時が表示される', () => {
      renderComponent();

      expect(screen.getByText('更新日時')).toBeInTheDocument();
      expect(screen.getByText(/2025\/01\/12/)).toBeInTheDocument();
    });

    it('画像件数が表示される', () => {
      renderComponent();

      expect(screen.getByText('画像件数')).toBeInTheDocument();
      expect(screen.getByText('5件')).toBeInTheDocument();
    });

    it('画像件数が0件の場合も正しく表示される', () => {
      renderComponent({
        survey: { ...mockSurveyDetail, imageCount: 0 },
      });

      expect(screen.getByText('0件')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // プロジェクト情報表示
  // ==========================================================================

  describe('プロジェクト情報表示', () => {
    it('プロジェクト名が表示される', () => {
      renderComponent();

      expect(screen.getByText('プロジェクト')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 編集ボタン
  // ==========================================================================

  describe('編集ボタン', () => {
    it('編集ボタンが表示される', () => {
      renderComponent();

      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    });

    it('編集ボタンをクリックするとonEditが呼ばれる', async () => {
      const user = userEvent.setup();
      const { onEdit } = renderComponent();

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      expect(onEdit).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 削除ボタン
  // ==========================================================================

  describe('削除ボタン', () => {
    it('削除ボタンが表示される', () => {
      renderComponent();

      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('削除ボタンをクリックするとonDeleteが呼ばれる', async () => {
      const user = userEvent.setup();
      const { onDelete } = renderComponent();

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('削除中は削除ボタンが無効になる', () => {
      renderComponent({ isDeleting: true });

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      expect(deleteButton).toBeDisabled();
    });

    it('削除中は「削除中...」と表示される', () => {
      renderComponent({ isDeleting: true });

      expect(screen.getByRole('button', { name: '削除中...' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // プロジェクトへの戻り導線
  // ==========================================================================

  describe('プロジェクトへの戻り導線', () => {
    it('プロジェクト詳細へ戻るリンクが表示される', () => {
      renderComponent();

      const backLink = screen.getByRole('link', { name: /プロジェクトに戻る/ });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/projects/project-1');
    });

    it('現場調査一覧へ戻るリンクが表示される', () => {
      renderComponent();

      const listLink = screen.getByRole('link', { name: /現場調査一覧に戻る/ });
      expect(listLink).toBeInTheDocument();
      expect(listLink).toHaveAttribute('href', '/projects/project-1/site-surveys');
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('基本情報セクションが適切な見出しレベルを持つ', () => {
      renderComponent();

      // 調査名がh2で表示される
      expect(screen.getByRole('heading', { level: 2, name: 'テスト現場調査' })).toBeInTheDocument();
    });

    it('メモがpre-wrap形式で表示される（複数行対応）', () => {
      renderComponent();

      const memoElement = screen.getByText(/これはテスト用のメモです/);
      expect(memoElement).toBeInTheDocument();
      // 複数行のテキストが含まれている
      expect(screen.getByText(/複数行にわたる説明/)).toBeInTheDocument();
    });

    it('ボタンには適切なtype属性が設定されている', () => {
      renderComponent();

      const editButton = screen.getByRole('button', { name: '編集' });
      const deleteButton = screen.getByRole('button', { name: '削除' });

      expect(editButton).toHaveAttribute('type', 'button');
      expect(deleteButton).toHaveAttribute('type', 'button');
    });
  });

  // ==========================================================================
  // 日付フォーマット
  // ==========================================================================

  describe('日付フォーマット', () => {
    it('調査日がYYYY/MM/DD形式で表示される', () => {
      renderComponent();

      expect(screen.getByText('2025/01/15')).toBeInTheDocument();
    });

    it('作成日時が日本語形式で表示される', () => {
      renderComponent();

      // 日付と時刻が含まれる
      const dateTimeElements = screen.getAllByText(/2025\/01\/10/);
      expect(dateTimeElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 権限によるUI制御 (Requirements 12.1, 12.2, 12.3)
  // ==========================================================================

  describe('権限によるUI制御', () => {
    describe('編集権限がない場合 (Requirement 12.2)', () => {
      it('編集ボタンが非表示になる', () => {
        renderComponent({ canEdit: false });

        expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      });

      it('削除ボタンは表示される（canDeleteがtrueの場合）', () => {
        renderComponent({ canEdit: false, canDelete: true });

        expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
      });
    });

    describe('削除権限がない場合 (Requirement 12.2)', () => {
      it('削除ボタンが非表示になる', () => {
        renderComponent({ canDelete: false });

        expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
      });

      it('編集ボタンは表示される（canEditがtrueの場合）', () => {
        renderComponent({ canEdit: true, canDelete: false });

        expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      });
    });

    describe('編集・削除両方の権限がない場合 (Requirement 12.2)', () => {
      it('編集ボタンと削除ボタンの両方が非表示になる', () => {
        renderComponent({ canEdit: false, canDelete: false });

        expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
      });

      it('基本情報は引き続き表示される (Requirement 12.1)', () => {
        renderComponent({ canEdit: false, canDelete: false });

        // 調査名、調査日、プロジェクト名は表示される
        expect(
          screen.getByRole('heading', { level: 2, name: 'テスト現場調査' })
        ).toBeInTheDocument();
        expect(screen.getByText('2025/01/15')).toBeInTheDocument();
        expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
      });

      it('ナビゲーションリンクは表示される', () => {
        renderComponent({ canEdit: false, canDelete: false });

        expect(screen.getByRole('link', { name: /プロジェクトに戻る/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /現場調査一覧に戻る/ })).toBeInTheDocument();
      });
    });
  });
});
