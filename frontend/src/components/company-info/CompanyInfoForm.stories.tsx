/**
 * @fileoverview CompanyInfoFormコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import CompanyInfoForm from './CompanyInfoForm';

const meta = {
  title: 'CompanyInfo/CompanyInfoForm',
  component: CompanyInfoForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '自社情報の登録・編集フォームコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
    onReset: fn(),
    onDirtyChange: fn(),
  },
} satisfies Meta<typeof CompanyInfoForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 初期状態（データなし）
 */
export const Empty: Story = {
  args: {
    initialData: undefined,
    isSubmitting: false,
  },
};

/**
 * 初期データあり
 */
export const WithInitialData: Story = {
  args: {
    initialData: {
      companyName: '株式会社サンプル',
      address: '東京都千代田区千代田1-1-1',
      representative: '山田 太郎',
      phone: '03-1234-5678',
      fax: '03-1234-5679',
      email: 'info@sample.co.jp',
      invoiceRegistrationNumber: 'T1234567890123',
      version: 1,
    },
    isSubmitting: false,
  },
};

/**
 * 送信中
 */
export const Submitting: Story = {
  args: {
    initialData: {
      companyName: '株式会社サンプル',
      address: '東京都千代田区千代田1-1-1',
      representative: '山田 太郎',
      phone: '03-1234-5678',
      fax: '03-1234-5679',
      email: 'info@sample.co.jp',
      invoiceRegistrationNumber: 'T1234567890123',
      version: 1,
    },
    isSubmitting: true,
  },
};
