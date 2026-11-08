/**
 * @fileoverview VisionConsentDialogコンポーネントのStorybook
 *
 * 外部の AI へページの画像を送る前の確認のダイアログ。
 * 部品は描かれた時点で開いた状態になり、文書の body へ portal で描く。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { VisionConsentDialog } from './VisionConsentDialog';
import { VISION_CONSENT_MESSAGES } from './vision-consent-messages';

const meta = {
  title: 'EstimateRequests/VisionConsentDialog',
  component: VisionConsentDialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '外部の AI（Anthropic 社の Claude）へ画像を送る前に、送って読み取るか端末で読み取るかを選ばせる確認のダイアログ',
      },
      story: {
        // portal と position: fixed で描くため、Docs では iframe の中に出す
        inline: false,
        iframeHeight: 360,
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSend: fn(),
    onReadOnDevice: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof VisionConsentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 開いた状態
 * 送って読み取る・送らずに端末で読み取る・閉じる の3つのボタンを出す
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    // ダイアログは document.body へ portal で描かれる
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: VISION_CONSENT_MESSAGES.TITLE });
    await expect(dialog).toBeVisible();
    // 開いた時のフォーカスの移動は VisionConsentDialog.test.tsx で確かめる
    // （Storybook のストーリーの描画の流れではフォーカスが body へ戻ることがあるため、ここでは見えることだけを確かめる）
    for (const name of [
      VISION_CONSENT_MESSAGES.SEND,
      VISION_CONSENT_MESSAGES.DEVICE,
      VISION_CONSENT_MESSAGES.CLOSE,
    ]) {
      await expect(within(dialog).getByRole('button', { name })).toBeVisible();
    }
  },
};
