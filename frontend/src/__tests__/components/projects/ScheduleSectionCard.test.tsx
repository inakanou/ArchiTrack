/**
 * @fileoverview ScheduleSectionCard コンポーネントのテスト
 *
 * Task 61.2: ScheduleSectionCardの単体テスト
 *
 * Requirements:
 * - 38.1: プロジェクト詳細画面の契約書セクションの下に工程表セクションを表示する
 * - 38.2: 工程表セクションにセクションタイトル「工程表」を表示する
 * - 38.3: 工程表セクションに工程表の総数を表示する（例：全5件）
 * - 38.4: 工程表セクションに直近の工程表をカード形式で表示する
 * - 38.5: 工程表カードに工程表名、更新日時、工程項目数を表示する
 * - 38.6: ユーザーが工程表カードをクリックした場合、工程表詳細画面へ遷移する
 * - 38.7: 工程表セクションに「すべて見る」リンクを提供する
 * - 38.8: 「すべて見る」リンクで工程表一覧画面へ遷移する
 * - 38.9: 工程表セクションに新規作成ボタンを提供する
 * - 38.10: 新規作成ボタンで工程表作成画面へ遷移する
 * - 38.11: 工程表が存在しない場合、「工程表はまだありません」メッセージと新規作成ボタンを表示する
 * - 38.12: 工程表データをロード中の場合、スケルトンローダーを表示する
 * - 38.13: 工程表セクションのUIを既存の契約書セクションと同様のスタイルで提供する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import {
  ScheduleSectionCard,
  type ScheduleSectionItem,
} from '../../../components/projects/ScheduleSectionCard';

// テストデータ
const PROJECT_ID = 'project-test-123';

const mockSchedules: ScheduleSectionItem[] = [
  {
    id: 'schedule-1',
    name: '第1期工程表',
    updatedAt: '2025-06-01T00:00:00.000Z',
    itemCount: 12,
  },
  {
    id: 'schedule-2',
    name: '第2期工程表',
    updatedAt: '2025-07-15T00:00:00.000Z',
    itemCount: 8,
  },
];

/**
 * テストヘルパー: BrowserRouter内でレンダリング
 */
function renderComponent(props: Partial<React.ComponentProps<typeof ScheduleSectionCard>> = {}) {
  const defaultProps = {
    projectId: PROJECT_ID,
    totalCount: 2,
    latestSchedules: mockSchedules,
    isLoading: false,
    ...props,
  };

  return render(
    <BrowserRouter>
      <ScheduleSectionCard {...defaultProps} />
    </BrowserRouter>
  );
}

describe('ScheduleSectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // セクションタイトルと総数表示 (38.2, 38.3)
  // ==========================================================================
  describe('セクションタイトルと総数表示 (38.2, 38.3)', () => {
    it('セクションタイトル「工程表」が表示される (38.2)', () => {
      renderComponent();
      expect(screen.getByText('工程表')).toBeInTheDocument();
    });

    it('工程表の総数が「全N件」形式で表示される (38.3)', () => {
      renderComponent({ totalCount: 5 });
      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('総数が0件の場合「全0件」と表示される', () => {
      renderComponent({ totalCount: 0, latestSchedules: [] });
      expect(screen.getByText('全0件')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 工程表カード表示 (38.4, 38.5)
  // ==========================================================================
  describe('工程表カード表示 (38.4, 38.5)', () => {
    it('直近の工程表がカード形式で表示される (38.4)', () => {
      renderComponent();
      expect(screen.getByTestId('schedule-card-schedule-1')).toBeInTheDocument();
      expect(screen.getByTestId('schedule-card-schedule-2')).toBeInTheDocument();
    });

    it('工程表名が表示される (38.5)', () => {
      renderComponent();
      expect(screen.getByText('第1期工程表')).toBeInTheDocument();
      expect(screen.getByText('第2期工程表')).toBeInTheDocument();
    });

    it('工程項目数が表示される (38.5)', () => {
      renderComponent();
      expect(screen.getByText(/12項目/)).toBeInTheDocument();
      expect(screen.getByText(/8項目/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // リンク遷移先テスト (38.6, 38.7, 38.8, 38.9, 38.10)
  // ==========================================================================
  describe('リンク遷移先 (38.6, 38.7, 38.8, 38.9, 38.10)', () => {
    it('工程表カードクリックで詳細画面へ遷移するリンクが設定される (38.6)', () => {
      renderComponent();
      const card = screen.getByTestId('schedule-card-schedule-1');
      expect(card).toHaveAttribute('href', `/schedules/schedule-1`);
    });

    it('「すべて見る」リンクで一覧画面へ遷移する (38.7, 38.8)', () => {
      renderComponent();
      const viewAllLink = screen.getByText('すべて見る');
      expect(viewAllLink).toHaveAttribute('href', `/projects/${PROJECT_ID}/schedules`);
    });

    it('新規作成ボタンで作成画面へ遷移する (38.9, 38.10)', () => {
      renderComponent();
      // ヘッダー内の新規作成ボタン（工程表がある場合）
      const headerActions = screen.getByLabelText('工程表を新規作成');
      expect(headerActions).toHaveAttribute('href', `/projects/${PROJECT_ID}/schedules/new`);
    });

    it('工程表が0件の場合、ヘッダーに「すべて見る」「新規作成」ボタンが表示されない', () => {
      renderComponent({ totalCount: 0, latestSchedules: [] });
      expect(screen.queryByText('すべて見る')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('工程表を新規作成')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 空状態表示 (38.11)
  // ==========================================================================
  describe('空状態 (38.11)', () => {
    it('工程表が存在しない場合「工程表はまだありません」メッセージが表示される (38.11)', () => {
      renderComponent({ totalCount: 0, latestSchedules: [] });
      expect(screen.getByText('工程表はまだありません')).toBeInTheDocument();
    });

    it('空状態で新規作成ボタン（リンク）が表示される (38.11)', () => {
      renderComponent({ totalCount: 0, latestSchedules: [] });
      const createLink = screen.getByText('新規作成');
      expect(createLink).toHaveAttribute('href', `/projects/${PROJECT_ID}/schedules/new`);
    });
  });

  // ==========================================================================
  // スケルトンローダー (38.12)
  // ==========================================================================
  describe('スケルトンローダー (38.12)', () => {
    it('ローディング中にスケルトンが表示される (38.12)', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByTestId('schedule-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数が表示されない', () => {
      renderComponent({ isLoading: true, totalCount: 5 });
      expect(screen.queryByText('全5件')).not.toBeInTheDocument();
    });

    it('ローディング中はカードが表示されない', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByTestId('schedule-card-schedule-1')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================
  describe('アクセシビリティ', () => {
    it('section要素にrole="region"が設定される', () => {
      renderComponent();
      const section = screen.getByTestId('schedule-section');
      expect(section).toHaveAttribute('role', 'region');
    });

    it('section要素にaria-labelledbyが設定される', () => {
      renderComponent();
      const section = screen.getByTestId('schedule-section');
      expect(section).toHaveAttribute('aria-labelledby', 'schedule-section-title');
    });
  });
});
