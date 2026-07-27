/**
 * @fileoverview 工事看板フォームコンポーネントテスト
 *
 * Task 6.5: 看板マスタ管理画面（SignboardForm）
 *
 * Requirements:
 * - 8.2: 標準項目（工事件名・工事場所）の入力
 * - 8.3: 自由項目行（ラベル+値）の動的追加/削除
 * - 8.4: 下部固定テキスト（記入欄、複数行）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignboardForm } from './SignboardForm';
import type { ConstructionSignboard } from '../../types/construction-photo.types';

const existing: ConstructionSignboard = {
  id: 'sb-1',
  projectId: 'project-123',
  workName: '基礎工事',
  workLocation: '東京都渋谷区',
  freeItems: [{ label: '天候', value: '晴' }],
  footerText: '状況\n摘要',
  inUseCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('SignboardForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('標準項目 (Requirement 8.2)', () => {
    it('工事件名・工事場所・記入欄テキストの入力欄を表示する', () => {
      render(<SignboardForm onSubmit={vi.fn()} onCancel={vi.fn()} submitLabel="登録" />);

      expect(screen.getByLabelText(/工事件名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/工事場所/)).toBeInTheDocument();
      expect(screen.getByLabelText(/記入欄テキスト/)).toBeInTheDocument();
    });

    it('工事件名が空の場合は onSubmit を呼ばずエラーを表示する', async () => {
      const onSubmit = vi.fn();
      render(<SignboardForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="登録" />);

      fireEvent.change(screen.getByLabelText(/工事場所/), { target: { value: '渋谷区' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(screen.getByText(/工事件名は必須です/)).toBeInTheDocument();
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('工事場所が空の場合は onSubmit を呼ばずエラーを表示する', async () => {
      const onSubmit = vi.fn();
      render(<SignboardForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="登録" />);

      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '基礎工事' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(screen.getByText(/工事場所は必須です/)).toBeInTheDocument();
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('自由項目行 (Requirement 8.3)', () => {
    it('自由項目を追加して入力し、削除できる', async () => {
      render(<SignboardForm onSubmit={vi.fn()} onCancel={vi.fn()} submitLabel="登録" />);

      // 初期状態では自由項目入力欄なし
      expect(screen.queryByLabelText(/自由項目ラベル1/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '自由項目を追加' }));
      expect(screen.getByLabelText('自由項目ラベル1')).toBeInTheDocument();
      expect(screen.getByLabelText('自由項目値1')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '自由項目1を削除' }));
      expect(screen.queryByLabelText('自由項目ラベル1')).not.toBeInTheDocument();
    });

    it('値ありでラベルが空の自由項目行はエラーを表示する', async () => {
      const onSubmit = vi.fn();
      render(<SignboardForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="登録" />);

      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '基礎工事' } });
      fireEvent.change(screen.getByLabelText(/工事場所/), { target: { value: '渋谷区' } });
      fireEvent.click(screen.getByRole('button', { name: '自由項目を追加' }));
      fireEvent.change(screen.getByLabelText('自由項目値1'), { target: { value: '晴' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(screen.getByText(/自由項目のラベルは必須です/)).toBeInTheDocument();
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('送信 (Requirement 8.2, 8.3, 8.4)', () => {
    it('標準項目+自由項目+固定テキストで onSubmit を呼ぶ', async () => {
      const onSubmit = vi.fn();
      render(<SignboardForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="登録" />);

      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '基礎工事' } });
      fireEvent.change(screen.getByLabelText(/工事場所/), { target: { value: '渋谷区' } });
      fireEvent.click(screen.getByRole('button', { name: '自由項目を追加' }));
      fireEvent.change(screen.getByLabelText('自由項目ラベル1'), { target: { value: '天候' } });
      fireEvent.change(screen.getByLabelText('自由項目値1'), { target: { value: '晴' } });
      fireEvent.change(screen.getByLabelText(/記入欄テキスト/), {
        target: { value: '状況\n摘要' },
      });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          workName: '基礎工事',
          workLocation: '渋谷区',
          freeItems: [{ label: '天候', value: '晴' }],
          footerText: '状況\n摘要',
        });
      });
    });

    it('自由項目・固定テキスト未入力時は freeItems=[]・footerText=null で送信する', async () => {
      const onSubmit = vi.fn();
      render(<SignboardForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="登録" />);

      fireEvent.change(screen.getByLabelText(/工事件名/), { target: { value: '基礎工事' } });
      fireEvent.change(screen.getByLabelText(/工事場所/), { target: { value: '渋谷区' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          workName: '基礎工事',
          workLocation: '渋谷区',
          freeItems: [],
          footerText: null,
        });
      });
    });
  });

  describe('初期値ロード（編集）', () => {
    it('initialValue の既存値をフォームにロードする', () => {
      render(
        <SignboardForm
          initialValue={existing}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          submitLabel="更新"
        />
      );

      expect(screen.getByLabelText(/工事件名/)).toHaveValue('基礎工事');
      expect(screen.getByLabelText(/工事場所/)).toHaveValue('東京都渋谷区');
      expect(screen.getByLabelText('自由項目ラベル1')).toHaveValue('天候');
      expect(screen.getByLabelText('自由項目値1')).toHaveValue('晴');
      expect(screen.getByLabelText(/記入欄テキスト/)).toHaveValue('状況\n摘要');
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンで onCancel を呼ぶ', () => {
      const onCancel = vi.fn();
      render(<SignboardForm onSubmit={vi.fn()} onCancel={onCancel} submitLabel="登録" />);

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
