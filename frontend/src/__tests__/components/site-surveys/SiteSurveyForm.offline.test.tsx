/**
 * @fileoverview 現場調査フォームの通信断時の挙動テスト
 *
 * Task 115.105
 *
 * Requirements:
 * - 15.6: ネットワーク接続が切断される場合は警告を表示し保存操作をブロックする
 *
 * design.md「ネットワーク状態管理フロー」の Key Decisions に従い、
 * 抑止の対象はサーバー保存（現場調査の作成・更新）である。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteSurveyForm from '../../../components/site-surveys/SiteSurveyForm';
import type { SiteSurveyFormData } from '../../../components/site-surveys/SiteSurveyForm';

/** onSubmit のモック型（フォームの契約に合わせる） */
type SubmitMock = (data: SiteSurveyFormData) => Promise<void>;

/** navigator.onLine を差し替える（jsdom の既定は true） */
function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

function goOffline(): void {
  setNavigatorOnLine(false);
  fireEvent(window, new Event('offline'));
}

function goOnline(): void {
  setNavigatorOnLine(true);
  fireEvent(window, new Event('online'));
}

describe('SiteSurveyForm - 通信断時の警告と保存抑止 (Req 15.6)', () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    setNavigatorOnLine(true);
  });

  function renderForm(onSubmit: SubmitMock) {
    return render(
      <SiteSurveyForm
        mode="edit"
        initialData={{ name: '既存の調査', surveyDate: '2025-01-15', memo: null }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        isSubmitting={false}
      />
    );
  }

  it('通信が切れると警告を表示し、保存ボタンへ抑止を示す', async () => {
    const onSubmit = vi.fn<SubmitMock>().mockResolvedValue(undefined);
    renderForm(onSubmit);

    // 既定（オンライン）では警告は無く、保存は抑止されていない
    expect(screen.queryByTestId('offline-warning')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute('aria-disabled', 'false');

    goOffline();

    const warning = await screen.findByTestId('offline-warning');
    expect(warning).toHaveTextContent('ネットワーク接続がありません');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('通信が切れている間は保存を実行せず、理由を提示する', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitMock>().mockResolvedValue(undefined);
    renderForm(onSubmit);

    goOffline();
    await screen.findByTestId('offline-warning');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByTestId('site-survey-form-save-blocked')).toHaveTextContent(
      'ネットワーク接続がありません。保存操作は接続復帰後に行えます。'
    );
  });

  it('通信が復帰すると保存が実行できる', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitMock>().mockResolvedValue(undefined);
    renderForm(onSubmit);

    goOffline();
    await screen.findByTestId('offline-warning');

    goOnline();
    await waitFor(() => {
      expect(screen.queryByTestId('offline-warning')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
