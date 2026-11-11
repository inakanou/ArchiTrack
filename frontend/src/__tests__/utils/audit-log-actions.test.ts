/**
 * 監査ログの対象の欄の表示のテスト
 */

import { describe, it, expect } from 'vitest';
import {
  CLAUDE_VISION_AUDIT_ACTIONS,
  CLAUDE_VISION_AUDIT_ACTION_LABELS,
  PROJECT_PURGE_AUDIT_ACTIONS,
  PROJECT_PURGE_AUDIT_ACTION_LABELS,
  getAuditLogTargetLabel,
} from '../../utils/audit-log-actions';

describe('外部の AI での読み取りの送信の種別', () => {
  /**
   * @requirement estimate-request/REQ-49.7 送信の記録を監査ログ画面で種別の名前で表示できる
   */
  it('送信の記録の種別と表示名を持つ', () => {
    expect(CLAUDE_VISION_AUDIT_ACTIONS).toEqual(['CLAUDE_VISION_SENT']);
    expect(CLAUDE_VISION_AUDIT_ACTION_LABELS.CLAUDE_VISION_SENT).toBe('外部AIでの読み取りの送信');
  });

  it('送信の記録の対象の欄は機能（対象の ID）を表示する', () => {
    expect(
      getAuditLogTargetLabel({
        targetType: 'ClaudeVision',
        targetId: 'received_quotation',
        metadata: { feature: 'received_quotation', imageCount: 2, outcome: 'success' },
      })
    ).toBe('received_quotation');
  });
});

describe('プロジェクトの完全削除の種別', () => {
  /**
   * @requirement project-management/REQ-46.6 完全削除の記録を監査ログ画面で種別の名前で表示できる
   */
  it('完全削除の記録の種別と表示名を持つ', () => {
    expect(PROJECT_PURGE_AUDIT_ACTIONS).toContain('PROJECT_PURGED');
    expect(PROJECT_PURGE_AUDIT_ACTION_LABELS.PROJECT_PURGED).toBe('プロジェクトの完全削除');
  });
});

describe('プロジェクトの完全削除の失敗の扱いの種別', () => {
  /**
   * @requirement project-management/REQ-46.11 対象外化の記録を監査ログ画面で種別の名前で表示できる
   * @requirement project-management/REQ-46.14 対象への復帰の記録を監査ログ画面で種別の名前で表示できる
   * @requirement project-management/REQ-46.15 定期処理の結果の記録を監査ログ画面で種別の名前で表示できる
   */
  it('完全削除の種別の並びに失敗の扱いの 3 つの種別を足す', () => {
    expect(PROJECT_PURGE_AUDIT_ACTIONS).toEqual([
      'PROJECT_PURGED',
      'PROJECT_PURGE_EXCLUDED',
      'PROJECT_PURGE_REQUEUED',
      'PROJECT_PURGE_RUN_COMPLETED',
    ]);
  });

  it.each([
    ['PROJECT_PURGE_EXCLUDED', 'プロジェクトの完全削除の対象外化'],
    ['PROJECT_PURGE_REQUEUED', 'プロジェクトの完全削除の対象への復帰'],
    ['PROJECT_PURGE_RUN_COMPLETED', 'プロジェクトの完全削除の定期処理の結果'],
  ] as const)(
    '%s の表示名は「%s」で、未知の種別として種別のコードのままにならない',
    (action, label) => {
      expect(PROJECT_PURGE_AUDIT_ACTION_LABELS[action]).toBe(label);
      expect(PROJECT_PURGE_AUDIT_ACTION_LABELS[action]).not.toBe(action);
    }
  );

  it('定期処理の結果の記録の対象の欄は回の開始の日時（対象の ID）を表示する', () => {
    expect(
      getAuditLogTargetLabel({
        targetType: 'ProjectPurgeRun',
        targetId: '2026-11-11T03:00:00.000Z',
        metadata: { purged: 0, failed: 0, excluded: 0, remainingCandidates: 0 },
      })
    ).toBe('2026-11-11T03:00:00.000Z');
  });
});

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
