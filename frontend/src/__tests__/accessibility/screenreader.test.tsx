/**
 * @fileoverview スクリーンリーダー対応テスト
 *
 * Task 12.2: スクリーンリーダー対応
 *
 * Requirements:
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 * - 20.3: エラーメッセージをaria-live属性でスクリーンリーダーに通知
 * - 20.5: コントラスト比をWCAG 2.1 Level AA準拠（通常テキスト4.5:1以上、大きいテキスト3:1以上）に調整
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectForm from '../../components/projects/ProjectForm';
import ProjectSearchFilter from '../../components/projects/ProjectSearchFilter';
import ProjectListTable from '../../components/projects/ProjectListTable';
import ProjectListCard from '../../components/projects/ProjectListCard';
import StatusTransitionUI from '../../components/projects/StatusTransitionUI';
import BackwardReasonDialog from '../../components/projects/BackwardReasonDialog';
import DeleteConfirmationDialog from '../../components/projects/DeleteConfirmationDialog';
import type {
  ProjectFilter,
  ProjectInfo,
  AllowedTransition,
  StatusHistoryResponse,
} from '../../types/project.types';

// AuthContext のモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'current-user-id',
      email: 'test@example.com',
      displayName: 'テストユーザー',
    },
    isAuthenticated: true,
    isInitialized: true,
  }),
}));

// APIクライアントのモック
vi.mock('../../api/projects', () => ({
  getAssignableUsers: vi.fn().mockResolvedValue([
    { id: 'user-1', displayName: 'ユーザー1' },
    { id: 'current-user-id', displayName: 'テストユーザー' },
  ]),
}));

// apiClientのモック（トークンを返すように設定）
vi.mock('../../api/client', () => ({
  apiClient: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
  },
}));

// ============================================================================
// テストデータ
// ============================================================================

const mockProjects: ProjectInfo[] = [
  {
    id: 'project-1',
    name: 'テストプロジェクト1',
    tradingPartnerId: 'partner-1',
    tradingPartner: { id: 'partner-1', name: 'テスト顧客1', nameKana: 'テストコキャク1' },
    salesPerson: { id: 'user-1', displayName: 'ユーザー1' },
    status: 'PREPARING',
    statusLabel: '準備中',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
  },
];

const mockAllowedTransitions: AllowedTransition[] = [
  { status: 'SURVEYING', type: 'forward', requiresReason: false },
  { status: 'CANCELLED', type: 'terminate', requiresReason: false },
];

const mockStatusHistory: StatusHistoryResponse[] = [
  {
    id: 'history-1',
    fromStatus: null,
    toStatus: 'PREPARING',
    fromStatusLabel: null,
    toStatusLabel: '準備中',
    transitionType: 'initial',
    transitionTypeLabel: '初期設定',
    reason: null,
    changedBy: { id: 'user-1', displayName: 'ユーザー1' },
    changedAt: '2025-01-01T00:00:00Z',
  },
];

// ============================================================================
// ProjectForm アクセシビリティテスト
// ============================================================================

describe('ProjectForm スクリーンリーダー対応', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('すべてのフォーム入力要素にaria-label属性が設定されている', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 各入力フィールドにaria-labelが存在することを確認
      expect(screen.getByLabelText(/プロジェクト名/)).toHaveAttribute(
        'aria-label',
        'プロジェクト名'
      );
      expect(screen.getByLabelText(/顧客名/)).toHaveAttribute('aria-label', '顧客名');
      expect(screen.getByLabelText(/営業担当者/)).toHaveAttribute('aria-label', '営業担当者');
      expect(screen.getByLabelText(/工事担当者/)).toHaveAttribute('aria-label', '工事担当者');
      expect(screen.getByLabelText(/現場住所/)).toHaveAttribute('aria-label', '現場住所');
      expect(screen.getByLabelText(/概要/)).toHaveAttribute('aria-label', '概要');
    });

    it('必須フィールドにaria-required属性が設定されている', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 必須フィールドにaria-required="true"が設定されている
      expect(screen.getByLabelText(/プロジェクト名/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/顧客名/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/営業担当者/)).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('aria-live属性によるエラー通知', () => {
    it('バリデーションエラー時にaria-live="polite"でエラーメッセージを通知する', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 作成ボタンをクリック（バリデーションエラーを発生させる）
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // エラーメッセージにaria-live="polite"が設定されていることを確認
      await waitFor(() => {
        const errorMessages = screen.getAllByRole('alert');
        expect(errorMessages.length).toBeGreaterThan(0);
        errorMessages.forEach((errorMsg) => {
          expect(errorMsg).toHaveAttribute('aria-live', 'polite');
        });
      });
    });

    it('エラーフィールドにaria-invalid="true"が設定される', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/プロジェクト名/);
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('エラーメッセージがaria-describedbyで入力フィールドに関連付けられる', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/プロジェクト名/);
        const describedBy = nameInput.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();

        // aria-describedbyで参照されるエラーメッセージが存在することを確認
        if (describedBy) {
          const errorElement = document.getElementById(describedBy);
          expect(errorElement).toBeInTheDocument();
          expect(errorElement?.textContent).toBe('プロジェクト名は必須です');
        }
      });
    });
  });
});

// ============================================================================
// ProjectSearchFilter アクセシビリティテスト
// ============================================================================

describe('ProjectSearchFilter スクリーンリーダー対応', () => {
  const defaultFilter: ProjectFilter = {
    search: '',
    status: [],
    createdFrom: undefined,
    createdTo: undefined,
  };
  const mockOnFilterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('検索フィールドにaria-label属性が設定されている', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('aria-label', '検索キーワード');
    });

    it('ステータスフィルタにaria-label属性が設定されている', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      const statusSelect = screen.getByLabelText(/ステータスフィルタ/);
      expect(statusSelect).toHaveAttribute('aria-label', 'ステータスフィルタ');
    });

    it('日付フィルタにaria-label属性が設定されている', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      expect(screen.getByLabelText('作成日（開始）')).toHaveAttribute(
        'aria-label',
        '作成日（開始）'
      );
      expect(screen.getByLabelText('作成日（終了）')).toHaveAttribute(
        'aria-label',
        '作成日（終了）'
      );
    });

    it('検索ボタンにaria-label属性が設定されている', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      expect(screen.getByRole('button', { name: '検索' })).toHaveAttribute('aria-label', '検索');
    });

    it('フィルタクリアボタンにaria-label属性が設定されている', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      expect(screen.getByRole('button', { name: 'フィルタをクリア' })).toHaveAttribute(
        'aria-label',
        'フィルタをクリア'
      );
    });
  });

  describe('aria-live属性によるエラー通知', () => {
    it('検索エラー時にaria-live="assertive"でエラーメッセージを通知する', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      // 1文字だけ入力して検索
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'a');
      await user.click(screen.getByRole('button', { name: '検索' }));

      // エラーメッセージにaria-live="assertive"が設定されていることを確認
      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveAttribute('aria-live', 'assertive');
        expect(errorMessage).toHaveTextContent('2文字以上で入力してください');
      });
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />);

      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'a');
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => {
        expect(searchInput).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });
});

// ============================================================================
// ProjectListTable アクセシビリティテスト
// ============================================================================

describe('ProjectListTable スクリーンリーダー対応', () => {
  const mockOnSort = vi.fn();
  const mockOnRowClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('テーブルにaria-label属性が設定されている', () => {
      render(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={mockOnSort}
          onRowClick={mockOnRowClick}
        />
      );

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label', 'プロジェクト一覧');
    });

    it('ソートボタンにaria-label属性が設定されている', () => {
      render(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={mockOnSort}
          onRowClick={mockOnRowClick}
        />
      );

      const sortButtons = screen.getAllByRole('button');
      sortButtons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label');
      });
    });

    it('列ヘッダーにaria-sort属性が設定されている', () => {
      render(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={mockOnSort}
          onRowClick={mockOnRowClick}
        />
      );

      // 現在のソート列にaria-sortが設定されている
      const columnHeaders = screen.getAllByRole('columnheader');
      const sortedHeader = columnHeaders.find((h) => h.getAttribute('aria-sort') !== null);
      expect(sortedHeader).toHaveAttribute('aria-sort', 'descending');
    });
  });

  describe('テーブル行のアクセシビリティ', () => {
    it('テーブル行がキーボードフォーカス可能である', () => {
      render(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={mockOnSort}
          onRowClick={mockOnRowClick}
        />
      );

      const rows = screen.getAllByRole('row');
      // データ行（ヘッダー以外）がtabIndex=0でフォーカス可能
      const dataRows = rows.slice(1); // ヘッダー行を除外
      dataRows.forEach((row) => {
        expect(row).toHaveAttribute('tabindex', '0');
      });
    });
  });
});

// ============================================================================
// ProjectListCard アクセシビリティテスト
// ============================================================================

describe('ProjectListCard スクリーンリーダー対応', () => {
  const mockOnCardClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('カードにaria-label属性が設定されている', () => {
      render(<ProjectListCard projects={mockProjects} onCardClick={mockOnCardClick} />);

      const cards = screen.getAllByRole('button');
      expect(cards[0]).toHaveAttribute('aria-label', 'プロジェクト: テストプロジェクト1');
    });
  });
});

// ============================================================================
// StatusTransitionUI アクセシビリティテスト
// ============================================================================

describe('StatusTransitionUI スクリーンリーダー対応', () => {
  const mockOnTransition = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('現在のステータスバッジにaria-label属性が設定されている', () => {
      render(
        <StatusTransitionUI
          projectId="project-1"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={mockStatusHistory}
          onTransition={mockOnTransition}
          isLoading={false}
        />
      );

      const statusBadge = screen.getByTestId('current-status-badge');
      expect(statusBadge).toHaveAttribute('aria-label', '現在のステータス: 準備中');
      expect(statusBadge).toHaveAttribute('role', 'status');
    });

    it('遷移ボタンにaria-label属性が設定されている', () => {
      render(
        <StatusTransitionUI
          projectId="project-1"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={mockStatusHistory}
          onTransition={mockOnTransition}
          isLoading={false}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /調査中に順方向遷移する/ });
      expect(forwardButton).toBeInTheDocument();

      const terminateButton = screen.getByRole('button', { name: /中止に終端遷移する/ });
      expect(terminateButton).toBeInTheDocument();
    });

    it('履歴セクションにaria-labelledbyとrole="region"が設定されている', () => {
      render(
        <StatusTransitionUI
          projectId="project-1"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={mockStatusHistory}
          onTransition={mockOnTransition}
          isLoading={false}
        />
      );

      const historySection = screen.getByRole('region', { name: 'ステータス変更履歴' });
      expect(historySection).toBeInTheDocument();
    });
  });
});

// ============================================================================
// BackwardReasonDialog アクセシビリティテスト
// ============================================================================

describe('BackwardReasonDialog スクリーンリーダー対応', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('差し戻し理由入力欄にaria-label属性が設定されている', () => {
      render(
        <BackwardReasonDialog
          isOpen={true}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          fromStatus="SURVEYING"
          toStatus="PREPARING"
          isSubmitting={false}
        />
      );

      const textarea = screen.getByLabelText('差し戻し理由');
      expect(textarea).toHaveAttribute('aria-label', '差し戻し理由');
      expect(textarea).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('aria-live属性によるエラー通知', () => {
    it('エラー時にaria-live="polite"でエラーメッセージを通知する', async () => {
      const user = userEvent.setup();
      render(
        <BackwardReasonDialog
          isOpen={true}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          fromStatus="SURVEYING"
          toStatus="PREPARING"
          isSubmitting={false}
        />
      );

      // 空のまま送信
      const confirmButton = screen.getByRole('button', { name: '差し戻す' });
      await user.click(confirmButton);

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveAttribute('aria-live', 'polite');
        expect(errorMessage).toHaveTextContent('差し戻し理由は必須です');
      });
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      render(
        <BackwardReasonDialog
          isOpen={true}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          fromStatus="SURVEYING"
          toStatus="PREPARING"
          isSubmitting={false}
        />
      );

      const confirmButton = screen.getByRole('button', { name: '差し戻す' });
      await user.click(confirmButton);

      await waitFor(() => {
        const textarea = screen.getByLabelText('差し戻し理由');
        expect(textarea).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });
});

// ============================================================================
// DeleteConfirmationDialog アクセシビリティテスト
// ============================================================================

describe('DeleteConfirmationDialog スクリーンリーダー対応', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aria-label属性', () => {
    it('ダイアログにaria-labelledbyとaria-describedby属性が設定されている', () => {
      render(
        <DeleteConfirmationDialog
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          projectName="テストプロジェクト"
          hasRelatedData={false}
        />
      );

      // ダイアログタイトルの存在を確認
      const dialogTitle = screen.getByRole('heading', { name: 'プロジェクトの削除' });
      expect(dialogTitle).toBeInTheDocument();

      // aria-labelledbyで参照されるIDを持つ要素を確認
      const titleId = dialogTitle.getAttribute('id');
      expect(titleId).toBeTruthy();

      // aria-labelledbyとaria-describedbyを持つコンテナを確認
      const dialogContainer = dialogTitle.closest('[aria-labelledby]');
      expect(dialogContainer).toHaveAttribute('aria-labelledby', titleId);
      expect(dialogContainer).toHaveAttribute('aria-describedby');
    });

    it('関連データ警告がrole="alert"で通知される', () => {
      render(
        <DeleteConfirmationDialog
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          projectName="テストプロジェクト"
          hasRelatedData={true}
          relatedDataCounts={{ surveys: 3, estimates: 2 }}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('関連データがあります');
    });
  });
});

// ============================================================================
// コントラスト比テスト（WCAG 2.1 Level AA準拠）
// ============================================================================

describe('コントラスト比 WCAG 2.1 Level AA準拠', () => {
  /**
   * 色のコントラスト比を計算するユーティリティ関数
   * WCAG 2.1 Level AAでは通常テキスト4.5:1以上、大きいテキスト3:1以上が必要
   */
  function getRelativeLuminance(r: number, g: number, b: number): number {
    const srgb = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) throw new Error(`Invalid hex color: ${hex}`);
    return {
      r: parseInt(result[1]!, 16),
      g: parseInt(result[2]!, 16),
      b: parseInt(result[3]!, 16),
    };
  }

  function getContrastRatio(color1: string, color2: string): number {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  describe('ステータスバッジのコントラスト比', () => {
    // StatusTransitionUIで定義されているステータスカラー
    const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
      PREPARING: { bg: '#e5e7eb', text: '#374151' },
      SURVEYING: { bg: '#dbeafe', text: '#1e40af' },
      ESTIMATING: { bg: '#fef3c7', text: '#92400e' },
      APPROVING: { bg: '#ffedd5', text: '#c2410c' },
      CONTRACTING: { bg: '#ede9fe', text: '#5b21b6' },
      CONSTRUCTING: { bg: '#e0e7ff', text: '#3730a3' },
      DELIVERING: { bg: '#cffafe', text: '#0e7490' },
      BILLING: { bg: '#ccfbf1', text: '#0f766e' },
      AWAITING: { bg: '#ecfccb', text: '#4d7c0f' },
      COMPLETED: { bg: '#dcfce7', text: '#166534' },
      CANCELLED: { bg: '#fee2e2', text: '#991b1b' },
      LOST: { bg: '#ffe4e6', text: '#9f1239' },
    };

    it.each(Object.entries(STATUS_COLORS))(
      '%s ステータスのコントラスト比が4.5:1以上である',
      (_status, colors) => {
        const ratio = getContrastRatio(colors.bg, colors.text);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    );
  });

  describe('エラーメッセージのコントラスト比', () => {
    // エラーメッセージの色設定（白背景に対する赤色テキスト）
    const errorColor = '#dc2626';
    const backgroundColor = '#ffffff';

    it('エラーメッセージのコントラスト比が4.5:1以上である', () => {
      const ratio = getContrastRatio(backgroundColor, errorColor);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('プライマリボタンのコントラスト比', () => {
    // プライマリボタンの色設定（青背景に白テキスト）
    const primaryBg = '#1d4ed8';
    const primaryText = '#ffffff';

    it('プライマリボタンのコントラスト比が4.5:1以上である', () => {
      const ratio = getContrastRatio(primaryBg, primaryText);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('ラベルテキストのコントラスト比', () => {
    // ラベルテキストの色設定（白背景に対するグレーテキスト）
    const labelColor = '#374151';
    const backgroundColor = '#ffffff';

    it('ラベルテキストのコントラスト比が4.5:1以上である', () => {
      const ratio = getContrastRatio(backgroundColor, labelColor);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});
