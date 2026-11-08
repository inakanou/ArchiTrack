/**
 * @fileoverview 外部の AI へ画像を送る前の確認（estimate-request のタスク119.1）
 *
 * 受領見積書の OCR を始めるとき、外部の AI での読み取りが使える（状態が available）場合にだけ
 * `OcrDataExtractor` が出す。ページの画像を外部の AI サービス（Anthropic 社の Claude）へ送ることを告げ、
 * 「送って読み取る」と「送らずに端末で読み取る」を選ばせる。閉じる（ボタンか Escape）と、どちらも選ばない。
 *
 * モーダルのダイアログとして、開くと送らない側のボタンへフォーカスを移し、Tab をダイアログの中で巡回させ、
 * 閉じると開く前の要素へフォーカスを戻す。OCR の区画が折りたたまれて隠れていても見えるように、
 * 文書の body へ portal で描く。Escape は外側の要素（受領見積書のフォームのダイアログなど）へ伝えない。
 *
 * 根拠: design の「Requirements 43-50」の章の D7（24.2, 49.1, 49.2, 49.3）
 */

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { VISION_CONSENT_MESSAGES } from './vision-consent-messages';

export interface VisionConsentDialogProps {
  /** 「送って読み取る」を選んだ */
  onSend: () => void;
  /** 「送らずに端末で読み取る」を選んだ */
  onReadOnDevice: () => void;
  /** どちらも選ばずに閉じた（閉じるボタン・Escape） */
  onClose: () => void;
}

const TITLE_ID = 'vision-consent-dialog-title';
const NOTICE_ID = 'vision-consent-dialog-notice';

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // 受領見積書のフォームのダイアログ（1000）とその中の確認（2000）より前、再認証の画面より後ろに出す
    zIndex: 2100,
    padding: '16px',
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  },
  title: {
    margin: '0 0 12px',
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
  },
  notice: {
    margin: '0 0 20px',
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#374151',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end',
    gap: '8px',
  },
  primaryButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
    backgroundColor: '#ffffff',
    border: '1px solid #9ca3af',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};

/**
 * 外部の AI へ画像を送る前の確認のダイアログ
 */
export function VisionConsentDialog({ onSend, onReadOnDevice, onClose }: VisionConsentDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const deviceButtonRef = useRef<HTMLButtonElement>(null);

  // 開いたら送らない側のボタンへフォーカスを移し、閉じたら開く前の要素へ戻す
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    deviceButtonRef.current?.focus();
    return () => {
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const buttons = Array.from(
      dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    );
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div style={styles.overlay} data-testid="vision-consent-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={NOTICE_ID}
        style={styles.content}
        onKeyDown={handleKeyDown}
        data-testid="vision-consent-dialog"
      >
        <h2 id={TITLE_ID} style={styles.title}>
          {VISION_CONSENT_MESSAGES.TITLE}
        </h2>
        <p id={NOTICE_ID} style={styles.notice}>
          {VISION_CONSENT_MESSAGES.NOTICE}
        </p>
        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={onSend}>
            {VISION_CONSENT_MESSAGES.SEND}
          </button>
          <button
            type="button"
            ref={deviceButtonRef}
            style={styles.secondaryButton}
            onClick={onReadOnDevice}
          >
            {VISION_CONSENT_MESSAGES.DEVICE}
          </button>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            {VISION_CONSENT_MESSAGES.CLOSE}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default VisionConsentDialog;
