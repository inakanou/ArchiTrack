import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// fetchをモック
globalThis.fetch = vi.fn() as Mock;

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期表示時に"ArchiTrack"タイトルが表示される', () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ message: 'test', version: '1.0.0' }),
    } as Response);

    render(<App />);

    expect(screen.getByRole('heading', { name: /ArchiTrack/i })).toBeInTheDocument();
    expect(screen.getByText(/建築プロジェクト管理システム/i)).toBeInTheDocument();
  });

  it('API接続成功時にconnectedステータスを表示する', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ message: 'ArchiTrack API', version: '1.0.0' }),
    } as Response);

    render(<App />);

    // 初期状態のチェック
    expect(screen.getByText(/checking.../i)).toBeInTheDocument();

    // API接続後の状態をチェック
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/バージョン: 1.0.0/i)).toBeInTheDocument();
    expect(screen.getByText(/メッセージ: ArchiTrack API/i)).toBeInTheDocument();
  });

  it('API接続失敗時にdisconnectedステータスを表示する', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(<App />);

    // 初期状態のチェック
    expect(screen.getByText(/checking.../i)).toBeInTheDocument();

    // API接続失敗後の状態をチェック
    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });

    // エラー時はAPI情報が表示されない
    expect(screen.queryByText(/バージョン:/i)).not.toBeInTheDocument();
  });

  it('正しいAPIエンドポイントにリクエストを送信する', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ message: 'test', version: '1.0.0' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3000/api');
    });
  });
});
