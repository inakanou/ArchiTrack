/**
 * 監査ログの対象の欄の表示のテスト
 */

import { describe, it, expect } from 'vitest';
import { getAuditLogTargetLabel } from '../../utils/audit-log-actions';

describe('getAuditLogTargetLabel', () => {
  describe('招待の記録', () => {
    /**
     * @requirement user-authentication/REQ-40.12
     */
    it.each(['INVITATION_CREATED', 'INVITATION_REVOKED', 'INVITATION_RESENT'])(
      '%s の記録は招待の ID でなく招待先のメールアドレスを返す',
      () => {
        expect(
          getAuditLogTargetLabel({
            targetType: 'Invitation',
            targetId: 'invitation-id-1',
            metadata: { email: 'invitee@example.com', inviterId: 'admin-1' },
          })
        ).toBe('invitee@example.com');
      }
    );

    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('対象の名前があっても招待先のメールアドレスを返す', () => {
      expect(
        getAuditLogTargetLabel({
          targetType: 'Invitation',
          targetId: 'invitation-id-1',
          targetName: '別の名前',
          metadata: { email: 'invitee@example.com' },
        })
      ).toBe('invitee@example.com');
    });

    /**
     * @requirement user-authentication/REQ-40.12
     */
    it.each([
      ['付帯情報が無い', undefined],
      ['メールアドレスが無い', { inviterId: 'admin-1' }],
      ['メールアドレスが空', { email: '' }],
      ['メールアドレスが文字列でない', { email: 123 }],
    ])('%s記録は従来どおり招待の ID を返す', (_, metadata) => {
      expect(
        getAuditLogTargetLabel({
          targetType: 'Invitation',
          targetId: 'invitation-id-1',
          metadata,
        })
      ).toBe('invitation-id-1');
    });
  });

  describe('他の種別の記録', () => {
    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('付帯情報にメールアドレスがあっても対象の名前を返す', () => {
      expect(
        getAuditLogTargetLabel({
          targetType: 'user',
          targetId: 'user-1',
          targetName: '山田太郎',
          metadata: { email: 'nobody@example.com' },
        })
      ).toBe('山田太郎');
    });

    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('対象の名前が無ければ対象の ID を返す', () => {
      expect(
        getAuditLogTargetLabel({
          targetType: 'user',
          targetId: 'unknown-email',
          metadata: { email: 'nobody@example.com' },
        })
      ).toBe('unknown-email');
    });

    it('対象の名前も ID も無ければ「-」を返す', () => {
      expect(getAuditLogTargetLabel({})).toBe('-');
    });
  });
});
