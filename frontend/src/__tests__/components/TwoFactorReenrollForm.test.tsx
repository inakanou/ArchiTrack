/**
 * 2FA の再登録（認証アプリの変更）のフォームのテスト（user-authentication タスク47.9）
 *
 * 手順の各段（現在のコード → 新しい QR → 新しいコード → 新しいバックアップコード）の表示と、
 * 各段で送る値・段の切り替えでのフォーカスの移動・失敗の表示を確かめる。
 *
 * Requirements (user-authentication):
 * - 34.11: 2FA 設定画面で現在の TOTP コードによる再登録を行い、新しい秘密鍵とバックアップコードに置き換える
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import TwoFactorReenrollForm from '../../components/TwoFactorReenrollForm';
import type {
  TwoFactorReenrollConfirmResult,
  TwoFactorReenrollStartResult,
} from '../../types/two-factor.types';

const NEW_SECRET = 'KRUGS4ZANFZSAYJAONSWG4TFOQQGW2LZEBTG64RANVQW45LBNQQGK3TUOJ4Q';
const QR_CODE_DATA_URL = 'data:image/png;base64,bmV3LXFy';
const NEW_BACKUP_CODES = ['NEWA1111', 'NEWB2222', 'NEWC3333', 'NEWD4444'];

function startSuccess(): TwoFactorReenrollStartResult {
  return {
    success: true,
    data: { qrCodeDataUrl: QR_CODE_DATA_URL, secretForManualEntry: NEW_SECRET },
  };
}

function confirmSuccess(): TwoFactorReenrollConfirmResult {
  return { success: true, data: { backupCodes: NEW_BACKUP_CODES } };
}

function renderForm(overrides?: {
  onStart?: (code: string) => Promise<TwoFactorReenrollStartResult>;
  onConfirm?: (code: string) => Promise<TwoFactorReenrollConfirmResult>;
}) {
  const onStart = vi.fn(overrides?.onStart ?? (async () => startSuccess()));
  const onConfirm = vi.fn(overrides?.onConfirm ?? (async () => confirmSuccess()));
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  render(
    <TwoFactorReenrollForm
      onStart={onStart}
      onConfirm={onConfirm}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
  return { onStart, onConfirm, onComplete, onCancel };
}

/** 現在のコードを入力して次へ進み、新しい QR の段を待つ */
async function passCurrentCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('現在の認証コード'), '123456');
  await user.click(screen.getByRole('button', { name: '次へ' }));
  await screen.findByRole('heading', { name: '新しい認証アプリでQRコードをスキャン' });
}

/** 新しい QR の段から新しいコードの段へ進む */
async function passQrStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '次へ' }));
  await screen.findByRole('heading', { name: '新しい認証コードを入力' });
}

