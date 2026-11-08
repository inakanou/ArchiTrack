/**
 * @fileoverview VendorNameInputコンポーネントのStorybook
 *
 * 受領見積書の業者名の入力（自由入力と協力業者の候補）。
 * 候補の検索（searchTradingPartners）は利用者が文字を打ったときだけ走るため、
 * 候補を出すストーリーだけ fetch をモックし、実際のバックエンドへは送らない。
 */

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  VENDOR_NAME_REQUIRED_MESSAGE,
  VendorNameInput,
  type VendorNameInputProps,
  type VendorNameValue,
} from './VendorNameInput';
import type { TradingPartnerSearchResult } from '../../types/trading-partner.types';

/** 候補の検索の応答（協力業者） */
const mockSubcontractors: TradingPartnerSearchResult[] = [
  {
    id: 'tp-sub-1',
    name: '株式会社サンプル工業',
    nameKana: 'サンプルコウギョウ',
    types: ['SUBCONTRACTOR'],
  },
  {
    id: 'tp-sub-2',
    name: 'サンプル設備有限会社',
    nameKana: 'サンプルセツビ',
    types: ['SUBCONTRACTOR'],
  },
];

/**
 * 取引先の検索（/api/trading-partners/search）だけを返す fetch のモックを入れ、
 * 戻す関数を返す。ほかの要求は元の fetch へ渡す
 */
function installTradingPartnerSearchMock(): () => void {
  const originalFetch = window.fetch;
  const mockFetch = fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/trading-partners/search')) {
      return new Response(JSON.stringify(mockSubcontractors), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  });
  window.fetch = mockFetch;
  return () => {
    window.fetch = originalFetch;
  };
}

/**
 * 値を内部の状態で持ち、入力を反映させるラッパー（部品は制御された部品のため）
 */
function StatefulVendorNameInput(props: VendorNameInputProps) {
  const { value: initialValue, onChange } = props;
  const [value, setValue] = useState<VendorNameValue>(initialValue);
  return (
    <VendorNameInput
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const meta = {
  title: 'EstimateRequests/VendorNameInput',
  component: VendorNameInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '受領見積書の業者名の入力。自由に入力でき、登録済みの協力業者を候補に出す。候補を選ぶと取引先に紐づける',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: '400px', minHeight: '220px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    value: { vendorName: '', tradingPartnerId: null },
    onChange: fn(),
    onBlur: fn(),
  },
  render: (args) => <StatefulVendorNameInput {...args} />,
} satisfies Meta<typeof VendorNameInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 空の状態
 */
export const Empty: Story = {
  args: {
    placeholder: '業者名を入力してください',
  },
};

/**
 * 必須（案件の文脈の登録・編集）
 */
export const Required: Story = {
  args: {
    required: true,
    placeholder: '業者名を入力してください',
  },
};

/**
 * 文字を入力した状態（取引先に紐づけていない自由入力）
 */
export const WithTypedText: Story = {
  args: {
    value: { vendorName: '株式会社未登録工務店', tradingPartnerId: null },
  },
};

/**
 * 登録済みの協力業者に紐づけた状態
 */
export const LinkedPartner: Story = {
  args: {
    value: { vendorName: '株式会社サンプル工業', tradingPartnerId: 'tp-sub-1' },
  },
};

/**
 * 必須の誤り（外から渡した誤り）
 */
export const RequiredError: Story = {
  args: {
    required: true,
    error: VENDOR_NAME_REQUIRED_MESSAGE,
  },
};

/**
 * 必須の誤り（空のまま入力から離れた）
 */
export const RequiredErrorOnBlur: Story = {
  args: {
    required: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: '業者名' });
    await userEvent.click(input);
    await userEvent.tab();
    await expect(await canvas.findByRole('alert')).toHaveTextContent(VENDOR_NAME_REQUIRED_MESSAGE);
  },
};

/**
 * 協力業者の候補を表示した状態（検索の応答はモック）
 */
export const WithSuggestions: Story = {
  beforeEach: () => installTradingPartnerSearchMock(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: '業者名' });
    await userEvent.type(input, 'サンプル');
    const listbox = await canvas.findByRole(
      'listbox',
      { name: '協力業者の候補' },
      { timeout: 3000 }
    );
    await expect(within(listbox).getAllByRole('option')).toHaveLength(mockSubcontractors.length);
  },
};

/**
 * 無効化
 */
export const Disabled: Story = {
  args: {
    value: { vendorName: '株式会社サンプル工業', tradingPartnerId: 'tp-sub-1' },
    disabled: true,
  },
};
