/**
 * @fileoverview 工事看板マスタ管理ページテスト
 *
 * Task 6.5: 看板マスタ管理画面
 *
 * Requirements:
 * - 8.1: 看板の新規登録
 * - 8.6: 看板の編集（楽観的排他制御）
 * - 8.8: 使用中削除は確認ダイアログ
 * - 8.9: 当該プロジェクト配下のみ
 * - 8.10: 看板一覧表示（inUseCount）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConstructionSignboardListPage from './ConstructionSignboardListPage';
import * as projectsApi from '../api/projects';
import * as signboardsApi from '../api/construction-signboards';
import { ApiError } from '../api/client';
import type { ProjectDetail } from '../types/project.types';
import type { ConstructionSignboard } from '../types/construction-photo.types';

const routerState = vi.hoisted(() => ({ projectId: 'project-123' as string | undefined }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: routerState.projectId }),
  };
});

vi.mock('../api/projects');
vi.mock('../api/construction-signboards');

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};
vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

const mockProject: ProjectDetail = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト',
  status: 'SURVEYING',
  statusLabel: '現地調査',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト取引先', nameKana: 'テスト' },
  salesPerson: { id: 'user-1', displayName: 'テスト管理者' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const signboardUnused: ConstructionSignboard = {
  id: 'sb-1',
  projectId: 'project-123',
  workName: '基礎工事',
  workLocation: '渋谷区',
  freeItems: [],
  footerText: null,
  inUseCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const signboardInUse: ConstructionSignboard = {
  id: 'sb-2',
  projectId: 'project-123',
  workName: '鉄骨工事',
  workLocation: '新宿区',
  freeItems: [{ label: '天候', value: '晴' }],
  footerText: '状況',
  inUseCount: 3,
  createdAt: '2025-01-02T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <ConstructionSignboardListPage />
    </BrowserRouter>
  );
}

describe('ConstructionSignboardListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerState.projectId = 'project-123';
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(signboardsApi.getConstructionSignboards).mockResolvedValue([
      signboardUnused,
      signboardInUse,
    ]);
  });

  describe('一覧表示 (Requirement 8.9, 8.10)', () => {
    it('プロジェクト配下の看板一覧と使用件数(inUseCount)を表示する', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('基礎工事')).toBeInTheDocument();
      });

      expect(signboardsApi.getConstructionSignboards).toHaveBeenCalledWith('project-123');
      expect(screen.getByText('鉄骨工事')).toBeInTheDocument();
      // inUseCount 表示（3件使用中）
      expect(screen.getByText(/3/)).toBeInTheDocument();
    });
  });

  describe('新規登録 (Requirement 8.1)', () => {
    it('新規登録フォーム送信で create API が呼ばれ一覧を再取得する', async () => {
      const created: ConstructionSignboard = { ...signboardUnused, id: 'sb-new' };
      vi.mocked(signboardsApi.createConstructionSignboard).mockResolvedValue(created);

      renderComponent();
      await waitFor(() => expect(screen.getByText('基礎工事')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: '新規登録' }));

      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '内装工事' } });
      fireEvent.change(screen.getByLabelText(/工事場所/), { target: { value: '港区' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(signboardsApi.createConstructionSignboard).toHaveBeenCalledWith('project-123', {
          workName: '内装工事',
          workLocation: '港区',
          freeItems: [],
          footerText: null,
        });
      });
      // 作成後の一覧再取得（初回+作成後で2回以上）
      await waitFor(() => {
        expect(signboardsApi.getConstructionSignboards).toHaveBeenCalledTimes(2);
      });
      expect(mockToast.success).toHaveBeenCalled();
    });
  });

  describe('編集 (Requirement 8.6)', () => {
    it('編集で既存値をロードし update API を updatedAt 付きで呼ぶ', async () => {
      vi.mocked(signboardsApi.updateConstructionSignboard).mockResolvedValue(signboardInUse);

      renderComponent();
      await waitFor(() => expect(screen.getByText('鉄骨工事')).toBeInTheDocument());

      const row = screen.getByText('鉄骨工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '編集' }));

      // 既存値ロード
      await waitFor(() => {
        expect(screen.getByLabelText(/工事件名/)).toHaveValue('鉄骨工事');
      });
      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '鉄骨工事改' } });
      fireEvent.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(signboardsApi.updateConstructionSignboard).toHaveBeenCalledWith(
          'sb-2',
          {
            workName: '鉄骨工事改',
            workLocation: '新宿区',
            freeItems: [{ label: '天候', value: '晴' }],
            footerText: '状況',
          },
          '2025-01-02T00:00:00.000Z'
        );
      });
    });
  });

  describe('使用中削除の確認 (Requirement 8.8)', () => {
    it('inUseCount>0 の看板削除で使用件数入りの確認を表示し、確定で delete を呼ぶ', async () => {
      vi.mocked(signboardsApi.deleteConstructionSignboard).mockResolvedValue({ inUseCount: 3 });

      renderComponent();
      await waitFor(() => expect(screen.getByText('鉄骨工事')).toBeInTheDocument());

      const row = screen.getByText('鉄骨工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '削除' }));

      // 使用中の警告ダイアログ
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/3件の写真項目で使用中です/)).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(signboardsApi.deleteConstructionSignboard).toHaveBeenCalledWith('sb-2');
      });
      await waitFor(() => {
        expect(signboardsApi.getConstructionSignboards).toHaveBeenCalledTimes(2);
      });
    });

    it('未使用の看板削除は通常の確認を表示する', async () => {
      vi.mocked(signboardsApi.deleteConstructionSignboard).mockResolvedValue({ inUseCount: 0 });

      renderComponent();
      await waitFor(() => expect(screen.getByText('基礎工事')).toBeInTheDocument());

      const row = screen.getByText('基礎工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '削除' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByText(/使用中です/)).not.toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(signboardsApi.deleteConstructionSignboard).toHaveBeenCalledWith('sb-1');
      });
    });

    it('確認ダイアログのキャンセルで delete を呼ばない', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('鉄骨工事')).toBeInTheDocument());

      const row = screen.getByText('鉄骨工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '削除' }));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(signboardsApi.deleteConstructionSignboard).not.toHaveBeenCalled();
    });
  });

  describe('初期ロードのエラー処理 (Requirement 8.10)', () => {
    it('ApiError 発生時はそのメッセージをエラー表示する', async () => {
      vi.mocked(signboardsApi.getConstructionSignboards).mockRejectedValue(
        new ApiError(500, 'サーバーエラーが発生しました')
      );

      renderComponent();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('サーバーエラーが発生しました');
    });

    it('ApiError 以外の例外時は既定メッセージをエラー表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new Error('network down'));

      renderComponent();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('看板一覧の取得に失敗しました');
    });
  });

  describe('projectId が無い場合 (Requirement 8.9)', () => {
    it('projectId 未指定時は API を呼ばず「プロジェクトが見つかりません」を表示する', async () => {
      routerState.projectId = undefined;

      renderComponent();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('プロジェクトが見つかりません');
      expect(projectsApi.getProject).not.toHaveBeenCalled();
      expect(signboardsApi.getConstructionSignboards).not.toHaveBeenCalled();
    });
  });

  describe('フォームのキャンセル (Requirement 8.1, 8.6)', () => {
    it('新規登録フォームのキャンセルでフォームを閉じる', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('基礎工事')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
      expect(screen.getByText('工事看板を新規登録')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByText('工事看板を新規登録')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument();
    });

    it('編集フォームのキャンセルでフォームを閉じる', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('鉄骨工事')).toBeInTheDocument());

      const row = screen.getByText('鉄骨工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '編集' }));
      expect(await screen.findByText('工事看板を編集')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByText('工事看板を編集')).not.toBeInTheDocument();
      });
    });
  });

  describe('操作エラー時のトースト通知', () => {
    it('新規登録失敗時に ApiError メッセージをトースト表示する', async () => {
      vi.mocked(signboardsApi.createConstructionSignboard).mockRejectedValue(
        new ApiError(400, '登録に失敗しました')
      );

      renderComponent();
      await waitFor(() => expect(screen.getByText('基礎工事')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '内装工事' } });
      fireEvent.change(screen.getByLabelText(/工事場所/), { target: { value: '港区' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('登録に失敗しました');
      });
    });

    it('更新失敗時（ApiError以外）は既定メッセージをトースト表示する', async () => {
      vi.mocked(signboardsApi.updateConstructionSignboard).mockRejectedValue(new Error('boom'));

      renderComponent();
      await waitFor(() => expect(screen.getByText('鉄骨工事')).toBeInTheDocument());

      const row = screen.getByText('鉄骨工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '編集' }));
      await waitFor(() => {
        expect(screen.getByLabelText(/工事件名/)).toHaveValue('鉄骨工事');
      });
      fireEvent.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('更新中にエラーが発生しました');
      });
    });

    it('削除失敗時（ApiError以外）は既定メッセージをトースト表示する', async () => {
      vi.mocked(signboardsApi.deleteConstructionSignboard).mockRejectedValue(new Error('boom'));

      renderComponent();
      await waitFor(() => expect(screen.getByText('基礎工事')).toBeInTheDocument());

      const row = screen.getByText('基礎工事').closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '削除' }));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('削除中にエラーが発生しました');
      });
    });
  });
});
