import type { Meta, StoryObj } from '@storybook/react';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import type { PasswordStrengthResult, PasswordRequirements } from '../types/auth.types';

/**
 * PasswordStrengthIndicator コンポーネントのストーリー
 *
 * パスワード強度を視覚的に表示するインジケーター。
 * 強度レベル、スコア、要件チェックリストを表示します。
 */
const meta = {
  title: 'Components/PasswordStrengthIndicator',
  component: PasswordStrengthIndicator,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PasswordStrengthIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 弱いパスワード
 * 最小要件を満たさないパスワード
 */
export const Weak: Story = {
  args: {
    result: {
      strength: 'weak',
      score: 0,
      feedback: [
        '12文字以上にしてください',
        '大文字、小文字、数字、特殊文字のうち3種類以上を含めてください',
      ],
    } as PasswordStrengthResult,
    requirements: {
      minLength: false,
      hasUppercase: false,
      hasLowercase: true,
      hasNumber: false,
      hasSpecialChar: false,
      complexity: false,
    } as PasswordRequirements,
  },
};

/**
 * 普通のパスワード
 * いくつかの要件を満たすパスワード
 */
export const Fair: Story = {
  args: {
    result: {
      strength: 'fair',
      score: 1,
      feedback: [
        '大文字、小文字、数字、特殊文字のうち3種類以上を含めてください',
        '16文字以上にするとより強固になります',
      ],
    } as PasswordStrengthResult,
    requirements: {
      minLength: true,
      hasUppercase: false,
      hasLowercase: true,
      hasNumber: true,
      hasSpecialChar: false,
      complexity: false,
    } as PasswordRequirements,
  },
};

/**
 * 良いパスワード
 * ほとんどの要件を満たすパスワード
 */
export const Good: Story = {
  args: {
    result: {
      strength: 'good',
      score: 2,
      feedback: ['16文字以上にするとより強固になります'],
    } as PasswordStrengthResult,
    requirements: {
      minLength: true,
      hasUppercase: true,
      hasLowercase: true,
      hasNumber: true,
      hasSpecialChar: false,
      complexity: true,
    } as PasswordRequirements,
  },
};

/**
 * 強いパスワード
 * すべての要件を満たすパスワード
 */
export const Strong: Story = {
  args: {
    result: {
      strength: 'strong',
      score: 3,
      feedback: [],
    } as PasswordStrengthResult,
    requirements: {
      minLength: true,
      hasUppercase: true,
      hasLowercase: true,
      hasNumber: true,
      hasSpecialChar: true,
      complexity: true,
    } as PasswordRequirements,
  },
};

/**
 * 非常に強いパスワード
 * すべての要件を満たし、16文字以上のパスワード
 */
export const VeryStrong: Story = {
  args: {
    result: {
      strength: 'very-strong',
      score: 4,
      feedback: [],
    } as PasswordStrengthResult,
    requirements: {
      minLength: true,
      hasUppercase: true,
      hasLowercase: true,
      hasNumber: true,
      hasSpecialChar: true,
      complexity: true,
    } as PasswordRequirements,
  },
};
