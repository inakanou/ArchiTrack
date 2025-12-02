import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordStrengthIndicator from '../../components/PasswordStrengthIndicator';
import type { PasswordStrengthResult, PasswordRequirements } from '../../types/auth.types';

describe('PasswordStrengthIndicator', () => {
  describe('パスワード強度の表示', () => {
    it('weak強度の場合、「弱い」と表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'weak',
        score: 0,
        feedback: ['パスワードが短すぎます'],
      };
      const requirements: PasswordRequirements = {
        minLength: false,
        hasUppercase: false,
        hasLowercase: true,
        hasNumber: false,
        hasSpecialChar: false,
        complexity: false,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText('弱い')).toBeInTheDocument();
    });

    it('fair強度の場合、「普通」と表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'fair',
        score: 1,
        feedback: ['もう少し複雑にしましょう'],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: false,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: false,
        complexity: false,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText('普通')).toBeInTheDocument();
    });

    it('good強度の場合、「良い」と表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'good',
        score: 2,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: true,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: false,
        complexity: true,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText('良い')).toBeInTheDocument();
    });

    it('strong強度の場合、「強い」と表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'strong',
        score: 3,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: true,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: true,
        complexity: true,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText('強い')).toBeInTheDocument();
    });

    it('very-strong強度の場合、「非常に強い」と表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'very-strong',
        score: 4,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: true,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: true,
        complexity: true,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText('非常に強い')).toBeInTheDocument();
    });
  });

  describe('パスワード要件チェックリストの表示', () => {
    it('全ての要件が表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'weak',
        score: 0,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecialChar: false,
        complexity: false,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText(/12文字以上/)).toBeInTheDocument();
      expect(screen.getByText(/大文字/)).toBeInTheDocument();
      expect(screen.getByText(/小文字/)).toBeInTheDocument();
      expect(screen.getByText(/数字/)).toBeInTheDocument();
      expect(screen.getByText(/特殊文字/)).toBeInTheDocument();
      expect(screen.getByText(/3種類以上/)).toBeInTheDocument();
    });

    it('達成された要件にチェックマークが表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'good',
        score: 2,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: true,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: false,
        complexity: true,
      };

      const { container } = render(
        <PasswordStrengthIndicator result={result} requirements={requirements} />
      );

      // チェックマークアイコンまたはクラス名で達成状態を確認
      const checkedItems = container.querySelectorAll('.requirement-met');
      expect(checkedItems.length).toBeGreaterThan(0);
    });
  });

  describe('フィードバックメッセージの表示', () => {
    it('フィードバックがある場合、メッセージが表示されること', () => {
      const result: PasswordStrengthResult = {
        strength: 'weak',
        score: 0,
        feedback: ['パスワードが短すぎます', '大文字を含めてください', '数字を含めてください'],
      };
      const requirements: PasswordRequirements = {
        minLength: false,
        hasUppercase: false,
        hasLowercase: true,
        hasNumber: false,
        hasSpecialChar: false,
        complexity: false,
      };

      render(<PasswordStrengthIndicator result={result} requirements={requirements} />);

      expect(screen.getByText('パスワードが短すぎます')).toBeInTheDocument();
      expect(screen.getByText('大文字を含めてください')).toBeInTheDocument();
      expect(screen.getByText('数字を含めてください')).toBeInTheDocument();
    });

    it('フィードバックがない場合、フィードバックセクションが表示されないこと', () => {
      const result: PasswordStrengthResult = {
        strength: 'very-strong',
        score: 4,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: true,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: true,
        complexity: true,
      };

      const { container } = render(
        <PasswordStrengthIndicator result={result} requirements={requirements} />
      );

      const feedbackSection = container.querySelector('.feedback-section');
      expect(feedbackSection).toBeNull();
    });
  });

  describe('アクセシビリティ', () => {
    it('パスワード強度にaria-label属性が設定されていること', () => {
      const result: PasswordStrengthResult = {
        strength: 'strong',
        score: 3,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: true,
        hasUppercase: true,
        hasLowercase: true,
        hasNumber: true,
        hasSpecialChar: true,
        complexity: true,
      };

      const { container } = render(
        <PasswordStrengthIndicator result={result} requirements={requirements} />
      );

      const strengthElement = container.querySelector('[aria-label*="パスワード強度"]');
      expect(strengthElement).toBeInTheDocument();
    });

    it('要件チェックリストにrole="list"が設定されていること', () => {
      const result: PasswordStrengthResult = {
        strength: 'weak',
        score: 0,
        feedback: [],
      };
      const requirements: PasswordRequirements = {
        minLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecialChar: false,
        complexity: false,
      };

      const { container } = render(
        <PasswordStrengthIndicator result={result} requirements={requirements} />
      );

      const listElement = container.querySelector('[role="list"]');
      expect(listElement).toBeInTheDocument();
    });
  });
});
