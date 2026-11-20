import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from '../../components/RegisterForm';
import type { InvitationVerificationResult } from '../../types/auth.types';

describe('RegisterForm', () => {
  const mockOnRegister = vi.fn();
  const mockOnVerifyInvitation = vi.fn();

  beforeEach(() => {
    mockOnRegister.mockReset();
    mockOnVerifyInvitation.mockReset();
  });

  describe('招待トークン検証', () => {
    /**
     * 画面を開いたまま別の招待リンクを開いたとき、前のトークンの検証の応答が後から届いても
     * 新しいトークンの検証の結果を上書きしない
     *
     * @requirement user-authentication/REQ-2.2
     */
    it('前のトークンの検証の応答が遅れて届いても、新しいトークンの結果を上書きしないこと', async () => {
      let resolveOld: (value: InvitationVerificationResult) => void = () => {};
      mockOnVerifyInvitation.mockImplementation((token: string) => {
        if (token === 'old-valid-token') {
          return new Promise<InvitationVerificationResult>((resolve) => {
            resolveOld = resolve;
          });
        }
        return Promise.resolve({
          valid: false,
          error: '招待トークンが無効です',
        } as InvitationVerificationResult);
      });

      const { rerender } = render(
        <RegisterForm
          invitationToken="old-valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );
      rerender(
        <RegisterForm
          invitationToken="new-invalid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );
      expect(await screen.findByText('招待トークンが無効です')).toBeInTheDocument();

      resolveOld({ valid: true, email: 'stale@example.com' } as InvitationVerificationResult);

      // 遅れて届いた前の応答で登録フォームへ切り替わらない
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByText('招待トークンが無効です')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('stale@example.com')).not.toBeInTheDocument();
    });

    it('有効な招待トークンの場合、メールアドレスと登録フォームが表示されること', async () => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      // 招待トークン検証が呼ばれる
      await waitFor(() => {
        expect(mockOnVerifyInvitation).toHaveBeenCalledWith('valid-token');
      });

      // メールアドレスが表示される（読み取り専用）
      await waitFor(() => {
        const emailInput = screen.getByDisplayValue('invited@example.com');
        expect(emailInput).toBeInTheDocument();
        expect(emailInput).toBeDisabled();
      });

      // 登録フォームが表示される
      expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/パスワード \(確認\)/i)).toBeInTheDocument();
    });

    it('無効な招待トークンの場合、エラーメッセージと管理者への連絡手段が表示されること', async () => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: false,
        error: '招待トークンが無効です',
      } as InvitationVerificationResult);

      render(
        <RegisterForm
          invitationToken="invalid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/招待トークンが無効です/i)).toBeInTheDocument();
        expect(screen.getByText(/管理者に連絡してください/i)).toBeInTheDocument();
      });

      // 登録フォームが表示されない
      expect(screen.queryByLabelText(/表示名/i)).not.toBeInTheDocument();
    });

    it('期限切れの招待トークンの場合、エラーメッセージが表示されること', async () => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: false,
        error: '招待トークンの有効期限が切れています',
      } as InvitationVerificationResult);

      render(
        <RegisterForm
          invitationToken="expired-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/招待トークンの有効期限が切れています/i)).toBeInTheDocument();
      });
    });
  });

  describe('フォーム要素の表示', () => {
    beforeEach(() => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);
    });

    it('表示名入力フィールドが表示されること', async () => {
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });
    });

    it('パスワード入力フィールドが表示されること', async () => {
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      });
    });

    it('パスワード確認フィールドが表示されること', async () => {
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/パスワード \(確認\)/i)).toBeInTheDocument();
      });
    });

    it('利用規約同意チェックボックスが表示されること', async () => {
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /利用規約/i })).toBeInTheDocument();
      });
    });

    it('登録ボタンが表示されること', async () => {
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /登録/i })).toBeInTheDocument();
      });
    });
  });

  describe('パスワード強度インジケーター', () => {
    beforeEach(() => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);
    });

    it('パスワード入力時にパスワード強度インジケーターが表示されること', async () => {
      const user = userEvent.setup();
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      await user.type(passwordInput, 'weak');

      await waitFor(() => {
        expect(screen.getByText(/パスワード強度/i)).toBeInTheDocument();
      });
    });

    it('パスワード要件チェックリストが表示されること', async () => {
      const user = userEvent.setup();
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      await user.type(passwordInput, 'Password123!');

      await waitFor(() => {
        expect(screen.getByText(/12文字以上/i)).toBeInTheDocument();
        expect(screen.getByText(/大文字/i)).toBeInTheDocument();
        expect(screen.getByText(/小文字/i)).toBeInTheDocument();
        expect(screen.getByText(/数字/i)).toBeInTheDocument();
        expect(screen.getByText(/特殊文字/i)).toBeInTheDocument();
      });
    });
  });

  describe('バリデーション', () => {
    beforeEach(() => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);
    });

    it('パスワードとパスワード確認が一致しない場合、リアルタイムエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Different123!');
      await user.tab(); // フォーカスを外す

      await waitFor(() => {
        expect(screen.getByText(/パスワードが一致しません/i)).toBeInTheDocument();
      });
    });

    it('利用規約に同意していない場合、登録できないこと', async () => {
      const user = userEvent.setup();
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/利用規約に同意してください/i)).toBeInTheDocument();
      });

      expect(mockOnRegister).not.toHaveBeenCalled();
    });
  });

  describe('登録処理', () => {
    beforeEach(() => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);
    });

    it('有効な入力で登録ボタンをクリックすると、onRegisterが呼ばれること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockResolvedValue(undefined);

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(mockOnRegister).toHaveBeenCalledWith({
          invitationToken: 'valid-token',
          displayName: 'Test User',
          password: 'Password123!',
          passwordConfirm: 'Password123!',
          agreedToTerms: true,
        });
      });
    });

    /**
     * パスワードの規則は要件2.5・2.6 と backend（PasswordService.validatePasswordStrength）に合わせる。
     * 大文字・小文字・数字・記号のうち3種類以上を含めばよく、同じ文字の連続も禁じない
     *
     * @requirement user-authentication/REQ-2.5 @requirement user-authentication/REQ-2.6
     */
    it.each([
      ['記号を含まない3種類（大文字・小文字・数字）', 'XyzUniqTest123'],
      ['大文字を含まない3種類（小文字・数字・記号）', 'xyzuniqtest1!@'],
      ['backend が記号と数える文字（~）を含む3種類', 'xyzuniqtest1~'],
      ['同じ文字が3つ以上続く', 'XyzPassss12!@'],
    ])('%s のパスワードは画面で拒まず、onRegisterが呼ばれること', async (_, password) => {
      const user = userEvent.setup();
      mockOnRegister.mockResolvedValue(undefined);

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/表示名/i), 'Test User');
      await user.type(screen.getByLabelText(/^パスワード$/i), password);
      await user.type(screen.getByLabelText(/パスワード \(確認\)/i), password);
      await user.click(screen.getByRole('checkbox', { name: /利用規約/i }));
      await user.click(screen.getByRole('button', { name: /登録/i }));

      await waitFor(() => {
        expect(mockOnRegister).toHaveBeenCalledWith({
          invitationToken: 'valid-token',
          displayName: 'Test User',
          password,
          passwordConfirm: password,
          agreedToTerms: true,
        });
      });
      expect(screen.queryByText(/必要があります|連続した同一文字/)).not.toBeInTheDocument();
    });

    /**
     * 文字種が3種類に満たないとき、backend と同じく足りない文字種を全て示して送信しない
     *
     * @requirement user-authentication/REQ-2.6
     */
    it.each([
      [
        '小文字・数字だけ',
        'xyzuniqtest12',
        [
          'パスワードは大文字を1文字以上含む必要があります',
          'パスワードは記号を1文字以上含む必要があります',
        ],
      ],
      [
        '大文字・小文字だけ',
        'XyzUniqTestAbc',
        [
          'パスワードは数字を1文字以上含む必要があります',
          'パスワードは記号を1文字以上含む必要があります',
        ],
      ],
    ])(
      '%s のパスワードでは足りない文字種を全て示し、onRegisterを呼ばないこと',
      async (_, password, messages) => {
        const user = userEvent.setup();

        render(
          <RegisterForm
            invitationToken="valid-token"
            onRegister={mockOnRegister}
            onVerifyInvitation={mockOnVerifyInvitation}
          />
        );

        await waitFor(() => {
          expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
        });

        await user.type(screen.getByLabelText(/表示名/i), 'Test User');
        await user.type(screen.getByLabelText(/^パスワード$/i), password);
        await user.type(screen.getByLabelText(/パスワード \(確認\)/i), password);
        await user.click(screen.getByRole('checkbox', { name: /利用規約/i }));
        await user.click(screen.getByRole('button', { name: /登録/i }));

        await waitFor(() => {
          expect(screen.getByText(messages.join('; '))).toBeInTheDocument();
        });
        expect(mockOnRegister).not.toHaveBeenCalled();
      }
    );

    it('backend が記号と数える文字（~）を、要件チェックリストで特殊文字として扱うこと', async () => {
      const user = userEvent.setup();
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/^パスワード$/i), 'xyzuniqtest1~');

      await waitFor(() => {
        expect(screen.getByText('特殊文字を含む').closest('li')).toHaveClass('requirement-met');
        expect(screen.getByText('3種類以上の文字種を含む').closest('li')).toHaveClass(
          'requirement-met'
        );
      });
    });

    it('登録処理中、ローディングスピナーとボタンの無効化が表示されること', async () => {
      const user = userEvent.setup();
      let resolveRegister: () => void;
      const registerPromise = new Promise<void>((resolve) => {
        resolveRegister = resolve;
      });
      mockOnRegister.mockReturnValue(registerPromise);

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      // ローディング中
      await waitFor(() => {
        expect(screen.getByLabelText('ローディング中')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /登録中/i })).toBeDisabled();
      });

      // 登録完了
      resolveRegister!();
      await waitFor(() => {
        expect(screen.queryByLabelText('ローディング中')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /登録/i })).not.toBeDisabled();
      });
    });
  });

  describe('エラーハンドリング', () => {
    beforeEach(() => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);
    });

    it('RFC 7807 details形式のパスワードエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          details: [{ path: 'password', message: 'パスワードは12文字以上である必要があります' }],
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'short');
      await user.type(passwordConfirmInput, 'short');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードは12文字以上である必要があります/i)).toBeInTheDocument();
      });
    });

    it('RFC 7807 details形式のメールエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          details: [{ path: 'email', message: 'メールアドレスが無効です' }],
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/メールアドレスが無効です/i)).toBeInTheDocument();
      });
    }, 15000);

    it('validationErrors形式のパスワードエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          validationErrors: [
            { field: 'password', code: 'TOO_SHORT', message: 'パスワードが短すぎます' },
          ],
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードが短すぎます/i)).toBeInTheDocument();
      });
    });

    it('errors配列形式のPASSWORD_TOO_SHORTエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          errors: ['PASSWORD_TOO_SHORT'],
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/パスワードは12文字以上である必要があります/i)).toBeInTheDocument();
      });
    });

    it('errors配列形式のEMAIL_ALREADY_REGISTEREDエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          errors: ['EMAIL_ALREADY_REGISTERED'],
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/このメールアドレスは既に登録されています/i)).toBeInTheDocument();
      });
    });

    it('errors配列形式の未知のエラーコードが汎用エラーで表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          errors: ['UNKNOWN_ERROR_CODE'],
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/入力内容に誤りがあります/i)).toBeInTheDocument();
      });
    });

    it('EMAIL_ALREADY_REGISTEREDエラーコードでエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          code: 'EMAIL_ALREADY_REGISTERED',
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/このメールアドレスは既に登録されています/i)).toBeInTheDocument();
      });
    });

    it('汎用エラーメッセージが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue({
        response: {
          message: 'サーバーエラーが発生しました',
        },
      });

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/サーバーエラーが発生しました/i)).toBeInTheDocument();
      });
    });

    it('エラーレスポンスがない場合、デフォルトエラーが表示されること', async () => {
      const user = userEvent.setup();
      mockOnRegister.mockRejectedValue(new Error('Network Error'));

      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/表示名/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/表示名/i);
      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);
      const termsCheckbox = screen.getByRole('checkbox', { name: /利用規約/i });
      const registerButton = screen.getByRole('button', { name: /登録/i });

      await user.type(displayNameInput, 'Test User');
      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Password123!');
      await user.click(termsCheckbox);
      await user.click(registerButton);

      await waitFor(() => {
        expect(screen.getByText(/登録に失敗しました/i)).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    beforeEach(() => {
      mockOnVerifyInvitation.mockResolvedValue({
        valid: true,
        email: 'invited@example.com',
      } as InvitationVerificationResult);
    });

    it('全ての入力フィールドにlabel要素が関連付けられていること', async () => {
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        const emailInput = screen.getByDisplayValue('invited@example.com');
        const displayNameInput = screen.getByLabelText(/表示名/i);
        const passwordInput = screen.getByLabelText(/^パスワード$/i);
        const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);

        expect(emailInput).toHaveAccessibleName();
        expect(displayNameInput).toHaveAccessibleName();
        expect(passwordInput).toHaveAccessibleName();
        expect(passwordConfirmInput).toHaveAccessibleName();
      });
    });

    it('エラーメッセージがaria-liveで通知されること', async () => {
      const user = userEvent.setup();
      render(
        <RegisterForm
          invitationToken="valid-token"
          onRegister={mockOnRegister}
          onVerifyInvitation={mockOnVerifyInvitation}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/^パスワード$/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/^パスワード$/i);
      const passwordConfirmInput = screen.getByLabelText(/パスワード \(確認\)/i);

      await user.type(passwordInput, 'Password123!');
      await user.type(passwordConfirmInput, 'Different123!');
      await user.tab();

      await waitFor(() => {
        const errorContainer = screen.getByRole('alert');
        expect(errorContainer).toBeInTheDocument();
        expect(errorContainer).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
