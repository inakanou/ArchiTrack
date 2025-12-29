import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SiteSurveyForm from './SiteSurveyForm';

/**
 * SiteSurveyForm コンポーネントのストーリー
 *
 * 現場調査の作成・編集フォーム。
 * 調査名、調査日、メモを入力し、バリデーションを行う。
 */
const meta = {
  title: 'SiteSurveys/SiteSurveyForm',
  component: SiteSurveyForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
  },
} satisfies Meta<typeof SiteSurveyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 作成モード - デフォルト
 * 新規作成時の初期状態
 */
export const CreateDefault: Story = {
  args: {
    mode: 'create',
    isSubmitting: false,
  },
};

/**
 * 編集モード - データあり
 * 既存データを編集する場合
 */
export const EditWithData: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '第1回現場調査',
      surveyDate: '2025-12-15',
      memo: '建物外観の初回調査。損傷箇所の確認を行う。',
    },
    isSubmitting: false,
  },
};

/**
 * 編集モード - メモなし
 * メモが未設定のデータを編集
 */
export const EditWithoutMemo: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '外観調査',
      surveyDate: '2025-12-10',
      memo: null,
    },
    isSubmitting: false,
  },
};

/**
 * 送信中
 * フォーム送信処理中のローディング状態
 */
export const Submitting: Story = {
  args: {
    mode: 'create',
    isSubmitting: true,
  },
};

/**
 * 編集モード - 送信中
 * 編集データの保存中
 */
export const EditSubmitting: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '第1回現場調査',
      surveyDate: '2025-12-15',
      memo: '建物外観の初回調査。',
    },
    isSubmitting: true,
  },
};

/**
 * 長いメモ付き
 * メモが長い場合の表示確認
 */
export const WithLongMemo: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '建物詳細調査',
      surveyDate: '2025-12-20',
      memo: '建物外観と内装の詳細調査を実施しました。北側立面には経年劣化による塗装の剥がれが見られ、詳細な記録を残しています。また、内装については2階廊下の床材に一部損傷が確認されました。次回調査時にはこれらの箇所の経過観察を行う予定です。電気設備については全て正常に動作することを確認しました。給排水設備についても漏水等の問題は見られませんでした。',
    },
    isSubmitting: false,
  },
};

/**
 * 空の初期データ
 * 初期データが空オブジェクトの場合
 */
export const EmptyInitialData: Story = {
  args: {
    mode: 'create',
    initialData: {},
    isSubmitting: false,
  },
};

/**
 * 過去の日付
 * 調査日が過去の日付
 */
export const PastDate: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '過去の調査',
      surveyDate: '2024-06-15',
      memo: '過去に実施した調査の記録',
    },
    isSubmitting: false,
  },
};

/**
 * 長い調査名
 * 調査名が長い場合の表示確認
 */
export const LongSurveyName: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '2025年12月実施 建物外観および内装詳細調査 第1回中間報告用現場調査データ収集',
      surveyDate: '2025-12-28',
      memo: '詳細調査',
    },
    isSubmitting: false,
  },
};