describe('TwoFactorReenrollForm（認証アプリの変更の手順）', () => {
  describe('段1: 現在のコード', () => {
    it('手順の見出しと 1/4 の段、現在のコードの入力欄を表示し、QR とバックアップコードは表示しない', () => {
      renderForm();

      expect(screen.getByRole('heading', { name: '認証アプリを変更する' })).toBeInTheDocument();
      expect(screen.getByText('ステップ 1/4')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
      expect(screen.getByRole('heading', { name: '現在の認証コードを入力' })).toBeInTheDocument();
      const input = screen.getByLabelText('現在の認証コード');
      expect(input).toHaveAttribute('inputmode', 'numeric');
      expect(input).toHaveAttribute('autocomplete', 'one-time-code');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByTestId('backup-code-item')).not.toBeInTheDocument();
    });

    it('6 桁がそろうまで次へは押せず、数字以外は入力されない', async () => {
      const user = userEvent.setup();
      renderForm();
      const input = screen.getByLabelText('現在の認証コード');

      expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
      await user.type(input, '12ab34');
      expect(input).toHaveValue('1234');
      expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
      await user.type(input, '5678');
      expect(input).toHaveValue('123456');
      expect(screen.getByRole('button', { name: '次へ' })).toBeEnabled();
    });

    it('次へで入力した現在のコードを送る', async () => {
      const user = userEvent.setup();
      const { onStart, onConfirm } = renderForm();

      await passCurrentCodeStep(user);

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith('123456');
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('開始の失敗では段1に留まり、エラーを通知して入力欄に結び付ける', async () => {
      const user = userEvent.setup();
      renderForm({
        onStart: async () => ({ success: false, error: '認証コードが正しくありません' }),
      });

      await user.type(screen.getByLabelText('現在の認証コード'), '000000');
      await user.click(screen.getByRole('button', { name: '次へ' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('認証コードが正しくありません');
      expect(alert).toHaveAttribute('aria-live', 'polite');
      const input = screen.getByLabelText('現在の認証コード');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', alert.id);
      expect(screen.getByText('ステップ 1/4')).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('キャンセルで呼び出し元へ戻す', async () => {
      const user = userEvent.setup();
      const { onCancel, onStart } = renderForm();

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('段2: 新しい QR', () => {
    it('開始の応答の QR コードと手入力用の秘密鍵を表示し、見出しへフォーカスを移す', async () => {
      const user = userEvent.setup();
      renderForm();

      await passCurrentCodeStep(user);

      expect(screen.getByText('ステップ 2/4')).toBeInTheDocument();
      expect(
        screen.getByRole('img', { name: '新しい認証アプリ用の二要素認証QRコード' })
      ).toHaveAttribute('src', QR_CODE_DATA_URL);
      const secret = screen.getByTestId('reenroll-secret-key');
      expect(secret).toHaveTextContent(NEW_SECRET);
      // 長い一続きの秘密鍵は狭い画面で折り返す
      expect(secret.style.overflowWrap).toBe('anywhere');
      expect(
        screen.getByRole('heading', { name: '新しい認証アプリでQRコードをスキャン' })
      ).toHaveFocus();
      expect(screen.queryByLabelText('現在の認証コード')).not.toBeInTheDocument();
    });

    it('次へで新しいコードの段へ進み、この段では何も送らない', async () => {
      const user = userEvent.setup();
      const { onStart, onConfirm } = renderForm();
      await passCurrentCodeStep(user);

      await passQrStep(user);

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('段3: 新しいコード', () => {
    it('3/4 の段と新しいコードの入力欄を表示し、見出しへフォーカスを移す', async () => {
      const user = userEvent.setup();
      renderForm();
      await passCurrentCodeStep(user);

      await passQrStep(user);

      expect(screen.getByText('ステップ 3/4')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '新しい認証コードを入力' })).toHaveFocus();
      expect(screen.getByLabelText('新しい認証アプリの認証コード')).toHaveValue('');
      expect(screen.getByRole('button', { name: '確認' })).toBeDisabled();
    });

    it('確認で入力した新しいコードを送る', async () => {
      const user = userEvent.setup();
      const { onStart, onConfirm } = renderForm();
      await passCurrentCodeStep(user);
      await passQrStep(user);

      await user.type(screen.getByLabelText('新しい認証アプリの認証コード'), '654321');
      await user.click(screen.getByRole('button', { name: '確認' }));

      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('654321'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('戻るで新しい QR の段へ戻り、同じ秘密鍵を表示する', async () => {
      const user = userEvent.setup();
      renderForm();
      await passCurrentCodeStep(user);
      await passQrStep(user);

      await user.click(screen.getByRole('button', { name: '戻る' }));

      expect(screen.getByText('ステップ 2/4')).toBeInTheDocument();
      expect(screen.getByTestId('reenroll-secret-key')).toHaveTextContent(NEW_SECRET);
    });

    it('確認の失敗では段3に留まり、エラーを通知する', async () => {
      const user = userEvent.setup();
      renderForm({
        onConfirm: async () => ({ success: false, error: '新しい認証コードが正しくありません' }),
      });
      await passCurrentCodeStep(user);
      await passQrStep(user);

      await user.type(screen.getByLabelText('新しい認証アプリの認証コード'), '000000');
      await user.click(screen.getByRole('button', { name: '確認' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '新しい認証コードが正しくありません'
      );
      expect(screen.getByText('ステップ 3/4')).toBeInTheDocument();
      expect(screen.getByLabelText('新しい認証アプリの認証コード')).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(screen.queryByTestId('backup-code-item')).not.toBeInTheDocument();
    });

    it('再登録が開始されていない失敗では、理由を示して現在のコードの段からやり直す', async () => {
      const user = userEvent.setup();
      renderForm({
        onConfirm: async () => ({
          success: false,
          error: '認証アプリの変更が開始されていません',
          restart: true,
        }),
      });
      await passCurrentCodeStep(user);
      await passQrStep(user);

      await user.type(screen.getByLabelText('新しい認証アプリの認証コード'), '000000');
      await user.click(screen.getByRole('button', { name: '確認' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '認証アプリの変更が開始されていません'
      );
      expect(screen.getByText('ステップ 1/4')).toBeInTheDocument();
      expect(screen.getByLabelText('現在の認証コード')).toHaveValue('');
      expect(screen.getByRole('heading', { name: '現在の認証コードを入力' })).toHaveFocus();
    });
  });

  describe('段4: 新しいバックアップコード', () => {
    async function reachBackupCodes(user: ReturnType<typeof userEvent.setup>) {
      await passCurrentCodeStep(user);
      await passQrStep(user);
      await user.type(screen.getByLabelText('新しい認証アプリの認証コード'), '654321');
      await user.click(screen.getByRole('button', { name: '確認' }));
      await screen.findByRole('heading', { name: 'バックアップコードを保存' });
    }

    it('確認の応答の新しいバックアップコードを表示し、以前のコードが使えないことを知らせる', async () => {
      const user = userEvent.setup();
      renderForm();

      await reachBackupCodes(user);

      expect(screen.getByText('ステップ 4/4')).toBeInTheDocument();
      expect(screen.getAllByTestId('backup-code-item').map((el) => el.textContent)).toEqual(
        NEW_BACKUP_CODES
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        '以前のバックアップコードは使えなくなりました'
      );
      expect(screen.getByRole('heading', { name: 'バックアップコードを保存' })).toHaveFocus();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('保存の確認の後の完了で呼び出し元へ知らせる', async () => {
      const user = userEvent.setup();
      const { onComplete } = renderForm();
      await reachBackupCodes(user);

      expect(screen.getByRole('button', { name: '完了' })).toBeDisabled();
      await user.click(
        screen.getByRole('checkbox', { name: 'バックアップコードを安全な場所に保存しました' })
      );
      await user.click(screen.getByRole('button', { name: '完了' }));

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
