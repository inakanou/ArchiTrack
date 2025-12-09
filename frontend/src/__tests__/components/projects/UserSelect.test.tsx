/**
 * @fileoverview UserSelectコンポーネントのユニットテスト
 *
 * Task 6.2: UserSelectコンポーネントの実装
 *
 * Requirements:
 * - 17.1: 営業担当者フィールドにドロップダウン選択UIを提供する
 * - 17.2: 工事担当者フィールドにドロップダウン選択UIを提供する
 * - 17.3: 営業担当者ドロップダウンでadmin以外の有効なユーザー一覧を候補として表示する
 * - 17.4: 工事担当者ドロップダウンでadmin以外の有効なユーザー一覧を候補として表示する
 * - 17.5: 各ユーザー候補にユーザーの表示名を表示する
 * - 17.6: 営業担当者フィールドのデフォルト選択値としてログインユーザーを設定する
 * - 17.7: 工事担当者フィールドのデフォルト選択値としてログインユーザーを設定する
 * - 17.8: ドロップダウンから担当者を選択したらユーザーIDをフォームに設定する
 * - 17.10: 担当者候補を取得中にローディングインジケータを表示する
 * - 17.11: 有効なユーザーが存在しない場合に「選択可能なユーザーがありません」というメッセージを表示する
 * - 20.2: アクセシビリティ属性を設定
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserSelect from '../../../components/projects/UserSelect';
import type { AssignableUser } from '../../../types/project.types';

// APIクライアントのモック
vi.mock('../../../api/projects', () => ({
  getAssignableUsers: vi.fn(),
}));

// apiClientのモック（トークンを返すように設定）
vi.mock('../../../api/client', () => ({
  apiClient: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
  },
}));

// useAuthのモック
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: 'current-user-id',
      displayName: 'Current User',
      email: 'current@example.com',
    },
    isAuthenticated: true,
    isInitialized: true,
  })),
}));

import { getAssignableUsers } from '../../../api/projects';

const mockUsers: AssignableUser[] = [
  { id: 'user-1', displayName: 'User One' },
  { id: 'user-2', displayName: 'User Two' },
  { id: 'user-3', displayName: 'User Three' },
  { id: 'current-user-id', displayName: 'Current User' },
];

describe('UserSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトでユーザー一覧を返す
    vi.mocked(getAssignableUsers).mockResolvedValue(mockUsers);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('基本レンダリング', () => {
    it('ラベルとドロップダウンが表示される', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // ラベルが表示される
      expect(screen.getByText('営業担当者')).toBeInTheDocument();

      // セレクトボックスが表示される
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
    });

    it('required=trueの場合、必須マーカーが表示される', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" required />);

      // 必須マーカー（*）が表示される
      expect(screen.getByText('*')).toBeInTheDocument();

      // ローディング完了を待つ（警告回避）
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });
    });

    it('カスタムラベルが使用される', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="工事担当者" />);

      expect(screen.getByText('工事担当者')).toBeInTheDocument();

      // ローディング完了を待つ（警告回避）
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態 (17.10)', () => {
    it('ユーザー候補取得中はローディングインジケータを表示する', async () => {
      // 遅延させる
      vi.mocked(getAssignableUsers).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockUsers), 1000))
      );

      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // ローディング中のテキストまたはインジケータが表示される
      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });
  });

  describe('ユーザー候補表示 (17.3, 17.4, 17.5)', () => {
    it('admin以外の有効なユーザー一覧を候補として表示する', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // セレクトボックスを開く
      const select = screen.getByRole('combobox');
      fireEvent.click(select);

      // 各ユーザーの表示名が表示される
      expect(screen.getByText('User One')).toBeInTheDocument();
      expect(screen.getByText('User Two')).toBeInTheDocument();
      expect(screen.getByText('User Three')).toBeInTheDocument();
    });
  });

  describe('空候補時メッセージ (17.11)', () => {
    it('有効なユーザーが存在しない場合、メッセージを表示する', async () => {
      vi.mocked(getAssignableUsers).mockResolvedValue([]);

      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // メッセージが表示される
      expect(screen.getByText('選択可能なユーザーがありません')).toBeInTheDocument();
    });
  });

  describe('デフォルト選択 (17.6, 17.7)', () => {
    it('defaultToCurrentUser=trueかつvalueが空の場合、ログインユーザーをデフォルト選択する', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" defaultToCurrentUser />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // ログインユーザーがデフォルトで選択されるためonChangeが呼ばれる
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith('current-user-id');
      });
    });

    it('defaultToCurrentUser=falseの場合、デフォルト選択しない', async () => {
      const onChange = vi.fn();
      render(
        <UserSelect value="" onChange={onChange} label="営業担当者" defaultToCurrentUser={false} />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // onChangeが呼ばれない（デフォルト選択なし）
      expect(onChange).not.toHaveBeenCalled();
    });

    it('既に値が設定されている場合、デフォルト選択を上書きしない', async () => {
      const onChange = vi.fn();
      render(
        <UserSelect value="user-1" onChange={onChange} label="営業担当者" defaultToCurrentUser />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // 既存値があるためonChangeは呼ばれない
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('ユーザー選択 (17.8)', () => {
    it('ドロップダウンから担当者を選択するとonChangeにユーザーIDが渡される', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // セレクトボックスを選択
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'user-2');

      // onChangeがユーザーIDで呼ばれる
      expect(onChange).toHaveBeenCalledWith('user-2');
    });
  });

  describe('無効化状態', () => {
    it('disabled=trueの場合、セレクトボックスが無効化される', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" disabled />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });
  });

  describe('エラー表示', () => {
    it('error propが設定されている場合、エラーメッセージを表示する', async () => {
      const onChange = vi.fn();
      render(
        <UserSelect value="" onChange={onChange} label="営業担当者" error="営業担当者は必須です" />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // エラーメッセージが表示される
      expect(screen.getByText('営業担当者は必須です')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ (20.2)', () => {
    it('aria-label属性が設定されている', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-label', '営業担当者');
    });

    it('required=trueの場合、aria-required属性が設定されている', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" required />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-required', 'true');
    });

    it('エラー時はaria-invalid属性が設定されている', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" error="エラー" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-invalid', 'true');
    });

    it('エラーメッセージはaria-describedbyで関連付けられている', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" error="エラー" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      const describedBy = select.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      const errorElement = document.getElementById(describedBy!);
      expect(errorElement).toHaveTextContent('エラー');
    });
  });

  describe('API呼び出し', () => {
    it('マウント時にgetAssignableUsersが呼ばれる', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      await waitFor(() => {
        expect(getAssignableUsers).toHaveBeenCalledTimes(1);
      });
    });

    it('API呼び出しが失敗した場合、エラーを表示する', async () => {
      vi.mocked(getAssignableUsers).mockRejectedValue(new Error('Network error'));

      const onChange = vi.fn();
      render(<UserSelect value="" onChange={onChange} label="営業担当者" />);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/ユーザー一覧の取得に失敗しました/)).toBeInTheDocument();
      });
    });
  });

  describe('プレースホルダー', () => {
    it('プレースホルダーテキストが表示される', async () => {
      const onChange = vi.fn();
      render(
        <UserSelect value="" onChange={onChange} label="営業担当者" placeholder="担当者を選択" />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // プレースホルダーオプションが存在する
      expect(screen.getByText('担当者を選択')).toBeInTheDocument();
    });
  });

  describe('選択値の表示', () => {
    it('値が設定されている場合、対応するユーザー名が表示される', async () => {
      const onChange = vi.fn();
      render(<UserSelect value="user-2" onChange={onChange} label="営業担当者" />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
      });

      // セレクトの値がuser-2
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('user-2');
    });
  });
});
