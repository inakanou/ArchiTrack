/**
 * @fileoverview LedgerInfoSectionコンポーネントのStorybook
 *
 * 受領見積書の台帳の情報の欄。既定で折りたたみ、見出しのボタンで開く。
 * 開いた状態は play で見出しを押して示す（開閉は部品の内部の状態のため）。
 */

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LedgerInfoSection, type LedgerInfoSectionProps } from './LedgerInfoSection';
import {
  LEDGER_INFO_VALIDATION_MESSAGES,
  createLedgerInfoFormData,
  type LedgerInfoFormData,
} from './ledger-info-form';

/** 値を入れた欄 */
const filledValue: LedgerInfoFormData = {
  quoteNumber: 'Q-2025-0123',
  overallConditions: '諸経費込み。夜間作業は別途。',
  siteLocation: '東京都千代田区',
  constructionKind: 'RENOVATION',
  useType: '事務所',
  constructionPrice: '12500000',
  workConditions: '休日作業あり',
  distanceKm: '12.5',
  adoption: 'ADOPTED',
  confirmedAmount: '11800000',
  readingStatus: 'UNCONFIRMED',
  quoteDiscriminator: '本見積',
};

/**
 * 値を内部の状態で持ち、入力を反映させるラッパー（部品は制御された部品のため）
 */
function StatefulLedgerInfoSection(props: LedgerInfoSectionProps) {
  const { value: initialValue, onChange } = props;
  const [value, setValue] = useState<LedgerInfoFormData>(initialValue);
  return (
    <LedgerInfoSection
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

/** 見出しのボタンを押して欄を開く */
const expandSection: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const header = canvas.getByRole('button', { name: '台帳の情報' });
  await userEvent.click(header);
  await expect(header).toHaveAttribute('aria-expanded', 'true');
};

const meta = {
  title: 'EstimateRequests/LedgerInfoSection',
  component: LedgerInfoSection,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '受領見積書の台帳の情報（見積番号・見積全体の条件・案件の条件・採否・確定金額・読取の確認・見積の区別）の欄。既定で折りたたむ',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '800px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    value: createLedgerInfoFormData(),
    onChange: fn(),
  },
  render: (args) => <StatefulLedgerInfoSection {...args} />,
} satisfies Meta<typeof LedgerInfoSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 既定（折りたたみ）
 */
export const Collapsed: Story = {};

/**
 * 開いた状態（空の値）
 */
export const ExpandedEmpty: Story = {
  play: expandSection,
};

/**
 * 開いた状態（値あり）
 */
export const ExpandedWithValues: Story = {
  args: {
    value: filledValue,
  },
  play: expandSection,
};

/**
 * 読取の確認が確認済み（確認者と確認日時を表示）
 */
export const ConfirmedReading: Story = {
  args: {
    value: { ...filledValue, readingStatus: 'CONFIRMED' },
    readingConfirmedAt: new Date('2025-01-20T10:30:00+09:00'),
    readingConfirmedByName: '山田 太郎',
  },
  play: async (context) => {
    await expandSection(context);
    const confirmation = within(context.canvasElement).getByTestId('ledger-reading-confirmation');
    await expect(confirmation).toHaveTextContent('確認者: 山田 太郎');
  },
};

/**
 * 読取を確認済みに変えたが未保存（保存すると確認者と日時を記録する旨を表示）
 */
export const ConfirmedReadingNotSaved: Story = {
  args: {
    value: { ...filledValue, readingStatus: 'CONFIRMED' },
  },
  play: expandSection,
};

/**
 * 入力の誤り（部品の検証）
 * 数の欄に数でない文字・前後の空白を含む見積の区別を入れた状態
 */
export const WithValidationErrors: Story = {
  args: {
    value: {
      ...filledValue,
      constructionPrice: '12,500,000',
      distanceKm: '12.55',
      confirmedAmount: '-100',
      quoteDiscriminator: ' 本見積 ',
    },
  },
  play: expandSection,
};

/**
 * 外から渡した誤り（サーバーの検証の誤り）
 */
export const WithExternalErrors: Story = {
  args: {
    value: filledValue,
    errors: {
      quoteNumber: LEDGER_INFO_VALIDATION_MESSAGES.QUOTE_NUMBER_TOO_LONG,
      siteLocation: LEDGER_INFO_VALIDATION_MESSAGES.SITE_LOCATION_TOO_LONG,
    },
  },
  play: expandSection,
};

/**
 * 無効化（開閉は操作できる）
 */
export const Disabled: Story = {
  args: {
    value: filledValue,
    disabled: true,
  },
  play: expandSection,
};
