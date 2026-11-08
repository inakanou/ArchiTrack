/**
 * @fileoverview VisionConsentDialog の単体テスト（estimate-request のタスク119.1）
 *
 * 外部の AI へ送る前の確認の画面が、告知と二つの選択と閉じる操作を持ち、
 * モーダルのダイアログとしてフォーカスを扱うことを確かめる（受入基準 49.1・49.2・49.3）。
 * 文言は本番の定数（vision-consent-messages.ts）から読む。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { VisionConsentDialog } from './VisionConsentDialog';
import { VISION_CONSENT_MESSAGES } from './vision-consent-messages';

function renderDialog() {
  const onSend = vi.fn();
  const onReadOnDevice = vi.fn();
  const onClose = vi.fn();
  render(<VisionConsentDialog onSend={onSend} onReadOnDevice={onReadOnDevice} onClose={onClose} />);
  return { onSend, onReadOnDevice, onClose };
}

describe('VisionConsentDialog', () => {
  it('名前つきのモーダルのダイアログとして、外部のサービスへ画像を送ることの告知を出す', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: VISION_CONSENT_MESSAGES.TITLE });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(VISION_CONSENT_MESSAGES.NOTICE);
    // 告知は送り先（Anthropic 社の Claude）とページの画像を送ることを名指す
    expect(VISION_CONSENT_MESSAGES.NOTICE).toContain(
      'ページの画像を外部のAIサービス（Anthropic社のClaude）へ送って読み取'
    );
  });

  it('送る・端末で読む・閉じるの三つのボタンを持つ', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    const names = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent);
    expect(names).toEqual([
      VISION_CONSENT_MESSAGES.SEND,
      VISION_CONSENT_MESSAGES.DEVICE,
      VISION_CONSENT_MESSAGES.CLOSE,
    ]);
  });

  it('送るボタンは onSend だけを呼ぶ', async () => {
    const user = userEvent.setup();
    const { onSend, onReadOnDevice, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.SEND }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onReadOnDevice).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('端末で読むボタンは onReadOnDevice だけを呼ぶ', async () => {
    const user = userEvent.setup();
    const { onSend, onReadOnDevice, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.DEVICE }));

    expect(onReadOnDevice).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('閉じるボタンと Escape は onClose だけを呼び、送りも端末の読み取りも選ばない', async () => {
    const user = userEvent.setup();
    const { onSend, onReadOnDevice, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.CLOSE }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);

    expect(onSend).not.toHaveBeenCalled();
    expect(onReadOnDevice).not.toHaveBeenCalled();
  });

  it('Escape は外側の要素の keydown へ伝わらない（外側のダイアログを閉じない）', async () => {
    const user = userEvent.setup();
    const outerKeyDown = vi.fn();
    const onClose = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <VisionConsentDialog onSend={vi.fn()} onReadOnDevice={vi.fn()} onClose={onClose} />
      </div>
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outerKeyDown).not.toHaveBeenCalled();
  });

  it('開くと送らない側（端末で読む）のボタンへフォーカスを移す', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.DEVICE })).toHaveFocus();
  });

  it('Tab と Shift+Tab のフォーカスはダイアログの中を巡回する', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">外側のボタン</button>
        <VisionConsentDialog onSend={vi.fn()} onReadOnDevice={vi.fn()} onClose={vi.fn()} />
      </>
    );
    const send = screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.SEND });
    const device = screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.DEVICE });
    const close = screen.getByRole('button', { name: VISION_CONSENT_MESSAGES.CLOSE });

    expect(device).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(send).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(device).toHaveFocus();
  });

  it('閉じると開く前にフォーカスのあった要素へフォーカスを戻す', async () => {
    const user = userEvent.setup();

    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            開く
          </button>
          {open && (
            <VisionConsentDialog
              onSend={vi.fn()}
              onReadOnDevice={vi.fn()}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    render(<Host />);

    const opener = screen.getByRole('button', { name: '開く' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(opener).not.toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
